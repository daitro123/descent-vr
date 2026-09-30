import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { Drops, type Touch, type Touching } from '../src/world/drops';

// Loot on the ground (spec, "Loot on the ground"): a pouch and its items where
// the enemy fell, taken by a touch as an orb is, flashing red when the bag is
// full, lying five minutes and at most twelve at once.

const NOBODY: Touching = { probes: [], feet: null };
const OUTDOORS = (interior: string | null) => interior === null;
const FELL = new Vector3(10, 2, -5);

/** A fist at `at`. */
const fistAt = (at: Vector3): Touching => ({ probes: [{ at, hand: 'right' }], feet: null });

/** Step `drops` with `touching`, taking whatever `take` says; returns every touch asked. */
function step(drops: Drops, touching: Touching = NOBODY, take: (t: Touch) => boolean = () => true, dt = 1 / 72): Touch[] {
  const asked: Touch[] = [];
  drops.update(dt, touching, OUTDOORS, (t) => (asked.push(t), take(t)));
  return asked;
}

describe('a drop', () => {
  it('lies where the enemy fell: a pouch with its coins, each item beside it, and beams for green and blue', () => {
    const drops = new Drops();
    drops.drop(FELL, { coins: 6, items: ['torn-cloth-2', 'studded-coif-of-the-bear-2', 'iron-longsword-2'] }, null);
    const pieces = drops.pieces;
    expect(pieces.map((p) => [p.coins, p.item, p.beam])).toEqual([
      [6, null, false],
      [0, 'torn-cloth-2', false],
      [0, 'studded-coif-of-the-bear-2', true],
      [0, 'iron-longsword-2', false],
    ]);
    for (const p of pieces.slice(1)) {
      expect(Math.hypot(p.at.x - FELL.x, p.at.z - FELL.z)).toBeCloseTo(CONFIG.loot.ring);
      expect(p.at.y).toBeCloseTo(FELL.y + CONFIG.loot.hover);
    }
  });

  it('is nothing at all when nothing dropped', () => {
    const drops = new Drops();
    drops.drop(FELL, { coins: 0, items: [] }, null);
    expect(drops.lying).toBe(0);
  });

  it('is taken piece by piece with a touch, and gone once all is taken', () => {
    const drops = new Drops();
    drops.drop(FELL, { coins: 6, items: ['torn-cloth-2'] }, null);
    const [pouch, cloth] = drops.pieces;
    expect(step(drops, fistAt(pouch.at))).toMatchObject([{ coins: 6, item: null, hand: 'right' }]);
    expect(drops.pieces.map((p) => p.item)).toEqual(['torn-cloth-2']);
    expect(step(drops, { probes: [], feet: cloth.at.clone().setY(FELL.y) })).toMatchObject([{ coins: 0, item: 'torn-cloth-2', hand: null }]);
    expect(drops.lying).toBe(0);
  });

  it("isn't touched while its place isn't drawn (in the mine, from outside)", () => {
    const drops = new Drops();
    drops.drop(FELL, { coins: 6, items: [] }, 'mine');
    expect(step(drops, fistAt(drops.pieces[0].at))).toEqual([]);
    expect(drops.root.children[0].visible).toBe(false);
  });

  it('leaves an item a full bag refuses flashing red, asking again only on a new touch', () => {
    const drops = new Drops();
    drops.drop(FELL, { coins: 6, items: ['iron-longsword-3'] }, null);
    const sword = drops.pieces[1];
    const full = () => false;
    expect(step(drops, fistAt(sword.at), full)).toHaveLength(1);
    expect(drops.pieces[1]).toMatchObject({ item: 'iron-longsword-3', flashing: true });
    // Held there, it isn't asked again.
    expect(step(drops, fistAt(sword.at), full)).toEqual([]);
    step(drops, NOBODY, full, CONFIG.loot.full.flash + 0.1);
    expect(drops.pieces[1].flashing).toBe(false);
    // A new touch, with room now, takes it.
    expect(step(drops, fistAt(sword.at))).toMatchObject([{ item: 'iron-longsword-3' }]);
    expect(drops.pieces.map((p) => p.item)).toEqual([null]);
  });
});

describe('drops lying', () => {
  it('go after five minutes, even untouched', () => {
    const drops = new Drops();
    drops.drop(FELL, { coins: 3, items: [] }, null);
    step(drops, NOBODY, undefined, CONFIG.loot.lifetime - 1);
    expect(drops.lying).toBe(1);
    step(drops, NOBODY, undefined, 2);
    expect(drops.lying).toBe(0);
  });

  it('number at most twelve: past that the oldest goes', () => {
    const drops = new Drops();
    for (let i = 0; i < 14; i++) drops.drop(new Vector3(i * 3, 0, 0), { coins: i + 1, items: [] }, null);
    expect(drops.lying).toBe(CONFIG.loot.most);
    expect(drops.pieces.map((p) => p.coins)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });
});
