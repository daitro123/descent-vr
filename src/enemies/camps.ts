import { Group, Vector3 } from 'three';
import { CONFIG } from '../config';
import type { CampPlan, PostPlan } from '../maps/types';
import type { Interior } from '../save/record';
import { NO_STORY, type Story, there } from '../story';
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
// `standDown` and `chaseSpeed` hooks. The starting zone's camps stand from the
// start; any other zone's are raised a member a frame as you come near and laid
// to rest once you've gone and they're calm, the way the chunks round you are
// built and dropped (CONFIG.population). A camp can come or go with the quests,
// or leave you be until one turns it (story.ts).

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
  /** Laid to rest while you're far off, with no bodies: a lazy camp's, until you come near. */
  private sleeping: boolean;

  constructor(
    readonly plan: CampPlan,
    /** Raise one member's body at its post. */
    private readonly raise: (post: PostPlan, at: EnemyPost) => Enemy,
    private readonly events: CampEvents,
    /** The ground its members stand on: in the mine, rock blocks their noticing you and bringing each other. */
    private readonly ground: Ground,
    /** Raised only while you're near, a member at a time (another zone's than the starting zone's); asleep until then. */
    readonly lazy = false,
    /** Where the quests stand: whether it's there, and whether it leaves you be. */
    private readonly story: Story = NO_STORY,
  ) {
    this.root.name = plan.id;
    this.patrol = plan.road ? new PatrolWalk(plan.road, plan.posts.length) : null;
    this.sleeping = lazy;
    if (!lazy) this.fill();
  }

  /** Is any of it fighting you? (Walking home doesn't count.) */
  get fighting(): boolean {
    return this.members.some((m) => m.mind === 'fight');
  }

  /** Raised and thinking, or being raised; not laid to rest. */
  get awake(): boolean {
    return !this.sleeping;
  }

  /** Is every member that's raised at their post or fallen: nobody fighting or walking home? */
  get calm(): boolean {
    return this.members.every((m) => m.mind === 'idle' || m.mind === 'dead');
  }

  /** Is it there, as the quests stand (its plan's `from` and `until`)? */
  get there(): boolean {
    return there(this.plan, this.story);
  }

  /** How many of its members are still to be raised while it fills: a lazy camp's, a member a frame. */
  get unraised(): number {
    return this.sleeping ? 0 : this.plan.posts.length - this.members.length;
  }

  /** How far you are from it: from its clearing's edge, or from a patrol's road. */
  away(you: { readonly x: number; readonly z: number }): number {
    const { place, road } = this.plan;
    return road ? fromRoad(road, you.x, you.z) : flat(place, you) - place.r;
  }

  /** Everyone back at their posts, freshly raised (a patrol at its road's start): at once, or for a lazy camp a member at a time. */
  private fill(): void {
    this.refillIn = null;
    this.members.length = 0;
    this.patrol?.reset();
    if (!this.lazy) while (this.raiseNext());
  }

  /** Raise its next member at their post while it fills: true if there was one to raise. */
  raiseNext(): boolean {
    const i = this.members.length;
    const plan = this.plan.posts[i];
    if (this.sleeping || !plan) return false;
    const post: EnemyPost = { x: plan.x, z: plan.z, yaw: plan.yaw, evading: false };
    if (this.patrol) {
      this.patrol.spot(i, post);
      post.pace = CONFIG.camps.patrol.speed;
    }
    const enemy = this.raise(plan, post);
    this.root.add(enemy.root);
    this.members.push({ plan, post, enemy, mind: 'idle', hp: enemy.hp, nearest: 0, stalled: 0 });
    return true;
  }

  /**
   * Lay it to rest, you being far off (`Camps` takes its bodies away). One
   * still standing fills afresh when it wakes; a cleared one's refill goes on
   * counting down while it sleeps.
   */
  rest(): void {
    this.sleeping = true;
    const cleared = this.members.length > 0 && this.members.every((m) => m.mind === 'dead');
    if (!cleared) {
      this.members.length = 0;
      this.refillIn = null;
    }
  }

  /** Wake as you come near: one that wasn't cleared fills, a member at a time. */
  wake(): void {
    this.sleeping = false;
    if (this.members.length === 0) this.fill();
  }

  /** Asleep a while: a cleared camp's refill counts down. */
  doze(dt: number): void {
    if (this.refillIn !== null) this.refillIn = Math.max(0, this.refillIn - dt);
  }

  /** Decide who notices you, who comes along, who gives up, and whether it refills. */
  think(dt: number, you: You): void {
    // Asleep, or still being raised: everyone stands where they're raised.
    if (this.sleeping || this.unraised > 0) return;
    const { notice, leash, home, stuck } = CONFIG.camps;
    // It fights you only where it is: out of doors, or in the mine.
    const here = you.alive && you.interior === (this.plan.interior ?? null);
    // Until its quest turns it, it notices you only once you hurt it.
    const { neutralUntil } = this.plan;
    const wary = !neutralUntil || this.story.reached(neutralUntil);
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
          if (here && (hurt || (wary && flat(e.position, you.feet) < notice && this.sees(e.position, you.feet)))) this.engage(m);
          // Home still wounded, it heals once the wound ends.
          else if (e.heals && e.hp < e.maxHp) e.hp = m.hp = e.maxHp;
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
            // Home whole, unless Mortal Strike's wound still holds.
            if (e.heals) e.hp = e.maxHp;
            m.hp = e.hp;
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
    const away = this.away(you.feet);
    // The mine's only once you've also left it; one gone with its quest, never.
    const inside = this.plan.interior !== undefined && you.interior === this.plan.interior;
    if (this.refillIn <= 0 && away >= refillAway && !inside && this.there) this.fill();
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
  private readonly list: Camp[] = [];
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
    private readonly hooks: CampHooks,
    private readonly events: CampEvents = {},
    /** Where the quests stand: which camps are there, and which leave you be. */
    private readonly story: Story = NO_STORY,
  ) {
    this.root.name = 'camps';
    this.add(plans, ground);
  }

  /** Every camp, in the order they were added. */
  get camps(): readonly Camp[] {
    return this.list;
  }

  /**
   * Add camps: a zone's, as it's loaded. `lazy` ones (any zone's but the
   * starting zone's, and any that comes or goes with a quest) sleep until you
   * come near them.
   */
  add(plans: readonly CampPlan[], ground: Ground | ((plan: CampPlan) => Ground), lazy = false): void {
    for (const plan of plans) {
      const floor = this.floorOf(typeof ground === 'function' ? ground(plan) : ground);
      const comesAndGoes = plan.from !== undefined || plan.until !== undefined;
      const camp = new Camp(plan, (post, at) => this.raise(plan.level, post, at, floor), this.events, floor.ctx.ground, lazy || comesAndGoes, this.story);
      this.root.add(camp.root);
      this.list.push(camp);
    }
  }

  private floorOf(g: Ground): Floor {
    let floor = this.floors.get(g);
    if (!floor) {
      const ctx: EnemyContext = {
        ...this.hooks,
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
  }

  /** Is anything fighting you? (Enemies walking home don't count.) */
  get fighting(): boolean {
    return this.list.some((c) => c.fighting);
  }

  /** Wake every lazy camp near `you` and raise it whole at once (loading in, waking after a death). */
  fill(you: { readonly x: number; readonly z: number }): void {
    for (const camp of this.list) {
      if (!camp.lazy || !camp.there || camp.away(you) >= CONFIG.population.near) continue;
      if (!camp.awake) camp.wake();
      while (camp.raiseNext());
    }
  }

  update(dt: number, you: You): void {
    for (const { ctx } of this.floors.values()) {
      ctx.playerFeet.copy(you.feet);
      ctx.playerHead.copy(you.head);
      ctx.playerSword = you.alive ? you.sword : null;
    }
    this.wakeAndSleep(dt, you.feet);
    for (const camp of this.list) camp.think(dt, you);
    this.meleeTokens.update(dt);
    this.rangedTokens.update(dt);
    for (const { ctx, enemies } of this.floors.values()) {
      for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        if (!enemy.update(dt, ctx)) {
          enemy.root.removeFromParent();
          enemy.rig.mesh.geometry.dispose();
          enemies.splice(i, 1);
          this.enemies.splice(this.enemies.indexOf(enemy), 1);
        }
      }
      keepApart(enemies, ctx.playerFeet, ctx.ground);
    }
  }

  /**
   * The lazy camps: each that's there wakes as you come within
   * CONFIG.population.near, and sleeps once it's calm and you're `hysteresis`
   * farther (or it's gone with its quest and its fallen have fallen). Waking
   * camps are raised a few members a frame between them, nearest camp first.
   */
  private wakeAndSleep(dt: number, you: Vector3): void {
    const { near, hysteresis, perFrame } = CONFIG.population;
    let budget = perFrame;
    for (const camp of this.list) {
      if (!camp.lazy) continue;
      const away = camp.away(you);
      const present = camp.there;
      if (!camp.awake) {
        if (present && away < near) camp.wake();
        else camp.doze(dt);
      } else if (camp.calm && (present ? away >= near + hysteresis : !this.falling(camp))) {
        // Far off; or gone with its quest, once its fallen have fallen, in view or not.
        this.sleep(camp);
      }
    }
    while (budget > 0) {
      let next: Camp | null = null;
      for (const camp of this.list) if (camp.unraised > 0 && (!next || camp.away(you) < next.away(you))) next = camp;
      if (!next) break;
      next.raiseNext();
      budget--;
    }
  }

  /** Is any of `camp`'s fallen still falling (toppling, sinking, its bones flying)? */
  private falling(camp: Camp): boolean {
    return camp.members.some((m) => !m.enemy.alive && this.enemies.includes(m.enemy));
  }

  /** Lay `camp` to rest: its bodies, standing or fallen, are taken away. */
  private sleep(camp: Camp): void {
    for (const m of camp.members) this.bury(m.enemy);
    camp.rest();
  }

  /** Take `enemy`'s body out of the world, if it's still in it. */
  private bury(enemy: Enemy): void {
    const i = this.enemies.indexOf(enemy);
    if (i < 0) return;
    this.enemies.splice(i, 1);
    for (const floor of this.floors.values()) {
      const k = floor.enemies.indexOf(enemy);
      if (k >= 0) floor.enemies.splice(k, 1);
    }
    enemy.root.removeFromParent();
    enemy.rig.mesh.geometry.dispose();
  }

  /** A member's body at its post, in its family's looks, at its level (its camp's, unless its own) and with a camp's strength, running to keep up once it fights. */
  private raise(level: number, plan: PostPlan, post: EnemyPost, floor: Floor): Enemy {
    const enemy = createEnemy(plan.behaviour, post.x, post.z, {
      level: plan.level ?? level,
      inCamp: true,
      family: plan.family,
      variant: plan.variant ?? (plan.behaviour === 'biter' ? 0 : Math.floor(Math.random() * 6)),
      named: plan.named,
    });
    enemy.post = post;
    enemy.chaseSpeed = CONFIG.camps.chaseSpeed;
    enemy.position.y = floor.ctx.ground.heightAt(post.x, post.z);
    enemy.root.rotation.y = post.yaw;
    this.enemies.push(enemy);
    floor.enemies.push(enemy);
    return enemy;
  }
}
