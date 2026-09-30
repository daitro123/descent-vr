import type { Role, Stage } from './adventureState';
import { CONFIG } from './config';
import { type ClassId, type ItemId, pickFor } from './items';
import type { CampId } from './maps/types';
import type { Gathering, Profession, RecipeId, SpotKind } from './professions/professions';

// The quest givers' chains, as data: what each quest asks, what it pays, and
// what its giver says about it. The adventure state holds the rules that move
// you through them. Marshal Hale's chain comes first; the smith's "Ore and
// Fire" and the herbalist's "Leaves for the Pot" open once Raiders in the
// Fields is handed in, and accepting one teaches its pair of professions
// (.scratch/professions/spec.md, "Trainers and quests"). The lines are
// placeholders, cheap to change
// (.scratch/oakvale-starting-zone/spec.md, "Hale's board and the villagers' barks").

/** A quest's id, unique across every giver's chain: the save keys its progress by it. */
export type QuestId = string;

/** Everyone who gives quests: Marshal Hale, and the two trainers (.scratch/professions/spec.md, "Trainers and quests"). */
export const GIVERS = ['hale', 'smith', 'herbalist'] as const;

/** A quest giver. */
export type GiverId = (typeof GIVERS)[number];

/**
 * Where a quest sends you, for the quest arrow: the farm, the lumber camp, the
 * old mine's mouth; the copper veins by the smithy and the smith's anvil; the
 * Hearthleaf in the farm's fields and the alchemy bench in the house by the well.
 */
export type Place = 'farm' | 'lumberCamp' | 'mine' | 'veins' | 'anvil' | 'fields' | 'bench';

/** Something an objective asks you to pick up by hand. */
export type Item = 'orders';

/** What each is in the bag: a quest item on its quest page, from when it's picked up until the hand-in. */
export const QUEST_ITEM: Readonly<Record<Item, ItemId>> = { orders: 'leaders-orders' };

/** Every sword's look: the one you start with, and Hale's old longsword. A warrior's weapon's model is one of them. */
export const SWORDS = ['plain', 'hale'] as const;

/** A sword's look. */
export type Sword = (typeof SWORDS)[number];

/** What every objective has: its tracker line's text, how many it needs, and where it sends you if not the quest's own place. */
interface Asks {
  readonly text: string;
  readonly need: number;
  readonly place?: Place;
}

/** One thing a quest asks before it can be handed in. */
export type Objective =
  /** Kills of one camp's members, or of an enemy of one role (the Warden, who is in no camp). */
  | (Asks & { readonly kind: 'kill'; readonly camp?: CampId; readonly role?: Role })
  /** Something picked up by hand. */
  | (Asks & { readonly kind: 'pickup'; readonly item: Item })
  /** Gathering from a kind of spot, once a spot. */
  | (Asks & { readonly kind: 'gather'; readonly spot: SpotKind })
  /** Making a recipe, once a finished make. */
  | (Asks & { readonly kind: 'make'; readonly recipe: RecipeId });

export interface Quest {
  readonly id: QuestId;
  readonly title: string;
  readonly objectives: readonly Objective[];
  /** Where its objectives are, which the quest arrow points at while it's under way. */
  readonly place: Place;
  readonly xp: number;
  /**
   * The pick it pays besides the XP, for each class: two items laid out on
   * Hale's board at the hand-in, one of them carried into the bag to hand it in.
   */
  readonly picks?: Readonly<Record<ClassId, readonly ItemId[]>>;
  /** What it paid before hand-ins had picks, for a record with no pick kept (What Lies Below's longsword). */
  readonly paid?: ItemId;
  /** Coins its hand-in pays besides the XP: none without. */
  readonly coins?: number;
  /** The gathering profession accepting it teaches, with its pair: a trainer's intro quest. */
  readonly teaches?: Gathering;
  /** What its giver says while it's on offer, under way, and ready to hand in. */
  readonly says: { readonly offered: string; readonly active: string; readonly ready: string };
}

/** One giver's quests, in the order they come: handing one in offers the next. */
export interface Chain {
  readonly giver: GiverId;
  /** The quest whose hand-in opens the chain, offering its first: open from the start without one. */
  readonly after?: QuestId;
  readonly quests: readonly Quest[];
  /** What the giver says before the chain opens (nothing without it), and once it's done. */
  readonly closed?: string;
  readonly done: string;
  /** The tracker's one line once every objective of one of its quests is done. */
  readonly returnTo: string;
}

const Q = CONFIG.quests;

/** A pick of two armour pieces, each carrying your class's main attribute. */
const armour = (a: ItemId, b: ItemId): Readonly<Record<ClassId, readonly ItemId[]>> => ({
  warrior: [pickFor(a, 'warrior'), pickFor(b, 'warrior')],
  ranger: [pickFor(a, 'ranger'), pickFor(b, 'ranger')],
  mage: [pickFor(a, 'mage'), pickFor(b, 'mage')],
});

