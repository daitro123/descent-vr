# Talking to NPCs and tracking quests in VR

Type: prototype
Status: claimed
Blocked by: 01

## Question

How does a player talk to a quest giver, accept and hand in a quest, and keep track of it in VR without breaking the flow?

Candidates to try on the headset:

- Walking up to an NPC and pressing a trigger while facing them, or pointing a hand ray at them.
- Dialogue on a floating text panel beside the NPC, with Accept and Decline pressed by hand or by ray.
- A quest log on the wrist, like the map viewer's wrist readout, showing objectives and progress.
- Markers over NPCs: a "!" to give a quest, a "?" to hand one in.

Build a throwaway prototype with a placeholder NPC and one quest from the quest chain, try it on the Quest, and pick one.

## Comments

**2026-09-28:** [The quest chain](01-the-quest-chain.md) is resolved. The quest giver is Marshal Hale, standing outdoors at the crossroads by the signpost, and every quest is handed in to them. Raiders in the Fields (defeat 3 bandits at the farm) is the simplest quest to prototype with; The Lumber Camp adds the one hand pickup (the leader's orders in their tent), in case the prototype should try that too.

**2026-09-28:** [The zone's enemies](02-the-zones-enemies.md) is resolved: no names or levels float over enemies in Oakvale. If enemy levels prove hard to judge on the headset, showing them can come back here with quest tracking.

**2026-09-28:** [Progression, death and saving](03-progression-death-and-saving.md) is resolved. A new character starts at the crossroads a few steps from Marshal Hale, facing them, so the first talk happens in the first seconds of a new game. Levelling up shows a "LEVEL 3" banner that names anything unlocked, and kills float "+20 XP"; the belt gains a level number and an XP bar. A "start over" button can join whatever menu quest tracking brings (until then `?newgame` wipes the save).

**2026-09-28:** Prototype built at `?talk` (code in `src/ui/talk-prototype/`), three variants switchable in the headset with a left-stick click. Marshal Hale is a placeholder figure by the signpost, and three skeletons stand in for the farm's bandits; a real sword swing drops one.

- **A · Hands:** walk up to Hale and a board unfolds beside them; touch Accept, Not now or Hand in with a fist or the sword's tip. The quest log sits over your left wrist and shows while you look at it; the left controller buzzes when it changes. Gold "!" and "?" over Hale.
- **B · Point:** point a controller at Hale (a gold ring lights at their feet) and pull the trigger; a WoW-style quest window (title, text, objectives, reward) opens in front of you, and you pick with the ray. The quest sits on your belt (glance down), and a toast floats up in view on every change. Gold "!" and "?" over Hale.
- **C · Talk:** no markers or windows. Hale waves and calls out when they have something for you; walk up and look at them and they speak a line at a time in a bubble over their head. Nod to accept, shake your head to decline (A and B work too); handing in happens as you talk. The quest floats in the top left of your view.
