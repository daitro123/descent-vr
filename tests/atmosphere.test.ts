import { describe, expect, it } from 'vitest';
import { type Atmosphere, blendAtmospheres } from '../src/world/atmosphere';

// Two made-up zones: a black night and a white noon, so the blend's middle is
// easy to read. Colours mix as light does (in linear space), so halfway from
// black to white is 0xbcbcbc on screen, not 0x808080.
const night: Atmosphere = {
  background: 0x000000,
  fog: { color: 0x000000, near: 10, far: 50 },
  sky: { zenith: 0x000000, horizon: 0x000000, haze: 0x000000, sun: 0x000000 },
  sun: { color: 0x000000, intensity: 0 },
  hemisphere: { sky: 0x000000, ground: 0x000000, intensity: 1 },
  farPlane: 60,
  flames: [{ x: 1, y: 2, z: 3 }],
};
const noon: Atmosphere = {
  background: 0xffffff,
  fog: { color: 0xffffff, near: 30, far: 250 },
  sky: { zenith: 0xffffff, horizon: 0xffffff, haze: 0xffffff, sun: 0xffffff },
  sun: { color: 0xffffff, intensity: 2 },
  hemisphere: { sky: 0xffffff, ground: 0xffffff, intensity: 3 },
  farPlane: 300,
  flames: [],
};

describe('blending two atmospheres', () => {
  it('is the first at weight 0 and the second at weight 1', () => {
    expect(blendAtmospheres(night, noon, 0)).toEqual(night);
    expect(blendAtmospheres(night, noon, 1)).toEqual(noon);
  });

  it('mixes colours as light and numbers linearly in between', () => {
    const half = blendAtmospheres(night, noon, 0.5);
    expect(half.fog).toEqual({ color: 0xbcbcbc, near: 20, far: 150 });
    expect(half.background).toBe(0xbcbcbc);
    expect(half.sky.zenith).toBe(0xbcbcbc);
    expect(half.sun).toEqual({ color: 0xbcbcbc, intensity: 1 });
    expect(half.hemisphere).toEqual({ sky: 0xbcbcbc, ground: 0xbcbcbc, intensity: 2 });
    expect(half.farPlane).toBe(180);
    const quarter = blendAtmospheres(night, noon, 0.25);
    expect(quarter.fog.near).toBe(15);
    expect(quarter.sun.intensity).toBe(0.5);
  });

  it('takes the flames of whichever side weighs more', () => {
    expect(blendAtmospheres(night, noon, 0.4).flames).toEqual(night.flames);
    expect(blendAtmospheres(night, noon, 0.6).flames).toEqual([]);
  });

  it('holds at the ends past 0 and 1', () => {
    expect(blendAtmospheres(night, noon, -0.5)).toEqual(night);
    expect(blendAtmospheres(night, noon, 1.5)).toEqual(noon);
  });
});
