import { Vector3 } from 'three';
import type { Atmosphere } from '../../world/atmosphere';
import { type Flame, type Frame, toFrame } from '../../world/interiors';
import type { MinePlan, MineStanding, ThronePlan } from '../../world/mine';
import type { CampPlan, PostPlan, Respawn } from '../types';
import { CONFIG } from '../../config';
import { BRAZIER_FIRE, torchLight } from '../../world/hall';
import { Colliders, UNBOUNDED } from './colliders';
import { floorOf, Hollow, type Piece } from './hollow';
import { type Shapes, toWorld } from './interiorPlan';
import { SKY } from './palette';

// The old mine: the plan only (what's dug where, what you bump into, its
// flames), in the mouth's own frame: origin on the floor at the mouth's
// middle, the way out (+Z) facing south down the rail bed, x across the
// mouth. mineModel.ts builds its meshes from the same numbers. The route runs
// in along the timbered adit, bends west into the cart hall and turns north
// through a short passage into the gallery. From the gallery's far end the
// bandits' rough ramp winds down north then east into their dig. A breach in
// the dig's east wall opens onto dressed stone: a carved passage slopes down
// south, turns east into the antechamber, and the hall's south gate is in the
// antechamber's north wall. The Warden's hall is the arena's crypt hall
// (world/hall.ts), 7 m below the mouth.

/** How a piece is finished: the old miners' timbered rock, the bandits' rough dig, the crypt's dressed stone, or the crypt hall's own (built by world/hall.ts). */
export type Finish = 'timbered' | 'dug' | 'dressed' | 'hall';

/** A piece of the mine: its open space and how it's finished. */
export interface MinePiece extends Piece {
  readonly finish: Finish;
  /** What the meshes call it, for the pieces they furnish. */
  readonly name?: PieceName;
}

/** The pieces the meshes furnish, by name. */
export type PieceName = 'cart hall' | 'gallery' | 'ramp east' | 'ramp north' | 'dig' | 'breach' | 'carved passage' | 'antechamber' | 'gate' | 'hall';

const { halfSize: HALL_HALF, wallHeight: HALL_HEIGHT, gate: HALL_GATE } = CONFIG.arena;
/** The Warden's hall's middle, on its floor: its south gate opens off the antechamber's north wall. */
const HALL = { x: 22, z: -45.4, floor: -7 };

