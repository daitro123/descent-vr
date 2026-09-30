import { Vector3 } from 'three';
import { ABILITY, type Ability } from '../classes';
import { type AttackConfig, CONFIG } from '../config';

// The rules of the abilities cast by gesture, with nothing drawn: each
// ability's cooldown and how long it lasts (or how long the next blow it arms
// waits: Mortal Strike, Shield Slam), whom Heroic Throw flies at, what a block
// costs behind Shield Wall, and whom Sweeping Strikes also hits.
// Combat applies them (combat.ts); the tests drive them here.

/** Each gesture ability's colour: its trail and burst as it's read, and what it does in the world. */
export const ABILITY_COLOUR: Readonly<Partial<Record<Ability, number>>> = {
  heroicThrow: 0x80e0ff, // a pale spectral blue: the axe
  shieldWall: 0xffc84a, // gold: the shield's glow
  sweepingStrikes: 0xff5a40, // red: the second blow's embers
  mortalStrike: 0xb01830, // deep blood red: the blade's edge while it's armed
  shieldSlam: 0xe0e8f0, // bright steel: the shield's rim while it's armed
  powerShot: 0xffe07a, // a hot gold-white: the nocked arrow's glow
  snareTrap: 0x8fd060, // a leaf green: the trap set down and the root it springs
  frostNova: 0xbfe8ff, // a pale ice blue: the frost that bursts from you
  fireball: 0xff7a20, // orange: the burning bolt and its burst
  frostbolt: 0x4fb8ff, // a deep ice blue: the frost bolt and the frost it leaves
  chainLightning: 0xc8b0ff, // a pale violet-white: the bolt and its arcs
  blizzard: 0xe4f4ff, // snow white: the circle and the ice that falls in it
};

/** Why an ability can't be used now: still cooling down, or not enough of the class's resource. */
export type Refusal = 'cooling' | 'poor';

/**
 * Each ability's cooldown, how long the ones that last (Shield Wall, Sweeping
 * Strikes) have left, and which of those that change your next attack
 * (Fireball's, Frostbolt's and Chain Lightning's next bolt) are waiting on it.
 */
export class AbilityClock {
  private readonly cooling = new Map<Ability, number>();
  private readonly lasting = new Map<Ability, number>();
  private readonly waiting = new Set<Ability>();

  tick(dt: number): void {
    for (const [a, s] of this.cooling) s - dt > 0 ? this.cooling.set(a, s - dt) : this.cooling.delete(a);
    for (const [a, s] of this.lasting) s - dt > 0 ? this.lasting.set(a, s - dt) : this.lasting.delete(a);
  }

  /** Seconds before `ability` can be used again: 0 once it can. */
  cooldown(ability: Ability): number {
    return this.cooling.get(ability) ?? 0;
  }

  /** Seconds left of what `ability` started: 0 once it's over, or for one that doesn't last. */
  left(ability: Ability): number {
    return this.lasting.get(ability) ?? 0;
  }

  /** Can `ability`, costing `cost` (its own unless talents change it), be used with `resource` in the bar? Null if so, or why not. */
  refuses(ability: Ability, resource: number, cost = ABILITY[ability].cost): Refusal | null {
    if (this.cooldown(ability) > 0) return 'cooling';
    if (resource < cost) return 'poor';
    return null;
  }

  /** `ability` was used: its cooldown starts, and it lasts `lasts` s. */
  used(ability: Ability, lasts = 0): void {
    if (ABILITY[ability].cooldown > 0) this.cooling.set(ability, ABILITY[ability].cooldown);
    if (lasts > 0) this.lasting.set(ability, lasts);
  }

  /** What `ability` started is over before its time: the blow it armed has landed. */
  end(ability: Ability): void {
    this.lasting.delete(ability);
  }

  /** `ability` changes your next attack: it waits on it until spent. */
  prime(ability: Ability): void {
    this.waiting.add(ability);
  }

  /** Is `ability` waiting on your next attack? */
  primed(ability: Ability): boolean {
    return this.waiting.has(ability);
  }

  /** Which ability (of `among`, or any) is waiting on your next attack: null for none. */
  waitingOn(among?: readonly Ability[]): Ability | null {
    for (const a of this.waiting) if (!among || among.includes(a)) return a;
    return null;
  }

  /** Your next attack spends `ability`, if it was waiting on it: true if it was. */
  spend(ability: Ability): boolean {
    return this.waiting.delete(ability);
  }

  /** Everything ready again, nothing lasting or waiting: after death, or a new run. */
  clear(): void {
    this.cooling.clear();
    this.lasting.clear();
    this.waiting.clear();
  }
}

/** What the rules need of an enemy: where it stands, how wide it is, and whether a blow can land on it now. */
export interface Target {
  readonly position: Vector3;
  readonly def: { readonly radius: number };
  readonly hittable: boolean;
}

/** Where a thrown axe aims on a body: its chest, this far over its feet (m). */
export const CHEST = 1.1;

const _to = new Vector3();

/**
 * Whom Heroic Throw flies at, thrown from `from`: the nearest enemy within
 * `range` m whose chest is within `aimDeg`° of the first of `aims` (where the
 * right hand faces as the gesture ends) and in sight; with none, the same
 * along the next (where you look). Null for none.
 */
export function throwTarget<T extends Target>(
  from: Vector3,
  aims: readonly Vector3[],
  enemies: readonly T[],
  sees: (from: Vector3, to: Vector3) => boolean,
  { range, aimDeg }: { readonly range: number; readonly aimDeg: number } = CONFIG.classes.warrior.abilities.heroicThrow,
): T | null {
  const cos = Math.cos((aimDeg * Math.PI) / 180);
  for (const aim of aims) {
    if (aim.lengthSq() < 1e-9) continue;
    let best: T | null = null;
    let near = Infinity;
    for (const e of enemies) {
      if (!e.hittable) continue;
      _to.set(e.position.x, e.position.y + CHEST, e.position.z).sub(from);
      const d = _to.length();
      if (d > range || d < 1e-6 || d >= near) continue;
      if (_to.dot(aim) / (d * aim.length()) < cos) continue;
      if (!sees(from, _to.add(from))) continue;
      best = e;
      near = d;
    }
    if (best) return best;
  }
  return null;
}

/** How a blow you stopped with the shield or the sword ends. */
export interface Blocked {
  /** A heavy blow (`guardBreak`) gets some of its damage through and numbs the shield arm… */
  readonly breaks: boolean;
  /** …this much of it. */
  readonly chip: number;
}

/** A blocked blow: a heavy one breaks the guard, unless Shield Wall is up (`walled`), when no blow gets through at all. */
export function blocked(attack: AttackConfig, walled: boolean): Blocked {
  if (!attack.guardBreak || walled) return { breaks: false, chip: 0 };
  return { breaks: true, chip: Math.round(attack.damage * CONFIG.shield.guardBreakChip) };
}

/**
 * Whom Sweeping Strikes also hits when the sword lands on `hit`: the nearest
 * other enemy a blow can land on whose body is within `reach` m of its body.
 * Null for none.
 */
export function sweptTo<T extends Target>(hit: T, enemies: readonly T[], reach = CONFIG.classes.warrior.abilities.sweepingStrikes.reach): T | null {
  let best: T | null = null;
  let near = Infinity;
  for (const e of enemies) {
    if (e === hit || !e.hittable) continue;
    const gap = Math.hypot(e.position.x - hit.position.x, e.position.z - hit.position.z) - e.def.radius - hit.def.radius;
    if (gap <= reach && gap < near) {
      best = e;
      near = gap;
    }
  }
  return best;
}
