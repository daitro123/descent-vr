# 18: Trainers and intro quests

**What to build:** the smith and the herbalist as trainers. Each gets a gold "!" once Raiders in the Fields is handed in, and the talk board with "Ore and Fire" or "Leaves for the Pot". Accepting teaches the pair of professions and hangs the tool on the loop. The objectives are break 2 copper veins and make a whetstone, or gather 4 Hearthleaf and brew a minor healing potion, and the hand-in pays XP as a level-2 quest and 5 coins. The "Train" button lists the Apprentice recipes with price and proficiency, grey until buyable, and buys through the professions module. The trainers' barks follow what you've learned. The bag panel shows a line per learned profession ("Mining: Apprentice 12/25"). The debug handle's shortcut for learning stays, for checks.

**Blocked by:** 12, 13, 14, 15, 16, and Inventory's ticket 09 (the bag in the Adventure).

**Status:** resolved

Read [the spec](../spec.md) ("Trainers and quests" and "The view in VR") and [Trainers and first lessons](09-trainers-and-first-lessons.md).

- [x] The adventure state's tests: both intro quests open at Raiders in the Fields' hand-in, accepting teaches the pair, the objectives count, the hand-in pays.
- [x] `.scratch/professions/checks/trainers.mjs` takes both intro quests from a fresh character after Raiders in the Fields, completes and hands them in, buys the rage draught from the herbalist, and sees three quests in the tracker while Hale's is also active.
- [x] `npm run typecheck`, `npm test` and `npm run build` pass.

## Comments

**2026-09-30, notes from the tickets built so far** (read their Answers for detail):

- **Quests (12):** add the smith's and the herbalist's chains to `CHAINS` with `after: 'raiders'`, reach each board through `state.giver('smith' | 'herbalist')`, send `{ kind: 'accept' | 'handIn', giver }`, give objectives their own place, and add the givers' spots to the quest arrow's givers. Accepting calls `state.professions.learn('mining' | 'herbalism')`.
- **The Train list (11):** `Object.values(RECIPES)` filtered to the trainer's professions with a non-null `price`, one row per `lessonOf`; grey a row out when `buy` would refuse it.
- **The smith's board (Inventory 14 and 12):** "Train" goes beside "Trade". A trainer quest with `picks` gets the pick shelf's reward row; with none it keeps "Hand in".
- **The herbalist (16):** make them a real friendly character with barks and quests, not the bench's stand-in.
- **Hands at stations (15, 16):** the anvil's rule is in `stationHands` with its numbers under `CONFIG.professions.station`. The bench still has its own copy under `CONFIG.professions.bench`. Fold the bench into `stationHands` here, since both trainers' stations are touched.

## Answer

Built on 2026-09-30 by Claude **on Tom's behalf**: he asked for the build tickets to run without his input, taking the recommended option at every fork. Checked in headless Chromium with the emulator, not yet on the headset.

**What was built**

