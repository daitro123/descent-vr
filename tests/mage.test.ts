import { Group, PerspectiveCamera, Vector3, type WebGLRenderer } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { statsAt } from '../src/adventureState';
import type { AttackConfig } from '../src/config';
import { ABILITY, abilitiesAt, PLAYABLE, resourceOf } from '../src/classes';
import type { Bolt } from '../src/combat/bolts';
import { Combat, type CombatFx, combatStats, resetCombatStats } from '../src/combat/combat';
import { blizzardAt } from '../src/combat/blizzard';
import { IceBarrier } from '../src/combat/iceBarrier';
import { afterBlock, blinkTo, boltDamage, boltShape, chainFrom, wardRises, within } from '../src/combat/mage';
import { CONFIG } from '../src/config';
import type { Enemy, EnemyContext } from '../src/enemies/enemy';
import { createEnemy } from '../src/enemies/kinds';
import { AttackTokens } from '../src/enemies/tokens';
import type { Particles } from '../src/fx/particles';
import { mulberry32 } from '../src/maps/forest/noise';
import type { EnemyKind } from '../src/models/characters';
import { MageHands } from '../src/player/mage';
import { Player, refill } from '../src/player/player';
import type { Spent } from '../src/talents';
import { Arena } from '../src/world/arena';
import type { Ground } from '../src/world/ground';

// The mage (abilities ticket 23) at the combat seam: a real Player, Combat and
// the mage's hands, driven through a stand-in controller's buttons and grip
// poses, against real enemies. The tests check what a player would see: the
// bolt a throw makes and where it lands, what the ward stops and what it
// costs, where a blink puts you, who Frost Nova freezes and whom a
// Fireball's burst reaches; and (ticket 24) whom a Frostbolt slows, whom
// Chain Lightning arcs to, and what Blizzard does to whom stands in it; and
// (ticket 26) what each talent of Fire and Frost changes, and their tier-3
// abilities, Pyroblast and Ice Barrier.

const DT = 1 / 72;
const M = CONFIG.mage;
const N = CONFIG.classes.mage.abilities.frostNova;
const F = CONFIG.classes.mage.abilities.fireball;
const FB = CONFIG.classes.mage.abilities.frostbolt;
const CL = CONFIG.classes.mage.abilities.chainLightning;
const BZ = CONFIG.classes.mage.abilities.blizzard;

const flat: Ground = { resolve: () => false, lineOfSight: () => true, heightAt: () => 0, steer: Arena.prototype.steer, arrowStops: (p) => p.y <= 0 };

/** A controller as the XR input reads it: its axes and buttons, set by the test. */
function pad() {
  const button = () => ({ value: 0, pressed: false, touched: false });
  return { axes: [0, 0, 0, 0], buttons: Array.from({ length: 6 }, button), hapticActuators: [] };
}
type Pad = ReturnType<typeof pad>;
const TRIGGER = 0;
const SQUEEZE = 1;
const PRIMARY = 4;
const SECONDARY = 5;
const set = (p: Pad, i: number, value: number) => Object.assign(p.buttons[i], { value, pressed: value > 0.5 });

const silent = { spawn: () => {}, burst: () => {}, trigger: () => {} };

/** A level-1 mage standing at the origin looking down −Z, with every base ability (the arena's), in a world of `enemies`. */
function mage(ground: Ground = flat) {
  const camera = new PerspectiveCamera();
  camera.position.set(0, 1.6, 0);
  const renderer = { xr: { getControllerGrip: () => new Group() } } as unknown as WebGLRenderer;
  const player = new Player(camera, renderer, ground, 'mage');
  const pads = { left: pad(), right: pad() };
  player.input.hands.left.source = { gamepad: pads.left, handedness: 'left' } as unknown as XRInputSource;
  player.input.hands.right.source = { gamepad: pads.right, handedness: 'right' } as unknown as XRInputSource;
  const fx = { text: silent, particles: silent, shockwaves: silent } as unknown as CombatFx;
  const combat = new Combat(player, fx, { onEnemyHit: () => {}, onPlayerHurt: () => {}, hitStop: () => {} }, new Group());
  const hands = new MageHands(player, combat, silent as unknown as Particles);
  const enemies: Enemy[] = [];
  const ctx: EnemyContext = {
    playerFeet: new Vector3(),
    playerHead: new Vector3(0, 1.6, 0),
    playerSword: null,
    ground,
    meleeTokens: new AttackTokens(CONFIG.tokens.melee, CONFIG.tokens.meleeGap),
    rangedTokens: new AttackTokens(CONFIG.tokens.ranged, CONFIG.tokens.rangedGap),
    sweep: (e, a, pb, pt, b, t) => combat.sweep(e, a, pb, pt, b, t),
    slam: () => {},
    shoot: () => {},
    nock: () => {},
    summon: () => {},
    telegraph: () => {},
  };
  /** Where each grip is, in the rig's space. */
  const grip = (hand: 'left' | 'right', x: number, y: number, z: number, tilt = 0) => {
    const g = player.input.hands[hand].grip;
    g.position.set(x, y, z);
    g.quaternion.set(Math.sin(tilt / 2), 0, 0, Math.cos(tilt / 2));
  };
  grip('left', -0.35, 0.8, 0.1);
  grip('right', 0.35, 0.8, 0.1);
  /** One frame, as the arena steps it: you, your hands, A / X, Combat, then the enemies (held still unless `move`). */
  const frame = (move = false) => {
    player.fighting = enemies.some((e) => e.alive);
    player.update(DT);
    hands.update(DT);
    const { left, right } = player.input.hands;
    if (left.primaryPressed || right.primaryPressed) combat.press(enemies);
    combat.update(DT, enemies);
    player.feetPosition(ctx.playerFeet);
    player.headPosition(ctx.playerHead);
    ctx.meleeTokens.update(DT);
    ctx.rangedTokens.update(DT);
    for (const e of enemies) {
      const at = e.position.clone();
      e.update(DT, ctx);
      if (!move) e.position.x = at.x;
      if (!move) e.position.z = at.z;
    }
  };
  const run = (seconds: number, each?: () => void, move = false) => {
    for (let t = 0; t < seconds - 1e-9; t += DT) {
      each?.();
      frame(move);
    }
  };
  /** An enemy of `kind` at (x, z), risen and on its feet. */
  const add = (kind: EnemyKind, x: number, z: number): Enemy => {
    const e = createEnemy(kind, x, z);
    enemies.push(e);
    for (let t = 0; t < 4 && e.state === 'rising'; t += DT) e.update(DT, ctx);
    expect(e.hittable).toBe(true);
    return e;
  };
  return { player, combat, hands, pads, enemies, grip, frame, run, add };
}
type Mage = ReturnType<typeof mage>;

