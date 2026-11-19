# Deep Space 2 Mars microprobe (one of the two, "Amundsen" and "Scott"), at true size.
# References (NASA, public domain):
#   JPL Deep Space 2 fact sheet (mars.jpl.nasa.gov/msp98/ds2/fact.html) and project site https://www.jpl.nasa.gov/nmp/ds2/ :
#     aeroshell 275 mm high and 350 mm across; forebody (the penetrator) 105.6 mm long and 39 mm across;
#     aftbody 105.3 mm high and 136 mm across, with a 127 mm antenna; the two halves joined by a flexible cable.
#   NASA NSSDCA, Deep Space 2 (DEEPSP2), https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=DEEPSP2 :
#     ceramic aeroshell made to shatter on impact; aftbody stays on the surface with the radio and batteries;
#     forebody goes into the ground with the drill and the water experiment.
#   JPL press kit "Mars Polar Lander / Deep Space 2", https://www.jpl.nasa.gov/news/press_kits/mplds2hq.pdf
# Layout (metres, Z up): on one side the whole aeroshell, nose down, as it fell; beside it a probe out of its shell,
#   laid out the way it was meant to end up: the aftbody on top (it stays at the surface) and the forebody hanging
#   below it on the flex cable (it buries itself). The cable is drawn 0.3 m long; in the ground it could pay out
#   to about a metre. Nothing here is bigger than a basketball.
# Simplified: outside shapes only; the small fittings (sun sensor, pressure port, drill port) are placed by eye.
# Layout checked against the labelled diagram on the NSSDCA Deep Space 2 page (image/spacecraft/ds2_diagram.gif):
#   the aftbody with its antenna stays at the surface, joined by a flexible cable to the forebody below it.
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import *

reset()
Z0 = 0.44  # height of the aeroshell's nose and of the aftbody's underside (the forebody hangs below this)

# ================= the aeroshell: a blunt 45-degree cone in front, a rounded shell behind =================
AX = -0.25  # aeroshell centre line (x)
RA = 0.175  # 350 mm across
H_NOSE = 0.139  # nose tip to the widest point
H_BACK = 0.136  # widest point to the top (275 mm in all)

part("aeroshell_heatshield")
rn = 0.0875  # nose radius
t0 = math.radians(45)
prof = [(0.0, 0.0)]
for i in range(1, 9):  # the rounded nose cap, up to where the cone starts
    a = t0 * i / 8
    prof.append((rn * math.sin(a), rn * (1 - math.cos(a))))
prof.append((RA, H_NOSE))
revolve(prof, (AX, 0, Z0), m="tan", n=48)
torus(RA - 0.002, 0.004, (AX, 0, Z0 + H_NOSE), m="darkalu", n=48, nm=6)  # the seam between the two shells

part("aeroshell_backshell")
back = []
for i in range(0, 13):
    a = math.pi / 2 * i / 12
    back.append((RA * math.cos(a), H_NOSE + H_BACK * math.sin(a)))
revolve(back, (AX, 0, Z0), m="white", n=48)
cyl(0.03, 0.004, (AX, 0, Z0 + H_NOSE + H_BACK), m="darkalu", n=20)  # top fitting where it was bolted to the lander's cruise stage
for x, y, z, a in ring_of(3, 0.1, Z0 + H_NOSE + H_BACK * 0.81, 30):  # the three mounting pads
    box((0.022, 0.03, 0.006), (AX + x, y, z), (0, -35, a), "alu")

# ================= the probe, out of its shell =================
PX = 0.18  # probe centre line (x)
R_AFT = 0.068  # 136 mm across
H_AFT = 0.1053

part("aftbody")
# Squat can with a rounded underside (it has to stop at the surface) and a flat lid.
under = [(0.0, 0.0)]
for i in range(1, 9):
    a = math.pi / 2 * i / 8
    under.append((R_AFT * math.sin(a), 0.035 * (1 - math.cos(a))))
revolve(under, (PX, 0, Z0), m="alu", n=40)
revolve([(R_AFT, 0.035), (R_AFT, H_AFT - 0.012)], (PX, 0, Z0), m="white", n=40)
revolve([(R_AFT, H_AFT - 0.012), (R_AFT + 0.002, H_AFT - 0.012), (R_AFT + 0.002, H_AFT), (0.0, H_AFT)], (PX, 0, Z0), m="darkalu", n=40)  # lid
torus(R_AFT + 0.0005, 0.0022, (PX, 0, Z0 + 0.05), m="darkalu", n=40, nm=6)  # band where the two halves of the can join
for x, y, z, a in ring_of(8, R_AFT - 0.012, Z0 + H_AFT + 0.001, 22.5):  # lid screws
    cyl(0.003, 0.002, (PX + x, y, z), m="alu", n=6)
for x, y, z, a in ring_of(4, R_AFT + 0.001, Z0 + 0.075, 45):  # battery covers round the side
    box((0.004, 0.045, 0.03), (PX + x, y, z), (0, 0, a), "foil_black")

