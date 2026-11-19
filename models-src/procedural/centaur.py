# Atlas V Centaur upper stage (single-engine Centaur) as LCROSS steered it into Cabeus crater on 9 October 2009.
# References:
#   United Launch Alliance, "Atlas V LRO/LCROSS Mission Overview" and Spaceflight Now's launch coverage
#     (https://spaceflightnow.com/atlas/av020/090610lcross.html): Centaur 12.68 m (41.6 ft) long, 3.05 m (10 ft)
#     across, one RL10A-4-2 engine; nominal impact mass 2,305 kg (2,249 to 2,366 kg).
#   NASA NSSDCA LCROSS (2009-031B): https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2009-031B
#   NASA/Ames LCROSS mission papers (NTRS 20100026403): the only physical change to this Centaur was white paint,
#     to keep the empty stage's temperature even on its 113-day trip.
# Layout (metres, Z up, engine down): RL10 engine (bell, chamber, turbopumps) on its thrust struts under the oxygen
#   tank's aft dome, with helium and hydrazine bottles and four small thruster pods around it; the stainless-steel
#   "balloon" tank painted white (liquid oxygen below, liquid hydrogen above, one shared wall between); the hydrogen
#   feed line and wiring tunnel down the outside; the forward adapter ring with its avionics boxes; and the cone that
#   carried the LCROSS spacecraft (and, above it, LRO), open at the top after LCROSS let go.
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import *

reset()
R = 1.525  # 3.05 m across
Z_DOME = 3.05  # where the aft dome meets the tank wall
Z_SPLIT = 4.55  # ring where the oxygen tank ends and the hydrogen tank begins
Z_TOP = 10.45  # top of the tank wall
Z_STUB = 11.10  # top of the forward (stub) adapter
Z_END = 12.68  # top of the payload adapter


def ellipse_dome(r, z_eq, h, up, k=9, shrink=1.0):
    """Profile of a half-ellipsoid dome: equator at z_eq, apex h above (up) or below."""
    pts = []
    for i in range(k + 1):
        a = math.pi / 2 * i / k
        pts.append((r * shrink * math.cos(a), z_eq + (h if up else -h) * math.sin(a)))
    return pts if up else pts[::-1]


# --- RL10A-4-2 engine ---
part("engine")
bell = [(0.585, 0.0), (0.575, 0.2), (0.53, 0.45), (0.47, 0.7), (0.385, 0.95)]  # dark radiation-cooled lower nozzle
revolve(bell, m="darkalu", n=36)
upper = [(0.385, 0.95), (0.30, 1.15), (0.20, 1.35), (0.115, 1.5), (0.085, 1.58), (0.13, 1.68), (0.17, 1.80), (0.17, 1.95), (0.0, 1.95)]  # tube-wall nozzle and chamber
revolve(upper, m="alu", n=36)
revolve([(0.0, 1.5), (0.11, 1.5), (0.295, 1.15), (0.38, 0.95), (0.465, 0.7), (0.525, 0.45), (0.57, 0.2), (0.58, 0.01)], m="black", n=36)  # inside of the bell
for z, r in ((0.02, 0.59), (0.95, 0.392)):
    torus(r, 0.014, (0, 0, z), m="alu", n=36, nm=6)
for z, r in ((1.08, 0.335), (1.22, 0.27), (1.36, 0.2)):  # stiffening bands on the tube wall
    torus(r, 0.012, (0, 0, z), m="darkalu", n=30, nm=6)
torus(0.21, 0.035, (0, 0, 1.47), m="alu", n=24, nm=8)  # fuel inlet manifold
# Turbopump and gearbox beside the chamber, with its ducts.
capsule_tank(0.11, 0.55, (0.36, 0.05, 1.72), (90, 0, 20), "alu", n=12, dome=0.6)  # hydrogen pump and turbine
capsule_tank(0.09, 0.34, (0.33, -0.3, 1.78), (0, 0, 0), "darkalu", n=10, dome=0.6)  # oxygen pump
box((0.2, 0.2, 0.16), (0.36, -0.1, 1.74), (0, 0, 20), "alu")  # gearbox
tube([(0.36, 0.3, 1.72), (0.3, 0.36, 1.55), (0.2, 0.2, 1.47)], 0.035, "alu", 8)
tube([(0.33, -0.3, 1.95), (0.15, -0.2, 2.02), (0.0, 0.0, 1.97)], 0.04, "alu", 8)
tube([(0.42, 0.0, 1.9), (0.3, 0.18, 2.05), (0.1, 0.1, 1.98)], 0.03, "darkalu", 8)
cyl(0.1, 0.22, (0, 0, 2.06), m="darkalu", n=14)  # injector head and gimbal mount
sphere(0.075, (0, 0, 2.2), "alu", seg=12, ring=6)  # gimbal bearing
for sgn in (1, -1):  # the two actuators that swivel the engine
    strut((0.16 * sgn, 0.16, 1.7), (0.52 * sgn, 0.52, 2.42), 0.028, "alu", 8)
    strut((0.16 * sgn, 0.16, 1.7), (0.34 * sgn, 0.34, 2.06), 0.04, "darkalu", 8)

