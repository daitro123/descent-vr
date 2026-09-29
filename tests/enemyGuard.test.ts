import { Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bladeTarget, sweepBlade } from '../src/combat/strike';
import { CONFIG, type GuardConfig } from '../src/config';
import type { Enemy, EnemyContext, PlayerSword } from '../src/enemies/enemy';
import { Archer, Brute, DUELIST, Grunt, Warden } from '../src/enemies/kinds';
import type { GuardSide } from '../src/enemies/poses';
import { AttackTokens } from '../src/enemies/tokens';
import { Arena } from '../src/world/arena';
import type { Ground } from '../src/world/ground';

// Enemies that guard raise their weapon on the side your blade comes from.
// These drive real enemies (rig, guard poses, timings) against a simulated
// blade, and check that a guarded side stops a swing and the open side doesn't.

const DT = 1 / 72;
const DIST = 1.2; // player stands this far in front of the enemy (which faces +Z)
const openGround: Ground = { resolve: () => false, lineOfSight: () => true, heightAt: () => 0, steer: Arena.prototype.steer, arrowStops: () => false };

// Out of the grave and standing its ground: no walking or attacking, so only the guard moves it.
class TestGrunt extends Grunt {
  ready() {
    this.state = 'move';
    this.visual.position.y = 0;
  }
  protected think(dt: number, ctx: EnemyContext) {
    this.faceToward(ctx.playerFeet, dt);
  }
  swingAt(ctx: EnemyContext) {
    this.startAttack(this.def.attacks[0], ctx);
  }
}
class TestWarden extends Warden {
  ready() {
    this.state = 'move';
    this.visual.position.y = 0;
  }
  protected think(dt: number, ctx: EnemyContext) {
    this.faceToward(ctx.playerFeet, dt);
  }
}
class TestBrute extends Brute {
  ready() {
    this.state = 'move';
    this.visual.position.y = 0;
  }
  protected think(dt: number, ctx: EnemyContext) {
    this.faceToward(ctx.playerFeet, dt);
  }
}
class TestArcher extends Archer {
  ready() {
    this.state = 'move';
    this.visual.position.y = 0;
  }
  protected think(dt: number, ctx: EnemyContext) {
    this.faceToward(ctx.playerFeet, dt);
  }
}
type Ready = Enemy & { ready(): void };

function context(sword: PlayerSword | null): EnemyContext {
  return {
    playerFeet: new Vector3(0, 0, DIST),
    playerHead: new Vector3(0, 1.6, DIST),
    playerSword: sword,
    ground: openGround,
    meleeTokens: new AttackTokens(9),
    rangedTokens: new AttackTokens(9),
    sweep: () => null,
    slam: () => {},
    shoot: () => {},
    nock: () => {},
    summon: () => {},
    telegraph: () => {},
  };
}

/** A 0.88 m blade centred on `mid`, pointing along `dir`, its tip moving at `speed`. */
function blade(mid: Vector3, dir: Vector3, speed: number): PlayerSword {
  const half = dir.clone().normalize().multiplyScalar(0.44);
  return { base: mid.clone().sub(half), tip: mid.clone().add(half), speed };
}

/** Where a player's blade sits as a swing starts, against an enemy `s` times human height. */
function windup(side: GuardSide, s = 1): PlayerSword {
  if (side === 'high') return blade(new Vector3(0, 2.15 * s, 0.75), new Vector3(0, 0.3, -1), 3); // raised overhead
  if (side === 'low') return blade(new Vector3(0.45, 0.55 * s, 0.8), new Vector3(0.2, -0.5, -1), 3); // swung at the legs
  const x = side === 'left' ? 0.55 : -0.55; // your forehand comes from its left
  return blade(new Vector3(x, 1.4 * s, 0.75), new Vector3(x * 0.4, 1, -0.3), 3);
}
const WINDUP: Record<GuardSide, PlayerSword> = { left: windup('left'), right: windup('right'), high: windup('high'), low: windup('low') };

function spawn<T extends Ready>(e: T): T {
  e.ready();
  const idle = context(null);
  for (let i = 0; i < 36; i++) e.update(DT, idle); // settle into its idle pose
  return e;
}

function run(e: Enemy, ctx: EnemyContext, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) e.update(DT, ctx);
}

/** Roll every guard chance in the enemy's favour (and hold for the shortest time). */
function alwaysGuard(): void {
  vi.spyOn(Math, 'random').mockReturnValue(0);
}

afterEach(() => void vi.restoreAllMocks());

