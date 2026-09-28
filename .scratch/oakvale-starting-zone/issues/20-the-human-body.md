# 20: The human body

**What to build:** Bandits, Marshal Hale and the villagers become people: one human body on today's rig, dressed per character. The farm's thugs now wear a red kerchief and sash instead of bone, Hale is the grey-haired captain in blue and gold with their old longsword at the hip, and the model inspector shows every human character through every animation.

**Spec:** Implementation Decisions › People: one human body, Enemies (bandits), Friendly characters (Hale). User stories 70, 71, 141 and 146.

**Blocked by:** 16 (The farm's camp), 18 (Marshal Hale and Raiders in the Fields).

**Status:** ready-for-agent

- [ ] The human body comes from the people prototype (in history at commit `c987194`): one body on today's 14-bone rig, rigidly skinned, one draw call, the shared material and grain. It stands about 1.78 m and comes in four builds: average, stout, broad and big (about 1.97 m). It has a face (eyes with whites, brows, a nose, a mouth, ears), with the chin on the jaw bone. Hair, beards and clothes are parts laid over it.
- [ ] The looks, as the spec lists them: Hale; the bandit thug (varied, a short iron sword or a hatchet), the bandit archer (green hood and cowl, quiver, bracers, today's bow) and the bandit leader (big, bald, black beard, long red coat, fur mantle, felling axe); the innkeeper, the smith and the farmer.
- [ ] Making an enemy takes its family as well as its behaviour, level and camp: a bandit wears the human body, and the undead stay today's skeletons.
- [ ] The farm's camp becomes bandit thugs.
- [ ] Hale's stand-in becomes the real Hale: their old longsword sheathed at the left hip with the left hand on its pommel.
- [ ] The villagers' characters exist and show in the inspector; they're placed in Oakvale in ticket 29.
- [ ] The model inspector shows Hale, the villagers, the thug, the archer and the leader, each with every animation.
- [ ] No names or levels show over any enemy's head, only the health bars as today.
- [ ] Tests: every enemy animation poses on the human body in each build (as the inspector's clip tests do for the skeletons); each character stays under 900 triangles.
- [ ] Screenshots from the inspector in headless Chromium, for the thread's reply.
