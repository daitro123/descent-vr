# 17: Using what professions make

**What to build:** the made consumables working in a fight. The rage draught gives 30 rage and the minor mana potion 40% of mana (a no-op until the Abilities build gives the mage mana), both drunk from the belt on the shared 60 s potion cooldown. The elixir of the keen eye is drunk from the bag panel or the hand and gives +10% damage for 5 minutes. The whetstone is taken from the bag and rubbed along the blade (or the arrowheads) for +5% damage for 10 minutes; it never goes on the belt. One of each buff at a time, a new one replacing the old, with a small icon and its minutes left beside the belt HUD. Buffs aren't saved.

**Blocked by:** 11, and Inventory's ticket 10 (the belt in the Adventure).

**Status:** resolved

Read [the spec](../spec.md) ("The professions state", "Items added to the catalogue" and "The view in VR").

- [x] The inventory module's tests: the rage draught and mana potion share the cooldown with the healing potion; the whetstone and the elixir report their buffs, and a second replaces the first.
- [x] The character's damage reads the buffs (a test through the adventure state or the character's numbers).
- [x] `.scratch/professions/checks/consumables.mjs` drinks a rage draught against a camp (rage +30), rubs a whetstone on the sword and sees damage rise 5% and its icon count down.
- [x] `npm run typecheck`, `npm test` and `npm run build` pass.

## Answer

Built on 2026-09-30 by Claude **on Tom's behalf**: he asked for the build tickets to run without his input, taking the recommended option at every fork. Checked in headless Chromium with the emulator, not yet on the headset.

**What was built**

