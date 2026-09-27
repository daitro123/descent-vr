import { Euler, Group, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../src/config';
import { Sword } from '../src/player/weapons';

// The player's sword has to be swung, not waved. These drive a real Sword in
// a hand (a grip under a rig, as WebXR sets it up) through wiggles and swings
// and check when the blade is hot: able to deal damage, glowing, trailing.

const DT = 1 / 72;
const DEG = Math.PI / 180;

function held() {
  const rig = new Group();
  const grip = new Group();
  rig.add(grip);
  const sword = new Sword();
  grip.add(sword.model);
  return { rig, grip, sword };
}
type Held = ReturnType<typeof held>;

/** Put the hand at `pos` (rig space), turned by `rot` (radians, XYZ), and run a frame. */
function frame({ rig, grip, sword }: Held, pos: Vector3, rot: Euler): void {
  grip.position.copy(pos);
  grip.quaternion.setFromEuler(rot);
  rig.updateMatrixWorld(true);
  sword.update(rig, DT);
}

/** Play `seconds` of motion; report the fastest the tip went and whether the blade ever got hot. */
function play(h: Held, seconds: number, at: (t: number) => [Vector3, Euler]) {
  let peakTip = 0;
  let hot = false;
  for (let t = 0; t <= seconds; t += DT) {
    frame(h, ...at(t));
    if (t > 0.1) peakTip = Math.max(peakTip, h.sword.tipSpeed); // after the first frames settle
    hot ||= h.sword.hot;
  }
  return { peakTip, hot };
}

const HAND = new Vector3(0.25, 1.1, -0.35);
const smooth = (k: number) => k * k * (3 - 2 * k);

afterEach(() => void vi.unstubAllGlobals());

describe('wiggling the sword', () => {
  it('flicking the wrist whips the tip past damage speed, but the blade stays cold', () => {
    const h = held();
    // Hand still; the blade rocks ±20° at 3 Hz from the wrist.
    const { peakTip, hot } = play(h, 1.5, (t) => [HAND, new Euler(20 * DEG * Math.sin(2 * Math.PI * 3 * t), 0, 0)]);
    expect(peakTip).toBeGreaterThan(CONFIG.sword.minHitSpeed);
    expect(hot).toBe(false);
  });

  it('shaking the whole hand back and forth never adds up to a swing', () => {
    const h = held();
    const { peakTip, hot } = play(h, 1.5, (t) => [
      HAND.clone().setX(HAND.x + 0.08 * Math.sin(2 * Math.PI * 3 * t)),
      new Euler(0, 15 * DEG * Math.sin(2 * Math.PI * 3 * t), 0),
    ]);
    expect(peakTip).toBeGreaterThan(CONFIG.sword.minHitSpeed);
    expect(hot).toBe(false);
  });
});

describe('a real swing', () => {
  /** A forehand slash: the hand sweeps 0.7 m across in 0.3 s as the blade turns 110°. */
  const slash = (t: number): [Vector3, Euler] => {
    const k = smooth(Math.min(1, t / 0.3));
    return [new Vector3(0.4 - 0.7 * k, 1.2, -0.35 - 0.15 * Math.sin(Math.PI * k)), new Euler(-0.6, (55 - 110 * k) * DEG, 0)];
  };

  it('turns hot once the hand has travelled far enough, and stays hot through the swing', () => {
    const h = held();
    const start = slash(0)[0];
    let firstHot: number | null = null;
    let hotFrames = 0;
    for (let t = 0; t <= 0.3; t += DT) {
      const [pos, rot] = slash(t);
      frame(h, pos, rot);
      if (!h.sword.hot) continue;
      hotFrames++;
      if (firstHot === null) {
        firstHot = t;
        expect(pos.distanceTo(start)).toBeGreaterThanOrEqual(CONFIG.sword.minSwingTravel);
      }
    }
    expect(firstHot).not.toBeNull();
    expect(firstHot!).toBeLessThan(0.15); // committed by the middle of the swing
    expect(hotFrames * DT).toBeGreaterThan(0.1);
  });

  it('turning back mid-swing starts over', () => {
    const h = held();
    for (let t = 0; t <= 0.2; t += DT) frame(h, ...slash(t));
    expect(h.sword.swing.committed).toBe(true);
    // Straight back the other way, fast: a fresh swing that hasn't gone anywhere yet.
    frame(h, slash(0.2 - DT)[0], slash(0.2 - DT)[1]);
    expect(h.sword.swing.committed).toBe(false);
  });
});

describe('weight', () => {
  const blade = new Vector3();
  const hand = new Vector3();
  /** Angle (degrees) between where the blade points and where the hand does. */
  function lag(h: Held): number {
    h.sword.model.updateMatrixWorld(true);
    blade.setFromMatrixColumn(h.sword.model.matrixWorld, 2);
    hand.setFromMatrixColumn(h.grip.matrixWorld, 2);
    return blade.angleTo(hand) / DEG;
  }

  it('the blade follows a sharp turn of the hand a moment later, never far behind', () => {
    const h = held();
    for (let i = 0; i < 10; i++) frame(h, HAND, new Euler(0, 0, 0));
    frame(h, HAND, new Euler(-60 * DEG, 0, 0)); // the wrist snaps forward
    const first = lag(h);
    expect(first).toBeGreaterThan(5);
    expect(first).toBeLessThanOrEqual(CONFIG.sword.maxLagDeg + 0.01);
    for (let t = 0; t < 0.3; t += DT) frame(h, HAND, new Euler(-60 * DEG, 0, 0));
    expect(lag(h)).toBeLessThan(1);
  });

  it('snap turns and walking carry the blade along at once', () => {
    const h = held();
    for (let i = 0; i < 10; i++) frame(h, HAND, new Euler(0, 0, 0));
    h.rig.rotateY(Math.PI / 4);
    h.rig.position.x += 0.5;
    frame(h, HAND, new Euler(0, 0, 0));
    expect(lag(h)).toBeLessThan(0.01);
    expect(h.sword.tipSpeed).toBeLessThan(0.01);
  });
});

describe('grip angle', () => {
  const pivotOf = (s: Sword) => s.model.children[0];

  it('comes from CONFIG.sword', () => {
    const { rotation } = pivotOf(new Sword());
    expect(rotation.x).toBeCloseTo(CONFIG.sword.pitchDeg * DEG);
    expect(rotation.z).toBeCloseTo(CONFIG.sword.rollDeg * DEG);
  });

  it('can be tried out in the headset from the URL', () => {
    vi.stubGlobal('location', { search: '?swordPitch=-30&swordRoll=0' });
    const { rotation } = pivotOf(new Sword());
    expect(rotation.x).toBeCloseTo(-30 * DEG);
    expect(rotation.z).toBeCloseTo(0);
  });

  it('ignores a URL value that is not a number', () => {
    vi.stubGlobal('location', { search: '?swordRoll=abc' });
    expect(pivotOf(new Sword()).rotation.z).toBeCloseTo(CONFIG.sword.rollDeg * DEG);
  });
});
