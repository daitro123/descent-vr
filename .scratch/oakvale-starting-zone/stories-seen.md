# Oakvale's user stories: where each is seen working

For ticket 38 ([issues/38-the-whole-zone-in-one-sitting.md](issues/38-the-whole-zone-in-one-sitting.md)): each of the spec's 147 user stories against

- the unit tests in `tests/` (`npx vitest run`, all passing on 2026-09-30);
- the headless checks in `checks/`, cited as `name.mjs N` for the numbered step in the script's header;
- the play-through, `checks/play-through.mjs`, cited as "play-through N" for the steps in its header.

"Headset" marks what only the Quest can say: feel, sound, look and the budget. The list for Tom's next session is on ticket 38.

## Starting and saving

| # | story | seen in |
|---|---|---|
| 1 | plain URL is Oakvale | `route.test.ts` 'starts the Adventure at the plain URL…'; `adventure.mjs` 2 |
| 2 | Oakvale turning behind the intro | `adventure.mjs` 1 (intro text, looks out from the start, slowly turns); `saving.mjs` 4 (from the save) |
| 3 | start at the crossroads facing Hale | `forest.test.ts` 'starts a new character at the crossroads, a few steps from Hale's spot and facing it'; play-through 1 |
| 4 | "Oakvale" floats up on load | `crossing.mjs` 2; play-through 1 |
| 5 | load where you stood, with level, XP, sword, quests | `saving.mjs` 3–4 (place and facing); `saving.test.ts` 'restores to the same answers at every step of the chain'; play-through 3 |
| 6 | load at full health, no rage, camps full | `saving.mjs` 4; play-through 3 |
| 7 | saved in the inn or house: load inside, door shut, lit | `inn.mjs` 6; `house.mjs` 5; `interiors.test.ts` 'settles inside at once… when you wake by the hearth or load a save' |
| 8 | saved in the mine: load there in its light | `mine.mjs` 5; `mine-deep.mjs` 4; play-through 6 |
| 9 | saved in Brackenmoor: load there | `crossing.mjs` 4; `crossing.test.ts` 'is the zone you arrive in when you load in or wake…' |
| 10 | save on quest change, level, sword, crossing | `saving.test.ts` 'writes on …' (quest taken, count, ready, hand-in, level-up, new sword) and 'writes on each change of current zone…'; `saving.mjs` 2; `crossing.mjs` 2; play-through 8 |
| 11 | save every 30 s, on leaving VR or page hidden | `saving.test.ts` 'writes every 30 s of play…', 'writes when the page is hidden or VR ends…'; `saving.mjs` 3, 5 |
| 12 | save survives new builds and browser updates | `saving.test.ts` 'leaves a newer build's record alone…', 'upgrades a record of every older version…'; `saving.mjs` 8. Headset: `persist()`'s answer on the Quest, and a save surviving a Quest Browser update |
| 13 | `?newgame` starts over after a confirm | `saving.mjs` 6; `saving.test.ts` 'starts over by deleting what the browser holds…'; `route.test.ts` 'asks to start the Adventure over at ?newgame…' |
| 14 | private window: plays, says progress won't be kept | `saving.test.ts` 'plays unsaved where the browser won't store data, and says so'; `saving.mjs` 8 |
| 15 | arena at `?arena` etc. unchanged, never touches the save | `adventure.mjs` 4; `saving.mjs` 7; `route.test.ts` 'opens the arena at ?arena…', '…for its own flags alone…' |

## Talking to Marshal Hale

