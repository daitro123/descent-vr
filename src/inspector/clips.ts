import { type AttackConfig, CONFIG, type EnemyConfig } from '../config';
import { SUMMON_ATTACK } from '../enemies/kinds';
import { ATTACK_POSES, GUARD, type GuardSide, IDLE, KNEEL, KNEEL_DROP, RISE, STAGGER, walkOffsets } from '../enemies/poses';
import { type EnemyKind, type Family, proportionsOf } from '../models/characters';
import { BUILDS, type BuildName } from '../models/human';
import { PEOPLE, type Person, type PersonId } from '../models/people';
import { BONES, blendPoses, type Pose, type Proportions } from '../models/rig';
import { CAST, type CastId } from '../people/cast';
import { BREATH_PERIOD, friendlyPose } from '../people/poses';
import { type Folded, sitting } from '../people/sit';
import { SAT_AT } from '../people/trades';
import { walkFrame, walkOver } from '../people/walk';
import { WORKS, type WorkName, workLoop } from '../people/work';

// The inspector's animations: every pose the game plays for a kind, as a
// looping clip with the game's own timings and easing (see Enemy.updateAttack),
// so what loops here is what swings at the player in a fight. Friendly
// characters loop what they do in Oakvale (people/poses.ts).

export type MutablePose = Record<string, [number, number, number]>;

export interface ClipFrame {
  pose: Pose;
  /** Hip offset in Y, metres (walk bob, kneel drop). */
  hipY: number;
  /** The whole hip offset, metres, where it moves aside too (a friendly walk's sway); else (0, hipY, 0). */
  hip?: readonly [number, number, number];
  /** Which part of the clip `t` is in, for the label ("windup", "hold"...). */
  phase: string;
  /** Weapon telegraph as the game shows it: 0 = off, else its strength. */
  telegraph: number;
  /** How far round they've turned from facing the viewer (a villager's work with a second place), rad, + to their left. */
  turn?: number;
  /** Whether a carrier's load is in their hands (people/cast.ts `Wardrobe.burden`). */
  laden?: boolean;
}

export interface Clip {
  name: string;
  duration: number;
  /** The attack this clip plays, if it is one (timings, telegraph colour, arrow guide). */
  attack?: AttackConfig;
  sample(t: number, out: MutablePose): ClipFrame;
}

/** Idle held before and after an attack so the wind-up reads from rest. */
const REST = 0.5;

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeIn = (t: number) => t * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

function copyInto(src: Pose, out: MutablePose): Pose {
  for (const k of Object.keys(out)) delete out[k];
  for (const [k, v] of Object.entries(src)) out[k] = [v![0], v![1], v![2]];
  return out as Pose;
}

function idleClip(kind: EnemyKind): Clip {
  return {
    name: 'idle',
    duration: 2,
    sample: (_t, out) => ({ pose: copyInto(IDLE[kind], out), hipY: 0, phase: 'idle', telegraph: 0 }),
  };
}

function walkClip(kind: EnemyKind, p: Proportions): Clip {
  const heightScale = p.hipY / 0.92;
  // Full-speed walk, phase rate as Enemy.update drives it.
  const rate = 7 * (CONFIG.enemies[kind].speed / Math.max(0.8, heightScale));
  const walk: MutablePose = {};
  return {
    name: 'walk',
    duration: (2 * Math.PI) / rate,
    sample: (t, out) => {
      const phase = t * rate;
      for (const k of Object.keys(walk)) delete walk[k];
      walkOffsets(phase, 1, walk);
      const base = IDLE[kind];
      for (const name of BONES) {
        const b = base[name];
        const w = walk[name];
        if (!b && !w) {
          delete out[name];
          continue;
        }
        out[name] = [(b?.[0] ?? 0) + (w?.[0] ?? 0), (b?.[1] ?? 0) + (w?.[1] ?? 0), (b?.[2] ?? 0) + (w?.[2] ?? 0)];
      }
      return { pose: out as Pose, hipY: -Math.abs(Math.sin(phase)) * 0.03, phase: 'walk', telegraph: 0 };
    },
  };
}