# --- aft bulkhead: the oxygen tank's lower dome, the engine's thrust struts and blankets ---
part("aft_bulkhead")
revolve([(0.0, 2.2)] + ellipse_dome(R, Z_DOME, 0.85, False, shrink=0.995)[1:], m="foil_silver", n=40)
revolve([(R - 0.02, Z_DOME - 0.28), (R + 0.004, Z_DOME - 0.28), (R + 0.004, Z_DOME)], m="alu", n=48)  # aft tank ring (the engine section bolts here)
cyl(0.24, 0.1, (0, 0, 2.21), m="darkalu", n=16)  # oxygen sump under the dome
for x, y, z, a in ring_of(6, 0.8, 2.47, 30):  # thrust struts from the gimbal out to the dome
    strut((0.06 * math.cos(math.radians(a)), 0.06 * math.sin(math.radians(a)), 2.2), (x, y, z), 0.022, "alu", 6)

# --- pressurant and thruster-fuel bottles hung under the dome ---
part("helium_bottles")
for i, (x, y, z, a) in enumerate(ring_of(6, 1.02, 2.18, 0)):
    if i % 3 == 0:  # two hydrazine bottles (gold blanket), four helium spheres (bare composite, dark)
        capsule_tank(0.17, 0.5, (x, y, z - 0.02), (0, 0, 0), "gold", n=12, dome=1.0)
    else:
        sphere(0.21, (x, y, z), "foil_black", seg=14, ring=8)
    strut((x * 0.98, y * 0.98, z + 0.15), (x * 1.04, y * 1.04, z + 0.3), 0.015, "alu", 6)

# --- four pods of small hydrazine thrusters that settle the fuel and turn the stage ---
part("thruster_pods")
for x, y, z, a in ring_of(4, R + 0.06, Z_DOME - 0.2, 45):
    box((0.16, 0.26, 0.22), (x, y, z), (0, 0, a), "foil_silver")
    ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
    cyl(0.045, 0.12, (x, y, z - 0.17), (180, 0, 0), "darkalu", n=10, r2=0.02)  # settling thruster, pointing aft
    for s in (1, -1):  # roll thrusters, pointing sideways round the tank
        cyl(0.035, 0.1, (x - sa * 0.17 * s, y + ca * 0.17 * s, z), (-90 * s, 0, a), "darkalu", n=8, r2=0.016)
    cyl(0.035, 0.1, (x + ca * 0.13, y + sa * 0.13, z), (0, 90, a), "darkalu", n=8, r2=0.016)  # pitch / yaw thruster, pointing out

# --- liquid oxygen tank (the short lower part) ---
part("oxygen_tank")
revolve([(R, Z_DOME), (R, Z_SPLIT)], m="white", n=56)
torus(R + 0.004, 0.022, (0, 0, Z_SPLIT), m="alu", n=56, nm=6)  # ring at the shared bulkhead

# --- liquid hydrogen tank (the long upper part) and its forward dome ---
part("hydrogen_tank")
revolve([(R, Z_SPLIT), (R, Z_TOP)], m="white", n=56)
for z in (Z_SPLIT + 1.95, Z_SPLIT + 3.9):  # weld seams in the thin steel skin
    torus(R + 0.001, 0.008, (0, 0, z), m="grey", n=56, nm=4)
revolve(ellipse_dome(R, Z_TOP, 0.85, True, shrink=0.99) , m="foil_silver", n=40)  # forward dome, seen through the open adapter
cyl(0.2, 0.06, (0, 0, Z_TOP + 0.86), m="alu", n=14)  # forward door

