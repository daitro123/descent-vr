import { AdditiveBlending, type BufferGeometry, Mesh, MeshBasicMaterial, type Object3D, TorusGeometry, Vector3 } from 'three';
import { ABILITY_COLOUR } from './abilities';

// Ice Barrier (the mage's Frost tree's tier 3; .scratch/abilities/issues/13):
// a shell of ice takes the next blows you'd take, up to what it holds, within
// its time. The rule is here (what gets through a blow), and its look: a
// ring of faceted ice round your waist, clearer as it's worn down, where you
// see it when you look down. A lasting effect in ticket 16's budget: one draw
// call, well under 500 triangles, no light. Combat asks it before a blow
// hurts you.

/** m over your feet the ring stands, and how wide it is. */
const WAIST = 1;
const RADIUS = 0.42;
/** s it takes to fade in, and out once it's gone. */
const FADE = 0.25;
/** Turns a second, slowly, so the facets catch the eye. */
const SPIN = 0.6;

export class IceBarrier {
  readonly ring: Mesh<BufferGeometry, MeshBasicMaterial>;
  /** Damage it can still take. */
  held = 0;
  /** s before it's gone, taken or not. */
  left = 0;
  /** What it held when raised. */
  private full = 0;
  private fade = 0;

  constructor(parent: Object3D | null) {
    // Three sides round and twelve along: a crystalline hoop.
    this.ring = new Mesh(
      new TorusGeometry(RADIUS, 0.03, 3, 12),
      new MeshBasicMaterial({ color: ABILITY_COLOUR.iceBarrier!, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
    );
    this.ring.rotation.x = Math.PI / 2;
    this.ring.visible = false;
    this.ring.frustumCulled = false;
    parent?.add(this.ring);
  }

  /** Is it up, holding anything? */
  get up(): boolean {
    return this.held > 0 && this.left > 0;
  }

  /** Raised: it takes the next `amount` of damage within `seconds`. A new one replaces what's left of the old. */
  raise(amount: number, seconds: number): void {
    this.held = this.full = amount;
    this.left = seconds;
  }

  /** A blow of `damage` meets it: it takes what it can hold, and what's past that gets through. */
  take(damage: number): number {
    if (!this.up) return damage;
    const taken = Math.min(this.held, damage);
    this.held -= taken;
    return damage - taken;
  }

  /** Step `dt` s, the ring round the waist of someone standing at `feet`. */
  update(dt: number, feet: Vector3): void {
    this.left = Math.max(0, this.left - dt);
    if (this.left <= 0) this.held = 0;
    this.fade = this.up ? Math.min(1, this.fade + dt / FADE) : Math.max(0, this.fade - dt / FADE);
    this.ring.visible = this.fade > 0;
    if (!this.ring.visible) return;
    this.ring.position.set(feet.x, feet.y + WAIST, feet.z);
    this.ring.rotation.z += SPIN * dt;
    this.ring.material.opacity = this.fade * (0.25 + 0.45 * (this.full > 0 ? this.held / this.full : 0));
  }

  /** How many triangles it draws. */
  get triangles(): number {
    const g = this.ring.geometry;
    return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  }

  /** Gone: after death, or a new run. */
  clear(): void {
    this.held = this.left = this.full = this.fade = 0;
    this.ring.visible = false;
  }
}
