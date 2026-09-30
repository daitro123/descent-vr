import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  Color,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../../config';
import type { SpotPlan } from '../../maps/types';
import { ModelBuilder } from '../../models/kit';
import { grainTexture } from '../../models/materials';
import { PAL } from '../../models/palette';

// Oakvale's copper veins, drawn (.scratch/professions/spec.md, "Gathering
// spots and the tool loop"; the look from issues/10-gathering-spots-in-oakvale.md,
// the strike from ?proto=pick variant C): grey boulders streaked green and
// copper, the streaks faintly lit so you see them from the road. Every vein
// out of doors is one instanced mesh, one draw call, loaded with the chunks
// round you, and the mine's two another, loaded with the mine. A taken vein's
// ore goes dark until it refills, and a strike flashes it. The one you work
// with the pick drawn gets the glint that moves after every strike and the
// cracks at a third and two thirds, laid over it.

/** One vein, where it is in the world. */
export interface Vein {
  readonly plan: SpotPlan;
  /** The rock's centre, struck as a sphere. */
  readonly centre: Vector3;
  /** The ore's middle on that sphere, and the way it faces. */
  readonly ore: Vector3;
  readonly normal: Vector3;
  /** Its foot's transform: the vein's own frame, its ore towards +Z. */
  readonly matrix: Matrix4;
}

/** The ore's streaks in a vein's own frame: where each lies across the rock (u, v from the ore's middle). */
const STREAKS = [
  [0, 0],
  [0.13, 0.05],
  [-0.12, 0.07],
  [0.05, -0.13],
  [-0.08, -0.1],
  [0.17, -0.08],
  [-0.17, -0.02],
  [0.02, 0.15],
] as const;
const COPPER = [0xc27238, 0xd48a4c];
const VERDIGRIS = 0x3f9f7a;

const Y = new Vector3(0, 1, 0);
const _a = new Vector3();
const _b = new Vector3();
const _d = new Vector3();
const _h = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();
const _s = new Vector3();

/** In a vein's own frame: the rock's centre, the way the ore faces, and two directions across it. */
function frame(): { centre: Vector3; d: Vector3; t1: Vector3; t2: Vector3 } {
  const V = CONFIG.professions.vein;
  const centre = new Vector3(0, V.centreHeight, 0);
  const d = new Vector3(0, V.oreLift, 1).normalize();
  const t1 = new Vector3().crossVectors(Y, d).normalize();
  const t2 = new Vector3().crossVectors(d, t1);
  return { centre, d, t1, t2 };
}

/** Where each streak sits on the drawn rock, in a vein's own frame: the glint's places. */
export const STREAK_SPOTS: readonly Vector3[] = (() => {
  const { centre, d, t1, t2 } = frame();
  const R = CONFIG.professions.vein.drawnRadius;
  return STREAKS.map(([u, v]) =>
    new Vector3()
      .copy(d)
      .multiplyScalar(R)
      .addScaledVector(t1, u)
      .addScaledVector(t2, v)
      .setLength(R - 0.01)
      .add(centre),
  );
})();

let built: BufferGeometry | null = null;
/**
 * A vein's rock and ore, standing on its foot with its ore to +Z: a lumpy
 * grey boulder (80 triangles) and eight streaks laid across its face (8 each).
 * The streaks glow a little (the model kit's `fx`), which also marks them as
 * the ore for the vein's shader.
 */
export function veinGeometry(): BufferGeometry {
  if (built) return built;
  const V = CONFIG.professions.vein;
  const { centre, d } = frame();
  const b = new ModelBuilder(41);
  const rock = new IcosahedronGeometry(V.drawnRadius, 1);
  const pos = rock.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    _a.fromBufferAttribute(pos, i);
    const k = Math.sin(_a.x * 12.9 + 3.1) * Math.cos(_a.y * 7.1 - 3.1) * Math.sin(_a.z * 9.7 + 6.2);
    _a.multiplyScalar(1 + 0.06 * k);
    pos.setXYZ(i, _a.x, _a.y, _a.z);
  }
  b.shape(rock, { color: PAL.stone, at: [centre.x, centre.y, centre.z], jitter: 0.14 });
  STREAK_SPOTS.forEach((p, i) => {
    const g = new OctahedronGeometry(0.075, 0);
    // Laid flat on the rock, long across it, turned a little each.
    _q.setFromUnitVectors(Y, _h.subVectors(p, centre).normalize());
    _q.multiply(new Quaternion().setFromAxisAngle(Y, i * 1.1));
    g.applyMatrix4(_m.compose(_a.copy(p).addScaledVector(d, -0.005), _q, _s.set(1.9 - (i % 3) * 0.3, 0.35, 0.6)));
    b.shape(g, { color: i % 3 === 1 ? VERDIGRIS : COPPER[i % 2], glow: 0.3, jitter: 0.12 });
  });
  built = b.build();
  return built;
}

