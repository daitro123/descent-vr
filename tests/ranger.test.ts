import { Group, PerspectiveCamera, Vector3, type WebGLRenderer } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { statsAt } from '../src/adventureState';
import { ABILITY, abilitiesAt, PLAYABLE, resourceOf } from '../src/classes';
import { AbilityClock } from '../src/combat/abilities';
import type { CombatFx } from '../src/combat/combat';
import type { Arrow } from '../src/combat/projectiles';
import { Mark } from '../src/combat/mark';
import { RangerKit, scatteredBy } from '../src/combat/ranger';
import { arrowDamage, bentOnto, fanOf, shotOf } from '../src/combat/shots';
import { Traps } from '../src/combat/traps';
import { Ward } from '../src/combat/ward';
import { CONFIG } from '../src/config';
import type { Enemy, EnemyContext } from '../src/enemies/enemy';
import { createEnemy } from '../src/enemies/kinds';
import { AttackTokens } from '../src/enemies/tokens';
import { mulberry32 } from '../src/maps/forest/noise';
import type { EnemyKind } from '../src/models/characters';
import { Player } from '../src/player/player';
import { costWith, type Spent } from '../src/talents';
import { Arena } from '../src/world/arena';
import type { Ground } from '../src/world/ground';

// The ranger (abilities tickets 21 and 22) at the combat seam: a real RangerKit, its
// bow in a pair of hands posed by code, loosing at real enemies; the ward's
// rule; Snare Trap's traps under real enemies' feet; Volley's fan, Scatter's
// gust and Hunter's Mark on real enemies. The tests check what a player would
// see: what an arrow deals, whom it hits, whether an enemy's arrow comes back,
// whether a grunt stops, how far a gust sends it, what a mark adds. And
// (ticket 26) what each talent of Marksmanship and Survival changes, and
// their tier-3 abilities, Trueshot and Explosive Trap.

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

/** A ranger at the origin looking down −Z (with talents `spent`): the hands the kit reads, and what it lands. */
function ranger(level = 3, spent: Spent = {}) {
  const hands = { left: { grip: new Group(), trigger: 0, squeeze: 0 }, right: { grip: new Group(), trigger: 0, squeeze: 0 } };
  const head = new Vector3(0, 1.6, 0);
  const player = {
    klass: 'ranger',
    input: { hands, pulse: () => {} },
    headPosition: (out: Vector3) => out.copy(head),
    feetPosition: (out: Vector3) => out.set(head.x, 0, head.z),
    alive: true,
    holdingTools: false,
    stats: statsAt(level, undefined, 'ranger', spent),
    ground: flatGround,
    abilities: new AbilityClock(),
  } as unknown as Player;
  const nothing = () => {};
  const fx = { text: { spawn: nothing }, particles: { burst: nothing }, shockwaves: { trigger: nothing } } as unknown as CombatFx;
  const landed: { enemy: Enemy; damage: number; head: boolean }[] = [];
  const reflected: Arrow[] = [];
  const bled: { enemy: Enemy; damage: number; seconds: number }[] = [];
  const kit = new RangerKit(
    player,
    fx,
    {
      land: (enemy, damage, isHead, _at, push) => {
        landed.push({ enemy, damage, head: isHead });
        return enemy.takeHit(damage, push, { from: head });
      },
      evade: nothing,
      bleed: (enemy, damage, seconds) => void bled.push({ enemy, damage, seconds }),
      reflect: (arrow) => void reflected.push(arrow),
    },
    new Group(),
  );
  // The bow held out ahead at chest height, the fist's line upright (grip −Z turned up).
  hands.left.grip.position.set(0, 1.25, -0.5);
  hands.left.grip.quaternion.set(S, 0, 0, S);
  return { kit, player, hands, head, landed, reflected, bled };
}
type Ranger = ReturnType<typeof ranger>;

