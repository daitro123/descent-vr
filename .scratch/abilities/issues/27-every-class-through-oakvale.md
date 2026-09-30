# 27: Every class through Oakvale

**What to build:** one headless run per class from a new character to What Lies Below's hand-in, as Oakvale's "whole zone in one sitting" did for the warrior, checking levels land where the curve says, each class's rewards, and the frame budget with every class's biggest effect up. The class prototypes' remaining flags (`&gestures`, `?arena&class=` variants) are removed; the README lists what's left.

**Blocked by:** 26.

**Status:** ready-for-agent

Read [the spec](../spec.md) ("Performance", "Testing Decisions") and [Effects within the budget](16-effects-within-the-budget.md).

- [ ] `.scratch/abilities/checks/` has a whole-zone run per class, all passing.
- [ ] `?perf` numbers for the worst moment per class are recorded in this ticket, under 10 draw calls and 5,000 triangles for the abilities.
- [ ] Anything a class can't clear on the plain route is tuned (camp strength first) and noted here.
- [ ] `npm run typecheck` and `npm test` pass.