/** Every number of the mine's layout, in the mouth's frame. */
export const MINE = {
  /** Tunnels: half their width, and floor to ceiling. */
  tunnel: { hw: 1.75, height: 3 },
  /** Metres of rock round the open space that are the mine's: its ground and walls reach this far. */
  rock: 2,
  /**
   * The open space, piece by piece. Pieces meet by overlapping or edge to
   * edge. The adit runs past the mouth's line so its walls reach the mouth's
   * timbers. The two ramps slope at 1 in 5.25, level where they meet their
   * neighbours.
   */
  pieces: [
    // The adit: 10 m straight in from the mouth…
    { x0: -1.75, x1: 1.75, z0: -11.75, z1: 1, floor: 0, height: 3, part: 0, open: ['south'], finish: 'timbered' },
    // …then bends west to the cart hall.
    { x0: -6.5, x1: 1.75, z0: -11.75, z1: -8.25, floor: 0, height: 3, part: 0, finish: 'timbered' },
    // The cart hall, level with the mouth, its roof on timber props.
    { x0: -18, x1: -6, z0: -15, z1: -5, floor: 0, height: 3.6, part: 1, finish: 'timbered', name: 'cart hall' },
    // A short passage north out of its far corner, so the gallery can't be seen from the adit.
    { x0: -17.25, x1: -13.75, z0: -19.5, z1: -14.5, floor: 0, height: 3, part: 1, finish: 'timbered' },
    // The gallery, long and tall where the old miners followed the vein.
    { x0: -19, x1: -12, z0: -35, z1: -19, floor: 0, height: 6, part: 2, finish: 'timbered', name: 'gallery' },
    // The head of the bandits' ramp, out of the gallery's far corner…
    { x0: -12, x1: -10, z0: -35, z1: -31.5, floor: 0, height: 3, part: 2, finish: 'dug' },
    // …which winds east down 2 m to a landing, out of sight of the cart hall…
    { x0: -10, x1: 4.5, z0: -35, z1: -31.5, floor: 0, height: 3, part: 3, slope: { axis: 'x', from: -9.5, to: 1, rise: -2 }, finish: 'dug', name: 'ramp east' },
    // …then north down 2 m more to their dig.
    { x0: 1, x1: 4.5, z0: -46.5, z1: -35, floor: -2, height: 3, part: 3, slope: { axis: 'z', from: -35.5, to: -46, rise: -2 }, finish: 'dug', name: 'ramp north' },
    // The dig: a rough cave where the bandits followed the silver.
    { x0: -3, x1: 9, z0: -56.5, z1: -46.5, floor: -4, height: 4.5, part: 4, finish: 'dug', name: 'dig' },
    // The breach: a hole through the crypt's wall in the dig's east wall…
    { x0: 9, x1: 10, z0: -54.5, z1: -52.5, floor: -4, height: 2.6, part: 4, finish: 'dressed', name: 'breach' },
    // …into the head of the carved passage, which turns south out of sight of the ramp.
    { x0: 10, x1: 13, z0: -55, z1: -51.5, floor: -4, height: 2.8, part: 4, finish: 'dressed' },
    // The carved passage, sloping south down 3 m…
    { x0: 10, x1: 13, z0: -51.5, z1: -31.5, floor: -4, height: 2.8, part: 5, slope: { axis: 'z', from: -50.5, to: -34.75, rise: -3 }, finish: 'dressed', name: 'carved passage' },
    // …turning east at its foot, out of its sight, into the antechamber.
    { x0: 13, x1: 18, z0: -34.5, z1: -31.5, floor: -7, height: 2.8, part: 6, finish: 'dressed' },
    { x0: 18, x1: 26, z0: -37, z1: -29, floor: -7, height: 3.6, part: 6, finish: 'dressed', name: 'antechamber' },
    // The hall's south gate, through the antechamber's north wall…
    { x0: HALL.x - HALL_GATE.width / 2, x1: HALL.x + HALL_GATE.width / 2, z0: HALL.z + HALL_HALF, z1: HALL.z + HALL_HALF + HALL_GATE.depth, floor: HALL.floor, height: HALL_GATE.height, part: 7, finish: 'hall', name: 'gate' },
    // …and the Warden's hall.
    { x0: HALL.x - HALL_HALF, x1: HALL.x + HALL_HALF, z0: HALL.z - HALL_HALF, z1: HALL.z + HALL_HALF, floor: HALL.floor, height: HALL_HEIGHT, part: 7, finish: 'hall', name: 'hall' },
  ] as readonly MinePiece[],
  parts: ['adit', 'cart hall', 'gallery', 'ramp', 'dig', 'passage', 'antechamber', 'hall'] as readonly string[],
  /**
   * The route's centre line: in at the mouth, round the bend, over the
   * turntable, through the passage, up the gallery to its far corner, down
   * the ramp to the landing and on to the dig, across it to the breach, down
   * the carved passage and through the antechamber to the hall's gate.
   */
  route: [
    [0, 0],
    [0, -10],
    [-6, -10],
    [-10.5, -10],
    [-15.5, -13.5],
    [-15.5, -19],
    [-15.5, -27],
    [-15.5, -33.25],
    [2.75, -33.25],
    [2.75, -46.5],
    [9, -53.5],
    [11.5, -53.5],
    [11.5, -33],
    [HALL.x, -33],
    [HALL.x, HALL.z + HALL_HALF],
  ] as readonly (readonly [number, number])[],
  /** The route's point at the adit's bend. */
  bend: 1,
  /** The route's point at the breach into the crypt, on the dig's side of it. */
  breach: 10,
  /** The timber sets along the tunnels: posts in the walls and a cap beam, every `every` m. */
  sets: { every: 2, post: 0.22, cap: 0.24 },
  /** The rails: from the mouth round the bend (on an arc of `turn` m) to the turntable. */
  rails: { gauge: 0.9, turn: 2.5, sleeper: 0.6 },
  /** The turntable where the rails end, flush with the floor. */
  turntable: { x: -10.5, z: -10, r: 1.1 },
  /** Two ore carts on a siding off the turntable to the south wall, which they're flush with. */
  carts: { x: -10.5, z: [-7.5, -6.05], hw: 0.5, hd: 0.55, siding: { x0: -11.1, x1: -9.9, z0: -8.2, z1: -5 } },
  /** A winch over a boarded-up shaft, in the hall's south-west corner. */
  winch: { x0: -18, x1: -15.4, z0: -7.6, z1: -5 },
  /** The bandits' camp in the hall's north-east: their brazier, crates in the corner, bedrolls on the floor. */
  brazier: { x: -9.3, z: -13.3, r: 0.45, height: 0.85 },
  crates: { x0: -7.4, x1: -6, z0: -15, z1: -13.8 },
  bedrolls: [
    [-11.4, -14.35, 0],
    [-7.9, -11.95, 1.57],
  ] as readonly (readonly [number, number, number])[],
  /** The hall's timber props, a body's width and more clear of everything. */
  props: [
    [-14.5, -9.8],
    [-8, -6.8],
    [-12.8, -13.6],
  ] as readonly (readonly [number, number])[],
  propRadius: 0.18,
  /** Scaffolding against the gallery's east wall (scenery, not climbable). */
  scaffold: { x0: -13.3, x1: -12, z0: -31, z1: -22.5, decks: [2, 4] },
  /** The bandits' crooked props down their ramp, sunk into its walls: where each stands along it (x on the first leg, z on the second). */
  ramp: { post: 0.16, cap: 0.2, first: [-6.5, -2], second: [-39.5, -43.5] },
  /**
   * What the bandits dropped in their dig: a strongbox of ore against its
   * north wall, two picks and a torn cloak on the floor, their lantern on its
   * side. The silver vein glints in its north and east walls.
   */
  dig: {
    strongbox: { x0: 2.4, x1: 3.4, z0: -56.5, z1: -55.85 },
    picks: [
      [0.4, -52.2, 0.6],
      [5.6, -49.8, 2.4],
    ] as readonly (readonly [number, number, number])[],
    cloak: { x: -1.2, z: -48.4, yaw: 0.4 },
    lantern: { x: 3.6, z: -50.2, light: 0.6 },
    vein: 9,
  },
  /** The crypt's outer wall, laid bare round the breach on the dig's side: along the dig's east wall, and how high. */
  masonry: { z0: -56.5, z1: -50.5, height: 3.2, thick: 0.25 },
  /** The antechamber's two braziers, flush with its north wall either side of the gate. */
  braziers: [
    [HALL.x - 2.2, -36.6],
    [HALL.x + 2.2, -36.6],
  ] as readonly (readonly [number, number])[],
  braziersRadius: 0.4,
  /** The Warden's hall's middle, on its floor. */
  hall: HALL,
  /**
   * Lanterns (x, height over the floor, z): on the timbers about every 8 m in
   * the old mine, and the bandits' down their ramp. The deep workings have
   * the fewest.
   */
  lanterns: [
    [1.47, 2.2, -5],
    [-3, 2.2, -11.47],
    [-8, 2.3, -7.04],
    [-14.26, 2.3, -9.8],
    [-18.72, 2.5, -23],
    [-13.42, 2.9, -30.9],
    [-4, 2.1, -31.78],
    [4.22, 2.1, -34],
    [1.28, 2.1, -42],
  ] as readonly (readonly [number, number, number])[],
  /** Outside: the boulders either side of the mouth and over it, and the ore cart out on the rails. */
  outside: {
    boulders: { x: 3.4, hw: 1.65, z: -1.4, hd: 2 },
    over: { z: -3.25, hd: 1.25 },
    cart: { z: 5.6, hw: 0.5, hd: 0.6 },
    rails: 6.6,
  },
  /** Where you wake after dying in the mine: on the rail bed this far out from the mouth, facing it. */
  wake: 3,
  /**
   * Its undead, one camp (level 3): two grunts and an archer in the cart
   * hall, facing the way in from the adit; a grunt and an archer at the
   * gallery's far end, facing back up it; and alone, at level 4, a brute in
   * the dig facing the ramp and another before the hall's gate facing the
   * way in from the passage. Each chamber's out of sight of the others, so
   * each is its own pull.
   */
  camp: {
    level: 3,
    posts: [
      { behaviour: 'grunt', x: -12, z: -11.5, face: [-6, -10] },
      { behaviour: 'grunt', x: -13.5, z: -7.5, face: [-6, -10] },
      { behaviour: 'archer', x: -16.5, z: -12, face: [-6, -10] },
      { behaviour: 'grunt', x: -15, z: -30.5, face: [-15.5, -20] },
      { behaviour: 'archer', x: -17.5, z: -33.5, face: [-15.5, -20] },
      { behaviour: 'brute', role: 'deepBrute', level: 4, x: 4, z: -53, face: [2.75, -46.5] },
      { behaviour: 'brute', role: 'deepBrute', level: 4, x: 22, z: -34, face: [15.5, -33] },
    ] as readonly (Omit<PostPlan, 'family' | 'yaw'> & { readonly face: readonly [number, number] })[],
  },
  /** A hillside triangle is dug out if it dips this close over a tunnel's ceiling. */
  cut: 0.3,
} as const;

