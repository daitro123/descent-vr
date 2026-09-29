import { Group, Vector3 } from 'three';
import { CONFIG } from '../config';
import type { CampPlan, PostPlan } from '../maps/types';
import type { Interior } from '../save/record';
import type { Ground } from '../world/ground';
import { type Enemy, type EnemyContext, type EnemyPost, keepApart, type PlayerSword } from './enemy';
import { createEnemy } from './kinds';
import { fromRoad, PatrolWalk } from './patrol';
import { AttackTokens } from './tokens';

// The Adventure's enemies wait in camps, as in WoW: each at its post until
// you come close or hurt it, then it fights and brings whoever of its camp
// stands near it. Walk away and it chases at your pace until it's too far
// from its post, then it walks home untouchable and heals. A cleared camp
// fills again a while later, once you're well away. A patrol is a camp whose
// posts walk a road (patrol.ts). The brain is the `?camp` prototype's rule A
// (in history at merge 1135338), driving enemies through their `post`,
// `standDown` and `chaseSpeed` hooks.

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
  /**
   * The building you're in, or the mine, if any. A camp fights you only where
   * it is: none outdoors follows you in, and the mine's undead never follow
   * you out of its mouth.
   */
  interior: Interior | null;
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
  /** Its members' bodies, standing or falling: shown or hidden with where it is. */
  readonly root = new Group();
  /** Seconds until it refills, once every member has fallen; null while any stands. */
  private refillIn: number | null = null;
  /** A patrol's walk along its road; null for a camp that stands. */
  readonly patrol: PatrolWalk | null;

  constructor(
    readonly plan: CampPlan,
    /** Raise one member's body at its post. */
    private readonly raise: (post: PostPlan, at: EnemyPost) => Enemy,
    private readonly events: CampEvents,
    /** The ground its members stand on: in the mine, rock blocks their noticing you and bringing each other. */
    private readonly ground: Ground,
  ) {
    this.root.name = plan.id;
    this.patrol = plan.road ? new PatrolWalk(plan.road, plan.posts.length) : null;
    this.fill();
  }

  /** Is any of it fighting you? (Walking home doesn't count.) */
  get fighting(): boolean {
    return this.members.some((m) => m.mind === 'fight');
  }

  /** Everyone back at their posts, freshly raised (a patrol at its road's start). */
  private fill(): void {
    this.refillIn = null;
    this.members.length = 0;
    this.patrol?.reset();
    for (const [i, plan] of this.plan.posts.entries()) {
      const post: EnemyPost = { x: plan.x, z: plan.z, yaw: plan.yaw, evading: false };
      if (this.patrol) {
        this.patrol.spot(i, post);
        post.pace = CONFIG.camps.patrol.speed;
      }
      const enemy = this.raise(plan, post);
      this.root.add(enemy.root);
      this.members.push({ plan, post, enemy, mind: 'idle', hp: enemy.hp, nearest: 0, stalled: 0 });
    }
  }

  /** Decide who notices you, who comes along, who gives up, and whether it refills. */
  think(dt: number, you: You): void {
    const { notice, leash, home, stuck } = CONFIG.camps;
    // It fights you only where it is: out of doors, or in the mine.
    const here = you.alive && you.interior === (this.plan.interior ?? null);
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
          if (here && (hurt || (flat(e.position, you.feet) < notice && this.sees(e.position, you.feet)))) this.engage(m);
          break;
        case 'fight':
          if (!here || flat(e.position, m.post) > leash) this.sendHome(m);
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
    this.walkOn(dt);
    this.updateRefill(dt, you);
  }

  /**
   * A patrol walks on while all of it that stands is calm and keeping up. The
   * file holds where it is while any of it fights or walks home, so a jumped
   * patrol's leash runs from where it was jumped, and that's where it walks
   * home to before it walks on.
   */
  private walkOn(dt: number): void {
    const walk = this.patrol;
    if (!walk) return;
    const { keepUp } = CONFIG.camps.patrol;
    for (const m of this.members) {
      if (m.mind === 'dead') continue;
      if (m.mind !== 'idle' || flat(m.enemy.position, m.post) > keepUp) return;
    }
    walk.step(dt, this.members.map((m) => m.mind !== 'dead'));
    this.members.forEach((m, i) => walk.spot(i, m.post));
  }

  /** Start fighting, and bring every idle member within a pull of it. */
  private engage(m: Member): void {
    this.fight(m);
    for (const o of this.members) {
      if (o.mind === 'idle' && flat(m.enemy.position, o.enemy.position) < CONFIG.camps.pull && this.sees(m.enemy.position, o.enemy.position)) this.fight(o);
    }
  }

  /** Is there a clear line from a to b? Outdoors it doesn't matter; in the mine, rock blocks it. */
  private sees(a: Vector3, b: Vector3): boolean {
    return !this.plan.interior || this.ground.lineOfSight(a, b);
  }

  private fight(m: Member): void {
    if (this.patrol) {
      // A patrol's member is jumped wherever it is on its road: its leash runs from there, and it walks home there.
      m.post.x = m.enemy.position.x;
      m.post.z = m.enemy.position.z;
    }
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
    const { place, road } = this.plan;
    const away = road ? fromRoad(road, you.feet.x, you.feet.z) : flat(place, you.feet) - place.r;
    // The mine's only once you've also left it.
    const inside = this.plan.interior !== undefined && you.interior === this.plan.interior;
    if (this.refillIn <= 0 && away >= refillAway && !inside) this.fill();
  }
}

