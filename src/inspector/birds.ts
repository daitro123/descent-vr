import type { Material } from 'three';
import { FlockMesh, newPose, type Placing } from '../birds/flock';
import { type Carriage, calling, carriageOf, swimDepth, crouching, dabbling, flying, hissing, hopping, hovering, peck, plant, preening, squabbling, standing, striking, swimming, walking } from '../birds/poses';
import { B, BIRD_LOOKS, type BirdLookId } from '../models/bird';
import type { Clip } from './clips';

// The birds in the inspector: one bird of a look on the turntable (a flock of
// one, drawn just as a flock is in the zones), looping each thing it does in
// the zones: standing about, walking, pecking, calling, the wingbeat, the
// glide, lifting off and coming in, and what its family does of its own
// (swimming and dabbling, a heron's strike, a goose's hiss, a grouse down in
// the heather). Flying clips hold it at eye height over the plinth;
// swimming ones sit it in the plinth as if in water.

/** One thing a bird does, looped: it poses the bird itself and says which part of the clip it's in. */
interface BirdClip {
  readonly name: string;
  readonly duration: number;
  sample(t: number, p: Float32Array, at: Placing, c: Carriage, leg: number, sink: number): string;
}

const TAU = Math.PI * 2;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** Up and back down over [a, b] of a clip: 0 → 1 → 0, eased. */
const bump = (t: number, a: number, b: number) => (t < a || t > b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));

/** Where it flies in the inspector: at eye height over the plinth. */
const AIR = 1.1;

const stand: BirdClip = {
  name: 'stand',
  duration: 4,
  sample(t, p, at, c, leg) {
    standing(p, c);
    p[B.head * 3 + 1] = 0.8 * (smooth(clamp01(t - 0.6)) - smooth(clamp01((t - 2.2) / 0.4)) * 2 + smooth(clamp01((t - 3.4) / 0.4)));
    at.y = leg;
    return 'looking about';
  },
};

const walk: BirdClip = {
  name: 'walk',
  duration: 1,
  sample(t, p, at, c, leg) {
    standing(p, c);
    walking(p, t * TAU, 0.45, 0.25);
    at.y = leg;
    return 'walking';
  },
};

const pecking: BirdClip = {
  name: 'peck',
  duration: 2,
  sample(t, p, at, c, leg) {
    standing(p, c);
    peck(p, c, Math.max(bump(t, 0.2, 0.55), bump(t, 0.7, 1.05), bump(t, 1.2, 1.55)));
    plant(p);
    at.y = leg;
    return 'pecking';
  },
};

const call: BirdClip = {
  name: 'call',
  duration: 2,
  sample(t, p, at, c, leg) {
    standing(p, c);
    calling(p, Math.max(bump(t, 0.3, 0.75), bump(t, 0.9, 1.35)));
    plant(p);
    at.y = leg;
    return 'calling';
  },
};

const preen: BirdClip = {
  name: 'preen',
  duration: 3,
  sample(t, p, at, c, leg) {
    standing(p, c);
    preening(p, smooth(clamp01(t / 0.5)) * smooth(clamp01((3 - t) / 0.5)), 1);
    plant(p);
    at.y = leg;
    return 'preening';
  },
};

const hop: BirdClip = {
  name: 'hop',
  duration: 1.2,
  sample(t, p, at, c, leg) {
    standing(p, c);
    const u = bump(t, 0.2, 0.55);
    hopping(p, u);
    at.y = leg + u * leg * 1.2;
    at.yaw = smooth(clamp01((t - 0.2) / 0.35)) * Math.PI * 0.5;
    return u > 0 ? 'hopping' : 'standing';
  },
};

const flap: BirdClip = {
  name: 'flap',
  duration: 2,
  sample(t, p, at, c) {
    const beats = Math.max(2, Math.round(2 * c.beat));
    flying(p, c, (t / 2) * beats * TAU, 1);
    at.y = AIR;
    return 'wingbeats';
  },
};

const glide: BirdClip = {
  name: 'glide',
  duration: 2,
  sample(t, p, at, c) {
    flying(p, c, 0, 0);
    at.y = AIR;
    at.roll = 0.25 * Math.sin((t / 2) * TAU);
    return 'gliding';
  },
};

const takeOff: BirdClip = {
  name: 'take off',
  duration: 2,
  sample(t, p, at, c, leg) {
    if (t < 0.4) {
      standing(p, c);
      at.y = leg;
      return 'standing';
    }
    const u = clamp01((t - 0.4) / 1.1);
    hovering(p, c, (t - 0.4) * c.beat * 1.4 * TAU);
    at.y = leg + smooth(u) * (AIR - leg);
    at.pitch = -0.5 * (1 - u);
    return 'lifting off';
  },
};

const land: BirdClip = {
  name: 'land',
  duration: 2,
  sample(t, p, at, c, leg) {
    if (t > 1.5) {
      standing(p, c);
      at.y = leg;
      return 'landed';
    }
    const u = clamp01(t / 1.4);
    hovering(p, c, t * c.beat * 0.8 * TAU);
    at.y = AIR - smooth(u) * (AIR - leg);
    at.pitch = -0.6 * u;
    return 'coming in';
  },
};

