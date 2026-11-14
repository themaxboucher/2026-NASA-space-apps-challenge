# Surveyor lander (Surveyor 3 / 7 configuration, after landing)
# References: NASA Apollo 12 photos AS12-48-7133/7134/7135 (Conrad and Bean at Surveyor 3, public domain);
#   Smithsonian NASM Surveyor engineering test article and 1:5 model (DPLA / Wikimedia, CC0);
#   NSSDCA Surveyor 3 (1967-035A): ~3 m tall, footpads on a 4.3 m circle, 0.855 m^2 solar array
#   of 792 cells, mast ~1 m above the tripod apex, surface sampler 12 x 5 cm scoop on a 1.5 m
#   pantograph arm; landed mass 296 kg.
# Layout (metres): triangular aluminium-tube space frame (bottom corners r=0.78 at z=0.6, tripod apex
#   at 1.45), three hinged white truss legs with shock absorbers and 0.30 m crushable footpads
#   (centres r=2.0), crushable blocks under the frame corners, three vernier engines, six vernier
#   propellant spheres + helium tank, compartments A and B (white thermal boxes, mirror tops), TV
#   camera with mirror hood, two omni antennas on booms, surface sampler lazy-tongs arm reaching the
#   ground, mast with the planar array antenna and the solar panel (material "cell") on top.
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from mathutils import Vector

reset()
def P(r, deg, z):
    a = math.radians(deg)
    return Vector((r * math.cos(a), r * math.sin(a), z))

def beam(p1, p2, w1, h1, w2, h2, m):
    """Tapered rectangular beam p1 -> p2 (white truss leg)."""
    p1, p2 = Vector(p1), Vector(p2)
    t = (p2 - p1).normalized()
    side = t.cross(Vector((0, 0, 1))).normalized()
    up = side.cross(t)
    vs = []
    for p, w, h in ((p1, w1, h1), (p2, w2, h2)):
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            vs.append(p + side * (sx * w / 2) + up * (sy * h / 2))
    f = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return mesh(vs, f, m, "beam")

LEGS = (90, 210, 330)
SIDES = (30, 150, 270)
RB, ZB = 0.78, 0.60              # bottom corners (leg hinges)
APEX = Vector((0, 0, 1.45))
ZM = 1.0                          # mid-level ring on the tripod tubes
fr = (ZM - ZB) / (APEX.z - ZB)
RM = RB * (1 - fr)

# --- space frame ---
for i, d in enumerate(LEGS):
    d2 = LEGS[(i + 1) % 3]
    strut(P(RB, d, ZB), P(RB, d2, ZB), 0.025, "alu", 8)             # bottom triangle
    strut(P(RB, d, ZB), APEX, 0.025, "alu", 8)                       # tripod tubes
    strut(P(RM, d, ZM), P(RM, d2, ZM), 0.018, "alu", 8)              # mid ring
    strut(P(RB, d, ZB), P(RM, d2, ZM), 0.014, "alu", 6)              # diagonals
    strut(P(RB, d2, ZB), P(RM, d, ZM), 0.014, "alu", 6)
    box((0.26, 0.22, 0.03), P(RB - 0.05, d, ZB), (0, 0, d), "alu")   # corner gusset plate
sphere(0.05, APEX, "alu", seg=12, ring=6)

# --- mast and top: positioner, solar panel ("cell"), planar array antenna ---
ZT = 2.45
cyl(0.035, ZT - APEX.z + 0.45, (0, 0, (ZT + APEX.z - 0.45) / 2), m="alu", n=12)   # mast (from hub at ~1.0)
for d in LEGS:                                                        # hub spokes to the mid ring
    strut((0, 0, ZM), P(RM, d, ZM), 0.012, "alu", 6)
