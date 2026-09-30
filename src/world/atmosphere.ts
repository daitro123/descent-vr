import { Color } from 'three';

// How a place looks under the World's one sun: its fog, sky and light. Each
// zone brings one (and later each interior). The World applies it by changing
// values only, never by adding a light or swapping a material, so moving
// between places never compiles a shader.

export interface Atmosphere {
  /** Behind everything, where the sky dome doesn't reach. */
  readonly background: number;
  /** Radial distance fog (see world/radialFog.ts). */
  readonly fog: { readonly color: number; readonly near: number; readonly far: number };
  /** The sky dome's colours, from straight up down to the haze band at the horizon, and the sun's disc. */
  readonly sky: { readonly zenith: number; readonly horizon: number; readonly haze: number; readonly sun: number };
  readonly sun: { readonly color: number; readonly intensity: number };
  readonly hemisphere: { readonly sky: number; readonly ground: number; readonly intensity: number };
  /** Camera far plane, metres. */
  readonly farPlane: number;
  /** Flames the pool of point lights may sit on. None outdoors, where glows fake every flame. */
  readonly flames: readonly { readonly x: number; readonly y: number; readonly z: number }[];
}

const _a = new Color();
const _b = new Color();

/** Mix two colours as light mixes (in linear space), back to a hex colour. */
function mix(a: number, b: number, t: number): number {
  return _a.setHex(a).lerp(_b.setHex(b), t).getHex();
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** An atmosphere to write into: its values, not its lists of flames. */
type Writable<T> = { -readonly [K in keyof T]: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? Writable<T[K]> : T[K] };

/**
 * `a` blended towards `b` by `t` (0 is all `a`, 1 all `b`): across a seam by
 * where you stand, or over a moment at an interior's door. Flames can't be
 * half there, so they come from whichever side weighs more. Written into
 * `into` if given (reused frame after frame, so walking over a seam makes no
 * garbage), else a new one.
 */
export function blendAtmospheres(a: Atmosphere, b: Atmosphere, t: number, into?: Atmosphere): Atmosphere {
  if (t <= 0) return a;
  if (t >= 1) return b;
  if (into) {
    const o = into as Writable<Atmosphere>;
    o.background = mix(a.background, b.background, t);
    o.fog.color = mix(a.fog.color, b.fog.color, t);
    o.fog.near = lerp(a.fog.near, b.fog.near, t);
    o.fog.far = lerp(a.fog.far, b.fog.far, t);
    for (const k of ['zenith', 'horizon', 'haze', 'sun'] as const) o.sky[k] = mix(a.sky[k], b.sky[k], t);
    o.sun.color = mix(a.sun.color, b.sun.color, t);
    o.sun.intensity = lerp(a.sun.intensity, b.sun.intensity, t);
    o.hemisphere.sky = mix(a.hemisphere.sky, b.hemisphere.sky, t);
    o.hemisphere.ground = mix(a.hemisphere.ground, b.hemisphere.ground, t);
    o.hemisphere.intensity = lerp(a.hemisphere.intensity, b.hemisphere.intensity, t);
    o.farPlane = lerp(a.farPlane, b.farPlane, t);
    o.flames = t < 0.5 ? a.flames : b.flames;
    return into;
  }
  return {
    background: mix(a.background, b.background, t),
    fog: { color: mix(a.fog.color, b.fog.color, t), near: lerp(a.fog.near, b.fog.near, t), far: lerp(a.fog.far, b.fog.far, t) },
    sky: {
      zenith: mix(a.sky.zenith, b.sky.zenith, t),
      horizon: mix(a.sky.horizon, b.sky.horizon, t),
      haze: mix(a.sky.haze, b.sky.haze, t),
      sun: mix(a.sky.sun, b.sky.sun, t),
    },
    sun: { color: mix(a.sun.color, b.sun.color, t), intensity: lerp(a.sun.intensity, b.sun.intensity, t) },
    hemisphere: {
      sky: mix(a.hemisphere.sky, b.hemisphere.sky, t),
      ground: mix(a.hemisphere.ground, b.hemisphere.ground, t),
      intensity: lerp(a.hemisphere.intensity, b.hemisphere.intensity, t),
    },
    farPlane: lerp(a.farPlane, b.farPlane, t),
    flames: t < 0.5 ? a.flames : b.flames,
  };
}
