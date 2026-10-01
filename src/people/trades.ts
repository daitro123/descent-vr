import { CONFIG } from '../config';
import { DRAW } from '../enemies/poses';
import type { Pose } from '../models/rig';
import { clamp01, ease, hold, loop, move, plus, scaled, type Segment, still, type Worker, type WorkLoop, type Working } from './loop';
import { crouched, kneeling, withLegs } from './sit';
import { type MutablePose, walkFrame, walkOver } from './walk';

// The city's trades, and what its people do about the streets, on the human
// body (/zones/aldhaven-inhabitants.md, "New work loops" and "Behaviours"):
// stallholders crying their wares, shoppers browsing and haggling, two
// talking in turn, porters and dockers taking loads on and setting them down,
// the harbour's hands hauling, coiling and mending, Guild Row's tanners,
// dyers and joiner, the gardens' and the fields' work, clerks writing, the
// archers at the butts, the crane hand walking the treadwheel, and the poor,
// the grieving and the idle. Each is a loop of beats built over the
// villager's own standing pose, so what they hold stays in their hands;
// those who sit do the same work on folded legs (people/sit.ts).

/**
 * One beat of a loop: a moment of work, eased into over `move` s and held
 * `hold` s, or worked out over the hold (`work`, which starts and ends on
 * it). A beat can cry the stallholder's wares as it's reached, or bring their
 * load into their hands or set it down.
 */
interface Beat {
  readonly to: Working;
  readonly move: number;
  readonly hold: number;
  readonly work?: (u: number) => Working;
  readonly cry?: true;
  readonly load?: boolean;
}

const beat = (to: Working, move: number, hold: number, more: Partial<Beat> = {}): Beat => ({ to, move, hold, ...more });

/** 0 at a hold's ends to 1 inside them, eased: a worked hold starts and ends on its beat. */
const env = (u: number, edge = 0.15) => ease(clamp01(Math.min(u, 1 - u) / edge));

/** `w` worked over a hold of `time` s: `add(s)` (s seconds in) laid onto its pose, eased in and out at the ends. */
function worked(w: Working, time: number, add: (s: number) => Pose, edge = 0.15): (u: number) => Working {
  return (u) => ({ ...w, pose: plus(w.pose, scaled(add(u * time), env(u, edge))) });
}

/** A beat worked out over its hold. */
const working = (to: Working, move: number, time: number, add: (s: number) => Pose, more: Partial<Beat> = {}): Beat => ({
  to,
  move,
  hold: time,
  work: worked(to, time, add),
  ...more,
});

/** The beats round and round, each eased into from the last (the first from the last of all). */
function round(beats: readonly Beat[], strikes: readonly number[] = []): WorkLoop {
  const segments: Segment[] = [];
  const cries: number[] = [];
  const loads: [number, boolean][] = [];
  let t = 0;
  beats.forEach((b, i) => {
    const from = beats[(i + beats.length - 1) % beats.length].to;
    if (b.move > 0) {
      segments.push(move(b.move, from, b.to));
      t += b.move;
    }
    if (b.cry) cries.push(t);
    if (b.load !== undefined) loads.push([t, b.load]);
    if (b.hold > 0) {
      segments.push(b.work ? { time: b.hold, at: b.work } : hold(b.hold, b.to));
      t += b.hold;
    }
  });
  const work = loop(segments, strikes, cries.length ? cries : undefined);
  if (!loads.length) return work;
  const { duration } = work;
  return {
    ...work,
    laden(time: number): boolean {
      const at = ((time % duration) + duration) % duration;
      let on = loads[loads.length - 1][1];
      for (const [when, to] of loads) if (when <= at) on = to;
      return on;
    },
  };
}

/** `stand` with the bones `set` sets outright, and the rest kept (what the other hand holds). */
const over = (stand: Pose, set: Pose): Pose => ({ ...stand, ...set });

/** Talking: the jaw working in syllables, `s` s in. */
const jabber = (s: number): Pose => ({ jaw: [0.13 * Math.max(0, Math.sin(2 * Math.PI * 3.1 * s)) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.7 * s)), 0, 0] });

/** Weight shifted onto the right foot (−1) or the left (1), over `stand`, with the hips' sway. */
function shifted(stand: Pose, side: 1 | -1, turn = 0): Working {
  const S = CONFIG.villagers.stand;
  const pose =
    side < 0
      ? plus(stand, { spine: [0, 0, -0.03], thighL: [-0.07, 0, 0.06], shinL: [0.14, 0, 0], thighR: [0.02, 0, -0.02] })
      : plus(stand, { spine: [0, 0, 0.03], thighR: [-0.07, 0, -0.06], shinR: [0.14, 0, 0], thighL: [0.02, 0, 0.02] });
  return still(pose, turn, [side * S.hip, 0, 0]);
}

/** A moment bent at the knees on `who`'s legs, as `pose` has it from the hips up. */
function stooped(who: Worker, pose: Pose, a: number, b: number, turn = 0): Working {
  const c = crouched(who.build, a, b);
  return still(withLegs(pose, c), turn, c.hip);
}

// ------------------------------------------------------------------ the market

/**
 * Crying their wares behind the stall: holding up what's in the right hand
 * and calling, rearranging the stall, looking about, and waving a passer
 * over with another call. Their cries are the loop's (people/population.ts
 * shows the line to anyone near).
 */
function cry(stand: Pose): WorkLoop {
  const rest = still(stand);
  const up = still(over(stand, { spine: [-0.04, 0, 0], head: [-0.18, 0, 0], jaw: [0.3, 0, 0], upperArmR: [-2.15, 0.15, -0.25], forearmR: [-0.45, 0, 0], handR: [0.3, 0, 0] }));
  const tidy = still(over(stand, { spine: [0.38, -0.1, 0], head: [0.45, 0, 0], upperArmR: [-0.85, 0.1, -0.1], forearmR: [-0.35, 0, 0], handR: [0.3, 0, 0] }));
  const look = still(plus(stand, { head: [0, 0.6, 0], spine: [0, 0.15, 0] }));
  const beckon = still(over(stand, { head: [-0.05, -0.35, 0], spine: [0, -0.2, 0], jaw: [0.25, 0, 0], upperArmR: [-1.25, -0.35, -0.3], forearmR: [-0.9, 0, 0], handR: [-0.3, 0, 0] }));
  return round([
    beat(rest, 0.8, 3),
    working(up, 0.7, 2.2, (s) => ({ jaw: [0.1 * Math.sin(2 * Math.PI * 1.6 * s), 0, 0], handR: [0, 0.2 * Math.sin(2 * Math.PI * 0.8 * s), 0] }), { cry: true }),
    beat(rest, 0.7, 2),
    working(tidy, 0.8, 4, (s) => ({ upperArmR: [0.08 * Math.sin(2 * Math.PI * 0.6 * s), 0.3 * Math.sin(2 * Math.PI * 0.4 * s), 0], forearmR: [0.15 * Math.sin(2 * Math.PI * 0.9 * s), 0, 0] })),
    beat(rest, 0.8, 1.5),
    beat(look, 0.9, 2),
    beat(rest, 0.9, 1),
    working(beckon, 0.8, 2.2, (s) => ({ forearmR: [-0.5 * (0.5 - 0.5 * Math.cos(2 * Math.PI * 1.4 * s)), 0, 0], jaw: [0.08 * Math.sin(2 * Math.PI * 1.5 * s), 0, 0] }), { cry: true }),
    beat(rest, 0.8, 2.5),
  ]);
}