box((0.16, 0.16, 0.14), (0, 0, ZT), m="darkalu")                      # solar panel / antenna positioner
# solar panel: hinge along Y at the mast top, sloping up toward -X, cells facing +X / up
SW, SH = 0.84, 1.02                                                   # 0.857 m^2
th = math.radians(35)
c = Vector((-0.08, 0, ZT + 0.06)) + Vector((-math.cos(th), 0, math.sin(th))) * (SH / 2)
box((SH, SW, 0.03), tuple(c), (0, 35, 0), "alu")                      # panel substrate/frame
nrm = Vector((math.sin(th), 0, math.cos(th)))
box((SH - 0.05, SW - 0.05, 0.01), tuple(c + nrm * 0.012), (0, 35, 0), "cell")  # solar cells (front only)
strut((0.0, 0, ZT + 0.03), (-0.08, 0, ZT + 0.06), 0.03, "darkalu", 8)
# planar array antenna: hinge along X, hanging toward -Y at ~70 deg, face outward
AW = 0.90
ta = math.radians(70)
ca_ = Vector((0, -0.10, ZT - 0.05)) + Vector((0, -math.cos(ta), -math.sin(ta))) * (AW / 2)
box((AW, AW, 0.04), tuple(ca_), (70, 0, 0), "white")
na = Vector((0, -math.sin(ta), math.cos(ta)))                         # outward face normal
for k in range(-3, 4):                                                # slot rows on the array face
    q = ca_ + na * 0.021 + Vector((0, math.cos(ta), math.sin(ta))) * (k * 0.12)
    box((AW - 0.06, 0.012, 0.004), tuple(q), (70, 0, 0), "grey")
strut((0, -0.08, ZT - 0.02), (0, -0.10, ZT - 0.05), 0.03, "darkalu", 8)

# --- legs: hinged truss beam, shock absorber, crushable footpad, crushable block ---
RF = 2.0
for d in LEGS:
    hinge = P(RB, d, ZB - 0.02)
    ankle = P(RF, d, 0.13)
    beam(hinge, ankle, 0.26, 0.12, 0.07, 0.06, "white")
    strut(P(RM, d, ZM), P(RF - 0.22, d, 0.24), 0.028, "alu", 10)       # shock absorber
    sa, sb_ = P(RM, d, ZM), P(RF - 0.22, d, 0.24)
    strut(sa.lerp(sb_, 0.55), sa.lerp(sb_, 0.9), 0.042, "darkalu", 10)  # damper cylinder
    sphere(0.045, ankle, "alu", seg=10, ring=6)                       # ankle ball joint
    cyl(0.15, 0.09, P(RF, d, 0.045), m="alu", n=20, r2=0.13)          # crushable footpad
    cyl(0.10, 0.03, P(RF, d, 0.10), m="alu", n=16, r2=0.05)
    box((0.18, 0.18, 0.14), P(RB, d, ZB - 0.09), (0, 0, d), "silver")  # crushable block
    # vernier engine under the corner gusset
    cyl(0.04, 0.08, P(RB - 0.16, d, ZB - 0.05), m="darkalu", n=10)
    cyl(0.035, 0.16, P(RB - 0.16, d, ZB - 0.17), m="darkalu", n=12)
    cyl(0.075, 0.12, P(RB - 0.16, d, ZB - 0.31), m="black", n=14, r2=0.035)

# --- propellant tanks: 3 fuel + 3 oxidizer spheres around the mast, helium tank below the hub ---
for i, d in enumerate(SIDES):
    for j, dd in enumerate((-22, 22)):
        q = P(0.32, d + dd, 0.78)
        sphere(0.11, tuple(q), "silver" if j else "darkalu", seg=16, ring=8)
        strut(q, P((RB / 2) / math.cos(math.radians(dd)), d + dd, ZB), 0.01, "alu", 6)  # to the bottom tube
        strut(tuple(q), (0, 0, ZM), 0.01, "alu", 6)
sphere(0.11, (0, 0, ZM - 0.12), "silver", seg=16, ring=8)

# --- compartments A and B (white thermal boxes with mirror tops) on two frame sides ---
for d in SIDES[:2]:
    c = P(RB / 2 + 0.17, d, 0.83)
    box((0.62, 0.34, 0.42), tuple(c), (0, 0, d + 90), "white")
    box((0.60, 0.32, 0.015), tuple(c + Vector((0, 0, 0.215))), (0, 0, d + 90), "silver")
    for k in (-1, 1):                                                  # grid lines on the mirror top
        box((0.004, 0.32, 0.004), tuple(c + Vector((0, 0, 0.224)) + P(0.15 * k, d + 90, 0)), (0, 0, d + 90), "grey")

