# A more detailed human in the Warcraft Classic manner: an Oakvale militiaman
# on the game's broad build (the smith's bones, src/models/human.ts).
#
# Chunky, readable proportions: broad shoulders, thick forearms, big hands and
# boots, a strong jaw. More pieces than the plain human: a padded tunic with a
# split skirt and a V-neck over a linen undershirt, leather pauldrons, bracers
# and gloves, a belt with a buckle and a pouch, boots with turned-down cuffs,
# a short full beard and hair with a few chunky tufts. Smooth-shaded, with
# ambient occlusion and a soft top light baked into the vertex colours, the
# way a hand-painted texture carries its own shading.
#
# Needs lowpoly.py's helpers in scope (see build_all.py).

HERO_P = dict(hipY=0.95, hipW=0.11, spine=0.48, shoulderW=0.23, neck=0.52, upperArm=0.3, forearm=0.27, thigh=0.45, shin=0.45)

C = dict(
    skin=0xc89070, cheek=0xc07a60, lip=0x8a4a3a, eye=0x2a1c16, white=0xe8e0d0, hair=0x6a4428, beard=0x5e3c22,
    tunic=0x40562e, tunicDark=0x33462a, trim=0xcfc2a0, linen=0xcfc2a0, trousers=0x5a4636,
    boots=0x5c3d26, cuff=0x7a5a3a, sole=0x241810, gloves=0x4a321e, bracer=0x6b4a2b,
    belt=0x38251a, buckle=0x9aa0a8, pouch=0x6b4a2b, pauldron=0x6b4a2b, rim=0x38251a,
)

HEAD_Z = 1.53  # the broad build's head pivot
HEAD_SCALE = 1.12


def _tag(ob, part):
    """Remember which piece each vertex came from, through the join."""
    me = ob.data
    a = me.attributes.get('part') or me.attributes.new('part', 'INT', 'POINT')
    for d in a.data:
        d.value = part
    return ob


P_BODY, P_HEAD, P_HAIR, P_BEARD, P_SKIRT, P_PAUL_L, P_PAUL_R, P_BELT, P_BRACER_L, P_BRACER_R, P_CUFF_L, P_CUFF_R, P_COLLAR = range(13)


def hero_body(sc):
    V = Vector
    nodes, edges, tags = [], [], []

    def node(p, r):
        nodes.append((V(p), r))
        return len(nodes) - 1

    def edge(a, b, tag):
        edges.append((a, b))
        tags.append(tag)

    pelvis = node((0, 0, 0.96), (0.17, 0.118))
    waist = node((0, 0.0, 1.08), (0.165, 0.112))
    chest = node((0, -0.012, 1.27), (0.19, 0.128))
    upper = node((0, 0.0, 1.43), (0.185, 0.112))
    neck0 = node((0, 0.008, 1.5), (0.09, 0.085))
    neck1 = node((0, 0.012, 1.585), (0.074, 0.074))
    edge(pelvis, waist, 'torso')
    edge(waist, chest, 'torso')
    edge(chest, upper, 'torso')
    edge(upper, neck0, 'neck')
    edge(neck0, neck1, 'neck')
    for s in (1, -1):
        hip = node((0.11 * s, 0, 0.9), (0.102, 0.108))
        thigh = node((0.11 * s, -0.006, 0.7), (0.092, 0.097))
        knee = node((0.11 * s, -0.014, 0.49), (0.066, 0.072))
        calf = node((0.112 * s, 0.01, 0.38), (0.072, 0.08))
        boot = node((0.115 * s, 0.0, 0.3), (0.084, 0.09))
        ankle = node((0.115 * s, 0.006, 0.1), (0.072, 0.078))
        toe = node((0.115 * s, -0.175, 0.05), (0.07, 0.046))
        heel = node((0.115 * s, 0.058, 0.055), (0.06, 0.05))
        edge(pelvis, hip, 'torso')
        edge(hip, thigh, 'leg')
        edge(thigh, knee, 'leg')
        edge(knee, calf, 'leg')
        edge(calf, boot, 'leg')
        edge(boot, ankle, 'foot')
        edge(ankle, toe, 'foot')
        edge(ankle, heel, 'foot')
        sh = node((0.215 * s, 0.0, 1.465), (0.084, 0.084))
        ua = node((0.235 * s, 0.0, 1.33), (0.074, 0.078))
        el = node((0.235 * s, 0.008, 1.19), (0.06, 0.062))
        fa = node((0.235 * s, -0.004, 1.07), (0.07, 0.068))
        wr = node((0.235 * s, 0.0, 0.95), (0.05, 0.054))
        hand = node((0.235 * s, -0.008, 0.875), (0.036, 0.068))
        tips = node((0.232 * s, -0.016, 0.79), (0.03, 0.056))
        thumb = node((0.212 * s, -0.074, 0.885), (0.025, 0.025))
        edge(upper, sh, 'torso')
        edge(sh, ua, 'upperarm')
        edge(ua, el, 'upperarm')
        edge(el, fa, 'forearm')
        edge(fa, wr, 'forearm')
        edge(wr, hand, 'hand')
        edge(hand, tips, 'hand')
        edge(hand, thumb, 'hand')

    ob = skin(sc, 'hero_body', nodes, edges, subsurf=1, target_tris=1000, root=pelvis)
    segs = [(nodes[a][0], nodes[b][0], max(nodes[a][1]), max(nodes[b][1]), t) for (a, b), t in zip(edges, tags)]

    def region(c):
        best, tag = 1e9, 'torso'
        for a, b, ra, rb, t in segs:
            ab = b - a
            u = max(0.0, min(1.0, (c - a).dot(ab) / max(ab.length_squared, 1e-9)))
            d = (c - (a + ab * u)).length - (ra + (rb - ra) * u)
            if d < best:
                best, tag = d, t
        return tag

    def colour(c):
        t = region(c)
        if t == 'neck':
            return C['skin']
        if t == 'torso':
            if c.y < -0.04 and c.z > 1.33 and abs(c.x) < (c.z - 1.33) * 0.55 + 0.012:
                return C['linen']  # V-neck over the undershirt
            if c.z > 0.99:
                return C['tunicDark'] if c.z < 1.06 else C['tunic']
            return C['trousers']
        if t == 'upperarm':
            return C['tunic'] if c.z > 1.36 else C['linen']
        if t == 'forearm':
            return C['linen']
        if t == 'hand':
            return C['gloves']
        if t == 'leg':
            return C['trousers'] if c.z > 0.3 else C['boots']
        if t == 'foot':
            return C['sole'] if c.z < 0.03 else C['boots']
        return C['skin']

    paint(ob, colour, jitter=0.04, seed=101)
    return _tag(ob, P_BODY)