/** Rest → windup (ease out) → strike (ease in) → back to idle (smooth) → rest. */
export function attackClip(kind: EnemyKind, attack: AttackConfig, name: string = attack.pose): Clip {
  const idle = IDLE[kind];
  const poses = ATTACK_POSES[attack.pose];
  const t1 = REST;
  const t2 = t1 + attack.windup;
  const t3 = t2 + attack.active;
  const t4 = t3 + attack.recover;
  return {
    name,
    attack,
    duration: t4 + REST,
    sample: (t, out) => {
      const glow = attack.kind === 'summon' ? 0 : 1;
      if (t < t1) return { pose: copyInto(idle, out), hipY: 0, phase: 'rest', telegraph: 0 };
      if (t < t2) {
        const k = clamp01((t - t1) / attack.windup);
        return { pose: blendPoses(idle, poses.windup, easeOut(k), out), hipY: 0, phase: 'windup', telegraph: glow * (0.3 + 1.2 * k * k) };
      }
      if (t < t3) {
        const k = clamp01((t - t2) / attack.active);
        return { pose: blendPoses(poses.windup, poses.strike, easeIn(k), out), hipY: 0, phase: 'active', telegraph: glow * 1.5 };
      }
      if (t < t4) {
        const k = clamp01((t - t3) / attack.recover);
        return { pose: blendPoses(poses.strike, idle, smooth(k), out), hipY: 0, phase: 'recover', telegraph: 0 };
      }
      return { pose: copyInto(idle, out), hipY: 0, phase: 'rest', telegraph: 0 };
    },
  };
}

/** Idle → pose → hold → idle, for the reaction poses the game eases into; `drop` lowers the hips (m). */
function holdClip(kind: EnemyKind, name: string, pose: Pose, hold: number, drop = 0): Clip {
  const idle = IDLE[kind];
  const IN = 0.3;
  const OUT = 0.5;
  return {
    name,
    duration: REST + IN + hold + OUT + REST,
    sample: (t, out) => {
      const u = t - REST;
      let k = 0;
      let phase = 'rest';
      if (u >= 0 && u < IN) [k, phase] = [smooth(u / IN), 'in'];
      else if (u >= IN && u < IN + hold) [k, phase] = [1, 'hold'];
      else if (u >= IN + hold && u < IN + hold + OUT) [k, phase] = [1 - smooth((u - IN - hold) / OUT), 'out'];
      return { pose: blendPoses(idle, pose, k, out), hipY: -drop * k, phase, telegraph: 0 };
    },
  };
}

/** Every animation the game plays for this behaviour, in this family's body, in a stable order. */
export function clipsFor(kind: EnemyKind, family: Family = 'undead'): Clip[] {
  const def: EnemyConfig = CONFIG.enemies[kind];
  const p = proportionsOf(kind, family);
  const clips: Clip[] = [idleClip(kind), walkClip(kind, p)];
  // One clip per distinct attack pose; the first config entry supplies the timings.
  const seen = new Set<string>();
  for (const attack of def.attacks) {
    if (seen.has(attack.pose)) continue;
    seen.add(attack.pose);
    clips.push(attackClip(kind, attack));
  }
  if (kind === 'warden') clips.push(attackClip(kind, SUMMON_ATTACK));
  if (def.guard) {
    for (const side of ['high', 'left', 'right', 'low'] as GuardSide[]) clips.push(holdClip(kind, `guard ${side}`, GUARD[side], def.guard.hold[1]));
  }
  clips.push(holdClip(kind, 'stagger', STAGGER, def.staggerTime * 0.6));
  if (kind === 'warden') clips.push(holdClip(kind, 'kneel', KNEEL, CONFIG.warden.kneelTime, KNEEL_DROP * p.hipY));
  // Only the dead claw up out of the ground.
  if (family === 'undead') clips.push(holdClip(kind, 'rise', RISE, 0.8));
  return clips;
}

/**
 * Walking in their build, standing easy in `stand` over it (holding what they
 * hold): two steps a cycle at the build's pace, as a villager walks their
 * route (people/villagers.ts). In place: the plinth stays put.
 */
export function strollClip(stand: Pose, build: BuildName): Clip {
  const b = BUILDS[build];
  const cycle = (2 * b.gait.step) / b.gait.speed;
  const frame = { pose: {}, hip: [0, 0, 0] as [number, number, number] };
  const hip: [number, number, number] = [0, 0, 0];
  return {
    name: 'walk',
    // Two cycles, so it loops on a whole breath near enough.
    duration: 2 * cycle,
    sample: (t, out) => {
      copyInto(friendlyPose(stand, t), out);
      walkOver(out, walkFrame(t / cycle, b, frame), 1, hip);
      return { pose: out as Pose, hipY: hip[1], hip: [hip[0], hip[1], hip[2]], phase: 'walk', telegraph: 0 };
    },
  };
}

