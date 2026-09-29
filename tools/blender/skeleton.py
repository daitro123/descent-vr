# The undead grunt (variant 0: kettle helm, pauldron, dark loincloth, rusty
# sword), remodelled in Blender on the game's 14-bone rig at the grunt's
# proportions (src/models/characters.ts).
#
# Bones are rigid, as a skeleton's are: every piece is weighted wholly to one
# bone. The skull is a lathe with deep eye sockets and glowing eyes (the _FX
# glow channel), a nasal hole and a row of teeth; the ribs are bent tubes
# round a knobbly spine; long bones swell at their joints.
#
# Needs lowpoly.py's helpers in scope (see build_all.py).

GRUNT_P = dict(hipY=0.92, hipW=0.09, spine=0.44, shoulderW=0.19, neck=0.48, upperArm=0.28, forearm=0.25, thigh=0.43, shin=0.43)

K = dict(
    bone=0xd9cfb0, shade=0xb0a383, dark=0x6e6452, socket=0x120a08, teeth=0xe6dcc0, eye=0xff6a2a,
    rust=0x8a5436, iron=0x72757e, ironDark=0x3a3b42, leather=0x5c3d26, leatherDark=0x38251a, cloth=0x2c2426,
)


def _part(ob, bone, colour, seed, **kw):
    paint(ob, colour, seed=seed, **kw)
    assign_bone(ob, bone)
    return ob


def sk_skull(sc, J):
    top = J['head'].z
    profile = [
        (0.05, 0.058, 0.068, 0.045),
        (0.075, 0.068, 0.084, 0.06),
        (0.1, 0.083, 0.093, 0.082),
        (0.12, 0.09, 0.097, 0.095),
        (0.155, 0.095, 0.1, 0.104),
        (0.175, 0.098, 0.101, 0.109),
        (0.21, 0.096, 0.092, 0.11),
        (0.24, 0.078, 0.072, 0.094),
        (0.262, 0.046, 0.042, 0.056),
    ]
    profile = [(z + top, rx, f, b) for z, rx, f, b in profile]
    segs = 10

    def shape(i, j, v):
        a = 2 * math.pi * (j + 0.5) / segs
        if math.cos(a) > 0 and i >= 1:
            v.y = -profile[i][2] * math.sqrt(math.cos(a))
        if i == 2 and abs(math.sin(a)) > 0.8:  # cheekbones
            v.x *= 1.06
        return v

    ob = rings(sc, 'skull', profile, segs, phase=0.5, shape=shape)
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    kind = bm.faces.layers.int.new('kind')
    BONE, SHADE, SOCKET, EYE, TEETH = 0, 1, 2, 3, 4
    F = lambda i, j: bm.faces[i * segs + j]
    for j in (8, 9, 0):
        F(0, j)[kind] = TEETH
    for j in (7, 1):
        F(0, j)[kind] = SHADE
    for j in (8, 0):
        F(4, j)[kind] = SHADE  # brow ridge underside reads darker
    sockets, n = [F(3, 0), F(3, 8)], F(2, 9)
    # Sockets: sunk deep, then a smaller glowing eye inside.
    for f in sockets:
        bmesh.ops.inset_individual(bm, faces=[f], thickness=0.005, depth=-0.018)
        f[kind] = SOCKET
        r = bmesh.ops.inset_individual(bm, faces=[f], thickness=0.009, depth=0.004)
        f[kind] = EYE
        for g in r['faces']:
            g[kind] = SOCKET
    # The nasal hole.
    r = bmesh.ops.inset_individual(bm, faces=[n], thickness=0.006, depth=-0.012)
    n[kind] = SOCKET
    for v in n.verts:
        if v.co.z > top + 0.11:
            v.co.x *= 0.3
    bm.to_mesh(me)
    bm.free()
    kinds = me.attributes['kind'].data
    colours = {BONE: K['bone'], SHADE: K['shade'], SOCKET: K['socket'], EYE: K['eye'], TEETH: K['teeth']}
    paint(ob, lambda p: colours[kinds[p.index].value], seed=21, by_face=True, jitter=0.06)
    fx = me.attributes['_FX'].data
    for p in me.polygons:
        if kinds[p.index].value == EYE:
            for vi in p.vertices:
                fx[vi].vector = (1.0, 0.0)
    me.attributes.remove(me.attributes['kind'])
    assign_bone(ob, 'head')
    neck = tube(sc, 'neck', [(0, 0.012, top - 0.07), (0, 0.018, top - 0.03), (0, 0.015, top + 0.06)], [0.022, 0.026, 0.02])
    _part(neck, 'head', K['shade'], 22)
    return [ob, neck]