/**
 * A throw with the right hand: the trigger held `charge` s by the shoulder,
 * then the hand thrown forward (−Z) at `speed` m/s and the trigger let go
 * mid-throw. The bolt it made, if any.
 */
function throwBolt(m: Mage, { speed = 4.5, charge = 0.6 } = {}) {
  const before = m.combat.bolts.bolts.length;
  set(m.pads.right, TRIGGER, 1);
  m.run(charge, () => m.grip('right', 0.25, 1.5, 0.15));
  for (let i = 1; i <= 4; i++) {
    if (i === 4) set(m.pads.right, TRIGGER, 0);
    m.grip('right', 0.25, 1.5, 0.15 - i * speed * DT);
    m.frame();
  }
  return m.combat.bolts.bolts.length > before ? m.combat.bolts.bolts[m.combat.bolts.bolts.length - 1] : null;
}

beforeEach(() => {
  vi.spyOn(Math, 'random').mockImplementation(mulberry32(7));
  resetCombatStats();
});
afterEach(() => void vi.restoreAllMocks());

describe('the mage', () => {
  it('is a class a new character can be, with mana from level 1, Frost Nova at 2 and Fireball at 3', () => {
    expect(PLAYABLE).toContain('mage');
    expect(abilitiesAt('mage', 1)).toEqual([]);
    expect(abilitiesAt('mage', 3)).toEqual(['frostNova', 'fireball']);
    expect(ABILITY.frostNova.use).toBe('button');
    expect(ABILITY.fireball.use).toBe('ring');
    expect(statsAt(1, undefined, 'mage').resource).toMatchObject({ kind: 'mana', size: 100, start: 100 });
  });

  it('holds no sword, dashes never, and starts with a full pool', () => {
    const m = mage();
    m.frame();
    expect(m.player.sword.tip.valid).toBe(false);
    expect(m.player.dashes).toBe(false);
    expect(m.player.resource).toBe(100);
    expect(m.player.bar.kind).toBe('mana');
  });
});

describe("the throw's shaping", () => {
  it('makes a big slow orb of a gentle toss, a small fast bolt of a hard throw, and nothing of a still hand', () => {
    expect(boltShape(M.throw.minSpeed - 0.1)).toBeNull();
    const toss = boltShape(1.6)!;
    const hard = boltShape(5)!;
    expect(toss.radius).toBeGreaterThan(hard.radius);
    expect(toss.speed).toBeLessThan(hard.speed);
    expect(hard).toEqual({ speed: M.throw.fast.speed, radius: M.throw.fast.radius });
    expect(boltShape(M.throw.minSpeed)).toEqual({ speed: M.throw.slow.speed, radius: M.throw.slow.radius });
  });

  it('deals 7 for a tap and 20 at full charge', () => {
    expect(boltDamage(0)).toBe(7);
    expect(boltDamage(1)).toBe(20);
    expect(boltDamage(2)).toBe(20);
  });

  it('throws a full bolt from the wand’s tip along the throw, and three kill a grunt', () => {
    const m = mage();
    const grunt = m.add('grunt', 0, -4);
    const bolt = throwBolt(m)!;
    expect(bolt).not.toBeNull();
    expect(bolt.damage).toBe(20);
    expect(bolt.target).toBe(grunt);
    expect(bolt.hand).toBe('right');
    // Out of the tip, 0.32 m past the fist, and headed down −Z.
    expect(bolt.from.z).toBeLessThan(-0.25);
    expect(bolt.vel.z).toBeLessThan(0);
    m.run(1);
    expect(grunt.hp).toBe(grunt.def.hp - 20);
    throwBolt(m);
    m.run(1);
    throwBolt(m);
    m.run(1);
    expect(grunt.alive).toBe(false);
    expect(combatStats.boltHits).toBe(3);
  });

  it('shapes the thrown bolt by the throw, and a still or too-short hold casts nothing', () => {
    const m = mage();
    const toss = throwBolt(m, { speed: 1.6 })!;
    const hard = throwBolt(m, { speed: 5 })!;
    expect(toss.radius).toBeGreaterThan(hard.radius);
    expect(toss.vel.length()).toBeLessThan(hard.vel.length());
    expect(throwBolt(m, { speed: 0.3 })).toBeNull();
    expect(throwBolt(m, { charge: 0.05 })).toBeNull();
  });

  it('casts from the focus hand too, and walking adds nothing to a throw', () => {
    const m = mage();
    set(m.pads.left, TRIGGER, 1);
    m.run(0.6, () => {
      m.grip('left', -0.25, 1.5, 0.15);
      m.player.rig.position.z -= 3 * DT; // walking forward at 3 m/s, the hand still
    });
    set(m.pads.left, TRIGGER, 0);
    m.frame();
    expect(m.combat.bolts.bolts.length).toBe(0);
    set(m.pads.left, TRIGGER, 1);
    m.run(0.6, () => m.grip('left', -0.25, 1.5, 0.15));
    for (let i = 1; i <= 4; i++) {
      if (i === 4) set(m.pads.left, TRIGGER, 0);
      m.grip('left', -0.25, 1.5, 0.15 - i * 4.5 * DT);
      m.frame();
    }
    expect(m.combat.bolts.bolts.map((b) => b.hand)).toEqual(['left']);
  });

  it('stops a gesture while the right hand charges', () => {
    const m = mage();
    expect(m.hands.charging('right')).toBe(false);
    set(m.pads.right, TRIGGER, 1);
    m.frame();
    expect(m.hands.charging('right')).toBe(true);
  });
});

