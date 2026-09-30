// Checks for Loot from kills (issues/11-loot-from-kills.md) in headless
// Chromium with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/inventory/checks/loot.mjs [http://localhost:5173] [shots/]
//
// A new character, at `?perf`. Game time is stepped through the debug handle
// (`paused`, `step`, `teleport`), not XR frames; enemies are felled with a
// blow big enough to kill, as the lumber camp's check does, and you're kept at
// full health while the rest of a camp fights you. The bag is read through the
// debug handle (`state.inventory`), not the bag panel (ticket 09).
//
// 1. A farm bandit falls: a pouch of 1 to 4 coins (CONFIG.loot.coins) lies where it fell, with
//    any item beside it at item level 1, the bandits' junk or a warrior's gear.
// 2. The left fist touches the pouch, then each item: the coins and the items
//    are yours, each with a buzz in the left hand, "+N coins" floats up, and
//    the drop is gone.
// 3. The lumber camp's leader falls: 6 to 24 coins and always one green or
//    blue piece of item level 2 for a warrior, raising a beam. Walking over
//    the drop takes it all into the bag.
// 4. With the bag filled, a thug's drop (or, if none of the camp drops an
//    item, one laid there) is touched: the coins are still taken, but the item
//    stays on the ground flashing red, "Bag full" floats over it with a strong
//    buzz, and the bag is unchanged. Emptied, a new touch takes it.
// 5. Twelve drops lie at once, each with a beam: draw calls against the
//    budget (≤ 300 steady, ceiling ~500, both eyes, in
//    docs/quest-3-browser-performance-budget.md); a thirteenth takes the
//    oldest's place.
//
// Playwright is the global install; Chromium is the pre-installed one.

import { mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const shots = process.argv[3];
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};
const shot = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });
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
/** Step the game `s` seconds, keeping you at full health. */
const step = (s, dt = 1 / 72) =>
  page.evaluate(
    ([s, dt]) => {
      const d = window.__descent;
      for (let left = s; left > 1e-9; left -= dt) {
        d.player.hp = d.player.maxHp;
        d.adventure.update(Math.min(dt, left));
      }
    },
    [s, dt],
  );

// Every canvas remembers what was written on it since it was last cleared, so the floats can be read back.
await page.addInitScript(() => {
  const P = CanvasRenderingContext2D.prototype;
  const fill = P.fillText;
  const clear = P.clearRect;
  P.fillText = function (text, ...rest) {
    (this.__texts ??= []).push(String(text));
    return fill.call(this, text, ...rest);
  };
  P.clearRect = function (...args) {
    this.__texts = [];
    return clear.apply(this, args);
  };
});

