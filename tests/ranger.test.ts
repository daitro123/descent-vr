import { Group, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { statsAt } from '../src/adventureState';
import { ABILITY, abilitiesAt, PLAYABLE, resourceOf } from '../src/classes';
import { AbilityClock } from '../src/combat/abilities';
import type { CombatFx } from '../src/combat/combat';
import type { Arrow } from '../src/combat/projectiles';
import { RangerKit } from '../src/combat/ranger';
import { arrowDamage, shotOf } from '../src/combat/shots';
import { Traps } from '../src/combat/traps';
import { Ward } from '../src/combat/ward';
import { CONFIG } from '../src/config';
import type { Enemy, EnemyContext } from '../src/enemies/enemy';
import { createEnemy } from '../src/enemies/kinds';
import { AttackTokens } from '../src/enemies/tokens';
import { mulberry32 } from '../src/maps/forest/noise';
import type { EnemyKind } from '../src/models/characters';
import type { Player } from '../src/player/player';
import { Arena } from '../src/world/arena';
import type { Ground } from '../src/world/ground';

// The ranger (abilities ticket 21) at the combat seam: a real RangerKit, its
// bow in a pair of hands posed by code, loosing at real enemies; the ward's
// rule; Snare Trap's traps under real enemies' feet. The tests check what a
// player would see: what an arrow deals, whom it hits, whether an enemy's
// arrow comes back, whether a grunt stops.

const DT = 1 / 72;
const A = CONFIG.ranger.arrow;
const R = CONFIG.classes.ranger.abilities;
const S = Math.SQRT1_2;

const flatGround: Ground = { resolve: () => false, lineOfSight: () => true, heightAt: () => 0, steer: Arena.prototype.steer, arrowStops: (p) => p.y <= 0 };

beforeEach(() => void vi.spyOn(Math, 'random').mockImplementation(mulberry32(21)));
afterEach(() => void vi.restoreAllMocks());

/** A world with you standing at (0, `z`), where its enemies stand. */
function context(z: number): EnemyContext {
  return {
    playerFeet: new Vector3(0, 0, z),
    playerHead: new Vector3(0, 1.6, z),
    playerSword: null,
    ground: flatGround,
    meleeTokens: new AttackTokens(CONFIG.tokens.melee, CONFIG.tokens.meleeGap),
    rangedTokens: new AttackTokens(CONFIG.tokens.ranged, CONFIG.tokens.rangedGap),
    sweep: () => null,
    slam: () => {},
    shoot: () => {},
    nock: () => {},
    summon: () => {},
    telegraph: () => {},
  };
}

/** An arena enemy of `kind` at (x, z), risen and on its feet. */
function ready(kind: EnemyKind, x: number, z: number, ctx: EnemyContext): Enemy {
  const e = createEnemy(kind, x, z);
  for (let t = 0; t < 4 && e.state !== 'move'; t += DT) e.update(DT, ctx);
  expect(e.state).toBe('move');
  return e;
}

/** A ranger at the origin looking down −Z: the hands the kit reads, and what it lands. */
function ranger(level = 3) {
  const hands = { left: { grip: new Group(), trigger: 0, squeeze: 0 }, right: { grip: new Group(), trigger: 0, squeeze: 0 } };
  const head = new Vector3(0, 1.6, 0);
  const player = {
    klass: 'ranger',
    input: { hands, pulse: () => {} },
    headPosition: (out: Vector3) => out.copy(head),
    feetPosition: (out: Vector3) => out.set(head.x, 0, head.z),
    alive: true,
    holdingTools: false,
    stats: statsAt(level, undefined, 'ranger'),
    ground: flatGround,
    abilities: new AbilityClock(),
  } as unknown as Player;
  const nothing = () => {};
  const fx = { text: { spawn: nothing }, particles: { burst: nothing }, shockwaves: { trigger: nothing } } as unknown as CombatFx;
  const landed: { enemy: Enemy; damage: number; head: boolean }[] = [];
  const reflected: Arrow[] = [];
  const kit = new RangerKit(
    player,
    fx,
    {
      land: (enemy, damage, isHead, _at, push) => {
        landed.push({ enemy, damage, head: isHead });
        return enemy.takeHit(damage, push, { from: head });
      },
      evade: nothing,
      reflect: (arrow) => void reflected.push(arrow),
    },
    new Group(),
  );
  // The bow held out ahead at chest height, the fist's line upright (grip −Z turned up).
  hands.left.grip.position.set(0, 1.25, -0.5);
  hands.left.grip.quaternion.set(S, 0, 0, S);
  return { kit, player, hands, head, landed, reflected };
}
type Ranger = ReturnType<typeof ranger>;

/** Run the kit a frame (and the enemies, if any). */
function frame(r: Ranger, enemies: Enemy[] = [], ctx?: EnemyContext): void {
  r.kit.update(DT, enemies);
  if (ctx) for (const e of enemies) e.update(DT, ctx);
}

/** Put the draw hand on the string, hold the trigger, draw back `pull` m behind the arrow rest, and let go. */
function shoot(r: Ranger, pull: number, enemies: Enemy[] = [], powerShot = false): void {
  const { hands, kit } = r;
  frame(r, enemies);
  hands.right.grip.position.copy(kit.bow.stringRest);
  hands.right.trigger = 1;
  frame(r, enemies);
  expect(kit.drawing).toBe(true);
  hands.right.grip.position.copy(kit.bow.rest).add(new Vector3(0, 0, pull));
  frame(r, enemies);
  if (powerShot) expect(kit.powerShot()).toBe('cast');
  hands.right.trigger = 0;
  frame(r, enemies);
  expect(kit.drawing).toBe(false);
}

/** Let the arrows fly `seconds`. */
function fly(r: Ranger, seconds: number, enemies: Enemy[] = []): void {
  for (let t = 0; t < seconds; t += DT) frame(r, enemies);
}

describe('the draw', () => {
  it('sets damage and speed in step, from the least draw to full', () => {
    expect(shotOf(0)).toEqual({ damage: A.minDamage, speed: A.minSpeed });
    expect(shotOf(1)).toEqual({ damage: 30, speed: 42 });
    expect(shotOf(0.5)).toEqual({ damage: 18, speed: 28 });
    expect(shotOf(2)).toEqual(shotOf(1));
  });

  it('crits on the head at the enemy’s own multiplier, and hits an exposed enemy harder', () => {
    const grunt = { exposed: 0, def: CONFIG.enemies.grunt };
    expect(arrowDamage(30, false, grunt)).toBe(30);
    expect(arrowDamage(30, true, grunt)).toBe(Math.round(30 * CONFIG.enemies.grunt.critMultiplier));
    expect(arrowDamage(30, false, { ...grunt, exposed: 1 })).toBe(Math.round(30 * CONFIG.sword.exposedMultiplier));
  });

  it('nocks at the string with the trigger held, and looses a full draw for 30 at 42 m/s', () => {
    const r = ranger(1);
    shoot(r, 0.8);
    const [shot] = r.kit.shots.flying;
    expect(r.kit.stats.shots).toBe(1);
    expect(shot.damage).toBeCloseTo(30);
    expect(shot.vel.length()).toBeCloseTo(42, 0);
    expect(shot.vel.z).toBeLessThan(0); // away, from the nock through the rest
  });

  it('looses a half draw for less and slower, and puts away a draw too short to loose', () => {
    const r = ranger(1);
    const { brace, fullDraw } = CONFIG.ranger.bow;
    shoot(r, brace + (fullDraw - brace) / 2);
    expect(r.kit.shots.flying[0].damage).toBeCloseTo(18);
    expect(r.kit.shots.flying[0].vel.length()).toBeCloseTo(28, 0);
    shoot(r, brace + 0.02);
    expect(r.kit.shots.flying).toHaveLength(1);
  });

  it('never runs out of arrows', () => {
    const r = ranger(1);
    for (let i = 0; i < 40; i++) shoot(r, 0.8);
    expect(r.kit.stats.shots).toBe(40);
  });

  it('multiplies by your damage: a level-5 ranger’s full draw does 30 times it', () => {
    const r = ranger(5);
    shoot(r, 0.8);
    expect(r.kit.shots.flying[0].damage).toBeCloseTo(30 * r.player.stats.damage);
  });

  it('kills a grunt with two full-draw body shots', () => {
    const ctx = context(0);
    const r = ranger(1);
    const grunt = ready('grunt', 0, -8, ctx);
    shoot(r, 0.8, [grunt]);
    fly(r, 0.5, [grunt]);
    expect(r.landed).toEqual([{ enemy: grunt, damage: 30, head: false }]);
    expect(grunt.hp).toBe(15);
    shoot(r, 0.8, [grunt]);
    fly(r, 0.5, [grunt]);
    expect(grunt.alive).toBe(false);
  });
});

describe('Power Shot', () => {
  it('costs 20 focus on a 4 s cooldown, used on A/X while drawing', () => {
    expect(ABILITY.powerShot).toMatchObject({ level: 2, use: 'drawing', cost: 20, cooldown: 4 });
    const clock = new AbilityClock();
    expect(clock.refuses('powerShot', 19)).toBe('poor');
    clock.used('powerShot');
    expect(clock.refuses('powerShot', 100)).toBe('cooling');
  });

  it('only takes with an arrow on the string, and once an arrow', () => {
    const r = ranger();
    frame(r);
    expect(r.kit.powerShot()).toBe('no target');
    r.hands.right.grip.position.copy(r.kit.bow.stringRest);
    r.hands.right.trigger = 1;
    frame(r);
    expect(r.kit.powerShot()).toBe('cast');
    expect(r.kit.powerShot()).toBe('no target');
  });

  it('hits twice as hard and passes through the first enemy to hit one behind; a plain arrow stops at the first', () => {
    const ctx = context(0);
    const plain = ranger(1);
    const front = ready('grunt', 0, -5, ctx);
    const behind = ready('grunt', 0, -7, ctx);
    shoot(plain, 0.8, [front, behind]);
    fly(plain, 0.5, [front, behind]);
    expect(plain.landed.map((l) => l.enemy)).toEqual([front]);

    const powered = ranger(1);
    const a = ready('grunt', 0, -5, ctx);
    const b = ready('grunt', 0, -7, ctx);
    shoot(powered, 0.8, [a, b], true);
    fly(powered, 0.5, [a, b]);
    expect(powered.landed.map((l) => l.enemy)).toEqual([a, b]);
    expect(powered.landed.every((l) => l.damage === Math.round(30 * R.powerShot.multiplier))).toBe(true);
    expect(powered.kit.stats.pierced).toBe(1);
    // Double damage kills a grunt outright, and the next arrow is plain again.
    expect(a.alive).toBe(false);
    shoot(powered, 0.8, [b]);
    expect(powered.kit.shots.flying.at(-1)!.damage).toBeCloseTo(30);
  });

  it('passes through only one: a third enemy in line takes nothing', () => {
    const ctx = context(0);
    const r = ranger(1);
    const line = [ready('brute', 0, -5, ctx), ready('brute', 0, -7.5, ctx), ready('brute', 0, -10, ctx)];
    shoot(r, 0.8, line, true);
    fly(r, 0.6, line);
    expect(r.landed.map((l) => l.enemy)).toEqual(line.slice(0, 2));
  });
});

describe('the ward', () => {
  /** An arrow's step this frame, flying at the ward from 1 m out. */
  const through = (ward: Ward) => [ward.centre.clone().addScaledVector(ward.normal, 0.3), ward.centre.clone().addScaledVector(ward.normal, -0.3)] as const;

  it('rises on a squeeze, lasts at most its hold, and comes back after its cooldown', () => {
    const W = CONFIG.ranger.ward;
    const ward = new Ward();
    expect(ward.update(DT, true, true)).toBe('raised');
    let held = 0;
    while (ward.update(DT, true, true) === null) held += DT;
    expect(held).toBeCloseTo(W.hold, 1);
    expect(ward.up).toBe(false);
    expect(ward.update(W.cooldown - 0.1, true, true)).toBeNull();
    expect(ward.update(0.2, true, true)).toBe('raised');
    // Letting go drops it; so does losing the bow hand.
    expect(ward.update(DT, false, true)).toBe('dropped');
    ward.clear();
    ward.update(DT, true, true);
    expect(ward.update(DT, true, false)).toBe('dropped');
  });

  it('sends an arrow back in its first moments and stops one after; one that misses the disc passes', () => {
    const ward = new Ward();
    ward.place(new Vector3(0, 1.3, -0.5), new Vector3(0, 1.6, 0));
    ward.update(DT, true, true);
    expect(ward.meets(...through(ward))).toBe('reflect');
    ward.update(CONFIG.ranger.ward.reflect + 0.01, true, true);
    expect(ward.meets(...through(ward))).toBe('stop');
    const [a, b] = through(ward);
    const aside = new Vector3(CONFIG.ranger.ward.radius + 0.1, 0, 0);
    expect(ward.meets(a.clone().add(aside), b.clone().add(aside))).toBeNull();
    ward.update(DT, false, true);
    expect(ward.meets(...through(ward))).toBeNull();
  });

  it('meets an enemy’s arrow before your body: parried (sent back) while fresh, glanced (stopped) after', () => {
    const r = ranger();
    r.hands.left.squeeze = 1;
    frame(r);
    const { ward } = r.kit;
    const arrow = { pos: new Vector3() } as Arrow;
    expect(r.kit.arrowContact(...through(ward), arrow)).toBe('parried');
    expect(r.reflected).toEqual([arrow]);
    for (let t = 0; t < CONFIG.ranger.ward.reflect + 0.05; t += DT) frame(r);
    expect(r.kit.arrowContact(...through(ward), arrow)).toBe('glanced');
    expect(r.kit.stats).toMatchObject({ wardReturns: 1, wardStops: 1 });
  });
});

describe('Snare Trap', () => {
  it('costs 20 focus on a 10 s cooldown, drawn as a ring from level 3', () => {
    expect(ABILITY.snareTrap).toMatchObject({ level: 3, use: 'ring', cost: 20, cooldown: 10 });
    expect(abilitiesAt('ranger', 2)).toEqual(['powerShot']);
    expect(abilitiesAt('ranger', 3)).toEqual(['powerShot', 'snareTrap']);
  });

  it('roots the grunt that walks onto it for 4 s, without hurting it, and is gone', () => {
    const ctx = context(0);
    const r = ranger();
    expect(r.kit.snareTrap()).toBe('cast');
    expect(r.kit.traps.laid).toHaveLength(1);
    // Drop it, step back 4 m, and the grunt coming for you walks over it.
    ctx.playerFeet.set(0, 0, 4);
    ctx.playerHead.set(0, 1.6, 4);
    const grunt = ready('grunt', 0, -5, ctx);
    let t = 0;
    for (; t < 8 && grunt.afflictedFor('rooted') === 0; t += DT) frame(r, [grunt], ctx);
    expect(grunt.afflictedFor('rooted')).toBeCloseTo(R.snareTrap.root, 1);
    expect(grunt.hp).toBe(CONFIG.enemies.grunt.hp);
    expect(r.kit.traps.laid).toHaveLength(0);
    expect(r.kit.stats.rooted).toBe(1);
    const at = grunt.position.clone();
    for (let s = 0; s < 3; s += DT) frame(r, [grunt], ctx);
    expect(Math.hypot(grunt.position.x - at.x, grunt.position.z - at.z)).toBeLessThan(1e-6);
  });

  it('holds a brute half as long and the Warden not at all', () => {
    const ctx = context(20);
    const traps = new Traps(null);
    const brute = ready('brute', 0, 0, ctx);
    const held: number[] = [];
    traps.lay(new Vector3(0, 0, 0), R.snareTrap.root, R.snareTrap.lasts);
    traps.update(DT, [brute], (_t, _e, h) => held.push(h));
    const warden = ready('warden', 5, 0, ctx);
    traps.lay(new Vector3(5, 0, 0), R.snareTrap.root, R.snareTrap.lasts);
    traps.update(DT, [warden], (_t, _e, h) => held.push(h));
    expect(held).toEqual([R.snareTrap.root / 2, 0]);
    expect(warden.afflictedFor('rooted')).toBe(0);
  });

  it('lies 30 s unsprung, never springs for one still rising, and a fourth ends the oldest', () => {
    const traps = new Traps(null);
    const rising = createEnemy('grunt', 0, 0);
    expect(rising.hittable).toBe(false);
    traps.lay(new Vector3(0, 0, 0), R.snareTrap.root, R.snareTrap.lasts);
    traps.update(DT, [rising], () => expect.unreachable());
    traps.update(R.snareTrap.lasts - 1, [], () => {});
    expect(traps.laid).toHaveLength(1);
    traps.update(1.01, [], () => {});
    expect(traps.laid).toHaveLength(0);
    for (let i = 0; i < 4; i++) traps.lay(new Vector3(i, 0, 0), R.snareTrap.root, R.snareTrap.lasts);
    expect(traps.laid.map((t) => t.at.x)).toEqual([1, 2, 3]);
  });
});

describe('the class', () => {
  it('is playable, and its bar is focus: 100, full, 10 a second', () => {
    expect(PLAYABLE).toContain('ranger');
    const focus = resourceOf('ranger', 10);
    expect(focus).toEqual({ kind: 'focus', size: 100, start: 100, refill: { fighting: 10, calm: 10 } });
  });
});
