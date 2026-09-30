# 20: Rooted, frozen and slowed

**What to build:** three new states on every enemy. Rooted: it can't move but still strikes what's in reach, with vines at its feet. Frozen: it can't act until the time runs out or a hit breaks it, tinted pale blue. Slowed: it moves and winds up slower by a fraction, with a faint frost. Brutes take roots and freezes at half length and slows at half strength; the Warden ignores roots and freezes and takes slows at half. The leash clock runs through them, and a frozen enemy doesn't count against the attackers' limit. The debug handle can apply each, for checks.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

Read [the spec](../spec.md) ("Enemies") and [Enemies against every class](14-enemies-against-every-class.md).

- [ ] Tests at the enemy seam: each state's effect and end, a hit breaking a freeze, the brute's halving, the Warden's immunity, the leash still turning a rooted enemy home, and the attackers' limit ignoring a frozen one.
- [ ] A headless check roots, freezes and slows a camp's grunt through the debug handle and sees each hold and end.
- [ ] The looks cost what [Effects within the budget](16-effects-within-the-budget.md) allows.
- [ ] `npm run typecheck` and `npm test` pass.
