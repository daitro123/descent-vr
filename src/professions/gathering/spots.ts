import { CONFIG } from '../../config';
import { SPOT_KINDS, type SpotKind } from '../professions';

// Gathering spots' state and the pick's strikes, with no three.js or XR in
// them (.scratch/professions/spec.md, "Gathering spots and the tool loop",
// promoted from ?proto=pick variant C). A spot is full, being worked (a vein
// struck but not yet broken), or taken; a taken spot refills 180 s after it
// was taken, and only once you're 30 m away, so it never grows back in front
// of you. None of it is saved: a reload finds every spot full.
//
// A strike on a vein counts only on a committed swing with the pick's head
// fast enough; a slower touch is a tap. A hot strike off the ore thunks into
// the rock for nothing. One on the ore counts 1, and one in the glint 2.25,
// so the vein's 4.5 breaks in 2 good swings or 5 plain ones, cracking at a
// third and two thirds of the way.
//
// A cut with the knife counts on its own lighter gate. One hot pass through a
// clump's stems, the bottom 10 cm, takes it whole; one through its leaves
// only trims a leaf; a slower touch brushes them.

/** What a strike was: a tap (too slow), stone (hot, but off the ore), good (on the ore) or glint (in it). */
export type StrikeKind = 'tap' | 'stone' | 'good' | 'glint';

export interface Strike {
  readonly kind: StrikeKind;
  /** The head's speed (m/s). */
  readonly speed: number;
  /** 0 at the gate's speed to 1 at full power, for the feedback's size. */
  readonly power: number;
  /** What it adds to the vein. */
  readonly value: number;
}

/** Where a strike landed and how, for `scoreStrike`. */
export interface StrikeIn {
  /** The swing passed the sword's gate: enough hand travel one way at speed. */
  readonly committed: boolean;
  /** The head's point's speed (m/s). */
  readonly speed: number;
  /** It landed on the ore. */
  readonly onOre: boolean;
  /** It landed in the glint. */
  readonly inGlint: boolean;
}

/** Score a strike on a vein. */
export function scoreStrike(s: StrikeIn): Strike {
  const P = CONFIG.professions.pick;
  const V = CONFIG.professions.vein;
  const hot = s.committed && s.speed >= P.minSpeed;
  if (!hot) return { kind: 'tap', speed: s.speed, power: 0, value: 0 };
  const power = Math.min(1, Math.max(0, (s.speed - P.minSpeed) / (P.fullSpeed - P.minSpeed)));
  if (!s.onOre) return { kind: 'stone', speed: s.speed, power, value: 0 };
  return s.inGlint ? { kind: 'glint', speed: s.speed, power, value: V.glint } : { kind: 'good', speed: s.speed, power, value: V.plain };
}

/** Where on a clump a point is: in its stems (the bottom band) or its leaves (above them). */
export type ClumpBand = 'stems' | 'leaves';

/** Which band of a clump the point (x, y, z) m from its foot is in, or null outside both. */
export function bandAt(x: number, y: number, z: number): ClumpBand | null {
  const C = CONFIG.professions.clump;
  const r = Math.hypot(x, z);
  if (r < C.stemRadius && y > -0.01 && y < C.stemTop) return 'stems';
  if (r < C.leafRadius && y >= C.stemTop && y < C.leafTop) return 'leaves';
  return null;
}

/** What a pass of the knife through a clump does: takes it (through the stems), trims a leaf, or only brushes it (too slow). */
export type CutKind = 'take' | 'trim' | 'brush';

/** A pass of the knife through a clump, for `scoreCut`. */
export interface CutIn {
  /** The swing passed the knife's gate: enough hand travel one way at speed. */
  readonly committed: boolean;
  /** The tip's speed (m/s). */
  readonly speed: number;
  /** Some of the edge went through the stems' band… */
  readonly stems: boolean;
  /** …or the leaves'. */
  readonly leaves: boolean;
}

/** Score a pass of the knife: null if it touched nothing. A hot pass through the stems takes the clump, even if it caught leaves too. */
export function scoreCut(c: CutIn): CutKind | null {
  if (!c.stems && !c.leaves) return null;
  if (!c.committed || c.speed < CONFIG.professions.knife.minSpeed) return 'brush';
  return c.stems ? 'take' : 'trim';
}

