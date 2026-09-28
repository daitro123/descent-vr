import type { Vector3 } from 'three';
import type { EnemyKind } from '../../models/characters';
import type { Enemy, EnemyPost } from '../enemy';

// PROTOTYPE (Enemies in the open): the camp's brain. A camp is a group of
// enemies at one place, each with a post it waits at; the camp decides when
// each one notices you, who comes with it, when it gives up and walks home,
// and when a cleared camp fills again. A patrol is a camp whose posts walk a
// road. The three ways of deciding (`RULES`) are what `?camp` switches
// between; everything else is shared.

/** What an enemy in a camp is doing: the marker over its head says so. */
export type Mind = 'idle' | 'alert' | 'fight' | 'home' | 'dead';

export interface Member {
  kind: EnemyKind;
  /** Where it waits; the same object the enemy walks back to. */
  post: EnemyPost;
  enemy: Enemy | null;
  mind: Mind;
  /** Seconds in this mind. */
  t: number;
  /** Seconds since it last saw you (sight and alarm). */
  unseen: number;
  /** Health last frame, to tell when it's been hurt. */
  hp: number;
}

/** What the camp can know about you. */
export interface Senses {
  /** Your feet. */
  player: Vector3;
  playerAlive: boolean;
  /** Is there a clear line between an enemy standing at `from` and you? */
  clearLine(from: Vector3): boolean;
}

export interface Rules {
  key: string;
  name: string;
  /** One line on how it behaves, for the switch-over card. */
  how: string;
  /** The leash, in words, for the readout. */
  leash: string;
  /** Does this waiting enemy notice you? */
  notices(m: Member, camp: Camp, s: Senses): boolean;
  /** Seconds it stands alert ("?") before it fights; 0 goes straight in. */
  alertTime: number;
  /** `from` just started fighting: does `other`, still waiting, come too? */
  joins(from: Member, other: Member, camp: Camp): boolean;
  /** Does this fighting enemy give up and walk home? */
  givesUp(m: Member, camp: Camp, s: Senses): boolean;
}

/** m/s a fighting enemy runs to catch up with you: your own walking pace. */
export const CHASE_SPEED = 2.2;
/** Seconds after a camp is cleared before it refills (shortened to test it). */
export const REFILL_TIME = 60;
/** A camp only refills while you're at least this far off, so nobody appears in front of you. */
export const REFILL_AWAY = 30;

const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** Angle (radians) between where an enemy faces and the direction to you. */
function offFacing(e: Enemy, p: Vector3): number {
  const want = Math.atan2(p.x - e.position.x, p.z - e.position.z);
  const d = want - e.root.rotation.y;
  return Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
}

export const RULES: readonly Rules[] = [
  {
    key: 'A',
    name: 'One at a time',
    how: 'Each enemy notices you within 8 m and brings anyone within 6 m of it. It chases until it is 30 m from its post, then walks home untouchable and heals.',
    leash: 'each gives up 30 m from its post',
    notices: (m, _c, s) => flat(m.enemy!.position, s.player) < 8,
    alertTime: 0,
    joins: (from, other) => flat(from.enemy!.position, other.enemy!.position) < 6,
    givesUp: (m) => flat(m.enemy!.position, m.post) > 30,
  },
  {
    key: 'B',
    name: 'The whole camp',
    how: "Step into the camp's clearing (or hurt anyone) and the whole camp comes. Get 24 m clear of it and they all walk home together, untouchable, and heal.",
    leash: 'all give up when you are 24 m out',
    notices: (_m, c, s) =>
      c.route
        ? c.members.some((o) => o.enemy?.alive && flat(o.enemy.position, s.player) < 8)
        : flat(c.centre, s.player) < c.ring,
    alertTime: 0,
    joins: () => true,
    givesUp: (_m, c, s) => flat(c.anchor, s.player) > 24,
  },
  {
    key: 'C',
    name: 'Sight and alarm',
    how: "Each enemy sees 16 m ahead in a wide cone, but not through trees or behind it; it hears you within 3 m. It stops (?), then shouts (!) and everyone within 15 m comes. Lose them for 6 s and they walk home.",
    leash: 'each gives up 6 s after losing you',
    notices: (m, _c, s) => {
      const e = m.enemy!;
      const d = flat(e.position, s.player);
      if (d < 3) return true;
      return d < 16 && offFacing(e, s.player) < Math.PI / 3 && s.clearLine(e.position);
    },
    alertTime: 0.8,
    joins: (from, other) => flat(from.enemy!.position, other.enemy!.position) < 15,
    givesUp: (m) => m.unseen > 6 || flat(m.enemy!.position, m.post) > 40,
  },
];

