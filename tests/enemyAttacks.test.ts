import { Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { type Contact, type Defender, sweepStrike } from '../src/combat/strike';
import { type AttackConfig, CONFIG } from '../src/config';
import type { Enemy, EnemyContext } from '../src/enemies/enemy';
import { Archer, Brute, Grunt, Warden } from '../src/enemies/kinds';
import { AttackTokens } from '../src/enemies/tokens';
import { Arena } from '../src/world/arena';
import type { Ground } from '../src/world/ground';

// These drive real enemies (rig, poses, aim calibration, attack timeline)
// through their attacks against a simulated player, so a pose tweak that makes
// a blow whiff, or makes the right block stop working, fails here rather than
// in the headset.

const DT = 1 / 72;
const S = CONFIG.shield;
const B = CONFIG.player.body;

/** Test access to an enemy's protected attack hooks. */
interface Drivable {
  ready(): void;
  go(attack: AttackConfig, ctx: EnemyContext): void;
}
class TestGrunt extends Grunt implements Drivable {
  ready() {
    this.state = 'move';
    this.visual.position.y = 0;
  }
  go(a: AttackConfig, ctx: EnemyContext) {
    this.startAttack(a, ctx);
  }
}
class TestBrute extends Brute implements Drivable {
  ready() {
    this.state = 'move';
    this.visual.position.y = 0;
  }
  go(a: AttackConfig, ctx: EnemyContext) {
    this.startAttack(a, ctx);
  }
}
class TestWarden extends Warden implements Drivable {
  ready() {
    this.state = 'move';
    this.visual.position.y = 0;
  }
  go(a: AttackConfig, ctx: EnemyContext) {
    this.startAttack(a, ctx);
  }
}
class TestArcher extends Archer implements Drivable {
  ready() {
    this.state = 'move';
    this.visual.position.y = 0;
  }
  go(a: AttackConfig, ctx: EnemyContext) {
    this.startAttack(a, ctx);
  }
}

const openGround: Ground = { resolve: () => false, lineOfSight: () => true, heightAt: () => 0, steer: Arena.prototype.steer, arrowStops: () => false };

interface Shield {
  at: [number, number, number];
  facing: [number, number, number];
}

/** A player standing `dist` in front of an enemy at the origin (which faces +Z). */
function player(dist: number, headY: number, shield?: Shield, sword?: [Vector3, Vector3]): Defender {
  let inverse: Matrix4 | null = null;
  if (shield) {
    // The board's face looks along its local -Z.
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), new Vector3(...shield.facing).normalize());
    inverse = new Matrix4().compose(new Vector3(...shield.at), q, new Vector3(1, 1, 1)).invert();
  }
  const d: Defender = {
    head: new Vector3(),
    headRadius: B.headRadius,
    torsoTop: new Vector3(),
    torsoBottom: new Vector3(),
    torsoRadius: B.torsoRadius,
    shieldInverse: inverse,
    shieldHalf: new Vector3(S.width / 2 + S.blockMargin, S.height / 2 + S.blockMargin, S.depth / 2 + S.blockMargin),
    swordBase: sword ? sword[0] : null,
    swordTip: sword ? sword[1] : new Vector3(),
    swordRadius: CONFIG.sword.bladeHalfWidth,
  };
  setHead(d, dist, headY);
  return d;
}

function setHead(d: Defender, dist: number, headY: number): void {
  d.head.set(0, headY - B.headDrop, dist);
  d.torsoTop.set(0, headY - B.torsoTop, dist);
  d.torsoBottom.set(0, Math.max(0.2, headY - B.torsoBottom), dist);
}

interface Run {
  contacts: Contact[];
  slams: Vector3[];
  shots: Vector3[];
}

/**
 * Play one attack to the end. `duckTo` lowers the head once the wind-up has
 * started (after the slash has aimed), like a player reading the telegraph.
 */
