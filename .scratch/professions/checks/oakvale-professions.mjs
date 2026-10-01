// Oakvale with professions, in one sitting
// (issues/19-oakvale-with-professions-in-one-sitting.md): a new warrior played
// from `?newgame` through Marshal Hale's chain with both pairs of professions,
// in headless Chromium with the IWER emulator. Start `npx vite --port 5173`, then:
//
//   node .scratch/professions/checks/oakvale-professions.mjs [http://localhost:5173] [out/]
//
// With `out/`, it writes screenshots and `oakvale-professions.json` (the clock
// of every gather and make, the times to 25, the coins, and the budget's views).
//
// How it plays. As the inventory's whole-zone run does (inventory/checks/
// whole-zone.mjs, whose fighter this copies): the game paused and stepped from
// inside the page, with teleports between places, and every fight fought
// through the real combat, the script holding the grips where a player's hands
// would be. Nobody is healed by the script; a death is played through. On top
// of that, everything a profession asks of your hands goes through the same
// detection as on the headset, the grips moved a step at a time:
//
//   - the tool loop: the right fist glides into it behind the hip, stops, and
//     squeezes, which draws the pick or the knife;
//   - a vein: committed swings of the pick's head into the glint, along the
//     rock's normal at 3.9 m/s, until it breaks;
//   - a clump: a slice of the knife through its stems, sideways at 1.8 m/s;
//   - the anvil: stepping up (the hammer and tongs), the hammer's face pressed
//     onto the board's keys, great strikes (3 m/s) on the glowing marks, the
//     tongs carrying the blank from the fire to the anvil and into the bucket;
//   - the bench: stepping up (bare hands), herbs carried off the tray into the
//     mortar, the pestle and the spoon turned round, and stepping away;
//   - the talk boards (Accept, Hand in, Train and a Train list's rows) pressed
//     with the right fist, and the smith's wares traded with it.
//
// The clock is the game's own: every step the script runs. A teleport stands in
// for the walk between two places, and the game runs on for as long as that
// walk would take in a straight line at the run's speed (CONFIG.run.speed)
// before it, so spots and camps refill as they would. The walk into the mine is
// walked with the stick.
//
// The route: Raiders in the Fields; then both intro quests (the smith's Ore and
// Fire, the herbalist's Leaves for the Pot), each done and handed in; the rest
// of Hale's chain (the lumber camp, the watchtower, the mine and the Warden)
// with the spots along the way taken; then rounds of the zone's spots, back to
// the anvil and the bench each time, until all four professions stand at
// Apprentice 25. The recipes are bought off the Train lists as proficiency
// allows (the rage draught and the elixir, the gauntlets). It makes a pair of
// gauntlets of Strength and wears them, keeps a stack of healing potions and
// rage draughts, and sells the spare to the smith.
//
// It prints the time to 25 in each profession (from learning it), the coins
// earned by selling, the whole clock, and the draw calls, triangles and point
// lights from the village, the smithy (at the anvil), the herbalist's house (at
// the bench) and the mine's upper gallery, beside the budget: about 300 draw
// calls, at most 4 point lights; 72 fps is for the headset.
//
// Playwright is the global install; Chromium is the pre-installed one.

