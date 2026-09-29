# The human body, remodelled in Blender: a villager (the farmer's colours) on
# the game's 14-bone rig at the average build (src/models/human.ts).
#
# The body is one continuous skin-modifier mesh (legs, torso, arms, hands and
# feet), subdivided once and decimated, so joints read as limbs rather than
# stacked boxes. The head is a lathe of rings with an extruded nose, inset
# eyes, brows and ears, under a hair shell. Weights are Blender's automatic
# (heat) weights, so elbows, knees and shoulders bend smoothly.
#
# Needs lowpoly.py's helpers in scope (see build_all.py).

HUMAN_P = dict(hipY=0.95, hipW=0.1, spine=0.46, shoulderW=0.2, neck=0.5, upperArm=0.29, forearm=0.26, thigh=0.45, shin=0.45)

H = dict(
    skin=0xc08a66, lip=0x8a4a3a, eye=0x221612, hair=0xa8844c, brow=0x7a5a30,
    shirt=0xcfc2a0, cuff=0xb4a684, trousers=0x9a7434, boots=0x38251a, sole=0x241810,
    belt=0x5c3d26, buckle=0x72757e,
)


def shade(c, k):
    r = min(255, round(((c >> 16) & 255) * k))
    g = min(255, round(((c >> 8) & 255) * k))
    b = min(255, round((c & 255) * k))
    return (r << 16) | (g << 8) | b


def _seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length, t


def human_body(sc):
    """Legs, torso, arms, hands, feet and neck as one skin mesh, painted by limb."""
    V = Vector
    nodes, edges, tags = [], [], []

    def node(p, r):
        nodes.append((V(p), r))
        return len(nodes) - 1

    def edge(a, b, tag):
        edges.append((a, b))
        tags.append(tag)

    pelvis = node((0, 0, 0.955), (0.15, 0.105))
    waist = node((0, 0.0, 1.08), (0.14, 0.098))
    chest = node((0, -0.008, 1.26), (0.162, 0.112))
    upper = node((0, 0.0, 1.41), (0.158, 0.098))
    neck0 = node((0, 0.006, 1.485), (0.08, 0.076))
    neck1 = node((0, 0.012, 1.56), (0.064, 0.064))
    edge(pelvis, waist, 'torso')
    edge(waist, chest, 'torso')
    edge(chest, upper, 'torso')
    edge(upper, neck0, 'neck')
    edge(neck0, neck1, 'neck')
    for s in (1, -1):
        hip = node((0.1 * s, 0, 0.9), (0.095, 0.1))
        thigh = node((0.1 * s, -0.005, 0.7), (0.08, 0.086))
        knee = node((0.1 * s, -0.012, 0.49), (0.058, 0.064))
        calf = node((0.1 * s, 0.006, 0.37), (0.062, 0.07))
        cuff = node((0.1 * s, 0.0, 0.28), (0.07, 0.075))
        ankle = node((0.1 * s, 0.006, 0.1), (0.056, 0.062))
        toe = node((0.1 * s, -0.15, 0.045), (0.052, 0.036))
        heel = node((0.1 * s, 0.045, 0.05), (0.046, 0.04))
        edge(pelvis, hip, 'torso')
        edge(hip, thigh, 'leg')
        edge(thigh, knee, 'leg')
        edge(knee, calf, 'leg')
        edge(calf, cuff, 'leg')
        edge(cuff, ankle, 'foot')
        edge(ankle, toe, 'foot')
        edge(ankle, heel, 'foot')
        sh = node((0.185 * s, 0.0, 1.44), (0.064, 0.064))
        ua = node((0.2 * s, 0.0, 1.31), (0.053, 0.056))
        el = node((0.2 * s, 0.006, 1.18), (0.044, 0.046))
        fa = node((0.2 * s, 0.0, 1.06), (0.046, 0.046))
        wr = node((0.2 * s, 0.0, 0.94), (0.032, 0.036))
        hand = node((0.2 * s, -0.006, 0.875), (0.022, 0.046))
        tips = node((0.2 * s, -0.01, 0.8), (0.017, 0.036))
        thumb = node((0.19 * s, -0.048, 0.885), (0.014, 0.014))
        edge(upper, sh, 'torso')
        edge(sh, ua, 'arm')
        edge(ua, el, 'arm')
        edge(el, fa, 'arm')
        edge(fa, wr, 'arm')
        edge(wr, hand, 'hand')
        edge(hand, tips, 'hand')
        edge(hand, thumb, 'hand')

    ob = skin(sc, 'human_body', nodes, edges, subsurf=1, target_tris=760, root=pelvis)

    segs = [(nodes[a][0], nodes[b][0], max(nodes[a][1]), max(nodes[b][1]), t) for (a, b), t in zip(edges, tags)]

    def region(c):
        best, tag = 1e9, 'torso'
        for a, b, ra, rb, t in segs:
            d, u = _seg_dist(c, a, b)
            d -= ra + (rb - ra) * u
            if d < best:
                best, tag = d, t
        return tag

    def colour(c):
        t = region(c)
        if t == 'neck':
            return H['skin']
        if t == 'torso':
            if c.z > 1.42 and abs(c.x) < 0.035 and c.y < 0:
                return H['skin']  # open collar
            return H['shirt'] if c.z > 0.99 else H['trousers']
        if t == 'leg':
            return H['trousers'] if c.z > 0.29 else H['boots']
        if t == 'foot':
            return H['sole'] if c.z < 0.03 else H['boots']
        if t == 'arm':
            if c.z > 1.06:
                return H['shirt']
            return H['cuff'] if c.z > 1.02 else H['skin']
        return H['skin']

    paint(ob, colour, seed=11)
    return ob


