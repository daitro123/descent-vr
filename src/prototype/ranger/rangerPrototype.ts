import { AdditiveBlending, type BufferGeometry, CircleGeometry, DoubleSide, DynamicDrawUsage, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, type Scene, Vector3 } from 'three';
import type { CombatEvents, CombatFx } from '../../combat/combat';
import { combatStats } from '../../combat/combat';
import { closestSegmentSegment, type SegmentHit } from '../../combat/geometry';
import type { Arrow, ArrowContact } from '../../combat/projectiles';
import { bladeTarget, type BladeResult, type Defender, sweepBlade, sweepStrike, type SweepResult } from '../../combat/strike';
import { type AttackConfig, CONFIG } from '../../config';
import type { Enemy, StrikeOutcome } from '../../enemies/enemy';
import { sfx } from '../../fx/sfx';
import type { Game } from '../../game';
import { ModelBuilder } from '../../models/kit';
import { sharedModelMaterial } from '../../models/materials';
import { PAL } from '../../models/palette';
import { arrowGeometry, BOW, RangerBow } from './rangerBow.prototype';

// PROTOTYPE (abilities ticket 05, "How the ranger fights"): throwaway code,
// kept on main so Tom can try it on the headset. `?arena&class=ranger` swaps
// the warrior's sword and shield for a bow, over the arena as it is; without
// the flag none of this loads.
//
// Every variant draws the same bow (left hand, drawn with the right: touch the
// string, hold the trigger, pull, let go; damage and speed follow the draw).
// They differ in what the ranger does when something reaches them:
//
//   ward  (A)  the bow hand's grip raises a short ward that stops arrows,
//              and sends them back if raised just in time. Close in, only the dash.
//   knife (B)  a knife in the draw hand whenever it isn't holding an arrow,
//              and the bow itself parries a blow or swats an arrow back.
//   kite  (C)  nothing but distance: two dashes in hand, a longer step, and a
//              quiver that runs dry (12, one back every 1.5 s).
//
// `&variant=ward|knife|kite` picks one; clicking the right stick cycles them in
// the headset. The default is the one kept (see the ticket's Answer).
//
// It reaches into Combat's private methods (a cast below) and wraps two of its
// methods on this one instance, so nothing shared changes for the warrior.

export type RangerVariant = 'ward' | 'knife' | 'kite';

export const VARIANTS: { id: RangerVariant; name: string; hint: string }[] = [
  { id: 'ward', name: 'A: WARD', hint: 'left grip: a ward against arrows. B/Y: dash' },
  { id: 'knife', name: 'B: KNIFE', hint: 'slash with the draw hand; swing the bow to parry' },
  { id: 'kite', name: 'C: KITE', hint: 'two dashes, a longer step; 12 arrows' },
];

/** The pick, on Tom's behalf (ticket 05's Answer). */
export const DEFAULT_VARIANT: RangerVariant = 'ward';

/** Level 1's numbers against today's arena waves (a grunt has 45 health, an archer 28). */
export const RANGER = {
  arrow: {
    minSpeed: 14, // m/s at the least draw
    maxSpeed: 42, // …and at full draw
    gravity: 9.8,
    minDamage: 6, // at the least draw…
    maxDamage: 30, // …at full draw; a full-draw head shot (×1.6) drops a grunt
    life: 3, // s in flight
    stick: 4, // s stuck in a wall or the floor
    radius: 0.03,
  },
  /** Haptics through the draw: a tick every so often, stronger as it bends. */
  drawTick: 0.05,
  ward: { radius: 0.3, reach: 0.16, hold: 1.2, cooldown: 2, reflectWindow: 0.35, margin: 0.05 },
  knife: { start: 0.06, end: 0.3, halfWidth: 0.02, minSpeed: 2.6, fullSpeed: 5.5, minDamage: 8, maxDamage: 16 },
  bowParry: { radius: 0.05, parrySpeed: 1.8, blockShare: 0.4, deflectSpeed: 2 },
  kite: { charges: 2, recharge: 1.4, lockout: 0.2, distance: 2.4, quiver: 12, refill: 1.5 },
};

