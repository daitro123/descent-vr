import { Group, Vector3 } from 'three';
import type { Role } from '../adventureState';
import { CONFIG } from '../config';
import type { ThronePlan } from '../world/mine';
import type { Ground } from '../world/ground';
import type { CampHooks, You } from './camps';
import { type Enemy, type EnemyContext, type EnemyPost, keepApart } from './enemy';
import { createEnemy } from './kinds';
import type { AttackTokens } from './tokens';

// The Warden on its throne at the foot of the old mine, the end of What Lies
// Below. It sits slumped there while the quest is under way, and rises as you
// step through its hall's gate. It never leaves the hall: go back out through
// the gate, or fall, and it walks back to its throne whole, and whatever it
// raised crumbles. Beat it and the throne stays empty for good
// (.scratch/oakvale-starting-zone/spec.md, "Enemies").

/**
 * - _absent_: an empty throne (before What Lies Below, and once it's beaten);
 * - _seated_: slumped on the throne, waiting;
 * - _fighting_: up, from the moment you step through the gate;
 * - _resetting_: walking back to the throne at full health, untouchable.
 */
export type ThroneState = 'absent' | 'seated' | 'fighting' | 'resetting';

export interface ThroneEvents {
  /** The Warden rose from its throne as you came through the gate. */
  onRise?(warden: Enemy): void;
  /** It called up the dead: they rise at `at`, round you. */
  onSummon?(warden: Enemy, at: readonly Vector3[]): void;
  /** The Warden or one of the skeletons it raised fell to you (not one that crumbled). */
  onKill?(enemy: Enemy, role: Extract<Role, 'warden' | 'raised'>): void;
  /** One it raised fell apart, its master gone or reset. */
  onCrumble?(enemy: Enemy): void;
}

const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

export class Throne {
  /** The Warden's and its skeletons' bodies: show it with the hall. */
  readonly root = new Group();
  /** Every body here, standing or falling: the Warden and what it raised. */
  readonly enemies: Enemy[] = [];
  private stage: ThroneState = 'absent';
  /** The Warden while it sits, fights or walks back; null while the throne is empty. */
  private warden: Enemy | null = null;
  /** The skeletons it raised that still stand. */
  private readonly raised = new Set<Enemy>();
  private readonly ctx: EnemyContext;
  /** Where it walks back to before it sits: before the throne. */
  private readonly post: EnemyPost;

  constructor(
    private readonly plan: ThronePlan,
    /** The mine's own ground. */
    ground: Ground,
    hooks: CampHooks,
    /** The attack pools every camp shares: while the Warden fights only `CONFIG.warden.hall.melee` may swing at once. */
    private readonly pools: { readonly melee: AttackTokens; readonly ranged: AttackTokens },
    private readonly events: ThroneEvents = {},
  ) {
    this.root.name = 'throne';
    const { front } = plan;
    this.post = { x: front.x, z: front.z, yaw: front.yaw, evading: true };
    this.ctx = {
      ...hooks,
      playerFeet: new Vector3(),
      playerHead: new Vector3(),
      playerSword: null,
      ground,
      meleeTokens: pools.melee,
      rangedTokens: pools.ranged,
      summon: (e, n) => this.summon(e, n),
    };
  }

  get state(): ThroneState {
    return this.stage;
  }

  /** The Warden, while it's there. */
  get body(): Enemy | null {
    return this.warden;
  }

