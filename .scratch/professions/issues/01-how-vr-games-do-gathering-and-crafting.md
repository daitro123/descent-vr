# How VR games do gathering and crafting

Type: research
Status: resolved
Blocked by: 

## Question

How do shipped VR games make gathering and crafting physical, short and satisfying rather than a chore, and what should this game borrow or avoid?

- **Look at:** games with hand-driven mining, smithing and brewing, such as A Township Tale (mining, smelting, forging on Quest), Walkabout-style sims, Skyrim VR's crafting, Blacksmith-style VR sims and Waltz of the Wizard's potion making. Prefer developer talks, postmortems, official docs and hands-on reviews over forum hearsay.
- **For each:** what the hands actually do (strikes, grips, pours, timing windows), how long one action takes, how hits are detected (velocity, angle, target zones), what feedback sells it (haptics, sparks, sound, the object changing shape), whether skill in the motion changes the result, and what players complained was tedious or tiring.
- **Constraints to keep in mind:** Quest 3 in the browser at 72 fps, about 300 draw calls and 4 point lights; a pick or knife drawn from the belt replaces the weapon; each action should take a few seconds.
- **Output:** findings in `.scratch/professions/research/`, ending with a short list of patterns to try in the gathering and crafting prototypes.

## Answer

- A Township Tale is the model to borrow from: a pick swing counts by its momentum and arc length, so full swings beat taps, and at the anvil the size of the sparks tells you how good the strike was while the metal flattens where you hit it, until the whole piece is worked.
- Skill should buy speed, not a different item: better strikes break a vein or finish a blade in fewer hits, and a sloppy player only takes longer (A Township Tale, BlackForge).
- What players hated was length and repetition, not the swing itself: hours of mining and long hammering read as a grind and tire the arm. Keep each job to 3 to 6 good strikes at waist-to-chest height.
- Menus kill it (Skyrim VR); Skyrim VR's popular mods replace them with real tools and grabbing plants with a haptic pop and no prompt.
- Do not simulate: free-form metal deformation (BlackForge) and real liquids (850 hours for Job Simulator's coffee) fight the player or the budget. Use preset shape stages, clamped work pieces and faked pours.
- Patterns to try: reuse the sword's swing gate for the pick, a glinting weak spot, three-step graded sparks and haptics, 3-stage vein meshes, grab-and-pull herbs, marked spots on the ingot, a forgiving heat window, a quench as the finishing beat, and brewing as a few discrete acts with a colour-change payoff.
- Findings come from search-engine extracts because page fetches were blocked here, so they are medium confidence.

Full findings: [VR gathering and crafting](../research/vr-gathering-and-crafting.md)
