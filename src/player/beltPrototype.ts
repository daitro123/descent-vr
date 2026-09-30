// PROTOTYPE: inventory ticket 04, "The belt and drinking a potion"
// (.scratch/inventory/issues/04-the-belt-and-drinking-a-potion.md).
//
// Throwaway code that answers one question: how do you take a potion from the
// belt and drink it in the middle of a fight, with a weapon in each hand? It
// stays on main only so it can be tried on the headset at `?belt`; it is not
// the belt. Nothing here reaches the Adventure or the save.
//
// Three ways to take a potion while both hands are full, switched with
// `?belt=a|b|c`, a click of either stick in the headset, or the bar on the page:
//
//   a. The weapon in that hand fades out while the flask is held (the research's pick).
//   b. The weapon swings to the hip while the flask is held, and comes back.
//   c. No hand-off: touch the slot, then lift that hand, weapon and all, to your mouth.
//
// You fight practice duelists in the crypt hall, and a light drain keeps
// eating your health; `&calm` drops the duelists and keeps the drain.

import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Fog,
  Group,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  type PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  type Scene,
  SphereGeometry,
  SRGBColorSpace,
  Timer,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { CONFIG } from '../config';
import { FloatingText } from '../fx/floatingText';
import { audio, sfx, startAmbience, updateListener } from '../fx/sfx';
import { Game } from '../game';
import { createModelMaterial } from '../models/materials';
import { BELT_VARIANTS, type BeltVariant, type Route } from '../route';
import { BeltHud } from '../ui/beltHud';
import type { PerfReadout } from '../ui/perfReadout';
import { Arena } from '../world/arena';
import type { Handedness } from './input';
import { Player } from './player';

/** Every number the prototype is tuning, in metres, seconds and 0–1 buzz strengths. */
export const BELT = {
  /** The neck, which the hips hang from: below and behind the eyes, so looking down doesn't move them. */
  neck: { below: 0.1, behind: 0.08 },
  /** Each slot from the neck: down to the hip, out to the side, a little ahead. */
  slot: { below: 0.6, side: 0.19, ahead: 0.12 },
  /** The slots turn with you only once you've looked this far (rad) away from where they face. */
  yawDeadzone: 0.5,
  /** A hand this close to a slot makes it glow and tick. */
  near: 0.12,
  /** Variant c: a hand this close has touched it. */
  touch: 0.08,
  /** The mouth, from the eyes, in the head's own frame. */
  mouth: { below: 0.13, ahead: 0.1 },
  /** Hold the flask this close to the mouth… */
  mouthRadius: 0.15,
  /** …for this long, to drink it… */
  drinkTime: 0.7,
  /** …moving no faster than this (m/s); faster, the drink waits rather than cancels. */
  maxHandSpeed: 1.0,
  /** A potion heals this share of your maximum health. */
  heal: 0.4,
  /** The two slots' stacks, left then right, at the start and on a restock. */
  stacks: [3, 2] as const,
  /** Seconds after the last potion (or a death) before the belt restocks, so practice goes on. */
  restock: 8,
  /** Variant c: a touched potion waits this long for your mouth, then goes back. */
  primed: 4,
  /** Variant a: the weapon fades out (and back in) over this long. */
  fade: 0.15,
  /** Variant b: the weapon's swing to the hip (and back) takes this long. */
  stow: 0.25,
  /** The drain on your health, per second, which stops at `drainFloor` of your maximum. */
  drain: 1.5,
  drainFloor: 0.2,
  buzz: {
    tick: { intensity: 0.3, ms: 20 },
    take: { intensity: 0.5, ms: 40 },
    /** The steady light buzz while drinking, every `every` seconds. */
    drink: { intensity: 0.15, ms: 100, every: 0.09 },
    gulp: { intensity: 0.9, ms: 120 },
  },
};

export const VARIANT_NAMES: Record<BeltVariant, string> = {
  a: 'the weapon fades',
  b: 'the weapon to the hip',
  c: 'no hand-off',
};

const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, -1);
const _head = new Vector3();
const _fwd = new Vector3();
const _right = new Vector3();
const _neck = new Vector3();
const _p = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _s = new Vector3();
const _m = new Matrix4();
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _mFrom = new Matrix4();
const _mTo = new Matrix4();

