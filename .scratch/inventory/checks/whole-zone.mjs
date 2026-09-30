// Oakvale with the inventory, in one sitting (issues/17-oakvale-with-the-inventory-in-one-sitting.md):
// a new warrior played from `?newgame` through every camp, the three chests and
// Hale's three hand-ins, then to the smith, the innkeeper and the stash, in
// headless Chromium with the IWER emulator, recording coins, drops and draw
// calls as it goes. Start `npx vite --port 5173`, then:
//
//   node .scratch/inventory/checks/whole-zone.mjs [http://localhost:5173] [out/]
//
// With `out/`, it writes screenshots and `whole-zone.json` (the coins by stage,
// every drop, and the budget's views) there.
//
// How it plays. As the Oakvale play-through does (oakvale-starting-zone/checks/
// play-through.mjs, whose fighter this copies): the game paused and stepped
// 1/72 s at a time from inside the page, with teleports between places, and
// every fight fought through the real combat, the script holding the grips
// where a player's hands would be, the sword swung across the nearest enemy
// and the shield held towards the blow that's coming. Nobody is healed by the
// script; a death is played through (you wake and walk back). Loot is taken
// by walking over it, as a player walks over a camp's drops; chests' lids,
// the orders, the boards' buttons and the stash's lid are touched with a
// fist; the belt's flask, the vendors' wares and the stash's slots are
// carried with the grip squeezed (the emulated controller's squeeze). The
// hand-ins' picks go into the bag as the play-through takes them (the fist's
// carry off Hale's board is hand-in-picks.mjs's), and are worn from it, as is
// any loot that beats what you wear.
//
// What it checks, in order:
//  1. A new warrior: the starting kit worn, three potions on the right hip,
//     0 coins, an empty bag.
//  2. Raiders in the Fields: the farm's four bandits fought, their loot taken;
//     the hand-in's pick worn.
//  3. The Lumber Camp: its five fought, and a potion drunk from the belt mid
//     fight (health up 40% of the maximum while the camp still fights you);
//     the patrol's two fought; the orders taken; the leader's tent's chest
//     opened and emptied; the hand-in's pick worn.
//  4. The watchtower's three fought, and its chest on the hilltop opened and
//     emptied.
//  5. What Lies Below: the cart hall and gallery fought and looted; the dig's
//     brute, the strongbox, the antechamber's brute and the Warden, their
//     drops left lying; then at the dig, with the bag panel open, the budget:
//     draw calls, triangles and point lights, both eyes, the worst of several
//     headings. Then every drop in the mine taken.
//  6. The last hand-in: Hale's longsword picked and worn at level 5.
//  7. The coins before spending: every coin that dropped was taken, and the
//     route's expected coins (the role table's average for every kill, and
//     the chests') land in the spec's 300 to 400. The run's own total is
//     recorded beside it.
//  8. The smith: their wares board and the bag panel open; the budget again;
//     "Sell junk" sells every grey; a white piece for an empty slot bought
//     off the board and worn.
//  9. The innkeeper: a minor healing potion bought.
// 10. The stash: the plain sword carried into it; a reload; the stash still
//     holds it, and it's carried back into the bag.
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

