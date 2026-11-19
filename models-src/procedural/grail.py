# GRAIL twin (Ebb = GRAIL-A, Flow = GRAIL-B), in lunar orbit with both solar arrays out.
# References (NASA, public domain unless noted):
#   NASA / JPL GRAIL launch press kit, "Quick Facts", https://www.jpl.nasa.gov/news/press_kits/graiLaunch.pdf :
#     main structure 1.09 m high, 0.95 m wide, 0.76 m deep; two solar arrays; 763 W at 1 AU; one 22 N main engine,
#     eight warm-gas thrusters; about 307 kg at launch (202 kg dry); Ka-band ranging between the twins, S-band time
#     transfer, X-band radio beacon; MoonKAM cameras for students.
#   NASA Science GRAIL page, https://science.nasa.gov/mission/grail/
#   MIT GRAIL "Spacecraft" page, http://moon.mit.edu/spacecraft.html (bus layout; the twins are near-identical,
#     mirrored so their ranging antennas face each other).
#   Array size (two 1.9 m2, 520-cell arrays): https://en.wikipedia.org/wiki/GRAIL (CC BY-SA, facts only).
# Layout (metres, Z up): bus 0.95 (X) x 0.76 (Y) x 1.09 (Z). The Sun-facing side is -Y: both arrays lie beside it
#   and the main engine pokes out of it. The Ka-band ranging horn looks along +X, toward the other twin.
#   Uncertain: the arrays' exact outline (drawn 1.58 x 1.20 m each = 1.9 m2) and their slight sweep-back.
# Layout checked against the labelled diagram on the NSSDCA GRAIL page (planetary/thumbnail/grail_diagram.gif):
#   box bus, two solar arrays level with one face and hinged at its opposite edges, the separation ring and
#   low-gain antenna on that face, the 22 N thruster, the Ka-band horn on a side face, S-band antennas.
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import *

reset()
W, D, H = 0.95, 0.76, 1.09
X, Y = W / 2, D / 2

# --- the bus: a box of six composite panels wrapped in blankets ---
part("bus")
box((W, D, H), (0, 0, H / 2), m="foil_black")
box((W - 0.06, 0.006, H - 0.06), (0, Y + 0.002, H / 2), m="foil_silver")  # shaded side: silvery radiator blanket
box((W - 0.08, D - 0.08, 0.006), (0, 0, H + 0.002), m="gold")  # top deck blanket
box((W - 0.08, D - 0.08, 0.006), (0, 0, -0.002), m="gold")  # bottom deck blanket
for sx in (-1, 1):
    for sy in (-1, 1):
        beam((sx * X, sy * Y, 0), (sx * X, sy * Y, H), 0.03, 0.03, "alu")  # corner edges
for z in (0, H):
    for sy in (-1, 1):
        beam((-X, sy * Y, z), (X, sy * Y, z), 0.03, 0.03, "alu")
    for sx in (-1, 1):
        beam((sx * X, -Y, z), (sx * X, Y, z), 0.03, 0.03, "alu")
box((0.34, 0.012, 0.26), (0.2, Y + 0.008, 0.78), m="white")  # radiator patches on the shaded side
box((0.26, 0.012, 0.34), (-0.24, Y + 0.008, 0.36), m="white")

# --- two fixed solar arrays beside the Sun-facing side ---
# Two parts (solar_array_1 on +X, solar_array_2 on -X), so a hotspot's part box is one array, not the pair.
AL, AH = 1.58, 1.20  # each 1.9 m2
SWEEP = 12.0  # swept back a little, away from the Sun
for sgn in (1, -1):
    part("solar_array_1" if sgn > 0 else "solar_array_2")
    hx, hy = sgn * (X + 0.04), -Y - 0.02
    c, s = math.cos(math.radians(SWEEP)), math.sin(math.radians(SWEEP))
    cx, cy = hx + sgn * (AL / 2) * c, hy + (AL / 2) * s
    # Panel in local XY facing +Z: stand it up (rotate 90 about X so +Z -> -Y), then swing about Z.
    plate(AL, AH, 0.025, (cx, cy, H / 2), (90, 0, sgn * SWEEP), "cell", "alu", 0.025, back="foil_black")
    for k in (1, 2):  # the three hinged sections' seams
        fx = hx + sgn * (AL * k / 3) * c
        fy = hy + (AL * k / 3) * s
        box((0.014, 0.008, AH - 0.05), (fx, fy - 0.014, H / 2), (0, 0, sgn * SWEEP), "alu")
    for z in (H / 2 - 0.35, H / 2 + 0.35):  # hinges
        box((0.09, 0.06, 0.08), (sgn * (X + 0.02), -Y - 0.01, z), m="alu")

part("bus")  # the braces behind the arrays belong to the bus
for sgn in (1, -1):
    c, s = math.cos(math.radians(SWEEP)), math.sin(math.radians(SWEEP))
    strut((sgn * X, Y * 0.2, H * 0.5), (sgn * (X + 0.04) + sgn * AL * 0.45 * c, -Y - 0.02 + AL * 0.45 * s + 0.02, H * 0.5), 0.012, "alu", 6)