/** Run the kit a frame (and the enemies, if any). */
function frame(r: Ranger, enemies: Enemy[] = [], ctx?: EnemyContext): void {
  r.kit.update(DT, enemies);
  if (ctx) for (const e of enemies) e.update(DT, ctx);
}

/** The flat distance between two points. */
const flat = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

/** An aim from the eyes: the right hand facing `hand`, the eyes looking along `gaze`. */
const aimAt = (hand: Vector3, gaze = hand) => ({ from: new Vector3(0, 1.4, 0), hand: hand.clone().normalize(), gaze: gaze.clone().normalize() });
const sees = () => true;

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

describe('Volley', () => {
  it('costs 35 focus on a 12 s cooldown, drawn as a Z from level 6', () => {
    expect(ABILITY.volley).toMatchObject({ level: 6, use: 'z', cost: 35, cooldown: 12 });
    expect(abilitiesAt('ranger', 5)).not.toContain('volley');
    expect(abilitiesAt('ranger', 6)).toContain('volley');
  });

  it('fans five ways 20° across, level, the middle one along the aim', () => {
    const dir = new Vector3(0, 0.2, -1).normalize();
    const ways = fanOf(dir, 5, 20);
    expect(ways).toHaveLength(5);
    expect(ways[2].angleTo(dir)).toBeCloseTo(0);
    const deg = (a: Vector3, b: Vector3) => (Math.atan2(a.x, -a.z) - Math.atan2(b.x, -b.z)) * (180 / Math.PI);
    expect(Math.abs(deg(ways[0], ways[4]))).toBeCloseTo(20);
    expect(Math.abs(deg(ways[0], ways[1]))).toBeCloseTo(5);
    for (const w of ways) {
      expect(w.y).toBeCloseTo(dir.y); // level: each rises as the aim does
      expect(w.length()).toBeCloseTo(1);
    }
  });

  it('splits the next arrow into five at 60% each, and the one after is a single arrow again', () => {
    const r = ranger(6);
    expect(r.kit.volley()).toBe('cast');
    expect(r.kit.volleyed).toBe(true);
    shoot(r, 0.8);
    expect(r.kit.shots.flying).toHaveLength(5);
    const full = 30 * r.player.stats.damage;
    expect(r.kit.shots.flying.every((s) => s.volley && Math.abs(s.damage - full * R.volley.share) < 1e-9)).toBe(true);
    expect(r.kit.stats).toMatchObject({ shots: 1, volleys: 1 });
    expect(r.kit.volleyed).toBe(false);
    shoot(r, 0.8);
    expect(r.kit.shots.flying).toHaveLength(6);
    expect(r.kit.shots.flying.at(-1)!.damage).toBeCloseTo(full);
  });

  it('lands an arrow on each of a camp of five standing in an arc 8 m off', () => {
    const ctx = context(0);
    const r = ranger(6);
    const camp = [-10, -5, 0, 5, 10].map((deg) => {
      const a = (deg * Math.PI) / 180;
      return ready('grunt', Math.sin(a) * 8, -Math.cos(a) * 8, ctx);
    });
    r.kit.volley();
    shoot(r, 0.8, camp);
    fly(r, 0.5, camp);
    expect(new Set(r.landed.map((l) => l.enemy))).toEqual(new Set(camp));
    expect(r.landed.every((l) => l.damage === Math.round(30 * r.player.stats.damage * R.volley.share))).toBe(true);
  });

  it('waits one at a time with Power Shot: neither goes on an arrow the other is on', () => {
    const r = ranger(6);
    frame(r);
    expect(r.kit.volley()).toBe('cast');
    expect(r.kit.volley()).toBe('waiting');
    r.hands.right.grip.position.copy(r.kit.bow.stringRest);
    r.hands.right.trigger = 1;
    frame(r);
    expect(r.kit.powerShot()).toBe('waiting');
    r.kit.clear();
    expect(r.kit.volleyed).toBe(false);
    frame(r);
    r.hands.right.grip.position.copy(r.kit.bow.stringRest);
    frame(r);
    expect(r.kit.powerShot()).toBe('cast');
    expect(r.kit.volley()).toBe('waiting');
    expect(r.player.abilities.waitingOn()).toBe('powerShot');
  });
});

