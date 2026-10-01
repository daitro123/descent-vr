import { Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { type Contact, type Defender, sweepStrike } from '../src/combat/strike';
import { type AttackConfig, CONFIG } from '../src/config';
import type { EnemyContext } from '../src/enemies/enemy';
import { createEnemy, Wolf } from '../src/enemies/kinds';
import { AttackTokens } from '../src/enemies/tokens';
import { buildWolf, WOLF_COATS, wolfBite } from '../src/enemies/wolf';
import { wolfShowpiece } from '../src/inspector/creatures';
import { JUNK } from '../src/items';
import { createModelMaterial } from '../src/models/materials';
import { QUAD_BONES } from '../src/models/quadruped';
import { Arena } from '../src/world/arena';
import type { Ground } from '../src/world/ground';

// The wolves (enemies/wolf.ts, Wolf in kinds.ts, CONFIG.wolf): the enemy
// machinery on the four-legged body. Driven through their bite and spring
// against a simulated player as tests/biters.test.ts drives the crawlers, so a
// pose tweak that makes a blow whiff, or a shield stop working, fails here.

const DT = 1 / 72;
const S = CONFIG.shield;
const B = CONFIG.player.body;
const W = CONFIG.wolf;

class TestWolf extends Wolf {
  go(a: AttackConfig, ctx: EnemyContext) {
    this.startAttack(a, ctx);
  }
  choose(dist: number): AttackConfig | null {
    return this.chooseAttack(dist);
  }
}

const openGround: Ground = { resolve: () => false, lineOfSight: () => true, heightAt: () => 0, steer: Arena.prototype.steer, arrowStops: () => false };

/** A player standing `dist` in front of a wolf at the origin (which faces +Z), head `headY` up, maybe with a shield at `shield` m up tipped `tilt` down. */
function player(dist: number, headY: number, shield?: { y: number; tilt: number }): Defender {
  let inverse: Matrix4 | null = null;
  if (shield) {
    // The board's face looks along its local -Z: back towards the wolf.
    const facing = new Vector3(0, -Math.sin(shield.tilt), -Math.cos(shield.tilt));
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), facing);
    inverse = new Matrix4().compose(new Vector3(0, shield.y, dist - 0.3), q, new Vector3(1, 1, 1)).invert();
  }
  return {
    head: new Vector3(0, headY - B.headDrop, dist),
    headRadius: B.headRadius,
    torsoTop: new Vector3(0, headY - B.torsoTop, dist),
    torsoBottom: new Vector3(0, headY - B.torsoBottom, dist),
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

function context(dist: number, headY: number, sweep: EnemyContext['sweep']): EnemyContext {
  return {
    playerFeet: new Vector3(0, 0, dist),
    playerHead: new Vector3(0, headY, dist),
    playerSword: null,
    ground: openGround,
    meleeTokens: new AttackTokens(9),
    rangedTokens: new AttackTokens(9),
    sweep,
    slam: () => {},
    shoot: () => {},
    nock: () => {},
    summon: () => {},
    telegraph: () => {},
  };
}

/** Play one attack to the end, swept as the game sweeps it; what it touched, where, and how far it ended up from where it started. */
function run(attack: AttackConfig, d: Defender, dist: number, headY = 1.6): { contacts: Contact[]; at: Vector3[]; travelled: number } {
  const contacts: Contact[] = [];
  const at: Vector3[] = [];
  const ctx = context(dist, headY, (e, a, pb, pt, b, t) => {
    const r = sweepStrike(pb, pt, b, t, e.weapon.radius, 6, d, a.blockable, a.low);
    if (!r) return null;
    contacts.push(r.contact);
    at.push(r.point.clone());
    return r.contact === 'body' ? 'hit' : 'blocked';
  });
  const wolf = testWolf();
  wolf.go(attack, ctx);
  for (let t = 0; t < 5 && wolf.state === 'attack'; t += DT) wolf.update(DT, ctx);
  return { contacts, at, travelled: wolf.position.z };
}

/** A wolf as createEnemy builds one, at level 1, with its moves open to the test. */
function testWolf(): TestWolf {
  return new TestWolf('grunt', 0, 0, { family: 'wolf', def: W, model: (material) => ({ rig: buildWolf(0, material), weapon: wolfBite() }) });
}

const bite = W.attacks.find((a) => a.pose === 'bite')!;
const lunge = W.attacks.find((a) => a.pose === 'lunge')!;

describe('a wolf', () => {
  it('is a Wolf on the four-legged body, with its own numbers at its level, up on its feet at once', () => {
    const w = createEnemy('grunt', 0, 0, { family: 'wolf', level: 1 });
    expect(w).toBeInstanceOf(Wolf);
    expect(w.body).toBe('beast');
    expect(w.rig.boneNames).toEqual([...QUAD_BONES]);
    expect(w.def.hp).toBe(W.hp);
    expect(w.rig.triangles).toBeLessThan(460);
    // The living don't rise from the ground.
    expect(w.state).toBe('move');
    expect(w.hittable).toBe(true);
  });

  it('comes in its coats, wrapping round, and fights only as a grunt', () => {
    for (let v = 0; v < WOLF_COATS + 2; v++) expect(createEnemy('grunt', 0, 0, { family: 'wolf', variant: v })).toBeInstanceOf(Wolf);
    expect(() => createEnemy('archer', 0, 0, { family: 'wolf' })).toThrow();
  });

  it('bites at the legs of a player standing in reach, short or tall', () => {
    const dist = W.attackRange - 0.05;
    for (const headY of [1.4, 1.6, 1.8]) {
      const r = run(bite, player(dist, headY), dist, headY);
      expect(r.contacts[0], `head at ${headY}`).toBe('body');
      expect(r.at[0].y, `head at ${headY}`).toBeLessThan(headY - B.torsoBottom + 0.15);
    }
  });

  it('springs at the body of a player anywhere in its run-up', () => {
    for (const dist of [lunge.from! + 0.05, (lunge.from! + lunge.reach!) / 2, lunge.reach! - 0.05]) {
      for (const headY of [1.5, 1.7]) expect(run(lunge, player(dist, headY), dist, headY).contacts[0], `${dist} m off, head at ${headY}`).toBe('body');
    }
  });

  it('is carried forward as it springs, and barely moves as it bites', () => {
    expect(run(lunge, player(9, 1.6), 9).travelled).toBeCloseTo(lunge.surge!, 1);
    expect(run(bite, player(9, 1.6), 9).travelled).toBeLessThan(0.5);
  });

  it('stops at your body however far it springs', () => {
    const dist = lunge.from! + 0.05;
    const r = run(lunge, player(dist, 1.6), dist);
    expect(r.travelled).toBeLessThan(dist - W.radius - CONFIG.player.bodyRadius + 0.1);
  });

  it('whiffs at a player well out of reach', () => {
    expect(run(bite, player(W.attackRange + 1.4, 1.6), W.attackRange + 1.4).contacts).toEqual([]);
    expect(run(lunge, player(lunge.reach! + 2.2, 1.6), lunge.reach! + 2.2).contacts).toEqual([]);
  });

  it('is stopped by a shield held low for the bite, and up in front for the spring', () => {
    const near = W.attackRange - 0.05;
    expect(run(bite, player(near, 1.6, { y: 0.55, tilt: 0.5 }), near).contacts[0]).toBe('shield');
    const dist = (lunge.from! + lunge.reach!) / 2;
    expect(run(lunge, player(dist, 1.6, { y: 0.95, tilt: 0.2 }), dist).contacts[0]).toBe('shield');
  });

  it('means to spring or to bite as it comes in, closing in till it can', () => {
    const mid = (lunge.from! + lunge.reach!) / 2;
    const seen = new Set<string>();
    // Each wolf's mind is its own (two bites to a spring, by their weights): enough wolves to see both.
    for (let n = 0; n < 60 && seen.size < 2; n++) {
      const w = testWolf();
      // Out of reach of either: it closes in, its mind made up.
      expect(w.choose(lunge.reach! + 0.5)).toBeNull();
      const there = w.choose(mid);
      if (there) {
        expect(there.pose).toBe('lunge');
        seen.add('lunge');
      } else {
        // Meaning to bite, it runs on through the spring's distance; between the two it closes in.
        expect(w.choose((W.attackRange + lunge.from!) / 2)).toBeNull();
        expect(w.choose(0.8)?.pose).toBe('bite');
        seen.add('bite');
      }
    }
    expect([...seen].sort()).toEqual(['bite', 'lunge']);
    // Already closer than a spring needs: it bites, whatever it meant.
    for (let n = 0; n < 4; n++) expect(testWolf().choose(0.8)?.pose).toBe('bite');
  });

  it('dies rolling onto its side', () => {
    const w = createEnemy('grunt', 0, 0, { family: 'wolf' });
    const ctx = context(5, 1.6, () => null);
    w.takeHit(999, new Vector3());
    expect(w.alive).toBe(false);
    for (let t = 0; t < 1; t += DT) w.update(DT, ctx);
    const visual = w.rig.mesh.parent!;
    expect(Math.abs(visual.rotation.z)).toBeGreaterThan(1.2);
    expect(visual.rotation.x).toBe(0);
  });

  it('drops its pelt and fangs', () => {
    expect(JUNK.wolf.map(([id]) => id)).toEqual(['wolf-pelt', 'wolf-fang']);
  });

  it('shows in the model viewer ready, trotting, biting, springing, reeling and dying, with its feet on the plinth', () => {
    const piece = wolfShowpiece(0, createModelMaterial());
    expect(piece.clips.map((c) => c.name)).toEqual(['ready', 'trot', 'bite', 'lunge', 'stagger', 'die']);
    for (let i = 0; i < piece.clips.length; i++) {
      for (let t = 0; t < piece.clips[i].duration; t += 0.1) {
        const m = piece.play(i, t);
        expect(Number.isFinite(m.telegraph)).toBe(true);
      }
    }
  });
});
