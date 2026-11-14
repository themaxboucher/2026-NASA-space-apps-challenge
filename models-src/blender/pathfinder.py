# Mars Pathfinder lander ("Carl Sagan Memorial Station") as it sits at Ares Vallis, petals open
# References (NASA/JPL, public domain):
#   Mars Pathfinder Landing press kit (JPL, July 1997): lander is a tetrahedron "standing about 0.9 meter"
#     stowed; "unfolded and lying flat on the surface, the spacecraft will measure 2.75 meters across with a
#     mast-mounted camera standing up about 1.5 meters from the ground"; 2.8 m^2 of solar panels on three
#     petals; lander diagram (IMP, ASI/MET mast with wind socks, HGA, LGA, ramps)
#   NSSDCA 1996-068A: IMP on a 0.8 m pop-up mast
#   KSC-96PC-1130 (lander in the PHSF, petals part-open: black cell petals with silver frames, white core
#     box), PIA01121 / PIA01551 / PIA01120 (lander on Mars: billowing airbag remnants at the petal corners,
#     lattice IMP mast, ASI/MET mast, unrolled ramps)
# Layout: base petal = equilateral triangle, edge A = 1.42 m; three side petals hinged on its edges and
#   drooping ~8 deg so their tips rest on the ground; truncated tips give ~2.7 m across.
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from shapes import blob, tube, cells
from mathutils import Vector

reset()
mat("pfcell", (0.025, 0.03, 0.055), 0.3, 0.25)       # GaAs cells, near black
mat("airbag", (0.86, 0.80, 0.68), 0.0, 0.95)          # Vectran fabric, dusty cream
mat("frame", (0.62, 0.63, 0.65), 0.5, 0.45)           # petal edge frames

A = 1.42
H = A * math.sqrt(3) / 2
ZT = 0.18                                             # base petal top
rc = A / math.sqrt(3)
base = [Vector((rc * math.cos(math.radians(90 + 120 * i)), rc * math.sin(math.radians(90 + 120 * i)), ZT)) for i in range(3)]


def slab(poly, o, u, v, t, m, name="slab"):
    """Prism: 2D polygon on plane (o, u, v), extruded by t along -normal."""
    n = u.cross(v).normalized()
    top = [o + u * p[0] + v * p[1] for p in poly]
    bot = [p - n * t for p in top]
    k = len(poly)
    faces = [tuple(range(k)), tuple(range(2 * k - 1, k - 1, -1))]
    faces += [(i, (i + 1) % k, k + (i + 1) % k, k + i) for i in range(k)]
    from shapes import _recalc
    return _recalc(mesh(top + bot, faces, m, name))


# --- base petal + crumpled airbag cloth under it
slab([(0, 0), (A, 0), (A / 2, H)], base[0] - Vector((0, 0, 0)), (base[1] - base[0]).normalized(),
     ((base[2] - (base[0] + base[1]) / 2)).normalized(), 0.08, "frame", "basepetal")
mesh([base[i] + Vector((0, 0, 0.003)) + (Vector((0, 0, ZT)) - base[i]) * 0.08 for i in range(3)], [(0, 1, 2)], "gold", "mli")
blob((0, 0, 0.05), (0.62, 0.62, 0.08), "airbag", seed=1, rough=0.2, flat_bottom=0.0)

