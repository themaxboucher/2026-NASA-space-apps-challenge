"""SPHEREx blink viewer backend.

Run:  .venv/Scripts/python server.py   then open http://localhost:8000
GET /api/blink?target=<coords or name>&size=<arcsec>&band=D1..D6&mode=epoch|frame
"""
import base64, csv, hashlib, io, json, threading, time, urllib.parse, urllib.request, warnings
from concurrent.futures import ThreadPoolExecutor
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import astropy.units as u
import numpy as np
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS, FITSFixedWarning
from PIL import Image
from reproject import reproject_interp
from scipy import ndimage

warnings.simplefilter("ignore", FITSFixedWarning)
warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN medians

SIA = "https://irsa.ipac.caltech.edu/SIA"
S3 = "https://nasa-irsa-spherex.s3.amazonaws.com/"
IBE = "/ibe/data/spherex/"
COLLECTIONS = ["spherex_dr1", "spherex_qr3"]  # add new releases here
PIX = 6.15 / 3600  # SPHEREx pixel, deg
# Detector defects only; star-related flags (NONLINEAR, HALO...) would punch holes in bright targets.
BAD_FLAGS = {"SUR_ERROR", "NONFUNC", "DICHROIC", "MISSING_DATA", "HOT", "COLD"}
EPOCH_GAP = 30  # days between frames that starts a new epoch
CACHE = {}  # ponytail: in-memory, unbounded; swap for disk/LRU if it grows


def get(url, tries=12):
    """IRSA is overloaded during the hackathon: retry 502/503 and 'Server busy'."""
    for i in range(tries):
        try:
            body = urllib.request.urlopen(url, timeout=60).read()
            if not body.startswith(b"Server busy"):
                return body
        except Exception:
            pass
        time.sleep(min(2 + 2 * i, 10))
    raise RuntimeError(f"IRSA unavailable after {tries} tries: {url}")


def resolve(target):
    t = target.strip()
    try:
        return SkyCoord(t, unit=(u.hourangle, u.deg) if any(c in t for c in "h:") else u.deg)
    except Exception:
        return SkyCoord.from_name(t)


SIA_CACHE = Path(__file__).parent / ".cache"
SIA_LOCKS = {}  # one in-flight search per position, so 6 band requests share it


def all_images(ra, dec):
    """Every SPHEREx image covering (ra, dec), all bands. Cached on disk: IRSA SIA is the flaky part."""
    path = SIA_CACHE / f"sia_{ra:.5f}_{dec:+.5f}.json"
    with SIA_LOCKS.setdefault(path.name, threading.Lock()):
        if path.exists():
            return json.loads(path.read_text())
        rows, seen = [], set()
        for col in COLLECTIONS:
            q = urllib.parse.urlencode({"COLLECTION": col, "POS": f"circle {ra} {dec} 0.001", "RESPONSEFORMAT": "CSV"})
            for r in csv.DictReader(io.StringIO(get(f"{SIA}?{q}").decode())):
                key = (r["obs_id"], r["energy_bandpassname"])
                if IBE in r["access_url"] and key not in seen:
                    seen.add(key)
                    rows.append({k: r[k] for k in ("access_url", "t_min", "energy_bandpassname", "obs_id")})
        SIA_CACHE.mkdir(exist_ok=True)
        path.write_text(json.dumps(rows))
        return rows


def find_images(ra, dec, band):
    rows = [r for r in all_images(ra, dec) if r["energy_bandpassname"] == f"SPHEREx-{band}"]
    return sorted(rows, key=lambda r: float(r["t_min"]))


def s3_url(row):
    # IRSA's CSV leaves the cloud_access JSON unquoted (commas break it), so map the IRSA URL to its S3 mirror.
    return S3 + row["access_url"].split(IBE, 1)[1]


def byte_range(url, start, length):
    req = urllib.request.Request(url, headers={"Range": f"bytes={start}-{start + length - 1}"})
    for i in range(4):
        try:
            return urllib.request.urlopen(req, timeout=60).read()
        except Exception:
            time.sleep(1 + i)
    raise RuntimeError(f"S3 read failed: {url}")


