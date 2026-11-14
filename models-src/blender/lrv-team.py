# Apollo Lunar Roving Vehicle (LRV, Apollo 15/16/17), true scale, every part attached.
# References (NASA, public domain): NSSDCA LRV page (nssdc.gsfc.nasa.gov/planetary/lunar/apollo_lrv.html),
#   AS15-88-11901 (Apollo 15 LRV, side), AS17-146-22367 (Apollo 17 LRV, front quarter),
#   AS17-147-22526 (Cernan driving), S71-00166 (flight unit in the clean room).
# Dimensions: frame 3.10 m long, wheelbase 2.29 m, track 1.83 m (wheel centres), max height 1.14 m
#   (console/seat backs), ground clearance 0.36 m, wheels 0.818 m dia x 0.23 m wide (zinc-coated wire mesh,
#   titanium chevrons), high-gain umbrella dish 0.91 m dia on its mast.
# Axes (Blender): X = rover's right, +Y = FORWARD, Z = up, metres. glTF export (Y-up): front faces -Z.
# Output: one glTF node per named part (wheels, fenders, chassis, seats, hand_controller, batteries,
#   console, lcru, tv_camera, high_gain_antenna, low_gain_antenna, tool_carrier) so the app can glow a part.
# Run:  blender -b -P lrv-team.py
import sys, os, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import lib

KEY = "lrv-team"
reset()
WB, TR, WR, WW = 2.29, 1.83, 0.409, 0.23     # wheelbase, track, wheel radius, wheel width
YW, XW = WB / 2, TR / 2
RAIL_X, RAIL_Z = 0.56, 0.56                   # fwd/aft section side rails (top of frame ~0.59 m)
CRAIL_X = 0.70                                # centre section is wider: ~1.44 m (handbook fig. 1-1)
SEAT_X = 0.37                                 # seat centrelines
Y0, Y1 = -1.55, 1.55                          # frame ends (122 in = 3.10 m)
ZLOW = 0.43                                   # frame underside: 17 in no-load clearance (14 in loaded)
HINGE = 0.73                                  # fold hinges between the three chassis sections

mat("wiremesh", (0.30, 0.30, 0.29), 0.5, 0.6)  # zinc-coated piano-wire tyre (looks dark grey)
mat("chevron", (0.58, 0.57, 0.53), 0.5, 0.45)  # titanium tread chevrons
mat("fender", (0.64, 0.38, 0.21), 0.0, 0.65)   # orange-tan fibreglass dust guards
mat("webbing", (0.55, 0.63, 0.74), 0.0, 0.85)  # blue-grey nylon webbing
mat("webbing2", (0.86, 0.86, 0.84), 0.0, 0.85)
mat("panel", (0.16, 0.16, 0.17), 0.0, 0.5)     # console body
mat("face", (0.72, 0.72, 0.70), 0.0, 0.55)     # console face plate
mat("dishmesh", (0.80, 0.77, 0.68), 0.3, 0.55)  # gold-tinted umbrella mesh


def part(name, build):
    """Run build(), join every mesh it created into one object called `name`."""
    before = set(bpy.data.objects)
    build()
    new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    _join(new, name)


def _join(obs, name, loc=None, rot=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:
        bpy.context.view_layer.objects.active = o
        for md in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=md.name)
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = ob.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if loc is not None:  # place a sub-assembly built around the origin
        ob.rotation_euler = [math.radians(a) for a in rot]
        ob.location = loc
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


def group(build, loc, rot):
    before = set(bpy.data.objects)
    build()
    _join([o for o in bpy.data.objects if o not in before and o.type == 'MESH'], "grp", loc, rot)


