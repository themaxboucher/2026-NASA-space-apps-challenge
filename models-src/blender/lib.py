"""Shared helpers for the Ghost Rover Atlas Blender model scripts.

Each <key>.py builds its geometry with these primitives (Blender Z-up, metres),
then calls finish(key, ...) which: joins everything into one mesh, moves the
origin to the base centre (min Z = 0, XY bbox centre = 0), saves <key>.blend,
exports <key>.glb (glTF Y-up, transforms applied), renders a 512x512 Workbench
preview and merges an entry into blender.json.

Run:  blender -b -P <key>.py
"""
import bpy, bmesh, math, os, json
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
_mats = {}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()


# ---------- materials ----------
PALETTE = {
    # name: (rgb, metallic, roughness)
    # metalness kept <= 0.6: the app's three.js r128 scene has no env map, full metal renders black
    "gold":      ((0.83, 0.62, 0.20), 0.6, 0.35),   # Kapton/aluminised gold foil
    "white":     ((0.88, 0.88, 0.86), 0.0, 0.6),    # white thermal paint
    "alu":       ((0.75, 0.76, 0.78), 0.5, 0.4),   # bare aluminium
    "darkalu":   ((0.35, 0.36, 0.38), 0.5, 0.5),
    "cell":      ((0.05, 0.09, 0.30), 0.3, 0.25),   # solar-cell blue
    "black":     ((0.03, 0.03, 0.035), 0.0, 0.7),
    "grey":      ((0.45, 0.45, 0.45), 0.0, 0.7),
    "glass":     ((0.15, 0.2, 0.25), 0.5, 0.1),
    "silver":    ((0.9, 0.9, 0.92), 0.6, 0.25),     # silvered mirror / reflector
}


def mat(name, color=None, metal=None, rough=None):
    """Get/create a Principled material. Uses PALETTE defaults when name matches."""
    if name in _mats:
        return _mats[name]
    c, m, r = PALETTE.get(name, ((0.5, 0.5, 0.5), 0.0, 0.6))
    c = color or c
    m = m if metal is None else metal
    r = r if rough is None else rough
    M = bpy.data.materials.new(name)
    M.use_nodes = True
    bsdf = M.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*c, 1)
    bsdf.inputs["Metallic"].default_value = m
    bsdf.inputs["Roughness"].default_value = r
    M.diffuse_color = (*c, 1)       # Workbench preview colour
    M.metallic = m
    M.roughness = r
    _mats[name] = M
    return M


def _setmat(ob, m):
    if m is not None:
        ob.data.materials.append(m if isinstance(m, bpy.types.Material) else mat(m))
    return ob


def _place(ob, loc, rot):
    ob.location = loc
    ob.rotation_euler = [math.radians(a) for a in rot]
    return ob


# ---------- primitives (rot in degrees) ----------
def box(size, loc=(0, 0, 0), rot=(0, 0, 0), m="grey"):
    bpy.ops.mesh.primitive_cube_add(size=1)
    ob = bpy.context.object
    ob.scale = size
    return _setmat(_place(ob, loc, rot), m)


def cyl(r, depth, loc=(0, 0, 0), rot=(0, 0, 0), m="grey", n=16, r2=None, cap=True):
    """Cylinder along local Z (or cone/frustum if r2 given: r bottom, r2 top)."""
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=n, radius=r, depth=depth,
                                            end_fill_type='NGON' if cap else 'NOTHING')
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=n, radius1=r, radius2=r2, depth=depth,
                                        end_fill_type='NGON' if cap else 'NOTHING')
    return _setmat(_place(bpy.context.object, loc, rot), m)


def sphere(r, loc=(0, 0, 0), m="grey", seg=16, ring=8, scale=(1, 1, 1), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=ring, radius=r)
    ob = bpy.context.object
    ob.scale = scale
    return _setmat(_place(ob, loc, rot), m)


