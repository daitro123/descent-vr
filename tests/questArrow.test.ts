import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import type { QuestPlace } from '../src/maps/types';
import { arrowHides, arrowPoint, arrowTurn, type ArrowSpots } from '../src/ui/questArrow';

// The quest arrow's rules: where it points, when it hides, and how it turns
// on the tracker as you turn. A made-up zone, so the rules stand on their own.

const place = (x: number, z: number, r: number, at?: { x: number; z: number }): QuestPlace => ({ ...(at ?? { x, z }), clearing: { x, z, r } });
const WAY: ArrowSpots = {
  places: {
    farm: place(50, 30, 30),
    lumberCamp: place(-50, -40, 13),
    // The mine's arrow points at its mouth; it hides from its front on.
    mine: place(-14, -72, 7, { x: -14, z: -78 }),
  },
  givers: { hale: { x: 1.5, z: 4.8 } },
};
const outdoors = (x: number, z: number) => ({ x, z, interior: null });

describe('where the quest arrow points', () => {
  it("is each quest's place, the old mine's mouth for the mine, and Hale's spot", () => {
    expect(arrowPoint('farm', WAY)).toMatchObject({ x: 50, z: 30 });
    expect(arrowPoint('lumberCamp', WAY)).toMatchObject({ x: -50, z: -40 });
    expect(arrowPoint('mine', WAY)).toMatchObject({ x: -14, z: -78 });
    expect(arrowPoint('hale', WAY)).toEqual({ x: 1.5, z: 4.8 });
  });
});

describe('the quest arrow hiding', () => {
  it("shows on the way to a place, and hides once you're in its clearing", () => {
    expect(arrowHides('farm', outdoors(0, 0), WAY)).toBe(false);
    expect(arrowHides('farm', outdoors(50 - 30.5, 30), WAY)).toBe(false);
    expect(arrowHides('farm', outdoors(50 - 29.5, 30), WAY)).toBe(true);
    expect(arrowHides('lumberCamp', outdoors(-50 + 12.9, -40), WAY)).toBe(true);
    expect(arrowHides('lumberCamp', outdoors(-50 + 13.1, -40), WAY)).toBe(false);
  });

  it('hides for the mine from its front on, and all the way through it', () => {
    expect(arrowHides('mine', outdoors(-14, -64), WAY)).toBe(false);
    expect(arrowHides('mine', outdoors(-14, -66), WAY)).toBe(true);
    expect(arrowHides('mine', { x: -14, z: -95, interior: 'mine' }, WAY)).toBe(true);
    expect(arrowHides('hale', { x: -14, z: -95, interior: 'mine' }, WAY)).toBe(true);
  });

  it('hides within 10 m of Hale when it points at them, not when it points elsewhere', () => {
    const near = CONFIG.tracker.arrow.nearGiver;
    expect(near).toBe(10);
    expect(arrowHides('hale', outdoors(1.5, 4.8 - (near - 0.1)), WAY)).toBe(true);
    expect(arrowHides('hale', outdoors(1.5, 4.8 - (near + 0.1)), WAY)).toBe(false);
    expect(arrowHides('farm', outdoors(1.5, 3), WAY)).toBe(false);
  });

  it("points at any giver standing in the zone, hides near them, and always for one who isn't there", () => {
    const way: ArrowSpots = { ...WAY, givers: { ...WAY.givers, smith: { x: -20, z: 10 } } };
    expect(arrowPoint('smith', way)).toEqual({ x: -20, z: 10 });
    expect(arrowHides('smith', outdoors(-20, 10 + 9.9), way)).toBe(true);
    expect(arrowHides('smith', outdoors(-20, 10 + 10.1), way)).toBe(false);
    expect(arrowPoint('herbalist', way)).toBeNull();
    expect(arrowHides('herbalist', outdoors(50, 50), way)).toBe(true);
  });

  it('hides indoors, whatever it points at, and comes back as you step out', () => {
    for (const target of ['farm', 'lumberCamp', 'mine', 'hale'] as const) {
      expect(arrowHides(target, { x: 13, z: -15, interior: 'inn' }, WAY)).toBe(true);
      expect(arrowHides(target, { x: -13, z: -12, interior: 'house' }, WAY)).toBe(true);
    }
    expect(arrowHides('farm', outdoors(13, -9), WAY)).toBe(false);
  });
});

describe('the quest arrow turning', () => {
  const at = { x: 0, z: 0 };
  it('points up for what lies straight ahead, and down for what lies behind', () => {
    expect(arrowTurn({ ...at, yaw: 0 }, { x: 0, z: -20 })).toBeCloseTo(0, 9);
    expect(Math.abs(arrowTurn({ ...at, yaw: 0 }, { x: 0, z: 20 }))).toBeCloseTo(Math.PI, 9);
  });

  it('turns left for what lies to your left, and right for what lies to your right', () => {
    // Looking north (down −Z), west is on your left.
    expect(arrowTurn({ ...at, yaw: 0 }, { x: -20, z: 0 })).toBeCloseTo(Math.PI / 2, 9);
    expect(arrowTurn({ ...at, yaw: 0 }, { x: 20, z: 0 })).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('turns as you turn: face the place and it points up', () => {
    const farm = { x: 50, z: 30 };
    // Looking east (yaw −π/2), the farm to the south-east is ahead and to your right.
    const east = arrowTurn({ ...at, yaw: -Math.PI / 2 }, farm);
    expect(east).toBeLessThan(0);
    expect(east).toBeGreaterThan(-Math.PI / 2);
    // Turn to it and it points up.
    const yaw = Math.atan2(-farm.x, -farm.z);
    expect(arrowTurn({ ...at, yaw }, farm)).toBeCloseTo(0, 9);
    // Turn a quarter left of it and it points a quarter right.
    expect(arrowTurn({ ...at, yaw: yaw + Math.PI / 2 }, farm)).toBeCloseTo(-Math.PI / 2, 9);
  });
});
