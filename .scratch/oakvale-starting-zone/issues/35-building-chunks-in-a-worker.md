# 35: Building chunks in a worker

**What to build:** Chunks are built off the main thread. The streamer asks a worker for the nearest chunks first, gets them back without copying, and uploads at most one per frame, staged a frame before it's seen, so walking or running through Oakvale never drops a frame to a chunk arriving.

**Spec:** Implementation Decisions › The streamer, Performance (`?perf`). User stories 122 and 143 (bytes uploaded).

**Blocked by:** 34 (Oakvale in streamed chunks).

**Status:** ready-for-agent

- [ ] Chunks are built in a worker, nearest first, and handed back as transferable arrays without copying.
- [ ] At most one chunk is uploaded per frame, staged one frame ahead with a hidden material and culling off, so the upload doesn't land when the chunk is first seen.
- [ ] A zone's shader programs are compiled before its first chunk shows.
- [ ] `?perf` adds the bytes uploaded this frame.
- [ ] If workers aren't available, the streamer falls back to building on the main thread as in ticket 34.
- [ ] Tests: the worker's chunks match the main-thread builder's byte for byte.
- [ ] Checked in headless Chromium: walking and running the length of Oakvale never uploads more than one chunk in a frame and leaves `renderer.info.programs.length` unchanged.
- [ ] Every new number is in the game's table of tunables.
