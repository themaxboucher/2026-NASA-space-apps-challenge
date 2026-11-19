# Mars Polar Lander, as it was meant to stand on Mars after landing (it was lost on 3 December 1999).
# References (NASA, public domain):
#   NASA NSSDCA, Mars Polar Lander (1999-001A), https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1999-001A :
#     about 3.6 m wide and 1.06 m tall with legs and solar arrays out; hexagonal honeycomb base on three aluminium
#     legs; a 2 m robotic arm with a scoop and camera; Surface Stereo Imager on a mast; 1.2 m weather mast with a
#     0.9 m sub-mast pointing down; lidar; Mars Microphone; medium-gain dish and UHF antenna on the deck; solar panels
#     out from two opposite sides, plus two small auxiliary panels; two hydrazine tanks; 12 descent engines
#     (three groups of four, 266 N each).
#   JPL, "1998 Mars Missions" and "Mars Polar Lander / Deep Space 2" press kits,
#     https://www.jpl.nasa.gov/news/press_kits/mplds2hq.pdf (lander 290 kg, 1.06 m tall by 3.6 m wide).
#   NASA/JPL artist's views of the landed spacecraft (deck layout, the two-piece solar wings with clipped corners).
# Layout (metres, Z up): deck top at z = 1.06, solar wings out along +X and -X (3.6 m tip to tip), the robotic arm
#   reaching out on the -Y side, legs at 30, 150 and 270 degrees with the descent-engine groups between them.
# Simplified: instrument shapes are approximate boxes and cylinders; the deck height is taken as the quoted 1.06 m
#   (the masts stand above it); the solar wings' exact outline is from artist's views, not a drawing.
# Layout checked against NASA's labelled diagram on the NSSDCA page (image/spacecraft/mpl_annot.gif): two solar
#   array wings and small auxiliary arrays, meteorology mast, stereo imager on its lattice mast, robotic arm with
#   camera and scoop, medium-gain dish, UHF antenna, lidar, gold propellant tanks, descent thrusters, three legs.
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import *

reset()
DECK = 1.06  # deck top
T = 0.05  # deck thickness
RD = 0.80  # deck corner radius (hexagon, 1.6 m corner to corner)


def P(r, deg, z):
    a = math.radians(deg)
    return (r * math.cos(a), r * math.sin(a), z)


def slab(pts, z, t, top, bottom, edge="alu", inset=0.035):
    """A flat panel with a convex outline `pts` (x, y), `t` thick, its top face at z: `bottom` colour below, an
    `edge` rim, and a slightly smaller `top`-coloured face (the cells) set into it."""
    n = len(pts)
    cx = sum(p[0] for p in pts) / n
    cy = sum(p[1] for p in pts) / n
    area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
    if area < 0:
        pts = pts[::-1]
    lo = [(x, y, z - t) for x, y in pts]
    hi = [(x, y, z - 0.004) for x, y in pts]
    mesh(lo + hi, [tuple(range(n - 1, -1, -1))], bottom)
    mesh(lo + hi, [tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)], edge)
    inner = []
    for x, y in pts:
        dx, dy = x - cx, y - cy
        l = math.hypot(dx, dy)
        k = (l - inset * 1.3) / l
        inner.append((cx + dx * k, cy + dy * k))
    lo2 = [(x, y, z - 0.004) for x, y in inner]
    hi2 = [(x, y, z) for x, y in inner]
    mesh(lo2 + hi2, [tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)], top)


# --- deck: the hexagonal honeycomb base, with the insulated electronics box hanging under it ---
part("deck")
ngon_prism(RD, T, 6, (0, 0, DECK - T / 2), m="white")
ngon_prism(RD + 0.012, 0.03, 6, (0, 0, DECK - T / 2), m="alu")  # edge band
box((0.86, 0.72, 0.34), (0, 0, DECK - T - 0.17), m="gold")  # thermal enclosure (computer, radios, battery)
box((0.9, 0.76, 0.02), (0, 0, DECK - T - 0.345), m="foil_black")
for sx in (-1, 1):  # cable runs and brackets on top of the deck
    box((0.5, 0.03, 0.02), (sx * 0.2, 0.62 * sx, DECK + 0.01), (0, 0, 20 * sx), "darkalu")
box((0.16, 0.12, 0.1), (0.42, -0.42, DECK + 0.05), m="darkalu")  # electronics box
box((0.12, 0.1, 0.07), (-0.3, -0.1, DECK + 0.035), m="alu")
# MARDI, the descent camera, looking straight down from under the deck
cyl(0.045, 0.12, (0.3, -0.5, DECK - T - 0.06), m="black", n=12)
cyl(0.035, 0.03, (0.3, -0.5, DECK - T - 0.135), m="glass", n=12)