/** The piece called `name`. */
export function minePiece(name: PieceName): MinePiece {
  return MINE.pieces.find((p) => p.name === name)!;
}

/** Past the adit's bend: the crypt hall's cool fill, no sun, and fog closing in at 6 to 18 m. */
export const MINE_ATMOSPHERE_BASE: Omit<Atmosphere, 'flames'> = {
  background: 0x0c0a0e,
  fog: { color: 0x0c0a0e, near: 6, far: 18 },
  sky: { zenith: SKY.zenith, horizon: SKY.horizon, haze: SKY.haze, sun: SKY.sun },
  sun: { color: 0xffffff, intensity: 0 },
  hemisphere: { sky: 0x6a78a8, ground: 0x2a1c14, intensity: 0.9 },
  farPlane: 40,
};

/**
 * The flames the pool may sit on, in the mouth's frame, each with its part:
 * every lantern, the cart hall's brazier, the lantern fallen in the dig, the
 * antechamber's two braziers and the Warden's hall's four pillar torches (its
 * corner braziers are glows only).
 */
export function mineFlames(): readonly { x: number; y: number; z: number; part: number }[] {
  const hollow = new Hollow(MINE.pieces);
  const { lanterns, brazier, dig, braziers, hall } = MINE;
  const at = (x: number, y: number, z: number) => ({ x, y: hollow.floorAt(x, z) + y, z, part: hollow.pieceAt(x, z).part });
  return [
    ...lanterns.map(([x, y, z]) => at(x, y, z)),
    at(brazier.x, brazier.height + 0.35, brazier.z),
    // Its light a little over the lantern on its side, so it reaches the walls, not just the floor round it.
    at(dig.lantern.x, dig.lantern.light, dig.lantern.z),
    ...braziers.map(([x, z]) => at(x, BRAZIER_FIRE, z)),
    ...CONFIG.arena.pillars.map((p) => {
      const t = torchLight(p);
      return at(hall.x + t.x, t.y, hall.z + t.z);
    }),
  ].sort((a, b) => a.part - b.part);
}