def lathe_x(profile, c, m, n=40):
    """Revolve (axial offset, radius) profile around the X axis through c."""
    verts, faces = [], []
    for j in range(n):
        a = 2 * math.pi * j / n
        for ax, r in profile:
            verts.append((c[0] + ax, c[1] + r * math.sin(a), c[2] + r * math.cos(a)))
    P = len(profile)
    for j in range(n):
        for i in range(P - 1):
            a0, a1 = j * P + i, ((j + 1) % n) * P + i
            faces.append((a0, a0 + 1, a1 + 1, a1))
    return mesh(verts, faces, m, "lathe")


def chevron(c, th0, s):
    """V-shaped titanium tread strip on the tyre at angle th0 (around X), apex toward +rotation."""
    pts = [(-0.105, th0), (0.0, th0 + 0.09), (0.105, th0)]
    dth = 0.075
    verts, faces = [], []
    for ax, th in pts:
        for r in (WR - 0.004, WR + 0.010):
            for t in (th - dth / 2, th + dth / 2):
                verts.append((c[0] + ax, c[1] + r * math.sin(t), c[2] + r * math.cos(t)))
    for k in range(2):  # each segment: 8 verts block (inner/outer x 2 sides) -> box
        b, e = 4 * k, 4 * (k + 1)
        # layout per point: [r0 t0, r0 t1, r1 t0, r1 t1]
        faces += [(b + 2, b + 3, e + 3, e + 2), (b, e, e + 1, b + 1),
                  (b, b + 2, e + 2, e), (b + 1, e + 1, e + 3, b + 3)]
    faces += [(0, 1, 3, 2), (8, 10, 11, 9)]
    mesh(verts, faces, "chevron", "chev")


def fender_shell(xw, yw, front):
    s = 1 if xw > 0 else -1
    R, half = WR + 0.055, 0.165
    # arc angle measured from the top toward +Y; the extension reaches further out at the vehicle end
    a0, a1 = (-60, 88) if front else (-88, 60)
    n = 16
    prof = [(xw - s * half, R - 0.03), (xw - s * half, R), (xw + s * half, R), (xw + s * half, R - 0.08)]
    verts, faces = [], []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        for x, r in prof:
            verts.append((x, yw + r * math.sin(a), WR + r * math.cos(a)))
    for i in range(n):
        for k in range(3):
            b, e = 4 * i + k, 4 * (i + 1) + k
            faces.append((b, e, e + 1, b + 1) if s > 0 else (b, b + 1, e + 1, e))
    ob = mesh(verts, faces, "fender", "fender")
    ob.modifiers.new("s", 'SOLIDIFY').thickness = 0.008
    return xw - s * half, R


WHEELS = [(sx * XW, sy * YW) for sx in (-1, 1) for sy in (1, -1)]


# ---------------- wheels ----------------
def build_wheels():
    prof = [(-0.115, 0.27), (-0.115, 0.36), (-0.105, 0.392), (-0.085, WR), (0.085, WR),
            (0.105, 0.392), (0.115, 0.36), (0.115, 0.27)]
    for xw, yw in WHEELS:
        s = 1 if xw > 0 else -1
        c = (xw, yw, WR)
        lathe_x(prof, c, "wiremesh", n=40)
        # spun-aluminium outer disc, dished hub, inner disc
        cyl(0.272, 0.012, (xw + s * 0.108, yw, WR), (0, 90, 0), "alu", n=32)
        cyl(0.13, 0.05, (xw + s * 0.125, yw, WR), (0, 90, 0), "silver", n=20, r2=0.09) if s > 0 else \
            cyl(0.09, 0.05, (xw + s * 0.125, yw, WR), (0, 90, 0), "silver", n=20, r2=0.13)
        cyl(0.045, 0.03, (xw + s * 0.16, yw, WR), (0, 90, 0), "darkalu", n=12)
        cyl(0.272, 0.012, (xw - s * 0.108, yw, WR), (0, 90, 0), "darkalu", n=32)
        N = 18
        for k in range(N):
            chevron(c, 2 * math.pi * k / N, s)


# ---------------- fenders ----------------
FENDER_EDGE = {}


