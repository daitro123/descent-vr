import { Group, Vector3 } from 'three';
import { CONFIG } from '../config';
import type { CampPlan, PostPlan } from '../maps/types';
import type { Ground } from '../world/ground';
import { type Enemy, type EnemyContext, type EnemyPost, keepApart, type PlayerSword } from './enemy';
import { createEnemy } from './kinds';
import { AttackTokens } from './tokens';

// The Adventure's enemies wait in camps, as in WoW: each at its post until
// you come close or hurt it, then it fights and brings whoever of its camp
// stands near it. Walk away and it chases at your pace until it's too far
// from its post, then it walks home untouchable and heals. A cleared camp
// fills again a while later, once you're well away. The brain is the `?camp`
// prototype's rule A (in history at merge 1135338), driving enemies through
// their `post`, `standDown` and `chaseSpeed` hooks.

/** What a camp's member is doing. */
export type Mind = 'idle' | 'fight' | 'home' | 'dead';

export interface Member {
  readonly plan: PostPlan;
  /** Where it waits and walks home to: the same object its enemy holds as `post`. */
  readonly post: EnemyPost;
  /** Its body, standing or fallen (replaced when the camp refills). */
  enemy: Enemy;
  mind: Mind;
  /** Its health last frame, to tell when it's been hurt. */
  hp: number;
  /** Walking home: the nearest it has come to its post… */
  nearest: number;
  /** …and seconds since it last got nearer. */
  stalled: number;
}

/** You, as the camps sense you each frame. */
export interface You {
  feet: Vector3;
  head: Vector3;
  /** Your blade, for enemies' guards; null when untracked or down. */
  sword: PlayerSword | null;
  alive: boolean;
}

/** The fight's side of `EnemyContext`: where enemies' blows, slams and arrows land (Combat, in the game). No summons: a camp never holds a boss. */
export type CampHooks = Pick<EnemyContext, 'sweep' | 'slam' | 'shoot' | 'nock' | 'telegraph'>;

export interface CampEvents {
  /** One of a camp's members fell. */
  onKill?(camp: Camp, member: Member): void;
}

const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** One camp: its plan and its members' minds. `Camps` raises and steps their bodies. */
export class Camp {
  readonly members: Member[] = [];
  /** Seconds until it refills, once every member has fallen; null while any stands. */
  private refillIn: number | null = null;

  constructor(
    readonly plan: CampPlan,
    /** Raise one member's body at its post. */
    private readonly raise: (post: PostPlan, at: EnemyPost) => Enemy,
    private readonly events: CampEvents,
  ) {
    this.fill();
  }

  /** Is any of it fighting you? (Walking home doesn't count.) */
  get fighting(): boolean {
    return this.members.some((m) => m.mind === 'fight');
  }

  /** Everyone back at their posts, freshly raised. */
  private fill(): void {
    this.refillIn = null;
    this.members.length = 0;
    for (const plan of this.plan.posts) {
      const post: EnemyPost = { x: plan.x, z: plan.z, yaw: plan.yaw, evading: false };
      const enemy = this.raise(plan, post);
      this.members.push({ plan, post, enemy, mind: 'idle', hp: enemy.hp, nearest: 0, stalled: 0 });
    }
  }

  /** Decide who notices you, who comes along, who gives up, and whether it refills. */
  think(dt: number, you: You): void {
    const { notice, leash, home, stuck } = CONFIG.camps;
    for (const m of this.members) {
      const e = m.enemy;
      if (m.mind === 'dead') continue;
      if (!e.alive) {
        m.mind = 'dead';
        this.events.onKill?.(this, m);
        continue;
      }
      const hurt = e.hp < m.hp;
      m.hp = e.hp;
      switch (m.mind) {
        case 'idle':
          if (you.alive && (hurt || flat(e.position, you.feet) < notice)) this.engage(m);
          break;
        case 'fight':
          if (!you.alive || flat(e.position, m.post) > leash) this.sendHome(m);
          break;
        case 'home': {
          const d = flat(e.position, m.post);
          if (d < m.nearest - stuck.progress) {
            m.nearest = d;
            m.stalled = 0;
          } else m.stalled += dt;
          // No navmesh: one that can't find its way round something is put
          // back, once you're far enough off not to see it go.
          const lost = m.stalled > stuck.time && flat(e.position, you.feet) > stuck.away;
          if (lost) e.position.set(m.post.x, e.position.y, m.post.z);
          if (d < home || lost) {
            e.hp = m.hp = e.maxHp;
            m.post.evading = false;
            m.mind = 'idle';
          }
          break;
        }
      }
    }
    this.updateRefill(dt, you);
  }

