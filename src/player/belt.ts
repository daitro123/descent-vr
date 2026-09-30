import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
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
  Vector3,
  type WebGLRenderer,
} from 'three';
import { CONFIG } from '../config';
import { audio, sfx } from '../fx/sfx';
import type { Inventory, InventoryEffect, Stack } from '../inventory';
import { itemOf } from '../items';
import { createModelMaterial, type ModelMaterial, sharedModelMaterial } from '../models/materials';
import { modelOf } from '../ui/bag/looks';
import { BeltFrame, HIPS } from './beltZones';
import type { Handedness } from './input';
import type { Player } from './player';

// The belt in the Adventure: two potions at your hips, promoted from the belt
// prototype's variant (a) (player/beltPrototype.ts, `?belt`). Reach down to a
// hip and squeeze the grip: the flask comes into that hand, and the weapon in
// it fades out, unable to hit or block, until you're done. Hold the flask at
// your mouth for 0.7 s, with a steady buzz, and it's drunk with a gulp and a
// pulse; a hand moving fast there pauses the drink, and pulling away early
// cancels it and keeps the potion in your hand. Let go of the grip and the
// flask goes back, and the weapon comes back. A drink dims every flask on the
// belt for the shared cooldown, a thin ring round each draining as it runs,
// and a slot drunk empty refills from its stack in the bag. Every drink goes
// through the inventory, whose effects the Adventure shows (the heal among
// them) and saves (.scratch/inventory/spec.md, "The belt").

/** What the belt does beyond itself. */
export interface BeltWorld {
  readonly inventory: Inventory;
  buzz(hand: Handedness, intensity: number, ms: number): void;
  /** What a drink did, at the mouth: shown (the heal among it) and saved. */
  apply(effects: readonly InventoryEffect[], at: Vector3): void;
}

/** A carried item over a hip slot, from the bag: the slot, and whether it may go there. */
export interface BeltTarget {
  readonly slot: number;
  readonly fits: boolean;
}

type WeaponPhase = 'held' | 'leaving' | 'away' | 'returning';

/** A hip slot's things on show. */
interface SlotView {
  readonly root: Group;
  readonly flask: Mesh;
  readonly flaskMat: ModelMaterial;
  readonly glow: Mesh<SphereGeometry, MeshBasicMaterial>;
  /** The count and the cooldown's ring, painted on one disc the flask stands in. */
  readonly dial: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly canvas: HTMLCanvasElement;
  painted: string;
  /** What its flask is drawn as. */
  shows: string | null;
  /** Seconds left of the refill's pop. */
  pop: number;
}

/** A hand, and the flask it may hold. */
interface HandHold {
  readonly hand: Handedness;
  /** The slot whose flask is in the hand, or −1. */
  slot: number;
  /** Seconds at the mouth so far. */
  drink: number;
  buzzIn: number;
  gripHeld: boolean;
  readonly prev: Vector3;
  prevValid: boolean;
  speed: number;
  /** The slot this hand was at last frame, so each arrival ticks once (−1: none). */
  near: number;
  readonly flask: Mesh;
  /** The weapon's hand-off: in the hand, fading out, gone, or fading back in (drawn by its ghost). */
  weapon: WeaponPhase;
  weaponT: number;
  ghost: Object3D | null;
  readonly ghostMat: ModelMaterial;
}

/** What happened, for the checks. */
export interface BeltLog {
  taken: number;
  drunk: number;
  cancelled: number;
  returned: number;
  refused: number;
}

const DIAL = 128;
/** The flask's scale at a slot and in the hand: its model is about 0.8 across. */
const FLASK = 0.09;
const DIM = 0.3;
const GLOW = { near: new Color(0xffc070), fits: new Color(0x60ff60), refused: new Color(0xd03030) };

const _p = new Vector3();
const _mouth = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _m = new Matrix4();

export class Belt {
  readonly root = new Group();
  readonly frame = new BeltFrame();
  readonly log: BeltLog = { taken: 0, drunk: 0, cancelled: 0, returned: 0, refused: 0 };
  /** What happened, newest last, for the checks. */
  readonly lines: string[] = [];
  private readonly slots: SlotView[];
  private readonly hands: Record<Handedness, HandHold>;

