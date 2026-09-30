# 12: Quest items and hand-in picks

**What to build:** the leader's orders go on the bag's quest page when touched and leave at the hand-in. Each of Hale's hand-ins shows a reward row of two items fitting your class, carried into the bag to hand the quest in (a full bag makes the pick wait). What Lies Below offers the class's blue weapon or the Warden's Mantle, and Hale's sword leaves their hip only when a warrior takes it.

**Blocked by:** 09.

**Status:** ready-for-agent

Read [the spec](../spec.md) and [Oakvale's items](07-oakvales-items.md).

- [ ] Adventure-state tests: each hand-in's picks for each class; the orders on the quest page and gone at the hand-in; a hand-in waiting on a full bag; Hale's sword at the hip by class.
- [ ] `.scratch/inventory/checks/hand-in-picks.mjs` hands in Raiders in the Fields and carries a pick into the bag.
- [ ] `npm run typecheck` and `npm test` pass.
