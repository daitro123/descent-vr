# Shared helpers for the Blender low-poly experiment (tools/blender/*.py).
#
# The scripts run inside a live Blender (5.2) through the Blender Lab MCP
# add-on, or headless with `blender -b -P tools/blender/build_all.py`.
#
# Conventions, matching the game (src/models/rig.ts):
# - Blender is Z-up and the glTF exporter turns it Y-up: game (x, y, z) is
#   Blender (x, -z, y). Characters face the game's +Z, which is Blender -Y.
# - One mesh, one material, per-face colours in a corner colour attribute
#   "Col" (linear floats, as three's Color.setHex gives the game's vertex
#   colours), and a "_FX" attribute (glow, weapon mask) like kit.ts's `fx`.
# - Bones use the game's names and bind positions and point straight up with
#   roll 0, so in glTF every joint's rest rotation is identity and the game's
#   Euler poses (poses.ts) apply to them as they do to the code-built Rig.

import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector


def lin(h):
    """0xRRGGBB (sRGB) to linear RGBA, as three's Color.setHex does."""
    def c(v):
        v /= 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c((h >> 16) & 255), c((h >> 8) & 255), c(h & 255), 1.0)


def g2b(x, y, z):
    """Game (three.js, Y-up, +Z forward) to Blender (Z-up, -Y forward)."""
    return Vector((x, -z, y))


# ---------------------------------------------------------------- scene


def fresh_scene(name):
    """
    A new empty scene with this name (replacing an old one), made current.
    Headless there is no window to show another scene in (and the glTF
    exporter only sees the context's), so the one scene is emptied instead.
    """
    if bpy.app.background:
        sc = bpy.context.scene
        for o in list(sc.objects):
            bpy.data.objects.remove(o)
        sc.name = name
        return sc
    old = bpy.data.scenes.get(name)
    if old:
        for o in list(old.objects):
            data = o.data
            bpy.data.objects.remove(o)
            if data is not None and data.users == 0:
                if isinstance(data, bpy.types.Mesh):
                    bpy.data.meshes.remove(data)
                elif isinstance(data, bpy.types.Armature):
                    bpy.data.armatures.remove(data)
        bpy.data.scenes.remove(old)
    sc = bpy.data.scenes.new(name)
    try:
        bpy.context.window.scene = sc
    except Exception:
        pass
    sc.unit_settings.system = 'METRIC'
    return sc


def link(sc, ob):
    sc.collection.objects.link(ob)
    return ob


def activate(sc, ob):
    """Make `ob` the only selected and active object (operators need this)."""
    vl = sc.view_layers[0]
    for o in sc.objects:
        o.select_set(False, view_layer=vl)
    ob.select_set(True, view_layer=vl)
    vl.objects.active = ob
    return ob


def _window():
    wins = bpy.context.window_manager.windows
    return bpy.context.window or (wins[0] if len(wins) else None)


def ctx(sc, ob=None, selected=None):
    """
    Context override for operators run from the MCP (no mouse over a viewport)
    or headless (no window at all).
    """
    d = {'scene': sc, 'view_layer': sc.view_layers[0]}
    win = _window()
    if win is not None:
        d['window'] = win
    if ob is not None:
        sel = selected or [ob]
        d.update(active_object=ob, object=ob, selected_objects=sel, selected_editable_objects=sel)
    return bpy.context.temp_override(**d)


def apply_modifiers(sc, ob):
    dg = sc.view_layers[0].depsgraph
    dg.update()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return ob


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


# ---------------------------------------------------------------- meshes