def hero_head(sc):
    z0 = HEAD_Z
    segs = 12
    profile = [
        (0.03, 0.055, 0.055, 0.05),
        (0.05, 0.076, 0.09, 0.056),
        (0.075, 0.088, 0.098, 0.07),
        (0.1, 0.092, 0.102, 0.085),
        (0.122, 0.094, 0.104, 0.095),
        (0.142, 0.095, 0.103, 0.1),
        (0.165, 0.096, 0.104, 0.104),
        (0.185, 0.097, 0.106, 0.107),
        (0.21, 0.093, 0.096, 0.108),
        (0.235, 0.08, 0.08, 0.098),
        (0.257, 0.055, 0.05, 0.07),
    ]
    profile = [(z + z0, rx, f, b) for z, rx, f, b in profile]

    def shape(i, j, v):
        a = 2 * math.pi * (j + 0.5) / segs
        if math.cos(a) > 0 and i >= 1:
            v.y = -profile[i][2] * math.sqrt(math.cos(a))
        if i in (1, 2) and abs(math.sin(a)) > 0.6:
            v.x *= 1.06  # a square jaw
        if i == 7 and math.cos(a) > 0.5:
            v.y -= 0.008  # brow ridge
        if i == 4 and abs(math.sin(a)) > 0.5 and math.cos(a) > 0:
            v.x *= 1.04  # cheekbones
        return v

    ob = rings(sc, 'hero_head', profile, segs, phase=0.5, shape=shape)
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    kind = bm.faces.layers.int.new('kind')
    SKIN, CHEEK, LIP, WHITE, PUPIL, BROW = 0, 1, 2, 3, 4, 5
    F = lambda i, j: bm.faces[i * segs + j]  # band i, column j; j=11 faces front, j=0/10 either side
    F(2, 11)[kind] = LIP
    for j in (1, 9):
        F(4, j)[kind] = CHEEK
    for j in (0, 10):
        F(6, j)[kind] = BROW
    eyes = [F(5, 0), F(5, 10)]
    for f in eyes:
        bmesh.ops.inset_individual(bm, faces=[f], thickness=0.005, depth=-0.003)
        c = f.calc_center_median()
        horiz = [e for e in f.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 0.004]
        bmesh.ops.subdivide_edges(bm, edges=horiz, cuts=2, use_grid_fill=True)
        row = [g for g in bm.faces if abs(g.calc_center_median().z - c.z) < 0.003 and (g.calc_center_median() - c).length < 0.016]
        row.sort(key=lambda g: (g.calc_center_median() - c).length)
        for g in row[:3]:
            g[kind] = WHITE
        row[0][kind] = PUPIL
    bm.to_mesh(me)
    bm.free()
    kinds = me.attributes['kind'].data
    colours = {SKIN: C['skin'], CHEEK: C['cheek'], LIP: C['lip'], WHITE: C['white'], PUPIL: C['eye'], BROW: C['hair']}
    paint(ob, lambda p: colours[kinds[p.index].value], jitter=0.03, seed=102, by_face=True)
    me.attributes.remove(me.attributes['kind'])

    # A strong nose: a wedge with a rounded tip.
    nb = bmesh.new()
    za, zb, y0 = z0 + 0.1, z0 + 0.172, -0.1
    vs = [nb.verts.new(v) for v in (
        (-0.022, y0, za), (0.022, y0, za), (0.0, y0 - 0.036, za + 0.006),
        (-0.012, y0 - 0.02, za + 0.004), (0.012, y0 - 0.02, za + 0.004),
        (-0.009, y0, zb), (0.009, y0, zb), (0.0, y0 - 0.016, zb - 0.006),
    )]
    for f in ((0, 3, 2, 4, 1), (5, 6, 7), (0, 5, 7, 2, 3), (1, 4, 2, 7, 6), (0, 1, 6, 5)):
        nb.faces.new([vs[k] for k in f])
    bmesh.ops.recalc_face_normals(nb, faces=nb.faces)
    nose = mesh_from_bm(sc, 'nose', nb)
    paint(nose, lambda c: C['cheek'] if c.z < z0 + 0.12 else C['skin'], jitter=0.02, seed=103)
    ears = []
    for s in (1, -1):
        e = box(sc, 'ear', (0.03, 0.05, 0.068), at=(0.098 * s, 0.008, z0 + 0.14), rot=(0, 0, 0.25 * s), taper=(0.75, 0.7))
        paint(e, C['skin'], jitter=0.03, seed=104)
        ears.append(e)
    parts = [ob, nose] + ears
    for p in parts:
        _tag(p, P_HEAD)
    return parts, profile