| # | story | seen in |
|---|---|---|
| 16 | gold "!", grey "?", gold "?" | `questChain.test.ts` 'finds Hale offering…', 'once accepted is under way: a grey "?"…', 'is ready with the third: a gold "?"…'; `hale.mjs` 1, 3, 4 |
| 17 | Hale turns to face you and waves | `hale.mjs` 1; `inspectorClips.test.ts` 'bring Hale's hand up to wave…'. Headset: how it looks |
| 18 | board unfolds on your right within ~2.3 m when looking | `hale.mjs` 2 (unfolds at 1.9 m, on your right); play-through 2 (it stays folded with your back to Hale at 1.9 m) |
| 19 | board shows name, line, chunky buttons | `hale.mjs` 2 (Accept, Not now), 5 (Hand in); `questChain.test.ts` '…a reminder and Goodbye…' |
| 20 | press with either fist or sword tip, that hand buzzes | `hale.mjs` 2 (right fist), 3 (left fist), 5 (sword tip, right hand) |
| 21 | a resting hand must leave before it presses | `hale.mjs` 3 |
| 22 | folds when the talk ends or at ~3.6 m, stays shut until you come back | `hale.mjs` 2 (folds on "Not now", stays shut while you stand there); play-through 2 (walking off and back reopens it; walking 4 m off folds it) |
| 23 | "Not now" folds and leaves the "!" | `hale.mjs` 2; play-through 2 |
| 24 | board reminds you of the quest under way | `questChain.test.ts` 'once accepted is under way: a grey "?", a reminder and Goodbye…' |
| 25 | hand in with "Hand in" | `hale.mjs` 5; `lumber-camp.mjs` 7; play-through 2, 3, 7 |
| 26 | "+80 XP", "LEVEL 2" over Hale, with a fanfare | `hale.mjs` 5; play-through 2. Headset (sound): the fanfare |
| 27 | Hale's last line points south to Brackenmoor | `questChain.test.ts` 'Hale shows no marker, points you south to Brackenmoor…'; `warden.mjs` 3; play-through 7 |

## The quest chain

