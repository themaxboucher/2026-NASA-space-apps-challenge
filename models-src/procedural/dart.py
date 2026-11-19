# DART (Double Asteroid Redirection Test) as it flew into the asteroid moon Dimorphos on 26 September 2022.
# References:
#   Johns Hopkins APL, "Impactor Spacecraft": https://dart.jhuapl.edu/Mission/Impactor-Spacecraft.php
#     (the main box is about 1.2 x 1.3 x 1.3 m; with everything that sticks out it is about 1.8 m wide, 1.9 m long
#     and 2.6 m tall; two Roll-Out Solar Arrays, each 8.5 m long when unrolled; about 610 kg at launch and 580 kg at
#     impact; DRACO is its one instrument, with a 208 mm telescope; NEXT-C ion engine; the flat Radial Line Slot
#     Array high-gain antenna; LICIACube rode in a spring-loaded box and left 15 days before impact).
#   NASA: https://science.nasa.gov/mission/dart/ ; NASA NSSDCA DART (2021-110A).
#   Array width (about 2.3 m) from press descriptions of the 8.6 x 2.3 m arrays; the 19 m span follows from two
#     8.5 m arrays plus the box.
# Layout (metres, Z up; DRACO looks DOWN, the way it flew into the asteroid, with the ion engine on top behind it):
#   gold-blanketed box; on its two X sides the roll-out arrays (root tube, two springy booms, the cell blanket in
#   modules, and the roller at the tip); the flat round high-gain antenna on the +Y face; LICIACube's empty
#   dispenser on the -Y face; the NEXT-C engine on its gimbal ring on top; and underneath, inside the launch ring,
#   DRACO's telescope tube with its door swung open, plus the star tracker and four clusters of small thrusters.
# Uncertain: which faces the antenna, dispenser and star tracker sit on is taken from APL illustrations, not drawings.
# Layout checked against NASA's picture on the NSSDCA DART page (planetary/thumbnail/dart_sm.jpg): a gold-foil box
#   with two long roll-out solar wings on opposite sides.
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import *

reset()
BX, BY, BZ = 1.2, 1.3, 1.3  # the box
Z0 = 0.62  # bottom of the box (the telescope and launch ring hang below it)
ZC = Z0 + BZ / 2
Z1 = Z0 + BZ
AW = 2.3  # array width (along Z)
AL = 8.5  # array length (along X)
X_ROOT = BX / 2 + 0.3  # where each blanket starts

# --- the box ("bus"): everything bolts to it ---
part("bus")
box((BX, BY, BZ), (0, 0, ZC), m="gold")
for sx in (1, -1):  # white radiator panels on the array sides
    box((0.012, 0.9, 0.7), (sx * (BX / 2 + 0.006), 0.0, ZC + 0.1), m="white")
box((0.7, 0.012, 0.5), (-0.15, -(BY / 2 + 0.006), ZC + 0.3), m="white")  # radiator beside the dispenser
for sx in (1, -1):  # corner posts
    for sy in (1, -1):
        box((0.05, 0.05, BZ + 0.02), (sx * (BX / 2 - 0.01), sy * (BY / 2 - 0.01), ZC), m="alu")
box((BX + 0.02, BY + 0.02, 0.03), (0, 0, Z1), m="alu")  # top deck
box((BX + 0.02, BY + 0.02, 0.03), (0, 0, Z0), m="alu")  # bottom deck
box((0.24, 0.2, 0.012), (0.3, 0.35, Z1 + 0.022), m="foil_black")  # blanket patches on the top deck
box((0.3, 0.26, 0.012), (-0.32, -0.3, Z1 + 0.022), m="foil_silver")
for sy in (1, -1):  # low-gain antennas (small cups) on the top and bottom decks
    cyl(0.045, 0.07, (0.42 * sy, -0.45 * sy, Z1 + 0.05 if sy > 0 else Z0 - 0.05), (0, 0, 0), "white", n=12)

# --- Roll-Out Solar Arrays: two blankets of cells, each unrolled 8.5 m like a party blower ---
part("solar_arrays")
mat("kapton", (0.70, 0.45, 0.16), 0.3, 0.5)  # the amber plastic sheet the cells are glued to (seen from behind)
NSEG = 10
seg = (AL - 0.5) / NSEG
for sx in (1, -1):
    for i in range(NSEG):
        xc = sx * (X_ROOT + 0.25 + seg * (i + 0.5))
        # Cells face +Y (the same side as the antenna); the blanket's back is bare amber Kapton.
        plate(seg - 0.03, AW - 0.16, 0.008, (xc, 0, ZC), (-90, 0, 0), "cell", "darkalu", 0.012, back="kapton")
        for dz in (-0.52, 0.0, 0.52):  # joins between strings of cells
            box((seg - 0.06, 0.003, 0.008), (xc, 0.0055, ZC + dz), m="darkalu")

