import { CONFIG } from '../config';

// When the villagers bark: a pure rule, stepped with how far you are from each
// (.scratch/oakvale-starting-zone/spec.md, "Friendly characters"). Come within
// `within` m of one and their line shows for `time` s; it won't show again
// until you've been `rearm` m away. At most `most` show at once: one that
// would make more waits, while you're still close, for another to end.

export interface BarkTimes {
  readonly within: number;
  readonly time: number;
  readonly rearm: number;
  readonly most: number;
}

export class BarkRule {
  /** Seconds each bark has left to show; 0 while it doesn't. */
  private readonly left: number[];
  /** Whether each will bark the next time you come close. */
  private readonly armed: boolean[];

  constructor(
    count: number,
    private readonly times: BarkTimes = CONFIG.villagers.bark,
  ) {
    this.left = new Array<number>(count).fill(0);
    this.armed = new Array<boolean>(count).fill(true);
  }

  /** Is villager `i`'s bark showing? */
  showing(i: number): boolean {
    return this.left[i] > 0;
  }

  /**
   * One step: `far[i]` is how far you are from villager `i` (Infinity while
   * they aren't drawn). Returns the villagers whose bark starts this step,
   * nearest first.
   */
  update(dt: number, far: readonly number[]): number[] {
    const { within, time, rearm, most } = this.times;
    let shown = 0;
    for (let i = 0; i < far.length; i++) {
      this.left[i] = Math.max(0, this.left[i] - dt);
      if (far[i] > rearm) this.armed[i] = true;
      if (this.left[i] > 0) shown++;
    }
    const started: number[] = [];
    const near = far.map((_, i) => i).filter((i) => this.armed[i] && far[i] < within);
    near.sort((a, b) => far[a] - far[b]);
    for (const i of near) {
      if (shown >= most) break;
      this.armed[i] = false;
      this.left[i] = time;
      shown++;
      started.push(i);
    }
    return started;
  }
}
