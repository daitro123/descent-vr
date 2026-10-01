import { CONFIG } from '../config';
import type { PersonId } from '../models/people';
import type { Pose } from '../models/rig';
import { clamp01, ease, eventsBetween, hold, loop, mix, move, plus, type Segment, still, type WorkLoop, type Worker } from './loop';
import { TRADES } from './trades';

// What the villagers do all day, on the human body: pure loops of poses, shared
// by the game and the model inspector so what loops on the plinth is what
// works in Oakvale (.scratch/oakvale-starting-zone/spec.md, "Friendly
// characters"). The smith strikes in bursts of a few blows, turns the piece
// and now and then turns to pump the bellows; the innkeeper wipes the bar,
// polishes a tankard, sets it down and picks up another; the farmer leans on
// the pitchfork, shifts their weight and shades their eyes to look off
// towards the farm.

export type { Working, WorkLoop, Worker } from './loop';

// ------------------------------------------------------------------ the smith

/** Over the anvil: leaning in, looking at the piece held in the tongs, the hammer resting on it. */
const SMITH_ON: Pose = {
  spine: [0.28, 0, 0],
  head: [0.35, 0, 0],
  upperArmR: [-0.55, 0.3, -0.1],
  forearmR: [-0.75, 0, 0],
  handR: [0.75, 0, 0],
  upperArmL: [-0.55, -0.35, 0.12],
  forearmL: [-0.8, 0, 0],
  handL: [0.55, 0, 0],
  thighL: [-0.12, 0, 0.08],
  shinL: [0.08, 0, 0],
  thighR: [0.1, 0, -0.08],
};
/** The hammer up over the shoulder for a blow. */
const SMITH_UP: Pose = { ...SMITH_ON, upperArmR: [-1.45, 0.25, -0.18], forearmR: [-1.35, 0, 0], handR: [-0.35, 0, 0], spine: [0.2, 0, 0] };
/** Turning the piece over: the tongs twisted, the hammer at rest. */
const SMITH_TURN: Pose = { ...SMITH_ON, upperArmL: [-0.7, -0.35, 0.12], handL: [0.55, 1.4, 0], upperArmR: [-0.3, 0.2, -0.1], forearmR: [-0.9, 0, 0], handR: [0.4, 0, 0] };
/** At the bellows: the piece held in the fire in the tongs, the right hand (hammer and all) up on the handle. */
const SMITH_PUMP_UP: Pose = {
  spine: [0.22, 0, 0],
  head: [0.3, 0, 0],
  upperArmL: [-1.2, -0.1, 0.1],
  forearmL: [-0.25, 0, 0],
  handL: [0.45, 0, 0],
  upperArmR: [-0.95, 0.05, -0.12],
  forearmR: [-0.55, 0, 0],
  handR: [0.2, 0, 0],
  thighL: [-0.12, 0, 0.06],
  thighR: [0.08, 0, -0.06],
};
/** The handle pulled down. */
const SMITH_PUMP_DOWN: Pose = { ...SMITH_PUMP_UP, spine: [0.32, 0, 0], upperArmR: [-0.5, 0.05, -0.12], forearmR: [-0.4, 0, 0], thighL: [-0.16, 0, 0.06], shinL: [0.15, 0, 0], shinR: [0.1, 0, 0] };

/** Where in a blow the hammer lands: it goes up, hangs a moment, then comes down fast. */
const BLOW_LANDS = 0.82;

