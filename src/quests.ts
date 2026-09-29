import type { Role } from './adventureState';
import { CONFIG } from './config';
import type { CampId } from './maps/types';

// Marshal Hale's quest chain, as data: what each quest asks, what it pays, and
// what Hale says about it. The adventure state holds the rules that move you
// through it. The lines are placeholders, cheap to change
// (.scratch/oakvale-starting-zone/spec.md, "Hale's board and the villagers' barks").

export type QuestId = 'raiders' | 'lumber' | 'below';

/** Something an objective asks you to pick up by hand. */
export type Item = 'orders';

/** The sword in your hand: the one you start with, or Hale's old longsword. */
export type Sword = 'plain' | 'hale';

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