describe('Scatter', () => {
  const S = R.scatter;
  const at = (x: number, z: number, radius = 0.33) => ({ position: new Vector3(x, 0, z), def: { radius }, hittable: true });

  it('costs 25 focus on a 15 s cooldown, drawn as a V from level 8', () => {
    expect(ABILITY.scatter).toMatchObject({ level: 8, use: 'v', cost: 25, cooldown: 15 });
    expect(abilitiesAt('ranger', 7)).not.toContain('scatter');
    expect(abilitiesAt('ranger', 8)).toContain('scatter');
  });

  it('reaches every body within 3 m in the 90° in front of you, and nothing behind, aside or further', () => {
    const feet = new Vector3();
    const facing = new Vector3(0, 0, -1);
    const ahead = at(0, -2);
    const edge = at(0, -3.2); // its body's edge 2.87 m off
    const quarter = at(Math.sin(Math.PI / 4) * 2, -Math.cos(Math.PI / 4) * 2); // 45° off
    const pressed = at(0.2, 0.1); // against you, behind or not
    const behind = at(0, 2);
    const aside = at(Math.sin(Math.PI / 3) * 2, -Math.cos(Math.PI / 3) * 2); // 60° off
    const far = at(0, -3.5);
    const down = { ...at(0, -1), hittable: false };
    const got = scatteredBy(feet, facing, [far, behind, edge, aside, quarter, ahead, pressed, down], S);
    expect(got[0]).toBe(pressed);
    expect(new Set(got)).toEqual(new Set([pressed, ahead, quarter, edge]));
    expect(got.at(-1)).toBe(edge);
  });

  it('knocks a grunt in front of you back about 1.5 m and staggers it, unhurt; one behind you is left alone', () => {
    const ctx = context(0);
    const r = ranger(8);
    const grunt = ready('grunt', 0, -1.5, ctx);
    const behind = ready('grunt', 0, 1.5, ctx);
    const from = grunt.position.clone();
    const back = behind.position.clone();
    expect(r.kit.scatter([grunt, behind], new Vector3(0, 0, -1))).toBe('cast');
    expect(grunt.state).toBe('stagger');
    for (let t = 0; t < 0.8; t += DT) frame(r, [grunt, behind], ctx);
    expect(flat(grunt.position, from)).toBeGreaterThan(1.3);
    expect(flat(grunt.position, from)).toBeLessThan(1.7);
    expect(grunt.position.z).toBeLessThan(from.z); // away from you
    expect(grunt.hp).toBe(CONFIG.enemies.grunt.hp);
    expect(behind.state).not.toBe('stagger');
    expect(r.kit.stats.scattered).toBe(1);
    // The one behind walked at you, it wasn't pushed away.
    expect(behind.position.z).toBeLessThanOrEqual(back.z + 1e-6);
  });

  it('knocks every one in reach at once, each straight away from you', () => {
    const ctx = context(0);
    const r = ranger(8);
    const left = ready('grunt', -1.2, -1.2, ctx);
    const right = ready('grunt', 1.2, -1.2, ctx);
    const was = [left.position.clone(), right.position.clone()];
    r.kit.scatter([left, right], new Vector3(0, 0, -1));
    for (let t = 0; t < 0.8; t += DT) frame(r, [left, right], ctx);
    expect(left.position.x).toBeLessThan(was[0].x - 0.8);
    expect(right.position.x).toBeGreaterThan(was[1].x + 0.8);
    expect([left.state, right.state]).toEqual(['stagger', 'stagger']);
  });

  it('moves a brute a third as far, and only nudges the Warden, which it doesn’t stagger', () => {
    const ctx = context(0);
    const r = ranger(8);
    const brute = ready('brute', -1.2, -1.5, ctx);
    const warden = ready('warden', 1.8, -1.8, ctx);
    const was = [brute.position.clone(), warden.position.clone()];
    r.kit.scatter([brute, warden], new Vector3(0, 0, -1));
    expect(brute.state).toBe('stagger');
    expect(warden.state).not.toBe('stagger');
    // Measured by the push alone: the enemies aren't stepped, so neither walks.
    const kicked = [brute.knockback.length(), warden.knockback.length()];
    expect(kicked[0]).toBeCloseTo(S.knockback * 0.35);
    expect(kicked[1]).toBeCloseTo(S.knockback * 0.15);
    expect(kicked[1] / 8).toBeLessThan(0.3); // under 30 cm of slide
    expect(was[0].equals(brute.position)).toBe(true);
  });

  it('leaves a rooted grunt where the vines hold it, staggered', () => {
    const ctx = context(0);
    const r = ranger(8);
    const grunt = ready('grunt', 0, -1.5, ctx);
    grunt.afflict('rooted', 4);
    const from = grunt.position.clone();
    r.kit.scatter([grunt], new Vector3(0, 0, -1));
    for (let t = 0; t < 0.8; t += DT) frame(r, [grunt], ctx);
    expect(flat(grunt.position, from)).toBeLessThan(1e-6);
    expect(grunt.state).toBe('stagger');
  });
});

