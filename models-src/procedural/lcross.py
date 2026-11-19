# LCROSS Shepherding Spacecraft, as it followed its Centaur into Cabeus crater on 9 October 2009.
# References:
#   NASA NSSDCA LCROSS (2009-031B): https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2009-031B
#     (built on an ESPA ring 1.58 m across; nine science instruments; hydrazine thrusters; two S-band omni and
#     two medium-gain antennas).
#   Ennico et al., "The Lunar Crater Observation and Sensing Satellite (LCROSS) Payload Development and Performance
#     in Flight", Space Science Reviews 2012 (doi 10.1007/s11214-011-9753-4): the spacecraft stood 2 m tall, its basic
#     structure was 2.6 m across, and 3.3 m from omni antenna to omni antenna; six panels on the ESPA ring, numbered
#     with the solar array as R1 and the science payload on R6; the propellant tank sat in the middle of the ring.
#   NASA/Ames LCROSS mission papers (NTRS 20100026403): eight 5 N attitude thrusters and two 22 N thrusters.
#   CSA Engineering: the ESPA ring is 62 in (1.575 m) across and 24 in (0.61 m) high.
# Layout (metres, Z up along the ring's axis; the science instruments look down, the way it fell): gold-blanketed
#   ESPA ring with its six round ports, the hydrazine tank through its middle, and six flat panels standing round it
#   in a hexagon on struts: the tall solar array (R1), four radiator panels with electronics boxes behind them
#   (R2 to R5), and the payload panel (R6) with its row of cameras and spectrometers. Two omni antennas on booms,
#   two medium-gain antennas, two thruster posts with attitude thrusters, and two bigger thrusters on the ring.
# Layout checked against the labelled diagram on the NSSDCA LCROSS page (planetary/thumbnail/lcross_diagram.gif):
#   the ring with the propellant tank in its middle, six panels around it (the solar array, the payload panel
#   R6, equipment panels) and the star tracker.
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import *

reset()
RR = 0.80  # ring's outer wall (1.575 m bolt circle)
H = 0.61  # ring height
D = 1.13  # centre of the ring to the middle of each panel (2.6 m across the panels' corners)


def pol(r, deg, z=0.0):
    a = math.radians(deg)
    return (r * math.cos(a), r * math.sin(a), z)


def on_panel(deg, t, z, out=0.0):
    """A point on the panel at `deg`: t metres along it (sideways), z up, `out` metres outward from its face."""
    a = math.radians(deg)
    r = D + out
    return (r * math.cos(a) - t * math.sin(a), r * math.sin(a) + t * math.cos(a), z)


# --- ESPA ring: a rocket's ride-share ring used as the spacecraft's backbone ---
part("espa_ring")
revolve([(RR, -H / 2), (RR, H / 2)], m="gold", n=48)
revolve([(RR - 0.03, H / 2), (RR - 0.03, -H / 2)], m="alu", n=48)  # inside wall
for s in (1, -1):  # bolting flanges top and bottom
    z = s * H / 2
    revolve([(RR - 0.03, z - 0.015), (RR + 0.07, z - 0.015), (RR + 0.07, z + 0.015), (RR - 0.03, z + 0.015)][:: s], m="alu", n=48)
for k in range(6):  # the six round ports where small satellites would normally bolt on
    x, y, z = pol(RR + 0.012, k * 60)
    cyl(0.215, 0.05, (x, y, z), (0, 90, k * 60), "alu", n=24)
    x, y, z = pol(RR + 0.04, k * 60)
    cyl(0.17, 0.012, (x, y, z), (0, 90, k * 60), "darkalu", n=24)

# --- hydrazine tank through the middle of the ring (306 kg of propellant at launch) ---
part("propellant_tank")
capsule_tank(0.5, 1.3, (0, 0, 0), m="foil_silver", n=28, dome=1.0)
torus(0.505, 0.02, (0, 0, 0), m="alu", n=28, nm=6)  # mounting ring round its middle
for k in range(6):
    strut(pol(0.52, k * 60 + 30), pol(RR - 0.03, k * 60 + 30), 0.018, "alu", 6)
cyl(0.05, 0.1, (0, 0, -0.68), m="alu", n=10)  # outlet and lines at the bottom
tube([(0, 0, -0.7), (0.3, 0.1, -0.62), pol(RR - 0.05, 20, -0.36)], 0.012, "alu", 6)


def panel_struts(deg, zs=(-0.3, 0.3), ts=(-0.38, 0.38)):
    for z in zs:
        for t in ts:
            strut(pol(RR + 0.05, deg + math.degrees(math.atan2(t * 0.45, RR)), z * 0.6), on_panel(deg, t, z, -0.02), 0.014, "alu", 6)


