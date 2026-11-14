"""Per-epoch WISE/NEOWISE images (2010-2024) on the blink grid, for a 16-year baseline.

Source: single-exposure L1b frames (-int-1b.fits, uncompressed 1016x1016 float32) on IRSA's public
S3 bucket, found via IRSA SIA. Only the header and the rows around the target are range-read.
Each ~6-month visit (12+ exposures) is median-stacked into one frame.
"""
import csv, io, json, re, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from reproject import reproject_interp

import server

S3 = "https://nasa-irsa-wise.s3.amazonaws.com/wise/"
COLLECTIONS = ["wise_allsky", "wise_2bandcryo", "neowiser"]  # 2010 cryo, 2010-11 post-cryo, 2013-2024
CACHE_DIR = Path(__file__).parent / ".cache"  # already gitignored
PER_VISIT = 10  # ponytail: exposures stacked per visit (visits have 12-20); raise for depth, costs ~0.1 s each
KEEP = re.compile(rb"(NAXIS|CTYPE|CRVAL|CRPIX|CDELT|CD\d_\d|PC\d_\d|A_|B_|AP_|BP_|EQUINOX|RADESYS|LONPOLE|LATPOLE|MAGZP )")


def find_frames(ra, dec, band):
    # WISE is finished (2024), so a position's frame list never changes: cache it on disk forever.
    # This also shields repeat demos from IRSA SIA outages.
    cache = CACHE_DIR / f"wise_{ra:.4f}_{dec:+.4f}_{band}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    rows = []
    for col in COLLECTIONS:
        q = urllib.parse.urlencode({"COLLECTION": col, "POS": f"circle {ra} {dec} 0.001", "RESPONSEFORMAT": "CSV"})
        for r in csv.DictReader(io.StringIO(server.get(f"{server.SIA}?{q}").decode())):
            if r["energy_bandpassname"] == band and r["access_url"].endswith("-int-1b.fits"):
                rows.append({"access_url": r["access_url"], "t_min": r["t_min"]})
    CACHE_DIR.mkdir(exist_ok=True)
    cache.write_text(json.dumps(rows))
    return rows


def s3_url(row):
    # .../ibe/data/wise/neowiser/p1bm_frm/... -> wise/neowiser/images/p1bm_frm/...
    coll, rest = row["access_url"].split("/ibe/data/wise/", 1)[1].split("/", 1)
    return f"{S3}{coll}/images/{rest}"


def read_frame(row, ra, dec, out_wcs, n):
    # Two range requests per frame: L1b headers are ~13 FITS blocks, so grab them in one go
    # (server.RemoteFits reads 4 blocks at a time = ~4 round trips per header).
    url = s3_url(row)
    try:
        raw = server.byte_range(url, 0, 2880 * 24)
        end = next(i for i in range(0, len(raw), 80) if raw[i:i + 80] == b"END" + b" " * 77)
    except (RuntimeError, StopIteration):
        return None  # ponytail: drop frames S3 won't serve; a visit has 12+ others
    # Parse only WCS/zero-point cards: the full 467-card header costs 0.11 s of GIL-bound CPU per frame (6x more).
    hdr = fits.Header.fromstring(b"".join(raw[i:i + 80] for i in range(0, end, 80) if KEEP.match(raw[i:i + 80])).decode("ascii"))
    data = -(-(end + 80) // 2880) * 2880
    w = WCS(hdr)
    nx = hdr["NAXIS1"]
    half = int(n * 6.15 / 2.75 * 0.75) + 2  # covers the output box at any rotation, in 2.75"/px WISE pixels
    x, y = (int(round(float(v))) for v in w.world_to_pixel_values(ra, dec))
    y0, y1, x0, x1 = max(y - half, 0), min(y + half + 1, hdr["NAXIS2"]), max(x - half, 0), min(x + half + 1, nx)
    if y1 - y0 < 4 or x1 - x0 < 4:
        return None
    try:
        slab = server.byte_range(url, data + y0 * nx * 4, (y1 - y0) * nx * 4)  # BITPIX -32
    except RuntimeError:
        return None
    img = np.frombuffer(slab, ">f4").reshape(y1 - y0, nx)[:, x0:x1].astype(float)
    img *= 10 ** (-0.4 * (hdr["MAGZP"] - 22.5))  # DN -> nanomaggies, so cryo and NEOWISE frames match
    img -= np.nanmedian(img)  # L1b frames are not background-subtracted
    out, _ = reproject_interp((img, w[y0:y1, x0:x1]), out_wcs, shape_out=(n, n))
    return float(row["t_min"]), out


def wise_frames(ra, dec, out_wcs, n, band="W2"):
    """-> [(mean mjd, n x n median stack)] one per WISE visit, oldest first. Units: nanomaggies (not MJy/sr)."""
    visits = []  # group exposures into ~6-month visits before reading, so each visit can be capped
    for r in sorted(find_frames(ra, dec, band), key=lambda r: float(r["t_min"])):
        if visits and float(r["t_min"]) - float(visits[-1][-1]["t_min"]) < server.EPOCH_GAP:
            visits[-1].append(r)
        else:
            visits.append([r])
    picks = [(k, r) for k, v in enumerate(visits) for r in v[:: max(1, -(-len(v) // PER_VISIT))]]
    with ThreadPoolExecutor(96) as ex:  # latency-bound: 2 small S3 requests per exposure
        frames = list(ex.map(lambda p: (p[0], read_frame(p[1], ra, dec, out_wcs, n)), picks))
    out = []
    for k in range(len(visits)):
        got = [f for j, f in frames if j == k and f]
        if got:
            out.append((float(np.mean([t for t, _ in got])), np.nanmedian([im for _, im in got], axis=0)))
    return out


if __name__ == "__main__":
    import time
    from astropy.time import Time

    ra, dec, size = 133.7951, -7.2451, 300  # WISE 0855, challenge coordinates; grid built like server.blink
    n = max(int(size / 3600 / server.PIX) | 1, 9)
    out = WCS(naxis=2)
    out.wcs.ctype, out.wcs.crval = ["RA---TAN", "DEC--TAN"], [ra, dec]
    out.wcs.crpix, out.wcs.cdelt = [(n + 1) / 2] * 2, [-server.PIX, server.PIX]

    t = time.time()
    ep = wise_frames(ra, dec, out, n)
    print(f"{len(ep)} epochs in {time.time() - t:.1f}s")
    for mjd, img in ep:
        y, x = np.unravel_index(np.nanargmax(img), img.shape)
        print(f"  {Time(mjd, format='mjd').iso[:10]}  peak x={x:2d} y={y:2d}")

    years = [Time(m, format="mjd").decimalyear for m, _ in ep]
    assert len(ep) >= 10, len(ep)
    assert years[0] < 2011 and years[-1] > 2023, (years[0], years[-1])
    # Static stars cancel in first-minus-last; the mover leaves a + blob (then) and a - blob (now).
    # 3 px border excluded: edge pixels pick up partial-star residuals.
    d = (ep[0][1] - ep[-1][1])[3:-3, 3:-3]
    then = np.unravel_index(np.nanargmax(d), d.shape)
    now = np.unravel_index(np.nanargmin(d), d.shape)
    moved = float(np.hypot(then[0] - now[0], then[1] - now[1]))
    print(f"WISE 0855 (x, y): {then[1] + 3},{then[0] + 3} -> {now[1] + 3},{now[0] + 3} = {moved:.1f} px over {years[-1] - years[0]:.1f} yr")
    assert moved >= 15, moved
    assert now[1] > then[1], "should move west (+x on this east-left grid)"
    print("ok")