/** A friendly character's animations: standing at ease, Hale's wave as you walk up, a villager's work (turning on the spot aside), and walking. */
export function personClips(id: PersonId): Clip[] {
  const { stand, look } = PEOPLE[id];
  const clips: Clip[] = [
    { name: 'stand', duration: BREATH_PERIOD, sample: (t, out) => ({ pose: copyInto(friendlyPose(stand, t), out), hipY: 0, phase: 'stand', telegraph: 0 }) },
  ];
  if (id !== 'hale') {
    const work = workLoop(id);
    clips.push({
      name: 'work',
      duration: work.duration,
      sample: (t, out) => {
        const at = work.at(t);
        return { pose: copyInto(friendlyPose(at.pose, t), out), hipY: at.hip[1], phase: 'work', telegraph: 0 };
      },
    });
  }
  if (id === 'hale') {
    const duration = CONFIG.hale.waveTime;
    clips.push({
      name: 'wave',
      duration: duration + REST,
      sample: (t, out) => {
        const waving = t < duration;
        const pose = friendlyPose(stand, t, waving ? { t, duration } : undefined);
        return { pose: copyInto(pose, out), hipY: 0, phase: waving ? 'wave' : 'rest', telegraph: 0 };
      },
    });
  }
  clips.push(strollClip(stand, look.build));
  return clips;
}

/** A bench's seat, m over the floor: where the inspector sits anyone. */
const BENCH = 0.5;

/** One of the cast at `name`'s work, as a villager at it in a zone: turning on the spot to its second place, on folded legs if `sit`. */
function castWorkClip(person: Person, name: WorkName, label: string, sit: Folded | null): Clip {
  const build = BUILDS[person.look.build];
  const work = WORKS[name](person.stand, 0, { build, carry: person.carry });
  return {
    name: label,
    duration: work.duration,
    sample: (t, out) => {
      const at = work.at(t);
      const pose = { ...friendlyPose(at.pose, t), ...sit?.legs };
      const hip = sit?.hip ?? at.hip;
      return { pose: copyInto(pose, out), hipY: hip[1], hip: [hip[0], hip[1], hip[2]], phase: label, telegraph: 0, turn: at.turn, laden: work.laden?.(t) };
    },
  };
}

/**
 * One of the cast a zone places (people/cast.ts): standing at ease, standing
 * about (the work of anyone without one), at each of the works they're made
 * for (sitting at those done sitting), standing about seated on a bench,
 * walking with their load if they carry one, and strolling, as a villager
 * walks their route at their build's pace (people/villagers.ts).
 */
export function castClips(id: CastId): Clip[] {
  const person: Person = CAST[id];
  const { stand, look } = person;
  const build = BUILDS[look.build];
  const works = (person.works ?? []).map((name) => {
    const seat = SAT_AT[name as keyof typeof SAT_AT];
    return castWorkClip(person, name, seat ? `${name} (sitting)` : name, seat ? sitting(build, seat) : null);
  });
  const clips: Clip[] = [
    { name: 'stand', duration: BREATH_PERIOD, sample: (t, out) => ({ pose: copyInto(friendlyPose(stand, t), out), hipY: 0, phase: 'stand', telegraph: 0 }) },
    castWorkClip(person, 'stand', 'stand about', null),
    ...works,
    castWorkClip(person, 'stand', 'sit', sitting(build, { height: BENCH })),
  ];
  if (person.load && person.carry) clips.push(carryClip(stand, person.carry, look.build));
  clips.push(strollClip(stand, look.build));
  return clips;
}

/** Walking with their load held as they hold it, not swung: a docker with a sack on their shoulder, a porter with a crate. */
function carryClip(stand: Pose, carry: Pose, build: BuildName): Clip {
  const walk = strollClip(carry, build);
  const held = (['upperArmL', 'forearmL', 'handL', 'upperArmR', 'forearmR', 'handR'] as const).filter((b) =>
    [0, 1, 2].some((i) => Math.abs((carry[b]?.[i] ?? 0) - (stand[b]?.[i] ?? 0)) > 0.05),
  );
  return {
    name: 'carry',
    duration: walk.duration,
    sample: (t, out) => {
      const frame = walk.sample(t, out);
      for (const b of held) out[b] = [...(carry[b] ?? [0, 0, 0])] as [number, number, number];
      return { ...frame, phase: 'carry', laden: true };
    },
  };
}
