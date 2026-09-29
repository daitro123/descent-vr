# The forest oak, remodelled in Blender (src/maps/forest/nature.ts's `oak`).
#
# Trunk, buttress roots and limbs are one skin-modifier mesh, so the limbs grow
# out of the trunk instead of poking through it. The canopy is a few lumpy
# low-poly clumps, lighter on top and darker underneath, with baked ambient
# occlusion darkening the canopy's underside and the trunk beneath it.
# Also writes a far LOD, decimated from the same model.
#
# Needs lowpoly.py's helpers in scope (see build_all.py).

LEAF = [0x3f6d2a, 0x4b7a2f, 0x578a34, 0x66963a]
BARK, BARK_DARK = 0x5a4430, 0x45331f


def oak_wood(sc):
    V = Vector
    nodes = [
        (V((0, 0, 0.0)), (0.46, 0.46)),     # 0 flare
        (V((0, 0, 0.45)), (0.33, 0.33)),    # 1
        (V((0.03, 0.02, 1.6)), (0.27, 0.27)),  # 2
        (V((0.06, 0.0, 2.75)), (0.24, 0.24)),  # 3 fork
        (V((1.25, 0.25, 3.9)), (0.12, 0.12)),  # 4 limb east
        (V((-1.05, 0.75, 4.0)), (0.12, 0.12)),  # 5 limb north-west
        (V((-0.2, -1.15, 3.8)), (0.11, 0.11)),  # 6 limb south
        (V((0.1, 0.05, 4.4)), (0.14, 0.14)),   # 7 leader
        (V((0.78, 0.12, -0.04)), (0.13, 0.11)),  # 8 roots
        (V((-0.42, 0.66, -0.04)), (0.13, 0.11)),
        (V((-0.36, -0.7, -0.04)), (0.12, 0.11)),
    ]
    edges = [(0, 1), (1, 2), (2, 3), (3, 4), (3, 5), (3, 6), (3, 7), (0, 8), (0, 9), (0, 10)]
    ob = skin(sc, 'oak_wood', nodes, edges, subsurf=1, target_tris=120, root=0)
    paint(ob, lambda c: BARK_DARK if c.z < 0.5 else BARK, jitter=0.12, seed=31)
    return ob


def oak_canopy(sc, target=200):
    """
    Lumpy clumps fused into one canopy with a voxel remesh (so no faces are
    wasted inside the overlaps), then decimated: one cloud-like silhouette.
    """
    clumps = [
        ((0.1, 0.05, 4.95), 1.75),
        ((1.45, 0.3, 4.35), 1.4),
        ((-1.2, 0.95, 4.45), 1.45),
        ((-0.25, -1.35, 4.25), 1.4),
        ((0.45, 1.05, 5.1), 1.15),
        ((-0.7, -0.3, 5.3), 1.1),
    ]
    parts = [ico(sc, 'clump', r, subdiv=2, at=at, scale=(1, 1, 0.78), noise=0.1, seed=40 + k) for k, (at, r) in enumerate(clumps)]
    c = join(sc, parts, 'canopy')
    m = c.modifiers.new('remesh', 'REMESH')
    m.mode = 'VOXEL'
    m.voxel_size = 0.18
    apply_modifiers(sc, c)
    decimate(sc, c, target, symmetric=False)
    # Colour by facing: sunlit tops light, undersides dark.
    rnd = random.Random(50)

    def colour(p):
        up = p.normal.z
        base = 3 if up > 0.6 else 2 if up > 0.1 else 1 if up > -0.45 else 0
        base = max(0, min(3, base + (1 if rnd.random() < 0.18 else 0) - (1 if rnd.random() < 0.18 else 0)))
        return LEAF[base]

    paint(c, colour, jitter=0.05, seed=60, by_face=True)
    return [c]


def build_tree(sc):
    ob = join(sc, [oak_wood(sc)] + oak_canopy(sc), 'Oak')
    ob.data.materials.clear()
    ob.data.materials.append(vertex_colour_material('descent_vcol'))
    bake_ao(sc, ob, strength=0.45, distance=1.4)
    return ob


def build_tree_lod(sc, src, target=64):
    """A far copy of the finished oak: the same colours, decimated."""
    me = src.data.copy()
    lod = link(sc, bpy.data.objects.new('OakLOD', me))
    decimate(sc, lod, target, symmetric=False)
    lod.data.validate()
    return lod
