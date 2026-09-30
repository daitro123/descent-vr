// PROTOTYPE (abilities ticket 07, "Using abilities by gesture"): throwaway code
// kept on main so Tom can try it on the headset. `?arena&class=<warrior|ranger|mage>&gestures`
// puts gesture abilities over the arena and the class prototype as they are;
// without `&gestures` none of this loads.
//
// Hold the right grip, draw, let go: the stroke is read once, on release
// (gestureRecorder, gestureMatcher). The right grip arms in every class, since
// the ranger's and the mage's left grip is their ward and the warrior's shield
// hand blocks by habit. Each class binds the vocabulary's gestures to
// placeholder abilities: a coloured burst, a sound and a buzz naming the
// gesture, paid for in rage, focus or mana (ticket 09). The ranger and the
// mage also have a button ability on A/X; the warrior keeps the War Cry there.
//
// Four modes, stepped by clicking the right stick (the class prototypes' own
// variant cycling is off while this runs):
//   FIGHT   gestures cast; the panel counts casts and misses.
//   DRILL   the fight holds still; the panel names a gesture, you draw it,
//           and it counts how many were read right.
//   JUNK    the fight holds still; the panel names a move of normal play
//           (a sword swing, a bow draw, a thrown bolt) to make with the grip
//           held, and counts how many fired a gesture by mistake.
//   RECORD  the fight holds still; draw the named gesture and it becomes one
//           of its templates (three each, then the next; the left stick's click
//           skips, A/X forgets that gesture's recordings). They're kept in
//           this browser and logged to the console as JSON.
// Clicking the left stick steps the vocabulary (A mixed, B flicks, C shapes;
// `&vocab=A|B|C` starts on one). The panel floats low on your left.

import {
  BufferAttribute,
  BufferGeometry,
  Line,
  LineBasicMaterial,
  Quaternion,
  type Scene,
  Vector3,
} from 'three';
import { sfx } from '../../fx/sfx';
import type { Game } from '../../game';
import { TextPanel } from '../../ui/panel';
import type { ClassPrototype } from '../classPrototypes';
import { bench, buildModels, CLASS_JUNK, JUNK } from './gestureBench.prototype';
import { classify, features, type Features, type GestureModel, type Stroke, type Verdict } from './gestureMatcher.prototype';
import { ARM, GestureRecorder, type RecorderEvent } from './gestureRecorder.prototype';
import {
  type Ability,
  bindings,
  CLASSES,
  type ClassName,
  DEFAULT_VOCABULARY,
  GESTURES,
  type Vocabulary,
  VOCABULARIES,
} from './gestureVocab.prototype';

export type Mode = 'fight' | 'drill' | 'junk' | 'record';
const MODES: Mode[] = ['fight', 'drill', 'junk', 'record'];

/** Where recordings are kept in this browser. Throwaway, like the rest. */
const STORE = 'descent-PROTOTYPE-gesture-recordings';
/** Recordings a gesture takes in RECORD mode before moving on. */
const PER_GESTURE = 3;
/** Focus: starts full and refills 10 a second (ticket 09). */
const FOCUS = { max: 100, regen: 10 };

const BUZZ = {
  armed: { intensity: 0.25, ms: 20 },
  read: { intensity: 0.9, ms: 80 },
  miss: { intensity: 0.3, ms: 30 },
  poor: { intensity: 0.15, ms: 60 },
};

/** A sound per ability, so each is told apart without looking. */
const SOUNDS: ((at: Vector3) => void)[] = [
  (at) => sfx.bash(at),
  () => sfx.parry(),
  (at) => sfx.clash(at),
  () => sfx.pickup(),
  (at) => sfx.rise(at),
];

/** What the class prototype underneath may have: the ranger's bow, the mage's mana. */
interface Inner extends ClassPrototype {
  bow?: { nocked: boolean };
  mana?: number;
}

const _hand = new Vector3();
const _head = new Vector3();
const _gaze = new Vector3();
const _p = new Vector3();
const _q = new Quaternion();

