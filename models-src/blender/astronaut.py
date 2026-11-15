# Apollo astronaut in the A7L EVA suit (Apollo 11-14), standing at rest, true scale.
# References (NASA, public domain, viewed only): AS11-40-5903 (Aldrin portrait, front),
#   AS11-40-5875 (Aldrin beside the flag, side/back: PLSS bottom at hip level, OPS top level with the helmet).
# Dimensions: ~1.8 m person, 1.93 m to the top of the LEVA; PLSS 0.48 x 0.28 x 0.72 m (thermal cover on)
#   from hip level, OPS 0.46 x 0.26 x 0.23 m on top with a short VHF antenna stub, RCU 0.24 x 0.11 x 0.16 m.
# Axes (Blender): X = astronaut's LEFT, -Y = FORWARD, Z = up, metres. glTF export (Y-up): faces +Z.
# Output: a node hierarchy for code animation without a skeleton. Every node has identity rotation and
#   scale; its origin is the joint pivot:
#   astronaut (empty, ground between the feet)
#     torso (waist; suit torso, PLSS + OPS, RCU, hoses)
#       helmet (neck ring)
#       armL / armR (shoulder) -> forearmL / forearmR (elbow; glove included)
#     legL / legR (hip) -> shinL / shinR (knee; overshoe included)
# Suit parts are lofted elliptical sections (bellows = rippled radius, fabric folds = noise) and fully
#   smooth-shaded; each limb starts with a dome centred on its pivot so a rotated joint stays closed.
# Run:  blender -b -P astronaut.py      (ALL_VIEWS=1 also renders -back / -side check views)
import sys, os, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from shapes import revolve, tube, _recalc
from mathutils import noise
import lib

KEY = "astronaut"
reset()
mat("suit", (0.90, 0.89, 0.86), 0.0, 0.75)          # white beta-cloth outer layer
mat("lightgrey", (0.68, 0.68, 0.67), 0.0, 0.6)      # OPS cover, LEVA side blinders
mat("darkgrey", (0.18, 0.18, 0.19), 0.0, 0.6)       # RCU knobs
mat("blue", (0.22, 0.36, 0.72), 0.0, 0.6)           # silicone overshoe soles, glove tips, O2 inlet connectors
mat("red", (0.72, 0.16, 0.12), 0.0, 0.6)            # O2 outlet connectors

# joint pivots: fixed, code drives these nodes
P_TORSO = Vector((0, 0, 1.02))
P_NECK = Vector((0, -0.01, 1.60))
P_SHOULDER = Vector((0.225, 0, 1.49))               # mirrored for the right side (x < 0)
P_HIP = Vector((0.105, 0, 0.96))
UPPER, THIGH = 0.31, 0.43                           # shoulder->elbow, hip->knee
ARM_OUT, ELBOW_BEND = 12, 10                         # degrees: arms hang out, forearms bend forward
G_SHIN = -(P_HIP.z - THIGH)                          # ground level in the shin frame


# ---------------- mesh helpers ----------------
def soft(ob):
    ob["soft"] = 1                                   # fully smooth normals (no sharp edges)
    return ob


def loft(secs, n=16, m="suit", p=2.0, seed=0, name="loft"):
    """Closed tube through sections (z, rx, ry, cx, cy, mat_index, wobble) along local Z.
    rx == 0 makes a pole. p > 2 gives a squarer superellipse. wobble = fabric-fold noise amplitude."""
    off = Vector((seed * 5.3, seed * 2.1, seed * 3.7))
    verts, rings, mids = [], [], []
    for z, rx, ry, cx, cy, mi, w in secs:
        if rx < 1e-6:
            rings.append([len(verts)]); verts.append((cx, cy, z))
        else:
            ring = []
            for j in range(n):
                a = 2 * math.pi * j / n
                c, s = math.cos(a), math.sin(a)
                k = 1 + w * noise.noise(Vector((2.2 * c, 2.2 * s, z * 22)) + off) if w else 1
                ring.append(len(verts))
                verts.append((cx + k * rx * math.copysign(abs(c) ** (2 / p), c),
                              cy + k * ry * math.copysign(abs(s) ** (2 / p), s), z))
            rings.append(ring)
        mids.append(mi)
    faces, fm = [], []
    for i in range(len(rings) - 1):
        A, B = rings[i], rings[i + 1]
        for j in range(n):
            j1 = (j + 1) % n
            if len(A) == 1:
                faces.append((A[0], B[j], B[j1]))
            elif len(B) == 1:
                faces.append((A[j], A[j1], B[0]))
            else:
                faces.append((A[j], A[j1], B[j1], B[j]))
            fm.append(mids[i])
    ms = m if isinstance(m, (list, tuple)) else [m]
    ob = mesh(verts, faces, ms[0], name)
    for extra in ms[1:]:
        ob.data.materials.append(lib.mat(extra))
    for poly, i in zip(ob.data.polygons, fm):
        poly.material_index = i
    return soft(_recalc(ob))


