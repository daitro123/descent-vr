import { BufferAttribute, BufferGeometry, Line, LineBasicMaterial, Quaternion, Vector3 } from 'three';
import { ABILITY, type Ability, type Shape, SHAPES, type Slots } from '../../classes';
import { ABILITY_COLOUR } from '../../combat/abilities';
import type { Aim, Use } from '../../combat/combat';
import { CONFIG } from '../../config';
import type { FloatingText } from '../../fx/floatingText';
import type { Particles } from '../../fx/particles';
import { sfx } from '../../fx/sfx';
import type { Player } from '../player';
import { classify, type Verdict } from './matcher';
import { GestureRecorder, type RecorderEvent } from './recorder';
import { densify, modelsOf, SHAPE } from './shapes';

// Abilities by gesture, in the arena and the Adventure alike
// (.scratch/abilities/spec.md, "Gestures"): hold the right grip, draw one of
// the shapes your slots hold, let go. The stroke is read once, on release
// (recorder.ts, matcher.ts), and the ability in that shape's slot is used.
//
// What you see and feel: a light tick as the grip arms, a faint trail behind
// the hand while you draw; on a read, the trail flashes the ability's colour,
// a burst of it leaves the hand with its own sound and a strong buzz, and its
// name floats up with what it cost. A miss is a grey puff, a "?" and two
// ticks, and costs nothing; so does a shape read that can't be paid for
// ("not enough rage") or isn't ready. A shape you've never drawn hangs faintly
// in the air in front of you until you draw it once.

/** What the gestures need from the game they're in. */
export interface GestureHost {
  readonly player: Player;
  readonly text: FloatingText;
  readonly particles: Particles;
  /** Which ability each shape holds now. */
  slots(): Slots;
  /** The shapes holding an ability that you've never drawn: the first hangs in the air. */
  unlearned(): readonly Shape[];
  /** A shape holding an ability was drawn and read. */
  drawn(shape: Shape): void;
  /** Use an ability (Combat.use). */
  use(ability: Ability, aim: Aim): Use;
  /** Gestures don't arm now: the bag is open, say. */
  held?(): boolean;
  /** The class's own attack is in the right hand (an arrow nocked, a bolt charging). */
  busy?(): boolean;
}

/** What came of the last stroke, for the scripted checks. */
export interface Last {
  readonly event: RecorderEvent['kind'];
  readonly verdict?: Verdict<Shape>;
  /** The ability the shape held, if it was read. */
  readonly ability?: Ability;
  readonly use?: Use;
  /** Why it was dropped, or where the grip was taken. */
  readonly reason?: string;
}

const MISS_GREY = 0x808080;
const TRAIL = 0xd8d0c0;
const DULL = 0x606878;
const DROPPED = 0x806050;

const _hand = new Vector3();
const _head = new Vector3();
const _gaze = new Vector3();
const _p = new Vector3();
const _q = new Quaternion();
const _base = new Vector3();
const _tip = new Vector3();
const _aim = { from: new Vector3(), hand: new Vector3(), gaze: new Vector3() };

export class Gestures {
  /** Off while something else has the right grip: the gesture prototype (`?arena&gestures`). */
  enabled = true;
  readonly recorder = new GestureRecorder();
  last: Last | null = null;
  /** Counts, for the scripted checks. */
  readonly stats = { casts: {} as Partial<Record<Ability, number>>, misses: 0, refused: 0, dropped: 0, taken: 0 };
  private readonly trail: Line<BufferGeometry, LineBasicMaterial>;
  private readonly trailPoints: Float32Array;
  private trailFade = 0;
  private readonly hint: Line<BufferGeometry, LineBasicMaterial>;
  private hintShape: Shape | null = null;
  private hintYaw = Number.NaN;

