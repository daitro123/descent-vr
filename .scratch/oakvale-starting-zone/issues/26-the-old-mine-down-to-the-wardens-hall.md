# 26: The old mine: down to the Warden's hall

**What to build:** The rest of the descent. From the gallery the bandits' rough ramp winds down to their dig, where the silver vein glints and their gear lies dropped. A breach in the dig's far wall opens onto dressed stone: a carved passage slopes down to the antechamber, and through its gate is the Warden's hall, today's crypt hall with its throne, pillars and torches. The throne is empty for now.

**Spec:** Implementation Decisions › The mine (the route's last four parts, light, budget). User stories 92, 93, 104 and 105.

**Blocked by:** 25 (The old mine: the mouth to the gallery).

**Status:** ready-for-agent

- [ ] The bandits' ramp: their rougher, sparsely timbered tunnel, winding down about 4 m. The dig: a rough cave about 12 × 10 m, the silver vein glinting in the rock, the bandits' dropped gear (picks, a strongbox of ore, a lantern on its side, a torn cloak) and no bodies. The breach: a hole through dressed stone in the dig's far wall, onto a carved passage sloping down about 3 m to the antechamber, about 8 m square, with the hall's gate in its far wall.
- [ ] The Warden's hall is today's crypt hall, 14 m square and 4 m high, with the throne on the north wall, four torch-lit pillars and the corner braziers. You come in by its south gate; the east and west gates are choked with fallen stone. _(Taken on Tom's behalf: the hall is built by the same code as the arena's, so the two stay alike.)_
- [ ] The whole route is one line with no forks, about 100 m from the mouth to the hall and about 7 m down over two ramps of about 1 in 5, with no stairs or ladders. The fallen rock at the gallery's end from ticket 25 is gone.
- [ ] Light: a few bandit lanterns down the ramp, the fallen lantern in the dig, two braziers in the antechamber and the hall's four pillar torches, with the deep workings darkest. The pool keeps to the 4 nearest.
- [ ] Only the part you're in and its neighbours are drawn, all the way down. The whole mine is merged to 6 to 8 draw calls.
- [ ] The route's centre line runs unbroken from the mouth to the hall's gate through every chamber.
- [ ] Tests: the no-pockets flood fill passes over every part for every body radius; the centre line is continuous and stays inside the walkable floor; no floor is steeper than 1 in 5.
- [ ] Checked in headless Chromium: screenshots down the route and in the hall, for the thread's reply.
- [ ] Every new number is in the game's table of tunables.