function run(enemy: Enemy & Drivable, attack: AttackConfig, d: Defender, dist: number, headY = 1.6, duckTo?: number): Run {
  const out: Run = { contacts: [], slams: [], shots: [] };
  const ctx: EnemyContext = {
    playerFeet: new Vector3(0, 0, dist),
    playerHead: new Vector3(0, headY, dist),
    playerSword: null,
    ground: openGround,
    meleeTokens: new AttackTokens(9),
    rangedTokens: new AttackTokens(9),
    sweep: (e, a, pb, pt, b, t) => {
      const r = sweepStrike(pb, pt, b, t, e.weapon.radius, 6, d, a.blockable);
      if (!r) return null;
      out.contacts.push(r.contact);
      return r.contact === 'body' ? 'hit' : 'blocked';
    },
    slam: (_e, _a, at) => void out.slams.push(at.clone()),
    shoot: (_e, from) => void out.shots.push(from.clone()),
    nock: () => {},
    summon: () => {},
    telegraph: () => {},
  };
  enemy.ready();
  enemy.go({ ...attack, next: undefined }, ctx);
  if (duckTo !== undefined) {
    enemy.update(DT, ctx);
    setHead(d, dist, duckTo);
    ctx.playerHead.y = duckTo;
  }
  for (let t = 0; t < 5 && enemy.state === 'attack'; t += DT) enemy.update(DT, ctx);
  return out;
}

const attack = (e: Enemy, pose: string) => e.def.attacks.find((a) => a.pose === pose)!;

// Shield holds a player would use against each direction.
const OVERHEAD = (dist: number, headY = 1.6): Shield => ({ at: [0, headY + 0.12, dist - 0.3], facing: [0, 1, -1] });
const LEFT = (dist: number, headY = 1.6): Shield => ({ at: [-0.3, headY - 0.3, dist - 0.2], facing: [-1, 0, -0.6] });
const RIGHT = (dist: number, headY = 1.6): Shield => ({ at: [0.28, headY - 0.3, dist - 0.22], facing: [1, 0, -0.6] });