describe("Hunter's Mark", () => {
  const H = R.huntersMark;

  it('costs 20 focus on a 1 s cooldown, drawn as an S from level 10', () => {
    expect(ABILITY.huntersMark).toMatchObject({ level: 10, use: 's', cost: 20, cooldown: 1 });
    expect(abilitiesAt('ranger', 9)).not.toContain('huntersMark');
    expect(abilitiesAt('ranger', 10)).toEqual(['powerShot', 'snareTrap', 'volley', 'scatter', 'huntersMark']);
  });

  it('marks the enemy the right hand faces, else the one you look at; none out of sight, out of reach or off to the side', () => {
    const ctx = context(0);
    const r = ranger(10);
    const ahead = ready('grunt', 0, -10, ctx);
    const off = ready('grunt', 10 * Math.sin(Math.PI / 6), -10 * Math.cos(Math.PI / 6), ctx); // 30° off
    const foes = [ahead, off];
    expect(r.kit.huntersMark(aimAt(new Vector3(0, 0, -1)), foes, sees)).toBe('cast');
    expect(r.kit.mark.target).toBe(ahead);
    // The hand pointing at the floor: where you look decides.
    expect(r.kit.huntersMark(aimAt(new Vector3(0, -1, 0), off.position.clone().setY(1.4)), foes, sees)).toBe('cast');
    expect(r.kit.mark.target).toBe(off);
    // Behind a wall, beyond 30 m, or 30° off with nothing where you look: nothing to mark.
    expect(r.kit.huntersMark(aimAt(new Vector3(0, 0, -1)), foes, () => false)).toBe('no target');
    const far = ready('grunt', 0, -(H.range + 3), ctx);
    expect(r.kit.huntersMark(aimAt(new Vector3(0, 0, -1)), [far, off], sees)).toBe('no target');
    expect(r.kit.stats.marks).toBe(2);
  });

  it('makes your arrows deal 15% more to the marked enemy only', () => {
    const ctx = context(0);
    const r = ranger(10);
    const marked = ready('brute', 0, -8, ctx);
    r.kit.huntersMark(aimAt(new Vector3(0, 0, -1)), [marked], sees);
    shoot(r, 0.8, [marked]);
    fly(r, 0.5, [marked]);
    const damage = 30 * r.player.stats.damage;
    expect(r.landed).toHaveLength(1);
    expect(r.landed[0].damage).toBe(arrowDamage(damage * (1 + H.bonus), false, marked));
    expect(r.landed[0].damage).toBeGreaterThan(arrowDamage(damage, false, marked));
    expect(r.kit.stats.markedHits).toBe(1);
    expect(r.kit.mark.of(marked)).toBeCloseTo(1 + H.bonus);
    expect(r.kit.mark.of(ready('grunt', 3, -8, ctx))).toBe(1);
  });

  it('lasts 20 s, one enemy at a time, and ends when it dies', () => {
    const ctx = context(0);
    const mark = new Mark(null);
    const a = ready('grunt', 0, -5, ctx);
    const b = ready('grunt', 2, -5, ctx);
    mark.set(a, H.time);
    mark.update(H.time - 0.1);
    expect(mark.target).toBe(a);
    expect(mark.outline.visible).toBe(true);
    mark.update(0.2);
    expect(mark.target).toBeNull();
    expect(mark.of(a)).toBe(1);
    expect(mark.outline.visible).toBe(false);
    // Marking another lets the first go; marking it again starts its time over.
    mark.set(a, H.time);
    mark.set(b, H.time);
    expect([mark.of(a), mark.of(b)]).toEqual([1, 1 + H.bonus]);
    mark.update(15);
    mark.set(b, H.time);
    expect(mark.remaining).toBeCloseTo(H.time);
    b.takeHit(999, new Vector3());
    mark.update(DT);
    expect(mark.target).toBeNull();
  });

  it('shows its outline over walls within the effects budget: 2 draw calls, under 500 triangles, no light', () => {
    const ctx = context(0);
    const parent = new Group();
    const mark = new Mark(parent);
    const warden = ready('warden', 0, -6, ctx);
    mark.set(warden, H.time);
    mark.update(0.5);
    expect(parent.children).toEqual([mark.outline, mark.chevron]);
    expect(mark.triangles).toBeLessThan(500);
    expect(mark.outline.material.depthTest).toBe(false);
    expect(mark.chevron.material.depthTest).toBe(false);
    // Round its body, a little wider, and the chevron over its head.
    expect(flat(mark.outline.position, warden.position)).toBeLessThan(0.3);
    expect(mark.outline.scale.x).toBeGreaterThan(warden.def.radius);
    const head = new Vector3();
    warden.headSphere(head);
    expect(mark.chevron.position.y).toBeGreaterThan(head.y);
  });
});

