/**
 * Attack tokens: an enemy must hold one to start an attack, so a crowd takes
 * turns instead of swinging all at once. The rest circle and wait, which is
 * what makes a group fight readable (and fair) in first person.
 *
 * Holding a token lets an enemy close in; `tryStart` then spaces out the
 * moments attacks actually begin by `gap`, so two attackers' blows don't land
 * in the same instant from opposite sides.
 */
export class AttackTokens {
  private readonly holders = new Set<object>();
  private wait = 0;

  constructor(
    public max: number,
    readonly gap = 0,
  ) {}

  /** Advance the gap timer; call once per frame with the enemies' dt. */
  update(dt: number): void {
    this.wait = Math.max(0, this.wait - dt);
  }

  tryAcquire(holder: object): boolean {
    if (this.holders.has(holder)) return true;
    if (this.holders.size >= this.max) return false;
    this.holders.add(holder);
    return true;
  }

  /** A holder wants to swing now: allowed once `gap` has passed since the last swing began. */
  tryStart(holder: object): boolean {
    if (!this.holders.has(holder) || this.wait > 0) return false;
    this.wait = this.gap;
    return true;
  }

  release(holder: object): void {
    this.holders.delete(holder);
  }

  has(holder: object): boolean {
    return this.holders.has(holder);
  }

  get inUse(): number {
    return this.holders.size;
  }

  clear(): void {
    this.holders.clear();
    this.wait = 0;
  }
}