/** Gutting fish at the stall (a fish in the left hand, the knife in the right), tossing the guts aside, and holding one up to cry the catch. */
function gut(stand: Pose): WorkLoop {
  const at = still(
    over(stand, {
      spine: [0.35, 0, 0],
      head: [0.5, 0, 0],
      upperArmL: [-0.75, -0.1, 0.12],
      forearmL: [-0.6, 0, 0],
      handL: [0.4, 0, 0],
      upperArmR: [-0.8, 0.25, -0.1],
      forearmR: [-0.7, 0, 0],
      handR: [0.5, 0, 0],
    }),
  );
  const toss = still(over(at.pose, { upperArmR: [-0.6, -0.5, -0.6], forearmR: [-0.3, 0, 0], handR: [-0.3, 0, 0], head: [0.3, -0.3, 0] }));
  const up = still(over(stand, { head: [-0.15, 0, 0], jaw: [0.3, 0, 0], upperArmL: [-2.0, -0.1, 0.25], forearmL: [-0.4, 0, 0], handL: [0.2, 0, 0] }));
  const call = still(plus(stand, { head: [-0.1, -0.5, 0], spine: [0, -0.15, 0], jaw: [0.28, 0, 0] }));
  const strokes = (s: number): Pose => ({ upperArmR: [0.15 * Math.sin(2 * Math.PI * 1.8 * s), 0, 0], forearmR: [-0.2 * Math.sin(2 * Math.PI * 1.8 * s), 0, 0] });
  return round([
    working(at, 0.8, 4.5, strokes),
    beat(toss, 0.35, 0.3),
    working(at, 0.5, 4, strokes),
    beat(toss, 0.35, 0.3),
    beat(still(stand), 0.8, 0.8),
    working(up, 0.7, 2.2, (s) => ({ jaw: [0.1 * Math.sin(2 * Math.PI * 1.6 * s), 0, 0] }), { cry: true }),
    beat(still(stand), 0.7, 1),
    working(at, 0.8, 4.5, strokes),
    beat(toss, 0.35, 0.3),
    beat(still(stand), 0.8, 0.5),
    working(call, 0.7, 2, jabber, { cry: true }),
    beat(still(stand), 0.7, 1),
  ]);
}

/** Looking over a stall's goods: picking one up and turning it over, putting it back, glancing on to the next. */
function browse(stand: Pose): WorkLoop {
  const look = still(plus(stand, { spine: [0.16, 0, 0], head: [0.5, 0, 0] }));
  const reach = still(over(stand, { spine: [0.32, 0, 0], head: [0.55, 0, 0], upperArmR: [-0.95, 0.15, -0.05], forearmR: [-0.3, 0, 0], handR: [0.2, 0, 0] }));
  const held = still(over(stand, { spine: [0.08, 0, 0], head: [0.35, 0.1, 0], upperArmR: [-0.4, 0.4, -0.1], forearmR: [-1.6, 0, 0], handR: [0.2, 0.3, 0] }));
  const glance = still(plus(stand, { head: [0.2, 0.7, 0], spine: [0.05, 0.2, 0] }));
  return round([
    beat(look, 1, 2.5),
    beat(reach, 0.8, 0.5),
    working(held, 0.8, 2.8, (s) => ({ handR: [0.2 * Math.sin(2 * Math.PI * 0.5 * s), 0.6 * Math.sin(2 * Math.PI * 0.35 * s), 0] })),
    beat(reach, 0.8, 0.4),
    beat(look, 0.8, 1.5),
    beat(glance, 1, 2.2),
    beat(shifted(stand, -1), 1.2, 2.5),
    beat(shifted(stand, 1), 1.2, 2),
  ]);
}

/** Haggling with a stallholder: asking, palm up; shaking their head; pointing at the goods; hand to the purse; paying; a nod. */
function haggle(stand: Pose): WorkLoop {
  const ask = still(over(stand, { head: [0.1, 0, 0], upperArmR: [-0.6, 0.2, -0.15], forearmR: [-1.0, -0.6, 0], handR: [0, -0.4, 0] }));
  const no = still(plus(stand, { head: [0.05, 0, 0] }));
  const point = still(over(stand, { spine: [0.15, 0, 0], head: [0.35, 0, 0], upperArmR: [-1.05, 0.1, -0.05], forearmR: [-0.2, 0, 0], handR: [-0.1, 0, 0] }));
  const purse = still(over(stand, { head: [0.4, 0.2, 0], upperArmR: [-0.1, 0.5, -0.1], forearmR: [-1.4, 0.3, 0], handR: [0.4, 0, 0] }));
  const pay = still(over(stand, { head: [0.15, 0, 0], upperArmR: [-0.9, 0.05, -0.05], forearmR: [-0.4, 0, 0], handR: [0.2, 0, 0] }));
  return round([
    working(ask, 0.7, 2.5, jabber),
    working(no, 0.6, 1.6, (s) => ({ head: [0, 0.28 * Math.sin(2 * Math.PI * 1.6 * s), 0] })),
    working(point, 0.8, 1.8, jabber),
    beat(still(stand), 0.8, 2.5),
    working(ask, 0.7, 2, jabber),
    beat(purse, 0.8, 1.2),
    beat(pay, 0.7, 0.8),
    working(still(stand), 0.8, 2.5, (s) => ({ head: [0.15 * Math.sin(2 * Math.PI * 1.2 * s) ** 2, 0, 0] })),
  ]);
}

// ------------------------------------------------------------------ about the streets

