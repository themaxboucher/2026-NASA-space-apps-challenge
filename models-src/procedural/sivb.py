# Saturn V third stage (S-IVB-500) with its Instrument Unit, as it flew into the Moon on Apollo 13 to 17.
# References (NASA, public domain): Saturn V Flight Manual SA-507 (MSFC-MAN-507), section VI "S-IVB stage" and
#   section VII "Instrument Unit"; NASA NSSDCA Apollo 13 S-IVB (1970-029B): about 17.8 m long, 6.6 m across,
#   one J-2 engine, about 13,900 kg at impact; Instrument Unit 6.6 m across and 0.91 m tall.
# Layout (metres, Z up, engine down): J-2 engine bell and thrust structure cone under the aft dome, aft skirt with
#   the two auxiliary propulsion (APS) pods and two ullage-motor fairings, the long white tank section with the
#   systems tunnel, forward skirt, and the Instrument Unit ring on top. The spacecraft adapter panels and the
#   Apollo ships were long gone by impact, so the top is open with the hydrogen tank's forward dome showing.
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import *

reset()
R = 3.30  # 6.6 m across
Z_AFT = 3.55  # bottom edge of the aft skirt (the engine hangs below it)
Z_TANK0 = Z_AFT + 2.2  # aft skirt top
Z_TANK1 = Z_TANK0 + 8.0  # tank cylinder top
Z_FWD = Z_TANK1 + 3.1  # forward skirt top
Z_IU = Z_FWD + 0.91  # Instrument Unit top (17.76 m overall)

# --- J-2 engine: bell, chamber, turbopumps, gimbal ---
part("engine")
bell = [(1.02, 0.0), (0.98, 0.25), (0.90, 0.6), (0.78, 1.0), (0.62, 1.45), (0.44, 1.9), (0.28, 2.3), (0.20, 2.55), (0.24, 2.75), (0.30, 3.0), (0.0, 3.0)]
revolve(bell, m="darkalu", n=32)
revolve([(0.0, 1.9), (0.44, 1.9), (0.62, 1.45), (0.78, 1.0), (0.90, 0.6), (0.985, 0.02)], m="black", n=32)  # inside of the bell
for z, r in ((0.3, 0.99), (0.75, 0.87), (1.2, 0.72), (1.65, 0.55)):  # stiffening bands
    torus(r, 0.022, (0, 0, z), m="alu", n=32, nm=6)
torus(0.60, 0.06, (0, 0, 1.55), m="alu", n=28, nm=8)  # turbine exhaust manifold around the bell
capsule_tank(0.17, 0.75, (0.52, 0.2, 2.55), (0, 12, 0), "alu", n=12, dome=0.7)  # fuel turbopump
capsule_tank(0.17, 0.7, (-0.5, -0.22, 2.55), (0, -12, 0), "alu", n=12, dome=0.7)  # oxidiser turbopump
tube([(0.52, 0.2, 2.9), (0.5, 0.2, 3.25), (0.2, 0.1, 3.45)], 0.07, "alu", 8)
tube([(-0.5, -0.22, 2.9), (-0.48, -0.2, 3.25), (-0.2, -0.1, 3.45)], 0.07, "alu", 8)
tube([(0.52, 0.2, 2.2), (0.62, 0.1, 1.75), (0.6, 0.0, 1.57)], 0.05, "darkalu", 8)
cyl(0.16, 0.5, (0, 0, 3.22), m="darkalu", n=14)  # injector / gimbal block
sphere(0.3, (0.1, 0.62, 3.0), "gold", seg=14, ring=8)  # start tank

# --- thrust structure: the cone that carries the engine's push into the stage ---
part("thrust_structure")
revolve([(0.45, 3.42), (0.45, 3.5), (2.15, 4.75), (2.15, 4.8)], m="darkalu", n=32)
for i, (x, y, z, a) in enumerate(ring_of(8, 1.46, 4.35, 22.5)):  # helium bottles around the cone
    sphere(0.26, (x, y, z), "gold" if i % 2 else "alu", seg=12, ring=8)

# --- oxygen tank's aft dome, seen from below inside the skirt ---
part("oxygen_tank")
dome = [(0.0, 4.35)]
for i in range(1, 9):
    a = math.pi / 2 * i / 8
    dome.append((R * 0.985 * math.sin(a), 6.3 - 1.95 * math.cos(a)))
revolve(dome, m="gold", n=40)

# --- aft skirt, with its black-and-white roll pattern ---
part("aft_skirt")
for i in range(8):
    revolve([(R, Z_AFT), (R, Z_TANK0)], m="black" if i in (0, 4) else "white", n=48, arc=45, start=i * 45 - 22.5)
revolve([(R - 0.06, Z_AFT), (R, Z_AFT)], m="alu", n=48)  # skirt's bottom edge
revolve([(R - 0.06, Z_TANK0 - 0.2), (R - 0.06, Z_AFT)], m="darkalu", n=48)  # inside of the skirt
for i in range(24):  # stringers inside
    a = math.radians(i * 15)
    beam((math.cos(a) * (R - 0.09), math.sin(a) * (R - 0.09), Z_AFT + 0.05), (math.cos(a) * (R - 0.09), math.sin(a) * (R - 0.09), Z_TANK0 - 0.3), 0.05, 0.06, "alu")

