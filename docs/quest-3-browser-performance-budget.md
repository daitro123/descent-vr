# Research: Quest 3 browser performance budget

Researched September 2026 against three.js **r186** (the version in `package.json`).

**How the sources were read.** The three.js claims were checked directly against the r186 source (the npm tarball of `three@0.186.1`, identical to the `r186` tag on GitHub). The W3C WebXR and Layers specs and the Khronos `OVR_multiview2` spec were read from their GitHub source. **This environment's egress policy blocks `developers.meta.com`.** Claims from Meta's docs therefore come from search-engine extracts of those pages, not from reading the pages in full. Each Meta citation points at the page the extract came from, and these claims are **medium confidence**. Re-read the linked page before relying on an exact number. Anything that is a rule of thumb and not a documented limit is labelled **(rule of thumb)**.

---

## Bottom line for the slice

Treat these as the budgets for the spec. Every number is a rule of thumb derived from the findings below, and each needs confirming on the headset (see *Open uncertainties*).

| Knob | Budget / setting | Why (short) |
|---|---|---|
| Target frame rate | **72 fps (13.9 ms)**. Request it explicitly on `sessionstart` with `session.updateTargetFrameRate(72)` when `supportedFrameRates` includes 72. Move to 90 only if OVR Metrics shows headroom. | 72 is Meta's minimum. Quest 3's browser default rate is unclear and may be 90. |
| Draw calls, as reported by `renderer.info.render.calls` in XR (both eyes) | **≤ 300 steady state, ceiling about 500** (rule of thumb) | three.js `WebGLRenderer` has no multiview, so every draw is issued once per eye. Meta's native Quest guidance is 80–300 per frame for busy or medium apps. A 600-mesh scene ran at about 48 fps on a Quest 3. |
| Triangles, as reported by `renderer.info.render.triangles` (both eyes) | **≤ 600k** (about 300k per eye), and **≤ 32k** in one full-detail 40 m chunk (`CONFIG.streaming.budget`). Doubled on Tom's call on 2026-10-01 from the research's 300k and 16k. **Not yet measured on the headset** (see *Open uncertainties*, item 11). | Native Quest 2 guidance is 750k–1M, and Tom reads about 1.8M for a native Quest 3 app (not checked against Meta's docs). The research first halved native guidance for per-eye WebGL, giving 300k. The streamed zones peak at about 354k at Oakvale's mine front. |
| Dynamic lights | **≤ 4 point lights + 1 hemisphere light** in the scene at any time (today's arena is exactly this). **Keep the count constant.** Use a pool of 4 point lights that moves to the nearest torches; every other torch is faked with an emissive mesh and an additive glow sprite. | Every lit fragment of every Lambert or Standard material loops over **all** point lights. Range does not cull them. Changing the count recompiles every lit shader, which causes a hitch. |
| Shadows | **No shadow maps.** Use blob shadows (a small dark transparent quad or decal under the player and enemies). | A shadow-casting point light re-renders the scene 6 times per frame. Meta calls this "particularly problematic". |
| Enemies on screen | **8 simultaneous, hard cap 12.** | One grunt today is 5 meshes, so 10 draws per frame in XR. Ten grunts cost about 100 draws before the room, weapons, HUD and effects. |
| Room / floor geometry | Merge each room's static geometry per material (`mergeGeometries`) so a room costs **≤ 6–8 draws**. Show only the current room plus adjacent rooms. Keep `camera.far` and the fog end at about 15–25 m. | Keeps the draw budget for enemies and effects. Merging per room (not per floor) keeps frustum culling useful. |
| Particles | One `InstancedMesh` or `Points` per effect type (1 draw call each). Additive blending, `depthWrite: false`. Keep particles small on screen and **never** put a large transparent quad near the camera. Cap at a few hundred live particles (rule of thumb). | Cost is overdraw (screen area × layers), not particle count. Meta names overlapping alpha-blended particles as the most common cause of being fragment-bound. |
| Foveation | `renderer.xr.setFoveation(1)`, set explicitly. It is already three.js's default. | Cheap GPU saving that fits a dark, fogged dungeon whose edges are dim anyway. |
| Framebuffer scale | Leave at `1.0` (the browser's recommended size). The **first lever when GPU-bound** is `renderer.xr.setFramebufferScaleFactor(0.85)`, which must be called **before** the session starts. | Meta recommends 0.8–0.9 as a large fragment saving. three.js can't change it mid-session. |
| Anti-aliasing | Keep `antialias: true`. | three.js uses `WEBGL_multisampled_render_to_texture` (4× MSAA resolved on-tile). Meta: "almost always use MSAA" on Quest, never above 4×. |
| Multiview | **Don't pursue it for the slice.** | It is not available in `WebGLRenderer`. It exists only in `WebGPURenderer` with `forceWebGL: true, multiview: true`, which would mean migrating the renderer. Revisit only if on-headset measurement shows the game is CPU/draw-call bound. |
| Texture memory | Not a constraint at the current art style (32×32 canvas textures). Dispose GPU resources when leaving a floor, and watch `renderer.info.memory`. | Quest 3 kills native apps at 5.75 GiB PSS. The browser's own overhead shares that budget. |
| Shader warm-up | Call `renderer.compileAsync(scene, camera)` while loading each floor, with every material and light already in place. | Avoids first-use shader-compile stalls mid-fight. |

**Settings to add in `src/main.ts`:** do not change them now; this is for the build ticket.

```ts
renderer.xr.setFoveation(1);              // explicit; three's default is already 1 (max)
renderer.xr.setFramebufferScaleFactor(1); // lower to 0.85–0.9 only if GPU-bound; must be set before entering VR
renderer.xr.addEventListener('sessionstart', () => {
  const s = renderer.xr.getSession();
  if (s?.supportedFrameRates?.includes(72)) void s.updateTargetFrameRate(72);
});
// keep `new WebGLRenderer({ antialias: true })`
```

**How this constrains the rest of the spec**

- **Enemy count:** wave design should assume at most about 8 grunts alive at once, 12 as a hard cap. A ranged enemy with projectiles adds 1 draw per projectile unless projectiles are instanced. Instance them.
- **Room size:** size isn't the limit; what is visible at once is. Hand-built floors should be a set of rooms with only the current and adjacent rooms visible. Fog of about 15–20 m already hides the far edge, and the dark mood supports it.
- **Lighting plan:** "torchlit dungeon" means **4 real point lights, pooled and reassigned**, plus fake torches (emissive mesh, additive glow sprite, and optionally baked vertex colours on floor and walls), hemisphere ambient, and fog. No real-time shadows; use blob shadows. Torch flicker animates `intensity`. Never add or remove lights, and never toggle `visible`, at runtime.

---

## Detailed findings

### 1. Frame budget and refresh rate

- Meta requires all Quest apps to run at a minimum of 72 fps. Quest 3 and 3S also support 90 and 120 Hz. ([Meta: Testing and performance analysis](https://developers.meta.com/horizon/documentation/unity/unity-perf/), search extract.) 72 fps is 13.9 ms per frame; 90 fps is 11.1 ms.
- The browser lets pages query and set the rate. `session.supportedFrameRates` lists the options and `session.updateTargetFrameRate()` changes the rate (Quest Browser 16.4+). ([Meta: WebXR App Framerate Control](https://developers.meta.com/horizon/documentation/web/webxr-frames/), search extract.) This is standard WebXR: `updateTargetFrameRate(rate)` rejects if `rate` is not in `supportedFrameRates`. ([W3C WebXR spec source, `index.bs` ~L635–L760, L976](https://github.com/immersive-web/webxr/blob/main/index.bs))
- Meta's page says a browser session defaults to 90 fps on Quest 2 and 72 fps on "Meta Quest". That wording predates Quest 3. A Babylon.js forum thread suggests Quest 3 defaults to 90. **Low confidence (secondary).** ([Babylon forum](https://forum.babylonjs.com/t/webxr-fps-in-playground-oculus-browser/52534)) Hence the recommendation to request 72 explicitly.
- three.js r186 `WebXRManager` has no frame-rate API; call it on the `XRSession` directly. (There is no `updateTargetFrameRate` anywhere in [r186 `src/renderers/webxr/WebXRManager.js`](https://github.com/mrdoob/three.js/blob/r186/src/renderers/webxr/WebXRManager.js).)
- Meta's WebXR workflow says any app logic taking more than 2 ms per frame should be considered for optimization. ([Meta: WebXR performance optimization workflow](https://developers.meta.com/horizon/documentation/web/webxr-perf-workflow/), search extract.)

### 2. Draw calls

- **In three.js XR, every draw happens twice.** When `camera.isArrayCamera`, `WebGLRenderer.render` loops over the XR sub-cameras and calls `renderScene` once per eye. ([r186 `WebGLRenderer.js` L1754–L1780](https://github.com/mrdoob/three.js/blob/r186/src/renderers/WebGLRenderer.js#L1754-L1780)) `renderer.info` counts every call ([`WebGLInfo.js` L20–L25](https://github.com/mrdoob/three.js/blob/r186/src/renderers/webgl/WebGLInfo.js#L20-L25)) and resets once per `render()` ([`WebGLRenderer.js` ~L1731](https://github.com/mrdoob/three.js/blob/r186/src/renderers/WebGLRenderer.js#L1731)). So `renderer.info.render.calls` in XR is **about 2× the visible object count**. Every budget in this doc is in those units.
- Meta: draw calls have a significant CPU cost (driver work per object, higher with state changes). Multiview and instancing are the main ways to cut them. ([Meta: WebXR Performance Best Practices](https://developers.meta.com/horizon/documentation/web/webxr-perf-bp/), search extract.) Meta's Flowerbed write-up says multiview "can almost halve the number of calls". ([Meta blog: Project Flowerbed](https://developers.meta.com/horizon/blog/project-flowerbed-a-webxr-case-study/), search extract.)
- Meta's native draw-call guidance per frame ([Meta: Testing and performance analysis](https://developers.meta.com/horizon/documentation/unity/unity-perf/); exact figures via a secondary transcription in [authorTom/notes-on-VR-performance](https://github.com/authorTom/notes-on-VR-performance), **lower confidence**):
  - Quest 2: 80–200 (busy simulation), 200–300 (medium), 400–600 (light)
  - Quest 1: 50–150 / 150–250 / 200–400
  - Meta's Runtime Optimizer reportedly flags frames above 300 draw calls. ([Meta: Quest Runtime Optimizer](https://developers.meta.com/horizon/documentation/unity/unity-quest-runtime-optimizer/), search extract.)
  - Meta says Quest 2 is *more* draw-call sensitive than Quest 3, but gives no Quest 3 figure. ([Meta: Device-specific optimization](https://developers.meta.com/horizon/resources/device-optimization-comparison/), search extract.) Those are native engine numbers; WebGL adds JS and ANGLE/driver overhead per call.
  - A combat game with several NPCs is "medium" to "busy" by Meta's categories.
- **Real Quest 3 browser data point:** three.js PR #34147 (Aug 2026, closed) benchmarked "a draw-call-bound scene with 600 separate meshes" on Quest 3 through `WebGPURenderer`'s WebGL backend. It got **48.0 fps** without multiview (no AA) and 49.5 fps with it; with AA, 43.5 fps without multiview and 48.3 fps with it. ([three.js PR #34147](https://github.com/mrdoob/three.js/pull/34147)) That is one synthetic scene, but it shows that about 600 objects (about 1,200 per-eye draws) is well past a 72 fps budget.
- Draw order: three.js sorts opaque objects by material, then front to back, and transparent objects back to front. ([r186 `WebGLRenderLists.js` L1–L45](https://github.com/mrdoob/three.js/blob/r186/src/renderers/webgl/WebGLRenderLists.js#L1-L45)) Sharing materials between meshes cuts state changes. Meta: redrawing the same object costs about 25% of drawing a different one. ([Meta: Draw Call Cost Analysis](https://developers.meta.com/horizon/documentation/unity/po-draw-call-analysis/), search extract.)
- **Project impact:** today each `Enemy` builds 5 meshes and its own body material ([`src/enemies/enemy.ts`](../../../src/enemies/enemy.ts)). That is 10 XR draws per grunt. The arena is about 9 meshes, the weapons about 14 and the HUD about 5, so the current scene is roughly `(9 + 14 + 5 + 5·N) × 2` draws. That is about 156 with 10 grunts, inside budget. Room geometry for multi-room floors must be merged to stay there.

### 3. Triangles

- Meta's native triangle guidance per frame: Quest 1 350k–500k, Quest 2 750k–1M. ([Meta: Unreal testing and performance analysis](https://developers.meta.com/horizon/documentation/unreal/unreal-debug-android/), via the secondary transcription in [authorTom/notes-on-VR-performance](https://github.com/authorTom/notes-on-VR-performance), **lower confidence**.) No Quest 3 figure was found.
- On Quest's tiled GPU, all vertex work runs in a binning pass before per-tile shading, so vertex count costs up front. ([Meta: Device-specific optimization](https://developers.meta.com/horizon/resources/device-optimization-comparison/), search extract.)
- `renderer.info.render.triangles` in XR counts both eyes (same loop as above).
- **Project impact:** the streamed outdoor zones, not the low-poly models, are where the triangles go: Oakvale's busiest views (the mine's front, the farm, the lumber camp) measure about 330k to 380k over both eyes. The budget was doubled to 600k per frame and 32k per full-detail chunk on 2026-10-01, ahead of any headset measurement; item 11 below is the check.

### 4. Dynamic lights and shadows

**Unshadowed point lights (torches):**

- three.js is a forward renderer. The fragment shader for every lit material (Lambert included) runs an unrolled loop over **all** point lights in the scene: `for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ )`. ([r186 `lights_fragment_begin.glsl.js` L81–L89](https://github.com/mrdoob/three.js/blob/r186/src/renderers/shaders/ShaderChunk/lights_fragment_begin.glsl.js#L81-L89); Lambert includes it at [`meshlambert.glsl.js` L108](https://github.com/mrdoob/three.js/blob/r186/src/renderers/shaders/ShaderLib/meshlambert.glsl.js#L108).)
- A light's `distance` only attenuates to zero; it does not skip the maths ([`lights_pars_begin.glsl.js` L56–L65](https://github.com/mrdoob/three.js/blob/r186/src/renderers/shaders/ShaderChunk/lights_pars_begin.glsl.js#L56-L65)). A torch in the next room still costs every pixel on screen.
- Per-pixel cost therefore grows linearly with light count, times the eye-buffer pixel count, times 2 eyes. No primary source gives a "max lights on Quest" number. **≤ 4 point lights is a rule of thumb**, matching what the arena runs today.
- **Changing the number of lights recompiles shaders.** `numPointLights` is part of the program cache key ([`WebGLPrograms.js` L478](https://github.com/mrdoob/three.js/blob/r186/src/renderers/webgl/WebGLPrograms.js#L478)). A light with `visible === false` is skipped in `projectObject` and so drops out of the count ([`WebGLRenderer.js` L1862](https://github.com/mrdoob/three.js/blob/r186/src/renderers/WebGLRenderer.js#L1862)). Toggling or adding torches mid-game therefore triggers a recompile hitch. Animate `intensity` instead, and keep a fixed pool.

**Shadows:**

- Meta: rendering a shadow map counts against the scene's draw-call and triangle budget. Shadow-casting point lights are "particularly problematic because they usually have 6 shadow maps that need to be rendered each frame." ([Meta: WebXR Performance Best Practices](https://developers.meta.com/horizon/documentation/web/webxr-perf-bp/), search extract.)
- three.js confirms it: a point light's shadow renders 6 cube faces, each a full scene pass ([r186 `WebGLShadowMap.js` L289](https://github.com/mrdoob/three.js/blob/r186/src/renderers/webgl/WebGLShadowMap.js#L289)). The shadow pass runs once per frame, not per eye ([`WebGLRenderer.js` L1737](https://github.com/mrdoob/three.js/blob/r186/src/renderers/WebGLRenderer.js#L1737)). Four shadowed torches would add about 24 scene passes per frame.
- `renderer.shadowMap.autoUpdate = false` plus `needsUpdate = true` renders shadows once, for static scenes ([`WebGLShadowMap.js` L86–L95](https://github.com/mrdoob/three.js/blob/r186/src/renderers/webgl/WebGLShadowMap.js#L86-L95)). That does not help moving enemies. Also, `PCFSoftShadowMap` is removed in r186 and falls back to PCF ([L99–L101](https://github.com/mrdoob/three.js/blob/r186/src/renderers/webgl/WebGLShadowMap.js#L99-L101)).
- Meta's own three.js sample Project Flowerbed uses one directional light plus a hemisphere light, a 512 px shadow map, shadows **off** by default in its performance UI, and shadow auto-update turned off after load. ([meta-quest/ProjectFlowerbed: `VRPerformanceUI.js`](https://github.com/meta-quest/ProjectFlowerbed/blob/main/src/js/lib/VRPerformanceUI.js), [`PerformanceOptionsSystem.js`](https://github.com/meta-quest/ProjectFlowerbed/blob/main/src/js/systems/performance/PerformanceOptionsSystem.js), [`SceneLightingComponent.js`](https://github.com/meta-quest/ProjectFlowerbed/blob/main/src/js/components/SceneLightingComponent.js))

### 5. Fixed foveation, framebuffer scale, MSAA, multiview

**Fixed foveated rendering (FFR)**

- Quest's FFR renders the edges of the eye buffers at lower resolution. Meta says it "can significantly improve performance", with visual impact often "nearly imperceptible". ([Meta: WebXR Fixed Foveated Rendering](https://developers.meta.com/horizon/documentation/web/webxr-ffr/), search extract.)
- Spec: `XRWebGLLayer.fixedFoveation` and `XRProjectionLayer.fixedFoveation` take 0–1, where 0 is the least foveation and 1 the most. The value is interpreted by the user agent, `null` means unsupported (setting it is then a no-op), and changes take effect on the next frame. ([WebXR `index.bs` L2310](https://github.com/immersive-web/webxr/blob/main/index.bs), [Layers `webxrlayers-1.bs` L508–L529](https://github.com/immersive-web/layers/blob/main/webxrlayers-1.bs).) A new projection layer starts at `0` ([Layers L1482](https://github.com/immersive-web/layers/blob/main/webxrlayers-1.bs)).
- three.js defaults foveation to **1.0 (maximum)** and applies it when the session starts ([r186 `WebXRManager.js` L46–L47, L523](https://github.com/mrdoob/three.js/blob/r186/src/renderers/webxr/WebXRManager.js#L46-L47)). `setFoveation()` can be called at any time ([L877+](https://github.com/mrdoob/three.js/blob/r186/src/renderers/webxr/WebXRManager.js#L877)). The game therefore already runs at maximum foveation, implicitly. The recommendation is only to make that explicit.

**Framebuffer scale**

- Meta: in three.js use `setFramebufferScaleFactor`. A value of 0.8–0.9 gives "a substantial reduction in fragments", at some loss of sharpness. ([Meta: WebXR performance optimization workflow](https://developers.meta.com/horizon/documentation/web/webxr-perf-workflow/), search extract.)
- Spec: the scale applies to width and height separately, so 0.85 means about 72% of the pixels. Scale 1.0 is the UA's *recommended* resolution, which may be smaller than native. ([WebXR `index.bs` L2357–L2359](https://github.com/immersive-web/webxr/blob/main/index.bs))
- Quest 3's eye buffer is 2064 × 2208 per eye. ([Meta: Compare devices](https://developers.meta.com/horizon/resources/compare-devices/), search extract.) What the browser actually allocates at scale 1.0 is not documented; see uncertainties.
- three.js: the default is 1.0, and it **cannot be changed while presenting** (it only warns) ([`WebXRManager.js` L42, L289–L298](https://github.com/mrdoob/three.js/blob/r186/src/renderers/webxr/WebXRManager.js#L289-L298)). A dynamic-resolution scheme would need a session restart. In practice, pick one value up front.

**MSAA**

- On a browser with WebXR Layers, three.js renders into a projection layer with `samples: 4` when `antialias` is true ([`WebXRManager.js` L439, L512](https://github.com/mrdoob/three.js/blob/r186/src/renderers/webxr/WebXRManager.js#L439)). It uses `WEBGL_multisampled_render_to_texture` when available, which resolves on-tile ([`WebGLTextures.js` L2410–L2414](https://github.com/mrdoob/three.js/blob/r186/src/renderers/webgl/WebGLTextures.js#L2410-L2414)). `VRButton` requests `layers` as an optional feature ([`examples/jsm/webxr/VRButton.js` L70–L74](https://github.com/mrdoob/three.js/blob/r186/examples/jsm/webxr/VRButton.js#L70-L74)).
- Meta (native): 4× MSAA adds about 10–15% or 0.5–1.5 ms on a medium app. "You should almost always use MSAA", but not above 4×. ([Meta: MSAA Analysis](https://developers.meta.com/horizon/documentation/native/android/mobile-msaa-analysis/), search extract.) The Quest 3 browser benchmark in PR #34147 measured AA costing about 9% fps without multiview ([PR #34147](https://github.com/mrdoob/three.js/pull/34147)).

**Multiview (render both eyes in one draw)**

- `OVR_multiview2` renders into a 2D texture array, one layer per view, and needs WebGL 2 ([Khronos WebGL `OVR_multiview2/extension.xml`](https://github.com/KhronosGroup/WebGL/blob/main/extensions/OVR_multiview2/extension.xml)).
- Meta's docs say the Quest browser exposes `OCULUS_multiview` (with MSAA) by default and `OVR_multiview2` behind a flag. ([Meta: Multiview WebGL Rendering](https://developers.meta.com/horizon/documentation/web/web-multiview/), search extract.) A Meta browser engineer said in Aug 2026 that `OCULUS_multiview` "is just the legacy name for `OVR_multiview2`", and multiview through three.js was shown working on Quest 3 ([PR #34147](https://github.com/mrdoob/three.js/pull/34147)). The Meta page is probably out of date. **Medium confidence.**
- **three.js `WebGLRenderer` (what this project uses) has no multiview in r186.** There is no multiview code under `src/renderers/WebGLRenderer.js`, `webgl/` or `webxr/`. The old implementation was removed in 2020 ([PR #18750](https://github.com/mrdoob/three.js/pull/18750)). Later attempts were closed unmerged because camera-space lighting needs per-view light data ([PR #25981](https://github.com/mrdoob/three.js/pull/25981), [PR #27453](https://github.com/mrdoob/three.js/pull/27453)).
- Multiview exists only in **`WebGPURenderer`**, added in r176 ([PR #30920](https://github.com/mrdoob/three.js/pull/30920)), via `new WebGPURenderer({ forceWebGL: true, multiview: true })` ([r186 `Renderer.js` L72](https://github.com/mrdoob/three.js/blob/r186/src/renderers/common/Renderer.js#L72); [`common/XRManager.js` L1253–L1256](https://github.com/mrdoob/three.js/blob/r186/src/renderers/common/XRManager.js#L1253-L1256); example [`webgpu_xr_native_layers.html`](https://github.com/mrdoob/three.js/blob/r186/examples/webgpu_xr_native_layers.html)). The native WebGPU XR path disables multiview with a warning ([`XRManager.js` L787–L793](https://github.com/mrdoob/three.js/blob/r186/src/renderers/common/XRManager.js#L787-L793)), so `forceWebGL` is required. Quest Browser only added experimental WebGPU in April 2026. ([Meta: Browser release notes](https://developers.meta.com/horizon/release-notes/web/), search extract.)
- Measured gain on Quest 3 was small in a synthetic 600-mesh scene: +3% fps without AA, +11% with AA ([PR #34147](https://github.com/mrdoob/three.js/pull/34147)). Meta's Flowerbed (a three.js fork with multiview) reported a solid 72 fps at CPU level 2 with multiview, against about 60 fps at CPU level 4 without ([PR #25981 discussion](https://github.com/mrdoob/three.js/pull/25981)).
- **Project impact:** moving to `WebGPURenderer` means node materials, new code paths and less-travelled XR support. It isn't worth it for the slice. Keep the draw budget above instead.

### 6. Transparent and additive particles

- Meta: transparent geometry is drawn back to front and is subject to overdraw. Avoid overlapping alpha-blended geometry such as dense particle effects. The most common cause of being fragment-bound is "large transparent objects that overlap each other and end up touching the same pixels many times". Blending in linear colour space costs extra. ([Meta: Android/mobile performance intro](https://developers.meta.com/horizon/documentation/unity/unity-mobile-performance-intro/), [Meta blog: Common Rendering Mistakes](https://developers.meta.com/horizon/blog/common-rendering-mistakes-how-to-find-them-and-how-to-fix-them/), search extracts.)
- Meta: `discard` in a fragment shader is costly on the tiled GPU. ([Meta: Mobile GPUs and improved algorithms](https://developers.meta.com/horizon/documentation/unity/gpu-improved-algorithms/), search extract.) Prefer blended quads to alpha-tested cut-outs (`alphaTest`) for effects.
- three.js: each `Points` / `InstancedMesh` is 1 draw per eye regardless of count. Transparent objects sort back to front after opaques ([`WebGLRenderLists.js` L31–L45](https://github.com/mrdoob/three.js/blob/r186/src/renderers/webgl/WebGLRenderLists.js#L31-L45)).
- **Project impact:** the cost of effects is the fraction of the screen they cover times their layers, doubled for two eyes. Hit sparks, torch embers and the War Cry shockwave are fine if they are small or brief. The risky ones are a full-view hurt flash, big smoke or fog sprites, and a shockwave ring that fills the view. Today's shockwave is a `transparent`, `DoubleSide` mesh ([`src/fx/shockwave.ts`](../../../src/fx/shockwave.ts)); keep it thin.

### 7. Quest-browser pitfalls

- **Memory.** Quest shares RAM between CPU and GPU. Meta gives low-memory-killer PSS limits of 4.4 GiB (Quest 2 / Pro) and 5.75 GiB (Quest 3 / 3S) for native apps. ([Meta: Memory / RAM](https://developers.meta.com/horizon/documentation/unity/po-memory-ram/), [Meta blog: Meta Quest Memory Usage](https://developers.meta.com/horizon/blog/getting-a-handle-on-meta-quest-memory-usage/), search extracts.) The page's share of the browser's budget is **not documented**.
  - Uncompressed textures cost width × height × 4 bytes, plus about 33% for mipmaps. Meta recommends KTX2/Basis so textures stay compressed on the GPU. ([Meta: WebXR Performance Best Practices](https://developers.meta.com/horizon/documentation/web/webxr-perf-bp/), search extract.)
  - Today's 32×32 procedural textures ([`src/world/pixelTexture.ts`](../../../src/world/pixelTexture.ts)) are about 5 KB each, which is negligible.
  - The real risk is leaks between floors: three.js only frees GPU memory on `.dispose()`. Track this with `renderer.info.memory.{geometries,textures}` ([`WebGLInfo.js` L5–L7](https://github.com/mrdoob/three.js/blob/r186/src/renderers/webgl/WebGLInfo.js#L5-L7)).
- **Shader-compile hitches.** New material and light combinations compile on first draw. `renderer.compileAsync()` precompiles and uses `KHR_parallel_shader_compile` when present ([`WebGLRenderer.js` L1506–L1555](https://github.com/mrdoob/three.js/blob/r186/src/renderers/WebGLRenderer.js#L1506-L1555)). Combined with the light-count rule above, this avoids mid-combat stalls.
- **Framebuffer scale is fixed for the session** in three.js (§5).
- **`renderer.info` semantics in XR:** counts are for both eyes. Read them after `renderer.render()` in the loop, because `autoReset` clears them each render (§2).
- **`setPixelRatio` is irrelevant in VR.** three.js forces pixel ratio 1 and sizes to the XR layer ([`WebXRManager.js` L455, L500](https://github.com/mrdoob/three.js/blob/r186/src/renderers/webxr/WebXRManager.js)). The `Math.min(devicePixelRatio, 2)` in `main.ts` only affects the desktop preview.
- **Thermal throttling and CPU/GPU levels.** The OS scales clocks. OVR Metrics reports CPU and GPU level and throttling; a high CPU level with a low GPU level means CPU-bound. ([Meta: OVR Metrics Tool](https://developers.meta.com/horizon/documentation/unity/ts-ovrmetricstool/), [Meta blog: OVR Metrics + VrApi metrics](https://developers.meta.com/horizon/blog/ovr-metrics-tool-vrapi-what-do-these-metrics-mean/), search extracts.)

---

## Open uncertainties (settle on the headset)

Measure these on a real Quest 3. Tools:

- **OVR Metrics Tool**: in-headset HUD plus CSV of FPS, stale frames, App GPU time, GPU utilization, CPU and GPU level, and throttling. ([Meta](https://developers.meta.com/horizon/documentation/unity/ts-ovrmetricstool/))
- **Chrome remote debugging**: `chrome://inspect#devices`, then "trace" next to `com.oculus.browser`, to see JS frame time.
- **RenderDoc (Meta fork) or ovrgpuprofiler**, to tell vertex-bound from fragment-bound and see tile passes.

These three are listed on [Meta: WebXR Performance Tools](https://developers.meta.com/horizon/documentation/web/webxr-perf-tools/) (search extract).

A cheap in-game aid for the build ticket: a `?perf` URL flag that prints `renderer.info.render.calls`, `triangles`, `memory` and a rolling frame time onto the belt HUD.

| # | Question | How to measure |
|---|---|---|
| 1 | What does the Quest 3 browser allocate at framebuffer scale 1.0? Is it native 2064×2208 or less? | On `sessionstart`, log `renderer.xr.getBaseLayer().textureWidth/Height` (projection layer) or `.framebufferWidth/Height` (`XRWebGLLayer`). |
| 2 | What is the default frame rate, and which rates are offered? | Log `session.frameRate` and `session.supportedFrameRates`. Confirm the OVR Metrics FPS line matches after `updateTargetFrameRate(72)`. |
| 3 | Where is the real draw-call ceiling at 72 fps for this game? | Stress flag: spawn N grunts (4, 8, 12, 16, 24). Record `renderer.info.render.calls`, FPS, stale frames, CPU level and GPU level. If the CPU level climbs first, draw calls are the limit. |
| 4 | What does each point light cost? | Same scene with 0, 4 and 8 point lights. Compare App GPU time in OVR Metrics, keeping the light count fixed within each run. |
| 5 | Does foveation 1 look acceptable with NearestFilter pixel textures? FFR can shimmer at the edges. | A/B `setFoveation(0)` against `setFoveation(1)` and look at the periphery. Check `getBaseLayer().fixedFoveation` is non-null, which confirms it is supported. |
| 6 | What does MSAA cost here? | Two builds, `antialias: true` and `false`. Compare App GPU time. |
| 7 | Is `OVR_multiview2` exposed without flags today? This is only relevant if item 3 shows the game is CPU-bound. | `renderer.getContext().getExtension('OVR_multiview2')` and `'OCULUS_multiview'`. |
| 8 | Does performance hold over a 10–15 minute session, or does thermal throttling appear? | Record an OVR Metrics CSV for a full run and check throttling and levels over time. |
| 9 | How much memory is left for the page? | Watch `renderer.info.memory` across floor changes for leaks. Use `chrome://inspect` memory tools. Note any browser tab reloads or crashes. |
| 10 | Do the additive effects blow the fragment budget up close? | Trigger War Cry with the shockwave filling the view, and sparks at face height. Watch App GPU time spike. |
| 11 | Does the doubled triangle budget (600k over both eyes) hold 72 fps? | `?perf` on the Quest at Oakvale's mine front, the busiest view measured (about 354k), looking each way. If it drops below 72 fps, lower `CONFIG.streaming.budget` and make the cuts in Oakvale ticket 39. |
