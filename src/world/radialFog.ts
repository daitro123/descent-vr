import { ShaderChunk } from 'three';

// three.js fogs by depth along the view axis, so a hill at the edge of view is
// clearer than the same hill straight ahead, and its fog shifts as you turn
// your head: in a headset you notice. Fogging by distance instead fixes it.
// Every fogged material (the shared model material, the water, the arena's
// walls) reads this one chunk, so they all agree and no new program appears.

const RADIAL = '#ifdef USE_FOG\n\tvFogDepth = length( mvPosition.xyz );\n#endif';

/** Fog by distance from the eye. Call once at startup, before anything renders: compiled programs keep the old chunk. */
export function useRadialFog(): void {
  ShaderChunk.fog_vertex = RADIAL;
}
