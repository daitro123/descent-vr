import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { Hollow, type Piece } from '../src/maps/forest/hollow';
import { MineSwitch, type MineStanding } from '../src/world/mine';

// The mine on its own: the switch that says whether you came in by its mouth
// and whose light you're in, and the hollow, the open space dug out of the
// rock that its ground, walls and sight test come from.

const DT = 1 / 72;
const { inside, back, fadeIn, fadeOut, near } = CONFIG.mine;

/**
 * Standing on a straight route in from the mouth, `s` m along it (negative:
 * out in front), with the bend `bend` m in. In the mouth's opening unless `off`.
 */
function at(s: number, bend = 10, off = false): MineStanding {
  return { ahead: s, inMouth: !off, past: Math.max(s, 0) - bend, fromMouth: Math.abs(s) };
}

function walk(sw: MineSwitch, from: number, to: number, speed: number = CONFIG.player.moveSpeed, each?: (s: number) => void): void {
  const n = Math.ceil(Math.abs(to - from) / (speed * DT));
  for (let i = 1; i <= n; i++) {
    const s = from + ((to - from) * i) / n;
    sw.update(DT, at(s));
    each?.(s);
  }
}

function hold(sw: MineSwitch, where: MineStanding, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) sw.update(DT, where);
}

describe('the mine switch', () => {
  it('starts outside: not in the mine, the outdoors shown in its own light', () => {
    const sw = new MineSwitch();
    hold(sw, at(-20), 1);
    expect([sw.state, sw.entered, sw.occupied, sw.light, sw.outdoorsHidden, sw.flamesLit]).toEqual(['outside', false, false, 0, false, false]);
  });

  it("lights the adit's lanterns as you come near the mouth", () => {
    const sw = new MineSwitch();
    walk(sw, -20, -(near - 0.5));
    expect(sw.flamesLit).toBe(true);
    expect(sw.entered).toBe(false);
  });

  it('puts you in the mine as you walk in through the mouth, in the outdoors’ light short of the bend', () => {
    const sw = new MineSwitch();
    walk(sw, -5, 5);
    expect([sw.state, sw.entered, sw.occupied, sw.light, sw.outdoorsHidden]).toEqual(['adit', true, true, 0, false]);
  });

  it('never puts you in the mine without walking in through its mouth', () => {
    // Crossing the mouth's line up on the hillside, over the adit's roof, or arriving already past it.
    const sw = new MineSwitch();
    for (let s = -5; s <= 5; s += 0.05) sw.update(DT, at(s, 10, true));
    expect(sw.entered).toBe(false);
    const dropped = new MineSwitch();
    hold(dropped, at(15), 1);
    expect(dropped.entered).toBe(false);
  });

  it('swaps to the mine’s light past the bend and hides the outdoors, then back as you walk out', () => {
    const sw = new MineSwitch();
    walk(sw, -5, 10 + inside - 0.1);
    expect(sw.state).toBe('adit');
    walk(sw, 10 + inside - 0.1, 10 + inside + 3);
    expect(sw.outdoorsHidden).toBe(true);
    hold(sw, at(10 + inside + 3), fadeIn + 0.05);
    expect(sw.light).toBe(1);
    walk(sw, 10 + inside + 3, -5);
    expect([sw.state, sw.entered, sw.light, sw.outdoorsHidden]).toEqual(['outside', false, 0, false]);
  });

  it('brings the sun back as you walk back to the bend: up by the time you are 3.3 m past it at a run', () => {
    // From 3.3 m past the bend on, the mouth can't be seen (world.test.ts checks it in Oakvale's mine).
    const sw = new MineSwitch();
    walk(sw, -5, 30);
    hold(sw, at(30), 1);
    const run = 3.5;
    walk(sw, 30, 0, run, (s) => {
      if (s - 10 <= 3.3) expect(sw.light, `${(s - 10).toFixed(2)} m past the bend`).toBe(0);
    });
    expect(back - run * fadeOut).toBeGreaterThan(3.3);
  });

  it('settles in the mine at once on loading a save, and takes the light from where you stand', () => {
    const past = new MineSwitch();
    past.settle(true);
    past.update(DT, at(25));
    expect([past.state, past.entered, past.light, past.outdoorsHidden]).toEqual(['inside', true, 1, true]);
    const adit = new MineSwitch();
    adit.settle(true);
    adit.update(DT, at(4));
    expect([adit.state, adit.entered, adit.light, adit.outdoorsHidden]).toEqual(['adit', true, 0, false]);
    // And out of it at once, waking outside the mouth.
    past.settle(false);
    past.update(DT, at(-3));
    expect([past.state, past.entered, past.light]).toEqual(['outside', false, 0]);
  });
});

describe('the hollow', () => {
  // An L: a tunnel north from a mouth open to the south, bending west into a taller room.
  const pieces: Piece[] = [
    { x0: -1.75, x1: 1.75, z0: -11.75, z1: 1, floor: 0, height: 3, part: 0, open: ['south'] },
    { x0: -6.5, x1: 1.75, z0: -11.75, z1: -8.25, floor: 0, height: 3, part: 0 },
    { x0: -18, x1: -6, z0: -15, z1: -5, floor: 0, height: 3.6, part: 1 },
  ];
  const hollow = new Hollow(pieces);

  it('walls every side but the mouth and the openings between pieces, and no wall twice', () => {
    const length = hollow.walls.reduce((sum, w) => sum + Math.hypot(w.bx - w.ax, w.bz - w.az), 0);
    // The tunnel: east 12.75, west 9.25, north 3.5 then 4.25 on to the room, south 4.25; the room: 2 × 12 + 2 × 10 less its opening.
    expect(length).toBeCloseTo(12.75 + 9.25 + 3.5 + 4.25 + 4.25 + 24 + 20 - 3.5, 6);
    // The rock over the opening into the taller room.
    expect(hollow.lintels).toHaveLength(1);
    expect([hollow.lintels[0].y0, hollow.lintels[0].y1]).toEqual([3, 3.6]);
  });

  it('keeps a body off the walls and brings one back out of the rock', () => {
    const p = new Vector3(1.6, 0, -5);
    expect(hollow.resolve(p, 0.3)).toBe(true);
    expect(p.x).toBeCloseTo(1.45, 6);
    const inRock = new Vector3(-4, 0, -4);
    hollow.resolve(inRock, 0.3);
    expect(hollow.contains(inRock.x, inRock.z)).toBe(true);
    // Round the bend's inside corner, and on through the opening into the room.
    for (const [x, z] of [
      [-1.4, -8.6],
      [-6, -10],
      [-7, -10],
    ]) expect(hollow.resolve(new Vector3(x, 0, z), 0.3), `(${x}, ${z})`).toBe(false);
  });

  it('sees along the tunnel but not through the rock round the bend', () => {
    expect(hollow.sees(0, 0, 0, -11)).toBe(true);
    expect(hollow.sees(0, 0, -10, -10)).toBe(false);
    expect(hollow.sees(-3, -10, -12, -12)).toBe(true);
  });

  it('lays each floor and ceiling once: none over another', () => {
    const area = (rs: { rect: { x0: number; x1: number; z0: number; z1: number } }[]) => rs.reduce((a, { rect: r }) => a + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
    const union = 3.5 * 12.75 + 4.75 * 3.5 + 12 * 10 - 0.5 * 3.5;
    expect(area(hollow.floors())).toBeCloseTo(union, 6);
    expect(area(hollow.ceilings())).toBeCloseTo(union, 6);
  });
});