describe("the ward's mana", () => {
  /** An arrow from 5 m ahead at your chest, with the left grip held up in front of it (or not). */
  function arrow(m: Mage, ward: boolean) {
    set(m.pads.left, SQUEEZE, ward ? 1 : 0);
    const up = () => m.grip('left', -0.05, 1.3, -0.4, Math.PI / 4);
    up();
    m.frame();
    const warding = m.hands.warding;
    const before = { hp: m.player.hp, mana: m.player.resource, blocks: combatStats.blocks };
    m.combat.projectiles.fire(createEnemy('archer', 0, -12), new Vector3(0, 1.3, -5), new Vector3(0, 1.25, 0), 10);
    // Out of a fight the pool refills fast, so read the lowest it fell.
    let low = before.mana;
    m.run(1, () => {
      up();
      low = Math.min(low, m.player.resource);
    });
    return { warding, hurt: before.hp - m.player.hp, blocks: combatStats.blocks - before.blocks, mana: before.mana - low };
  }

  it('rises with 10 mana or more, and a block spends 10', () => {
    expect(wardRises(10)).toBe(true);
    expect(wardRises(9.9)).toBe(false);
    expect(afterBlock(100)).toBe(90);
    expect(afterBlock(4)).toBe(0);
  });

  it('stops an arrow for 10 mana and no health; let go, the same arrow hurts', () => {
    const m = mage();
    const warded = arrow(m, true);
    expect(warded).toMatchObject({ warding: true, hurt: 0, blocks: 1 });
    expect(warded.mana).toBeCloseTo(M.ward.cost, 0);
    const open = arrow(m, false);
    expect(open).toMatchObject({ warding: false, hurt: 10, blocks: 0 });
  });

  it("won't rise without the mana for a block, nor with no focus worn", () => {
    const m = mage();
    set(m.pads.left, SQUEEZE, 1);
    m.player.resource = 9;
    m.player.fighting = true;
    m.frame();
    expect(m.hands.warding).toBe(false);
    m.player.resource = 50;
    m.hands.dress('wand', false);
    m.frame();
    expect(m.hands.warding).toBe(false);
    m.hands.dress('wand', true);
    m.frame();
    expect(m.hands.warding).toBe(true);
  });

  it('holds 100 plus 2 a point of Intellect over 10, refilling 2 a second in a fight and 30 out of one', () => {
    expect(resourceOf('mage', 28).size).toBe(136);
    const bar = resourceOf('mage', 10);
    expect(refill(bar, 50, true, 1)).toBe(52);
    expect(refill(bar, 50, false, 1)).toBe(80);
    expect(refill(bar, 90, false, 1)).toBe(100);
  });
});

describe('the blink', () => {
  it('takes you 3.5 m back on B at once, not again until its cooldown is out, shown on the dash bar', () => {
    const m = mage();
    m.frame();
    const at = m.player.rig.position.clone();
    set(m.pads.right, SECONDARY, 1);
    m.frame();
    expect(m.player.rig.position.z - at.z).toBeCloseTo(3.5, 5);
    expect(m.player.dashCooldown).toBeGreaterThan(0);
    set(m.pads.right, SECONDARY, 0);
    m.frame();
    set(m.pads.right, SECONDARY, 1);
    m.frame();
    expect(m.player.rig.position.z - at.z).toBeCloseTo(3.5, 5);
    set(m.pads.right, SECONDARY, 0);
    m.run(M.blink.cooldown);
    set(m.pads.right, SECONDARY, 1);
    m.frame();
    expect(m.player.rig.position.z - at.z).toBeCloseTo(7, 5);
  });

  it('goes the stick’s way, and stops short of a wall', () => {
    const wall: Ground = { ...flat, lineOfSight: (a, b) => Math.max(a.x, b.x) < 2 };
    const out = new Vector3();
    expect(blinkTo(new Vector3(0, 0, 0), new Vector3(1, 0, 0), flat, out)).toBeCloseTo(3.5);
    expect(out.x).toBeCloseTo(3.5);
    expect(blinkTo(new Vector3(0, 0, 0), new Vector3(1, 0, 0), wall, out)).toBeCloseTo(1.75);
    expect(out.x).toBeLessThan(2);
    const pushes: Ground = { ...flat, resolve: (p) => (p.x > 1 ? ((p.x = 1), true) : false) };
    expect(blinkTo(new Vector3(0, 0, 0), new Vector3(1, 0, 0), pushes, out)).toBeCloseTo(1);
  });
});

