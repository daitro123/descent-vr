import { Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { BeltFrame, type BeltZone, HIPS } from '../src/player/beltZones';
import { FIGURE, SLOT, spotAt, SPOTS, spotXY } from '../src/ui/bag/layout';

// The belt in the Adventure, at the seams that don't need a headset: where
// its zones hang from your head, and where its slots sit on the bag panel
// (.scratch/inventory/issues/10-the-belt-in-the-adventure.md). Taking,
// drinking and the weapon's fade are the check script's, in the browser; the
// drink, the cooldown and the refill are the inventory's tests.

/** A head at eye height `y`, over (x, z), looking along heading `yaw` (0 looks down −Z) and `pitch` down. */
function head(x: number, y: number, z: number, yaw = 0, pitch = 0): Object3D {
  const h = new Object3D();
  h.position.set(x, y, z);
  h.rotation.set(-pitch, yaw, 0, 'YXZ');
  h.updateMatrixWorld();
  return h;
}

const B = CONFIG.belt;

describe('where the belt hangs', () => {
  it('hangs both hips from the neck: below and behind the eyes, then down, out to each side and a little ahead', () => {
    const frame = new BeltFrame();
    frame.update(head(0, 1.7, 0), 1 / 72);
    expect(frame.neck.x).toBeCloseTo(0);
    expect(frame.neck.y).toBeCloseTo(1.7 - B.neck.below);
    expect(frame.neck.z).toBeCloseTo(B.neck.behind);
    const [left, right] = HIPS.map((z) => frame.place(z, new Vector3()));
    expect(left.x).toBeCloseTo(-B.hip.side);
    expect(right.x).toBeCloseTo(B.hip.side);
    for (const hip of [left, right]) {
      expect(hip.y).toBeCloseTo(1.7 - B.neck.below - B.hip.down);
      expect(hip.z).toBeCloseTo(B.neck.behind - B.hip.ahead);
    }
  });

  it("doesn't move when you nod down at it", () => {
    // A head nodding about the neck: the eyes swing forward and down round it.
    const nod = (pitch: number) => {
      const h = head(0, 0, 0, 0, pitch);
      const eyes = new Vector3(0, B.neck.below, -B.neck.behind).applyQuaternion(h.quaternion).add(new Vector3(0, 1.6, 0));
      h.position.copy(eyes);
      h.updateMatrixWorld();
      return h;
    };
    const frame = new BeltFrame();
    frame.update(nod(0), 1 / 72);
    const before = frame.place(HIPS[1], new Vector3());
    frame.update(nod(1.2), 1 / 72);
    const after = frame.place(HIPS[1], new Vector3());
    expect(after.distanceTo(before)).toBeLessThan(1e-6);
    expect(frame.yaw).toBeCloseTo(Math.PI);
  });

  it('turns with you only once you look well away', () => {
    const frame = new BeltFrame();
    frame.update(head(0, 1.7, 0), 1 / 72);
    const facing = frame.yaw;
    for (let i = 0; i < 72; i++) frame.update(head(0, 1.7, 0, 0.4), 1 / 72);
    expect(frame.yaw).toBeCloseTo(facing);
    for (let i = 0; i < 144; i++) frame.update(head(0, 1.7, 0, Math.PI / 2), 1 / 72);
    // Round to within the dead zone of where you look.
    const off = Math.atan2(Math.sin(frame.yaw - facing), Math.cos(frame.yaw - facing));
    expect(Math.abs(off)).toBeGreaterThan(Math.PI / 2 - B.yawDeadzone - 0.02);
    expect(Math.abs(off)).toBeLessThan(Math.PI / 2 - B.yawDeadzone + 0.02);
  });

  it('finds the nearest zone within reach that is open to the hand', () => {
    const frame = new BeltFrame();
    frame.update(head(3, 1.6, -2), 1 / 72);
    const right = frame.place(HIPS[1], new Vector3());
    expect(frame.nearest(HIPS, right.clone().add(new Vector3(0, 0.05, 0)), B.near)).toBe(1);
    expect(frame.nearest(HIPS, right.clone().add(new Vector3(0, 0.2, 0)), B.near)).toBe(-1);
    expect(frame.nearest(HIPS, right, B.near, (i) => i !== 1)).toBe(-1);
  });

  it('places a zone of the same kind for a later build, such as a tool loop behind the right hip', () => {
    const loop: BeltZone = { name: 'toolLoop', offset: { ...HIPS[1].offset, ahead: HIPS[1].offset.ahead - 0.2 } };
    const frame = new BeltFrame();
    frame.update(head(0, 1.7, 0), 1 / 72);
    const hip = frame.place(HIPS[1], new Vector3());
    const at = frame.place(loop, new Vector3());
    expect(at.distanceTo(hip)).toBeCloseTo(0.2);
    expect(at.z).toBeGreaterThan(hip.z);
    expect(frame.nearest([...HIPS, loop], at, B.near)).toBe(2);
  });
});

describe("the belt's slots on the bag panel", () => {
  const belt = SPOTS.filter((s) => s.in === 'belt');
  const face = (x: number, y: number) => new Vector3(x, y, 0.01);
  const reach = CONFIG.bag.touch;

  it('shows both hips under the figure, the left on your left, clear of every other slot', () => {
    expect(belt).toEqual([
      { in: 'belt', slot: 0 },
      { in: 'belt', slot: 1 },
    ]);
    const [left, right] = belt.map(spotXY);
    expect(left[0]).toBeLessThan(right[0]);
    for (const [x, y] of [left, right]) {
      expect(y + SLOT / 2).toBeLessThan(FIGURE.bottom);
      expect(Math.abs(x - FIGURE.x)).toBeLessThan(SLOT);
    }
    for (const a of SPOTS)
      for (const b of SPOTS) {
        if (a === b) continue;
        const [ax, ay] = spotXY(a);
        const [bx, by] = spotXY(b);
        expect(Math.abs(ax - bx) >= SLOT || Math.abs(ay - by) >= SLOT).toBe(true);
      }
  });

  it('touches them on every page, the talent page too', () => {
    for (const spot of belt) {
      const [x, y] = spotXY(spot);
      expect(spotAt(face(x, y), reach, true)).toEqual(spot);
      expect(spotAt(face(x, y), reach, false)).toEqual(spot);
    }
  });
});
