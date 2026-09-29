# Builds the three Blender low-poly models and exports them to
# public/models/blender/ as .glb (plus the oak's far LOD).
#
#   Through the Blender Lab MCP add-on: exec this file with HERE set to this folder.
#   Headless:  blender -b -P tools/blender/build_all.py
#
# Each model gets its own scene in the open file ("Descent Human",
# "Descent Skeleton", "Descent Oak"), so they can be inspected and tweaked by
# hand in Blender afterwards.

import os

HERE = globals().get('HERE') or os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'models', 'blender')
ns = globals()
for f in ('lowpoly.py', 'human.py', 'skeleton.py', 'tree.py'):
    exec(open(os.path.join(HERE, f), encoding='utf-8').read(), ns)
os.makedirs(OUT, exist_ok=True)


def drop_fx(ob):
    """No glow or weapon mask on this model: leave the attribute out of the file."""
    if '_FX' in ob.data.attributes:
        ob.data.attributes.remove(ob.data.attributes['_FX'])


built = {}

sc = fresh_scene('Descent Human')
human, human_rig = build_human(sc)
drop_fx(human)
export_glb(sc, [human, human_rig], os.path.join(OUT, 'human.glb'))
built['human'] = tris(human)

sc = fresh_scene('Descent Skeleton')
skel, skel_rig = build_skeleton(sc)
export_glb(sc, [skel, skel_rig], os.path.join(OUT, 'skeleton.glb'))
built['skeleton'] = tris(skel)

sc = fresh_scene('Descent Oak')
oak = build_tree(sc)
drop_fx(oak)
lod = build_tree_lod(sc, oak)
export_glb(sc, [oak], os.path.join(OUT, 'oak.glb'))
export_glb(sc, [lod], os.path.join(OUT, 'oak_lod.glb'))
built['oak'] = tris(oak)
built['oak_lod'] = tris(lod)

result = {'tris': built, 'files': {f: os.path.getsize(os.path.join(OUT, f)) for f in sorted(os.listdir(OUT))}}
print(result)
