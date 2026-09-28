# Friendly characters

Type: prototype
Status: open
Blocked by: 

## Question

How does Marshal Hale look, and does Oakvale need any other friendly characters?

- The quest chain needs one friendly character: Marshal Hale, the village guard captain, standing outdoors at the crossroads (see The quest chain). Every character built so far is a skeleton, so this is the first living human.
- Built on the existing humanoid rig, one draw call, in the same low-poly style as the skeletons. Build the body once and dress it for Marshal Hale and for the three bandits from [The zone's enemies](02-the-zones-enemies.md): the thug (grunt behaviour), the archer, and the leader (brute behaviour). Each bandit must read at a glance, the way the green hood marks today's archers.
- Whether the village gets anyone else to stand about (an innkeeper, a smith, a farmer), and how many fit the triangle budget. What they do all day stays with the living-zone fog.

Build a rough Marshal Hale and the three bandits in the model inspector (`?inspect`), look at them on the Quest next to a skeleton, and decide.

## Comments

**2026-09-28:** [The zone's enemies](02-the-zones-enemies.md) is resolved and folds the bandit looks into this ticket, so the question now covers the thug, the archer and the leader as well as Marshal Hale. [Enemies in the open](07-enemies-in-the-open.md) prototypes with skeletons standing in, so it doesn't wait on this one.

**2026-09-28:** [Talking to NPCs and tracking quests in VR](06-talking-to-npcs-and-tracking-quests.md) is resolved. A gold "!" or "?" floats about half a metre over Marshal Hale's head, and a board unfolds beside them on your right when you walk up, so Hale needs room around them by the signpost. The prototype's stand-in Hale (mail, a blue tabard, a sword at the hip, one draw call, turning to face you and waving) is in history at merge commit `19ce545`, `src/ui/talk-prototype/actors.ts`, if a starting point helps.