def build_fenders():
    for xw, yw in WHEELS:
        x_in, R = fender_shell(xw, yw, yw > 0)
        FENDER_EDGE[(xw, yw)] = (x_in, R)


# ---------------- chassis + suspension ----------------
def build_chassis():
    # three hinged sections (handbook fig. 1-1): narrow forward/aft sections, wide centre crew section
    for sx in (-1, 1):
        for ya, yb in ((Y0, -HINGE), (HINGE, Y1)):
            box((0.05, yb - ya - 0.03, 0.06), (sx * RAIL_X, (ya + yb) / 2, RAIL_Z), m="alu")
            strut((sx * (RAIL_X - 0.04), ya + 0.08, ZLOW), (sx * (RAIL_X - 0.04), yb - 0.08, ZLOW), 0.018, "alu")
            for y in (ya + 0.08, (ya + yb) / 2, yb - 0.08):
                strut((sx * (RAIL_X - 0.04), y, ZLOW), (sx * RAIL_X, y, RAIL_Z - 0.03), 0.015, "alu")
        box((0.05, 2 * HINGE - 0.03, 0.06), (sx * CRAIL_X, 0, RAIL_Z), m="alu")
        strut((sx * (CRAIL_X - 0.04), -HINGE + 0.06, ZLOW), (sx * (CRAIL_X - 0.04), HINGE - 0.06, ZLOW), 0.018, "alu")
        for y in (-HINGE + 0.06, 0.0, HINGE - 0.06):
            strut((sx * (CRAIL_X - 0.04), y, ZLOW), (sx * CRAIL_X, y, RAIL_Z - 0.03), 0.015, "alu")
        for sy in (-1, 1):  # fold hinges
            cyl(0.035, 0.09, (sx * RAIL_X, sy * HINGE, RAIL_Z), (0, 90, 0), "darkalu", n=10)
    for y in (Y0 + 0.025, -HINGE - 0.035, HINGE + 0.035, Y1 - 0.025):
        box((2 * RAIL_X, 0.04, 0.04), (0, y, RAIL_Z), m="alu")
    for y in (-HINGE + 0.03, 0.0, HINGE - 0.03):
        box((2 * CRAIL_X, 0.04, 0.04), (0, y, RAIL_Z), m="alu")
    for y in (-HINGE + 0.03, HINGE - 0.03):
        box((2 * CRAIL_X, 0.03, 0.03), (0, y, ZLOW), m="alu")
    # floor panels: centre (crew) section, forward and aft decks
    box((2 * CRAIL_X - 0.02, 2 * HINGE - 0.06, 0.012), (0, 0, RAIL_Z - 0.035), m="alu")
    box((2 * RAIL_X - 0.02, Y1 - HINGE - 0.08, 0.012), (0, (Y1 + HINGE) / 2, RAIL_Z - 0.035), m="darkalu")
    box((2 * RAIL_X - 0.02, -Y0 - HINGE - 0.08, 0.012), (0, (Y0 - HINGE) / 2, RAIL_Z - 0.035), m="darkalu")
    # footrests (adjustable bars in front of each seat)
    for x in (-SEAT_X, SEAT_X):
        strut((x - 0.18, 0.60, RAIL_Z + 0.03), (x + 0.18, 0.60, RAIL_Z + 0.03), 0.012, "alu")
        for xx in (x - 0.18, x + 0.18):
            strut((xx, 0.60, RAIL_Z + 0.03), (xx, 0.66, RAIL_Z - 0.03), 0.01, "alu")
    # suspension: upper + lower wishbones from the frame to each traction-drive/steering knuckle
    for xw, yw in WHEELS:
        s = 1 if xw > 0 else -1
        kx = xw - s * 0.17                       # knuckle just inside the wheel's inner disc
        box((0.10, 0.16, 0.18), (kx, yw, WR), m="darkalu")
        cyl(0.07, 0.07, (xw - s * 0.11, yw, WR), (0, 90, 0), "darkalu", n=12)   # traction drive into hub
        inward = -1 if yw > 0 else 1
        for xf, zf, zk in ((RAIL_X, RAIL_Z - 0.02, WR + 0.07), (RAIL_X - 0.04, ZLOW, WR - 0.07)):
            for dy in (0.0, inward * 0.30):
                strut((s * xf, yw + dy - inward * 0.12, zf), (kx - s * 0.04, yw, zk), 0.016, "alu")
        # fender bracket: fender inner edge -> knuckle top
        x_in, R = FENDER_EDGE[(xw, yw)]
        for a in (-25, 0, 25):
            t = math.radians(a)
            strut((x_in, yw + R * math.sin(t), WR + R * math.cos(t)), (kx, yw + 0.05 * math.sin(t), WR + 0.09), 0.011, "alu")
        # damper
        strut((s * RAIL_X, yw - inward * 0.12, RAIL_Z + 0.03), (kx, yw, WR + 0.09), 0.02, "grey")


