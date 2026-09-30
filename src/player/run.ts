import { CONFIG } from '../config';

/** What the run reads each frame. */
export interface RunInput {
  /** The left stick was clicked down this frame. */
  readonly click: boolean;
  /** The left stick as the gamepad reports it: +x to the right, +y back (so ahead is −y). */
  readonly stickX: number;
  readonly stickY: number;
  /** Is anything fighting you? Enemies walking home don't count. */
  readonly fighting: boolean;
}

/** What the run makes of a frame. */
export interface RunStep {
  /** m/s with the stick pushed all the way: the run's, or the walk's. */
  readonly speed: number;
  /** Running this frame. */
  readonly running: boolean;
  /** A fight has just ended your run: buzz the left hand, once. */
  readonly caught: boolean;
}

/**
 * The run: a left-stick click latches it, and while it's latched you move at
 * the run's speed as long as the stick points within about 45° of ahead;
 * pushed sideways or back you walk. Letting go of the stick unlatches it, as
 * does a fight starting (which catches you, once). A click while anything is
 * fighting you does nothing. Pure, so it's tested on its own; the Player
 * steps it with the left stick each frame (.scratch/oakvale-starting-zone/issues/33-the-run.md).
 */
export class Run {
  private on = false;

  /** Clicked, and the stick not let go since. */
  get latched(): boolean {
    return this.on;
  }

  step({ click, stickX, stickY, fighting }: RunInput): RunStep {
    const pushed = Math.hypot(stickX, stickY) >= CONFIG.player.stickDeadzone;
    let caught = false;
    if (fighting) {
      caught = this.on;
      this.on = false;
    } else if (click && pushed) this.on = true;
    if (!pushed) this.on = false;
    const ahead = (Math.atan2(Math.abs(stickX), -stickY) * 180) / Math.PI <= CONFIG.run.aheadDeg;
    const running = this.on && ahead;
    return { speed: running ? CONFIG.run.speed : CONFIG.player.moveSpeed, running, caught };
  }

  /** Back to walking: a death, a wake, a teleport. */
  stop(): void {
    this.on = false;
  }
}
