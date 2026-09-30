import { AdditiveBlending, CircleGeometry, DoubleSide, Mesh, MeshBasicMaterial, type Object3D, Vector3 } from 'three';
import { ABILITY, type Ability } from '../classes';
import { CONFIG } from '../config';
import type { Enemy } from '../enemies/enemy';
import { sfx } from '../fx/sfx';
import { arrowGeometry, Bow } from '../player/bow';
import type { Player } from '../player/player';
import { ABILITY_COLOUR, type Target, throwTarget } from './abilities';
import type { Aim, CombatFx, Use } from './combat';
import { Mark } from './mark';
import type { Arrow, ArrowContact } from './projectiles';
import { arrowDamage, fanOf, type Shot, Shots } from './shots';
import { type Trap, Traps } from './traps';
import { Ward } from './ward';

// The ranger's kit in a fight (.scratch/abilities/spec.md, "The ranger"),
// promoted from the ranger prototype's kept variant (issues/05): the bow in
// the left hand, following the worn main hand; touch the string with the
// right hand and hold the trigger to nock, pull back, let go. Damage and
// speed follow the draw, arrows never run out, and the draw ticks in both
// hands and pulses on release. Squeezing the bow hand's grip raises the ward.
// Its abilities: Power Shot on A/X while drawing (the nocked arrow glows,
// hits twice as hard and passes through the first enemy), Snare Trap (a trap
// at your feet that roots the first enemy to step on it), Volley (the next
// arrow splits into a fan of five), Scatter (a gust that knocks back and
// staggers whoever is close in front of you) and Hunter's Mark (the enemy you
// face takes more from you and shows through walls). Combat owns it and lands
// its blows.

/**
 * The abilities that change the arrow on the string or the next one: Power
 * Shot's glow and Volley's split. One waits at a time.
 */
export const ARROW_CHARGES: readonly Ability[] = ['powerShot', 'volley'];

/**
 * Whom Scatter's gust from `feet` reaches, facing `facing` (flattened): every
 * enemy a blow can land on (or walking home) whose body is within `radius` m
 * and whose body is within the `arcDeg`° in front, nearest first.
 */
export function scatteredBy<T extends Target & { readonly evading?: boolean }>(
  feet: Vector3,
  facing: Vector3,
  enemies: readonly T[],
  { radius, arcDeg }: { readonly radius: number; readonly arcDeg: number } = CONFIG.classes.ranger.abilities.scatter,
): T[] {
  const fx = facing.x;
  const fz = facing.z;
  const fl = Math.hypot(fx, fz);
  const half = (arcDeg * Math.PI) / 360;
  const out: { e: T; d: number }[] = [];
  for (const e of enemies) {
    if (!e.hittable && !e.evading) continue;
    const dx = e.position.x - feet.x;
    const dz = e.position.z - feet.z;
    const d = Math.hypot(dx, dz);
    const r = e.def.radius;
    if (d - r > radius) continue;
    // Within the arc, widened by how wide the body looks from here; one pressed against you is always in it.
    if (d > r && fl > 1e-6) {
      const off = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / (d * fl))));
      if (off > half + Math.asin(r / d)) continue;
    }
    out.push({ e, d });
  }
  return out.sort((a, b) => a.d - b.d).map((o) => o.e);
}

/** What the kit needs of Combat. */
export interface RangerHooks {
  /** An arrow's blow lands on `enemy` at `at`: `damage` as dealt, pushing it along `push`. True if it killed. */
  land(enemy: Enemy, damage: number, head: boolean, at: Vector3, push: Vector3): boolean;
  /** A blow landed on an enemy walking home: it says so. */
  evade(at: Vector3): void;
  /** An enemy's arrow goes back at its archer (the warrior's reflect), labelled so. */
  reflect(arrow: Arrow, label: string): void;
}

const _head = new Vector3();
const _hand = new Vector3();
const _dir = new Vector3();
const _v = new Vector3();
const _fwd = new Vector3(0, 0, 1);
const _feet = new Vector3();
const _up = new Vector3(0, 1, 0);
const _push = new Vector3();
const _at = new Vector3();