/** What the prototype needs from Combat that it keeps private. */
interface CombatInternals {
  fx: CombatFx;
  events: CombatEvents;
  defender: Defender;
  onKill(enemy: Enemy): void;
  impactFx(enemy: Enemy, at: Vector3, dir: Vector3, bright: boolean): void;
  reflectArrow(arrow: Arrow, label: string): void;
  hurtPlayer(amount: number, flinch?: boolean): void;
  evade(at: Vector3): void;
}

interface Shot {
  pos: Vector3;
  prev: Vector3;
  vel: Vector3;
  life: number;
  damage: number;
  stuck: number;
}

const MAX_SHOTS = 24;
const _a = new Vector3();
const _b = new Vector3();
const _p = new Vector3();
const _v = new Vector3();
const _m = new Matrix4();
const _q = new Quaternion();
const _one = new Vector3(1, 1, 1);
const _fwd = new Vector3(0, 0, 1);
const _hit: SegmentHit = { distance: 0, pointA: new Vector3(), pointB: new Vector3() };
const _blade: BladeResult = { zone: 'body', point: new Vector3() };
const _sweep: SweepResult = { contact: 'body', point: new Vector3() };
const _target = bladeTarget();

/** Load the ranger over an arena game. */
export function startRangerPrototype(game: Game, scene: Scene): RangerPrototype {
  const param = new URLSearchParams(location.search).get('variant');
  const variant = VARIANTS.find((v) => v.id === param)?.id ?? DEFAULT_VARIANT;
  return new RangerPrototype(game, scene, variant);
}

export class RangerPrototype {
  readonly bow: RangerBow;
  readonly shots: Shot[] = [];
  /** Arrows loosed and landed, for the check and the console. */
  readonly stats = { shots: 0, hits: 0, heads: 0, wardStops: 0, wardReturns: 0, knifeHits: 0, bowParries: 0 };
  variant: RangerVariant;
  private readonly internals: CombatInternals;
  private readonly shotMesh: InstancedMesh;
  private readonly knife: Mesh;
  private readonly ward: Mesh;
  private readonly head = new Vector3();
  private readonly hand = new Vector3();
  private tick = 0;
  private fullClick = false;
  private greeted = false;
  // The ward (A).
  wardUp = false;
  private wardAge = 0;
  private wardCooldown = 0;
  private readonly wardCentre = new Vector3();
  private readonly wardNormal = new Vector3();
  // The knife (B): its points in rig space, this frame and last.
  private readonly knifeBase = new Vector3();
  private readonly knifeTip = new Vector3();
  private readonly knifePrevBase = new Vector3();
  private readonly knifePrevTip = new Vector3();
  private knifeValid = false;
  private knifeSpeed = 0;
  // The bow's own motion (B's parry), rig space.
  private readonly bowRig = new Vector3();
  private readonly bowPrevRig = new Vector3();
  private bowValid = false;
  bowSpeed = 0;
  // Kite (C).
  dashes = RANGER.kite.charges;
  private dashRecharge = 0;
  quiver = RANGER.kite.quiver;
  private refill = 0;
  private readonly baseDash: number = CONFIG.dash.distance;

