import { CONFIG } from '../config';
import type { BirdWays, BirdFlockPlan, Perch } from '../maps/types';
import { BIRD_LOOKS, type BirdFamily, type BirdLookId } from '../models/bird';
import { type Act, type Bird, type Floor, type Footing, WADE } from './mover';

// How a flock lives (maps/types.ts `BirdWays`): each flock's brain decides,
// bird by bird, where it goes and what it does there, and the bird (mover.ts)
// gets itself there and poses for it. What every brain shares: a bird with
// nothing to do picks one of its habits (pecking, preening, a call, a few
// steps); a bird you come too near takes fright (CONFIG.birds.shy), its
// neighbours a moment after; one that has fled comes back once you've gone
// (CONFIG.birds.calm). Perches hold a row of birds along their `w`.

const TAU = Math.PI * 2;

/** What the birds need of where they are: the floor, and whether a bird can stand on the ground at a spot (where you can walk, clear of walls and trunks). */
export interface Surroundings extends Floor {
  clear(x: number, z: number): boolean;
}

/** A sound a bird makes, by its sound's name (fx/sfx.ts). */
export type BirdCall = 'caw' | 'croak' | 'coo' | 'gull' | 'cluck' | 'cackle' | 'quack' | 'honk' | 'hiss' | 'krank' | 'goback' | 'curlew' | 'whirr' | 'clatter';

/** You, as the birds see you: where you stand, and whether you're in the water. */
export interface You {
  readonly x: number;
  readonly z: number;
  readonly wading: boolean;
}

/** What a flock's brain is given: its plan, its birds, where they are, and a way to call. */
export interface FlockLife {
  readonly plan: BirdFlockPlan;
  readonly birds: readonly Bird[];
  readonly near: Surroundings;
  /** `bird` calls: its look's own call, or `call`; `always` past the flock's gap between calls (a flush's clatter). */
  call(bird: Bird, call?: BirdCall, always?: boolean): void;
}

/** A flock's brain. */
export interface Brain {
  /** Every bird home and at peace, as when the flock is built. */
  home(): void;
  /** One frame with you where you are. */
  update(dt: number, you: You): void;
}

// ------------------------------------------------------------ each look's ways

/** What a look says when it calls (none: a mute swan, a bittern, which only booms). */
const CALLS: Record<BirdFamily, BirdCall> = { crow: 'caw', gull: 'gull', hen: 'cluck', duck: 'quack', heron: 'krank' };
const OWN_CALLS: Partial<Record<BirdLookId, BirdCall | null>> = { raven: 'croak', pigeon: 'coo', grouse: 'goback', goose: 'honk', swan: null, bittern: null, curlew: 'curlew' };

export function callOf(look: BirdLookId): BirdCall | null {
  const own = OWN_CALLS[look];
  return own === undefined ? CALLS[BIRD_LOOKS[look].family] : own;
}

/** How near you come (m) before a bird of `look` takes fright. */
export function shyOf(look: BirdLookId, plan?: BirdFlockPlan): number {
  const { shy } = CONFIG.birds;
  return plan?.shy ?? shy[look] ?? shy[BIRD_LOOKS[look].family];
}

/**
 * What a bird does with nothing else to do: its acts, each as likely as its
 * weight and lasting `min` to `max` s; and how often it walks (or paddles) a
 * few steps instead, at most `step` m.
 */
interface Habit {
  readonly acts: readonly (readonly [Act, number, number, number])[];
  readonly wander: number;
  readonly step: number;
}

const HABITS: Record<string, Habit> = {
  crow: { acts: [['look', 0.35, 1, 3], ['preen', 0.15, 2, 4], ['call', 0.15, 1.2, 1.6], ['hop', 0.12, 0.5, 0.6], ['idle', 0.23, 1, 3]], wander: 0, step: 0 },
  pigeon: { acts: [['peck', 0.5, 1.5, 4], ['look', 0.2, 0.8, 2], ['call', 0.05, 1.5, 1.8], ['idle', 0.1, 0.5, 1.5]], wander: 0.35, step: 1.5 },
  gull: { acts: [['look', 0.3, 1, 3], ['preen', 0.15, 2, 4], ['call', 0.15, 1.2, 1.8], ['squabble', 0.1, 1.2, 2], ['idle', 0.3, 1.5, 4]], wander: 0, step: 0 },
  hen: { acts: [['peck', 0.5, 1.5, 4], ['look', 0.15, 0.8, 2], ['call', 0.1, 1.2, 1.4], ['idle', 0.1, 0.5, 1.5]], wander: 0.4, step: 2 },
  grouse: { acts: [['look', 0.5, 1, 2], ['idle', 0.5, 0.5, 1]], wander: 0, step: 0 },
  duck: { acts: [['dabble', 0.25, 2, 4], ['preen', 0.1, 2, 4], ['look', 0.15, 1, 3], ['call', 0.05, 1, 1.2], ['idle', 0.15, 2, 4]], wander: 0.45, step: 4 },
  swan: { acts: [['dabble', 0.2, 2, 5], ['preen', 0.15, 3, 5], ['look', 0.15, 2, 3], ['idle', 0.2, 3, 5]], wander: 0.5, step: 4 },
  goose: { acts: [['peck', 0.5, 2, 5], ['look', 0.2, 1, 2], ['call', 0.08, 1.2, 1.4], ['idle', 0.1, 1, 2]], wander: 0.3, step: 2 },
  heron: { acts: [['idle', 0.45, 3, 8], ['look', 0.2, 1, 3], ['strike', 0.2, 2, 2.6], ['preen', 0.1, 3, 5]], wander: 0.05, step: 1.2 },
};