part("antenna")
cyl(0.012, 0.01, (PX, 0, Z0 + H_AFT + 0.005), m="white", n=14)  # base
strut((PX, 0, Z0 + H_AFT + 0.01), (PX, 0, Z0 + H_AFT + 0.127), 0.0022, "alu", 8, r2=0.0015)  # 127 mm whip
for k in range(4):  # four short whiskers near the top
    a = math.radians(90 * k + 20)
    strut((PX, 0, Z0 + H_AFT + 0.112), (PX + 0.022 * math.cos(a), 0.022 * math.sin(a), Z0 + H_AFT + 0.104), 0.0009, "alu", 4)
sphere(0.003, (PX, 0, Z0 + H_AFT + 0.128), "alu", seg=8, ring=5)

part("sun_sensor")
cyl(0.011, 0.006, (PX + 0.036, 0.022, Z0 + H_AFT + 0.003), m="darkalu", n=14)  # looks up to tell day from night
cyl(0.008, 0.002, (PX + 0.036, 0.022, Z0 + H_AFT + 0.0065), m="glass", n=14)

part("pressure_sensor")
cyl(0.008, 0.008, (PX - 0.034, -0.026, Z0 + H_AFT + 0.004), m="copper", n=12)  # a tiny weather station: air pressure
cyl(0.003, 0.004, (PX - 0.034, -0.026, Z0 + H_AFT + 0.009), m="black", n=8)

# --- forebody: the bullet that buries itself (tungsten nose, steel-grey shell) ---
part("forebody")
R_FORE = 0.0195  # 39 mm across
L_FORE = 0.1056
nose = [(0.0, 0.0)]
for i in range(1, 9):
    a = math.pi / 2 * i / 8
    nose.append((R_FORE * math.sin(a), 0.03 * (1 - math.cos(a))))
revolve(nose, (PX, 0, 0.0), m="darkalu", n=28)
revolve([(R_FORE, 0.03), (R_FORE, L_FORE - 0.008)], (PX, 0, 0.0), m="silver", n=28)
revolve([(R_FORE, L_FORE - 0.008), (R_FORE - 0.003, L_FORE), (0.0, L_FORE)], (PX, 0, 0.0), m="alu", n=28)
torus(R_FORE, 0.0012, (PX, 0, 0.03), m="darkalu", n=28, nm=5)  # joint behind the nose
torus(R_FORE, 0.0012, (PX, 0, 0.082), m="darkalu", n=28, nm=5)

part("sample_drill")
# A side port partway up the forebody: a pencil-thin drill came out here to pull in a pinch of soil.
cyl(0.0055, 0.004, (PX + R_FORE, 0, 0.058), (0, 90, 0), "copper", n=12)
cyl(0.0028, 0.016, (PX + R_FORE + 0.009, 0, 0.058), (0, 90, 0), "alu", n=8)  # the drill bit, part way out
for i in range(4):  # its spiral flutes
    torus(0.0029, 0.0007, (PX + R_FORE + 0.004 + i * 0.0035, 0, 0.058), (0, 90, 0), "darkalu", n=8, nm=4)
box((0.002, 0.012, 0.02), (PX - R_FORE, 0, 0.058), m="glass")  # window for the water experiment's laser

part("flex_cable")
# A flat ribbon of wires (like a camera's ribbon cable) from the forebody's tail up to the aftbody's underside.
pts = [(PX, 0.0, L_FORE)]
for i in range(1, 12):
    u = i / 12
    z = L_FORE + (Z0 + 0.002 - L_FORE) * u
    pts.append((PX + 0.018 * math.sin(u * math.pi * 3), 0.006 * math.sin(u * math.pi * 2), z))
pts.append((PX, 0.0, Z0 + 0.003))
for a, b in zip(pts, pts[1:]):
    beam(a, b, 0.012, 0.0008, "gold")
cyl(0.007, 0.004, (PX, 0, L_FORE + 0.002), m="darkalu", n=10)  # cable clamps at each end
cyl(0.009, 0.004, (PX, 0, Z0 + 0.001), m="darkalu", n=10)

finish(
    "deep-space-2",
    "Deep Space 2 Mars microprobe and its aeroshell",
    "One Deep Space 2 microprobe at true size. Left: the whole aeroshell (350 mm across, 275 mm high), a blunt "
    "45-degree heat shield with a rounded white back shell, nose down as it fell. Right: a probe out of its shell, "
    "laid out as it was meant to end up: the aftbody (136 mm across, 105 mm high) with its 127 mm whip antenna, sun "
    "sensor and pressure sensor on top, and the bullet-shaped forebody (106 mm long, 39 mm across) with its side "
    "drill port hanging below on the flat flex cable. The cable is drawn 0.3 m long (it could pay out to about a "
    "metre in the ground). Simplified: outside shapes only, small fittings placed by eye.",
    covers=["Deep Space 2"],
)