await page.goto(`${base}/?perf&emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => {
  const d = window.__descent;
  d.paused = true;
  d.device.controllers.left.position.set(-0.4, 0.3, 0.2);
  d.device.controllers.right.position.set(0.4, 0.3, 0.2);
  // Count each buzz, by hand and strength.
  d.buzzes = [];
  const input = d.player.input;
  const pulse = input.pulse.bind(input);
  input.pulse = (hand, i, ms) => {
    d.buzzes.push({ hand, i, ms });
    pulse(hand, i, ms);
  };
  // Keep each kill's drop as the adventure state rolled it.
  d.rolled = [];
  const apply = d.state.apply.bind(d.state);
  d.state.apply = (event) => {
    const effects = apply(event);
    for (const e of effects) if (e.kind === 'loot') d.rolled.push({ ...e, level: event.level, role: event.role });
    return effects;
  };
});
await xrFrames(2);

/** Stand at (x, z) facing (tx, tz); XR frames bring the head there. */
async function standFacing(x, z, tx, tz) {
  await page.evaluate(([x, z, tx, tz]) => window.__descent.teleport(x, z, Math.atan2(-(tx - x), -(tz - z))), [x, z, tx, tz]);
  await xrFrames(2);
  await step(1 / 72);
}
/** A world point in the rig's space. */
const rigAt = (w) =>
  page.evaluate((w) => {
    const { player } = window.__descent;
    const r = player.rig.worldToLocal(player.rig.position.clone().set(w.x, w.y, w.z));
    return { x: r.x, y: r.y, z: r.z };
  }, w);
/** Move a controller so its grip (the fist) lands at a rig-space point. */
async function fistTo(hand, rig) {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(
      ([hand, t]) => {
        const { player, device } = window.__descent;
        const g = player.input.hands[hand].grip.position;
        const c = device.controllers[hand].position;
        c.set(c.x + t.x - g.x, c.y + t.y - g.y, c.z + t.z - g.z);
      },
      [hand, rig],
    );
    await xrFrames(2);
  }
}
async function handDown(hand) {
  await page.evaluate((hand) => {
    const c = window.__descent.device.controllers[hand];
    c.position.set(hand === 'left' ? -0.4 : 0.4, 0.3, 0.2);
    c.quaternion.set(0, 0, 0, 1);
  }, hand);
  await xrFrames(2);
}
/** Touch a world point with the left fist, and take the hand away. */
async function touch(at) {
  await fistTo('left', await rigAt(at));
  await step(1 / 36);
  await handDown('left');
  await step(1 / 36);
}
/** What lies on the ground, what you have, and what's floating and buzzing. */
const look = () =>
  page.evaluate(() => {
    const { adventure, state, buzzes, rolled } = window.__descent;
    return {
      lying: adventure.drops.lying,
      pieces: adventure.drops.pieces.map((p) => ({ coins: p.coins, item: p.item, beam: p.beam, flashing: p.flashing, at: { x: p.at.x, y: p.at.y, z: p.at.z } })),
      coins: state.inventory.coins,
      bag: state.inventory.bag.map((s) => s && `${s.id}×${s.count}`),
      floats: adventure.text.active.map((f) => f.sprite.material.map.image.getContext('2d').__texts?.at(-1) ?? ''),
      buzzes: [...buzzes],
      rolled: [...rolled],
    };
  });
/** An item's catalogue entry, from the dev server's source. */
const itemOf = (id) => page.evaluate(async (id) => (await import('/src/items.ts')).itemOf(id), id);
const campMembers = (id) =>
  page.evaluate(
    (id) =>
      window.__descent.camps.camps
        .find((c) => c.plan.id === id)
        .members.map((m, i) => ({ i, alive: m.enemy.alive, role: m.plan.role ?? 'ordinary', level: m.enemy.level, x: m.enemy.position.x, z: m.enemy.position.z })),
    id,
  );
/** Fell camp `id`'s member `i` with one blow, and let it fall. */
async function fell(id, i) {
  await page.evaluate(
    ([id, i]) => {
      const m = window.__descent.camps.camps.find((c) => c.plan.id === id).members[i];
      m.enemy.takeHit(99999, m.enemy.position.clone().set(0, 0, 0));
    },
    [id, i],
  );
  await step(0.2);
}
/** Stand `d` m from a point, on the side away from (fx, fz), facing it. */
async function standBy(at, d, from = { x: at.x + 1, z: at.z }) {
  const dx = from.x - at.x;
  const dz = from.z - at.z;
  const k = d / (Math.hypot(dx, dz) || 1);
  await standFacing(at.x + dx * k, at.z + dz * k, at.x, at.z);
}

await step(1);

// 1. A farm bandit falls.
let farmDrop;
{
  const [m] = (await campMembers('farm')).filter((m) => m.alive);
  const before = await look();
  await standBy(m, 3);
  await fell('farm', m.i);
  const t = await look();
  const roll = t.rolled.at(-1);
  farmDrop = t.pieces;
  check(t.lying === before.lying + 1 && roll?.role === 'ordinary' && roll.level === 1, `a farm bandit (level 1) falls and a drop lies (${JSON.stringify(roll)})`);
  const pouch = t.pieces.find((p) => p.item === null);
  // A kill's coins: CONFIG.loot.coins × level × the role's share (inventory ticket 17 raised the top from 3 to 4).
  const [low, high] = await page.evaluate(() => window.__descent.CONFIG.loot.coins);
  check(pouch && pouch.coins >= low && pouch.coins <= high && Math.hypot(pouch.at.x - m.x, pouch.at.z - m.z) < 0.6, `a pouch of ${pouch?.coins} coins where it fell`);
  const items = await Promise.all(t.pieces.filter((p) => p.item).map((p) => itemOf(p.item)));
  check(
    items.every((i) => i.level === 1 && (i.kind === 'junk' ? /^(worn-trinket|torn-cloth)/.test(i.id) : i.kind === 'gear' && (i.class ?? 'warrior') === 'warrior')),
    `beside it: ${items.map((i) => `${i.name} (${i.rarity}, ${i.level})`).join(', ') || 'nothing this time'}`,
  );
  await shot('01-farm-drop');
}

// 2. Loot it with the left fist.
{
  const before = await look();
  const pouch = farmDrop.find((p) => p.item === null);
  // Stand a metre off, so your feet don't take it first.
  await standBy(pouch.at, 0.95);
  for (const p of farmDrop) await touch(p.at);
  const t = await look();
  check(t.coins === before.coins + pouch.coins, `the pouch's ${pouch.coins} coins are yours (${t.coins})`);
  check(t.floats.includes(`+${pouch.coins} coins`), `"+${pouch.coins} coins" floats up (${t.floats.join(', ')})`);
  const want = farmDrop.filter((p) => p.item).map((p) => `${p.item}×1`);
  check(want.every((w) => t.bag.includes(w)), `and the items are in the bag (${t.bag.filter(Boolean).join(', ') || 'none dropped'})`);
  const lefts = t.buzzes.slice(before.buzzes.length);
  check(lefts.length === farmDrop.length && lefts.every((b) => b.hand === 'left'), `a buzz in the left hand for each (${lefts.map((b) => b.hand).join(', ')})`);
  check(t.lying === before.lying - 1, `and the drop is gone (${t.lying} lying)`);
}

