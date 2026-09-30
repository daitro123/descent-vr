import {
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  OctahedronGeometry,
  Quaternion,
  TetrahedronGeometry,
  Vector3,
} from 'three';
import { CONFIG } from '../../config';
import type { SpotPlan } from '../../maps/types';
import { ModelBuilder } from '../../models/kit';
import { grainTexture } from '../../models/materials';
import { PAL } from '../../models/palette';
import type { Interior } from '../../save/record';

// Oakvale's clumps of herbs, drawn (.scratch/professions/spec.md, "Gathering
// spots and the tool loop"; the look from issues/10-gathering-spots-in-oakvale.md,
// the cut from ?proto=pick variant C). Hearthleaf is a knee-high clump of
// bright leaves with small gold flowers on an earthen bank; Duskcap a cluster
// of dark purple caps on an old stump, glowing faintly in the mine. Each rise
// lifts the stems to where a knife comes without kneeling. Every clump of a
// kind in one place (out of doors, or in the mine) is one instanced mesh, one
// draw call. A cut through the stems takes the clump and leaves short stubs
// until it grows back; a cut through the leaves trims one, down to three.

export type ClumpKind = 'hearthleaf' | 'duskcap';

/** How many leaves (Duskcap's caps) a whole clump has: trims take all but `leavesLeft` of them. */
export const LEAVES: Readonly<Record<ClumpKind, number>> = { hearthleaf: 6, duskcap: 5 };

/** One clump, where it is in the world. */
export interface Clump {
  readonly plan: SpotPlan & { readonly kind: ClumpKind };
  /** Where its stems meet the top of its rise, which the knife's bands are measured from. */
  readonly foot: Vector3;
  /** The middle of its leaves, where what it gives comes loose. */
  readonly heart: Vector3;
  /** Its transform at the ground: its own frame. */
  readonly matrix: Matrix4;
}

/** A kind's clumps in one place, as one instanced mesh. */
export interface ClumpMesh {
  readonly kind: ClumpKind;
  readonly interior: Interior | null;
  readonly mesh: InstancedMesh;
}

/**
 * Each part of a clump's model carries its role in the kit's `mask` (the
 * second `fx` number), which the clumps' shader reads: the rise stays, the
 * stems are cut to stubs, and the flowers and leaves go with the cut, a leaf
 * `LEAF + k` (k from 1) with the kth trim.
 */
const RISE = 0;
const STEM = 0.5;
const FLOWER = 1;
const LEAF = 1;

const Y = new Vector3(0, 1, 0);
const X = new Vector3(1, 0, 0);
const _p = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();
const _s = new Vector3();

const built: Partial<Record<ClumpKind, BufferGeometry>> = {};

/**
 * A clump's model standing on the ground, its foot `rise` m up: Hearthleaf
 * on an earthen bank (24 triangles), 4 stems (6 each), 6 leaves (8 each) and
 * 3 gold flowers (4 each), about 110 in all; Duskcap on a stump, with 5
 * stems and 5 caps (12 each).
 */
