# Lunar Prospector, in its mapping orbit with all three instrument booms out, as it was before the 1999 crash.
# References (NASA, public domain):
#   NASA NSSDCA Lunar Prospector (1998-001A), https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1998-001A :
#     graphite-epoxy drum 1.37 m in diameter and 1.28 m high with three radial 2.5 m instrument booms; a 1.1 m
#     extension boom at the end of one boom holds the magnetometer; spin-stabilised at 12 rpm; six 22 N hydrazine
#     thrusters (two aft, two forward, two tangential); three fuel tanks inside the drum; body-mounted solar cells;
#     a slotted phased-array medium-gain antenna and an omnidirectional low-gain antenna; no on-board computer.
#   Lunar Prospector Mission Handbook (Lockheed Martin / NASA Ames, on NASA PDS),
#     https://pds-geosciences.wustl.edu/missions/lunarp/schandbk.pdf : the five instruments sit on the ends of the
#     three masts; the antenna assembly is 62 in (1.57 m) tall, the medium-gain antenna (cone and cylinder) with the
#     omni antenna (a cone) on top; thrusters canted 10 degrees from the spin axis.
#   NASA Science, https://science.nasa.gov/mission/lunar-prospector/ : gamma-ray spectrometer on one boom, neutron
#     and alpha-particle spectrometers together on another, electron reflectometer and magnetometer on the third.
# Layout (metres, Z up = spin axis): drum centred on the axis; booms at 90, 210 and 330 degrees.
# Layout checked against NASA's picture of the spacecraft on its NSSDCA page (image/spacecraft/lunarprosp.gif):
#   blue solar-cell drum, white antenna mast on top, three lattice booms with an instrument at each tip and the
#   magnetometer on a thin extension past one of them.
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import *

reset()
RD = 0.685  # 1.37 m across
H = 1.28
ZB = 0.42  # height where the booms leave the drum
BOOM = 2.5


def polar(deg, r, z=0.0):
    a = math.radians(deg)
    return (r * math.cos(a), r * math.sin(a), z)


# --- the drum: covered in solar cells, with bare bands at the edges and round the middle ---
part("drum")
revolve([(RD, 0.0), (RD, 0.07)], m="black", n=48)
revolve([(RD, 0.07), (RD, 0.60)], m="cell", n=48)
revolve([(RD, 0.60), (RD, 0.68)], m="black", n=48)
revolve([(RD, 0.68), (RD, H - 0.07)], m="cell", n=48)
revolve([(RD, H - 0.07), (RD, H)], m="black", n=48)
for i in range(24):  # the seams between strings of cells
    a = 15 * i + 7.5
    for z0, z1 in ((0.08, 0.59), (0.69, H - 0.08)):
        beam(polar(a, RD + 0.002, z0), polar(a, RD + 0.002, z1), 0.012, 0.004, "darkalu")
revolve([(0.0, H), (RD, H)], m="gold", n=48)  # top deck, wrapped in foil
revolve([(RD, 0.0), (0.0, 0.0)], m="foil_black", n=48)  # bottom deck
# --- launch adapter ring underneath (where it rode on its rocket's upper stage) ---
part("adapter_ring")
revolve([(0.33, -0.09), (0.33, 0.0)], m="alu", n=32)
revolve([(0.30, 0.0), (0.30, -0.09)], m="darkalu", n=32)
revolve([(0.30, -0.09), (0.33, -0.09)], m="alu", n=32)

# --- antenna mast on the spin axis: medium-gain antenna (cone and slotted cylinder), omni cone on top ---
part("antenna_mast")
ZA = H
revolve([(0.20, ZA), (0.20, ZA + 0.04), (0.085, ZA + 0.38), (0.085, ZA + 1.22), (0.0, ZA + 1.22)], m="white", n=24)
for z in [ZA + 0.46 + 0.1 * k for k in range(8)]:  # the rings of slots that shape its radio beam
    torus(0.087, 0.007, (0, 0, z), m="darkalu", n=24, nm=6)
revolve([(0.035, ZA + 1.22), (0.035, ZA + 1.30), (0.12, ZA + 1.50), (0.12, ZA + 1.52), (0.0, ZA + 1.57)], m="alu", n=20)  # omni cone

# --- three masts: light lattice booms 2.5 m long ---
part("booms")
BOOM_AT = (90, 210, 330)
for d in BOOM_AT:
    a = math.radians(d)
    u = (math.cos(a), math.sin(a), 0.0)  # along the boom
    v = (-math.sin(a), math.cos(a), 0.0)  # across it
    box((0.26, 0.24, 0.26), polar(d, RD + 0.05, ZB), (0, 0, d), "darkalu")  # the canister each boom unrolled from
    r0, r1, tr = RD + 0.18, RD + BOOM, 0.055
    corners = [(tr, 0.0), (-tr * 0.5, tr * 0.87), (-tr * 0.5, -tr * 0.87)]  # triangle of three long rods
    def pt(r, c):
        return (u[0] * r + v[0] * c[0], u[1] * r + v[1] * c[0], ZB + c[1])
    for c in corners:
        strut(pt(r0, c), pt(r1, c), 0.006, "copper", 5)
    bays = 12
    for k in range(bays + 1):
        r = r0 + (r1 - r0) * k / bays
        for i in range(3):
            strut(pt(r, corners[i]), pt(r, corners[(i + 1) % 3]), 0.004, "copper", 4)
            if k < bays:
                r2 = r0 + (r1 - r0) * (k + 1) / bays
                strut(pt(r, corners[i]), pt(r2, corners[(i + 1) % 3]), 0.003, "copper", 4)