export class RangerKit {
  readonly bow: Bow;
  readonly shots: Shots;
  readonly ward = new Ward();
  readonly traps: Traps;
  /** Hunter's Mark: whom it's on, and its outline. */
  readonly mark: Mark;
  /** The bow is in your main hand (the Adventure sets it from what you wear). */
  worn = true;
  /** Something else has your hands (the bag open, the bench's work): no draw, no ward. */
  held: () => boolean = () => false;
  /** Counts, for the scripted checks and the console. */
  readonly stats = { shots: 0, hits: 0, heads: 0, pierced: 0, wardStops: 0, wardReturns: 0, traps: 0, rooted: 0, volleys: 0, scattered: 0, marks: 0, markedHits: 0 };
  private readonly disc: Mesh<CircleGeometry, MeshBasicMaterial>;
  private tick = 0;
  private fullClick = false;

  constructor(
    private readonly player: Player,
    private readonly fx: CombatFx,
    private readonly hooks: RangerHooks,
    parent: Object3D,
  ) {
    const arrow = arrowGeometry();
    this.bow = new Bow(parent, arrow);
    this.shots = new Shots(parent, arrow);
    this.traps = new Traps(parent);
    this.mark = new Mark(parent);
    const W = CONFIG.ranger.ward;
    this.disc = new Mesh(
      new CircleGeometry(W.radius, 20),
      new MeshBasicMaterial({ color: 0x6ad0ff, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
    );
    this.disc.visible = false;
    parent.add(this.disc);
  }

  /** The arrow on the string (or the next one) is a Power Shot: it waits on the ability clock until loosed. */
  get powered(): boolean {
    return this.player.abilities.primed('powerShot');
  }

  set powered(on: boolean) {
    if (on) this.player.abilities.prime('powerShot');
    else this.player.abilities.spend('powerShot');
  }

  /** The next arrow loosed is a Volley. */
  get volleyed(): boolean {
    return this.player.abilities.primed('volley');
  }

  /** An arrow is on the string: the right hand is the bow's, so no gesture arms. */
  get drawing(): boolean {
    return this.bow.nocked;
  }

  update(dt: number, enemies: readonly Enemy[]): void {
    const { player } = this;
    const { left, right } = player.input.hands;
    player.headPosition(_head);
    right.grip.getWorldPosition(_hand);
    const shown = this.worn && !player.holdingTools;
    const free = player.alive && !this.held();
    this.bow.update(left.grip, _head, _hand, shown);
    if (free) this.draw(dt);
    else this.bow.nocked = false;
    this.bow.update(left.grip, _head, _hand, shown); // the string follows this frame's nock
    this.bow.glow(!this.bow.nocked ? null : this.powered ? ABILITY_COLOUR.powerShot! : this.volleyed ? ABILITY_COLOUR.volley! : null);
    this.updateWard(dt, left.squeeze >= CONFIG.ranger.ward.squeeze, free && this.bow.tracked);

    this.shots.update(dt, enemies, player.ground, {
      hit: (shot, enemy, head, at) => this.hit(shot, enemy, head, at),
      guarded: (shot, _enemy, at) => {
        this.fx.particles.burst('sparks', at, 10, _v.copy(shot.vel).normalize().negate());
        this.fx.text.spawn('guarded', at.clone().setY(at.y + 0.2), { color: '#c0c0c0', scale: 0.15 });
        sfx.clash(at);
      },
      evaded: (_enemy, at) => this.hooks.evade(at),
      stuck: (at) => {
        at.y = Math.max(player.ground.heightAt(at.x, at.z) + 0.02, at.y);
        sfx.arrowThunk(at);
      },
    });
    this.shots.render();
    this.traps.update(dt, enemies, (trap, enemy, held) => this.sprung(trap, enemy, held));
    this.traps.render();
    this.mark.update(dt);
  }

  // ---------------------------------------------------------------- the draw

  /** Nock with the trigger held at the string, draw, and loose on letting go; the draw ticks in both hands. */
  private draw(dt: number): void {
    const { bow } = this;
    const { input } = this.player;
    const T = CONFIG.ranger.trigger;
    const H = CONFIG.ranger.haptics;
    const trigger = input.hands.right.trigger;
    if (!bow.nocked) {
      if (trigger >= T.nock && bow.canNock(_hand)) {
        bow.nocked = true;
        this.fullClick = false;
        this.tick = 0;
        input.pulse('right', H.nock, 25);
      }
      return;
    }
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = H.tick;
      input.pulse('right', 0.06 + 0.5 * bow.draw * bow.draw, 40);
      input.pulse('left', 0.04 + 0.25 * bow.draw, 40);
    }
    if (bow.draw >= 0.999 && !this.fullClick) {
      this.fullClick = true;
      input.pulse('right', H.full, 15);
    }
    if (trigger < T.loose) {
      // Too little of a draw puts the arrow away (a Power Shot keeps its glow for the next).
      if (bow.draw >= CONFIG.ranger.bow.minDraw) this.loose(bow.draw);
      bow.nocked = false;
    }
  }

  private loose(draw: number): void {
    const { bow, player } = this;
    const P = CONFIG.classes.ranger.abilities.powerShot;
    const dir = bow.aim(_dir);
    const from = _v.copy(bow.rest).addScaledVector(dir, 0.05);
    const powered = this.powered;
    this.powered = false;
    const volley = player.abilities.spend('volley');
    if (volley) {
      // The arrow splits as it leaves the bow: a level fan, each at a share of the draw's blow.
      const V = CONFIG.classes.ranger.abilities.volley;
      for (const way of fanOf(dir, V.arrows, V.fanDeg)) this.shots.loose(from, way, draw, player.stats.damage * V.share, { volley: true });
      this.stats.volleys++;
      sfx.volley(from);
      this.fx.particles.burst('magic', from, 18, dir, ABILITY_COLOUR.volley);
    } else this.shots.loose(from, dir, draw, player.stats.damage * (powered ? P.multiplier : 1), { pierce: powered ? P.pierce : 0, powered });
    this.stats.shots++;
    sfx.arrowLoose(from);
    if (powered) {
      sfx.powerShot(from);
      this.fx.particles.burst('magic', from, 14, dir, ABILITY_COLOUR.powerShot);
    }
    const R = CONFIG.ranger.haptics.release;
    player.input.pulse('right', R.draw, 35);
    player.input.pulse('left', R.bow, 50);
  }

  /** An arrow meets an enemy: the blow (more on a marked one), with the sword's feedback; a Power Shot's or Volley's colour bursts from it. */
  private hit(shot: Shot, enemy: Enemy, head: boolean, at: Vector3): void {
    const push = _v.copy(shot.vel).setY(0);
    if (push.lengthSq() > 1e-8) push.normalize().multiplyScalar(0.8);
    const through = shot.passed.length > 0;
    const marked = this.mark.of(enemy);
    this.hooks.land(enemy, arrowDamage(shot.damage * marked, head, enemy), head, at, push);
    this.stats.hits++;
    if (head) this.stats.heads++;
    if (through) this.stats.pierced++;
    if (marked > 1) this.stats.markedHits++;
    if (shot.powered) this.fx.particles.burst('embers', at, 10, undefined, ABILITY_COLOUR.powerShot);
    else if (shot.volley) this.fx.particles.burst('embers', at, 6, undefined, ABILITY_COLOUR.volley);
  }

  // ---------------------------------------------------------------- the ward

  private updateWard(dt: number, squeezing: boolean, able: boolean): void {
    const { ward, disc } = this;
    if (ward.update(dt, squeezing, able) === 'raised') this.player.input.pulse('left', 0.4, 40);
    disc.visible = ward.up;
    if (!ward.up) return;
    ward.place(this.bow.grip, _head);
    disc.position.copy(ward.centre);
    disc.quaternion.setFromUnitVectors(_fwd, ward.normal);
    disc.material.opacity = ward.fresh ? 0.55 : 0.3;
  }

  /** An enemy's arrow meets the ward before anything else of yours: sent back while it's fresh, stopped after. */
  arrowContact(prev: Vector3, pos: Vector3, arrow: Arrow): ArrowContact | null {
    if (!this.player.alive) return null;
    const meets = this.ward.meets(prev, pos);
    if (!meets) return null;
    const { input } = this.player;
    if (meets === 'reflect') {
      this.hooks.reflect(arrow, 'WARD');
      this.stats.wardReturns++;
      input.pulse('left', 1, 80);
      return 'parried';
    }
    this.stats.wardStops++;
    this.fx.particles.burst('magic', arrow.pos, 10);
    sfx.block(arrow.pos);
    input.pulse('left', 0.6, 50);
    return 'glanced';
  }

  // ---------------------------------------------------------------- abilities

  /** Power Shot: the arrow on the string glows. Only while drawing, not twice on one arrow, and not on a Volley's. */
  powerShot(): Use {
    if (!this.bow.nocked || this.powered) return 'no target';
    if (this.volleyed) return 'waiting';
    this.powered = true;
    this.fx.particles.burst('magic', this.bow.rest, 16, undefined, ABILITY_COLOUR.powerShot);
    sfx.powerShot(this.bow.rest);
    this.player.input.pulse('right', 0.7, 60);
    return 'cast';
  }

  /** Snare Trap: a trap at your feet. */
  snareTrap(): Use {
    const S = CONFIG.classes.ranger.abilities.snareTrap;
    const feet = this.player.feetPosition(_v);
    this.traps.lay(feet, S.root, S.lasts);
    this.stats.traps++;
    this.fx.particles.burst('dust', feet, 10);
    this.fx.particles.burst('magic', feet, 12, undefined, ABILITY_COLOUR.snareTrap);
    sfx.snareTrap(feet);
    return 'cast';
  }

  /** Volley: the next arrow loosed splits into a fan. Not while a Power Shot's glow waits on it. */
  volley(): Use {
    if (this.player.abilities.waitingOn(ARROW_CHARGES)) return 'waiting';
    this.player.abilities.prime('volley');
    this.player.input.hands.right.grip.getWorldPosition(_at);
    this.fx.particles.burst('magic', _at, 16, undefined, ABILITY_COLOUR.volley);
    sfx.volleyReady(_at);
    return 'cast';
  }

  /**
   * Scatter: a gust from your hand along `facing` (where you look) knocks back
   * and staggers every enemy close in front of you. It deals nothing, so it
   * pulls no camp; a rooted enemy stays where the vines hold it (staggered),
   * a frozen one is left frozen, and the Warden is only nudged, as any push
   * nudges it, and not staggered. Cast whether or not anyone is there.
   */
  scatter(enemies: readonly Enemy[], facing: Vector3): Use {
    const S = CONFIG.classes.ranger.abilities.scatter;
    const { player, fx } = this;
    const feet = player.feetPosition(_feet);
    const colour = ABILITY_COLOUR.scatter!;
    for (const enemy of scatteredBy(feet, facing, enemies, S)) {
      enemy.capsule(_at, _v);
      _at.lerp(_v, 0.5);
      if (enemy.evading) {
        this.hooks.evade(_at);
        continue;
      }
      this.stats.scattered++;
      fx.particles.burst('magic', _at, 10, undefined, colour);
      if (enemy.state === 'frozen') continue;
      _push.subVectors(enemy.position, feet).setY(0);
      if (_push.lengthSq() < 1e-8) _push.set(facing.x, 0, facing.z);
      _push.normalize().multiplyScalar(S.knockback);
      if (enemy.afflictedFor('rooted') <= 0) enemy.shove(_push);
      if (enemy.kind !== 'warden') enemy.stagger(S.stagger);
      fx.particles.burst('dust', _v.copy(enemy.position), 8, _push.normalize());
    }
    // The gust itself: a spray of wind and dust across the arc.
    _dir.set(facing.x, 0, facing.z);
    if (_dir.lengthSq() < 1e-8) _dir.set(0, 0, -1);
    _dir.normalize();
    player.input.hands.right.grip.getWorldPosition(_at);
    for (let i = -2; i <= 2; i++) {
      const way = _v.copy(_dir).applyAxisAngle(_up, (i / 4) * ((S.arcDeg * Math.PI) / 180));
      fx.particles.burst('sparks', _at, 6, way, colour);
      fx.particles.burst('dust', _push.copy(feet).addScaledVector(way, 1 + Math.abs(i) * 0.2), 5, way);
    }
    sfx.scatter(_at);
    player.input.pulse('right', 0.8, 90);
    return 'cast';
  }

  /**
   * Hunter's Mark: the nearest enemy within its angle of where the right hand
   * faces (else where you look), in sight and within range, is marked. It
   * deals nothing and pulls nobody.
   */
  huntersMark(aim: Aim, enemies: readonly Enemy[], sees: (from: Vector3, to: Vector3) => boolean): Use {
    const H = CONFIG.classes.ranger.abilities.huntersMark;
    const target = throwTarget(aim.from, [aim.hand, aim.gaze], enemies, sees, H);
    if (!target) return 'no target';
    this.mark.set(target, H.time);
    this.stats.marks++;
    target.capsule(_at, _v);
    this.fx.particles.burst('magic', _v, 16, undefined, ABILITY_COLOUR.huntersMark);
    this.fx.text.spawn('MARKED', _v.clone().setY(_v.y + 0.5), { color: '#ff7a6a', scale: 0.16 });
    sfx.huntersMark(_v);
    return 'cast';
  }

  /** A trap snaps shut on `enemy`: rooted for what it `held` (0 for the Warden, which ignores it). */
  private sprung(trap: Trap, enemy: Enemy, held: number): void {
    if (held > 0) this.stats.rooted++;
    const at = trap.at.clone().setY(trap.at.y + 0.4);
    this.fx.particles.burst('sparks', at, 10);
    this.fx.particles.burst('magic', at, 14, undefined, ABILITY_COLOUR.snareTrap);
    const over = enemy.position.clone().setY(enemy.position.y + 1.9);
    this.fx.text.spawn(held > 0 ? 'ROOTED' : 'immune', over, { color: held > 0 ? '#9fe070' : '#c0c0c0', scale: 0.16 });
    sfx.trapSnap(trap.at);
  }

  /** What the A/X press said, over the bow: its name and cost when it's used, or why not. */
  say(use: Use): void {
    const P = ABILITY.powerShot;
    if (use === 'no target') return;
    const words =
      use === 'cast'
        ? `${P.name}  -${this.player.costOf('powerShot')} focus`
        : use === 'poor'
          ? `${P.name}: not enough focus`
          : use === 'cooling'
            ? `${P.name}: ready in ${Math.ceil(this.player.abilities.cooldown('powerShot'))} s`
            : use === 'waiting'
              ? `${P.name}: ${ABILITY.volley.name} is waiting`
              : null;
    if (!words) return;
    this.fx.text.spawn(words, this.bow.rest.clone().setY(this.bow.rest.y + 0.15), { color: use === 'cast' ? '#ffe07a' : '#8090a0', scale: 0.08, life: 1.4 });
    if (use !== 'cast') sfx.gestureDull();
  }

  /** Nothing on the string or waiting on it, nothing flying, no traps, no mark, the ward down: after death, or a new run. */
  clear(): void {
    this.bow.nocked = false;
    this.powered = false;
    this.player.abilities.spend('volley');
    this.shots.clear();
    this.traps.clear();
    this.mark.clear();
    this.ward.clear();
    this.disc.visible = false;
  }
}