function smithLoop(bellowsTurn: number): WorkLoop {
  const S = CONFIG.villagers.smith;
  const on = still(SMITH_ON);
  const up = still(SMITH_UP);
  const blow: Segment = {
    time: S.blow,
    at: (u) => {
      if (u < 0.55) return mix(on, up, ease(u / 0.55));
      if (u < 0.7) return up;
      if (u < BLOW_LANDS) {
        const k = (u - 0.7) / (BLOW_LANDS - 0.7);
        return mix(up, on, k * k);
      }
      return on;
    },
  };
  const turnPiece: Segment = {
    time: S.turnPiece,
    at: (u) => mix(on, still(SMITH_TURN), Math.sin(Math.PI * clamp01(u))),
  };
  const pumpUp = still(SMITH_PUMP_UP, bellowsTurn);
  const pumpDown = still(SMITH_PUMP_DOWN, bellowsTurn);
  const pump: Segment = { time: S.pump, at: (u) => mix(pumpUp, pumpDown, Math.sin(Math.PI * clamp01(u))) };
  const segments: Segment[] = [];
  const strikes: number[] = [];
  let t = 0;
  S.bursts.forEach((blows, i) => {
    for (let k = 0; k < blows; k++) {
      segments.push(blow);
      strikes.push(t + S.blow * BLOW_LANDS);
      t += S.blow;
    }
    if (i < S.bursts.length - 1) {
      segments.push(turnPiece);
      t += S.turnPiece;
    }
  });
  segments.push(move(S.face, on, pumpUp));
  for (let k = 0; k < S.pumps; k++) segments.push(pump);
  segments.push(move(S.face, pumpUp, on));
  return loop(segments, strikes);
}

// ------------------------------------------------------------------ the innkeeper

/** Wiping the bar: leaning over it, the rag flat under the left hand, the tankard held low in the right. */
const KEEP_WIPE: Pose = {
  spine: [0.3, 0, 0],
  head: [0.3, 0, 0],
  upperArmL: [-0.8, -0.1, 0.12],
  forearmL: [-0.45, 0, 0],
  handL: [0.5, 0, 0],
  upperArmR: [0.02, 0, -0.14],
  forearmR: [-0.7, 0, 0],
  handR: [0.35, 0, 0],
};
/** Polishing: the tankard up before the chest, the rag at it. */
const KEEP_POLISH: Pose = {
  spine: [0.06, 0, 0],
  head: [0.3, 0, 0],
  upperArmR: [-0.35, 0.45, -0.1],
  forearmR: [-1.45, 0, 0],
  handR: [0.3, 0, 0],
  upperArmL: [-0.4, -0.55, 0.1],
  forearmL: [-1.45, 0, 0],
  handL: [0, 0, 0],
};
/** Setting it down on the bar. */
const KEEP_SET: Pose = {
  spine: [0.28, 0, 0],
  head: [0.25, 0, 0],
  upperArmR: [-0.85, 0.1, -0.1],
  forearmR: [-0.4, 0, 0],
  handR: [0.3, 0, 0],
  upperArmL: [-0.2, 0, 0.12],
  forearmL: [-0.5, 0, 0],
};
/** Reaching along the bar to their right for the next. */
const KEEP_REACH: Pose = { ...KEEP_SET, spine: [0.28, -0.25, 0], upperArmR: [-0.85, -0.3, -0.25] };

function innkeeperLoop(): WorkLoop {
  const K = CONFIG.villagers.innkeeper;
  const rub = (u: number, time: number) => 2 * Math.PI * K.rubs * time * u;
  // The rag's rubbing eases in and out at a stretch's ends, so it comes and goes without a jump.
  const env = (u: number) => ease(clamp01(Math.min(u, 1 - u) / 0.1));
  const wipe: Segment = {
    time: K.wipe,
    at: (u) => {
      const a = rub(u, K.wipe);
      const k = env(u);
      const w = still(plus(KEEP_WIPE, { upperArmL: [0.1 * k * Math.sin(a), 0.3 * k * Math.cos(a), 0] }));
      // Into the wipe from the reach, and out of it into the polish.
      return u < 0.1 ? mix(still(KEEP_REACH), w, ease(u / 0.1)) : u > 0.9 ? mix(w, still(KEEP_POLISH), ease((u - 0.9) / 0.1)) : w;
    },
  };
  const polish: Segment = {
    time: K.polish,
    at: (u) => {
      const a = rub(u, K.polish);
      const k = env(u);
      return still(plus(KEEP_POLISH, { forearmL: [0.12 * k * Math.sin(a), 0, 0], handL: [0, 0.3 * k * Math.cos(a), 0], handR: [0, 0.15 * k * Math.sin(a * 0.25), 0] }));
    },
  };
  return loop([wipe, polish, move(K.setDown, still(KEEP_POLISH), still(KEEP_SET)), move(K.pickUp, still(KEEP_SET), still(KEEP_REACH))]);
}