/** What stands in the mine that you bump into, in the mouth's frame. Every prop is flush with a wall, or a body's width clear. */
export function mineColliders(): Shapes {
  const { carts, winch, brazier, crates, props, propRadius, scaffold, dig, braziers, braziersRadius, hall } = MINE;
  const box = (r: { x0: number; x1: number; z0: number; z1: number }) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, (r.x1 - r.x0) / 2, (r.z1 - r.z0) / 2] as const;
  const { halfSize, gate, choked, pillars, obstacles } = CONFIG.arena;
  return {
    boxes: [
      box(carts.siding),
      box(winch),
      box(crates),
      box(scaffold),
      box(dig.strongbox),
      // The fallen stone spilling out of the hall's east and west gates, flush with its walls.
      ...[-1, 1].map((s) => [hall.x + s * (halfSize - choked.spill / 2), hall.z, choked.spill / 2, gate.width / 2 + choked.beyond] as const),
    ],
    circles: [
      [brazier.x, brazier.z, brazier.r],
      ...props.map(([x, z]) => [x, z, propRadius] as const),
      ...braziers.map(([x, z]) => [x, z, braziersRadius] as const),
      // The hall's pillars, throne, braziers and crates, as in the arena.
      ...[...pillars, ...obstacles].map((o) => [hall.x + o.x, hall.z + o.z, o.r] as const),
    ],
  };
}

