import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { buildLayout, type ForestLayout } from '../src/maps/forest/layout';
import { mulberry32 } from '../src/maps/forest/noise';
import { type AmbientSource, BirdSong, chooseAmbient, type PlaceId, TreeCover } from '../src/world/ambience';

// Which ambient sounds play and which are placed by HRTF (spec, "Sound"): at
// most 8 of the places' sounds and bird calls at once, nearest first, none
// beyond 40 m; the nearest 3 places' sounds by HRTF, the rest and every bird
// panned cheaply. And birdsong: from the trees 10 to 30 m off, fewer where
// the plan has few trees.

const { most, hrtf, reach } = CONFIG.sound.ambient;

const place = (x: number, z: number): AmbientSource => ({ x, z, place: true });
const bird = (x: number, z: number): AmbientSource => ({ x, z, place: false });

describe('choosing the ambient sounds', () => {
  it("uses the spec's numbers", () => {
    expect({ most, hrtf, reach }).toEqual({ most: 8, hrtf: 3, reach: 40 });
    expect({ near: CONFIG.sound.birds.near, far: CONFIG.sound.birds.far }).toEqual({ near: 10, far: 30 });
  });

  it('plays none beyond 40 m, and one just inside it', () => {
    expect(chooseAmbient(0, 0, [place(40.5, 0), bird(0, -41)])).toEqual(['off', 'off']);
    expect(chooseAmbient(0, 0, [place(0, 39.5)])).toEqual(['hrtf']);
    // Measured on the floor plane from where you stand.
    expect(chooseAmbient(10, 10, [place(10, 50.5), place(10, 49.5)])).toEqual(['off', 'hrtf']);
  });

  it('plays at most 8, the nearest first', () => {
    // Twelve places in a line, shuffled: the 8 nearest play.
    const d = [12, 3, 30, 7, 25, 1, 18, 9, 35, 5, 22, 14];
    const out = chooseAmbient(0, 0, d.map((x) => place(x, 0)));
    const on = d.filter((_, i) => out[i] !== 'off').sort((a, b) => a - b);
    expect(on).toEqual([1, 3, 5, 7, 9, 12, 14, 18]);
    expect(out.filter((v) => v !== 'off')).toHaveLength(most);
  });

  it('places the nearest 3 places by HRTF, and pans the rest cheaply', () => {
    const out = chooseAmbient(0, 0, [place(20, 0), place(0, 4), place(-8, 0), place(0, -2), place(6, 6)]);
    expect(out).toEqual(['cheap', 'hrtf', 'hrtf', 'hrtf', 'cheap']);
  });

  it('pans every bird cheaply, and a nearer bird takes a slot but not an HRTF one', () => {
    const out = chooseAmbient(0, 0, [bird(1, 0), place(10, 0), bird(2, 0), place(11, 0), place(12, 0), place(13, 0)]);
    expect(out).toEqual(['cheap', 'hrtf', 'cheap', 'hrtf', 'hrtf', 'cheap']);
  });

  it('drops a far place for nearer birds when 8 are chosen', () => {
    const sources = [place(30, 0), ...Array.from({ length: 8 }, (_, i) => bird(10 + i, 0))];
    const out = chooseAmbient(0, 0, sources);
    expect(out[0]).toBe('off');
    expect(out.filter((v) => v === 'cheap')).toHaveLength(8);
  });

  it('writes into the array it is given, sized to the sources', () => {
    const out = ['hrtf', 'hrtf', 'hrtf'] as ('off' | 'cheap' | 'hrtf')[];
    expect(chooseAmbient(0, 0, [place(50, 0)], out)).toBe(out);
    expect(out).toEqual(['off']);
  });
});