# --- RADVS doppler/altimeter antennas (flat boxes hung under two frame sides) ---
for d in SIDES[:2]:
    q = P(RB / 2 - 0.02, d, ZB - 0.08)
    box((0.46, 0.30, 0.08), tuple(q), (0, -12, d), "silver")
    strut(tuple(q + Vector((0, 0, 0.04))), tuple(P(RB / 2, d, ZB)), 0.015, "alu", 6)
# --- gold-blanketed electronics boxes on the mid ring (signal processing, auxiliary battery) ---
for d, sz in ((90, (0.22, 0.18, 0.16)), (200, (0.18, 0.14, 0.14))):
    box(sz, tuple(P(0.18, d, ZM + 0.08)), (0, 0, d), "gold")

# --- TV camera with mirror hood on the third side ---
cam = P(0.50, 270, 0)
box((0.20, 0.20, 0.10), (cam.x, cam.y, ZM + 0.01), m="white")          # mount on the mid ring
strut(P(RM, 210, ZM), (cam.x - 0.08, cam.y, ZM), 0.012, "alu", 6)
strut(P(RM, 330, ZM), (cam.x + 0.08, cam.y, ZM), 0.012, "alu", 6)
cyl(0.075, 0.50, (cam.x, cam.y, ZM + 0.31), m="white", n=16)            # camera body
cyl(0.09, 0.16, (cam.x, cam.y - 0.02, ZM + 0.62), (-30, 0, 0), "white", n=16)   # mirror hood
box((0.11, 0.004, 0.13), (cam.x, cam.y - 0.03, ZM + 0.62), (-45, 0, 0), "silver")

# --- surface sampler: motor box on the frame, lazy-tongs arm, scoop on the ground ---
sb = P(0.45, 255, ZB + 0.05)
box((0.16, 0.12, 0.12), tuple(sb), (0, 0, 255), "white")
tip = P(0.45 + 1.45, 255, 0.07)
dirv = (tip - sb).normalized()
n = dirv.cross(P(1, 255 + 90, 0)).normalized()
N = 6
for side in (-0.035, 0.035):
    off = P(1, 255 + 90, 0) * side
    for phase in (1, -1):
        pts = [sb + (tip - sb) * (i / N) + n * (0.07 * phase * (1 if i % 2 else -1) if 0 < i < N else 0) + off for i in range(N + 1)]
        for a_, b_ in zip(pts, pts[1:]):
            strut(a_, b_, 0.01, "alu", 6)
box((0.12, 0.06, 0.06), tuple(tip + Vector((0, 0, -0.04))), (0, 0, 255), "darkalu")   # scoop on the regolith

# --- omni-directional antennas on booms ---
for base_d, out_d, z in ((330, 305, 1.85), (210, 235, 1.15)):
    b0 = P(RM, base_d, ZM)
    b1 = P(1.35, out_d, z)
    strut(b0, b1, 0.012, "alu", 6)
    cyl(0.045, 0.10, tuple(b1 + Vector((0, 0, 0.05))), m="white", n=10, r2=0.01)
    cyl(0.05, 0.01, tuple(b1), m="white", n=12)

drop_uvs()
finish("surveyor", "Surveyor lander (Surveyor 3/7)",
       "Surveyor after landing (~3 m tall, footpads on a 4.3 m circle): triangular tube space frame, "
       "three white truss legs with shock absorbers, crushable footpads and blocks, vernier engines and "
       "propellant spheres, compartments A/B, TV camera with mirror hood, two omni antennas, surface-"
       "sampler lazy-tongs arm with its scoop on the ground (S3/S7), and the mast carrying the planar "
       "array antenna and the 0.86 m^2 solar panel (material 'cell'). Retro-rocket omitted (jettisoned).")