// ------------------------------------------------------------------ the farmer

/** Leaning on the pitchfork, weight on the right foot, the left knee easy. */
const FARM_RIGHT: Pose = {
  spine: [0.06, 0, -0.07],
  head: [0.02, 0, 0.05],
  upperArmR: [-0.3, 0, -0.26],
  forearmR: [-1.2, 0, 0],
  upperArmL: [0.04, 0, 0.08],
  forearmL: [-0.25, 0, 0],
  thighR: [0.02, 0, -0.04],
  thighL: [-0.1, 0, 0.1],
  shinL: [0.2, 0, 0],
};
/** Weight on the left foot. */
const FARM_LEFT: Pose = {
  ...FARM_RIGHT,
  spine: [0.05, 0, 0.04],
  head: [0.02, 0, -0.03],
  thighR: [-0.1, 0, -0.1],
  shinR: [0.18, 0, 0],
  thighL: [0.02, 0, 0.04],
  shinL: [0, 0, 0],
};
/** Shading their eyes with the left hand, looking off towards the farm. */
const FARM_LOOK: Pose = { ...FARM_LEFT, head: [-0.12, 0, 0], upperArmL: [-2.2, -0.45, 0.25], forearmL: [-1.45, 0, 0], handL: [0.25, 0, 0] };
const LEAN_HIP = 0.035;

function farmerLoop(): WorkLoop {
  const F = CONFIG.villagers.farmer;
  const right = still(FARM_RIGHT, 0, [-LEAN_HIP, 0, 0]);
  const left = still(FARM_LEFT, 0, [LEAN_HIP, 0, 0]);
  const look = still(FARM_LOOK, 0, [LEAN_HIP, 0, 0]);
  return loop([
    hold(F.lean, right),
    move(F.shift, right, left),
    hold(F.lean, left),
    move(F.lift, left, look),
    hold(F.look, look),
    move(F.lift, look, left),
    move(F.shift, left, right),
  ]);
}

// ------------------------------------------------------------------ the herbalist

/** At the bench's end, the bundle held before them: looking it over. */
const HERB_HOLD: Pose = {
  spine: [0.12, 0, 0],
  head: [0.35, 0, 0],
  upperArmL: [-0.35, -0.1, 0.1],
  forearmL: [-1.25, 0, 0],
  handL: [0.3, 0, 0],
  upperArmR: [-0.3, 0.1, -0.1],
  forearmR: [-1.1, 0, 0],
  handR: [0.3, 0, 0],
  thighL: [-0.04, 0, 0.03],
  thighR: [0.03, 0, -0.03],
};
/** Reaching along the bench to their right for a sprig. */
const HERB_REACH: Pose = { ...HERB_HOLD, spine: [0.3, -0.35, 0], head: [0.4, -0.3, 0], upperArmR: [-0.9, -0.35, -0.2], forearmR: [-0.35, 0, 0], handR: [0.5, 0, 0] };
/** Holding the bundle up to the light. */
const HERB_UP: Pose = { ...HERB_HOLD, spine: [0.02, 0, 0], head: [-0.15, 0, 0], upperArmL: [-1.3, -0.2, 0.15], forearmL: [-1.1, 0, 0] };