function habitOf(look: BirdLookId): Habit {
  return HABITS[look] ?? HABITS[BIRD_LOOKS[look].family];
}

// ------------------------------------------------------------ where

const _spot = { x: 0, z: 0 };

/** A spot within `r` of (x, z) (no nearer than `inner`) where `ok` holds, tried at random `tries` times; null if none is found. */
function search(rand: () => number, x: number, z: number, r: number, ok: (x: number, z: number) => boolean, tries = 10, inner = 0): typeof _spot | null {
  for (let k = 0; k < tries; k++) {
    const a = rand() * TAU;
    const d = inner + Math.sqrt(rand()) * Math.max(0, r - inner);
    const sx = x + Math.sin(a) * d;
    const sz = z + Math.cos(a) * d;
    if (ok(sx, sz)) {
      _spot.x = sx;
      _spot.z = sz;
      return _spot;
    }
  }
  return null;
}

/** A spot `from` to `to` m from (x, z), as near the way `yaw` as can be found (swinging out either side), where `ok` holds. */
function searchToward(rand: () => number, x: number, z: number, yaw: number, from: number, to: number, ok: (x: number, z: number) => boolean): typeof _spot | null {
  for (const swing of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.7, -1.7, 2.3, -2.3]) {
    for (let k = 0; k < 2; k++) {
      const a = yaw + swing + (rand() - 0.5) * 0.3;
      const d = from + rand() * (to - from);
      const sx = x + Math.sin(a) * d;
      const sz = z + Math.cos(a) * d;
      if (ok(sx, sz)) {
        _spot.x = sx;
        _spot.z = sz;
        return _spot;
      }
    }
  }
  return null;
}

/** One place a bird can stand on a perch. */
export interface PerchSpot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

/** Every place a bird can stand on `perches`: one on each, or a row along a ridge or rail `w` long, `spacing` apart. */
export function perchSpots(perches: readonly Perch[], spacing: number, ground: (x: number, z: number) => number): PerchSpot[] {
  const spots: PerchSpot[] = [];
  for (const p of perches) {
    const yaw = p.yaw ?? 0;
    const n = Math.max(1, Math.floor((p.w ?? 0) / spacing) + 1);
    // Along the row: across the way they face.
    const ax = Math.cos(yaw);
    const az = -Math.sin(yaw);
    for (let k = 0; k < n; k++) {
      const u = n === 1 ? 0 : (k / (n - 1) - 0.5) * (p.w ?? 0);
      const [x, z] = [p.x + ax * u, p.z + az * u];
      spots.push({ x, y: p.y ?? ground(x, z), z, yaw });
    }
  }
  return spots;
}

/**
 * `n` birds' places on `perches`, one perch each in turn: birds that share a
 * perch spread along its row.
 */
export function perchesFor(perches: readonly Perch[], n: number, ground: (x: number, z: number) => number): PerchSpot[] {
  const spots: PerchSpot[] = [];
  const P = perches.length;
  for (let i = 0; i < n; i++) {
    const p = perches[i % P];
    const m = Math.floor((n - 1 - (i % P)) / P) + 1;
    const j = Math.floor(i / P);
    const u = m === 1 ? 0 : (j / (m - 1) - 0.5) * (p.w ?? 0);
    const yaw = p.yaw ?? 0;
    const [x, z] = [p.x + Math.cos(yaw) * u, p.z - Math.sin(yaw) * u];
    spots.push({ x, y: p.y ?? ground(x, z), z, yaw });
  }
  return spots;
}

/** How far apart birds of `look` stand on a perch's row. */
function spacingOf(look: BirdLookId): number {
  const body = BIRD_LOOKS[look].body;
  return Math.max(0.3, (body.hipW + body.breast.w) * 3);
}

/** Where a bird lands to: its feet on the ground, a perch's top or the shallows' bed, or the water's face swimming. */
interface Goal {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly on: Footing | 'swim';
  readonly perch: number;
}

/** How far (horizontally) `b` is from you. */
function far(b: Bird, you: You): number {
  return Math.hypot(b.at.x - you.x, b.at.z - you.z);
}

/** Which way is away from you, from `b`, give or take `spread` rad. */
function awayFrom(b: Bird, you: You, spread: number): number {
  return Math.atan2(b.at.x - you.x, b.at.z - you.z) + (b.rand() - 0.5) * spread;
}

// ------------------------------------------------------------ what every brain does

/** Where a bird of a brain is in its fright: at peace, startled (taking off in a moment), fled, coming back. */
const PEACE = 0;
const STARTLED = 1;
const FLED = 2;
const BACK = 3;

abstract class Life implements Brain {
  protected readonly plan: BirdFlockPlan;
  protected readonly birds: readonly Bird[];
  protected readonly near: Surroundings;
  /** Each bird's state: PEACE, STARTLED, FLED or BACK, as the brain reads them. */
  protected readonly state: Uint8Array;
  /** Each bird's timer: s until it takes off (startled), or more of it to fly (fled), or how long you've been gone. */
  protected readonly timer: Float32Array;
  /** Where each bird is landing to, while it flies in. */
  protected readonly goals: (Goal | null)[];
  /** The way the flock circles. */
  protected readonly dir: 1 | -1;
  protected readonly shy: number;

