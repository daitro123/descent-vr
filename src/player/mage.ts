import { AdditiveBlending, CircleGeometry, DoubleSide, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import type { Combat } from '../combat/combat';
import { combatStats } from '../combat/combat';
import { ABILITY_COLOUR } from '../combat/abilities';
import { blinkTo, BOLT_CHARGES, boltShape, chargeOf, conjured, wardRises } from '../combat/mage';
import { CONFIG } from '../config';
import type { Particles } from '../fx/particles';
import { sfx } from '../fx/sfx';
import type { ItemDef } from '../items';
import { ModelBuilder } from '../models/kit';
import { sharedModelMaterial } from '../models/materials';
import type { Handedness, HandState } from './input';
import type { Player } from './player';

// The mage's hands (.scratch/abilities/spec.md, "The mage"), promoted from the
// mage prototype's kit A (src/prototype/mage/). Hold either trigger and a bolt
// gathers, full in 0.6 s: at the tip of the worn wand or staff in the main
// hand, in the palm of the focus hand. Let go mid-throw and it leaves along
// the throw, shaped by how hard you threw it (combat/mage.ts); let go with the
// hand still and it fizzles. The focus's ward rises on the off hand's grip
// while there's mana for a block: it *is* the shield to Combat, so it blocks,
// parries and bashes as the shield does, each block costing mana. B / Y
// blinks you a few metres, in the stick's direction or back.

const UP = new Vector3(0, 1, 0);
/** The main hand's bolts are blue, the focus hand's violet. */
const COLOUR: Record<Handedness, number> = { right: 0x6ab8ff, left: 0xb87aff };
/** Where a bolt gathers with nothing to gather at the tip of, in the grip's space: just over the fist. */
const PALM = new Vector3(0, 0.03, -0.07);
/** Hand positions kept, in frames: enough for ~70 ms at 72 Hz. */
const HISTORY = 6;

const _hand = new Vector3();
const _v = new Vector3();
const _dir = new Vector3();
const _from = new Vector3();
const _to = new Vector3();
const _fwd = new Vector3();
const _right = new Vector3();
const _head = new Vector3();

/** One hand that casts: its charge, and where it's been lately (in your own space), for reading a throw. */
class Caster {
  held = false;
  /** Seconds the trigger has been held this time. */
  charge = 0;
  private tick = 0;
  private fullTicked = false;
  readonly orb: Mesh<IcosahedronGeometry, MeshBasicMaterial>;
  private readonly samples: { p: Vector3; t: number }[] = [];
  private time = 0;

  constructor(readonly hand: Handedness) {
    this.orb = new Mesh(new IcosahedronGeometry(1, 1), new MeshBasicMaterial({ color: COLOUR[hand], blending: AdditiveBlending, transparent: true, depthWrite: false }));
    this.orb.visible = false;
  }

  /** Where the hand is this frame, in the rig's space: walking and turning add nothing to a throw. */
  sample(at: Vector3, dt: number): void {
    this.time += dt;
    if (this.samples.length >= HISTORY) this.samples.shift();
    this.samples.push({ p: at.clone(), t: this.time });
  }

  /** The hand's velocity over the last ~50 ms (m/s, rig space): steadier than a frame, still the moment of release. */
  velocity(out: Vector3): Vector3 {
    const s = this.samples;
    if (s.length < 2) return out.set(0, 0, 0);
    const last = s[s.length - 1];
    let first = s[s.length - 2];
    for (let i = s.length - 2; i >= 0; i--) {
      first = s[i];
      if (last.t - s[i].t >= 0.05) break;
    }
    const dt = last.t - first.t;
    return dt > 0 ? out.subVectors(last.p, first.p).divideScalar(dt) : out.set(0, 0, 0);
  }

  get fraction(): number {
    return chargeOf(this.charge);
  }

  /** Charging: the orb grows, the hand ticks faster, then one firmer pulse at full. */
  grow(dt: number, mage: MageHands, colour: number): void {
    this.charge += dt;
    this.tick -= dt;
    const H = CONFIG.mage.haptics;
    if (this.tick <= 0) {
      this.tick = 0.1;
      mage.pulse(this.hand, H.charge.intensity * (1 + 2 * this.fraction), H.charge.ms);
    }
    if (this.fraction >= 1 && !this.fullTicked) {
      this.fullTicked = true;
      mage.pulse(this.hand, H.full.intensity, H.full.ms);
    }
    this.orb.visible = conjured(this.charge);
    this.orb.scale.setScalar(0.025 + 0.045 * this.fraction);
    this.orb.material.color.setHex(colour);
  }

  reset(): void {
    this.held = this.fullTicked = false;
    this.charge = this.tick = 0;
    this.orb.visible = false;
  }
}

/**
 * How a wand or staff is drawn, by its item's model: one shaft, a wand's or
 * a staff's length (`CONFIG.mage.tip`), in its own wood, with the stone at
 * its tip in the main hand's colour. The Crypt-Warded Staff is bone-pale,
 * ringed in dark iron, its stone caged.
 */
export interface WandLook {
  readonly kind: 'wand' | 'staff';
  readonly shaft: number;
  /** Rings round the shaft, and the cage round the stone, if any. */
  readonly iron?: number;
}

export const WAND_LOOKS: Readonly<Record<string, WandLook>> = {
  // The mage's starting wand, as the mage prototype had it.
  wand: { kind: 'wand', shaft: 0x3a2a20 },
  staff: { kind: 'staff', shaft: 0x3a2a20 },
  // Loot's, white, green and blue: pale birch, red rowan, blue-grey moonwood.
  'birch-wand': { kind: 'wand', shaft: 0xd8d0c0 },
  'rowan-staff': { kind: 'staff', shaft: 0x7a3a2a },
  'moonwood-staff': { kind: 'staff', shaft: 0x4a5a8a, iron: 0xc8d0e0 },
  // Hale's pick for a mage at What Lies Below.
  'crypt-staff': { kind: 'staff', shaft: 0xd8d0b8, iron: 0x2a2a30 },
};

/** The look of a main-hand weapon of `model`: a model this table doesn't know draws as the starting wand. */
export const wandLookOf = (model: string): WandLook => WAND_LOOKS[model] ?? WAND_LOOKS.wand;

/** A wand or staff of `look`, `length` m out of the fist, with a stone at its tip in the main hand's colour. */
function buildWand(look: WandLook, length: number): Mesh {
  const staff = look.kind === 'staff';
  const kit = new ModelBuilder(7)
    .cyl(staff ? 0.012 : 0.008, staff ? 0.016 : 0.012, length + (staff ? 0.3 : 0), 6, { at: [0, 0, -length / 2 + (staff ? 0.15 : 0.06)], rot: [Math.PI / 2, 0, 0], color: look.shaft })
    .ball(staff ? 0.03 : 0.018, { at: [0, 0, -length], color: COLOUR.right, glow: 1 });
  if (look.iron !== undefined) {
    for (const z of [0.25, 0.55]) kit.cyl(0.02, 0.02, 0.025, 6, { at: [0, 0, -length * z], rot: [Math.PI / 2, 0, 0], color: look.iron });
    for (const a of [0, 1, 2]) {
      const t = (a * 2 * Math.PI) / 3;
      kit.bar([0, 0, -length + 0.05], [Math.cos(t) * 0.038, Math.sin(t) * 0.038, -length - 0.01], 0.008, 0.008, { color: look.iron });
    }
  }
  return new Mesh(kit.build(), sharedModelMaterial());
}

export class MageHands {
  readonly casters: Record<Handedness, Caster> = { right: new Caster('right'), left: new Caster('left') };
  /** Seconds before the next blink. */
  blinkCooldown = 0;
  /** Every buzz asked for, for the scripted checks. */
  onPulse?: (hand: Handedness, intensity: number, ms: number) => void;
  /** The worn main hand's weapon, by its look; null with the main hand empty. */
  private wand: Mesh | null = null;
  private wandLook: string | null = null;
  private readonly tip = new Vector3();
  private readonly focus: Mesh;
  private focusWorn = true;
  private readonly wardMaterial: MeshBasicMaterial;
  private wardFlash = 0;
  private seen = { blocks: 0, parries: 0 };

  constructor(
    private readonly player: Player,
    private readonly combat: Combat,
    private readonly particles: Particles,
  ) {
    // The focus: a violet crystal in the off hand.
    const focus = new ModelBuilder(8)
      .cone(0.025, 0.07, 5, { at: [0, 0.055, -0.03], color: COLOUR.left, glow: 0.8 })
      .cone(0.025, 0.035, 5, { at: [0, 0.003, -0.03], rot: [Math.PI, 0, 0], color: COLOUR.left, glow: 0.5 });
    this.focus = new Mesh(focus.build(), sharedModelMaterial());

    // The ward: a hex of light where the warrior's shield board would be. It
    // is the shield to Combat (the same block box, parry and bash); it's on
    // the left grip only while the grip is held and there's mana for a block.
    this.wardMaterial = new MeshBasicMaterial({ color: COLOUR.left, blending: AdditiveBlending, transparent: true, opacity: 0.25, depthWrite: false, side: DoubleSide });
    const ward = new Group();
    ward.add(new Mesh(new CircleGeometry(0.34, 6), this.wardMaterial));
    ward.rotation.z = Math.PI / 6;
    ward.scale.set(0.82, 1, 1);
    const { shield } = player;
    for (const child of shield.board.children) child.visible = false; // the heater shield
    shield.board.add(ward);
    shield.model.removeFromParent();
    this.dress('wand', true);
  }

  /** What you wear: the main hand's weapon (its item's model, looked up in WAND_LOOKS; null for none) and whether a focus is in the off hand. */
  dress(model: string | null, focus: boolean): void {
    this.focusWorn = focus;
    if (model === this.wandLook) return;
    this.wand?.removeFromParent();
    this.wandLook = model;
    const look = model === null ? null : wandLookOf(model);
    const length = look === null ? 0 : CONFIG.mage.tip[look.kind];
    this.wand = look === null ? null : buildWand(look, length);
    this.tip.set(0, 0, -length);
  }

  /** Dress from the gear worn in each hand. */
  wear(mainHand: ItemDef | undefined, offHand: ItemDef | undefined): void {
    this.dress(mainHand ? mainHand.model : null, offHand !== undefined);
  }

  /** Is `hand` charging a bolt? The right hand's charge stops a gesture. */
  charging(hand: Handedness): boolean {
    return this.casters[hand].held;
  }

  /** Is the ward up? */
  get warding(): boolean {
    return this.player.shield.model.parent !== null;
  }

  pulse(hand: Handedness, intensity: number, ms: number): void {
    this.player.input.pulse(hand, intensity, ms);
    this.onPulse?.(hand, intensity, ms);
  }

  /** Once a frame, after the player's own update and before Combat's. `held`: your hands are the bag's or a bench's now. */
  update(dt: number, held = false): void {
    const { player } = this;
    const { hands } = player.input;
    const busy = held || player.holdingTools;
    this.hold(hands, busy);
    this.updateWard(hands.left, dt, busy);
    if (player.alive && !busy) {
      this.cast(this.casters.right, hands.right, dt);
      this.cast(this.casters.left, hands.left, dt);
      this.blink(hands.left, hands.right);
    } else {
      this.casters.left.reset();
      this.casters.right.reset();
    }
    this.blinkCooldown = Math.max(0, this.blinkCooldown - dt);
    // The belt's dash bar shows the blink's cooldown (the mage never dashes).
    player.dashCooldown = (this.blinkCooldown / CONFIG.mage.blink.cooldown) * CONFIG.dash.cooldown;
  }

  /** Everything put down and ready: after death, or a new run. */
  clear(): void {
    this.casters.left.reset();
    this.casters.right.reset();
    this.blinkCooldown = 0;
  }

  /** What each hand holds, re-checked every frame: controllers can swap grips when they connect. */
  private hold(hands: Record<Handedness, HandState>, busy: boolean): void {
    const shown = !this.player.holdingTools;
    const { wand, focus } = this;
    if (wand) {
      if (shown && wand.parent !== hands.right.grip) hands.right.grip.add(wand);
      else if (!shown) wand.removeFromParent();
    }
    if (shown && this.focusWorn && focus.parent !== hands.left.grip) hands.left.grip.add(focus);
    else if (!shown || !this.focusWorn) focus.removeFromParent();
    for (const hand of ['left', 'right'] as const) {
      const orb = this.casters[hand].orb;
      if (orb.parent !== hands[hand].grip) hands[hand].grip.add(orb);
      orb.position.copy(hand === 'right' && this.wand ? this.tip : PALM);
      if (busy) orb.visible = false;
    }
  }

  /** The ward is up while the grip is held, a focus is worn and a block is paid for. */
  private updateWard(left: HandState, dt: number, busy: boolean): void {
    const { player } = this;
    const { shield } = player;
    // The ward flashes on what it stopped: bright on a parry, softer on a block.
    const blocks = combatStats.blocks - this.seen.blocks;
    const parries = combatStats.parries - this.seen.parries;
    this.seen = { blocks: combatStats.blocks, parries: combatStats.parries };
    if (this.warding && blocks > 0) this.wardFlash = 0.25;
    if (this.warding && parries > 0) this.wardFlash = 0.35;
    this.wardFlash = Math.max(0, this.wardFlash - dt);

    const wants = left.squeeze > 0.5 && player.alive && this.focusWorn && !busy;
    const can = wardRises(player.resource);
    if (wants && can) {
      if (shield.model.parent !== left.grip) left.grip.add(shield.model);
    } else if (shield.model.parent) shield.model.removeFromParent();
    if (wants && !can && Math.random() < 0.1) this.pulse('left', 0.15, 15); // a sputter: no mana for it
    this.wardMaterial.opacity = 0.22 + this.wardFlash * 2;
  }

  /** The colour a hand's bolt gathers in: a Fireball's, Frostbolt's or Chain Lightning's, if one waits on it. */
  private colourOf(hand: Handedness): number {
    const charge = this.player.abilities.waitingOn(BOLT_CHARGES);
    return charge ? ABILITY_COLOUR[charge]! : COLOUR[hand];
  }

  /** One hand's charge and throw. */
  private cast(c: Caster, hand: HandState, dt: number): void {
    const { player } = this;
    const grip = hand.grip;
    if (!grip.visible) {
      c.reset();
      return;
    }
    grip.getWorldPosition(_hand);
    c.sample(player.rig.worldToLocal(_hand), dt);
    const pressed = hand.trigger > 0.6;
    const released = hand.trigger < 0.35;
    if (!c.held) {
      if (pressed) {
        c.reset();
        c.held = true;
      }
      return;
    }
    c.grow(dt, this, this.colourOf(c.hand));
    if (!released) return;
    this.release(c);
    c.reset();
  }

  /** Let go mid-throw: the hand's speed shapes the bolt and its direction aims it. */
  private release(c: Caster): void {
    const { player } = this;
    c.orb.getWorldPosition(_from);
    if (!conjured(c.charge)) return; // a tap: nothing was conjured
    const shape = boltShape(c.velocity(_v).length());
    if (!shape) return this.fizzle(c, _from);
    _dir.copy(_v).normalize().applyQuaternion(player.rig.quaternion);
    this.combat.castBolt(c.hand, _from.addScaledVector(_dir, 0.1), _dir, shape, c.fraction, COLOUR[c.hand]);
    const h = CONFIG.mage.haptics.cast;
    this.pulse(c.hand, h.intensity, h.ms);
  }

  private fizzle(c: Caster, at: Vector3): void {
    this.particles.burst('magic', at, 6, undefined, this.colourOf(c.hand));
    const h = CONFIG.mage.haptics.fizzle;
    this.pulse(c.hand, h.intensity, h.ms);
  }

  /** B / Y: gone, and back a few metres away in the stick's direction (backwards if it's neutral), short of any wall. */
  private blink(left: HandState, right: HandState): void {
    if (!(left.secondaryPressed || right.secondaryPressed) || this.blinkCooldown > 0) return;
    const { player } = this;
    player.camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) return;
    _fwd.normalize();
    _right.crossVectors(_fwd, UP);
    const moving = Math.hypot(left.stickX, left.stickY) >= CONFIG.player.stickDeadzone;
    if (moving) _dir.set(0, 0, 0).addScaledVector(_fwd, -left.stickY).addScaledVector(_right, left.stickX).normalize();
    else _dir.copy(_fwd).negate();
    player.feetPosition(_from);
    if (blinkTo(_from, _dir, player.ground, _to) <= 0) return;
    player.headPosition(_head);
    this.particles.burst('magic', _head.setY(_head.y - 0.6), 24, undefined, COLOUR.left);
    player.rig.position.x += _to.x - _from.x;
    player.rig.position.z += _to.z - _from.z;
    player.rig.updateMatrixWorld(true);
    player.headPosition(_head);
    this.particles.burst('magic', _head.setY(_head.y - 0.6), 24, undefined, COLOUR.right);
    this.blinkCooldown = CONFIG.mage.blink.cooldown;
    sfx.blink();
    player.onDash?.();
    const h = CONFIG.mage.haptics.blink;
    this.pulse('left', h.intensity, h.ms);
    this.pulse('right', h.intensity, h.ms);
  }
}