/** What stands outside the mouth that you bump into, in its frame: the boulders round it and the cart out on the rails. */
export function mouthColliders(): Shapes {
  const { boulders, over, cart } = MINE.outside;
  const { hw } = MINE.tunnel;
  return {
    boxes: [
      [-boulders.x, boulders.z, boulders.hw, boulders.hd],
      [boulders.x, boulders.z, boulders.hw, boulders.hd],
      // Over the adit, a step in from the mouth: only walking in through the mouth takes you in.
      [0, over.z, hw, over.hd],
      [0, cart.z, cart.hw, cart.hd],
    ],
    circles: [],
  };
}

/** The mouth's frame for the mine structure standing at `site` (layout's): the mouth is its front, on the floor. */
export function mouthOf(site: { x: number; z: number; yaw: number; y: number; hd: number }): Frame {
  const [x, z] = toWorld(site, 0, site.hd);
  return { x, z, yaw: site.yaw, y: site.y };
}

/** Where you wake after dying in the mine: on the rail bed outside the mouth, facing it. Outdoors. */
export function mineRespawn(mouth: Frame): Respawn {
  const [x, z] = toWorld(mouth, 0, MINE.wake);
  return { x, z, yaw: mouth.yaw, interior: null };
}

const _arrow = new Vector3();

/**
 * The mine's undead, in the world: one camp, in the mine. Its place is the
 * mouth, so it refills only once you're a leash from it (and out of the mine).
 */
export function mineCamp(mouth: Frame): CampPlan {
  const { level, posts } = MINE.camp;
  return {
    id: 'mine',
    place: { x: mouth.x, z: mouth.z, r: 0 },
    level,
    posts: posts.map(({ face, ...p }) => {
      const [x, z] = toWorld(mouth, p.x, p.z);
      const [fx, fz] = toWorld(mouth, face[0], face[1]);
      return { ...p, family: 'undead', x, z, yaw: Math.atan2(fx - x, fz - z) };
    }),
    interior: 'mine',
  };
}