# ---------------- crew station ----------------
def seat_webbing(p0, u, v, nu, nv, m1, m2):
    """Straps on a rectangle at p0 spanned by vectors u, v (checkered nylon webbing)."""
    p0, u, v = Vector(p0), Vector(u), Vector(v)
    n = u.cross(v).normalized()
    for i in range(nu):
        c = p0 + u * ((i + 0.5) / nu) + v * 0.5
        _strap(c, u.normalized(), v, 0.8 / nu * u.length, n, m1 if i % 2 else m2)
    for j in range(nv):
        c = p0 + v * ((j + 0.5) / nv) + u * 0.5 + n * 0.004
        _strap(c, v.normalized(), u, 0.8 / nv * v.length, n, m2 if j % 2 else m1)


def _strap(c, wdir, ldir, w, n, m):
    ob = box((1, 1, 1), m=m)
    ob.matrix_world = Matrix((
        (wdir.x * w, ldir.x, n.x * 0.006, c.x),
        (wdir.y * w, ldir.y, n.y * 0.006, c.y),
        (wdir.z * w, ldir.z, n.z * 0.006, c.z),
        (0, 0, 0, 1)))


def build_seats():
    ZP = 0.74                      # seat pan height (~0.2 m above the floor)
    yf, yr = -0.04, -0.58          # pan front / rear (rear half of the centre section)
    top = (-0.70, 1.14)            # seat-back top (y, z): the 1.14 m max height, leaning back ~15 deg
    for xc in (-SEAT_X, SEAT_X):
        xa, xb = xc - 0.25, xc + 0.25
        # tubular frame
        for x in (xa, xb):
            strut((x, yf, ZP), (x, yr, ZP), 0.013, "alu")
            strut((x, yr, ZP), (x, top[0], top[1]), 0.013, "alu")
            strut((x, yf, ZP), (x, yf + 0.02, RAIL_Z - 0.03), 0.013, "alu")    # front legs to floor
            strut((x, yr, ZP), (x, yr, RAIL_Z - 0.03), 0.013, "alu")           # rear legs
        for y, z in ((yf, ZP), (yr, ZP), top):
            strut((xa, y, z), (xb, y, z), 0.013, "alu")
        # webbing on pan and back
        seat_webbing((xa + 0.01, yr, ZP + 0.012), (0.48, 0, 0), (0, yf - yr, 0), 4, 3, "webbing", "webbing2")
        seat_webbing((xa + 0.01, yr - 0.005, ZP), (0.48, 0, 0), (0, top[0] - yr, top[1] - ZP), 4, 3, "webbing", "webbing2")
        # velcro seat belt draped from the outboard back tube across the pan
        ob, d = (xb, -0.04) if xc > 0 else (xa, 0.04)
        strut((ob, yr - 0.04, ZP + 0.22), (ob + d, yr + 0.26, ZP + 0.05), 0.018, "webbing2")
        strut((ob + d, yr + 0.26, ZP + 0.05), (xc, yf - 0.06, ZP + 0.03), 0.018, "webbing2")
    # armrest between the seats (hand controller stands on its front end)
    box((0.10, 0.52, 0.04), (0, -0.20, 0.80), m="white")
    for y in (-0.42, 0.02):
        strut((0, y, 0.78), (0, y, RAIL_Z - 0.03), 0.018, "alu")