describe("Oakvale's ambience", () => {
  let layout: ForestLayout;
  beforeAll(() => {
    layout = buildLayout();
  });
  const sounds = () => layout.sounds.map(({ x, z }) => place(x, z));
  const at = (id: PlaceId) => layout.sounds.find((s) => s.id === id)!;

  it('has every place the ticket names, each sounding where it is', () => {
    expect(layout.sounds.map((s) => s.id).sort()).toEqual(['anvil', 'campfire', 'dock', 'forge', 'hearth', 'mineMouth', 'stream', 'windmill']);
    expect(Math.hypot(at('stream').x - layout.bridge.x, at('stream').z - layout.bridge.z)).toBeLessThan(0.01);
    const fire = layout.structures.find((s) => s.kind === 'campfire')!;
    expect(Math.hypot(at('campfire').x - fire.x, at('campfire').z - fire.z)).toBeLessThan(0.01);
    const smith = layout.villagers.find((v) => v.id === 'smith')!;
    expect(Math.hypot(at('anvil').x - smith.x, at('anvil').z - smith.z)).toBeLessThan(1.5);
    expect(at('hearth').interior).toBe('inn');
  });

  it('under the bridge, the stream is placed by HRTF', () => {
    const { x, z } = layout.bridge;
    const out = chooseAmbient(x + 2, z, sounds());
    expect(out[layout.sounds.indexOf(at('stream'))]).toBe('hrtf');
    expect(out[layout.sounds.indexOf(at('windmill'))]).toBe('off');
  });

  it('at the smithy, the forge, the anvil and the hearth are the three placed by HRTF', () => {
    const out = chooseAmbient(at('anvil').x, at('anvil').z + 3, sounds());
    const placed = layout.sounds.filter((_, i) => out[i] === 'hrtf').map((s) => s.id).sort();
    expect(placed).toEqual(['anvil', 'forge', 'hearth']);
  });

  it('walking the main road from the crossroads to the bridge, never more than 8 play or 3 by HRTF', () => {
    const { bridge } = layout;
    for (let t = 0; t <= 1; t += 0.02) {
      const out = chooseAmbient(bridge.x * t, bridge.z * t, [...sounds(), ...Array.from({ length: 6 }, (_, i) => bird(bridge.x * t + 12 + i, bridge.z * t))]);
      expect(out.filter((v) => v !== 'off').length).toBeLessThanOrEqual(most);
      expect(out.filter((v) => v === 'hrtf').length).toBeLessThanOrEqual(hrtf);
    }
  });

  it('birds call from a tree 10 to 30 m off, up in it', () => {
    const cover = new TreeCover(layout.trees);
    const song = new BirdSong(cover, mulberry32(7));
    const from = { x: -30, z: -55 }; // in the woods between the lumber camp and the mine
    let calls = 0;
    for (let t = 0; t < 300; t += 1 / 30) {
      const call = song.update(1 / 30, from.x, from.z);
      if (!call) continue;
      calls++;
      const d = Math.hypot(call.x - from.x, call.z - from.z);
      expect(d).toBeGreaterThanOrEqual(10);
      expect(d).toBeLessThanOrEqual(30);
      const tree = cover.near(call.x, call.z, 0.01)!;
      expect(tree).not.toBeNull();
      expect(call.y).toBeGreaterThan(tree.y + tree.height * 0.5);
    }
    expect(calls).toBeGreaterThan(50);
  });

  it('fewer birds call over the open fields than in the woods', () => {
    const cover = new TreeCover(layout.trees);
    const count = (x: number, z: number) => {
      const song = new BirdSong(cover, mulberry32(3));
      let n = 0;
      for (let t = 0; t < 600; t += 1 / 30) if (song.update(1 / 30, x, z)) n++;
      return n;
    };
    const woods = count(-30, -55);
    const farm = count(60, 45); // the wheat field, by the windmill
    expect(farm).toBeLessThan(woods * 0.6);
  });
});

describe('the tree cover', () => {
  it('finds the nearest tree within reach, across cells', () => {
    const cover = new TreeCover([
      { x: 7.9, y: 0, z: 0, height: 5 },
      { x: 9, y: 0, z: 0, height: 5 },
      { x: 20, y: 0, z: 0, height: 5 },
    ]);
    expect(cover.near(8.5, 0, 4)!.x).toBe(9);
    expect(cover.near(7, 0, 4)!.x).toBe(7.9);
    expect(cover.near(14.5, 0, 4)).toBeNull();
  });
});