  constructor(
    private readonly game: Game,
    scene: Scene,
    variant: RangerVariant,
  ) {
    this.internals = game.combat as unknown as CombatInternals;
    const arrow = arrowGeometry();
    this.bow = new RangerBow(scene, arrow);
    this.shotMesh = new InstancedMesh(arrow, sharedModelMaterial(), MAX_SHOTS);
    this.shotMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.shotMesh.frustumCulled = false;
    this.shotMesh.count = 0;
    scene.add(this.shotMesh);
    this.knife = new Mesh(knifeGeometry(), sharedModelMaterial());
    this.ward = new Mesh(
      new CircleGeometry(RANGER.ward.radius, 20),
      new MeshBasicMaterial({ color: 0x6ad0ff, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
    );
    this.ward.visible = false;
    scene.add(this.ward);

    // The warrior's kit goes: no sword, no shield, no War Cry or Earthshaker.
    const { player } = game;
    player.sword.model.removeFromParent();
    player.shield.model.removeFromParent();
    player.stats = { ...player.stats, abilities: [] };
    player.input.onRemap = () => this.attach();
    this.attach();

    // Enemy arrows and blows meet the ward and the bow before the body.
    const { combat } = game;
    const playerContact = combat.playerContact.bind(combat);
    combat.playerContact = (prev, pos, a) => this.arrowContact(prev, pos, a) ?? playerContact(prev, pos, a);
    const sweep = combat.sweep.bind(combat);
    combat.sweep = (e, atk, pb, pt, b, t) => this.bowSweep(e, atk, pb, pt, b, t) ?? sweep(e, atk, pb, pt, b, t);

    this.variant = variant;
    this.setVariant(variant, false);
  }

  private attach(): void {
    this.game.player.input.hands.right.grip.add(this.knife);
  }

  /** Switch variant, putting away whatever the last one had out. */
  setVariant(variant: RangerVariant, announce = true): void {
    this.variant = variant;
    this.wardUp = false;
    this.wardCooldown = 0;
    this.bow.nocked = false;
    this.dashes = RANGER.kite.charges;
    this.quiver = RANGER.kite.quiver;
    // CONFIG is read-only by type; the kite's longer step is the prototype's to try.
    (CONFIG.dash as { distance: number }).distance = variant === 'kite' ? RANGER.kite.distance : this.baseDash;
    if (announce) this.announce();
  }

  private announce(): void {
    const v = VARIANTS.find((x) => x.id === this.variant)!;
    const { text } = this.internals.fx;
    text.banner(this.game.player.camera, `RANGER ${v.name}`, '#9fe0a0', 0.18, 0.25, 3);
    text.banner(this.game.player.camera, v.hint, '#d8d0c0', 0.09, 0.08, 4);
  }

  update(dt: number): void {
    dt = Math.min(dt, 1 / 30);
    const { player } = this.game;
    const { left, right } = player.input.hands;
    if (!this.greeted) {
      this.greeted = true;
      this.announce();
    }
    if (right.stickPressed) {
      const i = VARIANTS.findIndex((v) => v.id === this.variant);
      this.setVariant(VARIANTS[(i + 1) % VARIANTS.length].id);
    }

    player.headPosition(this.head);
    right.grip.getWorldPosition(this.hand);
    this.bow.update(left.grip, this.head, this.hand);
    this.trackBow(dt);

    if (player.alive) this.shoot(dt);
    else this.bow.nocked = false;
    this.bow.update(left.grip, this.head, this.hand); // the string follows this frame's nock

    this.updateWard(dt);
    this.updateKnife(dt);
    if (this.variant === 'kite') this.updateKite(dt);
    this.fly(dt);
    this.render();
  }

  // ---------------------------------------------------------------- the draw

  private shoot(dt: number): void {
    const { bow } = this;
    const { input } = this.game.player;
    const trigger = input.hands.right.trigger;
    if (!bow.nocked) {
      if (trigger >= 0.5 && bow.canNock(this.hand)) {
        if (this.variant === 'kite' && this.quiver <= 0) {
          if (this.tick <= 0) {
            this.internals.fx.text.spawn('quiver empty', bow.rest, { color: '#c0c0c0', scale: 0.1 });
            input.pulse('right', 0.2, 20);
            this.tick = 0.6;
          }
          this.tick -= dt;
          return;
        }
        bow.nocked = true;
        this.fullClick = false;
        this.tick = 0;
        input.pulse('right', 0.5, 25);
      }
      return;
    }
    // Haptics build through the draw; a click at full draw.
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = RANGER.drawTick;
      input.pulse('right', 0.06 + 0.5 * bow.draw * bow.draw, 40);
      input.pulse('left', 0.04 + 0.25 * bow.draw, 40);
    }
    if (bow.draw >= 0.999 && !this.fullClick) {
      this.fullClick = true;
      input.pulse('right', 0.9, 15);
    }
    if (trigger < 0.3) {
      if (bow.draw >= BOW.minDraw) this.loose(bow.draw);
      bow.nocked = false;
    }
  }

  private loose(draw: number): void {
    const A = RANGER.arrow;
    const { bow } = this;
    const dir = bow.aim(new Vector3());
    const pos = bow.rest.clone().addScaledVector(dir, 0.05);
    const damage = (A.minDamage + (A.maxDamage - A.minDamage) * draw) * this.game.player.stats.damage;
    if (this.shots.length >= MAX_SHOTS) {
      const i = this.shots.findIndex((s) => s.stuck > 0);
      this.shots.splice(i >= 0 ? i : 0, 1);
    }
    this.shots.push({ pos, prev: pos.clone(), vel: dir.multiplyScalar(A.minSpeed + (A.maxSpeed - A.minSpeed) * draw), life: A.life, damage, stuck: 0 });
    this.stats.shots++;
    if (this.variant === 'kite') {
      this.quiver--;
      this.internals.fx.text.spawn(`${this.quiver}`, bow.rest, { color: this.quiver ? '#9fe0a0' : '#ff8060', scale: 0.08, life: 0.6, rise: 0.15 });
    }
    sfx.arrowLoose(pos);
    const { input } = this.game.player;
    input.pulse('right', 1, 35);
    input.pulse('left', 0.6, 50);
  }

  // ---------------------------------------------------------------- the ranger's arrows

  private fly(dt: number): void {
    const A = RANGER.arrow;
    const { arena } = this.game;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      if (s.stuck > 0) {
        s.stuck -= dt;
        if (s.stuck <= 0) this.shots.splice(i, 1);
        continue;
      }
      s.life -= dt;
      s.prev.copy(s.pos);
      s.vel.y -= A.gravity * dt;
      s.pos.addScaledVector(s.vel, dt);
      if (this.strike(s)) {
        this.shots.splice(i, 1);
        continue;
      }
      if (arena.arrowStops(s.pos)) {
        s.pos.y = Math.max(0.02, s.pos.y);
        s.stuck = A.stick;
        sfx.arrowThunk(s.pos);
        continue;
      }
      if (s.life <= 0) this.shots.splice(i, 1);
    }
  }