def build_hand_controller():
    box((0.09, 0.09, 0.06), (0, 0.03, 0.85), m="panel")               # base on the armrest's front end
    cyl(0.03, 0.04, (0, 0.03, 0.90), m="black", n=10)                  # rubber boot
    strut((0, 0.03, 0.90), (0, 0.02, 1.03), 0.012, "alu")             # stick
    strut((-0.06, 0.02, 1.03), (0.06, 0.02, 1.03), 0.018, "black")    # T-handle grip


def build_console():
    strut((0, HINGE - 0.03, RAIL_Z), (0, 0.40, 0.86), 0.025, "alu")   # pedestal from the hinge cross-member
    box((0.14, 0.06, 0.06), (0, 0.40, 0.86), m="alu")
    box((0.34, 0.09, 0.34), (0, 0.38, 0.98), (-22, 0, 0), "panel")
    box((0.30, 0.01, 0.30), (0, 0.327, 0.962), (-22, 0, 0), "face")   # display/control face toward crew
    for dx, dz in ((-0.08, 0.05), (0.07, 0.06), (0.0, -0.07)):        # heading / speed dials
        c = Vector((dx, -0.006, dz))
        c.rotate(Matrix.Rotation(math.radians(-22), 3, 'X'))
        cyl(0.035, 0.012, (c.x, 0.327 + c.y, 0.962 + c.z), (68, 0, 0), "black", n=12)
    box((0.36, 0.16, 0.01), (0, 0.40, 1.135), (-10, 0, 0), "white")   # sun shade


# ---------------- forward section ----------------
def build_batteries():
    # battery #1, signal processing / drive electronics, battery #2 on the forward deck
    for x, w in ((-0.31, 0.32), (0.0, 0.24), (0.31, 0.32)):
        box((w, 0.44, 0.19), (x, 1.02, RAIL_Z + 0.095 - 0.03), m="white")
        # hinged dust covers with mirror radiators on top
        box((w + 0.02, 0.46, 0.015), (x, 1.02, RAIL_Z + 0.17), m="white")
        box((w - 0.04, 0.38, 0.006), (x, 1.02, RAIL_Z + 0.18), m="silver")
        cyl(0.012, w, (x, 0.795, RAIL_Z + 0.17), (0, 90, 0), "darkalu", n=6)  # cover hinge
    box((0.92, 0.012, 0.15), (0, 0.795, RAIL_Z + 0.06), m="gold")           # thermal blanket on the aft face


def build_lcru():
    # Lunar Communications Relay Unit on its front mount
    box((0.44, 0.22, 0.30), (0, 1.52, 0.88), m="white")
    box((0.45, 0.012, 0.44), (0, 1.636, 0.80), m="gold")                   # gold-foil front blanket
    box((0.46, 0.24, 0.01), (0, 1.52, 1.035), m="silver")                  # radiator mirror
    for x in (-0.18, 0.18):
        strut((x, Y1 - 0.03, RAIL_Z), (x, 1.56, 0.73), 0.016, "alu")
        strut((x, 1.30, RAIL_Z - 0.03), (x, 1.45, 0.73), 0.016, "alu")