describe('raising a guard', () => {
  it.each(['left', 'right', 'high', 'low'] as GuardSide[])('raises the %s guard against a blade on that side', (side) => {
    alwaysGuard();
    const g = spawn(new TestGrunt('grunt', 0, 0));
    g.update(DT, context(WINDUP[side]));
    expect(g.guarding).toBe(true);
    expect(g.guardSide).toBe(side);
  });

  it('ignores a blade that is barely moving or out of reach', () => {
    alwaysGuard();
    const g = spawn(new TestGrunt('grunt', 0, 0));
    run(g, context({ ...WINDUP.left, speed: CONFIG.guard.threatSpeed * 0.5 }), 0.5);
    expect(g.guarding).toBe(false);
    const far = blade(new Vector3(0.5, 1.4, 2.4), new Vector3(0, 1, 0), 3);
    run(g, context(far), 0.5);
    expect(g.guarding).toBe(false);
  });

  it('decides once per swing: a failed read stays failed until the blade slows', () => {
    const g = spawn(new TestGrunt('grunt', 0, 0));
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    g.update(DT, context(WINDUP.left));
    random.mockReturnValue(0);
    run(g, context(WINDUP.left), 0.3);
    expect(g.guarding).toBe(false);
    g.update(DT, context(null)); // swing over
    g.update(DT, context(WINDUP.left)); // the next one
    expect(g.guarding).toBe(true);
  });

  it('is only for kinds with a guard: brutes and archers never block', () => {
    alwaysGuard();
    for (const e of [spawn(new TestBrute('brute', 0, 0)), spawn(new TestArcher('archer', 0, 0))]) {
      run(e, context(WINDUP.left), 0.3);
      expect(e.guarding, e.kind).toBe(false);
    }
  });

  it('follows your blade to the other side, a reaction time behind', () => {
    alwaysGuard();
    const g = spawn(new TestGrunt('grunt', 0, 0));
    const { reaction } = CONFIG.enemies.grunt.guard;
    g.update(DT, context(WINDUP.left));
    run(g, context(WINDUP.right), reaction * 0.5);
    expect(g.guardSide).toBe('left');
    run(g, context(WINDUP.right), reaction * 0.6);
    expect(g.guardSide).toBe('right');
  });

  it('drops the guard when its hold runs out, then waits out its cooldown', () => {
    alwaysGuard();
    const g = spawn(new TestGrunt('grunt', 0, 0));
    const { hold, cooldown }: GuardConfig = CONFIG.enemies.grunt.guard;
    g.update(DT, context(WINDUP.left));
    run(g, context(WINDUP.left), hold[0] + 0.05);
    expect(g.guarding).toBe(false);
    // A fresh swing straight away: still cooling down.
    g.update(DT, context(null));
    run(g, context(WINDUP.left), cooldown * 0.5);
    expect(g.guarding).toBe(false);
    g.update(DT, context(null));
    run(g, context(null), cooldown * 0.6);
    g.update(DT, context(WINDUP.left));
    expect(g.guarding).toBe(true);
  });

  it('a shield bash (dropGuard) knocks it down', () => {
    alwaysGuard();
    const g = spawn(new TestGrunt('grunt', 0, 0));
    g.update(DT, context(WINDUP.left));
    g.dropGuard();
    expect(g.guarding).toBe(false);
  });
});

/**
 * Swing a blade through the enemy, frame by frame, and report the first thing
 * it met, applying the guard rule Combat uses.
 */
function swing(e: Enemy, frames: [PlayerSword, PlayerSword][]): 'guarded' | 'head' | 'body' | null {
  const target = bladeTarget();
  const motion = new Vector3();
  for (const [from, to] of frames) {
    const res = sweepBlade(from.base, from.tip, to.base, to.tip, CONFIG.sword.bladeHalfWidth, 5, e.bladeTarget(target));
    if (!res) continue;
    motion.subVectors(to.tip, from.tip);
    return res.zone === 'guard' || e.guardCovers(res.point, motion) ? 'guarded' : res.zone;
  }
  return null;
}

/**
 * A horizontal slash at height `y`, sweeping across the enemy from its `from`
 * side; from a player standing behind it if `behind`.
 */
function slash(from: 'left' | 'right', y = 1.25, behind = false): [PlayerSword, PlayerSword][] {
  // The blade pivots about the player's shoulder, tip toward the enemy.
  const z = behind ? -DIST : DIST;
  const shoulder = new Vector3(from === 'left' ? 0.2 : -0.2, y, z);
  const frames: [PlayerSword, PlayerSword][] = [];
  const sign = from === 'left' ? 1 : -1;
  let prev: PlayerSword | null = null;
  for (let i = 0; i <= 16; i++) {
    const a = sign * (1.1 - (2.2 * i) / 16); // from its side, across, to the other
    const dir = new Vector3(Math.sin(a), 0, -Math.cos(a) * Math.sign(z));
    const base = shoulder.clone().addScaledVector(dir, 0.45);
    const cur = { base, tip: base.clone().addScaledVector(dir, 0.88), speed: 5 };
    if (prev) frames.push([prev, cur]);
    prev = cur;
  }
  return frames;
}

