import { Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { type Contact, type Defender, sweepStrike } from '../src/combat/strike';
import { CONFIG } from '../src/config';
import { Camps } from '../src/enemies/camps';
import { type Enemy, type EnemyContext, keepApart } from '../src/enemies/enemy';
import { Biter, createEnemy } from '../src/enemies/kinds';
import type { PostPlan } from '../src/maps/types';
import { AttackTokens } from '../src/enemies/tokens';
import { buildCrawler, CRAWLER_LOOKS, type CrawlerLook, crawlerLook, restPose, strikeReach } from '../src/models/crawler';
import { Arena } from '../src/world/arena';
import type { Ground } from '../src/world/ground';

// The biters (leeches and adders) as they fight: a real enemy on the crawler
// body closing in on a simulated player and lunging, its jaws swept against
// the player's legs, shield and blade as the game sweeps them.

const DT = 1 / 72;
const B = CONFIG.player.body;
const S = CONFIG.shield;

const openGround: Ground = { resolve: () => false, lineOfSight: () => true, heightAt: () => 0, steer: Arena.prototype.steer, arrowStops: () => false };

const LOOKS: [string, 'leech' | 'snake', number][] = [
  ['mire leech', 'leech', 0],
  ['fen leech', 'leech', 1],
  ['Old Mother Leech', 'leech', 2],
  ['adder', 'snake', 0],
];

/** A player standing at `dist` along +Z from the origin, head 1.6 m up; a shield board at `shield` facing back at the origin, if any. */
function player(dist: number, shield?: { y: number; tilt: number }): Defender {
  let inverse: Matrix4 | null = null;
  if (shield) {
    // The board's face looks along its local -Z: back towards the biter, tipped down by `tilt`.
    const facing = new Vector3(0, -Math.sin(shield.tilt), -Math.cos(shield.tilt));
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), facing);
    inverse = new Matrix4().compose(new Vector3(0, shield.y, dist - 0.22), q, new Vector3(1, 1, 1)).invert();
  }
  return {
    head: new Vector3(0, 1.6 - B.headDrop, dist),
    headRadius: B.headRadius,
    torsoTop: new Vector3(0, 1.6 - B.torsoTop, dist),
    torsoBottom: new Vector3(0, 1.6 - B.torsoBottom, dist),
    torsoRadius: B.torsoRadius,
    legsBottom: new Vector3(0, B.ankles, dist),
    legsRadius: B.legsRadius,
    shieldInverse: inverse,
    shieldHalf: new Vector3(S.width / 2 + S.blockMargin, S.height / 2 + S.blockMargin, S.depth / 2 + S.blockMargin),
    swordBase: null,
    swordTip: new Vector3(),
    swordRadius: CONFIG.sword.bladeHalfWidth,
  };
}

interface Fight {
  contacts: { contact: Contact; at: Vector3 }[];
  /** s it took to start its lunge. */
  started: number;
}

/**
 * The biter at the origin, facing +Z, and a player `dist` m away: it closes in
 * and lunges, and every frame of its blow is swept (low, as the game sweeps a
 * low attack, unless `low` is false). `step` moves the player back that far
 * once the wind-up starts.
 */
function fight(e: Enemy, d: Defender, dist: number, { low = true, step = 0, ground = openGround } = {}): Fight {
  const out: Fight = { contacts: [], started: -1 };
  const ctx: EnemyContext = {
    playerFeet: new Vector3(0, 0, dist),
    playerHead: new Vector3(0, 1.6, dist),
    playerSword: null,
    ground,
    meleeTokens: new AttackTokens(9),
    rangedTokens: new AttackTokens(9),
    sweep: (en, a, pb, pt, b, t) => {
      const r = sweepStrike(pb, pt, b, t, en.weapon.radius, 6, d, a.blockable, low && a.low);
      if (!r) return null;
      out.contacts.push({ contact: r.contact, at: r.point.clone() });
      return r.contact === 'body' ? 'hit' : 'blocked';
    },
    slam: () => {},
    shoot: () => {},
    nock: () => {},
    summon: () => {},
    telegraph: () => {},
  };
  let time = 0;
  for (; time < 8 && out.contacts.length === 0; time += DT) {
    e.update(DT, ctx);
    // Kept off your feet as the game keeps it.
    keepApart([e], ctx.playerFeet, ground);
    if (e.attacking && out.started < 0) {
      out.started = time;
      if (step) {
        for (const v of [d.head, d.torsoTop, d.torsoBottom, d.legsBottom, ctx.playerFeet, ctx.playerHead]) v.z += step;
      }
    }
    if (out.started >= 0 && !e.attacking) break;
  }
  return out;
}