def torus(R, r, loc=(0, 0, 0), rot=(0, 0, 0), m="grey", n=24, nm=8):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r,
                                     major_segments=n, minor_segments=nm)
    return _setmat(_place(bpy.context.object, loc, rot), m)


def strut(p1, p2, r=0.01, m="alu", n=6):
    """Cylinder between two points."""
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    bpy.ops.mesh.primitive_cylinder_add(vertices=n, radius=r, depth=d.length)
    ob = bpy.context.object
    ob.location = (p1 + p2) / 2
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = d.to_track_quat('Z', 'Y')
    return _setmat(ob, m)


def mesh(verts, faces, m="grey", name="mesh", loc=(0, 0, 0), rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return _setmat(_place(ob, loc, rot), m)


def plate(w, h, t=0.01, loc=(0, 0, 0), rot=(0, 0, 0), m="cell", frame="alu", fw=0.02):
    """Thin panel (e.g. solar panel) with a frame rim. w along X, h along Y."""
    out = [box((w, h, t), loc, rot, frame)]
    p = box((w - 2 * fw, h - 2 * fw, t * 1.4), loc, rot, m)
    out.append(p)
    return out


def dish(R, depth, loc=(0, 0, 0), rot=(0, 0, 0), m="white", n=24, rings=4):
    """Paraboloid dish opening along +Z, vertex at loc."""
    verts = [(0, 0, 0)]
    faces = []
    for i in range(1, rings + 1):
        rr = R * i / rings
        z = depth * (rr / R) ** 2
        for j in range(n):
            a = 2 * math.pi * j / n
            verts.append((rr * math.cos(a), rr * math.sin(a), z))
    for j in range(n):
        faces.append((0, 1 + j, 1 + (j + 1) % n))
    for i in range(rings - 1):
        b0, b1 = 1 + i * n, 1 + (i + 1) * n
        for j in range(n):
            faces.append((b0 + j, b0 + (j + 1) % n, b1 + (j + 1) % n, b1 + j))
    ob = mesh(verts, faces, m, "dish", loc, rot)
    sol = ob.modifiers.new("s", 'SOLIDIFY')
    sol.thickness = 0.01
    return ob


def ngon_prism(r, h, n, loc=(0, 0, 0), rot=(0, 0, 0), m="grey"):
    return cyl(r, h, loc, rot, m, n=n)


# ---------- finish ----------
def _join_all(key):
    obs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    for o in obs:  # bake modifiers (solidify etc.)
        bpy.context.view_layer.objects.active = o
        for md in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=md.name)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = key
    ob.data.name = key
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # origin at base centre
    xs = [v.co for v in ob.data.vertices]
    mn = Vector((min(v.x for v in xs), min(v.y for v in xs), min(v.z for v in xs)))
    mx = Vector((max(v.x for v in xs), max(v.y for v in xs), max(v.z for v in xs)))
    off = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    ob.data.transform(Matrix.Translation(-off))
    ob.location = (0, 0, 0)
    # remove doubles, smooth by angle (sets sharp edges, no modifier)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(ob.data); bm.free()
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
    except Exception:
        bpy.ops.object.shade_flat()
    return ob, mx - mn


def _render(ob, dims, path, elev=22, azim=35):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new("w"); sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.3, 0.32, 0.38, 1); bg.inputs[1].default_value = 0.6
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", 'SUN'))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(40), math.radians(10), math.radians(azim + 30))
    sc.collection.objects.link(sun)
    sc.render.resolution_x = sc.render.resolution_y = 512
    sc.render.film_transparent = False
    centre = Vector((0, 0, dims.z / 2))
    rad = dims.length / 2
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("cam", cam_data)
    sc.collection.objects.link(cam)
    fov = 2 * math.atan(36 / 2 / 50)
    dist = rad / math.sin(fov / 2) * 1.02
    e, a = math.radians(elev), math.radians(azim)
    cam.location = centre + Vector((math.cos(e) * math.sin(a), -math.cos(e) * math.cos(a), math.sin(e))) * dist
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = (centre - cam.location).to_track_quat('-Z', 'Y')
    cam_data.clip_end = dist * 4
    sc.camera = cam
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)


