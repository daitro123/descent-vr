import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { InteriorSwitch, type Standing } from '../src/world/interiors';

// The Interiors switch, on its own: where you stand in a building's frame
// in, whether its door is open, whose light you're in and whether the
// outdoors is drawn out. The door's line is at z = 4; less is further in.

const DOOR = 4;
const { open, margin, shut, reopen, fadeIn, fadeOut, swing } = CONFIG.interiors;
const DT = 1 / 72;

/** Standing `past` m in through the door's middle (negative: out in front of it). */
const at = (past: number, x = 0): Standing => ({ x, z: DOOR - past, within: past >= 0 && Math.abs(x) <= 5.5 && DOOR - past >= -4 });

/** Step the switch `seconds` standing at `where`. */
function hold(s: InteriorSwitch, where: Standing, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) s.update(DT, where);
}

/** Walk from `from` m past the door to `to` at `speed` m/s, stepping as you go. */
function walk(s: InteriorSwitch, from: number, to: number, speed: number = CONFIG.player.moveSpeed, each?: (s: InteriorSwitch, past: number) => void): void {
  const n = Math.ceil(Math.abs(to - from) / (speed * DT));
  for (let i = 1; i <= n; i++) {
    const past = from + ((to - from) * i) / n;
    s.update(DT, at(past));
    each?.(s, past);
  }
}

describe('the Interiors switch', () => {
  it('starts outside: the door shut, the room hidden, the outdoors shown in its own light', () => {
    const s = new InteriorSwitch(DOOR);
    hold(s, at(-10), 1);
    expect(s.state).toBe('outside');
    expect([s.door, s.light, s.roomShown, s.flamesLit, s.outdoorsHidden, s.occupied]).toEqual([0, 0, false, false, false, false]);
  });

  it('opens the door as you walk up, with the room showing and lit by its flames, in the outdoors’ light', () => {
    const s = new InteriorSwitch(DOOR);
    hold(s, at(-(open + 0.1)), 1);
    expect(s.state).toBe('outside');
    hold(s, at(-(open - 0.1)), swing + 0.05);
    expect(s.state).toBe('atDoor');
    expect(s.door).toBe(1);
    expect([s.roomShown, s.flamesLit, s.light, s.outdoorsHidden, s.occupied]).toEqual([true, true, 0, false, false]);
  });

  it('keeps the door open while you stand in the doorway, and shuts it once you walk off outside', () => {
    const s = new InteriorSwitch(DOOR);
    hold(s, at(-1), swing);
    hold(s, at(0.3), 3);
    expect(s.state).toBe('atDoor');
    expect(s.door).toBe(1);
    // Just past where it opened, it stays open; a margin further, it shuts and the room goes.
    hold(s, at(-(open + margin / 2)), 1);
    expect(s.door).toBe(1);
    hold(s, at(-(open + margin + 0.1)), swing + 0.05);
    expect(s.state).toBe('outside');
    expect([s.door, s.roomShown, s.flamesLit]).toEqual([0, false, false]);
  });

  it('shuts the door behind you once you’re in past it, then swaps the light over half a second and hides the outdoors', () => {
    const s = new InteriorSwitch(DOOR);
    walk(s, -4, shut - 0.05);
    expect(s.state).toBe('atDoor');
    expect(s.door).toBeGreaterThan(0);
    walk(s, shut - 0.05, shut + 0.05);
    expect(s.state).toBe('inside');
    expect(s.occupied).toBe(true);
    // The door swings shut before the light changes, and the outdoors goes once it's shut.
    let shutAt = -1;
    let litAt = -1;
    for (let t = 0; t < 2; t += DT) {
      s.update(DT, at(shut + 0.05));
      expect(s.light > 0 && s.door > 0).toBe(false);
      if (shutAt < 0 && s.door === 0) shutAt = t;
      if (litAt < 0 && s.light === 1) litAt = t;
      expect(s.outdoorsHidden).toBe(s.door === 0);
    }
    expect(shutAt).toBeCloseTo(swing, 1);
    expect(litAt - shutAt).toBeCloseTo(fadeIn, 1);
    expect([s.roomShown, s.flamesLit, s.outdoorsHidden]).toEqual([true, true, true]);
  });

  it('brings the sun back up as you walk back to the door, before it opens', () => {
    const s = new InteriorSwitch(DOOR);
    walk(s, -4, 4);
    hold(s, at(4), 2);
    expect([s.state, s.light, s.door]).toEqual(['inside', 1, 0]);
    // Deep in the room, nothing changes until you come within `reopen` of the door.
    walk(s, 4, reopen + 0.05);
    expect([s.state, s.light, s.door]).toEqual(['inside', 1, 0]);
    let leftAt = -1;
    let firstOpen = -1;
    let sunUp = -1;
    let t = 0;
    walk(s, reopen + 0.05, -3, CONFIG.player.moveSpeed / 3, (sw) => {
      t += DT;
      if (leftAt < 0 && sw.state === 'leaving') leftAt = t;
      if (sw.state === 'leaving') expect(sw.outdoorsHidden).toBe(false);
      if (sunUp < 0 && sw.light === 0) sunUp = t;
      if (firstOpen < 0 && sw.door > 0) firstOpen = t;
    });
    expect(leftAt).toBeGreaterThan(0);
    expect(sunUp - leftAt).toBeCloseTo(fadeOut, 1);
    expect(firstOpen).toBeGreaterThanOrEqual(sunUp);
    hold(s, at(-3), 1);
    expect(s.state).toBe('outside');
    expect(s.door).toBe(0);
  });

  it('turning back in before the door opens swaps the light back', () => {
    const s = new InteriorSwitch(DOOR);
    walk(s, -4, 4);
    hold(s, at(4), 2);
    walk(s, 4, reopen - 0.1);
    expect(s.state).toBe('leaving');
    expect(s.occupied).toBe(true);
    walk(s, reopen - 0.1, shut + 0.2);
    expect(s.state).toBe('inside');
    hold(s, at(shut + 0.2), fadeIn + 0.1);
    expect([s.light, s.door]).toEqual([1, 0]);
  });

  it('settles inside at once, door shut and the room lit, when you wake by the hearth or load a save', () => {
    const s = new InteriorSwitch(DOOR);
    s.settle(true);
    expect([s.state, s.light, s.door, s.outdoorsHidden, s.occupied]).toEqual(['inside', 1, 0, true, true]);
    hold(s, at(5, 3), 1);
    expect([s.state, s.light, s.door]).toEqual(['inside', 1, 0]);
    s.settle(false);
    expect([s.state, s.light, s.door, s.roomShown]).toEqual(['outside', 0, 0, false]);
  });

  it('arriving inside or outside any other way (a teleport) swaps at once', () => {
    const s = new InteriorSwitch(DOOR);
    s.update(DT, at(5, 3));
    expect([s.state, s.light, s.door]).toEqual(['inside', 1, 0]);
    s.update(DT, at(-20));
    expect([s.state, s.light, s.door]).toEqual(['outside', 0, 0]);
  });

  it('doesn’t count you in while you stand in the front corner of the room, away from the door', () => {
    const s = new InteriorSwitch(DOOR);
    walk(s, -4, 0.5);
    // Sideways along the front wall, inside but never far past the door's line: the door stays open.
    for (let x = 0; x <= 4; x += 0.02) s.update(DT, at(0.5, x));
    expect(s.state).toBe('atDoor');
    expect(s.occupied).toBe(false);
  });
});
