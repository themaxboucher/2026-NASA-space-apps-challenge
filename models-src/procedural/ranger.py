# Ranger Block III (Rangers 6, 7, 8 and 9), in flight with its panels and dish deployed, as it dived at the Moon.
# References (NASA, public domain):
#   NASA NSSDCA Ranger 7 (1964-041A), https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1964-041A :
#     hexagonal aluminium frame base 1.5 m across carrying the propulsion and power units, topped by a truncated
#     conical tower holding the TV cameras; two solar panel wings, each 739 mm wide by 1537 mm long, on opposite
#     edges of the base, full span 4.6 m; a pointable high-gain dish hinged at a corner of the base away from the
#     panels; a cylindrical quasi-omnidirectional antenna on top of the tower; overall height 3.6 m; 224 N
#     hydrazine mid-course engine with four jet vanes; six vidicon cameras (2 wide-angle, 4 narrow-angle) looking
#     out through one opening in the shroud, 38 degrees off the long axis; nitrogen gas jets for pointing.
#   NASA SP-4210 "Lunar Impact: A History of Project Ranger", Appendix C (spacecraft layout):
#     https://history.nasa.gov/SP-4210/pages/App_C.htm
#   The dish is drawn 1.2 m (4 ft) across, from photos of the flight spacecraft.
# Layout (metres, Z up = the long axis, cameras end up): solar panels along +-X, dish at the -Y corner,
#   camera opening facing +Y. Solar cells face down (-Z): Ranger flew with its base toward the Sun.
# Layout checked against the photo of the spacecraft on the NSSDCA Ranger 7 page (image/spacecraft/64-041A.gif):
#   hexagonal base, polished cone tower with stiffening bands and a cylinder antenna on top, two solar panel
#   wings, the dish hinged at the base.
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import *

reset()
RH = 0.78  # hexagon corner radius: 1.56 m across corners, 1.35 m across flats ("1.5 m across")
FLAT = RH * math.cos(math.radians(30))
Z0, Z1 = 0.30, 0.78  # bottom and top of the hexagonal bus
ZC = 2.72  # top of the conical camera shroud
ZT = 3.60  # top of the omni antenna


def hexpt(deg, r=RH, z=0.0):
    a = math.radians(deg)
    return (r * math.cos(a), r * math.sin(a), z)


# --- hexagonal bus: open aluminium frame with six equipment cases on its sides ---
part("bus")
for z in (Z0, Z1):  # top and bottom hexagon rings
    for i in range(6):
        strut(hexpt(30 + 60 * i, z=z), hexpt(90 + 60 * i, z=z), 0.022, "alu", 6)
for i in range(6):
    strut(hexpt(30 + 60 * i, z=Z0), hexpt(30 + 60 * i, z=Z1), 0.022, "alu", 6)  # corner posts
    strut(hexpt(30 + 60 * i, z=Z1), hexpt(30 + 60 * i, 0.42, Z1), 0.016, "alu", 6)  # spokes to the tower's foot
ngon_prism(0.72, 0.03, 6, (0, 0, Z1 + 0.005), (0, 0, 30), "darkalu")  # top deck
ngon_prism(0.60, 0.03, 6, (0, 0, Z0 + 0.02), (0, 0, 30), "darkalu")  # lower deck
part("electronics_cases")
for i in range(6):  # the six cases: power, radios, command, attitude control, batteries...
    a = 60 * i
    x, y = FLAT * math.cos(math.radians(a)), FLAT * math.sin(math.radians(a))
    box((0.17, 0.62, 0.42), (x * 0.92, y * 0.92, (Z0 + Z1) / 2), (0, 0, a), "gold" if i % 2 == 0 else "white")
    box((0.012, 0.56, 0.36), (x * 1.045, y * 1.045, (Z0 + Z1) / 2), (0, 0, a), "silver")  # polished radiating face