// The script's hands, installed in the page after each load: the play-through's
// fighter, with the inventory's reaches added.
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
  const holdAt = (hand, w) => {
    player.rig.updateMatrixWorld(true);
    hold(hand, player.rig.worldToLocal(new V(w.x, w.y, w.z)).toArray());
  };
  /** Squeeze (1) or let go of (0) a grip: the emulated controller's squeeze, read at the next step. */
  const squeeze = (hand, v) => d.device.controllers[hand].setButtonValueImmediate('squeeze', v);
  const tick = (dt = 1 / 72) => {
    player.rig.updateMatrixWorld(true);
    adventure.update(dt);
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
  /** Stand `seconds`, hands down (or the shield up), stopping if you fall. */
  const wait = (seconds, { guard = false } = {}) => {
    const up = player.alive;
    for (let t = 0; t < seconds; t += 1 / 72) {
      if (guard) defend();
      else hold('left', DOWN.left);
      hold('right', DOWN.right);
      tick();
      if (up && !player.alive) return { dead: true, t };
    }
    return { t: seconds };
  };
  /**
   * A drink from the right hip, as a player takes one mid-fight: the right
   * fist to the hip, the grip squeezed, the flask held at the mouth until it's
   * drunk (the shield kept up the while), and the grip let go.
   */
  const drink = () => {
    const { belt } = adventure;
    const was = { hp: player.hp, max: player.maxHp, drunk: belt.log.drunk, fighting: adventure.camps.fighting, count: adventure.state.inventory.belt[1]?.count ?? 0 };
    for (let i = 0; i < 4; i++) {
      defend();
      const hip = belt.slotWorld(1, new V());
      holdAt('right', { x: hip.x, y: hip.y + 0.05, z: hip.z });
      tick();
    }
    squeeze('right', 1);
    for (let i = 0; i < 2; i++) {
      defend();
      tick();
    }
    const took = belt.holding('right') === 1;
    // What the drink healed, read off the heal itself: a blow landing the same step would hide it in your health.
    const heal = player.heal;
    let healed = 0;
    player.heal = function (n) {
      const was = this.hp;
      const r = heal.call(this, n);
      healed += this.hp - was;
      return r;
    };
    let t = 0;
    let hp = was.hp;
    let fighting = was.fighting;
    for (; took && t < 2 && belt.log.drunk === was.drunk && player.alive; t += 1 / 72) {
      defend();
      // Where the fist must be for the flask in it (held just ahead of the grip) to sit at the mouth.
      const m = belt.mouth(new V());
      const grip = hands.right.grip;
      const off = grip.localToWorld(new V(0, 0.01, -0.03)).sub(grip.getWorldPosition(new V()));
      holdAt('right', m.sub(off));
      hp = player.hp;
      fighting = adventure.camps.fighting;
      tick();
    }
    const drunk = belt.log.drunk > was.drunk;
    player.heal = heal;
    squeeze('right', 0);
    for (let i = 0; i < 4; i++) {
      defend();
      hold('right', DOWN.right);
      tick();
    }
    return { took, drunk, t, before: hp, rose: hp + healed, now: player.hp, max: player.maxHp, fighting, was, belt: adventure.state.inventory.belt[1]?.count ?? 0, cooldown: adventure.state.inventory.cooldown };
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
   * when `thirsty()` (a drink is due), or when you fall.
   */
  const fight = ({ seconds = 5, near = 30, reach = 0.95, pick = () => true, done = () => false, thirsty = () => false } = {}) => {
    for (let t = 0; t < seconds; ) {
      if (!player.alive) return { dead: true };
      if (done()) return { done: true };
      if (thirsty()) return { thirsty: true };
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
  /** A fist onto a button of Hale's board (or `on`, another talk board): in front of it, then onto its face, then back down. */
  const press = (button, hand = 'right', on = 'board') => {
    const board = adventure[on];
    const key = board.keys.find((k) => k.button === button);
    if (!board.isOpen || !key) return false;
    const at = (o) => {
      board.root.updateMatrixWorld(true);
      return player.rig.worldToLocal(key.mesh.localToWorld(new V(0, 0, 0.02 + o))).toArray();
    };
    for (let i = 0; i < 8; i++) {
      hold(hand, at(0.15));
      tick();
    }
    const was = `${board.isOpen} ${JSON.stringify(adventure.state.hale)}`;
    for (let i = 0; i < 8; i++) {
      hold(hand, at(0));
      tick();
    }
    down();
    return `${board.isOpen} ${JSON.stringify(adventure.state.hale)}` !== was;
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
    const was = { coins: adventure.state.inventory.coins, bag: adventure.state.inventory.bag.map((s) => (s ? `${s.id}×${s.count}` : null)) };
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
    return { gained: inv.coins - was.coins, coins: inv.coins, left: lyingHere().length, full: adventure.drops.pieces.filter((p) => p.flashing).length };
  };
  // Every drop, with the stage it fell in; what each orb picked up heals.
  const loot = [];
  const dropLoot = adventure.drops.drop.bind(adventure.drops);
  adventure.drops.drop = (at, l, interior) => {
    loot.push({ stage: window.__stage ?? '', coins: l.coins, items: [...l.items], interior });
    dropLoot(at, l, interior);
  };
  window.__play = { hold, holdAt, squeeze, tick, wait, face, fight, press, pick, touch, turn, down, head, drink, collect, lyingHere, tally, loot };
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
  await page.evaluate(() => window.__play.down());
  await xrFrames(2);
}
/** Every drop so far, kept across reloads. */
const lootLog = [];
async function reload() {
  lootLog.push(...(await page.evaluate(() => window.__play.loot)));
  await page.evaluate(async () => {
    window.__descent.adventure.saves.onLeaving();
    await window.__descent.saved();
  });
  await enter();
}
const allLoot = async () => [...lootLog, ...(await page.evaluate(() => window.__play.loot))];
const stage = (name) => page.evaluate((name) => (window.__stage = name), name);

/** What a player would notice about themselves and their things. */
const look = () =>
  page.evaluate(() => {
    const { adventure, state, player, camera, world } = window.__descent;
    const h = camera.getWorldPosition(camera.position.clone());
    const inv = state.inventory;
    return {
      x: h.x,
      z: h.z,
      hp: player.hp,
      maxHp: player.maxHp,
      alive: player.alive,
      level: state.level,
      xp: state.xp,
      damage: player.stats.damage,
      inHand: player.sword.sword,
      marker: state.hale.marker,
      tracker: state.tracker.length ? [state.tracker.at(-1).title, ...state.tracker.at(-1).lines] : null,
      beaten: state.wardenBeaten,
      atHip: adventure.hale.swordAtHip,
      interior: world.interior,
      coins: inv.coins,
      bag: inv.bag.map((s) => (s ? `${s.id}×${s.count}` : null)),
      gear: { ...inv.gear },
      belt: inv.belt.map((s) => (s ? `${s.id}×${s.count}` : null)),
      quest: [...inv.quest],
      stash: inv.stash.map((s) => (s ? `${s.id}×${s.count}` : null)),
      chests: [...inv.chests],
      fighting: adventure.camps.fighting,
    };
  });
/** A camp's members: alive, and minds. */
const camp = (id) =>
  page.evaluate((id) => window.__descent.camps.camps.find((c) => c.plan.id === id).members.map((m) => ({ alive: m.enemy.alive, mind: m.mind })), id);
const alive = async (id) => (await camp(id)).filter((m) => m.alive).length;

/** An item's catalogue entry, from the dev server's source (the game's own module). */
const items = async (ids) => page.evaluate(async (ids) => {
  const { itemOf } = await import('/src/items.ts');
  return ids.map((id) => {
    const i = itemOf(id);
    return i ? { id, name: i.name, kind: i.kind, rarity: i.rarity, level: i.level, slot: i.slot ?? null } : { id };
  });
}, ids);
const named = async (ids) => (await items(ids)).map((i) => `${i.name} (${i.rarity}, ${i.level})`).join(', ');

/**
 * Wear from the bag whatever beats what's worn, as a player sorting their bag
 * would: a gear piece you can wear, for an empty slot or of a better rarity
 * (or the same rarity and a higher item level). Returns what was put on.
 */
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

const ZONE = await (async () => {
  await enter('&newgame');
  return page.evaluate(() => {
    const z = window.__descent.world.zoneAt(0, 0);
    return { spawn: z.spawn, hale: z.hale, respawns: z.respawns, orders: z.pickups.find((p) => p.item === 'orders'), mouth: window.__descent.world.mine.mouth, chests: z.chests };
  });
})();
const HALE = ZONE.hale;
/** Stand `d` m from Hale on the line to the start, facing them. */
async function byHale(d) {
  const dx = ZONE.spawn.x - HALE.x;
  const dz = ZONE.spawn.z - HALE.z;
  const k = d / Math.hypot(dx, dz);
  await page.evaluate(([x, z, h]) => window.__descent.teleport(x, z, Math.atan2(-(h.x - x), -(h.z - z))), [HALE.x + dx * k, HALE.z + dz * k, HALE]);
  await page.evaluate(() => window.__play.wait(0.8));
}
/** Walk up to Hale and press `button` on the board. */
async function talk(button) {
  await byHale(5);
  await byHale(1.9);
  const pressed = await page.evaluate((b) => window.__play.press(b), button);
  await page.evaluate(() => window.__play.wait(0.3));
  return pressed;
}
/** Walk up to Hale and carry pick `i` of the hand-in off their board into the bag. */
async function handIn(i = 0) {
  await byHale(5);
  await byHale(1.9);
  const taken = await page.evaluate((i) => window.__play.pick(i), i);
  await page.evaluate(() => window.__play.wait(0.3));
  return taken;
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
/** Push the left stick (x, y) and let the emulator pass it on. */
async function stick(x, y) {
  await page.evaluate(([x, y]) => window.__descent.device.controllers.left.updateAxes('thumbstick', x, y), [x, y]);
  await xrFrames(2);
}
/** In through the mine's mouth with the left stick, if you're not in it. */
async function walkIn() {
  if ((await look()).interior === 'mine') return;
  await inMine(0, 9, 0, 0);
  await page.evaluate(() => window.__play.wait(0.5));
  await inMine(0, 3, 0, -5);
  await stick(0, -1);
  await page.evaluate(() => window.__play.wait(2.5));
  await stick(0, 0);
}
/** Fight in rounds until `done` (a function body run in the page), a drink is due, a death, or `rounds` run out. */
async function fightUntil(opts, rounds = 40) {
  for (let i = 0; i < rounds; i++) {
    const r = await page.evaluate((o) => {
      const fn = (src) => (src ? new Function(`return (${src})`)() : undefined);
      return window.__play.fight({ seconds: 5, near: o.near ?? 30, done: fn(o.done), pick: fn(o.pick), thirsty: fn(o.thirsty) });
    }, opts);
    if (r.dead) return 'dead';
    if (r.done) return 'done';
    if (r.thirsty) return 'thirsty';
  }
  return 'timeout';
}
/** After a death: the fade, the dark, the wake. */
async function throughDeath() {
  await page.evaluate(() => window.__play.wait(4.7));
  await settled();
}
/** Fight until `done`, and if you fall, wake, go `back` and carry on: what a player would do. */
async function battle(opts, back, rounds = 40, lives = 4) {
  let deaths = 0;
  for (;;) {
    const r = await fightUntil(opts, rounds);
    if (r !== 'dead') return { r, deaths };
    if (++deaths > lives) return { r, deaths };
    await throughDeath();
    await page.evaluate(() => window.__play.wait(12));
    await back();
  }
}
/** Stand 6 m from the nearest of camp `id` still up, facing it, out of doors. */
async function toCamp(id) {
  await page.evaluate((id) => {
    const d = window.__descent;
    const me = window.__play.head();
    const up = d.camps.camps.find((c) => c.plan.id === id).members.filter((m) => m.enemy.alive).map((m) => m.enemy.position);
    if (!up.length) return;
    up.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
    const e = up[0];
    const k = 6 / Math.max(Math.hypot(me.x - e.x, me.z - e.z), 1e-3);
    const x = e.x + (me.x - e.x) * k;
    const z = e.z + (me.z - e.z) * k;
    d.teleport(x, z, Math.atan2(-(e.x - x), -(e.z - z)));
    window.__play.wait(0.2);
  }, id);
}
const inCamp = (id) => `(e) => window.__descent.camps.camps.find((c) => c.plan.id === ${JSON.stringify(id)}).members.some((m) => m.enemy === e)`;
const allDown = (id) => `() => window.__descent.camps.camps.find((c) => c.plan.id === ${JSON.stringify(id)}).members.every((m) => !m.enemy.alive)`;
/** Fight camp `id` until every one of it is down (the camp's pull brings them in), walking back after a death. */
async function clearCamp(id, extra = {}) {
  await toCamp(id);
  let r = await battle({ done: allDown(id), pick: inCamp(id), near: 25, ...extra }, () => toCamp(id), 10);
  // One left standing at its post out of reach (it never noticed): walk over to it, as a player would.
  for (let i = 0; i < 4 && r.r === 'timeout'; i++) {
    note(`${id}: walking over to the one left standing: ${JSON.stringify(await upIn(id))}`);
    await toCamp(id);
    const again = await battle({ done: allDown(id), pick: inCamp(id), near: 25, ...extra }, () => toCamp(id), 10);
    r = { r: again.r, deaths: r.deaths + again.deaths };
  }
  // Anyone still fighting you (a neighbour come to help) fought off too.
  if (r.r === 'done') await battle({ done: '() => !window.__descent.camps.fighting', near: 25 }, () => toCamp(id), 10);
  else note(`${id} not cleared (${r.r}): ${JSON.stringify(await upIn(id))}`);
  return r;
}
/** Who of camp `id` is still up: where, how hurt, in what mind, and how far from you. */
async function upIn(id) {
  return page.evaluate((id) => {
    const me = window.__play.head();
    return window.__descent.camps.camps
      .find((c) => c.plan.id === id)
      .members.filter((m) => m.enemy.alive)
      .map((m) => ({ role: m.plan.role, mind: m.mind, hp: `${Math.round(m.enemy.hp)}/${m.enemy.maxHp}`, at: [m.enemy.position.x, m.enemy.position.y, m.enemy.position.z].map((v) => +v.toFixed(1)), post: [m.post.x, m.post.z].map((v) => +v.toFixed(1)), away: +Math.hypot(m.enemy.position.x - me.x, m.enemy.position.z - me.z).toFixed(1), hittable: m.enemy.hittable, evading: m.enemy.evading, state: m.enemy.state }));
  }, id);
}

// ---------------------------------------------------------------- coins and drops, by stage
const ledger = [];
/** Walk over every drop here, and note what the stage paid. */
async function lootUp(label) {
  await page.evaluate(() => window.__play.wait(0.5));
  const r = await page.evaluate(() => window.__play.collect());
  const before = ledger.at(-1)?.coins ?? 0;
  ledger.push({ stage: label, gained: r.coins - before, coins: r.coins });
  note(`${label}: +${r.coins - before} coins, ${r.coins} in the purse${r.left ? `, ${r.left} pieces left lying` : ''}${r.full ? `, ${r.full} flashing "Bag full"` : ''}`);
  return r;
}

// ---------------------------------------------------------------- the budget
const BUDGET = { calls: 300, triangles: 300_000, lights: 4 };
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
        const { renderer, world, adventure, bag } = window.__descent;
        let lights = 0;
        window.__descent.player.rig.parent.traverse((o) => o.isPointLight && o.visible && lights++);
        let beams = 0;
        adventure.drops.root.traverse((o) => o.visible && o.renderOrder === 5 && beams++);
        const { calls, triangles } = renderer.info.render;
        return { yaw, calls, triangles, programs: renderer.info.programs.length, lights, bag: bag.isOpen, beams, lying: adventure.drops.lying, chunks: { ...world.chunkCounts } };
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
  note(`${label}: ${worst.calls} draw calls (the worst of ${views.length} headings), ${(tris / 1000).toFixed(1)}k triangles at most, ${worst.programs} programs, ${worst.lights} point lights; the bag ${worst.bag ? 'open' : 'SHUT'}, ${worst.lying} drops lying, ${worst.beams} beams drawn`);
  return measured.at(-1);
}
const around = (from = 0, n = 8) => Array.from({ length: n }, (_, i) => from + (i * 2 * Math.PI) / n);

/** A slow reach over the right shoulder and a squeeze: the bag swings round in front of you. */
async function openBag() {
  return page.evaluate(() => {
    const d = window.__descent;
    const p = window.__play;
    const z = d.bag.reach.centre.right;
    for (let i = 0; i < 22; i++) {
      p.holdAt('right', z);
      p.tick();
    }
    p.squeeze('right', 1);
    for (let i = 0; i < 8; i++) {
      p.holdAt('right', z);
      p.tick();
    }
    p.holdAt('right', { x: z.x, y: z.y - 0.6, z: z.z - 0.3 });
    p.tick();
    p.squeeze('right', 0);
    p.wait(0.1);
    return d.bag.isOpen;
  });
}

// ---------------------------------------------------------------- the boards: wares, and the stash
/** A world point, as a plain object. */
const vec = (p) => ({ x: p.x, y: p.y, z: p.z });
/** Stand `d` m in front of villager `id`, looking at their head. */
async function standBy(id, d) {
  await page.evaluate(
    ([id, d]) => {
      const x = window.__descent;
      const v = x.adventure.villagers.get(id);
      const p = v.root.getWorldPosition(v.root.position.clone());
      const ex = p.x + Math.sin(v.spot.yaw) * d;
      const ez = p.z + Math.cos(v.spot.yaw) * d;
      x.teleport(ex, ez, Math.atan2(ex - p.x, ez - p.z));
      Object.assign(x.device.quaternion, { x: Math.sin(-0.1), y: 0, z: 0, w: Math.cos(-0.1) });
    },
    [id, d],
  );
  await xrFrames(2);
  await page.evaluate(() => window.__play.wait(0.5));
}
/** Step up to the boards: 55 cm in front of the middle of the wares board and the bag panel, facing them. */
async function stepUp() {
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
  await page.evaluate(() => window.__play.wait(0.3));
}
/** Where things are on the boards: a wares slot, a bag slot, a stash slot, "Sell junk", the stash's lid. */
const wareAt = (i, off = 0.015) => page.evaluate(([i, off]) => (({ x, y, z }) => ({ x, y, z }))(window.__descent.wares.slotWorld(i, window.__descent.camera.position.clone(), off)), [i, off]);
const bagAt = (i, off = 0.015) =>
  page.evaluate(([i, off]) => (({ x, y, z }) => ({ x, y, z }))(window.__descent.bag.panel.slotWorld({ in: 'grid', i }, window.__descent.camera.position.clone(), off)), [i, off]);
const stashAt = (i, off = 0.015) => page.evaluate(([i, off]) => (({ x, y, z }) => ({ x, y, z }))(window.__descent.adventure.stash.slotWorld(i, window.__descent.camera.position.clone(), off)), [i, off]);
const sellJunkAt = () => page.evaluate(() => (({ x, y, z }) => ({ x, y, z }))(window.__descent.wares.sellJunkWorld(window.__descent.camera.position.clone())));
/** A point `d` m straight out from a board's face at `w`: the wares board's, the bag panel's or the stash's. */
const outFrom = (w, d, which) =>
  page.evaluate(
    ([w, d, which]) => {
      const { wares, bag, adventure } = window.__descent;
      const root = which === 'wares' ? wares.root : which === 'stash' ? adventure.stash.root : bag.panel.root;
      const o = root.getWorldPosition(root.position.clone());
      const n = root.localToWorld(root.position.clone().set(0, 0, 1)).sub(o);
      return { x: w.x + n.x * d, y: w.y + n.y * d, z: w.z + n.z * d };
    },
    [w, d, which],
  );
/**
 * The right fist at a world point, then `frames` steps. Between the script's
 * calls the page's XR frames go on and put each grip where its emulated
 * controller is, so the controller is moved until the grip lands there.
 */
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
/** Squeeze (1) or let go of (0) the right grip. */
async function grip(v) {
  await page.evaluate((v) => window.__descent.device.controllers.right.updateButtonValue('squeeze', v), v);
  await xrFrames(2);
  await page.evaluate(() => window.__play.tick());
}
let lastCarry = '';
/** Touch `from` on board `a` with the right fist, squeeze, carry it to `to` on board `b` and let go: what was carried. */
async function carry(from, a, to, b) {
  await fistAt(await outFrom(from, 0.1, a));
  await fistAt(from);
  await grip(1);
  const holding = await page.evaluate(() => window.__descent.bag.holding?.id ?? null);
  await fistAt(await outFrom(to, 0.05, b));
  await fistAt(to);
  await grip(0);
  await fistAt(await outFrom(to, 0.15, b));
  await page.evaluate(() => window.__play.wait(0.2));
  lastCarry = await page.evaluate(() => window.__descent.bag.lines.slice(-3).join(' / '));
  return holding;
}
/** Press a point with the right fist: in from in front of it, onto it, and away. */
async function pressAt(w, which) {
  await fistAt(await outFrom(w, 0.1, which), 8);
  await fistAt(w, 6);
  await fistAt(await outFrom(w, 0.12, which), 4);
  await page.evaluate(() => window.__play.down());
}
/** Stand inside the inn, 50 cm out from the stash chest's front, facing it. */
async function standAtStash() {
  await page.evaluate(() => {
    const d = window.__descent;
    const { spot } = d.adventure.stashChest;
    const fx = Math.sin(spot.yaw);
    const fz = Math.cos(spot.yaw);
    d.world.settle('inn');
    d.teleport(spot.x + fx * 0.725, spot.z + fz * 0.725, Math.atan2(fx, fz));
    Object.assign(d.device.quaternion, { x: 0, y: 0, z: 0, w: 1 });
  });
  await xrFrames(3);
  await page.evaluate(() => window.__play.wait(0.3));
}
/** Touch the stash chest's lid with the right fist, from over it. */
async function touchStashLid() {
  const lid = await page.evaluate(() => (({ x, y, z }) => ({ x, y, z }))(window.__descent.adventure.stashChest.lidWorld(window.__descent.camera.position.clone(), 0.02)));
  await fistAt({ ...lid, y: lid.y + 0.3 }, 8);
  await fistAt(lid, 4);
  await fistAt({ ...lid, y: lid.y + 0.3 }, 4);
  await page.evaluate(() => window.__play.wait(0.4));
}
/** Where you stand to lift chest `id`'s lid, facing it, and the lid's top. */
async function chestSpot(id) {
  const chest = ZONE.chests.find((c) => c.id === id);
  const { d, h, lid } = await page.evaluate((look) => window.__descent.CONFIG.chests.looks[look], chest.look);
  const back = d / 2 + 0.4;
  return {
    chest,
    stand: { x: chest.x + Math.sin(chest.yaw) * back, z: chest.z + Math.cos(chest.yaw) * back },
    lid: { x: chest.x + Math.sin(chest.yaw) * 0.05, y: chest.y + h + lid, z: chest.z + Math.cos(chest.yaw) * 0.05 },
  };
}
/** Open chest `id` with the left fist on its lid, standing before it: whether it's open, and whether it was already (a sword swung near it in a fight lifts a lid too). */
async function openChest(id) {
  const { chest, stand, lid } = await chestSpot(id);
  const already = (await look()).chests.includes(id);
  await page.evaluate(([s, c]) => window.__descent.teleport(s.x, s.z, Math.atan2(-(c.x - s.x), -(c.z - s.z))), [stand, chest]);
  await page.evaluate(() => window.__play.wait(0.3));
  if (!already) await page.evaluate((lid) => window.__play.touch(lid, 'left'), lid);
  await page.evaluate(() => window.__play.wait(0.8));
  return { open: (await look()).chests.includes(id), already };
}
/** Hands down at your sides. */
const handsDown = () => page.evaluate(() => window.__play.down());

// ================================================================ 1. a new warrior
let s = await look();
{
  check(
    s.level === 1 && s.gear.mainHand === 'plain-sword' && s.gear.offHand === 'round-shield' && s.gear.chest === 'worn-tunic' && s.gear.feet,
    `a new warrior in the starting kit: ${Object.entries(s.gear).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ')}`,
  );
  check(s.belt[1] === 'minor-healing-potion×3' && s.coins === 0 && s.bag.every((b) => !b), `three potions on the right hip, 0 coins, an empty bag (${s.belt.join(', ')})`);
  ledger.push({ stage: 'start', gained: 0, coins: 0 });
}

// ================================================================ 2. Raiders in the Fields
{
  await stage('farm');
  check(await talk('accept'), '"Accept" Raiders in the Fields');
  await page.evaluate(() => window.__descent.teleport(46, 30, -Math.PI / 2 - 0.3));
  await page.evaluate(() => window.__play.wait(0.5));
  const r = await clearCamp('farm');
  s = await look();
  check(r.r === 'done' && (await alive('farm')) === 0 && s.marker === 'ready', `the farm's four bandits fought through the real combat (${r.deaths} deaths, ${Math.round(s.hp)}/${s.maxHp} health)`);
  const got = await lootUp('the farm');
  check(got.left === 0, `the farm's loot all taken (${got.left} left lying)`);
  await shot('01-the-farm-looted');
  await page.evaluate(() => window.__descent.teleport(30, 20, 0));
  await page.evaluate(() => window.__play.wait(16));
  await stage('hand-ins');
  const picked = await handIn(0);
  s = await look();
  check(picked && s.level === 2, `Raiders handed in with the first pick of ${await named(picked?.offered ?? [])}: level ${s.level}`);
  const worn = await wearUpgrades();
  note(`worn from the bag: ${worn.join(', ') || 'nothing'}`);
}

// ================================================================ 3. The Lumber Camp, the belt mid-fight, the patrol, the tent's chest
{
  await page.evaluate(() => window.__play.wait(1));
  check(await page.evaluate(() => window.__play.press('accept')), '"Accept" The Lumber Camp');
  await page.evaluate(() => window.__play.wait(0.3));
  await stage('lumber camp');
  await page.evaluate(() => window.__descent.teleport(-33, -44, Math.PI / 2));
  await page.evaluate(() => window.__play.wait(0.3));
  // Fight until you're hurt (or three of the camp are down) with the camp on you, then drink from the belt.
  const thirsty = `() => window.__descent.camps.fighting && (window.__descent.player.hp < window.__descent.player.maxHp * 0.8 || window.__descent.camps.camps.find((c) => c.plan.id === 'lumberCamp').members.filter((m) => !m.enemy.alive).length >= 3)`;
  let fought = await battle({ done: allDown('lumberCamp'), pick: inCamp('lumberCamp'), thirsty }, () => toCamp('lumberCamp'));
  let sip = null;
  if (fought.r === 'thirsty' || (await look()).fighting) sip = await page.evaluate(() => window.__play.drink());
  check(
    sip?.drunk && sip.fighting && Math.abs(sip.rose - sip.before - Math.min(0.4 * sip.max, sip.max - sip.before)) < 0.5,
    `mid-fight, a potion from the right hip drunk in ${sip?.t.toFixed(2)} s with the camp on you: health ${Math.round(sip?.before)} to ${Math.round(sip?.rose)} of ${sip?.max} (+${Math.round(((sip?.rose - sip?.before) / sip?.max) * 100)}%)`,
  );
  check(sip?.belt === 2 && sip.cooldown > 55, `two left on the hip, the belt dimmed for ${sip?.cooldown.toFixed(0)} s`);
  fought = await clearCamp('lumberCamp');
  check(fought.r === 'done' && (await alive('lumberCamp')) === 0, `the lumber camp's five fought, its leader too (${fought.deaths} deaths)`);
  await lootUp('the lumber camp');
  await stage('patrol');
  fought = await clearCamp('patrol');
  check(fought.r === 'done' && (await alive('patrol')) === 0, `the camp road's patrol of two fought (${fought.deaths} deaths)`);
  await lootUp('the patrol');
  // The orders, from the tent.
  await page.evaluate(async (o) => {
    const { TENT } = await import('/src/maps/forest/layout.ts');
    const outside = TENT.hd + 0.35 - TENT.orders.z;
    window.__descent.teleport(o.x + outside * Math.sin(o.yaw), o.z + outside * Math.cos(o.yaw), o.yaw + Math.PI);
    window.__play.wait(0.2);
    window.__play.touch({ x: o.x, y: o.y + 0.035, z: o.z }, 'left');
    window.__play.wait(0.2);
  }, ZONE.orders);
  s = await look();
  check(s.quest.includes('leaders-orders') && s.marker === 'ready', `the orders taken with the left fist, onto the quest page (${s.quest.join(', ')})`);
  await stage('tent chest');
  const tent = await openChest('oakvale-leaders-tent');
  check(tent.open && !tent.already, "the leader's tent's chest opened with the left fist");
  const got = await lootUp("the leader's tent's chest");
  check(got.left === 0, "and what was in it taken");
  await page.evaluate(() => window.__play.wait(16));
  await stage('hand-ins');
  const picked = await handIn(0);
  s = await look();
  check(picked && s.level === 3 && !s.quest.includes('leaders-orders'), `The Lumber Camp handed in with the first pick of ${await named(picked?.offered ?? [])}, the orders gone: level ${s.level}`);
  note(`worn from the bag: ${(await wearUpgrades()).join(', ') || 'nothing'}`);
  await page.evaluate(() => window.__play.wait(1));
  check(await page.evaluate(() => window.__play.press('accept')), '"Accept" What Lies Below');
}

// ================================================================ 4. the watchtower and its chest
{
  await stage('watchtower');
  await page.evaluate(() => window.__descent.teleport(28, -57, -Math.PI / 2));
  await page.evaluate(() => window.__play.wait(0.3));
  const fought = await clearCamp('watchtower');
  check(fought.r === 'done' && (await alive('watchtower')) === 0, `the watchtower's three fought (${fought.deaths} deaths)`);
  await lootUp('the watchtower');
  await stage('watchtower chest');
  const hill = await openChest('oakvale-watchtower');
  check(hill.open && !hill.already, "the watchtower's chest on the hilltop opened with the left fist");
  const got = await lootUp("the watchtower's chest");
  check(got.left === 0, 'and what was in it taken');
  note(`worn from the bag: ${(await wearUpgrades()).join(', ') || 'nothing'}`);
  await shot('02-the-watchtower-chest');
}

// ================================================================ 5. What Lies Below, and the budget at the dig
{
  await stage('mine');
  await page.evaluate(() => window.__play.wait(12));
  await walkIn();
  s = await look();
  check(s.interior === 'mine', `in through the mouth with the left stick: in the mine (${s.interior})`);
  const mine = inCamp('mine');
  const down = (n) => `() => window.__descent.camps.camps.find((c) => c.plan.id === "mine").members.filter((m) => !m.enemy.alive).length >= ${n}`;
  // The cart hall, then the gallery: fought, and their drops taken.
  let fell = 0;
  for (const [lx, lz, tx, tz, n, name] of [
    [-6, -8, -12, -11.5, 3, 'the cart hall'],
    [-15, -26, -15, -31, 5, 'the gallery'],
  ]) {
    await page.evaluate(() => window.__play.wait(8));
    await walkIn();
    await inMine(lx, lz, tx, tz);
    const r = await battle({ done: down(n), pick: mine, near: 14 }, async () => {
      await walkIn();
      await inMine(lx, lz, tx, tz);
    });
    fell += r.deaths;
    check(r.r === 'done', `${name} fought (${r.deaths} deaths)`);
    await walkIn();
    await lootUp(name);
  }
  // The dig's brute and the antechamber's, and the Warden: their drops left lying, with the strongbox's.
  await stage('deep brutes');
  for (const [lx, lz, tx, tz, n] of [
    [2, -48, 4, -53, 6],
    [22, -30, 22, -34, 7],
  ]) {
    await page.evaluate(() => window.__play.wait(8));
    await walkIn();
    await inMine(lx, lz, tx, tz);
    const r = await battle({ done: down(n), pick: mine, near: 14 }, async () => {
      await walkIn();
      await inMine(lx, lz, tx, tz);
    });
    fell += r.deaths;
    s = await look();
    check(r.r === 'done', `the ${n === 6 ? "dig's" : "antechamber's"} brute fought (${r.deaths} deaths, level ${s.level})`);
    if (n === 6) {
      await stage('strongbox');
      const box = await openChest('oakvale-strongbox');
      check(box.open, `the strongbox in the dig opened${box.already ? ' (by the sword, swung at the brute beside it)' : ' with the left fist'}, its contents left lying for now`);
      await stage('deep brutes');
    }
  }
  await stage('warden');
  let wardenDeaths = 0;
  for (let tries = 0; tries < 6 && !(await look()).beaten; tries++) {
    await page.evaluate(() => window.__play.wait(8));
    await walkIn();
    await inMine(22, -40, 22, -52);
    const r = await fightUntil({ done: '() => window.__descent.state.wardenBeaten', near: 16 }, 60);
    if (r === 'dead') {
      wardenDeaths++;
      await throughDeath();
    }
  }
  s = await look();
  check(s.beaten && s.tracker?.join(' | ') === 'What Lies Below | Return to Marshal Hale', `the Warden beaten through the real combat (${wardenDeaths} deaths to it; ${fell} in the rest of the mine)`);
  const tally = await page.evaluate(() => ({ ...window.__play.tally }));
  note(`all fights: ${tally.landed} of ${tally.swings} swings landed`);

  // At the dig, looking round with the bag open and the mine's drops lying.
  await page.evaluate(() => window.__play.wait(2));
  await inMine(0, -47, 4, -53);
  await page.evaluate(() => window.__play.wait(0.3));
  const lying = await page.evaluate(() => window.__descent.adventure.drops.pieces.length);
  const fromBig = (await allLoot()).filter((l) => ['deep brutes', 'strongbox', 'warden'].includes(l.stage));
  check(await openBag(), 'at the dig, a reach over the shoulder opens the bag');
  await shot('03-the-dig-with-drops-and-the-bag');
  const dig = await measure('the dig, the Warden\'s, the deep brutes\' and the strongbox\'s drops lying, the bag open', around(Math.PI, 8));
  note(`lying: ${lying} pieces from ${fromBig.length} drops (${(await named(fromBig.flatMap((l) => l.items))) || 'no items'})`);
  check(dig.views.every((v) => v.bag), 'the bag stayed open at every heading');
  await page.evaluate(() => window.__descent.bag.close('the script, measured'));
  // Then every drop in the mine taken: the dig's, the antechamber's, the Warden's hall's.
  await stage('mine');
  await inMine(0, -47, 4, -53);
  let got = await lootUp("the dig's brute and the strongbox");
  await inMine(22, -30, 22, -34);
  got = await lootUp("the antechamber's brute");
  await inMine(22, -42, 22, -52);
  got = await lootUp("the Warden's hall");
  check(got.left === 0 && (await page.evaluate(() => window.__play.lyingHere().length)) === 0, `every drop in the mine taken (${got.full} flashing "Bag full")`);
  note(`worn from the bag: ${(await wearUpgrades()).join(', ') || 'nothing'}`);
}

// ================================================================ 6. the coins before spending
const route = await page.evaluate(async () => {
  // What the route pays on average: every kill's role and level (the zone's plan), the Warden's, and each chest's coins.
  const { planOakvale } = await import('/src/maps/forest/layout.ts');
  const { CONFIG } = window.__descent;
  const oak = planOakvale();
  const [lo, hi] = CONFIG.loot.coins;
  const kills = oak.camps.flatMap((c) => c.posts.map((p) => ({ role: p.role ?? 'ordinary', level: p.level ?? c.level })));
  kills.push({ role: 'warden', level: CONFIG.warden.hall.level });
  const byKills = kills.reduce((sum, k) => sum + ((lo + hi) / 2) * k.level * CONFIG.loot.roles[k.role].coins, 0);
  const chests = oak.chests.reduce((sum, c) => sum + CONFIG.loot.chest.coins * c.level, 0);
  return { kills: kills.length, byKills, chests, expected: byKills + chests, coins: CONFIG.loot.coins };
});
const drops = await allLoot();
const dropped = drops.reduce((n, l) => n + l.coins, 0);
s = await look();
{
  check(s.coins === dropped, `every coin that dropped was taken: ${s.coins} in the purse, ${dropped} dropped over ${drops.length} drops`);
  check(
    route.expected >= 300 && route.expected <= 400,
    `the route's expected coins, before spending: ${route.expected.toFixed(0)} (${route.byKills.toFixed(0)} from ${route.kills} kills at CONFIG.loot.coins ${route.coins.join(' to ')} × level × role, and ${route.chests} from the chests), in the spec's 300 to 400`,
  );
  note(`this run's coins before spending: ${s.coins} (${s.coins >= 300 && s.coins <= 400 ? 'in' : 'outside'} 300 to 400; one run swings with the Warden's roll)`);
  const byRarity = {};
  for (const i of await items(drops.flatMap((l) => l.items))) byRarity[i.rarity] = (byRarity[i.rarity] ?? 0) + 1;
  note(`drops: ${drops.length}, holding ${Object.entries(byRarity).map(([r, n]) => `${n} ${r}`).join(', ')}`);
  note(`the bag: ${s.bag.filter(Boolean).length} of 16 slots used: ${s.bag.filter(Boolean).join(', ')}`);
}
const beforeSpending = s.coins;

// ================================================================ 7. the smith
const junkValue = await page.evaluate(async () => {
  const { itemOf, sellPrice } = await import('/src/items.ts');
  const inv = window.__descent.state.inventory;
  return inv.bag.reduce((sum, s) => {
    const item = s && itemOf(s.id);
    return item?.kind === 'junk' ? sum + (sellPrice ? sellPrice(item) : 0) * s.count : sum;
  }, 0);
});
{
  await stage('smith');
  await standBy('smith', 2);
  await page.evaluate(() => window.__play.wait(0.4));
  // Since professions 18 the smith has Ore and Fire to offer after Raiders in the Fields: their talk board comes first, and "Trade" unfolds the wares.
  const talked = await page.evaluate(() => window.__play.press('trade', 'right', 'vendorBoard'));
  if (talked) note('the smith talked first (Ore and Fire on offer): "Trade" pressed');
  let w = await page.evaluate(() => ({ open: window.__descent.wares.isOpen, vendor: window.__descent.wares.vendor, bag: window.__descent.bag.isOpen }));
  check(w.open && w.vendor === 'smith' && w.bag, `walking up to the smith unfolds their wares, the bag panel beside them (${w.vendor})`);
  await stepUp();
  await shot('04-the-smith');
  const facing = await page.evaluate(() => window.__descent.player.rig.rotation.y);
  const smith = await measure("the smith's, the wares board and the bag panel open", [facing, facing - 0.4, facing + 0.4, facing - 0.8, facing + 0.8]);
  check(smith.views.every((v) => v.bag), 'the boards stayed open at every heading');
  await stepUp();

  // Sell junk.
  const was = await look();
  const greys = await page.evaluate(async () => {
    const { itemOf } = await import('/src/items.ts');
    return window.__descent.state.inventory.bag.filter((s) => s && itemOf(s.id)?.kind === 'junk').map((s) => `${s.id}×${s.count}`);
  });
  await pressAt(await sellJunkAt(), 'wares');
  await page.evaluate(() => window.__play.wait(0.2));
  s = await look();
  const junkLeft = await page.evaluate(async () => {
    const { itemOf } = await import('/src/items.ts');
    return window.__descent.state.inventory.bag.filter((s) => s && itemOf(s.id)?.kind === 'junk').length;
  });
  check(greys.length > 0 && junkLeft === 0 && s.coins > was.coins, `"Sell junk" sells every grey (${greys.join(', ')}) for ${s.coins - was.coins} coins${junkValue ? ` (their worth ${junkValue})` : ''}: ${s.coins} in the purse`);
  ledger.push({ stage: 'sold the junk', gained: s.coins - was.coins, coins: s.coins });

  // What you've grown out of, carried onto the board and sold: all but the plain sword, kept for the stash.
  const old = await page.evaluate(async () => {
    const { itemOf } = await import('/src/items.ts');
    return window.__descent.state.inventory.bag.flatMap((s, i) => (s && s.id !== 'plain-sword' && itemOf(s.id)?.kind === 'gear' ? [i] : []));
  });
  const beforeOld = (await look()).coins;
  const sold = [];
  for (const i of old) sold.push(await carry(await bagAt(i), 'bag', await wareAt(5), 'wares'));
  s = await look();
  check(old.every((i) => s.bag[i] === null) && s.coins > beforeOld, `what you've grown out of carried onto the board and sold (${await named(sold.filter(Boolean))}) for ${s.coins - beforeOld} coins`);
  ledger.push({ stage: 'sold old gear', gained: s.coins - beforeOld, coins: s.coins });
  await handsDown();

  // A white piece off the board: for an empty slot, else one better than what's worn, else a chest piece to carry.
  const buy = await page.evaluate(async () => {
    const { itemOf } = await import('/src/items.ts');
    const { wares, state } = window.__descent;
    const inv = state.inventory;
    const RANK = { grey: 0, white: 1, green: 2, blue: 3 };
    const stock = Array.from({ length: 16 }, (_, i) => ({ i, s: wares.stackAt(i) })).filter((w) => w.s).map((w) => ({ i: w.i, item: itemOf(w.s.id) }));
    const wearable = stock.filter((w) => w.item.kind === 'gear' && w.item.level <= state.level && (!w.item.class || w.item.class === state.class));
    wearable.sort((a, b) => b.item.level - a.item.level);
    const worn = (w) => (inv.gear[w.item.slot] ? itemOf(inv.gear[w.item.slot]) : null);
    const beats = (w) => !worn(w) || RANK[worn(w).rarity] < 1 || (RANK[worn(w).rarity] === 1 && worn(w).level < w.item.level);
    const pick = wearable.find(beats) ?? wearable.find((w) => w.item.slot === 'chest') ?? wearable[0];
    return pick ? { i: pick.i, id: pick.item.id, name: pick.item.name, slot: pick.item.slot, level: pick.item.level, free: inv.bag.findIndex((b) => !b), upgrade: beats(pick), worn: worn(pick)?.name ?? null } : null;
  });
  const coins = (await look()).coins;
  const held = buy ? await carry(await wareAt(buy.i), 'wares', await bagAt(buy.free), 'bag') : null;
  s = await look();
  const price = coins - s.coins;
  check(held === buy?.id && s.bag[buy.free] === `${buy.id}×1` && price > 0, `the ${buy?.name} (white, item level ${buy?.level}, for the ${buy?.slot}) carried off the board into the bag, bought for ${price} coins`);
  ledger.push({ stage: `bought the ${buy?.name}`, gained: -price, coins: s.coins });
  if (buy?.upgrade) {
    const worn = await wearUpgrades();
    s = await look();
    check(s.gear[buy.slot] === buy.id, `and worn (${worn.join(', ')})`);
  } else note(`not worn: the ${buy?.worn} you wear is better`);
  await handsDown();
  await standBy('smith', 4.5);
  w = await page.evaluate(() => ({ open: window.__descent.wares.isOpen, bag: window.__descent.bag.isOpen }));
  check(!w.open && !w.bag, 'walking off folds the board and the bag with it');
}

// ================================================================ 8. the innkeeper
{
  await stage('innkeeper');
  await standBy('innkeeper', 2);
  await page.evaluate(() => window.__play.wait(0.4));
  const open = await page.evaluate(() => window.__descent.wares.isOpen && window.__descent.wares.vendor === 'innkeeper');
  await stepUp();
  const was = await look();
  const free = was.bag.findIndex((b) => !b);
  const held = await carry(await wareAt(0), 'wares', await bagAt(free), 'bag');
  s = await look();
  check(open && held === 'minor-healing-potion' && s.bag[free] === 'minor-healing-potion×1' && was.coins - s.coins === 8, `the innkeeper's minor healing potion carried into the bag, bought for ${was.coins - s.coins} coins (${lastCarry})`);
  ledger.push({ stage: 'bought a potion', gained: s.coins - was.coins, coins: s.coins });
  await shot('05-the-innkeeper');
  await page.evaluate(() => window.__descent.bag.close('the script, bought'));
  await page.evaluate(() => window.__play.wait(0.3));
}

// ================================================================ 9. the last hand-in
{
  await page.evaluate(() => window.__descent.world.settle(null));
  await page.evaluate(() => window.__play.wait(3));
  await stage('hand-ins');
  const picked = await handIn(0);
  s = await look();
  check(picked?.offered[0] === 'hale-longsword' && s.level === 5 && s.bag.includes('hale-longsword×1'), `What Lies Below handed in with Hale's longsword (offered ${await named(picked?.offered ?? [])}): level ${s.level}`);
  await page.evaluate(() => {
    const { adventure, state } = window.__descent;
    const slot = state.inventory.bag.findIndex((b) => b?.id === 'hale-longsword');
    adventure.applyThings(state.inventory.move({ in: 'bag', slot }, { in: 'gear', slot: 'mainHand' }), adventure.hale.position);
    window.__play.wait(0.2);
  });
  s = await look();
  check(s.inHand === 'hale' && !s.atHip && s.bag.includes('plain-sword×1'), `worn: Hale's longsword in your hand (${s.damage.toFixed(2)} damage), the plain sword in the bag`);
  note(`worn from the bag: ${(await wearUpgrades()).join(', ') || 'nothing'}`);
}

// ================================================================ 10. the stash, across a reload
{
  await stage('stash');
  await standAtStash();
  await touchStashLid();
  let st = await page.evaluate(() => ({ stash: window.__descent.adventure.stash.isOpen, bag: window.__descent.bag.isOpen }));
  check(st.stash && st.bag, 'a fist on the stash chest\'s lid opens the stash beside the bag');
  s = await look();
  const sword = s.bag.indexOf('plain-sword×1');
  const held = await carry(await bagAt(sword), 'bag', await stashAt(0), 'stash');
  s = await look();
  check(held === 'plain-sword' && s.stash[0] === 'plain-sword×1' && s.bag[sword] === null, `the plain sword carried into the stash (${lastCarry})`);
  await shot('06-the-stash');
  await standAtStash();
  await page.evaluate(() => {
    const d = window.__descent;
    d.teleport(d.player.rig.position.x + 2.5, d.player.rig.position.z, d.player.rig.rotation.y);
    window.__play.wait(0.5);
  });
  st = await page.evaluate(() => ({ stash: window.__descent.adventure.stash.isOpen, bag: window.__descent.bag.isOpen }));
  check(!st.stash && !st.bag, 'walking off shuts both');
  const before = await look();
  await reload();
  s = await look();
  check(
    s.stash[0] === 'plain-sword×1' && s.coins === before.coins && JSON.stringify(s.bag) === JSON.stringify(before.bag) && JSON.stringify(s.gear) === JSON.stringify(before.gear),
    `after a reload, the stash still holds the plain sword, and the coins (${s.coins}), bag and gear are as left`,
  );
  await standAtStash();
  await touchStashLid();
  const free = s.bag.findIndex((b) => !b);
  const back = await carry(await stashAt(0), 'stash', await bagAt(free), 'bag');
  s = await look();
  check(back === 'plain-sword' && s.bag[free] === 'plain-sword×1' && s.stash.every((x) => !x), 'and carried back out into the bag');
  await page.evaluate(() => window.__descent.saved());
}

// ================================================================ the budget, and what the run recorded
for (const m of measured) {
  check(m.calls <= BUDGET.calls && m.lights <= BUDGET.lights, `${m.label}: ${m.calls} draw calls (about ${BUDGET.calls}), ${m.lights} point lights (at most ${BUDGET.lights})`);
  note(`${(m.triangles / 1000).toFixed(1)}k triangles, ${m.triangles <= BUDGET.triangles ? 'within' : 'over'} the rule of thumb of 250k to 300k`);
}
note(`coins by stage: ${ledger.map((l) => `${l.stage} ${l.gained >= 0 ? '+' : ''}${l.gained}`).join('; ')}`);
note(`coins before spending ${beforeSpending}; after the smith and the innkeeper ${s.coins}`);
if (out) writeFileSync(`${out}/whole-zone.json`, JSON.stringify({ route, beforeSpending, ledger, drops: await allLoot(), measured }, null, 1));

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