# --- auxiliary propulsion system pods (the stage's small steering rockets), 180 degrees apart ---
part("aps_pods")
for sgn in (1, -1):
    x = sgn * (R + 0.42)
    prof = [(0.0, -1.35), (0.34, -1.3), (0.46, -1.0), (0.46, 0.5), (0.36, 1.0), (0.16, 1.4), (0.0, 1.55)]
    revolve(prof, (x, 0, Z_AFT + 1.75), m="white", n=14)
    box((0.5, 0.62, 2.3), (sgn * (R + 0.1), 0, Z_AFT + 1.55), m="white")
    for dz in (-0.75, -0.45):  # roll / yaw thrusters, pointing sideways
        for sy in (1, -1):
            cyl(0.085, 0.24, (x, sy * 0.52, Z_AFT + 1.75 + dz), (90 * sy, 0, 0), "darkalu", n=10, r2=0.04)
    cyl(0.1, 0.3, (x + sgn * 0.5, 0, Z_AFT + 0.95), (0, 90 * sgn, 0), "darkalu", n=10, r2=0.05)  # pitch thruster, pointing out
    cyl(0.11, 0.32, (x, 0, Z_AFT + 0.28), (180, 0, 0), "darkalu", n=10, r2=0.05)  # ullage thruster, pointing aft

# --- ullage motor fairings (their solid rockets were dropped after use; the fairings stayed) ---
part("ullage_fairings")
for sgn in (1, -1):
    y = sgn * (R + 0.16)
    revolve([(0.0, -0.75), (0.22, -0.6), (0.24, 0.3), (0.12, 0.7), (0.0, 0.85)], (0, y, Z_AFT + 1.1), m="white", n=12)

# --- the big tank section: liquid hydrogen above, liquid oxygen below, one shared wall between ---
part("hydrogen_tank")
revolve([(R, Z_TANK0), (R, Z_TANK1)], m="white", n=48)
for z in (Z_TANK0 + 0.02, Z_TANK0 + 2.7, Z_TANK0 + 5.4, Z_TANK1 - 0.02):  # ring frames
    torus(R + 0.005, 0.03, (0, 0, z), m="alu", n=48, nm=6)
fd = []  # forward dome of the hydrogen tank, seen through the open top
for i in range(0, 9):
    a = math.pi / 2 * i / 8
    fd.append((R * 0.985 * math.cos(a), Z_TANK1 + 1.0 + 1.9 * math.sin(a)))
revolve(fd, m="gold", n=40)
cyl(0.35, 0.12, (0, 0, Z_TANK1 + 2.93), m="alu", n=16)  # tank access cover

# --- systems tunnel (wiring and pipes run up the outside) and propellant lines ---
part("systems_tunnel")
a = math.radians(35)
box((0.34, 0.5, Z_TANK1 - Z_TANK0 + 1.6), (math.cos(a) * (R + 0.14), math.sin(a) * (R + 0.14), (Z_TANK0 + Z_TANK1) / 2), (0, 0, 35), "white")
a2 = math.radians(215)
tube([(math.cos(a2) * (R + 0.1), math.sin(a2) * (R + 0.1), Z_TANK0 + 0.3), (math.cos(a2) * (R + 0.1), math.sin(a2) * (R + 0.1), Z_TANK1 - 1.0)], 0.09, "alu", 8)  # hydrogen vent line
for d in (150, 330):  # non-propulsive vents near the top
    aa = math.radians(d)
    cyl(0.11, 0.3, (math.cos(aa) * (R + 0.12), math.sin(aa) * (R + 0.12), Z_TANK1 - 0.6), (0, 90, d), "alu", n=10)

# --- forward skirt, with roll pattern ---
part("forward_skirt")
for i in range(8):
    revolve([(R, Z_TANK1), (R, Z_FWD)], m="black" if i in (2, 6) else "white", n=48, arc=45, start=i * 45 - 22.5)
revolve([(R - 0.05, Z_FWD), (R - 0.05, Z_TANK1 + 0.9)], m="darkalu", n=48)  # inside
for x, y, z, a in ring_of(4, R + 0.03, Z_FWD - 0.9, 45):  # telemetry antennas
    box((0.06, 0.3, 0.45), (x, y, z), (0, 0, a), "alu")

# --- Instrument Unit: the ring of computers that steered the whole Saturn V ---
part("instrument_unit")
revolve([(R, Z_FWD), (R, Z_IU)], m="darkalu", n=48)
revolve([(R - 0.04, Z_IU), (R - 0.04, Z_FWD)], m="alu", n=48)  # inside wall
revolve([(R - 0.04, Z_IU), (R, Z_IU)], m="alu", n=48)  # top edge
for i, (x, y, z, a) in enumerate(ring_of(16, R - 0.3, Z_FWD + 0.45, 11.25)):  # equipment boxes on cold plates inside
    box((0.42, 0.7, 0.62) if i % 3 else (0.5, 0.75, 0.7), (x, y, z), (0, 0, a), "gold" if i % 4 == 0 else ("black" if i % 4 == 2 else "alu"))
sphere(0.33, (R - 0.75, 1.1, Z_FWD + 0.4), "alu", seg=14, ring=8)  # guidance platform's gas sphere
for x, y, z, a in ring_of(4, R + 0.035, Z_FWD + 0.45, 0):  # command antennas outside
    box((0.07, 0.28, 0.28), (x, y, z), (0, 0, a), "white")

finish(
    "sivb",
    "Saturn V third stage (S-IVB) with Instrument Unit",
    "Saturn V S-IVB-500 as it hit the Moon on Apollo 13 to 17: 6.6 m across and about 17.8 m long. One J-2 engine "
    "(bell, turbopumps, start tank) under the thrust-structure cone, aft skirt with the two auxiliary propulsion pods "
    "and ullage-motor fairings, white tank section with systems tunnel, forward skirt, and the Instrument Unit ring "
    "with its equipment boxes. The top is open (the Apollo spacecraft and adapter panels had left), showing the "
    "hydrogen tank's forward dome. Simplified: roll-pattern markings are approximate.",
    covers=["S-IVB"],
)