  /** Start fighting, and bring every idle member within a pull of it. */
  private engage(m: Member): void {
    this.fight(m);
    for (const o of this.members) {
      if (o.mind === 'idle' && flat(m.enemy.position, o.enemy.position) < CONFIG.camps.pull) this.fight(o);
    }
  }

  private fight(m: Member): void {
    m.mind = 'fight';
    m.enemy.standDown(null);
  }

  private sendHome(m: Member): void {
    m.mind = 'home';
    m.nearest = flat(m.enemy.position, m.post);
    m.stalled = 0;
    m.post.evading = true;
    m.enemy.standDown(m.post);
  }

  private updateRefill(dt: number, you: You): void {
    if (this.members.some((m) => m.mind !== 'dead')) {
      this.refillIn = null;
      return;
    }
    const { refillTime, refillAway } = CONFIG.camps;
    this.refillIn = Math.max(0, (this.refillIn ?? refillTime) - dt);
    const { place } = this.plan;
    if (this.refillIn <= 0 && flat(place, you.feet) - place.r >= refillAway) this.fill();
  }
}

/**
 * Every camp in the Adventure and their enemies' bodies. It raises them,
 * steps them through one `EnemyContext` whose ground is the world's, and
 * keeps them apart. One pool of attack tokens spans every camp, so however
 * many camps you pull, only so many swing and shoot at once.
 */
export class Camps {
  /** The enemies' bodies: add it to the scene. */
  readonly root = new Group();
  readonly camps: readonly Camp[];
  /** Every body in the world: waiting, fighting, walking home, or falling. */
  readonly enemies: Enemy[] = [];
  readonly meleeTokens = new AttackTokens(CONFIG.camps.tokens.melee, CONFIG.tokens.meleeGap);
  readonly rangedTokens = new AttackTokens(CONFIG.camps.tokens.ranged, CONFIG.tokens.rangedGap);
  private readonly ctx: EnemyContext;

  constructor(plans: readonly CampPlan[], ground: Ground, hooks: CampHooks, events: CampEvents = {}) {
    this.root.name = 'camps';
    this.ctx = {
      ...hooks,
      playerFeet: new Vector3(),
      playerHead: new Vector3(),
      playerSword: null,
      summon: () => {},
      ground,
      meleeTokens: this.meleeTokens,
      rangedTokens: this.rangedTokens,
    };
    this.camps = plans.map((plan) => new Camp(plan, (post, at) => this.raise(plan.level, post, at), events));
  }

  /** Is anything fighting you? (Enemies walking home don't count.) */
  get fighting(): boolean {
    return this.camps.some((c) => c.fighting);
  }

  update(dt: number, you: You): void {
    const ctx = this.ctx;
    ctx.playerFeet.copy(you.feet);
    ctx.playerHead.copy(you.head);
    ctx.playerSword = you.alive ? you.sword : null;
    for (const camp of this.camps) camp.think(dt, you);
    this.meleeTokens.update(dt);
    this.rangedTokens.update(dt);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (!enemy.update(dt, ctx)) {
        this.root.remove(enemy.root);
        this.enemies.splice(i, 1);
      }
    }
    keepApart(this.enemies, ctx.playerFeet, ctx.ground);
  }

  /** A member's body at its post, in its family's looks, at its camp's level and with a camp's strength, running to keep up once it fights. */
  private raise(level: number, plan: PostPlan, post: EnemyPost): Enemy {
    const enemy = createEnemy(plan.behaviour, post.x, post.z, { level, inCamp: true, family: plan.family, variant: Math.floor(Math.random() * 6) });
    enemy.post = post;
    enemy.chaseSpeed = CONFIG.camps.chaseSpeed;
    enemy.position.y = this.ctx.ground.heightAt(post.x, post.z);
    enemy.root.rotation.y = post.yaw;
    this.enemies.push(enemy);
    this.root.add(enemy.root);
    return enemy;
  }
}