def mesh_from_bm(sc, name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return link(sc, bpy.data.objects.new(name, me))


def skin(sc, name, nodes, edges, subsurf=1, target_tris=None, root=0, smooth_iters=0):
    """
    A body from a skin modifier: `nodes` are (position, (rx, ry)) in Blender
    space, `edges` index pairs. Subdivided once for rounder sections, then
    decimated down to `target_tris`.
    """
    me = bpy.data.meshes.new(name)
    me.from_pydata([p for p, _ in nodes], edges, [])
    ob = link(sc, bpy.data.objects.new(name, me))
    ob.modifiers.new('skin', 'SKIN')
    sv = me.skin_vertices[0].data
    for i, (_, r) in enumerate(nodes):
        sv[i].radius = r
        sv[i].use_root = i == root
    if subsurf:
        m = ob.modifiers.new('sub', 'SUBSURF')
        m.levels = m.render_levels = subsurf
    if smooth_iters:
        m = ob.modifiers.new('smooth', 'SMOOTH')
        m.iterations = smooth_iters
        m.factor = 0.5
    apply_modifiers(sc, ob)
    if target_tris:
        decimate(sc, ob, target_tris)
    return ob


def tube(sc, name, pts, radii, sides=4, caps=True, twist=0.0):
    """
    A thin tube along a polyline, `sides` around (3 is a triangular section):
    far cheaper than a skin for ribs, fingers and forearm bones. `radii` is
    one radius per point (or a single number).
    """
    pts = [Vector(p) for p in pts]
    if not isinstance(radii, (list, tuple)):
        radii = [radii] * len(pts)
    bm = bmesh.new()
    # Parallel-transported frame, so the section doesn't spin along the tube.
    t0 = (pts[1] - pts[0]).normalized()
    ref = Vector((0, 0, 1)) if abs(t0.z) < 0.9 else Vector((1, 0, 0))
    n = (ref - t0 * ref.dot(t0)).normalized()
    ringv = []
    for i, p in enumerate(pts):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, len(pts) - 1)]
        t = (b - a).normalized()
        n = (n - t * n.dot(t)).normalized()
        bn = t.cross(n)
        row = []
        for k in range(sides):
            ang = 2 * math.pi * k / sides + twist
            row.append(bm.verts.new(p + (n * math.cos(ang) + bn * math.sin(ang)) * radii[i]))
        ringv.append(row)
    for a, b in zip(ringv, ringv[1:]):
        for k in range(sides):
            bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]))
    if caps:
        bm.faces.new(ringv[0][::-1])
        bm.faces.new(ringv[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_from_bm(sc, name, bm)


def decimate(sc, ob, target_tris, symmetric=True):
    now = tris(ob)
    if now <= target_tris:
        return ob
    m = ob.modifiers.new('dec', 'DECIMATE')
    m.decimate_type = 'COLLAPSE'
    m.ratio = target_tris / now
    m.use_symmetry = symmetric
    m.symmetry_axis = 'X'
    apply_modifiers(sc, ob)
    return ob


def rings(sc, name, profile, segs, cap_top=True, cap_bottom=True, phase=0.0, shape=None):
    """
    A lathe-like shell from horizontal rings. `profile` rows are
    (z, rx, ry_front, ry_back); a ring point at angle a (0 = front, -Y) is
    (rx sin a, -ry cos a) with ry_front on the front half. `shape(i, j, v)`
    may tweak each vertex (ring i, segment j). Returns (object, grid) where
    grid[i][j] is the vertex index.
    """
    bm = bmesh.new()
    grid = []
    for i, (z, rx, ryf, ryb) in enumerate(profile):
        row = []
        for j in range(segs):
            a = 2 * math.pi * (j + phase) / segs
            ca = math.cos(a)
            v = Vector((rx * math.sin(a), -(ryf if ca >= 0 else ryb) * ca, z))
            if shape:
                v = shape(i, j, v)
            row.append(bm.verts.new(v))
        grid.append(row)
    for i in range(len(grid) - 1):
        for j in range(segs):
            k = (j + 1) % segs
            bm.faces.new((grid[i][j], grid[i][k], grid[i + 1][k], grid[i + 1][j]))
    if cap_bottom:
        z0 = profile[0][0]
        c = bm.verts.new(Vector((0, 0, z0 - 0.01)))
        for j in range(segs):
            bm.faces.new((grid[0][(j + 1) % segs], grid[0][j], c))
    if cap_top:
        z1 = profile[-1][0]
        c = bm.verts.new(Vector((0, 0, z1 + 0.012)))
        for j in range(segs):
            bm.faces.new((grid[-1][j], grid[-1][(j + 1) % segs], c))
    bm.normal_update()
    ob = mesh_from_bm(sc, name, bm)
    return ob


def ico(sc, name, radius, subdiv=1, at=(0, 0, 0), scale=(1, 1, 1), noise=0.0, seed=1):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    rnd = random.Random(seed)
    for v in bm.verts:
        if noise:
            v.co *= 1 + (rnd.random() * 2 - 1) * noise
        v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2])) + Vector(at)
    return mesh_from_bm(sc, name, bm)