interface Slot {
  /** −1 at the left hip, +1 at the right. */
  side: -1 | 1;
  /** Potions in the slot and its stack, the one on show included. */
  count: number;
  /** Its flask is in a hand (a, b) or touched and waiting for the mouth (c). */
  out: boolean;
  readonly root: Group;
  readonly flask: Group;
  readonly glow: Mesh<SphereGeometry, MeshBasicMaterial>;
  readonly badge: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly badgeCanvas: HTMLCanvasElement;
  badgeShown: number;
  /** Seconds left of the refill's pop. */
  pop: number;
}

type WeaponPhase = 'held' | 'leaving' | 'away' | 'returning';

interface Hand {
  readonly hand: Handedness;
  /** Free, holding a flask by the grip (a, b), or touched a slot and carrying its potion to the mouth (c). */
  state: 'free' | 'holding' | 'primed';
  slot: Slot | null;
  /** Seconds at the mouth so far. */
  drink: number;
  buzzIn: number;
  /** Variant c: seconds the touched potion has waited. */
  waited: number;
  squeezed: boolean;
  readonly flask: Group;
  readonly prev: Vector3;
  speed: number;
  /** The slots this hand was near last frame, so each arrival ticks once. */
  readonly near: Set<Slot>;
  tracked: boolean;
  /** The weapon's hand-off: in the hand, going, gone, or coming back, drawn by its ghost. */
  weapon: WeaponPhase;
  weaponT: number;
  /** The weapon as it left, in world space, so the ghost starts where the weapon was. */
  readonly from: { p: Vector3; q: Quaternion };
  readonly ghost: Group;
  readonly ghostMat: Material & { opacity: number };
}

/** What happened, for the checks and the page's readout. */
export interface BeltLog {
  taken: number;
  drunk: number;
  cancelled: number;
  returned: number;
  refilled: number;
}

const flaskBody = new SphereGeometry(0.028, 12, 8);
const flaskNeck = new CylinderGeometry(0.008, 0.011, 0.035, 8);
flaskNeck.translate(0, 0.036, 0);
const liquid = new MeshBasicMaterial({ color: 0xd8203a });
const glass = new MeshBasicMaterial({ color: 0xa8c0c8 });

/** A small flask of red: the healing potion, on show at a slot or in a hand. */
function buildFlask(): Group {
  const g = new Group();
  g.add(new Mesh(flaskBody, liquid), new Mesh(flaskNeck, glass));
  return g;
}

/**
 * The two hip slots, the flasks in and out of your hands, and drinking.
 * Placed from the headset each frame, after the game has moved you.
 */
export class Belt {
  readonly root = new Group();
  readonly slots: Slot[];
  readonly hands: Record<Handedness, Hand>;
  readonly log: BeltLog = { taken: 0, drunk: 0, cancelled: 0, returned: 0, refilled: 0 };
  /** Health lost per second to the drain (the checks set it to 0). */
  drain = BELT.drain;
  private yaw = Number.NaN;
  private restockIn = 0;
  private wasAlive = true;

  constructor(
    private readonly player: Player,
    public variant: BeltVariant,
  ) {
    this.root.name = 'belt-prototype';
    this.slots = BELT.stacks.map((count, i) => this.buildSlot(i === 0 ? -1 : 1, count));
    this.hands = { left: this.buildHand('left'), right: this.buildHand('right') };
  }

  // ------------------------------------------------------------ building