describe("Frost Nova's freeze", () => {
  it('on A: every enemy within 3 m takes a little and is frozen for 4 s; farther off, nothing', () => {
    const m = mage();
    const near = m.add('grunt', 0, -2);
    const side = m.add('grunt', 2.5, 0);
    const far = m.add('grunt', 0, -6);
    m.frame();
    set(m.pads.left, PRIMARY, 1);
    m.frame();
    const dealt = Math.round(N.damage);
    expect(near.hp).toBe(near.def.hp - dealt);
    expect(side.hp).toBe(side.def.hp - dealt);
    expect(far.hp).toBe(far.def.hp);
    expect([near.state, side.state, far.state]).toEqual(['frozen', 'frozen', 'move']);
    expect(near.afflictedFor('frozen')).toBeCloseTo(N.freeze, 1);
    expect(m.player.resource).toBeCloseTo(100 - N.cost, 0);
    expect(combatStats.frozen).toBe(2);
    // It holds, then thaws.
    m.run(N.freeze - 0.2, undefined, true);
    expect(near.state).toBe('frozen');
    m.run(0.4, undefined, true);
    expect(near.state).not.toBe('frozen');
  });

  it('is broken by the next hit, which lands as it would', () => {
    const m = mage();
    const grunt = m.add('grunt', 0, -2.5);
    m.frame();
    expect(m.combat.use('frostNova')).toBe('cast');
    expect(grunt.state).toBe('frozen');
    throwBolt(m);
    m.run(0.5);
    expect(grunt.state).not.toBe('frozen');
    expect(grunt.hp).toBe(grunt.def.hp - N.damage - 20);
  });

  it('waits out its 20 s cooldown and needs 30 mana', () => {
    const m = mage();
    m.add('grunt', 0, -2);
    m.frame();
    expect(m.combat.use('frostNova')).toBe('cast');
    expect(m.combat.use('frostNova')).toBe('cooling');
    m.player.abilities.clear();
    m.player.resource = N.cost - 1;
    expect(m.combat.use('frostNova')).toBe('poor');
  });

  it('freezes a brute for half as long, and the Warden not at all', () => {
    const m = mage();
    const brute = m.add('brute', 0, -2);
    const warden = m.add('warden', 2, 0);
    m.frame();
    m.combat.use('frostNova');
    expect(brute.afflictedFor('frozen')).toBeCloseTo(N.freeze / 2, 1);
    expect(warden.afflictedFor('frozen')).toBe(0);
    expect(warden.hp).toBeLessThan(warden.def.hp);
  });

  it('does nothing on A before level 2', () => {
    const m = mage();
    m.player.stats = statsAt(1, undefined, 'mage');
    const grunt = m.add('grunt', 0, -2);
    m.frame();
    set(m.pads.right, PRIMARY, 1);
    m.frame();
    expect(grunt.state).not.toBe('frozen');
    expect(m.player.resource).toBe(100);
  });
});

describe("Fireball's burst", () => {
  it('puts the next bolt on fire for 15 mana, once: it waits until thrown', () => {
    const m = mage();
    expect(m.combat.use('fireball')).toBe('cast');
    expect(m.player.resource).toBe(100 - F.cost);
    expect(m.combat.use('fireball')).toBe('waiting');
    expect(m.player.resource).toBe(100 - F.cost);
    const bolt = throwBolt(m)!;
    expect(bolt.charge).toBe('fireball');
    expect(bolt.damage).toBe(20 * F.multiplier);
    expect(m.player.abilities.primed('fireball')).toBe(false);
    expect(throwBolt(m)!.charge).toBe(null);
  });

  it('burns the one it hits for 1.5 times, and bursts for 10 on every other enemy within 2 m', () => {
    const m = mage();
    const hit = m.add('grunt', 0, -5);
    const beside = m.add('grunt', 1.2, -5.5);
    const away = m.add('grunt', 4, -5);
    m.combat.use('fireball');
    throwBolt(m);
    m.run(1);
    expect(hit.hp).toBe(hit.def.hp - 30);
    expect(beside.hp).toBe(beside.def.hp - F.burst);
    expect(away.hp).toBe(away.def.hp);
    expect(combatStats.burnt).toBe(1);
  });

  it('bursts where it lands on the floor too', () => {
    const m = mage();
    const grunt = m.add('grunt', 0, -3);
    m.frame();
    m.combat.use('fireball');
    const dir = new Vector3(0, -1, -0.6).normalize();
    m.combat.castBolt('right', new Vector3(0, 1, -1.5), dir, { speed: 10, radius: 0.1 }, 1, 0xffffff);
    m.run(0.5);
    expect(grunt.hp).toBe(grunt.def.hp - F.burst);
  });

  it('reaches only bodies a blow can land on within its radius', () => {
    const at = new Vector3(0, 0, 0);
    const e = (x: number, hittable = true) => ({ position: new Vector3(x, 0, 0), def: { radius: 0.35 }, hittable });
    const [a, b, c, d] = [e(1), e(2.3), e(2.4), e(1, false)];
    expect(within(at, F.radius, [a, b, c, d])).toEqual([a, b]);
    expect(within(at, F.radius, [a, b], a)).toEqual([b]);
  });
});

describe("Frostbolt's slow", () => {
  it('puts frost on the next bolt for 15 mana; one ability waits on a bolt at a time', () => {
    const m = mage();
    expect(m.combat.use('frostbolt')).toBe('cast');
    expect(m.player.resource).toBe(100 - FB.cost);
    expect(m.combat.use('frostbolt')).toBe('waiting');
    expect(m.combat.use('fireball')).toBe('waiting');
    expect(m.combat.use('chainLightning')).toBe('waiting');
    expect(m.player.resource).toBe(100 - FB.cost);
    expect(m.player.abilities.waitingOn()).toBe('frostbolt');
    const bolt = throwBolt(m)!;
    expect(bolt.charge).toBe('frostbolt');
    expect(bolt.damage).toBe(20);
    expect(throwBolt(m)!.charge).toBe(null);
    expect(m.combat.use('fireball')).toBe('cast');
  });

  it('slows the enemy it hits by 40% for 5 s, once the blow has landed', () => {
    const m = mage();
    const grunt = m.add('grunt', 0, -5);
    const beside = m.add('grunt', 1.2, -5.5);
    m.combat.use('frostbolt');
    throwBolt(m);
    m.run(0.6);
    expect(grunt.hp).toBe(grunt.def.hp - 20);
    expect(grunt.slowness).toBeCloseTo(FB.slow, 5);
    expect(grunt.afflictedFor('slowed')).toBeGreaterThan(FB.time - 1);
    expect(beside.slowness).toBe(0);
    expect(combatStats.chilled).toBe(1);
    m.run(FB.time);
    expect(grunt.slowness).toBe(0);
  });

  it('slows a brute and the Warden by half as much', () => {
    for (const kind of ['brute', 'warden'] as const) {
      const m = mage();
      const e = m.add(kind, 0, -5);
      m.combat.use('frostbolt');
      throwBolt(m);
      m.run(0.6);
      expect(e.hp).toBeLessThan(e.def.hp);
      expect(e.slowness).toBeCloseTo(FB.slow / 2, 5);
    }
  });

  it('a plain bolt slows nothing', () => {
    const m = mage();
    const grunt = m.add('grunt', 0, -5);
    throwBolt(m);
    m.run(0.6);
    expect(grunt.hp).toBe(grunt.def.hp - 20);
    expect(grunt.slowness).toBe(0);
  });
});

