import {
  BufferGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  RingGeometry,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { buildCharacter, type EnemyKind, FAMILIES, type Family, type FamilyDef, type Fighter, type WeaponSpec } from '../models/characters';
import { createModelMaterial, type ModelMaterial } from '../models/materials';
import { buildPerson, PEOPLE, type PersonId } from '../models/people';
import type { Rig } from '../models/rig';
import { XRInput } from '../player/input';
import { TextPanel } from '../ui/panel';
import { CAST, type CastId, Wardrobe } from '../people/cast';
import { castClips, type Clip, clipsFor, type MutablePose, personClips } from './clips';

// `?inspect`: a turntable for every character. One at a time on a plinth in
// front of you, looping any of its animations with the game's timings, with a
// metre ruler beside it and optional guides (weapon segment, arrow line).
// Works in the headset and on the desktop page.

export type InspectorEntry =
  /** An enemy: its behaviour, its family's body, and which of its looks (or which of its named fighters). */
  | { kind: EnemyKind; family: Family; variant: number; named?: string; label: string }
  /** A friendly character: Hale or one of Oakvale's villagers. */
  | { person: PersonId; label: string }
  /** One of the cast a zone places as a villager, beyond Oakvale's (people/cast.ts). */
  | { cast: CastId; label: string };

/** Each look of every enemy family's fighters ("Grunt v0" to "v5", "Archer"), then its named fighters ("Captain Silas Crake"). */
const enemies = (Object.keys(FAMILIES) as Family[]).flatMap((family) => [
  ...(Object.entries(FAMILIES[family].fights) as [EnemyKind, Fighter][]).flatMap(([kind, f]) =>
    Array.from({ length: f.looks }, (_, variant) => ({ kind, family, variant, label: f.looks > 1 ? `${f.label} v${variant}` : f.label })),
  ),
  ...Object.entries((FAMILIES[family] as FamilyDef).named ?? {}).map(([named, f]) => ({ kind: f.kind, family, variant: 0, named, label: f.label })),
]);

/**
 * Every model the game builds: each enemy family's (the undead's grunts in
 * six helmet, cloth and weapon combos, the bandits' thugs in six looks and
 * weapons, and so on), then Marshal Hale and the villagers, then the rest of
 * the cast zones place.
 */
export const ENTRIES: InspectorEntry[] = [
  ...enemies,
  ...(Object.keys(PEOPLE) as PersonId[]).map((id) => ({ person: id, label: PEOPLE[id].label })),
  ...(Object.keys(CAST) as CastId[]).filter((id) => !(id in PEOPLE)).map((id) => ({ cast: id, label: CAST[id].label })),
];

export const SPEEDS = [1, 0.5, 0.25, 0.1];
const STAGE_Z = -1.8;
const MIN_SCALE = 0.2;
const MAX_SCALE = 3;
const FLICK_ON = 0.6;
const FLICK_OFF = 0.3;

const _telegraphBlock = new Color(1.0, 0.45, 0.05);
const _telegraphUnblock = new Color(1.0, 0.05, 0.02);
const _a = new Vector3();
const _b = new Vector3();

interface Built {
  rig: Rig;
  /** What it strikes with; friendly characters strike with nothing. */
  weapon: WeaponSpec | null;
  material: ModelMaterial;
  clips: Clip[];
}

export class Inspector {
  readonly root = new Group();
  /** Scaled with the model, so the ruler always reads the model's own metres. */
  private readonly scaled = new Group();
  private readonly turntable = new Group();
  private readonly guides = new Group();
  private readonly weaponLine = segmentLine(0x40e0ff);
  private readonly arrowLine = segmentLine(0xff4080);
  private readonly panel: TextPanel;
  private readonly input: XRInput;
  private readonly built = new Map<number, Built>();
  private readonly pose: MutablePose = {};
  private readonly keys = new Set<string>();
  private readonly flicks = { left: { x: false, y: false }, right: { x: false, y: false } };

  entry = 0;
  clip = 0;
  time = 0;
  speed = 0;
  playing = true;
  showGuides = true;
  private phase = '';

  constructor(renderer: WebGLRenderer) {
    this.root.name = 'inspector';
    this.root.add(new HemisphereLight(0xb8c4e8, 0x2a2018, 1.4));
    const key = new DirectionalLight(0xffe2c0, 2.2);
    key.position.set(1.5, 3, 1);
    const rim = new DirectionalLight(0x6a90ff, 1.2);
    rim.position.set(-2, 2.5, -3);
    this.root.add(key, rim);

    const stage = new Group();
    stage.position.z = STAGE_Z;
    stage.add(this.scaled);
    this.scaled.add(this.turntable, buildPlinth(), buildRuler());
    this.guides.add(this.weaponLine, this.arrowLine);
    this.root.add(stage, this.guides);

    this.panel = new TextPanel();
    this.panel.mesh.position.set(-1.1, 1.45, -1.25);
    this.panel.mesh.rotation.y = 0.65;
    this.root.add(this.panel.mesh);

    const hands = new Group();
    this.root.add(hands);
    this.input = new XRInput(renderer, hands);

    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
    addEventListener('blur', () => this.keys.clear());
    let dragX: number | null = null;
    renderer.domElement.addEventListener('pointerdown', (e) => (dragX = e.clientX));
    addEventListener('pointerup', () => (dragX = null));
    addEventListener('pointermove', (e) => {
      if (dragX === null) return;
      this.turntable.rotation.y += (e.clientX - dragX) * 0.01;
      dragX = e.clientX;
    });

    this.show(0);
  }

  get current(): Built {
    return this.model(this.entry);
  }

  private model(index: number): Built {
    let b = this.built.get(index);
    if (!b) {
      const e = ENTRIES[index];
      const material = createModelMaterial();
      if ('person' in e) b = { rig: buildPerson(e.person, material), weapon: null, material, clips: personClips(e.person) };
      else if ('cast' in e) b = { rig: new Wardrobe().dress(e.cast, material), weapon: null, material, clips: castClips(e.cast) };
      else {
        const { rig, weapon } = buildCharacter(e.kind, { material, family: e.family, variant: e.variant, named: e.named });
        b = { rig, weapon, material, clips: clipsFor(e.kind, e.family, e.named) };
      }
      this.built.set(index, b);
    }
    return b;
  }

  /** Switch model, keeping the same animation by name when it has one. */
  show(index: number): void {
    const n = ENTRIES.length;
    const name = this.built.size ? this.current.clips[this.clip]?.name : undefined;
    this.turntable.remove(this.current.rig.mesh);
    this.entry = ((index % n) + n) % n;
    const found = this.current.clips.findIndex((c) => c.name === name);
    this.clip = Math.max(0, found);
    this.time = 0;
    this.turntable.add(this.current.rig.mesh);
  }

  playClip(index: number): void {
    const n = this.current.clips.length;
    this.clip = ((index % n) + n) % n;
    this.time = 0;
  }

  reset(): void {
    this.turntable.rotation.y = 0;
    this.scaled.scale.setScalar(1);
  }

  private rotate(radians: number): void {
    this.turntable.rotation.y += radians;
  }

  private zoom(factor: number): void {
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scaled.scale.x * factor));
    this.scaled.scale.setScalar(s);
  }

  private step(seconds: number): void {
    this.playing = false;
    const d = this.current.clips[this.clip].duration;
    this.time = (((this.time + seconds) % d) + d) % d;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (!down) {
      this.keys.delete(e.key.toLowerCase());
      return;
    }
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (e.repeat) return;
    switch (k) {
      case 'arrowright':
        return this.show(this.entry + 1);
      case 'arrowleft':
        return this.show(this.entry - 1);
      case 'arrowdown':
        return this.playClip(this.clip + 1);
      case 'arrowup':
        return this.playClip(this.clip - 1);
      case ' ':
        this.playing = !this.playing;
        return e.preventDefault();
      case 'f':
        this.speed = (this.speed + 1) % SPEEDS.length;
        return;
      case 'r':
        return this.reset();
      case 'g':
        this.showGuides = !this.showGuides;
        return;
      case '[':
        return this.step(-1 / 30);
      case ']':
        return this.step(1 / 30);
    }
  }

  /** Edge-triggered stick flick along one axis: -1, 0 or 1. */
  private flick(hand: 'left' | 'right', axis: 'x' | 'y', value: number): number {
    const f = this.flicks[hand];
    if (f[axis]) {
      if (Math.abs(value) < FLICK_OFF) f[axis] = false;
      return 0;
    }
    if (Math.abs(value) < FLICK_ON) return 0;
    f[axis] = true;
    return Math.sign(value);
  }

  private handleInput(dt: number): void {
    this.input.update();
    const { left, right } = this.input.hands;

    // Left stick: flick sideways for the next model, up/down for the next animation.
    const m = this.flick('left', 'x', left.stickX);
    if (m) this.show(this.entry + m);
    const a = this.flick('left', 'y', left.stickY);
    if (a) this.playClip(this.clip + a); // stick down (+Y) = next

    // Right stick: turn the model and scale it. Hold grip to scrub time instead.
    if (right.squeeze > 0.5) {
      if (Math.abs(right.stickX) > 0.15) this.step(right.stickX * dt * 0.5);
    } else if (Math.abs(right.stickX) > 0.15) this.rotate(right.stickX * dt * 2);
    if (Math.abs(right.stickY) > 0.15) this.zoom(Math.exp(-right.stickY * dt));

    if (right.primaryPressed) this.playing = !this.playing; // A
    if (right.secondaryPressed) this.speed = (this.speed + 1) % SPEEDS.length; // B
    if (left.primaryPressed) this.reset(); // X
    if (left.secondaryPressed) this.showGuides = !this.showGuides; // Y

    // Desktop keys held down.
    if (this.keys.has('q')) this.rotate(-dt * 2);
    if (this.keys.has('e')) this.rotate(dt * 2);
    if (this.keys.has('=') || this.keys.has('+')) this.zoom(Math.exp(dt));
    if (this.keys.has('-')) this.zoom(Math.exp(-dt));
  }

  update(dt: number): void {
    this.handleInput(dt);
    const b = this.current;
    const clip = b.clips[this.clip];
    if (this.playing) this.time = (this.time + dt * SPEEDS[this.speed]) % clip.duration;

    const frame = clip.sample(this.time, this.pose);
    b.rig.apply(frame.pose);
    b.rig.setHipOffset(0, frame.hipY, 0);
    const tele = b.material.telegraph;
    if (frame.telegraph > 0 && clip.attack) {
      tele.copy(clip.attack.blockable ? _telegraphBlock : _telegraphUnblock).multiplyScalar(frame.telegraph);
    } else tele.setRGB(0, 0, 0);
    this.phase = frame.phase;

    this.root.updateMatrixWorld(true);
    this.updateGuides(b, clip);
    this.panel.draw(this.describe(b, clip));
  }

  private updateGuides(b: Built, clip: Clip): void {
    this.guides.visible = this.showGuides;
    if (!this.showGuides) return;
    const bones = b.rig.bones;
    const w = b.weapon;
    this.weaponLine.visible = w !== null;
    if (w) {
      _a.set(...w.base).applyMatrix4(bones[w.bone].matrixWorld);
      _b.set(...w.tip).applyMatrix4(bones[w.bone].matrixWorld);
      setSegment(this.weaponLine, _a, _b);
    }
    // Where a nocked arrow points: string hand through bow hand (Enemy.nock), 8 m on.
    const shot = clip.attack?.kind === 'shot';
    this.arrowLine.visible = shot;
    if (shot) {
      _a.set(0, -0.06, 0.02).applyMatrix4(bones.handR.matrixWorld);
      _b.set(0, -0.06, 0).applyMatrix4(bones.handL.matrixWorld);
      _b.sub(_a).normalize().multiplyScalar(8).add(_a);
      setSegment(this.arrowLine, _a, _b);
    }
  }

  private describe(b: Built, clip: Clip): string[] {
    const e = ENTRIES[this.entry];
    const a = clip.attack;
    const timing = a ? `wind ${a.windup}s  swing ${a.active}s  recover ${a.recover}s` : '';
    const height = b.rig.proportions.hipY / 0.92;
    const tris = b.rig.triangles;
    return [
      `${e.label.toUpperCase()}   ${this.entry + 1}/${ENTRIES.length}   ×${height.toFixed(2)} height   ${tris} tris`,
      `${clip.name}   ${this.clip + 1}/${b.clips.length}   ${this.phase}`,
      `${this.time.toFixed(2)} / ${clip.duration.toFixed(2)} s   ${timing}`,
      `${this.playing ? 'playing' : 'PAUSED'}  ${SPEEDS[this.speed]}x   scale ${this.scaled.scale.x.toFixed(2)}   guides ${this.showGuides ? 'on' : 'off'}`,
      '',
      'L stick ◂▸ model   ▴▾ animation',
      'R stick ◂▸ turn   ▴▾ scale   grip+◂▸ scrub',
      'A play/pause   B speed   X reset   Y guides',
      'keys: arrows  Q/E  +/-  space  F  R  G  [ ]',
    ];
  }
}