export interface PostSpec {
  kind: EnemyKind;
  x: number;
  z: number;
  /** A point it faces while it waits. */
  face: [number, number];
}

export interface CampSpec {
  name: string;
  centre: { x: number; z: number };
  /** Radius of its clearing: stepping inside counts as walking into the camp. */
  ring: number;
  posts: PostSpec[];
  /** A patrol walks this road back and forth instead of standing at `posts`. */
  route?: [number, number][];
}

const PATROL_SPEED = 0.8; // m/s
const PATROL_GAP = 1.8; // m between walkers
const PATROL_PAUSE = 3; // s at each end of the road

export class Camp {
  readonly name: string;
  readonly centre: { x: number; z: number };
  readonly ring: number;
  readonly route: [number, number][] | null;
  members: Member[] = [];
  /** Where the leash is measured from: the centre, or where a patrol was jumped. */
  readonly anchor = { x: 0, z: 0 };
  /** Seconds left until it refills, once cleared; null while anyone stands. */
  refillIn: number | null = null;
  private along = 0; // patrol: metres along the route
  private heading = 1;
  private pause = 0;
  private readonly length: number;

  constructor(
    private spec: CampSpec,
    /** Raise one enemy at its post (the scaffold owns the scene). */
    private readonly spawn: (kind: EnemyKind, post: EnemyPost) => Enemy,
  ) {
    this.name = spec.name;
    this.centre = spec.centre;
    this.ring = spec.ring;
    this.route = spec.route ?? null;
    this.length = this.route ? routeLength(this.route) : 0;
    this.fill();
  }

  /** Every enemy it would have, standing or not. */
  get size(): number {
    return this.members.length;
  }

  count(mind: Mind): number {
    return this.members.filter((m) => m.mind === mind).length;
  }

  /** Everyone back at their posts, freshly raised. */
  fill(spec: CampSpec = this.spec): void {
    this.spec = spec;
    this.along = (spec.posts.length - 1) * PATROL_GAP;
    this.heading = 1;
    this.pause = 0;
    this.refillIn = null;
    this.anchor.x = this.centre.x;
    this.anchor.z = this.centre.z;
    this.members = spec.posts.map((p) => ({
      kind: p.kind,
      post: { x: p.x, z: p.z, yaw: Math.atan2(p.face[0] - p.x, p.face[1] - p.z), evading: false },
      enemy: null,
      mind: 'idle' as Mind,
      t: 0,
      unseen: 0,
      hp: 0,
    }));
    if (this.route) this.walkPosts(this.along);
    for (const m of this.members) {
      m.enemy = this.spawn(m.kind, m.post);
      m.hp = m.enemy.hp;
    }
  }

  update(dt: number, rules: Rules, s: Senses): void {
    for (const m of this.members) {
      m.t += dt;
      const e = m.enemy;
      if (!e || m.mind === 'dead') continue;
      if (!e.alive) {
        this.set(m, 'dead');
        continue;
      }
      const hurt = e.hp < m.hp;
      m.hp = e.hp;
      if (m.mind === 'fight' || m.mind === 'alert') {
        if (s.clearLine(e.position) && flat(e.position, s.player) < 25) m.unseen = 0;
        else m.unseen += dt;
      }
      switch (m.mind) {
        case 'idle':
          if (!s.playerAlive) break;
          if (hurt) this.engage(m, rules);
          else if (rules.notices(m, this, s)) {
            if (rules.alertTime > 0) this.set(m, 'alert');
            else this.engage(m, rules);
          }
          break;
        case 'alert':
          // Stops and turns to look at you.
          m.post.yaw = Math.atan2(s.player.x - e.position.x, s.player.z - e.position.z);
          if (!s.playerAlive) this.set(m, 'idle');
          else if (hurt || m.t >= rules.alertTime) this.engage(m, rules);
          break;
        case 'fight':
          if (!s.playerAlive || rules.givesUp(m, this, s)) this.sendHome(m);
          break;
        case 'home':
          if (flat(e.position, m.post) < 0.5) {
            e.hp = e.maxHp;
            m.hp = e.hp;
            m.post.evading = false;
            this.set(m, 'idle');
          }
          break;
      }
    }
    if (this.route) this.patrol(dt);
    this.updateRefill(dt, s);
  }

