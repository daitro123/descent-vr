import type { Role, Stage } from './adventureState';
import { CONFIG } from './config';
import type { CampId } from './maps/types';

// Marshal Hale's quest chain, as data: what each quest asks, what it pays, and
// what Hale says about it. The adventure state holds the rules that move you
// through it. The lines are placeholders, cheap to change
// (.scratch/oakvale-starting-zone/spec.md, "Hale's board and the villagers' barks").

export type QuestId = 'raiders' | 'lumber' | 'below';

/** Where a quest sends you, for the quest arrow: the farm, the lumber camp, or the old mine's mouth. */
export type Place = 'farm' | 'lumberCamp' | 'mine';

/** Something an objective asks you to pick up by hand. */
export type Item = 'orders';

/** Every sword: the one you start with, and Hale's old longsword. */
export const SWORDS = ['plain', 'hale'] as const;

/** The sword in your hand. */
export type Sword = (typeof SWORDS)[number];

/** One thing a quest asks before it can be handed in. */
export type Objective =
  /** Kills of one camp's members, or of an enemy of one role (the Warden, who is in no camp). */
  | { readonly kind: 'kill'; readonly text: string; readonly need: number; readonly camp?: CampId; readonly role?: Role }
  /** Something picked up by hand. */
  | { readonly kind: 'pickup'; readonly text: string; readonly need: number; readonly item: Item };

export interface Quest {
  readonly id: QuestId;
  readonly title: string;
  readonly objectives: readonly Objective[];
  /** Where its objectives are, which the quest arrow points at while it's under way. */
  readonly place: Place;
  readonly xp: number;
  /** A sword it pays besides the XP. */
  readonly sword?: Sword;
  /** What Hale says while it's on offer, under way, and ready to hand in. */
  readonly says: { readonly offered: string; readonly active: string; readonly ready: string };
}

const Q = CONFIG.quests;

/** Hale's quests, in the order they come: handing one in offers the next. */
export const CHAIN: readonly Quest[] = [
  {
    id: 'raiders',
    title: 'Raiders in the Fields',
    objectives: [{ kind: 'kill', text: 'Bandits defeated at the farm', need: Q.raiders.bandits, camp: 'farm' }],
    place: 'farm',
    xp: Q.raiders.xp,
    says: {
      offered:
        'Bandits in red masks are raiding the farm east of the village. The farmer barely got out. Drive them off. Three of them down should send the rest a message.',
      active: "The farm's east along the road. Three of those bandits, then come back to me.",
      ready: "The farm's quieter already. Well done.",
    },
  },
  {
    id: 'lumber',
    title: 'The Lumber Camp',
    // The lumber camp's patrol is a camp of its own ('patrol'), so it doesn't count.
    objectives: [
      { kind: 'kill', text: 'Bandits defeated at the lumber camp', need: Q.lumber.bandits, camp: 'lumberCamp' },
      { kind: 'pickup', text: "Leader's orders taken", need: 1, item: 'orders' },
    ],
    place: 'lumberCamp',
    xp: Q.lumber.xp,
    says: {
      offered:
        'The same gang holds the lumber camp across the bridge. Clear them out, and bring me whatever their leader keeps in that tent.',
      active: 'The lumber camp is west off the north road, past the bridge. Mind their leader.',
      ready: "Orders... they're digging for silver in the old mine. Fools. That hill was left alone for a reason.",
    },
  },
  {
    id: 'below',
    title: 'What Lies Below',
    objectives: [{ kind: 'kill', text: 'What woke the dead defeated', need: 1, role: 'warden' }],
    place: 'mine',
    xp: Q.below.xp,
    sword: 'hale',
    says: {
      offered:
        'Something stirs under that hill. The dead are walking in the old mine. Go down, find what woke them, and put it back to rest.',
      active: "The mine's at the end of the north road. Whatever's down there, end it.",
      ready: "So it's done. Take my old sword. It served me well; it'll serve you better.",
    },
  },
];

/** What Hale says once the chain is done. */
export const CHAIN_DONE =
  "Oakvale's safe, thanks to you. There's more of the world south through the pass: Brackenmoor, and the roads beyond it.";

/** The tracker's one line once every objective is done. */
export const RETURN_TO_HALE = 'Return to Marshal Hale';

/** The villagers who bark as you pass: Hale doesn't, since their board and marker are how they speak. */
export const VILLAGERS = ['innkeeper', 'smith', 'farmer'] as const;

export type VillagerId = (typeof VILLAGERS)[number];

/** A line a villager barks, from the moment `from`'s quest reaches its stage (from the start, without one). */
export interface Bark {
  readonly line: string;
  readonly from?: { readonly quest: QuestId; readonly stage: Stage };
}

/**
 * What each villager barks, in the order the chain brings the lines: the last
 * whose moment has come is the one they say. The Warden's being beaten is What
 * Lies Below being ready, since it's the quest's one objective.
 */
export const BARKS: Readonly<Record<VillagerId, readonly Bark[]>> = {
  farmer: [
    { line: "Those red-masked thieves took my farm. The marshal's the one to see." },
    { line: "You ran them off my fields! I'll be home by harvest.", from: { quest: 'raiders', stage: 'handedIn' } },
  ],
  smith: [
    { line: "Bandits in the lumber camp, and not a plank to be had. Mind their leader's axe." },
    { line: "Timber's coming down the road again. Good work at the camp.", from: { quest: 'lumber', stage: 'handedIn' } },
  ],
  innkeeper: [
    { line: 'Welcome to the Golden Tankard. Sit by the fire a while.' },
    { line: "The old mine? Folk say there's a tomb under that hill. Come back in one piece.", from: { quest: 'below', stage: 'active' } },
    { line: "They say you put the dead back to rest. Your ale's on the house.", from: { quest: 'below', stage: 'ready' } },
  ],
};