def S(z, rx, ry=None, cx=0.0, cy=0.0, mi=0, w=0.0):
    return (z, rx, rx if ry is None else ry, cx, cy, mi, w)


def bellows(z0, z1, folds, r_in, r_out, ry=1.0, cy=0.0):
    """Accordion convolutes: radius ripples between r_in and r_out, 4 samples per fold."""
    out = []
    for i in range(4 * folds + 1):
        t = i / (4 * folds)
        r = r_in + (r_out - r_in) * (0.5 - 0.5 * math.cos(2 * math.pi * folds * t))
        out.append(S(z0 + (z1 - z0) * t, r, r * ry, cy=cy))
    return out


def ell_patch(c, rx, ry, rz, els, keep, n=32, m="white", t=0.006, name="patch"):
    """Cells of an ellipsoid (az measured from the front, -Y; el up) where keep(az_mid, el_lo, el_hi);
    solidified inward by t."""
    verts, faces = [], []
    for e in els:
        for j in range(n):
            a = math.radians(-180 + 360 * j / n); er = math.radians(e)
            verts.append((c[0] + rx * math.cos(er) * math.sin(a), c[1] - ry * math.cos(er) * math.cos(a),
                          c[2] + rz * math.sin(er)))
    for i in range(len(els) - 1):
        for j in range(n):
            if keep(-180 + 360 * (j + 0.5) / n, els[i], els[i + 1]):
                j1 = (j + 1) % n
                faces.append((i * n + j, (i + 1) * n + j, (i + 1) * n + j1, i * n + j1))
    ob = mesh(verts, faces, m, name)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)        # collapses the polar ring
    bm.normal_update()
    cc = Vector(c)
    flip = [f for f in bm.faces if f.normal.dot(f.calc_center_median() - cc) < 0]
    bmesh.ops.reverse_faces(bm, faces=flip)
    bm.to_mesh(ob.data); bm.free()
    md = ob.modifiers.new("s", 'SOLIDIFY'); md.thickness = t; md.offset = -1; md.use_even_offset = True
    return ob


def bev(size, loc, m, w=0.03, seg=2):
    ob = box(size, loc, m=m)
    md = ob.modifiers.new("b", 'BEVEL'); md.width = w; md.segments = seg
    return ob


def spline(pts, k=4):
    """Catmull-Rom through pts, k samples per span (soft hose sag)."""
    P = [Vector(pts[0])] + [Vector(p) for p in pts] + [Vector(pts[-1])]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for s in range(k):
            t = s / k
            out.append(0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3))
    return out + [P[-2]]


def aim(ob, origin, d):
    """Place an object built along local -Z so that -Z points along d, local origin at `origin`."""
    q = (-Vector(d).normalized()).to_track_quat('Z', 'Y')
    ob.matrix_world = Matrix.Translation(origin) @ q.to_matrix().to_4x4()
    return ob


def part(name, build, M):
    """Run build(), shade each piece (soft = fully smooth, hard = smooth by angle), join into one object
    `name`, bake world transforms, then transform the mesh by M so the node's pivot is the origin."""
    before = set(bpy.data.objects)
    build()
    obs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    for o in obs:
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True); bpy.context.view_layer.objects.active = o
        for md in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=md.name)
        if o.get("soft"):
            bpy.ops.object.shade_smooth()
        else:
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = ob.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ob.data.transform(M)
    return _recalc(ob)