  private buildSlot(side: -1 | 1, count: number): Slot {
    const root = new Group();
    const cup = new Mesh(new CylinderGeometry(0.036, 0.03, 0.05, 10), new MeshLambertMaterial({ color: 0x4a2e1c }));
    cup.position.y = -0.03;
    const flask = buildFlask();
    const glow = new Mesh(
      new SphereGeometry(0.065, 12, 8),
      new MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
    );
    glow.visible = false;
    const badgeCanvas = Object.assign(document.createElement('canvas'), { width: 32, height: 32 });
    const texture = new CanvasTexture(badgeCanvas);
    texture.colorSpace = SRGBColorSpace;
    const badge = new Mesh(new PlaneGeometry(0.04, 0.04), new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    // On the outside of the flask, facing up and back toward your eyes.
    badge.position.set(side * 0.055, 0.0, 0);
    badge.rotation.x = -Math.PI / 2 + 0.3;
    root.add(cup, flask, glow, badge);
    this.root.add(root);
    const slot: Slot = { side, count, out: false, root, flask, glow, badge, badgeCanvas, badgeShown: -1, pop: 0 };
    this.drawBadge(slot);
    return slot;
  }

  private buildHand(hand: Handedness): Hand {
    const weapon = hand === 'right' ? this.player.sword.model : this.player.shield.model;
    // A copy of the weapon in a see-through material, drawn while the real one is off the hand.
    const ghostMat = createModelMaterial();
    ghostMat.transparent = true;
    const ghost = weapon.clone();
    ghost.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).material = ghostMat;
    });
    ghost.visible = false;
    this.root.add(ghost);
    const flask = buildFlask();
    flask.visible = false;
    return {
      hand,
      state: 'free',
      slot: null,
      drink: 0,
      buzzIn: 0,
      waited: 0,
      squeezed: false,
      flask,
      prev: new Vector3(),
      speed: 0,
      near: new Set(),
      tracked: false,
      weapon: 'held',
      weaponT: 0,
      from: { p: new Vector3(), q: new Quaternion() },
      ghost,
      ghostMat,
    };
  }

  /** Compile the ghosts' and flasks' shaders now, not on the first potion. */
  warm(renderer: WebGLRenderer, scene: Scene): void {
    const hidden = [...Object.values(this.hands).flatMap((h) => [h.ghost, h.flask]), ...this.slots.map((s) => s.glow)];
    for (const o of hidden) o.visible = true;
    renderer.compile(this.root, this.player.camera, scene);
    for (const o of hidden) o.visible = false;
  }

  // ------------------------------------------------------------ each frame

  update(dt: number): void {
    const p = this.player;
    this.place(dt);
    if (p.alive && this.drain > 0 && p.hp > p.maxHp * BELT.drainFloor) {
      p.hp = Math.max(p.maxHp * BELT.drainFloor, p.hp - this.drain * dt);
    }
    // Died: every flask goes back and every weapon returns. Back on your feet, a full belt.
    if (!p.alive) for (const h of Object.values(this.hands)) this.release(h, true);
    if (p.alive && !this.wasAlive) this.restock();
    this.wasAlive = p.alive;
    for (const h of Object.values(this.hands)) this.updateHand(h, dt);
    for (const s of this.slots) this.updateSlot(s, dt);
    if (this.slots.every((s) => s.count === 0)) {
      this.restockIn -= dt;
      if (this.restockIn <= 0) this.restock();
    } else this.restockIn = BELT.restock;
  }

  /** The slots at your hips, from the neck and a yaw that follows only a real turn. */
  private place(dt: number): void {
    const cam = this.player.camera;
    cam.updateMatrixWorld();
    this.neck(_neck);
    cam.getWorldDirection(_fwd);
    // Looking straight down, the view's heading is noise: keep the last.
    if (Math.hypot(_fwd.x, _fwd.z) > 0.3) {
      const target = Math.atan2(_fwd.x, _fwd.z);
      if (Number.isNaN(this.yaw)) this.yaw = target;
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) > BELT.yawDeadzone) this.yaw += (d - Math.sign(d) * BELT.yawDeadzone) * Math.min(1, dt * 6);
    }
    if (Number.isNaN(this.yaw)) this.yaw = 0;
    const { below, side, ahead } = BELT.slot;
    this.heading(_fwd, _right);
    for (const s of this.slots) {
      s.root.position.copy(_neck).addScaledVector(_fwd, ahead).addScaledVector(_right, s.side * side);
      s.root.position.y = Math.max(0.3, _neck.y - below);
      s.root.rotation.set(0, this.yaw + Math.PI, 0);
      s.root.updateMatrixWorld(true);
    }
  }

  /** The belt's forward and right, flat on the floor. */
  private heading(fwd: Vector3, right: Vector3): void {
    fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    right.crossVectors(fwd, UP);
  }

  /** The neck point the hips hang from. */
  neck(out: Vector3): Vector3 {
    return this.player.camera.localToWorld(out.set(0, -BELT.neck.below, BELT.neck.behind));
  }

  /** The mouth: below and in front of the eyes, turning and nodding with your head. */
  mouth(out: Vector3): Vector3 {
    return this.player.camera.localToWorld(out.set(0, -BELT.mouth.below, -BELT.mouth.ahead));
  }

  private updateHand(h: Hand, dt: number): void {
    const input = this.player.input.hands[h.hand];
    const grip = input.grip;
    h.tracked = grip.visible;
    grip.getWorldPosition(_p);
    this.player.rig.worldToLocal(_p);
    h.speed = dt > 0 ? _p.distanceTo(h.prev) / dt : 0;
    h.prev.copy(_p);
    grip.getWorldPosition(_p);

    const pressed = !h.squeezed && input.squeeze >= 0.6;
    if (input.squeeze >= 0.6) h.squeezed = true;
    else if (input.squeeze < 0.3) h.squeezed = false;

    // A tick as the hand arrives at a slot with a potion to take.
    for (const s of this.slots) {
      const near = h.tracked && s.root.position.distanceTo(_p) < BELT.near && this.onShow(s);
      if (near && !h.near.has(s)) this.player.input.pulse(h.hand, BELT.buzz.tick.intensity, BELT.buzz.tick.ms);
      if (near) h.near.add(s);
      else h.near.delete(s);
    }

    if (!this.player.alive) return;
    if (h.state === 'free' && h.tracked && h.weapon === 'held') {
      const s = this.nearest(_p, this.variant === 'c' ? BELT.touch : BELT.near);
      if (s && (this.variant === 'c' || pressed)) this.take(h, s);
    } else if (h.state === 'holding' && !h.squeezed) {
      this.release(h, false);
    } else if (h.state === 'primed') {
      h.waited += dt;
      if (h.waited > BELT.primed && h.drink === 0) this.release(h, false);
    }
    if (h.state !== 'free') this.drinking(h, dt);
    this.updateWeapon(h, dt);
  }

  /** A slot's flask is there to take. */
  private onShow(s: Slot): boolean {
    return s.count > 0 && !s.out;
  }

  private nearest(at: Vector3, within: number): Slot | null {
    let best: Slot | null = null;
    let bestD = within;
    for (const s of this.slots) {
      const d = s.root.position.distanceTo(at);
      if (d < bestD && this.onShow(s)) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  private take(h: Hand, s: Slot): void {
    h.state = this.variant === 'c' ? 'primed' : 'holding';
    h.slot = s;
    h.drink = h.waited = 0;
    s.out = true;
    this.log.taken++;
    const grip = this.player.input.hands[h.hand].grip;
    grip.add(h.flask);
    // In a fist for a and b; for c, riding the wrist beside the weapon's grip.
    if (this.variant === 'c') h.flask.position.set(0, -0.045, 0.06);
    else h.flask.position.set(0, 0.01, -0.03);
    h.flask.visible = true;
    this.player.input.pulse(h.hand, BELT.buzz.take.intensity, BELT.buzz.take.ms);
    clink();
    if (this.variant !== 'c') this.weaponAway(h);
  }

  /** The flask goes back to its slot (or, `drunk`, is gone), and the weapon comes home. */
  private release(h: Hand, now: boolean, drunk = false): void {
    if (h.state === 'free') {
      if (now) this.weaponHome(h, true);
      return;
    }
    const s = h.slot!;
    s.out = false;
    if (drunk) {
      s.count--;
      if (s.count > 0) {
        s.pop = 0.25;
        this.log.refilled++;
      }
    } else this.log.returned++;
    h.state = 'free';
    h.slot = null;
    h.drink = 0;
    h.flask.removeFromParent();
    h.flask.visible = false;
    this.weaponHome(h, now);
  }

  private drinking(h: Hand, dt: number): void {
    // Variant c drinks from the hand itself; a and b from the flask in it.
    const at = h.state === 'primed' ? this.player.input.hands[h.hand].grip.getWorldPosition(_p) : h.flask.getWorldPosition(_p);
    const close = at.distanceTo(this.mouth(_head)) < BELT.mouthRadius;
    if (!close) {
      if (h.drink > 0) {
        h.drink = 0;
        this.log.cancelled++;
        cancelled();
      }
      return;
    }
    if (h.speed > BELT.maxHandSpeed) return; // waits, doesn't cancel
    h.drink += dt;
    h.buzzIn -= dt;
    if (h.buzzIn <= 0) {
      const b = BELT.buzz.drink;
      this.player.input.pulse(h.hand, b.intensity, b.ms);
      h.buzzIn = b.every;
    }
    if (h.drink >= BELT.drinkTime) {
      const p = this.player;
      p.heal(p.maxHp * BELT.heal);
      p.input.pulse(h.hand, BELT.buzz.gulp.intensity, BELT.buzz.gulp.ms);
      gulp();
      this.log.drunk++;
      this.release(h, false, true);
    }
  }

  // ------------------------------------------------------------ the weapon's hand-off

  private weaponModel(h: Hand): Object3D {
    return h.hand === 'right' ? this.player.sword.model : this.player.shield.model;
  }

  /** Off the hand: the real weapon leaves the grip (so it can't hit or block), its ghost fades or swings away. */
  private weaponAway(h: Hand): void {
    const model = this.weaponModel(h);
    const grip = this.player.input.hands[h.hand].grip;
    model.updateMatrix();
    _m.multiplyMatrices(grip.matrixWorld, model.matrix).decompose(h.from.p, h.from.q, _s);
    grip.remove(model);
    h.weapon = 'leaving';
    h.weaponT = 0;
  }

  /** Back to the hand, at once or by the variant's way. */
  private weaponHome(h: Hand, now: boolean): void {
    if (h.weapon === 'held') return;
    if (now) {
      this.player.input.hands[h.hand].grip.add(this.weaponModel(h));
      h.weapon = 'held';
      h.ghost.visible = false;
      return;
    }
    // Coming back starts from wherever the ghost is.
    h.weaponT = h.weapon === 'leaving' ? 1 - h.weaponT : 0;
    h.weapon = 'returning';
  }

  private updateWeapon(h: Hand, dt: number): void {
    if (h.weapon === 'held') return;
    const fade = this.variant === 'a';
    h.weaponT = Math.min(1, h.weaponT + dt / (fade ? BELT.fade : BELT.stow));
    const t = h.weaponT;
    const ease = t * t * (3 - 2 * t);
    const grip = this.player.input.hands[h.hand].grip;
    const model = this.weaponModel(h);
    // Where the weapon would be in the hand now.
    model.updateMatrix();
    _m.multiplyMatrices(grip.matrixWorld, model.matrix).decompose(_p, _q, _s);
    h.ghost.visible = true;
    if (fade) {
      h.ghost.position.copy(_p);
      h.ghost.quaternion.copy(_q);
      h.ghostMat.opacity = h.weapon === 'leaving' ? 1 - ease : h.weapon === 'returning' ? ease : 0;
      h.ghost.visible = h.ghostMat.opacity > 0.01;
    } else {
      h.ghostMat.opacity = 1;
      this.holster(h, _head, _q2);
      if (h.weapon === 'leaving') {
        h.ghost.position.lerpVectors(h.from.p, _head, ease);
        h.ghost.quaternion.slerpQuaternions(h.from.q, _q2, ease);
      } else if (h.weapon === 'away') {
        h.ghost.position.copy(_head);
        h.ghost.quaternion.copy(_q2);
      } else {
        h.ghost.position.lerpVectors(_head, _p, ease);
        h.ghost.quaternion.slerpQuaternions(_q2, _q, ease);
      }
    }
    if (t < 1) return;
    if (h.weapon === 'leaving') h.weapon = 'away';
    else if (h.weapon === 'returning') this.weaponHome(h, true);
  }

  /** Variant b: where a weapon hangs while its hand holds a flask, just behind and below that hip's slot. */
  private holster(h: Hand, outP: Vector3, outQ: Quaternion): void {
    const side = h.hand === 'right' ? 1 : -1;
    const slot = this.slots[side === 1 ? 1 : 0];
    this.heading(_fwd, _right);
    const sword = h.hand === 'right';
    // The sword just behind the slot, its blade down and back; the big shield
    // further out and back, slung flat against the side of the thigh, face out.
    outP.copy(slot.root.position).addScaledVector(_right, side * (sword ? 0.07 : 0.12)).addScaledVector(_fwd, sword ? -0.1 : -0.14);
    outP.y -= sword ? 0.06 : 0.1;
    // Turn the weapon's own axes (the blade's line, or the shield's face and its
    // up, both under its grip's pitch) onto those.
    const pivot = this.weaponModel(h).children[0].quaternion;
    _a.copy(FORWARD).applyQuaternion(pivot);
    _b.copy(UP).applyQuaternion(pivot);
    _mFrom.makeBasis(_a, _b, _c.crossVectors(_a, _b));
    if (sword) {
      _a.copy(UP).multiplyScalar(-0.9).addScaledVector(_fwd, -0.4).normalize();
      _b.copy(_right).multiplyScalar(side);
    } else {
      _a.copy(_right).multiplyScalar(side);
      _b.copy(UP);
    }
    _mTo.makeBasis(_a, _b, _c.crossVectors(_a, _b));
    outQ.setFromRotationMatrix(_mTo.multiply(_mFrom.transpose()));
  }

  // ------------------------------------------------------------ slots

  private updateSlot(s: Slot, dt: number): void {
    const showing = s.count > 0 && !s.out;
    s.flask.visible = showing;
    s.pop = Math.max(0, s.pop - dt);
    s.flask.scale.setScalar(1 - (s.pop / 0.25) * 0.7);
    // Glows while a hand is near it with a potion to take.
    const near = Object.values(this.hands).some((h) => h.near.has(s));
    s.glow.visible = near;
    s.glow.material.opacity = near ? 0.35 : 0;
    this.drawBadge(s);
  }

  /** The count on show at the slot: the potions left in it, the one in a hand not counted. */
  shown(s: Slot): number {
    return s.count - (s.out ? 1 : 0);
  }

  private drawBadge(s: Slot): void {
    const n = this.shown(s);
    if (n === s.badgeShown) return;
    s.badgeShown = n;
    const c = s.badgeCanvas.getContext('2d')!;
    c.clearRect(0, 0, 32, 32);
    c.fillStyle = 'rgba(12,8,8,0.7)';
    c.beginPath();
    c.arc(16, 16, 15, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = n > 0 ? '#f0e0c0' : '#806858';
    c.font = 'bold 22px monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(n), 16, 17);
    s.badge.material.map!.needsUpdate = true;
  }

  private restock(): void {
    BELT.stacks.forEach((n, i) => {
      const s = this.slots[i];
      if (s.count < n) s.pop = 0.25;
      s.count = n;
    });
    this.restockIn = BELT.restock;
  }

  /** A new way to take the potion: every hand lets go, every weapon comes home. */
  setVariant(variant: BeltVariant): void {
    for (const h of Object.values(this.hands)) this.release(h, true);
    this.variant = variant;
  }
}

// ---------------------------------------------------------------- sounds

function blip(freq: number, end: number, dur: number, type: OscillatorType, gain: number, delay = 0): void {
  const kit = audio();
  if (!kit) return;
  const { ctx, master } = kit;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(end, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Glass on glass as a flask leaves its slot. */
function clink(): void {
  blip(2400, 2250, 0.09, 'sine', 0.1);
  blip(3150, 3000, 0.07, 'sine', 0.05, 0.03);
}

/** Two swallows and the heal's chime. */
function gulp(): void {
  blip(260, 110, 0.13, 'sine', 0.4);
  blip(240, 100, 0.15, 'sine', 0.35, 0.17);
  sfx.pickup();
}

function cancelled(): void {
  blip(420, 300, 0.1, 'triangle', 0.06);
}

// ---------------------------------------------------------------- the page

/** What the belt stands in: the arena's game fighting duelists, or (`calm`) the hall and you alone. */
interface Stage {
  readonly player: Player;
  readonly arena: Arena;
  update(dt: number): void;
}

function fightStage(scene: Scene, camera: PerspectiveCamera, renderer: WebGLRenderer): Stage & { game: Game } {
  const game = new Game(scene, camera, renderer, 1, true);
  return { game, player: game.player, arena: game.arena, update: (dt) => game.update(dt) };
}

function calmStage(scene: Scene, camera: PerspectiveCamera, renderer: WebGLRenderer): Stage {
  const arena = new Arena();
  scene.add(arena.root);
  const player = new Player(camera, renderer, arena);
  scene.add(player.rig);
  const hud = new BeltHud(player, camera, { waves: false });
  scene.add(hud.root);
  hud.warm(renderer, scene);
  return {
    player,
    arena,
    update(dt) {
      player.update(Math.min(dt, 1 / 30));
      updateListener(camera);
      hud.update(dt);
    },
  };
}

/** `?belt`: the prototype, over the crypt hall. */
export function startBelt(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  device: unknown,
  perf: PerfReadout | null,
  { variant, calm }: Extract<Route, { kind: 'belt' }>,
  onEnterVR: (then?: () => void) => void,
): void {
  scene.background = new Color(0x0c0a0e);
  scene.fog = new Fog(0x0c0a0e, 6, CONFIG.arena.halfSize * 2.2);
  const stage = calm ? calmStage(scene, camera, renderer) : fightStage(scene, camera, renderer);
  const belt = new Belt(stage.player, variant);
  scene.add(belt.root);
  belt.warm(renderer, scene);
  const text = new FloatingText(scene);
  const bar = switcher(variant, (v) => choose(v));
  const announce = () =>
    text.banner(camera, `BELT ${belt.variant.toUpperCase()}: ${VARIANT_NAMES[belt.variant].toUpperCase()}`, '#f0d8a0', 0.12, -0.15, 2.5);

  function choose(v: BeltVariant): void {
    belt.setVariant(v);
    bar.show(v);
    const params = new URLSearchParams(location.search);
    params.set('belt', v);
    history.replaceState(null, '', `${location.pathname}?${params.toString().replace(/=(&|$)/g, '$1')}${location.hash}`);
    if (renderer.xr.isPresenting) announce();
  }

  onEnterVR(() => {
    startAmbience();
    announce();
  });

  const update = (dt: number) => {
    stage.update(dt);
    belt.update(dt);
    const { left, right } = stage.player.input.hands;
    // Either stick's click (the arena has no run): the next way to take a potion.
    if (left.stickPressed || right.stickPressed) choose(BELT_VARIANTS[(BELT_VARIANTS.indexOf(belt.variant) + 1) % BELT_VARIANTS.length]);
    text.update(dt);
  };

  // Handle for poking at the prototype from the console and for scripted checks.
  // `paused` stops XR frames stepping it, so `step` alone moves it on.
  const debug = {
    belt,
    player: stage.player,
    game: 'game' in stage ? stage.game : null,
    device,
    renderer,
    camera,
    CONFIG,
    BELT,
    perf,
    paused: false,
    choose,
    /** Stand at (x, z) facing `yaw` (0 looks down −Z). */
    teleport: (x: number, z: number, yaw = 0) => stage.player.place(x, z, yaw),
    /** Run the prototype for `seconds`, `dt` at a time, without waiting for frames. */
    step: (seconds: number, dt = 1 / 72) => {
      for (let left = seconds; left > 1e-9; left -= dt) update(Math.min(dt, left));
    },
  };
  Object.assign(window, { __descent: debug });

  const timer = new Timer();
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = timer.getDelta();
    if (renderer.xr.isPresenting) {
      renderer.xr.updateCamera(camera);
      if (!debug.paused) update(dt);
    } else camera.rotation.y += dt * 0.1;
    stage.arena.update(dt, camera);
    renderer.render(scene, camera);
    perf?.update(dt);
  });
}

/** The prototype's floating bar on the page, at the top so it clears Enter VR: ← the variant → (and the arrow keys). */
function switcher(initial: BeltVariant, choose: (v: BeltVariant) => void): { show(v: BeltVariant): void } {
  const bar = document.createElement('div');
  bar.style.cssText =
    'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:1000;display:flex;gap:12px;align-items:center;' +
    'padding:8px 14px;border-radius:999px;background:#111;color:#fff;font:14px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.5)';
  const button = (label: string) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'background:none;border:0;color:#fff;font:inherit;font-size:18px;cursor:pointer';
    return b;
  };
  const prev = button('←');
  const next = button('→');
  const label = document.createElement('span');
  bar.append(prev, label, next);
  document.body.append(bar);
  let current = initial;
  const step = (by: number) => choose(BELT_VARIANTS[(BELT_VARIANTS.indexOf(current) + by + BELT_VARIANTS.length) % BELT_VARIANTS.length]);
  prev.onclick = () => step(-1);
  next.onclick = () => step(1);
  addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement | null)?.closest?.('input,textarea,[contenteditable]')) return;
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
  const show = (v: BeltVariant) => {
    current = v;
    label.textContent = `PROTOTYPE belt ${v.toUpperCase()} (${VARIANT_NAMES[v]})`;
  };
  show(initial);
  return { show };
}