# --- two hydrazine tanks, slung under the deck on either side of the electronics box ---
part("fuel_tanks")
for sy in (-1, 1):
    sphere(0.235, (0, sy * 0.47, DECK - T - 0.26), "gold", seg=20, ring=12)
    torus(0.236, 0.012, (0, sy * 0.47, DECK - T - 0.26), (90, 0, 0), "alu", n=24, nm=6)
    strut((0, sy * 0.47, DECK - T), (0, sy * 0.47, DECK - T - 0.03), 0.06, "alu", 10)
sphere(0.1, (-0.36, 0.0, DECK - T - 0.42), "alu", seg=14, ring=8)  # helium pressurant bottle
sphere(0.1, (0.36, 0.0, DECK - T - 0.42), "alu", seg=14, ring=8)

# --- descent engines: three groups of four, between the legs, pointing down ---
part("descent_engines")
for d in (90, 210, 330):
    c = P(0.58, d, DECK - T - 0.36)
    a = math.radians(d)
    tx, ty = -math.sin(a), math.cos(a)
    box((0.3, 0.2, 0.05), (c[0], c[1], c[2] + 0.11), (0, 0, d + 90), "darkalu")  # mounting plate
    strut((c[0], c[1], c[2] + 0.13), P(0.5, d, DECK - T), 0.02, "alu", 6)
    for i, (u, v) in enumerate(((-0.09, -0.045), (-0.03, 0.045), (0.03, -0.045), (0.09, 0.045))):
        x = c[0] + tx * u + math.cos(a) * v
        y = c[1] + ty * u + math.sin(a) * v
        cyl(0.03, 0.07, (x, y, c[2] + 0.06), m="alu", n=10)  # valve and chamber
        revolve([(0.045, -0.07), (0.036, -0.02), (0.02, 0.03), (0.0, 0.03)], (x, y, c[2]), m="darkalu", n=14)  # nozzle
        revolve([(0.0, 0.02), (0.018, 0.02), (0.034, -0.02), (0.043, -0.068)], (x, y, c[2]), m="black", n=14)  # its inside

# --- legs: one main strut with a crushable shock absorber and two side braces each, on round footpads ---
part("legs")
LEGS = (30, 150, 270)
for d in LEGS:
    hip = P(RD - 0.05, d, DECK - T - 0.02)
    foot = P(1.22, d, 0.075)
    strut(hip, foot, 0.034, "alu", 10, r2=0.026)  # main strut
    mid = tuple(hip[i] + (foot[i] - hip[i]) * 0.42 for i in range(3))
    strut(hip, mid, 0.045, "white", 10)  # shock-absorber sleeve
    for s in (-1, 1):  # side braces back to the body
        strut(foot, P(0.62, d + s * 42, DECK - T - 0.36), 0.018, "alu", 8)
    # footpad: a shallow dish
    revolve([(0.0, 0.0), (0.11, 0.0), (0.15, 0.03), (0.15, 0.045), (0.1, 0.06), (0.0, 0.07)], (foot[0], foot[1], 0.0), m="alu", n=20)
    sphere(0.04, foot, "darkalu", seg=10, ring=6)  # ball joint

# --- touchdown sensors: a small magnetic switch at the top of each leg that was to feel the ground ---
part("touchdown_sensors")
for d in LEGS:
    hip = P(RD - 0.02, d, DECK - T - 0.03)
    box((0.09, 0.07, 0.06), hip, (0, 0, d), "darkalu")
    cyl(0.018, 0.05, P(RD + 0.03, d, DECK - T - 0.03), (0, 90, d), "copper", n=8)

# --- solar panels: a two-piece wing folded out on each side, plus two small extra panels on the deck's edge ---
part("solar_panels")
Z_W = DECK - 0.005
for sx in (-1, 1):
    for sy in (-1, 1):
        pts = [(0.74, 0.03), (1.80, 0.03), (1.80, 0.60), (1.50, 0.90), (1.00, 0.90), (0.74, 0.62)]
        slab([(sx * x, sy * y) for x, y in pts], Z_W, 0.03, "cell", "white")
    beam((sx * 0.66, 0, Z_W - 0.02), (sx * 0.78, 0, Z_W - 0.02), 0.9, 0.03, "alu")  # hinge beam at the wing root
    beam((sx * 0.78, 0, Z_W - 0.035), (sx * 1.78, 0, Z_W - 0.035), 0.05, 0.03, "alu")  # spar between the two pieces
    for sy in (-1, 1):
        strut((sx * 0.80, sy * 0.3, Z_W - 0.035), (sx * 1.55, sy * 0.72, Z_W - 0.035), 0.012, "alu", 6)