describe("Chain Lightning's arcs", () => {
  it('arcs from the one it hits on to two more within 4 m, at 70% each, for 30 mana and 8 s', () => {
    const m = mage();
    const hit = m.add('grunt', 0, -5);
    const second = m.add('grunt', 2.5, -6);
    const third = m.add('grunt', 5.5, -7.5); // 4 m on from the second, 6 m from the first
    const far = m.add('grunt', -6, -5);
    expect(m.combat.use('chainLightning')).toBe('cast');
    expect(m.player.resource).toBe(100 - CL.cost);
    const bolt = throwBolt(m)!;
    expect(bolt.charge).toBe('chainLightning');
    m.run(0.6);
    const arc = Math.round(20 * CL.share);
    expect(hit.hp).toBe(hit.def.hp - 20);
    expect(second.hp).toBe(second.def.hp - arc);
    expect(third.hp).toBe(third.def.hp - arc);
    expect(far.hp).toBe(far.def.hp);
    expect(combatStats.arcs).toBe(2);
    expect(m.combat.use('chainLightning')).toBe('cooling');
  });

  it('arcs on from one its bolt kills, and to nobody with nobody near', () => {
    const m = mage();
    const hit = m.add('grunt', 0, -5);
    hit.hp = 5;
    const next = m.add('grunt', 1.5, -5.5);
    m.combat.use('chainLightning');
    throwBolt(m);
    m.run(0.6);
    expect(hit.alive).toBe(false);
    expect(next.hp).toBe(next.def.hp - Math.round(20 * CL.share));

    const lone = mage();
    const alone = lone.add('grunt', 0, -5);
    lone.combat.use('chainLightning');
    throwBolt(lone);
    lone.run(0.6);
    expect(alone.hp).toBe(alone.def.hp - 20);
    expect(combatStats.arcs).toBe(1);
  });

  it('hops to the nearest each time, never one twice, only to bodies a blow can land on', () => {
    const e = (x: number, z = 0, hittable = true) => ({ position: new Vector3(x, 0, z), def: { radius: 0.35 }, hittable });
    const [a, b, c, d, down] = [e(0), e(3), e(6.5), e(20), e(1, 0, false)];
    expect(chainFrom(a, [a, b, c, d, down], CL.jumps, CL.reach)).toEqual([b, c]);
    // From b the nearest is a; the next arc leaves a, and c is too far from a.
    expect(chainFrom(b, [a, b, c, d], CL.jumps, CL.reach)).toEqual([a]);
    expect(chainFrom(a, [a, d], CL.jumps, CL.reach)).toEqual([]);
    expect(chainFrom(a, [a, b, c], 1, CL.reach)).toEqual([b]);
  });
});