  constructor(protected readonly life: FlockLife) {
    this.plan = life.plan;
    this.birds = life.birds;
    this.near = life.near;
    const n = this.birds.length;
    this.state = new Uint8Array(n);
    this.timer = new Float32Array(n);
    this.goals = new Array<Goal | null>(n).fill(null);
    this.dir = this.birds[0].rand() < 0.5 ? 1 : -1;
    this.shy = shyOf(this.birds[0].look, this.plan);
  }

  abstract home(): void;
  abstract update(dt: number, you: You): void;

  /** Could a bird stand on the ground at (x, z): clear, and dry? */
  protected standable = (x: number, z: number): boolean => this.dry(x, z) && this.near.clear(x, z);

  protected dry(x: number, z: number): boolean {
    const water = this.near.waterAt(x, z);
    return Number.isNaN(water) || water < this.near.heightAt(x, z) + 0.02;
  }

  /** Is the water at (x, z) deep enough for `b` to swim? */
  protected swimmable(b: Bird, x: number, z: number): boolean {
    const water = this.near.waterAt(x, z);
    return !Number.isNaN(water) && water - this.near.heightAt(x, z) > b.sink + 0.12;
  }

  /** Are (x, z) shallows a bird can wade in? Deeper than its legs, it stands on the mud as far down as WADE lets it, and the water hides the rest. */
  protected shallow(x: number, z: number): boolean {
    const water = this.near.waterAt(x, z);
    if (Number.isNaN(water)) return false;
    const depth = water - this.near.heightAt(x, z);
    return depth > 0.03 && depth < CONFIG.birds.shallows;
  }

  /** The floor at (x, z) for `b` standing `on` it, as the bird will find it (mover.ts). */
  protected floorFor(b: Bird, x: number, z: number, on: Footing): number {
    const ground = this.near.heightAt(x, z);
    if (on === 'ground') return ground;
    const water = this.near.waterAt(x, z);
    return Number.isNaN(water) ? ground : Math.max(ground, water - b.leg * WADE);
  }

  /** The water's face at (x, z), or the ground's where it's dry: what flying heights are over. */
  protected surfaceAt(x: number, z: number): number {
    const water = this.near.waterAt(x, z);
    const ground = this.near.heightAt(x, z);
    return Number.isNaN(water) ? ground : Math.max(ground, water);
  }

  /**
   * When `b` is done with what it's doing, what next: one of its habits, or
   * (unless it's `perched`) a few steps or strokes somewhere within `r` of
   * (cx, cz).
   */
  protected pastime(b: Bird, cx: number, cz: number, r: number, perched: boolean): void {
    if (b.actT < b.actFor) return;
    if (b.doing === 'walk' || (b.doing === 'swim' && b.left > 0.05)) return;
    const h = habitOf(b.look);
    const swim = b.doing === 'swim';
    if (!perched && h.wander > 0 && b.rand() < h.wander) {
      const ok = (x: number, z: number) => Math.hypot(x - cx, z - cz) <= r && (swim ? this.swimmable(b, x, z) : b.footing === 'water' ? this.shallow(x, z) : this.standable(x, z));
      const s = search(() => b.rand(), b.at.x, b.at.z, h.step, ok, 6, h.step * 0.3);
      if (s) {
        b.goTo(s.x, s.z);
        b.headTo = 0;
        return;
      }
    }
    let pick = b.rand() * h.acts.reduce((sum, a) => sum + a[1], 0);
    let act = h.acts[0];
    for (const a of h.acts) {
      act = a;
      if ((pick -= a[1]) <= 0) break;
    }
    const [name, , min, max] = act;
    b.setAct(name, min + b.rand() * (max - min));
    b.headTo = name === 'look' ? (b.rand() - 0.5) * 1.8 : 0;
    if (name === 'call') this.life.call(b);
    if (name === 'hop') b.face = b.at.yaw + (b.rand() - 0.5) * 1.6;
  }

  /** `b` sees you coming: neck up, its head turned to you. */
  protected watch(b: Bird, you: You): void {
    if (b.act !== 'alert') b.setAct('alert', 1.2 + b.rand());
    let d = Math.atan2(you.x - b.at.x, you.z - b.at.z) - b.at.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    b.headTo = Math.max(-1.2, Math.min(1.2, d));
  }

  /** Bird `i` flies in to `goal`: toward a point over it, and down onto it once near. */
  protected sendTo(i: number, goal: Goal): void {
    this.goals[i] = goal;
    this.birds[i].headFor({ kind: 'point', x: goal.x, y: goal.y + 2.5, z: goal.z });
  }

  /** Bird `i` flying in: once it's near its goal, it comes down onto it. Is it down? */
  protected comeIn(i: number): boolean {
    const b = this.birds[i];
    const g = this.goals[i];
    if (!g) return !b.flying;
    if (b.doing === 'fly') {
      if (Math.hypot(g.x - b.at.x, g.z - b.at.z) < Math.max(4, b.cruise * 0.9)) b.landAt(g.x, g.y, g.z, g.yaw, g.on, g.perch);
      return false;
    }
    if (b.doing === 'land') return false;
    this.goals[i] = null;
    return true;
  }