def build_tv_camera():
    # Ground-Commanded Television Assembly (GCTA): gold-wrapped camera on a pan/tilt head and mast
    strut((0.16, 1.58, 1.035), (0.16, 1.64, 1.12), 0.022, "alu")
    box((0.08, 0.08, 0.05), (0.16, 1.64, 1.14), m="darkalu")               # pan/tilt head
    box((0.15, 0.32, 0.15), (0.16, 1.68, 1.24), m="gold")
    cyl(0.06, 0.08, (0.16, 1.88, 1.24), (-90, 0, 0), "black", n=14, r2=0.05)   # zoom lens
    box((0.17, 0.30, 0.008), (0.16, 1.68, 1.32), m="silver")              # radiator top


def build_hga():
    def dish_assy():
        dish(0.455, 0.14, (0, 0, 0), m="dishmesh", n=24, rings=4)
        for k in range(12):
            a = 2 * math.pi * k / 12
            pts = [(r * math.cos(a), r * math.sin(a), 0.14 * (r / 0.455) ** 2 + 0.01) for r in (0.0, 0.23, 0.455)]
            strut(pts[0], pts[1], 0.006, "alu", n=4)
            strut(pts[1], pts[2], 0.006, "alu", n=4)
        strut((0, 0, 0), (0, 0, 0.36), 0.012, "alu")                       # boresight handle
        box((0.04, 0.04, 0.06), (0, 0, 0.38), m="darkalu")                 # optical sight
        cyl(0.05, 0.08, (0, 0, -0.04), m="darkalu", n=10)                   # gimbal hub
    el = 55   # dish axis elevation, pointing forward-up
    top = (-0.16, 1.58, 1.88)
    strut((-0.16, 1.58, 1.035), top, 0.02, "alu")                          # mast, on top of the LCRU
    group(dish_assy, (top[0], top[1], top[2] + 0.07), (-(90 - el), 0, 0))
    strut((-0.16, 1.58, 1.30), (-0.16, 1.44, 1.035), 0.012, "alu")          # brace


def build_lga():
    # low-gain helical antenna on a mast beside the console (right of the crew station's front)
    x0, y0 = 0.24, HINGE - 0.03
    strut((x0, y0, RAIL_Z), (x0, y0, 1.30), 0.014, "alu")
    cyl(0.012, 0.58, (x0, y0, 1.60), m="white", n=6)
    pts, turns, seg = [], 7, 10
    for i in range(turns * seg + 1):
        t = 2 * math.pi * i / seg
        pts.append((x0 + 0.032 * math.cos(t), y0 + 0.032 * math.sin(t), 1.32 + 0.53 * i / (turns * seg)))
    for a, b in zip(pts, pts[1:]):
        strut(a, b, 0.004, "silver", n=4)
    cyl(0.04, 0.01, (x0, y0, 1.31), m="darkalu", n=10)


def build_tool_carrier():
    # aft payload pallet: sample bags/tool carrier frame with geology tools
    box((0.70, 0.55, 0.24), (0, -1.08, RAIL_Z + 0.09), m="gold")
    box((0.72, 0.57, 0.012), (0, -1.08, RAIL_Z + 0.215), m="white")
    for x in (-0.3, 0.3):
        strut((x, -1.46, RAIL_Z - 0.03), (x, -1.46, 1.05), 0.012, "alu")
    strut((-0.3, -1.46, 1.05), (0.3, -1.46, 1.05), 0.012, "alu")
    strut((-0.3, -1.46, 0.75), (0.3, -1.46, 0.75), 0.012, "alu")
    for x, top in ((-0.2, 1.30), (-0.05, 1.22), (0.12, 1.28)):              # tongs, rake, scoop handles
        strut((x, -1.44, 0.6), (x, -1.47, top), 0.01, "darkalu", n=6)
    box((0.18, 0.06, 0.12), (0.22, -1.44, 0.95), m="white")                # gnomon / bag holder


part("wheels", build_wheels)
part("fenders", build_fenders)
part("chassis", build_chassis)
part("seats", build_seats)
part("hand_controller", build_hand_controller)
part("console", build_console)
part("batteries", build_batteries)
part("lcru", build_lcru)
part("tv_camera", build_tv_camera)
part("high_gain_antenna", build_hga)
part("low_gain_antenna", build_lga)
part("tool_carrier", build_tool_carrier)

