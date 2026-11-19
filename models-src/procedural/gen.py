"""Code-built spacecraft models for Echoes of Exploration (no Blender needed: Python + numpy, Pillow for previews).

Each <key>.py builds its model from the primitives below (Z up, metres, like the Blender scripts in ../blender),
then calls finish(key, ...), which:
  - moves the origin to the base centre (lowest point at z = 0, XY bounding-box centre at 0),
  - writes public/models/<key>.gltf.json (glTF, Y up, self-contained): ONE NODE PER NAMED PART, so the tour's
    hotspots can anchor to a part by name ({ "part": "engine", "at": [0.5, 0.5, 0.5] }),
  - renders previews/<key>.png (four views) to check the shape,
  - writes <key>.json (title, credit, size, note) for public/models/models.json.

Run:  python -I models-src/procedural/<key>.py

Material names follow ../blender/lib.py, because the tour's surfaceDetail.ts textures a material by its name
(gold/foil = crumpled foil, alu/silver = brushed metal, cell = solar cells, white = paint, black...).
"""
import base64, json, math, os, struct
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

PALETTE = {
    # name: (linear rgb, metallic, roughness). Metalness kept <= 0.6 (a full mirror goes black against a black sky).
    "gold": ((0.83, 0.62, 0.20), 0.6, 0.35),  # Kapton / aluminised gold foil
    "white": ((0.88, 0.88, 0.86), 0.0, 0.6),  # white thermal paint
    "alu": ((0.75, 0.76, 0.78), 0.5, 0.4),  # bare aluminium
    "darkalu": ((0.35, 0.36, 0.38), 0.5, 0.5),
    "cell": ((0.05, 0.09, 0.30), 0.3, 0.25),  # solar-cell blue
    "black": ((0.03, 0.03, 0.035), 0.0, 0.7),
    "grey": ((0.45, 0.45, 0.45), 0.0, 0.7),
    "glass": ((0.15, 0.2, 0.25), 0.5, 0.1),
    "silver": ((0.9, 0.9, 0.92), 0.6, 0.25),  # silvered mirror / reflector
    "foil_silver": ((0.80, 0.80, 0.82), 0.6, 0.3),  # aluminised Mylar blanket
    "foil_black": ((0.06, 0.06, 0.065), 0.3, 0.5),  # black Kapton blanket
    "orange": ((0.72, 0.36, 0.12), 0.0, 0.8),  # spray-on foam insulation
    "copper": ((0.72, 0.42, 0.25), 0.6, 0.35),
    "red": ((0.6, 0.07, 0.05), 0.0, 0.6),
    "tan": ((0.62, 0.50, 0.36), 0.0, 0.85),  # heat-shield ablator
}

_parts = {}  # part name -> {material name -> [V list, N list, F list, vertex count]}
_order = []
_mats = {}
_cur = ["body"]


def reset():
    _parts.clear()
    _order.clear()
    _mats.clear()
    _cur[0] = "body"


def part(name):
    """Everything added after this goes into the part called `name` (its own node in the glTF)."""
    _cur[0] = name


def mat(name, color=None, metal=None, rough=None, double=False):
    """Define (or fetch) a material. PALETTE names need no definition."""
    if name not in _mats:
        c, m, r = PALETTE.get(name, ((0.5, 0.5, 0.5), 0.0, 0.6))
        _mats[name] = {"color": tuple(color or c), "metal": m if metal is None else metal, "rough": r if rough is None else rough, "double": double}
    return name


# ---------- transforms ----------
def _rot(rot):
    rx, ry, rz = (math.radians(a) for a in rot)
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    X = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Y = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Z = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Z @ Y @ X  # Blender's default XYZ Euler order: X first, then Y, then Z


def _emit(V, N, F, m, loc=(0, 0, 0), rot=(0, 0, 0), R=None):
    V = np.asarray(V, float).reshape(-1, 3)
    N = np.asarray(N, float).reshape(-1, 3)
    F = np.asarray(F, int).reshape(-1, 3)
    M = _rot(rot) if R is None else np.asarray(R, float)
    V = V @ M.T + np.asarray(loc, float)
    N = N @ M.T
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
    mat(m)
    name = _cur[0]
    if name not in _parts:
        _parts[name] = {}
        _order.append(name)
    slot = _parts[name].setdefault(m, [[], [], [], 0])
    slot[0].append(V)
    slot[1].append(N)
    slot[2].append(F + slot[3])
    slot[3] += len(V)


