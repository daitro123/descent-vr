// PROTOTYPE (abilities ticket 06, "How the mage fights"): throwaway code kept in
// the repo so Tom can try it on the headset. `?arena&class=mage` swaps the
// warrior's sword and shield for the mage's hands; the arena's waves, enemies
// and level 1 numbers are unchanged. With no `?class=`, nothing here loads.
//
// The kits and the axes they pick on are in mageVariants.prototype.ts, the
// numbers in mageNumbers.prototype.ts, the bolts in flight in
// mageBolts.prototype.ts. In the headset the right stick's click steps
// through the kits; a banner names the one you're on, and so does the panel
// over your left hand, with your mana and the blink's cooldown.

import {
  AdditiveBlending,
  CircleGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three';
import { statsAt } from '../../adventureState';
import { combatStats } from '../../combat/combat';
import { CONFIG } from '../../config';
import { sfx } from '../../fx/sfx';
import type { Game } from '../../game';
import { ModelBuilder } from '../../models/kit';
import { sharedModelMaterial } from '../../models/materials';
import type { Handedness, HandState } from '../../player/input';
import { TextPanel } from '../../ui/panel';
import type { ClassPrototype } from '../classPrototypes';
import { assist, MageBolts } from './mageBolts.prototype';
import { MAGE } from './mageNumbers.prototype';
import { describe, type MageVariant, nextKit, readMageVariant } from './mageVariants.prototype';

const UP = new Vector3(0, 1, 0);
const _p = new Vector3();
const _hand = new Vector3();
const _v = new Vector3();
const _dir = new Vector3();
const _head = new Vector3();
const _fwd = new Vector3();
const _right = new Vector3();
const _q = new Quaternion();
const _from = new Vector3();
const _to = new Vector3();

/** The right hand's bolts are blue, the focus hand's violet. */
const COLOR: Record<Handedness, number> = { right: 0x6ab8ff, left: 0xb87aff };
/** Where the charging orb sits in the grip's space: just over the fist. */
const PALM = new Vector3(0, 0.03, -0.07);
/** Hand-velocity history kept, in frames: enough for ~70 ms at 72 Hz. */
const HISTORY = 6;

/** One hand that casts: its charge, and its recent motion for reading a throw or a push. */
class Caster {
  held = false;
  /** Seconds the trigger has been held this time. */
  charge = 0;
  /** A push has cast this hold already. */
  spent = false;
  private tick = 0;
  private fullTicked = false;
  readonly orb: Mesh;
  private readonly samples: { p: Vector3; t: number }[] = [];
  private time = 0;

  constructor(readonly hand: Handedness) {
    this.orb = new Mesh(
      new IcosahedronGeometry(1, 1),
      new MeshBasicMaterial({ color: COLOR[hand], blending: AdditiveBlending, transparent: true, depthWrite: false }),
    );
    this.orb.visible = false;
  }

  /** Record the hand's position (world) this frame. */
  sample(at: Vector3, dt: number): void {
    this.time += dt;
    if (this.samples.length >= HISTORY) this.samples.shift();
    this.samples.push({ p: at.clone(), t: this.time });
  }

  /** The hand's world velocity over the last few frames (m/s). */
  velocity(out: Vector3): Vector3 {
    const s = this.samples;
    if (s.length < 2) return out.set(0, 0, 0);
    // Over the last ~50 ms: steadier than one frame, still the moment of release.
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
    return Math.min(1, this.charge / MAGE.bolt.chargeTime);
  }

  /** Charging: the orb grows and the hand ticks, then one firmer pulse at full. */
  grow(dt: number, kit: MageKit): void {
    this.charge += dt;
    this.tick -= dt;
    const h = MAGE.haptics;
    if (this.tick <= 0) {
      this.tick = 0.1;
      kit.pulse(this.hand, h.charge.intensity * (1 + 2 * this.fraction), h.charge.ms);
    }
    if (this.fraction >= 1 && !this.fullTicked) {
      this.fullTicked = true;
      kit.pulse(this.hand, h.full.intensity, h.full.ms);
    }
    this.orb.visible = this.charge >= MAGE.bolt.minHold;
    this.orb.scale.setScalar(0.025 + 0.045 * this.fraction);
  }

  reset(): void {
    this.held = this.spent = this.fullTicked = false;
    this.charge = this.tick = 0;
    this.orb.visible = false;
  }
}

export class MageKit implements ClassPrototype {
  variant: MageVariant;
  mana: number = MAGE.mana.max;
  blinkCooldown = 0;
  readonly bolts: MageBolts;
  readonly casters: Record<Handedness, Caster> = { right: new Caster('right'), left: new Caster('left') };
  private readonly wand: Mesh;
  private readonly wandTip = new Vector3(0, 0, -MAGE.wand.length);
  private readonly focus: Mesh;
  private readonly ward: Group;
  private readonly wardMaterial: MeshBasicMaterial;
  private wardFlash = 0;
  private readonly panel = new TextPanel(0.2);
  private panelTimer = 0;
  private seen = { blocks: 0, parries: 0 };
  private wave = 0;
  /** Every buzz asked for, for the scripted checks. */
  onPulse?: (hand: Handedness, intensity: number, ms: number) => void;

  constructor(
    private readonly game: Game,
    variant: MageVariant,
  ) {
    this.variant = variant;
    const { player } = game;
    // Level 1, and none of the warrior's abilities: no rage, no War Cry, no Earthshaker.
    player.stats = { ...statsAt(1), abilities: [] };
    player.hp = player.maxHp;
    this.bolts = new MageBolts(game.arena.root);

    // The wand: a short dark rod out of the fist with a blue stone at its tip.
    const L = MAGE.wand.length;
    const wand = new ModelBuilder(7)
      .cyl(0.008, 0.012, L, 6, { at: [0, 0, -L / 2 + 0.06], rot: [Math.PI / 2, 0, 0], color: 0x3a2a20 })
      .ball(0.018, { at: [0, 0, -L], color: COLOR.right, glow: 1 });
    this.wand = new Mesh(wand.build(), sharedModelMaterial());

    // The focus: a violet crystal held in the off hand, what Inventory's focus slot would hold.
    const focus = new ModelBuilder(8)
      .cone(0.025, 0.07, 5, { at: [0, 0.055, -0.03], color: COLOR.left, glow: 0.8 })
      .cone(0.025, 0.035, 5, { at: [0, 0.003, -0.03], rot: [Math.PI, 0, 0], color: COLOR.left, glow: 0.5 });
    this.focus = new Mesh(focus.build(), sharedModelMaterial());

    // The ward: a hex of light where the warrior's shield board would be. It
    // *is* the shield to Combat (same block box, parry and bash), so it
    // blocks and parries exactly as the shield does; the kit only shows it
    // while the grip is held and there's mana for a block.
    this.wardMaterial = new MeshBasicMaterial({
      color: COLOR.left,
      blending: AdditiveBlending,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      side: DoubleSide,
    });
    this.ward = new Group();
    const hex = new Mesh(new CircleGeometry(0.34, 6), this.wardMaterial);
    const rim = new Mesh(new RingGeometry(0.3, 0.34, 6), this.wardMaterial);
    this.ward.add(hex, rim);
    this.ward.rotation.z = Math.PI / 6;
    this.ward.scale.set(0.82, 1, 1);
    const { shield } = player;
    for (const child of shield.board.children) child.visible = false; // the heater shield
    shield.board.add(this.ward);

    this.panel.mesh.position.set(0, 0.09, 0.05);
    this.panel.mesh.rotation.x = -0.5;
    this.apply(variant, false);
  }

  /** Change kit: the banner says which. */
  apply(variant: MageVariant, announce = true): void {
    this.variant = variant;
    this.casters.left.reset();
    this.casters.right.reset();
    this.game.player.dashes = variant.move === 'dash';
    if (variant.move === 'dash') this.game.player.dashCooldown = 0;
    this.panelTimer = 0;
    if (announce) {
      this.game.text.banner(this.game.player.camera, `MAGE ${describe(variant)}`, '#9fc8ff', 0.09, 0.1, 3);
      sfx.pickup();
    }
  }

  pulse(hand: Handedness, intensity: number, ms: number): void {
    this.game.player.input.pulse(hand, intensity, ms);
    this.onPulse?.(hand, intensity, ms);
  }

  get warding(): boolean {
    return this.game.player.shield.model.parent !== null;
  }

  update(dt: number): void {
    const { game } = this;
    const { player } = game;
    const { hands } = player.input;
    if (game.wave < this.wave) this.restart(); // the run began again
    this.wave = game.wave;
    if (hands.right.stickPressed) this.apply(nextKit(this.variant));

    this.hold(hands);
    this.regen(dt);
    this.updateWard(hands.left, dt);
    if (player.alive) {
      this.cast(this.casters.right, hands.right, dt);
      if (this.variant.focus !== 'wardOnly') this.cast(this.casters.left, hands.left, dt);
      else this.casters.left.reset();
      if (this.variant.move === 'blink') this.blink(hands.left, hands.right);
    } else {
      this.casters.left.reset();
      this.casters.right.reset();
    }
    this.blinkCooldown = Math.max(0, this.blinkCooldown - dt);
    // The belt's dash bar shows the blink's cooldown (Player never dashes with `dashes` off).
    if (this.variant.move === 'blink') player.dashCooldown = (this.blinkCooldown / MAGE.blink.cooldown) * CONFIG.dash.cooldown;
    this.bolts.update(dt, game.enemies, player, game.combat);
    this.updatePanel(dt);
  }

  /** What each hand holds, re-checked every frame: controllers can swap grips when they connect. */
  private hold(hands: Record<Handedness, HandState>): void {
    const { sword } = this.game.player;
    sword.model.removeFromParent(); // no sword: Combat skips it, enemies don't guard against it
    const wand = this.variant.cast === 'wand';
    if (wand && this.wand.parent !== hands.right.grip) hands.right.grip.add(this.wand);
    if (!wand) this.wand.removeFromParent();
    if (this.focus.parent !== hands.left.grip) hands.left.grip.add(this.focus);
    if (this.panel.mesh.parent !== hands.left.grip) hands.left.grip.add(this.panel.mesh);
    for (const hand of ['left', 'right'] as const) {
      const orb = this.casters[hand].orb;
      if (orb.parent !== hands[hand].grip) hands[hand].grip.add(orb);
      if (hand === 'right' && wand) orb.position.copy(this.wandTip);
      else orb.position.copy(PALM);
    }
  }

  private regen(dt: number): void {
    const fighting = this.game.enemies.some((e) => e.alive);
    const M = MAGE.mana;
    this.mana = Math.min(M.max, this.mana + (fighting ? M.regenInFight : M.regenOutOfFight) * dt);
  }

  /** The ward is up while the grip is held and a block is paid for; each block spends it. */
  private updateWard(left: HandState, dt: number): void {
    const { player } = this.game;
    const { shield } = player;
    // Blocks since last frame are the ward's (there's no sword to block with): pay for them.
    const blocks = combatStats.blocks - this.seen.blocks;
    const parries = combatStats.parries - this.seen.parries;
    this.seen = { blocks: combatStats.blocks, parries: combatStats.parries };
    if (blocks > 0) {
      this.mana = Math.max(0, this.mana - blocks * MAGE.mana.blockCost);
      this.wardFlash = 0.25;
    }
    if (parries > 0) this.wardFlash = 0.35;
    this.wardFlash = Math.max(0, this.wardFlash - dt);

    const wants = this.variant.focus !== 'caster' && left.squeeze > 0.5 && player.alive;
    const can = this.mana >= MAGE.mana.blockCost;
    if (wants && can) {
      if (shield.model.parent !== left.grip) left.grip.add(shield.model);
    } else if (shield.model.parent) shield.model.removeFromParent();
    if (wants && !can && Math.random() < 0.1) this.pulse('left', 0.15, 15); // a sputter: no mana for it
    this.wardMaterial.opacity = 0.22 + this.wardFlash * 2;
  }

  /** One hand's charge and cast, by the kit's way of casting. */
  private cast(c: Caster, hand: HandState, dt: number): void {
    const grip = hand.grip;
    if (!grip.visible) {
      c.reset();
      return;
    }
    grip.getWorldPosition(_hand);
    c.sample(_hand, dt);
    const pressed = hand.trigger > 0.6;
    const released = hand.trigger < 0.35;
    if (!c.held) {
      if (pressed) {
        c.reset();
        c.held = true;
      }
      return;
    }
    if (!c.spent) c.grow(dt, this);
    const { cast } = this.variant;
    if (cast === 'push' && !c.spent && c.charge >= MAGE.bolt.minHold) this.tryPush(c, _hand);
    if (!released) return;
    if (cast === 'throw') this.release(c, _hand);
    else if (cast === 'wand') this.fireWand(c);
    else if (!c.spent) this.fizzle(c, _hand);
    c.reset();
  }

  /** Throw: let go mid-throw. The hand's speed shapes the bolt, its direction aims it. */
  private release(c: Caster, at: Vector3): void {
    const T = MAGE.throw;
    c.velocity(_v);
    const speed = _v.length();
    if (c.charge < MAGE.bolt.minHold || speed < T.minSpeed) return this.fizzle(c, at);
    const t = Math.min(1, (speed - T.minSpeed) / (T.fullSpeed - T.minSpeed));
    _dir.copy(_v).normalize();
    this.launch(c, _from.copy(at).addScaledVector(_dir, 0.1), _dir, t, T, T.assistDeg);
  }

  /** Wand: fire along the wand, whatever the hand is doing. */
  private fireWand(c: Caster): void {
    const grip = this.wand.parent;
    if (!grip) return;
    this.wand.localToWorld(_from.copy(this.wandTip));
    _dir.set(0, 0, -1).applyQuaternion(this.wand.getWorldQuaternion(_q));
    const W = MAGE.wand;
    this.launch(c, _from, _dir, 1, { slow: W, fast: W }, W.assistDeg);
  }

  /** Push: the palm driven out in front of you casts, the trigger still held. */
  private tryPush(c: Caster, at: Vector3): void {
    const P = MAGE.push;
    const { player } = this.game;
    player.headPosition(_head);
    player.camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) return;
    _fwd.normalize();
    c.velocity(_v);
    const out = _v.dot(_fwd);
    const reach = _p.subVectors(at, _head).dot(_fwd);
    if (out < P.minSpeed || reach < P.reach) return;
    const t = Math.min(1, (out - P.minSpeed) / (P.fullSpeed - P.minSpeed));
    _dir.copy(_v).normalize();
    this.launch(c, _from.copy(at).addScaledVector(_dir, 0.1), _dir, t, P, P.assistDeg);
    c.spent = true;
    c.orb.visible = false;
  }

  private launch(
    c: Caster,
    from: Vector3,
    dir: Vector3,
    t: number,
    shape: { slow: { speed: number; radius: number }; fast: { speed: number; radius: number } },
    assistDeg: number,
  ): void {
    const M = MAGE.mana;
    if (this.variant.mana === 'spend') {
      if (this.mana < M.boltCost) {
        this.game.text.spawn('no mana', from, { color: '#8090c0', scale: 0.14 });
        return this.fizzle(c, from);
      }
      this.mana -= M.boltCost;
    }
    const target = assist(from, dir, this.game.enemies, assistDeg);
    const B = MAGE.bolt;
    const damage = (B.minDamage + (B.maxDamage - B.minDamage) * c.fraction) * (c.hand === 'left' ? MAGE.offHandDamage : 1);
    const speed = shape.slow.speed + (shape.fast.speed - shape.slow.speed) * t;
    const radius = shape.slow.radius + (shape.fast.radius - shape.slow.radius) * t;
    this.bolts.fire({ pos: from.clone(), vel: dir.clone().multiplyScalar(speed), radius, damage, color: COLOR[c.hand], hand: c.hand, target });
    combatStats.swings++;
    sfx.whoosh(from);
    sfx.arrowLoose(from);
    const h = MAGE.haptics.cast;
    this.pulse(c.hand, h.intensity, h.ms);
  }

  private fizzle(c: Caster, at: Vector3): void {
    if (c.charge < MAGE.bolt.minHold) return; // a tap: nothing was conjured
    this.game.particles.burst('magic', at, 6, undefined, COLOR[c.hand]);
    const h = MAGE.haptics.fizzle;
    this.pulse(c.hand, h.intensity, h.ms);
  }

  /** B / Y: gone, and back a few metres away in the stick's direction (backwards if it's neutral). */
  private blink(left: HandState, right: HandState): void {
    if (!(left.secondaryPressed || right.secondaryPressed) || this.blinkCooldown > 0) return;
    const { player, arena } = this.game;
    player.camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) return;
    _fwd.normalize();
    _right.crossVectors(_fwd, UP);
    const moving = Math.hypot(left.stickX, left.stickY) >= CONFIG.player.stickDeadzone;
    if (moving) _dir.set(0, 0, 0).addScaledVector(_fwd, -left.stickY).addScaledVector(_right, left.stickX).normalize();
    else _dir.copy(_fwd).negate();
    player.feetPosition(_from);
    _to.copy(_from).addScaledVector(_dir, MAGE.blink.distance);
    arena.resolve(_to, CONFIG.player.bodyRadius);
    player.headPosition(_head);
    this.game.particles.burst('magic', _head.setY(_head.y - 0.6), 24, undefined, COLOR.left);
    player.rig.position.x += _to.x - _from.x;
    player.rig.position.z += _to.z - _from.z;
    player.rig.updateMatrixWorld(true);
    player.headPosition(_head);
    this.game.particles.burst('magic', _head.setY(_head.y - 0.6), 24, undefined, COLOR.right);
    this.blinkCooldown = MAGE.blink.cooldown;
    sfx.dash();
    player.onDash?.();
    this.pulse('left', 0.6, 60);
    this.pulse('right', 0.6, 60);
  }

  private restart(): void {
    this.mana = MAGE.mana.max;
    this.blinkCooldown = 0;
    this.bolts.clear();
    this.casters.left.reset();
    this.casters.right.reset();
  }

  /** The panel over the left hand, redrawn a few times a second. */
  private updatePanel(dt: number): void {
    this.panelTimer -= dt;
    if (this.panelTimer > 0) return;
    this.panelTimer = 0.2;
    const v = this.variant;
    const move = v.move === 'blink' ? (this.blinkCooldown > 0 ? `blink ${this.blinkCooldown.toFixed(1)}s` : 'blink ready') : 'dash (B/Y)';
    const ward = v.focus === 'caster' ? 'no ward' : this.warding ? 'WARD UP' : 'ward: left grip';
    this.panel.draw([
      `MAGE kit ${v.kit}`,
      `mana ${Math.round(this.mana)} / ${MAGE.mana.max}`,
      `${v.cast} · ${ward}`,
      move,
      '',
      'R-stick click: next kit',
    ]);
  }
}

/** `?arena&class=mage` (src/prototype/classPrototypes.ts): the kit, its variant read from the page's query string. */
export function startMagePrototype(game: Game): MageKit {
  return new MageKit(game, readMageVariant(location.search));
}
