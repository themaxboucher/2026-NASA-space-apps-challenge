"""Extra mesh builders for the Mars / deep-space Blender scripts (used alongside lib.py).

revolve  - solid or shell of revolution from an (r, z) profile
blob     - noisy squashed icosphere (crumpled fabric, airbag remnants)
tube     - polyline tube (cables, parachute lines, booms) with continuous joints
cells    - grid of solar-cell quads clipped to a 2D polygon on a plane
"""
import math, random
import bpy, bmesh
from mathutils import Vector, noise
from lib import mesh, _setmat


def _recalc(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data); bm.free()
    return ob


def revolve(profile, m="grey", n=32, name="rev", loc=(0, 0, 0), rot=(0, 0, 0), mats=None):
    """profile: [(r, z), ...]. r == 0 makes a pole. Start and end on the axis for a closed solid.
    mats: optional per-segment material index list (len(profile)-1); materials given as list in m."""
    verts, rings = [], []
    for r, z in profile:
        if r < 1e-6:
            rings.append([len(verts)]); verts.append((0, 0, z))
        else:
            ring = []
            for j in range(n):
                a = 2 * math.pi * j / n
                ring.append(len(verts)); verts.append((r * math.cos(a), r * math.sin(a), z))
            rings.append(ring)
    faces, fidx = [], []
    for i in range(len(rings) - 1):
        A, B = rings[i], rings[i + 1]
        for j in range(n):
            j1 = (j + 1) % n
            if len(A) == 1 and len(B) == 1:
                continue
            if len(A) == 1:
                faces.append((A[0], B[j], B[j1]))
            elif len(B) == 1:
                faces.append((A[j], A[j1], B[0]))
            else:
                faces.append((A[j], A[j1], B[j1], B[j]))
            fidx.append(i)
    ms = m if isinstance(m, (list, tuple)) else [m]
    ob = mesh(verts, faces, ms[0], name, loc, rot)
    for extra in ms[1:]:
        _setmat(ob, extra)
    if mats:
        for p, i in zip(ob.data.polygons, fidx):
            p.material_index = mats[i]
    return _recalc(ob)


def blob(center, radii, m="grey", seed=0, rough=0.25, freq=2.2, sub=2, flat_bottom=None, name="blob", wrinkle=0.0):
    """Crumpled lump: icosphere scaled to radii, displaced by noise. flat_bottom clamps z >= value (world)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    off = Vector((seed * 7.31, seed * 3.17, seed * 5.71))
    for v in bm.verts:
        d = v.co.normalized()
        k = 1 + rough * noise.noise(d * freq + off) + rough * 0.5 * noise.noise(d * freq * 2.7 + off)
        k += wrinkle * noise.noise(d * freq * 7.0 + off * 1.3)
        p = Vector((d.x * radii[0], d.y * radii[1], d.z * radii[2])) * k + Vector(center)
        if flat_bottom is not None and p.z < flat_bottom:
            p.z = flat_bottom
        v.co = p
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    return _setmat(ob, m)


def tube(points, r=0.01, m="alu", n=6, name="tube"):
    """Tube along a polyline; rings are mitred by averaging adjacent directions (no gaps at joints)."""
    pts = [Vector(p) for p in points]
    verts, faces = [], []
    up = Vector((0, 0, 1))
    for i, p in enumerate(pts):
        d0 = (pts[i] - pts[i - 1]).normalized() if i > 0 else None
        d1 = (pts[i + 1] - pts[i]).normalized() if i < len(pts) - 1 else None
        d = (d0 + d1).normalized() if d0 and d1 else (d0 or d1)
        ref = up if abs(d.dot(up)) < 0.9 else Vector((1, 0, 0))
        u = d.cross(ref).normalized(); w = d.cross(u).normalized()
        for j in range(n):
            a = 2 * math.pi * j / n
            verts.append(p + (u * math.cos(a) + w * math.sin(a)) * r)
    for i in range(len(pts) - 1):
        for j in range(n):
            a, b = i * n + j, i * n + (j + 1) % n
            faces.append((a, b, b + n, a + n))
    faces.append(tuple(range(n))[::-1])
    L = (len(pts) - 1) * n
    faces.append(tuple(range(L, L + n)))
    return _recalc(mesh(verts, faces, m, name))


def _inside(p, poly):
    x, y = p; c = False
    for i in range(len(poly)):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def cells(poly, origin, u, v, size, gap, m="cell", lift=0.004, name="cells"):
    """Solar-cell quads (size x size, separated by gap) filling a 2D polygon given in (u, v) coords
    on the plane origin + a*u + b*v (u, v orthonormal). Cells sit `lift` above the plane."""
    o, u, v = Vector(origin), Vector(u), Vector(v)
    nrm = u.cross(v).normalized()
    us = [p[0] for p in poly]; vs = [p[1] for p in poly]
    verts, faces = [], []
    step = size + gap
    a = min(us) + gap
    while a + size <= max(us):
        b = min(vs) + gap
        while b + size <= max(vs):
            corners = [(a, b), (a + size, b), (a + size, b + size), (a, b + size)]
            if all(_inside(c, poly) for c in corners):
                k = len(verts)
                verts += [o + u * c[0] + v * c[1] + nrm * lift for c in corners]
                faces.append((k, k + 1, k + 2, k + 3))
            b += step
        a += step
    if not faces:
        return None
    return mesh(verts, faces, m, name)


def flute(ob, zmin, zmax, n, amp=0.012):
    """Ribbed look: push every other ring vertex out (by amp * r) for verts with zmin < z < zmax."""
    for v in ob.data.vertices:
        if zmin < v.co.z < zmax:
            r = math.hypot(v.co.x, v.co.y)
            if r < 1e-6:
                continue
            j = round(math.atan2(v.co.y, v.co.x) / (2 * math.pi / n))
            if j % 2 == 0:
                v.co.x *= 1 + amp; v.co.y *= 1 + amp
    return ob
