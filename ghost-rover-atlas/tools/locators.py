"""Build "where is it" map crops for Ghost Rover Atlas.

For every Moon/Mars entry with coordinates, fetches a wide and a close
plate-carree (lat/lon-linear) crop from the USGS Astrogeology planetary WMS
and writes img/loc/<id>-{wide,close}.jpg plus data/locator.json.

Re-run:  python tools/locators.py
"""
import io
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps, ImageStat

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "img" / "loc"
UA = "GhostRoverAtlas/0.1 (hackathon prototype)"
WMS = "https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/{}.map"
MAPS = {"mars": "mars/mars_simp_cyl", "moon": "earth/moon_simp_cyl"}
WIDTH = 800
SUPERSAMPLE = 2  # fetch 2x, downsample with Lanczos (server resampling is crude)
MAX_BYTES = 250_000

# (lon span, lat span, credit keys tried in order; the next one is used when a crop is black)
VIEWS = {
    "mars": {"wide": (30, 20, ["mars-wide"]), "close": (1.6, 1.07, ["mars-close"])},
    "moon": {"wide": (20, 13, ["moon-wide", "moon-fallback"]), "close": (0.8, 0.53, ["moon-close", "moon-fallback"])},
}
LROC_WAC = ("LROC_WAC", "LRO WAC Global Mosaic (100 m/px, ASU 2013, edge fix 2016)",
            "NASA/GSFC/Arizona State University — LRO WAC global mosaic, via USGS Astrogeology")
CREDITS = {
    "mars-wide": ("MDIM21_color", "Viking MDIM 2.1 Colorized Global Mosaic (231 m/px)",
                  "NASA/USGS Astrogeology — Viking MDIM 2.1 mosaic, colorized by NASA Ames"),
    "mars-close": ("THEMIS", "THEMIS IR Day 100m Global Mosaic v12",
                   "NASA/JPL-Caltech/Arizona State University — Mars Odyssey THEMIS day-IR global mosaic, via USGS Astrogeology"),
    "moon-wide": LROC_WAC,
    "moon-close": LROC_WAC,
    # Permanently shadowed south-pole craters (LCROSS, Lunar Prospector) are black in WAC.
    "moon-fallback": ("LOLA_color", "LOLA Color Shaded Relief (256 px/deg; blue = low, red = high)",
                            "NASA/GSFC/USGS Astrogeology — LRO LOLA colorized shaded relief"),
}


def bbox(lat, lon, lon_span, lat_span, path=()):
    """Box centred on the site, grown (same aspect) so every path point sits inside with a 15% margin."""
    hx, hy = lon_span / 2, lat_span / 2
    grow = max([1.0] + [max(abs(p[1] - lon) / (0.85 * hx), abs(p[0] - lat) / (0.85 * hy)) for p in path])
    hx, hy = hx * grow, hy * grow
    b = [round(lon - hx, 5), round(max(-90.0, lat - hy), 5), round(lon + hx, 5), round(min(90.0, lat + hy), 5)]
    assert -180 <= b[0] and b[2] <= 360, f"bbox {b} outside the WMS lon range -180..360"
    return b


def fetch(body, layer, b, w, h):
    q = urllib.parse.urlencode({
        "SERVICE": "WMS", "VERSION": "1.1.1", "REQUEST": "GetMap", "SRS": "EPSG:4326", "STYLES": "",
        "FORMAT": "image/png", "LAYERS": layer, "BBOX": ",".join(map(str, b)),
        "WIDTH": w * SUPERSAMPLE, "HEIGHT": h * SUPERSAMPLE,
    })
    url = WMS.format(MAPS[body]) + "&" + q
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=120) as r:
                ctype, data = r.headers.get("Content-Type", ""), r.read()
            if not ctype.startswith("image/"):
                raise ValueError(f"{ctype}: {data[:200]!r}")  # WMS errors come back as XML
            im = Image.open(io.BytesIO(data))
            im.load()
            return im.convert("RGB").resize((w, h), Image.LANCZOS)
        except Exception as e:
            if attempt == 3:
                raise
            print(f"  retry {layer} {b}: {e}", file=sys.stderr)
            time.sleep(2 * (attempt + 1))


def is_black(im):
    g = im.convert("L")
    return sum(g.histogram()[:6]) > 0.5 * g.width * g.height


def save(im, path):
    r, g, b = im.split()
    if r.tobytes() == g.tobytes() == b.tobytes():
        im = r  # grayscale mosaic: smaller file
    for q in range(82, 40, -6):
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=q, optimize=True, progressive=True)
        if buf.tell() < MAX_BYTES:
            break
    path.write_bytes(buf.getvalue())
    # verify: valid JPEG, right size, not blank
    chk = Image.open(path)
    chk.verify()
    chk = Image.open(path)
    assert chk.format == "JPEG" and chk.size == im.size, path
    assert ImageStat.Stat(chk.convert("L")).stddev[0] > 2, f"{path.name} looks blank"
    return buf.tell(), q


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sites, used, warnings = {}, set(), []
    for body in ("moon", "mars"):
        for e in json.loads((ROOT / "data" / f"{body}.json").read_text(encoding="utf-8")):
            if e.get("lat") is None or e.get("lon") is None:
                print(f"skip {e['id']}: no coordinates")
                continue
            sites[e["id"]] = entry = {}
            for view, (sx, sy, keys) in VIEWS[body].items():
                b = bbox(e["lat"], e["lon"], sx, sy, e.get("path") or ())
                for p in e.get("path") or ():
                    assert b[0] <= p[1] <= b[2] and b[1] <= p[0] <= b[3], (e["id"], p, b)
                w = WIDTH
                h = round(w * (b[3] - b[1]) / (b[2] - b[0]))
                for key in keys:
                    im = fetch(body, CREDITS[key][0], b, w, h)
                    if not is_black(im):
                        break
                    warnings.append(f"{e['id']} {view}: {CREDITS[key][0]} mostly black")
                im = ImageOps.autocontrast(im, cutoff=0.5, preserve_tone=True)
                rel = f"img/loc/{e['id']}-{view}.jpg"
                size, q = save(im, ROOT / rel)
                used.add(key)
                entry[view] = {"file": rel, "bbox": b, "w": w, "h": h, "credit": key}
                print(f"{rel:38s} {w}x{h} {size // 1024:4d} KB q{q} {CREDITS[key][0]}")
    credits = {k: {"layer": f"{v[0]} — {v[1]}", "credit": v[2], "license": "Public domain",
                   "source": WMS.format(MAPS[k.split('-')[0]])}
               for k, v in CREDITS.items() if k in used}
    (ROOT / "data" / "locator.json").write_text(
        json.dumps({"credits": credits, "sites": sites}, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"\n{len(sites)} sites written; warnings:", *warnings or ["none"], sep="\n  ")


if __name__ == "__main__":
    main()