  constructor(private readonly host: GestureHost) {
    const { rig } = host.player;
    this.trailPoints = new Float32Array(Math.ceil(CONFIG.gestures.arm.maxDuration * 100) * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.trailPoints, 3));
    geometry.setDrawRange(0, 0);
    this.trail = new Line(geometry, new LineBasicMaterial({ color: TRAIL, transparent: true, opacity: CONFIG.gestures.trail.opacity }));
    this.trail.frustumCulled = false;
    this.trail.visible = false;
    rig.add(this.trail);
    this.hint = new Line(new BufferGeometry(), new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: CONFIG.gestures.hint.opacity, depthWrite: false }));
    this.hint.frustumCulled = false;
    this.hint.visible = false;
    rig.add(this.hint);
  }

  /** The shape hanging in the air, if any. */
  get hinted(): Shape | null {
    return this.hint.visible ? this.hintShape : null;
  }

  update(dt: number): void {
    const { player } = this.host;
    const slots = this.host.slots();
    const shapes = SHAPES.filter((s) => slots[s] !== null);
    const on = this.enabled && shapes.length > 0 && !this.host.held?.();
    if (!on) this.recorder.cancel();
    else {
      const right = player.input.hands.right;
      right.grip.getWorldPosition(_hand);
      player.headPosition(_head);
      player.camera.getWorldDirection(_gaze);
      const { rig } = player;
      rig.worldToLocal(_hand);
      rig.worldToLocal(_head);
      _gaze.applyQuaternion(_q.copy(rig.quaternion).invert());
      const event = this.recorder.update({
        hand: _hand,
        head: _head,
        gaze: _gaze,
        squeeze: right.squeeze,
        tracked: right.grip.visible && player.alive,
        busy: this.host.busy?.() ?? false,
        dt,
      });
      if (this.recorder.armed) this.drawTrail();
      if (event) this.onEvent(event, slots, shapes);
    }
    this.fadeTrail(dt);
    this.showHint(on ? this.host.unlearned()[0] ?? null : null);
  }

  private onEvent(e: RecorderEvent, slots: Slots, shapes: readonly Shape[]): void {
    const { input } = this.host.player;
    const B = CONFIG.gestures.buzz;
    switch (e.kind) {
      case 'armed':
        input.pulse('right', B.armed.intensity, B.armed.ms);
        this.trailFade = 0;
        this.trail.material.color.setHex(TRAIL);
        return;
      case 'taken':
        // The grip belongs to the bag, a potion or the tool loop: not ours.
        this.stats.taken++;
        this.last = { event: 'taken', reason: e.place };
        return;
      case 'dropped':
        this.stats.dropped++;
        this.last = { event: 'dropped', reason: e.reason };
        this.endTrail(DROPPED);
        return;
      case 'stroke':
        this.read(classify(e.stroke, modelsOf(shapes)), slots);
    }
  }

  /** A stroke was read: use what its shape's slot holds, or say why not. */
  private read(verdict: Verdict<Shape>, slots: Slots): void {
    const ability = verdict.id && slots[verdict.id];
    if (!verdict.id || !ability) {
      this.last = { event: 'stroke', verdict };
      this.stats.misses++;
      this.miss();
      return;
    }
    this.host.drawn(verdict.id);
    const use = this.host.use(ability, this.aim());
    this.last = { event: 'stroke', verdict, ability, use };
    if (use === 'cast') {
      this.stats.casts[ability] = (this.stats.casts[ability] ?? 0) + 1;
      this.cast(ability);
    } else {
      this.stats.refused++;
      this.refused(ability, use);
    }
  }

  /** From the right hand, along where it faces (the blade's way), and where you look. */
  private aim(): typeof _aim {
    const { player } = this.host;
    const { right } = player.input.hands;
    right.grip.getWorldPosition(_aim.from);
    if (player.sword.tip.valid) {
      player.sword.segment(player.rig, _base, _tip);
      _aim.hand.subVectors(_tip, _base).normalize();
    } else _aim.hand.set(0, 0, -1).applyQuaternion(right.grip.getWorldQuaternion(_q));
    player.camera.getWorldDirection(_aim.gaze);
    return _aim;
  }

  // ---------------------------------------------------------------- feedback

  /** Read and used: the trail flashes its colour, a burst leaves the hand, a strong buzz, and its name floats up with its cost. */
  private cast(ability: Ability): void {
    const { player, particles, text } = this.host;
    const colour = ABILITY_COLOUR[ability] ?? 0xffffff;
    const B = CONFIG.gestures.buzz.read;
    player.input.hands.right.grip.getWorldPosition(_p);
    particles.burst('magic', _p, 28, undefined, colour);
    const cost = player.costOf(ability);
    const paid = cost ? `  -${cost} ${player.stats.resource.kind}` : '';
    text.spawn(`${ABILITY[ability].name}${paid}`, _p.clone().setY(_p.y + 0.15), { color: hex(colour), scale: 0.1, life: 1.4 });
    player.input.pulse('right', B.intensity, B.ms);
    this.endTrail(colour);
  }

  /** Read, but not used: why, in words over the hand, and a dull buzz. */
  private refused(ability: Ability, use: Use): void {
    const { player } = this.host;
    const { name } = ABILITY[ability];
    const why =
      use === 'poor'
        ? `not enough ${player.stats.resource.kind}`
        : use === 'cooling'
          ? `ready in ${Math.ceil(player.abilities.cooldown(ability))} s`
          : use === 'no target'
            ? 'nothing to throw at'
            : 'not built yet';
    this.say(`${name}: ${why}`, '#8090a0');
    const B = CONFIG.gestures.buzz.dull;
    player.input.pulse('right', B.intensity, B.ms);
    sfx.gestureDull();
    this.endTrail(DULL);
  }

  /** Nothing was read: a grey puff, a "?" and two ticks. */
  private miss(): void {
    const { player, particles, text } = this.host;
    player.input.hands.right.grip.getWorldPosition(_p);
    particles.burst('magic', _p, 6, undefined, MISS_GREY);
    text.spawn('?', _p.clone().setY(_p.y + 0.12), { color: '#a0a0a0', scale: 0.12 });
    sfx.gestureMiss(_p);
    const B = CONFIG.gestures.buzz.miss;
    const { input } = player;
    input.pulse('right', B.intensity, B.ms);
    setTimeout(() => input.pulse('right', B.intensity, B.ms), B.gap);
    this.endTrail(MISS_GREY);
  }

  private say(words: string, color: string): void {
    const { player, text } = this.host;
    player.input.hands.right.grip.getWorldPosition(_p);
    text.spawn(words, _p.clone().setY(_p.y + 0.15), { color, scale: 0.08, life: 1.6 });
  }

  /** The stroke so far, as a faint line in rig space. */
  private drawTrail(): void {
    const r = this.recorder;
    for (let i = 0; i < r.count; i++) {
      const [x, y, z] = r.point(i);
      const p = r.toRig(x, y, z);
      this.trailPoints[i * 3] = p.x;
      this.trailPoints[i * 3 + 1] = p.y;
      this.trailPoints[i * 3 + 2] = p.z;
    }
    this.trail.geometry.setDrawRange(0, r.count);
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.material.opacity = CONFIG.gestures.trail.opacity;
    this.trail.visible = true;
  }

  private endTrail(colour: number): void {
    this.trail.material.color.setHex(colour);
    this.trailFade = CONFIG.gestures.trail.fade;
  }

  private fadeTrail(dt: number): void {
    if (this.recorder.armed) return;
    const T = CONFIG.gestures.trail;
    this.trailFade = Math.max(0, this.trailFade - dt);
    this.trail.material.opacity = (this.trailFade / T.fade) * Math.min(1, T.opacity * 1.6);
    this.trail.visible = this.trailFade > 0;
  }

  // ---------------------------------------------------------------- the shape in the air

  /**
   * The shape not yet drawn, faint in the air ahead of you at chest height,
   * bright where it starts and fading to where it ends. It turns with you
   * only once you look well away, so you can walk up and trace it.
   */
  private showHint(shape: Shape | null): void {
    if (shape !== this.hintShape) {
      this.hintShape = shape;
      if (shape) {
        this.hint.geometry.dispose();
        this.hint.geometry = hintGeometry(shape);
      }
      this.hintYaw = Number.NaN;
    }
    this.hint.visible = shape !== null;
    if (!shape) return;
    const H = CONFIG.gestures.hint;
    const { player } = this.host;
    const { rig } = player;
    player.headPosition(_head);
    rig.worldToLocal(_head);
    player.camera.getWorldDirection(_gaze).applyQuaternion(_q.copy(rig.quaternion).invert());
    const want = Math.atan2(_gaze.x, _gaze.z);
    if (Number.isNaN(this.hintYaw)) this.hintYaw = want;
    const d = Math.atan2(Math.sin(want - this.hintYaw), Math.cos(want - this.hintYaw));
    if (Math.abs(d) > H.follow) this.hintYaw += d - Math.sign(d) * H.follow;
    this.hint.position.set(_head.x + Math.sin(this.hintYaw) * H.ahead, _head.y - H.drop, _head.z + Math.cos(this.hintYaw) * H.ahead);
    this.hint.rotation.set(0, this.hintYaw, 0);
  }
}

/**
 * A shape's path, `hint.size` across and centred, as a line whose local +z is
 * away from you: its x is mirrored so the body frame's "right" stays right.
 */
function hintGeometry(shape: Shape): BufferGeometry {
  const path = densify(SHAPE[shape].path, 60);
  let lo = [Infinity, Infinity];
  let hi = [-Infinity, -Infinity];
  for (const [x, y] of path) {
    lo = [Math.min(lo[0], x), Math.min(lo[1], y)];
    hi = [Math.max(hi[0], x), Math.max(hi[1], y)];
  }
  const k = CONFIG.gestures.hint.size / Math.max(hi[0] - lo[0], hi[1] - lo[1]);
  const cx = (lo[0] + hi[0]) / 2;
  const cy = (lo[1] + hi[1]) / 2;
  const positions = new Float32Array(path.length * 3);
  const colours = new Float32Array(path.length * 3);
  path.forEach(([x, y], i) => {
    positions.set([-(x - cx) * k, (y - cy) * k, 0], i * 3);
    const bright = 1 - 0.75 * (i / (path.length - 1));
    colours.set([bright, bright * 0.95, bright * 0.8], i * 3);
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setAttribute('color', new BufferAttribute(colours, 3));
  return g;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
