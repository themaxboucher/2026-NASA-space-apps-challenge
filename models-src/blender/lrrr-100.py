# Apollo 11 / 14 Laser Ranging Retro-Reflector (LRRR, 100 corner cubes)
# References (NASA / Smithsonian, public domain / CC0):
#   AS11-40-5952 (Apollo 11 LRRR on the Moon), NASM2020-00365 and NASM-SI-2009-4788
#   (Smithsonian flight-spare LRRR), Tom Murphy's "Lunar Retroreflectors" page (UCSD).
# Dimensions used (metres):
#   array               0.46 x 0.46, 10 x 10 fused-silica corner cubes, 3.8 cm diameter,
#                       in round cavities of an aluminium panel; white-painted box ~0.10 deep
#   pallet              ~0.64 x 0.56 white base (scaled from the NASM photos)
#   supports            front + rear white pedestals tilt the array ~20 deg toward Earth
#   carry handle        U-tube at the rear of the array; aiming/level indicator at the side
#   deployment boom     ~0.85 m square tube, left lying from the pallet to the ground (AS11-40-5952)
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from mathutils import Matrix, Vector

reset()
TILT = 20
R = Matrix.Rotation(math.radians(TILT), 3, 'X')
PIV = Vector((0, 0.0, 0.19))          # array box bottom centre (world)
def P(x, y, z):                         # array-local -> world
    return tuple(PIV + R @ Vector((x, y, z)))
AR = (TILT, 0, 0)

# --- pallet ---
box((0.64, 0.56, 0.03), (0, 0, 0.015), m="white")
for y in (-0.22, 0.22):                                    # side stiffening rails
    box((0.64, 0.03, 0.02), (0, y, 0.04), m="white")
box((0.18, 0.08, 0.03), (0.0, -0.30, 0.02), m="white")     # front carry tray
box((0.16, 0.06, 0.006), (0.0, -0.30, 0.036), m="darkalu")

# --- pedestals (tops buried 1 cm into the box bottom) ---
for y in (-0.13, 0.13):
    top = Vector(P(0, y, 0.01))
    h = top.z - 0.03
    for x in (-0.12, 0.12):
        cyl(0.06, h, (x, top.y, 0.03 + h / 2), (0, 0, 45), "white", n=4, r2=0.035)

# --- array box: white body, aluminium rim, cube panel on top ---
ZT = 0.10                                    # face height above box bottom
box((0.46, 0.46, ZT - 0.04), P(0, 0, (ZT - 0.04) / 2), AR, "white")
for s in (-1, 1):                            # 1 cm aluminium rim around the panel
    box((0.46, 0.01, 0.045), P(0, s * 0.225, ZT - 0.0225), AR, "alu")
    box((0.01, 0.44, 0.045), P(s * 0.225, 0, ZT - 0.0225), AR, "alu")
pitch = 0.044
cen = [((i - 4.5) * pitch, (j - 4.5) * pitch) for i in range(10) for j in range(10)]
ca = cube_array(cen, 0.019, pitch, 0.025)
ca.location = P(0, 0, ZT); ca.rotation_euler = [math.radians(a) for a in AR]
# red-orange thermal stripe on the front face (visible in the NASM photos)
box((0.462, 0.004, 0.012), P(0, -0.2305, ZT - 0.05), AR, mat("orange", (0.75, 0.22, 0.06), 0.0, 0.6))
# pivot rods along the sides
for s in (-1, 1):
    cyl(0.012, 0.04, P(s * 0.25, 0, 0.03), (0, 90, 0), "alu", n=8)

# --- carry handle (U tube rising from the rear of the box) ---
h1, h2 = P(-0.12, 0.23, 0.05), P(0.12, 0.23, 0.05)
t1, t2 = P(-0.12, 0.30, 0.17), P(0.12, 0.30, 0.17)
strut(h1, t1, 0.008, "alu", 8); strut(h2, t2, 0.008, "alu", 8); strut(t1, t2, 0.008, "alu", 8)

# --- aiming / level indicator on the right side of the pallet ---
box((0.10, 0.10, 0.02), (0.27, 0.16, 0.04), m="white")
box((0.004, 0.08, 0.14), (0.30, 0.16, 0.12), m="white")        # graduated scale plate
strut((0.29, 0.16, 0.05), (0.29, 0.14, 0.2), 0.003, "darkalu", 6)  # pointer wire
cyl(0.02, 0.012, (0.26, 0.20, 0.056), m="glass", n=12)          # bubble level

# --- deployment boom lying on the ground (left side) ---
b0, b1 = Vector((-0.32, -0.05, 0.05)), Vector((-1.12, -0.25, 0.012))
strut(b0, b1, 0.012, "alu", 4)
box((0.05, 0.05, 0.03), (-0.32, -0.05, 0.05), m="darkalu")      # boom socket on the pallet
strut(b1 + Vector((0, -0.09, 0)), b1 + Vector((0, 0.09, 0)), 0.01, "alu", 4)  # T-handle end

drop_uvs()
finish("lrrr-100", "Laser Ranging Retro-Reflector (Apollo 11/14)",
       "Apollo 11/14 LRRR: 46 cm square panel of 100 corner cubes (10x10, 3.8 cm) in round "
       "aluminium cavities, white box tilted ~20 deg on two pedestals over a white pallet, carry "
       "handle, level indicator and the deployment boom left lying beside it as in AS11-40-5952.",
       elev=30, azim=25)