| # | story | seen in |
|---|---|---|
| 28 | one quest at a time, each unlocked by the last | `questChain.test.ts` 'offers each quest in turn, only once the one before is handed in', 'takes one quest at a time…' |
| 29 | Raiders: 3 bandits at the farm | `questChain.test.ts` 'Raiders in the Fields' block; `hale.mjs` 4; play-through 2 |
| 30 | Lumber Camp: 5 bandits and the orders, either order | `questChain.test.ts` 'is ready with the bandits first…', '…the orders first…' |
| 31 | take the orders by touch, buzz, tracker ticks | `lumber-camp.mjs` 6; play-through 3. Only the left fist is seen taking them ("either hand" is partial) |
| 32 | the orders reveal silver in the old mine | `questChain.test.ts` 'is ready with the orders first…' (Hale's ready line: "Orders... digging for silver"); `lumber-camp.mjs` 7 ("Hale reads the orders") |
| 33 | What Lies Below: down the mine to what woke the dead | `questChain.test.ts` 'asks for whatever woke the dead', 'is ready once the Warden falls'; play-through 5 |
| 34 | only the quest's camp, while active, counts | `questChain.test.ts` 'counts only the quest's own camp', 'doesn't count the lumber camp's patrol…'; `patrol-and-watchtower.mjs` 3 |
| 35 | kills and pickups before taking don't count | `questChain.test.ts` 'doesn't count the farm's bandits killed before…', 'takes the orders only while it is under way'; `lumber-camp.mjs` 1 |
| 36 | no quest dropped or repeated | `questChain.test.ts` 'hands each in once…', 'won't hand in a quest that isn't ready…' |
| 37 | every quest pays XP, the last the longsword | `questChain.test.ts` 'hands in for 80 XP…', '…120 XP…', '…300 XP and Hale's old longsword…'; play-through 7 |
| 38 | nothing stops you going anywhere at any level | `forest.test.ts` 'can reach every landmark on foot from the spawn'; `brackenmoor.test.ts` '…walkable from the play area to every spot of the pass and the moor…'; play-through 4 (the watchtower at level 3) |

## Tracking quests and finding the way

| # | story | seen in |
|---|---|---|
| 39 | tracker top left, lagging the head, title and counts | `hale.mjs` 3 (top left, lines, lags a 40° turn); play-through 2. Headset (look): gold title, readability |
| 40 | "Return to Marshal Hale" when done | `questChain.test.ts` 'is ready with the third: … "Return to Marshal Hale"'; `hale.mjs` 4; play-through 3 |
| 41 | tracker flashes on take, progress, finish | `hale.mjs` 3 (flashes on take). Flashing on progress and on ready is not checked (partial) |
| 42 | no quest, no tracker | `questChain.test.ts` 'has no quest to track'; `hale.mjs` 1, 5; `finding-the-way.mjs` 1 |
| 43 | gold arrow beside the objective, up is ahead | `questArrow.test.ts` 'the quest arrow turning' block; `finding-the-way.mjs` 2 |
| 44 | arrow at the farm, the camp, the mine's mouth, then Hale | `questChain.test.ts` 'points at each quest's place… and at Hale once it's ready…'; `finding-the-way.mjs` 2, 4–6; play-through 2, 3 |
| 45 | arrow hides at the place, near Hale, indoors, in the mine | `questArrow.test.ts` 'the quest arrow hiding' block; `finding-the-way.mjs` 3–6; play-through 5 (the arrow to Hale hidden in the mine) |
| 46 | crossroads signpost names its roads, readable | `forest.test.ts` 'names the crossroads signpost's roads…'; `finding-the-way.mjs` part 1 (screenshots). Headset (look): readable from a few steps |
| 47 | second signpost north of the bridge | `forest.test.ts` 'stands a second, smaller signpost north of the bridge…'; `finding-the-way.mjs` part 1 |
| 48 | painted map board at the crossroads | `forest.test.ts` 'stands the map board about 2.5 m east…', '…shows the whole zone you can walk'; `world.test.ts` 'draws the map board in under 100 triangles…'. Headset (look): what's painted on it ("You are here", place names) is only in screenshots |
| 49 | smoke and places' sounds help you find places | `forest.test.ts` 'raises smoke from the inn's two chimneys…'; `ambience.test.ts` 'has every place the ticket names…'. Headset (feel): whether you really navigate by them |

## Getting around

| # | story | seen in |
|---|---|---|
| 50 | walk 2.2 m/s, snap turn, dash as today | `adventure.mjs` 2; `run.mjs` 1 |
| 51 | click the stick to run at 3.5 m/s | `run.test.ts` 'is 3.5 m/s against a 2.2 m/s walk', 'walks until the left stick is clicked, then runs'; `run.mjs` 2; play-through 8 |
| 52 | run only within ~45° of ahead | `run.test.ts` 'runs while the stick points within about 45° of ahead…'; `run.mjs` 3 |
| 53 | run ends when you let go | `run.test.ts` 'ends when you let go of the stick…'; `run.mjs` 4 |
| 54 | view edges darken, fading ~0.2 s | `run.test.ts` 'fades in over about 0.2 s…'; `run.mjs` 2, 4. Headset (feel): comfort |
| 55 | vignette strength one number, 0 turns it off | `run.mjs` 2 (the ring at `CONFIG.run.vignette.strength`). Nothing checks that 0 turns it off (partial). Headset: Tom tunes it |
| 56 | can't start a run while fighting | `run.test.ts` 'ignores a click while anything is fighting you'; `run.mjs` 5 |
| 57 | a pull ends the run with one left-hand buzz | `run.test.ts` 'ends on the spot when a fight starts, catching you once'; `run.mjs` 5 |
| 58 | run anywhere out of a fight, incl. indoors, mine, moor | `run.test.ts` (the rule takes only the stick, the click and the fight, nothing about where you are); play-through 5 (a run in the mine's adit), 8 (over the pass onto the moor) |

## Enemies and camps

| # | story | seen in |
|---|---|---|
| 59 | farm, lumber camp, patrol, watchtower make-up | `forest.test.ts` 'holds four bandit thugs at level 1…', 'holds three thugs, an archer and their leader…', 'is two bandit thugs at level 2…', 'holds two thugs and an archer…'; `lumber-camp.mjs` 3; `patrol-and-watchtower.mjs` 1, 4 |
| 60 | village, bridge, pond, stones safe | `forest.test.ts` 'the safe places… have no camp in them, nor a patrol…' |
| 61 | notice at 8 m or when hurt, pull camp within 10 m | `camps.test.ts` 'an idle member fights you once you come within 8 m…', 'a member you hurt…'; `farm-camp.mjs` 2 |
| 62 | chase at your walking pace | `camps.test.ts` 'runs at your walking pace when well out of reach…' |
| 63 | leash 30 m, home untouchable, heal | `camps.test.ts` 'gives up 30 m from its post, walks home untouchable, and heals…'; `farm-camp.mjs` 3 |
| 64 | hit on the way home floats "Evade" | `farm-camp.mjs` 3; `camps.test.ts` 'can't be hurt on the way home…' |
| 65 | patrol in single file, 3 s pause | `camps.test.ts` 'walks its road in single file…', 'pauses 3 s at each end…'; `patrol-and-watchtower.mjs` 1 |
| 66 | refill after 3 min, only 30 m away | `camps.test.ts` 'refills whole 3 minutes after the last falls, only once you are 30 m…'; `farm-camp.mjs` 6 |
| 67 | +40% in camps; 3 swing, 2 shoot across all camps | `camps.test.ts` 'have 1.4 times the health and damage…', 'lets three swing and two shoot at once…'; `adventureState.test.ts` 'in a camp take 1.4 times…' |
| 68 | real ground height, steer round trunks, tents, fences | `camps.test.ts` 'stand and chase at the ground's real height'; `world.test.ts` 'bends a walker round a building…', 'is no trap: the leader… comes round it'; `lumber-camp.mjs` 4. Headset (look): fights on hills and among trees |
| 69 | each place adds one new test, in order | Make-up only: `forest.test.ts` camps; `enemyAttacks.test.ts` 'the bandit leader's reach'; `mineUndead.test.ts` 'holds two grunts and an archer…'. Headset (feel): whether it teaches |
| 70 | look shows family and behaviour | `bandits.test.ts` 'wears the human body, not a skeleton'; `people.mjs` 1 (screenshots). Headset (look) |
| 71 | no names or levels over enemies, only health bars | `people.mjs` 3 |
| 72 | enemies drop only healing orbs, each healing a quarter | play-through 9 (every orb the fights dropped and you walked over healed a quarter of your health, or what was missing); orbs are the only thing `Adventure` drops |
| 73 | on your death fighters go home, the killed stay dead | `camps.test.ts` 'sends everyone fighting you home…'; `farm-camp.mjs` 4; play-through 4, 5 |

## Levels and progression

| # | story | seen in |
|---|---|---|
| 74 | level 1 to 5, about a level per place | `questChain.test.ts` 'lands level 2 at the first hand-in, 3 at the second, 4 at the dig's brute, and 5…'; play-through 2, 3, 5, 7 |
| 75 | +20 health and +20% damage per level | `adventureState.test.ts` 'each add 20 health and 20% damage…' |
| 76 | enemy levels: farm 1, camp/tower 2, mine 3–4, Warden 5 | `forest.test.ts` camp tests (levels 1, 2); `mineUndead.test.ts` '…at level 3, and a brute… at level 4…'; `throne.test.ts` '…level 5 with 1,080 health…' |
| 77 | 10 XP per enemy level (×3 for some); quests 80/120/300 | `adventureState.test.ts` 'pays 10 XP per enemy level…', 'pays triple for the bandit leader…'; `questChain.test.ts` hand-in tests |
| 78 | levels at 100/200/300/400 more XP | `adventureState.test.ts` 'come at 100, 300, 600 and 1,000 XP in all'; `questChain.test.ts` 'the plain route' |
| 79 | XP past level 5 dropped | `adventureState.test.ts` 'keeps only the XP up to 1,000…', 'drops every kill past it' |
| 80 | Warden's raised skeletons pay nothing | `adventureState.test.ts` 'pays nothing for the skeletons the Warden raises'; `throne.test.ts` 'calls up level-5 skeletons… that pay nothing…' |
| 81 | War Cry at 2, Earthshaker at 3, rage hidden till 2 | `adventureState.test.ts` 'arrive with the War Cry at level 2 and Earthshaker at 3…'; `levels.mjs` 1, 3, 4 |
| 82 | each kill floats its XP | `levels.mjs` 2 |
| 83 | level-up: banner, sound, full health, names the unlock | `levels.mjs` 3, 4. Headset (sound): the level-up call |
| 84 | belt shows level and a thin XP bar | `levels.mjs` 1, 3; `adventureState.test.ts` '…for the belt's XP bar…' |
| 85 | Hale's longsword in hand, +20% damage, same handling | `warden.mjs` 3 (2.0 damage); `adventureState.test.ts` 'adds 0.2 to your damage multiplier…'; play-through 7. Headset (look and feel): darker blade, gilded guard, handling |
| 86 | the sword gone from Hale's hip | `warden.mjs` 3, 4; play-through 7 |
| 87 | health refills over ~10 s after 5 s calm | `farm-camp.mjs` 5; play-through 2 |

## Death

| # | story | seen in |
|---|---|---|
| 88 | fade to black, wake at full health, no rage | `farm-camp.mjs` 4; play-through 4 |
| 89 | die outside the mine: wake by the inn's hearth | `inn.mjs` 5; `forest.test.ts` 'is by the inn's hearth, inside with the door shut…'; play-through 4 |
| 90 | die in the mine: wake on the rail bed, facing it | `mine.mjs` 6; `world.test.ts` 'wakes you on the rail bed a few metres out, facing the mouth…'; play-through 5 |
| 91 | lose nothing on death | play-through 4 ("nothing lost": level, XP, quest count) |

## The mine and the Warden

| # | story | seen in |
|---|---|---|
| 92 | one route, ~100 m, 7 m down, two gentle ramps | `world.test.ts` 'goes about 7 m down over two ramps of about 1 in 5…', 'gives the World its route: one unbroken line…'; `mine-deep.mjs` 1. The route is 123 m (ticket 26's call) |
| 93 | the walls tell the story | Headset (look): the mine's screenshots only (`mine.mjs` 3, `mine-deep.mjs`) |
| 94 | undead posts: cart hall, gallery, dig, antechamber | `mineUndead.test.ts` 'holds two grunts and an archer in the cart hall…'; `mine-undead.mjs` 1 |
| 95 | rock blocks noticing and calling | `mineUndead.test.ts` 'doesn't notice you through rock…', 'makes each chamber its own pull…'; `mine-undead.mjs` 2 |
| 96 | out of sight, follow the tunnel there and back | `mineUndead.test.ts` 'follows the centre line round a hairpin to you, and walks home the same way' |
| 97 | undead never leave by the mouth | `mineUndead.test.ts` 'ends every chase: out through it…'; `mine-undead.mjs` 3 |
| 98 | walls and ceilings stop arrows | `mineUndead.test.ts` 'fly down a tunnel, but stop in its walls, its floor and its ceiling' |
| 99 | mine refills after 3 min, once you're out and 30 m off | `mineUndead.test.ts` 'fills again 3 minutes after the last falls, and only once you have left it…' |
| 100 | Warden slumped, rises as you step through the gate | `throne.test.ts` 'sits slumped on its throne…', 'rises the moment you step through the gate…'; `warden.mjs` 1, 2; play-through 5 |
| 101 | empty throne off the quest or once beaten | `throne.test.ts` 'is empty'; `questChain.test.ts` 'answers for every stage of the chain'; play-through 6 |
| 102 | Warden resets if you die or leave by the gate | `throne.test.ts` 'when you leave by the gate…', 'when you fall'; `warden.mjs` 2 |
| 103 | Warden stays dead, reloads included | `questChain.test.ts` 'doesn't seat the Warden again once beaten, reloads included'; `warden.mjs` 4; play-through 6 |
| 104 | the Warden's hall is today's crypt hall | `mine-deep.mjs` 2 (the hall 7 m down). Headset (feel): whether the finale plays as it did in the arena |
| 105 | lanterns, braziers, torches; deep workings darkest | `world.test.ts` '…its flames within reach of the pool from every part…'; `mine.mjs` 1; `mine-deep.mjs` 2. Headset (look): how dark, and whether a swing stays readable |
| 106 | daylight fades past the bend and is back before you see out | `mine.test.ts` 'swaps to the mine's light past the bend…', 'brings the sun back as you walk back to the bend…'; `mine.mjs` 3, 4 |

## Interiors

| # | story | seen in |
|---|---|---|
| 107 | walk into the inn, the house, under the smithy's roof | `world.test.ts` walkable-from-the-door tests for the inn and house, 'keeps you out of its… forge… and lets you in under its roof'; `inn.mjs` 3; `house.mjs` 3, 6 |
| 108 | door swings open and shuts, no fade or button | `interiors.test.ts` 'opens the door as you walk up…', 'shuts the door behind you…'; `inn.mjs` 2, 3; `house.mjs` 2, 3 |
| 109 | see in through the open door, fires lit | `interiors.test.ts` 'opens the door as you walk up, with the room showing and lit…'; `world.test.ts` 'shows the room lit by its flames through the open door…'; `inn.mjs` 2 |
| 110 | sun fades inside, back as you walk to the door | `interiors.test.ts` '…swaps the light over half a second…', 'brings the sun back up as you walk back to the door…'; `inn.mjs` 3, 4 |
| 111 | windows glow with daylight | Headset (look): screenshots only |
| 112 | the inn's taproom and the house's room | `world.test.ts` 'keeps you in by the taproom's walls and out of its hearth, bar and tables…', '…out of its hearth, bed, chest, table and shelf…'. Headset (look): does each read at a glance |
| 113 | upper floor and attic out of reach, no stair to nowhere | `world.test.ts` walkable flood fills (one floor only). Headset (look): nothing looks unfinished |
| 114 | no enemy comes indoors | `world.test.ts` 'keeps every camp and patrol a leash and more from its walls…' (inn), '…more than a leash from its doorway…' (house); `camps.test.ts` 'sends everyone fighting you home as you go in…' |

## Brackenmoor and the seam

| # | story | seen in |
|---|---|---|
| 115 | pass walkable along the road, rocks and pines | `brackenmoor.test.ts` 'lets you walk the road from the play area up the pass…', 'keeps you in the pass's corridor…', 'stands rocks and pines along the corridor's edges…'; `pass-and-brackenmoor.mjs` 4 |
| 116 | far hills rise in haze beyond the crest | `pass-and-brackenmoor.mjs` 1 (screenshot). Headset (look) |
| 117 | the view both ways from the crest | `pass-and-brackenmoor.mjs` 1 (screenshots); play-through 8 (shot north). Headset (look) |
| 118 | green to rust/olive/purple; border stone | `brackenmoor.test.ts` 'grows bracken, heather, low bushes…', 'stands the border stone by the road on the crest…'. Headset (look) |
| 119 | light, haze, sky blend over 40 m either side | `crossing.test.ts` 'blends the light, haze and sky by where you stand across the 40 m…'; `crossing.mjs` 1 |
| 120 | zone name floats up, holds ~3 s, fades | `crossing.mjs` 2 (floats on each crossing); play-through 8. Headset (look): the 3 s hold and fade aren't measured |
| 121 | zone changes only 2 m past the crest | `crossing.test.ts` 'changes to Brackenmoor only once you are 2 m past the crest…', 'never changes standing about on the crest…'; `crossing.mjs` 2; play-through 8 |
| 122 | no loading screen, pause or dropped frame | `crossing.mjs` 2 (at most one chunk uploaded a render, no new shader program). Headset (budget): dropped frames on the Quest |
| 123 | the moor's road ends at a rockfall | `brackenmoor.test.ts` 'runs its road south to a gap in the hills, closed by a rockfall…'; `pass-and-brackenmoor.mjs` 4; play-through 8 |
| 124 | Brackenmoor empty and safe | `brackenmoor.test.ts` 'is empty and safe…'; `pass-and-brackenmoor.mjs` 4 |
| 125 | walking the moor streams Oakvale down and back | `crossing.test.ts` 'walking the moor end to end takes Oakvale from full detail to stand-ins to unloaded, and back…'; `crossing.mjs` 3; play-through 8 |
| 126 | `?fly` flies Brackenmoor | `pass-and-brackenmoor.mjs` 3 |

## A living zone

| # | story | seen in |
|---|---|---|
| 127 | fixed late-afternoon light in both zones | `world.test.ts` 'keeps one hemisphere light, one sun…'; `brackenmoor.test.ts` '…under the same sun…'. Headset (look) |
| 128 | Oakvale's wind and birdsong, fewer over fields | `ambience.test.ts` 'birds call from a tree 10 to 30 m off…', 'fewer birds call over the open fields…'; `ambience.mjs` 1, 4. Headset (sound) |
| 129 | Brackenmoor's lower wind and lone bird | `crossing.test.ts` 'the moor's lone bird… calls now and then…'; `crossing.mjs` 2 (the airs crossfade). Headset (sound) |
| 130 | mine air, drips, timbers; drone at the breach | `mix.test.ts` 'in the mine past the bend…', 'in the crypt: the drone rises across the breach…'; `sound-mix.mjs` 4. Headset (sound) |
| 131 | places' sounds, each placed | `ambience.test.ts` 'has every place the ticket names…'; `ambience.mjs` 3 (hammer in time with the smith), 6. Headset (sound) |
| 132 | indoors: outdoors muffled, fires up, with the light | `mix.test.ts` 'moves with the light, so over the same half-second…'; `sound-mix.mjs` 3 |
| 133 | ambience crossfades over the seam's 40 m | `mix.test.ts` 'across a seam: each zone's own air…'; `crossing.test.ts` '…the mix crossfades their airs at equal power'; `crossing.mjs` 2 |
| 134 | ambience dips in a fight | `mix.test.ts` 'in a fight: the whole ambience dips a little…'; `sound-mix.mjs` 5 |
| 135 | no music, only ambience and stings | Headset (sound): nothing checks it; there is no music in the code |
| 136 | smith, innkeeper, farmer at work | `work.test.ts` 'strikes in bursts of a few blows…', 'has the smith turn to the bellows…'; `villagers.mjs` 2. Headset (look) |
| 137 | villagers' heads follow you within 4 m | `villagers.mjs` 3 |
| 138 | barks: 4 m, ~4 s, once a visit, lines move on | `barks.test.ts` 'barks as you come within 4 m…', 'shows for about 4 s', 'doesn't bark again…'; `questChain.test.ts` 'answer every villager for every stage of the chain…'; `villagers.mjs` 3, 4 |
| 139 | Hale doesn't bark | `villagers.mjs` 1 ("Hale is no villager: they don't bark") |
| 140 | smoke from chimneys and the camp fire | `forest.test.ts` 'raises smoke from the inn's two chimneys…'; `world.test.ts` 'raises all the smoke in one instanced mesh…'; `finding-the-way.mjs` part 1. Headset (look) |
| 141 | four friendly characters with faces, dressed for who they are | `humanBody.test.ts` 'every human character… is one body under 900 triangles'; `people.mjs` 1, 2. Headset (look) |

## Building and testing it

| # | story | seen in |
|---|---|---|
| 142 | every new number in the one table of tunables | **GAP** (partial): tests read many numbers from `CONFIG` (e.g. `barks.test.ts` and `ambience.test.ts` "uses the spec's numbers"), but nothing checks every number is there. Ticket 36 kept the pass's and moor's layout numbers in `PASS`/`MOOR` on purpose |
| 143 | `?perf` readout | `route.test.ts` 'reads ?perf over whichever game runs'; `chunk-worker.mjs` 4 (uploaded bytes line); `streaming.mjs` 3 (chunks line); `adventure.mjs` 3 (screenshot only: fps, draw calls, triangles, programs aren't asserted). Headset (budget): read it on the Quest |
| 144 | 72 fps, ~300 draw calls, ≤4 point lights on the Quest 3 | play-through 9 (the emulator's draw calls, triangles, lights and programs at four spots, both eyes; numbers on ticket 38); `world.test.ts` '…a pool of exactly 4 point lights…'. Headset (budget): 72 fps |
| 145 | `?map=<id>` walks with no enemies, no save | `adventure.mjs` 4 (no game, no enemies); `saving.mjs` 7 |
| 146 | `?inspect` shows the humans with every animation | `people.mjs` 1; `inspectorClips.test.ts` 'show friendly characters standing at ease…', 'play the same animations on bandits…' |
| 147 | driveable from the console and the emulator | every check script, and the whole play-through (`teleport`, `step`, `state` through `window.__descent`) |

## Partly seen

- **142**: nothing checks that every new number lives in `CONFIG`; it's a code-review property. Ticket 36 kept the pass's and Brackenmoor's layout numbers in their plans (`PASS`, `MOOR`) on purpose.
- **41**: the tracker's flash is checked when you take a quest (`hale.mjs` 3), not on progress or on becoming ready.
- **55**: the vignette's strength at 0 hiding it is in the code (`RunVignette`), but nothing tries it.
- **31**: only the left fist is seen taking the orders; the right hand is the same code path.

## Waiting on the headset

**Feel**
- 49: do the smoke and the places' sounds actually help you find your way?
- 54, 55: is the run's vignette comfortable, and is its strength (0.55) right? Try 0 to confirm it turns off.
- 69: does the zone teach combat in order? The farm teaches reading and blocking, the lumber camp archers and the leader's slam, then the mine and the Warden.
- 85: does Hale's longsword handle like your own sword?
- 104: does the Warden's finale in the mine play as well as it did in the arena?

**Sound** (every level is in `CONFIG.sound`, none heard on a headset yet)
- 26: the hand-in fanfare. 83: the level-up call.
- 128: Oakvale's wind and birds. 129: the moor's lower wind and the curlew.
- 130: the mine's hollow air, drips and timbers, and the drone at the breach.
- 131: each place's sound, and whether the smith's hammer is in time.
- 132, 133, 134: how muffled indoors, the crossfade over the seam, how deep the fight's dip goes.
- 135: confirm there's no music.
- Also the audio CPU with 8 ambient sounds playing (tickets 30 and 31).

**Look**
- 17: Hale's turn and wave. 39: the tracker's gold title and readability. 46, 48: the signposts and the map board readable from a few steps. 120: the name's 3 s hold and fade.
- 68: enemies on hills and among trees. 70, 141: bandits, Hale and the villagers read as who they are. 136: the villagers' work loops.
- 85: the longsword's darker blade and gilded guard.
- 93: the mine's story in its walls. 105: how dark the deep workings are, and whether a swing stays readable.
- 111, 112, 113: the windows' glow, the rooms reading at a glance, no unfinished upper floor.
- 116, 117, 118: the haze over the crest, the views both ways, the moor's colours and the border stone.
- 127: the late-afternoon light in both zones. 140: the smoke over the haze.

**Budget**
- 122: no dropped frame crossing the seam.
- 143: read `?perf` on the Quest (fps, draw calls, triangles, chunks, uploaded bytes, programs).
- 144: 72 fps, about 300 draw calls, at most 4 point lights, 250k to 300k triangles over both eyes. Compare against play-through 9's emulator numbers from the village, the crest looking north, the inn and the Warden's hall.
- 12: whether `navigator.storage.persist()` answers true on the Quest, and whether a save survives quitting straight after a hand-in.