def _shell(sc, name, profile, segs, keep, scale, lift=0.0):
    """A shell over the head's rings, pushed out by `scale`, keeping faces where keep(angle, z) holds."""
    prof = [(z + lift, rx * scale[0], f * scale[1], b * scale[2]) for z, rx, f, b in profile]

    def shape(i, j, v):
        a = 2 * math.pi * (j + 0.5) / segs
        if math.cos(a) > 0:
            v.y = -prof[i][2] * math.sqrt(math.cos(a))
        return v

    ob = rings(sc, name, prof, segs, cap_bottom=False, phase=0.5, shape=shape)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    dead = []
    for f in bm.faces:
        c = f.calc_center_median()
        a = abs(math.degrees(math.atan2(c.x, -c.y)))
        if not keep(a, c.z - HEAD_Z):
            dead.append(f)
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def hero_hair(sc, profile):
    def keep(a, z):
        line = 0.2 if a < 45 else 0.175 if a < 90 else 0.12 if a < 135 else 0.075
        return z > line

    hair = _shell(sc, 'hair', profile[4:], 12, keep, (1.1, 1.08, 1.12), lift=0.006)
    # Chunky tufts: a few crown faces pulled out and back into points.
    bm = bmesh.new()
    bm.from_mesh(hair.data)
    tops = sorted(bm.faces, key=lambda f: -f.calc_center_median().z)
    picks = [f for f in tops if f.calc_center_median().y > -0.04][:5]
    r = bmesh.ops.extrude_discrete_faces(bm, faces=picks)
    for f in r['faces']:
        c = f.calc_center_median()
        n = f.normal.copy()
        for v in f.verts:
            v.co = c + (v.co - c) * 0.45 + n * 0.016 + Vector((0, 0.026, -0.008))
    bm.normal_update()
    bm.to_mesh(hair.data)
    bm.free()
    paint(hair, C['hair'], jitter=0.08, seed=105)
    return _tag(hair, P_HAIR)