/**
 * The veins' material: the model kit's look (vertex colours, grain, `fx`
 * glow), plus two numbers per vein from the instanced `vein` attribute: how
 * dark its ore has gone (taken), and a strike's flash on it.
 */
function veinMaterial(flash: Color): MeshLambertMaterial {
  const mat = new MeshLambertMaterial({ vertexColors: true, map: grainTexture(), flatShading: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFlash = { value: flash };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 fx;\nattribute vec2 vein;\nvarying vec2 vFx;\nvarying vec2 vVein;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFx = fx;\nvVein = vein;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFlash;\nvarying vec2 vFx;\nvarying vec2 vVein;')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\nfloat ore = step(0.01, vFx.x);\ndiffuseColor.rgb *= mix(1.0, 0.3, ore * vVein.x);',
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vFx.x * 1.6 * (1.0 - vVein.x) + uFlash * ore * vVein.y;',
      );
  };
  mat.customProgramCacheKey = () => 'descent-vein';
  return mat;
}

/** An instanced mesh of `veins`, each at its foot, with its own dark and flash. */
function instanced(veins: readonly Vein[], material: MeshLambertMaterial, name: string): InstancedMesh {
  const geometry = veinGeometry().clone();
  geometry.setAttribute('vein', new InstancedBufferAttribute(new Float32Array(veins.length * 2), 2));
  const mesh = new InstancedMesh(geometry, material, veins.length);
  mesh.name = name;
  veins.forEach((v, i) => mesh.setMatrixAt(i, v.matrix));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

export class Veins {
  readonly veins: readonly Vein[];
  /** The veins out of doors, drawn with the outdoors: null with none. */
  readonly outdoors: InstancedMesh | null;
  /** The mine's veins, drawn where the mine is: null with none. */
  readonly mine: InstancedMesh | null;
  /** The glint and the cracks, laid over the vein you're working. */
  readonly overlay = new Group();
  /** Each vein's mesh and its index in it. */
  private readonly slots: { readonly mesh: InstancedMesh; readonly index: number }[] = [];
  /** How dark each one's ore is now, and is heading to; its flash. */
  private readonly dark: number[];
  private readonly darkTo: number[];
  private readonly flashes: number[];
  private readonly flashColor = new Color();
  private readonly glintMesh: Mesh;
  private readonly cracks: Mesh[];
  /** Which streak the glint is on, per vein. */
  private readonly glintAt: number[];

  constructor(plans: readonly SpotPlan[]) {
    this.veins = plans.map((plan) => {
      const matrix = new Matrix4().compose(new Vector3(plan.x, plan.y, plan.z), new Quaternion().setFromAxisAngle(Y, plan.yaw), _s.set(1, 1, 1));
      const { centre, d } = frame();
      const V = CONFIG.professions.vein;
      const ore = centre.clone().addScaledVector(d, V.rockRadius).applyMatrix4(matrix);
      return { plan, centre: centre.applyMatrix4(matrix), ore, normal: d.transformDirection(matrix), matrix };
    });
    const material = veinMaterial(this.flashColor);
    const out = this.veins.filter((v) => v.plan.interior === null);
    const mine = this.veins.filter((v) => v.plan.interior === 'mine');
    this.outdoors = out.length ? instanced(out, material, 'veins') : null;
    this.mine = mine.length ? instanced(mine, material, 'veins in the mine') : null;
    for (const v of this.veins) {
      const mesh = v.plan.interior === null ? this.outdoors! : this.mine!;
      const index = (v.plan.interior === null ? out : mine).indexOf(v);
      this.slots.push({ mesh, index });
    }
    this.dark = this.veins.map(() => 0);
    this.darkTo = this.veins.map(() => 0);
    this.flashes = this.veins.map(() => 0);
    this.glintAt = this.veins.map(() => 0);

    this.overlay.name = 'vein worked';
    this.overlay.matrixAutoUpdate = false;
    this.glintMesh = new Mesh(
      new OctahedronGeometry(0.045, 0),
      new MeshBasicMaterial({ color: 0xfff2b0, blending: AdditiveBlending, transparent: true, depthWrite: false }),
    );
    this.cracks = [crackGeometry(0), crackGeometry(1)].map((g) => new Mesh(g, new MeshBasicMaterial({ color: 0x1c1814 })));
    this.overlay.add(this.glintMesh, ...this.cracks);
    this.overlay.visible = false;
  }

  /** Vein `i`'s ore goes dark (taken) or bright again (refilled). */
  setTaken(i: number, taken: boolean): void {
    this.darkTo[i] = taken ? 1 : 0;
  }

  /** A strike on vein `i` flashes its ore `amount` (0 to 1) in `color`. */
  flash(i: number, color: number, amount: number): void {
    this.flashes[i] = amount;
    this.flashColor.setHex(color);
  }

  /** Move vein `i`'s glint to another streak. */
  moveGlint(i: number): void {
    let at = this.glintAt[i];
    while (at === this.glintAt[i]) at = Math.floor(Math.random() * STREAK_SPOTS.length);
    this.glintAt[i] = at;
  }

  /** Where a strike in vein `i`'s glint lands (on the sphere that's struck), in the world. */
  glint(i: number, out: Vector3): Vector3 {
    const v = this.veins[i];
    const { centre } = frame();
    return out
      .subVectors(STREAK_SPOTS[this.glintAt[i]], centre)
      .setLength(CONFIG.professions.vein.rockRadius)
      .add(centre)
      .applyMatrix4(v.matrix);
  }

  /** Where the segment a → b first goes into vein `i`'s rock, if it starts outside: written into `out`. */
  enters(i: number, a: Vector3, b: Vector3, out: Vector3): Vector3 | null {
    const R = CONFIG.professions.vein.rockRadius;
    const { centre } = this.veins[i];
    _d.subVectors(b, a);
    _h.subVectors(a, centre);
    const c = _h.lengthSq() - R * R;
    if (c <= 0) return null; // already in
    const A = _d.lengthSq();
    if (A < 1e-10) return null;
    const B = 2 * _h.dot(_d);
    const disc = B * B - 4 * A * c;
    if (disc < 0) return null;
    const s = (-B - Math.sqrt(disc)) / (2 * A);
    if (s < 0 || s > 1) return null;
    return out.copy(a).addScaledVector(_d, s);
  }

  /**
   * One frame: each vein's ore eases dark or bright and its flash fades, and
   * the overlay sits on `worked` (−1: none) with its cracks at `stage`, the
   * glint twinkling at `t` s.
   */
  update(dt: number, worked: number, stage: number, t: number): void {
    const touched = new Set<InstancedMesh>();
    for (let i = 0; i < this.veins.length; i++) {
      const was = [this.dark[i], this.flashes[i]];
      const d = this.darkTo[i] - this.dark[i];
      this.dark[i] += Math.sign(d) * Math.min(Math.abs(d), dt * 2);
      this.flashes[i] = Math.max(0, this.flashes[i] - dt * 4);
      if (was[0] === this.dark[i] && was[1] === this.flashes[i]) continue;
      const { mesh, index } = this.slots[i];
      const attr = mesh.geometry.getAttribute('vein') as InstancedBufferAttribute;
      attr.setXY(index, this.dark[i], this.flashes[i] * 0.6);
      touched.add(mesh);
    }
    for (const mesh of touched) mesh.geometry.getAttribute('vein').needsUpdate = true;

    this.overlay.visible = worked >= 0 && stage < 3;
    if (!this.overlay.visible) return;
    this.overlay.matrix.copy(this.veins[worked].matrix);
    this.overlay.matrixWorldNeedsUpdate = true;
    const tw = 1 + 0.35 * Math.sin(t * 11) + 0.2 * Math.sin(t * 17.3);
    this.glintMesh.position.copy(STREAK_SPOTS[this.glintAt[worked]]).addScaledVector(frame().d, 0.05);
    this.glintMesh.scale.set(tw, tw * 1.4, tw);
    this.glintMesh.rotation.y = t * 2;
    this.cracks[0].visible = stage >= 1;
    this.cracks[1].visible = stage >= 2;
  }

  /** Is vein `i` drawn now (its mesh shown)? */
  shown(i: number): boolean {
    const { mesh } = this.slots[i];
    return mesh.visible && (mesh.parent?.visible ?? false);
  }
}

/** The cracks for `stage` (0: at a third, 1: at two thirds), in a vein's own frame, as one geometry. */
function crackGeometry(stage: 0 | 1): BufferGeometry {
  const { centre, d, t1, t2 } = frame();
  const R = CONFIG.professions.vein.drawnRadius;
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    if ((i < 4 ? 0 : 1) !== stage) continue;
    const a = (i * 2.4) % (Math.PI * 2);
    const r = 0.08 + (i % 3) * 0.07;
    const p = new Vector3().copy(d).multiplyScalar(R).addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r);
    p.setLength(R + 0.005).add(centre);
    const g = new BoxGeometry(0.14 + (i % 2) * 0.08, 0.014, 0.01);
    const m = new Mesh();
    m.position.copy(p);
    m.lookAt(_b.copy(p).sub(centre).add(p));
    m.rotateZ(a * 1.7);
    m.updateMatrix();
    g.applyMatrix4(m.matrix);
    parts.push(g);
  }
  return mergeGeometries(parts, false);
}