# ---------------- finish: base centre at origin, export, previews ----------------
obs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
allv = [v.co for o in obs for v in o.data.vertices]
mn = Vector((min(v.x for v in allv), min(v.y for v in allv), min(v.z for v in allv)))
mx = Vector((max(v.x for v in allv), max(v.y for v in allv), max(v.z for v in allv)))
off = Vector((0, 0, mn.z))   # origin: ground under the centre of the wheelbase/frame (not the bbox: the dish overhangs the front)
dims = mx - mn
tris = 0
for o in obs:
    o.data.transform(Matrix.Translation(-off))
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data); bm.free()
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
    tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
    print(f"  part {o.name}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris")

# connectivity check: every loose piece must touch another (AABB overlap, 5 mm slack) and all reach the wheels.
# ponytail: AABB proxy, so a diagonal strut can pass while not quite touching; catches floating parts.
isl = []
for o in obs:
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    seen = set()
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, comp = [v], []
        seen.add(v.index)
        while stack:
            u = stack.pop(); comp.append(u.co.copy())
            for e in u.link_edges:
                w = e.other_vert(u)
                if w.index not in seen:
                    seen.add(w.index); stack.append(w)
        isl.append((o.name, Vector([min(c[i] for c in comp) - 0.005 for i in range(3)]),
                    Vector([max(c[i] for c in comp) + 0.005 for i in range(3)])))
    bm.free()
adj = {i: [j for j in range(len(isl)) if j != i and all(isl[i][1][k] <= isl[j][2][k] and isl[j][1][k] <= isl[i][2][k] for k in range(3))]
       for i in range(len(isl))}
reach, stack = {0}, [0]
while stack:
    for j in adj[stack.pop()]:
        if j not in reach:
            reach.add(j); stack.append(j)
loose = [isl[i][0] for i in range(len(isl)) if i not in reach]
print(f"CONNECTIVITY: {len(isl)} pieces, {len(loose)} not connected", sorted(set(loose)))
assert not loose, loose

blend, glb = os.path.join(HERE, KEY + ".blend"), os.path.join(HERE, KEY + ".glb")
bpy.ops.wm.save_as_mainfile(filepath=blend)
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_yup=True, export_apply=True,
                          use_selection=False, export_cameras=False, export_lights=False)

views = {"": (22, 35), "-side": (8, -90), "-front": (14, -125)}   # (elev, azim); -90 = left side, front to image-left
for suffix, (e, a) in views.items():
    for o in [o for o in bpy.data.objects if o.type == 'LIGHT']:
        bpy.data.objects.remove(o)
    lib._render(obs[0], dims, os.path.join(HERE, "previews", KEY + suffix + ".png"), e, a)

jpath = os.path.join(HERE, "blender.json")
data = json.load(open(jpath)) if os.path.exists(jpath) else {}
data[KEY] = {
    "file": f"models-src/blender/{KEY}.glb",
    "title": "Apollo Lunar Roving Vehicle (true scale)",
    "credit": "Ghost Rover Atlas team (modelled in Blender from NASA reference images)",
    "license": "CC BY 4.0",
    "size_m": round(max(dims), 3),
    "bytes": os.path.getsize(glb),
    "tris": tris,
    "note": "True-scale LRV (Apollo 15-17): 2.29 m wheelbase, 1.83 m track, 0.818 m wire wheels with chevrons. "
            "Front faces -Z (glTF). Separate named nodes: " + ", ".join(o.name for o in obs) + ".",
}
with open(jpath, "w") as f:
    json.dump(dict(sorted(data.items())), f, indent=2)
print(f"DONE {KEY}: dims={tuple(round(d, 3) for d in dims)} tris={tris} bytes={os.path.getsize(glb)}")
