import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A tiny procedural modelling kit. Every model in the game is a handful of
// primitives with per-face vertex colours, merged into ONE geometry so it costs
// one draw call (two in XR). Characters are rigid-skinned: each part follows a
// single bone at weight 1, so a whole animated skeleton is still one draw.
//
// Nothing here touches the DOM, so rigs can be built and animated in unit tests.

export type Vec3 = readonly [number, number, number];

export interface PartOpts {
  /** Position in the current bone's space (or model space for static models). */
  at?: Vec3;
  /** Euler XYZ, radians. */
  rot?: Vec3;
  color: number;
  /** 0–1 self-illumination: eyes, runes, embers. Glows in the part's own colour. */
  glow?: number;
  /** 1 marks weapon vertices, which light up with the material's telegraph colour. */
  mask?: number;
  /** Per-face brightness variation, for a hand-painted look. */
  jitter?: number;
}

/** Texels per metre for the shared grain texture, so everything reads as one pixel grid. */
export const TEXELS_PER_METRE = 32;
const GRAIN_SIZE = 32; // must match materials.ts

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3(1, 1, 1);
const _p = new Vector3();
const _c = new Color();
const _a = new Vector3();
const _b = new Vector3();
const _n = new Vector3();
const UP = new Vector3(0, 1, 0);

function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ModelBuilder {
  private readonly parts: BufferGeometry[] = [];
  private readonly space = new Matrix4();
  private bone = 0;
  private readonly random: () => number;

  constructor(seed = 1) {
    this.random = rng(seed);
  }

  /** Subsequent parts belong to `bone`, authored in that bone's bind-pose space. */
  on(bone: number, boneMatrix: Matrix4): this {
    this.bone = bone;
    this.space.copy(boneMatrix);
    return this;
  }

  box(w: number, h: number, d: number, o: PartOpts): this {
    return this.add(new BoxGeometry(w, h, d), o);
  }

  /**
   * A box whose top face is scaled: limbs, ribcages, blades, skulls.
   * Height runs along +Y from the bottom face (at `at`) to the top.
   */
  taper(w0: number, d0: number, w1: number, d1: number, h: number, o: PartOpts): this {
    const g = new BoxGeometry(1, h, 1);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const top = pos.getY(i) > 0;
      pos.setXYZ(i, pos.getX(i) * (top ? w1 : w0), pos.getY(i) + h / 2, pos.getZ(i) * (top ? d1 : d0));
    }
    g.computeVertexNormals();
    return this.add(g, o);
  }

  /** A w×d box spanning two points: struts, bow limbs, chains. */
  bar(a: Vec3, b: Vec3, w: number, d: number, o: PartOpts): this {
    _a.set(...a);
    _b.set(...b);
    const len = _a.distanceTo(_b);
    _q.setFromUnitVectors(UP, _n.subVectors(_b, _a).normalize());
    const e = new Euler().setFromQuaternion(_q);
    _p.addVectors(_a, _b).multiplyScalar(0.5);
    return this.box(w, len, d, { ...o, at: [_p.x, _p.y, _p.z], rot: [e.x, e.y, e.z] });
  }

  cyl(rTop: number, rBottom: number, h: number, segs: number, o: PartOpts): this {
    return this.add(new CylinderGeometry(rTop, rBottom, h, segs, 1), o);
  }

  cone(r: number, h: number, segs: number, o: PartOpts): this {
    return this.add(new ConeGeometry(r, h, segs, 1), o);
  }

  ball(r: number, o: PartOpts, detail = 0): this {
    return this.add(new IcosahedronGeometry(r, detail), o);
  }

  /** Any geometry (e.g. an extruded outline), placed like the primitives. */
  shape(geometry: BufferGeometry, o: PartOpts): this {
    return this.add(geometry, o);
  }

  /**
   * A thin bar between two model-space points whose ends follow different
   * bones, so it stretches as they move apart (a bowstring drawn to the cheek).
   */
  stretch(boneA: number, a: Vector3, boneB: number, b: Vector3, thickness: number, o: PartOpts): this {
    const len = a.distanceTo(b);
    const g = new BoxGeometry(thickness, len, thickness);
    const dir = _n.subVectors(b, a).normalize();
    const saved = { bone: this.bone, space: this.space.clone() };
    this.space.identity();
    const q = new Quaternion().setFromUnitVectors(UP, dir);
    const e = new Euler().setFromQuaternion(q);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    this.add(g, { ...o, at: [mid.x, mid.y, mid.z], rot: [e.x, e.y, e.z] }, (localY) => (localY < 0 ? boneA : boneB));
    this.bone = saved.bone;
    this.space.copy(saved.space);
    return this;
  }

  private add(src: BufferGeometry, o: PartOpts, boneOf?: (localY: number) => number): this {
    const g = src.index ? src.toNonIndexed() : src;
    if (g !== src) src.dispose();
    g.clearGroups();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    // Stretch parts pick a bone per vertex from its pre-transform height.
    const boneAt = boneOf ? Array.from(g.getAttribute('position').array.filter((_, i) => i % 3 === 1), boneOf) : null;

    _e.set(...(o.rot ?? [0, 0, 0]));
    _q.setFromEuler(_e);
    _p.set(...(o.at ?? [0, 0, 0]));
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    g.applyMatrix4(this.space);

    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    const fx = new Float32Array(n * 2);
    const skinIndex = new Uint16Array(n * 4);
    const skinWeight = new Float32Array(n * 4);
    const jitter = o.jitter ?? 0.07;
    _c.setHex(o.color);
    for (let v = 0; v < n; v += 3) {
      const k = 1 + (this.random() * 2 - 1) * jitter; // one shade per triangle
      for (let j = v; j < v + 3; j++) {
        colors[j * 3] = _c.r * k;
        colors[j * 3 + 1] = _c.g * k;
        colors[j * 3 + 2] = _c.b * k;
      }
    }
    for (let v = 0; v < n; v++) {
      fx[v * 2] = o.glow ?? 0;
      fx[v * 2 + 1] = o.mask ?? 0;
      skinIndex[v * 4] = boneAt ? boneAt[v] : this.bone;
      skinWeight[v * 4] = 1;
    }
    g.setAttribute('color', new BufferAttribute(colors, 3));
    g.setAttribute('fx', new BufferAttribute(fx, 2));
    g.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4));
    g.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4));
    boxProjectUVs(g);
    this.parts.push(g);
    return this;
  }

  /** Merge every part into one geometry. Pass `skinned: false` for static props. */
  build(opts: { skinned?: boolean; ao?: { from: number; to: number; min: number } } = {}): BufferGeometry {
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    if (!opts.skinned) {
      merged.deleteAttribute('skinIndex');
      merged.deleteAttribute('skinWeight');
    }
    if (opts.ao) bakeHeightAO(merged, opts.ao.from, opts.ao.to, opts.ao.min);
    merged.computeBoundingSphere();
    return merged;
  }
}