/**
 * Talking with someone before them: speaking with the right hand, palm up,
 * out to the side, to the chest, for `CONFIG.villagers.talk.speak` s; then
 * listening as long, nodding now and then. Two placed half a loop apart
 * (maps/types.ts `PersonPlan.start`) talk in turn.
 */
function talk(stand: Pose): WorkLoop {
  const T = CONFIG.villagers.talk.speak;
  const palm = still(over(stand, { head: [0.05, 0, 0], upperArmR: [-0.45, 0.25, -0.15], forearmR: [-1.25, -0.5, 0], handR: [0.1, -0.5, 0] }));
  const out = still(over(stand, { head: [0, -0.1, 0], upperArmR: [-0.6, -0.15, -0.3], forearmR: [-0.9, -0.3, 0], handR: [0, 0, 0] }));
  const chest = still(over(stand, { head: [0.08, 0.05, 0], upperArmR: [-0.3, 0.45, -0.1], forearmR: [-1.7, 0, 0], handR: [0.3, 0, 0] }));
  const listen = shifted(stand, 1);
  const nod = (s: number): Pose => ({ head: [0.13 * Math.max(0, Math.sin(2 * Math.PI * 0.9 * s)) * (s % 2.8 < 1.2 ? 1 : 0), 0.05, 0] });
  const say = (s: number): Pose => ({ ...jabber(s), head: [0.03 * Math.sin(2 * Math.PI * 0.8 * s), 0.05 * Math.sin(2 * Math.PI * 0.45 * s), 0] });
  const move = 0.6;
  const each = (T - 3 * move) / 3;
  return round([working(palm, move, each, say), working(out, move, each, say), working(chest, move, each, say), working(listen, 0.9, T - 0.9, nod)]);
}

/** Reading a book held open: down the page, a page turned, a look up and about. */
function read(stand: Pose): WorkLoop {
  const page = still(plus(stand, { head: [0.18, 0, 0] }));
  const turn = still(plus(stand, { head: [0.18, 0.1, 0], upperArmR: [-0.1, -0.35, 0], forearmR: [-0.1, 0, 0], handR: [0, 0.6, 0] }));
  const up = still(plus(stand, { head: [-0.3, 0.3, 0] }));
  const scan = (s: number): Pose => ({ head: [0.04 * Math.sin(2 * Math.PI * 0.1 * s), 0.1 * Math.sin(2 * Math.PI * 0.55 * s), 0] });
  return round([working(page, 1, 6, scan), beat(turn, 0.6, 0.3), working(page, 0.6, 7, scan), beat(up, 1, 2.5)]);
}

/** Writing in the ledger on the left forearm, the quill moving along the line; looking up to listen, and about. */
function write(stand: Pose): WorkLoop {
  const at = still(plus(stand, { head: [0.3, 0, 0], spine: [0.06, 0, 0] }));
  const up = still(plus(stand, { head: [-0.08, 0.35, 0] }));
  const away = still(plus(stand, { head: [0, -0.4, 0], spine: [0, -0.1, 0] }));
  const pen = (s: number): Pose => ({ handR: [0, 0.12 * Math.sin(2 * Math.PI * 3 * s), 0], forearmR: [0.06 * ((s * 0.35) % 1) - 0.03, 0, 0] });
  return round([working(at, 0.8, 5, pen), beat(up, 0.8, 2), working(at, 0.8, 4, pen), beat(away, 0.8, 1.5)]);
}

/** Going over a ledger: holding it up to read, a finger down the column, looking out over the goods and counting them off. */
function ledger(stand: Pose): WorkLoop {
  const read = still(plus(stand, { upperArmL: [-0.35, 0, 0], forearmL: [-0.15, 0, 0], head: [0.15, 0, 0] }));
  const out = still(plus(stand, { head: [-0.05, -0.5, 0], spine: [0, -0.2, 0] }));
  const count = still(over(stand, { head: [0, -0.45, 0], spine: [0, -0.15, 0], upperArmR: [-1.3, -0.35, -0.2], forearmR: [-0.1, 0, 0], handR: [0, 0, 0] }));
  return round([
    working(read, 0.8, 4, (s) => ({ handR: [0.15 * ((s * 0.5) % 1), 0, 0] })),
    beat(out, 1, 2),
    working(count, 0.8, 3, (s) => ({ upperArmR: [0, 0.3 * Math.sin(2 * Math.PI * 0.25 * s), 0], jaw: [0.06 * Math.max(0, Math.sin(2 * Math.PI * 1.2 * s)), 0, 0] })),
    beat(still(stand), 0.8, 2),
  ]);
}

/** Looking cargo over: bent to it, round its side, up straight to write a line, a look at the ship. */
function inspect(stand: Pose): WorkLoop {
  const bent = still(plus(stand, { spine: [0.45, 0, 0], head: [0.3, 0, 0] }));
  const round_ = still(plus(stand, { spine: [0.45, 0.3, 0], head: [0.3, 0.3, 0] }));
  const at = still(plus(stand, { head: [0.3, 0, 0], spine: [0.06, 0, 0] }));
  const ship = still(plus(stand, { head: [-0.2, 0.5, 0], spine: [0, 0.15, 0] }));
  return round([
    beat(bent, 1, 2),
    beat(round_, 0.8, 1.5),
    beat(still(stand), 1, 0.5),
    working(at, 0.6, 3, (s) => ({ handR: [0, 0.12 * Math.sin(2 * Math.PI * 3 * s), 0] })),
    beat(ship, 1, 2),
  ]);
}

/** Begging, the bowl held out: up to a passer, then down with the head bowed; a shake of the bowl; a look up. */
function beg(stand: Pose): WorkLoop {
  const ask = still(plus(stand, { upperArmR: [-0.35, 0, 0], head: [-0.15, 0, 0], jaw: [0.1, 0, 0] }));
  const bowed = still(plus(stand, { head: [0.45, 0, 0], upperArmR: [0.2, 0, 0] }));
  const up = still(plus(stand, { head: [-0.2, -0.45, 0] }));
  return round([
    beat(ask, 1, 2.5),
    beat(bowed, 1.2, 4),
    working(still(stand), 0.8, 1.5, (s) => ({ handR: [0, 0.2 * Math.sin(2 * Math.PI * 3 * s), 0] })),
    beat(up, 1, 2),
  ]);
}

