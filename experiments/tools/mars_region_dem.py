"""Rebuild region.png (512 px, 240 km) and far.png (256 px, 840 km) for every Mars site from the
USGS Mars MGS MOLA - MEX HRSC Blended DEM Global 200 m v2 (public domain), read remotely with HTTP range requests.

The GeoTIFF is an uncompressed BigTIFF (int16 metres, one row per strip, 0.003374 deg/px, origin -180/90), so every
row segment is one byte range. Output: Terrarium PNG (h = R*256 + G + B/256 - 32768), same local frame as the
engine (x east, z south, metres from meta.center, flat scale at the centre latitude with R = 3389500 m).
Run from the project root: python experiments/tools/mars_region_dem.py
"""
import json, math, os, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image

URL = 'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif'
W, H, DATA0, DEG = 106694, 53347, 854272, 0.003374120830641  # from the TIFF header (tags 256/257/273/33550)
R = 3389500.0
OUT = 'public/terrain/mars'
SOURCE = {
    'product': 'Mars MGS MOLA - MEX HRSC Blended DEM Global 200 m v2, USGS Astrogeology',
    'credit': 'NASA/GSFC MOLA Science Team; ESA/DLR/FU Berlin HRSC Team; USGS Astrogeology (Fergason, Hare and Laura, 2018)',
    'license': 'Public domain',
    'url': 'https://astrogeology.usgs.gov/search/map/mars_mgs_mola_mex_hrsc_blended_dem_global_200m',
}


def row_seg(r, c0, c1):
    """int16 values of DEM row r, columns c0..c1 inclusive (no wrap)."""
    req = urllib.request.Request(URL, headers={'Range': f'bytes={DATA0 + (r * W + c0) * 2}-{DATA0 + (r * W + c1) * 2 + 1}'})
    for attempt in range(5):  # S3 drops the odd connection under 32 parallel reads
        try:
            with urllib.request.urlopen(req, timeout=120) as f:
                return np.frombuffer(f.read(), '<i2').astype(np.float32)
        except OSError:
            if attempt == 4: raise


def grid(lat0, lon0, ext, n, pool):
    D = math.pi / 180
    t = (np.arange(n) / (n - 1) - 0.5) * ext
    lat = lat0 - t / (R * D)                              # row r -> z = t[r] (south)
    lon = lon0 + t / (R * math.cos(lat0 * D) * D)         # col c -> x = t[c] (east)
    v = np.clip((90 - lat) / DEG - 0.5, 0, H - 1.001)     # pixel-is-area centres
    u = ((lon + 180) / DEG - 0.5)
    c0, c1 = int(math.floor(u.min())), int(math.floor(u.max())) + 1
    rows = sorted({int(x) for x in np.floor(v)} | {int(x) + 1 for x in np.floor(v)})
    def fetch(r):  # wrap across the 180 deg meridian
        cols = np.arange(c0, c1 + 1) % W
        if cols[0] <= cols[-1]: return r, row_seg(r, cols[0], cols[-1])
        return r, np.concatenate([row_seg(r, cols[0], W - 1), row_seg(r, 0, cols[-1])])
    data = dict(pool.map(fetch, rows))
    ui, fu = np.floor(u).astype(int) - c0, u - np.floor(u)
    out = np.empty((n, n), np.float32)
    for i, vv in enumerate(v):
        r = int(vv); fv = vv - r
        a, b = data[r], data[r + 1]
        top = a[ui] * (1 - fu) + a[ui + 1] * fu
        bot = b[ui] * (1 - fu) + b[ui + 1] * fu
        out[i] = top * (1 - fv) + bot * fv
    return out


def terrarium(h):
    v = np.clip(h + 32768, 0, 65535.996)
    return Image.fromarray(np.dstack([v // 256, np.floor(v) % 256, np.floor((v % 1) * 256)]).astype(np.uint8), 'RGB')


def main():
    with ThreadPoolExecutor(32) as pool:
        for site in sorted(os.listdir(OUT)):
            jf = f'{OUT}/{site}/region.json'
            if not os.path.isfile(jf): continue
            lat0, lon0 = json.load(open(f'{OUT}/{site}/meta.json', encoding='utf8'))['center']
            j = json.load(open(jf, encoding='utf8'))
            ext, fext = j['extent_m'][0], j['far_extent_m'][0]
            g, f = grid(lat0, lon0, ext, 512, pool), grid(lat0, lon0, fext, 256, pool)
            # The site tile (height.png) is relative to its own local datum, so shift the DEM to match it over the tile footprint.
            t = np.asarray(Image.open(f'{OUT}/{site}/height.png').convert('RGB')).astype(np.float64)
            tile_ext = json.load(open(f'{OUT}/{site}/meta.json', encoding='utf8'))['extent_m'][0]
            k = int(round(tile_ext / 2 / ext * 511)); off = (t[..., 0] * 256 + t[..., 1] + t[..., 2] / 256 - 32768).mean() - g[255 - k:257 + k, 255 - k:257 + k].mean()
            g += off; f += off
            # ponytail: bilinear point samples, so far.png (3.3 km/px from 200 m data) is not area-averaged; box-filter if it looks noisy
            old = np.asarray(Image.open(os.environ.get('OLD_REGION', OUT) + f'/{site}/region.png').convert('RGB')).astype(np.float64)
            old = old[..., 0] * 256 + old[..., 1] + old[..., 2] / 256 - 32768
            terrarium(g).save(f'{OUT}/{site}/region.png'); terrarium(f).save(f'{OUT}/{site}/far.png')
            j.update(res_m=round(ext / 511, 2), far_res_m=round(fext / 255, 2), source=SOURCE)
            json.dump(j, open(jf, 'w', encoding='utf8'), indent=1)
            print(f'{site}: new {g.min():.0f}..{g.max():.0f} m, mean |new-old| {np.abs(g - old).mean():.1f} m, centre {g[255, 255]:.0f} (old {old[255, 255]:.0f})')


if __name__ == '__main__':
    t = terrarium(np.array([[-4321.5, 0.25]], np.float32)); a = np.asarray(t).astype(float)
    assert np.allclose(a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768, [[-4321.5, 0.25]])
    main()
