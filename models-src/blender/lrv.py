# Apollo Lunar Roving Vehicle (LRV, Apollo 15/16/17)
# Reference: NASA LRV Operations Handbook (LS006-002-2H), NSSDCA "Lunar Roving Vehicle" page,
#   Smithsonian NASM LRV qualification unit photos, Apollo 15 photo AS15-88-11901.
# Key dimensions used (X = forward, Y = left, Z = up, metres):
#   overall length 3.10, wheelbase 2.29, wheel track 1.83 (wheel centres)
#   wheels: 0.818 dia x 0.23 wide, woven zinc-coated piano-wire mesh with titanium chevron treads
#   ground clearance 0.36, chassis frame height ~0.45-0.55, chassis 3 folding sections
#   (forward 0.9 m: batteries/electronics, centre 1.2 m: crew seats/floor, aft 0.9 m: payload pallet)
#   overall height ~1.14 m to console; high-gain dish 0.91 m dia on mast ~1.6 m above ground
#   GCTA TV camera on front mast; low-gain helical antenna ~1.6 m above ground
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

reset()
WB, TR, WR, WW = 2.29, 1.83, 0.409, 0.23
mat("mesh", (0.55, 0.55, 0.52), 0.4, 0.6)      # zinc-coated wire mesh
mat("chevron", (0.72, 0.72, 0.70), 0.6, 0.3)   # titanium chevrons
mat("fender", (0.62, 0.63, 0.62), 0.0, 0.6)    # fibreglass fender
mat("webbing", (0.62, 0.70, 0.76), 0.0, 0.8)   # nylon seat webbing (light blue-grey)
mat("console", (0.12, 0.12, 0.13), 0.0, 0.5)


def wheel(x, y):
    s = 1 if y > 0 else -1
    cyl(WR, WW, (x, y, WR), (90, 0, 0), "mesh", n=32, cap=False)
    # inner bump-stop frame + hub
    torus(WR * 0.7, 0.015, (x, y, WR), (90, 0, 0), "darkalu", n=24, nm=6)
    cyl(0.13, WW * 0.9, (x, y, WR), (90, 0, 0), "alu", n=12)
    cyl(0.17, 0.02, (x, y + s * WW * 0.42, WR), (90, 0, 0), "darkalu", n=12)
    # titanium chevrons: V-shaped tread strips on the tyre surface
    N = 20
    for k in range(N):
        a = 2 * math.pi * k / N
        deg = math.degrees(a)
        cx, cz = x + (WR + 0.008) * math.sin(a), WR + (WR + 0.008) * math.cos(a)
        for side in (-1, 1):
            box((0.025, WW * 0.55, 0.012),
                (cx + 0.02 * math.cos(a), y + side * WW * 0.24, cz - 0.02 * math.sin(a)),
                (0, deg, side * 25), "chevron")


def fender(x, y):
    # partial cylindrical shell over the top of the wheel (~130 deg arc)
    n, R, w = 10, WR + 0.06, WW + 0.08
    verts, faces = [], []
    for i in range(n + 1):
        a = math.radians(-65 + 130 * i / n)
        for yy in (-w / 2, w / 2):
            verts.append((x + R * math.sin(a), y + yy, WR + R * math.cos(a)))
    for i in range(n):
        faces.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
    ob = mesh(verts, faces, "fender", "fender")
    ob.modifiers.new("s", 'SOLIDIFY').thickness = 0.01


for x in (WB / 2, -WB / 2):
    for y in (TR / 2, -TR / 2):
        wheel(x, y)
        fender(x, y)
        # suspension: upper/lower wishbones from chassis to wheel hub, + traction drive box
        s = 1 if y > 0 else -1
        for dz in (-0.05, 0.08):
            strut((x - 0.25 * (1 if x > 0 else -1), s * 0.55, 0.45 + dz), (x, y - s * 0.17, WR + dz), 0.02, "alu")
        box((0.18, 0.1, 0.18), (x, y - s * 0.17, WR), m="darkalu")

# --- chassis: three sections of aluminium tube frame with floor panels ---
CH_W, Z0 = 1.14, 0.48
for x0, x1 in ((0.62, 1.42), (-0.62, 0.62), (-1.42, -0.62)):
    for y in (-CH_W / 2, CH_W / 2):
        strut((x0, y, Z0), (x1, y, Z0), 0.025, "alu")
    for x in (x0 + 0.02, x1 - 0.02):
        strut((x, -CH_W / 2, Z0), (x, CH_W / 2, Z0), 0.02, "alu")
box((1.22, CH_W, 0.02), (0, 0, Z0 - 0.02), m="alu")               # centre floor
box((0.78, CH_W - 0.1, 0.02), (-1.02, 0, Z0 + 0.01), m="alu")       # aft pallet floor
# fold hinges between sections
for x in (0.62, -0.62):
    for y in (-CH_W / 2, CH_W / 2):
        cyl(0.04, 0.08, (x, y, Z0), (90, 0, 0), "darkalu", n=8)