describe('Marksmanship', () => {
  const T = CONFIG.talents.trees.ranger.marksmanship;

  it('Steady Aim: arrows deal 5% more a point', () => {
    for (const n of [0, 1, 3]) {
      const r = ranger(8, { steadyAim: n });
      shoot(r, 0.8);
      expect(r.kit.shots.flying[0].damage).toBeCloseTo(30 * r.player.stats.damage * (1 + 0.05 * n));
    }
  });

  it("Keen Eye: a head hit's multiplier +0.2 a point", () => {
    const grunt = { exposed: 0, def: CONFIG.enemies.grunt };
    const crit = CONFIG.enemies.grunt.critMultiplier;
    expect(arrowDamage(30, true, grunt, 0.4)).toBe(Math.round(30 * (crit + 0.4)));
    expect(arrowDamage(30, false, grunt, 0.4)).toBe(30);
    const ctx = context(0);
    const r = ranger(8, { keenEye: 2 });
    const brute = ready('brute', 0, -6, ctx);
    const head = new Vector3();
    brute.headSphere(head);
    // A head shot: loosed from just in front of its face.
    r.kit.shots.loose(new Vector3(head.x, head.y, head.z + 0.4), new Vector3(0, 0, -1), 1, r.player.stats.damage);
    fly(r, 0.3, [brute]);
    expect(r.landed[0].head).toBe(true);
    expect(r.landed[0].damage).toBe(Math.round(30 * r.player.stats.damage * (CONFIG.enemies.brute.critMultiplier + 0.4)));
  });

  it('Efficiency: Power Shot costs 15, then 10', () => {
    expect([0, 1, 2].map((n) => ranger(8, { steadyAim: 3, efficiency: n }).player.stats.talents['cost:powerShot'])).toEqual([0, -5, -10]);
    expect(costWith('powerShot', statsAt(8, undefined, 'ranger', { steadyAim: 3, efficiency: 2 }).talents)).toBe(10);
  });

  it('Swift Arrows: arrows fly 10% faster a point, and so drop less over the same way', () => {
    expect(shotOf(1, 0.3).speed).toBeCloseTo(42 * 1.3);
    const drop = (spent: Spent) => {
      const r = ranger(8, spent);
      shoot(r, 0.8);
      const shot = r.kit.shots.flying[0];
      const from = shot.pos.clone();
      while (from.distanceTo(shot.pos) < 20) fly(r, DT);
      return from.y - shot.pos.y;
    };
    expect(ranger(8, { steadyAim: 3, swiftArrows: 3 }).player.stats.talents.arrowSpeed).toBeCloseTo(0.3);
    expect(drop({ steadyAim: 3, swiftArrows: 3 })).toBeLessThan(drop({}) * 0.7);
  });

  it('Improved Volley: a Volley splits into 6, then 7', () => {
    for (const [n, arrows] of [
      [1, 6],
      [2, 7],
    ]) {
      const r = ranger(10, { steadyAim: 3, swiftArrows: 3, improvedVolley: n });
      r.kit.volley();
      shoot(r, 0.8);
      expect(r.kit.shots.flying).toHaveLength(arrows);
    }
  });

  it('Trueshot: 30 focus on a 20 s cooldown, in the triangle, lasting 8 s', () => {
    expect(ABILITY.trueshot).toMatchObject({ byTalent: true, level: 8, use: 'triangle', cost: 30, cooldown: 20 });
    expect(T.trueshot).toMatchObject({ time: 8, aimDeg: 8 });
  });

  it('Trueshot: an arrow loosed 6° off a grunt bends onto it; without it, the arrow misses', () => {
    const ctx = context(0);
    // 6° to the right of where the bow looses (down −Z), 12 m off.
    const off = (6 * Math.PI) / 180;
    const place = () => ready('grunt', Math.sin(off) * 12, -Math.cos(off) * 12, ctx);
    const plain = ranger(8);
    const a = place();
    shoot(plain, 0.8, [a]);
    fly(plain, 0.6, [a]);
    expect(plain.landed).toEqual([]);

    const r = ranger(8, { steadyAim: 3, swiftArrows: 3, trueshot: 1 });
    const b = place();
    expect(r.kit.trueshot()).toBe('cast');
    r.player.abilities.used('trueshot', T.trueshot.time);
    expect(r.kit.trueshooting).toBe(true);
    shoot(r, 0.8, [b]);
    expect(r.kit.shots.flying[0].trueshot).toBe(true);
    expect(r.kit.shots.flying[0].target).toBe(b); // toBe: a deep match of a whole enemy crawls
    fly(r, 0.6, [b]);
    expect(r.landed.map((l) => l.enemy)).toEqual([b]);
    expect(r.kit.stats).toMatchObject({ trueshots: 1, bent: 1 });
  });

  it('Trueshot: bends only onto an enemy within 8° and in sight, the one nearest the line', () => {
    const ctx = context(0);
    const from = new Vector3(0, 1.3, 0);
    const at = (deg: number, d: number) => ready('grunt', Math.sin((deg * Math.PI) / 180) * d, -Math.cos((deg * Math.PI) / 180) * d, ctx);
    const near = at(3, 8);
    const nearer = at(1, 14);
    const wide = at(-12, 6);
    expect(bentOnto(from, new Vector3(0, 0, -1), [near, nearer, wide], sees)).toBe(nearer);
    expect(bentOnto(from, new Vector3(0, 0, -1), [wide], sees)).toBeNull();
    expect(bentOnto(from, new Vector3(0, 0, -1), [near], () => false)).toBeNull();
  });

  it('Trueshot: its arrows pass a raised guard that stops a plain one', () => {
    const ctx = context(0);
    const guarded = (): Enemy => {
      const g = ready('grunt', 0, -6, ctx);
      Object.defineProperty(g, 'guarding', { get: () => true });
      g.guardCovers = () => true;
      return g;
    };
    const plain = ranger(8);
    const a = guarded();
    shoot(plain, 0.8, [a]);
    fly(plain, 0.4, [a]);
    expect(plain.landed).toEqual([]);
    expect(a.hp).toBe(a.maxHp);

    const r = ranger(8, { steadyAim: 3, swiftArrows: 3, trueshot: 1 });
    const b = guarded();
    r.player.abilities.used('trueshot', T.trueshot.time);
    shoot(r, 0.8, [b]);
    fly(r, 0.4, [b]);
    expect(r.landed.map((l) => l.enemy)).toEqual([b]);
    expect(r.kit.stats).toMatchObject({ trueshots: 1, pastGuard: 1 });
    // Once it's over, arrows are plain again.
    r.player.abilities.tick(T.trueshot.time);
    expect(r.kit.trueshooting).toBe(false);
    shoot(r, 0.8, [b]);
    expect(r.kit.shots.flying.at(-1)!.trueshot).toBe(false);
  });
});

