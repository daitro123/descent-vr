import type { Clip, MutablePose } from '../../inspector/clips';
import { walkOffsets } from '../../enemies/poses';
import { BONES, type Pose } from '../rig';

// PROTOTYPE (Friendly characters): inspector clips for people who don't fight:
// standing and breathing, a wave (as the ?talk prototype's Hale greeted you),
// and a walk on top of their stand.

function set(out: MutablePose, base: Pose, extra: Pose): Pose {
  for (const k of Object.keys(out)) delete out[k];
  for (const name of BONES) {
    const b = base[name];
    const e = extra[name];
    if (!b && !e) continue;
    out[name] = [(b?.[0] ?? 0) + (e?.[0] ?? 0), (b?.[1] ?? 0) + (e?.[1] ?? 0), (b?.[2] ?? 0) + (e?.[2] ?? 0)];
  }
  return out as Pose;
}

export function friendlyClips(stand: Pose): Clip[] {
  const walk: MutablePose = {};
  return [
    {
      name: 'stand',
      duration: 3.7,
      sample: (t, out) => ({ pose: set(out, stand, { spine: [0.02 * Math.sin((t / 3.7) * Math.PI * 2), 0, 0] }), hipY: 0, phase: 'stand', telegraph: 0 }),
    },
    {
      name: 'wave',
      duration: 2.6,
      sample: (t, out) => {
        const lift = Math.max(0, Math.min(1, t * 4, (1.8 - t) * 6));
        const pose = set(out, stand, {}) as MutablePose;
        pose.upperArmR = [-0.3 * lift, 0, -0.1 - 2.3 * lift];
        pose.forearmR = [0, 0, -0.5 * lift + 0.45 * lift * Math.sin(t * 10)];
        pose.handR = [0, 0, 0];
        return { pose, hipY: 0, phase: t < 1.8 ? 'wave' : 'rest', telegraph: 0 };
      },
    },
    {
      name: 'walk',
      duration: (2 * Math.PI) / 7,
      sample: (t, out) => {
        for (const k of Object.keys(walk)) delete walk[k];
        walkOffsets(t * 7, 1, walk);
        return { pose: set(out, stand, walk as Pose), hipY: -Math.abs(Math.sin(t * 7)) * 0.03, phase: 'walk', telegraph: 0 };
      },
    },
  ];
}