def sk_jaw(sc, J):
    j = J['head']
    z = j.z
    nodes = [
        (Vector((0.07, 0.012, z + 0.1)), (0.011, 0.016)),
        (Vector((0.066, -0.005, z + 0.045)), (0.012, 0.02)),
        (Vector((0.04, -0.058, z + 0.038)), (0.011, 0.018)),
        (Vector((0.0, -0.078, z + 0.036)), (0.014, 0.02)),
        (Vector((-0.04, -0.058, z + 0.038)), (0.011, 0.018)),
        (Vector((-0.066, -0.005, z + 0.045)), (0.012, 0.02)),
        (Vector((-0.07, 0.012, z + 0.1)), (0.011, 0.016)),
    ]
    ob = skin(sc, 'jaw', nodes, [(i, i + 1) for i in range(6)], subsurf=1, target_tris=64, root=3)
    _part(ob, 'jaw', lambda c: K['teeth'] if c.z > z + 0.046 and c.y < -0.035 else K['bone'], 23)
    return [ob]


def sk_torso(sc, J):
    s0 = J['spine'].z
    L = GRUNT_P['spine']
    out = []
    # A knobbly spine, up the back.
    pts = [(0, 0.055 + 0.02 * math.sin(k / 6 * math.pi), s0 - 0.04 + k / 6 * (L + 0.02)) for k in range(7)]
    sp = tube(sc, 'spine', pts, [0.026 if k % 2 == 0 else 0.017 for k in range(7)], sides=4, twist=math.pi / 4)
    out.append(_part(sp, 'spine', K['shade'], 24))
    # Ribs: bent tubes from the spine round to the sternum, dropping toward the front.
    for n, (dz, w, d) in enumerate([(0.07, 0.26, 0.17), (0.13, 0.28, 0.18), (0.19, 0.26, 0.17), (0.25, 0.21, 0.15)]):
        z = s0 + L - dz
        for s in (1, -1):
            pts = [(0.03 * s, 0.07, z), (w * 0.42 * s, 0.05, z - 0.004), (w * 0.5 * s, -0.01, z - 0.018),
                   (w * 0.36 * s, -d * 0.48, z - 0.04), (0.03 * s, -d * 0.52, z - 0.05)]
            rib = tube(sc, 'rib', pts, 0.014, sides=3)
            out.append(_part(rib, 'spine', K['bone'], 30 + n * 2 + (s > 0)))
    st = box(sc, 'sternum', (0.036, 0.024, 0.2), at=(0, -0.092, s0 + L - 0.15), rot=(-0.12, 0, 0), taper=(0.8, 1))
    out.append(_part(st, 'spine', K['bone'], 40))
    for s in (1, -1):
        cl = tube(sc, 'clavicle', [(0.02 * s, -0.085, s0 + L - 0.03), (0.17 * s, -0.01, s0 + L)], 0.012, sides=4)
        out.append(_part(cl, 'spine', K['bone'], 41))
        sca = box(sc, 'scapula', (0.1, 0.02, 0.13), at=(0.09 * s, 0.1, s0 + L - 0.09), rot=(0.15, 0, 0), taper=(1.2, 1))
        out.append(_part(sca, 'spine', K['shade'], 42))
    # Pelvis: a bowl, dark inside, with two dark holes in front.
    h = J['hips'].z
    pel = rings(sc, 'pelvis', [(h - 0.07, 0.07, 0.05, 0.045), (h - 0.02, 0.115, 0.07, 0.06), (h + 0.06, 0.145, 0.07, 0.07)], 8,
                cap_bottom=True, cap_top=True, phase=0.5)

    def pel_col(c):
        if c.z > h + 0.059:
            return K['socket']
        a = abs(math.degrees(math.atan2(c.x, -c.y)))
        if 20 < a < 70 and c.z < h - 0.02:
            return K['socket']
        return K['bone']

    out.append(_part(pel, 'hips', pel_col, 43))
    return out