  /** Startle bird `i` (it takes off within `delay` s), and those of its flock within `spread` m of it (that `will`) a moment after. */
  protected startle(i: number, delay: number, spread: number, will: (b: Bird) => boolean = () => true): void {
    const b = this.birds[i];
    this.birds.forEach((o, k) => {
      if (this.state[k] !== PEACE || !will(o)) return;
      if (k !== i && Math.hypot(o.at.x - b.at.x, o.at.z - b.at.z) > spread) return;
      this.state[k] = STARTLED;
      this.timer[k] = k === i ? b.rand() * delay : 0.15 + o.rand() * (delay + 0.4);
    });
  }
}

// ------------------------------------------------------------ on the ground

/** Hens: peck about their patch, run off from you with their wings out, and wander back. */
class Peck extends Life {
  home(): void {
    for (const b of this.birds) {
      const s = search(() => b.rand(), this.plan.x, this.plan.z, this.plan.r * 0.6, this.standable) ?? this.plan;
      b.standAt(s.x, s.z, b.rand() * TAU, this.near);
    }
  }

  update(_dt: number, you: You): void {
    const { plan } = this;
    for (const b of this.birds) {
      if (far(b, you) < this.shy && !(b.running && b.left > 0.3)) {
        const yaw = awayFrom(b, you, 1);
        const s = searchToward(() => b.rand(), b.at.x, b.at.z, yaw, 2.5, 4.5, (x, z) => Math.hypot(x - plan.x, z - plan.z) < plan.r * 2 && Math.hypot(x - you.x, z - you.z) > this.shy && this.standable(x, z));
        if (s) {
          b.goTo(s.x, s.z, true);
          this.life.call(b, 'cackle');
          continue;
        }
      }
      if (!b.running) this.pastime(b, plan.x, plan.z, plan.r, false);
    }
  }
}

/** Geese: graze their patch; the one nearest you turns on you and hisses while the rest waddle off; too near, and it goes too. */
class Graze extends Life {
  /** The bird standing up to you, while one is. */
  private gander = -1;

  home(): void {
    this.gander = -1;
    for (const b of this.birds) {
      const s = search(() => b.rand(), this.plan.x, this.plan.z, this.plan.r * 0.6, this.standable) ?? this.plan;
      b.standAt(s.x, s.z, b.rand() * TAU, this.near);
    }
  }

  update(_dt: number, you: You): void {
    const { plan, birds, shy } = this;
    let nearest = -1;
    let best = Infinity;
    birds.forEach((b, i) => {
      const d = far(b, you);
      if (d < best) [best, nearest] = [d, i];
    });
    if (best > shy * 1.4) this.gander = -1;
    else if (this.gander < 0 && best < shy) this.gander = nearest;
    birds.forEach((b, i) => {
      const d = far(b, you);
      if (i === this.gander && d > shy * 0.45) {
        // Standing its ground: facing you, neck out low, hissing.
        b.face = Math.atan2(you.x - b.at.x, you.z - b.at.z);
        if (b.doing === 'walk') b.goTo(b.at.x, b.at.z);
        if (b.act !== 'hiss' || b.actT >= b.actFor) {
          b.setAct('hiss', 1.6 + b.rand());
          this.life.call(b, 'hiss');
        }
        return;
      }
      const near = i === this.gander ? d < shy * 0.45 : d < shy * (this.gander >= 0 ? 1.6 : 1);
      if (near && !(b.doing === 'walk' && b.left > 0.3)) {
        const yaw = awayFrom(b, you, 0.8);
        const s = searchToward(() => b.rand(), b.at.x, b.at.z, yaw, 2.5, 4.5, (x, z) => Math.hypot(x - plan.x, z - plan.z) < plan.r * 2.2 && this.standable(x, z));
        if (s) {
          b.goTo(s.x, s.z, i === this.gander);
          if (b.rand() < 0.3) this.life.call(b, 'honk');
          return;
        }
      }
      if (b.doing !== 'walk') this.pastime(b, plan.x, plan.z, plan.r, false);
    });
  }
}

/**
 * Pigeons: feed about their patch; burst up all at once as you come through,
 * circle and settle on their perches; and drop back down to feed once
 * you've gone. One you come under on its perch lifts off again, and settles
 * somewhere else.
 */
class Flush extends Life {
  private readonly spots: PerchSpot[];
  /** Which spot each bird has, and who's on each. */
  private readonly spotOf: Int16Array;
  private readonly taken: Int16Array;
  /** Per bird, s at peace on its perch before it'll drop back down. */
  private readonly settle: Float32Array;

  constructor(life: FlockLife) {
    super(life);
    this.spots = perchSpots(this.plan.perches ?? [], spacingOf(this.birds[0].look), life.near.heightAt);
    this.spotOf = new Int16Array(this.birds.length).fill(-1);
    this.taken = new Int16Array(this.spots.length).fill(-1);
    this.settle = new Float32Array(this.birds.length);
  }

  home(): void {
    this.taken.fill(-1);
    this.spotOf.fill(-1);
    this.birds.forEach((b, i) => {
      const s = search(() => b.rand(), this.plan.x, this.plan.z, this.plan.r * 0.7, this.standable) ?? this.plan;
      b.standAt(s.x, s.z, b.rand() * TAU, this.near);
      this.state[i] = PEACE;
      this.goals[i] = null;
    });
  }

