# Sojourner rover (Mars Pathfinder Microrover Flight Experiment, 1997)
# References (NASA/JPL, public domain):
#   Mars Pathfinder Landing press kit (JPL, July 1997) - "65 cm long by 48 cm wide by 30 cm tall",
#     wheels "13 centimeters in diameter, made of aluminum, stainless steel tread and cleats",
#     0.2 m^2 solar array, rocker-bogie without springs, APXS at the rear
#   PIA01551 "Newly Deployed Sojourner Rover", PIA04421 "Rover Family Photo" (flight spare Marie Curie
#     beside a MER), PIA01120 "Pathfinder on Mars"
# Layout (metres, X forward, Z up): wheel centres x = +0.26 / 0 / -0.26, y = +-0.205; WEB 0.40 x 0.28 x 0.115
#   on rocker-bogie links that sit in a plane just inside the wheels; solar panel 0.56 x 0.38 on short
#   standoffs above the WEB (top at 0.30 m); whip antenna at the rear right rises to ~0.55 m.
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from shapes import tube, cells

reset()
mat("socell", (0.03, 0.035, 0.06), 0.3, 0.25)       # GaAs cells (near black, slight blue)
mat("webgold", (0.78, 0.58, 0.24), 0.55, 0.35)      # gold-coated warm electronics box
WR, WW = 0.065, 0.07
ZW = WR + 0.005                                      # cleat tips touch the ground
YW = 0.24 - WW / 2
YS = 0.155                                           # rocker-bogie plane
XS = (0.26, 0.0, -0.26)

for x in XS:
    for s in (-1, 1):
        y = s * YW
        cyl(WR, WW, (x, y, ZW), (90, 0, 0), "alu", n=24)
        cyl(0.028, WW + 0.008, (x, y, ZW), (90, 0, 0), "darkalu", n=12)          # hub
        for k in range(18):                                                      # stainless cleats
            a = 2 * math.pi * k / 18
            box((0.006, WW - 0.004, 0.009), (x + (WR + 0.0005) * math.sin(a), y, ZW + (WR + 0.0005) * math.cos(a)),
                (0, math.degrees(a), 0), "silver")
        for yy in (y - s * (WW / 2 - 0.004), y + s * (WW / 2 - 0.004)):           # tread rims
            torus(WR - 0.001, 0.003, (x, yy, ZW), (90, 0, 0), "silver", n=24, nm=4)
        # axle stub from the link plane into the hub, and the wheel leg up to the link joint
        strut((x, s * (YS - 0.01), ZW), (x, s * (YW - WW / 2 + 0.01), ZW), 0.011, "darkalu", n=8)
        top = 0.17 if x > 0.1 else 0.13
        strut((x, s * YS, ZW - 0.01), (x, s * YS, top), 0.008, "alu", n=8)
        if x > 0.1:                                                              # steering actuator
            cyl(0.017, 0.045, (x, s * YS, top - 0.03), m="darkalu", n=10)

for s in (-1, 1):
    y = s * YS
    tube([(0.26, y, 0.17), (0.06, y, 0.215), (-0.13, y, 0.165)], 0.008, "alu")              # rocker
    tube([(0.0, y, 0.13), (-0.13, y, 0.165), (-0.26, y, 0.13)], 0.008, "alu")               # bogie
    cyl(0.014, 0.03, (-0.13, y, 0.165), (90, 0, 0), "darkalu", n=10)                       # bogie pivot
    strut((0.06, s * 0.135, 0.215), (0.06, s * (YS + 0.012), 0.215), 0.014, "darkalu", n=10)  # rocker pivot

# warm electronics box with its black/white thermal-tape band
box((0.40, 0.28, 0.115), (0, 0, 0.2075), m="webgold")
for i in range(8):
    for s in (-1, 1):
        box((0.05, 0.004, 0.018), (-0.175 + i * 0.05, s * 0.141, 0.165), m="black" if i % 2 else "white")

# solar panel on four standoffs, cells on top
for x in (-0.17, 0.15):
    for y in (-0.1, 0.1):
        cyl(0.006, 0.022, (x, y, 0.274), m="alu", n=6)
PX, PZ = -0.01, 0.285
box((0.56, 0.38, 0.012), (PX, 0, PZ + 0.006), m="alu")
cells([(0, 0), (0.56, 0), (0.56, 0.38), (0, 0.38)], (PX - 0.28, -0.19, PZ + 0.012), (1, 0, 0), (0, 1, 0),
      0.03, 0.0035, "socell", lift=0.0015)
box((0.04, 0.04, 0.003), (PX - 0.2, 0.13, PZ + 0.0135), m="silver")       # material adherence experiment

# front: stereo nav cameras + five laser stripers
for y in (-0.045, 0.045):
    box((0.03, 0.032, 0.03), (0.215, y, 0.232), m="black")
    cyl(0.008, 0.008, (0.234, y, 0.232), (0, 90, 0), "glass", n=10)
for i in range(5):
    box((0.012, 0.018, 0.012), (0.206, -0.1 + i * 0.05, 0.172), m="darkalu")
# rear: colour camera and the APXS on its deployment mechanism
box((0.025, 0.03, 0.025), (-0.2125, 0.08, 0.235), m="black")
tube([(-0.195, 0, 0.215), (-0.26, 0, 0.205), (-0.29, 0, 0.16)], 0.007, "alu")
cyl(0.026, 0.05, (-0.29, 0, 0.135), m="silver", n=14)
cyl(0.02, 0.008, (-0.29, 0, 0.106), m="webgold", n=14)
# UHF whip antenna at the rear right
cyl(0.012, 0.02, (-0.22, 0.13, PZ + 0.022), m="darkalu", n=8)
strut((-0.22, 0.13, PZ + 0.03), (-0.22, 0.13, 0.55), 0.0035, "white", n=6)
sphere(0.007, (-0.22, 0.13, 0.55), "black", seg=8, ring=4)

finish("sojourner", "Sojourner rover",
       "Sojourner (1997) at true size (0.65 x 0.48 m, body 0.30 m tall): six 13 cm aluminium wheels with "
       "stainless cleats on a spring-less rocker-bogie, gold warm electronics box, GaAs solar panel on "
       "standoffs, front stereo cameras and laser stripers, rear APXS and colour camera, UHF whip antenna.")
