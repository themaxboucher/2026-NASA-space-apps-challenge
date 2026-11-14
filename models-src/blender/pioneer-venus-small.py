# Pioneer Venus Multiprobe - Small probe (North / Day / Night), entered Venus 9 Dec 1978
# References (NASA, public domain):
#   NSSDCA 1978-078E/F/G: small probes 0.8 m in diameter, pressure vessel 46.7 cm; no parachute - the
#     heat shield stayed on all the way to the surface (the Day probe kept transmitting for 67 min after
#     impact); two yo-yo despin weights on cables
#   ARC-1977-AC77-0376-8 (NASA Ames photo, multiprobe at Hughes, Dec 1976): the three small probes around
#     the large one - ribbed silver conical aft bodies on a dark rim
#   ARC-1978-AC78-0238 (Ames artwork)
# Shape: 45-degree blunted sphere-cone heat shield (nose radius 0.2 m) to the 0.8 m rim, ribbed aft
#   cone; ~0.65 m tall. Small instrument doors and the temperature sensor boom stand out of the aft body.
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from shapes import revolve
from mathutils import Vector

reset()
mat("cphenolic", (0.2, 0.13, 0.08), 0.0, 0.8)
mat("maroon", (0.45, 0.15, 0.1), 0.2, 0.5)
mat("ribbed", (0.84, 0.85, 0.87), 0.6, 0.3)

RN, R, N = 0.2, 0.4, 56
th = math.radians(45)
prof = [(0, 0)]
for k in range(1, 6):
    a = th * k / 5
    prof.append((RN * math.sin(a), RN * (1 - math.cos(a))))
r0, z0 = prof[-1]
zr = z0 + (R - r0) / math.tan(th)
prof += [(R, zr), (R, zr + 0.035), (R - 0.015, zr + 0.045)]
zc = zr + 0.045
prof += [(R - 0.02, zc + 0.005), (0.12, zc + 0.25), (0.11, zc + 0.265), (0.06, zc + 0.27), (0, zc + 0.27)]
mats = [0] * 6 + [1, 1] + [2] * (len(prof) - 9)
ob = revolve(prof, ["cphenolic", "maroon", "ribbed"], n=N, name="smallprobe", mats=mats)
for k in range(24):                                                       # aft-cover ribs
    a = 2 * math.pi * k / 24
    c, sn = math.cos(a), math.sin(a)
    strut(((R - 0.02) * c, (R - 0.02) * sn, zc + 0.005), ((0.12) * c, (0.12) * sn, zc + 0.25), 0.006, "darkalu", n=4)
ztop = zc + 0.27
cyl(0.04, 0.03, (0, 0, ztop + 0.015), m="darkalu", n=12)
# instrument doors / windows on the aft body (net-flux radiometer, nephelometer)
for ang, zz, rr in ((-60, zc + 0.08, 0.035), (60, zc + 0.12, 0.03), (180, zc + 0.1, 0.03)):
    a = math.radians(ang)
    rad = (R - 0.02) + (0.12 - (R - 0.02)) * ((zz - zc - 0.005) / 0.245)
    slope = Vector((math.cos(a) * 0.245, math.sin(a) * 0.245, (R - 0.02 - 0.12))).normalized()
    p = Vector((rad * math.cos(a), rad * math.sin(a), zz))
    q = Vector((0, 0, 1)).rotation_difference(slope)
    o = cyl(rr, 0.03, tuple(p), m="black", n=12); o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = q
# atmosphere-structure temperature sensor boom
a = math.radians(120)
b0 = Vector((0.3 * math.cos(a), 0.3 * math.sin(a), zc + 0.06))
strut(tuple(b0), tuple(b0 + Vector((math.cos(a), math.sin(a), 0.6)).normalized() * 0.14), 0.006, "alu", n=6)
# yo-yo despin weights on their cables, wrapped round the shoulder band
for s in (-1, 1):
    torus(R + 0.004, 0.004, (0, 0, zr + 0.018 + s * 0.008), m="darkalu", n=N, nm=4)
    sphere(0.025, (s * (R + 0.02), 0, zr + 0.018), "darkalu", seg=10, ring=6)

finish("pioneer-venus-small", "Pioneer Venus Small Probe",
       "Pioneer Venus small probe at true size (0.8 m across, ~0.65 m tall): dark 45-degree heat shield that "
       "stayed on all the way to the surface, maroon shoulder band with the yo-yo despin weights, ribbed "
       "silver aft body with instrument windows and the temperature-sensor boom. The 0.47 m titanium "
       "pressure sphere sits inside.")