/** The enemies standing on one ground, stepped through its own `EnemyContext`. */
interface Floor {
  readonly ctx: EnemyContext;
  readonly enemies: Enemy[];
}

/**
 * Every camp in the Adventure and their enemies' bodies. It raises them,
 * steps them through an `EnemyContext` whose ground is theirs (the world's,
 * or the mine's for its undead), and keeps them apart. One pool of attack
 * tokens spans every camp, so however many camps you pull, only so many
 * swing and shoot at once.
 */
export class Camps {
  /** The enemies' bodies, a group per camp: add it to the scene. */
  readonly root = new Group();
  readonly camps: readonly Camp[];
  /** Every body in the world: waiting, fighting, walking home, or falling. */
  readonly enemies: Enemy[] = [];
  readonly meleeTokens = new AttackTokens(CONFIG.camps.tokens.melee, CONFIG.tokens.meleeGap);
  readonly rangedTokens = new AttackTokens(CONFIG.camps.tokens.ranged, CONFIG.tokens.rangedGap);
  /** The bodies by the ground they stand on, each with its context. */
  private readonly floors = new Map<Ground, Floor>();

  constructor(
    plans: readonly CampPlan[],
    /** The ground every camp stands on, or each camp's own (the mine's undead stand on the mine's). */
    ground: Ground | ((plan: CampPlan) => Ground),
    hooks: CampHooks,
    events: CampEvents = {},
  ) {
    this.root.name = 'camps';
    const floorOf = (g: Ground): Floor => {
      let floor = this.floors.get(g);
      if (!floor) {
        const ctx: EnemyContext = {
          ...hooks,
          playerFeet: new Vector3(),
          playerHead: new Vector3(),
          playerSword: null,
          summon: () => {},
          ground: g,
          meleeTokens: this.meleeTokens,
          rangedTokens: this.rangedTokens,
        };
        floor = { ctx, enemies: [] };
        this.floors.set(g, floor);
      }
      return floor;
    };
    this.camps = plans.map((plan) => {
      const floor = floorOf(typeof ground === 'function' ? ground(plan) : ground);
      const camp = new Camp(plan, (post, at) => this.raise(plan.level, post, at, floor), events, floor.ctx.ground);
      this.root.add(camp.root);
      return camp;
    });
  }

  /** Is anything fighting you? (Enemies walking home don't count.) */
  get fighting(): boolean {
    return this.camps.some((c) => c.fighting);
  }

  update(dt: number, you: You): void {
    for (const { ctx } of this.floors.values()) {
      ctx.playerFeet.copy(you.feet);
      ctx.playerHead.copy(you.head);
      ctx.playerSword = you.alive ? you.sword : null;
    }
    for (const camp of this.camps) camp.think(dt, you);
    this.meleeTokens.update(dt);
    this.rangedTokens.update(dt);
    for (const { ctx, enemies } of this.floors.values()) {
      for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        if (!enemy.update(dt, ctx)) {
          enemy.root.removeFromParent();
          enemies.splice(i, 1);
          this.enemies.splice(this.enemies.indexOf(enemy), 1);
        }
      }
      keepApart(enemies, ctx.playerFeet, ctx.ground);
    }
  }

  /** A member's body at its post, in its family's looks, at its level (its camp's, unless its own) and with a camp's strength, running to keep up once it fights. */
  private raise(level: number, plan: PostPlan, post: EnemyPost, floor: Floor): Enemy {
    const enemy = createEnemy(plan.behaviour, post.x, post.z, { level: plan.level ?? level, inCamp: true, family: plan.family, variant: Math.floor(Math.random() * 6) });
    enemy.post = post;
    enemy.chaseSpeed = CONFIG.camps.chaseSpeed;
    enemy.position.y = floor.ctx.ground.heightAt(post.x, post.z);
    enemy.root.rotation.y = post.yaw;
    this.enemies.push(enemy);
    floor.enemies.push(enemy);
    return enemy;
  }
}