# --- forward section: batteries, signal processing, dust covers, LCRU ---
box((0.55, 0.9, 0.16), (1.1, 0, Z0 + 0.1), m="white")                # battery/electronics boxes
box((0.5, 0.42, 0.03), (1.1, -0.22, Z0 + 0.2), (0, -6, 0), "silver")  # dust-cover radiators
box((0.5, 0.42, 0.03), (1.1, 0.22, Z0 + 0.2), (0, -6, 0), "silver")
box((0.32, 0.45, 0.28), (1.3, 0, Z0 + 0.35), m="white")             # LCRU
box((0.33, 0.46, 0.02), (1.3, 0, Z0 + 0.5), m="silver")
# high-gain umbrella dish on mast (left side)
strut((1.3, -0.18, Z0 + 0.5), (1.3, -0.30, 1.4), 0.015, "alu")
dish(0.455, 0.12, (1.3, -0.30, 1.41), (0, -55, 0), "silver", n=16, rings=3)
strut((1.3, -0.30, 1.41), (1.5, -0.30, 1.57), 0.006, "alu")           # feed
# low-gain helical antenna (right side)
strut((1.35, 0.18, Z0 + 0.5), (1.35, 0.25, 1.2), 0.012, "alu")
cyl(0.03, 0.55, (1.35, 0.25, 1.45), m="white", n=8)
# TV camera (GCTA) on front mast
strut((1.4, 0.0, Z0 + 0.2), (1.45, 0.0, 1.0), 0.02, "alu")
box((0.3, 0.16, 0.2), (1.45, 0, 1.08), m="white")
cyl(0.045, 0.12, (1.62, 0, 1.08), (0, 90, 0), "black", n=10)
box((0.3, 0.18, 0.01), (1.45, 0, 1.19), m="silver")

# --- crew station: console + T-handle hand controller ---
strut((0.62, 0, Z0), (0.55, 0, 0.95), 0.025, "alu")
box((0.12, 0.42, 0.3), (0.55, 0, 1.0), (0, -25, 0), "console")
box((0.02, 0.34, 0.22), (0.49, 0, 1.0), (0, -25, 0), "grey")
box((0.06, 0.1, 0.25), (0.18, 0, 0.65), m="console")                 # armrest pedestal
strut((0.18, 0, 0.75), (0.2, 0, 0.88), 0.01, "alu")
strut((0.2, -0.05, 0.88), (0.2, 0.05, 0.88), 0.012, "black")           # T-handle

# --- two seats: tube frames + webbing, footrests ---
for y in (-0.3, 0.3):
    # seat pan
    box((0.42, 0.44, 0.02), (-0.1, y, 0.62), m="webbing")
    # back rest (leaning back ~15 deg)
    box((0.02, 0.44, 0.45), (-0.36, y, 0.86), (0, -15, 0), "webbing")
    for yy in (y - 0.22, y + 0.22):
        strut((0.11, yy, Z0), (0.11, yy, 0.62), 0.012, "alu")
        strut((-0.31, yy, Z0), (-0.31, yy, 0.62), 0.012, "alu")
        strut((0.11, yy, 0.62), (-0.31, yy, 0.62), 0.012, "alu")
        strut((-0.31, yy, 0.62), (-0.42, yy, 1.07), 0.012, "alu")
    strut((-0.42, y - 0.22, 1.07), (-0.42, y + 0.22, 1.07), 0.012, "alu")
    # footrest
    strut((0.42, y - 0.15, Z0 + 0.02), (0.42, y + 0.15, Z0 + 0.02), 0.012, "alu")
    # seat belts (orange-ish webbing straps) - simplified as one strap
    box((0.02, 0.05, 0.3), (0.0, y + 0.18, 0.72), (0, 20, 0), "grey")

# --- aft payload: tool carrier / sample pallet ---
box((0.45, 0.6, 0.22), (-1.1, 0, Z0 + 0.13), m="grey")
box((0.47, 0.62, 0.02), (-1.1, 0, Z0 + 0.25), m="alu")
for y in (-0.22, 0.22):
    cyl(0.02, 0.7, (-1.33, y, Z0 + 0.4), m="alu", n=6)   # tongs / scoop handles

finish("lrv", "Apollo Lunar Roving Vehicle",
       "LRV as parked on the Moon (Apollo 15-17): 4 wire-mesh wheels with titanium chevrons, fenders, "
       "3-section chassis, 2 webbing seats, T-handle, high-gain umbrella dish, low-gain helix and TV camera. "
       "Wire mesh is a solid tyre colour; no astronaut gear or sample bags.")