describe.each(LOOKS)('a %s', (_name, family, variant) => {
  const make = () => createEnemy('biter', 0, 0, { family, variant }) as Biter;

  it('is the crawler in its look, one draw call, alive at once (no grave to climb from)', () => {
    const e = make();
    expect(e).toBeInstanceOf(Biter);
    expect(e.family).toBe(family);
    expect(e.rig.mesh.isSkinnedMesh).toBe(true);
    expect(e.state).toBe('move');
    expect(e.hittable).toBe(true);
  });

  it('closes in on a player standing still and lunges at their legs, and the lunge lands low', () => {
    const r = fight(make(), player(2.5), 2.5);
    expect(r.started).toBeGreaterThan(0);
    expect(r.contacts[0]?.contact).toBe('body');
    // Below the torso: on the legs.
    expect(r.contacts[0].at.y).toBeLessThan(1.6 - B.torsoBottom);
  });

  it('only reaches the legs: swept against the head and torso alone, its lunge passes under them', () => {
    const r = fight(make(), player(2.5), 2.5, { low: false });
    expect(r.started).toBeGreaterThan(0);
    expect(r.contacts).toEqual([]);
  });

  it('is stopped by a shield held low in front of the shins', () => {
    const r = fight(make(), player(2.5, { y: 0.25, tilt: 0.3 }), 2.5);
    expect(r.contacts[0]?.contact).toBe('shield');
  });

  it('gets past a shield held up at the chest', () => {
    const r = fight(make(), player(2.5, { y: 1.15, tilt: 0 }), 2.5);
    expect(r.contacts[0]?.contact).toBe('body');
  });

  it('whiffs on a player who steps back out of its reach as it winds up', () => {
    const r = fight(make(), player(2.5), 2.5, { step: 0.6 });
    expect(r.started).toBeGreaterThan(0);
    expect(r.contacts).toEqual([]);
  });

  it('can be struck all along its body, low to the ground, and on its head for a crit', () => {
    const e = make();
    e.update(DT, { ...quiet(), ground: openGround });
    const a = new Vector3();
    const b = new Vector3();
    e.capsule(a, b);
    const look = CRAWLER_LOOKS[crawlerLook(family, variant)].build;
    // From near its tail to its snout, lying along it.
    expect(a.distanceTo(b)).toBeGreaterThan(look.length * 0.6);
    expect(Math.max(a.y, b.y)).toBeLessThan(0.15);
    const head = new Vector3();
    const r = e.headSphere(head);
    expect(head.z).toBeGreaterThan(b.z - r);
    expect(r).toBeGreaterThan(0.05);
  });

  it('swims on the surface of water over it, its belly awash and its back clear, and lies on the ground where it is dry', () => {
    const e = make();
    const wet: Ground = { ...openGround, heightAt: () => -0.6, waterAt: (x) => (x < 5 ? 0 : null) };
    e.update(DT, { ...quiet(), ground: wet });
    const h = CRAWLER_LOOKS[crawlerLook(family, variant)].build.height;
    expect(e.position.y).toBeLessThan(0);
    expect(e.position.y).toBeGreaterThan(-h * 0.4);
    e.position.x = 6;
    e.update(DT, { ...quiet(), ground: wet });
    expect(e.position.y).toBe(-0.6);
  });

  it('dies curled up, rolls belly up and is gone', () => {
    const e = make();
    const ctx = { ...quiet(), ground: openGround };
    e.update(DT, ctx);
    expect(e.takeHit(1000, new Vector3())).toBe(true);
    let t = 0;
    while (e.update(DT, ctx) && t < 10) t += DT;
    expect(t).toBeGreaterThan(1);
    expect(t).toBeLessThan(5);
  });
});

/** Nothing about: the player far off. */
function quiet(): EnemyContext {
  return {
    playerFeet: new Vector3(0, 0, 40),
    playerHead: new Vector3(0, 1.6, 40),
    playerSword: null,
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

describe('the crawler body', () => {
  it.each(Object.keys(CRAWLER_LOOKS) as CrawlerLook[])('%s is a few hundred triangles, its belly on the ground at rest', (look) => {
    const rig = buildCrawler(look);
    const { kind } = CRAWLER_LOOKS[look];
    expect(rig.triangles).toBeLessThanOrEqual(kind === 'leech' ? 300 : 400);
    rig.apply(restPose(kind));
    rig.mesh.updateMatrixWorld(true);
    // Lowest skinned vertex: on the ground, not under it or hovering.
    const pos = rig.mesh.geometry.getAttribute('position');
    const v = new Vector3();
    let low = Infinity;
    for (let i = 0; i < pos.count; i++) low = Math.min(low, rig.mesh.applyBoneTransform(i, v.fromBufferAttribute(pos, i)).y);
    expect(low).toBeGreaterThan(-0.02);
    expect(low).toBeLessThan(0.02);
  });

  it('lunges farther the longer it is, and every look reaches past its own snout', () => {
    const reach = (look: CrawlerLook) => strikeReach(look);
    expect(reach('motherLeech')).toBeGreaterThan(reach('mireLeech'));
    expect(reach('mireLeech')).toBeGreaterThan(reach('fenLeech'));
    for (const look of Object.keys(CRAWLER_LOOKS) as CrawlerLook[]) expect(reach(look)).toBeGreaterThan(CRAWLER_LOOKS[look].build.length / 2);
  });
});

describe('a camp of biters', () => {
  it('raises its leeches as mire leeches, unless a post sets its look: the fen leech, or the Old Mother', () => {
    const post = (x: number, variant?: number): PostPlan => ({ behaviour: 'biter', family: 'leech', x, z: 0, yaw: 0, variant });
    const camps = new Camps(
      [{ id: 'fen-leeches', place: { x: 0, z: 0, r: 6 }, level: 10, posts: [post(0), post(2), post(4, 1), post(6, 2)] }],
      openGround,
      { sweep: () => null, slam: () => {}, shoot: () => {}, nock: () => {}, telegraph: () => {} },
    );
    const lengths = camps.enemies.map((e) => (e.rig.proportions as { length: number }).length);
    const L = (look: CrawlerLook) => CRAWLER_LOOKS[look].build.length;
    expect(lengths).toEqual([L('mireLeech'), L('mireLeech'), L('fenLeech'), L('motherLeech')]);
  });
});