def human_head(sc):
    top = 1.51
    profile = [
        (0.035, 0.05, 0.05, 0.045),
        (0.055, 0.068, 0.084, 0.05),
        (0.078, 0.08, 0.094, 0.066),
        (0.106, 0.088, 0.099, 0.086),
        (0.13, 0.09, 0.1, 0.097),
        (0.155, 0.092, 0.1, 0.103),
        (0.175, 0.092, 0.099, 0.106),
        (0.205, 0.088, 0.092, 0.102),
        (0.232, 0.07, 0.068, 0.082),
    ]
    profile = [(z + top, rx, f, b) for z, rx, f, b in profile]
    segs = 10

    def flat_face(i, j, v):
        # A flatter face: front points sit further forward than an ellipse.
        a = 2 * math.pi * (j + 0.5) / segs
        if math.cos(a) > 0 and i >= 1:
            v.y = -profile[i][2] * math.sqrt(math.cos(a))
        return v

    ob = rings(sc, 'human_head', profile, segs, phase=0.5, shape=flat_face)
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    kind = bm.faces.layers.int.new('kind')
    SKIN, STUBBLE, LIP, WHITE, PUPIL, BROW = 0, 1, 2, 3, 4, 5
    F = lambda i, j: bm.faces[i * segs + j]  # band i (rows i..i+1), column j; j=9 faces front
    for i in range(2):
        for j in list(range(0, 3)) + list(range(7, 10)):
            F(i, j)[kind] = STUBBLE
    F(1, 9)[kind] = LIP
    for j in (0, 8):
        F(5, j)[kind] = BROW
    eyes = [F(4, 0), F(4, 8)]
    for f in eyes:
        bmesh.ops.inset_individual(bm, faces=[f], thickness=0.005, depth=-0.003)
        c = f.calc_center_median()
        horiz = [e for e in f.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 0.004]
        bmesh.ops.subdivide_edges(bm, edges=horiz, cuts=2, use_grid_fill=True)
        # The eye is now three faces in a row: white, pupil, white.
        row = [g for g in bm.faces if abs(g.calc_center_median().z - c.z) < 0.003 and (g.calc_center_median() - c).length < 0.016]
        row.sort(key=lambda g: (g.calc_center_median() - c).length)
        for g in row[:3]:
            g[kind] = WHITE
        row[0][kind] = PUPIL
    bm.to_mesh(me)
    bm.free()
    kinds = me.attributes['kind'].data
    colours = {SKIN: H['skin'], STUBBLE: shade(H['skin'], 0.84), LIP: H['lip'], WHITE: 0xe8e0d0, PUPIL: H['eye'], BROW: H['brow']}
    paint(ob, lambda p: colours[kinds[p.index].value], seed=12, by_face=True)
    me.attributes.remove(me.attributes['kind'])
    # A nose: a wedge on the face, narrow at the bridge.
    nb = bmesh.new()
    z0, z1, y0 = top + 0.098, top + 0.152, -0.097
    vs = [nb.verts.new(v) for v in (
        (-0.018, y0, z0), (0.018, y0, z0), (0.0, y0 - 0.03, z0 + 0.004),
        (-0.008, y0, z1), (0.008, y0, z1), (0.0, y0 - 0.012, z1 - 0.004),
    )]
    for f in ((0, 2, 1), (3, 4, 5), (0, 3, 5, 2), (1, 2, 5, 4), (0, 1, 4, 3)):
        nb.faces.new([vs[k] for k in f])
    bmesh.ops.recalc_face_normals(nb, faces=nb.faces)
    nose = mesh_from_bm(sc, 'nose', nb)
    paint(nose, shade(H['skin'], 1.04), seed=17)
    ears = []
    for s in (1, -1):
        e = box(sc, 'ear', (0.026, 0.045, 0.06), at=(0.093 * s, 0.006, top + 0.13), taper=(0.8, 0.7))
        paint(e, H['skin'], seed=13)
        ears.append(e)
    return [ob, nose] + ears


