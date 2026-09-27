import { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { swingDamage } from '../src/combat/combat';
import { CONFIG } from '../src/config';
import type { EnemyContext } from '../src/enemies/enemy';
import { Brute } from '../src/enemies/kinds';
import { AttackTokens } from '../src/enemies/tokens';
import type { Arena } from '../src/world/arena';

// The brute is armoured: hitting it should hurt it, not switch it off. These
// drive a real brute (its own think, tokens and attack timings) while the
// player keeps beating it over the head as fast as the sword allows.

const DT = 1 / 72;
const DIST = 1.3; // in reach of its maul

class ReadyBrute extends Brute {
  constructor() {
    super('brute', 0, 0);
    this.state = 'move';
    this.visual.position.y = 0;
  }
}

function context(): EnemyContext {
  return {
    playerFeet: new Vector3(0, 0, DIST),
    playerHead: new Vector3(0, 1.6, DIST),
    playerSword: null,
    arena: { resolve: () => false, lineOfSight: () => true } as unknown as Arena,
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

/** A head hit from an ordinary swing: well over the brute's poise. */
const HEAD_HIT = Math.round(swingDamage(3.5).damage * CONFIG.enemies.brute.critMultiplier);

interface Fight {
  /** Blows it got to the end of the wind-up with (swings and slams). */
  blows: number;
  staggers: number;
  /** s spent reeling. */
  staggeredFor: number;
}

/** `seconds` of the player hitting its head every time the sword may hit again, while `hitting` says so. */
function fight(b: Brute, seconds: number, hitting: (t: number) => boolean = () => true): Fight {
  const ctx = context();
  const out: Fight = { blows: 0, staggers: 0, staggeredFor: 0 };
  let wasActive = false;
  let wasStaggered = false;
  for (let t = 0; t < seconds; t += DT) {
    ctx.meleeTokens.update(DT);
    if (hitting(t) && b.hittable && b.hitCooldown <= 0) {
      b.takeHit(HEAD_HIT, new Vector3(), { from: ctx.playerHead });
      b.hp = b.maxHp; // keep it alive: this is about what it does, not how long it lasts
    }
    b.update(DT, ctx);
    const active = b.attacking && b.phase === 'active';
    if (active && !wasActive) out.blows++;
    const staggered = b.state === 'stagger';
    if (staggered && !wasStaggered) out.staggers++;
    if (staggered) out.staggeredFor += DT;
    wasActive = active;
    wasStaggered = staggered;
  }
  return out;
}

/** Deterministic Math.random, so the brute's picks and cooldowns repeat run to run. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

beforeEach(() => void vi.spyOn(Math, 'random').mockImplementation(seeded(7)));
afterEach(() => void vi.restoreAllMocks());

describe('a brute beaten over the head', () => {
  it('is well over its poise, so the first head hit staggers it', () => {
    expect(HEAD_HIT).toBeGreaterThanOrEqual(CONFIG.enemies.brute.poise);
    const b = new ReadyBrute();
    b.takeHit(HEAD_HIT, new Vector3(), { from: new Vector3(0, 1.6, DIST) });
    expect(b.state).toBe('stagger');
  });

  it('shrugs off the next few and keeps swinging', () => {
    const { blows, staggers, staggeredFor } = fight(new ReadyBrute(), 15);
    // Hit every 0.35 s for 15 s: it still reels now and then, but gets a blow in every few seconds.
    expect(staggers).toBeGreaterThanOrEqual(3);
    expect(staggeredFor).toBeLessThan(15 * 0.4);
    expect(blows).toBeGreaterThanOrEqual(3);
  });

  it('is back on its feet and attacking soon after the beating stops', () => {
    const b = new ReadyBrute();
    fight(b, 3);
    const after = fight(b, 4, () => false);
    expect(after.blows).toBeGreaterThanOrEqual(1);
  });
});