/** An overhead chop at head height, from pointing up behind the player to forward and down. */
function chop(e: Enemy): [PlayerSword, PlayerSword][] {
  const head = new Vector3();
  e.headSphere(head);
  const shoulder = new Vector3(0, head.y - 0.1, DIST);
  const frames: [PlayerSword, PlayerSword][] = [];
  let prev: PlayerSword | null = null;
  for (let i = 0; i <= 16; i++) {
    const a = -0.4 + (2.4 * i) / 16; // 0 is straight up, π/2 straight at the enemy
    const dir = new Vector3(0, Math.cos(a), -Math.sin(a));
    const base = shoulder.clone().addScaledVector(dir, 0.45);
    const cur = { base, tip: base.clone().addScaledVector(dir, 0.88), speed: 5 };
    if (prev) frames.push([prev, cur]);
    prev = cur;
  }
  return frames;
}

/**
 * A stab from your hand at `hand` into the point `at` on the enemy's front:
 * the blade slides along its own length, point first, to 0.1 m past `at`.
 */
function stab(at: Vector3, hand = new Vector3(0.25, 1.15, DIST)): [PlayerSword, PlayerSword][] {
  const dir = at.clone().sub(hand).normalize();
  const frames: [PlayerSword, PlayerSword][] = [];
  let prev: PlayerSword | null = null;
  for (let i = 0; i <= 12; i++) {
    const tip = at.clone().addScaledVector(dir, -0.6 + (0.7 * i) / 12);
    const cur = { base: tip.clone().addScaledVector(dir, -0.88), tip, speed: 4 };
    if (prev) frames.push([prev, cur]);
    prev = cur;
  }
  return frames;
}

describe.each([
  ['grunt', () => new TestGrunt('grunt', 0, 0)],
  ['bandit thug with a sword', () => new TestGrunt('grunt', 0, 0, { family: 'bandit' })],
  ['bandit thug with a hatchet', () => new TestGrunt('grunt', 0, 0, { family: 'bandit', variant: 1 })],
  ['warden', () => new TestWarden('warden', 0, 0)],
] as const)('%s guarding', (_name, make) => {
  /** Guard `side`, give the pose time to come up, and hold still. */
  function guarding(side: GuardSide): Enemy {
    alwaysGuard();
    const e = spawn(make());
    const w = windup(side, e.rig.proportions.hipY / 0.92);
    e.update(DT, context(w));
    run(e, context(w), 0.3);
    expect(e.guardSide).toBe(side);
    return e;
  }
  const chest = (e: Enemy) => 1.25 * (e.rig.proportions.hipY / 0.92);
  const legs = (e: Enemy) => 0.5 * (e.rig.proportions.hipY / 0.92);
  const hips = (e: Enemy) => e.rig.proportions.hipY;

  it('an unguarded enemy takes the slash', () => {
    const e = spawn(make());
    expect(swing(e, slash('left', chest(e)))).toBe('body');
  });

  it('the left guard stops a slash from its left, not one from its right', () => {
    const e = guarding('left');
    expect(swing(e, slash('left', chest(e)))).toBe('guarded');
    expect(swing(e, slash('right', chest(e)))).not.toBe('guarded');
  });

  it('the right guard stops a slash from its right, not one from its left', () => {
    const e = guarding('right');
    expect(swing(e, slash('right', chest(e)))).toBe('guarded');
    expect(swing(e, slash('left', chest(e)))).not.toBe('guarded');
  });

  it('the high guard stops a chop, but a slash gets under it', () => {
    const e = guarding('high');
    expect(swing(e, chop(e))).toBe('guarded');
    expect(swing(e, slash('left', chest(e)))).not.toBe('guarded');
  });

  it('a side guard leaves the legs open', () => {
    const e = guarding('left');
    expect(swing(e, slash('left', legs(e)))).toBe('body');
  });

  it('the low guard stops a slash at the legs from either side, but not one at the chest', () => {
    const e = guarding('low');
    expect(swing(e, slash('left', legs(e)))).toBe('guarded');
    expect(swing(e, slash('right', legs(e)))).toBe('guarded');
    expect(swing(e, slash('left', chest(e)))).toBe('body');
  });

  it('leaves no gap at the belt: the side and low guards both reach the hips', () => {
    for (const side of ['left', 'low'] as GuardSide[]) {
      const e = guarding(side);
      const s = e.rig.proportions.hipY / 0.92;
      for (const y of [hips(e) - 0.08 * s, hips(e), hips(e) + 0.08 * s]) {
        expect(swing(e, slash('left', y)), `${side} guard, slash at ${y.toFixed(2)} m`).toBe('guarded');
      }
    }
  });

  it('a slash from behind gets past the guard on that side', () => {
    const e = guarding('left');
    expect(swing(e, slash('left', chest(e), true))).toBe('body');
  });

  it('a side guard does not stop a chop', () => {
    const e = guarding('left');
    const r = swing(e, chop(e));
    expect(r).not.toBe('guarded');
    expect(r).not.toBeNull();
  });
});