def box(sc, name, size, at=(0, 0, 0), rot=(0, 0, 0), taper=None):
    """A box of full `size`; `taper=(sx, sy)` scales its top face."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        if taper and v.co.z > 0:
            v.co.x *= taper[0]
            v.co.y *= taper[1]
    m = Matrix.Translation(Vector(at)) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X')
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return mesh_from_bm(sc, name, bm)


def cyl(sc, name, r_bottom, r_top, h, segs, at=(0, 0, 0), rot=(0, 0, 0), caps=True, scale=(1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segs, radius1=r_bottom, radius2=r_top, depth=h)
    for v in bm.verts:
        v.co.x *= scale[0]
        v.co.y *= scale[1]
    m = Matrix.Translation(Vector(at)) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X')
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return mesh_from_bm(sc, name, bm)


def mirror_x(sc, ob, name=None):
    """A copy mirrored across X (normals fixed)."""
    me = ob.data.copy()
    bm = bmesh.new()
    bm.from_mesh(me)
    for v in bm.verts:
        v.co.x = -v.co.x
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = link(sc, bpy.data.objects.new(name or ob.name + '.R', me))
    for vg in ob.vertex_groups:
        o.vertex_groups.new(name=vg.name)
    return o


# ---------------------------------------------------------------- colour


def ensure_attrs(me):
    if 'Col' not in me.color_attributes:
        me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    if '_FX' not in me.attributes:
        me.attributes.new('_FX', 'FLOAT2', 'POINT')
    me.color_attributes.active_color = me.color_attributes['Col']
    me.color_attributes.render_color_index = me.color_attributes.find('Col')


def paint(ob, color, jitter=0.07, seed=1, where=None, glow=0.0, mask=0.0, by_face=False):
    """
    Colour faces: `color` is 0xRRGGBB or a function(face_center) -> 0xRRGGBB
    (or function(polygon) with `by_face`).
    One shade per face, varied by `jitter` like kit.ts. `where(center)` limits
    which faces are painted.
    """
    me = ob.data
    ensure_attrs(me)
    col = me.color_attributes['Col'].data
    fx = me.attributes['_FX'].data
    rnd = random.Random(seed)
    for p in me.polygons:
        c = Vector(p.center)
        if where and not where(c):
            continue
        h = (color(p) if by_face else color(c)) if callable(color) else color
        k = 1 + (rnd.random() * 2 - 1) * jitter
        r, g, b, _ = lin(h)
        for li in p.loop_indices:
            col[li].color = (r * k, g * k, b * k, 1.0)
        for vi in p.vertices:
            fx[vi].vector = (glow, mask)
    return ob


def assign_bone(ob, bone, weight=1.0, where=None):
    """Rigidly weight vertices (optionally only those passing `where(co)`) to one bone."""
    vg = ob.vertex_groups.get(bone) or ob.vertex_groups.new(name=bone)
    idx = [v.index for v in ob.data.vertices if where is None or where(v.co)]
    vg.add(idx, weight, 'REPLACE')
    return ob


def join(sc, obs, name):
    base = obs[0]
    for o in obs:
        ensure_attrs(o.data)
    activate(sc, base)
    for o in obs[1:]:
        o.select_set(True, view_layer=sc.view_layers[0])
    with ctx(sc, base, selected=obs):
        bpy.ops.object.join()
    base.name = name
    base.data.name = name
    return base


def vertex_colour_material(name):
    """Principled BSDF driven by the Col attribute: what the glTF exporter reads as COLOR_0."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = 1.0
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat


def bake_ao(sc, ob, strength=0.5, distance=0.25, samples=48, floor=True):
    """
    Bake ambient occlusion into a temporary colour attribute with Cycles and
    multiply it into Col: `strength` is how dark full occlusion gets.
    A ground plane is added for the bake so feet and roots darken.
    """
    me = ob.data
    ensure_attrs(me)
    ao = me.color_attributes.get('AO') or me.color_attributes.new('AO', 'FLOAT_COLOR', 'CORNER')
    me.color_attributes.active_color = ao
    plane = None
    if floor:
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=4)
        plane = mesh_from_bm(sc, 'bake_floor', bm)
    prev = sc.render.engine
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.device = 'CPU'
    sc.world = sc.world or bpy.data.worlds.new('bake_world')
    sc.world.light_settings.distance = distance
    if not ob.data.materials:
        ob.data.materials.append(vertex_colour_material('descent_vcol'))
    with ctx(sc, ob):
        activate(sc, ob)
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS', margin=0)
    sc.render.engine = prev
    col = me.color_attributes['Col'].data
    aod = ao.data
    for i in range(len(col)):
        a = aod[i].color[0]
        k = (1 - strength) + strength * a
        c = col[i].color
        col[i].color = (c[0] * k, c[1] * k, c[2] * k, 1.0)
    me.color_attributes.remove(ao)
    me.color_attributes.active_color = me.color_attributes['Col']
    if plane:
        m = plane.data
        bpy.data.objects.remove(plane)
        bpy.data.meshes.remove(m)
    return ob


# ---------------------------------------------------------------- rig

BONES = ['hips', 'spine', 'head', 'jaw', 'upperArmL', 'forearmL', 'handL', 'upperArmR', 'forearmR', 'handR',
         'thighL', 'shinL', 'thighR', 'shinR']
PARENT = {'hips': None, 'spine': 'hips', 'head': 'spine', 'jaw': 'head', 'upperArmL': 'spine', 'forearmL': 'upperArmL',
          'handL': 'forearmL', 'upperArmR': 'spine', 'forearmR': 'upperArmR', 'handR': 'forearmR', 'thighL': 'hips',
          'shinL': 'thighL', 'thighR': 'hips', 'shinR': 'thighR'}


def joints(p):
    """Each bone's bind head in game space, from rig.ts's Proportions."""
    off = {
        'hips': (0, p['hipY'], 0), 'spine': (0, 0.06, 0), 'head': (0, p['neck'], p.get('headZ', 0)),
        'jaw': (0, 0.02 * p.get('head', 1), 0.05 * p.get('head', 1)),
        'upperArmL': (p['shoulderW'], p['spine'], 0), 'forearmL': (0, -p['upperArm'], 0), 'handL': (0, -p['forearm'], 0),
        'upperArmR': (-p['shoulderW'], p['spine'], 0), 'forearmR': (0, -p['upperArm'], 0), 'handR': (0, -p['forearm'], 0),
        'thighL': (p['hipW'], -0.02, 0), 'shinL': (0, -p['thigh'], 0), 'thighR': (-p['hipW'], -0.02, 0), 'shinR': (0, -p['thigh'], 0),
    }
    out = {}
    for b in BONES:
        o = Vector(off[b])
        out[b] = out[PARENT[b]] + o if PARENT[b] else o
    return out


def armature(sc, name, p, tails=None):
    """
    The game's 14-bone rig at bind. `tails` (bone -> game-space point) sets
    anatomical tails for automatic weights; call `straighten` afterwards.
    """
    arm = bpy.data.armatures.new(name)
    ob = link(sc, bpy.data.objects.new(name, arm))
    j = joints(p)
    with ctx(sc, ob):
        activate(sc, ob)
        bpy.ops.object.mode_set(mode='EDIT')
        for b in BONES:
            eb = arm.edit_bones.new(b)
            eb.head = g2b(*j[b])
            t = tails.get(b) if tails else None
            eb.tail = g2b(*t) if t is not None else eb.head + Vector((0, 0, 0.08))
            eb.roll = 0
        for b in BONES:
            if PARENT[b]:
                arm.edit_bones[b].parent = arm.edit_bones[PARENT[b]]
                arm.edit_bones[b].use_connect = False
        bpy.ops.object.mode_set(mode='OBJECT')
    return ob


