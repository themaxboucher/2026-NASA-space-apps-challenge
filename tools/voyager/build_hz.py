# Merge the Horizons responses into public/data/voyager1-trajectory.json, and print sanity checks.
import json, math, sys, urllib.parse
src, dst = sys.argv[1], sys.argv[2]
NAMES = ["voyager1", "earth", "jupiter", "saturn"]
NW = 7
AU_KM = 149597870.7
def rows(name, i):
    d = json.load(open(f"{src}/{name}_{i}.json"))
    r = d["result"]
    body = r[r.index("$$SOE") + 5 : r.index("$$EOE")]
    out = []
    for line in body.strip().splitlines():
        f = [x.strip() for x in line.split(",")]
        out.append((float(f[0]), *map(float, f[2:8])))
    return out, d["url"]
series = {n: {} for n in NAMES}
urls = []
for n in NAMES:
    for i in range(NW):
        rs, url = rows(n, i)
        if n == "voyager1": urls.append(urllib.parse.unquote(url))
        for row in rs: series[n][round(row[0], 4)] = row
jds = sorted(series["voyager1"])
assert all(sorted(series[n]) == jds for n in NAMES)
EPOCH = 2443391.5  # 1977-09-05 00:00 TDB
data = {
    "credit": "NASA/JPL Horizons (Voyager 1 trajectory: Voyager_1_ST+refit2022_m; planets: DE440)",
    "licence": "Public domain (NASA/JPL)",
    "source": "https://ssd.jpl.nasa.gov/horizons/",
    "query": {"api": "https://ssd.jpl.nasa.gov/api/horizons.api", "targets": {"voyager1": "-31", "earth": "399", "jupiter": "599", "saturn": "699"},
              "CENTER": "500@10 (Sun)", "EPHEM_TYPE": "VECTORS", "REF_PLANE": "ECLIPTIC", "REF_SYSTEM": "ICRF", "OUT_UNITS": "AU-D", "VEC_TABLE": "2",
              "windows": ["1977-09-06..1979-02-01 every 10d", "1979-02-01..1979-04-10 every 6h (Jupiter)", "1979-04-10..1980-10-15 every 10d",
                          "1980-10-15..1980-12-15 every 6h (Saturn/Titan)", "1980-12-15..1982-01-04 every 10d", "1982-01-04..2026-11-15 every 60d", "2026-11-15..2026-11-16 every 1d"],
              "example": urls[0]},
    "note": "Horizons notes its Voyager 1 trajectory before 1981 is a patched-conic reconstruction of rough accuracy; after 1981 it is a 2022 refit of tracking data.",
    "units": "t: days since 1977-09-05 00:00 TDB. Positions: heliocentric ecliptic x,y,z in AU, flattened. speed: Voyager 1 speed relative to the Sun, km/s.",
    "t": [round(j - EPOCH, 3) for j in jds],
}
for n in NAMES:
    data[n] = [round(v, 5) for j in jds for v in series[n][j][1:4]]
data["speed"] = [round(math.sqrt(sum(v * v for v in series["voyager1"][j][4:7])) * AU_KM / 86400, 2) for j in jds]
json.dump(data, open(dst, "w"), separators=(",", ":"))
# checks
def dist(a, b, j): return math.dist(series[a][j][1:4], series[b][j][1:4])
for p in ("jupiter", "saturn"):
    j = min(jds, key=lambda j: dist("voyager1", p, j))
    print(p, "closest", j - EPOCH, "days", dist("voyager1", p, j) * AU_KM, "km")
for j in jds[::40] + [jds[-1]]:
    print(round(j - EPOCH, 1), "r", round(math.dist((0, 0, 0), series["voyager1"][j][1:4]), 2), "v", data["speed"][jds.index(j)], "lat", round(math.degrees(math.asin(series["voyager1"][j][3] / math.dist((0,0,0), series["voyager1"][j][1:4]))), 1))
print(len(jds), "samples")
