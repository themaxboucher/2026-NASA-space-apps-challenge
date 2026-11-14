# Pioneer Venus Orbiter (Pioneer 12), orbited Venus 1978-1992, burned up in its atmosphere
# References (NASA, public domain):
#   NSSDCA 1978-051A: flat cylinder 2.53 m in diameter and 1.22 m high, solar cells on the sides,
#     1.09 m despun high-gain dish on a mast, magnetometer on a 4.7 m boom, Star-24 orbit insertion motor
#   ARC-1981-AC81-0787 (Ames painting of the orbiter over Venus): blue-violet solar-cell drum, gold
#     equipment deck, gold despun mast carrying the dish with an omni antenna above, boom off the deck
#   ARC-1982-AC82-0178 (Ames "Pioneer Family" painting): cell mosaic with silver bands top and bottom
#   ARC-1977-AC77-0376-8 (multiprobe bus at Hughes - same HS-507 drum, blue/black cell mosaic)
# Stood upright: motor nozzle at the bottom, dish mast on top. Boom shown deployed horizontally.
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from shapes import revolve, tube
from mathutils import Vector

reset()
random.seed(3)
mat("pvcell", (0.1, 0.14, 0.42), 0.3, 0.3)
mat("pvcell2", (0.05, 0.07, 0.22), 0.3, 0.3)
mat("pvcell3", (0.16, 0.2, 0.5), 0.3, 0.3)
mat("mast", (0.8, 0.58, 0.25), 0.55, 0.35)

R, H = 1.265, 1.22
Z0 = 0.34                                   # nozzle height below the drum
ZB, ZT = Z0, Z0 + H
# Star-24 motor nozzle and aft closure
revolve([(0.19, 0.0), (0.15, 0.1), (0.1, 0.22), (0.07, 0.3), (0.2, Z0), (0.0, Z0)], "darkalu", n=24, name="nozzle")
cyl(0.183, 0.01, (0, 0, 0.02), m="black", n=24)                  # nozzle throat seen from below
# drum: silver bands top and bottom, solar-cell mosaic between
NA, NZ = 64, 9
zc0, zc1 = ZB + 0.1, ZT - 0.08
verts, faces, fm = [], [], []
for i in range(NZ + 1):
    for j in range(NA):
        a = 2 * math.pi * j / NA
        verts.append((R * math.cos(a), R * math.sin(a), zc0 + (zc1 - zc0) * i / NZ))
for i in range(NZ):
    for j in range(NA):
        a, b = i * NA + j, i * NA + (j + 1) % NA
        faces.append((a, b, b + NA, a + NA))
        fm.append(random.choice((0, 0, 1, 1, 2)))
drum = mesh(verts, faces, "pvcell", "cells")
drum.data.materials.append(mat("pvcell2")); drum.data.materials.append(mat("pvcell3"))
for p, o in zip(drum.data.polygons, fm):
    p.material_index = o
cyl(R + 0.008, 0.1, (0, 0, ZB + 0.05), m="alu", n=NA)                  # lower band
cyl(R + 0.008, 0.08, (0, 0, ZT - 0.04), m="alu", n=NA)                 # upper band
cyl(R - 0.01, H, (0, 0, ZB + H / 2), m="darkalu", n=NA)                 # inner wall (closes the drum)
for k in range(6):                                                     # instrument windows in the lower band
    a = math.radians(60 * k + 10)
    box((0.12, 0.02, 0.06), ((R + 0.01) * math.cos(a), (R + 0.01) * math.sin(a), ZB + 0.05), (0, 0, 60 * k + 100), "black")
cyl(R - 0.02, 0.03, (0, 0, ZT + 0.015), m="gold", n=NA)                 # gold MLI on the equipment deck
for k in range(5):                                                     # instruments poking up through the deck
    a = math.radians(72 * k + 20)
    box((0.22, 0.16, 0.12), (0.85 * math.cos(a), 0.85 * math.sin(a), ZT + 0.09), (0, 0, 72 * k + 20), "white")
cyl(0.1, 0.12, (0.55, -0.55, ZT + 0.09), m="black", n=12)               # radar mapper port
# despun antenna mast with the 1.09 m high-gain dish and omni antenna on top
ZM = ZT + 0.03
revolve([(0.32, ZM), (0.22, ZM + 0.25), (0.12, ZM + 0.45), (0.1, ZM + 1.25), (0.0, ZM + 1.25)], "mast", n=20, name="mast")
for k in range(3):
    a = math.radians(120 * k + 60)
    strut((0.3 * math.cos(a), 0.3 * math.sin(a), ZM), (0.11 * math.cos(a), 0.11 * math.sin(a), ZM + 0.8), 0.015, "mast", n=6)
ZD = ZM + 1.0
box((0.18, 0.1, 0.3), (0.13, 0, ZD), m="darkalu")                        # dish yoke
dish(0.545, 0.17, (0.22, 0, ZD), (0, 90, 0), "white", n=28, rings=4)
for k in range(4):                                                      # feed support struts
    a = math.radians(90 * k + 45)
    strut((0.22 + 0.17 * (0.5 / 0.545) ** 2, 0.5 * math.cos(a), ZD + 0.5 * math.sin(a)), (0.62, 0, ZD), 0.006, "alu", n=4)
cyl(0.03, 0.06, (0.62, 0, ZD), (0, 90, 0), "darkalu", n=10)
strut((0, 0, ZM + 1.25), (0, 0, ZM + 1.85), 0.018, "alu", n=8)          # omni antenna
cyl(0.04, 0.16, (0, 0, ZM + 1.9), m="white", n=10)
# magnetometer boom (4.7 m) off the deck edge, sensor at the tip
b0 = Vector((-(R - 0.05), 0, ZT - 0.05))
cyl(0.05, 0.12, tuple(b0 + Vector((-0.04, 0, 0))), (0, 90, 0), "darkalu", n=10)
strut(tuple(b0), tuple(b0 + Vector((-4.7, 0, 0))), 0.022, "alu", n=8)
for t in (0.33, 0.66):
    cyl(0.035, 0.05, tuple(b0 + Vector((-4.7 * t, 0, 0))), (0, 90, 0), "darkalu", n=8)
box((0.14, 0.12, 0.12), tuple(b0 + Vector((-4.72, 0, 0))), m="white")

finish("pioneer-venus-orbiter", "Pioneer Venus Orbiter",
       "Pioneer Venus Orbiter at true size: 2.53 m x 1.22 m spinning drum covered in a blue solar-cell mosaic "
       "between silver bands, gold equipment deck, Star-24 motor nozzle below, gold despun mast with the "
       "1.09 m high-gain dish and omni antenna, and the 4.7 m magnetometer boom. Stood upright.", elev=18)