class RemoteFits:
    """Read FITS headers and row slabs over HTTP Range: ~1 request per header and per slab.
    (astropy+fsspec made ~25 small requests per frame: 7 s vs <1 s.)"""

    def __init__(self, url, upto="ZODI"):
        self.url, self.hdus, off = url, {}, 0
        while upto not in self.hdus:
            raw, end = b"", None
            while end is None:
                raw += byte_range(url, off + len(raw), 2880 * 4)
                end = next((i for i in range(0, len(raw), 80) if raw[i:i + 80] == b"END" + b" " * 77), None)
            hdr = fits.Header.fromstring(raw[:end + 80].decode("ascii"))
            hlen = -(-(end + 80) // 2880) * 2880
            size = abs(hdr["BITPIX"]) // 8 * int(np.prod([hdr[f"NAXIS{i}"] for i in range(1, hdr["NAXIS"] + 1)] or [0]))
            size += hdr.get("PCOUNT", 0)
            self.hdus[hdr.get("EXTNAME", "PRIMARY")] = (hdr, off + hlen)
            off += hlen + -(-size // 2880) * 2880

    def header(self, name):
        return self.hdus[name][0]

    def section(self, name, y0, y1, x0, x1):
        hdr, data = self.hdus[name]
        nx, bpp = hdr["NAXIS1"], abs(hdr["BITPIX"]) // 8
        dtype = {-32: ">f4", -64: ">f8", 32: ">i4", 16: ">i2"}[hdr["BITPIX"]]
        raw = byte_range(self.url, data + y0 * nx * bpp, (y1 - y0) * nx * bpp)
        a = np.frombuffer(raw, dtype).reshape(y1 - y0, nx)[:, x0:x1]
        return a * hdr.get("BSCALE", 1) + hdr.get("BZERO", 0)


def read_frame(row, ra, dec, out_wcs, n):
    """Range-read just the pixels around the target from the public S3 copy."""
    f = RemoteFits(s3_url(row))
    hdr = f.header("IMAGE")
    w = WCS(hdr)
    half = int(n * 0.75) + 2  # covers the output box at any rotation
    x, y = (int(round(float(v))) for v in w.world_to_pixel_values(ra, dec))
    ny, nx = hdr["NAXIS2"], hdr["NAXIS1"]
    y0, y1, x0, x1 = max(y - half, 0), min(y + half + 1, ny), max(x - half, 0), min(x + half + 1, nx)
    if y0 >= y1 or x0 >= x1:
        return None
    # ponytail: no FLAGS masking -- FLAGS is RICE-compressed (one tile per row) so it can't be range-sliced
    # like the float HDUs; the per-pass median rejects hot pixels. Decode the rows' tiles if every-exposure mode needs it.
    img = (f.section("IMAGE", y0, y1, x0, x1) - f.section("ZODI", y0, y1, x0, x1)).astype(float)
    out, _ = reproject_interp((img, w[y0:y1, x0:x1]), out_wcs, shape_out=(n, n))
    return float(row["t_min"]), out


UPSCALE = 4
RGB = ["D6", "D3", "D1"]  # red 4.4-5.0 um, green 1.6-2.4 um, blue 0.75-1.1 um: brown dwarfs come out red


def png(a, lo, hi, asinh=True):
    """a: (n,n) or (n,n,3); lo/hi: scalars or per-channel arrays."""
    t = (a - lo) / (hi - lo)
    if t.ndim == 3:  # a saturated core is NaN in one band: borrow the brightest band so it reads white, not magenta
        t = np.where(np.isnan(t), np.nanmax(t, axis=-1, keepdims=True), t)
    # Saturated star cores are NaN in every band: fill small NaN holes ringed by bright pixels with white.
    hole = np.isnan(t).all(-1) if t.ndim == 3 else np.isnan(t)
    lab, k = ndimage.label(hole)
    for i in range(1, k + 1):
        comp = lab == i
        ring = ndimage.binary_dilation(comp) & ~comp
        if comp.sum() < 50 and np.nanmean(t[ring]) > 0.3:
            t[comp] = 1
    t = np.clip(np.nan_to_num(t, nan=0), 0, 1)
    if asinh:
        t = np.arcsinh(10 * t) / np.arcsinh(10)
    buf = io.BytesIO()
    im = Image.fromarray((np.flipud(t) * 255).astype(np.uint8))  # FITS origin is bottom-left
    # 4x bicubic upscale: smooth stars instead of 6"-pixel blocks; same field, so overlay math is unchanged
    im.resize((im.width * UPSCALE, im.height * UPSCALE), Image.BICUBIC).save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def date(mjd):
    return Time(mjd, format="mjd").iso[:10]


def render(source, groups):
    """groups: [(mjd_first, mjd_last, n_images, stack (n,n,C))] from one instrument -> frame dicts.
    Each instrument gets its own per-channel stretch (SPHEREx MJy/sr vs WISE counts)."""
    stacks = np.array([g[3] for g in groups])
    ref = np.nanmedian(stacks, axis=0)
    # black point a bit under the sky level, so empty sky reads as black space instead of noisy red/grey
    lo, hi = np.nanpercentile(stacks, [35, 99.7], axis=(0, 1, 2))
    d = np.nanpercentile(np.abs(stacks - ref), 99.5, axis=(0, 1, 2))
    d = np.where(d > 0, d, 1)
    sq = (lambda x: x[..., 0]) if stacks.shape[-1] == 1 else (lambda x: x)
    return [{
        "label": date(t0) if t0 == t1 else f"{date(t0)} → {date(t1)}",
        "mjd": t0, "n": k, "source": source,
        "img": png(sq(s), sq(lo), sq(hi)), "diff": png(sq(s - ref), sq(-d), sq(d), asinh=False),
    } for t0, t1, k, s in groups]


def blink(target, size, band, mode, wise=False):
    c = resolve(target).icrs
    ra, dec = c.ra.deg, c.dec.deg
    n = max(int(size / 3600 / PIX) | 1, 9)
    out = WCS(naxis=2)
    out.wcs.ctype, out.wcs.crval = ["RA---TAN", "DEC--TAN"], [ra, dec]
    out.wcs.crpix, out.wcs.cdelt = [(n + 1) / 2] * 2, [-PIX, PIX]  # north up, east left

    bands = RGB if band == "RGB" else [band]
    if band == "RGB":
        mode = "epoch"  # each exposure is one band; colour needs a stacked pass
    rows = [(b, r) for b in bands for r in find_images(ra, dec, b)]
    with ThreadPoolExecutor(24) as ex:
        read = ex.map(lambda br: read_frame(br[1], ra, dec, out, n), rows)
        frames = sorted((f[0], b, f[1]) for (b, _), f in zip(rows, read) if f)
    if not frames:
        raise RuntimeError(f"No SPHEREx {band} images cover RA {ra:.4f} Dec {dec:.4f}")

    groups = []  # each group -> one blink frame
    for fr in frames:
        if mode == "epoch" and groups and fr[0] - groups[-1][-1][0] < EPOCH_GAP:
            groups[-1].append(fr)
        else:
            groups.append([fr])
    blank = np.full((n, n), np.nan)
    stacked = [(g[0][0], g[-1][0], len(g), np.stack(
        [np.nanmedian([im for _, b, im in g if b == bb] or [blank], axis=0) for bb in bands], axis=-1))
        for g in groups]
    result = render(f"SPHEREx {band}", stacked)

    if wise:
        import wise as wise_mod  # optional 2010-2024 baseline
        w = wise_mod.wise_frames(ra, dec, out, n)
        if w:
            result += render("WISE W2", [(t, t, 1, np.repeat(img[..., None], len(bands), -1)) for t, img in w])

    return {
        "ra": ra, "dec": dec, "band": band, "size": size, "pixels": n, "images": len(frames),
        "frames": sorted(result, key=lambda fr: fr["mjd"]),
    }


def cached(key, build):
    """Memory + disk cache, one build per key at a time (pre-warm and a browser can ask at once).
    Disk copies survive restarts, so a demo never waits on IRSA twice."""
    with SIA_LOCKS.setdefault(key, threading.Lock()):
        if key not in CACHE:
            path = SIA_CACHE / f"api_{hashlib.md5(repr(key).encode()).hexdigest()}.json"
            if path.exists():
                CACHE[key] = path.read_bytes()
            else:
                t = time.time()
                CACHE[key] = json.dumps(build()).encode()
                SIA_CACHE.mkdir(exist_ok=True)
                path.write_bytes(CACHE[key])
                print(f"{key} built in {time.time() - t:.1f}s", flush=True)
        return CACHE[key]


def blink_cached(target, size=180.0, band="D6", mode="epoch", wise=False):
    c = resolve(target).icrs  # key by position, not spelling: "269.4463 4.7682" == "269.4463  4.7682"
    pos = f"{c.ra.deg:.5f} {c.dec.deg:.5f}"
    return cached(("blink", pos, float(size), band, mode, bool(wise), UPSCALE), lambda: blink(pos, size, band, mode, wise))


PREWARM = [  # hero + the 5 cases, colour mode, so the page opens instantly
    ("269.4463 4.7682", 420), ("269.4463 4.7682", 180), ("08h55m10.831s -7d14m42.53s", 300),
    ("331.0961 -56.8010", 180), ("05h07m49.54s +30d24m05.1s", 180), ("16h32m40.2s +66d45m18s", 180),
]


def prewarm():
    for target, size in PREWARM:  # sequential: don't stampede IRSA
        try:
            blink_cached(target, size, "RGB")
        except Exception as e:
            print(f"prewarm {target}: {e}", flush=True)


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(url.query).items()}
        try:
            if url.path == "/api/blink":
                body = blink_cached(q.get("target", ""), float(q.get("size", 180)), q.get("band", "D6"),
                                    q.get("mode", "epoch"), q.get("wise") in ("1", "true", "on"))
            elif url.path == "/api/spectrum":
                import spectrum
                ra, dec = round(float(q["ra"]), 5), round(float(q["dec"]), 5)
                body = cached(("spectrum", ra, dec, spectrum.PER_BAND), lambda: spectrum.spectrum(ra, dec))
            else:
                return super().do_GET()
            code = 200
        except Exception as e:
            body, code = json.dumps({"error": str(e)}).encode(), 500
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    import os
    os.chdir(Path(__file__).parent)
    print("SPHEREx blink viewer on http://localhost:8000")
    threading.Thread(target=prewarm, daemon=True).start()
    ThreadingHTTPServer(("", 8000), Handler).serve_forever()
