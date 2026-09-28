# Talking to NPCs and tracking quests in VR

Type: prototype
Status: resolved
Blocked by: 01

## Question

How does a player talk to a quest giver, accept and hand in a quest, and keep track of it in VR without breaking the flow?

Candidates to try on the headset:

- Walking up to an NPC and pressing a trigger while facing them, or pointing a hand ray at them.
- Dialogue on a floating text panel beside the NPC, with Accept and Decline pressed by hand or by ray.
- A quest log on the wrist, like the map viewer's wrist readout, showing objectives and progress.
- Markers over NPCs: a "!" to give a quest, a "?" to hand one in.

Build a throwaway prototype with a placeholder NPC and one quest from the quest chain, try it on the Quest, and pick one.

## Answer

Tom tried the three variants of the `?talk` prototype on the Quest on 2026-09-28 and picked **A's way of talking, with C's quest tracker**. The prototype is out of `main` again; its code stays in history at merge commit `19ce545` (`src/ui/talk-prototype/`) for whoever builds this. The distances are the prototype's, as starting points.

- **Talking (A · Hands):** walk up to Marshal Hale and look their way. Within about 2.3 m a parchment board unfolds beside them, on your right and turned to you, with Hale's name, their lines, and chunky buttons below ("Accept" and "Not now", "Hand in", "Goodbye"). You press a button with either fist or the tip of your sword, and that hand buzzes. A hand or blade already resting where a button appears must leave it before it can press, so nothing fires by accident. The board folds away when the talk ends or when you walk about 3.6 m off, and it stays shut until you've walked away and come back.
- **Markers (from A):** a gold "!" floats over Hale when they have a quest for you, a grey "?" while yours is under way, and a gold "?" once it's ready to hand in.
- **Handing in** is the "Hand in" button on the board. The reward floats over Hale ("+80 XP", then "LEVEL 2" if it lands one) with a fanfare, as [Progression, death and saving](03-progression-death-and-saving.md) set out.
- **Tracking (C's tracker):** the quest you're on floats at the top left of your view, lagging your head a little so it drifts rather than sticks: its title in gold, then each objective with a count ("Bandits defeated at the farm: 2/3"), and "Return to Marshal Hale" once it's done. It flashes when you take the quest, make progress, or finish it, and it's gone while you have no quest. A's wrist log (and its buzz on quest changes) and B's belt and toasts are dropped.
- **No menu.** Tracking brings no menu, so the "start over" button from Progression, death and saving has nowhere to go yet; `?newgame` stays the way to start over.
- **A first pass.** Tom plans a complete overhaul of this UI once Oakvale is specced and built, so the spec builds it plainly, close to the prototype, rather than polishing it.

## Comments

**2026-09-28:** [The quest chain](01-the-quest-chain.md) is resolved. The quest giver is Marshal Hale, standing outdoors at the crossroads by the signpost, and every quest is handed in to them. Raiders in the Fields (defeat 3 bandits at the farm) is the simplest quest to prototype with; The Lumber Camp adds the one hand pickup (the leader's orders in their tent), in case the prototype should try that too.

**2026-09-28:** [The zone's enemies](02-the-zones-enemies.md) is resolved: no names or levels float over enemies in Oakvale. If enemy levels prove hard to judge on the headset, showing them can come back here with quest tracking.

**2026-09-28:** [Progression, death and saving](03-progression-death-and-saving.md) is resolved. A new character starts at the crossroads a few steps from Marshal Hale, facing them, so the first talk happens in the first seconds of a new game. Levelling up shows a "LEVEL 3" banner that names anything unlocked, and kills float "+20 XP"; the belt gains a level number and an XP bar. A "start over" button can join whatever menu quest tracking brings (until then `?newgame` wipes the save).

**2026-09-28:** Prototype built at `?talk` (code in `src/ui/talk-prototype/`), three variants switchable in the headset with a left-stick click. Marshal Hale is a placeholder figure by the signpost, and three skeletons stand in for the farm's bandits; a real sword swing drops one.

- **A · Hands:** walk up to Hale and a board unfolds beside them; touch Accept, Not now or Hand in with a fist or the sword's tip. The quest log sits over your left wrist and shows while you look at it; the left controller buzzes when it changes. Gold "!" and "?" over Hale.
- **B · Point:** point a controller at Hale (a gold ring lights at their feet) and pull the trigger; a WoW-style quest window (title, text, objectives, reward) opens in front of you, and you pick with the ray. The quest sits on your belt (glance down), and a toast floats up in view on every change. Gold "!" and "?" over Hale.
- **C · Talk:** no markers or windows. Hale waves and calls out when they have something for you; walk up and look at them and they speak a line at a time in a bubble over their head. Nod to accept, shake your head to decline (A and B work too); handing in happens as you talk. The quest floats in the top left of your view.

**2026-09-28 (Tom, after trying it on the Quest):** A, but probably C for the tracker. A complete overhaul comes after this map is specced and its tickets are built.

**2026-09-28:** [Getting around](13-getting-around.md) is resolved (by Claude on Tom's behalf) and adds a quest arrow to the tracker: a small gold arrow at the left of the objective you're working on, pointing the way to its place as the crow flies (up means straight ahead). It points at the farm, the lumber camp or the old mine's mouth, then at Hale for "Return to Marshal Hale", and hides at the place, near Hale, indoors and inside the mine. No distance, no compass and no map in view.