  constructor(
    private readonly player: Player,
    private readonly world: BeltWorld,
  ) {
    this.root.name = 'belt';
    const cup = new CylinderGeometry(0.036, 0.03, 0.05, 10);
    const leather = new MeshLambertMaterial({ color: 0x4a2e1c });
    this.slots = HIPS.map((_, i) => this.buildSlot(i, cup, leather));
    this.hands = { left: this.buildHand('left'), right: this.buildHand('right') };
  }

  private buildSlot(i: number, cupGeometry: CylinderGeometry, leather: MeshLambertMaterial): SlotView {
    const root = new Group();
    const cup = new Mesh(cupGeometry, leather);
    cup.position.y = -0.03;
    const flaskMat = createModelMaterial();
    const flask = new Mesh(undefined, flaskMat);
    flask.scale.setScalar(FLASK);
    flask.position.y = 0.012;
    const glow = new Mesh(
      new SphereGeometry(0.065, 12, 8),
      new MeshBasicMaterial({ color: GLOW.near, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false }),
    );
    glow.visible = false;
    const canvas = Object.assign(document.createElement('canvas'), { width: DIAL, height: DIAL });
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const dial = new Mesh(new PlaneGeometry(0.12, 0.12), new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    // Round the cup's rim, facing up and back towards your eyes.
    dial.position.y = -0.004;
    dial.rotation.x = -Math.PI / 2 + 0.3;
    root.add(cup, flask, glow, dial);
    root.name = HIPS[i].name;
    this.root.add(root);
    return { root, flask, flaskMat, glow, dial, canvas, painted: '', shows: null, pop: 0 };
  }

  private buildHand(hand: Handedness): HandHold {
    const flask = new Mesh(undefined, sharedModelMaterial());
    flask.scale.setScalar(FLASK);
    flask.position.set(0, 0.01, -0.03);
    flask.visible = false;
    const ghostMat = createModelMaterial();
    ghostMat.transparent = true;
    return {
      hand,
      slot: -1,
      drink: 0,
      buzzIn: 0,
      gripHeld: false,
      prev: new Vector3(),
      prevValid: false,
      speed: 0,
      near: -1,
      flask,
      weapon: 'held',
      weaponT: 0,
      ghost: null,
      ghostMat,
    };
  }

  /** Compile the flasks', the ghosts' and the glows' shaders now, not at the first potion. */
  warm(renderer: WebGLRenderer, camera: PerspectiveCamera, scene: Scene): void {
    const potion = itemOf('minor-healing-potion');
    const hidden: Object3D[] = [];
    const ghosts: Object3D[] = [];
    for (const h of Object.values(this.hands)) {
      if (potion) h.flask.geometry = modelOf(potion);
      const ghost = this.ghostOf(h);
      ghosts.push(ghost);
      this.root.add(ghost, h.flask);
      hidden.push(h.flask);
    }
    for (const s of this.slots) {
      if (potion && !s.shows) s.flask.geometry = modelOf(potion);
      hidden.push(s.glow, s.flask);
    }
    const was = hidden.map((o) => o.visible);
    for (const o of hidden) o.visible = true;
    renderer.compile(this.root, camera, scene);
    hidden.forEach((o, i) => (o.visible = was[i]));
    for (const h of Object.values(this.hands)) h.flask.removeFromParent();
    for (const g of ghosts) g.removeFromParent();
  }

  /** The hip slot nearest `at` within `within` (m), whatever it holds: where a carried potion would go. */
  slotNear(at: Vector3, within = CONFIG.belt.near): number | null {
    const i = this.frame.nearest(HIPS, at, within);
    return i < 0 ? null : i;
  }

  /** Where hip slot `i` hangs now. */
  slotWorld(i: number, out: Vector3): Vector3 {
    return this.frame.place(HIPS[i], out);
  }

  /** The mouth: below and in front of the eyes, turning and nodding with your head. */
  mouth(out: Vector3): Vector3 {
    const M = CONFIG.belt.mouth;
    return this.player.camera.localToWorld(out.set(0, -M.below, -M.ahead));
  }

  /** The slot whose flask `hand` holds, or −1. */
  holding(hand: Handedness): number {
    return this.hands[hand].slot;
  }

  /** One frame, after the player has moved: `carried` is a potion from the bag over a hip slot, if any. */
  update(dt: number, carried: BeltTarget | null = null): void {
    const { player } = this;
    this.frame.update(player.camera, dt);
    for (let i = 0; i < this.slots.length; i++) this.placeSlot(i);
    if (!player.alive) for (const h of Object.values(this.hands)) this.release(h, 'now');
    for (const h of Object.values(this.hands)) this.updateHand(h, dt);
    this.slots.forEach((s, i) => this.showSlot(s, i, dt, carried));
  }

  private placeSlot(i: number): void {
    const { root } = this.slots[i];
    this.frame.place(HIPS[i], root.position);
    root.rotation.set(0, this.frame.yaw + Math.PI, 0);
    root.updateMatrixWorld(true);
  }

  /** What's in slot `i`. */
  private stack(i: number): Stack | null {
    return this.world.inventory.belt[i] ?? null;
  }

  /** Slot `i` has a flask to take: something in it, and not already in a hand. */
  private onShow(i: number): boolean {
    return !!this.stack(i) && this.hands.left.slot !== i && this.hands.right.slot !== i;
  }

  private get dimmed(): boolean {
    return this.world.inventory.cooldown > 0;
  }

  private updateHand(h: HandHold, dt: number): void {
    const { player, world } = this;
    const input = player.input.hands[h.hand];
    const grip = input.grip;
    const G = CONFIG.bag.grip;
    const B = CONFIG.belt;
    const was = h.gripHeld;
    h.gripHeld = input.squeeze > (was ? G.off : G.on);
    const gripDown = h.gripHeld && !was;
    const tracked = grip.visible;
    // Speed in the rig, so walking and turning don't count as the hand moving.
    if (tracked && h.prevValid && dt > 0) h.speed = grip.position.distanceTo(h.prev) / dt;
    else h.speed = 0;
    h.prev.copy(grip.position);
    h.prevValid = tracked;
    grip.getWorldPosition(_p);

    // A tick as the hand arrives at a flask it could take.
    const near = tracked && player.alive && h.slot < 0 && !this.dimmed ? this.frame.nearest(HIPS, _p, B.near, (i) => this.onShow(i)) : -1;
    if (near >= 0 && near !== h.near) world.buzz(h.hand, B.buzz.tick.intensity, B.buzz.tick.ms);
    h.near = near;

    if (!player.alive) return;
    if (h.slot >= 0 && !this.stack(h.slot)) this.release(h, 'now'); // gone from under it (moved off on the bag's panel)
    if (h.slot < 0 && tracked && gripDown && h.weapon === 'held') {
      const at = this.frame.nearest(HIPS, _p, B.near, (i) => this.onShow(i));
      if (at >= 0) {
        if (this.dimmed) this.refuse(h, at);
        else this.take(h, at);
      }
    } else if (h.slot >= 0 && !h.gripHeld) {
      this.release(h, 'back');
    }
    if (h.slot >= 0) this.drinking(h, dt);
    this.updateWeapon(h, dt);
  }

  /** A grip at a dimmed flask: it stays, with the strong buzz. */
  private refuse(h: HandHold, slot: number): void {
    const B = CONFIG.bag.buzz.refused;
    this.world.buzz(h.hand, B.intensity, B.ms);
    blip(420, 300, 0.1, 'triangle', 0.06);
    this.log.refused++;
    this.note(`refused (cooling down): ${HIPS[slot].name}, ${this.world.inventory.cooldown.toFixed(0)} s left`);
  }

  private take(h: HandHold, slot: number): void {
    const B = CONFIG.belt.buzz.take;
    const item = itemOf(this.stack(slot)!.id)!;
    h.slot = slot;
    h.drink = 0;
    h.flask.geometry = modelOf(item);
    this.player.input.hands[h.hand].grip.add(h.flask);
    h.flask.visible = true;
    this.world.buzz(h.hand, B.intensity, B.ms);
    clink();
    this.log.taken++;
    this.note(`took: ${item.name} from ${HIPS[slot].name} with the ${h.hand} hand`);
    this.weaponAway(h);
  }

  /** The flask goes back to its slot (`back`, `now`) or is gone (`drunk`), and the weapon comes home: at once if `now`. */
  private release(h: HandHold, how: 'back' | 'now' | 'drunk'): void {
    if (h.slot >= 0) {
      if (how === 'drunk') this.slots[h.slot].pop = this.stack(h.slot) ? 0.25 : 0;
      else {
        this.log.returned++;
        this.note(`put back: ${HIPS[h.slot].name}`);
      }
      h.slot = -1;
      h.drink = 0;
      h.flask.removeFromParent();
      h.flask.visible = false;
    }
    this.weaponHome(h, how === 'now');
  }

  private drinking(h: HandHold, dt: number): void {
    const B = CONFIG.belt;
    const close = h.flask.getWorldPosition(_p).distanceTo(this.mouth(_mouth)) < B.mouthRadius;
    if (!close) {
      if (h.drink > 0) {
        h.drink = 0;
        this.log.cancelled++;
        this.note('cancelled: pulled away');
        blip(420, 300, 0.1, 'triangle', 0.06);
      }
      return;
    }
    if (h.speed > B.maxHandSpeed) return; // waits, doesn't cancel
    h.drink += dt;
    h.buzzIn -= dt;
    if (h.buzzIn <= 0) {
      this.world.buzz(h.hand, B.buzz.drink.intensity, B.buzz.drink.ms);
      h.buzzIn = B.buzz.drink.every;
    }
    if (h.drink < B.drinkTime) return;
    const slot = h.slot;
    const name = itemOf(this.stack(slot)!.id)?.name;
    const effects = this.world.inventory.drink(slot);
    const refused = effects.find((e) => e.kind === 'refused');
    if (refused) {
      this.note(`refused (${refused.reason}): ${name}`);
      this.release(h, 'back');
      return;
    }
    this.world.buzz(h.hand, B.buzz.gulp.intensity, B.buzz.gulp.ms);
    gulp();
    this.log.drunk++;
    this.note(`drank: ${name} from ${HIPS[slot].name}`);
    this.release(h, 'drunk');
    this.world.apply(effects, _mouth);
  }

  // ------------------------------------------------------------ the weapon's hand-off

  private weaponModel(h: HandHold): Object3D {
    return h.hand === 'right' ? this.player.sword.model : this.player.shield.model;
  }

  private setAway(h: HandHold, away: boolean): void {
    if (h.hand === 'right') this.player.sword.away = away;
    else this.player.shield.away = away;
  }

  /** A see-through copy of the weapon as it is now, drawn while the real one is out of the hand. */
  private ghostOf(h: HandHold): Object3D {
    const ghost = this.weaponModel(h).clone();
    ghost.traverse((o) => {
      o.visible = true;
      if ((o as Mesh).isMesh) (o as Mesh).material = h.ghostMat;
    });
    return ghost;
  }

  /** Out of the hand: the real weapon at once (so it can't hit or block), its ghost fading. Nothing to fade with that hand empty. */
  private weaponAway(h: HandHold): void {
    const shown = this.weaponModel(h).visible;
    if (shown) {
      h.ghost?.removeFromParent();
      h.ghost = this.ghostOf(h);
      h.ghost.visible = false;
      this.root.add(h.ghost);
    }
    this.setAway(h, true);
    h.weapon = shown ? 'leaving' : 'away';
    h.weaponT = 0;
  }

  /** Back to the hand, fading in, or at once. */
  private weaponHome(h: HandHold, now: boolean): void {
    if (h.weapon === 'held') return;
    if (now || !h.ghost) {
      this.setAway(h, false);
      h.weapon = 'held';
      h.ghost?.removeFromParent();
      h.ghost = null;
      return;
    }
    // Coming back starts from however far it had faded.
    h.weaponT = h.weapon === 'leaving' ? 1 - h.weaponT : 0;
    h.weapon = 'returning';
  }

  private updateWeapon(h: HandHold, dt: number): void {
    if (h.weapon === 'held' || !h.ghost) return;
    h.weaponT = Math.min(1, h.weaponT + dt / CONFIG.belt.fade);
    const t = h.weaponT;
    const ease = t * t * (3 - 2 * t);
    // Where the weapon would be in the hand now.
    const model = this.weaponModel(h);
    const grip = this.player.input.hands[h.hand].grip;
    model.updateMatrix();
    _m.multiplyMatrices(grip.matrixWorld, model.matrix).decompose(h.ghost.position, _q, _s);
    h.ghost.quaternion.copy(_q);
    h.ghostMat.opacity = h.weapon === 'leaving' ? 1 - ease : h.weapon === 'returning' ? ease : 0;
    h.ghost.visible = h.ghostMat.opacity > 0.01;
    if (t < 1) return;
    if (h.weapon === 'leaving') h.weapon = 'away';
    else if (h.weapon === 'returning') this.weaponHome(h, true);
  }

  // ------------------------------------------------------------ the slots

  private showSlot(s: SlotView, i: number, dt: number, carried: BeltTarget | null): void {
    const stack = this.stack(i);
    const out = this.hands.left.slot === i || this.hands.right.slot === i;
    const dim = this.dimmed;
    const id = stack?.id ?? null;
    if (id !== s.shows) {
      s.shows = id;
      const item = id ? itemOf(id) : undefined;
      if (item) s.flask.geometry = modelOf(item);
    }
    s.flask.visible = !!stack && !out;
    s.flaskMat.color.setScalar(dim ? DIM : 1);
    s.pop = Math.max(0, s.pop - dt);
    s.flask.scale.setScalar(FLASK * (1 - (s.pop / 0.25) * 0.7));
    // Glows while a hand is at it with a flask to take, or green or red under a potion carried from the bag.
    const target = carried?.slot === i ? carried : null;
    const near = !dim && (this.hands.left.near === i || this.hands.right.near === i);
    s.glow.visible = !!target || near;
    s.glow.material.color.copy(target ? (target.fits ? GLOW.fits : GLOW.refused) : GLOW.near);
    this.paintDial(s, i, (stack?.count ?? 0) - (out ? 1 : 0), dim ? this.world.inventory.cooldown / CONFIG.belt.cooldown : 0);
  }

  /** The count on show at the slot, and the cooldown's ring draining round the flask. */
  private paintDial(s: SlotView, i: number, count: number, left: number): void {
    const arc = Math.ceil(left * 60);
    const key = `${count}|${arc}`;
    if (key === s.painted) return;
    s.painted = key;
    const c = s.canvas.getContext('2d')!;
    const mid = DIAL / 2;
    c.clearRect(0, 0, DIAL, DIAL);
    if (arc > 0) {
      c.strokeStyle = 'rgba(40, 30, 24, 0.7)';
      c.lineWidth = 7;
      c.beginPath();
      c.arc(mid, mid, 44, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = '#e8c070';
      c.lineWidth = 5;
      c.beginPath();
      c.arc(mid, mid, 44, -Math.PI / 2, -Math.PI / 2 + (arc / 60) * Math.PI * 2);
      c.stroke();
    }
    // The count's badge on the outside of the flask: the slot is turned to face you, so your left is its +X.
    const bx = mid + (HIPS[i].offset.right < 0 ? 1 : -1) * 44;
    c.fillStyle = 'rgba(12, 8, 8, 0.75)';
    c.beginPath();
    c.arc(bx, mid, 17, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = count > 0 ? '#f0e0c0' : '#806858';
    c.font = 'bold 24px monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(Math.max(0, count)), bx, mid + 1);
    s.dial.material.map!.needsUpdate = true;
  }

  private note(line: string): void {
    this.lines.push(line);
    if (this.lines.length > 60) this.lines.shift();
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