describe.each([
  ['grunt', () => new TestGrunt('grunt', 0, 0)],
  ['grunt with an axe', () => new TestGrunt('grunt', 0, 0, { variant: 1 })],
  ['bandit thug with a sword', () => new TestGrunt('grunt', 0, 0, { family: 'bandit' })],
  ['bandit thug with a hatchet', () => new TestGrunt('grunt', 0, 0, { family: 'bandit', variant: 1 })],
  ['brute', () => new TestBrute('brute', 0, 0)],
  ['bandit leader', () => new TestBrute('brute', 0, 0, { family: 'bandit' })],
  ['bailiff with a cudgel', () => new TestGrunt('grunt', 0, 0, { family: 'corvane' })],
  ['bailiff with an iron-bound club', () => new TestGrunt('grunt', 0, 0, { family: 'corvane', variant: 1 })],
  ['bailiff shieldman', () => new TestBrute('brute', 0, 0, { family: 'corvane' })],
  ['Lantern Man with a cutlass', () => new TestGrunt('grunt', 0, 0, { family: 'smuggler' })],
  ['Lantern Man with a boat hook', () => new TestGrunt('grunt', 0, 0, { family: 'smuggler', variant: 1 })],
  ['Lantern Men dredger with a dredging hook', () => new TestBrute('brute', 0, 0, { family: 'smuggler' })],
  ['Lantern Men dredger with a beetle', () => new TestBrute('brute', 0, 0, { family: 'smuggler', variant: 1 })],
  ['Lantern Men leader', () => new TestBrute('brute', 0, 0, { family: 'smuggler', named: 'leader' })],
  ['Captain Crake', () => new TestBrute('brute', 0, 0, { family: 'smuggler', named: 'crake' })],
  ['Undergate thief', () => new TestGrunt('grunt', 0, 0, { family: 'undergate' })],
  ['fen raider', () => new TestGrunt('grunt', 0, 0, { family: 'raider' })],
  ['fen raider peat cutter', () => new TestBrute('brute', 0, 0, { family: 'raider' })],
  ['Abel Thatch', () => new TestBrute('brute', 0, 0, { family: 'raider', named: 'headman' })],
  ['moor thug with a billhook', () => new TestGrunt('grunt', 0, 0, { family: 'moorBandit' })],
  ['moor thug with a long knife', () => new TestGrunt('grunt', 0, 0, { family: 'moorBandit', variant: 1 })],
  ['Kerchief digger', () => new TestBrute('brute', 0, 0, { family: 'moorBandit' })],
  ['Red Annis', () => new TestBrute('brute', 0, 0, { family: 'moorBandit', named: 'annis' })],
  ['lamp crew pick', () => new TestGrunt('grunt', 0, 0, { family: 'lampCrew' })],
  ['lamp crew sledge', () => new TestBrute('brute', 0, 0, { family: 'lampCrew' })],
  ['bog dead with a stake', () => new TestGrunt('grunt', 0, 0, { family: 'bogDead' })],
  ['bog dead with an old blade', () => new TestGrunt('grunt', 0, 0, { family: 'bogDead', variant: 1 })],
  ['bog dead brute', () => new TestBrute('brute', 0, 0, { family: 'bogDead' })],
  ['warden', () => new TestWarden('warden', 0, 0)],
] as const)('%s melee', (_name, make) => {
  const probe = make();
  const dist = probe.def.attackRange - 0.05;
  const melee = probe.def.attacks.filter((a) => a.kind === 'melee');

  it.each(melee.map((a) => [a.pose, a] as const))('%s lands on a player who stands there', (_p, a) => {
    const r = run(make(), a, player(dist, 1.6), dist);
    expect(r.contacts[0]).toBe('body');
  });

  it.each(melee.map((a) => [a.pose, a] as const))('%s lands on a tall player too', (_p, a) => {
    const r = run(make(), a, player(dist, 1.8), dist, 1.8);
    expect(r.contacts[0]).toBe('body');
  });

  it.each(melee.map((a) => [a.pose, a] as const))('%s whiffs if the player is well out of reach', (_p, a) => {
    const far = dist + 1.4;
    const r = run(make(), a, player(far, 1.6), far);
    expect(r.contacts).toEqual([]);
  });

  const has = (pose: string) => probe.def.attacks.some((a) => a.pose === pose);

  it.runIf(has('chop'))('overhead chop is stopped by a shield held above the head', () => {
    const r = run(make(), attack(probe, 'chop'), player(dist, 1.6, OVERHEAD(dist)), dist);
    expect(r.contacts[0]).toBe('shield');
  });

  it.runIf(has('slashL'))('backhand slash (from its left) is blocked by a shield across the body', () => {
    const r = run(make(), attack(probe, 'slashL'), player(dist, 1.6, RIGHT(dist)), dist);
    expect(r.contacts[0]).toBe('shield');
  });

  it('slash from its right is blocked on the player’s left (shield side)', () => {
    const r = run(make(), attack(probe, 'slashR'), player(dist, 1.6, LEFT(dist)), dist);
    expect(r.contacts[0]).toBe('shield');
  });

  it('a shield on the wrong side does not stop a slash', () => {
    const r = run(make(), attack(probe, 'slashR'), player(dist, 1.6, RIGHT(dist)), dist);
    expect(r.contacts[0]).toBe('body');
  });

  it('slashes pass over a player who ducks during the wind-up', () => {
    for (const pose of ['slashR', 'slashL']) {
      const a = probe.def.attacks.find((x) => x.pose === pose);
      if (!a) continue;
      const r = run(make(), a, player(dist, 1.6), dist, 1.6, 1.0);
      expect(r.contacts, pose).toEqual([]);
    }
  });
});

describe('sword blocks', () => {
  const dist = CONFIG.enemies.grunt.attackRange - 0.05;

  it('a sword held across the head blocks the chop', () => {
    const g = new TestGrunt('grunt', 0, 0);
    const sword: [Vector3, Vector3] = [new Vector3(-0.45, 1.85, dist - 0.3), new Vector3(0.45, 1.85, dist - 0.3)];
    const r = run(g, attack(g, 'chop'), player(dist, 1.6, undefined, sword), dist);
    expect(r.contacts[0]).toBe('sword');
  });
});