/** Mourning, or praying: the head bowed over folded hands, a tear wiped away, a look up. */
function mourn(stand: Pose): WorkLoop {
  const bowed = still(plus(stand, { head: [0.55, 0, 0], spine: [0.12, 0, 0] }));
  const wipe = still(over(bowed.pose, { upperArmR: [-1.3, 0.75, -0.1], forearmR: [-2.2, 0, 0], handR: [0.3, 0, 0], head: [0.35, 0, 0] }));
  const up = still(plus(stand, { head: [-0.4, 0, 0] }));
  return round([working(bowed, 1.5, 6, (s) => ({ spine: [0.012 * Math.sin(2 * Math.PI * 2.6 * s), 0, 0] })), beat(wipe, 1, 1.5), beat(bowed, 1, 2), beat(up, 1.5, 2.5)]);
}

/** Sweeping: bent over the broom, swishing it side to side; then leaning on it a while and looking about. */
function sweep(stand: Pose): WorkLoop {
  const at = still(
    over(stand, {
      spine: [0.3, 0, 0],
      head: [0.35, 0, 0],
      upperArmR: [-0.55, 0, -0.18],
      forearmR: [-1.0, 0, 0],
      handR: [-0.45, 0, 0],
      upperArmL: [-0.6, -0.4, 0.15],
      forearmL: [-0.8, 0, 0],
    }),
  );
  const swish = (s: number): Pose => {
    const a = Math.sin(2 * Math.PI * 0.8 * s);
    return { handR: [0, 0.45 * a, 0], upperArmR: [0, 0.2 * a, 0], spine: [0, 0.12 * a, 0], upperArmL: [0, 0.15 * a, 0] };
  };
  return round([working(at, 1, 6, swish), beat(still(plus(stand, { head: [0, 0.5, 0] })), 1, 2.5), working(at, 1, 5, swish), beat(shifted(stand, -1), 1, 2)]);
}

/** Eating what's in the right hand (an apple): a bite, chewing with it lowered, a look about. */
function eat(stand: Pose): WorkLoop {
  const bite = still(over(stand, { upperArmR: [-0.8, 0.45, -0.1], forearmR: [-2.0, 0, 0], handR: [0.3, 0, 0], head: [0.1, 0, 0], jaw: [0.2, 0, 0] }));
  const chew = still(over(stand, { upperArmR: [-0.3, 0.3, -0.1], forearmR: [-1.3, 0, 0], handR: [0.2, 0, 0] }));
  const munch = (s: number): Pose => ({ jaw: [0.08 * Math.abs(Math.sin(2 * Math.PI * 1.5 * s)), 0, 0] });
  return round([beat(bite, 0.8, 0.4), working(chew, 0.7, 3, munch), beat(still(plus(chew.pose, { head: [0, 0.5, 0] })), 1, 2), beat(chew, 1, 2)]);
}

/** Sitting with a pipe (the keeper): puffing, the hand up at the pipe a while, a long look out to sea. */
function pipe(stand: Pose): WorkLoop {
  const held = still(over(stand, { upperArmR: [-0.75, 0.55, -0.1], forearmR: [-2.1, 0, 0], handR: [0.2, 0, 0], head: [-0.05, 0, 0] }));
  const sea = still(plus(stand, { head: [-0.1, 0.5, 0], spine: [0, 0.1, 0] }));
  const puff = (s: number): Pose => ({ jaw: [0.04 * Math.max(0, Math.sin(2 * Math.PI * 0.5 * s)), 0, 0] });
  return round([working(still(stand), 1, 5, puff), working(held, 1, 2.5, puff), beat(sea, 1.2, 3), beat(still(stand), 1.2, 1)]);
}

/** Hands up to the sky, then pointing: the crane hand signalling the load down, or a harbourmaster waving a ship in. */
function signal(stand: Pose): WorkLoop {
  const up = still(plus(stand, { head: [-0.5, 0, 0], spine: [-0.08, 0, 0] }));
  const wave = still(over(stand, { head: [-0.45, 0, 0], jaw: [0.2, 0, 0], upperArmR: [-2.3, 0, -0.3], forearmR: [-0.3, 0, 0], handR: [0, 0, 0] }));
  const down = still(over(stand, { head: [0.2, 0, 0], upperArmR: [-0.8, 0, -0.2], forearmR: [0, 0, 0], handR: [0.4, 0, 0] }));
  return round([
    beat(up, 1, 1.5),
    working(wave, 0.8, 3, (s) => ({ forearmR: [-0.6 * (0.5 - 0.5 * Math.cos(2 * Math.PI * 1.2 * s)), 0, 0] }), { cry: true }),
    beat(down, 0.8, 2),
    beat(still(stand), 1, 3),
  ]);
}

// ------------------------------------------------------------------ the harbour

/**
 * Taking on a load and setting it down: from a cart's tail (reaching up to
 * it) or from someone before them (arms out to take it), on the shoulder or
 * in the arms as they carry it (`who.carry`), turned `turn` rad to their
 * left to bend and set it down, and back.
 */
function shift(stand: Pose, turn: number, who: Worker, from: 'cart' | 'hands'): WorkLoop {
  const side = turn || (from === 'cart' ? -1.3 : 1.3);
  const carry = who.carry ?? stand;
  const take =
    from === 'cart'
      ? still(over(stand, { spine: [0.12, 0, 0], head: [-0.15, 0, 0], upperArmL: [-1.7, -0.1, 0.1], forearmL: [-0.4, 0, 0], upperArmR: [-1.7, 0.1, -0.1], forearmR: [-0.4, 0, 0] }))
      : still(over(stand, { spine: [0.12, 0, 0], head: [0.15, 0, 0], upperArmL: [-1.0, -0.15, 0.15], forearmL: [-0.5, 0, 0], upperArmR: [-1.0, 0.15, -0.15], forearmR: [-0.5, 0, 0] }));
  const held = still(carry);
  const away = still(carry, side);
  const down = stooped(who, over(carry, { spine: [0.75, 0, 0], head: [0.3, 0, 0] }), 0.65, 1.0, side);
  const set = stooped(who, over(stand, { spine: [0.75, 0, 0], head: [0.35, 0, 0], upperArmL: [-0.7, 0, 0.15], forearmL: [-0.3, 0, 0], upperArmR: [-0.7, 0, -0.15], forearmR: [-0.3, 0, 0] }), 0.65, 1.0, side);
  const up = still(stand, side);
  return round([
    working(still(stand), 1, 2.5, (s) => ({ head: [0, 0.35 * Math.sin(2 * Math.PI * 0.2 * s), 0] })),
    beat(take, 0.9, 0.6),
    beat(take, 0, 0, { load: true }),
    beat(held, 0.7, 0.3),
    beat(away, 1.1, 0.2),
    beat(down, 0.8, 0.1),
    beat(set, 0.3, 0.4, { load: false }),
    beat(up, 0.8, 0.3),
    beat(still(stand), 1.1, 0.5),
  ]);
}