# ---------------- torso (world coordinates) ----------------
def build_torso():
    w = 0.012
    loft([S(0.835, 0), S(0.845, 0.10, 0.08), S(0.87, 0.16, 0.12, cy=0.005), S(0.92, 0.195, 0.14, cy=0.01, w=w),
          S(1.00, 0.205, 0.145, cy=0.005, w=w), S(1.07, 0.20, 0.145, w=w),
          S(1.10, 0.196, 0.141, w=w), S(1.13, 0.204, 0.148, w=w), S(1.16, 0.199, 0.144, w=w),   # waist folds
          S(1.22, 0.215, 0.155, cy=-0.005, w=w), S(1.30, 0.232, 0.162, cy=-0.01, w=w),
          S(1.38, 0.243, 0.165, cy=-0.01, w=w), S(1.45, 0.247, 0.162, cy=-0.005, w=w),
          S(1.51, 0.238, 0.152), S(1.555, 0.21, 0.14), S(1.585, 0.17, 0.125), S(1.605, 0.135, 0.11),
          S(1.615, 0)], n=28, p=2.3, seed=1, name="body")
    soft(torus(0.13, 0.022, P_NECK, m="grey", n=24, nm=8))                 # neck ring
    # Remote Control Unit on the chest, controls on top, camera bracket on the front
    bev((0.24, 0.11, 0.16), (0, -0.225, 1.385), "grey", 0.02)
    bev((0.20, 0.012, 0.11), (0, -0.282, 1.39), "lightgrey", 0.005, 1)
    bev((0.07, 0.03, 0.04), (0, -0.295, 1.33), "darkgrey", 0.008, 1)
    for x in (-0.07, 0.0, 0.07):
        cyl(0.016, 0.03, (x, -0.225, 1.475), m="darkgrey", n=10)
    # RCU harness straps over the shoulders to the PLSS
    for s in (-1, 1):
        soft(tube(spline([(s * 0.10, -0.215, 1.46), (s * 0.14, -0.16, 1.55), (s * 0.155, -0.04, 1.625),
                          (s * 0.15, 0.10, 1.64), (s * 0.15, 0.19, 1.62)], 3), 0.014, "grey", n=6))
    # gas connectors under the RCU (blue inlet / red outlet) and the hoses looping round to the PLSS
    for s, c in ((1, "blue"), (-1, "red")):
        for k, z in enumerate((1.25, 1.18)):
            cyl(0.022, 0.05, (s * 0.07, -0.175, z), (90, 0, 0), c, n=12)
            dz = -0.035 * k
            soft(tube(spline([(s * 0.07, -0.20, z), (s * 0.12, -0.23, z - 0.07), (s * 0.20, -0.16, 1.10 + dz),
                              (s * 0.228, -0.02, 1.07 + dz), (s * 0.215, 0.12, 1.08 + dz),
                              (s * 0.20, 0.22, 1.10 + dz)], 4), 0.018, "grey", n=8))
    # Portable Life Support System (thermal cover on) and the Oxygen Purge System on top
    bev((0.48, 0.28, 0.72), (0, 0.305, 1.34), "white", 0.06, 3)
    bev((0.485, 0.285, 0.025), (0, 0.305, 1.70), "grey", 0.008, 1)        # PLSS/OPS joint band
    bev((0.46, 0.26, 0.23), (0, 0.30, 1.825), "lightgrey", 0.06, 3)
    bev((0.30, 0.012, 0.05), (0, 0.448, 1.45), "grey", 0.004, 1)          # back access flap
    cyl(0.009, 0.07, (-0.17, 0.38, 1.97), m="grey", n=8)                  # VHF antenna stub
    sphere(0.014, (-0.17, 0.38, 2.005), "grey", seg=8, ring=5)


# ---------------- helmet (world coordinates) ----------------
def build_helmet():
    zc, r = 1.745, 0.165                                                   # polycarbonate pressure bubble
    revolve([(0, zc + r)] + [(r * math.cos(math.radians(e)), zc + r * math.sin(math.radians(e)))
                            for e in range(75, -61, -15)] + [(0, P_NECK.z)],
            "glass", n=24, loc=(0, -0.03, 0))
    c, rx, ry, rz = (0, -0.035, 1.752), 0.182, 0.198, 0.178                 # LEVA shell
    els = [-45, -35, -22, -10, 0, 12, 25, 38, 50, 62, 74, 90]
    ell_patch(c, rx, ry, rz, els, lambda a, lo, hi: not (abs(a) < 70 and hi <= 50), 32, "white", 0.008, "leva")
    ell_patch(c, rx * 0.985, ry * 0.985, rz * 0.985, [-47, -35, -22, -10, 0, 12, 25, 38, 50, 55],
              lambda a, lo, hi: abs(a) < 76, 32, "gold", 0.004, "visor")
    ell_patch(c, rx * 1.03, ry * 1.03, rz * 1.03, [-20, -8, 5, 18, 31, 44],
              lambda a, lo, hi: 62 < abs(a) < 82, 48, "lightgrey", 0.006, "blinders")


