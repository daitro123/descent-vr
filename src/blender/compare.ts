import {
  BufferAttribute,
  type BufferGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
  type Bone,
  type SkinnedMesh,
  type Vector3,
  type WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { type Clip, clipsFor, type MutablePose } from '../inspector/clips';
import { plantPrototypes } from '../maps/forest/nature';
import { buildCharacter } from '../models/characters';
import { boxProjectUVs } from '../models/kit';
import { createModelMaterial, type ModelMaterial, sharedModelMaterial } from '../models/materials';
import { buildPerson } from '../models/people';
import { BONES, type BoneName, type Pose, type Rig } from '../models/rig';
import { XRInput } from '../player/input';
import { TextPanel } from '../ui/panel';

// `?blender`: the Blender experiment beside what the game builds today. The
// farmer beside a plain Blender villager and a more detailed, Warcraft Classic
// style militiaman; an undead grunt beside a Blender skeleton, all looping the
// same animation from the game's poses; and the forest oak beside a Blender oak
// and its far LOD. Everything uses the game's own material, so only the
// modelling differs (the detailed human is smooth-shaded). The .glb files come
// from tools/blender/.

export interface Posable {
  readonly object: Object3D;
  readonly material: ModelMaterial;
  readonly triangles: number;
  apply(pose: Pose): void;
  setHipOffset(x: number, y: number, z: number): void;
}

/** A skinned glTF on the game's bone names, posed the way Rig is (Euler YXZ offsets from an identity bind). */
export class GlbRig implements Posable {
  readonly bones = {} as Record<BoneName, Bone>;
  private readonly hipBind: Vector3;

  constructor(
    readonly object: Object3D,
    readonly mesh: SkinnedMesh,
    readonly material: ModelMaterial,
  ) {
    for (const name of BONES) {
      const bone = mesh.skeleton.getBoneByName(name);
      if (!bone) throw new Error(`${name} is missing from the glb`);
      bone.rotation.order = 'YXZ';
      this.bones[name] = bone;
    }
    this.hipBind = this.bones.hips.position.clone();
    mesh.frustumCulled = false;
  }

  get triangles(): number {
    return triangles(this.mesh.geometry);
  }

  apply(pose: Pose): void {
    for (const name of BONES) {
      const r = pose[name];
      this.bones[name].rotation.set(r?.[0] ?? 0, r?.[1] ?? 0, r?.[2] ?? 0);
    }
  }

  setHipOffset(x: number, y: number, z: number): void {
    this.bones.hips.position.set(this.hipBind.x + x, this.hipBind.y + y, this.hipBind.z + z);
  }
}

class CodeRig implements Posable {
  constructor(
    readonly rig: Rig,
    readonly material: ModelMaterial,
  ) {}
  get object(): Object3D {
    return this.rig.mesh;
  }
  get triangles(): number {
    return this.rig.triangles;
  }
  apply(pose: Pose): void {
    this.rig.apply(pose);
  }
  setHipOffset(x: number, y: number, z: number): void {
    this.rig.setHipOffset(x, y, z);
  }
}

function triangles(g: BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}

/**
 * Make a glTF mesh wear the game's material: per-triangle vertices, the grain
 * texture's box-projected UVs, and the `fx` channel (the Blender `_FX`
 * attribute, or zeros).
 */
export function adoptGameMaterial(mesh: Mesh, material: ModelMaterial): void {
  let g = mesh.geometry;
  if (g.index) g = g.toNonIndexed();
  const fx = g.getAttribute('_fx');
  if (fx) {
    g.setAttribute('fx', fx);
    g.deleteAttribute('_fx');
  } else g.setAttribute('fx', new BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  boxProjectUVs(g);
  mesh.geometry = g;
  mesh.material = material;
}

async function loadGlb(name: string): Promise<{ root: Object3D; mesh: Mesh; bytes: number }> {
  const res = await fetch(`${import.meta.env.BASE_URL}models/blender/${name}.glb`);
  const buf = await res.arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  let mesh: Mesh | null = null;
  gltf.scene.traverse((o) => {
    if ((o as Mesh).isMesh) mesh = o as Mesh;
  });
  if (!mesh) throw new Error(`${name}.glb has no mesh`);
  return { root: gltf.scene, mesh, bytes: buf.byteLength };
}

interface Stand {
  who: Posable;
  clips: Clip[];
  panel: TextPanel;
  label: string[];
  turntable: Group;
}

const STAGE_Z = -2.6;
const TREE_Z = -12;
const _block = new Color(1.0, 0.45, 0.05);
const _unblock = new Color(1.0, 0.05, 0.02);

export class BlenderCompare {
  readonly root = new Group();
  readonly stands: Stand[] = [];
  private readonly input: XRInput;
  private readonly help = new TextPanel(0.8);
  private readonly pose: MutablePose = {};
  private readonly keys = new Set<string>();
  private flicked = false;
  clip = 1;
  time = 0;
  playing = true;
  spinning = false;
  ready: Promise<void>;

  constructor(renderer: WebGLRenderer) {
    this.root.name = 'blender-compare';
    this.root.add(new HemisphereLight(0xc8d4f0, 0x3a3020, 1.5));
    const key = new DirectionalLight(0xffe2c0, 2.2);
    key.position.set(1.5, 3, 1);
    const rim = new DirectionalLight(0x6a90ff, 1.0);
    rim.position.set(-2, 2.5, -3);
    this.root.add(key, rim);
    const ground = new Mesh(new CircleGeometry(24, 40), new MeshLambertMaterial({ color: 0x4f6a2e }));
    ground.rotation.x = -Math.PI / 2;
    this.root.add(ground);

    // Between the two pairs, tipped back a little toward the viewer.
    this.help.mesh.position.set(0, 1.0, STAGE_Z + 0.3);
    this.help.mesh.rotation.x = -0.35;
    this.root.add(this.help.mesh);
    const hands = new Group();
    this.root.add(hands);
    this.input = new XRInput(renderer, hands);

    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
    let dragX: number | null = null;
    renderer.domElement.addEventListener('pointerdown', (e) => (dragX = e.clientX));
    addEventListener('pointerup', () => (dragX = null));
    addEventListener('pointermove', (e) => {
      if (dragX === null) return;
      this.turn((e.clientX - dragX) * 0.01);
      dragX = e.clientX;
    });

    this.ready = this.build();
  }

  private async build(): Promise<void> {
    const [human, hero, skeleton, oak, oakLod] = await Promise.all(['human', 'human_hd', 'skeleton', 'oak', 'oak_lod'].map(loadGlb));
    const kb = (b: number) => `${(b / 1024).toFixed(0)} KB glb`;

    // Humans: the farmer (code), the Blender villager and the detailed militiaman, walking like bandits do.
    const banditClips = clipsFor('grunt', 'bandit');
    const farmerMat = createModelMaterial();
    const farmer = new CodeRig(buildPerson('farmer', farmerMat), farmerMat);
    const humanMat = createModelMaterial();
    adoptGameMaterial(human.mesh, humanMat);
    const villager = new GlbRig(human.root, human.mesh as SkinnedMesh, humanMat);
    // The detailed one keeps Blender's smooth normals, as Warcraft's models were smooth-shaded.
    const heroMat = createModelMaterial();
    heroMat.flatShading = false;
    adoptGameMaterial(hero.mesh, heroMat);
    const militia = new GlbRig(hero.root, hero.mesh as SkinnedMesh, heroMat);
    this.stand(farmer, banditClips, [-2.75, STAGE_Z], ['TODAY: FARMER', `${farmer.triangles} tris`, 'built in code at load']);
    this.stand(villager, banditClips, [-1.85, STAGE_Z], ['BLENDER: HUMAN', `${villager.triangles} tris`, kb(human.bytes)]);
    this.stand(militia, banditClips, [-0.95, STAGE_Z], ['BLENDER: DETAILED', `${militia.triangles} tris, smooth`, kb(hero.bytes)]);

    // Skeletons: grunt v0 (code) and the Blender grunt, same clips.
    const undeadClips = clipsFor('grunt', 'undead');
    const gruntMat = createModelMaterial();
    const grunt = new CodeRig(buildCharacter('grunt', { material: gruntMat, family: 'undead', variant: 0 }).rig, gruntMat);
    const skelMat = createModelMaterial();
    adoptGameMaterial(skeleton.mesh, skelMat);
    const skel = new GlbRig(skeleton.root, skeleton.mesh as SkinnedMesh, skelMat);
    this.stand(grunt, undeadClips, [1.15, STAGE_Z], ['TODAY: GRUNT v0', `${grunt.triangles} tris`, 'built in code at load']);
    this.stand(skel, undeadClips, [2.1, STAGE_Z], ['BLENDER: SKELETON', `${skel.triangles} tris`, kb(skeleton.bytes)]);

    // Oaks: the forest's first oak prototype, the Blender oak and its far LOD.
    const codeOak = new Mesh(plantPrototypes().oak[0], sharedModelMaterial());
    adoptGameMaterial(oak.mesh, sharedModelMaterial());
    adoptGameMaterial(oakLod.mesh, sharedModelMaterial());
    this.tree(codeOak, -5.5, ['TODAY: FOREST OAK', `${triangles(codeOak.geometry)} tris`, 'built in code at load']);
    this.tree(oak.root, 0, ['BLENDER: OAK', `${triangles(oak.mesh.geometry)} tris`, kb(oak.bytes)]);
    this.tree(oakLod.root, 5.5, ['BLENDER: OAK, FAR LOD', `${triangles(oakLod.mesh.geometry)} tris`, kb(oakLod.bytes)]);
  }

  private stand(who: Posable, clips: Clip[], [x, z]: [number, number], label: string[]): void {
    const turntable = new Group();
    turntable.position.set(x, 0, z);
    turntable.add(who.object);
    const panel = new TextPanel(0.8);
    panel.mesh.position.set(x, 2.25, z);
    this.root.add(turntable, panel.mesh);
    this.stands.push({ who, clips, panel, label, turntable });
  }

  private tree(obj: Object3D, x: number, label: string[]): void {
    obj.position.set(x, 0, TREE_Z);
    const panel = new TextPanel(2.4);
    panel.mesh.position.set(x, 8.2, TREE_Z);
    panel.draw(label);
    this.root.add(obj, panel.mesh);
  }

  private turn(radians: number): void {
    for (const s of this.stands) s.turntable.rotation.y += radians;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const k = e.key.toLowerCase();
    if (!down) {
      this.keys.delete(k);
      return;
    }
    this.keys.add(k);
    if (e.repeat) return;
    if (k === 'arrowdown') this.nextClip(1);
    if (k === 'arrowup') this.nextClip(-1);
    if (k === ' ') {
      this.playing = !this.playing;
      e.preventDefault();
    }
    if (k === 't') this.spinning = !this.spinning;
    if (k === 'r') for (const s of this.stands) s.turntable.rotation.y = 0;
  }

  nextClip(step: number): void {
    const n = this.stands[0]?.clips.length ?? 1;
    this.clip = (((this.clip + step) % n) + n) % n;
    this.time = 0;
  }

  update(dt: number): void {
    this.input.update();
    const { left, right } = this.input.hands;
    if (Math.abs(left.stickY) > 0.6 && !this.flicked) {
      this.flicked = true;
      this.nextClip(Math.sign(left.stickY));
    } else if (Math.abs(left.stickY) < 0.3) this.flicked = false;
    if (Math.abs(right.stickX) > 0.15) this.turn(right.stickX * dt * 2);
    if (right.primaryPressed) this.playing = !this.playing;
    if (right.secondaryPressed) this.spinning = !this.spinning;
    if (this.keys.has('q')) this.turn(-dt * 2);
    if (this.keys.has('e')) this.turn(dt * 2);
    if (this.spinning) this.turn(dt * 0.4);

    const first = this.stands[0];
    if (!first) return;
    const d = first.clips[this.clip].duration;
    if (this.playing) this.time = (this.time + dt) % d;
    for (const s of this.stands) {
      const clip = s.clips[Math.min(this.clip, s.clips.length - 1)];
      const frame = clip.sample(this.time % clip.duration, this.pose);
      s.who.apply(frame.pose);
      s.who.setHipOffset(0, frame.hipY, 0);
      const tele = s.who.material.telegraph;
      if (frame.telegraph > 0 && clip.attack) tele.copy(clip.attack.blockable ? _block : _unblock).multiplyScalar(frame.telegraph);
      else tele.setRGB(0, 0, 0);
      s.panel.draw([...s.label, `${clip.name}  ${frame.phase}`]);
    }
    this.help.draw([
      'BLENDER EXPERIMENT',
      `animation: ${first.clips[this.clip].name}   ${this.playing ? 'playing' : 'PAUSED'}`,
      `turntable ${this.spinning ? 'spinning' : 'still'}`,
      '',
      'L stick ▴▾ animation   R stick ◂▸ turn',
      'A play/pause   B spin',
      'keys: ▴▾  space  T  Q/E  R, drag to turn',
    ]);
  }
}