/** Hauling on a line overhead, hand over hand, braced and leaning back; a rest, and a look up the mast. */
function haul(stand: Pose): WorkLoop {
  const legs: Pose = { thighL: [-0.28, 0, 0.06], shinL: [0.18, 0, 0], thighR: [0.16, 0, -0.06], shinR: [0.06, 0, 0] };
  const a = still(over(stand, { ...legs, spine: [-0.1, 0, 0], head: [-0.3, 0, 0], upperArmL: [-2.6, 0, 0.15], forearmL: [-0.3, 0, 0], upperArmR: [-1.6, 0, -0.15], forearmR: [-1.0, 0, 0] }), 0, [0, -0.02, -0.04]);
  const b = still(over(stand, { ...legs, spine: [-0.18, 0, 0], head: [-0.35, 0, 0], upperArmL: [-1.5, 0, 0.15], forearmL: [-1.0, 0, 0], upperArmR: [-2.6, 0, -0.15], forearmR: [-0.3, 0, 0] }), 0, [0, -0.03, -0.07]);
  const mast = still(plus(stand, { head: [-0.55, 0.2, 0] }));
  return round([beat(a, 0.8, 0.15), beat(b, 0.7, 0.15), beat(a, 0.7, 0.15), beat(b, 0.7, 0.15), beat(a, 0.7, 0.15), beat(b, 0.7, 0.15), beat(still(stand), 1, 2), beat(mast, 1, 1.5)]);
}

/** Coiling a rope into the coil in the left fist: the right hand drawing a length out, bringing the loop in, four times; then a look about. */
function coil(stand: Pose): WorkLoop {
  const out = still(over(stand, { upperArmR: [-0.55, -0.35, -0.55], forearmR: [-0.4, 0, 0], handR: [0.1, 0, 0], head: [0.25, -0.2, 0] }));
  const in_ = still(over(stand, { upperArmR: [-0.3, 0.35, -0.08], forearmR: [-1.3, 0, 0], handR: [0.3, 0, 0], head: [0.35, 0, 0] }));
  const loops = [0, 1, 2, 3].flatMap(() => [beat(out, 0.7, 0.15), beat(in_, 0.6, 0.15)]);
  return round([...loops, beat(still(plus(stand, { head: [0, 0.45, 0] })), 1, 2.2), beat(still(stand), 0.8, 0.8)]);
}

/** Mending a net: the needle drawn out and through, head bent to it; shaking the net out, and a look out to sea. */
function mend(stand: Pose): WorkLoop {
  const at = still(plus(stand, { head: [0.4, 0, 0], spine: [0.15, 0, 0] }));
  const shake = still(plus(stand, { upperArmL: [-0.5, 0, 0], forearmL: [-0.2, 0, 0], head: [0.1, 0, 0] }));
  const sea = still(plus(stand, { head: [-0.1, 0.6, 0], spine: [0, 0.15, 0] }));
  const needle = (s: number): Pose => {
    const a = 2 * Math.PI * 0.7 * s;
    return { upperArmR: [0, 0.3 * Math.sin(a), 0], forearmR: [-0.25 * (0.5 - 0.5 * Math.cos(a)), 0, 0] };
  };
  return round([working(at, 1, 8, needle), beat(shake, 1, 1.5), working(at, 1, 6, needle), beat(sea, 1, 2.5)]);
}

/** Fishing: the rod held out and still but for a bob, lifted to look at the line, and a look round. */
function fishing(stand: Pose): WorkLoop {
  const lift = still(plus(stand, { upperArmR: [-0.45, 0, 0], upperArmL: [-0.35, 0, 0], handR: [-0.3, 0, 0] }));
  const look = still(plus(stand, { head: [0, -0.55, 0] }));
  return round([
    working(still(stand), 1, 7, (s) => ({ handR: [0.04 * Math.sin(2 * Math.PI * 0.6 * s), 0, 0], head: [0.05 * Math.sin(2 * Math.PI * 0.12 * s), 0, 0] })),
    beat(lift, 0.8, 1.2),
    beat(still(stand), 1.2, 3),
    beat(look, 1, 2),
  ]);
}

/**
 * Walking the treadwheel that works the crane: walking on the spot, as the
 * wheel turns under them, for a long while, and a breath standing between.
 * On the walk's legs, at their build's own step.
 */
function treadwheel(stand: Pose, _turn: number, who: Worker): WorkLoop {
  const { build } = who;
  const cycle = (2 * build.gait.step) / build.gait.speed;
  const cycles = 10;
  const frame = { pose: {} as MutablePose, hip: [0, 0, 0] as [number, number, number] };
  const walking = (u: number): Working => {
    walkFrame(u * cycles, build, frame);
    const pose = plus(stand, {}) as MutablePose;
    const hip: [number, number, number] = [0, 0, 0];
    walkOver(pose, frame, 1, hip);
    // Hands on the wheel's spokes before them, not swinging.
    pose.upperArmL = [-1.15, -0.2, 0.15];
    pose.forearmL = [-0.6, 0, 0];
    pose.upperArmR = [-1.15, 0.2, -0.15];
    pose.forearmR = [-0.6, 0, 0];
    return { pose, turn: 0, hip };
  };
  const start = walking(0);
  const rest = still(stand);
  return loop([{ time: cycle * cycles, at: walking }, move(0.7, walking(1), rest), hold(3, rest), move(0.7, rest, start)]);
}

// ------------------------------------------------------------------ Guild Row

/** Scraping a hide over the beam: leaning in and pushing the blade down it in long strokes; up to ease the back, a look at the hide. */
function scrape(stand: Pose): WorkLoop {
  const legs: Pose = { thighL: [-0.15, 0, 0.05], shinL: [0.12, 0, 0], thighR: [0.1, 0, -0.05] };
  const top = still(over(stand, { ...legs, spine: [0.55, 0, 0], head: [0.35, 0, 0], upperArmR: [-1.0, 0.2, -0.12], forearmR: [-0.5, 0, 0], upperArmL: [-1.0, -0.25, 0.12], forearmL: [-0.5, 0, 0] }));
  const push = still(over(top.pose, { spine: [0.75, 0, 0], upperArmR: [-0.6, 0.2, -0.12], forearmR: [-0.2, 0, 0], upperArmL: [-0.6, -0.25, 0.12], forearmL: [-0.2, 0, 0] }), 0, [0, -0.02, 0.02]);
  const strokes = [0, 1, 2, 3, 4].flatMap(() => [beat(push, 0.5, 0.1), beat(top, 0.6, 0.1)]);
  const ease_ = still(plus(stand, { spine: [-0.12, 0, 0], head: [-0.1, 0, 0] }));
  return round([...strokes, beat(ease_, 1, 1.5), beat(still(plus(stand, { head: [0.45, 0, 0], spine: [0.2, 0, 0] })), 1, 1.2)]);
}

