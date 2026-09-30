# Effects within the budget

Type: grilling
Status: resolved
Blocked by: 11, 12, 13

## Question

How much may the abilities' effects cost against `docs/quest-3-browser-performance-budget.md` (72 fps, about 300 draw calls, at most 4 point lights, no shadow maps)?

## Answer

Settled on 2026-09-30 **by Claude on Tom's behalf**, taking the recommended option at every fork.

- **No new lights.** The pool of four point lights stays four. The brightest effect in view (a Fireball's burst, a Meteor, the War Cry) may borrow one pooled light for up to 0.5 s by moving it and animating its intensity, never by adding or toggling one.
- **Particles go through the one shared particle system** the game already has; an ability adds no draw call of its own for its sparks.
- **Arrows, bolts and thrown axes share one instanced mesh per kind,** one draw call each however many fly.
- **Lasting effects** (Blizzard, Rain of Arrows, traps, Bulwark's dome, Frozen Orb) each cost at most 2 draw calls and 500 triangles, and at most three are alive at once; a fourth ends the oldest.
- **All the abilities together** stay under 10 draw calls and 5,000 triangles in the worst moment, measured with `?perf` in the arena with every class's biggest effect up.
