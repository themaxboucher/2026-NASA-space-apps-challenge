"""SPHEREx spectrum at a sky position: aperture photometry on every image, all 6 bands.

spectrum(ra, dec) -> {"points": [{"wl_um", "bw_um", "flux_mjy", "err_mjy", "mjd", "band", "flagged"}, ...]}
Self-check:  .venv/Scripts/python spectrum.py
"""
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from astropy import log
from astropy.io import fits
from astropy.io.fits.hdu.compressed._codecs import Rice1  # private API; pinned by requirements' astropy
from astropy.wcs import WCS

import server

log.setLevel("WARNING")  # spectral WCS emits a SIP INFO notice on every image

BANDS = ["D1", "D2", "D3", "D4", "D5", "D6"]
PER_BAND = 40  # ponytail: caps a click at ~240 images (~30-60 s); poles have ~90/band. Raise for offline runs.
R_AP, R_IN, R_OUT = 2, 4, 7  # px: aperture, background annulus
HALF = R_OUT + 1
MJY_PER_PIX = 6.15**2 * (np.pi / 648000) ** 2 * 1e9  # MJy/sr -> mJy for one 6.15" pixel
FLAG_NAMES = server.BAD_FLAGS | {"OVERFLOW", "NONLINEAR"}


def wave_table(f):
    """The spectral WCS is a -TAB lookup stored in the small WCS-WAVE table; fetch just that HDU."""
    th, off = f.hdus["WCS-WAVE"]
    raw = server.byte_range(f.url, off, th["NAXIS1"] * th["NAXIS2"] + th.get("PCOUNT", 0))
    tab = fits.BinTableHDU.fromstring(th.tostring().encode() + raw + b"\0" * (-len(raw) % 2880))
    return fits.HDUList([fits.PrimaryHDU(), tab])


def flags_section(f, y0, y1, x0, x1):
    """FLAGS is a RICE_1 tile-compressed BINTABLE, one tile per detector row: fetch and decode only rows y0..y1."""
    h, off = f.hdus["FLAGS"]
    desc = np.frombuffer(server.byte_range(f.url, off + 8 * y0, 8 * (y1 - y0)), ">i4").reshape(-1, 2)  # 1PB: (nbytes, heap offset)
    lo, hi = int(desc[:, 1].min()), int((desc[:, 0] + desc[:, 1]).max())
    heap = np.frombuffer(server.byte_range(f.url, off + h.get("THEAP", h["NAXIS1"] * h["NAXIS2"]) + lo, hi - lo), np.uint8)
    rice = Rice1(blocksize=h["ZVAL1"], bytepix=h["ZVAL2"], tilesize=h["ZTILE1"])
    rows = [np.frombuffer(rice.decode(heap[o - lo:o - lo + n]), np.int32) for n, o in desc]
    return np.array(rows)[:, x0:x1]


def measure(row, ra, dec):
    f = server.RemoteFits(server.s3_url(row), upto="WCS-WAVE")
    hdr = f.header("IMAGE")
    x, y = (float(v) for v in WCS(hdr).world_to_pixel_values(ra, dec))
    xi, yi = int(round(x)), int(round(y))
    if not (HALF <= xi < hdr["NAXIS1"] - HALF and HALF <= yi < hdr["NAXIS2"] - HALF):
        return None  # aperture/annulus would fall off the detector
    sw = WCS(hdr, fobj=wave_table(f), key="W")
    sw.sip = None  # spectral -TAB lookup must not get the celestial SIP distortion
    wl, bw = sw.pixel_to_world(x, y)
    y0, y1, x0, x1 = yi - HALF, yi + HALF + 1, xi - HALF, xi + HALF + 1
    img = f.section("IMAGE", y0, y1, x0, x1).astype(float)  # ZODI skipped: the annulus removes it locally
    var = f.section("VARIANCE", y0, y1, x0, x1).astype(float)
    flags = flags_section(f, y0, y1, x0, x1)
    fh = f.header("FLAGS")
    bad = sum(1 << int(k[4:]) for k in fh if k.startswith("MSKN") and fh[k] in FLAG_NAMES)

    yy, xx = np.mgrid[y0:y1, x0:x1]
    r = np.hypot(xx - x, yy - y)
    ap, ann = r <= R_AP, (r > R_IN) & (r <= R_OUT)
    bg = np.nanmedian(img[ann])
    ok = np.isfinite(img[ap]).all() and np.isfinite(bg)  # saturated cores come back NaN: no honest flux
    flux = float((img[ap].sum() - bg * ap.sum()) * MJY_PER_PIX) if ok else None
    err = float(np.sqrt(var[ap].sum()) * MJY_PER_PIX) if ok else None
    return {
        "wl_um": float(wl.to_value("um")), "bw_um": float(bw.to_value("um")),
        "flux_mjy": flux, "err_mjy": err, "mjd": float(row["t_min"]),
        "band": row["energy_bandpassname"].removeprefix("SPHEREx-"),
        "flagged": bool((flags[ap] & bad).any() or not ok),
    }


def measure_retry(row, ra, dec, tries=3):
    for i in range(tries):
        try:
            return measure(row, ra, dec)
        except Exception:
            time.sleep(1 + i)
    return None  # one bad file shouldn't kill the whole spectrum


def spectrum(ra, dec):
    rows = []  # server.all_images caches the SIA search on disk, so this is one search per position
    for b in BANDS:
        r = server.find_images(ra, dec, b)
        rows += r[:: max(len(r) // PER_BAND, 1)][:PER_BAND]  # evenly spread in time/wavelength
    with ThreadPoolExecutor(24) as ex:
        pts = [p for p in ex.map(lambda r: measure_retry(r, ra, dec), rows) if p]
    return {"points": sorted(pts, key=lambda p: p["wl_um"])}


if __name__ == "__main__":
    c = server.resolve("16h32m40.2s +66d45m18s")  # R Draconis
    t = time.time()
    pts = spectrum(c.ra.deg, c.dec.deg)["points"]
    print(f"{len(pts)} points in {time.time() - t:.0f}s")
    print(f"{'band':4} {'wl_um':>6} {'bw_um':>6} {'flux_mJy':>10} {'err':>8} {'mjd':>10} flag")
    nan = float("nan")
    for p in pts[:: max(len(pts) // 25, 1)]:
        print(f"{p['band']:4} {p['wl_um']:6.3f} {p['bw_um']:6.3f} {p['flux_mjy'] or nan:10.2f} {p['err_mjy'] or nan:8.3f} {p['mjd']:10.3f} {'x' if p['flagged'] else ''}")
    print(f"flagged {sum(p['flagged'] for p in pts)}, no flux {sum(p['flux_mjy'] is None for p in pts)}")
    wl = [p["wl_um"] for p in pts]
    assert len(pts) >= 50, len(pts)
    assert min(wl) < 0.8 and max(wl) > 4.9, (min(wl), max(wl))
    print("OK")