  /** Start fighting, and bring whoever the rules say comes too. */
  private engage(m: Member, rules: Rules): void {
    if (this.members.every((o) => o.mind !== 'fight') && m.enemy) {
      // A fresh fight: the leash is measured from here (the camp's centre, or where a patrol was jumped).
      this.anchor.x = this.route ? m.enemy.position.x : this.centre.x;
      this.anchor.z = this.route ? m.enemy.position.z : this.centre.z;
    }
    this.fight(m);
    for (const o of this.members) {
      if (o !== m && o.enemy && (o.mind === 'idle' || o.mind === 'alert') && rules.joins(m, o, this)) this.fight(o);
    }
  }

  private fight(m: Member): void {
    this.set(m, 'fight');
    m.unseen = 0;
    m.post.evading = false;
    m.enemy!.chaseSpeed = CHASE_SPEED;
    m.enemy!.standDown(null);
  }

  private sendHome(m: Member): void {
    this.set(m, 'home');
    m.post.evading = true;
    m.enemy!.standDown(m.post);
  }

  private set(m: Member, mind: Mind): void {
    m.mind = mind;
    m.t = 0;
  }

  private updateRefill(dt: number, s: Senses): void {
    const standing = this.members.some((m) => m.mind !== 'dead');
    if (standing) {
      this.refillIn = null;
      return;
    }
    if (this.refillIn === null) this.refillIn = REFILL_TIME;
    this.refillIn = Math.max(0, this.refillIn - dt);
    const home = this.route ? { x: this.route[0][0], z: this.route[0][1] } : this.centre;
    if (this.refillIn <= 0 && flat(home, s.player) > REFILL_AWAY) this.fill();
  }

  // ---------------------------------------------------------------- patrol

  /** Walk the road while everyone's calm and keeping up; pause at the ends. */
  private patrol(dt: number): void {
    const calm = this.members.every((m) => m.mind === 'idle' || m.mind === 'dead');
    const keepingUp = this.members.every((m) => m.mind === 'dead' || !m.enemy || flat(m.enemy.position, m.post) < 1.2);
    if (!calm || !keepingUp) return;
    if (this.pause > 0) {
      this.pause -= dt;
      return;
    }
    this.along += this.heading * PATROL_SPEED * dt;
    if (this.along >= this.length || this.along <= 0) {
      // Turn round: the last in the file leads the way back.
      this.heading *= -1;
      this.along = Math.max(0, Math.min(this.length, this.along)) + this.heading * (this.members.length - 1) * PATROL_GAP;
      this.members.reverse();
      this.pause = PATROL_PAUSE;
    }
    this.walkPosts(this.along);
  }

  /** The leader's post at `along`, the rest in file behind it, all facing the way they walk. */
  private walkPosts(along: number): void {
    this.members.forEach((m, i) => {
      const [x, z, dx, dz] = pointAlong(this.route!, along - this.heading * i * PATROL_GAP);
      m.post.x = x;
      m.post.z = z;
      m.post.yaw = Math.atan2(dx * this.heading, dz * this.heading);
    });
  }
}

function routeLength(route: [number, number][]): number {
  let len = 0;
  for (let i = 1; i < route.length; i++) len += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
  return len;
}

/** Point and unit direction `d` metres along the route (clamped to its ends). */
function pointAlong(route: [number, number][], d: number): [number, number, number, number] {
  let left = Math.max(0, d);
  for (let i = 1; i < route.length; i++) {
    const [x0, z0] = route[i - 1];
    const [x1, z1] = route[i];
    const seg = Math.hypot(x1 - x0, z1 - z0);
    if (left <= seg || i === route.length - 1) {
      const t = Math.min(1, left / seg);
      return [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, (x1 - x0) / seg, (z1 - z0) / seg];
    }
    left -= seg;
  }
  return [route[0][0], route[0][1], 1, 0];
}