# --- R1: the solar array, one fixed panel as tall as the spacecraft ---
part("solar_array")
plate(1.3, 1.95, 0.03, pol(D, 0), (90, 0, 90), "cell", "alu", 0.025, back="white")
for t in (-0.325, 0.0, 0.325):  # joins between the strings of cells
    box((0.006, 0.012, 1.9), on_panel(0, t, 0, 0.012), (0, 0, 0), "alu")
for z in (-0.49, 0.0, 0.49):
    box((0.006, 1.25, 0.012), on_panel(0, 0, z, 0.012), (0, 0, 0), "alu")
panel_struts(0, zs=(-0.3, 0.3))
for s in (1, -1):  # stiffening ribs behind
    box((0.05, 0.05, 1.9), on_panel(0, s * 0.45, 0, -0.045), (0, 0, 0), "alu")

# --- R2 to R5: radiator panels with the batteries, power, computer and radio boxes behind them ---
part("equipment_panels")
boxes = {
    60: [((0.3, 0.42, 0.3), -0.3, 0.1, "gold"), ((0.3, 0.42, 0.3), 0.25, 0.1, "gold"), ((0.14, 0.3, 0.2), 0.0, -0.32, "black")],  # R2: batteries
    120: [((0.26, 0.6, 0.36), 0.0, 0.12, "black"), ((0.16, 0.3, 0.2), -0.3, -0.3, "gold"), ((0.14, 0.24, 0.18), 0.3, -0.3, "alu")],  # R3: power electronics
    180: [((0.28, 0.5, 0.42), -0.2, 0.05, "gold"), ((0.2, 0.26, 0.26), 0.33, 0.15, "black"), ((0.16, 0.2, 0.16), 0.3, -0.28, "alu")],  # R4: flight computer, gyros
    240: [((0.2, 0.36, 0.3), -0.25, 0.12, "black"), ((0.2, 0.36, 0.3), 0.22, 0.12, "alu"), ((0.14, 0.5, 0.14), 0.0, -0.32, "gold")],  # R5: radio transponder, amplifier
}
for deg, items in boxes.items():
    plate(1.2, 1.1, 0.03, pol(D, deg), (90, 0, deg + 90), "silver", "alu", 0.03, back="foil_black")
    for (sz, t, z, m) in items:
        box(sz, on_panel(deg, t, z, -0.015 - sz[0] / 2), (0, 0, deg), m)
    panel_struts(deg)

# --- R6: the science payload panel (five cameras, three spectrometers and a light meter, all looking down) ---
part("science_payload")
PD = 300
plate(1.2, 1.1, 0.03, pol(D, PD), (90, 0, PD + 90), "foil_black", "alu", 0.03, back="foil_black")
panel_struts(PD)
box((0.2, 0.34, 0.22), on_panel(PD, -0.32, 0.3, 0.115), (0, 0, PD), "gold")  # data handling unit
box((0.16, 0.3, 0.2), on_panel(PD, 0.2, 0.32, 0.095), (0, 0, PD), "alu")  # visible spectrometer
box((0.14, 0.24, 0.16), on_panel(PD, 0.34, 0.05, 0.085), (0, 0, PD), "black")  # near-infrared spectrometers' electronics
box((0.16, 1.0, 0.02), on_panel(PD, 0, -0.33, 0.095), (0, 0, PD), "alu")  # the bench the optics sit on


def looker(t, body, lens_r, lens_len, m="black", zb=-0.33):
    """An instrument on the bench: a box with a lens barrel pointing straight down."""
    bx, by, bz = body
    box(body, on_panel(PD, t, zb - 0.01 - bz / 2, 0.095), (0, 0, PD), m)
    x, y, z = on_panel(PD, t, zb - 0.01 - bz - lens_len / 2, 0.095)
    cyl(lens_r, lens_len, (x, y, z), (0, 0, 0), "darkalu", n=14)
    cyl(lens_r * 0.8, 0.004, (x, y, z - lens_len / 2 - 0.001), (0, 0, 0), "glass", n=14)


looker(-0.42, (0.09, 0.09, 0.1), 0.03, 0.06, "alu")  # visible camera
looker(-0.28, (0.08, 0.08, 0.09), 0.028, 0.07, "gold")  # near-infrared camera 1
looker(-0.16, (0.08, 0.08, 0.09), 0.028, 0.07, "gold")  # near-infrared camera 2
looker(-0.03, (0.1, 0.1, 0.1), 0.036, 0.05, "black")  # mid-infrared camera 1
looker(0.1, (0.1, 0.1, 0.1), 0.036, 0.05, "black")  # mid-infrared camera 2
looker(0.23, (0.06, 0.06, 0.05), 0.022, 0.12, "alu")  # near-infrared spectrometer's telescope
looker(0.33, (0.06, 0.06, 0.05), 0.02, 0.1, "alu")  # visible spectrometer's telescope
looker(0.43, (0.07, 0.07, 0.08), 0.03, 0.05, "gold")  # light meter (total luminance photometer)
x, y, z = on_panel(PD, 0.47, 0.42, 0.06)
cyl(0.025, 0.1, (x, y, z), (0, 90, PD + 60), "alu", n=10)  # second near-infrared spectrometer, looking sideways at the Sun through the plume

