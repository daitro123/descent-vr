import { CONFIG } from '../config';
import type { Interior } from '../save/record';

// The ambience's mix follows the light's cues (spec, "Sound"): behind a shut
// door the outdoors is muffled and quiet and the room's fires come up; past
// the adit's bend the outdoors fades out and the mine's air comes in; at the
// breach into the crypt the drone rises; and while anything fights you the
// whole ambience dips. A pure function of those states: fx/ambience.ts plays it.

/** A building's room, as the Interiors switch has it: how far its door stands open and how far its light has come up, 0 to 1. */
export interface RoomCue {
  readonly id: Interior;
  readonly door: number;
  readonly light: number;
}

/** The light's cues the mix goes by, as the World has them. */
export interface Cues {
  /** Every building's room. */
  readonly rooms: readonly RoomCue[];
  /** How far the mine's light has come up past the adit's bend, 0 to 1. */
  readonly mine: number;
  /** Metres on past the breach into the crypt along the mine's route: negative short of it, -Infinity out of the mine. */
  readonly crypt: number;
}

/** How loud each part of the ambience is, 0 to 1, and how muffled (a lowpass's cutoff, Hz). */
export interface Mix {
  /** The outdoors: the wind, the birds and the places outside. */
  outdoors: number;
  outdoorsCutoff: number;
  /** Each room's own sounds, by the cues' `rooms`' order. */
  readonly rooms: { level: number; cutoff: number }[];
  /** The mine's hollow air and drips. */
  air: number;
  /** The mine's creaking timbers. */
  timbers: number;
  /** The arena's drone, in the crypt. */
  drone: number;
  /** All of it, dipped while anything fights you. */
  all: number;
}

type Rules = typeof CONFIG.sound.mix;

export function blankMix(): Mix {
  return { outdoors: 1, outdoorsCutoff: CONFIG.sound.mix.open, rooms: [], air: 0, timbers: 0, drone: 0, all: 1 };
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** From `a` to `b` Hz by `t`, evenly in pitch. */
const sweep = (a: number, b: number, t: number) => a * (b / a) ** t;

/** The mix for these cues, with (`fight`) or without anything fighting you, written into `out`. */
export function mix(cues: Cues, fight: boolean, out: Mix = blankMix(), rules: Rules = CONFIG.sound.mix): Mix {
  const { open, inside, walls, door, crypt } = rules;
  // Behind the shut door you're furthest behind, or past the mine's bend.
  let room = 0;
  for (const r of cues.rooms) room = Math.max(room, r.light);
  const under = clamp01(cues.mine);
  out.outdoors = lerp(1, inside.level, room) * (1 - under);
  out.outdoorsCutoff = sweep(open, inside.cutoff, Math.max(room, under));
  // A room's sounds come up as its light does, or partly as its door opens.
  out.rooms.length = cues.rooms.length;
  cues.rooms.forEach((r, i) => {
    const t = Math.max(clamp01(r.light), clamp01(r.door) * door);
    const o = (out.rooms[i] ??= { level: 0, cutoff: open });
    o.level = lerp(walls.level, 1, t) * (1 - under);
    o.cutoff = sweep(walls.cutoff, open, t);
  });
  // The drone rises across the breach, as the timbers give way to dressed stone.
  const deep = smooth((cues.crypt - crypt.from) / (crypt.to - crypt.from));
  out.air = under * lerp(1, crypt.air, deep);
  out.timbers = under * (1 - deep);
  out.drone = under * deep;
  out.all = fight ? rules.fight.level : 1;
  return out;
}

/** 0 to 1, eased at both ends. */
function smooth(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}