  /** Did this arrow meet an enemy this frame? Head shots crit; a raised guard stops it. */
  private strike(s: Shot): boolean {
    for (const enemy of this.game.enemies) {
      if (!enemy.hittable && !enemy.evading) continue;
      const res = sweepBlade(s.prev, s.pos, s.prev, s.pos, RANGER.arrow.radius, 1, enemy.bladeTarget(_target), _blade);
      if (!res) continue;
      if (enemy.evading) {
        this.internals.evade(res.point);
        return true;
      }
      if (res.zone === 'guard' || enemy.guardCovers(res.point, s.vel)) {
        this.internals.fx.particles.burst('sparks', res.point, 10, _v.copy(s.vel).normalize().negate());
        this.internals.fx.text.spawn('guarded', res.point.clone().setY(res.point.y + 0.2), { color: '#c0c0c0', scale: 0.15 });
        sfx.clash(res.point);
        combatStats.guarded++;
        return true;
      }
      const head = res.zone === 'head';
      this.hurt(enemy, s.damage, head, res.point, _v.copy(s.vel).setY(0).normalize().multiplyScalar(0.8));
      this.stats.hits++;
      if (head) this.stats.heads++;
      return true;
    }
    return false;
  }

  /** Damage an enemy as the sword would, with the sword's feedback. */
  private hurt(enemy: Enemy, base: number, head: boolean, at: Vector3, push: Vector3, hand?: 'right'): boolean {
    let damage = base;
    if (head) damage *= enemy.def.critMultiplier;
    if (enemy.exposed > 0) damage *= CONFIG.sword.exposedMultiplier;
    damage = Math.round(damage);
    const bright = head || enemy.exposed > 0;
    this.game.player.headPosition(_a);
    const killed = enemy.takeHit(damage, push, { from: _a });
    combatStats.hits++;
    if (head) combatStats.crits++;
    const { internals } = this;
    internals.impactFx(enemy, at, push, bright);
    internals.fx.text.spawn(head ? `${damage}!` : `${damage}`, at, {
      color: head ? '#ffd23a' : enemy.exposed > 0 ? '#9fd8ff' : '#ffffff',
      scale: head ? 0.3 : 0.22,
    });
    sfx.hit(head, at);
    if (hand) this.game.player.input.pulse(hand, CONFIG.feel.hapticHit.intensity, CONFIG.feel.hapticHit.ms);
    if (head || hand) internals.events.hitStop(CONFIG.feel.hitStop * (head ? 1.2 : 0.8));
    internals.events.onEnemyHit(enemy, killed);
    if (killed) internals.onKill(enemy);
    return killed;
  }

