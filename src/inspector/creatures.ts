import { Group, Mesh } from 'three';
import { CONFIG } from '../config';
import {
  buildCrawler,
  CRAWLER_BONES,
  CRAWLER_LOOKS,
  type CrawlerLook,
  type CrawlerPose,
  crawlOffsets,
  crawlRate,
  crawlRise,
  curlPose,
  lungeAt,
  recoilPose,
  restPose,
  strikePoses,
} from '../models/crawler';
import { type CritterFrame, type CritterLook, critterModel } from '../models/critters';
import type { ModelMaterial } from '../models/materials';
import { blendPoses } from '../models/rig';
import { hopAt } from '../world/critters';

// The inspector's creatures without the humanoid rig: the critters, each in
// its still frames and moving as it does in a zone (world/critters.ts), and
// the crawlers, leeches and the adder, as they fight (Biter, enemies/kinds.ts),
// with the game's own timings, kept on the plinth.

/** What one moment of a clip shows, for the inspector's label and the weapon's glow. */
export interface Moment {
  phase: string;
  telegraph: number;
}

/** A creature on the turntable: what stands there, and its clips. */
export interface Showpiece {
  readonly object: Group;
  readonly triangles: number;
  /** Its height against a skeleton grunt's, for the label. */
  readonly height: number;
  readonly clips: readonly { readonly name: string; readonly duration: number }[];
  /** Show `clip` at `t` s into it. */
  play(clip: number, t: number): Moment;
}

interface CritterClip {
  name: string;
  duration: number;
  /** Where it is `t` s in: along +Z from the plinth's middle, how high, nose tip, and which frame. */
  at(t: number): { z: number; y: number; pitch: number; yaw: number; frame: CritterFrame };
}

const REST = 0.4;

/** A hop of `length` m at `speed` m/s and `height` m high, forward then back, resting between. */
function hopClip(name: string, length: number, speed: number, height: number): CritterClip {
  const time = Math.max(0.16, length / speed);
  const half = REST + time;
  return {
    name,
    duration: half * 2,
    at: (t) => {
      const back = t >= half;
      const u = Math.min(1, Math.max(0, (t - (back ? half : 0) - REST) / time));
      const h = hopAt(u, height);
      const along = back ? length / 2 - u * length : -length / 2 + u * length;
      return { z: along, y: h.lift, pitch: h.pitch, yaw: back ? Math.PI : 0, frame: h.frame };
    },
  };
}

function still(frame: CritterFrame): CritterClip {
  return { name: frame, duration: 2, at: () => ({ z: 0, y: 0, pitch: 0, yaw: 0, frame }) };
}

function clipsOf(look: CritterLook): CritterClip[] {
  const frames = Object.keys(critterModel(look).frames) as CritterFrame[];
  const clips = frames.map(still);
  const { rabbit, frog, rat } = CONFIG.critters;
  switch (critterModel(look).family) {
    case 'rabbit': {
      const s = critterModel(look).length / critterModel('hare').length;
      clips.push(hopClip('hop about', rabbit.hop.near[1], rabbit.hop.speed, rabbit.hop.height * s));
      clips.push(hopClip('bolt', rabbit.bolt.near[0], rabbit.bolt.speed, rabbit.bolt.height * s));
      break;
    }
    case 'frog':
      clips.push(hopClip('leap in', frog.leap, frog.leap / frog.time, frog.height));
      break;
    case 'rat': {
      // Its scurry along a wall, the gallop's halves in turn, there and back.
      const run = 1;
      const time = run / rat.speed;
      clips.push({
        name: 'scurry',
        duration: (REST + time) * 2,
        at: (t) => {
          const half = REST + time;
          const back = t >= half;
          const k = Math.min(1, Math.max(0, (t - (back ? half : 0) - REST) / time));
          const moving = k > 0 && k < 1;
          const frame: CritterFrame = moving ? (Math.floor(t * rat.speed * 9) % 2 ? 'gather' : 'run') : 'sit';
          return { z: back ? run / 2 - k * run : -run / 2 + k * run, y: 0, pitch: 0, yaw: back ? Math.PI : 0, frame };
        },
      });
      break;
    }
  }
  return clips;
}

/** `look` on the turntable: a mesh per frame, the one it's in shown. */
export function critterShowpiece(look: CritterLook, material: ModelMaterial): Showpiece {
  const model = critterModel(look);
  const object = new Group();
  const body = new Group();
  object.add(body);
  const meshes = new Map<CritterFrame, Mesh>();
  for (const [frame, geometry] of Object.entries(model.frames) as [CritterFrame, Mesh['geometry']][]) {
    const mesh = new Mesh(geometry, material);
    meshes.set(frame, mesh);
    body.add(mesh);
  }
  const clips = clipsOf(look);
  let triangles = 0;
  return {
    object,
    get triangles() {
      return triangles;
    },
    height: model.length / 1.74,
    clips,
    play(i, t) {
      const at = clips[i].at(t);
      body.position.set(0, at.y, at.z);
      body.rotation.set(-at.pitch, at.yaw, 0, 'YXZ');
      for (const [frame, mesh] of meshes) mesh.visible = frame === at.frame;
      triangles = meshes.get(at.frame)!.geometry.getAttribute('position').count / 3;
      return { phase: at.frame, telegraph: 0 };
    },
  };
}

