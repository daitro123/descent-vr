# Technology research: browser VR action RPG

_September 2026. Goal: a Diablo-like VR game that runs in the browser. Current phase: white-box warrior melee combat._

## Recommendation

**Three.js + WebXR, TypeScript, Vite.** For headset-free development, use Meta's **IWER** emulator. No physics engine yet.

- Melee feel is the thing we are testing, and no framework gives us that for free. Blade sweep tests, speed-gated damage, shield blocks, hit-stop, haptics and telegraphs are all custom game code, so the framework only has to render, track controllers and stay out of the way. Three.js does that with about 150 KB gzipped.
- Three.js has the biggest ecosystem (loaders, examples, pmndrs libraries). If we later adopt Meta's IWSDK, we keep all our code, because IWSDK is built on Three.js.
- IWER emulates a Quest 3 inside a desktop browser, with a DevUI for moving the head and controllers. It also lets us script controller poses, which is how the combat smoke test in this repo drives sword swings and shield blocks with no headset.

## Options considered

| Option | What it is | Fit for this project |
|---|---|---|
| **Three.js + WebXR** ✅ | Renderer with WebXR in core | Full control and a small bundle. We write locomotion and interaction ourselves: about 100 lines for stick move and snap turn. |
| **Meta Immersive Web SDK (IWSDK)** `@iwsdk/core` 0.5.x | Three.js + ECS (elics), Havok physics, grab and locomotion systems, spatial UI, IWER built in, AI-agent tooling | **The main alternative.** It is batteries-included and aimed squarely at Quest. It is still 0.x, so expect API churn, and it is opinionated (ECS, its own project layout). Its grab and locomotion systems don't help with melee. Re-evaluate once the combat loop is proven. Porting is realistic because both use Three.js. |
| **Babylon.js** 9.x | Full engine with the most complete built-in WebXR (teleport, hand tracking, Havok, GUI) | Strong if we want an engine rather than a renderer. The bundle is larger (about 1 MB), and the engine's conventions replace ours. A reasonable second choice. |
| **React Three Fiber + @react-three/xr** 6.x | Declarative React wrapper over Three.js | Great for apps and configurators. A game loop full of mutable per-frame state fights React's model. Not recommended here. |
| **Wonderland Engine** | WebXR-specialised editor and WASM runtime | Very good Quest performance. It has its own editor and licence terms (check them before committing). Worth a look if rendering performance becomes the bottleneck. |
| **PlayCanvas** | Open-source engine with a cloud editor | Solid WebXR support. Its editor-centric workflow suits a team with artists more than a code-first prototype. |
| **Needle Engine** | Unity or Blender scenes exported to a Three.js runtime | Good if we want to build levels in the Unity editor. It adds a toolchain and commercial licensing. |
| **Godot 4 / Unity → web** | Native engines with a WebGL/WebXR export | Heavy downloads, slow first load on Quest, and web export caveats (Godot: no C# on web, needs cross-origin isolation headers). Browser-first is not their strength. |

## Libraries to consider as the game grows

- **Physics:** start with Rapier (`@dimforge/rapier3d-compat`, a small, fast WASM build). Add it when we need ragdolls, physical props or a sword that stops on armour. Havok (`@babylonjs/havok`, used by IWSDK) is an alternative.
- **Raycasts against level meshes:** `three-mesh-bvh`.
- **Enemy pathfinding in dungeons:** `recast-navigation` (a JS/WASM port of Recast/Detour navmeshes).
- **In-world UI:** `@pmndrs/uikit` (IWSDK uses it too). A canvas texture is enough for now.
- **Hand tracking:** built into Three.js (`XRHandModelFactory`). Controllers are better for melee (haptics, grip), so hand tracking is optional.

## Art direction: "pixel" in VR

What works:

- **Low-poly meshes with low-resolution textures magnified with `NearestFilter`.** Texels stay crisp up close. Use mipmaps for minification, or distant textures shimmer badly in a headset. This repo's procedural floor and wall textures already work this way.
- **Consistent texel density,** for example 32 px per metre, so everything reads as one pixel grid.
- **Flat or vertex lighting** and a limited palette.

What does **not** work:

- **Rendering the frame at low resolution and upscaling** (the classic "pixelated 3D" trick). The headset compositor upsamples linearly, so the image just looks blurry. Per-eye low-resolution rendering also shimmers with head motion and is uncomfortable.
- **Flat 2D sprites for characters (Doom-style billboards).** They look like cardboard in stereo. Low-poly figures with pixel textures read better.

Tools:

- **[Blockbench](https://www.blockbench.net/)** (free): low-poly models with pixel-art textures painted in place. It exports glTF, which Three.js loads directly. **Best fit.**
- **MagicaVoxel** (free): the voxel look. Three.js has a `VOXLoader`, or export OBJ/glTF.
- **Aseprite** (paid) or **Pixelorama** (free): textures, UI and effect sprites.

## Design notes from the white box

- **Perspective.** Diablo is isometric. In VR we chose first person because the goal is hand-driven melee. The other VR take on Diablo is a tabletop diorama (Demeo-style, where you look down on a miniature dungeon). That is a different game and could be prototyped later, but it throws away physical combat.
- **Melee model.** We use speed-gated contact: damage only counts above a tip speed and scales with it, and a per-enemy cooldown means one swing lands one hit. That keeps the game arcadey and Diablo-like, and it needs no physics engine. The alternative is fully physics-driven weapons (Blade & Sorcery, Boneworks). That model is heavier and more "sim", and it would need Rapier or Havok.
- **Defence.** Enemies telegraph by glowing (orange for blockable, red for unblockable) and by a wind-up pose that shows where the blow will come from. The player can interrupt with a hit or a shield bash, block with the shield or the sword, step out of reach, or duck a horizontal slash. Enemy blows are physical. Each frame of a swing, the enemy's actual weapon segment (from its animated skeleton) is swept against the shield's box (enlarged slightly for forgiveness), the player's blade, and a head sphere with a torso capsule under the headset. The first contact decides the outcome. Pushing the shield or sword into the blow at impact turns a block into a parry. The first white box used a simpler line from the enemy's shoulder to the player's chest. The sweep makes shield placement matter, so a slash from the left needs a block on the left.
- **Models.** Characters are procedural low-poly models built in code (`src/models/`): primitives with per-face vertex colours and a shared 32×32 grain texture, merged into one mesh and rigidly skinned to a 14-bone humanoid skeleton. A fully animated enemy is one draw call, which keeps the Quest draw-call budget for crowds and effects. The same rig and pose system can drive Blockbench glTF models later.

## Sources

- [Immersive Web SDK overview (Meta)](https://developers.meta.com/horizon/documentation/iwsdk/guides/overview/)
- [facebook/immersive-web-sdk on GitHub](https://github.com/facebook/immersive-web-sdk)
- [Meet Immersive Web SDK (Meta blog)](https://developers.meta.com/horizon/blog/immersive-web-sdk-new-era-spatial-web-development/)
- [Immersive Web Emulation Runtime (IWER)](https://github.com/meta-quest/immersive-web-emulation-runtime)
- [Needle vs Babylon vs R3F comparison](https://cloud.needle.tools/compare/needle-vs-babylon-vs-r3f)
- [Three.js vs R3F vs Babylon.js 2026 (PkgPulse)](https://www.pkgpulse.com/guides/threejs-vs-react-three-fiber-vs-babylonjs-3d-webgl-2026)
- [awesome-webxr-development (Pico)](https://github.com/Pico-Developer/awesome-webxr-development)
