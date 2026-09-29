import { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../src/config';
import type { CampHooks, You } from '../src/enemies/camps';
import type { Enemy } from '../src/enemies/enemy';
import { Throne, type ThroneEvents } from '../src/enemies/throne';
import { AttackTokens } from '../src/enemies/tokens';
import { MINE, planMine } from '../src/maps/forest/mine';
import { mulberry32 } from '../src/maps/forest/noise';
import { MineGround } from '../src/world/mineGround';

// The Warden on its throne, through `EnemyContext`: a real Warden on the
// mine's own ground in its hall, against a simulated player. It sits while
// the quest is under way, rises as you step through the gate, never leaves
// the hall, walks back whole when you leave or fall (what it raised
// crumbling), and once it falls the throne stays empty.

const DT = 1 / 72;
const H = CONFIG.warden.hall;
const { halfSize, gate } = CONFIG.arena;

// The mine with its mouth at the origin, facing +Z: its frame is the world's.
const plan = planMine({ x: 0, z: 0, yaw: 0, y: 0 });
const ground = new MineGround(plan);
const HALL = MINE.hall;
/** The hall's south wall, where the gate's inner mouth is. */
const WALL = HALL.z + halfSize;

/** Where you stand: in the antechamber before the gate, in the gate, just through it, and in the hall. */
const ANTECHAMBER = { x: HALL.x, z: WALL + gate.depth + 1.5 };
const IN_GATE = { x: HALL.x, z: WALL + gate.depth / 2 };
const THROUGH = { x: HALL.x, z: WALL - 1 };
const MIDDLE = { x: HALL.x + 1.5, z: HALL.z + 1 };

/** Its blows record who they'd reach, but land nowhere. */
function hall(onThrone = true) {
  const swings: Enemy[] = [];
  const hooks: CampHooks = { sweep: (e) => (swings.push(e), null), slam: () => {}, shoot: () => {}, nock: () => {}, telegraph: () => {} };
  const pools = { melee: new AttackTokens(CONFIG.camps.tokens.melee, CONFIG.tokens.meleeGap), ranged: new AttackTokens(CONFIG.camps.tokens.ranged) };
  const kills: string[] = [];
  const rises: Enemy[] = [];
  const summoned: Vector3[][] = [];
  const events: ThroneEvents = {
    onKill: (e, role) => kills.push(`${role} ${e.level}`),
    onRise: (w) => rises.push(w),
    onSummon: (_w, at) => summoned.push(at.map((p) => p.clone())),
  };
  const throne = new Throne(plan.throne, ground, hooks, pools, events);
  const you: You = { feet: new Vector3(), head: new Vector3(), sword: null, alive: true, interior: 'mine' };
  const stand = (at: { x: number; z: number }) => {
    you.feet.set(at.x, ground.heightAt(at.x, at.z), at.z);
    you.head.copy(you.feet).setY(you.feet.y + 1.6);
  };
  const state = { onThrone };
  const step = (seconds: number, each?: () => void) => {
    for (let t = 0; t < seconds - 1e-9; t += DT) {
      each?.();
      throne.update(DT, you, state.onThrone);
    }
  };
  stand(ANTECHAMBER);
  step(0.5);
  return { throne, you, stand, step, state, pools, kills, rises, summoned, swings };
}

const warden = (t: Throne) => t.body!;
const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** Deal `damage` to it, straight: no guard, no blade. */
const strike = (e: Enemy, damage: number) => e.takeHit(damage, new Vector3(), { ignorePoise: true });

beforeEach(() => {
  vi.spyOn(Math, 'random').mockImplementation(mulberry32(11));
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('the throne, before What Lies Below and once the Warden is beaten', () => {
  it('is empty', () => {
    const { throne, stand, step } = hall(false);
    expect(throne.state).toBe('absent');
    stand(MIDDLE);
    step(3);
    expect(throne.state).toBe('absent');
    expect(throne.enemies).toEqual([]);
    expect(throne.body).toBeNull();
  });
});

describe('the Warden, while What Lies Below is under way', () => {
  it('sits slumped on its throne, level 5 with 1,080 health, out of reach', () => {
    const { throne, stand, step } = hall();
    expect(throne.state).toBe('seated');
    const w = warden(throne);
    expect(w.kind).toBe('warden');
    expect(w.state).toBe('seated');
    expect(w.level).toBe(5);
    expect(w.maxHp).toBe(1080);
    expect(w.def.attacks[0].damage).toBe(Math.round(CONFIG.enemies.warden.attacks[0].damage * 1.8));
    expect(flat(w.position, plan.throne.seat)).toBeLessThan(1e-6);
    expect(w.hittable).toBe(false);
    expect(strike(w, 5000)).toBe(false);
    // Standing in the antechamber, or in the gate itself, doesn't wake it.
    stand(IN_GATE);
    step(3);
    expect(throne.state).toBe('seated');
    expect(flat(w.position, plan.throne.seat)).toBeLessThan(1e-6);
  });

  it('rises the moment you step through the gate, then comes for you', () => {
    const { throne, stand, step, rises, swings, pools } = hall();
    const w = warden(throne);
    stand(IN_GATE);
    step(0.2);
    expect(rises).toEqual([]);
    stand(THROUGH);
    step(DT);
    expect(throne.state).toBe('fighting');
    expect(rises).toEqual([w]);
    // While it's up, only two may swing at you at once, as in the arena.
    expect(pools.melee.max).toBe(2);
    step(H.stand + 0.1);
    expect(w.seated).toBe(false);
    expect(w.hittable).toBe(true);
    step(8);
    expect(flat(w.position, THROUGH)).toBeLessThan(CONFIG.enemies.warden.attackRange + 0.2);
    expect(swings).toContain(w);
  });

  it('never leaves the hall: from the gate, it stops at the wall', () => {
    const { throne, stand, step } = hall();
    stand(THROUGH);
    step(H.stand + 1);
    stand(IN_GATE);
    let deepest = -Infinity;
    step(8, () => (deepest = Math.max(deepest, warden(throne).position.z)));
    expect(throne.state).toBe('fighting');
    expect(deepest).toBeLessThanOrEqual(WALL - CONFIG.enemies.warden.radius + 1e-6);
  });

  it('calls up level-5 skeletons round you that pay nothing and take no camp multiplier', () => {
    const { throne, stand, step, summoned, kills } = hall();
    stand(MIDDLE);
    step(H.stand + 0.1);
    const w = warden(throne);
    strike(w, Math.ceil(w.maxHp * 0.35));
    step(4);
    expect(summoned).toHaveLength(1);
    expect(summoned[0]).toHaveLength(CONFIG.warden.summonCount);
    for (const p of summoned[0]) expect(flat(p, MIDDLE)).toBeCloseTo(3, 0);
    const raised = throne.enemies.filter((e) => e !== w);
    expect(raised.map((e) => [e.kind, e.level, e.maxHp])).toEqual([
      ['grunt', 5, 81],
      ['grunt', 5, 81],
    ]);
    step(2);
    strike(raised[0], 1000);
    step(DT);
    expect(kills).toEqual(['raised 5']);
  });
});

describe('the Warden resetting', () => {
  /** Up and fighting you in the middle of the hall, having raised its first two. */
  function fought() {
    const h = hall();
    h.stand(MIDDLE);
    h.step(H.stand + 0.1);
    const w = warden(h.throne);
    strike(w, Math.ceil(w.maxHp * 0.35));
    h.step(4);
    const raised = h.throne.enemies.filter((e) => e !== w);
    expect(raised).toHaveLength(2);
    return { ...h, w, raised };
  }

  /** It walks back to the throne and sits, untouchable and whole all the way. */
  function walksBack(h: ReturnType<typeof fought>) {
    const { throne, step, w } = h;
    expect(throne.state).toBe('resetting');
    expect(w.hp).toBe(w.maxHp);
    let touchable = false;
    step(20, () => (touchable ||= w.hittable));
    expect(touchable).toBe(false);
    expect(throne.state).toBe('seated');
    expect(w.state).toBe('seated');
    expect(flat(w.position, plan.throne.seat)).toBeLessThan(1e-6);
    expect(w.hp).toBe(w.maxHp);
  }

  it('when you leave by the gate: what it raised crumbles and it walks back to its throne at full health', () => {
    const h = fought();
    h.stand(ANTECHAMBER);
    h.step(DT);
    for (const e of h.raised) expect(e.alive).toBe(false);
    expect(h.pools.melee.max).toBe(CONFIG.camps.tokens.melee);
    expect(h.kills).toEqual([]);
    walksBack(h);
    expect(h.pools.melee.max).toBe(CONFIG.camps.tokens.melee);
    // And rises again when you come back through, to raise its dead afresh.
    h.stand(THROUGH);
    h.step(DT);
    expect(h.throne.state).toBe('fighting');
    h.step(H.stand + 0.1);
    strike(h.w, Math.ceil(h.w.maxHp * 0.35));
    h.step(4);
    expect(h.summoned).toHaveLength(2);
  });

  it('when you fall', () => {
    const h = fought();
    h.you.alive = false;
    h.step(DT);
    for (const e of h.raised) expect(e.alive).toBe(false);
    walksBack(h);
  });

  it("when you leave the mine (waking outside it): it doesn't wait for you by the gate", () => {
    const h = fought();
    h.you.interior = null;
    h.step(DT);
    walksBack(h);
  });
});

describe('the Warden beaten', () => {
  it('falls with what it raised, pays as the Warden, and leaves the throne empty', () => {
    const h = hall();
    h.stand(MIDDLE);
    h.step(H.stand + 0.1);
    const w = warden(h.throne);
    strike(w, Math.ceil(w.maxHp * 0.35));
    h.step(4);
    const raised = h.throne.enemies.filter((e) => e !== w);
    strike(w, 5000);
    h.step(DT);
    expect(h.kills).toEqual(['warden 5']);
    for (const e of raised) expect(e.alive).toBe(false);
    expect(h.throne.state).toBe('absent');
    expect(h.pools.melee.max).toBe(CONFIG.camps.tokens.melee);
    // The adventure state now says it's beaten: nobody sits there again, and the bones are swept away.
    h.state.onThrone = false;
    h.step(6);
    expect(h.throne.state).toBe('absent');
    expect(h.throne.enemies).toEqual([]);
  });
});