# --- two omni antennas on booms, 3.3 m tip to tip ---
part("omni_antennas")
for deg in (90, 270):
    strut(pol(RR + 0.07, deg), pol(1.52, deg), 0.02, "alu", 8)
    strut(pol(RR + 0.07, deg, 0.25), pol(1.3, deg, 0.02), 0.012, "alu", 6)
    x, y, z = pol(1.56, deg)
    cyl(0.07, 0.03, pol(1.52, deg), (0, 90, deg), "alu", n=14)
    cyl(0.05, 0.13, pol(1.585, deg), (0, 90, deg), "white", n=14, r2=0.012)

# --- two medium-gain antennas, pointing back at Earth ---
part("medium_gain_antennas")
for deg in (30, 210):
    strut(pol(RR + 0.06, deg, H / 2), pol(1.2, deg, 0.72), 0.016, "alu", 6)
    strut(pol(RR + 0.06, deg + 12, H / 2), pol(1.2, deg, 0.72), 0.012, "alu", 6)
    box((0.14, 0.14, 0.02), pol(1.2, deg, 0.73), (0, 0, deg), "alu")
    cyl(0.07, 0.2, pol(1.2, deg, 0.84), (0, 0, 0), "white", n=16, r2=0.085)  # short helix antenna under its cover
    cyl(0.085, 0.012, pol(1.2, deg, 0.946), (0, 0, 0), "white", n=16)

# --- thrusters: two posts with four small attitude thrusters each, and two bigger ones for changing course ---
part("thrusters")
for deg in (150, 330):
    px, py, _ = pol(1.3, deg)
    strut((px, py, -0.93), (px, py, 0.93), 0.018, "alu", 8)
    for s in (1, -1):
        strut(pol(RR + 0.06, deg, s * H / 2), (px, py, s * 0.8), 0.014, "alu", 6)
        strut(pol(RR + 0.06, deg, s * H / 2), (px, py, s * 0.3), 0.012, "alu", 6)
        box((0.09, 0.09, 0.07), (px, py, s * 0.93), (0, 0, deg), "gold")
        a = math.radians(deg)
        for side in (1, -1):  # a pair at each end, pointing opposite ways round the ring
            tx, ty = -math.sin(a) * side, math.cos(a) * side
            cyl(0.024, 0.07, (px + tx * 0.075, py + ty * 0.075, s * 0.93), (-90 * side, 0, deg), "darkalu", n=10, r2=0.01)
for deg in (90, 270):  # the two 22 N thrusters on the ring's top edge
    x, y, z = pol(RR + 0.02, deg + 25, H / 2 + 0.06)
    box((0.1, 0.1, 0.07), (x, y, H / 2 + 0.05), (0, 0, deg + 25), "gold")
    cyl(0.045, 0.12, (x, y, H / 2 + 0.14), (0, 0, 0), "darkalu", n=12, r2=0.018)

# --- star tracker: a small camera that finds the spacecraft's direction from the stars ---
part("star_tracker")
x, y, z = on_panel(240, 0.3, 0.58, -0.08)
box((0.12, 0.12, 0.1), (x, y, z - 0.03), (0, 0, 240), "black")
ax, ay, az = on_panel(240, 0.3, 0.72, 0.06)
strut((x, y, z), (ax, ay, az), 0.05, "foil_black", 14, r2=0.075)  # its baffle, tilted up and out

finish(
    "lcross",
    "LCROSS Shepherding Spacecraft",
    "LCROSS as it fell into Cabeus crater in 2009: 2 m tall, 2.6 m across its panels and 3.3 m from omni antenna to "
    "omni antenna. Gold-blanketed ESPA ring (1.58 m) with six ports, the hydrazine tank through its middle, and six "
    "panels on struts: the fixed solar array (R1), four radiator panels with electronics boxes behind them, and the "
    "payload panel (R6) with five cameras, spectrometer telescopes and the light meter looking down. Two omni antennas "
    "on booms, two medium-gain antennas, two thruster posts and two 22 N thrusters. Simplified: box layout, strut "
    "positions and exact instrument placement are representative.",
    covers=["LCROSS Shepherding"],
)