def _flat(verts, faces):
    """Polygons (any size, convex) -> triangles with one flat normal per polygon."""
    verts = np.asarray(verts, float)
    V, N, F = [], [], []
    for f in faces:
        p = verts[list(f)]
        n = np.zeros(3)
        for i in range(len(p)):  # Newell's method: robust for any polygon
            a, b = p[i], p[(i + 1) % len(p)]
            n += np.cross(a, b)
        n /= max(np.linalg.norm(n), 1e-12)
        base = len(V)
        V.extend(p)
        N.extend([n] * len(p))
        F.extend((base, base + i, base + i + 1) for i in range(1, len(p) - 1))
    return V, N, F


# ---------- primitives (all centred on `loc`, then rotated by `rot` degrees about X, Y, Z) ----------
def mesh(verts, faces, m="grey", loc=(0, 0, 0), rot=(0, 0, 0)):
    """Free-form polygons (lists of vertex indices, counter-clockwise seen from outside), flat shaded."""
    _emit(*_flat(verts, faces), m, loc, rot)


def box(size, loc=(0, 0, 0), rot=(0, 0, 0), m="grey"):
    x, y, z = (s / 2 for s in size)
    v = [(-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z), (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    mesh(v, f, m, loc, rot)


def revolve(profile, loc=(0, 0, 0), rot=(0, 0, 0), m="grey", n=24, smooth=True, arc=360.0, start=0.0):
    """Lathe a profile [(r, z), ...] (bottom to top for outward-facing normals) around the local Z axis.
    A point with r = 0 closes the end. smooth=False gives a faceted (n-sided) surface.
    Corners sharper than 40 degrees stay crisp; gentler ones are shaded smooth."""
    _emit(*_lathe(profile, n, smooth, arc, start), m, loc, rot)


def _lathe(profile, n=24, smooth=True, arc=360.0, start=0.0):
    prof = [(float(r), float(z)) for r, z in profile]
    full = abs(arc - 360.0) < 1e-6
    steps = n if full else max(2, int(round(n * arc / 360.0)))
    angs = [math.radians(start + arc * i / steps) for i in range(steps + 1)]
    V, N, F = [], [], []
    for k in range(len(prof) - 1):
        (r0, z0), (r1, z1) = prof[k], prof[k + 1]
        if abs(r0 - r1) < 1e-12 and abs(z0 - z1) < 1e-12:
            continue
        dr, dz = r1 - r0, z1 - z0
        l = math.hypot(dr, dz)
        nr, nz = dz / l, -dr / l  # outward normal of this segment in the (r, z) plane
        # Smooth along the profile: average with the neighbours' normals unless the corner is sharp (> 40 deg).
        def blend(i_prev, i_next, nr=nr, nz=nz):
            if not smooth:
                return nr, nz
            if i_prev < 0 or i_next >= len(prof):
                return nr, nz
            (ra, za), (rb, zb) = prof[i_prev], prof[i_next]
            d2r, d2z = rb - ra, zb - za
            l2 = math.hypot(d2r, d2z)
            if l2 < 1e-12:
                return nr, nz
            mr, mz = d2z / l2, -d2r / l2
            if nr * mr + nz * mz < math.cos(math.radians(40)):
                return nr, nz
            sr, sz = nr + mr, nz + mz
            s = math.hypot(sr, sz)
            return sr / s, sz / s
        n0 = blend(k - 1, k)
        n1 = blend(k + 1, k + 2)
        for i in range(steps):
            a0, a1 = angs[i], angs[i + 1]
            quad = []
            for (r, z, (qr, qz), a) in ((r0, z0, n0, a0), (r0, z0, n0, a1), (r1, z1, n1, a1), (r1, z1, n1, a0)):
                am = a if smooth else (a0 + a1) / 2
                quad.append(((r * math.cos(a), r * math.sin(a), z), (qr * math.cos(am), qr * math.sin(am), qz)))
            base = len(V)
            for p, q in quad:
                V.append(p)
                N.append(q)
            if r0 > 1e-9:
                F.append((base, base + 1, base + 2))
            if r1 > 1e-9:
                F.append((base, base + 2, base + 3))
    return V, N, F


def cyl(r, depth, loc=(0, 0, 0), rot=(0, 0, 0), m="grey", n=16, r2=None, cap=True, smooth=True):
    """Cylinder along local Z, centred (or a cone / frustum if r2 is given: r at the bottom, r2 at the top)."""
    r2 = r if r2 is None else r2
    h = depth / 2
    prof = [(r, -h), (r2, h)]
    if cap:
        prof = [(0, -h), (r, -h)] + prof + [(r2, h), (0, h)]
    revolve(prof, loc, rot, m, n, smooth)


def ngon_prism(r, h, n, loc=(0, 0, 0), rot=(0, 0, 0), m="grey"):
    """n-sided prism (flat sides), corner radius r, along local Z, centred. First corner on +X."""
    cyl(r, h, loc, rot, m, n, smooth=False)


def sphere(r, loc=(0, 0, 0), m="grey", seg=16, ring=8, scale=(1, 1, 1), rot=(0, 0, 0)):
    V, N, F = [], [], []
    sx, sy, sz = scale
    for j in range(ring + 1):
        t = math.pi * j / ring
        for i in range(seg + 1):
            p = 2 * math.pi * i / seg
            d = (math.sin(t) * math.cos(p), math.sin(t) * math.sin(p), math.cos(t))
            V.append((r * sx * d[0], r * sy * d[1], r * sz * d[2]))
            N.append((d[0] / sx, d[1] / sy, d[2] / sz))
    for j in range(ring):
        for i in range(seg):
            a, b = j * (seg + 1) + i, (j + 1) * (seg + 1) + i
            if j > 0:
                F.append((a, b, a + 1))
            if j < ring - 1:
                F.append((a + 1, b, b + 1))
    _emit(V, N, F, m, loc, rot)


def capsule_tank(r, length, loc=(0, 0, 0), rot=(0, 0, 0), m="grey", n=20, dome=1.0):
    """A tank: cylinder along local Z with rounded ends (dome = end height as a fraction of r). `length` is overall."""
    hd = r * dome
    hc = max(0.0, length / 2 - hd)
    prof = [(0, -hc - hd)]
    k = 6
    for i in range(1, k + 1):
        a = math.pi / 2 * i / k
        prof.append((r * math.sin(a), -hc - hd * math.cos(a)))
    for i in range(k, -1, -1):
        a = math.pi / 2 * i / k
        prof.append((r * math.sin(a), hc + hd * math.cos(a)))
    revolve(prof, loc, rot, m, n)


def torus(R, r, loc=(0, 0, 0), rot=(0, 0, 0), m="grey", n=24, nm=8):
    V, N, F = [], [], []
    for i in range(n + 1):
        a = 2 * math.pi * i / n
        for j in range(nm + 1):
            b = 2 * math.pi * j / nm
            d = (math.cos(b) * math.cos(a), math.cos(b) * math.sin(a), math.sin(b))
            V.append(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
            N.append(d)
    for i in range(n):
        for j in range(nm):
            a, b = i * (nm + 1) + j, (i + 1) * (nm + 1) + j
            F += [(a, b, b + 1), (a, b + 1, a + 1)]
    _emit(V, N, F, m, loc, rot)


def _frame(p1, p2):
    """Rotation matrix taking local Z onto p1 -> p2."""
    d = np.asarray(p2, float) - np.asarray(p1, float)
    l = np.linalg.norm(d)
    z = d / max(l, 1e-12)
    x = np.cross((0, 0, 1) if abs(z[2]) < 0.99 else (1, 0, 0), z)
    x /= np.linalg.norm(x)
    y = np.cross(z, x)
    return np.column_stack([x, y, z]), l


def strut(p1, p2, r=0.01, m="alu", n=6, r2=None):
    """Cylinder (or taper) between two points."""
    R, l = _frame(p1, p2)
    r2 = r if r2 is None else r2
    h = l / 2
    V, N, F = _lathe([(0, -h), (r, -h), (r2, h), (0, h)], n)
    _emit(V, N, F, m, (np.asarray(p1, float) + np.asarray(p2, float)) / 2, R=R)


def beam(p1, p2, w, h, m="alu", w2=None, h2=None):
    """Rectangular beam between two points (w across, h the other way); tapers to w2 x h2 if given."""
    R, l = _frame(p1, p2)
    w2 = w if w2 is None else w2
    h2 = h if h2 is None else h2
    v = []
    for z, ww, hh in ((-l / 2, w, h), (l / 2, w2, h2)):
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            v.append((sx * ww / 2, sy * hh / 2, z))
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    V, N, F = _flat(v, f)
    _emit(V, N, F, m, (np.asarray(p1, float) + np.asarray(p2, float)) / 2, R=R)


def plate(w, h, t=0.01, loc=(0, 0, 0), rot=(0, 0, 0), m="cell", frame="alu", fw=0.02, back=None):
    """Thin panel (e.g. a solar panel) in local XY, facing +Z: `m` on the front, `back` behind (default: frame colour),
    with a frame rim `fw` wide. w along X, h along Y."""
    back = back or frame
    R = _rot(rot)
    L = np.asarray(loc, float)
    def put(size, off, mm):
        x, y, z = (s / 2 for s in size)
        v = [(-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z), (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z)]
        f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        V, N, F = _flat(v, f)
        _emit(np.asarray(V) + np.asarray(off, float), N, F, mm, L, R=R)
    put((w, h, t * 0.5), (0, 0, -t * 0.25), back)
    put((w - 2 * fw, h - 2 * fw, t * 0.5), (0, 0, t * 0.25), m)
    for sx in (-1, 1):
        put((fw, h, t * 0.5), (sx * (w - fw) / 2, 0, t * 0.25), frame)
        put((w - 2 * fw, fw, t * 0.5), (0, sx * (h - fw) / 2, t * 0.25), frame)


def dish(R, depth, loc=(0, 0, 0), rot=(0, 0, 0), m="white", n=24, rings=5, back=None, t=0.012):
    """Paraboloid dish opening along local +Z, its lowest point at loc. Front `m`, back `back` (default the same)."""
    front = [(R * i / rings, depth * (i / rings) ** 2) for i in range(rings + 1)]
    # Inside surface (normals up/in): revolve from rim to centre.
    revolve([(r, z + t) for r, z in reversed(front)], loc, rot, m, n)
    revolve(front + [(R, depth + t)], loc, rot, back or m, n)


def tube(points, r=0.01, m="alu", n=6):
    """A pipe through a list of points (straight pieces with ball joints)."""
    for a, b in zip(points, points[1:]):
        strut(a, b, r, m, n)
    for p in points[1:-1]:
        sphere(r, p, m, seg=n, ring=max(3, n // 2))


def ring_of(count, radius, z=0.0, phase=0.0):
    """Evenly spaced points on a circle: [(x, y, z, angle_deg), ...]."""
    out = []
    for i in range(count):
        a = phase + 360.0 * i / count
        out.append((radius * math.cos(math.radians(a)), radius * math.sin(math.radians(a)), z, a))
    return out


# ---------- output ----------
def _collect():
    out = []
    for name in _order:
        prims = []
        for m, (V, N, F, _) in _parts[name].items():
            if not V:
                continue
            prims.append((m, np.vstack(V), np.vstack(N), np.vstack(F)))
        if prims:
            out.append((name, prims))
    return out


def _render(parts, path, size=420):
    """Four flat-shaded views (front-right, back-left, side, top) with a z-buffer, to check the shape by eye."""
    from PIL import Image

    tris, cols = [], []
    for _, prims in parts:
        for m, V, N, F in prims:
            c = np.array(_mats[m]["color"]) ** (1 / 2.2)
            tris.append(V[F])
            cols.append(np.repeat(c[None], len(F), 0))
    T = np.vstack(tris)
    C = np.vstack(cols)
    lo, hi = T.reshape(-1, 3).min(0), T.reshape(-1, 3).max(0)
    ctr = (lo + hi) / 2
    rad = np.linalg.norm(hi - lo) / 2
    sheet = Image.new("RGB", (size * 2, size * 2), (18, 20, 26))
    views = [(35, 22), (215, 22), (90, 4), (20, 80)]
    for k, (az, el) in enumerate(views):
        a, e = math.radians(az), math.radians(el)
        fwd = np.array([-math.cos(e) * math.cos(a), -math.cos(e) * math.sin(a), -math.sin(e)])  # camera looks along this
        right = np.cross(fwd, (0, 0, 1))
        right /= np.linalg.norm(right)
        up = np.cross(right, fwd)
        P = T - ctr
        x = P @ right
        y = P @ up
        z = P @ fwd
        s = size * 0.46 / rad
        sx = size / 2 + x * s
        sy = size / 2 - y * s
        n = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
        light = np.array([0.45, -0.35, 0.82])
        light /= np.linalg.norm(light)
        lam = np.abs(n @ light) * 0.75 + 0.25
        img = np.zeros((size, size, 3)) + np.array([18, 20, 26]) / 255
        zb = np.full((size, size), np.inf)
        for i in range(len(T)):
            xs, ys, zs = sx[i], sy[i], z[i]
            x0, x1 = int(max(0, math.floor(xs.min()))), int(min(size - 1, math.ceil(xs.max())))
            y0, y1 = int(max(0, math.floor(ys.min()))), int(min(size - 1, math.ceil(ys.max())))
            if x1 < x0 or y1 < y0:
                continue
            d = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
            if abs(d) < 1e-9:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            w0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / d
            w1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / d
            w2 = 1 - w0 - w1
            inside = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4)
            if not inside.any():
                continue
            zz = w0 * zs[0] + w1 * zs[1] + w2 * zs[2]
            sub = zb[y0 : y1 + 1, x0 : x1 + 1]
            hit = inside & (zz < sub)
            sub[hit] = zz[hit]
            img[y0 : y1 + 1, x0 : x1 + 1][hit] = np.clip(C[i] * lam[i], 0, 1)
        tile = Image.fromarray((img * 255).astype(np.uint8))
        sheet.paste(tile, ((k % 2) * size, (k // 2) * size))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sheet.save(path)


def finish(key, title, note, covers=(), credit="Echoes of Exploration team (modelled in code from NASA reference drawings and photos)", preview=True):
    parts = _collect()
    allv = np.vstack([V for _, prims in parts for _, V, _, _ in prims])
    lo, hi = allv.min(0), allv.max(0)
    shift = np.array([-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]])
    parts = [(name, [(m, V + shift, N, F) for m, V, N, F in prims]) for name, prims in parts]
    size = hi - lo
    tris = sum(len(F) for _, prims in parts for _, _, _, F in prims)

    # glTF: Y up, so (x, y, z) -> (x, z, -y).
    def yup(A):
        return np.column_stack([A[:, 0], A[:, 2], -A[:, 1]]).astype(np.float32)

    blob = bytearray()
    views, accessors, meshes, nodes, materials = [], [], [], [], []
    mat_index = {}

    def add(data, target, comp, typ, minmax=False):
        while len(blob) % 4:
            blob.append(0)
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": data.nbytes, "target": target})
        blob.extend(data.tobytes())
        acc = {"bufferView": len(views) - 1, "componentType": comp, "count": int(data.shape[0] if data.ndim > 1 else data.size), "type": typ}
        if minmax:
            acc["min"] = [float(v) for v in data.min(0)]
            acc["max"] = [float(v) for v in data.max(0)]
        accessors.append(acc)
        return len(accessors) - 1

    for name, prims in parts:
        gl = []
        for m, V, N, F in prims:
            if m not in mat_index:
                d = _mats[m]
                mat_index[m] = len(materials)
                materials.append({"name": m, "doubleSided": bool(d["double"]), "pbrMetallicRoughness": {"baseColorFactor": [*d["color"], 1.0], "metallicFactor": d["metal"], "roughnessFactor": d["rough"]}})
            idx = F.astype(np.uint32 if len(V) > 65535 else np.uint16).reshape(-1)
            gl.append({
                "attributes": {"POSITION": add(yup(V), 34962, 5126, "VEC3", True), "NORMAL": add(yup(N), 34962, 5126, "VEC3")},
                "indices": add(idx, 34963, 5125 if len(V) > 65535 else 5123, "SCALAR"),
                "material": mat_index[m],
            })
        meshes.append({"name": name, "primitives": gl})
        nodes.append({"name": name, "mesh": len(meshes) - 1})
    root = {"name": key, "children": list(range(len(nodes)))}
    nodes.append(root)
    gltf = {
        "asset": {"version": "2.0", "generator": "Echoes of Exploration models-src/procedural/gen.py"},
        "scene": 0,
        "scenes": [{"nodes": [len(nodes) - 1]}],
        "nodes": nodes,
        "materials": materials,
        "meshes": meshes,
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(blob), "uri": "data:application/octet-stream;base64," + base64.b64encode(bytes(blob)).decode()}],
    }
    out = os.path.join(ROOT, "public", "models", f"{key}.gltf.json")
    with open(out, "w", encoding="utf-8", newline="") as f:
        json.dump(gltf, f, separators=(",", ":"))
    info = {
        "file": f"models/{key}.gltf.json",
        "title": title,
        "credit": credit,
        "license": "CC BY 4.0",
        "size_m": round(float(max(size)), 3),
        "bytes": os.path.getsize(out),
        "tris": int(tris),
        "covers": list(covers),
        "parts": [name for name, _ in parts],
        "note": note,
    }
    with open(os.path.join(HERE, f"{key}.json"), "w", encoding="utf-8", newline="") as f:
        json.dump(info, f, indent=2)
    if preview:
        _render(parts, os.path.join(HERE, "previews", f"{key}.png"))
    print(f"{key}: {size[0]:.2f} x {size[1]:.2f} x {size[2]:.2f} m, {tris} tris, {info['bytes'] / 1e3:.0f} kB, parts: {', '.join(info['parts'])}")
    return info