/** Stirring the dye vat with the paddle, round and round; lifting the cloth on it to see the colour, and down again. */
function stir(stand: Pose): WorkLoop {
  const at = still(
    over(stand, {
      spine: [0.25, 0, 0],
      head: [0.4, 0, 0],
      upperArmR: [-0.6, 0.1, -0.15],
      forearmR: [-1.0, 0, 0],
      handR: [-0.35, 0, 0],
      upperArmL: [-0.55, -0.2, 0.1],
      forearmL: [-0.9, 0, 0],
    }),
  );
  const lift = still(over(at.pose, { spine: [0.05, 0, 0], head: [0.1, 0, 0], upperArmR: [-1.3, 0.1, -0.15], forearmR: [-1.1, 0, 0], handR: [-0.6, 0, 0] }));
  const round_ = (s: number): Pose => {
    const a = 2 * Math.PI * 0.5 * s;
    return { upperArmR: [0.18 * Math.sin(a), 0.25 * Math.cos(a), 0], spine: [0, 0.1 * Math.cos(a), 0], upperArmL: [0.12 * Math.sin(a), 0.15 * Math.cos(a), 0] };
  };
  return round([working(at, 1, 8, round_), beat(lift, 1.2, 2), beat(at, 1.2, 0.3)]);
}

/** Sawing a plank on the trestle: bent over it, the left hand holding it down, the saw going; up straight a while. */
function saw(stand: Pose): WorkLoop {
  const at = still(
    over(stand, {
      spine: [0.4, 0, 0],
      head: [0.4, 0, 0],
      upperArmL: [-0.75, -0.15, 0.15],
      forearmL: [-0.55, 0, 0],
      handL: [0.3, 0, 0],
      upperArmR: [-0.45, 0.05, -0.12],
      forearmR: [-0.35, 0, 0],
      handR: [0.6, 0, 0],
      thighL: [-0.2, 0, 0.06],
      shinL: [0.15, 0, 0],
      thighR: [0.1, 0, -0.04],
    }),
  );
  const strokes = (s: number): Pose => {
    const a = Math.sin(2 * Math.PI * 1.1 * s);
    return { upperArmR: [0.3 * a, 0, 0], forearmR: [-0.25 * a, 0, 0], spine: [0.03 * a, 0, 0] };
  };
  return round([working(at, 1, 7, strokes), beat(still(plus(stand, { spine: [-0.08, 0, 0], head: [-0.1, 0.3, 0] })), 1, 2), working(at, 1, 5, strokes), beat(still(stand), 1, 1.5)]);
}

/** Grinding in the mortar, the pestle going round; tipping it to look, and a look up. */
function grind(stand: Pose): WorkLoop {
  const at = still(plus(stand, { head: [0.35, 0, 0] }));
  const tip = still(plus(stand, { upperArmL: [-0.25, 0, 0], handL: [0.3, 0, 0], head: [0.45, 0, 0] }));
  const circle = (s: number): Pose => {
    const a = 2 * Math.PI * 1.2 * s;
    return { upperArmR: [0.08 * Math.sin(a), 0.12 * Math.cos(a), 0], forearmR: [0.06 * Math.cos(a), 0, 0] };
  };
  return round([working(at, 1, 6, circle), beat(tip, 0.8, 1.5), beat(still(plus(stand, { head: [-0.1, 0.4, 0] })), 1, 1.5)]);
}

/** Working the forge's bellows: both hands on the handle, pulled down and let up; a wipe of the brow between. */
function bellows(stand: Pose): WorkLoop {
  const up = still(
    over(stand, {
      spine: [0.1, 0, 0],
      head: [0.25, 0, 0],
      upperArmL: [-1.5, -0.2, 0.1],
      forearmL: [-0.5, 0, 0],
      upperArmR: [-1.5, 0.2, -0.1],
      forearmR: [-0.5, 0, 0],
      thighL: [-0.2, 0, 0.05],
      shinL: [0.15, 0, 0],
    }),
  );
  const down = still(over(up.pose, { spine: [0.35, 0, 0], upperArmL: [-0.8, -0.2, 0.1], forearmL: [-0.4, 0, 0], upperArmR: [-0.8, 0.2, -0.1], forearmR: [-0.4, 0, 0], shinL: [0.25, 0, 0], shinR: [0.1, 0, 0] }), 0, [0, -0.03, 0]);
  const brow = still(over(stand, { upperArmR: [-2.0, 0.7, -0.1], forearmR: [-2.0, 0, 0], handR: [0.2, 0, 0], head: [-0.1, 0, 0] }));
  const pumps = [0, 1, 2, 3, 4, 5].flatMap(() => [beat(down, 0.6, 0.1), beat(up, 0.7, 0.1)]);
  return round([...pumps, beat(brow, 0.8, 1), beat(still(stand), 0.8, 2)]);
}

/** The bar held in the fire, turned; then round to the trough, plunged hissing in, lifted out and looked at, and back to the fire. */
function quench(stand: Pose, turn: number): WorkLoop {
  const side = turn || -1.2;
  const fire = still(over(stand, { spine: [0.2, 0, 0], head: [0.3, 0, 0], upperArmR: [-0.75, 0.1, -0.15], forearmR: [-0.3, 0, 0], handR: [0.2, 0, 0] }));
  const round_ = still(over(stand, { upperArmR: [-0.6, 0, -0.15], forearmR: [-0.6, 0, 0] }), side);
  const plunge = still(over(stand, { spine: [0.5, 0, 0], head: [0.5, 0, 0], upperArmR: [-0.3, 0, -0.1], forearmR: [-0.2, 0, 0], handR: [0.8, 0, 0] }), side);
  const look = still(over(stand, { spine: [0.1, 0, 0], head: [0.2, 0, 0], upperArmR: [-0.9, 0.3, -0.1], forearmR: [-1.0, 0, 0], handR: [0.3, 0.5, 0] }), side);
  return round([
    working(fire, 1, 3.5, (s) => ({ handR: [0, 0.3 * Math.sin(2 * Math.PI * 0.4 * s), 0] })),
    beat(round_, 1, 0.3),
    beat(plunge, 0.5, 2.5),
    beat(look, 0.8, 1.5),
    beat(fire, 1, 0.3),
  ]);
}