export function clumpGeometry(kind: ClumpKind): BufferGeometry {
  const done = built[kind];
  if (done) return done;
  const C = CONFIG.professions.clump;
  const b = new ModelBuilder(kind === 'hearthleaf' ? 61 : 67);
  const foot = C.rise;
  if (kind === 'hearthleaf') {
    b.cyl(0.3, 0.44, foot + 0.1, 6, { color: 0x5a4330, at: [0, (foot - 0.1) / 2, 0], mask: RISE, jitter: 0.12 });
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6;
      stemAt(b, Math.cos(a) * 0.035, Math.sin(a) * 0.035, foot, C.stemTop + 0.02, 0.01, 0x5e8a2e);
    }
    // Long leaves splaying up and out from the top of the stems.
    for (let i = 0; i < LEAVES.hearthleaf; i++) {
      const a = (i / LEAVES.hearthleaf) * Math.PI * 2 + (i % 2) * 0.35;
      const len = 0.15 + (i % 3) * 0.025;
      const tilt = 0.7 + (i % 3) * 0.18;
      const dir = new Vector3(Math.cos(a) * Math.cos(tilt), Math.sin(tilt), Math.sin(a) * Math.cos(tilt));
      const base = new Vector3(Math.cos(a) * 0.025, foot + C.stemTop, Math.sin(a) * 0.025);
      const leaf = new OctahedronGeometry(1, 0);
      _q.setFromUnitVectors(X, dir);
      // Flat across its width, facing up as much as it can.
      _q.multiply(new Quaternion().setFromAxisAngle(X, Math.PI / 2 - 0.2 * (i % 2)));
      leaf.applyMatrix4(_m.compose(_p.copy(base).addScaledVector(dir, len / 2), _q, _s.set(len / 2, 0.028, 0.004)));
      b.shape(leaf, { color: i % 2 ? 0x7ea83a : 0x8fb840, mask: LEAF + i + 1, jitter: 0.1 });
    }
    // The small gold flowers over them, a little lit so they catch the eye.
    for (let i = 0; i < 3; i++) {
      const flower = new TetrahedronGeometry(0.022, 0);
      b.shape(flower, { color: PAL.gold, at: [Math.cos(i * 2.1) * 0.03, foot + C.stemTop + 0.13 + i * 0.025, Math.sin(i * 2.1) * 0.03], rot: [i, i * 0.7, 0], glow: 0.35, mask: FLOWER });
    }
  } else {
    b.cyl(0.19, 0.25, foot + 0.04, 6, { color: PAL.woodDark, at: [0, (foot - 0.04) / 2, 0], mask: RISE, jitter: 0.14 });
    // Five pale stems, a cap on each: the caps are what a cut too high trims.
    for (let i = 0; i < LEAVES.duskcap; i++) {
      const a = i * 1.26 + 0.4;
      const r = i === 0 ? 0 : 0.055;
      const h = C.stemTop + 0.01 + (i % 3) * 0.03;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      stemAt(b, x, z, foot, h, 0.011, 0xb8ab94);
      const capR = 0.038 + (i % 2) * 0.014;
      b.shape(new ConeGeometry(capR, 0.035, 6, 1), {
        color: i % 2 ? 0x4a2a6a : 0x5b3280,
        at: [x * 1.25, foot + h + 0.012, z * 1.25],
        rot: [z * 2, 0, -x * 2],
        glow: 0.55,
        mask: LEAF + i + 1,
        jitter: 0.12,
      });
    }
  }
  const g = b.build();
  built[kind] = g;
  return g;
}

/** A thin open stem at (x, z) from the middle, from the foot `foot` m up to `h` over it, leaning out a little. */
function stemAt(b: ModelBuilder, x: number, z: number, foot: number, h: number, r: number, color: number): void {
  const g = new CylinderGeometry(r * 0.7, r, h, 3, 1, true);
  b.shape(g, { color, at: [x, foot + h / 2, z], rot: [z * 1.5, 0, -x * 1.5], mask: STEM, jitter: 0.1 });
}

/**
 * The clumps' material: the model kit's look (vertex colours, grain, `fx`
 * glow scaled by `glow`), with the instanced `clump` attribute's three
 * numbers per clump: how far it's cut (0 whole, 1 stubs; it grows back
 * through the numbers between), how many leaves are trimmed, and how much
 * it sways from a brush.
 */
