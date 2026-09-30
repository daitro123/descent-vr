import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { Run, type RunInput } from '../src/player/run';
import { fadeLevel } from '../src/ui/runVignette';

// The run's rule: a left-stick click latches it, and you run while the stick
// points ahead and nothing fights you. Driven frame by frame as the player
// does, with the stick as the gamepad reports it (forward is −y).

const WALK = CONFIG.player.moveSpeed;
const RUN = CONFIG.run.speed;

/** The stick pushed all the way, `deg` degrees from straight ahead (positive to the right). */
const stick = (deg: number, push = 1) => {
  const a = (deg * Math.PI) / 180;
  return { stickX: Math.sin(a) * push, stickY: -Math.cos(a) * push };
};
const frame = (over: Partial<RunInput> = {}): RunInput => ({ click: false, ...stick(0), fighting: false, ...over });
const click = (over: Partial<RunInput> = {}) => frame({ click: true, ...over });
const letGo: RunInput = { click: false, stickX: 0, stickY: 0, fighting: false };

describe('the run', () => {
  it('is 3.5 m/s against a 2.2 m/s walk', () => {
    expect(RUN).toBe(3.5);
    expect(WALK).toBe(2.2);
  });

  it('walks until the left stick is clicked, then runs', () => {
    const run = new Run();
    expect(run.step(frame())).toMatchObject({ speed: WALK, running: false });
    expect(run.step(click())).toMatchObject({ speed: RUN, running: true });
    // It stays latched without holding the click down.
    expect(run.step(frame())).toMatchObject({ speed: RUN, running: true });
    expect(run.latched).toBe(true);
  });

  it('runs while the stick points within about 45° of ahead, and walks when it points sideways or back', () => {
    const run = new Run();
    run.step(click());
    for (const deg of [0, 30, -30, 44, -44]) expect(run.step(frame(stick(deg))).speed, `${deg}°`).toBe(RUN);
    for (const deg of [46, -46, 90, -90, 135, 180]) expect(run.step(frame(stick(deg))).speed, `${deg}°`).toBe(WALK);
    // Still latched: point it ahead again and you run on.
    expect(run.step(frame(stick(10)))).toMatchObject({ speed: RUN, running: true });
  });

  it('comes from the stick\'s direction, not how far it is pushed', () => {
    const run = new Run();
    run.step(click());
    expect(run.step(frame(stick(20, 0.5))).speed).toBe(RUN);
    expect(run.step(frame(stick(60, 0.5))).speed).toBe(WALK);
  });

  it('ends when you let go of the stick, and the next click starts it again', () => {
    const run = new Run();
    run.step(click());
    expect(run.step(letGo)).toMatchObject({ running: false });
    expect(run.latched).toBe(false);
    // Pushing the stick again walks: the latch is gone.
    expect(run.step(frame())).toMatchObject({ speed: WALK, running: false });
    expect(run.step(click())).toMatchObject({ speed: RUN, running: true });
  });

  it('lets go only once the stick is back inside its deadzone', () => {
    const run = new Run();
    run.step(click());
    const inside = CONFIG.player.stickDeadzone * 0.9;
    const outside = CONFIG.player.stickDeadzone * 1.1;
    expect(run.step(frame(stick(0, outside))).running).toBe(true);
    expect(run.step(frame(stick(0, inside))).running).toBe(false);
    expect(run.latched).toBe(false);
  });

  it('does nothing on a click with the stick at rest', () => {
    const run = new Run();
    expect(run.step({ ...letGo, click: true })).toMatchObject({ speed: WALK, running: false });
    expect(run.latched).toBe(false);
    expect(run.step(frame()).running).toBe(false);
  });

  it('latches on a click with the stick pointing back, and runs once it points ahead', () => {
    const run = new Run();
    expect(run.step(click(stick(180)))).toMatchObject({ speed: WALK, running: false });
    expect(run.latched).toBe(true);
    expect(run.step(frame(stick(0))).running).toBe(true);
  });

  it('stays latched on a second click', () => {
    const run = new Run();
    run.step(click());
    run.step(frame());
    expect(run.step(click())).toMatchObject({ running: true });
  });

  it('stops when you stop it (a death, a wake, a teleport)', () => {
    const run = new Run();
    run.step(click());
    run.stop();
    expect(run.latched).toBe(false);
    expect(run.step(frame()).running).toBe(false);
  });
});

describe('never while fighting', () => {
  it('ignores a click while anything is fighting you', () => {
    const run = new Run();
    expect(run.step(click({ fighting: true }))).toEqual({ speed: WALK, running: false, caught: false });
    expect(run.latched).toBe(false);
    // Once the fight is over, holding the stick doesn't start a run: the click was spent.
    expect(run.step(frame()).running).toBe(false);
  });

  it('ends on the spot when a fight starts, catching you once', () => {
    const run = new Run();
    run.step(click());
    expect(run.step(frame({ fighting: true }))).toEqual({ speed: WALK, running: false, caught: true });
    expect(run.latched).toBe(false);
    // Caught once, not every frame of the fight.
    expect(run.step(frame({ fighting: true })).caught).toBe(false);
    // And the fight over, you walk until the next click.
    expect(run.step(frame()).running).toBe(false);
    expect(run.step(click()).running).toBe(true);
  });

  it('catches you even while the stick points sideways, since the latch is what ends', () => {
    const run = new Run();
    run.step(click(stick(90)));
    expect(run.step(frame({ ...stick(90), fighting: true })).caught).toBe(true);
  });

  it("doesn't catch you when you weren't running", () => {
    const run = new Run();
    expect(run.step(frame({ fighting: true })).caught).toBe(false);
    run.step(click());
    run.step(letGo);
    expect(run.step(frame({ fighting: true })).caught).toBe(false);
  });
});

describe("the run's vignette fade", () => {
  const time = CONFIG.run.vignette.fade;

  it('fades in over about 0.2 s while you run, and out as quickly', () => {
    expect(time).toBeCloseTo(0.2);
    let level = 0;
    level = fadeLevel(level, true, time / 2);
    expect(level).toBeCloseTo(0.5);
    level = fadeLevel(level, true, time);
    expect(level).toBe(1);
    level = fadeLevel(level, false, time / 4);
    expect(level).toBeCloseTo(0.75);
    level = fadeLevel(level, false, time);
    expect(level).toBe(0);
  });
});