// ------------------------------------------------------------------ gardens and fields

/** Raking: reaching the rake out and drawing it in, four times; a look about leaning on it. */
function rake(stand: Pose): WorkLoop {
  const out = still(over(stand, { spine: [0.3, 0, 0], head: [0.35, 0, 0], upperArmR: [-1.0, 0.1, -0.1], forearmR: [-0.6, 0, 0], handR: [-0.7, 0, 0], upperArmL: [-0.8, -0.35, 0.1], forearmL: [-0.6, 0, 0] }));
  const in_ = still(over(stand, { spine: [0.15, 0, 0], head: [0.4, 0, 0], upperArmR: [-0.3, 0.1, -0.15], forearmR: [-1.1, 0, 0], handR: [-0.3, 0, 0], upperArmL: [-0.4, -0.35, 0.1], forearmL: [-1.0, 0, 0] }));
  const strokes = [0, 1, 2, 3].flatMap(() => [beat(out, 0.8, 0.1), beat(in_, 1.2, 0.2)]);
  return round([...strokes, beat(still(plus(stand, { head: [0, -0.45, 0] })), 1, 2.5)]);
}

/** Hoeing: the blade lifted and chopped down into the ground, four times; up to ease the back, a look about. */
function hoe(stand: Pose): WorkLoop {
  const legs: Pose = { thighL: [-0.2, 0, 0.06], shinL: [0.15, 0, 0], thighR: [0.12, 0, -0.05] };
  const lift = still(over(stand, { ...legs, spine: [0.1, 0, 0], head: [0.3, 0, 0], upperArmR: [-1.3, 0.1, -0.12], forearmR: [-1.0, 0, 0], handR: [-1.0, 0, 0], upperArmL: [-1.1, -0.35, 0.1], forearmL: [-0.9, 0, 0] }));
  const chop = still(over(stand, { ...legs, spine: [0.4, 0, 0], head: [0.4, 0, 0], upperArmR: [-0.6, 0.1, -0.12], forearmR: [-0.9, 0, 0], handR: [-0.5, 0, 0], upperArmL: [-0.5, -0.35, 0.1], forearmL: [-0.8, 0, 0] }));
  const chops = [0, 1, 2, 3].flatMap(() => [beat(lift, 0.7, 0.1), beat(chop, 0.25, 0.4)]);
  return round([...chops, beat(still(plus(stand, { spine: [-0.12, 0, 0] })), 1, 2), beat(still(plus(stand, { head: [0, 0.5, 0] })), 1, 1.5)]);
}

/** Weeding on one knee: reaching down and pulling, tossing what's pulled in the basket on the left arm; up to stand a moment. */
function weed(stand: Pose, _turn: number, who: Worker): WorkLoop {
  const knee = kneeling(who.build);
  const down = (pose: Pose): Working => still(withLegs(pose, knee), 0, knee.hip);
  const reach = down(over(stand, { spine: [0.6, 0, 0], head: [0.4, 0, 0], upperArmR: [-1.0, 0.1, -0.1], forearmR: [-0.3, 0, 0], handR: [0.3, 0, 0] }));
  const toss = down(over(stand, { spine: [0.3, 0, 0], head: [0.4, 0.3, 0], upperArmR: [-0.3, 0.5, -0.1], forearmR: [-1.5, 0, 0], handR: [0.3, 0, 0] }));
  const pull = (s: number): Pose => ({ upperArmR: [0.15 * Math.sin(2 * Math.PI * 1.3 * s), 0.1 * Math.sin(2 * Math.PI * 0.6 * s), 0], forearmR: [-0.2 * Math.max(0, Math.sin(2 * Math.PI * 1.3 * s)), 0, 0] });
  return round([working(reach, 1, 4, pull), beat(toss, 0.7, 0.5), working(reach, 0.7, 4, pull), beat(toss, 0.7, 0.5), beat(down(plus(stand, { head: [0, 0.5, 0] })), 1, 2), beat(still(stand), 1.4, 2), beat(down(over(stand, { spine: [0.4, 0, 0] })), 1.4, 0.3)]);
}

/** Forking hay: the tines driven in, the forkful lifted and turned and tossed aside, twice; a rest leaning on it. */
function fork(stand: Pose, turn: number): WorkLoop {
  const side = turn || 0.9;
  const stab = still(over(stand, { spine: [0.35, 0, 0], head: [0.35, 0, 0], upperArmR: [-0.4, 0.15, -0.15], forearmR: [-0.3, 0, 0], handR: [1.0, 0, 0], upperArmL: [-0.75, -0.4, 0.1], forearmL: [-0.6, 0, 0] }));
  const lift = still(over(stab.pose, { spine: [0.1, 0, 0], upperArmR: [-0.8, 0.15, -0.15], forearmR: [-0.6, 0, 0], handR: [0.6, 0, 0], upperArmL: [-1.0, -0.4, 0.1] }));
  const toss = still(over(lift.pose, { spine: [-0.05, 0.2, 0], upperArmR: [-1.4, 0.1, -0.2], forearmR: [-0.5, 0, 0], handR: [0.2, 0, 0], upperArmL: [-1.3, -0.4, 0.1] }), side);
  const once = [beat(stab, 0.6, 0.2), beat(lift, 0.7, 0.2), beat(toss, 0.7, 0.3)];
  return round([...once, ...once, beat(still(stand), 1, 2.5)]);
}

/** Picking fruit: reaching up into the tree and twisting one off, down into the basket on the left arm, up again elsewhere; a look about. */
function pick(stand: Pose): WorkLoop {
  const up = still(over(stand, { head: [-0.5, 0.1, 0], spine: [-0.08, 0, 0], upperArmR: [-2.6, 0.2, -0.2], forearmR: [-0.4, 0, 0], handR: [0, 0, 0] }));
  const there = still(over(up.pose, { head: [-0.45, 0.4, 0], spine: [-0.06, 0.3, 0] }));
  const basket = still(over(stand, { head: [0.35, 0, 0], upperArmR: [-0.3, 0.5, -0.1], forearmR: [-1.4, 0, 0], handR: [0.3, 0, 0] }));
  const twist = (s: number): Pose => ({ handR: [0, 0.4 * Math.sin(2 * Math.PI * 1.5 * s), 0] });
  return round([working(up, 1, 0.8, twist), beat(basket, 1, 0.5), working(there, 1.1, 0.8, twist), beat(basket, 1, 0.5), beat(still(plus(stand, { head: [-0.2, -0.4, 0] })), 1, 2)]);
}

