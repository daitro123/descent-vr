import {
  AdditiveBlending,
  type BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  ShaderMaterial,
  Vector3,
} from 'three';
import { CONFIG } from '../config';
import type { Enemy } from '../enemies/enemy';
import { ABILITY_COLOUR } from './abilities';

// Hunter's Mark (the ranger's level-10 ability; .scratch/abilities/issues/12):
// the enemy you face is marked for 20 s, taking 15% more from you, and its
// outline shows through walls. One enemy at a time: marking another moves it,
// marking the same one again starts its time over. It ends early when the
// enemy dies. A lasting effect in ticket 16's budget: a glowing outline round
// the body (a capsule drawn brightest at its rim, over walls) and a chevron
// over the head, 2 draw calls and well under 500 triangles, no light.

/** What the mark needs of the enemy it's on. */
export type Markable = Pick<Enemy, 'alive' | 'position' | 'def' | 'capsule'>;

/** s the outline takes to fade in, and out at the end. */
const FADE = 0.3;
/** How much wider than the body its outline stands. */
const WIDEN = 1.25;
/** m over the head the chevron hangs, and how far it bobs. */
const OVER = 0.35;
const BOB = 0.05;

const vertexShader = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

// Brightest where the surface turns away from the eye: an outline round the
// body, clear in the middle so the enemy itself is seen where it's in sight.
const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
  gl_FragColor = vec4(uColor, smoothstep(0.35, 0.9, rim) * uOpacity);
}`;

const _bottom = new Vector3();
const _top = new Vector3();
const _axis = new Vector3();
const _up = new Vector3(0, 1, 0);

/** The mark: whom it's on, for how long, and its outline and chevron. */
export class Mark {
  /** The glowing outline round the marked body, drawn over everything. */
  readonly outline: Mesh<BufferGeometry, ShaderMaterial>;
  /** The chevron over its head, drawn over everything. */
  readonly chevron: Mesh<BufferGeometry, MeshBasicMaterial>;
  private on: Markable | null = null;
  private left = 0;
  private time = 0;

  constructor(parent: Object3D | null) {
    const colour = ABILITY_COLOUR.huntersMark!;
    // A unit capsule 4 m tall (radius 1), stretched each frame over the body's.
    this.outline = new Mesh(
      new CapsuleGeometry(1, 2, 4, 12),
      new ShaderMaterial({
        uniforms: { uColor: { value: new Color(colour) }, uOpacity: { value: 0 } },
        vertexShader,
        fragmentShader,
        transparent: true,
        blending: AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      }),
    );
    const chevron = new ConeGeometry(0.09, 0.18, 4, 1);
    chevron.rotateX(Math.PI); // point down, at the head
    this.chevron = new Mesh(chevron, new MeshBasicMaterial({ color: colour, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    for (const m of [this.outline, this.chevron]) {
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 10; // after the world, so walls don't hide it
    }
    parent?.add(this.outline, this.chevron);
  }

  /** The enemy marked, or null. */
  get target(): Markable | null {
    return this.on;
  }

  /** s left of the mark: 0 when nothing's marked. */
  get remaining(): number {
    return this.on ? this.left : 0;
  }

  /** Mark `enemy` for `seconds`: one already marked is let go, the same one's time starts over. */
  set(enemy: Markable, seconds = CONFIG.classes.ranger.abilities.huntersMark.time): void {
    if (this.on !== enemy) this.time = 0;
    this.on = enemy;
    this.left = seconds;
  }

  /** What a blow of yours on `enemy` is multiplied by: 1 and the mark's bonus if it's marked, else 1. */
  of(enemy: Markable): number {
    return this.on === enemy && this.left > 0 ? 1 + CONFIG.classes.ranger.abilities.huntersMark.bonus : 1;
  }

  /** Time passes: the mark runs out, or ends with the enemy's death, and its outline follows the body. */
  update(dt: number): void {
    const on = this.on;
    if (on) {
      this.left -= dt;
      this.time += dt;
      if (this.left <= 0 || !on.alive) this.clear();
    }
    this.render();
  }

  private render(): void {
    const on = this.on;
    const shown = on !== null;
    this.outline.visible = this.chevron.visible = shown;
    if (!on) return;
    const fade = Math.min(1, this.time / FADE, this.left / FADE);
    on.capsule(_bottom, _top);
    const r = on.def.radius * WIDEN;
    _axis.subVectors(_top, _bottom);
    const span = _axis.length();
    // The capsule from its feet (a radius under the capsule's bottom) to over its head.
    this.outline.position.addVectors(_bottom, _top).multiplyScalar(0.5);
    if (span > 1e-6) this.outline.quaternion.setFromUnitVectors(_up, _axis.divideScalar(span));
    this.outline.scale.set(r, (span + 2 * r) / 4, r);
    this.outline.material.uniforms.uOpacity.value = 0.9 * fade;
    this.chevron.position.set(_top.x, _top.y + OVER + BOB * Math.sin(this.time * 4), _top.z);
    this.chevron.rotation.y = this.time * 2;
    this.chevron.material.opacity = 0.9 * fade;
  }

  /** How many triangles it draws: the outline and the chevron. */
  get triangles(): number {
    const tris = (g: BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    return tris(this.outline.geometry) + tris(this.chevron.geometry);
  }

  /** Nothing marked: its time ran out, it died, or after death or a new run. */
  clear(): void {
    this.on = null;
    this.left = 0;
    this.outline.visible = this.chevron.visible = false;
  }
}
