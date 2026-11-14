# Mars 2020 (Perseverance) backshell + supersonic parachute on the floor of Jezero crater
# References (NASA/JPL-Caltech, public domain):
#   PIA25218 "Debris Field for Perseverance Landing Gear Seen from Mars Helicopter" and PIA25219
#     (Ingenuity flight 26, 19 Apr 2022, from ~8 m up): backshell sitting upright (apex up) on its broken
#     rim, skirt cracked into flaps with shards scattered around, round ports on the lower cone, open
#     parachute cone at the top with its support truss; parachute lying as a long crumpled heap off to
#     one side, suspension lines strewn across the ground between them
#   Mars 2020 Landing press kit (NASA, Feb 2021): aeroshell 4.5 m diameter; parachute 21.5 m diameter,
#     80 suspension lines; MSL/M2020 backshell = three stacked cones (Edquist et al., NTRS 20090024230)
# Profile used (r, z in m): 2.25@0 -> 1.32@0.88 -> 0.98@1.42 -> 0.80@1.90 (cone angles approximated
#   from the photos). Parachute heap ~7 x 3 m, ~11 m away (real distance is larger; shortened to fit).
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from shapes import revolve, tube, _recalc
import bmesh
from mathutils import Vector, noise

reset()
random.seed(7)
mat("shell", (0.86, 0.82, 0.74), 0.0, 0.75)        # white thermal coating, dusty
mat("inner", (0.2, 0.19, 0.18), 0.0, 0.8)
mat("cloth", (0.92, 0.89, 0.83), 0.0, 0.9)
mat("orange", (0.8, 0.45, 0.3), 0.0, 0.9)
mat("line", (0.55, 0.5, 0.45), 0.0, 0.9)

# --- backshell shell with a cracked, flared skirt
prof = [(2.25, 0.0), (2.02, 0.22), (1.79, 0.44), (1.55, 0.66), (1.32, 0.88), (0.98, 1.42), (0.8, 1.9)]
sh = revolve(prof, ["shell", "inner"], n=72, name="backshell")
sh.location.z = 0.057                                   # solidify grows inward/down; keep the rim on the ground
bm = bmesh.new(); bm.from_mesh(sh.data)
cracks = sorted(random.uniform(0, 2 * math.pi) for _ in range(7))
flare = [random.uniform(0.0, 0.5) for _ in cracks]
def sector(a):
    for i in range(len(cracks)):
        if a < cracks[i]:
            return i
    return 0
for v in bm.verts:
    if v.co.z > 0.5:
        continue
    a = math.atan2(v.co.y, v.co.x) % (2 * math.pi)
    k = flare[sector(a)] * (0.5 - v.co.z) / 0.5
    r = Vector((v.co.x, v.co.y, 0)).normalized()
    v.co += r * k * 0.6
    v.co.z = max(0.0, v.co.z - k * 0.25)
    if v.co.z < 0.01:                                   # jagged torn rim
        v.co += r * 0.12 * noise.noise(Vector((a * 3, 0, 0)))
# tear out a few chunks of the rim
kill = [f for f in bm.faces if f.calc_center_median().z < 0.25 and
        any(abs((math.atan2(f.calc_center_median().y, f.calc_center_median().x) % (2 * math.pi)) - c) < 0.09 for c in cracks[::2])]
bmesh.ops.delete(bm, geom=kill, context='FACES')
bm.to_mesh(sh.data); bm.free()
sol = sh.modifiers.new("s", 'SOLIDIFY'); sol.thickness = 0.05; sol.offset = -1; sol.material_offset = 1

# open parachute cone: dark cavity, lip ring, support truss and bridle hub
cyl(0.86, 0.02, (0, 0, 1.72 + 0.057), m="inner", n=36)
torus(0.8, 0.035, (0, 0, 1.9), m="darkalu", n=36, nm=6)
hub = Vector((0, 0, 2.02))
for k in range(6):
    a = math.radians(60 * k)
    strut((0.79 * math.cos(a), 0.79 * math.sin(a), 1.9), tuple(hub), 0.018, "darkalu", n=6)
    strut((0.79 * math.cos(a), 0.79 * math.sin(a), 1.9), (0.79 * math.cos(a + 1.047), 0.79 * math.sin(a + 1.047), 1.9), 0.012, "darkalu", n=4)
cyl(0.06, 0.06, tuple(hub), m="darkalu", n=10)