describe('the duelist (?duel)', () => {
  const make = () => new TestGrunt('grunt', 0, 0, { def: DUELIST });

  it('reads about nine swings in ten', () => {
    // Evenly spread rolls in place of Math.random, so the count is repeatable.
    let n = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => (n++ * 0.6180339887) % 1);
    let raised = 0;
    for (let i = 0; i < 100; i++) {
      const e = spawn(make());
      e.update(DT, context(WINDUP.left));
      if (e.guarding) raised++;
    }
    expect(raised).toBeGreaterThanOrEqual(88);
    expect(raised).toBeLessThan(97);
  });

  it('follows your blade to the other side almost at once, where a grunt takes a beat', () => {
    alwaysGuard();
    const duelist = spawn(make());
    const grunt = spawn(new TestGrunt('grunt', 0, 0));
    for (const e of [duelist, grunt]) {
      e.update(DT, context(WINDUP.left));
      run(e, context(WINDUP.right), 0.1);
    }
    expect(duelist.guardSide).toBe('right');
    expect(grunt.guardSide).toBe('left');
  });

  it('keeps its guard up through a flurry', () => {
    alwaysGuard();
    const e = spawn(make());
    e.update(DT, context(WINDUP.left));
    run(e, context(WINDUP.left), 2.4);
    expect(e.guarding).toBe(true);
  });

  it('drops its own wind-up to meet your swing', () => {
    alwaysGuard();
    const e = spawn(make());
    const idle = context(null);
    e.swingAt(idle);
    run(e, idle, 0.2);
    expect(e.attacking).toBe(true);
    e.update(DT, context(WINDUP.left));
    expect(e.guarding).toBe(true);
    expect(e.attack).toBeNull();
  });

  it('reads each new swing afresh: a missed read only lasts until you turn back', () => {
    const e = spawn(make());
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    e.update(DT, context({ ...WINDUP.left, swing: 1 }));
    random.mockReturnValue(0);
    run(e, context({ ...WINDUP.left, swing: 1 }), 0.2);
    expect(e.guarding).toBe(false);
    e.update(DT, context({ ...WINDUP.right, swing: 2 })); // backhand, without the blade ever slowing
    expect(e.guarding).toBe(true);
  });

  it('a shield bash that breaks its guard leaves it open until it recovers', () => {
    alwaysGuard();
    const e = spawn(make());
    e.update(DT, context(WINDUP.left));
    e.dropGuard();
    e.expose(1);
    run(e, context({ ...WINDUP.left, swing: 5 }), 0.5);
    expect(e.guarding).toBe(false);
  });

  it('drops its guard to its legs when your swing goes low', () => {
    alwaysGuard();
    const e = spawn(make());
    e.update(DT, context(WINDUP.left));
    run(e, context(WINDUP.left), 0.3);
    expect(swing(e, slash('left', 0.5))).toBe('body'); // the left guard leaves the legs open
    run(e, context(WINDUP.low), 0.12);
    expect(e.guardSide).toBe('low');
    expect(swing(e, slash('left', 0.5))).toBe('guarded');
  });

  /** Stab it, a frame at a time, as it watches the point come in. */
  function stabbed(e: Enemy, at: Vector3): ReturnType<typeof swing> {
    const frames = stab(at);
    e.update(DT, context(frames[0][0]));
    for (const [from, to] of frames) {
      const r = swing(e, [[from, to]]);
      if (r) return r;
      e.update(DT, context(to));
    }
    return null;
  }

  it.each([
    ['the chest', 1.25],
    ['the belly', 1.0],
    ['the hips', 0.9],
    ['a thigh', 0.7],
  ])('stops a stab at %s', (_where, y) => {
    alwaysGuard();
    expect(stabbed(spawn(make()), new Vector3(0, y, 0.3))).toBe('guarded');
  });

  it('reads a stab by its point: from your right hand at its right side, it guards its right', () => {
    alwaysGuard();
    const e = spawn(make());
    expect(stabbed(e, new Vector3(-0.15, 1.1, 0.3))).toBe('guarded');
    expect(e.guardSide).toBe('right');
  });

  it('stops a slash from its left, then one from its right straight after', () => {
    alwaysGuard();
    const e = spawn(make());
    e.update(DT, context(WINDUP.left));
    run(e, context(WINDUP.left), 0.3);
    expect(swing(e, slash('left'))).toBe('guarded');
    run(e, context(WINDUP.right), 0.12);
    expect(swing(e, slash('right'))).toBe('guarded');
  });
});