def human_hair(sc):
    top = 1.51
    profile = [
        (0.1, 0.088, 0.1, 0.094),
        (0.13, 0.096, 0.106, 0.106),
        (0.155, 0.099, 0.107, 0.112),
        (0.175, 0.1, 0.107, 0.115),
        (0.205, 0.096, 0.1, 0.112),
        (0.232, 0.078, 0.076, 0.092),
        (0.252, 0.05, 0.048, 0.06),
    ]
    profile = [(z + top, rx, f, b) for z, rx, f, b in profile]
    def flat_face(i, j, v):
        a = 2 * math.pi * (j + 0.5) / 10
        if math.cos(a) > 0:
            v.y = -profile[i][2] * math.sqrt(math.cos(a))
        return v

    ob = rings(sc, 'human_hair', profile, 10, cap_bottom=False, phase=0.5, shape=flat_face)
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)

    def keep(c):
        a = abs(math.degrees(math.atan2(c.x, -c.y)))
        z = c.z - top
        line = 0.185 if a < 40 else 0.165 if a < 75 else 0.12 if a < 125 else 0.09
        return z > line

    dead = [f for f in bm.faces if not keep(f.calc_center_median())]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    bm.to_mesh(me)
    bm.free()
    paint(ob, H['hair'], jitter=0.1, seed=14)
    return ob


def human_belt(sc):
    braces = []
    for s in (1, -1):
        x = 0.078 * s
        pts = [(x, -0.122, 1.0), (x, -0.13, 1.24), (x * 1.15, -0.075, 1.43), (x * 1.15, 0.04, 1.455), (x, 0.112, 1.26), (x, 0.108, 1.0)]
        b = tube(sc, 'brace', pts, 0.011, sides=4, twist=math.pi / 4)
        for v in b.data.vertices:  # flat straps: squash each section toward the body
            v.co.x = x * (1.15 if v.co.z > 1.4 else 1) + (v.co.x - x * (1.15 if v.co.z > 1.4 else 1)) * 1.6
        paint(b, H['boots'], seed=18)
        braces.append(b)
    belt = cyl(sc, 'belt', 0.174, 0.17, 0.055, 10, at=(0, 0.0, 0.99), caps=False, scale=(1, 0.72))
    paint(belt, H['belt'], seed=15)
    buckle = box(sc, 'buckle', (0.06, 0.02, 0.05), at=(0, -0.128, 0.99))
    paint(buckle, H['buckle'], seed=16)
    return [belt, buckle] + braces