# --- side petals
DROOP = math.asin((ZT - 0.04) / (0.9 * H))
petal_frames = []
for i in range(3):
    a, b = base[(i + 1) % 3], base[i]          # ordered so u x v points up
    mid = (a + b) / 2
    out = Vector((mid.x, mid.y, 0)).normalized()
    u = (b - a).normalized()
    v = out * math.cos(DROOP) - Vector((0, 0, 1)) * math.sin(DROOP)
    HT, w = 0.9 * H, A * 0.1
    poly = [(0, 0), (A, 0), (A / 2 + w / 2, HT), (A / 2 - w / 2, HT)]
    slab(poly, a, u, v, 0.04, "frame", "petal")
    m = 0.05                                                      # cell area inset from the frame
    k = (A / 2 - w / 2) / HT
    inner = [(m / k * 0 + m + 0.03, m), (A - m - 0.03, m), (A / 2 + w / 2 - m, HT - m), (A / 2 - w / 2 + m, HT - m)]
    cells(inner, a, u, v, 0.05, 0.004, "pfcell", lift=0.003)
    box((A * 0.86, 0.06, 0.006), tuple(a + u * (A / 2) + v * 0.04 + u.cross(v) * 0.002), (0, 0, 0), "gold").rotation_euler = (0, 0, math.atan2(u.y, u.x))
    # hinge actuator housing bridging base and petal
    hb = box((0.16, 0.12, 0.08), tuple(mid + Vector((0, 0, 0.0))), (0, 0, math.degrees(math.atan2(u.y, u.x))), "darkalu")
    petal_frames.append((a, u, v, HT, w))

# --- airbag remnants billowing out of the three corner gaps between petals
for i in range(3):
    c = Vector((base[i].x, base[i].y, 0))
    d = c.normalized()
    side = Vector((-d.y, d.x, 0))
    ang = math.atan2(d.y, d.x)
    blob(tuple(c + d * 0.26 + Vector((0, 0, 0.1))), (0.5, 0.42, 0.34), "airbag", seed=10 + i, rough=0.13,
         freq=2.0, sub=4, flat_bottom=0.0, wrinkle=0.025)
    for s in (-1, 1):
        blob(tuple(c + d * 0.04 + side * s * 0.28 + Vector((0, 0, 0.16))), (0.32, 0.28, 0.30), "airbag",
             seed=20 + i * 2 + s, rough=0.14, freq=2.0, sub=4, flat_bottom=0.0, wrinkle=0.025)

# --- lander core (electronics enclosure) on the base petal
ZC = ZT + 0.005
cb, ct, h = (0.64, 0.54), (0.5, 0.4), 0.34
vs = [(-cb[0] / 2, -cb[1] / 2, ZC), (cb[0] / 2, -cb[1] / 2, ZC), (cb[0] / 2, cb[1] / 2, ZC), (-cb[0] / 2, cb[1] / 2, ZC),
      (-ct[0] / 2, -ct[1] / 2, ZC + h), (ct[0] / 2, -ct[1] / 2, ZC + h), (ct[0] / 2, ct[1] / 2, ZC + h), (-ct[0] / 2, ct[1] / 2, ZC + h)]
mesh(vs, [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], "white", "core")
box((0.70, 0.60, 0.05), (0, 0, ZC + 0.025), m="gold")                 # MLI skirt around the core foot
ZTOP = ZC + h

# --- IMP camera on its lattice mast (camera at ~1.5 m)
MX, MY, MR = -0.08, 0.06, 0.045
ZM = 1.38
legs = [Vector((MX + MR * math.cos(math.radians(90 + 120 * k)), MY + MR * math.sin(math.radians(90 + 120 * k)), 0)) for k in range(3)]
for k in range(3):
    p = legs[k]
    strut((p.x, p.y, ZTOP - 0.01), (p.x, p.y, ZM), 0.006, "alu", n=6)
    q = legs[(k + 1) % 3]
    zig, z, t = [], ZTOP + 0.02, 0
    while z < ZM - 0.02:
        r = p if t % 2 == 0 else q
        zig.append((r.x, r.y, z)); z += 0.09; t += 1
    tube(zig, 0.003, "alu", n=4)
cyl(0.065, 0.02, (MX, MY, ZM + 0.01), m="alu", n=12)
cyl(0.025, 0.05, (MX, MY, ZM + 0.045), m="darkalu", n=10)
box((0.11, 0.26, 0.1), (MX, MY, 1.5), m="white")
for y in (-0.075, 0.075):
    cyl(0.026, 0.05, (MX + 0.075, MY + y, 1.5), (0, 90, 0), "black", n=12)
    cyl(0.018, 0.004, (MX + 0.1, MY + y, 1.5), (0, 90, 0), "glass", n=12)