for sy in (-1, 1):  # auxiliary panels, tilted out from the deck's fore and aft edges
    plate(0.62, 0.3, 0.02, (0, sy * 0.80, DECK - 0.06), (-55 * sy, 0, 0), "cell", "alu", 0.02, "white")

# --- robotic arm: 2 m long, with an elbow, a scoop for digging and a small camera at the wrist ---
part("robotic_arm")
SH = (-0.18, -0.6, DECK + 0.1)
EL = (-0.40, -1.50, DECK - 0.06)  # upper arm about 1 m, reaching out level
WR = (-0.55, -1.85, 0.2)  # forearm about 1 m, down to the ground
cyl(0.07, 0.1, (SH[0], SH[1], DECK + 0.05), m="darkalu", n=14)  # shoulder turntable
sphere(0.06, SH, "alu", seg=12, ring=8)
strut(SH, EL, 0.028, "alu", 10)
cyl(0.05, 0.11, EL, (0, 90, 108), "darkalu", n=12)  # elbow joint
strut(EL, WR, 0.024, "alu", 10)
cyl(0.04, 0.09, WR, (0, 90, 108), "darkalu", n=12)  # wrist joint
box((0.09, 0.07, 0.07), (WR[0] + 0.02, WR[1] + 0.07, WR[2] + 0.1), (20, 0, 18), "black")  # arm camera
cyl(0.022, 0.03, (WR[0] + 0.03, WR[1] + 0.035, WR[2] + 0.05), (150, 0, 18), "glass", n=10)
# scoop: an open box with a toothed front edge, tipped toward the ground
sv = [(-0.05, -0.07, 0.0), (0.05, -0.07, 0.0), (0.05, 0.07, 0.0), (-0.05, 0.07, 0.0), (-0.05, -0.07, 0.09), (0.05, -0.07, 0.09), (0.05, 0.07, 0.07), (-0.05, 0.07, 0.07)]
sf = [(0, 3, 2, 1), (0, 1, 5, 4), (1, 2, 6, 5), (3, 0, 4, 7), (2, 3, 7, 6)]
mat("alu_2s", (0.75, 0.76, 0.78), 0.5, 0.4, double=True)
mesh(sv, sf, "alu_2s", (WR[0] - 0.01, WR[1] - 0.05, WR[2] - 0.13), (35, 0, 18))
tube([(SH[0] + 0.03, SH[1], SH[2]), (EL[0] + 0.04, EL[1], EL[2] + 0.03), (WR[0] + 0.04, WR[1], WR[2] + 0.04)], 0.007, "black", 5)  # cable

# --- camera mast: the Surface Stereo Imager, two "eyes" on a lattice mast ---
part("camera_mast")
MX, MY = 0.34, -0.3
cyl(0.06, 0.08, (MX, MY, DECK + 0.04), m="darkalu", n=14)
for k in range(3):  # three longerons with rings: a pop-up lattice mast
    a = math.radians(120 * k + 15)
    strut((MX + 0.035 * math.cos(a), MY + 0.035 * math.sin(a), DECK + 0.08), (MX + 0.035 * math.cos(a), MY + 0.035 * math.sin(a), DECK + 0.62), 0.006, "alu", 5)
for i in range(7):
    torus(0.036, 0.004, (MX, MY, DECK + 0.1 + i * 0.085), m="alu", n=12, nm=4)
cyl(0.04, 0.07, (MX, MY, DECK + 0.655), m="darkalu", n=12)  # pan / tilt head
box((0.24, 0.1, 0.1), (MX, MY, DECK + 0.74), (0, 0, 10), "gold")  # camera head
for s in (-1, 1):
    ex = MX + s * 0.075 * math.cos(math.radians(10)) + 0.05 * math.sin(math.radians(10))
    ey = MY + s * 0.075 * math.sin(math.radians(10)) - 0.05 * math.cos(math.radians(10))
    cyl(0.028, 0.03, (ex, ey, DECK + 0.74), (90, 0, 10), "black", n=12)
    cyl(0.02, 0.006, (ex + 0.016 * math.sin(math.radians(10)), ey - 0.016 * math.cos(math.radians(10)), DECK + 0.74), (90, 0, 10), "glass", n=12)

# --- weather mast: wind and temperature sensors 1.2 m above the deck, and a 0.9 m sub-mast hanging down ---
part("weather_mast")
WX, WY = -0.5, 0.36
cyl(0.045, 0.06, (WX, WY, DECK + 0.03), m="darkalu", n=12)
strut((WX, WY, DECK + 0.05), (WX, WY, DECK + 1.2), 0.014, "alu", 8, r2=0.009)
for z in (0.55, 1.15):  # thermocouple brackets
    strut((WX, WY, DECK + z), (WX - 0.12, WY + 0.05, DECK + z + 0.02), 0.004, "alu", 4)
    sphere(0.012, (WX - 0.12, WY + 0.05, DECK + z + 0.02), "copper", seg=8, ring=5)