# --- the arrays' frame: root tube, two rolled-carbon booms each, and the roller at the tip ---
part("array_booms")
for sx in (1, -1):
    xr = sx * X_ROOT
    xt = sx * (X_ROOT + AL)
    strut((xr, 0, ZC - AW / 2), (xr, 0, ZC + AW / 2), 0.07, "gold", 14)  # root tube (the blanket was rolled up here for launch)
    for sz in (1, -1):
        strut((xr, 0, ZC + sz * (AW / 2 - 0.04)), (xt, 0, ZC + sz * (AW / 2 - 0.04)), 0.035, "foil_black", 10)  # boom
        cyl(0.085, 0.05, (xr, 0, ZC + sz * (AW / 2 + 0.01)), m="alu", n=14)  # root tube end caps
        cyl(0.075, 0.04, (xt, 0, ZC + sz * (AW / 2 + 0.01)), m="alu", n=14)
    strut((xt, 0, ZC - AW / 2), (xt, 0, ZC + AW / 2), 0.06, "alu", 14)  # tip roller
    for dz in (-0.45, 0.45):  # brackets holding the root tube to the box
        beam((sx * BX / 2, 0, ZC + dz), (xr, 0, ZC + dz), 0.08, 0.1, "alu")
        beam((sx * BX / 2, 0.3, ZC + dz * 0.5), (xr, 0, ZC + dz), 0.04, 0.04, "alu")
    box((0.24, 0.006, AW - 0.2), (sx * (X_ROOT + 0.13), 0, ZC), m="kapton")  # wiring sheet between root tube and first cells

# --- DRACO: the one instrument, a telescope camera that also steered the spacecraft to its target ---
part("draco_telescope")
DX, DY = 0.12, 0.05
revolve([(0.15, Z0 - 0.42), (0.15, Z0 + 0.0)], (DX, DY, 0), m="foil_black", n=28)  # baffle tube sticking out below the deck
revolve([(0.125, Z0 - 0.0), (0.125, Z0 - 0.42)], (DX, DY, 0), m="black", n=28)  # inside of the tube
revolve([(0.125, Z0 - 0.42), (0.15, Z0 - 0.42)], (DX, DY, 0), m="alu", n=28)  # rim
cyl(0.104, 0.01, (DX, DY, Z0 - 0.12), m="glass", n=24)  # 208 mm main mirror, deep inside
cyl(0.03, 0.03, (DX, DY, Z0 - 0.34), m="darkalu", n=12)  # small second mirror
for k in range(4):  # the four thin arms holding it
    a = math.radians(45 + 90 * k)
    beam((DX, DY, Z0 - 0.34), (DX + 0.124 * math.cos(a), DY + 0.124 * math.sin(a), Z0 - 0.34), 0.004, 0.02, "darkalu")
# The door, swung open on its hinge after launch.
cyl(0.155, 0.015, (DX + 0.33, DY, Z0 - 0.3), (0, 78, 0), "foil_silver", n=24)
box((0.05, 0.06, 0.05), (DX + 0.18, DY, Z0 - 0.4), m="alu")
box((0.3, 0.22, 0.2), (DX - 0.05, DY, Z0 + 0.11), m="foil_black")  # camera electronics above (inside the box)

# --- launch ring: where the rocket held on ---
part("launch_ring")
revolve([(0.47, Z0 - 0.02), (0.5, Z0 - 0.02), (0.5, Z0 - 0.14), (0.47, Z0 - 0.14)][::-1], m="alu", n=48)
revolve([(0.47, Z0 - 0.02), (0.47, Z0 - 0.14)], m="darkalu", n=48)
revolve([(0.47, Z0 - 0.14), (0.52, Z0 - 0.14), (0.52, Z0 - 0.16), (0.47, Z0 - 0.16)][::-1], m="alu", n=48)

# --- NEXT-C ion engine on its gimbal ring, on top (it pushed with a faint blue beam of xenon) ---
part("ion_engine")
ZE = Z1 + 0.02
torus(0.36, 0.022, (0, 0, ZE + 0.12), m="alu", n=36, nm=8)  # gimbal ring
for x, y, z, a in ring_of(3, 0.36, ZE + 0.12, 30):  # three legs and actuators
    strut((x * 1.25, y * 1.25, ZE), (x, y, z), 0.02, "alu", 8)
    strut((x * 0.75, y * 0.75, ZE), (x, y, z), 0.014, "darkalu", 6)
revolve([(0.0, ZE + 0.06), (0.22, ZE + 0.06), (0.29, ZE + 0.14), (0.29, ZE + 0.42)], m="darkalu", n=36)  # thruster body
revolve([(0.29, ZE + 0.42), (0.245, ZE + 0.55), (0.2, ZE + 0.55)], m="alu", n=36)  # front mask (plasma screen)
cyl(0.2, 0.012, (0, 0, ZE + 0.535), m="grey", n=36)  # the domed grids the xenon beam shoots through (36 cm)
revolve([(0.0, ZE + 0.552), (0.1, ZE + 0.549), (0.2, ZE + 0.541)][::-1], m="grey", n=36)
for z in (ZE + 0.2, ZE + 0.34):
    torus(0.292, 0.008, (0, 0, z), m="alu", n=36, nm=4)
