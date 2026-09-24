# Quest 3 browser performance budget

Type: research
Status: resolved
Blocked by:

## Question

What can a Three.js WebXR scene realistically sustain in the Quest 3 browser at 72 or 90 fps? The spec shouldn't promise more than the device can run.

Find, from primary sources (Meta's developer docs, Three.js docs and source, and the browser's WebXR docs):

- draw call and triangle budgets
- dynamic lights and shadows (how expensive torch-style point lights are)
- fixed foveation, framebuffer scale, and whether multiview is available through three.js
- the cost of transparent or additive particles
- any Quest-browser-specific pitfalls (for example the texture memory limit)

Say how each finding constrains *this* project: enemy count on screen, room size, and the lighting plan.

## Answer

Full findings with citations: [research/quest-3-browser-performance-budget.md](../research/quest-3-browser-performance-budget.md).

- **Draw calls are the limit that bites first.** Three.js `WebGLRenderer` has no multiview, so every draw is issued once per eye. Budget about 300 draw calls per frame, as counted by `renderer.info` in XR, with a ceiling of about 500. Triangles are not a concern at this art style (at most 300k).
- **Target 72 fps** and request it explicitly at session start.
- **Lighting:** at most 4 point lights plus the hemisphere light, and the count never changes. Move a pool of 4 lights to the nearest torches and fake the rest with emissive meshes and glow sprites. No shadow maps; use blob shadows.
- **Enemies:** about 8 on screen, hard cap 12. A grunt is 5 meshes, which is 10 draw calls in XR.
- **Rooms:** merge each room's static geometry to 6–8 draw calls. Show only the current and adjacent rooms, and keep fog and the far plane within 15–25 m.
- **Particles:** one instanced object per effect type, additive, no large transparent quads near the camera.
- **Renderer settings:** keep MSAA, set foveation explicitly, and leave framebuffer scale at 1.0 (0.85 is the first thing to lower if GPU-bound). Skip multiview for the slice.
- **Confidence:** the three.js claims were checked against the r186 source. Meta's guidance is medium confidence because developers.meta.com was blocked. The findings file lists 10 things to measure on the headset.
