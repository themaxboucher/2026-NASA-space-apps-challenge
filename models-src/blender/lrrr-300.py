# Apollo 15 Laser Ranging Retro-Reflector (300 corner cubes)
# References (NASA, public domain): AS15-85-11468 (close-up of the cube face), AS15-85-11469
#   (array on the Moon, side view), Wikimedia "Laser Ranging Retroreflector Apollo 15.svg"
#   (layout diagram after NASA SP-289), Tom Murphy's "Lunar Retroreflectors" page (UCSD).
# Dimensions used (metres):
#   300 fused-silica corner cubes, 3.8 cm diameter, hexagonally packed (pitch 3.9 cm)
#     main panel 204 cubes = 12 rows x 17, side panel 96 cubes = 12 rows x 8, hinged together
#   overall array ~1.08 x 0.45 (published ~1.05 m long), white boxes ~0.11 deep with aluminium rims
#   single central pedestal on a foot plate, sun compass on the right end, carry handle at the back
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from mathutils import Matrix, Vector

reset()
TILT = 15
R = Matrix.Rotation(math.radians(TILT), 3, 'X')
PIV = Vector((0, 0, 0.20))
def P(x, y, z):
    return tuple(PIV + R @ Vector((x, y, z)))
AR = (TILT, 0, 0)

p, r = 0.039, 0.0185
dy = p * math.sqrt(3) / 2
ROWS = 12
RIM = 0.021                    # side rims cover the half-cell zigzag (p/2)
RIMY = 0.036                   # front/back rims cover the blank border rows
ys = [(j - (ROWS - 1) / 2) * dy for j in range(-1, ROWS + 1)]   # incl. blank rows -1 and 12
Y0, Y1 = ys[1] - p / math.sqrt(3), ys[ROWS] + p / math.sqrt(3)    # inner rim edges
D = Y1 - Y0

def panel(xL, ncols):
    cen, blanks = [], []
    for jj, y in enumerate(ys):
        j = jj - 1
        off = p / 2 if j % 2 == 0 else p
        if 0 <= j < ROWS:
            cen += [(xL + off + i * p, y) for i in range(ncols)]
            blanks.append((xL, y) if j % 2 else (xL + (ncols + 0.5) * p, y))
        else:
            blanks += [(xL + off + i * p, y) for i in (range(0, ncols + 1) if j % 2 == 0 else range(-1, ncols))]
    ca = cube_array(cen, r, p, 0.024, hexcell=True, blanks=blanks)
    ca.location = PIV; ca.rotation_euler = [math.radians(a) for a in AR]
    W = (ncols + 0.5) * p
    cx, cy = xL + W / 2, (Y0 + Y1) / 2
    # aluminium rim (2 mm proud of the face) + white box below
    for s in (-1, 1):
        box((W + 2 * RIM, RIMY, 0.047), P(cx, cy + s * (D / 2 + RIMY / 2), -0.0215), AR, "alu")
        box((RIM, D, 0.047), P(cx + s * (W / 2 + RIM / 2), cy, -0.0215), AR, "alu")
    box((W + 2 * RIM, D + 2 * RIMY, 0.075), P(cx, cy, -0.0725), AR, "white")
    return W

WS, WM = 8.5 * p, 17.5 * p
GAP = 0.008
total = WS + WM + 4 * RIM + GAP
xs = -total / 2 + RIM                    # side panel inner-left edge
panel(xs, 8)
xm = xs + WS + 2 * RIM + GAP             # main panel inner-left edge
panel(xm, 17)
cy = (Y0 + Y1) / 2
# hinge between the panels
for s in (-1, 1):
    cyl(0.009, 0.05, P(xm - RIM - GAP / 2, cy + s * (D / 2 - 0.03), -0.03), (90 + TILT, 0, 0), "alu", n=8)
cyl(0.006, D + 0.02, P(xs - RIM - 0.006, cy, -0.10), (90 + TILT, 0, 0), "alu", n=8)  # end rod (left)

# --- central pedestal (A-frame) on its foot plate, under the main panel ---
mx = xm + WM / 2 - 0.08
bot = Vector(P(mx, cy, -0.105))
box((0.30, 0.18, 0.015), (mx, bot.y, 0.0075), m="white")
for s in (-1, 1):
    strut((mx + s * 0.09, bot.y, 0.015), (mx + s * 0.05, bot.y, bot.z), 0.016, "white", 8)
strut((mx - 0.05, bot.y, bot.z - 0.02), (mx + 0.05, bot.y, bot.z - 0.02), 0.012, "white", 8)
box((0.14, 0.06, 0.03), P(mx, cy, -0.115), AR, "darkalu")       # gimbal/tilt block

# --- carry handle at the back of the main panel ---
hb = xm + WM / 2
for s in (-1, 1):
    strut(P(hb + s * 0.06, Y1 + RIMY, -0.02), P(hb + s * 0.06, Y1 + RIMY + 0.05, 0.10), 0.007, "alu", 8)
strut(P(hb - 0.06, Y1 + RIMY + 0.05, 0.10), P(hb + 0.06, Y1 + RIMY + 0.05, 0.10), 0.007, "alu", 8)

# --- front grip and data plate on the main panel's front face ---
box((0.16, 0.03, 0.035), P(xm + WM * 0.62, Y0 - RIMY - 0.015, -0.06), AR, "white")
box((0.12, 0.004, 0.03), P(xm + WM * 0.25, Y0 - RIMY - 0.002, -0.07), AR, "darkalu")

# --- sun compass + level on the right end ---
xe = xm + WM + RIM
box((0.05, 0.10, 0.02), P(xe + 0.025, cy - 0.08, -0.04), AR, "white")          # bracket
cyl(0.085, 0.006, P(xe + 0.07, cy - 0.10, -0.03), AR, "white", n=20)           # dial
box((0.03, 0.006, 0.05), P(xe + 0.07, cy - 0.10, -0.002), AR, "darkalu")        # gnomon
cyl(0.015, 0.01, P(xe + 0.10, cy - 0.06, -0.022), AR, "glass", n=10)           # bubble level

drop_uvs()
finish("lrrr-300", "Laser Ranging Retro-Reflector (Apollo 15)",
       "Apollo 15 LRRR: 300 hex-packed corner cubes (3.8 cm) in a 204-cube main panel and a 96-cube "
       "side panel hinged together (~1.08 m long), white boxes with aluminium rims, tilted ~15 deg on "
       "a central A-frame pedestal and foot plate, with carry handle and sun compass.",
       elev=32, azim=20)