describe('Survival', () => {
  const T = CONFIG.talents.trees.ranger.survival;

  it('Trapper: Snare Trap roots a second longer a point', () => {
    const ctx = context(0);
    const r = ranger(8, { trapper: 3 });
    r.kit.snareTrap();
    expect(r.kit.traps.laid[0].root).toBe(R.snareTrap.root + 3);
    const grunt = ready('grunt', 0, 0, ctx);
    frame(r, [grunt]);
    expect(grunt.afflictedFor('rooted')).toBeCloseTo(R.snareTrap.root + 3);
  });

  it('Fleet Foot: the dash comes back 0.3 s sooner a point', () => {
    const dashed = (spent: Spent) => {
      const camera = new PerspectiveCamera();
      camera.position.set(0, 1.6, 0);
      const renderer = { xr: { getControllerGrip: () => new Group() } } as unknown as WebGLRenderer;
      const player = new Player(camera, renderer, flatGround, 'ranger');
      player.stats = statsAt(8, undefined, 'ranger', spent);
      const button = () => ({ value: 0, pressed: false, touched: false });
      const pad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 6 }, button), hapticActuators: [] };
      player.input.hands.left.source = { gamepad: pad, handedness: 'left' } as unknown as XRInputSource;
      pad.buttons[5] = { value: 1, pressed: true, touched: true };
      player.update(DT);
      return player.dashCooldown;
    };
    expect(dashed({})).toBeCloseTo(CONFIG.dash.cooldown);
    expect(dashed({ fleetFoot: 2 })).toBeCloseTo(CONFIG.dash.cooldown - 0.6);
  });

  it('Serrated Tips: an arrow hit bleeds the enemy for 2 a point over 4 s', () => {
    const ctx = context(0);
    const r = ranger(8, { trapper: 3, serratedTips: 3 });
    const brute = ready('brute', 0, -6, ctx);
    shoot(r, 0.8, [brute]);
    fly(r, 0.4, [brute]);
    expect(r.bled).toEqual([{ enemy: brute, damage: 6 * r.player.stats.damage, seconds: T.serratedTips.time }]);
    // Without it, no bleed.
    const plain = ranger(8);
    const other = ready('brute', 0, -6, ctx);
    shoot(plain, 0.8, [other]);
    fly(plain, 0.4, [other]);
    expect(plain.bled).toEqual([]);
  });

  it('Steady Ward: the ward holds, and sends arrows back, 0.3 s longer a point', () => {
    const W = CONFIG.ranger.ward;
    const ward = new Ward();
    ward.longer = 0.6;
    ward.update(DT, true, true);
    let held = 0;
    while (ward.update(DT, true, true) === null) held += DT;
    expect(held).toBeCloseTo(W.hold + 0.6, 1);
    ward.clear();
    ward.update(DT, true, true);
    ward.update(W.reflect + 0.5, true, true);
    expect(ward.fresh).toBe(true);
    // The kit sets it from your talents.
    const r = ranger(8, { trapper: 3, steadyWard: 2 });
    frame(r);
    expect(r.kit.ward.longer).toBeCloseTo(0.6);
  });

  it('Improved Scatter: the gust slows whom it reaches by 30% a point for 4 s', () => {
    const ctx = context(0);
    const r = ranger(10, { trapper: 3, serratedTips: 3, improvedScatter: 2 });
    const grunt = ready('grunt', 0, -1.5, ctx);
    r.kit.scatter([grunt], new Vector3(0, 0, -1));
    expect(grunt.slowness).toBeCloseTo(0.6);
    expect(grunt.afflictedFor('slowed')).toBeCloseTo(T.improvedScatter.time);
    const plain = ranger(10);
    const other = ready('grunt', 0, -1.5, ctx);
    plain.kit.scatter([other], new Vector3(0, 0, -1));
    expect(other.slowness).toBe(0);
  });

  it('Explosive Trap: 30 focus on a 15 s cooldown, in the triangle', () => {
    expect(ABILITY.explosiveTrap).toMatchObject({ byTalent: true, level: 8, use: 'triangle', cost: 30, cooldown: 15 });
  });

  it('Explosive Trap: bursts under the first grunt to step on it, for 25 on each within 2.5 m, knocking them back', () => {
    const ctx = context(0);
    const r = ranger(1, { trapper: 3, serratedTips: 3, explosiveTrap: 1 });
    expect(r.kit.explosiveTrap()).toBe('cast');
    expect(r.kit.traps.laid).toEqual([expect.objectContaining({ kind: 'explosive', root: 0 })]);
    const on = ready('grunt', 0.2, 0, ctx);
    const near = ready('grunt', 1.8, 0.8, ctx);
    const far = ready('grunt', 0, -4, ctx);
    const was = [on.position.clone(), near.position.clone()];
    frame(r, [far, on, near]);
    expect(r.kit.traps.laid).toHaveLength(0);
    expect(new Set(r.landed.map((l) => l.enemy))).toEqual(new Set([on, near]));
    expect(r.landed.every((l) => l.damage === T.explosiveTrap.damage)).toBe(true);
    expect(on.hp).toBe(CONFIG.enemies.grunt.hp - T.explosiveTrap.damage);
    expect(on.afflictedFor('rooted')).toBe(0);
    expect(far.hp).toBe(far.maxHp);
    expect(r.kit.stats).toMatchObject({ explosives: 1, bursts: 1, burst: 2 });
    for (let t = 0; t < 0.8; t += DT) frame(r, [far, on, near], ctx);
    expect(flat(near.position, new Vector3())).toBeGreaterThan(flat(was[1], new Vector3()) + 0.8);
  });

  it('Explosive Trap: lies with the snares, at most three in all, the oldest ending', () => {
    const r = ranger(10, { trapper: 3, serratedTips: 3, explosiveTrap: 1 });
    r.kit.snareTrap();
    r.kit.snareTrap();
    r.kit.explosiveTrap();
    r.kit.explosiveTrap();
    expect(r.kit.traps.laid.map((t) => t.kind)).toEqual(['snare', 'explosive', 'explosive']);
    r.kit.traps.render();
    expect(r.kit.traps.mesh.count).toBe(3);
    expect(r.kit.traps.mesh.instanceColor).not.toBeNull();
  });
});
