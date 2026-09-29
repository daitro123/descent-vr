import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { type Cues, mix, type RoomCue } from '../src/world/mix';

// The mix follows the light's cues (spec, "Sound"): outside, at the door,
// inside, in the mine, in the crypt and in a fight, the ambience's levels are
// a pure function of the Interiors switches' light and doors, how far into
// the crypt you are, and whether anything fights you.

const { open, inside, walls, door, crypt, fight } = CONFIG.sound.mix;

const inn = (d: number, light: number): RoomCue => ({ id: 'inn', door: d, light });
const cues = (over: Partial<Cues> = {}): Cues => ({ rooms: [inn(0, 0), { id: 'house', door: 0, light: 0 }], mine: 0, crypt: -Infinity, ...over });

describe('the mix', () => {
  it('outside: the outdoors as it is, a room heard faintly and muffled through its walls, nothing of the mine', () => {
    const m = mix(cues(), false);
    expect([m.outdoors, m.outdoorsCutoff, m.all]).toEqual([1, open, 1]);
    expect(m.rooms[0]).toEqual({ level: walls.level, cutoff: walls.cutoff });
    expect([m.air, m.timbers, m.drone]).toEqual([0, 0, 0]);
  });

  it("at the door: the outdoors as it is, and the room's fires come through the open door", () => {
    const m = mix(cues({ rooms: [inn(1, 0)] }), false);
    expect([m.outdoors, m.outdoorsCutoff]).toEqual([1, open]);
    const r = m.rooms[0];
    expect(r.level).toBeCloseTo(walls.level + (1 - walls.level) * door);
    expect(r.level).toBeGreaterThan(walls.level);
    expect(r.level).toBeLessThan(1);
    expect(r.cutoff).toBeGreaterThan(walls.cutoff);
    expect(r.cutoff).toBeLessThan(open);
  });

  it("inside, the door shut: the outdoors muffled and quiet, the room's fires come up", () => {
    const m = mix(cues({ rooms: [inn(0, 1), { id: 'house', door: 0, light: 0 }] }), false);
    expect(m.outdoors).toBeCloseTo(inside.level);
    expect(m.outdoorsCutoff).toBeCloseTo(inside.cutoff);
    expect(m.rooms[0]).toEqual({ level: 1, cutoff: open });
    // Another building's room is still behind its own walls.
    expect(m.rooms[1]).toEqual({ level: walls.level, cutoff: walls.cutoff });
  });

  it('moves with the light, so over the same half-second: halfway, halfway in pitch', () => {
    const m = mix(cues({ rooms: [inn(0, 0.5)] }), false);
    expect(m.outdoors).toBeCloseTo((1 + inside.level) / 2);
    expect(m.outdoorsCutoff).toBeCloseTo(Math.sqrt(open * inside.cutoff));
    // Walking in, each level only ever moves one way.
    let last = mix(cues({ rooms: [inn(0, 0)] }), false);
    for (let t = 0.1; t <= 1.001; t += 0.1) {
      const now = mix(cues({ rooms: [inn(0, t)] }), false);
      expect(now.outdoors).toBeLessThan(last.outdoors);
      expect(now.rooms[0].level).toBeGreaterThanOrEqual(last.rooms[0].level);
      last = now;
    }
  });

  it("in the mine past the bend: the outdoors gone, the mine's air and timbers in, no drone", () => {
    const m = mix(cues({ mine: 1, crypt: -30 }), false);
    expect([m.outdoors, m.air, m.timbers, m.drone]).toEqual([0, 1, 1, 0]);
    expect(m.rooms.every((r) => r.level === 0)).toBe(true);
    // In the adit, short of the bend, it's still the outdoors'.
    const adit = mix(cues({ mine: 0, crypt: -45 }), false);
    expect([adit.outdoors, adit.air, adit.drone]).toEqual([1, 0, 0]);
    // Halfway through the light's swap, halfway through the sound's.
    const half = mix(cues({ mine: 0.5, crypt: -40 }), false);
    expect([half.outdoors, half.air]).toEqual([0.5, 0.5]);
  });

  it('in the crypt: the drone rises across the breach as the timbers fall away', () => {
    const at = (c: number) => mix(cues({ mine: 1, crypt: c }), false);
    expect(at(crypt.from).drone).toBe(0);
    expect(at(crypt.to).drone).toBe(1);
    expect(at(crypt.to).timbers).toBe(0);
    expect(at(crypt.to).air).toBeCloseTo(crypt.air);
    expect(at(40).drone).toBe(1);
    let last = at(crypt.from - 1);
    for (let c = crypt.from; c <= crypt.to; c += 0.5) {
      const now = at(c);
      expect(now.drone).toBeGreaterThanOrEqual(last.drone);
      expect(now.timbers).toBeLessThanOrEqual(last.timbers);
      last = now;
    }
    // At the breach itself it's on its way up.
    expect(at(0).drone).toBeGreaterThan(0);
    expect(at(0).drone).toBeLessThan(1);
  });

  it('in a fight: the whole ambience dips a little, wherever you are', () => {
    for (const c of [cues(), cues({ rooms: [inn(0, 1)] }), cues({ mine: 1, crypt: 10 })]) {
      const calm = mix(c, false);
      const fought = mix(c, true);
      expect(calm.all).toBe(1);
      expect(fought.all).toBe(fight.level);
      expect(fought.all).toBeGreaterThan(0.4);
      // Only the dip changes.
      expect({ ...fought, all: 1 }).toEqual(calm);
    }
  });
});