- `Inventory.use(from)` (`src/inventory.ts`): use one of what's in a bag or belt slot. A potion (the healing potion, the rage draught, the mana potion) needs the shared 60 s cooldown to be over and starts it; `drank` now carries `rage` and `mana` beside `heal`. The elixir and the whetstone aren't potions: they report a `buff` effect and replace any buff of their kind for their whole time. `drink(slot)` is `use` on a belt slot, refilling from the bag as before. `tick(dt)` runs the buffs down too and returns a `buffEnded` effect as one runs out. `buffs` and `boost` (0.15 with both on) read them. Buffs aren't in the snapshot, so a load starts with none.
- **Damage:** `statsAt` takes a fifth argument, `boost`, and `AdventureState.stats` passes the inventory's. The buffs multiply everything that makes your damage (level, gear, the weapon's rating), so the whetstone is exactly 5% more at any level, and the two together 15%.
- **The Adventure** (`show`): `drank` heals, adds rage through `player.addRage` (the warrior's, once the War Cry has brought rage) and gives back a share of the mage's mana. `buff` and `buffEnded` set your numbers again; `buff` floats "+5% damage" with a soft chime.
- **The whetstone** (`src/professions/sharpen.ts`, `Sharpen`, pure): carried from the bag panel in one fist and rubbed along the blade in the other hand. Within 6 cm of the edge, half a metre of travel along it in all (two or three strokes) sharpens it, with a scrape's buzz in both hands and a rasp every 12 cm and a ring at the end. For the ranger, the edge is the bow's limbs, standing in for the arrowheads (there's no quiver model to rub). The mage has no edge, and `use` refuses the whetstone for a class it isn't for. Let go while it's on the edge, it goes back to its slot rather than dropping. Numbers in `CONFIG.professions.sharpen`.
- **Drinking from the bag** (`src/player/sip.ts`, `Sip`, pure, the belt's numbers): a potion or the elixir carried off the bag panel and held at the mouth for 0.7 s is drunk, with the belt's steady buzz, gulp and pulse. Pulled away early it's cancelled; let go at the mouth it goes back.
- **The belt:** a flask dims only while it's a potion, so an elixir on a hip can be taken and drunk during the cooldown.
- **The bench's stand** (`bench.ts`, `sipping`): a corked flask held off its stand at your mouth for 0.7 s is drunk. Its potion is already the bag's, so the bag's last stack of it is the one used, on the shared cooldown, and the flask leaves the hand and the stand. Refused while the cooldown runs, it stays in the hand with the strong buzz, and isn't tried again until you take it from your mouth and bring it back. `BenchContext.mouth` gives it the belt's mouth point.
- **The icons** (`src/ui/beltHud.ts`): a small strip beside the resource orb, at the HUD's pixel size, with a row per buff: a whetstone or a green flask and the minutes left (rounded up, so the last minute shows 1). It shows only while a buff is on you. The Adventure sets `hud.status.buffs` each frame.
- `sfx` gained `scrape`, `sharpened`, `gulp` and `buff`.

**Checks**

- `npm run typecheck`, `npm test` (1203 passed after merging main's talents, with the new cases in `tests/professionItems.test.ts`, `tests/adventureState.test.ts` and `tests/sharpen.test.ts`) and `npm run build` pass.
- `.scratch/professions/checks/consumables.mjs`, all passed: a level-2 warrior against the lumber camp, fighting you, drinks a rage draught off the left hip at 0.71 s and rage goes from 3.5 to 33.5 in that frame, with the belt dim for 60 s and the hip refilled; with the bag open, the whetstone carried in the left fist and rubbed along the sword over two strokes sharpens it (6 scrape buzzes, then a strong one), damage goes from ×1.217 to ×1.278 (5%), and its icon shows 10, then 9 a minute later; the elixir carried to the mouth is drunk while the belt is dim, for 15% in all and two icons; at the bench a brewed minor healing potion held at the mouth is refused while the cooldown runs, isn't retried while held there, and once the cooldown is over it's drunk at 0.71 s for 40% health, leaving the bag and its stand; a reload has no buff; `?belt` and `?proto=brew` still run.
- After merging main: `consumables.mjs` again, and `inventory/checks/belt-adventure.mjs`, `professions/checks/bench.mjs` and `inventory/checks/bag-adventure.mjs`, all passed.

**Calls made on Tom's behalf**

- The buffs multiply your damage (5% more at every level) rather than adding 0.05 to the multiplier, which would be under 3% at level 5. Two buffs add up: 15%, not 15.5%.
- The rage draught gives rage only once the War Cry has brought it (level 2), as every other rage does; drunk before, it's used up for nothing. It isn't refused for other classes either; it just does nothing for them.
- The ranger's whetstone is rubbed along the bow, for the arrowheads.
- Only the fist not holding the blade can rub: a whetstone carried in the sword hand, or on the sword's tip, does nothing.
- The elixir can go on the belt (the item allows it) and is drunk there off the cooldown; it's also drunk from the bag. The whetstone is used only from the bag.
- A drink refused at the bench's stand isn't retried until the flask leaves your mouth, so it doesn't buzz every 0.7 s.

**For later tickets**

- **13 (the tool loop):** this build touched `belt.ts` only in `dimmed(i)` (per slot now, a potion only) and nothing in the zones, so the loop's zone can go in beside it.
- **The mage's mana potion** now works through `drank.mana`; nothing else is needed. A mana potion drunk by a warrior or ranger is used up for nothing.
- **Vendors:** the smith or innkeeper could sell whetstones; `use` doesn't care where they came from.
- **Later buffs** (another kind of elixir) add a `BuffKind`, an icon in `BUFF_ICONS` and their numbers; `boost` adds them up. A buff on something other than damage would need `ActiveBuff` to say what it changes.
- **The Abilities roster:** buffs live on the character's `Inventory`, so they come and go with it.

**On the headset** (plain URL; `__descent.state.inventory.take([{ id: 'whetstone', count: 1 }, { id: 'elixir-of-the-keen-eye', count: 1 }, { id: 'rage-draught', count: 2 }])` from the console, and a level-2 warrior for rage):

1. Open the bag, carry the whetstone out in your left hand and rub it along the sword: do two or three strokes feel right, and do the scrape buzzes read as sharpening?
2. Glance down at the belt HUD: are the icons beside the orb readable, and is the minutes count enough?
3. Carry the elixir from the bag to your mouth: is 0.7 s there right, with the bag panel in the way?
4. Belt a rage draught and drink it in a fight: does the rage orb fill as you'd expect?
5. At the alchemy bench, brew a potion and drink it straight off the stand.
