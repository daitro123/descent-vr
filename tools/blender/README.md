# Blender low-poly experiment

Two humans, one skeleton and one oak modelled in Blender 5.2 by script, to see
whether Blender-made models can look better than the code-built ones and still
fit the Quest 3 browser budget. See them beside today's models at `?blender`.

| Model | Today (code) | Blender | File (gzip) |
| --- | --- | --- | --- |
| Human | Farmer, 704 tris | 1,320 tris | 127 KB (≈32 KB) |
| Human, detailed (Warcraft Classic style) | Farmer, 704 tris | 2,130 tris, smooth-shaded | 248 KB (≈61 KB) |
| Skeleton | Grunt v0, 1,048 tris | 1,464 tris | 164 KB (≈33 KB) |
| Oak | 128 tris | 320 tris (far LOD 62) | 21 KB (≈9 KB), LOD 3 KB |

Each model is one mesh, one material and one draw call, with per-face vertex
colours (`COLOR_0`) and, on the skeleton, the kit's glow and weapon-mask
channel as a `_FX` attribute. Ambient occlusion is baked into the vertex
colours with Cycles. The human and skeleton are skinned to the game's 14 bones
at the game's bind positions (average build and grunt proportions), with
identity rest rotations, so `poses.ts` drives them unchanged: the `?blender`
page plays the game's own clips on them. The human uses Blender's automatic
(heat) weights, so elbows, knees and shoulders bend smoothly; the skeleton is
rigid per bone.

## Rebuild

Headless, from the repo root:

```
blender -b --factory-startup -P tools/blender/build_all.py
```

or in a running Blender through the Blender Lab MCP add-on, exec
`build_all.py` with `HERE` set to this folder. Each model then gets its own
scene ("Descent Human", "Descent Skeleton", "Descent Oak") to inspect or
tweak by hand. The .glb files land in `public/models/blender/`.

- `lowpoly.py`: helpers (skin-modifier bodies, lathe rings, tubes, face
  painting, the rig, AO bake, glTF export).
- `human.py`, `hero.py` (the detailed human), `skeleton.py`, `tree.py`: the models.