describe("Blizzard's ice", () => {
  const from = new Vector3(0, 1.5, 0);
  const enemyAt = (x: number, z: number) => ({ position: new Vector3(x, 0, z), def: { radius: 0.35 }, hittable: true });

  it('falls on the enemy nearest where the right hand faces, within 15°', () => {
    const out = new Vector3();
    const e = enemyAt(1, -10);
    expect(blizzardAt(from, new Vector3(0, 0, -1), [e, enemyAt(8, -8)], flat, out).toArray()).toEqual([1, 0, -10]);
  });

  it('else where the hand’s line meets the floor, at most 15 m off, and short of a wall', () => {
    const out = new Vector3();
    blizzardAt(from, new Vector3(0, -0.5, -1).normalize(), [], flat, out);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.z).toBeCloseTo(-3, 5);
    blizzardAt(from, new Vector3(0, 0.2, -1).normalize(), [], flat, out);
    expect(out.z).toBeCloseTo(-BZ.range, 5);
    const walled: Ground = { ...flat, lineOfSight: (_a, b) => b.z > -6.2 };
    blizzardAt(from, new Vector3(0, 0, -1), [], walled, out);
    expect(out.z).toBeCloseTo(-6, 5);
    const room: Ground = { ...flat, arrowStops: (p) => p.y <= 0 || p.z < -7 };
    blizzardAt(from, new Vector3(0, 0.7, -0.7).normalize(), [], room, out);
    expect(out.z).toBeCloseTo(-7, 5);
    blizzardAt(from, new Vector3(0, -1, 0), [], flat, out);
    expect(out.toArray()).toEqual([0, 0, 0]);
  });

  it('bites every enemy in its 4 m circle for 6 every 0.5 s and slows it by half; outside, nothing', () => {
    const m = mage();
    const inside = m.add('grunt', 1, -8);
    const edge = m.add('grunt', 4, -6);
    const out = m.add('grunt', 7, -6);
    m.frame();
    const aim = { from: new Vector3(0.3, 1.4, -0.3), hand: new Vector3(0, -0.2, -1).normalize(), gaze: new Vector3(0, 0, -1) };
    expect(m.combat.use('blizzard', aim)).toBe('cast');
    expect(m.player.resource).toBe(100 - BZ.cost);
    const at = m.combat.blizzard.centre.clone();
    expect(Math.hypot(at.x - 1, at.z + 8)).toBeLessThan(1e-6); // on the grunt within 15°
    m.run(1.9); // ticks at 0, 0.5, 1 and 1.5 s
    expect(inside.hp).toBe(inside.def.hp - 4 * BZ.damage);
    expect(edge.hp).toBe(edge.def.hp - 4 * BZ.damage);
    expect(out.hp).toBe(out.def.hp);
    expect(inside.slowness).toBeCloseTo(BZ.slow, 5);
    expect(out.slowness).toBe(0);
    expect(combatStats.blizzardHits).toBe(8);
  });

  it('falls for 5 s, 10 ticks in all, and a slow lingers a second after its last', () => {
    const m = mage();
    const brute = m.add('brute', 0, -6);
    m.frame();
    const aim = { from: new Vector3(0, 1.4, 0), hand: new Vector3(0, 0, -1), gaze: new Vector3(0, 0, -1) };
    m.combat.use('blizzard', aim);
    expect(m.combat.blizzard.active).toBe(true);
    m.run(BZ.time + 0.3);
    expect(m.combat.blizzard.active).toBe(false);
    expect(brute.hp).toBe(brute.def.hp - (BZ.time / BZ.every) * BZ.damage);
    expect(brute.slowness).toBeCloseTo(BZ.slow / 2, 5); // a brute takes half
    m.run(BZ.linger);
    expect(brute.slowness).toBe(0);
  });

  it('lets an enemy that walks out of it go a second later', () => {
    const m = mage();
    const grunt = m.add('grunt', 0, -6);
    m.frame();
    m.combat.use('blizzard', { from: new Vector3(0, 1.4, 0), hand: new Vector3(0, 0, -1), gaze: new Vector3(0, 0, -1) });
    m.run(1);
    expect(grunt.slowness).toBeCloseTo(BZ.slow, 5);
    const hp = grunt.hp;
    m.enemies.length = 0;
    const away = m.add('grunt', 0, -12);
    m.enemies.push(grunt);
    grunt.position.set(0, 0, -12.5);
    m.run(BZ.linger + 0.1);
    expect(grunt.hp).toBe(hp);
    expect(grunt.slowness).toBe(0);
    expect(away.hp).toBe(away.def.hp);
  });

  it('costs 40 mana, waits out 30 s, and needs somewhere to point', () => {
    const m = mage();
    expect(m.combat.use('blizzard')).toBe('no target');
    expect(m.player.resource).toBe(100);
    const aim = { from: new Vector3(0, 1.4, 0), hand: new Vector3(0, -1, -1).normalize(), gaze: new Vector3(0, 0, -1) };
    expect(m.combat.use('blizzard', aim)).toBe('cast');
    expect(m.combat.use('blizzard', aim)).toBe('cooling');
    m.player.abilities.clear();
    m.player.resource = BZ.cost - 1;
    expect(m.combat.use('blizzard', aim)).toBe('poor');
  });

  it('stays in the effects budget: two draw calls and under 500 triangles', () => {
    const m = mage();
    const { disc, shards } = m.combat.blizzard;
    expect([disc.isMesh, shards.isInstancedMesh]).toEqual([true, true]);
    expect(m.combat.blizzard.triangles).toBeLessThanOrEqual(500);
  });
});

/** A mage of the arena's (level 1, every base ability) with talents `spent`: their numbers, level 1's damage. */
function talented(spent: Spent, level = 1): Mage {
  const m = mage();
  m.player.stats = { ...statsAt(level, undefined, 'mage', spent), abilities: m.player.stats.abilities };
  return m;
}

/** A bolt already in flight just in front of `e`'s face, at it: a head hit, as `charge`. */
function atHead(m: Mage, e: Enemy, charge: Bolt['charge'] = null, damage = 20) {
  const head = new Vector3();
  e.headSphere(head);
  m.combat.bolts.fire({ pos: head.clone().add(new Vector3(0, 0, 0.1)), vel: new Vector3(0, 0, -10), radius: 0.05, damage, color: 0xffffff, hand: 'right', target: null, charge });
}