/** The mine opening at `mouth`. */
export function planMine(mouth: Frame): MinePlan {
  const hollow = new Hollow(MINE.pieces);
  const local = { x: 0, z: 0 };
  const inMine = (x: number, z: number) => toFrame(mouth, x, z, local);
  const cos = Math.cos(mouth.yaw);
  const sin = Math.sin(mouth.yaw);
  /** `local` back into the world, onto `p` (as `toWorld`, without the garbage: it runs for every body every frame). */
  const back = (p: { x: number; z: number }) => {
    p.x = mouth.x + local.x * cos + local.z * sin;
    p.z = mouth.z - local.x * sin + local.z * cos;
  };

  const props = new Colliders(UNBOUNDED);
  const shapes = mineColliders();
  for (const [lx, lz, hw, hd] of shapes.boxes) {
    const [x, z] = toWorld(mouth, lx, lz);
    props.addBox({ x, z, hw, hd, yaw: mouth.yaw });
  }
  for (const [lx, lz, r] of shapes.circles) {
    const [x, z] = toWorld(mouth, lx, lz);
    props.addCircle({ x, z, r });
  }

  const flames: Flame[] = mineFlames().map(({ x: lx, y, z: lz }) => {
    const [x, z] = toWorld(mouth, lx, lz);
    return { x, y: mouth.y + y, z };
  });

  // The route, and how far along it each point is.
  const route = MINE.route;
  const along = [0];
  for (let i = 1; i < route.length; i++) along.push(along[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]));
  const bendAt = along[MINE.bend];
  const breachAt = along[MINE.breach];
  const breach = route[MINE.breach];
  const routeDistance = (x: number, z: number) => {
    let best = Infinity;
    let at = 0;
    for (let i = 1; i < route.length; i++) {
      const [ax, az] = route[i - 1];
      const dx = route[i][0] - ax;
      const dz = route[i][1] - az;
      const len2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < best) {
        best = d;
        at = along[i - 1] + t * Math.sqrt(len2);
      }
    }
    return at;
  };

  const { hw, height } = MINE.tunnel;
  const { seat, front, rise, seatHeight } = CONFIG.warden.hall;
  /** The hall's south wall, where its gate's inner mouth is, and the gate's outer mouth. */
  const wall = HALL.z + HALL_HALF;
  const [seatX, seatZ] = toWorld(mouth, HALL.x, HALL.z + seat);
  const [frontX, frontZ] = toWorld(mouth, HALL.x, HALL.z + front);
  const throne: ThronePlan = {
    // Facing out along the hall's axis, at its gate: as the mouth faces.
    seat: { x: seatX, z: seatZ, yaw: mouth.yaw, hip: seatHeight },
    front: { x: frontX, z: frontZ, yaw: mouth.yaw },
    through(x, z) {
      inMine(x, z);
      return local.z < wall - rise && Math.abs(local.x - HALL.x) < HALL_HALF;
    },
    outside(x, z) {
      inMine(x, z);
      return local.z > wall + HALL_GATE.depth;
    },
    keepIn(p, radius) {
      inMine(p.x, p.z);
      if (local.z <= wall - radius) return;
      local.z = wall - radius;
      back(p);
    },
  };
  return {
    id: 'mine',
    throne,
    mouth,
    flames,
    atmosphere: { ...MINE_ATMOSPHERE_BASE, flames },
    route: route.map(([lx, lz]) => {
      const [x, z] = toWorld(mouth, lx, lz);
      return { x, z };
    }),
    parts: MINE.parts,
    partAt(x, z) {
      inMine(x, z);
      return hollow.pieceAt(local.x, local.z).part;
    },
    stand(x, y, z, out: MineStanding) {
      inMine(x, z);
      const o = out as { -readonly [K in keyof MineStanding]: MineStanding[K] };
      o.ahead = -local.z;
      o.inMouth = Math.abs(local.x) < hw && y - mouth.y < height;
      const d = routeDistance(local.x, local.z);
      o.past = d - bendAt;
      // Along the route in the crypt's dressed stone; short of it, never nearer
      // the breach than the straight line to it (by the dig's east wall the
      // carved passage's leg, through the rock, is the route's nearest).
      const { finish } = hollow.pieceAt(local.x, local.z) as MinePiece;
      o.crypt = finish === 'dressed' || finish === 'hall' ? d - breachAt : Math.min(d - breachAt, -Math.hypot(local.x - breach[0], local.z - breach[1]));
      o.fromMouth = Math.hypot(local.x, local.z);
      return out;
    },
    sees(ax, az, bx, bz) {
      inMine(ax, az);
      const lax = local.x;
      const laz = local.z;
      inMine(bx, bz);
      return hollow.sees(lax, laz, local.x, local.z);
    },
    groundAt(x, z) {
      inMine(x, z);
      if (local.z >= 0 || hollow.distance(local.x, local.z) > MINE.rock) return null;
      return mouth.y + hollow.floorAt(local.x, local.z);
    },
    resolve(p: Vector3, radius: number) {
      inMine(p.x, p.z);
      let moved = hollow.resolve(local, radius);
      if (moved) back(p);
      if (props.resolve(p, radius)) {
        moved = true;
        inMine(p.x, p.z);
        if (hollow.resolve(local, radius)) back(p);
      }
      return moved;
    },
    arrowStops(p: Vector3) {
      inMine(p.x, p.z);
      if (local.z >= 0) return null;
      if (!hollow.contains(local.x, local.z)) return true;
      const piece = hollow.pieceAt(local.x, local.z);
      const floor = mouth.y + floorOf(piece, local.x, local.z);
      const { arrowWidth, propHeight } = CONFIG.world.ground;
      if (p.y <= floor + arrowWidth || p.y >= floor + piece.height - arrowWidth) return true;
      return p.y < floor + propHeight && props.resolve(_arrow.set(p.x, 0, p.z), arrowWidth);
    },
    cuts(tri) {
      let x0 = Infinity;
      let x1 = -Infinity;
      let z0 = Infinity;
      let z1 = -Infinity;
      let low = Infinity;
      for (const [x, y, z] of tri) {
        inMine(x, z);
        x0 = Math.min(x0, local.x);
        x1 = Math.max(x1, local.x);
        z0 = Math.min(z0, local.z);
        z1 = Math.max(z1, local.z);
        low = Math.min(low, y);
      }
      // Only behind the mouth's line: out in front is the rail bed.
      z1 = Math.min(z1, 0);
      return MINE.pieces.some(
        (p) =>
          Math.min(x1, p.x1) - Math.max(x0, p.x0) > 1e-6 &&
          Math.min(z1, p.z1) - Math.max(z0, p.z0) > 1e-6 &&
          low < mouth.y + p.floor + Math.max(0, p.slope?.rise ?? 0) + p.height + MINE.cut,
      );
    },
  };
}
