# Mars Climate Orbiter, as it flew to Mars with its solar wing and dish unfolded (lost on 23 September 1999).
# References (NASA, public domain):
#   NASA NSSDCA, Mars Climate Orbiter (1998-073A), https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1998-073A :
#     box-shaped bus about 2.1 m high, 1.6 m wide and 2 m deep, made of an equipment module and a propulsion module;
#     a solar array on one side, 5.5 m tip to tip; a 1.3 m high-gain dish on a mast on the propulsion module; the two
#     instruments (PMIRR and MARCI), the UHF antenna and the battery on the equipment module; a 640 N main engine;
#     629 kg at launch.
#   JPL press kit "Mars Climate Orbiter Arrival", https://www.jpl.nasa.gov/news/press_kits/mcoarrivehq.pdf :
#     three-panel gallium-arsenide solar wing; main engine burns hydrazine with nitrogen tetroxide; eight small
#     thrusters (four for steering the path, four for turning).
#   NASA/JPL artist's views and clean-room photos of the spacecraft (overall layout and colours).
# Layout (metres, Z up): equipment module below (z 0 to 0.9, gold blankets) with the instruments on its Mars-facing
#   underside and sides; propulsion module above (z 0.9 to 2.1, dark blankets) with the main engine and the dish mast
#   on top; the single solar wing out along +X on a two-axis joint.
# Simplified and uncertain: instrument shapes are approximate; where exactly each instrument sat on the equipment
#   module, and the wing's width (drawn 1.85 m; sources give its area as 7.4 to 11 square metres), are best estimates.
# Layout checked against NASA's pictures on the NSSDCA page (thumbnail/spacecraft/mars98orb.gif, mco-text.gif):
#   a foil-wrapped box, one three-panel solar wing on one side, the dish on top.
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import *

reset()
W, D = 1.6, 2.0  # bus: 1.6 m wide (x), 2 m deep (y)
Z_EQ = 0.9  # top of the equipment module
Z_TOP = 2.1  # top of the propulsion module

# --- equipment module: the lower box, holding the computer, radios and science instruments ---
part("equipment_module")
box((W, D, Z_EQ - 0.01), (0, 0, Z_EQ / 2 + 0.005), m="gold")
box((W + 0.03, D + 0.03, 0.04), (0, 0, Z_EQ), m="alu")  # the joint between the two modules
box((W + 0.02, D + 0.02, 0.03), (0, 0, 0.015), m="alu")  # the Mars-facing deck's edge
for sy in (-1, 1):  # radiator panels (white) on the two ends
    box((0.9, 0.012, 0.5), (-0.1, sy * (D / 2 + 0.006), 0.48), m="white")
for i in range(5):  # louvres on one radiator
    box((0.8, 0.02, 0.012), (-0.1, D / 2 + 0.018, 0.3 + i * 0.09), m="alu")

# --- propulsion module: the upper box, wrapped in dark blankets, holding the fuel and oxidiser tanks ---
part("propulsion_module")
box((W, D, Z_TOP - Z_EQ - 0.01), (0, 0, (Z_TOP + Z_EQ) / 2 - 0.005), m="foil_black")
box((W + 0.02, D + 0.02, 0.03), (0, 0, Z_TOP - 0.015), m="alu")  # top deck's edge
for sy in (-1, 1):  # the tanks' domes bulge through the top deck
    sphere(0.42, (0.05, sy * 0.48, Z_TOP - 0.2), "gold", seg=24, ring=12, scale=(1, 1, 0.75))
sphere(0.17, (-0.5, 0.0, Z_TOP + 0.02), "alu", seg=14, ring=8)  # helium bottle
for x in (-0.8, 0.8):  # corner posts
    for y in (-1.0, 1.0):
        beam((x, y, Z_EQ), (x, y, Z_TOP), 0.04, 0.04, "alu")