# --- conical tower: polished shroud around the TV cameras ---
part("camera_tower")
R_FOOT, R_TOP = 0.42, 0.21
revolve([(R_FOOT, Z1), (R_FOOT, Z1 + 0.06), (R_TOP, ZC), (R_TOP - 0.02, ZC + 0.03)], m="silver", n=32)
for z in (Z1 + 0.06, 1.45, 2.05, ZC):  # seam bands
    r = R_FOOT + (R_TOP - R_FOOT) * (z - Z1 - 0.06) / (ZC - Z1 - 0.06)
    torus(r + 0.004, 0.012, (0, 0, max(z, Z1 + 0.06)), m="alu", n=32, nm=6)
for i in range(4):  # four thin cooling fins down the shroud
    a = math.radians(45 + 90 * i)
    zc = 1.35
    r = R_FOOT + (R_TOP - R_FOOT) * (zc - Z1 - 0.06) / (ZC - Z1 - 0.06) + 0.05
    box((0.11, 0.008, 0.9), (r * math.cos(a), r * math.sin(a), zc), (0, 0, math.degrees(a)), "white")

# --- the six TV cameras, looking out of one opening in the shroud, 38 degrees off the long axis ---
part("cameras")
ZW = 2.22
rw = R_FOOT + (R_TOP - R_FOOT) * (ZW - Z1 - 0.06) / (ZC - Z1 - 0.06)
box((0.36, 0.16, 0.54), (0, rw - 0.045, ZW), (-6.2, 0, 0), "black")  # the dark opening
box((0.40, 0.02, 0.58), (0, rw + 0.012, ZW), (-6.2, 0, 0), "alu")  # its rim
box((0.34, 0.03, 0.52), (0, rw + 0.02, ZW), (-6.2, 0, 0), "black")
look = (0.0, math.sin(math.radians(38)), math.cos(math.radians(38)))
for row, zz in enumerate((ZW + 0.13, ZW - 0.11)):
    for col in (-1, 0, 1):
        wide = row == 1 and col != 0  # the two wide-angle cameras: bigger lenses
        r = 0.055 if wide else 0.04
        p0 = (col * 0.11, rw - 0.02, zz)
        p1 = (p0[0] + look[0] * 0.11, p0[1] + look[1] * 0.11, p0[2] + look[2] * 0.11)
        strut(p0, p1, r, "darkalu", 12)
        p2 = (p1[0] + look[0] * 0.004, p1[1] + look[1] * 0.004, p1[2] + look[2] * 0.004)
        strut(p1, p2, r * 0.8, "glass", 12)

# --- omni antenna: the cylinder on top of the tower ---
part("omni_antenna")
revolve([(0.17, ZC + 0.03), (0.17, ZT - 0.12), (0.12, ZT - 0.03), (0.0, ZT)], m="white", n=24)
for z in (ZC + 0.2, ZC + 0.42, ZC + 0.64):
    torus(0.172, 0.008, (0, 0, z), m="alu", n=24, nm=6)

# --- two solar panel wings on opposite edges of the base (cells face down, toward the Sun) ---
# Two parts (solar_panel_1 on +X, solar_panel_2 on -X), so a hotspot's part box is one wing, not the pair.
PW, PL = 0.739, 1.537
for sgn in (1, -1):
    part("solar_panel_1" if sgn > 0 else "solar_panel_2")
    xc = sgn * (FLAT + 0.07 + PL / 2)
    plate(PL, PW, 0.02, (xc, 0, Z1 - 0.02), (180, 0, 0), "cell", "alu", 0.02, back="white")
    for k in range(1, 4):  # the cells sit in four sections
        box((0.012, PW - 0.04, 0.004), (sgn * (FLAT + 0.07 + PL * k / 4), 0, Z1 - 0.032), m="alu")
    for sy in (-1, 1):  # hinges
        box((0.09, 0.05, 0.04), (sgn * (FLAT + 0.035), sy * 0.25, Z1 - 0.02), m="alu")
    box((0.05, 0.05, 0.05), (sgn * (FLAT + 0.07 + PL - 0.05), 0.2, Z1 + 0.02), m="black")  # Sun sensor at the tip

part("bus")  # the struts that hold each wing out belong to the frame
for sgn in (1, -1):
    for sy in (-1, 1):
        strut((sgn * 0.36, sy * 0.2, 1.35), (sgn * (FLAT + 0.07 + PL * 0.55), sy * 0.3, Z1 + 0.0), 0.012, "alu", 6)

