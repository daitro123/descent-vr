import type { Effect } from '../adventureState';
import { CONFIG } from '../config';
import type { SaveRecord } from './record';
import type { SaveStore } from './store';

/** What changes nothing the save keeps. */
const UNSAVED: ReadonlySet<Effect['kind']> = new Set(['xp', 'refused', 'left', 'loot']);

/**
 * When the Adventure writes its save: at once for anything earned or changed
 * (a quest taken, a count going up, a quest ready or handed in, a level, and
 * anything done with your things: an equip, a move, loot, a sale, a chest)
 * and for a change of current zone; every so often in play, so where you stand is
 * kept too (`CONFIG.save.every`); and when the page is hidden or VR ends. One write is in flight at
 * a time: asking again meanwhile writes once more when it lands, with the
 * state as it is then, so the latest state wins.
 */
export class SaveController {
  /** Seconds of play since the last write. */
  private since = 0;
  /** Has the game run a frame since the page opened? */
  private running = false;
  private inFlight: Promise<void> | null = null;
  private again = false;
  private zoneId: string | null = null;

  constructor(
    private readonly store: SaveStore,
    /** The record as it would be written now. */
    private readonly snapshot: () => SaveRecord,
  ) {}

  /**
   * What the adventure state or the inventory did: anything but XP alone, a
   * refusal, loot left on the ground (a full bag) or a drop lying there (not
   * saved until taken) is written at once.
   */
  onEffects(effects: readonly Effect[]): void {
    if (effects.some((e) => !UNSAVED.has(e.kind))) this.write();
  }

  /** The current zone, each frame: written when it changes. */
  onZone(id: string): void {
    const was = this.zoneId;
    this.zoneId = id;
    if (was !== null && was !== id) this.write();
  }

  /** Time played: a write once `CONFIG.save.every` seconds pass without one. */
  update(dt: number): void {
    this.running = true;
    this.since += dt;
    if (this.since >= CONFIG.save.every) this.write();
  }

  /**
   * The page hidden, or VR ended: keep where you stand. Nothing is written if
   * the game hasn't run, so a page left open before VR never overwrites a save
   * made since in another tab.
   */
  onLeaving(): void {
    if (this.running) this.write();
  }

  /** Resolves once no write is in flight. */
  async settled(): Promise<void> {
    while (this.inFlight) await this.inFlight;
  }

  private write(): void {
    this.since = 0;
    if (this.inFlight) {
      this.again = true;
      return;
    }
    this.inFlight = this.store
      .write(this.snapshot())
      .catch((e) => console.warn('Saving failed:', e))
      .then(() => {
        this.inFlight = null;
        if (!this.again) return;
        this.again = false;
        this.write();
      });
  }
}