  update(dt: number, you: You): void {
    const { birds, plan, shy } = this;
    const calm = Math.hypot(you.x - plan.x, you.z - plan.z) > plan.r + shy * 2.5;
    // Anyone feeding you come near, and they all go.
    const feeding = (b: Bird, i: number) => this.state[i] === PEACE && Number.isNaN(b.perch) && !b.flying;
    if (birds.some((b, i) => feeding(b, i) && far(b, you) < shy)) {
      let first = true;
      birds.forEach((b, i) => {
        if (!feeding(b, i)) return;
        this.state[i] = STARTLED;
        this.timer[i] = b.rand() * 0.35;
        if (first) this.life.call(b, 'clatter', true);
        first = false;
      });
    }
    birds.forEach((b, i) => {
      switch (this.state[i]) {
        case PEACE: {
          if (Number.isNaN(b.perch)) {
            this.pastime(b, plan.x, plan.z, plan.r, false);
            break;
          }
          // On a perch: you come under it and it's off again; you've gone and it drops back down to feed.
          if (far(b, you) < shy * 0.6) {
            this.startle(i, 0.2, 2.5);
            break;
          }
          this.pastime(b, 0, 0, 0, true);
          this.timer[i] = calm ? this.timer[i] + dt : 0;
          if (this.timer[i] > this.settle[i]) {
            const s = search(() => b.rand(), plan.x, plan.z, plan.r * 0.8, (x, z) => this.standable(x, z) && Math.hypot(x - you.x, z - you.z) > shy * 1.5);
            if (!s) break;
            this.free(i);
            b.takeOff(s.x - b.at.x, s.z - b.at.z, { kind: 'point', x: s.x, y: this.near.heightAt(s.x, s.z) + 2.5, z: s.z });
            this.goals[i] = { x: s.x, y: this.near.heightAt(s.x, s.z), z: s.z, yaw: b.rand() * TAU, on: 'ground', perch: NaN };
            this.state[i] = BACK;
          }
          break;
        }
        case STARTLED:
          if ((this.timer[i] -= dt) > 0) break;
          this.free(i);
          b.takeOff(...this.away(b, you), this.circle(b));
          this.timer[i] = 2.5 + b.rand() * 3;
          this.state[i] = FLED;
          break;
        case FLED:
          if ((this.timer[i] -= dt) > 0) break;
          if (this.goals[i]) {
            if (this.comeIn(i)) this.perched(i);
            break;
          }
          this.perchOn(i, you);
          break;
        case BACK:
          if (this.comeIn(i)) this.state[i] = PEACE;
          break;
      }
    });
  }

  /** Up and away from you, flinging out from the flock. */
  private away(b: Bird, you: You): [number, number] {
    const a = awayFrom(b, you, 1.6);
    return [Math.sin(a), Math.cos(a)];
  }

  private circle(b: Bird) {
    const { plan } = this;
    return { kind: 'circle' as const, x: plan.x, y: this.surfaceAt(plan.x, plan.z) + 5 + b.rand() * 3, z: plan.z, r: plan.r + 3 + b.rand() * 3, dir: this.dir };
  }

  /** Bird `i`, circling, picks a free spot on a perch out of your way and flies in to it; none, and it circles on. */
  private perchOn(i: number, you: You): void {
    const b = this.birds[i];
    const free: number[] = [];
    this.taken.forEach((who, k) => {
      if (who < 0 && Math.hypot(this.spots[k].x - you.x, this.spots[k].z - you.z) > this.shy) free.push(k);
    });
    if (!free.length) {
      this.timer[i] = 2;
      return;
    }
    const k = free[Math.floor(b.rand() * free.length)];
    const s = this.spots[k];
    this.taken[k] = i;
    this.spotOf[i] = k;
    this.sendTo(i, { x: s.x, y: s.y, z: s.z, yaw: s.yaw, on: 'ground', perch: s.y });
  }

  private perched(i: number): void {
    this.state[i] = PEACE;
    this.timer[i] = 0;
    this.settle[i] = CONFIG.birds.calm + 2 + this.birds[i].rand() * 8;
  }

  private free(i: number): void {
    const k = this.spotOf[i];
    if (k >= 0) this.taken[k] = -1;
    this.spotOf[i] = -1;
  }
}

/**
 * Grouse: down in the heather, unseen, until you're nearly on them; then up
 * all at once, whirring, low and fast away from you a long way, and down
 * again out of sight. Home again some while after, once you've gone.
 */
class Covey extends Life {
  /** Where the covey is (home, or where it fled to), and how long it's been away. */
  private x = 0;
  private z = 0;
  private gone = 0;

  home(): void {
    this.x = this.plan.x;
    this.z = this.plan.z;
    this.gone = 0;
    this.hideAll();
  }

  private hideAll(): void {
    this.birds.forEach((b, i) => {
      const s = search(() => b.rand(), this.x, this.z, 1.6, this.standable, 8, 0.4) ?? { x: this.x, z: this.z };
      b.hideAt(s.x, s.z, this.near);
      this.state[i] = PEACE;
      this.goals[i] = null;
    });
  }