# --- main engine: fired once, for about 16 minutes, to brake into orbit around Mars ---
part("main_engine")
EX, EY = 0.05, 0.0
bell = [(0.0, 0.0), (0.05, 0.0), (0.05, 0.1), (0.035, 0.16), (0.07, 0.26), (0.115, 0.38), (0.15, 0.5), (0.165, 0.6)]
revolve(bell, (EX, EY, Z_TOP + 0.02), m="darkalu", n=28)
revolve([(0.16, 0.598), (0.145, 0.5), (0.11, 0.38), (0.066, 0.26), (0.0, 0.26)], (EX, EY, Z_TOP + 0.02), m="black", n=28)  # inside of the nozzle
torus(0.165, 0.008, (EX, EY, Z_TOP + 0.62), m="alu", n=28, nm=6)
revolve([(0.2, 0.0), (0.2, 0.06), (0.09, 0.12), (0.06, 0.12)], (EX, EY, Z_TOP + 0.01), m="gold", n=24)  # heat shield collar
for k in range(3):  # feed lines and gimbal struts
    a = math.radians(120 * k + 40)
    strut((EX + 0.19 * math.cos(a), EY + 0.19 * math.sin(a), Z_TOP + 0.03), (EX + 0.05 * math.cos(a), EY + 0.05 * math.sin(a), Z_TOP + 0.13), 0.01, "alu", 6)

# --- thrusters: small rocket nozzles at the top corners (their firings were the numbers reported in the wrong units) ---
part("thrusters")
for sx in (-1, 1):
    for sy in (-1, 1):
        cx, cy = sx * (W / 2 - 0.1), sy * (D / 2 - 0.1)
        box((0.14, 0.14, 0.1), (cx, cy, Z_TOP + 0.05), m="darkalu")  # bracket
        # one bigger path-correction thruster pointing up, one tiny turning thruster pointing out sideways
        revolve([(0.0, 0.0), (0.018, 0.0), (0.014, 0.05), (0.04, 0.14)], (cx, cy, Z_TOP + 0.1), m="alu", n=14)
        revolve([(0.037, 0.138), (0.012, 0.05), (0.0, 0.05)], (cx, cy, Z_TOP + 0.1), m="black", n=14)
        revolve([(0.0, 0.0), (0.01, 0.0), (0.008, 0.03), (0.02, 0.08)], (cx + sx * 0.07, cy, Z_TOP + 0.05), (0, 90 * sx, 0), "alu", n=10)

# --- high-gain antenna: the 1.3 m dish that talked to Earth, on a mast with a two-axis joint ---
part("high_gain_antenna")
HX, HY = -0.45, -0.62
MAST = 0.6
strut((HX, HY, Z_TOP), (HX, HY, Z_TOP + MAST), 0.045, "alu", 12)  # mast
box((0.2, 0.2, 0.05), (HX, HY, Z_TOP + 0.025), m="darkalu")
cyl(0.075, 0.16, (HX, HY, Z_TOP + MAST + 0.03), (90, 0, 0), "darkalu", n=14)  # joint
cyl(0.06, 0.12, (HX, HY - 0.02, Z_TOP + MAST + 0.13), (0, 90, 0), "darkalu", n=14)
TILT = (-38, 0, 25)  # dish looks up and away from the wing
DZ = Z_TOP + MAST + 0.18
dish(0.65, 0.17, (HX, HY, DZ), TILT, "white", n=36, rings=7, back="alu", t=0.015)
# feed: three thin struts from the rim to a small horn at the focus
import numpy as np
from gen import _rot
Rm = _rot(TILT)
focus = np.array((HX, HY, DZ)) + Rm @ np.array((0, 0, 0.62))
for k in range(3):
    a = math.radians(120 * k + 30)
    rim = np.array((HX, HY, DZ)) + Rm @ np.array((0.62 * math.cos(a), 0.62 * math.sin(a), 0.165))
    strut(tuple(rim), tuple(focus), 0.008, "alu", 6)
cyl(0.05, 0.1, tuple(focus), TILT, "darkalu", n=12, r2=0.03)
# a stubby low-gain antenna beside the mast, for when the dish was not pointed at Earth
cyl(0.03, 0.2, (HX + 0.3, HY - 0.2, Z_TOP + 0.1), m="white", n=10)

# --- solar array: one wing only, three panels in a row, 5.5 m from end to end ---
part("solar_array_joint")
JX = W / 2
cyl(0.09, 0.2, (JX + 0.1, 0, 1.25), (0, 90, 0), "darkalu", n=16)  # the two-axis joint on the bus's side
cyl(0.07, 0.16, (JX + 0.22, 0, 1.25), (90, 0, 0), "alu", n=14)
beam((JX + 0.22, 0, 1.25), (JX + 0.62, 0, 1.25), 0.07, 0.07, "alu")  # boom
for sy in (-1, 1):  # yoke out to the first panel
    strut((JX + 0.6, 0, 1.25), (JX + 0.95, sy * 0.55, 1.25), 0.02, "alu", 8)

