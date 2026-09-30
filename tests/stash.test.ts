import { Group, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { AdventureState } from '../src/adventureState';
import { CONFIG } from '../src/config';
import { Inventory, type InventoryEffect, type Stack, type Wearer, type Where } from '../src/inventory';
import { INN } from '../src/maps/forest/inn';
import { buildLayout, localToWorld, worldToLocal } from '../src/maps/forest/layout';
import { readSave, saveRecord } from '../src/save/record';
import { BOARD, TABS } from '../src/ui/bag/layout';
import {
  overStash,
  PER_PAGE,
  STASH_BOARD,
  STASH_PAGES,
  STASH_TABS,
  stashNearest,
  stashPlacement,
  stashSpotAt,
  stashTabAt,
  stashWhere,
  stashXY,
} from '../src/ui/bag/stashLayout';
import type { Probe } from '../src/ui/talkBoard';
import { StashChest } from '../src/world/stashChest';

// The stash (.scratch/inventory/issues/15-the-stash.md), at the seams that
// don't need a headset: moves between the bag and the stash's two pages, quest
// items refused, the stash through the save and back, what a point on the
// stash panel touches and where it stands beside the bag's, and the chest by
// the inn's hearth. The rest is the check script's, in the browser
// (.scratch/inventory/checks/stash.mjs).

const warrior = (level = 1): Wearer => ({ class: 'warrior', level });
const bag = (slot: number): Where => ({ in: 'bag', slot });
const potions = (count: number): Stack => ({ id: 'minor-healing-potion', count });
const refusals = (effects: InventoryEffect[]) => effects.flatMap((e) => (e.kind === 'refused' ? [e.reason] : []));
const TUNIC: Stack = { id: 'worn-tunic', count: 1 };
const CHARM: Stack = { id: 'bone-charm-1', count: 1 };

/** A warrior whose bag holds `stacks`, from its first slot. */
function carrying(stacks: Stack[]): Inventory {
  const inv = new Inventory(warrior());
  inv.take(stacks);
  return inv;
}

describe('the stash panel’s pages', () => {
  it('are two of sixteen, covering the stash’s 32 slots once each', () => {
    expect(STASH_PAGES).toBe(2);
    expect(PER_PAGE).toBe(16);
    const slots = Array.from({ length: STASH_PAGES }, (_, page) => Array.from({ length: PER_PAGE }, (_, i) => stashWhere(page, i))).flat();
    expect(slots.map((w) => (w.in === 'stash' ? w.slot : -1))).toEqual(Array.from({ length: CONFIG.bag.stash }, (_, i) => i));
  });
});

describe('carrying between the bag and the stash', () => {
  it('moves to and from both pages, stacking on the same item and swapping with another', () => {
    const inv = carrying([potions(6), TUNIC, CHARM]);
    // Onto the first page's fourth slot, and the second page's fifth.
    expect(refusals(inv.move(bag(0), stashWhere(0, 3)))).toEqual([]);
    expect(refusals(inv.move(bag(1), stashWhere(1, 4)))).toEqual([]);
    expect(inv.at(stashWhere(0, 3))).toEqual(potions(6));
    expect(inv.at({ in: 'stash', slot: 20 })).toEqual(TUNIC);
    // More potions onto the stashed ones stack.
    inv.take([potions(3)]);
    expect(inv.bag[0]).toEqual(potions(3));
    inv.move(bag(0), stashWhere(0, 3));
    expect(inv.at(stashWhere(0, 3))).toEqual(potions(9));
    expect(inv.bag[0]).toBeNull();
    // The charm onto the stashed tunic: they swap.
    inv.move(bag(2), stashWhere(1, 4));
    expect(inv.at(stashWhere(1, 4))).toEqual(CHARM);
    expect(inv.bag[2]).toEqual(TUNIC);
    // From one page to the other, and back into the bag.
    inv.move(stashWhere(1, 4), stashWhere(0, 0));
    expect(inv.at(stashWhere(0, 0))).toEqual(CHARM);
    expect(inv.at(stashWhere(1, 4))).toBeNull();
    inv.move(stashWhere(0, 3), bag(10));
    expect(inv.bag[10]).toEqual(potions(9));
    expect(inv.stash.filter(Boolean)).toEqual([CHARM]);
  });

  it('wears a piece straight from the stash, what was worn going into its slot', () => {
    const inv = carrying([TUNIC]);
    inv.move(bag(0), stashWhere(1, 15));
    inv.move({ in: 'gear', slot: 'feet' }, stashWhere(1, 14));
    expect(inv.gear.feet).toBeNull();
    inv.move(stashWhere(1, 14), { in: 'gear', slot: 'feet' });
    expect(inv.gear.feet).toBe('worn-boots');
    expect(inv.at(stashWhere(1, 14))).toBeNull();
  });

  it('refuses quest items: they never leave the quest page, and never go into the stash', () => {
    const inv = carrying([{ id: 'leaders-orders', count: 1 }]);
    const orders: Where = { in: 'quest', slot: 0 };
    expect(inv.check(orders, stashWhere(0, 0))).toBe('quest');
    expect(refusals(inv.move(orders, stashWhere(0, 0)))).toEqual(['quest']);
    expect(inv.quest).toEqual(['leaders-orders']);
    expect(inv.stash.every((s) => s === null)).toBe(true);
    // Nor through a save that somehow has one there.
    const odd = { ...inv.snapshot(), stash: [{ id: 'leaders-orders', count: 1 }, ...inv.snapshot().stash.slice(1)] };
    expect(new Inventory(warrior(), odd).stash[0]).toBeNull();
  });

  it('says before you let go what the move then does', () => {
    const inv = carrying([potions(10), TUNIC]);
    inv.move(bag(0), stashWhere(0, 0));
    // A full stack onto a full stack: no room.
    inv.take([potions(10)]);
    expect(inv.check(bag(0), stashWhere(0, 0))).toBe('full');
    expect(inv.check(bag(1), stashWhere(1, 15))).toBeNull();
    expect(inv.check(stashWhere(0, 0), { in: 'belt', slot: 0 })).toBeNull();
    expect(inv.check(stashWhere(0, 0), { in: 'gear', slot: 'head' })).toBe('slot');
  });
});

describe('the stash through the save', () => {
  it('comes back from a saved record as it was left, on both pages', () => {
    const state = new AdventureState();
    state.inventory.take([potions(7), TUNIC, CHARM], 5);
    state.inventory.move(bag(0), stashWhere(0, 2));
    state.inventory.move(bag(1), stashWhere(1, 9));
    const record = saveRecord(state.snapshot(), { x: 1, z: 2, yaw: 0, interior: 'inn' });
    const loaded = readSave(JSON.parse(JSON.stringify(record)));
    if (loaded.kind !== 'saved') throw new Error(`read back as ${loaded.kind}`);
    const restored = new AdventureState(loaded.record);
    expect(restored.inventory.stash).toEqual(state.inventory.stash);
    expect(restored.inventory.at(stashWhere(0, 2))).toEqual(potions(7));
    expect(restored.inventory.at(stashWhere(1, 9))).toEqual(TUNIC);
    expect(restored.inventory.bag[2]).toEqual(CHARM);
  });
});

describe('the stash panel', () => {
  const reach = CONFIG.bag.touch;
  const at = (x: number, y: number, z = 0.01) => new Vector3(x, y, z);

  it('touches each slot of a page at its middle, and a tab over each page', () => {
    for (let i = 0; i < PER_PAGE; i++) {
      const [x, y] = stashXY(i);
      expect(stashSpotAt(at(x, y), reach)).toBe(i);
      expect(stashNearest(at(x + 0.02, y - 0.02, 0.05), CONFIG.bag.release, CONFIG.bag.release.near)).toBe(i);
    }
    expect(stashSpotAt(at(0, 0.3), reach)).toBeNull();
    expect(stashSpotAt(at(stashXY(0)[0], stashXY(0)[1], 0.2), reach)).toBeNull();
    STASH_TABS.x.forEach((x, page) => expect(stashTabAt(at(x, STASH_TABS.y), reach)).toBe(page));
    expect(overStash(at(0, 0), CONFIG.bag.release)).toBe(true);
    expect(overStash(at(STASH_BOARD.right + 0.1, 0), CONFIG.bag.release)).toBe(false);
  });

  it("stands left of the bag's panel, clear of it, turned in towards you, its tabs level with the bag's", () => {
    const { x, z, yaw } = stashPlacement();
    const panel = new Group();
    panel.position.set(x, 0, z);
    panel.rotation.y = yaw;
    panel.updateMatrixWorld(true);
    const right = panel.localToWorld(new Vector3(STASH_BOARD.right, 0, 0));
    const left = panel.localToWorld(new Vector3(STASH_BOARD.left, 0, 0));
    expect(right.x).toBeLessThan(BOARD.left);
    expect(BOARD.left - right.x).toBeCloseTo(CONFIG.bag.stashPanel.gap, 6);
    // Its far edge comes towards you (+Z in the bag panel's space), so its face looks at you.
    expect(left.z).toBeGreaterThan(right.z + 0.05);
    const normal = new Vector3(0, 0, 1).applyQuaternion(panel.quaternion);
    const toYou = new Vector3(0, 0, CONFIG.bag.panel.out).sub(panel.position).normalize();
    expect(normal.dot(toYou)).toBeGreaterThan(Math.cos((40 * Math.PI) / 180));
    expect(STASH_TABS.y).toBe(TABS.y);
  });
});

describe("the stash's chest", () => {
  const layout = buildLayout();
  const inn = layout.structures.find((s) => s.kind === 'inn')!;
  const [taproom] = layout.interiors;
  const { stash } = layout;
  const [lx, lz] = worldToLocal(inn, stash.x, stash.z);

  it("stands in the inn by the hearth, against the right wall, facing into the room", () => {
    expect(stash.interior).toBe('inn');
    expect(stash.y).toBeCloseTo(inn.y + INN.floor, 9);
    expect(lx + INN.stash.depth / 2).toBeCloseTo(INN.room.hw, 9);
    // Beside the hearth along the wall.
    const gap = Math.abs(lz - INN.hearth.z) - INN.hearth.width / 2 - INN.stash.width / 2;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(0.4);
    // Its front (+Z, turned by its yaw) faces −X in the inn's frame, into the room.
    const [fx, fz] = [Math.sin(stash.yaw), Math.cos(stash.yaw)];
    const [ox, oz] = localToWorld(inn, 0, 0);
    const [ax, az] = localToWorld(inn, -1, 0);
    expect(fx * (ax - ox) + fz * (az - oz)).toBeCloseTo(1, 6);
  });

  it('is solid, clear of the respawn point, and has room before it to stand and touch its lid', () => {
    const r = CONFIG.player.bodyRadius;
    expect(taproom.resolve(new Vector3(stash.x, 0, stash.z), r)).toBe(true);
    const { village } = layout.respawns;
    expect(taproom.resolve(new Vector3(village.x, 0, village.z), r + 0.3)).toBe(false);
    expect(Math.hypot(village.x - stash.x, village.z - stash.z)).toBeGreaterThan(1.2);
    // Standing square in front of it, the lid's middle is an arm's length from your feet.
    const [sx, sz] = localToWorld(inn, lx - INN.stash.depth / 2 - r - 0.05, lz);
    expect(taproom.resolve(new Vector3(sx, 0, sz), r)).toBe(false);
    expect(Math.hypot(sx - stash.x, sz - stash.z)).toBeLessThan(0.7);
  });

  const probe = (at: Vector3): Probe => ({ at, hand: 'right' });

  it('opens the stash when a fist arrives on its lid, not while one rests there, nor while it is hidden', () => {
    const room = new Group();
    const chest = new StashChest(stash);
    room.add(chest.root);
    const onLid = chest.lidWorld(new Vector3());
    const off = onLid.clone().add(new Vector3(0, 0.4, 0));
    expect(chest.onLid(onLid)).toBe(true);
    expect(chest.onLid(off)).toBe(false);
    expect(chest.update(1 / 72, false, [probe(off)])).toBeNull();
    expect(chest.update(1 / 72, false, [probe(onLid)])?.at).toBe(onLid);
    // Resting there, it doesn't count again; nor does the lid while the stash is open.
    expect(chest.update(1 / 72, false, [probe(onLid)])).toBeNull();
    chest.update(1 / 72, false, [probe(off)]);
    expect(chest.update(1 / 72, true, [probe(onLid)])).toBeNull();
    // The lid swings up while it's open, and shuts again.
    for (let t = 0; t < 1; t += 1 / 72) chest.update(1 / 72, true, [null]);
    expect(chest.lidUp).toBe(1);
    for (let t = 0; t < 1; t += 1 / 72) chest.update(1 / 72, false, [null]);
    expect(chest.lidUp).toBe(0);
    // Hidden with its room (you're outside, the door shut), it can't be touched.
    room.visible = false;
    chest.update(1 / 72, false, [probe(off)]);
    expect(chest.update(1 / 72, false, [probe(onLid)])).toBeNull();
  });
});
