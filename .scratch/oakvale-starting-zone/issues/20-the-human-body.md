# 20: The human body

**What to build:** Bandits, Marshal Hale and the villagers become people: one human body on today's rig, dressed per character. The farm's thugs now wear a red kerchief and sash instead of bone, Hale is the grey-haired captain in blue and gold with their old longsword at the hip, and the model inspector shows every human character through every animation.

**Spec:** Implementation Decisions › People: one human body, Enemies (bandits), Friendly characters (Hale). User stories 70, 71, 141 and 146.

**Blocked by:** 16 (The farm's camp), 18 (Marshal Hale and Raiders in the Fields).

**Status:** done

- [x] The human body comes from the people prototype (in history at commit `c987194`): one body on today's 14-bone rig, rigidly skinned, one draw call, the shared material and grain. It stands about 1.78 m and comes in four builds: average, stout, broad and big (about 1.97 m). It has a face (eyes with whites, brows, a nose, a mouth, ears), with the chin on the jaw bone. Hair, beards and clothes are parts laid over it.
- [x] The looks, as the spec lists them: Hale; the bandit thug (varied, a short iron sword or a hatchet), the bandit archer (green hood and cowl, quiver, bracers, today's bow) and the bandit leader (big, bald, black beard, long red coat, fur mantle, felling axe); the innkeeper, the smith and the farmer.
- [x] Making an enemy takes its family as well as its behaviour, level and camp: a bandit wears the human body, and the undead stay today's skeletons.
- [x] The farm's camp becomes bandit thugs.
- [x] Hale's stand-in becomes the real Hale: their old longsword sheathed at the left hip with the left hand on its pommel.
- [x] The villagers' characters exist and show in the inspector; they're placed in Oakvale in ticket 29.
- [x] The model inspector shows Hale, the villagers, the thug, the archer and the leader, each with every animation.
- [x] No names or levels show over any enemy's head, only the health bars as today.
- [x] Tests: every enemy animation poses on the human body in each build (as the inspector's clip tests do for the skeletons); each character stays under 900 triangles.
- [x] Screenshots from the inspector in headless Chromium, for the thread's reply.

## Built

Built on 2026-09-29 by Claude, in autonomous mode (Tom asked for the rest of Oakvale to run without his input).

- **The human body** (`src/models/human.ts`) comes from the people prototype. It is one body on today's 14-bone rig, rigidly skinned, one draw call, with the shared material and grain.
  - Four builds (`BUILDS`): average (about 1.78 m), stout, broad and big (about 1.97 m). Each has bone lengths, a thickness and a belly.
  - A face: eyes with whites, brows, a nose, a mouth and ears, with the chin on the jaw bone.
  - A `Look` sets the build, skin, hair and beard, and the shirt, sleeves, trousers, boots and belt. Clothes are parts laid over it: tabard, mail, pauldrons, aprons, kerchief, sash, hood, quiver, a sheathed sword, cuffs and rolled sleeves.
- **The bandits** (`src/models/bandits.ts`) all wear a red kerchief over the nose and mouth, knotted behind, and a red sash.
  - The thug has the grunt behaviour: a leather jerkin over a linen shirt, in six looks (three faces, each with a short iron sword or a hatchet, some with an iron shoulder guard).
  - The archer has the archer behaviour: the green hood and cowl, a quiver, bracers and today's bow (moved to `src/models/bow.ts`).
  - The leader has the brute behaviour in the big build: bald with a black beard, a long red coat over a dark red shirt, a shaggy fur mantle, a heavy belt with a gold buckle, and a felling axe in place of the maul.
- **Making an enemy takes its family** (`Family`: `undead` or `bandit`), through `createEnemy(kind, x, z, { family, … })`, a camp post's `family` and `buildCharacter(kind, { family, variant })`. The undead stay today's skeletons. The Warden is only ever undead: asking for a bandit one throws.
- **The farm's camp is bandit thugs.**
- **Marshal Hale** (`src/people/hale.ts`, dressed in `src/models/people.ts`) is the real Hale: bareheaded, cropped grey hair and clean-shaven, mail under a blue tabard with a gold mark, steel pauldrons, leather gloves and bracers, a belt with a gold buckle, and their old longsword (the gilded guard) sheathed at the left hip with the left hand on its pommel. Their stand and wave live in `src/people/poses.ts`, which the inspector shares.
- **The villagers** exist in `src/models/people.ts` (`PEOPLE`, `buildPerson`):
  - The innkeeper: stout, bald, a moustache, rolled sleeves, a russet waistcoat, a long white apron and a tankard.
  - The smith: broad, a short beard, a sleeveless dark shirt, a leather bib apron, thick gloves and a hammer.
  - The farmer: a straw hat, a linen shirt with braces, ochre trousers and a pitchfork.
- **The model inspector** (`?inspect`) lists the six thug looks, the bandit archer and the leader, Hale and the three villagers after the undead, each with every animation. Bandits play every clip their behaviour plays (the undead's, bar the rise). Hale stands and waves, and the villagers stand.
- **Nothing new over any enemy's head**: only the health bars, as today.
- **Triangles:** thugs 676 to 708, the archer 864, the leader 856, Hale 792, the innkeeper 688, the smith 628, the farmer 704.
- **Tests:**
  - `tests/humanBody.test.ts` (51): the body stands on its soles in every build, at about 1.78 m and 1.97 m. Every enemy animation (all four behaviours' clips) poses on it in each build, every bone in place and the feet where a skeleton grunt's go, scaled. Each dressed bandit plays its own clips the same way. Every human character is one body under 900 triangles, soles on the floor. Hale's left hand rests on their pommel.
  - `tests/bandits.test.ts` (11): a bandit has the human body's build, stands and can be hit from the start where the undead rise, and falls whole; a skeleton shatters; there's no bandit Warden.
  - Updated: the inspector's clips (bandits', the friendly characters' and Hale's wave), weapon edges (the thug's sword and hatchet and the leader's axe lead with the edge), and the enemy attack and guard tests (bandit thugs and the archer).
- **Checks:** `checks/people.mjs` in headless Chromium with the emulator. See its header for the list. Screenshots are in the project's files under `human-body/`. The adventure, farm camp, Hale, levels, saving, world and tunnel checks still pass.

Calls **taken on Tom's behalf**, to revisit:

- **Bandits don't rise from the ground.** They're standing at their posts when a camp fills, as a WoW respawn pops in (a camp only refills when you're 30 m or more away), and can be hit at once. The undead still claw their way up.
- **Bandits fall whole** where skeletons shatter (the undead brute already topples).
- **Hits and kills on a bandit** throw dark red instead of bone chips, and a kill thuds instead of rattling bones.
- **The bandit archer's bow** is today's bow with iron tips and a linen string, where the skeleton's are bone.
- **Six thug looks**: three faces and outfits, each with the sword or the hatchet, as the grunts vary.
- **The leader's sash is dark red**, wound over the coat above the heavy belt, so it shows against the red coat.
- **The archer's kerchief has no knot** at the back: the hood hides it, and leaving it off keeps the archer under 900 triangles.
- **The big build stands 1.97 m**, lengthened from the prototype's 1.91 m to meet the spec.
- **Hale's gold mark is on the tabard's back as well**, so they read from behind.
- **The villagers only stand for now.** Their work loops come with ticket 29.
- **The inspector shows each model's triangle count.**
- **Aim and draw are measured per body** (family and behaviour), since a bandit's arms aren't a skeleton's.

Left for later:

- The leader's reach: its slash and slam against a simulated player, and any retune, are ticket 21.
- The sword leaving Hale's hip is ticket 28.
- The villagers placed in Oakvale, at their work, are ticket 29.