/** Drawing water at the well: bent over the kerb lowering the bucket, hauling it up hand over hand, set on the kerb, and lifted down. */
function drawWater(stand: Pose): WorkLoop {
  const lower = still(over(stand, { spine: [0.5, 0, 0], head: [0.5, 0, 0], upperArmR: [-0.9, 0.1, -0.1], forearmR: [-0.1, 0, 0], handR: [0, 0, 0], upperArmL: [-0.8, -0.1, 0.1], forearmL: [-0.2, 0, 0] }));
  const a = still(over(lower.pose, { spine: [0.3, 0, 0], upperArmR: [-1.5, 0.1, -0.1], forearmR: [-0.4, 0, 0], upperArmL: [-0.7, -0.1, 0.1] }));
  const b = still(over(lower.pose, { spine: [0.3, 0, 0], upperArmR: [-0.8, 0.1, -0.1], forearmR: [-0.6, 0, 0], upperArmL: [-1.5, -0.1, 0.1], forearmL: [-0.4, 0, 0] }));
  const kerb = still(over(stand, { spine: [0.25, 0, 0], head: [0.4, 0, 0], upperArmR: [-0.75, 0.1, -0.15], forearmR: [-0.6, 0, 0], handR: [0.3, 0, 0] }));
  return round([beat(lower, 1.2, 1), beat(a, 0.6, 0.1), beat(b, 0.6, 0.1), beat(a, 0.6, 0.1), beat(b, 0.6, 0.1), beat(kerb, 0.8, 2.5), beat(still(stand), 1, 3)]);
}

/** Brushing down a horse: long strokes along its flank, the left hand on it; lower down its legs; a step back to look. */
function brush(stand: Pose): WorkLoop {
  const flank = still(
    over(stand, {
      spine: [0.1, 0, 0],
      head: [0.2, 0, 0],
      upperArmR: [-1.25, 0.2, -0.1],
      forearmR: [-0.6, 0, 0],
      handR: [0.4, 0, 0],
      upperArmL: [-1.0, -0.3, 0.1],
      forearmL: [-0.4, 0, 0],
      handL: [0.3, 0, 0],
    }),
  );
  const low = still(over(flank.pose, { spine: [0.45, 0, 0], head: [0.35, 0, 0], upperArmR: [-0.85, 0.2, -0.1] }));
  const strokes = (s: number): Pose => ({ upperArmR: [0, 0.45 * Math.sin(2 * Math.PI * 0.7 * s), 0], spine: [0, 0.08 * Math.sin(2 * Math.PI * 0.7 * s), 0] });
  return round([working(flank, 1, 6, strokes), working(low, 1, 4, strokes), beat(still(plus(stand, { head: [-0.1, 0.3, 0] })), 1, 2)]);
}

/** At the butts: an arrow from the quiver, the bow raised and drawn and held, loosed, and a look at where it struck. */
function archery(stand: Pose): WorkLoop {
  const nock = still(over(stand, { upperArmR: [-2.5, 0.3, -0.3], forearmR: [-1.8, 0, 0], handR: [0, 0, 0] }));
  const drawn = still(DRAW.windup);
  const loosed = still(DRAW.strike);
  const look = still(plus(stand, { head: [-0.05, 0, 0], spine: [0.02, 0, 0] }));
  return round([beat(still(stand), 0.8, 2.5), beat(nock, 0.6, 0.3), beat(still(stand), 0.5, 0.2), beat(drawn, 0.9, 2), beat(loosed, 0.08, 0.6), beat(look, 0.8, 2.5)]);
}

/**
 * The city's work loops (people/work.ts WORKS spreads them in), by name. Each
 * is made from the villager's standing pose, for one with a second place
 * (where a load is set down, the forge's trough, where hay is tossed) how far
 * round to their left it stands, and who's at it.
 */
export const TRADES = {
  cry: (stand: Pose) => cry(stand),
  gut: (stand: Pose) => gut(stand),
  browse: (stand: Pose) => browse(stand),
  haggle: (stand: Pose) => haggle(stand),
  talk: (stand: Pose) => talk(stand),
  read: (stand: Pose) => read(stand),
  write: (stand: Pose) => write(stand),
  ledger: (stand: Pose) => ledger(stand),
  inspect: (stand: Pose) => inspect(stand),
  beg: (stand: Pose) => beg(stand),
  mourn: (stand: Pose) => mourn(stand),
  sweep: (stand: Pose) => sweep(stand),
  eat: (stand: Pose) => eat(stand),
  pipe: (stand: Pose) => pipe(stand),
  signal: (stand: Pose) => signal(stand),
  unload: (stand: Pose, turn: number, who: Worker) => shift(stand, turn, who, 'cart'),
  take: (stand: Pose, turn: number, who: Worker) => shift(stand, turn, who, 'hands'),
  haul: (stand: Pose) => haul(stand),
  coil: (stand: Pose) => coil(stand),
  mend: (stand: Pose) => mend(stand),
  fish: (stand: Pose) => fishing(stand),
  treadwheel: (stand: Pose, turn: number, who: Worker) => treadwheel(stand, turn, who),
  scrape: (stand: Pose) => scrape(stand),
  stir: (stand: Pose) => stir(stand),
  saw: (stand: Pose) => saw(stand),
  grind: (stand: Pose) => grind(stand),
  bellows: (stand: Pose) => bellows(stand),
  quench: (stand: Pose, turn: number) => quench(stand, turn),
  rake: (stand: Pose) => rake(stand),
  hoe: (stand: Pose) => hoe(stand),
  weed: (stand: Pose, turn: number, who: Worker) => weed(stand, turn, who),
  fork: (stand: Pose, turn: number) => fork(stand, turn),
  pick: (stand: Pose) => pick(stand),
  drawWater: (stand: Pose) => drawWater(stand),
  brush: (stand: Pose) => brush(stand),
  archery: (stand: Pose) => archery(stand),
} satisfies Record<string, (stand: Pose, turn: number, who: Worker) => WorkLoop>;

/**
 * The seat a work is usually done on, where it's shown off its zone (the
 * model inspector): mending and fishing on the quay's edge, the pipe on a
 * crate, begging on the ground. A zone seats anyone it likes
 * (maps/types.ts `PersonPlan.seat`).
 */
export const SAT_AT: Partial<Record<keyof typeof TRADES, { readonly height: number; readonly hang?: boolean }>> = {
  mend: { height: 0.45 },
  fish: { height: 0, hang: true },
  pipe: { height: 0.45 },
  beg: { height: 0 },
};