export class GestureKit implements ClassPrototype {
  mode: Mode = 'fight';
  vocab: Vocabulary;
  focus = FOCUS.max;
  readonly recorder = new GestureRecorder();
  /** Strokes Tom recorded, by gesture. */
  recordings: Record<string, Stroke[]> = {};
  /** The last stroke's outcome, for the panel and the scripted check. */
  last: { event: RecorderEvent['kind']; verdict?: Verdict; cast?: string; poor?: boolean; reason?: string } | null = null;
  readonly stats = {
    fight: { casts: {} as Record<string, number>, misses: 0, poor: 0, dropped: 0, taken: 0, button: 0 },
    drill: { tries: 0, right: 0, wrong: 0, missed: 0 },
    junk: { strokes: 0, fired: 0 },
  };
  private models: GestureModel[] = [];
  private prompt = 0;
  private recordedThis = 0;
  private readonly panel = new TextPanel(0.4);
  private panelTimer = 0;
  private panelYaw = Number.NaN;
  private readonly trail: Line<BufferGeometry, LineBasicMaterial>;
  private readonly trailPoints = new Float32Array(ARM.capacity * 3);
  private trailFade = 0;
  private wave = 0;

  constructor(
    private readonly game: Game,
    scene: Scene,
    readonly cls: ClassName,
    private readonly inner: Inner | null,
    vocab: Vocabulary['id'],
  ) {
    this.vocab = VOCABULARIES.find((v) => v.id === vocab) ?? VOCABULARIES[0];
    this.recordings = load();
    this.rebuild();
    scene.add(this.panel.mesh);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.trailPoints, 3));
    geometry.setDrawRange(0, 0);
    this.trail = new Line(geometry, new LineBasicMaterial({ color: 0xd8d0c0, transparent: true, opacity: 0.6 }));
    this.trail.frustumCulled = false;
    game.player.rig.add(this.trail);
  }

  /** The gestures in use now, each with its ability. */
  get bound(): { gesture: (typeof GESTURES)[string]; ability: Ability }[] {
    return bindings(this.cls, this.vocab);
  }

  get resource(): number {
    if (this.cls === 'warrior') return this.game.player.rage;
    if (this.cls === 'mage') return this.inner?.mana ?? 0;
    return this.focus;
  }

  private spend(cost: number): boolean {
    if (this.resource < cost) return false;
    if (this.cls === 'warrior') this.game.player.rage -= cost;
    else if (this.cls === 'mage' && this.inner) this.inner.mana = (this.inner.mana ?? 0) - cost;
    else this.focus -= cost;
    return true;
  }

  /** Templates for the gestures in use, plus Tom's recordings of them. */
  private rebuild(): void {
    const recorded: Record<string, Features[]> = {};
    for (const [id, strokes] of Object.entries(this.recordings)) recorded[id] = strokes.map(features);
    this.models = buildModels(
      this.bound.map((b) => b.gesture.id),
      recorded,
    );
  }

  update(dt: number): void {
    const { game } = this;
    const { player } = game;
    const { left, right } = player.input.hands;
    if (game.wave < this.wave) this.focus = FOCUS.max; // the run began again
    this.wave = game.wave;

    // The sticks' clicks are this prototype's while it runs, not the class prototype's.
    if (right.stickPressed) this.setMode(MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]);
    if (left.stickPressed) {
      if (this.mode === 'record') this.nextPrompt();
      else this.setVocab(VOCABULARIES[(VOCABULARIES.indexOf(this.vocab) + 1) % VOCABULARIES.length]);
    }
    right.stickPressed = left.stickPressed = false;
    this.inner?.update(dt);

    if (this.mode !== 'fight') {
      // The fight holds still (enemies freeze as in a hit-stop) and nothing hurts.
      (game as unknown as { hitStop: number }).hitStop = 0.1;
      player.hp = player.maxHp;
    }
    if (this.cls === 'ranger') this.focus = Math.min(FOCUS.max, this.focus + FOCUS.regen * dt);
    if (left.primaryPressed || right.primaryPressed) this.button();

    right.grip.getWorldPosition(_hand);
    player.headPosition(_head);
    player.camera.getWorldDirection(_gaze);
    const { rig } = player;
    rig.worldToLocal(_hand);
    rig.worldToLocal(_head);
    _gaze.applyQuaternion(_q.copy(rig.quaternion).invert());
    const busy = this.cls === 'ranger' ? !!this.inner?.bow?.nocked : this.cls === 'mage' ? right.trigger > 0.35 : false;
    const event = this.recorder.update({
      hand: _hand,
      head: _head,
      gaze: _gaze,
      squeeze: right.squeeze,
      tracked: right.grip.visible && player.alive,
      busy,
      dt,
    });
    if (this.recorder.armed) this.drawTrail();
    if (event) this.onEvent(event);
    this.fadeTrail(dt);
    this.updatePanel(dt);
  }

  setMode(mode: Mode): void {
    this.mode = mode;
    this.recorder.cancel();
    this.prompt = 0;
    this.recordedThis = 0;
    this.panelTimer = 0;
    this.game.text.banner(this.game.player.camera, `GESTURES: ${mode.toUpperCase()}`, '#e0c080', 0.14, 0.2, 2.5);
    if (mode !== 'fight') this.game.text.banner(this.game.player.camera, this.promptLine(), '#d8d0c0', 0.08, 0.05, 4);
  }

  setVocab(vocab: Vocabulary): void {
    this.vocab = vocab;
    this.rebuild();
    this.prompt = 0;
    this.panelTimer = 0;
    this.game.text.banner(this.game.player.camera, `VOCABULARY ${vocab.id}: ${vocab.name}`, '#e0c080', 0.1, 0.2, 3);
  }

  private onEvent(e: RecorderEvent): void {
    const { input } = this.game.player;
    if (e.kind === 'armed') {
      input.pulse('right', BUZZ.armed.intensity, BUZZ.armed.ms);
      this.trailFade = 0;
      this.trail.material.color.setHex(0xd8d0c0);
      return;
    }
    if (e.kind === 'taken') {
      // The grip belongs to the bag, a potion or the tool loop: not ours.
      if (this.mode === 'fight') this.stats.fight.taken++;
      this.last = { event: 'taken', reason: e.place };
      return;
    }
    if (e.kind === 'dropped') {
      this.last = { event: 'dropped', reason: e.reason };
      this.endTrail(0x806050);
      if (this.mode === 'fight') this.stats.fight.dropped++;
      if (this.mode === 'junk') this.junkStroke(false);
      return;
    }
    const verdict = classify(e.stroke, this.models);
    this.last = { event: 'stroke', verdict };
    if (this.mode === 'fight') this.fight(verdict);
    else if (this.mode === 'drill') this.drill(verdict);
    else if (this.mode === 'junk') this.junkStroke(!!verdict.id, verdict);
    else this.record(e.stroke, verdict);
  }

  // ---------------------------------------------------------------- the modes

  private fight(v: Verdict): void {
    const bound = this.bound.find((b) => b.gesture.id === v.id);
    if (!bound) {
      this.stats.fight.misses++;
      this.miss();
      return;
    }
    const { gesture, ability } = bound;
    if (!this.spend(ability.cost)) {
      this.stats.fight.poor++;
      this.last = { ...this.last!, poor: true };
      this.say(`${gesture.name}: not enough ${CLASSES[this.cls].resource}`, '#8090a0');
      this.endTrail(0x606878);
      this.game.player.input.pulse('right', BUZZ.poor.intensity, BUZZ.poor.ms);
      return;
    }
    this.stats.fight.casts[gesture.id] = (this.stats.fight.casts[gesture.id] ?? 0) + 1;
    this.last = { ...this.last!, cast: gesture.id };
    this.burst(gesture.name, ability, this.bound.indexOf(bound));
  }

  private drill(v: Verdict): void {
    const want = this.bound[this.prompt % this.bound.length];
    const d = this.stats.drill;
    d.tries++;
    if (v.id === want.gesture.id) {
      d.right++;
      this.burst(want.gesture.name, want.ability, this.prompt % this.bound.length, false);
    } else if (v.id) {
      d.wrong++;
      this.say(`read ${GESTURES[v.id].name}, not ${want.gesture.name}`, '#ff8060');
      this.endTrail(0xff6040);
      this.game.player.input.pulse('right', BUZZ.miss.intensity, BUZZ.miss.ms);
    } else {
      d.missed++;
      this.miss();
    }
    this.nextPrompt();
  }

  private junkStroke(fired: boolean, v?: Verdict): void {
    const j = this.stats.junk;
    j.strokes++;
    if (fired && v?.id) {
      j.fired++;
      this.say(`fired ${GESTURES[v.id].name} by mistake`, '#ff8060');
      this.endTrail(0xff6040);
      this.game.player.input.pulse('right', BUZZ.read.intensity, BUZZ.read.ms);
    } else {
      this.say('nothing: good', '#9fe0a0');
      this.endTrail(0x60a060);
    }
    this.nextPrompt();
  }

  private record(stroke: Stroke, v: Verdict): void {
    const want = this.bound[this.prompt % this.bound.length].gesture;
    if (features(stroke).length < 0.1) {
      this.say('too small to keep', '#ff8060');
      this.endTrail(0xff6040);
      return;
    }
    (this.recordings[want.id] ??= []).push(stroke);
    save(this.recordings);
    this.rebuild();
    this.recordedThis++;
    const read = v.id === want.id ? 'it already read right' : v.id ? `it read ${GESTURES[v.id].name}` : 'it read nothing';
    this.say(`kept ${want.name} ${this.recordings[want.id].length} (${read})`, '#9fe0a0');
    this.endTrail(0x60c0ff);
    this.game.player.input.pulse('right', BUZZ.read.intensity, BUZZ.read.ms);
    console.log(`[gestures] recorded ${want.id}`, JSON.stringify(stroke));
    if (this.recordedThis >= PER_GESTURE) this.nextPrompt();
  }

  /** A/X: the class's button ability in a fight; in RECORD, forget the named gesture's recordings. */
  private button(): void {
    if (this.mode === 'record') {
      const want = this.bound[this.prompt % this.bound.length].gesture;
      delete this.recordings[want.id];
      save(this.recordings);
      this.rebuild();
      this.recordedThis = 0;
      this.say(`forgot the recordings of ${want.name}`, '#e0c080');
      return;
    }
    const ability = CLASSES[this.cls].button;
    if (!ability || this.mode !== 'fight') return;
    if (!this.spend(ability.cost)) {
      this.say(`A/X: not enough ${CLASSES[this.cls].resource}`, '#8090a0');
      this.game.player.input.pulse('right', BUZZ.poor.intensity, BUZZ.poor.ms);
      return;
    }
    this.stats.fight.button++;
    this.burst('A/X', ability, -1);
  }

  private nextPrompt(): void {
    this.prompt++;
    this.recordedThis = 0;
    this.panelTimer = 0;
    this.game.text.banner(this.game.player.camera, this.promptLine(), '#d8d0c0', 0.08, 0.05, 3);
  }

  private promptLine(): string {
    if (this.mode === 'junk') {
      const junk = CLASS_JUNK[this.cls];
      return `grip held: ${JUNK[junk[this.prompt % junk.length]].ask}`;
    }
    const g = this.bound[this.prompt % this.bound.length].gesture;
    return `${this.mode === 'record' ? 'record' : 'draw'} ${g.name}: ${g.how}`;
  }

  // ---------------------------------------------------------------- feedback

  /** The placeholder ability: a coloured burst at the hand, a ring at your feet in a fight, its sound and a strong buzz. */
  private burst(name: string, ability: Ability, slot: number, spent = true): void {
    const { game } = this;
    const { player } = game;
    player.input.hands.right.grip.getWorldPosition(_p);
    game.particles.burst('magic', _p, 28, undefined, ability.hex);
    if (this.mode === 'fight') game.combat.fx.shockwaves.trigger(player.feetPosition(new Vector3()), 1.2, ability.hex, 0.3);
    const cost = spent ? `  -${ability.cost} ${CLASSES[this.cls].resource}` : '';
    game.text.spawn(`${name}: ${ability.colour}${cost}`, _p.clone().setY(_p.y + 0.15), { color: `#${ability.hex.toString(16).padStart(6, '0')}`, scale: 0.12, life: 1.4 });
    (slot >= 0 ? SOUNDS[slot % SOUNDS.length] : (at: Vector3) => sfx.summon(at))(_p);
    player.input.pulse('right', BUZZ.read.intensity, BUZZ.read.ms);
    this.endTrail(ability.hex);
  }

  /** Nothing was read: a grey puff and a double tick. */
  private miss(): void {
    const { game } = this;
    game.player.input.hands.right.grip.getWorldPosition(_p);
    game.particles.burst('magic', _p, 6, undefined, 0x808080);
    game.text.spawn('?', _p.clone().setY(_p.y + 0.12), { color: '#a0a0a0', scale: 0.12 });
    const { input } = game.player;
    input.pulse('right', BUZZ.miss.intensity, BUZZ.miss.ms);
    setTimeout(() => input.pulse('right', BUZZ.miss.intensity, BUZZ.miss.ms), 90);
    this.endTrail(0x808080);
  }

  private say(text: string, color: string): void {
    const { game } = this;
    game.player.input.hands.right.grip.getWorldPosition(_p);
    game.text.spawn(text, _p.clone().setY(_p.y + 0.15), { color, scale: 0.08, life: 1.6 });
  }

  /** The stroke so far, as a faint line in rig space. */
  private drawTrail(): void {
    const r = this.recorder;
    // The recorder keeps body-frame points; the trail shows where the hand went, in rig space.
    const n = r.count;
    for (let i = 0; i < n; i++) {
      const [x, y, z] = r.point(i);
      this.bodyToRig(x, y, z, _p);
      this.trailPoints.set([_p.x, _p.y, _p.z], i * 3);
    }
    this.trail.geometry.setDrawRange(0, n);
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.material.opacity = 0.6;
    this.trail.visible = true;
  }

  /** Undo the recorder's body frame (see GestureRecorder.toBody). */
  private bodyToRig(x: number, y: number, z: number, out: Vector3): Vector3 {
    const f = this.recorder.frameOf();
    return out.set(f.origin.x + x * f.rx + z * f.rz, f.origin.y + y, f.origin.z + x * f.rz - z * f.rx);
  }

  private endTrail(hex: number): void {
    this.trail.material.color.setHex(hex);
    this.trailFade = 0.5;
  }

  private fadeTrail(dt: number): void {
    if (this.recorder.armed) return;
    this.trailFade = Math.max(0, this.trailFade - dt);
    this.trail.material.opacity = this.trailFade * 1.6;
    this.trail.visible = this.trailFade > 0;
  }

  // ---------------------------------------------------------------- the panel

  /** Low on your left, turning with you only once you've looked away. */
  private placePanel(): void {
    const { camera } = this.game.player;
    camera.getWorldPosition(_head);
    camera.getWorldDirection(_gaze);
    const want = Math.atan2(_gaze.x, _gaze.z);
    if (Number.isNaN(this.panelYaw)) this.panelYaw = want;
    let d = want - this.panelYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) > 0.6) this.panelYaw += d - Math.sign(d) * 0.6;
    const a = this.panelYaw + 0.55; // to the left of where you face
    this.panel.mesh.position.set(_head.x + Math.sin(a) * 0.55, _head.y - 0.42, _head.z + Math.cos(a) * 0.55);
    this.panel.mesh.lookAt(_head);
  }

  private updatePanel(dt: number): void {
    this.placePanel();
    this.panelTimer -= dt;
    if (this.panelTimer > 0) return;
    this.panelTimer = 0.25;
    const res = CLASSES[this.cls].resource;
    const lines = [`GESTURES ${this.mode.toUpperCase()} · ${this.cls} · ${this.vocab.id}`, `${res} ${Math.round(this.resource)} / 100`];
    // What each gesture costs, two or three to a line.
    let line = '';
    for (const x of this.bound) {
      const item = `${x.gesture.name.toLowerCase()} ${x.ability.cost}`;
      if (line && line.length + item.length + 3 > 40) {
        lines.push(line);
        line = item;
      } else line = line ? `${line} · ${item}` : item;
    }
    lines.push(line);
    if (this.mode === 'fight') {
      const f = this.stats.fight;
      const casts = Object.values(f.casts).reduce((s, n) => s + n, 0);
      lines.push(`cast ${casts}  missed ${f.misses}  short of ${res} ${f.poor}`);
      lines.push(this.lastLine());
    } else if (this.mode === 'drill') {
      const d = this.stats.drill;
      lines.push(`read right ${d.right}/${d.tries}${d.tries ? ` (${Math.round((100 * d.right) / d.tries)}%)` : ''}`);
      lines.push(`wrong ${d.wrong}  nothing ${d.missed}`);
      lines.push(this.promptLine().slice(0, 44));
    } else if (this.mode === 'junk') {
      const j = this.stats.junk;
      lines.push(`fired by mistake ${j.fired}/${j.strokes}${j.strokes ? ` (${Math.round((100 * j.fired) / j.strokes)}%)` : ''}`);
      lines.push(this.promptLine().slice(0, 44));
    } else {
      const want = this.bound[this.prompt % this.bound.length].gesture;
      lines.push(`${want.name}: ${(this.recordings[want.id] ?? []).length} recorded`);
      lines.push(want.how.slice(0, 44));
      lines.push('L-stick: next · A/X: forget these');
    }
    lines.push('', 'R-stick: mode · L-stick: vocabulary');
    this.panel.draw(lines);
  }

  private lastLine(): string {
    const l = this.last;
    if (!l) return 'hold the right grip, draw, let go';
    if (l.event === 'taken') return `grip at ${l.reason}`;
    if (l.event === 'dropped') return `dropped: ${l.reason}`;
    const v = l.verdict!;
    if (v.id) return `${GESTURES[v.id].name} ${l.poor ? '(short)' : ''} score ${v.score.toFixed(2)}`;
    return `nothing (${v.miss}${v.nearest ? `, nearest ${GESTURES[v.nearest].name} ${v.score.toFixed(2)}` : ''})`;
  }

  // ---------------------------------------------------------------- for the scripted check

  /** The bench over this class's gestures and normal play, `n` strokes each. */
  bench(n = 100, vocab = this.vocab): ReturnType<typeof bench> {
    return bench(
      bindings(this.cls, vocab).map((b) => b.gesture.id),
      CLASS_JUNK[this.cls],
      n,
    );
  }
}

function load(): Record<string, Stroke[]> {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Record<string, Stroke[]>) : {};
  } catch {
    return {};
  }
}

function save(recordings: Record<string, Stroke[]>): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(recordings));
  } catch {
    // Private mode or full: the recordings last until the page closes.
  }
}

/** `?arena&class=<name>&gestures` (src/prototype/classPrototypes.ts): gestures over the class kit. */
export function startGesturePrototype(game: Game, scene: Scene, cls: string, inner: ClassPrototype | null): GestureKit {
  const name: ClassName = cls === 'ranger' || cls === 'mage' ? cls : 'warrior';
  const param = new URLSearchParams(location.search).get('vocab')?.toUpperCase();
  const vocab = VOCABULARIES.find((v) => v.id === param)?.id ?? DEFAULT_VOCABULARY;
  return new GestureKit(game, scene, name, inner as Inner | null, vocab);
}