def hero_beard(sc, profile):
    def keep(a, z):
        # Along the jaw and up the sideburns; the mouth and cheeks stay bare.
        return (a < 115 and z < 0.075) or (70 < a < 115 and z < 0.14)

    beard = _shell(sc, 'beard', profile[:5], 12, keep, (1.1, 1.12, 1.1))
    for v in beard.data.vertices:
        z = v.co.z - HEAD_Z
        if z < 0.06:
            v.co.z -= 0.022  # a fuller chin
            v.co.y -= 0.01
    paint(beard, C['beard'], jitter=0.08, seed=106)
    # A moustache over the mouth.
    m = box(sc, 'moustache', (0.07, 0.022, 0.018), at=(0, -0.118, HEAD_Z + 0.098), taper=(1.2, 1))
    paint(m, C['beard'], jitter=0.05, seed=107)
    return [_tag(beard, P_BEARD), _tag(m, P_BEARD)]


def hero_skirt(sc):
    """The tunic's skirt: two panels, front and back, split at the sides, flaring over the thighs."""
    prof = [(0.995, 0.178, 0.132, 0.128), (0.86, 0.2, 0.15, 0.142), (0.72, 0.218, 0.164, 0.152)]
    sk = rings(sc, 'skirt', prof, 16, cap_bottom=False, cap_top=False, phase=0.5)
    bm = bmesh.new()
    bm.from_mesh(sk.data)
    dead = [f for f in bm.faces if abs(f.calc_center_median().x) > 0.19]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.012)
    bm.to_mesh(sk.data)
    bm.free()
    paint(sk, lambda c: C['trim'] if c.z < 0.745 else C['tunic'], jitter=0.04, seed=108)
    return _tag(sk, P_SKIRT)


def hero_pauldron(sc, s, J):
    ua = J['upperArmL' if s > 0 else 'upperArmR']
    parts = []
    for k, (z_lo, z_hi, r_lo, r_hi, dx) in enumerate(((-0.075, 0.035, 0.094, 0.05, 0.02), (-0.115, -0.055, 0.1, 0.088, 0.03))):
        p = rings(sc, 'pauldron', [(ua.z + z_lo, r_lo, r_lo, r_lo), (ua.z + (z_lo + z_hi) / 2, (r_lo + r_hi) / 2 * 1.04, (r_lo + r_hi) / 2, (r_lo + r_hi) / 2),
                                   (ua.z + z_hi, r_hi, r_hi, r_hi)], 10, cap_bottom=True, cap_top=True)
        for v in p.data.vertices:
            v.co.x += ua.x + dx * s
            v.co.y *= 0.95
        paint(p, lambda c, lo=ua.z + z_lo: C['rim'] if c.z < lo + 0.02 else C['pauldron'], jitter=0.06, seed=109 + k)
        parts.append(_tag(p, P_PAUL_L if s > 0 else P_PAUL_R))
    return parts


def hero_gear(sc, J):
    out = []
    belt = cyl(sc, 'belt', 0.186, 0.182, 0.06, 12, at=(0, 0.0, 1.0), caps=False, scale=(1, 0.74))
    paint(belt, C['belt'], seed=110)
    buckle = box(sc, 'buckle', (0.07, 0.022, 0.058), at=(0, -0.14, 1.0))
    paint(buckle, C['buckle'], seed=111)
    pouch = box(sc, 'pouch', (0.075, 0.05, 0.08), at=(-0.165, -0.07, 0.95), rot=(0, 0, -0.5), taper=(1.05, 1.1))
    paint(pouch, C['pouch'], seed=112)
    flap = box(sc, 'pouchflap', (0.08, 0.056, 0.03), at=(-0.165, -0.07, 0.99), rot=(0, 0, -0.5))
    paint(flap, C['belt'], seed=113)
    out += [_tag(o, P_BELT) for o in (belt, buckle, pouch, flap)]
    collar = cyl(sc, 'collar', 0.1, 0.092, 0.035, 10, at=(0, 0.01, 1.49), caps=False)
    paint(collar, C['tunicDark'], seed=114)
    out.append(_tag(collar, P_COLLAR))
    for s in (1, -1):
        fa = J['forearmL' if s > 0 else 'forearmR']
        br = cyl(sc, 'bracer', 0.07, 0.08, 0.13, 10, at=(fa.x, -0.002, 0.99), caps=False)
        paint(br, lambda c: C['rim'] if c.z > 1.045 or c.z < 0.935 else C['bracer'], seed=115)
        out.append(_tag(br, P_BRACER_L if s > 0 else P_BRACER_R))
        cf = cyl(sc, 'cuff', 0.1, 0.088, 0.075, 10, at=(0.115 * s, -0.004, 0.3), caps=False)
        paint(cf, C['cuff'], seed=116)
        out.append(_tag(cf, P_CUFF_L if s > 0 else P_CUFF_R))
        out += hero_pauldron(sc, s, J)
    return out


