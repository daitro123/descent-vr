import type { QuestMoment } from './quests';

// Who's where in the world as the quests go on: a villager who comes home
// once a quest is done, one who's gone for good after another, a camp that
// leaves you be until a quest turns it (maps/types.ts `PersonPlan`,
// `CampPlan`). The population and the camps ask the story; the Adventure's
// story is its state (adventureState.ts).

/** Where the quests stand, as who's where sees it. */
export interface Story {
  /** Has `moment` come: has its quest reached its stage, or gone past it? */
  reached(moment: QuestMoment): boolean;
}

/** No quest begun: the checks, and anywhere with no Adventure. */
export const NO_STORY: Story = { reached: () => false };

/** Something there only between two moments of the quests: from one (from the start, without it) until another (for good, without it). */
export interface Between {
  readonly from?: QuestMoment;
  readonly until?: QuestMoment;
}

/** Is `it` there now? */
export function there(it: Between, story: Story): boolean {
  return (!it.from || story.reached(it.from)) && !(it.until && story.reached(it.until));
}
