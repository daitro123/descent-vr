import {
  BoxGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
  Vector3,
} from 'three';
import { gatherSfx } from './sound';
import { type Knife, TOOLS } from './tools';
import type { Fx, HandNow, Rules } from './variants';

// PROTOTYPE (?proto=pick): a clump of Hearthleaf on a bank at knee height,
// taken with the knife or by hand. Throwaway.

/** Numbers to tune on the headset. */
export const HERB = {
  /** The bank's top, above the ground. */
  bank: 0.45,
  /** The band to cut through: the stems, from the soil to this high… */
  stemTop: 0.1,
  stemRadius: 0.1,
  /** …and the leaves above them, which a cut only trims. */
  leafTop: 0.34,
  leafRadius: 0.17,
  /** Hearthleaf a clump gives. */
  yield: 2,
  /** A grab takes hold this near the middle of the leaves (m)… */
  grabReach: 0.2,
  /** …and the root comes out after this much pull. */
  pull: 0.14,
  refill: 5,
};

const Y = new Vector3(0, 1, 0);
const _p = new Vector3();
const _q = new Vector3();
const _l = new Vector3();

const stemMat = new MeshLambertMaterial({ color: 0x5e8a2e, flatShading: true });
const leafMat = new MeshLambertMaterial({ color: 0x7ea83a, flatShading: true });
const emberMat = new MeshLambertMaterial({ color: 0xd4552a, flatShading: true, emissive: 0x401008 });
const soilMat = new MeshLambertMaterial({ color: 0x5a4330, flatShading: true });
const rootMat = new MeshLambertMaterial({ color: 0x8a6a48, flatShading: true });

export class Herb {
  readonly root = new Group();
  /** The clump's foot on the bank (world). */
  readonly foot = new Vector3();
  private plant!: Group;
  private leaves: Object3D[] = [];
  private readonly stubs = new Group();
  rules!: Rules;
  taken = false;
  private regrowIn = 0;
  private grow = 1;
  private lastSwing = -1;
  private lastRustle = 0;
  private sway = 0;
  private held: { hand: HandNow['hand']; grab: Vector3; pull: number; tick: number } | null = null;
  /** Follows the hand for a moment after it comes free. */
  private carried: { hand: HandNow['hand']; t: number } | null = null;
  private touchedAt = -1;
  /** What happened last, for the readout. */
  last = '';
  /** The last one taken: how, and seconds from first touching it. */
  lastTaken: { how: string; seconds: number } | null = null;

  constructor(
    private readonly fx: Fx,
    x: number,
    z: number,
  ) {
    const g = fx.heightAt(x, z);
    this.foot.set(x, g + HERB.bank, z);
    const bank = new Mesh(new CylinderGeometry(0.3, 0.44, HERB.bank + 0.1, 7), soilMat);
    bank.position.set(x, g + (HERB.bank - 0.1) / 2, z);
    this.root.add(bank);
    for (let i = 0; i < 5; i++) {
      const s = new Mesh(new CylinderGeometry(0.008, 0.01, 0.025, 5), stemMat);
      s.position.set(Math.cos(i * 1.3) * 0.04, 0.012, Math.sin(i * 1.3) * 0.04);
      this.stubs.add(s);
    }
    this.stubs.position.copy(this.foot);
    this.stubs.visible = false;
    this.root.add(this.stubs);
    this.plant = this.buildPlant();
  }

  get footprint(): { x: number; z: number; r: number } {
    return { x: this.foot.x, z: this.foot.z, r: 0.45 };
  }

  /** The middle of the leaves, where a hand takes hold. */
  heart(out: Vector3): Vector3 {
    return out.copy(this.foot).addScaledVector(Y, 0.16);
  }