def sk_limbs(sc, J):
    out = []
    for s, side in ((1, 'L'), (-1, 'R')):
        ua = J['upperArm' + side]
        fa = J['forearm' + side]
        hd = J['hand' + side]
        th = J['thigh' + side]
        sh = J['shin' + side]
        x = ua.x
        hum = skin(sc, 'humerus', [(Vector((x, 0, ua.z - 0.01)), (0.034, 0.034)), (Vector((x, 0, ua.z - 0.06)), (0.02, 0.02)),
                                   (Vector((x, 0.004, fa.z + 0.06)), (0.017, 0.017)), (Vector((x, 0, fa.z - 0.012)), (0.03, 0.024))],
                   [(0, 1), (1, 2), (2, 3)], subsurf=1, target_tris=44)
        out.append(_part(hum, 'upperArm' + side, K['bone'], 50))
        for dx, col in ((0.012, K['bone']), (-0.012, K['shade'])):
            b = tube(sc, 'forearm', [(x + dx, 0, fa.z + 0.004), (x + dx * 0.8, -0.004, (fa.z + hd.z) / 2), (x + dx, 0, hd.z + 0.01)],
                     [0.013, 0.009, 0.012], sides=4, twist=math.pi / 4)
            out.append(_part(b, 'forearm' + side, col, 51))
        carp = box(sc, 'carpals', (0.022, 0.045, 0.035), at=(x, -0.004, hd.z - 0.025))
        out.append(_part(carp, 'hand' + side, K['shade'], 52))
        for k, fy in enumerate((-0.016, 0.0, 0.016)):
            f = tube(sc, 'finger', [(x, fy - 0.004, hd.z - 0.04), (x - 0.004 * s, fy - 0.01, hd.z - 0.068), (x - 0.002 * s, fy - 0.018, hd.z - 0.09)],
                     [0.0065, 0.006, 0.005], sides=3)
            out.append(_part(f, 'hand' + side, K['bone'], 53 + k))
        thumb = tube(sc, 'thumb', [(x - 0.004 * s, -0.022, hd.z - 0.02), (x - 0.012 * s, -0.042, hd.z - 0.06)], [0.0065, 0.005], sides=3)
        out.append(_part(thumb, 'hand' + side, K['bone'], 56))
        hx = th.x
        fem = skin(sc, 'femur', [(Vector((hx - 0.03 * s, 0, th.z + 0.0)), (0.03, 0.03)), (Vector((hx + 0.005 * s, 0, th.z - 0.04)), (0.022, 0.022)),
                                 (Vector((hx + 0.005 * s, -0.004, th.z - 0.22)), (0.019, 0.019)), (Vector((hx, 0, sh.z - 0.008)), (0.038, 0.032))],
                   [(0, 1), (1, 2), (2, 3)], subsurf=1, target_tris=52)
        out.append(_part(fem, 'thigh' + side, K['bone'], 57))
        tib = skin(sc, 'tibia', [(Vector((hx, -0.004, sh.z + 0.01)), (0.036, 0.032)), (Vector((hx, 0.0, sh.z - 0.2)), (0.018, 0.018)),
                                 (Vector((hx, 0.004, 0.08)), (0.024, 0.022))], [(0, 1), (1, 2)], subsurf=1, target_tris=40)
        out.append(_part(tib, 'shin' + side, K['bone'], 58))
        pat = box(sc, 'patella', (0.04, 0.02, 0.045), at=(hx, -0.034, sh.z + 0.005), taper=(0.7, 1))
        out.append(_part(pat, 'shin' + side, K['shade'], 61))
        fib = tube(sc, 'fibula', [(hx + 0.024 * s, 0.01, sh.z - 0.04), (hx + 0.024 * s, 0.01, 0.1)], 0.008, sides=3)
        out.append(_part(fib, 'shin' + side, K['shade'], 59))
        foot = tube(sc, 'foot', [(hx, 0.04, 0.03), (hx, 0.0, 0.05), (hx, -0.07, 0.03), (hx, -0.135, 0.012)], [0.02, 0.026, 0.024, 0.016],
                    sides=4, twist=math.pi / 4)
        for v in foot.data.vertices:  # flatten the forefoot into a wide, thin fan
            if v.co.y < -0.03:
                v.co.x = hx + (v.co.x - hx) * 1.5
                v.co.z = max(v.co.z, 0.004)
        out.append(_part(foot, 'shin' + side, K['shade'], 60))
    return out


