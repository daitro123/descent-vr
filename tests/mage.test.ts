import { Group, PerspectiveCamera, Vector3, type WebGLRenderer } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { statsAt } from '../src/adventureState';
import { ABILITY, abilitiesAt, PLAYABLE, resourceOf } from '../src/classes';
import { Combat, type CombatFx, combatStats, resetCombatStats } from '../src/combat/combat';
import { afterBlock, blinkTo, boltDamage, boltShape, wardRises, within } from '../src/combat/mage';
import { CONFIG } from '../src/config';
import type { Enemy, EnemyContext } from '../src/enemies/enemy';
import { createEnemy } from '../src/enemies/kinds';
import { AttackTokens } from '../src/enemies/tokens';
import type { Particles } from '../src/fx/particles';
import { mulberry32 } from '../src/maps/forest/noise';
import type { EnemyKind } from '../src/models/characters';
import { MageHands } from '../src/player/mage';
import { Player, refill } from '../src/player/player';
import { Arena } from '../src/world/arena';
import type { Ground } from '../src/world/ground';

// The mage (abilities ticket 23) at the combat seam: a real Player, Combat and
// the mage's hands, driven through a stand-in controller's buttons and grip
// poses, against real enemies. The tests check what a player would see: the
// bolt a throw makes and where it lands, what the ward stops and what it
// costs, where a blink puts you, who Frost Nova freezes and whom a
// Fireball's burst reaches.

const DT = 1 / 72;
const M = CONFIG.mage;
const N = CONFIG.classes.mage.abilities.frostNova;
const F = CONFIG.classes.mage.abilities.fireball;

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
    expect(bolt.fire).toBe(true);
    expect(bolt.damage).toBe(20 * F.multiplier);
    expect(m.player.abilities.primed('fireball')).toBe(false);
    expect(throwBolt(m)!.fire).toBe(false);
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