  update(dt: number, you: You): void {
    const { birds, shy, plan } = this;
    const hidden = birds.every((b) => b.doing === 'hidden');
    if (hidden && birds.some((b) => far(b, you) < shy)) this.flush(you);
    // Home again, unseen, once it's been away a while and you're nowhere near.
    const athome = this.x === plan.x && this.z === plan.z;
    this.gone += dt;
    if (hidden && !athome && this.gone > CONFIG.birds.away && Math.hypot(you.x - this.x, you.z - this.z) > 40 && Math.hypot(you.x - plan.x, you.z - plan.z) > 40) {
      this.x = plan.x;
      this.z = plan.z;
      this.hideAll();
    }
    birds.forEach((b, i) => {
      switch (this.state[i]) {
        case STARTLED: {
          if ((this.timer[i] -= dt) > 0) break;
          const g = this.goals[i]!;
          b.takeOff(g.x - b.at.x, g.z - b.at.z, { kind: 'point', x: g.x, y: g.y + 2.5, z: g.z }, b.paces.fly * (0.95 + b.rand() * 0.1));
          this.state[i] = FLED;
          break;
        }
        case FLED:
          if (this.comeIn(i)) {
            b.setAct('alert', 0.8 + b.rand() * 1.2);
            this.state[i] = BACK;
          }
          break;
        case BACK:
          // Down, a look round, then into the heather out of sight.
          if (b.actT < b.actFor) break;
          if (b.act !== 'crouch') b.setAct('crouch', 0.9);
          else {
            b.doing = 'hidden';
            this.state[i] = PEACE;
          }
          break;
      }
    });
  }

  /** Up all at once, away from you to somewhere 30–60 m off where they can drop in. */
  private flush(you: You): void {
    const { birds, shy } = this;
    const lead = birds[0];
    const yaw = Math.atan2(this.x - you.x, this.z - you.z);
    const ok = (x: number, z: number) => this.standable(x, z) && Math.hypot(x - you.x, z - you.z) > shy * 3;
    const s = searchToward(() => lead.rand(), this.x, this.z, yaw, 30, 60, ok) ?? searchToward(() => lead.rand(), this.x, this.z, yaw, 12, 30, ok);
    if (!s) return;
    const [gx, gz] = [s.x, s.z];
    this.x = gx;
    this.z = gz;
    this.gone = 0;
    this.life.call(lead, 'whirr', true);
    this.life.call(lead, 'goback', true);
    birds.forEach((b, i) => {
      const t = search(() => b.rand(), gx, gz, 2.5, this.standable, 8, 0.6) ?? { x: gx, z: gz };
      b.standAt(b.at.x, b.at.z, Math.atan2(t.x - b.at.x, t.z - b.at.z), this.near);
      this.state[i] = STARTLED;
      this.timer[i] = i === 0 ? 0 : b.rand() * 0.3;
      this.goals[i] = { x: t.x, y: this.near.heightAt(t.x, t.z), z: t.z, yaw: Math.atan2(t.x - b.at.x, t.z - b.at.z), on: 'ground', perch: NaN };
    });
  }
}

// ------------------------------------------------------------ off the ground

/**
 * Ravens, crows and gulls on bollards: each on its own perch, looking about,
 * preening and calling; off as you come near (its neighbours too), circling
 * overhead, and back to its perch once you've gone.
 */
class Perching extends Life {
  private readonly spots: PerchSpot[];
  /** How long you've been far enough off for each bird to come back. */
  private readonly calm: Float32Array;

  constructor(life: FlockLife) {
    super(life);
    this.spots = perchesFor(this.plan.perches ?? [{ x: this.plan.x, z: this.plan.z, w: this.plan.r }], this.birds.length, life.near.heightAt);
    this.calm = new Float32Array(this.birds.length);
  }

  /** Bird `i`'s perch spot, its own while the flock's built. */
  private spot(i: number): PerchSpot {
    return this.spots[i];
  }

  home(): void {
    this.birds.forEach((b, i) => {
      const s = this.spot(i);
      b.standAt(s.x, s.z, s.yaw + (b.rand() - 0.5) * 0.6, this.near, s.y);
      this.state[i] = PEACE;
      this.goals[i] = null;
    });
  }

  update(dt: number, you: You): void {
    const { birds, shy, plan } = this;
    const [low, high] = plan.high ?? [6, 12];
    birds.forEach((b, i) => {
      const s = this.spot(i);
      const yours = Math.hypot(s.x - you.x, s.z - you.z);
      switch (this.state[i]) {
        case PEACE:
          if (yours < shy) {
            this.startle(i, 0.3, 8);
            break;
          }
          if (yours < shy * 1.5) {
            this.watch(b, you);
            break;
          }
          this.pastime(b, 0, 0, 0, true);
          break;
        case STARTLED:
          if ((this.timer[i] -= dt) > 0) break;
          {
            const a = awayFrom(b, you, 1.2);
            const y = s.y + low + b.rand() * (high - low);
            b.takeOff(Math.sin(a), Math.cos(a), { kind: 'circle', x: plan.x, y, z: plan.z, r: Math.max(6, plan.r) * (0.8 + b.rand() * 0.5), dir: this.dir });
            if (b.rand() < 0.6) this.life.call(b);
          }
          this.timer[i] = 6 + b.rand() * 6;
          this.calm[i] = 0;
          this.state[i] = FLED;
          break;
        case FLED:
          this.timer[i] -= dt;
          this.calm[i] = yours > shy * 1.6 ? this.calm[i] + dt : 0;
          if (b.rand() < dt / 9) this.life.call(b);
          if (this.timer[i] <= 0 && this.calm[i] > CONFIG.birds.calm) {
            this.sendTo(i, { x: s.x, y: s.y, z: s.z, yaw: s.yaw + (b.rand() - 0.5) * 0.6, on: 'ground', perch: s.y });
            this.state[i] = BACK;
          }
          break;
        case BACK:
          if (yours < shy && b.doing === 'fly') {
            // You're there again: round once more.
            this.goals[i] = null;
            b.headFor({ kind: 'circle', x: plan.x, y: s.y + low + b.rand() * (high - low), z: plan.z, r: Math.max(6, plan.r), dir: this.dir });
            this.timer[i] = 4;
            this.state[i] = FLED;
            break;
          }
          if (this.comeIn(i)) this.state[i] = PEACE;
          break;
      }
    });
  }
}

