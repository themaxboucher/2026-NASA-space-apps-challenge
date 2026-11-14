# Apollo Lunar Surface Experiments Package (ALSEP) - Central Station + SNAP-27 RTG
# References (NASA, public domain): AS16-113-18346/18359 "ALSEP Apollo 16 Central Station",
#   AS14-67-9361 / "ALSEP Apollo 14 RTG" (RTG on its pallet with the central station behind),
#   AS14-68-9405, Apollo 17 Preliminary Science Report fig. 2-3 (station layout);
#   Wikipedia "Apollo Lunar Surface Experiments Package" and "SNAP-27" (dimension figures).
# Dimensions used (metres):
#   central station  ~0.50 x 0.42 electronics box (stowed volume 34,800 cm^3, 25 kg), sunshield
#                    raised on 4 posts to ~0.62 m, aluminised/gold Mylar curtains on 3 sides,
#                    front open over the white thermal plate with the astronaut switches
#   antenna          modified axial helix, 0.58 m long x 0.038 m dia, white radome tube,
#                    on a perforated aiming head atop a ~1 m mast clamped to the station
#   SNAP-27 RTG      0.46 m tall, 0.406 m across its 8 radial fins, grey; on the flat
#                    subpackage-2 pallet (~0.66 x 0.48) about 2.6 m away
#   power cable      flat orange-brown ribbon lying on the ground between them
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from mathutils import Vector

reset()
CABLE = mat("cable", (0.62, 0.30, 0.12), 0.3, 0.5)      # Kapton-insulated flat cable
W, D = 0.50, 0.42
ZE, ZS = 0.28, 0.62          # electronics top, sunshield underside

# --- central station: electronics box on low feet ---
for x in (-0.22, 0.22):
    for y in (-0.18, 0.18):
        box((0.05, 0.05, 0.03), (x, y, 0.015), m="darkalu")
box((W, D, ZE - 0.03), (0, 0, 0.03 + (ZE - 0.03) / 2), m="alu")
for x in (-W / 2, W / 2):                                       # frame rails on the box corners
    for y in (-D / 2, D / 2):
        box((0.02, 0.02, ZS - 0.02), (x, y, 0.02 + (ZS - 0.02) / 2), m="white")
box((W - 0.03, D - 0.03, 0.01), (0, 0, ZE + 0.005), m="white")      # thermal plate
for i, (x, y) in enumerate([(-0.15, -0.12), (-0.05, -0.12), (0.05, -0.12), (0.15, -0.12), (-0.1, 0.0), (0.1, 0.0)]):
    box((0.06, 0.06, 0.04 + 0.02 * (i % 2)), (x, y, ZE + 0.03), m="white")   # switch guards / connectors
for x in (-0.18, 0.18):
    cyl(0.025, 0.03, (x, 0.12, ZE + 0.025), m="gold", n=10)            # thermal-plate mirrors/heaters

# sunshield + aluminised/gold curtains (left, right, back); front left open
box((W + 0.04, D + 0.04, 0.02), (0, 0, ZS + 0.01), m="silver")
box((W + 0.04, 0.008, ZS - ZE), (0, D / 2 + 0.005, (ZS + ZE) / 2), m="silver")
for s in (-1, 1):
    box((0.008, D, ZS - ZE + 0.02), (s * (W / 2 + 0.005), 0, (ZS + ZE) / 2), m="gold")
    # crinkled curtain folds
    for k in range(3):
        box((0.012, 0.03, ZS - ZE - 0.02), (s * (W / 2 + 0.01), -0.12 + 0.12 * k, (ZS + ZE) / 2), (0, 0, 20 * (k - 1)), "gold")
# items on top of the sunshield: dust detector + level/sun compass
box((0.10, 0.08, 0.06), (0.15, -0.10, ZS + 0.05), m="white")
box((0.06, 0.004, 0.05), (0.15, -0.141, ZS + 0.05), m="cell")       # dust-detector cells
cyl(0.04, 0.012, (-0.12, -0.12, ZS + 0.026), m="white", n=16)
strut((-0.12, -0.12, ZS + 0.03), (-0.12, -0.12, ZS + 0.09), 0.004, "darkalu", 6)  # gnomon

