import type { Vector3 } from 'three';
import type { Atmosphere } from '../../world/atmosphere';
import { type Flame, type Frame, toFrame } from '../../world/interiors';
import type { MinePlan, MineStanding } from '../../world/mine';
import type { Respawn } from '../types';
import { Colliders } from './colliders';
import { Hollow, type Piece } from './hollow';
import { type Shapes, toWorld } from './interiorPlan';
import { SKY } from './palette';

// The old mine, from its mouth to the gallery: the plan only (what's dug
// where, what you bump into, its flames), in the mouth's own frame: origin
// on the floor at the mouth's middle, the way out (+Z) facing south down the
// rail bed, x across the mouth. mineModel.ts builds its meshes from the same
// numbers. The route runs in along the timbered adit, bends west into the
// cart hall and turns north through a short passage into the gallery, whose
// far end is fallen rock for now (ticket 26 digs on down from there).

/** Every number of the mine's layout, in the mouth's frame. */
export const MINE = {
  /** Tunnels: half their width, and floor to ceiling. */
  tunnel: { hw: 1.75, height: 3 },
  /** Metres of rock round the open space that are the mine's: its ground and walls reach this far. */
  rock: 2,
  /**
   * The open space, piece by piece. Pieces meet by overlapping. The adit runs
   * past the mouth's line so its walls reach the mouth's timbers.
   */
  pieces: [
    // The adit: 10 m straight in from the mouth…
    { x0: -1.75, x1: 1.75, z0: -11.75, z1: 1, floor: 0, height: 3, part: 0, open: ['south'] },
    // …then bends west to the cart hall.
    { x0: -6.5, x1: 1.75, z0: -11.75, z1: -8.25, floor: 0, height: 3, part: 0 },
    // The cart hall, level with the mouth, its roof on timber props.
    { x0: -18, x1: -6, z0: -15, z1: -5, floor: 0, height: 3.6, part: 1 },
    // A short passage north out of its far corner, so the gallery can't be seen from the adit.
    { x0: -17.25, x1: -13.75, z0: -19.5, z1: -14.5, floor: 0, height: 3, part: 1 },
    // The gallery, long and tall where the old miners followed the vein.
    { x0: -19, x1: -12, z0: -35, z1: -19, floor: 0, height: 6, part: 2 },
  ] as readonly Piece[],
  parts: ['adit', 'cart hall', 'gallery'] as readonly string[],
  /**
   * The route's centre line: in at the mouth, round the bend, over the
   * turntable, through the passage and up the gallery to the fallen rock.
   */
  route: [
    [0, 0],
    [0, -10],
    [-6, -10],
    [-10.5, -10],
    [-15.5, -13.5],
    [-15.5, -19],
    [-15.5, -27],
    [-15.5, -32.4],
  ] as readonly (readonly [number, number])[],
  /** The route's point at the adit's bend. */
  bend: 1,
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
  /** Scaffolding against the gallery's east wall (scenery, not climbable), and fallen rock across its far end. */
  scaffold: { x0: -13.3, x1: -12, z0: -31, z1: -22.5, decks: [2, 4] },
  fall: { x0: -17.6, x1: -13.4, z0: -35, z1: -33.6 },
  /** Lanterns on the timbers about every 8 m along the route, and the brazier: (x, height over the floor, z). */
  lanterns: [
    [1.47, 2.2, -5],
    [-3, 2.2, -11.47],
    [-8, 2.3, -7.04],
    [-14.26, 2.3, -9.8],
    [-18.72, 2.5, -23],
    [-13.42, 2.9, -30.9],
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
  /** A hillside triangle is dug out if it dips this close over a tunnel's ceiling. */
  cut: 0.3,
} as const;

/** Past the adit's bend: the crypt hall's cool fill, no sun, and fog closing in at 6 to 18 m. */
export const MINE_ATMOSPHERE_BASE: Omit<Atmosphere, 'flames'> = {
  background: 0x0c0a0e,
  fog: { color: 0x0c0a0e, near: 6, far: 18 },
  sky: { zenith: SKY.zenith, horizon: SKY.horizon, haze: SKY.haze, sun: SKY.sun },
  sun: { color: 0xffffff, intensity: 0 },
  hemisphere: { sky: 0x6a78a8, ground: 0x2a1c14, intensity: 0.9 },
  farPlane: 40,
};

/** The flames the pool may sit on, in the mouth's frame: every lantern, and the brazier. */
export function mineFlames(): readonly [number, number, number][] {
  const { lanterns, brazier } = MINE;
  return [...lanterns.map(([x, y, z]) => [x, y, z] as [number, number, number]), [brazier.x, brazier.height + 0.35, brazier.z]];
}

/** What stands in the mine that you bump into, in the mouth's frame. Every prop is flush with a wall, or a body's width clear. */
export function mineColliders(): Shapes {
  const { carts, winch, brazier, crates, props, propRadius, scaffold, fall } = MINE;
  const box = (r: { x0: number; x1: number; z0: number; z1: number }) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, (r.x1 - r.x0) / 2, (r.z1 - r.z0) / 2] as const;
  return {
    boxes: [box(carts.siding), box(winch), box(crates), box(scaffold), box(fall)],
    circles: [[brazier.x, brazier.z, brazier.r], ...props.map(([x, z]) => [x, z, propRadius] as const)],
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

  const props = new Colliders({ minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity });
  const shapes = mineColliders();
  for (const [lx, lz, hw, hd] of shapes.boxes) {
    const [x, z] = toWorld(mouth, lx, lz);
    props.addBox({ x, z, hw, hd, yaw: mouth.yaw });
  }
  for (const [lx, lz, r] of shapes.circles) {
    const [x, z] = toWorld(mouth, lx, lz);
    props.addCircle({ x, z, r });
  }

  const flames: Flame[] = mineFlames().map(([lx, y, lz]) => {
    const [x, z] = toWorld(mouth, lx, lz);
    return { x, y: mouth.y + y, z };
  });

  // The route, and how far along it each point is.
  const route = MINE.route;
  const along = [0];
  for (let i = 1; i < route.length; i++) along.push(along[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]));
  const bendAt = along[MINE.bend];
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
  return {
    id: 'mine',
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
      o.past = routeDistance(local.x, local.z) - bendAt;
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
      return mouth.y + hollow.pieceAt(local.x, local.z).floor;
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
        (p) => Math.min(x1, p.x1) - Math.max(x0, p.x0) > 1e-6 && Math.min(z1, p.z1) - Math.max(z0, p.z0) > 1e-6 && low < mouth.y + p.floor + p.height + MINE.cut,
      );
    },
  };
}
