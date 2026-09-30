# What an item is

Type: grilling
Status: resolved
Blocked by:

## Question

What is an item, and what does it carry?

- The kinds of item: gear, consumables, materials, quest items and junk. Which stack, and how high.
- What each rarity colour (grey, white, green, blue) means: how much better, and how often it's found.
- Whether gear has an item level tied to the character's level, and whether gear asks for a level to wear it.
- What numbers gear carries: armour, weapon damage, and the attributes the Abilities map settles. This map only decides how gear carries them; what each attribute does belongs to Abilities.
- How the class lock reads: weapons are locked to the class that fights with them and armour is open to all, so what does a mage see on a ranger's bow?
- What an item sells for, as a rule rather than per item.

## Answer

Settled by Claude **on Tom's behalf** on 2026-09-30, taking the recommended option at every fork (Tom asked for the rest of the map to run without his input). Every number is a starting point, to tune on the headset.

- **Five kinds of item.** Gear (weapons, off hands and armour) never stacks. Consumables stack to 10, materials to 20 and junk to 10. **Quest items** don't sit in the 16 slots: they go on a quest page of the bag, so a full bag never blocks a quest, and they're gone at the hand-in. The leader's orders become the first quest item.
- **Every item is hand-made:** a name, a kind, its slot, the class it's locked to (weapons and off hands only), its **item level**, its rarity and a model. Its numbers aren't hand-tuned: they come from its item level and rarity by one rule, so a new item is a line of data and balance lives in one place.
- **What each rarity means:**
  - **Grey (junk):** no numbers, only a sell price.
  - **White:** the plain number of its slot (a weapon's damage, a piece's armour), and no attributes. Vendor gear and starting kits are white.
  - **Green:** the plain number plus attributes. It's the common upgrade from drops and quests.
  - **Blue:** 30% more of everything than a green of the same item level. It comes from bosses, leaders, chests and quest ends.
  How often each drops belongs to [Loot](05-loot.md).
- **Item level and wearing it:** an item's level is the level of what dropped it or of the quest that paid it. You can carry anything, but gear with an item level above yours can't go into a gear slot until you reach it. The card shows the level in red until then.
- **Numbers gear carries:**
  - A **weapon** has a damage rating that adds to your damage the way Hale's longsword does today. A white of your level adds a little and a blue about one level's step (today's +20%). What it multiplies is Abilities' call once damage comes out of attributes.
  - **Armour** on each armour piece and the shield cuts the damage you take.
  - **Attributes** on greens and blues: Stamina on nearly every piece, plus one main attribute (Strength, Agility or Intellect).
  - What each attribute does belongs to the Abilities map. The target this map hands it: a full set of greens of your level gives about a third of your total attributes, and blues about 40%.
- **The class lock:** weapons and off hands are locked to the class that fights with them. Armour anyone can wear. The card names the class, in red if it isn't yours, and a locked item held over a gear slot turns the slot red with a short buzz, refusing it. A main attribute that isn't your class's shows greyed on the card.
- **Sell price as a rule:** item level × 2 coins for grey, × 3 for white, × 8 for green and × 20 for blue. Consumables and materials have their own prices. Vendors sell at 4 times what they buy for. [Vendors and the stash](06-vendors-and-the-stash.md) checks the rule against what a coin buys.