describe('Fire', () => {
  const T = CONFIG.talents.trees.mage.fire;

  it('Ignite: a fire hit burns the enemy for a further 10% of it a point over 4 s, even through its burst', () => {
    const m = talented({ ignite: 3 });
    const hit = m.add('brute', 0, -5);
    const beside = m.add('brute', 1.2, -5.5);
    m.combat.use('fireball');
    throwBolt(m);
    m.run(0.6);
    const dealt = 20 * F.multiplier;
    expect(hit.hp).toBe(hit.def.hp - dealt);
    expect(m.combat.dots.of(hit, 'burn')).toBeCloseTo(dealt * 0.3);
    expect(m.combat.dots.of(beside, 'burn')).toBeCloseTo(F.burst * 0.3);
    m.run(T.ignite.time + 0.5);
    expect(hit.hp).toBe(hit.def.hp - dealt - Math.round(dealt * 0.3));
    expect(combatStats.dotDamage).toBe(Math.round(dealt * 0.3) + Math.round(F.burst * 0.3));
    // A plain bolt isn't fire.
    const plain = talented({ ignite: 3 });
    const e = plain.add('brute', 0, -5);
    throwBolt(plain);
    plain.run(0.6);
    expect(plain.combat.dots.on).toHaveLength(0);
    expect(e.hp).toBe(e.def.hp - 20);
  });

  it("Ignite's burn doesn't break a freeze or make the enemy flinch, and can kill", () => {
    const m = talented({ ignite: 3 });
    const grunt = m.add('grunt', 0, -5);
    grunt.afflict('frozen', 4);
    m.combat.dots.add(grunt, 'burn', 6, 4);
    m.run(2.1);
    expect(grunt.hp).toBe(grunt.def.hp - 3);
    expect(grunt.state).toBe('frozen');
    m.combat.dots.add(grunt, 'burn', 100, 1);
    m.run(1.1);
    expect(grunt.alive).toBe(false);
  });

  it('Incineration: a bolt charges full in 0.5, then 0.4 s', () => {
    for (const [n, full] of [
      [0, 0.6],
      [1, 0.5],
      [2, 0.4],
    ]) {
      const m = talented({ incineration: n });
      expect(m.hands.chargeTime()).toBeCloseTo(full);
      expect(throwBolt(m, { charge: full + 0.02 })!.damage).toBeCloseTo(20);
    }
    expect(throwBolt(talented({}), { charge: 0.42 })!.damage).toBeLessThan(18);
  });

  it("Improved Fireball: the burst reaches 2.5, then 3 m", () => {
    for (const [n, reached] of [
      [0, false],
      [2, true],
    ] as const) {
      const m = talented({ ignite: 3, improvedFireball: n });
      m.add('grunt', 0, -5);
      const beside = m.add('grunt', 2.9, -5);
      m.combat.use('fireball');
      throwBolt(m);
      m.run(0.6);
      expect(beside.hp < beside.def.hp).toBe(reached);
    }
  });

  it("Critical Mass: a head hit's multiplier +0.1 a point", () => {
    const m = talented({ ignite: 3, criticalMass: 3 });
    const brute = m.add('brute', 0, -5);
    atHead(m, brute);
    m.run(0.2);
    expect(brute.hp).toBe(brute.def.hp - Math.round(20 * (brute.def.critMultiplier + 0.3)));
  });

  it('Master of Elements: a fire head hit gives back 5 mana a point; a plain one nothing', () => {
    const m = talented({ ignite: 3, criticalMass: 3, masterOfElements: 2 }, 8);
    const brute = m.add('brute', 0, -5);
    m.player.resource = 50;
    atHead(m, brute, 'fireball');
    m.frame();
    expect(m.player.resource).toBeCloseTo(60, 0);
    m.player.resource = 50;
    atHead(m, brute);
    m.frame();
    expect(m.player.resource).toBeCloseTo(50, 0);
    expect(combatStats.manaBack).toBe(10);
  });

  it('Pyroblast: 35 mana on a 12 s cooldown, in the triangle, waiting on the next bolt like the others', () => {
    expect(ABILITY.pyroblast).toMatchObject({ byTalent: true, level: 8, use: 'triangle', cost: 35, cooldown: 12 });
    const m = talented({ ignite: 3, criticalMass: 3, pyroblast: 1 });
    expect(m.combat.use('pyroblast')).toBe('cast');
    expect(m.player.resource).toBe(100 - T.pyroblast.cost);
    expect(m.combat.use('fireball')).toBe('waiting');
    expect(m.player.abilities.cooldown('pyroblast')).toBeCloseTo(T.pyroblast.cooldown);
    expect(m.hands.chargeTime()).toBeCloseTo(T.pyroblast.charge);
  });

  it('Pyroblast: charges for 1.2 s into a huge slow orb whatever the throw, deals 60 and sets the enemy burning', () => {
    const m = talented({ ignite: 3, criticalMass: 3, pyroblast: 1 });
    const brute = m.add('brute', 0, -5);
    m.combat.use('pyroblast');
    const bolt = throwBolt(m, { speed: 6, charge: T.pyroblast.charge + 0.02 })!;
    expect(bolt).toMatchObject({ charge: 'pyroblast', radius: T.pyroblast.radius });
    expect(bolt.vel.length()).toBeCloseTo(T.pyroblast.speed);
    expect(bolt.damage).toBeCloseTo(T.pyroblast.damage);
    m.run(1.2);
    expect(combatStats).toMatchObject({ pyroblasts: 1, pyroblastHits: 1 });
    expect(brute.hp).toBeLessThanOrEqual(brute.def.hp - T.pyroblast.damage);
    // It burns: its own, and Ignite's share of the 60.
    expect(m.combat.dots.of(brute, 'burn')).toBeGreaterThan(0);
    const burning = brute.hp;
    m.run(T.pyroblast.burnTime + 0.5);
    expect(burning - brute.hp).toBe(T.pyroblast.burn + Math.round(60 * 0.3));
    // The next bolt is a plain one again, charging in the plain time.
    expect(m.hands.chargeTime()).toBeCloseTo(M.bolt.chargeTime);
    expect(throwBolt(m)!.charge).toBeNull();
  });

  it('Pyroblast: half a charge is a weaker orb', () => {
    const m = talented({ ignite: 3, criticalMass: 3, pyroblast: 1 });
    m.combat.use('pyroblast');
    const bolt = throwBolt(m, { charge: 0.6 })!;
    // About half its charge time (and the throw's few frames).
    expect(bolt.damage).toBeGreaterThan((boltDamage(0.5) / M.bolt.maxDamage) * T.pyroblast.damage);
    expect(bolt.damage).toBeLessThan((boltDamage(0.6) / M.bolt.maxDamage) * T.pyroblast.damage);
  });
});