# --- hydrogen feed line, vent line and wiring tunnel down the outside ---
part("feed_lines")
a = math.radians(200)
ca, sa = math.cos(a), math.sin(a)
tube([(ca * (R + 0.09), sa * (R + 0.09), Z_SPLIT + 0.45), (ca * (R + 0.09), sa * (R + 0.09), Z_DOME - 0.1), (ca * 1.15, sa * 1.15, 2.3), (0.36, 0.3, 1.76)], 0.065, "foil_silver", 10)  # hydrogen feed duct to the pump
cyl(0.09, 0.14, (ca * (R + 0.05), sa * (R + 0.05), Z_SPLIT + 0.45), (0, 90, 200), "alu", n=10)  # its outlet on the tank
a = math.radians(70)
ca, sa = math.cos(a), math.sin(a)
box((0.1, 0.2, Z_TOP - Z_DOME + 0.5), (ca * (R + 0.05), sa * (R + 0.05), (Z_TOP + Z_DOME) / 2 + 0.2), (0, 0, 70), "white")  # wiring tunnel
a = math.radians(320)
ca, sa = math.cos(a), math.sin(a)
tube([(ca * (R + 0.04), sa * (R + 0.04), Z_TOP + 0.3), (ca * (R + 0.04), sa * (R + 0.04), Z_SPLIT + 0.3)], 0.03, "alu", 8)  # hydrogen vent line
cyl(0.05, 0.16, (ca * (R + 0.1), sa * (R + 0.1), Z_SPLIT + 0.3), (0, 90, 320), "alu", n=8)  # vent outlet

# --- forward adapter: the ring that carries the stage's computers, batteries and radios ---
part("forward_adapter")
revolve([(R, Z_TOP), (R, Z_STUB)], m="alu", n=56)
revolve([(R - 0.03, Z_STUB), (R - 0.03, Z_TOP + 0.3)], m="darkalu", n=56)
revolve([(R - 0.03, Z_STUB), (R, Z_STUB)], m="alu", n=56)
kinds = ["black", "gold", "alu", "black", "foil_silver", "gold", "alu", "black", "gold", "alu"]
for i, (x, y, z, a) in enumerate(ring_of(10, R + 0.12, Z_TOP + 0.34, 18)):  # avionics boxes round the outside
    if i in (1, 6):
        continue  # (gaps where the tunnel and vent line come up)
    w = 0.5 if i % 2 else 0.38
    box((0.2, w, 0.42 if i % 3 else 0.5), (x, y, z), (0, 0, a), kinds[i])
for x, y, z, a in ring_of(4, R + 0.03, Z_STUB - 0.12, 60):  # S-band antennas
    box((0.05, 0.16, 0.16), (x, y, z), (0, 0, a), "white")

# --- payload adapter: the cone LCROSS rode on (LRO sat on top of LCROSS) ---
part("payload_adapter")
revolve([(R, Z_STUB), (0.83, Z_END - 0.16), (0.83, Z_END)], m="darkalu", n=48)
revolve([(0.79, Z_END), (0.79, Z_END - 0.16), (R - 0.04, Z_STUB + 0.02)], m="black", n=48)  # inside
revolve([(0.79, Z_END), (0.86, Z_END), (0.86, Z_END - 0.05), (0.83, Z_END - 0.05)], m="alu", n=48)  # separation ring where LCROSS let go
for i in range(12):  # stiffeners on the cone
    a = math.radians(i * 30 + 15)
    beam((math.cos(a) * (R - 0.01), math.sin(a) * (R - 0.01), Z_STUB + 0.03), (math.cos(a) * 0.845, math.sin(a) * 0.845, Z_END - 0.18), 0.05, 0.03, "alu")

finish(
    "centaur",
    "Atlas V Centaur upper stage (LCROSS impactor)",
    "Single-engine Atlas V Centaur as it hit Cabeus crater in 2009: 12.68 m long and 3.05 m across. RL10A-4-2 engine "
    "(dark lower nozzle, tube-wall upper nozzle, turbopumps, gimbal actuators) under the oxygen tank's aft dome, with "
    "helium and hydrazine bottles and four thruster pods; the white-painted steel balloon tank (oxygen below, hydrogen "
    "above) with hydrogen feed line, vent line and wiring tunnel; forward adapter ring with avionics boxes; and the "
    "open payload-adapter cone that carried LCROSS. Simplified: bottle count and box layout are representative.",
    covers=["Centaur"],
)