import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3];
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
// Wide enough that each eye is square in stereo (the emulator's framebuffer keeps the page's first size).
const context = await browser.newContext({ viewport: { width: 1600, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};
const note = (what) => console.log(`     ${what}`);
const xrFrames = (n) =>
  page.evaluate(
    (n) =>
      new Promise((done) => {
        const session = window.__descent.renderer.xr.getSession();
        let k = 0;
        const step = () => (++k >= n ? done() : session.requestAnimationFrame(step));
        session.requestAnimationFrame(step);
      }),
    n,
  );
/** XR frames until the World has built every chunk it wants (the page's frames keep the World going while paused). */
async function settled(max = 400) {
  for (let i = 0; i < max; i++) {
    if ((await page.evaluate(() => window.__descent.world.chunksPending)) === 0) return;
    await xrFrames(1);
  }
}
const shot = async (name) => {
  if (!out) return;
  await xrFrames(3);
  await page.screenshot({ path: `${out}/${name}.png` });
};

// The script's hands, installed in the page after each load: the whole-zone
// run's fighter (inventory/checks/whole-zone.mjs), with the clock added.
function install() {
  const d = window.__descent;
  const { adventure, player } = d;
  const { hands } = player.input;
  const V = player.rig.position.constructor;
  const BLADE = [-0.5, 0, 0, 0.866]; // the blade level, pointing ahead
  const GUARD = [-0.22, 1.3, -0.35]; // the shield up in front of your chest
  // The shield's board faces along its fist's -Z pitched down 45° (CONFIG.shield.pitchDeg): tip the fist up 45° to stand it upright.
  const UPRIGHT = [Math.sin(Math.PI / 8), 0, 0, Math.cos(Math.PI / 8)];
  const Q = player.rig.quaternion.constructor;
  const M = new player.rig.matrix.constructor();
  const tilt = new Q(...UPRIGHT);
  const _a = new V();
  const _b = new V();
  const DOWN = { left: [-0.35, 0.8, 0.1], right: [0.35, 0.8, 0.1] };
  d.clock ??= 0;
  /** A grip where the controller would put it (rig space), and the emulated controller with it, so an XR frame doesn't move it. */
  const hold = (hand, p, q = [0, 0, 0, 1]) => {
    const g = hands[hand].grip;
    g.position.set(...p);
    g.quaternion.set(...q);
    g.updateMatrix();
    const c = d.device.controllers[hand];
    c.position.set(...p);
    c.quaternion.set(...q);
  };
  /** Hold a world point in `hand`. */
  const holdAt = (hand, w, q) => {
    player.rig.updateMatrixWorld(true);
    hold(hand, player.rig.worldToLocal(new V(w.x, w.y, w.z)).toArray(), q);
  };
  /** Squeeze (1) or let go of (0) a grip: the emulated controller's squeeze, read at the next step. */
  const squeeze = (hand, v) => d.device.controllers[hand].setButtonValueImmediate('squeeze', v);
  /** One step of the game, on the clock. */
  const tick = (dt = 1 / 72) => {
    player.rig.updateMatrixWorld(true);
    adventure.update(dt);
    d.clock += dt;
  };
  const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const head = () => d.camera.getWorldPosition(new V());
  const down = () => {
    hold('left', DOWN.left);
    hold('right', DOWN.right);
  };
  /**
   * What a player does with the shield: put it between you and the blow that's
   * coming, facing it, and step back out of a slam's reach as it winds up.
   * Otherwise it's held up in front of your chest.
   */
  const dodged = new WeakMap();
  const defend = () => {
    const me = head();
    let threat = null;
    let best = Infinity;
    for (const e of adventure.gatherFoes()) {
      if (!e.alive || !e.attacking || !e.attack || e.attack.kind === 'summon') continue;
      const dist = flat(e.position, me);
      const reach = e.attack.kind === 'shot' ? 40 : 4;
      if (dist < reach && dist < best) {
        best = dist;
        threat = e;
      }
    }
    if (!threat) return hold('left', GUARD, UPRIGHT);
    const { attack } = threat;
    if (!attack.blockable && attack.kind === 'slam') {
      if (threat.phase === 'windup' && dodged.get(threat) !== attack && best < (attack.radius ?? 1.5) + 1.2) {
        dodged.set(threat, attack);
        const k = ((attack.radius ?? 1.5) + 1.4) / Math.max(best, 0.1);
        const x = threat.position.x + (me.x - threat.position.x) * k;
        const z = threat.position.z + (me.z - threat.position.z) * k;
        d.teleport(x, z, Math.atan2(-(threat.position.x - x), -(threat.position.z - z)));
      }
      return hold('left', GUARD, UPRIGHT);
    }
    if (attack.kind === 'shot') _a.copy(threat.position).setY(threat.position.y + 1.3);
    else {
      threat.weaponSegment(_a, _b);
      _a.lerp(_b, 0.7);
    }
    const chest = me.clone().setY(me.y - 0.3);
    const dir = _a.sub(chest).normalize();
    const at = chest.addScaledVector(dir, 0.42);
    player.rig.updateMatrixWorld(true);
    const local = player.rig.worldToLocal(at);
    local.y = Math.max(0.9, Math.min(local.y, 2.0));
    const face = dir.applyQuaternion(player.rig.quaternion.clone().invert());
    const look = new Q().setFromRotationMatrix(M.lookAt(new V(), face, new V(0, 1, 0))).multiply(tilt);
    hold('left', local.toArray(), look.toArray());
  };
  /** Stand `seconds`, hands down (or the shield up), stopping if you fall; `dt` coarser for a long walk's time. */
  const wait = (seconds, { guard = false, dt = 1 / 72 } = {}) => {
    const up = player.alive;
    for (let t = 0; t < seconds; t += dt) {
      if (guard) defend();
      else hold('left', DOWN.left);
      hold('right', DOWN.right);
      tick(dt);
      if (up && !player.alive) return { dead: true, t };
    }
    return { t: seconds };
  };
  /** Face (x, z) where you stand. */
  const face = (x, z) => {
    const h = head();
    d.teleport(h.x, h.z, Math.atan2(-(x - h.x), -(z - h.z)));
  };
  let side = 1;
  const tally = { swings: 0, landed: 0 };
  /**
   * Fight for up to `seconds` of game time: face the nearest enemy that's up
   * (within `near` m, and `pick`ed), step to about arm's reach, and swing
   * across it, forehand then backhand, the shield up. Stops when `done()`,
   * or when you fall.
   */
  const fight = ({ seconds = 5, near = 30, reach = 0.95, pick = () => true, done = () => false } = {}) => {
    for (let t = 0; t < seconds; ) {
      if (!player.alive) return { dead: true };
      if (done()) return { done: true };
      const me = head();
      // Hurt, with a healing orb lying near: step onto it, as a player would.
      const orb = adventure.orbs.root.children.find((o) => flat(o.position, me) < 10);
      if (orb && player.hp < player.maxHp * 0.8) {
        d.teleport(orb.position.x, orb.position.z, player.rig.rotation.y);
        tick();
        t += 1 / 72;
        continue;
      }
      const foes = adventure.gatherFoes().filter((e) => e.alive && e.hittable && pick(e) && flat(e.position, me) < near);
      if (!foes.length) {
        down();
        tick(0.1);
        t += 0.1;
        continue;
      }
      foes.sort((a, b) => flat(a.position, me) - flat(b.position, me));
      const e = foes[0];
      const dist = flat(e.position, me);
      if (e.attacking && e.attack?.kind === 'slam' && e.phase !== 'recover') {
        defend();
        tick();
        t += 1 / 72;
        continue;
      }
      let { x, z } = me;
      if (dist > reach + 0.15 || dist < reach - 0.4) {
        const k = reach / Math.max(dist, 1e-3);
        x = e.position.x + (me.x - e.position.x) * k;
        z = e.position.z + (me.z - e.position.z) * k;
      }
      d.teleport(x, z, Math.atan2(-(e.position.x - x), -(e.position.z - z)));
      const was = e.hp;
      const from = 0.45 * side;
      for (let i = 0; i <= 15; i++) {
        defend();
        hold('right', [from - (from * 2 * i) / 15, 1.25, -0.28], BLADE);
        tick();
      }
      for (let i = 0; i < 8; i++) {
        defend();
        tick();
      }
      t += 24 / 72;
      side = -side;
      tally.swings++;
      if (e.hp < was) tally.landed++;
    }
    return {};
  };
  /**
   * A fist onto a key of a talk board (`on`: Hale's `board`, the smith's
   * `vendorBoard`, the herbalist's `herbalistBoard`): the key for `button`, or a
   * Train list's row for `recipe`. In front of it, then onto its face, then back down.
   */
  const press = (button, hand = 'right', on = 'board', recipe = null) => {
    const board = adventure[on];
    const key = board.keys.find((k) => k.button === button && (!recipe || k.recipe?.startsWith(recipe)));
    if (!board.isOpen || !key) return false;
    const at = (o) => {
      board.root.updateMatrixWorld(true);
      return player.rig.worldToLocal(key.mesh.localToWorld(new V(0, 0, 0.02 + o))).toArray();
    };
    for (let i = 0; i < 8; i++) {
      hold(hand, at(0.15));
      tick();
    }
    for (let i = 0; i < 8; i++) {
      hold(hand, at(0));
      tick();
    }
    for (let i = 0; i < 8; i++) {
      hold(hand, at(0.15));
      tick();
    }
    down();
    tick();
    return true;
  };
  /** A hand-in's pick `i` taken off Hale's board into the bag's first empty slot, as a carry lets it go there. */
  const pick = (i) => {
    const { board } = adventure;
    if (!board.isOpen || !board.picks[i]) return null;
    const offered = board.picks.map((p) => p.id ?? p);
    const slot = adventure.state.inventory.bag.findIndex((b) => !b);
    return adventure.picks.take(i, { in: 'bag', slot }) === null ? { offered, slot } : null;
  };
  /** A fist onto a point in the world, then back down. */
  const touch = (p, hand = 'left') => {
    for (let i = 0; i < 8; i++) {
      holdAt(hand, p);
      tick();
    }
    down();
    tick();
  };
  /** Turn on the spot to `yaw`, without stopping a run. */
  const turn = (yaw) => {
    const h = head();
    player.rig.rotation.y = yaw;
    player.rig.updateMatrixWorld(true);
    const now = head();
    player.rig.position.x += h.x - now.x;
    player.rig.position.z += h.z - now.z;
  };
  /** Is `drop` where you are: out of doors while they're drawn, or in the interior you're in? */
  const here = (drop) => (drop.interior === null ? d.world.outdoorsShown : d.world.interior === drop.interior);
  /** The pieces lying here, and not flashing "Bag full": where each is. */
  const lyingHere = () =>
    adventure.drops.drops.filter(here).flatMap((drop) => drop.pieces.filter((p) => p.flash <= 0).map((p) => ({ at: drop.root.position.clone().add(p.mesh.position), coins: p.coins, item: p.item })));
  /** Walk over every piece of loot lying here, nearest first, as a player walks over a camp's drops. */
  const collect = () => {
    const was = adventure.state.inventory.coins;
    for (let n = 0; n < 60; n++) {
      const me = head();
      const left = lyingHere().sort((a, b) => flat(a.at, me) - flat(b.at, me));
      if (!left.length) break;
      const { at } = left[0];
      d.teleport(at.x, at.z, player.rig.rotation.y);
      for (let i = 0; i < 4; i++) {
        down();
        tick();
      }
      // Off it again, so the next piece is a new touch.
      d.teleport(at.x + 1.2, at.z, player.rig.rotation.y);
      tick();
    }
    const inv = adventure.state.inventory;
    return { gained: inv.coins - was, coins: inv.coins, left: lyingHere().length };
  };
  window.__play = { hold, holdAt, squeeze, tick, wait, face, fight, press, pick, touch, turn, down, head, collect, lyingHere, tally, DOWN };
}

// What a profession asks of your hands, in the page: the tool loop, the pick,
// the knife, the anvil's hammer and tongs and the bench's hands. Each moves the
// grips a step (1/72 s) at a time, as the fighter does, so every swing, strike,
// grab and turn goes through the game's own detection.
function installCraft() {
  const d = window.__descent;
  const { adventure, player, CONFIG } = d;
  const p = window.__play;
  const { hands } = player.input;
  const V = player.rig.position.constructor;
  const Q = player.rig.quaternion.constructor;
  const g = adventure.gathering;
  const A = adventure.anvil;
  const B = adventure.bench;
  const DT = 1 / 72;
  const REST = new V(0.3, 1.1, -0.3); // the right hand at rest, in front and to the right (rig space)
  const rigQ = () => player.rig.getWorldQuaternion(new Q());
  /**
   * Hold `hand` turned `q` (rig space) so that `lead` (a point in the grip's
   * own space: a tool's head, blade or face) lands at the world point `w`.
   */
  const put = (hand, lead, w, q = new Q()) => {
    player.rig.updateMatrixWorld(true);
    const r = player.rig.worldToLocal(new V(w.x, w.y, w.z)).sub(lead.clone().applyQuaternion(q));
    p.hold(hand, r.toArray(), q.toArray());
  };
  /** Where a world point is in `hand`'s grip's own space now, with the grip turned `q`. */
  const leadOf = (hand, world, q = new Q()) => {
    const grip = hands[hand].grip;
    p.hold(hand, grip.position.toArray(), q.toArray());
    player.rig.updateMatrixWorld(true);
    return grip.worldToLocal(world());
  };
  const vec = (v) => ({ x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) });

  // ─── Gathering ───

  /** A spot by id: its index, kind, place, and where you stand to work it, facing it. */
  const spot = (id) => {
    const i = g.spot(id);
    const s = g.spots[i];
    let stand = null;
    if (s.kind === 'copperVein') stand = { x: s.x + Math.sin(s.yaw) * 1.35, z: s.z + Math.cos(s.yaw) * 1.35 };
    else {
      for (let k = 0; k < 16 && !stand; k++) {
        const a = (k / 16) * Math.PI * 2;
        const at = new V(s.x + Math.sin(a) * 0.95, 0, s.z + Math.cos(a) * 0.95);
        if (!d.world.resolve(at, CONFIG.player.bodyRadius + 0.05)) stand = { x: at.x, z: at.z };
      }
    }
    return { i, id, kind: s.kind, x: s.x, z: s.z, interior: s.interior, stand, phase: g.states.phase(i) };
  };
  /** Glide the right fist from rest into the tool loop, stop, squeeze and let go there, and glide back. */
  const loopGrip = () => {
    const from = player.rig.localToWorld(REST.clone());
    for (let k = 0; k < 4; k++) {
      p.holdAt('right', from);
      p.hold('left', p.DOWN.left);
      p.tick();
    }
    const to = g.loopAt(new V());
    for (let k = 1; k <= 20; k++) {
      p.holdAt('right', from.clone().lerp(g.loopAt(new V()), k / 20));
      p.tick();
    }
    for (let k = 0; k < 4; k++) {
      p.holdAt('right', g.loopAt(to));
      p.tick();
    }
    p.squeeze('right', 1);
    for (let k = 0; k < 4; k++) {
      p.holdAt('right', g.loopAt(to));
      p.tick();
    }
    p.squeeze('right', 0);
    for (let k = 0; k < 4; k++) {
      p.holdAt('right', g.loopAt(to));
      p.tick();
    }
    for (let k = 1; k <= 20; k++) {
      p.holdAt('right', g.loopAt(to).lerp(player.rig.localToWorld(REST.clone()), k / 20));
      p.tick();
    }
    return g.drawn;
  };
  /** Draw `tool` from the loop (two tries); true once it's in your hand. */
  const draw = (tool) => {
    for (let n = 0; n < 2 && g.drawn !== tool; n++) {
      if (g.drawn) loopGrip(); // the other tool: back first
      loopGrip();
    }
    return g.drawn === tool;
  };
  /**
   * One swing of the pick into vein spot `i`'s glint: its leading point from
   * 0.6 m out along the rock's normal to 8 cm in, at `speed` m/s, and drawn
   * back out.
   */
  const swing = (i, speed = 3.9) => {
    const v = g.veins.veins.findIndex((x) => x.plan.id === g.spots[i].id);
    const vein = g.veins.veins[v];
    const at = g.veins.glint(v, new V());
    const n = at.clone().sub(vein.centre).normalize();
    const dir = n.clone().negate().applyQuaternion(rigQ().invert()).normalize();
    const q = new Q().setFromUnitVectors(new V(0, -1, 0), dir);
    const { reach, spike } = CONFIG.professions.pick;
    const lead = new V(0, -spike, -reach);
    const out = (k) => at.clone().addScaledVector(n, k);
    for (let k = 0; k < 30; k++) {
      put('right', lead, out(0.6), q);
      p.tick();
    }
    const step = speed * DT;
    for (let k = 0.6 - step; k > -0.08; k -= step) {
      put('right', lead, out(k), q);
      p.tick();
    }
    for (let k = 1; k <= 45; k++) {
      put('right', lead, out(-0.08 + (0.68 * k) / 45), q);
      p.tick();
    }
    for (let k = 0; k < 6; k++) {
      put('right', lead, out(0.6), q);
      p.tick();
    }
  };
  /** Break vein spot `i` with swings in the glint: how many it took. */
  const breakVein = (i) => {
    let swings = 0;
    while (g.states.phase(i) !== 'taken' && swings < 8) {
      swing(i);
      swings++;
    }
    return swings;
  };
  /**
   * One slice of the knife through clump spot `i`'s stems, 5 cm over its foot:
   * the blade pointing at it from where you stand, swept from 0.45 m one side
   * to 0.45 m the other at `speed` m/s, then up and back round slowly.
   */
  const slice = (i, speed = 1.8) => {
    const c = g.clumps.clumps.find((x) => x.plan.id === g.spots[i].id);
    const me = p.head();
    const fx = c.foot.x - me.x;
    const fz = c.foot.z - me.z;
    const n = Math.hypot(fx, fz);
    const along = new V(fx / n, -0.15, fz / n).applyQuaternion(rigQ().invert()).normalize();
    const q = new Q().setFromUnitVectors(new V(0, 0, -1), along);
    const lead = new V(0, 0, -(CONFIG.professions.knife.bladeStart + CONFIG.professions.knife.bladeEnd) / 2);
    const side = { x: -fz / n, z: fx / n };
    const at = (k, h = 0.05) => ({ x: c.foot.x + side.x * k, y: c.foot.y + h, z: c.foot.z + side.z * k });
    for (let k = 0; k < 30; k++) {
      put('right', lead, at(-0.45), q);
      p.tick();
    }
    const step = speed * DT;
    for (let k = -0.45 + step; k < 0.45; k += step) {
      put('right', lead, at(k), q);
      p.tick();
    }
    for (let k = 0; k < 6; k++) {
      put('right', lead, at(0.45, 0.6), q);
      p.tick();
    }
    for (let k = 1; k <= 40; k++) {
      put('right', lead, at(0.45 - 0.9 * (k / 40), 0.6), q);
      p.tick();
    }
  };
  /** Take clump spot `i` with slices through its stems: how many it took. */
  const cutClump = (i) => {
    let slices = 0;
    while (g.states.phase(i) !== 'taken' && slices < 4) {
      slice(i);
      slices++;
    }
    return slices;
  };

  // ─── The anvil ───

  const HAMMER_REST = { x: -0.2, y: 0.9, z: -0.7 };
  const TONGS_REST = { x: 0.1, y: 0.9, z: -0.7 };
  const ANVIL = { x: -0.35, y: 0.745, z: -0.2 };
  const FIRE = { x: -2.0, y: 1.02, z: -1.45 };
  const ON_ANVIL = { x: -0.35, y: 0.78, z: -0.2 };
  const BUCKET = { x: 0.45, y: 0.45, z: -0.5 };
  const inFrame = (l) => A.toWorld(l.x, l.y, l.z, new V());
  let faceLead = null;
  let jawLead = null;
  /** The hammer's face at `l` (the smithy's frame). */
  const face = (l) => put('right', faceLead, inFrame(l));
  /** The tongs' jaws at `l` (the smithy's frame). */
  const jaw = (l) => put('left', jawLead, inFrame(l));
  const glide = (fn, a, b, n = 20) => {
    for (let k = 1; k <= n; k++) {
      fn({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
      jaw(TONGS_REST);
      p.tick();
    }
  };
  /**
   * Step up to the anvil: in from 1.1 m in front of it until your hands are the
   * hammer and tongs, the smith stepping aside, then round to where they stood.
   */
  const stepUpAnvil = () => {
    const from = A.toWorld(ANVIL.x, 0, 0.9, new V());
    const to = A.at;
    d.teleport(from.x, from.z, Math.atan2(from.x - to.x, from.z - to.z));
    for (let k = 0; k < 72 && !player.holdingTools; k++) {
      p.down();
      p.tick();
    }
    if (!player.holdingTools) return false;
    p.wait(1.6); // the smith steps aside
    const { x, z, yaw } = A.stand;
    d.teleport(x, z, yaw);
    p.tick();
    faceLead = leadOf('right', () => A.hammerFace(new V()));
    jawLead = leadOf('left', () => A.jaw(new V()));
    for (let k = 0; k < 20; k++) {
      face(HAMMER_REST);
      jaw(TONGS_REST);
      p.tick();
    }
    return player.holdingTools;
  };
  /** Step back 2.4 m from the anvil: the sword and shield come back. */
  const stepAwayAnvil = () => {
    const from = A.toWorld(ANVIL.x, 0, 2.4, new V());
    const to = A.at;
    d.teleport(from.x, from.z, Math.atan2(from.x - to.x, from.z - to.z));
    p.wait(0.3);
    return !player.holdingTools;
  };
  /** The hammer's face onto the board's key for `id`, straight in from in front of it, and back to rest. */
  const pressKey = (id) => {
    const key = A.board.keys.find((k) => k.id === id);
    if (!key) return false;
    A.board.root.updateMatrixWorld(true);
    const local = (z) => A.frame.worldToLocal(key.mesh.localToWorld(new V(0, 0, z)));
    const at = local(0);
    const clear = local(0.3);
    glide(face, HAMMER_REST, clear);
    for (let k = 0; k < 3; k++) {
      face(clear);
      jaw(TONGS_REST);
      p.tick();
    }
    glide(face, clear, at, 6);
    for (let k = 0; k < 2; k++) {
      face(at);
      jaw(TONGS_REST);
      p.tick();
    }
    glide(face, at, clear, 6);
    glide(face, clear, HAMMER_REST);
    return true;
  };
  /** The face comes down from 0.25 m over the work at (x, z) from the anvil's middle at `speed` m/s, and lifts off. */
  const strike = (x, z, speed = 3) => {
    const top = ANVIL.y + (A.work.piece?.place === 'anvil' ? (A.view?.top ?? 0) : 0);
    const at = (y) => ({ x: ANVIL.x + x, y, z: ANVIL.z + z });
    for (let k = 0; k < 20; k++) {
      face(at(top + 0.25));
      jaw(TONGS_REST);
      p.tick();
    }
    for (let y = top + 0.25 - speed * DT; y > top - 0.03 - speed * DT; y -= speed * DT) {
      face(at(y));
      jaw(TONGS_REST);
      p.tick();
    }
    for (let k = 0; k < 4; k++) {
      face(at(top + 0.25));
      jaw(TONGS_REST);
      p.tick();
    }
  };
  /** Carry what lies at `from` with the tongs to `to` (the smithy's frame), and let go. */
  const carry = (from, to) => {
    const up = (l, h) => ({ ...l, y: l.y + h });
    const hold = (l, n, sq) => {
      if (sq !== undefined) p.squeeze('left', sq);
      for (let k = 0; k < n; k++) {
        jaw(l);
        face(HAMMER_REST);
        p.tick();
      }
    };
    const move = (a, b) => {
      for (let k = 1; k <= 25; k++) hold({ x: a.x + ((b.x - a.x) * k) / 25, y: a.y + ((b.y - a.y) * k) / 25, z: a.z + ((b.z - a.z) * k) / 25 }, 1);
    };
    move(TONGS_REST, up(from, 0.2));
    move(up(from, 0.2), from);
    hold(from, 4, 1);
    move(from, up(from, 0.25));
    move(up(from, 0.25), up(to, 0.25));
    move(up(to, 0.25), to);
    hold(to, 4, 0);
    move(to, up(to, 0.3));
    move(up(to, 0.3), TONGS_REST);
  };
  /** Wait at the anvil, hands at rest, until `until()` or `seconds` pass. */
  const idle = (seconds, until = () => false) => {
    for (let t = 0; t < seconds && !until(); t += DT) {
      face(HAMMER_REST);
      jaw(TONGS_REST);
      p.tick();
    }
    return until();
  };
  /**
   * Make one of `id` at the anvil, as its form asks: a bar smelts in the
   * crucible; a whetstone takes great strikes on its marks; the gauntlets heat
   * in the fire, go to the anvil in the tongs, take a great strike on each mark
   * and are quenched in the bucket. What it made, and how long it took.
   */
  const make = (id) => {
    const inv = adventure.state.inventory;
    const makes = CONFIG.professions.recipes[id].makes;
    const had = inv.count(makes);
    const t0 = d.clock;
    const row = A.rows().find((r) => r.id === id);
    if (!row?.ready) return { id, made: false, why: `not ready: ${row?.line ?? 'not on the board'}` };
    pressKey(id);
    if (!A.work.busy) return { id, made: false, why: `the board didn't take it: ${A.lines.slice(-2).join(', ')}` };
    const form = A.work.piece.form;
    if (form === 'whetstone') {
      for (let n = 0; n < 3 && A.work.piece && !A.work.shaped; n++) for (const m of A.work.piece.marks.filter((m) => !m.done)) strike(m.x, m.z);
    } else if (form === 'gauntlets') {
      idle(6, () => A.work.workable);
      carry(FIRE, ON_ANVIL);
      for (let n = 0; n < 3 && !A.work.shaped; n++) for (const m of A.work.piece.marks.filter((m) => !m.done)) strike(m.x, m.z);
      carry(ON_ANVIL, BUCKET);
    }
    idle(8, () => !A.work.busy && inv.count(makes) > had);
    idle(0.5);
    return { id, made: inv.count(makes) > had, seconds: d.clock - t0, why: A.work.busy ? `still at work: ${A.lines.slice(-3).join(', ')}` : '' };
  };

  // ─── The bench ───

  /** Stand in the house by the well at (lx, lz) in the bench's frame, facing its middle. */
  const atBench = (lx, lz) => {
    const at = B.point(lx, 0, lz);
    const to = B.point(0, 0, -0.3);
    d.world.settle('house');
    d.teleport(at.x, at.z, Math.atan2(-(to.x - at.x), -(to.z - at.z)));
  };
  const stepUpBench = () => {
    atBench(0, 0.5);
    for (let k = 0; k < 72 && !B.bare; k++) {
      p.down();
      p.tick();
    }
    p.wait(0.2);
    return B.bare;
  };
  const stepAwayBench = () => {
    atBench(0, 2.5);
    p.wait(1);
    return !B.bare;
  };
  /** Move `side`'s hand to `w` over `n` steps. */
  const hand = (side, w, n = 1) => {
    player.rig.updateMatrixWorld(true);
    const from = hands[side].grip.getWorldPosition(new V());
    for (let k = 1; k <= n; k++) {
      p.holdAt(side, from.clone().lerp(w, k / n));
      p.tick();
    }
  };
  const grip = (side, v) => {
    p.squeeze(side, v);
    p.tick();
    p.tick();
  };
  const up = (v, dy) => new V(v.x, v.y + dy, v.z);
  /** A herb of `id` off the tray with the left hand, and let go over the mortar. */
  const dropHerb = (id) => {
    const at = B.grabPoint(id);
    if (!at) return false;
    hand('left', up(at, 0.01), 36);
    grip('left', 1);
    hand('left', up(B.spots.mortar, 0.08), 36);
    grip('left', 0);
    p.wait(0.25);
    return true;
  };
  /** The held tool's tip round `centre`, `turns` times at radius `r`, a turn a second. */
  const circle = (tool, centre, turns, r) => {
    const tip = leadOf('right', () => B.tipOf(tool));
    for (let k = 0; k <= turns * 72; k++) {
      const a = (k / 72) * 2 * Math.PI;
      put('right', tip, { x: centre.x + Math.cos(a) * r, y: centre.y, z: centre.z + Math.sin(a) * r });
      p.tick();
    }
  };
  const takeTool = (tool) => {
    hand('right', B.grabPoint(tool), 36);
    grip('right', 1);
  };
  /** Brew what the herbs `herbs` (their ids) make: into the mortar, ground, tipped, stirred, poured. */
  const brew = (herbs) => {
    const alchemy = adventure.state.professions.proficiency('alchemy');
    const t0 = d.clock;
    for (const h of herbs) if (!dropHerb(h)) return { made: false, why: `no ${h} on the tray` };
    takeTool('pestle');
    const floor = B.spots.mortarFloor;
    circle('pestle', up(floor, 0.015), 3.2, 0.025);
    hand('right', up(floor, 0.35), 24);
    grip('right', 0);
    if (B.step !== 'tip') return { made: false, why: `the grind didn't take (${B.step}; mortar ${JSON.stringify(B.shown.mortar)}, tray ${JSON.stringify(B.shown.tray)}, stands ${JSON.stringify(B.shown.stands)}, bag ${herbs.map((h) => adventure.state.inventory.count(h)).join('/')})` };
    p.wait(1.4);
    takeTool('spoon');
    circle('spoon', B.spots.pot, 3.2, 0.05);
    hand('right', up(B.spots.pot, 0.4), 24);
    grip('right', 0);
    for (let t = 0; t < 4 && B.step !== 'load'; t += 0.1) p.wait(0.1);
    p.wait(0.5); // the spent herbs back on the tray, and shown as the bag holds
    return { made: adventure.state.professions.proficiency('alchemy') > alchemy || alchemy >= 25, seconds: d.clock - t0, step: B.step };
  };
  const freeStands = () => B.shown.stands.filter((s) => !s || s.potion === null).length;

  window.__craft = { spot, loopGrip, draw, swing, breakVein, slice, cutClump, stepUpAnvil, stepAwayAnvil, pressKey, strike, carry, make, stepUpBench, stepAwayBench, brew, freeStands, vec };
}

/** Load the Adventure (`query` added), enter VR and pause it, with the script's hands on. */
async function enter(query = '') {
  await page.goto(`${base}/?emulate&nodevui${query}`);
  // `?newgame` opens the new-character form: make the suggested warrior.
  if (query.includes('newgame')) {
    await page.waitForSelector('#new-character[open]', { timeout: 60000 });
    await page.click('#new-character button[value=make]');
  }
  await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  await page.evaluate(() => (window.__descent.paused = true));
  await page.evaluate(install);
  await page.evaluate(installCraft);
  await page.evaluate(() => window.__play.down());
  await xrFrames(2);
}

/** In the page: `window.__play` or `window.__craft`'s `fn`, with `args`. */
const play = (fn, ...args) => page.evaluate(([fn, args]) => window.__play[fn](...args), [fn, args]);
const craft = (fn, ...args) => page.evaluate(([fn, args]) => window.__craft[fn](...args), [fn, args]);

/** What a player would notice about themselves, their things and their professions. */
const look = () =>
  page.evaluate(() => {
    const { adventure, state, player, camera, world } = window.__descent;
    const h = camera.getWorldPosition(camera.position.clone());
    const inv = state.inventory;
    const pro = state.professions;
    return {
      x: h.x,
      z: h.z,
      clock: window.__descent.clock,
      hp: player.hp,
      maxHp: player.maxHp,
      alive: player.alive,
      level: state.level,
      xp: state.xp,
      marker: state.hale.marker,
      stages: Object.fromEntries(Object.entries(state.snapshot().quests).map(([k, q]) => [k, q.stage])),
      beaten: state.wardenBeaten,
      interior: world.interior,
      coins: inv.coins,
      bag: inv.bag.map((s) => (s ? `${s.id}×${s.count}` : null)),
      free: inv.bag.filter((s) => !s).length,
      gear: { ...inv.gear },
      belt: inv.belt.map((s) => (s ? `${s.id}×${s.count}` : null)),
      quest: [...inv.quest],
      fighting: adventure.camps.fighting,
      learned: [...pro.learned],
      recipes: [...pro.recipes],
      needs: Object.fromEntries(Object.entries(window.__descent.CONFIG.professions.recipes).map(([id, r]) => [id, r.needs])),
      pro: Object.fromEntries(['mining', 'smithing', 'herbalism', 'alchemy'].map((p) => [p, pro.has(p) ? pro.proficiency(p) : null])),
      count: Object.fromEntries(
        ['copper-ore', 'rough-stone', 'copper-bar', 'hearthleaf', 'duskcap', 'whetstone', 'minor-healing-potion', 'rage-draught', 'minor-mana-potion', 'elixir-of-the-keen-eye', 'copper-gauntlets-of-strength'].map((id) => [id, inv.count(id)]),
      ),
    };
  });
const stage = (name) => page.evaluate((name) => (window.__stage = name), name);

// ---------------------------------------------------------------- places, and getting about
const ZONE = await (async () => {
  await enter('&newgame');
  return page.evaluate(() => {
    const d = window.__descent;
    const z = d.world.zoneAt(0, 0);
    return {
      spawn: z.spawn,
      hale: z.hale,
      orders: z.pickups.find((p) => p.item === 'orders'),
      mouth: d.world.mine.mouth,
      run: d.CONFIG.run.speed,
      spots: d.adventure.gathering.spots.map((s) => ({ id: s.id, kind: s.kind, x: s.x, z: s.z, interior: s.interior })),
    };
  });
})();
const HALE = ZONE.hale;
const RUN = ZONE.run;

/**
 * Go to (x, z), facing (tx, tz): the game runs on for the walk there at the
 * run's speed in a straight line, from where you stand, then you're there.
 */
async function go(x, z, tx, tz, interior) {
  const me = await play('head');
  const walk = Math.hypot(x - me.x, z - me.z) / RUN;
  if (walk > 0.05) await play('wait', walk, { guard: true, dt: 1 / 24 });
  await page.evaluate(
    ([x, z, tx, tz, interior]) => {
      if (interior !== undefined) window.__descent.world.settle(interior);
      window.__descent.teleport(x, z, Math.atan2(-(tx - x), -(tz - z)));
    },
    [x, z, tx, tz, interior],
  );
  await play('wait', 0.2);
}
/** Out of any building or the mine, onto the open ground (the mine is left by its mouth). */
async function outside() {
  const s = await look();
  if (s.interior === null) return;
  if (s.interior === 'mine') await inMine(0, 3, 0, 9);
  await page.evaluate(() => window.__descent.world.settle(null));
  await play('wait', 0.2);
}
/** Stand at (lx, lz) in the mine mouth's frame (x across, z out of the hill), facing (tx, tz) in it. */
async function inMine(lx, lz, tx, tz) {
  await page.evaluate(
    ([m, lx, lz, tx, tz]) => {
      const c = Math.cos(m.yaw);
      const s = Math.sin(m.yaw);
      const w = (a, b) => [m.x + a * c + b * s, m.z - a * s + b * c];
      const [x, z] = w(lx, lz);
      const [X, Z] = w(tx, tz);
      window.__descent.teleport(x, z, Math.atan2(-(X - x), -(Z - z)));
      window.__play.tick();
    },
    [ZONE.mouth, lx, lz, tx, tz],
  );
}
/** The mine mouth's frame to the world. */
const mineW = (lx, lz) => {
  const m = ZONE.mouth;
  const c = Math.cos(m.yaw);
  const s = Math.sin(m.yaw);
  return { x: m.x + lx * c + lz * s, z: m.z - lx * s + lz * c };
};
/** Push the left stick (x, y) and let the emulator pass it on. */
async function stick(x, y) {
  await page.evaluate(([x, y]) => window.__descent.device.controllers.left.updateAxes('thumbstick', x, y), [x, y]);
  await xrFrames(2);
}
/** In through the mine's mouth with the left stick, if you're not in it. */
async function walkIn() {
  if ((await look()).interior === 'mine') return;
  const at = mineW(0, 9);
  const to = mineW(0, 0);
  await go(at.x, at.z, to.x, to.z);
  await inMine(0, 3, 0, -5);
  await stick(0, -1);
  await play('wait', 2.5);
  await stick(0, 0);
}

// ---------------------------------------------------------------- fighting (the whole-zone run's)
/** Fight in rounds until `done` (a function body run in the page), a death, or `rounds` run out. */
async function fightUntil(opts, rounds = 40) {
  for (let i = 0; i < rounds; i++) {
    const r = await page.evaluate((o) => {
      const fn = (src) => (src ? new Function(`return (${src})`)() : undefined);
      return window.__play.fight({ seconds: 5, near: o.near ?? 30, done: fn(o.done), pick: fn(o.pick) });
    }, opts);
    if (r.dead) return 'dead';
    if (r.done) return 'done';
  }
  return 'timeout';
}
let deaths = 0;
/** After a death: the fade, the dark, the wake. */
async function throughDeath() {
  deaths++;
  await play('wait', 4.7);
  await settled();
  await play('wait', 12);
}
/** Fight until `done`, and if you fall, wake, go `back` and carry on: what a player would do. */
async function battle(opts, back, rounds = 40, lives = 4) {
  let died = 0;
  for (;;) {
    const r = await fightUntil(opts, rounds);
    if (r !== 'dead') return { r, deaths: died };
    if (++died > lives) return { r, deaths: died };
    await throughDeath();
    await back();
  }
}
/** Stand 6 m from the nearest of camp `id` still up, facing it (the walk there on the clock). */
async function toCamp(id) {
  const at = await page.evaluate((id) => {
    const d = window.__descent;
    const me = window.__play.head();
    const up = d.camps.camps.find((c) => c.plan.id === id).members.filter((m) => m.enemy.alive).map((m) => m.enemy.position);
    if (!up.length) return null;
    up.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
    const e = up[0];
    const k = 6 / Math.max(Math.hypot(me.x - e.x, me.z - e.z), 1e-3);
    return { x: e.x + (me.x - e.x) * k, z: e.z + (me.z - e.z) * k, tx: e.x, tz: e.z };
  }, id);
  if (at) await go(at.x, at.z, at.tx, at.tz);
}
const inCamp = (id) => `(e) => window.__descent.camps.camps.find((c) => c.plan.id === ${JSON.stringify(id)}).members.some((m) => m.enemy === e)`;
const allDown = (id) => `() => window.__descent.camps.camps.find((c) => c.plan.id === ${JSON.stringify(id)}).members.every((m) => !m.enemy.alive)`;
const alive = (id) => page.evaluate((id) => window.__descent.camps.camps.find((c) => c.plan.id === id).members.filter((m) => m.enemy.alive).length, id);
/** Fight camp `id` until every one of it is down, walking back after a death; then anyone still on you. */
async function clearCamp(id) {
  await outside();
  await toCamp(id);
  let r = await battle({ done: allDown(id), pick: inCamp(id), near: 25 }, () => toCamp(id), 10);
  for (let i = 0; i < 4 && r.r === 'timeout'; i++) {
    await toCamp(id);
    r = await battle({ done: allDown(id), pick: inCamp(id), near: 25 }, () => toCamp(id), 10);
  }
  if (r.r === 'done') await battle({ done: '() => !window.__descent.camps.fighting', near: 25 }, () => toCamp(id), 10);
  return r;
}
/** Whatever fights you here, fought off (walking `back` after a death). */
async function fightOff(back) {
  if (!(await look()).fighting) return { r: 'done', deaths: 0 };
  return battle({ done: '() => !window.__descent.camps.fighting', near: 25 }, back, 10);
}
/** Walk over every drop here. */
const lootUp = async () => {
  await play('wait', 0.5);
  return play('collect');
};

// ---------------------------------------------------------------- the professions' log
const t0 = {}; // the clock when each profession was learned
const t25 = {}; // …and when it reached 25
const log = { gathered: [], made: [], bought: [], sold: [], skipped: [], refused: [] };
/** Note any profession that has just reached 25. */
async function mark() {
  const s = await look();
  for (const [p, v] of Object.entries(s.pro)) {
    if (v !== null && t0[p] === undefined) t0[p] = s.clock;
    if (v !== null && v >= 25 && t25[p] === undefined) {
      t25[p] = s.clock;
      note(`${p} reached Apprentice 25 at ${min(s.clock)} on the clock, ${min(s.clock - t0[p])} after learning it`);
    }
  }
  return s;
}
const min = (s) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;

/** Take spot `id`: go there (in through the mine's mouth for the gallery), fight off anything on you, draw the tool, work it. */
async function gather(id) {
  const s = await craft('spot', id);
  if (s.phase === 'taken') {
    log.skipped.push({ id, clock: (await look()).clock });
    return false;
  }
  if (s.interior === 'mine') await walkIn();
  else await outside();
  const back = async () => {
    if (s.interior === 'mine') await walkIn();
    await go(s.stand.x, s.stand.z, s.x, s.z);
  };
  await go(s.stand.x, s.stand.z, s.x, s.z);
  await play('wait', 0.5);
  const fought = await fightOff(back);
  if (fought.deaths) await back();
  const tool = s.kind === 'copperVein' ? 'pick' : 'knife';
  const before = await look();
  let tries = 0;
  for (let attempt = 0; attempt < 3 && (await craft('spot', id)).phase !== 'taken'; attempt++) {
    // A camp that notices you as you reach for the tool, or mid-swing, is fought off first.
    if (attempt > 0) {
      await fightOff(back);
      await back();
    }
    if (!(await craft('draw', tool))) continue;
    tries += await craft(tool === 'pick' ? 'breakVein' : 'cutClump', s.i);
  }
  if (!tries) note(`${id}: the loop didn't give the ${tool} (${JSON.stringify(await page.evaluate(() => window.__descent.adventure.gathering.lines.slice(-2)))})`);
  await play('wait', 1.2); // what it gave flies to the bag
  const after = await mark();
  const got = Object.entries(after.count).filter(([k, v]) => v > before.count[k]).map(([k, v]) => `${v - before.count[k]} ${k}`);
  const taken = (await craft('spot', id)).phase === 'taken';
  log.gathered.push({ id, kind: s.kind, tries, taken, got, clock: after.clock, fought: fought.r !== 'done' || before.fighting });
  if (!taken) note(`${id}: not taken after ${tries} ${tool === 'pick' ? 'swings' : 'slices'}`);
  return taken;
}

// ---------------------------------------------------------------- talking and trading
/** Stand `d` m in front of villager `id`, `turn` rad round from the way they face, looking at their head (the walk there on the clock). */
async function standBy(id, dist, turn = 0) {
  const at = await page.evaluate(
    ([id, dist, turn]) => {
      const v = window.__descent.adventure.villagers.get(id);
      const p = v.root.getWorldPosition(v.root.position.clone());
      const a = v.spot.yaw + turn;
      return { x: p.x + Math.sin(a) * dist, z: p.z + Math.cos(a) * dist, tx: p.x, tz: p.z };
    },
    [id, dist, turn],
  );
  await outside();
  await go(at.x, at.z, at.tx, at.tz, id === 'herbalist' ? 'house' : undefined);
  await page.evaluate(() => Object.assign(window.__descent.device.quaternion, { x: Math.sin(-0.1), y: 0, z: 0, w: Math.cos(-0.1) }));
  await xrFrames(2);
  await play('wait', 0.8);
}
/** Walk up to Hale and press `button` on their board, or carry a hand-in's first pick into the bag. */
async function atHale(button) {
  // A hand-in's pick goes into the bag: with it full, the junk and old gear go to the smith first.
  if (button === 'pick' && (await look()).free < 2) await sell(KEEP_ALL_BUT_GEAR, 'a full bag before a hand-in');
  await outside();
  const dx = ZONE.spawn.x - HALE.x;
  const dz = ZONE.spawn.z - HALE.z;
  const k = 1.9 / Math.hypot(dx, dz);
  await go(HALE.x + dx * 5 / 1.9 * k, HALE.z + dz * 5 / 1.9 * k, HALE.x, HALE.z);
  await go(HALE.x + dx * k, HALE.z + dz * k, HALE.x, HALE.z);
  await play('wait', 0.8);
  const r = button === 'pick' ? await play('pick', 0) : await play('press', button);
  await play('wait', 0.3);
  return r;
}
/** Press `button` (or a Train row for `recipe`) on the smith's or the herbalist's board. */
const pressOn = async (board, button, recipe = null) => {
  const r = await play('press', button, 'right', board, recipe);
  await play('wait', 0.4);
  return r;
};
const boardOf = (who) => (who === 'smith' ? 'vendorBoard' : 'herbalistBoard');
/** At trainer `who`'s board, buy each of `recipes` you can off their Train list. */
async function train(who, recipes) {
  const board = boardOf(who);
  await standBy(who, who === 'smith' ? 1.9 : 1.6, who === 'smith' ? 0.9 : 0);
  if (!(await page.evaluate((b) => window.__descent.adventure[b].isOpen, board))) return [];
  if (!(await pressOn(board, 'train'))) return [];
  const bought = [];
  for (const recipe of recipes) {
    const was = await look();
    await pressOn(board, 'lesson', recipe);
    const s = await look();
    if (s.recipes.length > was.recipes.length) {
      bought.push(recipe);
      log.bought.push({ recipe, coins: was.coins - s.coins, clock: s.clock, pro: s.pro });
    }
  }
  await pressOn(board, 'back');
  return bought;
}

// The wares board and the bag panel (the whole-zone run's): a slot's world point, carried with the right fist.
async function openWares() {
  // From straight in front of the smith the anvil is within reach and takes your hands once you know Smithing: come at them from the side, as the Train list's walk-up does.
  await standBy('smith', 1.9, 0.9);
  if (await page.evaluate(() => window.__descent.adventure.vendorBoard.isOpen)) await pressOn('vendorBoard', 'trade');
  await page.evaluate(() => {
    const x = window.__descent;
    const a = x.wares.root.getWorldPosition(x.wares.root.position.clone());
    const b = x.bag.panel.root.getWorldPosition(a.clone());
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const n = x.wares.root.localToWorld(a.clone().set(0, 0, 1)).sub(x.wares.root.getWorldPosition(a.clone())).setY(0).normalize();
    const ex = mid.x + n.x * 0.55;
    const ez = mid.z + n.z * 0.55;
    x.teleport(ex, ez, Math.atan2(ex - mid.x, ez - mid.z));
    Object.assign(x.device.quaternion, { x: Math.sin(-0.15), y: 0, z: 0, w: Math.cos(-0.15) });
  });
  await xrFrames(2);
  await play('wait', 0.3);
  return page.evaluate(() => window.__descent.wares.isOpen && window.__descent.bag.isOpen);
}
const wareAt = (i, off = 0.015) => page.evaluate(([i, off]) => (({ x, y, z }) => ({ x, y, z }))(window.__descent.wares.slotWorld(i, window.__descent.camera.position.clone(), off)), [i, off]);
const bagAt = (i, off = 0.015) =>
  page.evaluate(([i, off]) => (({ x, y, z }) => ({ x, y, z }))(window.__descent.bag.panel.slotWorld({ in: 'grid', i }, window.__descent.camera.position.clone(), off)), [i, off]);
const sellJunkAt = () => page.evaluate(() => (({ x, y, z }) => ({ x, y, z }))(window.__descent.wares.sellJunkWorld(window.__descent.camera.position.clone())));
const outFrom = (w, dist, which) =>
  page.evaluate(
    ([w, dist, which]) => {
      const { wares, bag } = window.__descent;
      const root = which === 'wares' ? wares.root : bag.panel.root;
      const o = root.getWorldPosition(root.position.clone());
      const n = root.localToWorld(root.position.clone().set(0, 0, 1)).sub(o);
      return { x: w.x + n.x * dist, y: w.y + n.y * dist, z: w.z + n.z * dist };
    },
    [w, dist, which],
  );
/** The right fist at a world point, then `frames` steps (XR frames between, which put the grip where its controller is). */
async function fistAt(w, frames = 1) {
  for (let i = 0; i < 3; i++) {
    await page.evaluate((w) => {
      const { player, device } = window.__descent;
      player.rig.updateMatrixWorld(true);
      const want = player.rig.worldToLocal(player.rig.position.clone().set(w.x, w.y, w.z));
      const g = player.input.hands.right.grip.position;
      const c = device.controllers.right.position;
      c.set(c.x + want.x - g.x, c.y + want.y - g.y, c.z + want.z - g.z);
    }, w);
    await xrFrames(2);
  }
  await page.evaluate((frames) => {
    for (let i = 0; i < frames; i++) window.__play.tick();
  }, frames);
}
async function gripRight(v) {
  await page.evaluate((v) => window.__descent.device.controllers.right.updateButtonValue('squeeze', v), v);
  await xrFrames(2);
  await page.evaluate(() => window.__play.tick());
}
/** Carry bag slot `i` onto the wares board and let go: sold. What was carried. */
async function sellSlot(i) {
  const from = await bagAt(i);
  const to = await wareAt(5);
  await fistAt(await outFrom(from, 0.1, 'bag'));
  await fistAt(from);
  await gripRight(1);
  const holding = await page.evaluate(() => window.__descent.bag.holding?.id ?? null);
  await fistAt(await outFrom(to, 0.05, 'wares'));
  await fistAt(to);
  await gripRight(0);
  await fistAt(await outFrom(to, 0.15, 'wares'));
  await play('wait', 0.2);
  return holding;
}
async function pressAt(w, which) {
  await fistAt(await outFrom(w, 0.1, which), 8);
  await fistAt(w, 6);
  await fistAt(await outFrom(w, 0.12, which), 4);
  await play('down');
}
/** Wear from the bag whatever beats what's worn (a better rarity, or the same and a higher item level). */
const wearUpgrades = () =>
  page.evaluate(async () => {
    const { itemOf } = await import('/src/items.ts');
    const { adventure, state } = window.__descent;
    const inv = state.inventory;
    const RANK = { grey: 0, white: 1, green: 2, blue: 3 };
    const better = (a, b) => !b || RANK[a.rarity] > RANK[b.rarity] || (RANK[a.rarity] === RANK[b.rarity] && a.level > b.level);
    const worn = [];
    for (let again = true; again; ) {
      again = false;
      for (let slot = 0; slot < inv.bag.length; slot++) {
        const s = inv.bag[slot];
        const item = s && itemOf(s.id);
        if (!item || item.kind !== 'gear') continue;
        const to = { in: 'gear', slot: item.slot };
        const now = inv.gear[item.slot] ? itemOf(inv.gear[item.slot]) : null;
        if (!better(item, now) || inv.check({ in: 'bag', slot }, to)) continue;
        adventure.applyThings(inv.move({ in: 'bag', slot }, to), adventure.player.rig.position);
        worn.push(item.name);
        again = true;
      }
    }
    window.__play.wait(0.1);
    return worn;
  });
/** The bag's slots holding what `keep(id, count, item)` says to sell. */
const toSell = (rule) =>
  page.evaluate(async (rule) => {
    const { itemOf } = await import('/src/items.ts');
    const keep = new Function(`return (${rule})`)();
    return window.__descent.state.inventory.bag.flatMap((s, i) => (s && !keep(s.id, s.count, itemOf(s.id)) ? [i] : []));
  }, rule);
/**
 * At the smith's wares: "Sell junk", then carry onto the board every stack in
 * the bag `rule` doesn't keep (a function body run in the page). What it sold,
 * and for how much.
 */
async function sell(rule, label) {
  if (!(await openWares())) {
    note(`${label}: the smith's wares didn't open`);
    return { coins: 0, sold: [] };
  }
  const was = await look();
  await pressAt(await sellJunkAt(), 'wares');
  await play('wait', 0.2);
  const junk = (await look()).coins - was.coins;
  const sold = [];
  for (const i of await toSell(rule)) {
    const bag = (await look()).bag;
    const held = await sellSlot(i);
    if (held) sold.push(bag[i]);
  }
  await play('down');
  const s = await look();
  log.sold.push({ label, junk, coins: s.coins - was.coins, sold, clock: s.clock });
  await standBy('smith', 4.5, 0.9);
  return { coins: s.coins - was.coins, junk, sold };
}
/** Between rounds, with the bag getting full: junk and gear you don't wear sold to the smith. */
const KEEP_ALL_BUT_GEAR = `(id, count, item) => item.kind !== 'gear' || id === 'hale-longsword'`;

// ---------------------------------------------------------------- the stations
/** The alchemy recipes you know that you'd brew now, in order: the herbs each takes. */
const BREWS = [
  ['elixir-of-the-keen-eye', ['hearthleaf', 'hearthleaf', 'duskcap']],
  ['rage-draught', ['duskcap', 'duskcap']],
  ['minor-healing-potion', ['hearthleaf', 'hearthleaf']],
];
/** How many of each potion you keep for yourself; the rest are sold. */
const KEEP = { 'minor-healing-potion': 10, 'rage-draught': 10, 'elixir-of-the-keen-eye': 1, whetstone: 1 };

/**
 * At the anvil, make everything the bag allows toward Smithing 25: bars from
 * every two ore, a whetstone from every rough stone, and the gauntlets of
 * Strength once they're known and there are four bars. Stops at 25, unless
 * `gauntlets` is asked for (the pair to wear).
 */
async function smith({ gauntlets = false, only = null } = {}) {
  await outside();
  if (!(await craft('stepUpAnvil'))) {
    note(`the anvil didn't take your hands (${JSON.stringify(await look().then((s) => s.fighting))})`);
    return [];
  }
  const made = [];
  for (let n = 0; n < 60; n++) {
    const s = await look();
    const capped = s.pro.smithing >= 25;
    let id = null;
    if (only) id = s.count[CONFIG_MATS[only]] >= NEED[only] && made.filter((m) => m === only).length < 1 ? only : null;
    else if ((gauntlets || !capped) && s.recipes.includes('copper-gauntlets-of-strength') && s.pro.smithing >= s.needs['copper-gauntlets-of-strength'] && s.count['copper-bar'] >= 4 && !(capped && s.count['copper-gauntlets-of-strength'] > 0)) id = 'copper-gauntlets-of-strength';
    else if (!capped && s.count['copper-ore'] >= 2) id = 'copper-bar';
    else if (!capped && s.count['rough-stone'] >= 1) id = 'whetstone';
    else if (gauntlets && s.count['copper-gauntlets-of-strength'] === 0 && s.count['copper-ore'] >= 2 && s.count['copper-bar'] < 4) id = 'copper-bar';
    if (!id) break;
    const r = await craft('make', id);
    if (!r.made) {
      log.refused.push({ at: 'anvil', ...r, clock: s.clock });
      note(`the anvil: ${id} not made (${r.why})`);
      break;
    }
    made.push(id);
    const after = await mark();
    log.made.push({ id, seconds: r.seconds, clock: after.clock, smithing: after.pro.smithing });
  }
  await craft('stepAwayAnvil');
  return made;
}
const CONFIG_MATS = { whetstone: 'rough-stone' };
const NEED = { whetstone: 1 };
/** At the bench, brew what the herbs allow toward Alchemy 25 (the rage draught first), three to a visit of the stands. */
async function alchemist({ only = null } = {}) {
  await outside();
  const made = [];
  for (let visit = 0; visit < 20; visit++) {
    if (!(await craft('stepUpBench'))) {
      note('the bench didn\'t take your hands');
      break;
    }
    let brewed = 0;
    while ((await craft('freeStands')) > 0) {
      const s = await look();
      if (s.pro.alchemy >= 25 && !only) break;
      const next = BREWS.find(([id, herbs]) => (!only || id === only) && s.recipes.includes(id) && !(id === 'elixir-of-the-keen-eye' && s.count[id] >= KEEP[id]) && herbs.every((h) => s.count[h] >= herbs.filter((x) => x === h).length) && s.pro.alchemy >= s.needs[id]);
      if (!next || (only && made.length >= 1)) break;
      const r = await craft('brew', next[1]);
      if (!r.made) {
        log.refused.push({ at: 'bench', id: next[0], ...r, clock: s.clock });
        note(`the bench: ${next[0]} not brewed (${r.why ?? r.step})`);
        break;
      }
      brewed++;
      made.push(next[0]);
      const after = await mark();
      log.made.push({ id: next[0], seconds: r.seconds, clock: after.clock, alchemy: after.pro.alchemy });
    }
    await craft('stepAwayBench');
    if (!brewed) break;
    await play('wait', 0.5);
  }
  await page.evaluate(() => window.__descent.world.settle(null));
  return made;
}

// ---------------------------------------------------------------- the budget (the whole-zone run's)
const BUDGET = { calls: 300, triangles: 600_000, lights: 4 }; // triangles: CONFIG.streaming.budget.frame
const measured = [];
/** The frame's draw calls, triangles and shader programs, both eyes, looking each way in `yaws`: the worst of them. */
async function measure(label, yaws) {
  await page.evaluate(() => {
    const dev = window.__descent.device;
    dev.stereoEnabled = true;
    dev.fovy = (96 * Math.PI) / 180;
  });
  const views = [];
  for (const yaw of yaws) {
    await page.evaluate((yaw) => {
      window.__play.turn(yaw);
      window.__play.tick(1 / 72);
    }, yaw);
    await settled();
    await xrFrames(4);
    views.push(
      await page.evaluate((yaw) => {
        const { renderer, world } = window.__descent;
        let lights = 0;
        window.__descent.player.rig.parent.traverse((o) => o.isPointLight && o.visible && lights++);
        const { calls, triangles } = renderer.info.render;
        return { yaw, calls, triangles, programs: renderer.info.programs.length, lights, chunks: { ...world.chunkCounts } };
      }, yaw),
    );
  }
  await page.evaluate(() => {
    const dev = window.__descent.device;
    dev.stereoEnabled = false;
    dev.fovy = Math.PI / 2;
  });
  await xrFrames(2);
  const worst = views.reduce((a, b) => (b.calls > a.calls ? b : a));
  const tris = Math.max(...views.map((v) => v.triangles));
  measured.push({ label, calls: worst.calls, triangles: tris, lights: Math.max(...views.map((v) => v.lights)), programs: worst.programs, views });
  note(`${label}: ${worst.calls} draw calls (the worst of ${views.length} headings), ${(tris / 1000).toFixed(1)}k triangles at most, ${worst.programs} programs, ${Math.max(...views.map((v) => v.lights))} point lights`);
  return measured.at(-1);
}
const around = (from = 0, n = 8) => Array.from({ length: n }, (_, i) => from + (i * 2 * Math.PI) / n);

// ================================================================ the motions alone (MOTIONS=1): a quick look at each
if (process.env.MOTIONS) {
  await page.evaluate(() => {
    const d = window.__descent;
    d.professions.learn();
    d.professions.fill({ 'copper-ore': 4, 'rough-stone': 1, hearthleaf: 3, duskcap: 2 });
  });
  await gather('smithy-east');
  await gather('hearthleaf-farm-wheat-west');
  note(JSON.stringify(log.gathered));
  note(JSON.stringify(await page.evaluate(() => window.__descent.adventure.gathering.lines.slice(-6))));
  note(JSON.stringify((await look()).pro));
  note(`smithed: ${(await smith()).join(', ')}`);
  note(JSON.stringify(await page.evaluate(() => window.__descent.adventure.anvil.lines.slice(-12))));
  note(`brewed: ${(await alchemist()).join(', ')}`);
  const s = await look();
  note(JSON.stringify({ pro: s.pro, count: s.count, clock: s.clock }));
  note(JSON.stringify(log));
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  await browser.close();
  process.exit(failed ? 1 : 0);
}

/** Buy off the Train lists whatever proficiency now allows and you don't know: the rage draught, the elixir, the gauntlets. */
async function lessons() {
  let s = await look();
  const herbs = [];
  if (s.pro.alchemy >= s.needs['rage-draught'] && !s.recipes.includes('rage-draught')) herbs.push('rage-draught');
  if (s.pro.alchemy >= s.needs['elixir-of-the-keen-eye'] && !s.recipes.includes('elixir-of-the-keen-eye')) herbs.push('elixir-of-the-keen-eye');
  if (herbs.length && s.coins >= 10) {
    const bought = await train('herbalist', herbs);
    note(`the herbalist's Train list: bought ${bought.join(', ') || 'nothing'} (Alchemy ${s.pro.alchemy}, ${(await look()).coins} coins left)`);
  }
  s = await look();
  if (s.pro.smithing >= s.needs['copper-gauntlets-of-strength'] && !s.recipes.includes('copper-gauntlets-of-strength') && s.coins >= 25) {
    const bought = await train('smith', ['copper-gauntlets']);
    note(`the smith's Train list: bought ${bought.join(', ') || 'nothing'} (Smithing ${s.pro.smithing}, ${(await look()).coins} coins left)`);
  }
}
/** Back in the village: sell what's in the way if the bag is getting full, make and brew, and buy what's now allowed. */
async function village(label) {
  let s = await look();
  if (s.free <= 6) {
    const r = await sell(KEEP_ALL_BUT_GEAR, `${label}: junk and old gear`);
    note(`${label}: the bag had ${s.free} free slots; sold junk and old gear for ${r.coins} coins`);
  }
  await lessons();
  const smithed = await smith();
  await lessons();
  const brewed = await alchemist();
  await lessons();
  s = await look();
  note(`${label}: made ${smithed.length} at the anvil (${summary(smithed)}), brewed ${brewed.length} (${summary(brewed)}); ${profs(s)}; ${s.free} bag slots free, ${s.coins} coins, ${min(s.clock)} on the clock`);
  return s;
}
const summary = (ids) => Object.entries(ids.reduce((m, id) => ({ ...m, [id]: (m[id] ?? 0) + 1 }), {})).map(([id, n]) => `${n} ${id}`).join(', ') || 'nothing';
const profs = (s) => Object.entries(s.pro).map(([p, v]) => `${p} ${v ?? '-'}`).join(', ');
/** Gather `ids` in order, noting what each round of them gave. */
async function gatherAll(ids) {
  let n = 0;
  for (const id of ids) if (await gather(id)) n++;
  return n;
}

// ================================================================ 1. a new warrior, and Raiders in the Fields
let s = await look();
check(s.level === 1 && s.learned.length === 0 && s.coins === 0, `a new warrior: level ${s.level}, no professions (${s.learned.length}), ${s.coins} coins`);
await stage('farm');
check(await atHale('accept'), '"Accept" Raiders in the Fields');
await go(46, 30, 60, 26);
let r = await clearCamp('farm');
s = await look();
check(r.r === 'done' && s.marker === 'ready', `the farm fought through the real combat (${r.deaths} deaths, ${Math.round(s.hp)}/${s.maxHp} health)`);
await lootUp();
await go(30, 20, HALE.x, HALE.z);
await play('wait', 12);
check(!!(await atHale('pick')), 'Raiders in the Fields handed in, its first pick into the bag');
s = await look();
check(s.level === 2 && s.stages.raiders === 'handedIn', `level ${s.level}`);
note(`worn from the bag: ${(await wearUpgrades()).join(', ') || 'nothing'}`);
await play('wait', 1);
check(await play('press', 'accept'), '"Accept" The Lumber Camp');

// ================================================================ 2. both trainers: Ore and Fire, and Leaves for the Pot
await stage('trainers');
await standBy('smith', 1.9, 0.9);
check(await pressOn('vendorBoard', 'accept'), 'at the smith, "Accept" Ore and Fire');
s = await mark();
check(s.learned.includes('mining') && s.learned.includes('smithing'), `Mining and Smithing learned (${s.learned.join(', ')}) at ${min(s.clock)}`);
await standBy('herbalist', 1.6, 0);
check(await pressOn('herbalistBoard', 'accept'), 'in the house by the well, "Accept" Leaves for the Pot');
s = await mark();
check(s.learned.length === 4, `Herbalism and Alchemy learned (${s.learned.join(', ')}) at ${min(s.clock)}`);
check(['ore-and-fire', 'leaves-for-the-pot', 'lumber'].every((q) => s.stages[q] === 'active'), `three quests under way: ${Object.entries(s.stages).filter(([, v]) => v === 'active').map(([k]) => k).join(', ')}`);

// Ore and Fire: the smithy's two veins, and a whetstone at the anvil.
await stage('ore and fire');
await gatherAll(['smithy-east', 'smithy-south']);
s = await look();
check(s.count['copper-ore'] === 6 && s.count['rough-stone'] === 2 && s.pro.mining === 2, `the smithy's two veins broken with the pick: ${s.count['copper-ore']} ore, ${s.count['rough-stone']} rough stone, Mining ${s.pro.mining}`);
let made = await smith();
s = await look();
check(made.includes('whetstone') && s.stages['ore-and-fire'] === 'ready', `at the anvil: ${summary(made)}; Ore and Fire ready (${s.stages['ore-and-fire']}), Smithing ${s.pro.smithing}`);
await standBy('smith', 1.9, 0.9);
let was = s;
check(await pressOn('vendorBoard', 'handIn'), 'at the smith, "Hand in"');
s = await look();
check(s.stages['ore-and-fire'] === 'handedIn' && s.coins === was.coins + 5 && s.xp > was.xp, `Ore and Fire handed in: +${s.xp - was.xp} XP, +${s.coins - was.coins} coins`);
await pressOn('vendorBoard', 'goodbye');

// Leaves for the Pot: the farm's Hearthleaf, and a potion at the bench.
await stage('leaves for the pot');
await gatherAll(['hearthleaf-farm-wheat-west', 'hearthleaf-farm-wheat-north', 'hearthleaf-farm-cabbages']);
s = await look();
check(s.pro.herbalism >= 2 && s.count.hearthleaf >= 4, `the farm's Hearthleaf cut with the knife: ${s.count.hearthleaf} Hearthleaf, Herbalism ${s.pro.herbalism}`);
made = await alchemist();
s = await look();
check(made.includes('minor-healing-potion') && s.stages['leaves-for-the-pot'] === 'ready', `at the bench: ${summary(made)}; Leaves for the Pot ready (${s.stages['leaves-for-the-pot']}), Alchemy ${s.pro.alchemy}`);
await standBy('herbalist', 1.6, 0);
was = s;
check(await pressOn('herbalistBoard', 'handIn'), 'at the herbalist, "Hand in"');
s = await look();
check(s.stages['leaves-for-the-pot'] === 'handedIn' && s.coins === was.coins + 5, `Leaves for the Pot handed in: +${s.xp - was.xp} XP, +${s.coins - was.coins} coins`);
await outside();
await lessons();

// ================================================================ 3. The Lumber Camp, with the woods' Duskcap and the bridge's Hearthleaf
await stage('lumber camp');
await gatherAll(['hearthleaf-bridge', 'duskcap-west-woods-south', 'duskcap-west-woods-north']);
r = await clearCamp('lumberCamp');
check(r.r === 'done' && (await alive('lumberCamp')) === 0, `the lumber camp fought (${r.deaths} deaths)`);
await lootUp();
r = await clearCamp('patrol');
check(r.r === 'done', `the camp road's patrol fought (${r.deaths} deaths)`);
await lootUp();
await gatherAll(['duskcap-lumber-camp-west', 'duskcap-lumber-camp-north']);
await page.evaluate(async (o) => {
  const { TENT } = await import('/src/maps/forest/layout.ts');
  const outside = TENT.hd + 0.35 - TENT.orders.z;
  window.__descent.teleport(o.x + outside * Math.sin(o.yaw), o.z + outside * Math.cos(o.yaw), o.yaw + Math.PI);
  window.__play.wait(0.2);
  window.__play.touch({ x: o.x, y: o.y + 0.035, z: o.z }, 'left');
  window.__play.wait(0.2);
}, ZONE.orders);
s = await look();
check(s.quest.includes('leaders-orders') && s.marker === 'ready', `the orders taken with the left fist (${s.quest.join(', ')})`);
check(!!(await atHale('pick')), 'The Lumber Camp handed in');
s = await look();
check(s.level >= 3, `level ${s.level} (the intro quests' XP on top of Hale's)`);
note(`worn from the bag: ${(await wearUpgrades()).join(', ') || 'nothing'}`);
await play('wait', 1);
check(await play('press', 'accept'), '"Accept" What Lies Below');
s = await village('after The Lumber Camp');

// ================================================================ 4. the watchtower, and the old mine
await stage('watchtower');
r = await clearCamp('watchtower');
check(r.r === 'done', `the watchtower's three fought (${r.deaths} deaths)`);
await lootUp();
await gatherAll(['watchtower', 'mine-ridge-east', 'mine-ridge-west']);
await stage('mine');
await walkIn();
check((await look()).interior === 'mine', 'in through the mouth with the left stick');
const mine = inCamp('mine');
const downIn = (n) => `() => window.__descent.camps.camps.find((c) => c.plan.id === "mine").members.filter((m) => !m.enemy.alive).length >= ${n}`;
for (const [lx, lz, tx, tz, n, name] of [
  [-6, -8, -12, -11.5, 3, 'the cart hall'],
  [-15, -26, -15, -31, 5, 'the gallery'],
]) {
  await walkIn();
  await inMine(lx, lz, tx, tz);
  r = await battle({ done: downIn(n), pick: mine, near: 14 }, async () => {
    await walkIn();
    await inMine(lx, lz, tx, tz);
  });
  check(r.r === 'done', `${name} fought (${r.deaths} deaths)`);
  await walkIn();
  await lootUp();
}
await gatherAll(['mine-gallery-1', 'mine-gallery-2', 'duskcap-mine-gallery-1', 'duskcap-mine-gallery-2']);
s = await look();
note(`the gallery's veins and Duskcap: ${profs(s)}`);
for (const [lx, lz, tx, tz, n] of [
  [2, -48, 4, -53, 6],
  [22, -30, 22, -34, 7],
]) {
  await play('wait', 4);
  await walkIn();
  await inMine(lx, lz, tx, tz);
  r = await battle({ done: downIn(n), pick: mine, near: 14 }, async () => {
    await walkIn();
    await inMine(lx, lz, tx, tz);
  });
  check(r.r === 'done', `the ${n === 6 ? "dig's" : "antechamber's"} brute fought (${r.deaths} deaths)`);
  await lootUp();
}
await stage('warden');
for (let tries = 0; tries < 6 && !(await look()).beaten; tries++) {
  await play('wait', 4);
  await walkIn();
  await inMine(22, -40, 22, -52);
  if ((await fightUntil({ done: '() => window.__descent.state.wardenBeaten', near: 16 }, 60)) === 'dead') await throughDeath();
}
s = await look();
check(s.beaten, 'the Warden beaten through the real combat');
await lootUp();
await outside();
check(!!(await atHale('pick')), 'What Lies Below handed in');
s = await look();
check(s.level === 5 && s.bag.some((b) => b?.startsWith('hale-longsword')), `level ${s.level}, Hale's longsword in the bag`);
note(`worn from the bag: ${(await wearUpgrades()).join(', ') || 'nothing'}`);
const chainDone = s.clock;
note(`Hale's chain done at ${min(chainDone)} on the clock: ${profs(s)}`);
s = await village('after the chain');

// ================================================================ 5. rounds of the zone's spots, until all four are at 25
const ROUND = [
  'smithy-east',
  'smithy-south',
  'hearthleaf-farm-wheat-west',
  'hearthleaf-farm-wheat-north',
  'hearthleaf-farm-cabbages',
  'hearthleaf-road-south',
  'standing-stones',
  'hearthleaf-standing-stones-meadow',
  'hearthleaf-pond-east',
  'hearthleaf-pond-west',
  'duskcap-west-woods-north',
  'duskcap-west-woods-south',
  'hearthleaf-bridge',
  'duskcap-lumber-camp-west',
  'duskcap-lumber-camp-north',
  'mine-ridge-west',
  'mine-ridge-east',
  'mine-gallery-1',
  'mine-gallery-2',
  'duskcap-mine-gallery-1',
  'duskcap-mine-gallery-2',
  'watchtower',
];
check(ROUND.length === ZONE.spots.length && ZONE.spots.every((sp) => ROUND.includes(sp.id)), `a round takes in every one of the zone's ${ZONE.spots.length} spots`);
const rounds = [];
for (let round = 1; round <= 8; round++) {
  s = await look();
  const needs = { copperVein: s.pro.mining < 25 || s.pro.smithing < 25, hearthleaf: s.pro.herbalism < 25 || s.pro.alchemy < 25, duskcap: s.pro.herbalism < 25 || s.pro.alchemy < 25 };
  if (!Object.values(needs).some(Boolean)) break;
  await stage(`round ${round}`);
  const start = s;
  const ids = ROUND.filter((id) => needs[ZONE.spots.find((sp) => sp.id === id).kind]);
  // A kind of spot is left alone once both professions it feeds are at 25.
  let taken = 0;
  for (const id of ids) {
    const now = await look();
    const kind = ZONE.spots.find((sp) => sp.id === id).kind;
    if (kind === 'copperVein' ? now.pro.mining >= 25 && now.pro.smithing >= 25 : now.pro.herbalism >= 25 && now.pro.alchemy >= 25) continue;
    if (await gather(id)) taken++;
  }
  s = await village(`round ${round}`);
  rounds.push({ round, taken, of: ids.length, from: start.clock, to: s.clock, pro: s.pro });
  note(`round ${round}: ${taken} of ${ids.length} spots taken in ${min(s.clock - start.clock)}`);
}
s = await look();
check(Object.values(s.pro).every((v) => v === 25), `all four at Apprentice 25: ${profs(s)}`);

// ================================================================ 6. the gauntlets and a stack of potions, and the spare sold
await stage('the gauntlets');
if (!s.count['copper-gauntlets-of-strength'] && !s.gear.hands?.startsWith('copper-gauntlets')) {
  if (s.count['copper-bar'] < 4 && s.count['copper-ore'] < 8 - 2 * s.count['copper-bar']) await gatherAll(['smithy-east', 'smithy-south', 'standing-stones']);
  await smith({ gauntlets: true });
}
s = await look();
const worn = await wearUpgrades();
s = await look();
check(s.gear.hands === 'copper-gauntlets-of-strength', `a pair of copper gauntlets of Strength made and worn (hands: ${s.gear.hands}; worn ${worn.join(', ') || 'nothing'})`);
const potions = s.count['minor-healing-potion'] + s.count['rage-draught'];
check(s.count['minor-healing-potion'] >= 5 && s.count['rage-draught'] >= 5, `a stack of potions: ${s.count['minor-healing-potion']} minor healing potions and ${s.count['rage-draught']} rage draughts in the bag (${potions}), and on the belt ${s.belt.filter(Boolean).join(', ')}`);
note(`the bag before selling: ${s.bag.filter(Boolean).join(', ')}`);
await stage('selling');
const KEEP_SPARE = `(() => {
  const keep = ${JSON.stringify(KEEP)};
  const kept = {};
  return (id, count, item) => {
    if (item.kind === 'gear' || item.kind === 'material') return false;
    if (item.kind !== 'consumable') return true;
    kept[id] = (kept[id] ?? 0) + count;
    return kept[id] <= (keep[id] ?? 0);
  };
})()`;
was = await look();
const spare = await sell(KEEP_SPARE, 'the spare');
s = await look();
const soldValue = await page.evaluate(async (sold) => {
  const { itemOf, sellPrice } = await import('/src/items.ts');
  const byKind = {};
  for (const stack of sold) {
    const [id, n] = stack.split('×');
    const item = itemOf(id);
    const from = /copper-ore|rough-stone|copper-bar|hearthleaf|duskcap|whetstone|draught|potion|elixir|gauntlets/.test(id) ? 'professions' : 'loot';
    byKind[from] = (byKind[from] ?? 0) + sellPrice(item) * Number(n);
  }
  return byKind;
}, spare.sold);
check(spare.coins > 0 && s.coins === was.coins + spare.coins, `the spare sold to the smith for ${spare.coins} coins (${spare.junk} of it junk): ${spare.sold.join(', ')}`);
note(`of which from what professions gathered and made: ${soldValue.professions ?? 0} coins; loot ${soldValue.loot ?? 0}`);
s = await look();
check(s.count['minor-healing-potion'] >= 5 && s.count['rage-draught'] >= 5, `kept: ${s.bag.filter(Boolean).join(', ')}`);

// ================================================================ 7. the budget, in four places
await stage('budget');
// The village, at the crossroads, looking round.
await outside();
await go(ZONE.spawn.x, ZONE.spawn.z, HALE.x, HALE.z);
await play('wait', 0.5);
await shot('01-the-village');
await measure('the village, at the crossroads', around(0, 8));
// The smithy, at the anvil with the hammer and tongs, its board open.
await craft('stepUpAnvil');
await shot('02-the-smithy');
const facing = await page.evaluate(() => window.__descent.player.rig.rotation.y);
await measure('the smithy, at the anvil with the hammer and tongs', [facing, facing - 0.6, facing + 0.6, facing - 1.2, facing + 1.2, facing + Math.PI]);
await craft('stepAwayAnvil');
// The herbalist's house, at the bench with bare hands, the herbalist at its end.
await craft('stepUpBench');
await shot('03-the-bench');
const benchFacing = await page.evaluate(() => window.__descent.player.rig.rotation.y);
await measure("the herbalist's house, at the bench", [benchFacing, benchFacing - 0.6, benchFacing + 0.6, benchFacing - 1.2, benchFacing + 1.2, benchFacing + Math.PI]);
await craft('stepAwayBench');
await outside();
// The mine's upper gallery, between its veins and Duskcap.
await walkIn();
await inMine(-15, -24, -18.3, -24.5);
await fightOff(async () => {
  await walkIn();
  await inMine(-15, -24, -18.3, -24.5);
});
await inMine(-15, -24, -18.3, -24.5);
await play('wait', 0.5);
await shot('04-the-gallery');
await measure("the mine's upper gallery, its veins and Duskcap round you", around(0, 8));
await outside();

// ================================================================ what the run recorded
s = await look();
for (const m of measured) {
  check(m.calls <= BUDGET.calls && m.lights <= BUDGET.lights, `${m.label}: ${m.calls} draw calls (about ${BUDGET.calls}), ${m.lights} point lights (at most ${BUDGET.lights})`);
  note(`${(m.triangles / 1000).toFixed(1)}k triangles, ${m.triangles <= BUDGET.triangles ? 'within' : 'over'} the budget of 600k`);
}
for (const p of ['mining', 'smithing', 'herbalism', 'alchemy']) {
  check(t25[p] !== undefined, `${p}: learned at ${min(t0[p])}, Apprentice 25 at ${t25[p] !== undefined ? min(t25[p]) : 'never'}: ${t25[p] !== undefined ? min(t25[p] - t0[p]) : '-'} to 25`);
}
const tally = await page.evaluate(() => ({ ...window.__play.tally }));
const taken = log.gathered.filter((g) => g.taken);
note(`spots taken: ${taken.filter((g) => g.kind === 'copperVein').length} veins, ${taken.filter((g) => g.kind === 'hearthleaf').length} Hearthleaf, ${taken.filter((g) => g.kind === 'duskcap').length} Duskcap; ${log.skipped.length} found still taken`);
note(`made: ${summary(log.made.map((m) => m.id))}`);
note(`bought: ${log.bought.map((b) => `${b.recipe} for ${b.coins}`).join(', ')}`);
note(`the pick's swings a vein: ${[...new Set(taken.filter((g) => g.kind === 'copperVein').map((g) => g.tries))].join(', ')}; the knife's slices a clump: ${[...new Set(taken.filter((g) => g.kind !== 'copperVein').map((g) => g.tries))].join(', ')}`);
const allSold = await page.evaluate(async (stacks) => {
  const { itemOf, sellPrice } = await import('/src/items.ts');
  const worth = { professions: 0, loot: 0 };
  for (const stack of stacks) {
    const [id, n] = stack.split('×');
    worth[/copper-ore|rough-stone|copper-bar|hearthleaf|duskcap|whetstone|draught|potion|elixir|copper-gauntlets/.test(id) ? 'professions' : 'loot'] += sellPrice(itemOf(id)) * Number(n);
  }
  return worth;
}, log.sold.flatMap((x) => x.sold));
note(`coins from selling: the spare ${spare.coins} at the end; over the whole run ${allSold.professions} for what professions gathered and made (spare gauntlets included) and ${allSold.loot + log.sold.reduce((n, x) => n + x.junk, 0)} for loot (junk and old gear); ${s.coins} in the purse at the end`);
note(`the clock: Hale's chain done at ${min(chainDone)}, the whole run ${min(s.clock)}; ${deaths} deaths; ${tally.landed} of ${tally.swings} swings landed`);
if (out) writeFileSync(`${out}/oakvale-professions.json`, JSON.stringify({ t0, t25, rounds, log, measured, deaths, chainDone, clock: s.clock }, null, 1));

// ================================================================ the prototypes still run
for (const proto of ['pick', 'anvil', 'brew']) {
  const before = errors.length;
  await page.goto(`${base}/?proto=${proto}&emulate&nodevui`);
  await page.waitForFunction(() => window.__descent, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  check(errors.length === before, `?proto=${proto} still runs (${errors.slice(before).join('; ') || 'no errors'})`);
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