# ---------------- arms (limb frame: pivot at origin, hanging down -Z) ----------------
def build_upper_arm(seed):
    def b():
        loft([S(0.10, 0), S(0.085, 0.055), S(0.06, 0.08), S(0.03, 0.095), S(0.0, 0.10)]
             + bellows(-0.01, -0.13, 3, 0.089, 0.100, 0.95)[1:]           # shoulder convolutes
             + [S(-0.16, 0.088, 0.084, w=0.02), S(-0.19, 0.084, 0.08, w=0.02)]
             + bellows(-0.205, -0.295, 3, 0.072, 0.083, 0.95)            # elbow convolutes
             + [S(-UPPER, 0.07, 0.066), S(-0.33, 0)], n=16, seed=seed, name="upperarm")
    return b


def build_forearm(s):
    def b():
        loft([S(0.075, 0), S(0.06, 0.06), S(0.03, 0.074), S(0.0, 0.078), S(-0.04, 0.074, w=0.03),
              S(-0.08, 0.07, 0.066, w=0.03), S(-0.12, 0.066, 0.062, w=0.02), S(-0.16, 0.062, 0.058),
              S(-0.20, 0.058, 0.055), S(-0.235, 0)], n=16, seed=3 + s, name="forearm")
        # lunar EV glove: beta-cloth gauntlet flaring over the forearm, palm, four fingers and a thumb
        loft([S(-0.135, 0), S(-0.14, 0.068, 0.062), S(-0.15, 0.078, 0.071), S(-0.19, 0.072, 0.066, w=0.03),
              S(-0.23, 0.062, 0.058), S(-0.265, 0.052, 0.05), S(-0.285, 0.046, 0.046), S(-0.292, 0)],
             n=16, seed=5 + s, name="gauntlet")
        loft([S(-0.275, 0), S(-0.285, 0.026, 0.045), S(-0.31, 0.031, 0.052), S(-0.345, 0.031, 0.054),
              S(-0.368, 0.028, 0.052), S(-0.378, 0)], n=12, p=2.6, name="palm")
        for k, y in enumerate((-0.033, -0.011, 0.011, 0.033)):
            L = (0.07, 0.078, 0.074, 0.062)[k]
            f = loft([S(0.004, 0), S(0.0, 0.0125), S(-0.4 * L, 0.012), S(-0.75 * L, 0.0112, mi=1),
                      S(-L, 0.009, mi=1), S(-L - 0.007, 0, mi=1)], n=6, m=["suit", "blue"], name="finger")
            aim(f, Vector((-s * 0.004, y, -0.36)), (-s * 0.22, 0, -1))
        t = loft([S(0.004, 0), S(0.0, 0.015), S(-0.03, 0.014), S(-0.045, 0.012, mi=1), S(-0.058, 0.009, mi=1),
                  S(-0.064, 0, mi=1)], n=6, m=["suit", "blue"], name="thumb")
        aim(t, Vector((-s * 0.012, -0.045, -0.30)), (-s * 0.35, -0.6, -0.75))
        if s > 0:
            bev((0.025, 0.075, 0.085), (0.07, 0, -0.10), "white", 0.008, 1)   # cuff checklist, left wrist
    return b


# ---------------- legs (limb frame) ----------------
def build_thigh(seed):
    def b():
        loft([S(0.10, 0), S(0.085, 0.055, 0.06), S(0.06, 0.08, 0.09), S(0.03, 0.095, 0.105), S(0.0, 0.10, 0.112),
              S(-0.05, 0.10, 0.112, w=0.02), S(-0.12, 0.098, 0.108, cy=-0.004, w=0.025),
              S(-0.20, 0.095, 0.103, cy=-0.004, w=0.025), S(-0.27, 0.092, 0.097, w=0.02), S(-0.31, 0.09, 0.094)]
             + bellows(-0.32, -0.43, 3, 0.088, 0.099, 1.03)             # knee convolutes
             + [S(-0.45, 0)], n=18, seed=seed, name="thigh").scale = (1, 1.1, 1)   # deep, bulky thighs
    return b


