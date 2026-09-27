import { type AttackConfig, CONFIG } from '../config';
import { SUMMON_ATTACK } from '../enemies/kinds';
import { ATTACK_POSES, IDLE, KNEEL, KNEEL_DROP, RISE, STAGGER, walkOffsets } from '../enemies/poses';
import { type EnemyKind, PROPORTIONS } from '../models/characters';
import { BONES, blendPoses, type Pose } from '../models/rig';

// The inspector's animations: every pose the game plays for a kind, as a
// looping clip with the game's own timings and easing (see Enemy.updateAttack),
// so what loops here is what swings at the player in a fight.

export type MutablePose = Record<string, [number, number, number]>;

export interface ClipFrame {
  pose: Pose;
  /** Hip offset in Y, metres (walk bob, kneel drop). */
  hipY: number;
  /** Which part of the clip `t` is in, for the label ("windup", "hold"...). */
  phase: string;
  /** Weapon telegraph as the game shows it: 0 = off, else its strength. */
  telegraph: number;
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

function walkClip(kind: EnemyKind): Clip {
  const p = PROPORTIONS[kind];
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

/** Idle → pose → hold → idle, for the reaction poses the game eases into. */
function holdClip(kind: EnemyKind, name: string, pose: Pose, hold: number, hipDrop = 0): Clip {
  const idle = IDLE[kind];
  const IN = 0.3;
  const OUT = 0.5;
  const drop = hipDrop * PROPORTIONS[kind].hipY;
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

/** Every animation the game plays for this kind, in a stable order. */
export function clipsFor(kind: EnemyKind): Clip[] {
  const def = CONFIG.enemies[kind];
  const clips: Clip[] = [idleClip(kind), walkClip(kind)];
  // One clip per distinct attack pose; the first config entry supplies the timings.
  const seen = new Set<string>();
  for (const attack of def.attacks) {
    if (seen.has(attack.pose)) continue;
    seen.add(attack.pose);
    clips.push(attackClip(kind, attack));
  }
  if (kind === 'warden') clips.push(attackClip(kind, SUMMON_ATTACK));
  clips.push(holdClip(kind, 'stagger', STAGGER, def.staggerTime * 0.6));
  if (kind === 'warden') clips.push(holdClip(kind, 'kneel', KNEEL, CONFIG.warden.kneelTime, KNEEL_DROP));
  clips.push(holdClip(kind, 'rise', RISE, 0.8));
  return clips;
}
