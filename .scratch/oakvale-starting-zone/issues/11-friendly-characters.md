# Friendly characters

Type: prototype
Status: resolved
Blocked by: 

## Question

How does Marshal Hale look, and does Oakvale need any other friendly characters?

- The quest chain needs one friendly character: Marshal Hale, the village guard captain, standing outdoors at the crossroads (see The quest chain). Every character built so far is a skeleton, so this is the first living human.
- Built on the existing humanoid rig, one draw call, in the same low-poly style as the skeletons. Build the body once and dress it for Marshal Hale and for the three bandits from [The zone's enemies](02-the-zones-enemies.md): the thug (grunt behaviour), the archer, and the leader (brute behaviour). Each bandit must read at a glance, the way the green hood marks today's archers.
- Whether the village gets anyone else to stand about (an innkeeper, a smith, a farmer), and how many fit the triangle budget. What they do all day stays with the living-zone fog.

Build a rough Marshal Hale and the three bandits in the model inspector (`?inspect`), look at them on the Quest next to a skeleton, and decide.

## Answer

Settled over three rounds on 2026-09-28 **by Claude on Tom's behalf**: Tom asked for the rest of the map to be settled without him, so the prototype was built and judged in the headless emulator rather than on his Quest, and every pick below was taken without his answer. The rounds and the reasons are under Comments, for him to revisit. The prototype is out of `main`; its code stays in history at commit `c987194` (`src/models/people-prototype/`: the human body in `body.ts`, every character in `people.ts`) for whoever builds this. Screenshots are in the project files under `friendly-characters/`.

- **One human body** on today's rig: the same 14 bones, rigid skinning, one draw call, the same material and grain as the skeletons. It stands about 1.78 m, a little taller than a skeleton grunt (1.74 m), and comes in four builds: average (Hale, the thugs, the archer, the farmer), stout (the innkeeper), broad (the smith) and big (the leader, about 1.97 m). The face has eyes with whites, brows, a nose, a mouth and ears, with the chin on the jaw bone. Hair, beards and clothes are parts laid over the body: tabard, mail, pauldrons, jerkin, apron, hood, kerchief, sash, coat and hats.
- **Every enemy animation plays on it unchanged:** the grunt's chop, slashes and guards, the archer's draw (the string follows the hand to the cheek), and the brute's slash and slam. Checked in the inspector.
- **Marshal Hale is the captain:** bareheaded, with cropped grey hair and a clean-shaven face. They wear a mail shirt under a blue tabard with a gold mark on the chest, front and back, to mid-thigh, with steel pauldrons, leather gloves and bracers, a belt with a gold buckle, and dark trousers and boots. Their own old longsword, with the gilded guard the last quest pays out, hangs sheathed at the left hip, and their left hand rests on its pommel. They wave as you walk up, as the `?talk` prototype's Hale did. Once What Lies Below is handed in, the sword is gone from their hip.
- **Colours say who's who at a glance:**
  - Blue and gold belong to Hale alone.
  - Red on the face and at the waist marks a bandit.
  - A green hood marks an archer, of either family.
  - Bone marks the undead.
  - Villagers wear undyed linen, browns and ochre, with their faces bare.
- **The bandits' family mark** is a red kerchief over the nose and mouth, knotted at the back of the head, and a red sash at the waist, so a bandit reads from the front and from behind. Otherwise they wear worn leather and linen.
  - **The thug** (grunt behaviour) wears a leather jerkin over a linen shirt, with sleeves or bare forearms, trousers and boots. Thugs vary the way grunts do (hair, skin, jerkin shade, sometimes a scavenged iron shoulder guard) and carry a short iron sword or a woodcutter's hatchet.
  - **The archer** wears the green hood and cowl of today's skeleton archers over the red kerchief, with a quiver on the back, leather bracers and today's bow.
  - **The leader** (brute behaviour) is a big man, about 1.97 m and heavily built: bald, with a black beard under the kerchief, a long red coat open over a dark red shirt, a shaggy fur mantle and a heavy belt with a gold buckle. He carries a two-handed felling axe in place of the maul. He reads by his size, the red coat and the axe, and he is far smaller than the undead brute. The brute's reach (1.65 m attack range, 0.5 m body radius) was set for the undead brute's body and maul, so the build checks the leader's slash and slam in the inspector and retunes them if they fall short.
- **Three villagers, and no more:**
  - **The innkeeper** stands behind the Golden Tankard's bar: stout, bald, with a brown moustache, a linen shirt with rolled sleeves, a russet waistcoat, a long white apron and a tankard in hand.
  - **The smith** stands at the anvil under the smithy's roof: broad, with cropped dark hair and a short beard, a sleeveless dark shirt and bare arms, a leather bib apron to the knees, thick gloves and a hammer.
  - **The farmer** stands by the well at the crossroads. It's the farm's own farmer, driven out by the bandits and waiting in the village, in a straw hat, a linen shirt with braces and ochre trousers, holding a pitchfork.
  - The house by the well stays empty. There are no guards and no children.
  - None of them gives quests, so they have no board and no marker. What they do all day, and whether they speak a line as you pass, stays with [A living zone](12-a-living-zone.md).
- **Budget:** a human measured 630 to 900 triangles and one draw call (two in XR), fewer than a skeleton grunt (about 1,050). The four friendly characters add about 2,800 triangles. From the crossroads you see Hale, the smith and the farmer, about 2,100 triangles, under 2% of the 110k to 175k triangles the village views draw per eye. The innkeeper is indoors, so they're drawn only while the inn's door is open or you're inside.
- Names and colours are placeholders for the spec.

## Comments

**2026-09-28:** [The zone's enemies](02-the-zones-enemies.md) is resolved and folds the bandit looks into this ticket, so the question now covers the thug, the archer and the leader as well as Marshal Hale. [Enemies in the open](07-enemies-in-the-open.md) prototypes with skeletons standing in, so it doesn't wait on this one.

**2026-09-28:** [Talking to NPCs and tracking quests in VR](06-talking-to-npcs-and-tracking-quests.md) is resolved. A gold "!" or "?" floats about half a metre over Marshal Hale's head, and a board unfolds beside them on your right when you walk up, so Hale needs room around them by the signpost. The prototype's stand-in Hale (mail, a blue tabard, a sword at the hip, one draw call, turning to face you and waving) is in history at merge commit `19ce545`, `src/ui/talk-prototype/actors.ts`, if a starting point helps.

**2026-09-28:** [Interiors](08-interiors.md) is resolved (by Claude on Tom's behalf). The inn (a taproom with a bar along the back wall) and the house by the well open; the smithy becomes walk-in. The inn's bar leaves a spot for an innkeeper, the house is a villager's home, and the smithy has its anvil; whether anyone stands in them is this ticket's call. A character indoors is lit by the room's hearth and lanterns, not the sun.

**2026-09-28, round 1 (taken on Tom's behalf, without his answer):**

- Built Marshal Hale three ways on one new human body: A, the captain (bareheaded, mail under a blue tabard); B, the knight (a steel breastplate, an open helm with a blue crest, a blue cloak); and C, the officer (a long blue coat with gold buttons and a baldric, and a short beard). Looked at them in the inspector next to a skeleton grunt, at the crossroads from where a new character starts, and at talk distance in the emulated headset.
- Picked A. You talk to Hale face to face, inside the board's 2.3 m, five or six times over the chain, and a bare face makes them a person to talk to. B's helm hides the face and makes Hale read as one soldier of a garrison the village doesn't have. C reads as a clerk, when the chain sends you out to fight and Hale's own sword is its last reward: Hale should look like an old fighter, which the grey hair and the mail say.
- Blue and gold carry from across the crossroads and from behind, so they stay Hale's alone. The gold "!" over the head does the rest.
- The small touches: the left hand rests on the pommel, and the wave from the `?talk` prototype stays. The sword leaves their hip once it's handed to you, since it's the same sword.

**2026-09-28, round 2 (taken on Tom's behalf, without his answer):**

- Built the thug, the archer and the leader in three family marks: A, a red kerchief over the face; B, a red headwrap with the face bare; and C, a black hood and a black mask. Looked at them in the inspector and in Oakvale's farmyard at 8 m and 18 m, in the late-afternoon light, with a group of skeletons alongside.
- Picked A. The face is where you look first, and a red mask over it says "bandit" at a glance; at 18 m it still shows as a fleck of red. B's bare faces make bandits look like villagers, now that villagers exist. C loses all colour against the woods and in shade, and a hood on every bandit blurs the green hood that marks archers. The red mask is also Elwynn's own sign of a bandit: the Defias wear them.
- Added a red sash after the first look. From behind, a masked thug was just a brown figure, and you see bandits from behind when they walk home off a leash or patrol away from you.
- The first thugs were dark leather from top to toe and went nearly black with the sun behind them. Their jerkins and shirts went lighter and the red went brighter, so they stand out against the woods.
- The leader is human, but big. The slam needs a body that looks as though it could land one, and the undead brute's bulk would make the leader read as a monster. The felling axe replaces the maul because the gang holds a lumber camp. The long red coat and the fur make the leader the reddest thing in the camp, so the one The Lumber Camp is about stands out.
- The grunt's, the archer's and the brute's animations all play on the human body unchanged. The leader's reach is the one thing to recheck, since his arms and axe are shorter than the undead brute's arms and maul.

**2026-09-28, round 3 (taken on Tom's behalf, without his answer):**

- Built an innkeeper, a smith and a farmer, and stood them where they'd live.
- Three, each where the village already leaves room: the inn's bar, the smithy's anvil and the well at the crossroads. A starting zone with only a quest giver in it feels empty; WoW's Northshire and Goldshire have their innkeeper and their smith. Each is someone the zone already implies: the inn needs a keeper, the smithy a smith, and the farmer is who the bandits drove out in Raiders in the Fields.
- The farmer waits in the village, not at the farm. The farm is a camp that refills, and a friendly character standing in a fight would either be struck or need rules about not being struck.
- No more than three. Guards would have nothing to do, since no enemy ever comes into the village. The house by the well stays a home to look into, and children would need a smaller body.
- None of the villagers gives quests, so no board or marker, which keeps the gold "!" meaning one place to go. Whether they speak a line as you pass is [A living zone](12-a-living-zone.md)'s call.
- Budget, measured in the prototype: Hale 804 triangles, the innkeeper 688, the smith 628, the farmer 704; the thugs 676 to 708, the archer 900 and the leader 856. For comparison, a skeleton grunt is 1,028 to 1,048, a skeleton archer 1,092, the undead brute 676 and the Warden 1,300. Each is one draw call per eye.
- Glossary: `CONTEXT.md` gains **Villager**.