/** Gulls over a harbour: circling, gliding mostly, rising and falling, never landing. */
class Circling extends Life {
  home(): void {
    this.birds.forEach((b, i) => {
      const c = this.circle(b);
      const a = (i / this.birds.length) * TAU + b.rand();
      b.flyAt(c.x + Math.sin(a) * c.r, c.y, c.z + Math.cos(a) * c.r, a + (c.dir * Math.PI) / 2, c);
      this.timer[i] = 6 + b.rand() * 12;
    });
  }

  private circle(b: Bird) {
    const { plan } = this;
    const [low, high] = plan.high ?? [10, 20];
    const dir: 1 | -1 = b.rand() < 0.75 ? this.dir : this.dir === 1 ? -1 : 1;
    return { kind: 'circle' as const, x: plan.x + (b.rand() - 0.5) * plan.r * 0.4, y: this.surfaceAt(plan.x, plan.z) + low + b.rand() * (high - low), z: plan.z + (b.rand() - 0.5) * plan.r * 0.4, r: plan.r * (0.45 + b.rand() * 0.6), dir };
  }

  update(dt: number): void {
    this.birds.forEach((b, i) => {
      if ((this.timer[i] -= dt) <= 0) {
        b.headFor(this.circle(b));
        this.timer[i] = 8 + b.rand() * 14;
      }
      if (b.rand() < dt / 14) this.life.call(b);
    });
  }
}

/**
 * Ducks and swans on their water: paddling about, dabbling, preening. A
 * duck takes off as you wade in (or come right up to the bank), circles wide
 * and comes back down onto the water once you've gone; a swan only paddles
 * off from you.
 */
class Swim extends Life {
  home(): void {
    this.birds.forEach((b, i) => {
      const s = search(() => b.rand(), this.plan.x, this.plan.z, this.plan.r * 0.7, (x, z) => this.swimmable(b, x, z), 16) ?? this.plan;
      b.swimAt(s.x, s.z, b.rand() * TAU, this.near.waterAt(s.x, s.z));
      this.state[i] = PEACE;
      this.goals[i] = null;
    });
  }

  update(dt: number, you: You): void {
    const { birds, plan, shy } = this;
    const flier = (b: Bird) => b.look !== 'swan';
    birds.forEach((b, i) => {
      const d = far(b, you);
      const scared = (d < shy && you.wading) || d < shy * 0.45;
      switch (this.state[i]) {
        case PEACE:
          if (scared && flier(b)) {
            this.startle(i, 0.4, plan.r * 2, flier);
            this.life.call(b);
            break;
          }
          if (scared && !(b.running && b.left > 0.3)) {
            // A swan paddles off, briskly, to the far side of its water from you.
            let best: { x: number; z: number } | null = null;
            let bestD = -1;
            for (let k = 0; k < 8; k++) {
              const s = search(() => b.rand(), plan.x, plan.z, plan.r, (x, z) => this.swimmable(b, x, z), 4);
              if (s && Math.hypot(s.x - you.x, s.z - you.z) > bestD) [best, bestD] = [{ ...s }, Math.hypot(s.x - you.x, s.z - you.z)];
            }
            if (best) {
              b.goTo(best.x, best.z, true);
              b.headTo = 0;
            }
            break;
          }
          if (!b.running) this.pastime(b, plan.x, plan.z, plan.r, false);
          break;
        case STARTLED: {
          if ((this.timer[i] -= dt) > 0) break;
          const a = awayFrom(b, you, 1.2);
          const y = this.surfaceAt(plan.x, plan.z) + 9 + b.rand() * 5;
          b.takeOff(Math.sin(a), Math.cos(a), { kind: 'circle', x: plan.x, y, z: plan.z, r: plan.r + 16 + b.rand() * 6, dir: this.dir });
          this.timer[i] = 8 + b.rand() * 6;
          this.state[i] = FLED;
          break;
        }
        case FLED: {
          this.timer[i] -= dt;
          const gone = Math.hypot(you.x - plan.x, you.z - plan.z) > plan.r + shy * 1.8;
          if (this.timer[i] > 0 || !gone) break;
          const s = search(() => b.rand(), plan.x, plan.z, plan.r * 0.8, (x, z) => this.swimmable(b, x, z), 16);
          if (!s) break;
          this.sendTo(i, { x: s.x, y: this.near.waterAt(s.x, s.z), z: s.z, yaw: b.at.yaw, on: 'swim', perch: NaN });
          this.state[i] = BACK;
          break;
        }
        case BACK:
          if (this.comeIn(i)) this.state[i] = PEACE;
          break;
      }
    });
  }
}

