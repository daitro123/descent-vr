import {
  AdditiveBlending,
  BoxGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  OctahedronGeometry,
  Vector3,
} from 'three';
import { gatherSfx } from './sound';
import { type Pick, TOOLS } from './tools';
import type { Fx, HandNow, Rules } from './variants';

// PROTOTYPE (?proto=pick): a copper vein on a boulder, struck with the pick.
// Throwaway.

/** Numbers to tune on the headset. */
export const VEIN = {
  /** Strike value to break it: 3 full-power swings (1.5 each), or 5 at the gate's speed (1 each). */
  need: 4.5,
  /** Speed rule: a strike is worth 1 at the gate's speed, up to this at full power. */
  fullValue: 1.5,
  /** Glint rule: a strike in the glint, and one elsewhere on the ore. */
  glintValue: 2.25,
  plainValue: 1,
  /** How near the glint counts as in it (m), and how far out from its centre the ore reaches. */
  glintRadius: 0.1,
  oreRadius: 0.28,
  /** The boulder, as a sphere to strike (a little inside the drawn one, so the head seems to bite). */
  rockRadius: 0.74,
  drawnRadius: 0.8,
  /** Its centre's height, and how far up its face the ore sits. */
  centreHeight: 0.62,
  oreLift: 0.55,
  /** What breaking it drops. */
  chunks: 3,
  /** Seconds before it grows back (minutes in the game; short here to try again). */
  refill: 6,
  /** Chunks left lying go to the bag by themselves after this long. */
  chunkLife: 25,
};

const Y = new Vector3(0, 1, 0);
const _a = new Vector3();
const _b = new Vector3();
const _d = new Vector3();
const _h = new Vector3();

export type StrikeKind = 'tap' | 'stone' | 'good' | 'glint';

export interface StrikeReport {
  kind: StrikeKind;
  speed: number;
  power: number;
  value: number;
}

interface Chunk {
  mesh: Mesh;
  vel: Vector3;
  age: number;
}

const rockMat = new MeshLambertMaterial({ color: 0x7c7870, flatShading: true });
const crackMat = new MeshBasicMaterial({ color: 0x1c1814 });
const chunkGeo = new DodecahedronGeometry(0.045, 0);

/** Same point, same push: keeps a non-indexed polyhedron's faces joined when its corners move. */
function lumpy(radius: number, seed: number): IcosahedronGeometry {
  const g = new IcosahedronGeometry(radius, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    _a.fromBufferAttribute(pos, i);
    const k = Math.sin(_a.x * 12.9 + seed) * Math.cos(_a.y * 7.1 - seed) * Math.sin(_a.z * 9.7 + seed * 2);
    _a.multiplyScalar(1 + 0.06 * k);
    pos.setXYZ(i, _a.x, _a.y, _a.z);
  }
  g.computeVertexNormals();
  return g;
}

export class Vein {
  readonly root = new Group();
  /** The rock's centre and the ore's (world). */
  readonly centre = new Vector3();
  readonly ore = new Vector3();
  private readonly normal = new Vector3();
  private readonly nuggets: Mesh<DodecahedronGeometry, MeshLambertMaterial>[] = [];
  private readonly spots: Vector3[] = [];
  private readonly cracks: Mesh[][] = [[], []];
  private readonly glintMesh: Mesh;
  private glintAt = 0;
  /** The glint's spot on the sphere that's struck. */
  private readonly glintOnRock = new Vector3();
  private readonly chunks: Chunk[] = [];
  rules!: Rules;

  progress = 0;
  strikes = 0;
  broken = false;
  private refillIn = 0;
  private startedAt = -1;
  private lastSwing = -1;
  private lastTap = 0;
  private flash = 0;
  private flashColor = 0xffffff;
  /** What happened last, for the readout. */
  last: StrikeReport | null = null;
  /** The last break: strikes and seconds from the first strike. */
  lastBreak: { strikes: number; seconds: number } | null = null;

