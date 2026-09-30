import { AdditiveBlending, CircleGeometry, DoubleSide, Mesh, MeshBasicMaterial, type Object3D, Vector3 } from 'three';
import { ABILITY } from '../classes';
import { CONFIG } from '../config';
import type { Enemy } from '../enemies/enemy';
import { sfx } from '../fx/sfx';
import { arrowGeometry, Bow } from '../player/bow';
import type { Player } from '../player/player';
import { ABILITY_COLOUR } from './abilities';
import type { CombatFx, Use } from './combat';
import type { Arrow, ArrowContact } from './projectiles';
import { arrowDamage, type Shot, Shots } from './shots';
import { type Trap, Traps } from './traps';
import { Ward } from './ward';

// The ranger's kit in a fight (.scratch/abilities/spec.md, "The ranger"),
// promoted from the ranger prototype's kept variant (issues/05): the bow in
// the left hand, following the worn main hand; touch the string with the
// right hand and hold the trigger to nock, pull back, let go. Damage and
// speed follow the draw, arrows never run out, and the draw ticks in both
// hands and pulses on release. Squeezing the bow hand's grip raises the ward.
// Its abilities: Power Shot on A/X while drawing (the nocked arrow glows,
// hits twice as hard and passes through the first enemy), and Snare Trap
// (a trap at your feet that roots the first enemy to step on it). Combat owns
// it and lands its blows.

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

export class RangerKit {
  readonly bow: Bow;
  readonly shots: Shots;
  readonly ward = new Ward();
  readonly traps: Traps;
  /** The bow is in your main hand (the Adventure sets it from what you wear). */
  worn = true;
  /** Something else has your hands (the bag open, the bench's work): no draw, no ward. */
  held: () => boolean = () => false;
  /** The arrow on the string (or the next one) is a Power Shot. */
  powered = false;
  /** Counts, for the scripted checks and the console. */
  readonly stats = { shots: 0, hits: 0, heads: 0, pierced: 0, wardStops: 0, wardReturns: 0, traps: 0, rooted: 0 };
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
    const W = CONFIG.ranger.ward;
    this.disc = new Mesh(
      new CircleGeometry(W.radius, 20),
      new MeshBasicMaterial({ color: 0x6ad0ff, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
    );
    this.disc.visible = false;
    parent.add(this.disc);
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
    this.bow.glow(this.powered && this.bow.nocked ? ABILITY_COLOUR.powerShot! : null);
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
    this.shots.loose(from, dir, draw, player.stats.damage * (powered ? P.multiplier : 1), powered ? P.pierce : 0, powered);
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

  /** An arrow meets an enemy: the blow, with the sword's feedback; a Power Shot's glow bursts from it. */
  private hit(shot: Shot, enemy: Enemy, head: boolean, at: Vector3): void {
    const push = _v.copy(shot.vel).setY(0);
    if (push.lengthSq() > 1e-8) push.normalize().multiplyScalar(0.8);
    const through = shot.passed.length > 0;
    this.hooks.land(enemy, arrowDamage(shot.damage, head, enemy), head, at, push);
    this.stats.hits++;
    if (head) this.stats.heads++;
    if (through) this.stats.pierced++;
    if (shot.powered) this.fx.particles.burst('embers', at, 10, undefined, ABILITY_COLOUR.powerShot);
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

  /** Power Shot: the arrow on the string glows. Only while drawing, and not twice on one arrow. */
  powerShot(): Use {
    if (!this.bow.nocked || this.powered) return 'no target';
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
    const words = use === 'cast' ? `${P.name}  -${this.player.costOf('powerShot')} focus` : use === 'poor' ? `${P.name}: not enough focus` : use === 'cooling' ? `${P.name}: ready in ${Math.ceil(this.player.abilities.cooldown('powerShot'))} s` : null;
    if (!words) return;
    this.fx.text.spawn(words, this.bow.rest.clone().setY(this.bow.rest.y + 0.15), { color: use === 'cast' ? '#ffe07a' : '#8090a0', scale: 0.08, life: 1.4 });
    if (use !== 'cast') sfx.gestureDull();
  }

  /** Nothing on the string, nothing flying, no traps, the ward down: after death, or a new run. */
  clear(): void {
    this.bow.nocked = false;
    this.powered = false;
    this.shots.clear();
    this.traps.clear();
    this.ward.clear();
    this.disc.visible = false;
  }
}