function herbalistLoop(): WorkLoop {
  const H = CONFIG.alchemyBench.herbalist;
  const held = still(HERB_HOLD);
  // Tying the sprig in: the right hand winds round the stems.
  const tie: Segment = {
    time: H.tie,
    at: (u) => still(plus(HERB_HOLD, { forearmR: [0.15 * Math.sin(u * Math.PI * 8), 0, 0], handR: [0, 0.5 * Math.sin(u * Math.PI * 8), 0] })),
  };
  return loop([
    move(H.reach, held, still(HERB_REACH)),
    move(H.reach, still(HERB_REACH), held),
    tie,
    move(H.hang, held, still(HERB_UP)),
    move(H.hang, still(HERB_UP), held),
  ]);
}

// ------------------------------------------------------------------ standing about

/**
 * Standing about, for anyone with no work of their own: weight on one foot,
 * then the other, now and then a look round to one side, then the other.
 * Built over `stand`, so whatever they hold stays in their hands.
 */
function standLoop(stand: Pose): WorkLoop {
  const S = CONFIG.villagers.stand;
  const onRight = plus(stand, { spine: [0, 0, -0.03], thighL: [-0.07, 0, 0.06], shinL: [0.14, 0, 0], thighR: [0.02, 0, -0.02] });
  const onLeft = plus(stand, { spine: [0, 0, 0.03], thighR: [-0.07, 0, -0.06], shinR: [0.14, 0, 0], thighL: [0.02, 0, 0.02] });
  const right = still(onRight, 0, [-S.hip, 0, 0]);
  const left = still(onLeft, 0, [S.hip, 0, 0]);
  // A look round to their left, and later to their right: the head most of the way, the chest a little.
  const lookLeft = still(plus(onLeft, { head: [0, S.look, 0], spine: [0, S.look * 0.25, 0] }), 0, [S.hip, 0, 0]);
  const lookRight = still(plus(onRight, { head: [0, -S.look, 0], spine: [0, -S.look * 0.25, 0] }), 0, [-S.hip, 0, 0]);
  return loop([
    hold(S.rest, right),
    move(S.shift, right, left),
    hold(S.rest * 0.6, left),
    move(S.turn, left, lookLeft),
    hold(S.glance, lookLeft),
    move(S.turn, lookLeft, left),
    hold(S.rest * 0.8, left),
    move(S.shift, left, right),
    hold(S.rest * 0.6, right),
    move(S.turn, right, lookRight),
    hold(S.glance, lookRight),
    move(S.turn, lookRight, right),
  ]);
}

/**
 * Every work loop a zone can give a villager (maps/types.ts `PersonPlan`), by
 * name: standing about, one of Oakvale's trades, or one of the city's
 * (people/trades.ts). Each is made from the villager's standing pose, for a
 * work with a second place (the smith's bellows) how far round to their left
 * it stands, and who's at it (their build). A model family adds its own loops
 * here.
 */
export const WORKS = {
  stand: (stand: Pose) => standLoop(stand),
  smith: (_stand: Pose, turn: number) => smithLoop(turn),
  innkeeper: () => innkeeperLoop(),
  farmer: () => farmerLoop(),
  herbalist: () => herbalistLoop(),
  ...TRADES,
} satisfies Record<string, (stand: Pose, turn: number, who: Worker) => WorkLoop>;

/** A work loop's name. */
export type WorkName = keyof typeof WORKS;

/** A friendly character's work. The smith's bellows stand `bellowsTurn` rad round to their left from where they face the anvil. */
export function workLoop(id: Exclude<PersonId, 'hale'>, bellowsTurn = 0): WorkLoop {
  switch (id) {
    case 'herbalist':
      return herbalistLoop();
    case 'smith':
      return smithLoop(bellowsTurn);
    case 'innkeeper':
      return innkeeperLoop();
    case 'farmer':
      return farmerLoop();
  }
}

/** How many of `loop`'s blows land after `from` s and up to `to` s (any times: it wraps). */
export function strikesBetween(work: WorkLoop, from: number, to: number): number {
  return eventsBetween(work.strikes, work.duration, from, to);
}