  constructor(
    private readonly fx: Fx,
    x: number,
    z: number,
    /** Which way the ore faces (toward where you stand). */
    face: number,
  ) {
    const g = fx.heightAt(x, z);
    this.centre.set(x, g + VEIN.centreHeight, z);
    const rock = new Mesh(lumpy(VEIN.drawnRadius, 3.1), rockMat);
    rock.position.copy(this.centre);
    this.root.add(rock);

    // The ore: a patch of copper nuggets on the rock's face, up at the waist.
    _d.set(Math.sin(face), 0, Math.cos(face)).addScaledVector(Y, VEIN.oreLift).normalize();
    this.normal.copy(_d);
    this.ore.copy(this.centre).addScaledVector(_d, VEIN.rockRadius);
    const t1 = new Vector3().crossVectors(Y, _d).normalize();
    const t2 = new Vector3().crossVectors(_d, t1);
    const layout = [[0, 0], [0.13, 0.05], [-0.12, 0.07], [0.05, -0.13], [-0.08, -0.1], [0.17, -0.08], [-0.17, -0.02], [0.02, 0.15]];
    layout.forEach(([u, v], i) => {
      const p = new Vector3().copy(_d).multiplyScalar(VEIN.drawnRadius).addScaledVector(t1, u).addScaledVector(t2, v);
      p.setLength(VEIN.drawnRadius - 0.01).add(this.centre);
      const m = new Mesh(new DodecahedronGeometry(0.05 + (i % 3) * 0.012, 0), new MeshLambertMaterial({ color: 0xc27238, flatShading: true }));
      m.position.copy(p);
      m.rotation.set(i, i * 2, i * 3);
      this.nuggets.push(m);
      this.spots.push(p);
      this.root.add(m);
    });
    // Cracks, shown as it weakens: a third, then two thirds of the way.
    for (let i = 0; i < 9; i++) {
      const stage = i < 4 ? 0 : 1;
      const a = (i * 2.4) % (Math.PI * 2);
      const r = 0.08 + (i % 3) * 0.07;
      const p = new Vector3().copy(_d).multiplyScalar(VEIN.drawnRadius).addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r);
      p.setLength(VEIN.drawnRadius + 0.005).add(this.centre);
      const m = new Mesh(new BoxGeometry(0.14 + (i % 2) * 0.08, 0.014, 0.01), crackMat);
      m.position.copy(p);
      m.lookAt(_b.copy(p).sub(this.centre).add(p));
      m.rotateZ(a * 1.7);
      m.visible = false;
      this.cracks[stage].push(m);
      this.root.add(m);
    }
    this.glintMesh = new Mesh(
      new OctahedronGeometry(0.045, 0),
      new MeshBasicMaterial({ color: 0xfff2b0, blending: AdditiveBlending, transparent: true, depthWrite: false }),
    );
    this.root.add(this.glintMesh);
    this.moveGlint();
  }

  /** Where you stand off the rock (floor circle). */
  get footprint(): { x: number; z: number; r: number } {
    return { x: this.centre.x, z: this.centre.z, r: VEIN.drawnRadius * 1.1 };
  }

  get stage(): number {
    return this.broken ? 3 : Math.min(2, Math.floor((this.progress / VEIN.need) * 3));
  }

  setRules(rules: Rules): void {
    this.rules = rules;
    this.reset();
  }

  reset(): void {
    this.progress = this.strikes = 0;
    this.broken = false;
    this.startedAt = -1;
    this.last = this.lastBreak = null;
    for (const c of this.chunks) c.mesh.removeFromParent();
    this.chunks.length = 0;
    for (const n of this.nuggets) n.visible = true;
    this.showStage();
    this.moveGlint();
  }

  private moveGlint(): void {
    let i = this.glintAt;
    while (i === this.glintAt) i = Math.floor(Math.random() * this.spots.length);
    this.glintAt = i;
    this.glintMesh.position.copy(this.spots[i]).addScaledVector(this.normal, 0.05);
    this.glintOnRock.subVectors(this.spots[i], this.centre).setLength(VEIN.rockRadius).add(this.centre);
  }

  private showStage(): void {
    const s = this.stage;
    for (const m of this.cracks[0]) m.visible = s >= 1;
    for (const m of this.cracks[1]) m.visible = s >= 2;
  }

  /** One frame of the pick, if it's drawn, and the hands for the chunks. */
  update(dt: number, pick: Pick | null, rig: Object3D, hands: HandNow[]): void {
    const t = this.fx.now();
    // The glint twinkles, and only in its variants.
    this.glintMesh.visible = this.rules.strike === 'glint' && !this.broken;
    const tw = 1 + 0.35 * Math.sin(t * 11) + 0.2 * Math.sin(t * 17.3);
    this.glintMesh.scale.set(tw, tw * 1.4, tw);
    this.glintMesh.rotation.y = t * 2;

    this.flash = Math.max(0, this.flash - dt * 4);
    for (const n of this.nuggets) n.material.emissive.setHex(this.flashColor).multiplyScalar(this.flash * 0.6);

    if (this.broken) {
      this.refillIn -= dt;
      if (this.refillIn <= 0) this.regrow();
    }
    this.updateChunks(dt, hands);
    if (!pick) return;
    for (const p of pick.points) {
      if (!p.valid) continue;
      const hit = this.enters(p.prev(rig, _a), p.now(rig, _b));
      if (hit) this.hit(hit, p.speed, pick.gate.committed, pick.gate.count);
    }
  }

  /** Where the segment a → b first goes into the rock, if it starts outside. */
  private enters(a: Vector3, b: Vector3): Vector3 | null {
    const R = VEIN.rockRadius;
    _d.subVectors(b, a);
    _h.subVectors(a, this.centre);
    const c = _h.lengthSq() - R * R;
    if (c <= 0) return null; // already in
    const A = _d.lengthSq();
    if (A < 1e-10) return null;
    const B = 2 * _h.dot(_d);
    const disc = B * B - 4 * A * c;
    if (disc < 0) return null;
    const s = (-B - Math.sqrt(disc)) / (2 * A);
    if (s < 0 || s > 1) return null;
    return _h.copy(a).addScaledVector(_d, s);
  }

  /** Score a strike at `at` and give its feedback. Also what the desktop keys and scripted checks call. */
  hit(at: Vector3, speed: number, committed: boolean, swing: number): StrikeReport | null {
    const P = TOOLS.pick;
    const t = this.fx.now();
    if (this.broken) return null;
    const hot = committed && speed >= P.minSpeed;
    if (!hot) {
      if (t - this.lastTap < 0.12) return null;
      this.lastTap = t;
      gatherSfx.tap(at);
      this.fx.pulse('right', 0.2, 20);
      this.fx.particles.burst('dust', at, 2, undefined, 0x8a857c);
      return (this.last = { kind: 'tap', speed, power: 0, value: 0 });
    }
    if (swing === this.lastSwing) return null; // one strike per swing
    this.lastSwing = swing;
    const power = Math.min(1, Math.max(0, (speed - P.minSpeed) / (P.fullSpeed - P.minSpeed)));
    _d.subVectors(at, this.centre).normalize();
    if (at.distanceTo(this.ore) > VEIN.oreRadius) {
      gatherSfx.stone(at);
      this.fx.pulse('right', 0.35, 30);
      this.fx.particles.burst('dust', at, 6, _d, 0x8a857c);
      this.fx.hint('Strike the copper');
      return (this.last = { kind: 'stone', speed, power, value: 0 });
    }
    if (this.startedAt < 0) this.startedAt = t;
    this.strikes++;
    let kind: StrikeKind = 'good';
    let value: number;
    if (this.rules.strike === 'speed') value = 1 + (VEIN.fullValue - 1) * power;
    else if (at.distanceTo(this.glintOnRock) < VEIN.glintRadius) {
      kind = 'glint';
      value = VEIN.glintValue;
    } else value = VEIN.plainValue;
    this.progress += value;

    // Feedback sized to the strike: sparks, ring and rumble grow with power; the glint is bigger still.
    if (kind === 'glint') {
      gatherSfx.glint(at);
      this.fx.particles.burst('sparks', at, 30, _d, 0xffe890);
      this.fx.particles.burst('embers', at, 8, undefined, 0xffc060);
      this.fx.pulse('right', 1, 60);
      setTimeout(() => this.fx.pulse('right', 0.8, 40), 90);
      this.flashColor = 0xffffff;
      this.flash = 1;
      this.moveGlint();
    } else {
      gatherSfx.strike(at, power);
      this.fx.particles.burst('sparks', at, Math.round(6 + 14 * power), _d);
      this.fx.pulse('right', 0.45 + 0.45 * power, 45);
      this.flashColor = 0xff9040;
      this.flash = 0.4 + 0.6 * power;
      if (this.rules.strike === 'glint') this.moveGlint();
    }
    this.fx.floats.spawn(`+${value.toFixed(1)}`, _a.copy(at).addScaledVector(_d, 0.12), {
      color: kind === 'glint' ? '#fff2a0' : '#ffb070',
      scale: 0.06,
      life: 0.8,
      rise: 0.2,
    });
    const report = { kind, speed, power, value };
    this.last = report;
    if (this.progress >= VEIN.need - 1e-6) this.shatter(t);
    else this.showStage();
    return report;
  }

  private shatter(t: number): void {
    this.broken = true;
    this.refillIn = VEIN.refill;
    this.lastBreak = { strikes: this.strikes, seconds: t - this.startedAt };
    this.showStage();
    for (const m of [...this.cracks[0], ...this.cracks[1]]) m.visible = true;
    for (const n of this.nuggets) n.visible = false;
    gatherSfx.crack(this.ore);
    this.fx.pulse('right', 1, 150);
    this.fx.particles.burst('bone', this.ore, 14, this.normal, 0xb0643a);
    this.fx.particles.burst('dust', this.ore, 10, undefined, 0x8a857c);
    for (let i = 0; i < VEIN.chunks; i++) {
      const mesh = new Mesh(chunkGeo, new MeshLambertMaterial({ color: 0xc27238, flatShading: true, emissive: 0x301404 }));
      mesh.position.copy(this.ore).addScaledVector(this.normal, 0.08);
      mesh.rotation.set(i, i * 1.3, 0);
      this.fx.scene.add(mesh);
      if (this.rules.ore === 'bag') {
        // A beat to see them come loose, then off to the bag.
        mesh.position.x += (i - 1) * 0.07;
        mesh.position.y += 0.05 * i;
        this.fx.bag.send(mesh, 'ore', 1, 0.35 + i * 0.08);
      } else {
        const vel = new Vector3().copy(this.normal).multiplyScalar(1.2).add(new Vector3((i - 1) * 0.6, 1.4, (Math.random() - 0.5) * 0.4));
        this.chunks.push({ mesh, vel, age: 0 });
      }
    }
  }

  private regrow(): void {
    this.progress = this.strikes = 0;
    this.broken = false;
    this.startedAt = -1;
    for (const n of this.nuggets) n.visible = true;
    this.showStage();
    this.moveGlint();
    gatherSfx.refill(this.ore);
    this.fx.particles.burst('dust', this.ore, 8, undefined, 0x8a857c);
  }

  /** Chunks fall, roll to rest, and go to the bag when a hand squeezes on one. */
  private updateChunks(dt: number, hands: HandNow[]): void {
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      c.age += dt;
      const p = c.mesh.position;
      c.vel.y -= 9.8 * dt;
      p.addScaledVector(c.vel, dt);
      // Off the rock…
      _d.subVectors(p, this.centre);
      const r = VEIN.drawnRadius + 0.04;
      if (_d.lengthSq() < r * r) {
        _d.normalize();
        p.copy(this.centre).addScaledVector(_d, r);
        const into = c.vel.dot(_d);
        if (into < 0) c.vel.addScaledVector(_d, -1.4 * into);
      }
      // …and onto the ground.
      const floor = this.fx.heightAt(p.x, p.z) + 0.04;
      if (p.y < floor) {
        p.y = floor;
        c.vel.y = Math.abs(c.vel.y) * 0.3;
        c.vel.x *= 0.5;
        c.vel.z *= 0.5;
      }
      c.mesh.rotation.x += c.vel.length() * dt * 4;
      (c.mesh.material as MeshLambertMaterial).emissive.setHex(0x301404).multiplyScalar(1 + 0.8 * Math.sin(c.age * 5));
      const taken = hands.find((h) => h.squeezed && h.at.distanceTo(p) < 0.16);
      if (taken || c.age > VEIN.chunkLife) {
        if (taken) this.fx.pulse(taken.hand, 0.5, 30);
        this.chunks.splice(i, 1);
        this.fx.bag.send(c.mesh, 'ore', 1);
      }
    }
  }

  /** Chunks still lying about. */
  get lying(): number {
    return this.chunks.length;
  }

  /** Where a strike in the glint lands now (world). */
  glint(out: Vector3): Vector3 {
    return out.copy(this.glintOnRock);
  }
}