describe('slams and shots', () => {
  it('the brute’s slam lands a maul-length in front, on the floor', () => {
    const b = new TestBrute('brute', 0, 0);
    const r = run(b, attack(b, 'slam'), player(1.6, 1.6), 1.6);
    expect(r.slams).toHaveLength(1);
    expect(r.slams[0].y).toBe(0);
    expect(r.slams[0].z).toBeGreaterThan(1.2);
    expect(r.slams[0].z).toBeLessThan(2.3);
    expect(Math.abs(r.slams[0].x)).toBeLessThan(0.6);
  });

  it('the Warden’s slam reaches further than the brute’s', () => {
    const w = new TestWarden('warden', 0, 0);
    const r = run(w, attack(w, 'slam'), player(2, 1.6), 2);
    expect(r.slams[0].z).toBeGreaterThan(1.7);
  });

  it.each(['undead', 'bandit', 'corvane', 'smuggler', 'undergate', 'raider', 'moorBandit', 'lampCrew'] as const)('an %s archer looses one arrow at full draw, from about head height', (family) => {
    const a = new TestArcher('archer', 0, 0, { family });
    const r = run(a, a.def.attacks[0], player(6, 1.6), 6);
    expect(r.shots).toHaveLength(1);
    expect(r.shots[0].y).toBeGreaterThan(1.2);
    expect(r.shots[0].y).toBeLessThan(1.8);
  });
});

// The brute's reach (its attack range and body radius) was set for the undead
// brute's bigger body; the bandit leader and Corvane's shieldman fight with the
// same behaviour on the human body's big build, swinging a felling axe and a
// long mace, and so do the Sallows' brutes and leaders: the dredgers' hook and
// beetle, the Lantern Men leader's boarding axe, Captain Crake's long cutlass,
// the peat cutter's spade and Abel Thatch's slasher. On Brackenmoor, the
// Kerchiefs' digger and Corvane's lamp crews swing a pick and a sledge on the
// big build; Red Annis fights with it on a woman's build, her crook-blade's
// long staff making up the difference; the bog dead's brute is the undead
// brute's body in peat.
describe.each([
  ['bandit leader', 'bandit'],
  ['bailiff shieldman', 'corvane'],
  ['Lantern Men dredger with a dredging hook', 'smuggler'],
  ['Lantern Men dredger with a beetle', 'smuggler', 1],
  ['Lantern Men leader', 'smuggler', 0, 'leader'],
  ['Captain Crake', 'smuggler', 0, 'crake'],
  ['fen raider peat cutter', 'raider'],
  ['Abel Thatch', 'raider', 0, 'headman'],
  ['Kerchief digger', 'moorBandit'],
  ['Red Annis', 'moorBandit', 0, 'annis'],
  ['lamp crew sledge', 'lampCrew'],
  ['bog dead brute', 'bogDead'],
] as const)("the %s's reach", (_name, family, variant = 0, named?: string) => {
  const make = () => new TestBrute('brute', 0, 0, { family, variant, named });
  const probe = make();
  /** As close as you can get: its body against yours. */
  const touching = probe.def.radius + CONFIG.player.bodyRadius;

  it.each([touching, 1.2, probe.def.attackRange - 0.05])('its slash lands on a player %s m off', (dist) => {
    for (const headY of [1.4, 1.6, 1.8]) {
      const r = run(make(), attack(probe, 'slashR'), player(dist, headY), dist, headY);
      expect(r.contacts[0], `head at ${headY} m`).toBe('body');
    }
  });

  // The brute slams at anyone up to 2.3 m off (kinds.ts).
  it.each([touching, 1.2, probe.def.attackRange, 2.3])('its slam catches a player %s m off', (dist) => {
    const slam = attack(probe, 'slam');
    const r = run(make(), slam, player(dist, 1.6), dist);
    expect(r.slams).toHaveLength(1);
    expect(r.slams[0].y).toBe(0);
    expect(r.slams[0].distanceTo(new Vector3(0, 0, dist))).toBeLessThan(slam.radius!);
  });
});