// ------------------------------------------------------------ props

function segmentLine(color: number): Line {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(6), 3));
  const line = new Line(geo, new LineBasicMaterial({ color, depthTest: false }));
  line.renderOrder = 10;
  line.frustumCulled = false;
  return line;
}

function setSegment(line: Line, a: Vector3, b: Vector3): void {
  const pos = line.geometry.getAttribute('position') as Float32BufferAttribute;
  pos.setXYZ(0, a.x, a.y, a.z);
  pos.setXYZ(1, b.x, b.y, b.z);
  pos.needsUpdate = true;
}

function buildPlinth(): Group {
  const g = new Group();
  const disc = new Mesh(new CircleGeometry(1.1, 48), new MeshLambertMaterial({ color: 0x2a2530 }));
  disc.rotation.x = -Math.PI / 2;
  const ring = new Mesh(new RingGeometry(1.08, 1.12, 48), new MeshBasicMaterial({ color: 0x806a40 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  // A notch at the front edge shows which way the model faces at rotation 0.
  const notch = new Mesh(new PlaneGeometry(0.06, 0.2), new MeshBasicMaterial({ color: 0xe0b060 }));
  notch.rotation.x = -Math.PI / 2;
  notch.position.set(0, 0.003, 1.0);
  g.add(disc, ring, notch);
  return g;
}

/** A 3 m pole beside the plinth: a tick every 25 cm, a long one every metre. */
function buildRuler(): Group {
  const g = new Group();
  g.position.set(1.0, 0, -0.3);
  const mat = new MeshBasicMaterial({ color: 0xd9cfb0 });
  const pole = new Mesh(new PlaneGeometry(0.012, 3), mat);
  pole.position.y = 1.5;
  g.add(pole);
  for (let i = 0; i <= 12; i++) {
    const big = i % 4 === 0;
    const tick = new Mesh(new PlaneGeometry(big ? 0.14 : 0.06, big ? 0.012 : 0.006), mat);
    tick.position.set(big ? -0.07 : -0.03, i * 0.25, 0);
    g.add(tick);
  }
  g.rotation.y = -0.4; // angled toward the viewer
  return g;
}
