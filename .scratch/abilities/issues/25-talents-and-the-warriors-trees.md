# 25: Talents and the warrior's trees

**What to build:** a talent point every level from 2, spent on the bag panel's Talents tab out of a fight: both trees side by side, each talent a button with its points, locked tiers dimmed, points left and a free Reset. The level-up's lines say "Talent point: open your talents". The gesture slots under the trees, swapped by pressing two. The warrior's Arms and Protection to tier 3, with Mortal Strike and Shield Slam taking the triangle. Talents are saved per character.

**Blocked by:** 18, 19.

**Status:** ready-for-agent

Read [the spec](../spec.md) ("The adventure state learns classes", "Talents on the bag's panel"), [Talent tree rules](10-talent-tree-rules.md) and [The warrior's abilities and talents](11-the-warriors-abilities-and-talents.md).

- [ ] Tests at the adventure-state seam: tiers opening at 3, 6 and 9 points; spending refused past a maximum, a closed tier or in a fight; resetting; the warrior's talents changing their numbers; Mortal Strike and Shield Slam appearing in the triangle; swaps; talents round-tripping through the save.
- [ ] A headless check levels a warrior, opens the Talents tab, spends points, fires Shield Slam on a brute, resets, and swaps two slots.
- [ ] `npm run typecheck` and `npm test` pass.