describe('Frost', () => {
  const T = CONFIG.talents.trees.mage.frost;

  it('Frostbite: a Frostbolt on an enemy already slowed may freeze it for 2 s after the blow; on one not slowed, never', () => {
    const m = talented({ frostbite: 3 });
    const slowed = m.add('grunt', 0, -5);
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // under 15%
    m.combat.use('frostbolt');
    throwBolt(m);
    m.run(0.6);
    expect(slowed.state).not.toBe('frozen'); // it wasn't slowed before the bolt
    m.player.abilities.clear();
    m.combat.use('frostbolt');
    throwBolt(m);
    m.run(0.6);
    expect(slowed.state).toBe('frozen');
    expect(slowed.hp).toBe(slowed.def.hp - 40);
    expect(slowed.afflictedFor('frozen')).toBeGreaterThan(T.frostbite.freeze - 0.7);
    expect(combatStats.frostbitten).toBe(1);
    // Over the chance: no freeze.
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    const n = talented({ frostbite: 3 });
    const other = n.add('brute', 0, -5);
    other.afflict('slowed', 5, 0.4);
    n.combat.use('frostbolt');
    throwBolt(n);
    n.run(0.6);
    expect(other.state).not.toBe('frozen');
  });

  it('Ice Shards: a Frostbolt deals 10% more a point', () => {
    const m = talented({ iceShards: 2 });
    m.combat.use('frostbolt');
    expect(throwBolt(m)!.damage).toBeCloseTo(24);
  });

  it('Permafrost: the slows last a second longer and are 10% stronger a point: Frostbolt, Blizzard', () => {
    const m = talented({ frostbite: 3, permafrost: 2 });
    const grunt = m.add('grunt', 0, -5);
    m.combat.use('frostbolt');
    throwBolt(m);
    m.run(0.6);
    expect(grunt.slowness).toBeCloseTo(FB.slow * 1.2, 5);
    expect(grunt.afflictedFor('slowed')).toBeGreaterThan(FB.time + 2 - 0.7);
    const b = talented({ frostbite: 3, permafrost: 2 });
    const inside = b.add('grunt', 1, -8);
    b.frame();
    b.combat.use('blizzard', { from: new Vector3(0.3, 1.4, -0.3), hand: new Vector3(0, -0.2, -1).normalize(), gaze: new Vector3(0, 0, -1) });
    b.run(0.1);
    expect(inside.slowness).toBeCloseTo(BZ.slow * 1.2, 5);
    expect(inside.afflictedFor('slowed')).toBeGreaterThan(BZ.linger + 2 - 0.2);
  });

  it('Arctic Reach: Frost Nova and Blizzard reach 0.3 m further a point', () => {
    for (const [n, caught] of [
      [0, false],
      [3, true],
    ] as const) {
      const m = talented({ frostbite: 3, arcticReach: n }, 2);
      const grunt = m.add('grunt', 0, -3.5);
      m.frame();
      m.combat.use('frostNova');
      expect(grunt.state === 'frozen').toBe(caught);
      m.combat.use('blizzard', { from: new Vector3(0, 1.4, 0), hand: new Vector3(0, -1, 0), gaze: new Vector3(0, 0, -1) });
      expect(m.combat.blizzard.radius).toBeCloseTo(BZ.radius + 0.3 * n);
    }
  });

  it('Ice Barrier: 30 mana on a 25 s cooldown, in the triangle', () => {
    expect(ABILITY.iceBarrier).toMatchObject({ byTalent: true, level: 8, use: 'triangle', cost: 30, cooldown: 25 });
  });

  it('Ice Barrier: takes the next 40 damage (times your level’s step) within 10 s, then lets blows through', () => {
    const slam = { kind: 'slam', damage: 30, radius: 2, blockable: false } as AttackConfig;
    const m = talented({ frostbite: 3, iceShards: 2, permafrost: 1, iceBarrier: 1 }, 1);
    const brute = m.add('brute', 0, -1);
    expect(m.combat.use('iceBarrier')).toBe('cast');
    expect(m.combat.barrier.held).toBe(T.iceBarrier.absorb);
    const hp = m.player.hp;
    m.combat.slam(brute, slam, new Vector3());
    expect(m.player.hp).toBe(hp);
    m.combat.slam(brute, slam, new Vector3());
    expect(m.player.hp).toBe(hp - 20);
    expect(combatStats.absorbed).toBe(40);
    expect(m.combat.barrier.up).toBe(false);
    // Raised again at level 6 it holds 40 × 2; unused, it's gone after 10 s.
    const n = talented({ frostbite: 3, iceShards: 2, permafrost: 1, iceBarrier: 1 }, 6);
    n.combat.use('iceBarrier');
    expect(n.combat.barrier.held).toBe(Math.round(T.iceBarrier.absorb * (1 + CONFIG.levels.step * 5)));
    n.run(T.iceBarrier.time - 0.2);
    expect(n.combat.barrier.up).toBe(true);
    n.run(0.3);
    expect(n.combat.barrier.up).toBe(false);
  });

  it('Ice Barrier: its ring stays in the effects budget: one draw call, under 500 triangles, no light', () => {
    const parent = new Group();
    const barrier = new IceBarrier(parent);
    expect(parent.children).toEqual([barrier.ring]);
    barrier.raise(40, 10);
    barrier.update(0.5, new Vector3(1, 0, 2));
    expect(barrier.ring.visible).toBe(true);
    expect(barrier.ring.position.toArray()).toEqual([1, 1, 2]); // round your waist
    expect(barrier.triangles).toBeLessThan(500);
    barrier.clear();
    expect(barrier.ring.visible).toBe(false);
  });

  it('Frozen Ward: a blow the ward stops slows its attacker by 20% a point for 3 s', () => {
    const m = talented({ frostbite: 3, iceShards: 2, permafrost: 1, frozenWard: 2 });
    const grunt = m.add('grunt', 0, -1);
    set(m.pads.left, SQUEEZE, 1);
    m.grip('left', -0.05, 1.3, -0.4, Math.PI / 4);
    m.frame();
    m.frame();
    expect(m.hands.warding).toBe(true);
    const p = m.player.shield.board.getWorldPosition(new Vector3());
    const up = new Vector3(0, 0.1, 0);
    const outcome = m.combat.sweep(grunt, CONFIG.enemies.grunt.attacks[0] as AttackConfig, p.clone().add(new Vector3(-0.6, 0, 0.05)).sub(up), p.clone().add(new Vector3(-0.6, 0, 0.05)).add(up), p.clone().add(new Vector3(0.6, 0, 0.05)).sub(up), p.clone().add(new Vector3(0.6, 0, 0.05)).add(up));
    expect(['blocked', 'parried']).toContain(outcome);
    expect(grunt.slowness).toBeCloseTo(0.4 * 1.1, 5);
    expect(grunt.afflictedFor('slowed')).toBeCloseTo(T.frozenWard.time + 1);
    expect(combatStats.wardSlowed).toBe(1);
  });
});