describe.each(['undead', 'bandit', 'corvane', 'smuggler', 'undergate', 'raider', 'moorBandit', 'lampCrew'] as const)('%s archer aim', (family) => {
  /**
   * Draw one arrow at a player whose head starts at `head` (and moves by
   * `move` per second), from an archer at the origin facing `yaw`. Returns how
   * far (degrees) the nocked arrow points from the player's chest on the last
   * frame of the draw.
   */
  function drawAt(head: Vector3, opts: { yaw?: number; move?: Vector3 } = {}): number {
    const a = new TestArcher('archer', 0, 0, { family });
    a.root.rotation.y = opts.yaw ?? 0;
    let nock = new Vector3();
    let grip = new Vector3();
    const ctx: EnemyContext = {
      playerFeet: head.clone().setY(0),
      playerHead: head.clone(),
      playerSword: null,
      ground: openGround,
      meleeTokens: new AttackTokens(9),
      rangedTokens: new AttackTokens(9),
      sweep: () => null,
      slam: () => {},
      shoot: () => {},
      nock: (_e, n, g) => {
        nock = n.clone();
        grip = g.clone();
      },
      summon: () => {},
      telegraph: () => {},
    };
    a.ready();
    a.go(a.def.attacks[0], ctx);
    let aimError = Infinity;
    while (a.state === 'attack' && a.phase === 'windup') {
      if (opts.move) {
        ctx.playerHead.addScaledVector(opts.move, DT);
        ctx.playerFeet.copy(ctx.playerHead).setY(0);
      }
      a.update(DT, ctx);
      const chest = ctx.playerHead.clone().setY(ctx.playerHead.y - CONFIG.arrow.aimBelowHead);
      const arrow = grip.clone().sub(nock);
      aimError = (arrow.angleTo(chest.sub(nock)) * 180) / Math.PI;
    }
    return aimError;
  }

  it.each([
    ['straight ahead', new Vector3(0, 1.7, 8)],
    ['close and tall', new Vector3(0, 1.9, 3.5)],
    ['crouching', new Vector3(0, 1.0, 6)],
    ['up on a step', new Vector3(0, 2.4, 6)],
    ['off to one side', new Vector3(4, 1.6, 5)],
    ['off to the other side', new Vector3(-4, 1.6, 5)],
  ])('the nocked arrow points at the player’s chest at full draw (%s)', (_name, head) => {
    expect(drawAt(head)).toBeLessThan(3);
  });

  it('keeps tracking a player who strafes during the draw', () => {
    expect(drawAt(new Vector3(-2, 1.7, 6), { move: new Vector3(3, 0, 0) })).toBeLessThan(3);
  });

  it('turns to find a player who starts behind its shoulder', () => {
    expect(drawAt(new Vector3(0, 1.7, 6), { yaw: 1.2 })).toBeLessThan(3);
  });
});

describe('pose constants', () => {
  it('are not mutated by enemies animating', async () => {
    const poses = await import('../src/enemies/poses');
    const before = JSON.stringify([poses.RISE, poses.IDLE, poses.CHOP, poses.STAGGER]);
    const g = new TestGrunt('grunt', 0, 0);
    const ctx = {
      playerFeet: new Vector3(0, 0, 3),
      playerHead: new Vector3(0, 1.6, 3),
      playerSword: null,
      ground: openGround,
      meleeTokens: new AttackTokens(2),
      rangedTokens: new AttackTokens(2),
      sweep: () => null,
      slam: () => {},
      shoot: () => {},
      nock: () => {},
      summon: () => {},
      telegraph: () => {},
    } satisfies EnemyContext;
    for (let i = 0; i < 72 * 6; i++) g.update(DT, ctx);
    g.go(attack(g, 'chop'), ctx);
    for (let i = 0; i < 72 * 2; i++) g.update(DT, ctx);
    expect(JSON.stringify([poses.RISE, poses.IDLE, poses.CHOP, poses.STAGGER])).toBe(before);
  });
});