def straighten(sc, arm_ob):
    """Point every bone straight up with roll 0: identity rest rotations in glTF."""
    with ctx(sc, arm_ob):
        activate(sc, arm_ob)
        bpy.ops.object.mode_set(mode='EDIT')
        for eb in arm_ob.data.edit_bones:
            eb.tail = eb.head + Vector((0, 0, 0.08))
            eb.roll = 0
        bpy.ops.object.mode_set(mode='OBJECT')


def bind(sc, mesh_ob, arm_ob, auto=True):
    """Parent the mesh to the armature: automatic (heat) weights, or its existing vertex groups."""
    activate(sc, mesh_ob)
    arm_ob.select_set(True, view_layer=sc.view_layers[0])
    sc.view_layers[0].objects.active = arm_ob
    with ctx(sc, arm_ob, selected=[mesh_ob, arm_ob]):
        bpy.ops.object.parent_set(type='ARMATURE_AUTO' if auto else 'ARMATURE_NAME')
    return mesh_ob


def limit_weights(ob, limit=4):
    """Normalize and cap influences per vertex (glTF/three take 4)."""
    groups = {vg.index: vg for vg in ob.vertex_groups}
    for v in ob.data.vertices:
        ws = sorted(((g.weight, g.group) for g in v.groups if g.weight > 0.001), reverse=True)
        keep = ws[:limit]
        total = sum(w for w, _ in keep) or 1
        for w, gi in ws[limit:]:
            groups[gi].remove([v.index])
        for w, gi in keep:
            groups[gi].add([v.index], w / total, 'REPLACE')


# ---------------------------------------------------------------- output


def export_glb(sc, obs, path):
    vl = sc.view_layers[0]
    for o in sc.objects:
        o.select_set(o in obs, view_layer=vl)
    vl.objects.active = obs[0]
    with ctx(sc, obs[0]):
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format='GLB',
            use_selection=True,
            export_yup=True,
            export_apply=False,
            export_normals=False,
            export_texcoords=False,
            export_vertex_color='ACTIVE',
            export_all_vertex_colors=False,
            export_attributes=True,
            export_skins=True,
            export_def_bones=True,
            export_influence_nb=4,
            export_animations=False,
            export_morph=False,
            export_materials='EXPORT',
            export_extras=False,
            export_cameras=False,
            export_lights=False,
        )


def render_views(sc, obs, path, height, views=((0, 0), (math.pi * 0.75, 0)), size=(520, 700), center_z=None):
    """
    Quick Workbench render of `obs` from the given (yaw, pitch) views, side by
    side, flat-lit with the vertex colours, into one PNG at `path`.
    """
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'VERTEX'
    sh.show_object_outline = False
    sh.show_cavity = False
    sc.view_settings.view_transform = 'Standard'
    sc.render.film_transparent = False
    sc.world = sc.world or bpy.data.worlds.new('bake_world')
    sc.render.resolution_x, sc.render.resolution_y = size
    sc.render.resolution_percentage = 100
    cam_data = bpy.data.cameras.get('qa_cam') or bpy.data.cameras.new('qa_cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = height * 1.1
    cam = bpy.data.objects.get('qa_cam') or bpy.data.objects.new('qa_cam', cam_data)
    if cam.name not in sc.objects:
        sc.collection.objects.link(cam)
    sc.camera = cam
    cz = center_z if center_z is not None else height / 2
    shown = set(obs)
    hidden = []
    for o in sc.objects:
        if o.type == 'MESH' and o not in shown and not o.hide_render:
            o.hide_render = True
            hidden.append(o)
    files = []
    for i, (yaw, pitch) in enumerate(views):
        d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
        cam.location = Vector((0, 0, cz)) + d * 10
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        f = path.replace('.png', '_%d.png' % i)
        sc.render.filepath = f
        bpy.ops.render.render(write_still=True, scene=sc.name)
        files.append(f)
    for o in hidden:
        o.hide_render = False
    return files