# --- high-gain dish, hinged under one corner of the base, pointing at Earth ---
part("high_gain_antenna")
hinge = hexpt(270, RH, Z0)
tilt = 150.0  # the dish looks down and outward
dvec = (0.0, -math.sin(math.radians(tilt)), math.cos(math.radians(tilt)))  # where the dish points
vertex = (0.0, hinge[1] + 0.05, Z0 - 0.42)
dish(0.60, 0.17, vertex, (tilt, 0, 0), "white", n=32, rings=6, back="alu")
feed_tip = tuple(vertex[i] + dvec[i] * 0.52 for i in range(3))
strut(vertex, feed_tip, 0.012, "alu", 6)  # feed mast
strut(feed_tip, tuple(feed_tip[i] + dvec[i] * 0.05 for i in range(3)), 0.04, "darkalu", 10)
# Rim points for the three feed-support rods.
ux = (1.0, 0.0, 0.0)
uy = (0.0, math.cos(math.radians(tilt)), math.sin(math.radians(tilt)))
for a in (90, 210, 330):
    ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
    rim = tuple(vertex[i] + dvec[i] * 0.17 + 0.6 * (ux[i] * ca + uy[i] * sa) for i in range(3))
    strut(rim, feed_tip, 0.006, "alu", 5)
strut(hinge, (0, hinge[1] - 0.02, Z0 - 0.2), 0.03, "alu", 8)  # hinge arm
strut((0, hinge[1] - 0.02, Z0 - 0.2), vertex, 0.03, "alu", 8)
box((0.14, 0.1, 0.1), (0, hinge[1], Z0 - 0.02), m="darkalu")  # hinge drive
box((0.09, 0.09, 0.12), (0.2, hinge[1] + 0.12, Z0 - 0.08), m="black")  # Earth sensor beside the dish

# --- mid-course motor in the middle of the base ---
part("midcourse_motor")
revolve([(0.0, 0.0), (0.13, 0.0), (0.13, 0.0), (0.10, 0.1), (0.05, 0.24), (0.07, 0.3), (0.0, 0.3)], m="darkalu", n=16)
revolve([(0.0, 0.26), (0.05, 0.24), (0.10, 0.1), (0.125, 0.005)], m="black", n=16)  # inside the nozzle
for a in (0, 90, 180, 270):  # four jet vanes in the exhaust steer the push
    box((0.1, 0.006, 0.07), (0.07 * math.cos(math.radians(a)), 0.07 * math.sin(math.radians(a)), 0.035), (0, 0, a), "alu")
sphere(0.2, (0, 0, 0.5), "alu", seg=16, ring=10)  # hydrazine tank
for x in (-0.3, 0.3):
    sphere(0.085, (x, 0.12, 0.5), "gold", seg=10, ring=6)  # pressurant bottles

# --- cold-gas pointing system: nitrogen bottles and tiny jets ---
part("attitude_jets")
for x, y in ((0.36, -0.3), (-0.36, -0.3)):
    sphere(0.115, (x, y, Z0 + 0.19), "alu", seg=12, ring=8)
for i in range(6):
    px, py, pz = hexpt(30 + 60 * i, RH + 0.01, Z0 - 0.01)
    box((0.05, 0.05, 0.04), (px, py, pz), (0, 0, 30 + 60 * i), "darkalu")
    strut((px, py, pz), (px * 1.05, py * 1.05, pz - 0.04), 0.012, "alu", 6, r2=0.018)

finish(
    "ranger",
    "Ranger Block III (Rangers 6 to 9)",
    "Ranger Block III in flight: hexagonal aluminium bus 1.5 m across with six equipment cases, polished conical "
    "shroud with one opening for the six TV cameras (aimed 38 degrees off the long axis), cylindrical omni antenna "
    "on top (3.6 m from engine to tip), two 0.74 x 1.54 m solar panel wings spanning 4.6 m with cells facing "
    "sunward (down), 1.2 m high-gain dish hinged under one corner, mid-course motor with jet vanes and the "
    "nitrogen gas jets. Simplified: wiring, the internal camera electronics and small brackets are left out; the "
    "dish's 1.2 m size and deployed angle are taken from photos.",
    covers=["Ranger"],
)
