// Damage over time (the ranger's Serrated Tips, the mage's Ignite and
// Pyroblast; .scratch/abilities/issues/12 and 13): an enemy bleeds or burns
// for some damage over a few seconds, a tick a second. Another bleed or burn
// of the same kind adds its damage to what's still to come and runs its time
// from then, so every hit's share is taken in the end. A tick is no blow: it
// doesn't break a freeze or make the enemy flinch (Enemy.suffer). It ends when
// the enemy dies or walks home. Combat decides what each tick does; the rule
// is here, so the tests drive it.

/** What lingers on an enemy. */
export type DotKind = 'bleed' | 'burn';

/** What the rule needs of an enemy: whether anything can still land on it. */
export interface Sufferer {
  readonly alive: boolean;
  readonly hittable: boolean;
}

/** One bleed or burn on one enemy. */
export interface Dot<T extends Sufferer = Sufferer> {
  readonly enemy: T;
  readonly kind: DotKind;
  /** Damage still to come. */
  pool: number;
  /** s it has left to come over. */
  left: number;
  /** s to its next tick. */
  next: number;
  /** A fraction of a point dealt ticks ago and not yet shown: it rides on the next tick. */
  owed: number;
}

/** s between ticks. */
export const DOT_EVERY = 1;

export class Dots<T extends Sufferer = Sufferer> {
  readonly on: Dot<T>[] = [];

  /** `enemy` takes `damage` more over `seconds`: added to what it still has to take of `kind`, which then runs `seconds` from now. */
  add(enemy: T, kind: DotKind, damage: number, seconds: number): void {
    if (damage <= 0 || seconds <= 0 || !enemy.hittable) return;
    const had = this.on.find((d) => d.enemy === enemy && d.kind === kind);
    if (had) {
      had.pool += damage;
      had.left = seconds;
      return;
    }
    this.on.push({ enemy, kind, pool: damage, left: seconds, next: Math.min(DOT_EVERY, seconds), owed: 0 });
  }

  /** Damage `enemy` still has to take of `kind`: 0 for none. */
  of(enemy: T, kind: DotKind): number {
    return this.on.find((d) => d.enemy === enemy && d.kind === kind)?.pool ?? 0;
  }

  /** Step `dt` s: each tick due calls `tick` with the whole points it deals (a tick under a point waits for the next). */
  update(dt: number, tick: (enemy: T, kind: DotKind, damage: number) => void): void {
    for (let i = this.on.length - 1; i >= 0; i--) {
      const d = this.on[i];
      if (!d.enemy.alive || !d.enemy.hittable) {
        this.on.splice(i, 1);
        continue;
      }
      d.next -= dt;
      if (d.next > 1e-9) continue;
      // Its share of what's left: all of it on the last tick.
      const last = d.left <= DOT_EVERY + 1e-6;
      const share = last ? d.pool : (d.pool * DOT_EVERY) / d.left;
      d.pool -= share;
      d.left -= DOT_EVERY;
      d.next += DOT_EVERY;
      d.owed += share;
      const dealt = last ? Math.round(d.owed) : Math.floor(d.owed + 1e-9);
      d.owed -= dealt;
      if (last) this.on.splice(i, 1);
      if (dealt > 0) tick(d.enemy, d.kind, dealt);
    }
  }

  clear(): void {
    this.on.length = 0;
  }
}