// 3. The lumber camp's leader falls; walk over its drop.
{
  const leader = (await campMembers('lumberCamp')).find((m) => m.role === 'leader');
  await standBy(leader, 3);
  await fell('lumberCamp', leader.i);
  let t = await look();
  const roll = t.rolled.at(-1);
  const pouch = t.pieces.find((p) => p.item === null);
  const [low, high] = await page.evaluate(() => window.__descent.CONFIG.loot.coins);
  check(roll?.role === 'leader' && roll.level === 2 && pouch?.coins >= low * 6 && pouch.coins <= high * 6, `the leader (level 2) drops ${pouch?.coins} coins`);
  const items = await Promise.all(t.pieces.filter((p) => p.item).map(async (p) => ({ ...(await itemOf(p.item)), beam: p.beam })));
  const gear = items.filter((i) => i.kind === 'gear');
  check(
    gear.length === 1 && ['green', 'blue'].includes(gear[0].rarity) && gear[0].level === 2 && (gear[0].class ?? 'warrior') === 'warrior' && (gear[0].main ?? 'strength') === 'strength',
    `and one ${gear[0]?.rarity} for a warrior at item level 2: ${gear[0]?.name}`,
  );
  check(gear[0]?.beam === true && items.filter((i) => i.kind === 'junk').every((i) => !i.beam), `which raises a beam (junk doesn't)`);
  await page.evaluate(() => window.__descent.device.quaternion.set(Math.sin(-0.12), 0, 0, Math.cos(-0.12)));
  await xrFrames(3);
  await shot('02-leader-drop');
  await page.evaluate(() => window.__descent.device.quaternion.set(0, 0, 0, 1));
  await xrFrames(2);
  const before = t;
  // Walk onto it: stand on the pouch.
  await standFacing(pouch.at.x, pouch.at.z, pouch.at.x, pouch.at.z - 1);
  await step(0.1);
  t = await look();
  check(t.coins === before.coins + pouch.coins, `walking over it takes the coins (${t.coins})`);
  check(items.every((i) => t.bag.includes(`${i.id}×1`)), `and every item into the bag (${t.bag.filter(Boolean).join(', ')})`);
  check(t.lying === before.lying - 1, `and nothing's left (${t.lying} lying)`);
}