HERO_TAILS = {
    'hips': (0, 0.85, 0), 'spine': (0, 1.46, 0), 'head': (0, 1.78, 0), 'jaw': (0, 1.57, 0.1),
    'upperArmL': (0.23, 1.2, 0), 'forearmL': (0.23, 0.93, 0), 'handL': (0.23, 0.8, 0),
    'upperArmR': (-0.23, 1.2, 0), 'forearmR': (-0.23, 0.93, 0), 'handR': (-0.23, 0.8, 0),
    'thighL': (0.11, 0.48, 0), 'shinL': (0.11, 0.06, 0), 'thighR': (-0.11, 0.48, 0), 'shinR': (-0.11, 0.06, 0),
}

RIGID = {P_HEAD: 'head', P_HAIR: 'head', P_BELT: 'hips', P_COLLAR: 'spine', P_PAUL_L: 'upperArmL', P_PAUL_R: 'upperArmR',
         P_BRACER_L: 'forearmL', P_BRACER_R: 'forearmR', P_CUFF_L: 'shinL', P_CUFF_R: 'shinR'}


def _set_weights(ob, v, ws):
    for vg in ob.vertex_groups:
        vg.remove([v])
    for bone, w in ws.items():
        if w > 0.001:
            (ob.vertex_groups.get(bone) or ob.vertex_groups.new(name=bone)).add([v], w, 'REPLACE')


def paint_light(ob, top=0.18):
    """A soft painted top light: faces turned up a little brighter, turned down a little darker."""
    me = ob.data
    col = me.color_attributes['Col'].data
    normals = me.corner_normals
    for i in range(len(col)):
        nz = normals[i].vector.z
        k = (1 - top) + top * (0.5 + 0.5 * nz)
        c = col[i].color
        col[i].color = (c[0] * k, c[1] * k, c[2] * k, 1.0)


def build_hero(sc):
    J = {k: g2b(*v) for k, v in joints(HERO_P).items()}
    head, profile = hero_head(sc)
    top = head + [hero_hair(sc, profile)] + hero_beard(sc, profile)
    pivot = Vector((0, 0, HEAD_Z + 0.03))
    for o in top:
        for v in o.data.vertices:
            v.co = pivot + (v.co - pivot) * HEAD_SCALE
    parts = [hero_body(sc)] + top + [hero_skirt(sc)] + hero_gear(sc, J)
    ob = join(sc, parts, 'HumanDetailed')
    arm = armature(sc, 'HumanDetailedRig', HERO_P, HERO_TAILS)
    arm.data.bones['jaw'].use_deform = False
    bind(sc, ob, arm, auto=True)
    arm.data.bones['jaw'].use_deform = True
    part = ob.data.attributes['part'].data
    for v in ob.data.vertices:
        p = part[v.index].value
        if p in RIGID:
            _set_weights(ob, v.index, {RIGID[p]: 1.0})
        elif p == P_BEARD:
            # The beard below the mouth rides the jaw; the rest, the head.
            _set_weights(ob, v.index, {'jaw' if v.co.z < HEAD_Z + 0.085 else 'head': 1.0})
        elif p == P_SKIRT:
            # Skirt panels follow the hips at the belt and the thighs toward the hem.
            t = max(0.0, min(1.0, (0.995 - v.co.z) / 0.275))
            left = max(0.0, min(1.0, 0.5 + v.co.x / 0.18))
            _set_weights(ob, v.index, {'hips': 1 - 0.75 * t, 'thighL': 0.75 * t * left, 'thighR': 0.75 * t * (1 - left)})
        elif p == P_BODY and v.co.z > HEAD_Z + 0.02:
            _set_weights(ob, v.index, {'head': 1.0})
    bare = [v.index for v in ob.data.vertices if not any(g.weight > 0.001 for g in v.groups)]
    ob.vertex_groups['spine'].add(bare, 1.0, 'REPLACE')
    limit_weights(ob, 4)
    straighten(sc, arm)
    ob.data.attributes.remove(ob.data.attributes['part'])
    ob.data.shade_smooth()
    ob.data.set_sharp_from_angle(angle=math.radians(50))
    ob.data.materials.clear()
    ob.data.materials.append(vertex_colour_material('descent_vcol'))
    bake_ao(sc, ob, strength=0.5, distance=0.3)
    paint_light(ob)
    return ob, arm