function clumpMaterial(glow: number, time: { value: number }): MeshLambertMaterial {
  const C = CONFIG.professions.clump;
  const mat = new MeshLambertMaterial({ vertexColors: true, map: grainTexture(), flatShading: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = { value: glow };
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute vec2 fx;\nattribute vec3 clump;\nuniform float uTime;\nvarying vec2 vFx;\nconst float FOOT = ${C.rise.toFixed(4)};\nconst float STUB = ${C.stub.toFixed(4)};`,
      )
      .replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          'vFx = fx;',
          'float part = fx.y;',
          'if (part > 0.9) {',
          '  float trimmed = step(1.5, part) * step(part, clump.y + 1.5);',
          '  float gone = max(clump.x, trimmed);',
          '  transformed.x += sin(uTime * 14.0) * 0.25 * clump.z * max(0.0, transformed.y - FOOT);',
          '  transformed = mix(transformed, vec3(0.0, FOOT + STUB, 0.0), gone);',
          '} else if (part > 0.4) {',
          '  transformed.y = mix(transformed.y, min(transformed.y, FOOT + STUB), clump.x);',
          '}',
        ].join('\n'),
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;\nvarying vec2 vFx;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vFx.x * 1.6 * uGlow;');
  };
  mat.customProgramCacheKey = () => 'descent-clump';
  mat.userData.glow = glow;
  return mat;
}

export class Clumps {
  readonly clumps: readonly Clump[];
  /** One instanced mesh for each kind in each place it grows. */
  readonly meshes: readonly ClumpMesh[];
  /** Each clump's mesh and its index in it. */
  private readonly slots: { readonly mesh: InstancedMesh; readonly index: number }[] = [];
  /** How far each is cut now (1 stubs), and heading to; its trimmed leaves; its sway. */
  private readonly cut: number[];
  private readonly cutTo: number[];
  private readonly trimmed: number[];
  private readonly sway: number[];
  private readonly time = { value: 0 };

  constructor(plans: readonly SpotPlan[]) {
    const C = CONFIG.professions.clump;
    this.clumps = plans
      .filter((p): p is SpotPlan & { kind: ClumpKind } => p.kind === 'hearthleaf' || p.kind === 'duskcap')
      .map((plan) => {
        const matrix = new Matrix4().compose(new Vector3(plan.x, plan.y, plan.z), new Quaternion().setFromAxisAngle(Y, plan.yaw), _s.set(1, 1, 1));
        const foot = new Vector3(plan.x, plan.y + C.rise, plan.z);
        return { plan, foot, heart: foot.clone().setY(foot.y + (C.stemTop + C.leafTop) / 2), matrix };
      });
    const meshes: ClumpMesh[] = [];
    const glows: Record<ClumpKind, { outdoors: number; mine: number }> = { hearthleaf: { outdoors: 0.5, mine: 0.5 }, duskcap: { outdoors: 0, mine: 1 } };
    for (const kind of ['hearthleaf', 'duskcap'] as const) {
      for (const interior of [null, 'mine'] as const) {
        const here = this.clumps.filter((c) => c.plan.kind === kind && c.plan.interior === interior);
        if (!here.length) continue;
        const geometry = clumpGeometry(kind).clone();
        geometry.setAttribute('clump', new InstancedBufferAttribute(new Float32Array(here.length * 3), 3));
        const mesh = new InstancedMesh(geometry, clumpMaterial(glows[kind][interior ?? 'outdoors'], this.time), here.length);
        mesh.name = `${kind}${interior ? ` in the ${interior}` : ''}`;
        here.forEach((c, i) => mesh.setMatrixAt(i, c.matrix));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        meshes.push({ kind, interior, mesh });
      }
    }
    this.meshes = meshes;
    for (const c of this.clumps) {
      const { mesh } = meshes.find((m) => m.kind === c.plan.kind && m.interior === c.plan.interior)!;
      const index = this.clumps.filter((o) => o.plan.kind === c.plan.kind && o.plan.interior === c.plan.interior).indexOf(c);
      this.slots.push({ mesh, index });
    }
    this.cut = this.clumps.map(() => 0);
    this.cutTo = this.clumps.map(() => 0);
    this.trimmed = this.clumps.map(() => 0);
    this.sway = this.clumps.map(() => 0);
  }

  /** Clump `i` cut to stubs at once (taken), or growing back (refilled). */
  setTaken(i: number, taken: boolean): void {
    this.cutTo[i] = taken ? 1 : 0;
    if (taken) this.cut[i] = 1;
    else this.trimmed[i] = 0;
    this.write(i);
  }

  /** Clump `i` shows `n` leaves trimmed, and sways. */
  trim(i: number, n: number): void {
    this.trimmed[i] = n;
    this.sway[i] = 1;
    this.write(i);
  }

  /** Clump `i` was brushed: it sways and settles. */
  brush(i: number): void {
    this.sway[i] = 1;
  }

  /** One frame: each growing clump grows, each swaying one settles; `t` s drives the sway. */
  update(dt: number, t: number): void {
    this.time.value = t;
    const grow = dt / CONFIG.professions.clump.grow;
    for (let i = 0; i < this.clumps.length; i++) {
      const was = [this.cut[i], this.sway[i]];
      const d = this.cutTo[i] - this.cut[i];
      this.cut[i] += Math.sign(d) * Math.min(Math.abs(d), grow);
      this.sway[i] = Math.max(0, this.sway[i] - dt * 2);
      if (was[0] !== this.cut[i] || was[1] !== this.sway[i]) this.write(i);
    }
  }

  /** Is clump `i` drawn now (its mesh shown)? */
  shown(i: number): boolean {
    const { mesh } = this.slots[i];
    return mesh.visible && (mesh.parent?.visible ?? false);
  }

  private write(i: number): void {
    const { mesh, index } = this.slots[i];
    const attr = mesh.geometry.getAttribute('clump') as InstancedBufferAttribute;
    attr.setXYZ(index, this.cut[i], this.trimmed[i], this.sway[i]);
    attr.needsUpdate = true;
  }
}