const swim: BirdClip = {
  name: 'swim',
  duration: 3,
  sample(t, p, at, c, _leg, sink) {
    swimming(p, c);
    at.y = -sink + 0.006 * Math.sin((t / 3) * TAU * 2);
    p[B.head * 3 + 1] = 0.5 * Math.sin((t / 3) * TAU);
    return 'swimming';
  },
};

const dabble: BirdClip = {
  name: 'dabble',
  duration: 3,
  sample(t, p, at, c, _leg, sink) {
    swimming(p, c);
    dabbling(p, smooth(clamp01((t - 0.4) / 0.4)) * smooth(clamp01((2.6 - t) / 0.4)));
    at.y = -sink;
    return 'dabbling';
  },
};

const strike: BirdClip = {
  name: 'strike',
  duration: 2.4,
  sample(t, p, at, c, leg) {
    standing(p, c);
    // Slowly leaning out over the water, then the strike.
    const lean = smooth(clamp01(t / 1.2)) * (1 - smooth(clamp01((t - 1.6) / 0.6)));
    const hit = t > 1.2 && t < 1.6 ? Math.sin(((t - 1.2) / 0.4) * Math.PI) : 0;
    striking(p, 0.2 * lean + 0.8 * hit);
    plant(p);
    at.y = leg;
    return hit > 0 ? 'strike' : 'watching the water';
  },
};

const hiss: BirdClip = {
  name: 'hiss',
  duration: 2,
  sample(t, p, at, c, leg) {
    standing(p, c);
    hissing(p, smooth(clamp01(t / 0.4)) * smooth(clamp01((2 - t) / 0.4)));
    plant(p);
    at.y = leg;
    return 'hissing';
  },
};

const squabble: BirdClip = {
  name: 'squabble',
  duration: 2,
  sample(t, p, at, c, leg) {
    standing(p, c);
    squabbling(p, smooth(clamp01(t / 0.3)) * smooth(clamp01((2 - t) / 0.3)), Math.sin(t * 20));
    plant(p);
    at.y = leg;
    return 'squabbling';
  },
};

const crouch: BirdClip = {
  name: 'hide',
  duration: 2,
  sample(t, p, at, c, leg) {
    standing(p, c);
    crouching(p, leg, smooth(clamp01(t / 0.6)) * smooth(clamp01((2 - t) / 0.4)));
    at.y = leg;
    return 'down in the heather';
  },
};

const run: BirdClip = {
  name: 'run',
  duration: 0.5,
  sample(t, p, at, c, leg) {
    standing(p, c);
    p[0] += 0.3;
    walking(p, (t / 0.5) * TAU, 0.8, 0.15);
    // Wings half out, flapping as it runs.
    const s = Math.sin((t / 0.5) * TAU * 2);
    p[B.wingL * 3] *= 0.4;
    p[B.wingR * 3] *= 0.4;
    p[B.wingL * 3 + 2] = 0.3 + 0.4 * s;
    p[B.wingR * 3 + 2] = -(0.3 + 0.4 * s);
    at.y = leg;
    return 'running';
  },
};

/** The clips for each family, in the order the inspector lists them. */
const CLIPS = {
  crow: [stand, walk, pecking, hop, call, preen, takeOff, flap, glide, land],
  gull: [stand, walk, call, squabble, swim, takeOff, flap, glide, land],
  hen: [stand, walk, pecking, run, call, crouch, takeOff, flap, glide, land],
  duck: [stand, walk, swim, dabble, preen, hiss, takeOff, flap, glide, land],
  heron: [stand, walk, strike, preen, takeOff, flap, glide, land],
};

/**
 * A bird of `look` on the turntable, as the inspector's entry: its mesh, and
 * its clips as the inspector's own, each posing the bird as it's sampled.
 */
export class BirdStand {
  readonly flock: FlockMesh;
  readonly clips: Clip[];
  /** Zoomed in, so a pigeon fills the plinth as a man does. */
  readonly zoom: number;

  constructor(readonly look: BirdLookId, material: Material) {
    this.flock = new FlockMesh([look], material);
    this.flock.mesh.matrixAutoUpdate = true;
    const body = BIRD_LOOKS[look].body;
    const c = carriageOf(look);
    const pose = newPose();
    const at: Placing = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
    const length = body.breast.z - body.rump.z + body.tail[0] + body.head[2] + body.beak[0];
    this.zoom = Math.min(3, Math.max(1, 0.9 / length));
    // A swimmer sits this deep in the water: the plinth is the water.
    const sink = swimDepth(look);
    this.clips = CLIPS[BIRD_LOOKS[look].family].map((clip) => ({
      name: clip.name,
      duration: clip.duration,
      sample: (t: number) => {
        Object.assign(at, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 });
        const phase = clip.sample(t, pose, at, c, body.leg, sink);
        this.flock.pose(0, at, pose);
        this.flock.bound(at.x, at.y, at.z, at.x, at.y, at.z);
        this.flock.commit();
        return { pose: {}, hipY: 0, phase, telegraph: 0 };
      },
    }));
  }

  get triangles(): number {
    return this.flock.triangles;
  }
}