/** Marshal Hale's quests. */
const HALE_QUESTS: readonly Quest[] = [
  {
    id: 'raiders',
    title: 'Raiders in the Fields',
    objectives: [{ kind: 'kill', text: 'Bandits defeated at the farm', need: Q.raiders.bandits, camp: 'farm' }],
    place: 'farm',
    xp: Q.raiders.xp,
    picks: armour('farmstead-gloves', 'hedgerow-boots'),
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
    picks: armour('timberline-leggings', 'marshals-cap'),
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
    // Your class's blue weapon, or the Warden's Mantle. For a warrior that's still Hale's old longsword.
    picks: {
      warrior: ['hale-longsword', pickFor('wardens-mantle', 'warrior')],
      ranger: ['hale-hunting-bow', pickFor('wardens-mantle', 'ranger')],
      mage: ['crypt-warded-staff', pickFor('wardens-mantle', 'mage')],
    },
    paid: 'hale-longsword',
    says: {
      offered:
        'Something stirs under that hill. The dead are walking in the old mine. Go down, find what woke them, and put it back to rest.',
      active: "The mine's at the end of the north road. Whatever's down there, end it.",
      ready: "So it's done. Take what you like of my old kit. It served me well; it'll serve you better.",
    },
  },
];

/** Marshal Hale's chain, open from the start. */
export const HALE: Chain = {
  giver: 'hale',
  quests: HALE_QUESTS,
  done: "Oakvale's safe, thanks to you. There's more of the world south through the pass: Brackenmoor, and the roads beyond it.",
  returnTo: 'Return to Marshal Hale',
};

const T = CONFIG.quests.trainers;

/** The smith's chain: "Ore and Fire", once Raiders in the Fields is handed in. Accepting teaches Mining and Smithing. */
export const SMITH: Chain = {
  giver: 'smith',
  after: 'raiders',
  quests: [
    {
      id: 'ore-and-fire',
      title: 'Ore and Fire',
      objectives: [
        { kind: 'gather', text: 'Copper veins broken', need: T.oreAndFire.veins, spot: 'copperVein' },
        { kind: 'make', text: 'Whetstone made at the anvil', need: 1, recipe: 'whetstone', place: 'anvil' },
      ],
      place: 'veins',
      xp: T.xp,
      coins: T.coins,
      teaches: 'mining',
      says: {
        offered:
          "You've a strong arm. Want to learn the forge? Break two copper veins by the smithy, then make a whetstone at my anvil. Here, take a pick.",
        active: "The veins are the grey rocks with the green streaks, east and south of the smithy. Strike where it glints. Then the anvil's yours.",
        ready: "A proper edge on that. You'll keep it, and here's a few coins for the ore.",
      },
    },
  ],
  closed: "Can't spare a thought for teaching while those bandits are loose in the fields. See the marshal.",
  done: "Keep your pick sharp and your fire hot. Come back with coin and I'll teach you gauntlets.",
  returnTo: 'Return to the smith',
};

/** The herbalist's chain: "Leaves for the Pot", once Raiders in the Fields is handed in. Accepting teaches Herbalism and Alchemy. */
export const HERBALIST: Chain = {
  giver: 'herbalist',
  after: 'raiders',
  quests: [
    {
      id: 'leaves-for-the-pot',
      title: 'Leaves for the Pot',
      objectives: [
        { kind: 'gather', text: 'Hearthleaf clumps cut', need: T.leavesForThePot.clumps, spot: 'hearthleaf' },
        { kind: 'make', text: 'Minor healing potion brewed', need: 1, recipe: 'minor-healing-potion', place: 'bench' },
      ],
      place: 'fields',
      xp: T.xp,
      coins: T.coins,
      teaches: 'herbalism',
      says: {
        offered:
          "The fields are safe again, so I can teach you. Cut me two clumps of Hearthleaf by the farm, low through the stems, then brew a healing potion at my bench. Take this knife.",
        active: 'Hearthleaf has gold flowers. There are clumps round the wheat by the farm. Then grind, stir and cork it at the bench.',
        ready: "That's a clean brew. Keep it for the road, and take these for the leaves.",
      },
    },
  ],
  closed: "The fields aren't safe for picking while those bandits roam. See the marshal first.",
  done: "The pot's always on. Come back with coin when you're ready to learn more.",
  returnTo: 'Return to the herbalist',
};

/** Every giver's chain, one each: up to one quest from each can be under way at once. */
export const CHAINS: readonly Chain[] = [HALE, SMITH, HERBALIST];

/** The villagers who bark as you pass: Hale doesn't, since their board and marker are how they speak. */
export const VILLAGERS = ['innkeeper', 'smith', 'farmer', 'herbalist'] as const;

export type VillagerId = (typeof VILLAGERS)[number];

/**
 * A line a villager barks: from the moment `from`'s quest reaches its stage
 * (from the start, without one), and once you've `learned` a profession
 * (whatever you've learned, without one).
 */
export interface Bark {
  readonly line: string;
  readonly from?: { readonly quest: QuestId; readonly stage: Stage };
  readonly learned?: Profession;
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
    { line: 'Keep your pick sharp and your fire hot.', learned: 'mining' },
  ],
  innkeeper: [
    { line: 'Welcome to the Golden Tankard. Sit by the fire a while.' },
    { line: "The old mine? Folk say there's a tomb under that hill. Come back in one piece.", from: { quest: 'below', stage: 'active' } },
    { line: "They say you put the dead back to rest. Your ale's on the house.", from: { quest: 'below', stage: 'ready' } },
  ],
  herbalist: [
    { line: "Mind where you step, there's Hearthleaf by that road." },
    { line: "Bring me Duskcap from the old mine and I'll show you something stronger.", learned: 'herbalism' },
  ],
};