part("solar_array")
PW, PL = 1.80, 1.85  # each panel: 1.80 m along the wing, 1.85 m wide
ROLL = 28  # the wing is turned a little so its cells catch the Sun
X0 = JX + 0.95
for i in range(3):
    cx = X0 + PW / 2 + i * (PW + 0.025)
    plate(PW, PL, 0.03, (cx, 0, 1.25), (ROLL, 0, 0), "cell", "alu", 0.03, "foil_black")
    if i < 2:  # hinges between panels
        for sy in (-0.6, 0.6):
            c, s = math.cos(math.radians(ROLL)), math.sin(math.radians(ROLL))
            cyl(0.02, 0.12, (cx + PW / 2 + 0.0125, sy * c, 1.25 + sy * s), (90 + ROLL, 0, 0), "darkalu", n=8)

# --- PMIRR: the instrument that would have measured temperature, dust and water vapour in the air ---
part("pmirr")
PXc, PYc = -W / 2 - 0.2, 0.45
box((0.4, 0.5, 0.55), (PXc, PYc, 0.35), m="foil_silver")  # instrument body, on the bus's side
cyl(0.11, 0.3, (PXc - 0.08, PYc, 0.02), m="darkalu", n=16)  # telescope, looking down at Mars
cyl(0.09, 0.01, (PXc - 0.08, PYc, -0.135), m="glass", n=16)
revolve([(0.0, 0.0), (0.1, 0.0), (0.26, 0.22), (0.25, 0.22), (0.09, 0.02), (0.0, 0.02)], (PXc - 0.2, PYc, 0.4), (0, -90, 0), "white", n=24)  # cooler: a cone open to cold space
box((0.1, 0.2, 0.2), (PXc + 0.05, PYc - 0.33, 0.3), m="gold")

# --- MARCI: two small cameras (wide and medium angle) for daily weather pictures ---
part("marci")
box((0.14, 0.12, 0.12), (0.35, -0.55, -0.06), m="gold")
cyl(0.03, 0.06, (0.32, -0.55, -0.15), m="black", n=12)
cyl(0.022, 0.005, (0.32, -0.55, -0.182), m="glass", n=12)
box((0.1, 0.08, 0.14), (0.52, -0.55, -0.07), m="gold")
cyl(0.022, 0.1, (0.52, -0.55, -0.19), m="black", n=12)
cyl(0.016, 0.005, (0.52, -0.55, -0.242), m="glass", n=12)

# --- UHF antenna: the radio relay that would have passed on Mars Polar Lander's messages ---
part("uhf_antenna")
cyl(0.16, 0.01, (-0.2, -0.3, -0.005), m="alu", n=20)  # ground plane on the Mars-facing deck
cyl(0.05, 0.36, (-0.2, -0.3, -0.19), m="white", n=14)  # helix inside its cover
for i in range(6):
    torus(0.052, 0.006, (-0.2, -0.3, -0.05 - i * 0.055), m="copper", n=14, nm=5)

# --- battery box and star cameras ---
part("battery")
box((0.5, 0.25, 0.4), (0.25, D / 2 + 0.125, 0.35), m="white")
box((0.52, 0.02, 0.42), (0.25, D / 2 + 0.26, 0.35), m="alu")

part("star_cameras")
for sy in (-1, 1):
    px, py, pz = -0.3, sy * (D / 2 + 0.07), 1.55
    box((0.14, 0.14, 0.14), (px, py, pz), m="darkalu")
    cyl(0.05, 0.2, (px, py + sy * 0.13, pz + 0.07), (-55 * sy, 0, 0), "black", n=14, r2=0.07)  # sun shade
for sx, sy in ((1, 1), (-1, -1)):  # sun sensors
    box((0.06, 0.06, 0.03), (sx * 0.6, sy * 0.8, Z_TOP + 0.015), m="glass")

finish(
    "mars-climate-orbiter",
    "Mars Climate Orbiter",
    "Mars Climate Orbiter in its cruise layout: a 1.6 x 2.0 x 2.1 m bus (gold equipment module below, dark "
    "propulsion module above), the 640 N main engine and thruster clusters on top, the 1.3 m high-gain dish on its "
    "mast, and the single three-panel solar wing (5.5 m long) on one side, which made the spacecraft lopsided. On "
    "the equipment module: PMIRR with its cone-shaped cooler, the two small MARCI cameras, the UHF relay antenna, "
    "the battery box and star cameras. Simplified: instrument shapes and exact positions are best estimates from "
    "NASA artist's views; the wing is drawn 1.85 m wide.",
    covers=["Mars Climate Orbiter"],
)