  private buildPlant(): Group {
    const plant = new Group();
    this.leaves = [];
    for (let i = 0; i < 5; i++) {
      const s = new Mesh(new CylinderGeometry(0.007, 0.01, HERB.stemTop + 0.02, 5), stemMat);
      s.position.set(Math.cos(i * 1.3) * 0.04, (HERB.stemTop + 0.02) / 2, Math.sin(i * 1.3) * 0.04);
      plant.add(s);
    }
    // Long leaves splaying up and out from the top of the stems, with the warm red buds it's named for.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + (i % 2) * 0.3;
      const pivot = new Group();
      pivot.position.set(Math.cos(a) * 0.03, HERB.stemTop, Math.sin(a) * 0.03);
      pivot.rotation.y = -a;
      const leaf = new Mesh(new BoxGeometry(0.15 + (i % 3) * 0.03, 0.006, 0.045), leafMat);
      leaf.position.x = 0.08;
      leaf.rotation.z = 0.6 + (i % 3) * 0.2;
      leaf.position.y = 0.05;
      pivot.add(leaf);
      plant.add(pivot);
      this.leaves.push(pivot);
    }
    for (let i = 0; i < 3; i++) {
      const bud = new Mesh(new DodecahedronGeometry(0.022, 0), emberMat);
      bud.position.set(Math.cos(i * 2.1) * 0.035, HERB.stemTop + 0.13 + i * 0.02, Math.sin(i * 2.1) * 0.035);
      plant.add(bud);
    }
    const ball = new Mesh(new DodecahedronGeometry(0.05, 0), rootMat);
    ball.position.y = -0.04;
    ball.name = 'root';
    plant.add(ball);
    plant.position.copy(this.foot);
    this.root.add(plant);
    return plant;
  }

  setRules(rules: Rules): void {
    this.rules = rules;
    this.reset();
  }

  reset(): void {
    this.plant.removeFromParent();
    this.plant = this.buildPlant();
    this.taken = false;
    this.held = this.carried = null;
    this.stubs.visible = false;
    this.grow = 1;
    this.touchedAt = -1;
    this.last = '';
    this.lastTaken = null;
  }

  update(dt: number, knife: Knife | null, rig: Object3D, hands: HandNow[]): void {
    const t = this.fx.now();
    if (this.taken) {
      if (this.carried) this.carry(dt, hands);
      this.regrowIn -= dt;
      if (this.regrowIn <= 0 && !this.carried) this.regrow();
      return;
    }
    if (this.grow < 1) {
      this.grow = Math.min(1, this.grow + dt / 0.6);
      this.plant.scale.setScalar(0.2 + 0.8 * this.grow);
    }
    // A brushed clump sways and settles.
    this.sway = Math.max(0, this.sway - dt * 2);
    this.plant.rotation.z = Math.sin(t * 14) * 0.12 * this.sway;
    if (knife) this.cut(knife, rig, t);
    this.grab(dt, hands, t);
  }

  // The knife: a committed slice through the stems takes the clump; through the leaves only trims one.

  private cut(knife: Knife, rig: Object3D, t: number): void {
    let band = false;
    let leaves = false;
    for (const p of knife.points) {
      if (!p.valid) continue;
      p.prev(rig, _p);
      p.now(rig, _q);
      for (let k = 0; k <= 4; k++) {
        _l.lerpVectors(_p, _q, k / 4).sub(this.foot);
        const r = Math.hypot(_l.x, _l.z);
        if (r < HERB.stemRadius && _l.y > -0.01 && _l.y < HERB.stemTop) band = true;
        else if (r < HERB.leafRadius && _l.y >= HERB.stemTop && _l.y < HERB.leafTop) leaves = true;
      }
    }
    if (!band && !leaves) return;
    if (this.touchedAt < 0) this.touchedAt = t;
    const hot = knife.gate.committed && knife.tip.speed >= TOOLS.knife.minSpeed;
    if (hot && knife.gate.count !== this.lastSwing) {
      this.lastSwing = knife.gate.count;
      if (band) this.slice();
      else this.trim();
    } else if (!hot) this.brush(t);
  }

  /** Also what the desktop keys and scripted checks call. */
  slice(): void {
    if (this.taken) return;
    gatherSfx.slice(this.foot, true);
    this.fx.pulse('right', 0.6, 40);
    this.fx.particles.burst('bone', _p.copy(this.foot).addScaledVector(Y, 0.05), 6, undefined, 0x6e9a34);
    this.stubs.visible = true;
    this.plant.getObjectByName('root')!.visible = false;
    this.plant.position.y += 0.06;
    this.take('cut through the stems', 0.25);
  }

  trim(): void {
    if (this.taken) return;
    gatherSfx.slice(this.foot, false);
    this.fx.pulse('right', 0.3, 25);
    const leaf = this.leaves.find((l) => l.visible);
    if (leaf && this.leaves.filter((l) => l.visible).length > 3) leaf.visible = false;
    this.fx.particles.burst('bone', this.heart(_p), 5, undefined, 0x7ea83a);
    this.fx.hint('Only a leaf: cut lower, through the stems');
    this.last = 'trimmed a leaf (cut too high)';
    this.sway = 1;
  }

  private brush(t: number): void {
    this.sway = 1;
    if (t - this.lastRustle < 0.3) return;
    this.lastRustle = t;
    gatherSfx.rustle(this.foot);
  }

  // The hand: squeeze in the leaves and pull up; it strains, then pops out root and all.

  private grab(dt: number, hands: HandNow[], t: number): void {
    const heart = this.heart(_p);
    if (!this.held) {
      const h = hands.find((h) => h.squeezed && h.at.distanceTo(heart) < HERB.grabReach && h.speed < 1.5);
      if (!h) {
        // Brushing through it with a hand rustles it too.
        if (hands.some((h) => h.at.distanceTo(heart) < 0.12 && h.speed > 0.4)) this.brush(t);
        return;
      }
      if (this.touchedAt < 0) this.touchedAt = t;
      if (this.rules.herb !== 'pull') {
        this.fx.hint('Cut it with the knife from your belt');
        this.brush(t);
        return;
      }
      this.held = { hand: h.hand, grab: h.at.clone(), pull: 0, tick: 0 };
      this.fx.pulse(h.hand, 0.3, 20);
      return;
    }
    const h = hands.find((x) => x.hand === this.held!.hand);
    if (!h || h.squeeze < 0.3) {
      // Let go before it came: it springs back.
      this.held = null;
      this.plant.position.copy(this.foot);
      this.plant.scale.setScalar(1);
      this.sway = 1;
      this.last = 'let go too soon';
      return;
    }
    _q.subVectors(h.at, this.held.grab);
    const pull = Math.max(0, _q.y) + 0.5 * Math.hypot(_q.x, _q.z);
    const k = Math.min(1, pull / HERB.pull);
    this.held.pull = k;
    // It stretches after the hand, straining.
    this.plant.position.copy(this.foot).addScaledVector(_q, 0.35 * k);
    this.plant.scale.set(1, 1 + 0.35 * k, 1);
    this.held.tick -= dt;
    if (this.held.tick <= 0) {
      this.held.tick = 0.07;
      this.fx.pulse(h.hand, 0.1 + 0.55 * k, 35);
      if (k > 0.2 && Math.random() < 0.35) gatherSfx.strain(this.foot, k);
    }
    if (k >= 1) this.pop(h.hand);
  }

  /** Also what the desktop keys and scripted checks call. */
  pop(hand: HandNow['hand'] = 'left'): void {
    if (this.taken) return;
    gatherSfx.pop(this.foot);
    this.fx.pulse(hand, 1, 90);
    this.fx.particles.burst('dust', this.foot, 12, undefined, 0x5a4330);
    this.plant.scale.setScalar(1);
    this.held = null;
    this.carried = { hand, t: 0.35 };
    this.take('pulled up by the root', 0);
  }

  private carry(dt: number, hands: HandNow[]): void {
    const c = this.carried!;
    const h = hands.find((x) => x.hand === c.hand);
    if (h) this.plant.position.copy(h.at).addScaledVector(Y, -0.05);
    c.t -= dt;
    if (c.t <= 0) {
      this.carried = null;
      this.fx.bag.send(this.plant, 'herb', HERB.yield);
    }
  }

  private take(how: string, delay: number): void {
    this.taken = true;
    this.regrowIn = HERB.refill;
    const t = this.fx.now();
    this.last = how;
    this.lastTaken = { how, seconds: this.touchedAt < 0 ? 0 : t - this.touchedAt };
    this.touchedAt = -1;
    // Into the scene, so it flies free of the bank.
    this.fx.scene.attach(this.plant);
    if (!this.carried) this.fx.bag.send(this.plant, 'herb', HERB.yield, delay);
  }

  private regrow(): void {
    this.plant = this.buildPlant();
    this.taken = false;
    this.stubs.visible = false;
    this.grow = 0;
    this.plant.scale.setScalar(0.2);
    gatherSfx.refill(this.foot);
  }
}
