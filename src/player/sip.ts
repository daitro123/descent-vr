import { CONFIG } from '../config';

// Drinking by holding something at your mouth, as the belt's flasks are drunk
// (player/belt.ts): 0.7 s within 15 cm of the mouth, with a steady buzz. A hand
// moving fast there makes it wait; leaving the mouth cancels it. The bag's
// carried flask and the alchemy bench's stand use it, with no scene in it.

/** What a frame at (or away from) the mouth did. */
export type Sipped =
  /** Not at the mouth, and nothing under way. */
  | 'away'
  /** At the mouth, drinking (or waiting on a fast hand). */
  | 'sipping'
  /** Pulled away before it was drunk. */
  | 'cancelled'
  /** Held there long enough: drunk. */
  | 'drunk';

export class Sip {
  /** Seconds at the mouth so far. */
  time = 0;
  /** Buzz the hand this frame: the drink's steady buzz. */
  buzz = false;
  private buzzIn = 0;

  /** One frame: `distance` from what's held to the mouth (m), `speed` the hand's (m/s, in the rig). */
  update(dt: number, distance: number, speed: number): Sipped {
    const B = CONFIG.belt;
    this.buzz = false;
    if (distance >= B.mouthRadius) {
      if (this.time <= 0) return 'away';
      this.reset();
      return 'cancelled';
    }
    if (speed > B.maxHandSpeed) return 'sipping'; // waits, doesn't cancel
    this.time += dt;
    this.buzzIn -= dt;
    if (this.buzzIn <= 0) {
      this.buzz = true;
      this.buzzIn = B.buzz.drink.every;
    }
    if (this.time < B.drinkTime) return 'sipping';
    this.reset();
    return 'drunk';
  }

  reset(): void {
    this.time = this.buzzIn = 0;
  }
}