def build_shin(seed):
    def b():
        g = G_SHIN
        loft([S(0.10, 0), S(0.085, 0.06), S(0.06, 0.085), S(0.03, 0.096), S(0.0, 0.098)]
             + bellows(-0.01, -0.08, 2, 0.089, 0.097)[1:]
             + [S(-0.12, 0.089, cy=0.004, w=0.025), S(-0.18, 0.087, 0.09, cy=0.01, w=0.025),
                S(-0.24, 0.083, 0.086, cy=0.008, w=0.02), S(-0.29, 0.08), S(-0.33, 0)],
             n=18, seed=seed, name="shin").scale = (1, 1.08, 1)
        # lunar overshoe: tall beta-cloth upper, boxy foot, silicone sole with transverse ridges
        loft([S(g + 0.27, 0), S(g + 0.272, 0.094), S(g + 0.265, 0.1), S(g + 0.21, 0.098, w=0.02),
              S(g + 0.15, 0.1, 0.104, w=0.02), S(g + 0.10, 0.103, 0.11), S(g + 0.08, 0)], n=18, name="shaft")
        foot = [S(-0.128, 0, cy=0.085), S(-0.122, 0.055, 0.045, cy=0.09), S(-0.105, 0.066, 0.065, cy=0.098),
                S(-0.07, 0.07, 0.072, cy=0.102), S(-0.01, 0.071, 0.072, cy=0.10), S(0.05, 0.07, 0.062, cy=0.09),
                S(0.10, 0.066, 0.05, cy=0.08), S(0.145, 0.058, 0.04, cy=0.072), S(0.172, 0.045, 0.03, cy=0.068),
                S(0.182, 0, cy=0.068)]
        R = Matrix.Translation((0, -0.04, g)) @ Matrix.Rotation(math.pi / 2, 4, 'X')   # local +Z -> forward
        loft(foot, n=16, p=2.8, name="foot").matrix_world = R
        sole = [S(-0.138, 0, cy=0.03), S(-0.134, 0.06, 0.016, cy=0.03), S(-0.12, 0.077, 0.019, cy=0.03),
                S(-0.06, 0.08, 0.019, cy=0.03), S(0.03, 0.079, 0.019, cy=0.03), S(0.11, 0.074, 0.019, cy=0.031),
                S(0.16, 0.064, 0.02, cy=0.037), S(0.19, 0.05, 0.022, cy=0.047), S(0.202, 0.03, 0.02, cy=0.055),
                S(0.207, 0, cy=0.056)]
        loft(sole, n=14, p=4.0, m="blue", name="sole").matrix_world = R
        for k in range(11):                                              # sole ribs (the bootprint pattern)
            y = -0.04 + 0.12 - 0.026 * k
            box((0.15 - 0.004 * max(0, k - 7) ** 2, 0.012, 0.014), (0, y, g + 0.007), m="blue")
        bev((0.15, 0.03, 0.035), (0, 0.06, g + 0.13), "grey", 0.008, 1)   # heel strap
    return b


def rot(axis_deg):
    M = Matrix.Identity(4)
    for ax, d in axis_deg:
        M = M @ Matrix.Rotation(math.radians(d), 4, ax)
    return M


# ---------------- assemble the node hierarchy ----------------
root = bpy.data.objects.new(KEY, None); bpy.context.collection.objects.link(root)
nodes = {}


def node(name, ob, parent, pivot_world, parent_pivot):
    ob.parent = parent
    ob.matrix_parent_inverse = Matrix.Identity(4)
    ob.location = pivot_world - parent_pivot
    nodes[name] = (ob, pivot_world)


O = Vector((0, 0, 0))
node("torso", part("torso", build_torso, Matrix.Translation(-P_TORSO)), root, P_TORSO, O)
node("helmet", part("helmet", build_helmet, Matrix.Translation(-P_NECK)), nodes["torso"][0], P_NECK, P_TORSO)
for s, side in ((1, "L"), (-1, "R")):
    R_arm = rot([('Y', -s * ARM_OUT)])                                    # lower end swings out to +-X
    sh = Vector((s * P_SHOULDER.x, P_SHOULDER.y, P_SHOULDER.z))
    elbow = sh + R_arm @ Vector((0, 0, -UPPER))
    node("arm" + side, part("arm" + side, build_upper_arm(2 + s), R_arm), nodes["torso"][0], sh, P_TORSO)
    node("forearm" + side, part("forearm" + side, build_forearm(s), R_arm @ rot([('X', -ELBOW_BEND)])),
         nodes["arm" + side][0], elbow, sh)
    hip = Vector((s * P_HIP.x, P_HIP.y, P_HIP.z))
    knee = hip + Vector((0, 0, -THIGH))
    node("leg" + side, part("leg" + side, build_thigh(7 + s), Matrix.Identity(4)), root, hip, O)
    node("shin" + side, part("shin" + side, build_shin(9 + s), Matrix.Identity(4)), nodes["leg" + side][0], knee, hip)