TIP = RD + BOOM

# --- boom 1: gamma-ray spectrometer (a crystal in a can that reads what the ground is made of) ---
part("gamma_ray_spectrometer")
g = polar(90, TIP + 0.02, ZB)
box((0.16, 0.10, 0.16), polar(90, TIP - 0.03, ZB), (0, 0, 90), "darkalu")
revolve([(0.0, -0.30), (0.085, -0.30), (0.085, 0.16), (0.11, 0.18), (0.11, 0.30), (0.0, 0.30)], (g[0], g[1] + 0.12, g[2]), m="gold", n=18)
torus(0.087, 0.01, (g[0], g[1] + 0.12, g[2] - 0.05), m="alu", n=18, nm=6)

# --- boom 2: neutron spectrometer (two gas tubes) and alpha-particle spectrometer (a cube of detectors) ---
part("neutron_spectrometer")
c2 = polar(210, TIP, ZB)
t2 = (-math.sin(math.radians(210)), math.cos(math.radians(210)), 0.0)
box((0.14, 0.18, 0.1), polar(210, TIP - 0.02, ZB), (0, 0, 210), "darkalu")
for off, colour in ((0.06, "silver"), (-0.06, "copper")):  # one bare tube, one wrapped in cadmium
    p = (c2[0] + t2[0] * off, c2[1] + t2[1] * off, ZB)
    capsule_tank(0.03, 0.30, (p[0] + math.cos(math.radians(210)) * 0.08, p[1] + math.sin(math.radians(210)) * 0.08, ZB + 0.19), m=colour, n=10, dome=0.6)
part("alpha_particle_spectrometer")
ap = polar(210, TIP + 0.12, ZB - 0.12)
box((0.18, 0.18, 0.18), ap, (0, 0, 210), "gold")
for dx, dy, dz in ((1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, -1), (0, 0, 1)):  # detectors look out of five faces
    a = math.radians(210)
    wx = dx * math.cos(a) - dy * math.sin(a)
    wy = dx * math.sin(a) + dy * math.cos(a)
    q = (ap[0] + wx * 0.091, ap[1] + wy * 0.091, ap[2] + dz * 0.091)
    strut(q, (q[0] + wx * 0.006, q[1] + wy * 0.006, q[2] + dz * 0.006), 0.05, "black", 10)

# --- boom 3: electron reflectometer at the tip, then the magnetometer 1.1 m further out ---
part("electron_reflectometer")
e = polar(330, TIP, ZB)
box((0.2, 0.16, 0.14), e, (0, 0, 330), "gold")
revolve([(0.0, 0.0), (0.07, 0.0), (0.07, 0.06), (0.045, 0.11), (0.0, 0.11)], (e[0], e[1], ZB + 0.07), m="darkalu", n=14)
part("magnetometer")
m0 = polar(330, TIP + 0.1, ZB)
m1 = polar(330, TIP + 1.1, ZB)
strut(m0, m1, 0.012, "alu", 6)
box((0.1, 0.07, 0.07), polar(330, TIP + 1.13, ZB), (0, 0, 330), "white")

# --- six small rocket thrusters: two up, two down (canted 10 degrees), two sideways for spin ---
part("thrusters")
for d in (0, 180):
    px, py, _ = polar(d, RD - 0.04)
    for z, sign in ((H + 0.02, 1), (-0.02, -1)):
        tip = (px + math.cos(math.radians(d)) * 0.03, py + math.sin(math.radians(d)) * 0.03, z + sign * 0.11)
        strut((px, py, z - sign * 0.02), tip, 0.022, "darkalu", 10, r2=0.045)
        box((0.09, 0.09, 0.05), (px, py, z - sign * 0.03), (0, 0, d), "alu")
for d, sign in ((60, 1), (240, 1)):
    p = polar(d, RD + 0.03, 0.64)
    t = (-math.sin(math.radians(d)) * sign, math.cos(math.radians(d)) * sign, 0.0)
    box((0.08, 0.1, 0.07), p, (0, 0, d), "alu")
    strut(p, (p[0] + t[0] * 0.13, p[1] + t[1] * 0.13, p[2]), 0.022, "darkalu", 10, r2=0.045)

# --- Sun sensor and the limb sensor it used to know which way it was facing ---
part("sensors")
box((0.1, 0.06, 0.1), polar(120, RD + 0.02, 0.64), (0, 0, 120), "black")
box((0.12, 0.07, 0.1), polar(300, RD + 0.025, 0.64), (0, 0, 300), "darkalu")
strut(polar(300, RD + 0.05, 0.64), polar(300, RD + 0.1, 0.64), 0.03, "glass", 10)

finish(
    "lunar-prospector",
    "Lunar Prospector",
    "Lunar Prospector in mapping orbit: a 1.37 m wide, 1.28 m tall graphite-epoxy drum covered in solar cells, the "
    "1.57 m antenna mast on its spin axis (slotted medium-gain antenna with the omni cone on top), and three 2.5 m "
    "lattice booms carrying the gamma-ray spectrometer, the neutron and alpha-particle spectrometers, and the "
    "electron reflectometer with the magnetometer on a 1.1 m extension. Six thrusters, launch adapter ring, Sun and "
    "limb sensors. Simplified: instrument shapes are approximate; the three fuel tanks are inside the drum and not shown.",
    covers=["Lunar Prospector"],
)
