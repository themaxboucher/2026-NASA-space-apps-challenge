# Apollo 11 EASEP - Passive Seismic Experiment Package (PSEP)
# References (NASA, public domain): AS11-40-5948/5951 (Aldrin with the deployed PSEP),
#   AS11-40-5953 (close-up from above), Apollo 11 EASEP crew handbook (6 solar panels of 420 cells),
#   Smithsonian NASM A19730062000 (qualification unit: 70 x 64 x 56 cm stowed, each three-piece
#   solar panel 186 x 33 cm extended).
# Dimensions used (metres):
#   primary structure   0.60 x 0.46 x 0.16 deck on low feet, white/aluminium
#   seismometer         23 cm sensor under a copper-coloured aluminised Mylar shroud
#                       (~0.28 dia x 0.30) with a draped thermal skirt on the deck
#   solar arrays        two wings, each 3 panels of 0.62 x 0.33 (1.86 m), on white perforated
#                       rails; tilted ~50 deg, one wing facing east and one west (as photographed)
#   S-band antenna      white ~0.6 m tube on its aiming head, on a mast at the deck corner
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from mathutils import Vector

reset()
COPPER = mat("copper", (0.95, 0.52, 0.26), 0.45, 0.3)   # aluminised Mylar shroud, coppery in photos
BW, BD, BH = 0.60, 0.46, 0.16

# --- primary structure ---
for x in (-0.26, 0.26):
    for y in (-0.19, 0.19):
        box((0.05, 0.05, 0.03), (x, y, 0.015), m="alu")
box((BW, BD, BH - 0.03), (0, 0, 0.03 + (BH - 0.03) / 2), m="white")
box((BW - 0.02, BD - 0.02, 0.008), (0, 0, BH + 0.004), m="silver")        # thermal deck plate
box((0.22, 0.12, 0.012), (0.12, -0.15, BH + 0.01), m="black")             # radiator grid patch
for x in (-0.31, 0.31):                                                    # carry handles
    strut((x, -0.08, BH - 0.02), (x * 1.08, -0.08, BH + 0.05), 0.008, "white", 6)
    strut((x, 0.08, BH - 0.02), (x * 1.08, 0.08, BH + 0.05), 0.008, "white", 6)
    strut((x * 1.08, -0.08, BH + 0.05), (x * 1.08, 0.08, BH + 0.05), 0.008, "white", 6)

# --- seismometer under its thermal shroud ---
Z0 = BH + 0.008
cyl(0.21, 0.045, (0.0, 0.01, Z0 + 0.0225), m=COPPER, n=24, r2=0.145)      # draped skirt (stays on the deck)
cyl(0.14, 0.30, (0.0, 0.03, Z0 + 0.15), m=COPPER, n=24)                   # shroud
cyl(0.135, 0.01, (0.0, 0.03, Z0 + 0.305), m="silver", n=24)               # top cover
for k in range(3):                                                          # white 3-arm top bracket
    a = math.radians(90 + 120 * k)
    box((0.13, 0.03, 0.012), (0.065 * math.cos(a), 0.03 + 0.065 * math.sin(a), Z0 + 0.316),
        (0, 0, math.degrees(a)), "white")
cyl(0.03, 0.04, (0, 0.03, Z0 + 0.33), m="white", n=12)
for dx in (-0.04, 0.04):                                                   # leveling/caging frame
    strut((dx, 0.03, Z0 + 0.305), (dx, 0.03, Z0 + 0.45), 0.004, "alu", 6)
strut((-0.04, 0.03, Z0 + 0.45), (0.04, 0.03, Z0 + 0.45), 0.004, "alu", 6)

# --- S-band antenna: mast, perforated aiming head, white tube ---
MX, MY = -0.24, 0.17
strut((MX, MY, BH), (MX, MY, 0.72), 0.014, "alu", 8)
cyl(0.045, 0.07, (MX, MY, 0.755), m="white", n=12)                         # aiming head
d = Vector((0.45, -0.25, 0.86)).normalized()
base = Vector((MX, MY, 0.79))
strut(base, base + d * 0.62, 0.022, "white", 12)                          # antenna radome tube
# thin handling-tool socket rod with ring (seen beside the shroud)
strut((0.20, 0.17, BH), (0.20, 0.17, 0.55), 0.005, "alu", 6)
torus(0.02, 0.004, (0.20, 0.17, 0.57), (90, 0, 0), "alu", n=10, nm=4)

# --- solar array wings ---
PW, PH, T = 0.62, 0.33, 0.015
TILT = 50
for s in (-1, 1):                      # wings face opposite ways along y, as in AS11-40-5951
    face = -s                          # which way the cells face along y
    ey = face * 0.12                   # lower hinge edge, in front of the deck centre
    x0 = s * (BW / 2 - 0.05)
    x1 = s * (BW / 2 + 0.02 + 3 * PW)
    # white perforated hinge rail along the lower edge, resting on a foot at the outer end
    box((abs(x1 - x0), 0.04, 0.03), ((x0 + x1) / 2, ey, 0.05), m="white")
    for k in range(18):
        xh = s * (BW / 2 + 0.08 + k * 0.1)
        cyl(0.011, 0.042, (xh, ey, 0.05), (90, 0, 0), "darkalu", n=8)     # lightening holes
    box((0.08, 0.08, 0.035), (x1, ey, 0.0175), m="alu")
    th = math.radians(TILT)
    up = Vector((0, -face * math.cos(th), math.sin(th)))   # along the panel, bottom -> top
    for i in range(3):
        xc = s * (BW / 2 + 0.02 + PW * (i + 0.5))
        c = Vector((xc, ey, 0.065)) + up * (PH / 2)
        plate(PW - 0.01, PH, T, tuple(c), (-face * TILT, 0, 0), "cell", "alu", 0.02)
    # hinges between panels and back props down to the regolith
    for i in range(4):
        xj = s * (BW / 2 + 0.02 + PW * i)
        top = Vector((xj, ey, 0.065)) + up * (PH * 0.8)
        foot = Vector((xj, ey - face * 0.30, 0.0))
        strut(top, foot, 0.008, "alu", 6)
        strut(Vector((xj, ey, 0.065)), Vector((xj, ey, 0.065)) + up * PH, 0.009, "white", 6)

drop_uvs()
finish("easep", "Apollo 11 EASEP Passive Seismometer",
       "Apollo 11 Passive Seismic Experiment Package: white deck with copper-Mylar seismometer shroud "
       "and skirt, S-band antenna tube on its aiming mast, and two 1.86 m wings of three solar panels "
       "each on perforated rails, tilted ~50 deg facing east and west.", elev=24, azim=20)
