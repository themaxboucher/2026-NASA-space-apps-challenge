# Phoenix Mars Lander (landed 25 May 2008, Vastitas Borealis; fell silent Nov 2008)
# References (NASA/JPL/UA/Lockheed Martin, public domain):
#   Phoenix Landing press kit (NASA, May 2008): 5.52 m wide with both solar arrays deployed, science deck
#     ~1.5 m across, robotic arm 2.35 m long, MET mast top ~2.2 m above the ground
#   NSSDCA 2007-034A
#   PIA09344 "Phoenix Lander on Mars (Artist's Concept)", PIA07247 (arm digging in front) -
#     decagonal UltraFlex arrays with black cells and gold ribs, white deck with an orange-brown edge,
#     gold propellant tanks under the deck, 3 legs with bellows shock struts + dark braces, round footpads,
#     SSI stereo camera on a twin-rod mast, MET mast with telltale, TEGA / MECA boxes on the deck
# Axes: arrays along X, robotic arm reaching out along -Y. The solar cells use the material named
#   exactly "cell" (the atlas makes it glow red as the part that failed).
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from shapes import tube, cells
from mathutils import Vector

reset()
mat("cell", (0.03, 0.035, 0.07), 0.3, 0.25)           # solar cells - name must stay "cell"
mat("deckedge", (0.62, 0.36, 0.18), 0.2, 0.6)         # orange-brown deck edge
mat("navy", (0.08, 0.1, 0.18), 0.3, 0.5)              # leg braces
mat("tank", (0.72, 0.45, 0.2), 0.6, 0.3)              # copper/gold-wrapped propellant tanks

ZD = 0.98                                             # deck top
RD = 0.78                                             # deck radius (decagon vertex)
cyl(RD, 0.10, (0, 0, ZD - 0.05), (0, 0, 18), "deckedge", n=10)
cyl(RD - 0.015, 0.012, (0, 0, ZD + 0.004), (0, 0, 18), "white", n=10)
# body under the deck: equipment box, two propellant tanks, descent thrusters
cyl(0.5, 0.3, (0, 0, ZD - 0.25), m="darkalu", n=20)
for x in (-0.27, 0.27):
    sphere(0.28, (x, 0.05, 0.66), "tank", seg=20, ring=12)
for k in range(6):
    a = math.radians(60 * k + 30)
    p = Vector((0.55 * math.cos(a), 0.55 * math.sin(a), ZD - 0.14))
    box((0.12, 0.1, 0.09), tuple(p), (0, 0, 60 * k + 30), "white")
    cyl(0.035, 0.08, tuple(p - Vector((0, 0, 0.08))), m="darkalu", n=10, r2=0.02)

# legs: bellows shock strut + two braces to a round footpad
for k in range(3):
    a = math.radians(90 + 120 * k)
    d = Vector((math.cos(a), math.sin(a), 0))
    foot = d * 1.02 + Vector((0, 0, 0.05))
    cyl(0.15, 0.03, tuple(d * 1.02 + Vector((0, 0, 0.015))), m="darkalu", n=16)
    cyl(0.1, 0.04, tuple(d * 1.02 + Vector((0, 0, 0.05))), m="darkalu", n=16, r2=0.06)
    top = d * 0.6 + Vector((0, 0, ZD - 0.1))
    strut(tuple(foot + Vector((0, 0, 0.02))), tuple(top), 0.035, "white", n=10)
    for t in [0.25 + 0.06 * j for j in range(7)]:
        p = (foot + Vector((0, 0, 0.02))).lerp(top, t)
        dd = (top - foot).normalized()
        q = Vector((0, 0, 1)).rotation_difference(dd)
        ob = torus(0.04, 0.012, tuple(p), m="black", n=12, nm=4)
        ob.rotation_mode = 'QUATERNION'; ob.rotation_quaternion = q
    for s in (-1, 1):
        b = Vector((math.cos(a + s * 0.7), math.sin(a + s * 0.7), 0)) * 0.42 + Vector((0, 0, ZD - 0.36))
        strut(tuple(foot + Vector((0, 0, 0.03))), tuple(b), 0.018, "navy", n=8)

# decagonal UltraFlex solar arrays
RA = 0.98
for s in (-1, 1):
    c = Vector((s * (RD + 0.04 + RA), 0, ZD - 0.02))
    verts = [c + Vector((RA * math.cos(math.radians(36 * j)), RA * math.sin(math.radians(36 * j)), 0)) for j in range(10)]
    cyl(RA, 0.02, tuple(c), m="darkalu", n=10)                                   # substrate
    tube([tuple(v + Vector((0, 0, 0.01))) for v in verts + [verts[0]]], 0.012, "gold", n=6)   # rim
    for j in range(10):
        tube([tuple(c + Vector((0, 0, 0.012))), tuple(verts[j] + Vector((0, 0, 0.012)))], 0.008, "gold", n=4)  # ribs
        v0, v1 = verts[j] - c, verts[(j + 1) % 10] - c
        u = v0.normalized(); w = (v1 - u * v1.dot(u)).normalized()
        poly = [(0.05, 0.0), (v0.dot(u), 0.0), (v1.dot(u), v1.dot(w))]
        # inset the gore a little from its ribs
        cen = Vector(((poly[0][0] + poly[1][0] + poly[2][0]) / 3, (poly[2][1]) / 3))
        poly = [tuple(cen + (Vector(p) - cen) * 0.93) for p in poly]
        cells(poly, c + Vector((0, 0, 0.01)), u, w, 0.055, 0.006, "cell", lift=0.002)
    cyl(0.09, 0.05, tuple(c + Vector((0, 0, 0.02))), m="gold", n=12)                  # hub
    box((0.12, 0.16, 0.05), (s * (RD + 0.03), 0, ZD - 0.02), m="darkalu")             # hinge

