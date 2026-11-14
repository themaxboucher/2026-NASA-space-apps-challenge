# Pioneer Venus Multiprobe - Large probe ("Sounder"), entered Venus 9 Dec 1978
# References (NASA, public domain):
#   NSSDCA 1978-078D: large probe about 1.5 m in diameter; titanium pressure vessel 73.2 cm across
#   ARC-1977-AC77-0376-8 (NASA Ames photo, multiprobe at Hughes, Dec 1976): large probe on top of the bus -
#     finely ribbed silver conical aft cover over a red-brown band at the shoulder
#   ARC-1978-AC78-0238, ARC-1982-AC82-0178 (Ames artwork of the probes after release)
# Shape: 45-degree blunted sphere-cone heat shield (nose radius 0.37 m) to the 1.5 m rim, shoulder band,
#   ribbed conical aft cover; ~1.1 m tall. Shown as it entered (the aeroshell and aft cover were shed on the
#   parachute, so only the sphere inside reached the surface).
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from shapes import revolve
from mathutils import Vector

reset()
mat("cphenolic", (0.2, 0.13, 0.08), 0.0, 0.8)
mat("maroon", (0.5, 0.16, 0.1), 0.2, 0.5)
mat("ribbed", (0.84, 0.85, 0.87), 0.6, 0.3)

RN, R, N = 0.37, 0.75, 72
th = math.radians(45)
prof = [(0, 0)]
for k in range(1, 7):
    a = th * k / 6
    prof.append((RN * math.sin(a), RN * (1 - math.cos(a))))
r0, z0 = prof[-1]
zr = z0 + (R - r0) / math.tan(th)
prof += [(R, zr), (R, zr + 0.06), (R - 0.02, zr + 0.07)]              # shoulder band
zc = zr + 0.07
prof += [(R - 0.03, zc + 0.01), (0.2, zc + 0.4), (0.19, zc + 0.42), (0.12, zc + 0.43), (0, zc + 0.43)]
mats = [0] * 7 + [1, 1] + [2] * (len(prof) - 10)
ob = revolve(prof, ["cphenolic", "maroon", "ribbed"], n=N, name="largeprobe", mats=mats)
for k in range(36):                                                       # aft-cover ribs
    a = 2 * math.pi * k / 36
    c, sn = math.cos(a), math.sin(a)
    strut(((R - 0.03) * c, (R - 0.03) * sn, zc + 0.01), ((0.2) * c, (0.2) * sn, zc + 0.4), 0.006, "darkalu", n=4)
ztop = zc + 0.43
# top fittings: spin-up / separation fitting and a small vent
cyl(0.07, 0.05, (0, 0, ztop + 0.025), m="darkalu", n=14)
cyl(0.03, 0.03, (0.12, 0.0, ztop + 0.012), m="darkalu", n=8)
# three separation-mechanism pads on the shoulder (where the probe bolted to the bus)
for k in range(3):
    a = math.radians(120 * k + 30)
    box((0.08, 0.06, 0.05), (0.73 * math.cos(a), 0.73 * math.sin(a), zc + 0.02), (0, 0, 120 * k + 30), "darkalu")

finish("pioneer-venus-large", "Pioneer Venus Large Probe",
       "Pioneer Venus large probe at true size (1.5 m across, ~1.1 m tall) as it entered Venus: dark "
       "45-degree carbon-phenolic heat shield, red-brown shoulder band and the finely ribbed silver conical aft "
       "cover seen in the 1976 Hughes photos. The 0.73 m titanium pressure sphere inside is what reached the "
       "surface.")