/**
 * Herons and egrets: standing in the shallows, still, then a strike at the
 * water; off with slow wingbeats as you come near, 30–40 m on, down in the
 * shallows there (or on the bank); and home again some while after you've
 * gone.
 */
class Wade extends Life {
  /** Is it away from home, and how long since it got there? */
  private readonly away: Uint8Array;
  private readonly since: Float32Array;
  /** Where it stands about (home, or where it fled to): it steps about within the plan's `r` of it. */
  private readonly ax: Float32Array;
  private readonly az: Float32Array;

  constructor(life: FlockLife) {
    super(life);
    const n = this.birds.length;
    this.away = new Uint8Array(n);
    this.since = new Float32Array(n);
    this.ax = new Float32Array(n);
    this.az = new Float32Array(n);
  }

  /** Where bird `i` keeps: the plan's spot, the rest of its flock round it. */
  private homeOf(i: number): { x: number; z: number } {
    const { plan } = this;
    if (i === 0) return plan;
    const a = i * 2.4;
    return { x: plan.x + Math.sin(a) * Math.min(plan.r, 3), z: plan.z + Math.cos(a) * Math.min(plan.r, 3) };
  }

  home(): void {
    this.birds.forEach((b, i) => {
      const h = this.homeOf(i);
      b.standAt(h.x, h.z, b.rand() * TAU, this.near, NaN, this.shallow(h.x, h.z) ? 'water' : 'ground');
      this.state[i] = PEACE;
      this.away[i] = 0;
      this.ax[i] = h.x;
      this.az[i] = h.z;
      this.goals[i] = null;
    });
  }

  update(dt: number, you: You): void {
    const { birds, shy } = this;
    birds.forEach((b, i) => {
      const d = far(b, you);
      switch (this.state[i]) {
        case PEACE: {
          if (d < shy) {
            this.startle(i, 0.4, 6);
            break;
          }
          if (d < shy * 1.5 && b.act !== 'strike') {
            this.watch(b, you);
            break;
          }
          this.pastime(b, this.ax[i], this.az[i], Math.min(this.plan.r, 3), false);
          if (!this.away[i]) break;
          // Away: home again once you've long gone from both.
          const home = this.homeOf(i);
          this.since[i] += dt;
          if (this.since[i] > CONFIG.birds.away && d > 30 && Math.hypot(you.x - home.x, you.z - home.z) > 30) {
            b.takeOff(home.x - b.at.x, home.z - b.at.z, { kind: 'point', x: home.x, y: this.surfaceAt(home.x, home.z) + 6, z: home.z });
            const on: Footing = this.shallow(home.x, home.z) ? 'water' : 'ground';
            this.goals[i] = { x: home.x, y: this.floorFor(b, home.x, home.z, on), z: home.z, yaw: b.rand() * TAU, on, perch: NaN };
            this.state[i] = BACK;
          }
          break;
        }
        case STARTLED: {
          if ((this.timer[i] -= dt) > 0) break;
          const g = this.fleeTo(i, you);
          if (!g) {
            this.state[i] = PEACE;
            break;
          }
          b.takeOff(g.x - b.at.x, g.z - b.at.z, { kind: 'point', x: g.x, y: this.surfaceAt(g.x, g.z) + 7, z: g.z });
          this.goals[i] = g;
          this.life.call(b);
          this.state[i] = FLED;
          break;
        }
        case FLED:
        case BACK:
          if (this.comeIn(i)) {
            this.away[i] = this.state[i] === FLED ? 1 : 0;
            this.since[i] = 0;
            this.ax[i] = b.at.x;
            this.az[i] = b.at.z;
            this.state[i] = PEACE;
          }
          break;
      }
    });
  }

  /** Where bird `i` flees to: home, if that's away from you; else shallows (or the bank) 30–40 m on. */
  private fleeTo(i: number, you: You): Goal | null {
    const b = this.birds[i];
    const home = this.homeOf(i);
    const yaw = awayFrom(b, you, 0.6);
    const goal = (x: number, z: number): Goal => {
      const on: Footing = this.shallow(x, z) ? 'water' : 'ground';
      return { x, y: this.floorFor(b, x, z, on), z, yaw: b.rand() * TAU, on, perch: NaN };
    };
    if (this.away[i] && Math.hypot(home.x - you.x, home.z - you.z) > this.shy * 2.5) return goal(home.x, home.z);
    const clear = (x: number, z: number) => Math.hypot(x - you.x, z - you.z) > this.shy * 2;
    const s =
      searchToward(() => b.rand(), b.at.x, b.at.z, yaw, 30, 40, (x, z) => clear(x, z) && this.shallow(x, z)) ??
      searchToward(() => b.rand(), b.at.x, b.at.z, yaw, 25, 45, (x, z) => clear(x, z) && this.standable(x, z));
    return s ? goal(s.x, s.z) : null;
  }
}

/** Each way of living's brain. */
export const BRAINS: Record<BirdWays, (life: FlockLife) => Brain> = {
  peck: (life) => new Peck(life),
  graze: (life) => new Graze(life),
  flush: (life) => new Flush(life),
  covey: (life) => new Covey(life),
  perch: (life) => new Perching(life),
  circle: (life) => new Circling(life),
  swim: (life) => new Swim(life),
  wade: (life) => new Wade(life),
};

