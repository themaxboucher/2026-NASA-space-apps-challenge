# Fetch heliocentric ecliptic trajectories from JPL Horizons -> public/data/trajectories.json
import json, sys, time, urllib.parse, urllib.request, re, datetime as dt

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
OUT = sys.argv[1]
TODAY = "2026-11-15"
# id, name, start (first day after launch), encounters (date, label) sampled every 1 d for +-20 d
CRAFT = {
    "voyager1": ("-31", "Voyager 1", "1977-09-06", [("1979-03-05", "Jupiter"), ("1980-11-12", "Saturn")]),
    "voyager2": ("-32", "Voyager 2", "1977-08-21", [("1979-07-09", "Jupiter"), ("1981-08-25", "Saturn"), ("1986-01-24", "Uranus"), ("1989-08-25", "Neptune")]),
    "pioneer10": ("-23", "Pioneer 10", "1972-03-04", [("1973-12-04", "Jupiter")]),
    "pioneer11": ("-24", "Pioneer 11", "1973-04-07", [("1974-12-03", "Jupiter"), ("1979-09-01", "Saturn")]),
    "newhorizons": ("-98", "New Horizons", "2006-01-20", [("2007-02-28", "Jupiter"), ("2015-07-14", "Pluto"), ("2019-01-01", "Arrokoth")]),
}
BASE = dict(format="json", OBJ_DATA="NO", MAKE_EPHEM="YES", EPHEM_TYPE="VECTORS", CENTER="'500@10'", REF_PLANE="ECLIPTIC",
            REF_SYSTEM="ICRF", VEC_TABLE="1", OUT_UNITS="AU-D", CSV_FORMAT="YES", VEC_LABELS="NO")
J2000 = 2451545.0


def q(cmd, start, stop, step):
    p = dict(BASE, COMMAND=f"'{cmd}'", START_TIME=f"'{start}'", STOP_TIME=f"'{stop}'", STEP_SIZE=f"'{step}'")
    url = API + "?" + urllib.parse.urlencode(p, safe="'@")
    for i in range(4):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                res = json.load(r)["result"]
            break
        except Exception as e:
            print("retry", e, file=sys.stderr); time.sleep(3)
    if "$$SOE" not in res:
        return None, res
    rows = []
    for line in res.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines():
        c = [x.strip() for x in line.split(",")]
        rows.append((round(float(c[0]) - J2000, 3), float(c[2]), float(c[3]), float(c[4])))
    return rows, res


def d(s): return dt.date.fromisoformat(s)


out = {
    "credit": "NASA/JPL Horizons, public domain",
    "licence": "Public domain (NASA/JPL)",
    "source": "https://ssd.jpl.nasa.gov/horizons/",
    "query": {**{k: v.strip("'") for k, v in BASE.items() if k != "format"}, "api": API, "CENTER": "500@10 (Sun)",
              "steps": "every 30 d from launch to the end of the ephemeris (or 2026-11-15), plus every 1 d for 20 days either side of each planet flyby",
              "example": None},
    "units": "t: days since J2000.0 (2000-01-01 12:00 TDB). x, y, z: heliocentric J2000 ecliptic position in AU.",
    "craft": {},
}
for key, (cmd, name, start, enc) in CRAFT.items():
    stop = TODAY
    rows, res = q(cmd, start, stop, "30 d")
    if rows is None:
        # Ephemeris ends before today: Horizons names the last date it has.
        m = re.findall(r"(\d{4}-[A-Z][a-z]{2}-\d{2})", res.split("prior to")[-1] if "prior to" in res else res)
        print(key, "no data to today:\n", res[-900:], file=sys.stderr)
        stops = [dt.datetime.strptime(x, "%Y-%b-%d").date() for x in m]
        stop = str(max(s for s in stops if s > d(start)) - dt.timedelta(days=1)) if stops else None
        rows, res = q(cmd, start, stop, "30 d")
        if rows is None:
            sys.exit(f"{key}: {res[-600:]}")
    pts = {r[0]: r for r in rows}
    for day, _ in enc:
        a, b = d(day) - dt.timedelta(days=20), d(day) + dt.timedelta(days=20)
        rr, res2 = q(cmd, str(a), str(b), "1 d")
        if rr: pts.update({r[0]: r for r in rr})
        else: print(key, day, "window failed", res2[-300:], file=sys.stderr)
    pts = sorted(pts.values())
    last = J2000 + pts[-1][0]
    out["craft"][key] = {
        "command": cmd, "name": name, "from": start, "to": stop,
        "flybys": [{"date": x, "of": y} for x, y in enc],
        "points": [[p[0], round(p[1], 4), round(p[2], 4), round(p[3], 4)] for p in pts],
    }
    print(key, len(pts), "points", start, "..", stop, file=sys.stderr)
p = dict(BASE, COMMAND="'-31'", START_TIME="'1977-09-06'", STOP_TIME="'2026-11-15'", STEP_SIZE="'30 d'")
out["query"]["example"] = API + "?" + urllib.parse.urlencode(p, safe="'@")
with open(OUT, "w", encoding="utf8") as f:
    json.dump(out, f, separators=(",", ":"))
