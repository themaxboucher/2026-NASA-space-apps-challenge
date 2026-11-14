# Galileo atmospheric entry probe (entered Jupiter 7 Dec 1995)
# References (NASA, public domain):
#   S89-44175 "Labeled line drawing of Galileo spacecraft's atmospheric probe": deceleration module
#     49 in (1.245 m) across and 34 in (0.86 m) tall - blunt 45-degree cone aeroshell, domed aft cover with
#     a round port; descent module hung from the parachute
#   ARC-1984-AC84-0228-3 (NASA Ames photo): flight-style descent module - polished aluminium shell, upper
#     band with a red-filtered window and round instrument ports, lower hemisphere, flat top with a ring of
#     insulation pads, side brackets; aeroshell with a dark flange
#   NSSDCA 1989-084E
# Shown side by side: the assembled probe resting on its nose (left) and the descent module (right).
#   Descent module diameter (~0.7 m) is scaled from the Ames photo.
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from shapes import revolve
from mathutils import Vector

reset()
mat("cphenolic", (0.16, 0.1, 0.07), 0.0, 0.8)       # carbon-phenolic heat shield
mat("aft", (0.78, 0.66, 0.45), 0.0, 0.7)            # phenolic-nylon aft cover
mat("polished", (0.78, 0.79, 0.8), 0.6, 0.3)
mat("redwin", (0.75, 0.08, 0.06), 0.3, 0.2)

# --- deceleration module: 45 deg sphere-cone, nose radius 0.22, rim r 0.6225, total 0.86 m
X0 = -0.72
RN, R = 0.22, 0.6225
th = math.radians(45)
prof = [(0, 0)]
for k in range(1, 7):                                  # spherical nose cap
    a = th * k / 6
    prof.append((RN * math.sin(a), RN * (1 - math.cos(a))))
r0, z0 = prof[-1]
zr = z0 + (R - r0) / math.tan(th)                      # cone to the rim
prof += [(R, zr), (R + 0.008, zr + 0.02), (R, zr + 0.04)]
# domed aft cover to the top at 0.86
top = 0.86
for k in range(1, 7):
    a = math.pi / 2 * k / 6
    prof.append((R * 0.97 * math.cos(a) if k < 6 else 0.16, zr + 0.04 + (top - 0.02 - zr - 0.04) * math.sin(a)))
prof += [(0.16, top), (0, top)]
nseg = len(prof) - 1
mats = [0] * 9 + [1] * (nseg - 9)
for i in range(nseg):
    if prof[i][1] >= zr and prof[i + 1][1] <= zr + 0.04 + 1e-6:
        mats[i] = 2
revolve(prof, ["cphenolic", "aft", "black"], n=40, name="decel", loc=(X0, 0, 0), mats=mats)
torus(0.16, 0.012, (X0, 0, top), m="darkalu", n=20, nm=4)                       # top hatch ring
# round port on the aft cover (as in the line drawing)
nrm = Vector((0.63, 0, 0.77)); p = Vector((X0 + 0.52, 0, 0.70))
q = Vector((0, 0, 1)).rotation_difference(nrm)
for ob in (cyl(0.1, 0.03, tuple(p), m="aft", n=16), torus(0.1, 0.012, tuple(p + nrm * 0.012), m="darkalu", n=16, nm=4)):
    ob.rotation_mode = 'QUATERNION'; ob.rotation_quaternion = q

# --- descent module: polished shell, instrument band, lower hemisphere, insulated top
X1, RD = 0.6, 0.35
dprof = [(0, 0)]
for k in range(1, 8):
    a = math.pi / 2 * k / 8
    dprof.append((RD * math.sin(a), RD * 0.8 * (1 - math.cos(a))))
zb = dprof[-1][1]
dprof += [(RD, zb + 0.24), (RD - 0.015, zb + 0.255), (RD - 0.03, zb + 0.29), (0, zb + 0.29)]
revolve(dprof, "polished", n=36, name="descent", loc=(X1, 0, 0))
ZT = zb + 0.29
torus(RD - 0.005, 0.008, (X1, 0, zb), m="darkalu", n=36, nm=4)                     # equator seam
cyl(RD - 0.005, 0.03, (X1, 0, zb + 0.245), m="white", n=36)                         # white band
for k in range(14):                                                                 # insulation pads ring
    a = 2 * math.pi * k / 14
    sphere(0.035, (X1 + 0.25 * math.cos(a), 0.25 * math.sin(a), ZT + 0.008), "aft", seg=8, ring=4, scale=(1.3, 1, 0.5))
cyl(0.12, 0.06, (X1, 0, ZT + 0.03), m="alu", n=20)                                  # battery / parachute attach
cyl(0.05, 0.03, (X1, 0, ZT + 0.075), m="darkalu", n=12)
# instrument ports around the band
ports = [(-60, 0.06, "redwin"), (-30, 0.03, "glass"), (0, 0.025, "glass"), (50, 0.035, "black"),
         (140, 0.04, "glass"), (190, 0.025, "black"), (260, 0.03, "glass")]
for ang, r, m in ports:
    a = math.radians(ang)
    d = Vector((math.cos(a), math.sin(a), 0))
    c = Vector((X1, 0, zb + 0.12)) + d * RD
    q = Vector((0, 0, 1)).rotation_difference(d)
    for ob in (cyl(r, 0.02, tuple(c), m=m, n=14), torus(r + 0.008, 0.006, tuple(c + d * 0.006), m="darkalu", n=14, nm=4)):
        ob.rotation_mode = 'QUATERNION'; ob.rotation_quaternion = q
# side brackets (parachute bridle / separation fittings) and the nephelometer arm
for ang in (90, 210, 330):
    a = math.radians(ang)
    d = Vector((math.cos(a), math.sin(a), 0))
    box((0.08, 0.06, 0.1), tuple(Vector((X1, 0, zb + 0.18)) + d * (RD + 0.02)), (0, 0, ang), "darkalu")
box((0.2, 0.04, 0.04), (X1 + 0.08, -0.33, zb + 0.08), (0, 0, -60), "alu")                 # nephelometer arm
strut((X1 - 0.18, 0.2, ZT), (X1 - 0.18, 0.2, ZT + 0.03), 0.04, "black", n=10)        # hose fitting

finish("galileo-probe", "Galileo atmospheric probe",
       "Galileo's Jupiter entry probe at true size: the assembled deceleration module (1.25 m carbon-phenolic "
       "45-degree heat shield and domed aft cover, 0.86 m tall) resting on its nose, beside the polished "
       "~0.7 m descent module that parachuted into Jupiter (instrument band with the red-filtered window and "
       "round ports, insulated top, side fittings).")
