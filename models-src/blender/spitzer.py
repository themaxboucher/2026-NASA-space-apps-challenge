# Spitzer Space Telescope (2003-2020)
# Reference: NSSDCA 2003-038A, Spitzer Observatory Manual / "Spitzer Space Telescope Handbook"
#   (IRSA), JPL/Ball Aerospace observatory diagram.
# Key dimensions used (metres):
#   overall height ~4.45, diameter ~2.1; mass 950 kg
#   spacecraft bus: octagonal, ~2.0 m across x ~0.8 m tall, bipod truss to the CTA
#   cryogenic telescope assembly (CTA): outer shell ~1.3 m dia x ~3.0 m, black on the anti-sun side
#     (radiates to space), shiny/silvered on the sun side; 85 cm beryllium telescope, aperture at top
#   solar panel / sunshade: flat ~2.1 m wide x ~3.6 m tall, cells facing the Sun, standing beside the CTA
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

reset()
# bus
cyl(1.0, 0.8, (0, 0, 0.4), m="gold", n=8)
cyl(1.01, 0.04, (0, 0, 0.82), m="alu", n=8)
for k in range(8):                      # side radiator panels
    a = math.radians(45 * k + 22.5)
    box((0.5, 0.01, 0.5), (0.93 * math.cos(a), 0.93 * math.sin(a), 0.4), (0, 0, 45 * k + 22.5 + 90), "silver")
# bipod truss
for k in range(6):
    a = math.radians(60 * k)
    b = math.radians(60 * k + 30)
    strut((0.6 * math.cos(a), 0.6 * math.sin(a), 0.84), (0.55 * math.cos(b), 0.55 * math.sin(b), 1.15), 0.02, "white")
cyl(0.62, 0.04, (0, 0, 1.15), m="darkalu", n=24)
# CTA outer shell: black half (anti-sun) and silver half (sun side, +X)
ZS = 1.15
H = 3.05
cyl(0.65, H, (0, 0, ZS + H / 2), m="black", n=32)
# silvered sun-side half: a half-cylinder slightly outside
verts, faces = [], []
n = 16
for i in range(n + 1):
    a = math.radians(-90 + 180 * i / n)
    for z in (ZS, ZS + H):
        verts.append((0.655 * math.cos(a), 0.655 * math.sin(a), z))
for i in range(n):
    faces.append((2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1))
mesh(verts, faces, "silver", "sunside")
# aperture (open, dark interior) + secondary mirror spider
cyl(0.6, 0.02, (0, 0, ZS + H + 0.005), m="darkalu", n=32)
torus(0.63, 0.03, (0, 0, ZS + H), m="alu", n=32, nm=6)
for k in range(3):
    a = math.radians(120 * k)
    strut((0, 0, ZS + H - 0.3), (0.55 * math.cos(a), 0.55 * math.sin(a), ZS + H - 0.02), 0.012, "alu")
cyl(0.08, 0.06, (0, 0, ZS + H - 0.3), m="alu", n=12)
# solar panel / sunshade on +X side
PX = 1.05
plate(3.6, 2.1, 0.04, (PX, 0, 0.75 + 1.8), (0, 90 - 6, 0), "cell", "white", 0.05)
strut((0.95, 0.7, 0.8), (0.7, 0.7, 0.3), 0.025, "white")
strut((0.95, -0.7, 0.8), (0.7, -0.7, 0.3), 0.025, "white")
strut((0.6, 0, ZS + 2.6), (PX - 0.2, 0, ZS + 2.6), 0.02, "white")
# star tracker / sun sensors on the bus (anti-sun side)
box((0.25, 0.2, 0.25), (-0.75, 0.3, 0.95), m="white")
cyl(0.06, 0.15, (-0.75, 0.3, 1.13), m="black", n=10)
# high-gain antenna (fixed, bottom of bus)
dish(0.32, 0.08, (-0.3, 0, -0.0), (180, 0, 0), "white", n=16, rings=2)

finish("spitzer", "Spitzer Space Telescope",
       "Spitzer: octagonal bus, bipod truss, cryogenic telescope assembly with black anti-sun / silver sun-side "
       "shell and open 85 cm aperture, flat solar panel-sunshade, bottom high-gain antenna. Stood upright.")