/** A spot's state: full (perhaps being worked) or taken. */
export type SpotPhase = 'full' | 'worked' | 'taken';

/** Where a spot is, and what kind. */
export interface SpotAt {
  readonly kind: SpotKind;
  readonly x: number;
  readonly z: number;
}

/** What a strike did to a vein. */
export interface Struck {
  /** It counted towards breaking the vein. */
  readonly counted: boolean;
  /** It broke the vein: now's the time to gather it. */
  readonly broke: boolean;
  /** The crack stage it's at now: 0 whole, 1 and 2 cracked, 3 broken. */
  readonly stage: number;
}

/** What a cut did to a clump. */
export interface Cut {
  /** It counted: one a swing, and none on a taken clump or for a brush. */
  readonly counted: boolean;
  /** It took the clump: now's the time to gather it. */
  readonly took: boolean;
}

interface State {
  progress: number;
  strikes: number;
  /** Leaves trimmed from a clump since it last grew. */
  trims: number;
  /** The swing that last counted on it: each counts once. */
  swing: number;
  taken: boolean;
  /** Seconds since it was taken. */
  since: number;
}

export class SpotStates {
  private readonly states: State[];

  constructor(private readonly spots: readonly SpotAt[]) {
    this.states = spots.map(() => ({ progress: 0, strikes: 0, trims: 0, swing: -1, taken: false, since: 0 }));
  }

  get count(): number {
    return this.spots.length;
  }

  phase(i: number): SpotPhase {
    const s = this.states[i];
    return s.taken ? 'taken' : s.progress > 0 ? 'worked' : 'full';
  }

  /** How far a vein has been worked (0 to its `need`). */
  progress(i: number): number {
    return this.states[i].progress;
  }

  /** Strikes that counted on it so far. */
  strikes(i: number): number {
    return this.states[i].strikes;
  }

  /** Its crack stage: 0 whole, 1 past a third, 2 past two thirds, 3 broken. */
  stage(i: number): number {
    const s = this.states[i];
    return s.taken ? 3 : Math.min(2, Math.floor((s.progress / CONFIG.professions.vein.need) * 3));
  }

  /**
   * A strike on vein `i` during swing number `swing`: counted once per swing,
   * and nothing on a taken vein. Past its `need` it breaks and is taken.
   */
  strike(i: number, strike: Strike, swing: number): Struck {
    const s = this.states[i];
    if (s.taken || strike.value <= 0 || swing === s.swing) return { counted: false, broke: false, stage: this.stage(i) };
    s.swing = swing;
    s.progress += strike.value;
    s.strikes++;
    const broke = s.progress >= CONFIG.professions.vein.need - 1e-6;
    if (broke) this.take(i);
    return { counted: true, broke, stage: this.stage(i) };
  }

  /** Leaves trimmed from clump `i` since it last grew. */
  trims(i: number): number {
    return this.states[i].trims;
  }

  /**
   * A cut through clump `i` during swing number `swing`: counted once per
   * swing, and nothing on a taken clump or for a brush. Through the stems it
   * takes the clump; through the leaves it trims one.
   */
  cut(i: number, cut: CutKind, swing: number): Cut {
    const s = this.states[i];
    if (s.taken || cut === 'brush' || swing === s.swing) return { counted: false, took: false };
    s.swing = swing;
    if (cut === 'trim') {
      s.trims++;
      return { counted: true, took: false };
    }
    this.take(i);
    return { counted: true, took: true };
  }

  /** Take spot `i` (broken, or cut): it's dark until it refills. */
  take(i: number): void {
    const s = this.states[i];
    s.taken = true;
    s.since = 0;
  }

  /**
   * Time passes with you standing at `you`: each taken spot whose refill time
   * has run and that you're far enough from is full again. Those are returned.
   */
  update(dt: number, you: { readonly x: number; readonly z: number }): number[] {
    const refilled: number[] = [];
    this.states.forEach((s, i) => {
      if (!s.taken) return;
      s.since += dt;
      const { after, away } = SPOT_KINDS[this.spots[i].kind].refill;
      const spot = this.spots[i];
      if (s.since < after || Math.hypot(you.x - spot.x, you.z - spot.z) < away) return;
      s.taken = false;
      s.progress = 0;
      s.strikes = 0;
      s.trims = 0;
      refilled.push(i);
    });
    return refilled;
  }
}