def sk_gear(sc, J):
    out = []
    h = J['hips'].z
    # Loincloth: a leather band round the pelvis and ragged dark cloth front and back.
    band = cyl(sc, 'band', 0.15, 0.148, 0.045, 8, at=(0, 0.004, h + 0.03), caps=False, scale=(1, 0.62))
    out.append(_part(band, 'hips', K['leather'], 70))
    for y, w, ln, sd in ((-0.09, 0.16, 0.3, 71), (0.09, 0.12, 0.22, 72)):
        bm = bmesh.new()
        top = [bm.verts.new((x, y, h + 0.01)) for x in (-w / 2, 0, w / 2)]
        bot = [bm.verts.new((-w / 2 * 0.9, y * 1.15, h + 0.01 - ln * 0.8)), bm.verts.new((0, y * 1.2, h + 0.01 - ln)),
               bm.verts.new((w / 2 * 0.8, y * 1.15, h + 0.01 - ln * 0.7))]
        for a, b in ((0, 1), (1, 2)):
            f = bm.faces.new((top[a], top[b], bot[b], bot[a]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.012)
        flap = mesh_from_bm(sc, 'flap', bm)
        out.append(_part(flap, 'hips', K['cloth'], sd, jitter=0.1))
    # Kettle helm: a dented dome and a wide brim, rust over iron.
    t = J['head'].z
    dome = rings(sc, 'helm', [(t + 0.18, 0.118, 0.118, 0.118), (t + 0.23, 0.108, 0.108, 0.108), (t + 0.27, 0.08, 0.08, 0.08)], 8,
                 cap_bottom=False, cap_top=True, phase=0.5)
    out.append(_part(dome, 'head', lambda c: K['rust'] if c.z > t + 0.2 else K['iron'], 73, jitter=0.12))
    brim = cyl(sc, 'brim', 0.175, 0.165, 0.018, 8, at=(0, 0, t + 0.185))
    out.append(_part(brim, 'head', K['rust'], 74, jitter=0.12))
    # One pauldron on the left shoulder.
    ua = J['upperArmL']
    pa = rings(sc, 'pauldron', [(ua.z - 0.1, 0.075, 0.075, 0.075), (ua.z - 0.03, 0.07, 0.07, 0.07), (ua.z + 0.03, 0.04, 0.04, 0.04)], 6,
               cap_bottom=False, cap_top=True)
    for v in pa.data.vertices:
        v.co.x += ua.x + 0.012
    out.append(_part(pa, 'upperArmL', lambda c: K['ironDark'] if c.z < ua.z - 0.06 else K['rust'], 75, jitter=0.12))
    # A rusty sword in the right hand, along the hand's -Y (down), edge forward.
    hd = J['handR']
    x = hd.x
    z = hd.z
    pom = ico(sc, 'pommel', 0.024, subdiv=0, at=(x, 0, z + 0.03))
    out.append(_part(pom, 'handR', K['iron'], 76))
    grip = box(sc, 'grip', (0.028, 0.028, 0.11), at=(x, 0, z - 0.045))
    out.append(_part(grip, 'handR', K['leatherDark'], 77))
    guard = box(sc, 'guard', (0.03, 0.17, 0.03), at=(x, 0, z - 0.11), taper=(1, 1.0))
    out.append(_part(guard, 'handR', K['rust'], 78, mask=1.0))
    # Blade: a flat diamond section tapering to a point.
    bm = bmesh.new()
    rows = [(z - 0.125, 0.007, 0.029), (z - 0.5, 0.006, 0.024), (z - 0.78, 0.004, 0.012)]
    ring = []
    for bz, hx, hy in rows:
        ring.append([bm.verts.new((x + px, py, bz)) for px, py in ((0, -hy), (hx, 0), (0, hy), (-hx, 0))])
    tip = bm.verts.new((x, -0.004, z - 0.83))
    for a, b in zip(ring, ring[1:]):
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    for k in range(4):
        bm.faces.new((ring[-1][k], ring[-1][(k + 1) % 4], tip))
    bm.faces.new(ring[0][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    blade = mesh_from_bm(sc, 'blade', bm)
    rnd = random.Random(5)
    out.append(_part(blade, 'handR', lambda c: K['rust'] if rnd.random() < 0.35 else K['iron'], 79, mask=1.0, jitter=0.1))
    return out


def build_skeleton(sc):
    J = {k: g2b(*v) for k, v in joints(GRUNT_P).items()}
    parts = sk_skull(sc, J) + sk_jaw(sc, J) + sk_torso(sc, J) + sk_limbs(sc, J) + sk_gear(sc, J)
    ob = join(sc, parts, 'Skeleton')
    arm = armature(sc, 'SkeletonRig', GRUNT_P)
    bind(sc, ob, arm, auto=False)
    ob.data.materials.clear()
    ob.data.materials.append(vertex_colour_material('descent_vcol'))
    bake_ao(sc, ob, strength=0.5, distance=0.2)
    return ob, arm