# round ports on the lower cone (dark window + rim)
for k in range(4):
    a = math.radians(45 + 90 * k)
    nrm = Vector((math.cos(a) * 0.687, math.sin(a) * 0.687, 0.727))
    p = Vector((1.615 * math.cos(a), 1.615 * math.sin(a), 0.6))
    q = Vector((0, 0, 1)).rotation_difference(nrm)
    for ob in (cyl(0.14, 0.02, tuple(p + nrm * 0.005), m="black", n=16),
               torus(0.15, 0.02, tuple(p + nrm * 0.005), m="darkalu", n=16, nm=4)):
        ob.rotation_mode = 'QUATERNION'; ob.rotation_quaternion = q

# shards of the skirt scattered around (lying on the ground)
for i in range(9):
    a = random.uniform(-1.2, 4.0); d = random.uniform(2.7, 4.6)
    c = Vector((d * math.cos(a), d * math.sin(a), 0))
    s = random.uniform(0.25, 0.6)
    pts = [c + Vector((math.cos(t) * s * random.uniform(0.5, 1.0), math.sin(t) * s * random.uniform(0.4, 1.0), 0))
           for t in [j * 2 * math.pi / 5 + random.uniform(-0.3, 0.3) for j in range(5)]]
    top = [p + Vector((0, 0, 0.025)) for p in pts]
    faces = [(0, 1, 2, 3, 4), (9, 8, 7, 6, 5)] + [(j, (j + 1) % 5, 5 + (j + 1) % 5, 5 + j) for j in range(5)]
    _recalc(mesh(pts + top, faces, "darkalu" if i % 4 == 3 else "shell", "shard"))

# --- parachute: long crumpled heap, orange/white gores
PX, LX, LY = -11.5, 3.6, 1.5
NX, NY = 48, 24
verts, faces, fm, E = [], [], [], []
for i in range(NX + 1):
    for j in range(NY + 1):
        u, v = -1 + 2 * i / NX, -1 + 2 * j / NY
        e = max(0.0, 1 - u * u - v * v * 0.95)
        bend = 0.35 * math.sin(u * 2.2)                        # heap is not straight
        x = PX + u * LX
        y = v * LY * (0.75 + 0.25 * math.cos(u * 1.6)) + bend
        z = (0.6 * e ** 0.5 + 0.28 * e * noise.noise(Vector((u * 3, v * 3, 0.3))) + 0.1 * e * noise.noise(Vector((u * 9, v * 9, 1.7))) + 0.07 * e * math.sin(v * 21 + 2 * math.sin(u * 5)) + 0.04 * e * math.sin(u * 17 + v * 4)) if e > 0 else 0.0
        verts.append((x, y, max(0.0, z))); E.append(e)
for i in range(NX):
    for j in range(NY):
        a = i * (NY + 1) + j
        if max(E[a], E[a + 1], E[a + NY + 1], E[a + NY + 2]) <= 0:
            continue                                                  # outside the heap outline
        faces.append((a, a + NY + 1, a + NY + 2, a + 1))
        fm.append(1 if (j + int(2.5 * math.sin(i * 0.25))) % 4 == 0 and 3 < i < NX - 3 else 0)   # gore streaks
chute = mesh(verts, faces, "cloth", "canopy")
bm = bmesh.new(); bm.from_mesh(chute.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.to_mesh(chute.data); bm.free()
chute.data.materials.append(mat("orange"))
for p, o in zip(chute.data.polygons, fm):
    p.material_index = o
cs = chute.modifiers.new("s", 'SOLIDIFY'); cs.thickness = 0.02; cs.offset = 1

# suspension lines strewn on the ground, gathering into the bridle that climbs to the backshell hub
conf = Vector((-5.2, 0.15, 0.022))
for k in range(10):
    yy = -1.1 + k * 0.245
    st = Vector((PX + LX * 0.97, yy * 0.8, 0.012))
    m1 = st.lerp(conf, 0.35) + Vector((0, random.uniform(-0.35, 0.35), 0))
    m2 = st.lerp(conf, 0.7) + Vector((0, random.uniform(-0.2, 0.2), 0))
    tube([tuple(st + Vector((-0.4, 0, 0.02))), tuple(st), tuple(m1), tuple(m2), tuple(conf)], 0.012, "line", n=4)
tube([tuple(conf), (-3.6, 0.3, 0.022), (-2.9, 0.05, 0.03), (-0.9, 0.0, 1.96), tuple(hub)], 0.022, "line", n=6)

finish("backshell", "Mars 2020 backshell and parachute",
       "Perseverance's 4.5 m backshell as Ingenuity photographed it in 2022: sitting upright on its cracked, "
       "flared skirt with round ports and the open parachute cone on top, shards scattered around, and the "
       "21.5 m parachute lying as a long crumpled orange-and-white heap with its suspension lines strewn "
       "across the ground to the backshell (distance shortened).", elev=35)
