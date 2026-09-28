// PROTOTYPE (Talking to NPCs and tracking quests, .scratch/oakvale-starting-zone):
// throwaway quest state for `?talk`, shared by every variant so they differ
// only in how you talk and how you keep track. Not the real quest system.

export type QuestState = 'locked' | 'available' | 'active' | 'ready' | 'done';

export interface Objective {
  text: string;
  need: number;
  have: number;
}

export interface Quest {
  id: 'raiders' | 'lumber';
  title: string;
  /** One line on where to go, for trackers. */
  where: string;
  xp: number;
  objectives: Objective[];
  state: QuestState;
}

export type QuestEvent =
  | { kind: 'accepted'; quest: Quest }
  | { kind: 'progress'; quest: Quest; objective: Objective }
  | { kind: 'ready'; quest: Quest }
  | { kind: 'handedIn'; quest: Quest; xp: number; level: number | null };

/** What Hale has for you: drives the "!" and "?" markers and the barks. */
export type Mood = 'offer' | 'waiting' | 'ready';

export type Act = 'accept' | 'decline' | 'handIn' | 'bye';

export interface Choice {
  label: string;
  act: Act;
}

/** One exchange: Hale's lines, then your choices (none: it just ends). */
export interface Talk {
  lines: string[];
  choices: Choice[];
  /** The quest this exchange offers or hands in, for variants that show quest details. */
  quest?: Quest;
  /** XP just paid, for variants that show the reward. */
  paid?: number;
}

/** XP to reach levels 2..5 (Progression, death and saving). */
const LEVELS = [100, 300, 600, 1000];
/** A farm bandit is level 1: 10 XP. */
export const FARM_KILL_XP = 10;

const PROTOTYPE_END = '(The prototype ends here. Click the left stick for the next variant.)';

export class QuestBook {
  readonly quests: Quest[] = [
    {
      id: 'raiders',
      title: 'Raiders in the Fields',
      where: 'The farm, down the east road',
      xp: 80,
      objectives: [{ text: 'Bandits defeated at the farm', need: 3, have: 0 }],
      state: 'available',
    },
    {
      id: 'lumber',
      title: 'The Lumber Camp',
      where: 'The lumber camp, across the bridge',
      xp: 120,
      objectives: [
        { text: 'Bandits defeated at the lumber camp', need: 5, have: 0 },
        { text: "The leader's orders taken", need: 1, have: 0 },
      ],
      state: 'locked',
    },
  ];
  xp = 0;
  level = 1;
  private readonly listeners: ((e: QuestEvent) => void)[] = [];

  on(fn: (e: QuestEvent) => void): void {
    this.listeners.push(fn);
  }

  private emit(e: QuestEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  /** The quest you're on (active or ready to hand in), if any. */
  get tracked(): Quest | null {
    return this.quests.find((q) => q.state === 'active' || q.state === 'ready') ?? null;
  }

  private get offered(): Quest | null {
    return this.quests.find((q) => q.state === 'available') ?? null;
  }

  mood(): Mood {
    const t = this.tracked;
    if (t?.state === 'ready') return 'ready';
    if (!t && this.offered) return 'offer';
    return 'waiting';
  }

  /** What Hale says when you start talking. */
  talk(): Talk {
    const t = this.tracked;
    if (t?.state === 'ready') {
      return {
        lines: ['Back already, and the raiders scattered? Well fought.'],
        choices: [{ label: 'Hand in', act: 'handIn' }],
        quest: t,
      };
    }
    if (t?.id === 'raiders') {
      return {
        lines: ['The farm is down the east road. Defeat three of the bandits there, then come back to me.'],
        choices: [{ label: 'Goodbye', act: 'bye' }],
      };
    }
    if (t?.id === 'lumber') {
      return { lines: ['The lumber camp is north-west, across the bridge.', PROTOTYPE_END], choices: [{ label: 'Goodbye', act: 'bye' }] };
    }
    const offer = this.offered;
    if (offer) return this.offerTalk(offer);
    return { lines: [PROTOTYPE_END], choices: [{ label: 'Goodbye', act: 'bye' }] };
  }

  private offerTalk(q: Quest, before: string[] = []): Talk {
    const lines =
      q.id === 'raiders'
        ? [
            'You there. You look like you know which end of a sword to hold.',
            'Bandits are raiding the farm down the east road. Defeat three of them and the rest will scatter.',
          ]
        : [
            'The rest of them fled north to the lumber camp, across the bridge.',
            'Clear the camp, and bring me whatever orders their leader keeps in the tent.',
          ];
    return {
      lines: [...before, ...lines],
      choices: [
        { label: 'Accept', act: 'accept' },
        { label: 'Not now', act: 'decline' },
      ],
      quest: q,
    };
  }

  /** Answer Hale. Returns what Hale says back, or null when the exchange just ends. */
  answer(act: Act): Talk | null {
    switch (act) {
      case 'accept': {
        const q = this.offered;
        if (!q || this.tracked) return null;
        q.state = 'active';
        this.emit({ kind: 'accepted', quest: q });
        return { lines: [q.id === 'raiders' ? 'Good. Come back to me when it is done.' : 'Watch the tree line. They will have a lookout.'], choices: [] };
      }
      case 'decline':
        return { lines: ["Suit yourself. The farm won't wait long."], choices: [] };
      case 'handIn': {
        const q = this.tracked;
        if (q?.state !== 'ready') return null;
        q.state = 'done';
        const level = this.addXp(q.xp);
        this.emit({ kind: 'handedIn', quest: q, xp: q.xp, level });
        const next = this.quests[this.quests.indexOf(q) + 1];
        if (next?.state === 'locked') next.state = 'available';
        if (!next) return { lines: ['Well fought.'], choices: [], paid: q.xp };
        return { ...this.offerTalk(next, [`Here: ${q.xp} XP for your trouble.`]), paid: q.xp };
      }
      case 'bye':
        return null;
    }
  }

  /** A farm bandit fell. Returns the XP it paid. */
  farmKill(): number {
    this.addXp(FARM_KILL_XP);
    const q = this.tracked;
    if (q?.id === 'raiders' && q.state === 'active') {
      const o = q.objectives[0];
      o.have = Math.min(o.need, o.have + 1);
      this.emit({ kind: 'progress', quest: q, objective: o });
      if (o.have >= o.need) {
        q.state = 'ready';
        this.emit({ kind: 'ready', quest: q });
      }
    }
    return FARM_KILL_XP;
  }

  /** Returns the new level if this XP reached one. */
  private addXp(n: number): number | null {
    this.xp += n;
    let up: number | null = null;
    while (this.level <= LEVELS.length && this.xp >= LEVELS[this.level - 1]) up = ++this.level;
    return up;
  }
}