- **The chains** (`src/quests.ts`): `SMITH` ("Ore and Fire") and `HERBALIST` ("Leaves for the Pot") join `CHAINS` with `after: 'raiders'`. A quest can now carry `coins` and `teaches` (a gathering profession). "Ore and Fire" asks for 2 copper veins broken, then a whetstone made at the anvil. "Leaves for the Pot" asks for 2 clumps of Hearthleaf cut (4 leaves), then a minor healing potion brewed. Each pays 120 XP (The Lumber Camp's, the level-2 quest) and 5 coins, with the numbers in `CONFIG.quests.trainers`. Each has a closed line pointing you to Hale, a done line, and "Return to the smith" or "Return to the herbalist".
- **The adventure state:** accepting a quest with `teaches` calls `professions.learn`, so the pick or the knife hangs on the loop at once. The hand-in pays `coins` through `inventory.take`. A `Bark` can need a profession `learned`.
- **Places for the arrow:** `veins` (the two veins by the smithy), `anvil`, `fields` (the farm's three Hearthleaf) and `bench` (the house by the well), in `trainerPlaces` in `layout.ts`. The arrow's givers now include the smith and the herbalist where they work.
- **The herbalist is a villager.** They're `'herbalist'` in `VILLAGERS`, placed by the zone's plan at `HOUSE.bench.herbalist`, and hung from the house's room. `Herbalist` and its body in `standInHouse` are gone. Both trainers carry Hale's `QuestMarker`, which rides above their bark's panel while it shows. The herbalist barks "Mind where you step, there's Hearthleaf by that road." and, once you've learned Herbalism, "Bring me Duskcap from the old mine and I'll show you something stronger." The smith adds "Keep your pick sharp and your fire hot." once you've learned Mining.
- **The herbalist's board** (`Adventure.herbalistBoard`, `teach`) unfolds as you walk up to them inside the house: their quest's buttons, and "Train" once you've learned from them.
- **"Train"** (`src/professions/trainers.ts`, `TalkBoard.showTrain`): `lessonsFor(trainer, professions)` gives one row per lesson of the trainer's bought recipes at your grade. Each row has its price and the proficiency it needs, and is grey whenever `Professions.buyRefusal` (new, and what `buy` now uses) isn't null. The board shows the rows in its own frame under "Herbalist: Train", with "Back" under them. A lit row buys through `professions.buy` (saved, with "Learned: Rage Draught" floating over the board and the list shown again). A grey row buys nothing and buzzes hard (`CONFIG.talk.train`). A known row says "Known". The smith's list is the copper gauntlets (one lesson, 25 coins, Smithing 15). The herbalist's is the rage draught, the mana potion and the elixir.
- **The smith's board:** `vendorTalk(giver, trains)` puts "Train" after "Trade", and `opensWith(giver, trains)` makes a trainer you've learned from talk first. The hand-in's XP, "+5 coins" and the level it lands float over the giver who took it, not always over Hale.
- **Taking an intro quest** says "Mining and Smithing learned" in view.
- **The bag panel** (`ledgerLines`, `LEDGER`): a line per learned profession under the coins ("Mining: Apprentice 2/25"). A pair shares a row, the gathering one under the figure and the making one under the slots. The board reaches 5 cm lower only while there's a line to show.
- **Hands at stations:** the bench now steps up and away by `stationHands`/`atStation`, measured from its front. Its own `near`, `far` and `facing` are gone from `CONFIG.alchemyBench`.
- The debug handle's `professions.learn` stays.

**Checks**

- `npm run typecheck`, `npm test` (1299 passed, after merging main) and `npm run build` pass. `tests/trainers.test.ts` (18 tests) covers:
  - both quests closed until Raiders in the Fields is handed in, then offered with gold markers;
  - accepting teaching each pair (and nothing more if it's already learned);
  - the objectives counting through the professions module's own effects, and nothing before the quest is taken;
  - the hand-in paying 120 XP and 5 coins, with the whetstone or potion kept;
  - three quests at once with Hale's, the arrow on the newest, and a reload keeping them;
  - the barks;
  - the Train list's rows and their grey rule, matched against `buy`;
  - the talk boards' buttons, and the bag panel's lines.
- `questChain`, `questGivers`, `saving` and `questArrow` tests were updated for the new chains and places. The stand-in chains in `questGivers` now sit beside Hale's alone.
- `.scratch/professions/checks/trainers.mjs` passes, all 53 of its checks:
  - After Raiders in the Fields there's a gold "!" over the smith.
  - Their talk board offers Ore and Fire with Accept, Not now and Trade. Accept, pressed with the right fist, teaches Mining and Smithing and hangs the pick.
  - With Hale's The Lumber Camp taken, the herbalist's board in the house offers Leaves for the Pot. Accept teaches Herbalism and Alchemy and hangs the knife.
  - The tracker lists Ore and Fire, The Lumber Camp and Leaves for the Pot, and the arrow points to the fields.
  - The herbalist's bark changes once you've learned from them.
  - Both quests go ready.
  - The smith's Hand in pays 120 XP and 5 coins, floated over them, and the whetstone stays. Their Train list shows the gauntlets grey at "25 coins, Smithing 15", and Back returns to the talk.
  - The herbalist's Hand in brings you to 10 coins. With Alchemy 5, the rage draught and mana potion are lit and the elixir is grey. The elixir buys nothing, with a strong buzz. The rage draught is bought for 10 coins, and its row then says Known.
  - The bag panel shows Mining 2/25, Smithing 1/25, Herbalism 2/25 and Alchemy 5/25.
  - A reload keeps it all.
  - `?proto=pick`, `anvil` and `brew` still run.
- After the change, the earlier emulator checks still pass: `bench.mjs`, `anvil-adventure.mjs`, `herbalism.mjs` and `consumables.mjs` (professions), `vendors.mjs`, `hand-in-picks.mjs` and `bag-adventure.mjs` (inventory), and `hale.mjs`, `villagers.mjs` and `finding-the-way.mjs` (Oakvale).
- After merging main (Inventory 17), `.scratch/inventory/checks/whole-zone.mjs` passes too. By the time it reaches the smith they have Ore and Fire to offer, so their talk board comes first; the check now presses "Trade" on it (`__play.press` takes a board). The smith's budget reads 120 draw calls with the wares and the bag open, up from 118: the smith's quest marker.

**Calls made on Tom's behalf**

- **A trainer you've learned from talks first.** Walking up to the smith once you know Mining opens their talk board with Trade and Train, not the wares straight away. Otherwise their Train list could only be reached while they had a quest to offer or take back. Before you've learned from them, it's as before: wares first unless there's a quest.
- **"Train" shows once you've learned the trainer's pair.** Before that every row would be grey for "not learned", and the quest's board already has three buttons.
- **"4 Hearthleaf" is 2 clumps.** Gather objectives count spots, and a clump gives 2 leaves. The tracker says "Hearthleaf clumps cut: 0/2", and the potion takes 2 of the 4.
- **Talking to the herbalist holds the bench off.** They stand at the bench's end, so where you talk to them is within the bench's reach. While their board is open the bench doesn't take your hands. It takes them once the talk ends (Accept, Not now or Goodbye). Their board doesn't unfold while your hands are the bench's, and only unfolds from inside the house.
- **The bench now uses the stations' facing, 60°,** rather than its own 73°.
- **Rows are named by the lesson** ("Copper Gauntlets") when a lesson teaches several recipes. The price is shown as "25 coins, Smithing 15". The list shows your grade's bought recipes (Apprentice before you've learned).
- **The professions' lines in the bag** go a pair to a row, under the coins across the whole panel, and not on the Talents page.
- **Where the arrow points:** Ore and Fire's first line at the middle of the two smithy veins, its second at the anvil. Leaves for the Pot's first line at the middle of the farm's three clumps, its second at the house by the well (it hides indoors, as always).
- **The quest lines are placeholders,** like Hale's.

**For ticket 19**

- Every trainer's number is in `CONFIG.quests.trainers` and `CONFIG.talk.train`. The ledger's place is `LEDGER` in `ui/bag/layout.ts`.
- Journeyman training isn't built. `Professions.train` exists, and `lessonsFor` already follows your grade.
- On the headset, check that the herbalist's board doesn't clip into the bench or the wall in the small house. The talk board stands 0.6 m from them towards you and 0.55 m to your right.
- The whole-zone run should take both intro quests after Raiders in the Fields and buy something off each Train list.

**On the headset** (a new character, or `__descent.state.apply` past Raiders in the Fields from the console):

1. Hand in Raiders in the Fields. Is the gold "!" over the smith and the herbalist visible from the road and the house's door?
2. Walk up to the smith and press Accept. Does "Mining and Smithing learned" read, and is the pick in the loop straight away?
3. In the house by the well, walk up to the herbalist. Does their board unfold before the bench takes your hands, and after Accept does the bench take them?
4. With three quests under way, is the tracker still readable, and does the arrow point where you'd expect?
5. Hand in both and open Train. Are the rows' prices and the grey clear, and is a grey press's buzz enough to say no?
6. Open the bag. Are the professions' lines under the coins readable at arm's length?