drop_uvs()
bpy.context.view_layer.update()

# ---------------- checks ----------------
obs = [o for o in bpy.data.objects if o.type == 'MESH']
allv = [o.matrix_world @ v.co for o in obs for v in o.data.vertices]
mn = Vector((min(v.x for v in allv), min(v.y for v in allv), min(v.z for v in allv)))
mx = Vector((max(v.x for v in allv), max(v.y for v in allv), max(v.z for v in allv)))
dims = mx - mn
tris = 0
for o in obs:
    t = sum(len(p.vertices) - 2 for p in o.data.polygons); tris += t
    print(f"  node {o.name}: {t} tris, pivot {tuple(round(c, 3) for c in o.matrix_world.translation)}")
for name, (o, piv) in nodes.items():
    assert (o.matrix_world.translation - piv).length < 1e-6, name
    assert o.rotation_euler.to_matrix().is_identity and tuple(o.scale) == (1, 1, 1), name
helmet_top = max((nodes["helmet"][0].matrix_world @ v.co).z for v in nodes["helmet"][0].data.vertices)
assert abs(mn.z) < 1e-4, mn.z                       # stands on the ground
assert 1.88 < helmet_top < 1.95 and mx.z < 2.05, (helmet_top, mx.z)
assert tris <= 20000, tris
print(f"helmet top {helmet_top:.3f}, overall top {mx.z:.3f}")

blend, glb = os.path.join(HERE, KEY + ".blend"), os.path.join(HERE, KEY + ".glb")
bpy.ops.wm.save_as_mainfile(filepath=blend)
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_yup=True, export_apply=True,
                          use_selection=False, export_cameras=False, export_lights=False)

views = {"": (12, -30)}
if os.environ.get("ALL_VIEWS"):                     # extra angles for checking, written next to the preview
    views.update({"-back": (15, 150), "-side": (5, 90)})
for suffix, (e, a) in views.items():
    for o in [o for o in bpy.data.objects if o.type in ('LIGHT', 'CAMERA')]:
        bpy.data.objects.remove(o)
    lib._render(obs[0], dims, os.path.join(HERE, "previews", KEY + suffix + ".png"), e, a)
if os.environ.get("CLOSEUPS"):                      # glove / helmet close-ups into $CLOSEUPS (not the repo)
    for tag, target, (e, a) in (("hand", (0.33, -0.05, 0.84), (5, 60)), ("helmet", (0, -0.03, 1.72), (8, -35))):
        root.location = Vector((0, 0, 0.18)) - Vector(target)
        for o in [o for o in bpy.data.objects if o.type in ('LIGHT', 'CAMERA')]:
            bpy.data.objects.remove(o)
        lib._render(obs[0], Vector((0.2, 0.2, 0.36)), os.path.join(os.environ["CLOSEUPS"], tag + ".png"), e, a)
    root.location = (0, 0, 0)

jpath = os.path.join(HERE, "blender.json")
data = json.load(open(jpath)) if os.path.exists(jpath) else {}
data[KEY] = {
    "file": f"models-src/blender/{KEY}.glb",
    "title": "Apollo astronaut (A7L suit)",
    "credit": "Ghost Rover Atlas team (modelled in Blender from NASA reference photos)",
    "license": "CC BY 4.0",
    "size_m": round(max(dims), 3),
    "bytes": os.path.getsize(glb),
    "tris": tris,
    "note": "Apollo 11-14 moonwalker in the A7L suit: LEVA helmet with the gold visor down and side blinders, "
            "PLSS backpack with the OPS and antenna on top, chest RCU with hoses, bellows joints, gauntlet "
            "gloves and ridged lunar overshoes. Faces +Z (glTF). Node tree for code animation (pivots at the "
            "joints): astronaut > torso > helmet, armL > forearmL, armR > forearmR; astronaut > legL > shinL, legR > shinR.",
}
with open(jpath, "w") as f:
    json.dump(dict(sorted(data.items())), f, indent=2)
print(f"DONE {KEY}: dims={tuple(round(d, 3) for d in dims)} tris={tris} bytes={os.path.getsize(glb)}")
