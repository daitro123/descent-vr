# 35: Building chunks in a worker

**What to build:** Chunks are built off the main thread. The streamer asks a worker for the nearest chunks first, gets them back without copying, and uploads at most one per frame, staged a frame before it's seen, so walking or running through Oakvale never drops a frame to a chunk arriving.

**Spec:** Implementation Decisions › The streamer, Performance (`?perf`). User stories 122 and 143 (bytes uploaded).

**Blocked by:** 34 (Oakvale in streamed chunks).

**Status:** done

- [x] Chunks are built in a worker, nearest first, and handed back as transferable arrays without copying.
- [x] At most one chunk is uploaded per frame, staged one frame ahead with a hidden material and culling off, so the upload doesn't land when the chunk is first seen.
- [x] A zone's shader programs are compiled before its first chunk shows.
- [x] `?perf` adds the bytes uploaded this frame.
- [x] If workers aren't available, the streamer falls back to building on the main thread as in ticket 34.
- [x] Tests: the worker's chunks match the main-thread builder's byte for byte.
- [x] Checked in headless Chromium: walking and running the length of Oakvale never uploads more than one chunk in a frame and leaves `renderer.info.programs.length` unchanged.
- [x] Every new number is in the game's table of tunables.

## Built

Built on 2026-09-30 by Claude, in autonomous mode (Tom asked for the rest of Oakvale to run without his input).

- **The worker** (`src/world/chunkWorker.ts`): the conversation between the streamer and a zone's worker. `serveChunks` answers each request (`{ id, key, detail }`) with the chunk built, its five arrays' buffers transferred, not copied, or with why it couldn't be. `ChunkWorker` is the streamer's side: it asks (`offer`, at most `CONFIG.streaming.inFlight` at once, never twice for the same chunk and detail), hands each chunk that comes back to the streamer, and if the worker fails to load, throws or can't build a chunk, shuts it and says so, so the main thread takes over.
- **Oakvale's worker** (`src/maps/forest/chunkWorker.ts`): plans Oakvale afresh as it starts (`oakvaleBuilder` in `chunks.ts`) and builds whichever chunk it's asked for with the same builder as the main thread. A zone's `ChunkSource` now has an optional `worker()`; `buildForest` gives one only when it made its own plan, since the worker's plan is the default one.
- **The streamer** (`src/world/streamer.ts`): each frame it asks the zone's worker for the nearest chunks wanted that aren't asked for yet, and uploads at most `CONFIG.streaming.perFrame` (1) of what has come back, nearest first, staged unseen for a render as in 34 and shown the frame after. A chunk that comes back no longer wanted at that detail is forgotten. With no worker (no `Worker` in the page, a zone without one, or a worker that failed) it builds on the main thread one a frame, as in 34. A fill (loading in, waking, the viewer's jumps) still builds everything at once on the main thread behind the page or the fade, using whatever has already come back.
- **Shader programs** (`World.attach(scene, camera, renderer)`): at a zone's first fill the World compiles its extras and its chunks under its lights and fog, before the render that first shows them. That replaces the Adventure's own compile of Oakvale's extras; the viewer and `?map=` get it too.
- **`?perf`** adds `uploaded   N KB`: the bytes handed to WebGL's buffers (vertices and indices) in the frame that handed over most since the last redraw. It counts by wrapping the context's `bufferData` and `bufferSubData`, only with `?perf`.
- **Tunables**: `CONFIG.streaming.inFlight` 2; `perFrame` now counts chunks uploaded a frame (and built, without a worker).
- **Tests**: `tests/streaming.test.ts`, Oakvale's worker run in the test's own thread through `serveChunks` with postMessage's cloning and transfer: every chunk, full and stand-in, byte for byte the main thread's, and every array the worker built left empty (transferred); a failed chunk shuts it. The streamer with a worker: asks nearest first, never more than 2 at once, uploads at most one a frame, builds nothing on the main thread; forgets a chunk that comes back unwanted; builds on the main thread once its worker fails, what it had asked for too, one a frame. `tests/world.test.ts`: Oakvale's extras and chunks compiled at the first fill, with the chunks built and before a render, and only once.
- **Checks**: `checks/chunk-worker.mjs` (see its header). The worker, started as Oakvale starts it, builds all 98 chunks (62.6 MB) byte for byte as the page does, in about 2 s. In the Adventure with `?perf`, walking the main road north to south a metre an XR frame and running it back two metres a frame: the chunks come from the worker (none built on the main thread), at most one chunk is uploaded in any render (25 over 294 renders walking, 17 over 171 running), no render hands WebGL more than 419 KB but the one that stages the mine and the Warden as you come within 40 m of its mouth (2993 KB, ticket 34's), and `renderer.info.programs` is 18 before and after. The streamer's time on the main thread a frame: 0.2 ms on average and 4.1 ms at most with the worker, against 1.0 ms and 25.1 ms building on the main thread (SwiftShader, headless; the headset's numbers are for 38). With `Worker` taken out of the page the streamer builds on the main thread, still one a frame, and catches up. `?perf` reads `uploaded   6 KB`. The built site (`vite build`, `vite preview`) loads the worker and streams from it.

Calls **taken on Tom's behalf**, to revisit:

- **`?perf` shows the most uploaded in a frame since its last redraw**, not the last frame's bytes: it redraws twice a second and most frames upload nothing, so the last frame's figure would nearly always read 0. It counts buffers, not textures.
- **Two chunks asked of the worker at once**: enough that it never waits on the main thread, few enough that as you turn or run the nearest chunk waits behind at most two that were nearest a moment ago (they aren't cancelled; they're forgotten when they come back).
- **One failure ends the worker for the zone**: a chunk the worker can't build would fail on the main thread too, and a worker that failed to load won't come back, so the streamer stops asking it rather than retrying.
- **Fills stay on the main thread**: they happen behind the page or the fade, where a pause isn't seen, and they need every chunk at once.
- **The worker plans Oakvale for itself** rather than being sent the main thread's plan: the plan holds functions and closures that can't be sent, and planning is quick and pure.

Left for later:

- Brackenmoor's chunks and its worker (36, 37); the streamer's cost and a chunk's upload on the headset, and the triangle budget (38).