/**
 * Planar UVs from each triangle's dominant axis, at a fixed texel density.
 * Keeps the grain texture's pixels the same size on a skull and on a wall.
 */
export function boxProjectUVs(g: BufferGeometry): void {
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  const scale = TEXELS_PER_METRE / GRAIN_SIZE;
  for (let v = 0; v < pos.count; v += 3) {
    _p.fromBufferAttribute(pos, v);
    _a.fromBufferAttribute(pos, v + 1).sub(_p);
    _b.fromBufferAttribute(pos, v + 2).sub(_p);
    _n.crossVectors(_a, _b);
    const ax = Math.abs(_n.x);
    const ay = Math.abs(_n.y);
    const az = Math.abs(_n.z);
    for (let j = v; j < v + 3; j++) {
      const x = pos.getX(j);
      const y = pos.getY(j);
      const z = pos.getZ(j);
      const [u, w] = ax >= ay && ax >= az ? [z, y] : ay >= az ? [x, z] : [x, y];
      uv[j * 2] = u * scale;
      uv[j * 2 + 1] = w * scale;
    }
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2));
}

/** Fake ambient occlusion: darken vertices toward the floor. */
function bakeHeightAO(g: BufferGeometry, from: number, to: number, min: number): void {
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - from) / (to - from)));
    const k = min + (1 - min) * t * t * (3 - 2 * t);
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
}