cyl(0.03, 0.12, (MX, MY, 1.565), (90, 0, 0), "white", n=12)

# --- high-gain antenna on its gimbal, low-gain antenna
cyl(0.025, 0.12, (0.15, -0.12, ZTOP + 0.06), m="darkalu", n=10)
dish(0.15, 0.045, (0.15, -0.12, ZTOP + 0.115), (50, 0, 40), "white", n=20, rings=3)
strut((0.17, 0.13, ZTOP - 0.01), (0.17, 0.13, ZTOP + 0.38), 0.012, "white", n=8)
cyl(0.025, 0.06, (0.17, 0.13, ZTOP + 0.4), m="white", n=10)

# --- ASI/MET mast with three wind socks and the wind sensor, near the tip of petal 2
a, u, v, HT, w = petal_frames[2]
n = u.cross(v).normalized()
mb = a + u * (A / 2) + v * (0.72 * HT)
mt = mb + Vector((0, 0, 1.0))
cyl(0.03, 0.04, tuple(mb + Vector((0, 0, 0.01))), m="darkalu", n=10)
strut(tuple(mb), tuple(mt), 0.009, "alu", n=8)
for zz in (0.33, 0.62, 0.92):
    p0 = mb + Vector((0, 0, zz))
    p1 = p0 + u * 0.09
    strut(tuple(p0), tuple(p1), 0.003, "alu", n=4)
    cyl(0.016, 0.07, tuple(p1 + Vector((0, 0, -0.035))), m="white", n=8, r2=0.006)
for k in range(3):                                                 # wind sensor cups
    ang = math.radians(120 * k)
    tip = mt + Vector((math.cos(ang), math.sin(ang), 0)) * 0.06
    strut(tuple(mt), tuple(tip), 0.003, "alu", n=4)
    sphere(0.012, tuple(tip), "white", seg=8, ring=4)

# --- the two unrolled rover ramps leaving petal 1 (front and rear), down to the ground
a, u, v, HT, w = petal_frames[1]
n = u.cross(v).normalized()
vv = 0.42 * HT
ul = (A / 2 - w / 2) * (vv / HT) * 0 + vv * (A / 2 - w / 2) / HT
ur = A - ul
for s, ue in ((-1, ul + 0.02), (1, ur - 0.02)):
    st = a + u * ue + v * vv + n * 0.004
    en = st + u * s * 1.05
    en.z = 0.012
    dv = v.copy(); dv.z = 0; dv.normalize()
    rails = []
    for r in (-0.15, 0.15):
        p0, p1 = st + dv * r, en + dv * r
        tube([tuple(p0), tuple(p1)], 0.012, "silver", n=6)
        rails.append((p0, p1))
    q = [rails[0][0], rails[0][1], rails[1][1], rails[1][0]]
    sheet = mesh([tuple(p - Vector((0, 0, 0.004))) for p in q], [(0, 1, 2, 3)], "darkalu", "ramp")
    sheet.modifiers.new("s", 'SOLIDIFY').thickness = 0.004
    for t in (0.15, 0.4, 0.65, 0.9):
        p = rails[0][0].lerp(rails[0][1], t); r2 = rails[1][0].lerp(rails[1][1], t)
        tube([tuple(p), tuple(r2)], 0.006, "silver", n=4)

finish("pathfinder", "Mars Pathfinder lander",
       "Pathfinder as it sits at Ares Vallis: 1.42 m tetrahedral base petal and three opened solar petals "
       "(black GaAs cells, ~2.7 m across), crumpled cream airbag remnants billowing out of the petal "
       "corners, white core box, IMP stereo camera on its lattice mast (1.5 m up), high- and low-gain "
       "antennas, ASI/MET mast with three wind socks, and the two unrolled rover ramps.", elev=28)