  /**
   * One frame. `onThrone` is the adventure state's answer: does the Warden
   * sit on its throne (What Lies Below under way, and it not yet beaten)?
   */
  update(dt: number, you: You, onThrone: boolean): void {
    const { ctx, plan } = this;
    ctx.playerFeet.copy(you.feet);
    ctx.playerHead.copy(you.head);
    ctx.playerSword = you.alive ? you.sword : null;
    const here = you.alive && you.interior === 'mine';
    // What it raised that fell to you, before anything crumbles this frame (what crumbled has gone from `raised`).
    for (const e of this.raised) {
      if (e.alive) continue;
      this.raised.delete(e);
      this.events.onKill?.(e, 'raised');
    }

    switch (this.stage) {
      case 'absent':
        if (onThrone) this.seatNew();
        break;
      case 'seated':
        // Back on its throne still wounded (Mortal Strike), it heals once the wound ends.
        if (this.warden && this.warden.heals && this.warden.hp < this.warden.maxHp) this.warden.recover();
        if (!onThrone) this.empty();
        else if (here && plan.through(you.feet.x, you.feet.z)) this.rise();
        break;
      case 'fighting': {
        const w = this.warden!;
        if (!w.alive) this.beaten();
        else if (!here || plan.outside(you.feet.x, you.feet.z)) this.reset();
        break;
      }
      case 'resetting': {
        const w = this.warden!;
        if (!w.seated && flat(w.position, plan.front) < CONFIG.camps.home) w.sitDown(plan.seat, CONFIG.warden.hall.sit);
        if (w.state === 'seated') this.stage = 'seated';
        break;
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.update(dt, ctx)) continue;
      e.root.removeFromParent();
      this.enemies.splice(i, 1);
    }
    keepApart(this.enemies, ctx.playerFeet, ctx.ground);
    for (const e of this.enemies) if (e.alive) plan.keepIn(e.position, e.def.radius);
  }

  /** A fresh Warden on its throne. */
  private seatNew(): void {
    const { seat } = this.plan;
    const { level, hp } = CONFIG.warden.hall;
    const w = createEnemy('warden', seat.x, seat.z, { level, def: { ...CONFIG.enemies.warden, hp } });
    w.position.y = this.ctx.ground.heightAt(seat.x, seat.z);
    w.sit(seat);
    w.post = this.post;
    this.warden = w;
    this.add(w);
    this.stage = 'seated';
  }

  /** Nobody on the throne. */
  private empty(): void {
    const w = this.warden;
    if (w) {
      w.root.removeFromParent();
      this.enemies.splice(this.enemies.indexOf(w), 1);
    }
    this.warden = null;
    this.stage = 'absent';
  }

  /** It stands up to fight. */
  private rise(): void {
    const w = this.warden!;
    this.post.evading = false;
    w.standDown(null);
    w.standUp(this.plan.front, CONFIG.warden.hall.stand);
    this.stage = 'fighting';
    this.limitMelee(true);
    this.events.onRise?.(w);
  }

  /** You left or fell: what it raised crumbles, and it walks back to its throne whole, untouchable. */
  private reset(): void {
    const w = this.warden!;
    this.crumbleRaised();
    w.recover();
    this.post.evading = true;
    w.standDown(this.post);
    this.stage = 'resetting';
    this.limitMelee(false);
  }

  /** It fell: what it raised crumbles with it, and the throne is empty for good. */
  private beaten(): void {
    this.crumbleRaised();
    this.events.onKill?.(this.warden!, 'warden');
    this.warden = null;
    this.stage = 'absent';
    this.limitMelee(false);
  }

  /**
   * While it fights, only `CONFIG.warden.hall.melee` of everyone may swing at
   * you at once (those already holding a turn keep it for their blow); after,
   * the camps' own number again.
   */
  private limitMelee(fighting: boolean): void {
    this.pools.melee.max = fighting ? CONFIG.warden.hall.melee : CONFIG.camps.tokens.melee;
  }

  private crumbleRaised(): void {
    for (const e of this.raised) {
      e.crumble();
      this.events.onCrumble?.(e);
    }
    this.raised.clear();
  }

  /** The Warden calls up the dead round you, as in the arena: its own family's, at its level, in no camp, paying nothing. */
  private summon(from: Enemy, count: number): void {
    const { ctx } = this;
    const feet = ctx.playerFeet;
    const spots: Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const ring = CONFIG.warden.summonRing;
      const p = new Vector3(feet.x + Math.sin(a) * ring, 0, feet.z + Math.cos(a) * ring);
      const r = CONFIG.enemies.grunt.radius + 0.3;
      ctx.ground.resolve(p, r);
      this.plan.keepIn(p, r);
      p.y = ctx.ground.heightAt(p.x, p.z);
      const e = createEnemy('grunt', p.x, p.z, { level: CONFIG.warden.hall.level, family: from.family, variant: Math.floor(Math.random() * 6) });
      e.position.y = p.y;
      e.root.rotation.y = Math.atan2(feet.x - p.x, feet.z - p.z);
      this.raised.add(e);
      this.add(e);
      spots.push(p);
    }
    this.events.onSummon?.(from, spots);
  }

  private add(e: Enemy): void {
    this.enemies.push(e);
    this.root.add(e.root);
  }
}