cyl(0.03, 0.05, (WX, WY, DECK + 1.225), m="white", n=12)  # wind sensor
cyl(0.018, 0.04, (WX, WY, DECK + 1.27), m="darkalu", n=10)
box((0.07, 0.05, 0.1), (WX + 0.04, WY, DECK + 0.3), m="gold")  # laser humidity sensor
# sub-mast: from the deck's edge down to just above the ground
SX0, SY0 = -0.72, 0.42
strut((WX, WY, DECK + 0.02), (SX0, SY0, DECK - 0.02), 0.008, "alu", 6)
strut((SX0, SY0, DECK - 0.02), (SX0 - 0.02, SY0 + 0.01, DECK - 0.9), 0.008, "alu", 6)
cyl(0.022, 0.045, (SX0 - 0.02, SY0 + 0.01, DECK - 0.92), m="white", n=10)

# --- TEGA: eight tiny single-use ovens that were to bake soil and sniff what came out ---
part("tega_ovens")
box((0.34, 0.26, 0.2), (0.36, 0.32, DECK + 0.1), (0, 0, -20), "white")
for i in range(4):  # the row of spring-loaded oven covers on top
    u = -0.12 + i * 0.08
    x = 0.36 + u * math.cos(math.radians(-20))
    y = 0.32 + u * math.sin(math.radians(-20))
    box((0.06, 0.2, 0.03), (x, y, DECK + 0.215), (0, 0, -20), "alu" if i % 2 else "darkalu")
box((0.3, 0.05, 0.12), (0.36 + 0.06, 0.32 + 0.16, DECK + 0.26), (35, 0, -20), "alu")  # open feed chute

# --- lidar (a laser pointing straight up to probe dust and ice in the air) with the Mars Microphone inside it ---
part("lidar_microphone")
box((0.2, 0.16, 0.16), (-0.12, 0.5, DECK + 0.08), (0, 0, 15), "gold")
cyl(0.05, 0.1, (-0.15, 0.5, DECK + 0.2), m="darkalu", n=14)  # laser telescope, looking up
cyl(0.04, 0.008, (-0.15, 0.5, DECK + 0.252), m="glass", n=14)
box((0.05, 0.05, 0.02), (-0.045, 0.52, DECK + 0.17), (0, 0, 15), "black")  # the microphone, a 5 cm box
cyl(0.008, 0.012, (-0.045, 0.52, DECK + 0.185), m="copper", n=8)

# --- antennas: a small steerable dish for talking straight to Earth, and a UHF antenna for relay orbiters ---
part("antennas")
AX, AY = 0.1, 0.05
cyl(0.035, 0.22, (AX, AY, DECK + 0.11), m="darkalu", n=12)  # dish gimbal post
sphere(0.045, (AX, AY, DECK + 0.24), "alu", seg=10, ring=6)
dish(0.2, 0.06, (AX, AY, DECK + 0.26), (25, 15, 0), "white", n=24, rings=5, back="alu")
strut((AX, AY, DECK + 0.26), (AX + 0.035, AY - 0.055, DECK + 0.38), 0.008, "alu", 6)  # feed
cyl(0.02, 0.03, (AX + 0.037, AY - 0.058, DECK + 0.385), (25, 15, 0), "darkalu", n=8)
UX, UY = -0.35, -0.42
cyl(0.03, 0.04, (UX, UY, DECK + 0.02), m="darkalu", n=10)  # UHF: a short helix on a post
cyl(0.045, 0.3, (UX, UY, DECK + 0.19), m="white", n=12)
cyl(0.11, 0.008, (UX, UY, DECK + 0.045), m="alu", n=16)  # its ground plane

finish(
    "mars-polar-lander",
    "Mars Polar Lander (as it was meant to stand on Mars)",
    "Mars Polar Lander in its landed layout, 3.6 m across the solar wings with the deck 1.06 m above the ground: "
    "hexagonal deck over the gold insulated electronics box, two hydrazine tanks, three groups of four descent "
    "engines, three legs with footpads and touchdown sensors, two-piece solar wings on two sides plus two small "
    "auxiliary panels, the 2 m robotic arm with scoop and camera, the stereo camera on its lattice mast, the 1.2 m "
    "weather mast with its hanging sub-mast, the TEGA oven box, the lidar with the Mars Microphone, a steerable "
    "medium-gain dish and a UHF antenna. Simplified: instruments are approximate shapes and the solar-wing outline "
    "follows NASA artist's views. The real lander was lost while landing, so it never looked like this on Mars.",
    covers=["Mars Polar Lander"],
)