# --- main engine: one small hydrazine rocket in the middle of the Sun-facing side ---
part("main_engine")
revolve([(0.0, 0.0), (0.085, 0.0), (0.06, 0.1), (0.03, 0.19), (0.045, 0.24), (0.0, 0.24)], (0, -Y - 0.2, H / 2), (-90, 0, 0), "darkalu", n=18)
revolve([(0.0, 0.17), (0.03, 0.19), (0.06, 0.1), (0.082, 0.004)], (0, -Y - 0.2, H / 2), (-90, 0, 0), "black", n=18)
cyl(0.12, 0.03, (0, -Y - 0.012, H / 2), (90, 0, 0), "gold", n=18)  # heat shield plate round the nozzle

# --- Ka-band ranging horn (and the S-band time-transfer antenna beside it), aimed at the other twin ---
part("ka_band_antenna")
box((0.02, 0.3, 0.3), (X + 0.012, 0.05, 0.62), m="white")
revolve([(0.0, 0.0), (0.035, 0.0), (0.035, 0.05), (0.095, 0.2), (0.095, 0.21), (0.0, 0.21)], (X + 0.02, 0.05, 0.62), (0, 90, 0), "alu", n=20)
revolve([(0.0, 0.1), (0.035, 0.06), (0.09, 0.2)], (X + 0.02, 0.05, 0.62), (0, 90, 0), "black", n=20)
cyl(0.055, 0.03, (X + 0.03, -0.18, 0.74), (0, 90, 0), "white", n=14)  # S-band time-transfer patch
box((0.14, 0.12, 0.12), (X + 0.07, 0.05, 0.36), m="foil_black")  # microwave electronics behind the horn

# --- low-gain radio antennas for talking to Earth (S-band) and the X-band beacon ---
part("radio_antennas")
for sy, z in ((1, 0.95), (-1, 0.12)):
    base = (-X * 0.55, sy * (Y + 0.01), z)
    tip = (base[0], base[1] + sy * 0.16, z)
    strut(base, tip, 0.03, "white", 10, r2=0.045)
    sphere(0.045, tip, "white", seg=10, ring=6)
for sy in (1, -1):
    cyl(0.04, 0.05, (X * 0.6, sy * (Y + 0.03), 0.2 if sy > 0 else 0.98), (90, 0, 0), "copper", n=12)  # X-band beacon

# --- star tracker: a small telescope with a baffle that finds which way the craft points ---
part("star_tracker")
st0 = (-X - 0.01, 0.12, 0.8)
box((0.12, 0.13, 0.13), (-X - 0.06, 0.12, 0.8), m="darkalu")
d = (-math.cos(math.radians(35)), 0.0, math.sin(math.radians(35)))
st1 = (st0[0] - 0.1 + d[0] * 0.2, st0[1], st0[2] + d[2] * 0.2)
strut((st0[0] - 0.1, st0[1], st0[2]), st1, 0.045, "foil_black", 14, r2=0.075)
strut(st1, (st1[0] + d[0] * 0.003, st1[1], st1[2] + d[2] * 0.003), 0.07, "black", 14)
box((0.06, 0.06, 0.04), (-X - 0.03, -0.2, 0.5), m="black")  # Sun sensor

# --- eight tiny warm-gas thrusters at the corners, for turning ---
part("thrusters")
for sx in (-1, 1):
    for sz, z in ((-1, 0.04), (1, H - 0.04)):
        for sy in (-1, 1):
            p = (sx * (X + 0.015), sy * (Y - 0.07), z)
            box((0.05, 0.06, 0.06), p, m="alu")
            strut(p, (p[0] + sx * 0.05, p[1] + sy * 0.03, p[2] + sz * 0.04), 0.012, "darkalu", 8, r2=0.022)

# --- MoonKAM: four student-run camera heads on the Moon-facing deck (drawn on the bottom) ---
part("moonkam")
for (x, y, tx, ty) in ((0.18, 0.12, 0, 0), (0.04, 0.12, 0, 0), (0.30, -0.02, 25, 0), (-0.08, -0.02, -25, 0)):
    box((0.06, 0.06, 0.05), (x, y, -0.03), m="black")
    dx = math.sin(math.radians(tx))
    strut((x, y, -0.05), (x + dx * 0.06, y, -0.05 - math.cos(math.radians(tx)) * 0.06), 0.022, "darkalu", 10)
    strut((x + dx * 0.06, y, -0.05 - math.cos(math.radians(tx)) * 0.06), (x + dx * 0.063, y, -0.05 - math.cos(math.radians(tx)) * 0.063), 0.018, "glass", 10)
box((0.16, 0.12, 0.05), (-0.25, 0.15, -0.03), m="gold")  # their video controller box

finish(
    "grail",
    "GRAIL twin (Ebb / Flow)",
    "One GRAIL twin in lunar orbit: washing-machine-sized bus (1.09 m high, 0.95 m wide, 0.76 m deep) with two fixed "
    "solar arrays beside its Sun-facing side, the 22 N main engine between them, the Ka-band ranging horn and S-band "
    "time-transfer antenna aimed at the other twin, low-gain and beacon antennas, star tracker, eight warm-gas "
    "thrusters and the four MoonKAM camera heads. Simplified and partly uncertain: the arrays' outline (drawn "
    "1.58 x 1.20 m each, 1.9 m2) and slight sweep-back, and the exact places of the small antennas, star tracker "
    "and MoonKAM heads, are approximate. Ebb and Flow were mirror images; one model serves both.",
    covers=["GRAIL"],
)