HUMAN_TAILS = {
    'hips': (0, 0.85, 0), 'spine': (0, 1.44, 0), 'head': (0, 1.74, 0), 'jaw': (0, 1.55, 0.1),
    'upperArmL': (0.2, 1.18, 0), 'forearmL': (0.2, 0.92, 0), 'handL': (0.2, 0.8, 0),
    'upperArmR': (-0.2, 1.18, 0), 'forearmR': (-0.2, 0.92, 0), 'handR': (-0.2, 0.8, 0),
    'thighL': (0.1, 0.48, 0), 'shinL': (0.1, 0.06, 0), 'thighR': (-0.1, 0.48, 0), 'shinR': (-0.1, 0.06, 0),
}


def human_hat(sc):
    """The farmer's straw hat: a wide brim, a crown and a darker band."""
    top = 1.51
    brim = cyl(sc, 'brim', 0.25, 0.24, 0.018, 12, at=(0, 0.0, top + 0.228))
    paint(brim, 0xd4b060, jitter=0.1, seed=19)
    crown = cyl(sc, 'crown', 0.118, 0.1, 0.1, 10, at=(0, 0.004, top + 0.285))
    paint(crown, 0xd4b060, jitter=0.1, seed=20)
    band = cyl(sc, 'band', 0.121, 0.117, 0.028, 10, at=(0, 0.004, top + 0.252), caps=False)
    paint(band, 0xa88838, seed=21)
    return [brim, crown, band]


def scale_about(obs, pivot, k):
    for o in obs:
        for v in o.data.vertices:
            v.co = pivot + (v.co - pivot) * k


def build_human(sc):
    head = human_head(sc) + [human_hair(sc)] + human_hat(sc)
    # A touch bigger than life: at arm's length in VR a true-size head reads small.
    scale_about(head, Vector((0, 0, 1.545)), 1.1)
    parts = [human_body(sc)] + head + human_belt(sc)
    ob = join(sc, parts, 'Human')
    arm = armature(sc, 'HumanRig', HUMAN_P, HUMAN_TAILS)
    arm.data.bones['jaw'].use_deform = False
    bind(sc, ob, arm, auto=True)
    arm.data.bones['jaw'].use_deform = True
    # The belt and braces are their own islands, which heat weighting leaves
    # bare: the belt rides the hips, the braces the chest.
    bare = [v for v in ob.data.vertices if not any(g.weight > 0.001 for g in v.groups)]
    ob.vertex_groups['hips'].add([v.index for v in bare if v.co.z < 1.03], 1.0, 'REPLACE')
    ob.vertex_groups['spine'].add([v.index for v in bare if v.co.z >= 1.03], 1.0, 'REPLACE')
    # Everything above the neck (head, hair, nose, ears) is rigid on the head;
    # the chin and mouth ride the jaw.
    above = [v.index for v in ob.data.vertices if v.co.z > 1.536]
    for vg in ob.vertex_groups:
        vg.remove(above)
    chin = [i for i in above if ob.data.vertices[i].co.z < 1.51 + 0.07 and ob.data.vertices[i].co.y < -0.02]
    ob.vertex_groups['head'].add(sorted(set(above) - set(chin)), 1.0, 'REPLACE')
    (ob.vertex_groups.get('jaw') or ob.vertex_groups.new(name='jaw')).add(chin, 1.0, 'REPLACE')
    limit_weights(ob, 4)
    straighten(sc, arm)
    ob.data.materials.clear()
    ob.data.materials.append(vertex_colour_material('descent_vcol'))
    bake_ao(sc, ob, strength=0.45, distance=0.3)
    return ob, arm