box((0.05, 0.05, 0.16), (0.3, 0.12, ZE + 0.5), (0, 0, 22), "alu")  # neutraliser (stops the spacecraft charging up)
cyl(0.018, 0.07, (0.275, 0.11, ZE + 0.6), (0, -25, 22), "darkalu", n=8)
tube([(-0.3, 0.2, ZE), (-0.3, 0.16, ZE + 0.18), (-0.26, 0.1, ZE + 0.2)], 0.012, "alu", 6)  # xenon feed line
box((0.34, 0.26, 0.14), (-0.33, 0.38, ZE + 0.07), m="foil_black")  # its power unit's cover

# --- high-gain antenna: a flat disc of spiral slots instead of a dish ---
part("high_gain_antenna")
YA = BY / 2
cyl(0.5, 0.035, (0, YA + 0.075, ZC), (-90, 0, 0), "white", n=48)
mat("copper", double=False)
for r in (0.14, 0.26, 0.38, 0.47):  # rings hinting at the spiral of slots
    torus(r, 0.006, (0, YA + 0.094, ZC), (-90, 0, 0), "copper", n=48, nm=4)
cyl(0.05, 0.02, (0, YA + 0.1, ZC), (-90, 0, 0), "alu", n=16)  # feed in the middle
for x, z in ((-0.3, -0.3), (0.3, -0.3), (-0.3, 0.3), (0.3, 0.3)):  # stand-offs
    cyl(0.025, 0.06, (x, YA + 0.03, ZC + z), (-90, 0, 0), "alu", n=8)

# --- LICIACube's dispenser: the Italian cubesat sprang out of this box 15 days before impact ---
part("liciacube_dispenser")
YD = -BY / 2
box((0.28, 0.2, 0.42), (0.32, YD - 0.1, ZC - 0.25), m="alu")
box((0.24, 0.02, 0.38), (0.32, YD - 0.2, ZC - 0.25), m="black")  # the empty inside, seen through the open end
box((0.28, 0.012, 0.42), (0.32 + 0.21, YD - 0.31, ZC - 0.25), (0, 0, 62), "alu")  # its door, sprung open
for dz in (-0.42, -0.08):
    box((0.3, 0.2, 0.02), (0.32, YD - 0.1, ZC + dz), m="darkalu")

# --- star tracker and sun sensors: how it knew which way it was pointing ---
part("star_tracker")
box((0.12, 0.1, 0.1), (-0.35, YD - 0.05, ZC + 0.4 - 0.3), m="black")
strut((-0.35, YD - 0.08, ZC + 0.1), (-0.35, YD - 0.26, ZC + 0.2), 0.045, "foil_black", 14, r2=0.07)  # baffle, looking out and a little up
for sx in (1, -1):  # sun sensors on two corners
    box((0.05, 0.05, 0.03), (sx * (BX / 2 - 0.1), YA - 0.1, Z1 + 0.03), m="black")

# --- twelve small hydrazine thrusters in four clusters, for turning and the final steering ---
part("thrusters")
for sx in (1, -1):
    for sy in (1, -1):
        cx, cy = sx * (BX / 2 + 0.02), sy * (BY / 2 + 0.02)
        zt = Z1 - 0.1 if sx * sy > 0 else Z0 + 0.1
        box((0.1, 0.1, 0.1), (cx, cy, zt), m="gold")
        up = 1 if sx * sy > 0 else -1
        cyl(0.02, 0.06, (cx, cy, zt + up * 0.08), (0 if up > 0 else 180, 0, 0), "darkalu", n=8, r2=0.008)  # along the flight line
        cyl(0.02, 0.06, (cx + sx * 0.08, cy, zt), (0, 90 * sx, 0), "darkalu", n=8, r2=0.008)  # sideways
        cyl(0.02, 0.06, (cx, cy + sy * 0.08, zt), (-90 * sy, 0, 0), "darkalu", n=8, r2=0.008)  # sideways, the other way

finish(
    "dart",
    "DART (Double Asteroid Redirection Test) spacecraft",
    "DART as it hit Dimorphos in 2022: a 1.2 x 1.3 x 1.3 m gold-blanketed box, about 2.6 m tall with its engine and "
    "telescope, and about 19 m across its two Roll-Out Solar Arrays (each 8.5 m long, about 2.3 m wide: root tube, "
    "two booms, cell blanket, tip roller). DRACO's telescope tube with its door open looks down inside the launch "
    "ring; the NEXT-C ion engine sits on its gimbal ring on top; the flat round high-gain antenna is on one side and "
    "LICIACube's empty dispenser on the other, with the star tracker and four thruster clusters. Which face each of "
    "those sits on follows APL's illustrations and is approximate.",
    covers=["DART"],
)