# --- antenna mast clamped to the station's left side, aiming head, helical antenna tube ---
MX, MY = -W / 2 - 0.035, 0.10
strut((MX, MY, 0.0), (MX, MY, 1.02), 0.016, "alu", 8)
for z in (0.12, 0.45):                                              # clamps to the station frame
    box((0.06, 0.04, 0.03), (MX + 0.025, MY, z), m="darkalu")
box((0.07, 0.05, 0.09), (MX, MY, 0.96), m="alu")                    # aiming mechanism
cyl(0.045, 0.07, (MX, MY, 1.04), m="white", n=12)                   # perforated head
for k in range(6):
    a = 2 * math.pi * k / 6
    cyl(0.009, 0.004, (MX + 0.046 * math.cos(a), MY + 0.046 * math.sin(a), 1.04),
        (90, 0, math.degrees(a) + 90), "darkalu", n=6)
d = Vector((0.22, -0.12, 0.97)).normalized()
b = Vector((MX, MY, 1.07))
strut(b, b + d * 0.58, 0.019, "white", 12)                          # 0.58 m x 3.8 cm radome
cyl(0.022, 0.012, tuple(b + d * 0.58), (0, math.degrees(math.atan2(0.22, 0.97)), 0), "white", n=12)

# --- SNAP-27 RTG on the subpackage-2 pallet ---
RX = -2.6
box((0.66, 0.48, 0.03), (RX, 0, 0.015), m="alu")                   # pallet
for y in (-0.2, 0.2):
    box((0.66, 0.03, 0.03), (RX, y, 0.04), m="alu")
box((0.26, 0.26, 0.04), (RX - 0.12, 0, 0.05), m="darkalu")          # RTG mounting bracket
GX = RX - 0.12
cyl(0.085, 0.42, (GX, 0, 0.07 + 0.21), m="darkalu", n=16)           # thermoelectric drum
for k in range(8):                                                  # 8 radial fins, 0.406 m across
    a = math.radians(45 * k + 22.5)
    box((0.12, 0.006, 0.40), (GX + 0.141 * math.cos(a), 0.141 * math.sin(a), 0.07 + 0.21),
        (0, 0, math.degrees(a)), "grey")
cyl(0.10, 0.02, (GX, 0, 0.50), m="darkalu", n=16)                   # top flange
torus(0.06, 0.008, (GX, 0, 0.515), m="alu", n=16, nm=6)             # fuel-capsule port ring
cyl(0.05, 0.012, (GX, 0, 0.513), m="black", n=16)
box((0.06, 0.06, 0.05), (GX + 0.13, -0.15, 0.06), m="darkalu")      # cable connector box

# --- flat power cable on the ground ---
pts = [(GX + 0.16, -0.15), (RX + 0.45, -0.2), (RX + 1.0, -0.05), (RX + 1.6, 0.12), (-0.8, 0.0), (-0.45, -0.1), (-W / 2, -0.1)]
for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
    L = math.hypot(x2 - x1, y2 - y1) + 0.04
    box((L, 0.04, 0.004), ((x1 + x2) / 2, (y1 + y2) / 2, 0.002), (0, 0, math.degrees(math.atan2(y2 - y1, x2 - x1))), CABLE)

drop_uvs()
finish("alsep", "Apollo ALSEP Central Station + RTG",
       "ALSEP central station (electronics box, raised sunshield with gold/aluminised curtains, "
       "switch-covered thermal plate, 0.58 m helical antenna on its aiming mast) and the SNAP-27 RTG "
       "(0.46 m, 8 fins) on its pallet ~2.6 m away, joined by the flat power cable. Experiments not included.",
       elev=24, azim=30)
