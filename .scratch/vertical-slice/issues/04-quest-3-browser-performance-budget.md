# Quest 3 browser performance budget

Type: research
Status: open
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