// 4. A full bag.
{
  const room = await page.evaluate(() => {
    const { state } = window.__descent;
    const free = state.inventory.bag.filter((s) => s === null).length;
    state.inventory.take(Array.from({ length: free }, () => ({ id: 'iron-longsword-1', count: 1 })));
    return state.inventory.bag.filter((s) => s === null).length;
  });
  check(room === 0, `the bag is filled (${room} slots free)`);
  let drop = null;
  let laid = false;
  for (const m of (await campMembers('lumberCamp')).filter((m) => m.alive)) {
    await standBy(m, 3);
    const before = await look();
    await fell('lumberCamp', m.i);
    const t = await look();
    const fresh = t.pieces.filter((p) => !before.pieces.some((q) => q.at.x === p.at.x && q.at.z === p.at.z && q.item === p.item));
    if (fresh.some((p) => p.item)) {
      drop = fresh;
      break;
    }
  }
  if (!drop) {
    // None of the camp dropped an item this time: lay a thug's drop where the last one fell.
    laid = true;
    drop = await page.evaluate(() => {
      const { adventure, player } = window.__descent;
      const at = player.rig.position.clone();
      at.z -= 2.5;
      at.y = window.__descent.world.heightAt?.(at.x, at.z) ?? at.y;
      adventure.drops.drop(at, { coins: 4, items: ['iron-longsword-2'] }, null);
      return adventure.drops.pieces.slice(-2).map((p) => ({ coins: p.coins, item: p.item, at: { x: p.at.x, y: p.at.y, z: p.at.z } }));
    });
  }
  const pouch = drop.find((p) => p.item === null);
  const item = drop.find((p) => p.item);
  await standBy(pouch.at, 0.95);
  const before = await look();
  await touch(pouch.at);
  let t = await look();
  const thugs = t.rolled.filter((r) => r.role === 'ordinary' && r.level === 2).map((r) => `${r.coins}c ${r.items.join('+') || '-'}`);
  check(t.coins === before.coins + pouch.coins, `with the bag full, the pouch's ${pouch.coins} coins are still taken${laid ? ` (a drop laid there: the camp's thugs dropped no item: ${thugs.join(', ')})` : ''}`);
  await fistTo('left', await rigAt(item.at));
  await step(1 / 36);
  t = await look();
  const it = t.pieces.find((p) => p.item === item.item && Math.abs(p.at.x - item.at.x) < 0.01);
  check(it?.flashing === true, `${item.item} stays on the ground, flashing red`);
  check(t.floats.includes('Bag full'), `"Bag full" floats over it (${t.floats.join(', ')})`);
  const buzz = t.buzzes.at(-1);
  check(buzz?.hand === 'left' && buzz.i === 1, `with a strong buzz in the left hand (${JSON.stringify(buzz)})`);
  check(JSON.stringify(t.bag) === JSON.stringify(before.bag), `and the bag is unchanged`);
  await page.evaluate(() => window.__descent.device.quaternion.set(Math.sin(-0.2), 0, 0, Math.cos(-0.2)));
  await xrFrames(3);
  await shot('03-bag-full');
  await page.evaluate(() => window.__descent.device.quaternion.set(0, 0, 0, 1));
  await handDown('left');
  await step(0.1);
  await page.evaluate(() => window.__descent.state.inventory.move({ in: 'bag', slot: 15 }, { in: 'ground' }));
  await touch(item.at);
  t = await look();
  check(t.bag[15] === `${item.item}×1` && !t.pieces.some((p) => p.item === item.item && Math.abs(p.at.x - item.at.x) < 0.01), `with room made, a new touch takes it (${t.bag[15]})`);
}

// 5. Twelve drops with twelve beams, in view.
{
  const spot = await page.evaluate(() => window.__descent.world.zoneAt(0, 0).spawn);
  await standFacing(spot.x, spot.z, spot.x, spot.z - 10);
  await page.evaluate(() => window.__descent.adventure.drops.clear());
  await step(0.5);
  await xrFrames(4);
  const calls = () => page.evaluate(() => window.__descent.renderer.info.render.calls);
  const without = await calls();
  const trianglesWithout = await page.evaluate(() => window.__descent.renderer.info.render.triangles);
  const lying = await page.evaluate(() => {
    const { adventure, player, world } = window.__descent;
    const head = player.rig.position;
    for (let i = 0; i < 13; i++) {
      const x = head.x - 3 + (i % 5) * 1.5;
      const z = head.z - 3 - Math.floor(i / 5) * 1.5;
      const y = world.heightAt?.(x, z) ?? head.y;
      const blue = i % 2 === 0;
      const items = ['grave-dust-3', blue ? 'chain-coif-of-the-bear-3' : 'studded-coif-of-the-bear-3'];
      adventure.drops.drop(head.clone().set(x, y, z), { coins: 5 + i, items }, null);
    }
    return { lying: adventure.drops.lying, beams: adventure.drops.pieces.filter((p) => p.beam).length, oldest: adventure.drops.pieces[0].coins };
  });
  check(lying.lying === 12 && lying.beams === 12 && lying.oldest === 6, `twelve drops and twelve beams lie at once; the thirteenth took the oldest's place (${JSON.stringify(lying)})`);
  await step(1 / 72);
  await xrFrames(4);
  const withDrops = await calls();
  const info = await page.evaluate(() => ({ triangles: window.__descent.renderer.info.render.triangles, programs: window.__descent.renderer.info.programs.length }));
  check(withDrops <= 300, `draw calls with them in view: ${withDrops} (${without} without, both eyes), inside the 300 budget; ${(info.triangles / 1000).toFixed(1)}k triangles (${(trianglesWithout / 1000).toFixed(1)}k without), ${info.programs} programs`);
  await shot('04-twelve-drops');
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