# science deck instruments
box((0.32, 0.26, 0.26), (-0.15, 0.25, ZD + 0.13), m="white")                         # TEGA
for i in range(4):
    for j in range(2):
        box((0.06, 0.08, 0.012), (-0.27 + i * 0.08, 0.2 + j * 0.1, ZD + 0.265), m="darkalu")
box((0.34, 0.26, 0.18), (0.3, 0.3, ZD + 0.09), m="darkalu")                          # MECA
for i in range(6):
    box((0.3, 0.012, 0.012), (0.3, 0.19 + i * 0.044, ZD + 0.185), m="alu")
box((0.18, 0.18, 0.1), (0.35, -0.25, ZD + 0.05), m="grey")                           # LIDAR
cyl(0.035, 0.06, (0.35, -0.25, ZD + 0.13), m="black", n=10)
box((0.4, 0.3, 0.03), (-0.3, -0.25, ZD + 0.015), m="gold")                           # MLI blankets
box((0.22, 0.3, 0.04), (0.05, 0.42, ZD + 0.02), m="gold")
for p in ((0.62, 0.05), (-0.62, -0.05)):                                              # UHF helix antennas
    cyl(0.03, 0.22, (p[0], p[1], ZD + 0.11), m="deckedge", n=8)
    for t in range(5):
        torus(0.035, 0.006, (p[0], p[1], ZD + 0.03 + t * 0.045), m="gold", n=10, nm=4)

# SSI stereo camera on its twin-rod mast (camera ~2.0 m above the ground)
SX, SY = -0.42, -0.3
for dy in (-0.035, 0.035):
    strut((SX, SY + dy, ZD), (SX, SY + dy, 1.92), 0.011, "white", n=6)
for z in (1.2, 1.45, 1.7):
    strut((SX, SY - 0.035, z), (SX, SY + 0.035, z), 0.007, "white", n=4)
box((0.1, 0.12, 0.05), (SX, SY, 1.935), m="darkalu")
box((0.12, 0.28, 0.11), (SX, SY, 2.015), m="white")
for dy in (-0.08, 0.08):
    cyl(0.025, 0.04, (SX + 0.07, SY + dy, 2.015), (0, 90, 0), "black", n=12)

# MET mast with telltale at the top
MX, MY = 0.55, -0.45
cyl(0.03, 0.05, (MX, MY, ZD + 0.025), m="darkalu", n=8)
strut((MX, MY, ZD), (MX, MY, 2.12), 0.01, "alu", n=6)
for z in (1.25, 1.5, 1.8):
    strut((MX, MY, z), (MX + 0.12, MY, z), 0.004, "alu", n=4)
    cyl(0.008, 0.04, (MX + 0.12, MY, z), m="white", n=6)
strut((MX, MY, 2.12), (MX, MY, 2.19), 0.0015, "silver", n=4)
cyl(0.007, 0.03, (MX, MY, 2.185), m="silver", n=8)

# robotic arm: shoulder at the deck edge, upper arm 0.93 m, forearm 1.04 m, scoop on the ground
sh = Vector((0.15, -0.66, ZD + 0.08)); el = Vector((0.15, -1.6, 1.2)); wr = Vector((0.15, -2.04, 0.26))
box((0.16, 0.16, 0.16), tuple(sh), m="white")
cyl(0.06, 0.08, tuple(sh - Vector((0, 0, 0.1))), m="darkalu", n=12)
strut(tuple(sh), tuple(el), 0.045, "gold", n=12)
cyl(0.065, 0.13, tuple(el), (0, 90, 0), "white", n=14)
strut(tuple(el), tuple(wr), 0.04, "gold", n=12)
cyl(0.05, 0.1, tuple(wr), (0, 90, 0), "white", n=12)
box((0.08, 0.09, 0.08), tuple(wr + Vector((0.08, 0, 0.03))), m="white")              # robotic arm camera
sc = wr + Vector((0, -0.07, -0.20))                                                    # scoop
strut(tuple(wr), tuple(sc - Vector((0, 0, 0.024))), 0.025, "alu", n=8)
box((0.14, 0.2, 0.012), tuple(sc + Vector((0, 0, -0.03))), (12, 0, 0), "alu")
for dx in (-0.065, 0.065):
    box((0.012, 0.2, 0.07), tuple(sc + Vector((dx, 0, 0.0))), (12, 0, 0), "alu")

finish("phoenix", "Phoenix Mars Lander",
       "Phoenix on the Martian arctic plain at true size (5.5 m across its two decagonal UltraFlex solar "
       "arrays): 1.5 m science deck on three legs with bellows shock struts and round footpads, gold "
       "propellant tanks, 2.35 m robotic arm with scoop in the soil, SSI stereo camera on its mast (~2 m up), "
       "MET mast with telltale, TEGA ovens, MECA, LIDAR and UHF helix antennas. Solar cells are the 'cell' "
       "material.", elev=28)