def finish(key, title, note, elev=22, azim=35):
    ob, dims = _join_all(key)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    blend = os.path.join(HERE, key + ".blend")
    glb = os.path.join(HERE, key + ".glb")
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_yup=True,
                              export_apply=True, use_selection=False,
                              export_cameras=False, export_lights=False)
    _render(ob, dims, os.path.join(HERE, "previews", key + ".png"), elev, azim)
    nbytes = os.path.getsize(glb)
    jpath = os.path.join(HERE, "blender.json")
    data = json.load(open(jpath)) if os.path.exists(jpath) else {}
    data[key] = {
        "file": f"models-src/blender/{key}.glb",
        "title": title,
        "credit": "Ghost Rover Atlas team (modelled in Blender from NASA reference images)",
        "license": "CC BY 4.0",
        "size_m": round(max(dims), 3),
        "bytes": nbytes,
        "tris": tris,
        "note": note,
    }
    with open(jpath, "w") as f:
        json.dump(dict(sorted(data.items())), f, indent=2)
    print(f"DONE {key}: dims={tuple(round(d, 3) for d in dims)} tris={tris} bytes={nbytes}")


def drop_uvs():
    """Untextured models: drop UV layers so the glb carries no TEXCOORD (smaller file)."""
    for o in bpy.data.objects:
        if o.type == 'MESH':
            for uv in list(o.data.uv_layers):
                o.data.uv_layers.remove(uv)


def cube_array(centres, r, pitch, depth, hexcell=False, name="cubes", top="alu", floor="glass", blanks=()):
    """Retro-reflector face: one gap-free plate (z=0 plane, local XY) with a round cavity per
    corner cube. Each cube = cell outline with a hole, cavity wall down to -depth, and a shallow
    cone floor (reads as the cube's facets). Square cells (pitch x pitch) or pointy-top hexagonal
    cells (flat sides along X, inradius pitch/2) for hex-packed rows. `blanks` = centres of solid
    cells (no cavity) used to fill a hex layout's zigzag border under a frame rim."""
    n = 12 if hexcell else 16
    verts, faces, mids = [], [], []
    def outline(cx, cy):
        for k in range(n):
            a = 2 * math.pi * k / n
            ca, sa = math.cos(a), math.sin(a)
            if hexcell:
                rel = (a - math.radians(30)) % math.radians(60) - math.radians(30)
                R = (pitch / 2) / math.cos(rel)
            else:
                R = (pitch / 2) / max(abs(ca), abs(sa))
            verts.append((cx + R * ca, cy + R * sa, 0))
    for (cx, cy) in blanks:
        b = len(verts); outline(cx, cy)
        faces.append(tuple(range(b, b + n))); mids.append(0)
    for (cx, cy) in centres:
        b = len(verts)
        outline(cx, cy)                                                          # cell outline
        for k in range(n):
            a = 2 * math.pi * k / n
            verts.append((cx + r * math.cos(a), cy + r * math.sin(a), 0))       # rim
        for k in range(n):
            a = 2 * math.pi * k / n
            verts.append((cx + r * math.cos(a), cy + r * math.sin(a), -depth))  # cavity bottom
        verts.append((cx, cy, -depth - r * 0.55))                               # cone apex
        for k in range(n):
            k2 = (k + 1) % n
            faces.append((b + k, b + k2, b + n + k2, b + n + k)); mids.append(0)            # top
            faces.append((b + n + k, b + n + k2, b + 2 * n + k2, b + 2 * n + k)); mids.append(0)  # wall
            faces.append((b + 2 * n + k, b + 2 * n + k2, b + 3 * n)); mids.append(1)       # floor
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat(top))
    ob.data.materials.append(mat(floor))
    for p, m in zip(me.polygons, mids):
        p.material_index = m
    return ob
