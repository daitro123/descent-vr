# Joining zones without a loading screen

Type: research
Status: resolved
Blocked by: 

## Question

How can a Three.js WebXR game in the Quest 3 browser join two zones so the player walks from one into the next without a loading screen or a dropped frame?

Find, from primary sources (three.js docs and source, the WebXR and browser docs, Meta's developer docs):

- how to load and build a zone's geometry in pieces without stalling a 72 fps frame: workers, OffscreenCanvas, time-sliced building, `renderer.compileAsync`, the cost of uploading textures and buffers
- how to unload what is behind the player and keep memory within the Quest browser's limits
- how to stay within the draw-call budget with two zones near the seam: culling, merging, fog and the far plane
- how the same approach would stream in an interior (the mine, a building) as the player walks in

Say how each finding constrains this project: how wide the seam must be, what the player sees across it, and how `src/maps/` (one `GameMap` per zone, found by `registry.ts`) would need to change.

## Answer

Full findings with sources: [research/joining-zones-without-a-loading-screen.md](../research/joining-zones-without-a-loading-screen.md).

**Yes, the Quest 3 browser can join two zones without a loading screen or a dropped frame**, with four changes to how a zone is built and shown:

- **Build in a worker.** Build each zone in a Web Worker, one 40 m chunk at a time, nearest first, and hand the arrays back without copying. Oakvale's build (0.6 to 0.8 s, measured) doesn't touch the page, so it can move as it is.
- **Upload one chunk per frame, before it's in view.** three.js uploads a mesh the first time it's drawn. A hidden, unculled material uploads it a frame early. The safe megabytes per frame must be measured on the headset.
- **Keep the shader count fixed.** Each zone carries its own sun and sky light today, which would recompile every lit shader mid-walk. Lights, sky and one fog move to world level, and crossing only blends their values.
- **Stream by chunk distance, not by zone.** Full detail within about 120 m, cheap stand-ins out to the draw distance. A neighbouring zone's plan loads on entering the zone. Fog becomes radial, or the stream radius grows to about 420 m.

For this project:

- **The seam** is a line on the chunk grid with a 40 m height blend each side, best put in a pass so the mountains hide most of the neighbour. The southern pass (z = +140) fits.
- **Triangles, not draw calls, are the tight limit:** Oakvale seen from the village is already about 250k to 300k over both eyes, at the rule of thumb.
- **Interiors** use the same streamer as small cells tied to a door or mouth. Past a bend, the outdoors is hidden and fog switches to interior values.
- **`src/maps/`** needs a world level (shared lights, sky, fog), zones split into a plan and chunks, and a per-frame streamer.
