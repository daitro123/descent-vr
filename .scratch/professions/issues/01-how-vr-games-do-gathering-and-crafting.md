# How VR games do gathering and crafting

Type: research
Status: open
Blocked by: 

## Question

How do shipped VR games make gathering and crafting physical, short and satisfying rather than a chore, and what should this game borrow or avoid?

- **Look at:** games with hand-driven mining, smithing and brewing, such as A Township Tale (mining, smelting, forging on Quest), Walkabout-style sims, Skyrim VR's crafting, Blacksmith-style VR sims and Waltz of the Wizard's potion making. Prefer developer talks, postmortems, official docs and hands-on reviews over forum hearsay.
- **For each:** what the hands actually do (strikes, grips, pours, timing windows), how long one action takes, how hits are detected (velocity, angle, target zones), what feedback sells it (haptics, sparks, sound, the object changing shape), whether skill in the motion changes the result, and what players complained was tedious or tiring.
- **Constraints to keep in mind:** Quest 3 in the browser at 72 fps, about 300 draw calls and 4 point lights; a pick or knife drawn from the belt replaces the weapon; each action should take a few seconds.
- **Output:** findings in `.scratch/professions/research/`, ending with a short list of patterns to try in the gathering and crafting prototypes.