// ---------------------------------------------------------------- crawlers

const ease = {
  out: (t: number) => 1 - (1 - t) * (1 - t),
  in: (t: number) => t * t,
  smooth: (t: number) => t * t * (3 - 2 * t),
};
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

interface CrawlerClip {
  name: string;
  duration: number;
  /** Its pose `t` s in, its middle's lift and throw along +Z, and the moment for the label. */
  at(t: number, out: Record<string, [number, number, number]>): { pose: CrawlerPose; y: number; z: number; moment: Moment };
}

/** `look` on the turntable, lying, crawling, lunging at your legs, recoiling from a blow and dying, with the biter's timings. */
export function crawlerShowpiece(look: CrawlerLook, material: ModelMaterial): Showpiece {
  const { kind, build } = CRAWLER_LOOKS[look];
  const rig = buildCrawler(look, material);
  const object = new Group();
  object.add(rig.mesh);
  const rest = restPose(kind);
  const strike = strikePoses(kind);
  const biter = CONFIG.enemies.biter;
  const attack = biter.attacks[0];
  const still = (name: string, pose: CrawlerPose): CrawlerClip => ({ name, duration: 2, at: () => ({ pose, y: 0, z: 0, moment: { phase: name, telegraph: 0 } }) });
  const offsets: Record<string, [number, number, number]> = {};
  const rate = crawlRate(kind, build, biter.speed);
  /** Rest, into `pose` over IN s, held, and back. */
  const hold = (name: string, pose: CrawlerPose, held: number): CrawlerClip => ({
    name,
    duration: REST + 0.3 + held + 0.5 + REST,
    at: (t, out) => {
      const u = t - REST;
      const k = u < 0 ? 0 : u < 0.3 ? ease.smooth(u / 0.3) : u < 0.3 + held ? 1 : 1 - ease.smooth(clamp01((u - 0.3 - held) / 0.5));
      return { pose: blendPoses(rest, pose, k, out, CRAWLER_BONES), y: 0, z: 0, moment: { phase: k >= 1 ? 'hold' : 'rest', telegraph: 0 } };
    },
  });
  const t1 = REST;
  const t2 = t1 + attack.windup;
  const t3 = t2 + attack.active;
  const t4 = t3 + attack.recover;
  const clips: CrawlerClip[] = [
    still('rest', rest),
    {
      name: 'crawl',
      duration: (2 * Math.PI) / rate,
      at: (t, out) => {
        for (const k of Object.keys(offsets)) delete offsets[k];
        crawlOffsets(kind, t * rate, 1, offsets);
        for (const bone of CRAWLER_BONES) {
          const r = rest[bone];
          const o = offsets[bone];
          out[bone] = [(r?.[0] ?? 0) + (o?.[0] ?? 0), (r?.[1] ?? 0) + (o?.[1] ?? 0), (r?.[2] ?? 0) + (o?.[2] ?? 0)];
        }
        return { pose: out as CrawlerPose, y: crawlRise(kind, build), z: 0, moment: { phase: 'crawl', telegraph: 0 } };
      },
    },
    {
      name: 'lunge',
      duration: t4 + REST,
      at: (t, out) => {
        const L = build.length;
        if (t < t1 || t >= t4) return { pose: rest, y: 0, z: 0, moment: { phase: 'rest', telegraph: 0 } };
        if (t < t2) {
          const k = clamp01((t - t1) / attack.windup);
          const pose = blendPoses(rest, strike.windup, ease.out(k), out, CRAWLER_BONES);
          return { pose, y: 0, z: lungeAt(strike, 'windup', k) * L, moment: { phase: 'windup', telegraph: 0.3 + 1.2 * k * k } };
        }
        if (t < t3) {
          const k = clamp01((t - t2) / attack.active);
          const pose = blendPoses(strike.windup, strike.strike, ease.in(k), out, CRAWLER_BONES);
          return { pose, y: 0, z: lungeAt(strike, 'active', k) * L, moment: { phase: 'active', telegraph: 1.5 } };
        }
        const k = clamp01((t - t3) / attack.recover);
        const pose = blendPoses(strike.strike, rest, ease.smooth(k), out, CRAWLER_BONES);
        return { pose, y: 0, z: lungeAt(strike, 'recover', k) * L, moment: { phase: 'recover', telegraph: 0 } };
      },
    },
    hold('recoil', recoilPose(kind), biter.staggerTime),
    still('curl', curlPose(kind)),
  ];
  const out: Record<string, [number, number, number]> = {};
  return {
    object,
    triangles: rig.triangles,
    height: build.height / 1.74,
    clips,
    play(i, t) {
      const at = clips[i].at(t, out);
      rig.apply(at.pose);
      rig.setHipOffset(0, at.y, at.z);
      return at.moment;
    },
  };
}