  private render(): void {
    let n = 0;
    for (const s of this.shots) {
      _v.copy(s.vel).normalize();
      _q.setFromUnitVectors(_fwd, _v);
      _m.compose(s.pos, _q, _one);
      this.shotMesh.setMatrixAt(n++, _m);
    }
    this.shotMesh.count = n;
    this.shotMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- A: the ward

  private updateWard(dt: number): void {
    const W = RANGER.ward;
    const { left } = this.game.player.input.hands;
    this.wardCooldown = Math.max(0, this.wardCooldown - dt);
    const squeeze = left.squeeze >= 0.6;
    if (this.variant !== 'ward' || !this.bow.tracked || !this.game.player.alive) {
      this.wardUp = false;
    } else if (!this.wardUp && squeeze && this.wardCooldown <= 0) {
      this.wardUp = true;
      this.wardAge = 0;
      this.game.player.input.pulse('left', 0.4, 40);
    } else if (this.wardUp) {
      this.wardAge += dt;
      if (!squeeze || this.wardAge >= W.hold) {
        this.wardUp = false;
        this.wardCooldown = W.cooldown;
      }
    }
    this.ward.visible = this.wardUp;
    if (!this.wardUp) return;
    // A disc just past the bow hand, facing away from you.
    this.wardNormal.subVectors(this.bow.grip, this.head).normalize();
    this.wardCentre.copy(this.bow.grip).addScaledVector(this.wardNormal, W.reach);
    this.ward.position.copy(this.wardCentre);
    this.ward.quaternion.setFromUnitVectors(_fwd, this.wardNormal);
    const fresh = this.wardAge <= W.reflectWindow;
    (this.ward.material as MeshBasicMaterial).opacity = fresh ? 0.55 : 0.3;
  }

  /** Enemy arrows meet the ward (A) or a swung bow (B) before anything of the warrior's. */
  private arrowContact(prev: Vector3, pos: Vector3, arrow: Arrow): ArrowContact | null {
    if (!this.game.player.alive) return null;
    const { internals } = this;
    const { input } = this.game.player;
    if (this.wardUp) {
      const W = RANGER.ward;
      const d0 = _a.subVectors(prev, this.wardCentre).dot(this.wardNormal);
      const d1 = _b.subVectors(pos, this.wardCentre).dot(this.wardNormal);
      if (d0 * d1 <= 0 && d0 !== d1) {
        _p.lerpVectors(prev, pos, d0 / (d0 - d1));
        if (_p.distanceTo(this.wardCentre) <= W.radius + W.margin) {
          if (this.wardAge <= W.reflectWindow) {
            internals.reflectArrow(arrow, 'WARD');
            this.stats.wardReturns++;
            input.pulse('left', 1, 80);
            return 'parried';
          }
          combatStats.blocks++;
          this.stats.wardStops++;
          internals.fx.particles.burst('magic', _p, 10);
          sfx.block(_p);
          input.pulse('left', 0.6, 50);
          return 'glanced';
        }
      }
    }
    if (this.variant === 'knife' && this.bow.tracked) {
      closestSegmentSegment(prev, pos, this.bow.topTip, this.bow.bottomTip, _hit);
      if (_hit.distance <= RANGER.bowParry.radius + CONFIG.arrow.hitRadius) {
        if (this.bowSpeed >= RANGER.bowParry.deflectSpeed) {
          internals.reflectArrow(arrow, 'DEFLECT');
          input.pulse('left', 0.8, 60);
          return 'deflected';
        }
        combatStats.blocks++;
        internals.fx.particles.burst('sparks', _hit.pointB, 8);
        sfx.clash(_hit.pointB);
        input.pulse('left', 0.6, 50);
        return 'glanced';
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- B: the knife and the bow's parry

  private trackBow(dt: number): void {
    const { rig } = this.game.player;
    if (!this.bow.tracked) {
      this.bowValid = false;
      this.bowSpeed = 0;
      return;
    }
    this.bowPrevRig.copy(this.bowRig);
    rig.worldToLocal(this.bowRig.copy(this.bow.grip));
    this.bowSpeed = this.bowValid && dt > 0 ? this.bowRig.distanceTo(this.bowPrevRig) / dt : 0;
    this.bowValid = true;
  }

  private updateKnife(dt: number): void {
    const K = RANGER.knife;
    const { player } = this.game;
    const grip = player.input.hands.right.grip;
    this.knife.visible = this.variant === 'knife' && !this.bow.nocked;
    if (!this.knife.visible || !grip.visible || !player.alive) {
      this.knifeValid = false;
      return;
    }
    const { rig } = player;
    this.knifePrevBase.copy(this.knifeBase);
    this.knifePrevTip.copy(this.knifeTip);
    this.knife.updateWorldMatrix(true, false);
    rig.worldToLocal(this.knife.localToWorld(this.knifeBase.set(0, 0, -K.start)));
    rig.worldToLocal(this.knife.localToWorld(this.knifeTip.set(0, 0, -K.end)));
    if (!this.knifeValid) {
      this.knifeValid = true;
      return;
    }
    this.knifeSpeed = this.knifeTip.distanceTo(this.knifePrevTip) / Math.max(dt, 1e-4);
    if (this.knifeSpeed < K.minSpeed) return;
    const pb = rig.localToWorld(_a.copy(this.knifePrevBase));
    const pt = rig.localToWorld(_b.copy(this.knifePrevTip));
    const cb = rig.localToWorld(new Vector3().copy(this.knifeBase));
    const ct = rig.localToWorld(new Vector3().copy(this.knifeTip));
    for (const enemy of this.game.enemies) {
      if ((!enemy.hittable && !enemy.evading) || enemy.hitCooldown > 0) continue;
      const res = sweepBlade(pb, pt, cb, ct, K.halfWidth, 4, enemy.bladeTarget(_target), _blade);
      if (!res) continue;
      if (enemy.evading) {
        enemy.hitCooldown = CONFIG.sword.perEnemyCooldown;
        this.internals.evade(res.point);
        continue;
      }
      _v.subVectors(ct, pt).setY(0);
      if (_v.lengthSq() > 1e-8) _v.normalize().multiplyScalar(1.2);
      if (res.zone === 'guard' || enemy.guardCovers(res.point, _v)) {
        enemy.hitCooldown = CONFIG.sword.perEnemyCooldown;
        sfx.clash(res.point);
        this.internals.fx.text.spawn('guarded', res.point.clone().setY(res.point.y + 0.2), { color: '#c0c0c0', scale: 0.15 });
        continue;
      }
      const power = Math.max(0, Math.min(1, (this.knifeSpeed - K.minSpeed) / (K.fullSpeed - K.minSpeed)));
      const base = (K.minDamage + (K.maxDamage - K.minDamage) * power) * player.stats.damage;
      this.hurt(enemy, base, res.zone === 'head', _p.copy(res.point), _v, 'right');
      this.stats.knifeHits++;
    }
  }

  /** B: a blow meeting the bow. Swung into it, a parry; held still, a flimsy block. The heavy blows go through. */
  private bowSweep(enemy: Enemy, attack: AttackConfig, pb: Vector3, pt: Vector3, b: Vector3, t: Vector3): StrikeOutcome | null {
    const P = RANGER.bowParry;
    const { player } = this.game;
    if (this.variant !== 'knife' || !this.bow.tracked || !player.alive || !attack.blockable || attack.guardBreak) return null;
    const d = this.internals.defender;
    const bowDefender: Defender = { ...d, shieldInverse: null, swordBase: this.bow.topTip, swordTip: this.bow.bottomTip, swordRadius: P.radius };
    const res = sweepStrike(pb, pt, b, t, enemy.weapon.radius, 6, bowDefender, true, _sweep);
    if (!res || res.contact !== 'sword') return null;
    const at = res.point;
    const { internals } = this;
    if (this.bowSpeed >= P.parrySpeed) {
      combatStats.parries++;
      this.stats.bowParries++;
      internals.fx.text.spawn('PARRY', at.clone().setY(at.y + 0.25), { color: '#7fd4ff', scale: 0.2 });
      internals.fx.particles.burst('sparks', at, 20, undefined, 0xbfe8ff);
      sfx.parry();
      internals.events.hitStop(0.1);
      player.input.pulse('left', 1, 120);
      return 'parried';
    }
    combatStats.blocks++;
    internals.fx.text.spawn('block', at.clone().setY(at.y + 0.2), { color: '#c0c0c0', scale: 0.15 });
    internals.fx.particles.burst('sparks', at, 10);
    sfx.clash(at);
    player.input.pulse('left', CONFIG.feel.hapticBlock.intensity, CONFIG.feel.hapticBlock.ms);
    internals.hurtPlayer(Math.round(attack.damage * P.blockShare), false);
    return 'blocked';
  }

  // ---------------------------------------------------------------- C: kiting

  private updateKite(dt: number): void {
    const K = RANGER.kite;
    const { player } = this.game;
    // The player dashed this frame if its cooldown was just set to the full value.
    if (player.dashCooldown === CONFIG.dash.cooldown) {
      this.dashes--;
      if (this.dashRecharge <= 0) this.dashRecharge = K.recharge;
      player.dashCooldown = this.dashes > 0 ? K.lockout : this.dashRecharge;
    }
    if (this.dashes < K.charges) {
      this.dashRecharge -= dt;
      if (this.dashRecharge <= 0) {
        this.dashes++;
        this.dashRecharge = this.dashes < K.charges ? K.recharge : 0;
        player.input.pulse('left', 0.25, 20);
      }
    }
    if (this.quiver < K.quiver && !this.bow.nocked) {
      this.refill += dt;
      if (this.refill >= K.refill) {
        this.refill = 0;
        this.quiver++;
      }
    } else this.refill = 0;
  }
}

/** A short knife along the fist (grip −Z), as the sword's blade runs. */
function knifeGeometry(): BufferGeometry {
  const K = RANGER.knife;
  const b = new ModelBuilder(7);
  const len = K.end - K.start;
  b.box(0.028, 0.006, len, { at: [0, 0, -(K.start + len / 2)], color: PAL.iron, mask: 1 })
    .box(0.05, 0.012, 0.012, { at: [0, 0, -K.start + 0.005], color: PAL.ironDark })
    .box(0.024, 0.024, 0.1, { at: [0, 0, 0], color: PAL.leatherDark });
  return b.build();
}
