# Fetch Voyager 1 + Earth/Jupiter/Saturn heliocentric ecliptic vectors from JPL Horizons, save raw JSON responses.
import json, sys, urllib.parse, urllib.request, os
out = sys.argv[1]
BODIES = {"voyager1": "-31", "earth": "399", "jupiter": "599", "saturn": "699"}
WINDOWS = [
    ("1977-09-06", "1979-02-01", "10d"),
    ("1979-02-01", "1979-04-10", "6h"),
    ("1979-04-10", "1980-10-15", "10d"),
    ("1980-10-15", "1980-12-15", "6h"),
    ("1980-12-15", "1982-01-04", "10d"),
    ("1982-01-04", "2026-11-15", "60d"),
    ("2026-11-15", "2026-11-16", "1d"),
]
def q(cmd, start, stop, step):
    p = {"format": "json", "COMMAND": f"'{cmd}'", "OBJ_DATA": "NO", "MAKE_EPHEM": "YES", "EPHEM_TYPE": "VECTORS",
         "CENTER": "'500@10'", "REF_PLANE": "ECLIPTIC", "REF_SYSTEM": "ICRF", "VEC_TABLE": "2", "OUT_UNITS": "AU-D",
         "CSV_FORMAT": "YES", "VEC_LABELS": "NO", "START_TIME": f"'{start}'", "STOP_TIME": f"'{stop}'", "STEP_SIZE": f"'{step}'"}
    return "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(p)
for name, cmd in BODIES.items():
    for i, (a, b, s) in enumerate(WINDOWS):
        if os.path.exists(os.path.join(out, f"{name}_{i}.json")): continue
        url = q(cmd, a, b, s)
        with urllib.request.urlopen(url, timeout=60) as r:
            data = json.load(r)
        with open(os.path.join(out, f"{name}_{i}.json"), "w") as f:
            json.dump({"url": url, **data}, f)
        print(name, i, len(data.get("result", "")))
