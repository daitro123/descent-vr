// Checks for Oakvale's chests (issues/13-oakvales-chests.md) in headless
// Chromium with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/inventory/checks/chests.mjs [http://localhost:5173] [shots/]
//
// Start the dev server fresh: the chest's sound is counted by wrapping
// `sfx.chest` in the page, which misses if a file changed since it started.
//
// A new character in a fresh browser profile, at the plain URL (so it saves).
// Game time is stepped through the debug handle (`paused`, `step`,
// `teleport`), not XR frames. The watchtower's gang is felled with a blow big
// enough to kill, and its drops cleared, before you walk up to the chest.
// The save is read back from IndexedDB itself.
//
// 1. Oakvale has its three chests, all shut: the watchtower's, the leader's
//    tent's and the strongbox in the dig.
// 2. Standing before the watchtower's chest, the left fist touches its lid: it
//    swings open with the chest's sound and a buzz in the left hand, and what
//    was inside lies on the ground beside it (a pouch of 10 coins and one
//    green or blue of item level 2 for a warrior, with its beam), not yet in
//    the bag. The save is written at once, with the chest opened.
// 3. Walking over the drop takes it all, as a kill's.
// 4. A reload: before VR the watchtower's chest shows open, the others shut.
//    In VR, touching its lid again does nothing: no drop, no buzz, no sound.
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

/** The record IndexedDB holds, or null; never creates the database. */
const record = () =>
  page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((d) => d.name === 'descent-vr')) return null;
    return new Promise((resolve, reject) => {
      const open = indexedDB.open('descent-vr');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('save')) return db.close(), resolve(null);
        const get = db.transaction('save').objectStore('save').get('character');
        get.onsuccess = () => (db.close(), resolve(get.result ?? null));
        get.onerror = () => reject(get.error);
      };
    });
  });

/** Open the game, wait for the Adventure, and count every buzz and chest sound from here on. */
async function open() {
  await page.goto(`${base}/?emulate&nodevui`);
  await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
  await page.evaluate(async () => {
    const d = window.__descent;
    d.buzzes = [];
    const input = d.player.input;
    const pulse = input.pulse.bind(input);
    input.pulse = (hand, i, ms) => {
      d.buzzes.push({ hand, i, ms });
      pulse(hand, i, ms);
    };
    d.sounds = [];
    const { sfx } = await import('/src/fx/sfx.ts');
    const chest = sfx.chest.bind(sfx);
    sfx.chest = (at) => {
      d.sounds.push(at && { x: at.x, y: at.y, z: at.z });
      chest(at);
    };
  });
}
async function enterVR() {
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  await page.evaluate(() => {
    const d = window.__descent;
    d.paused = true;
    d.device.controllers.left.position.set(-0.4, 0.3, 0.2);
    d.device.controllers.right.position.set(0.4, 0.3, 0.2);
  });
  await xrFrames(2);
}

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

/** The zone's chests, as planned. */
const plans = () => page.evaluate(() => window.__descent.world.zoneAt(0, 0).chests);
/** What lies on the ground, what you have, each lid, and what buzzed and sounded. */
const look = () =>
  page.evaluate(() => {
    const { adventure, state, buzzes, sounds } = window.__descent;
    return {
      lying: adventure.drops.lying,
      pieces: adventure.drops.pieces.map((p) => ({ coins: p.coins, item: p.item, beam: p.beam, at: { x: p.at.x, y: p.at.y, z: p.at.z } })),
      coins: state.inventory.coins,
      bag: state.inventory.bag.map((s) => s && `${s.id}×${s.count}`),
      opened: [...state.inventory.chests],
      lids: { ...adventure.chests.lids },
      buzzes: [...buzzes],
      sounds: [...sounds],
    };
  });
/** An item's catalogue entry, from the dev server's source. */
const itemOf = (id) => page.evaluate(async (id) => (await import('/src/items.ts')).itemOf(id), id);
/** Where you stand to lift `chest`'s lid, and the lid's top. */
const size = (chest) => page.evaluate((look) => window.__descent.CONFIG.chests.looks[look], chest.look);
async function before(chest) {
  const { d, h, lid } = await size(chest);
  const out = d / 2 + 0.4;
  const stand = { x: chest.x + Math.sin(chest.yaw) * out, z: chest.z + Math.cos(chest.yaw) * out };
  return { stand, lid: { x: chest.x + Math.sin(chest.yaw) * 0.05, y: chest.y + h + lid, z: chest.z + Math.cos(chest.yaw) * 0.05 } };
}
/** Look down at the chest a little, for a shot. */
async function lookDown(at) {
  await page.evaluate(() => window.__descent.device.quaternion.set(Math.sin(-0.3), 0, 0, Math.cos(-0.3)));
  await xrFrames(3);
  await shot(at);
  await page.evaluate(() => window.__descent.device.quaternion.set(0, 0, 0, 1));
  await xrFrames(2);
}

await open();
await enterVR();
await step(0.5);

// 1. Three chests, all shut.
const chests = await plans();
const tower = chests.find((c) => c.id === 'oakvale-watchtower');
{
  const t = await look();
  check(
    chests.map((c) => `${c.id} (${c.look}, level ${c.level})`).join(', ') ===
      'oakvale-watchtower (chest, level 2), oakvale-leaders-tent (chest, level 2), oakvale-strongbox (strongbox, level 4)',
    `Oakvale's chests: ${chests.map((c) => `${c.id} (${c.look}, level ${c.level})`).join(', ')}`,
  );
  check(Object.values(t.lids).every((l) => l === 0) && t.opened.length === 0, `all shut, none opened (${JSON.stringify(t.lids)})`);
}

// 2. Open the watchtower's chest.
{
  // The watchtower's gang falls first, and what it dropped is cleared away.
  await page.evaluate(() => {
    const camp = window.__descent.camps.camps.find((c) => c.plan.id === 'watchtower');
    for (const m of camp.members) m.enemy.takeHit(99999, m.enemy.position.clone().set(0, 0, 0));
  });
  await step(1);
  await page.evaluate(() => window.__descent.adventure.drops.clear());
  const { stand, lid } = await before(tower);
  await standFacing(stand.x, stand.z, tower.x, tower.z);
  await lookDown('01-watchtower-chest-shut');
  const was = await look();
  const beforeWrite = (await record())?.savedAt ?? 0;
  await touch(lid);
  await step(0.8);
  const t = await look();
  const buzz = t.buzzes.slice(was.buzzes.length);
  check(t.opened.includes('oakvale-watchtower') && t.lids['oakvale-watchtower'] === 1, `touching its lid opens it (lid ${t.lids['oakvale-watchtower']})`);
  check(t.sounds.length === was.sounds.length + 1, `with the chest's sound (${t.sounds.length - was.sounds.length})`);
  check(buzz.length === 1 && buzz[0].hand === 'left' && buzz[0].i === 0.7, `and a buzz in the left hand (${JSON.stringify(buzz)})`);
  check(t.lying === 1, `what was inside lies on the ground (${t.lying} drop)`);
  const pouch = t.pieces.find((p) => p.item === null);
  check(pouch?.coins === 10, `a pouch of ${pouch?.coins} coins (5 × level 2)`);
  const items = await Promise.all(t.pieces.filter((p) => p.item).map(async (p) => ({ ...(await itemOf(p.item)), beam: p.beam })));
  check(
    items.length === 1 && ['green', 'blue'].includes(items[0].rarity) && items[0].level === 2 && (items[0].class ?? 'warrior') === 'warrior' && (items[0].main ?? 'strength') === 'strength' && items[0].beam,
    `and one ${items[0]?.rarity} of item level 2 for a warrior, with its beam: ${items[0]?.name}`,
  );
  const off = Math.hypot(pouch.at.x - tower.drop.x, pouch.at.z - tower.drop.z);
  check(off < 0.01 && Math.hypot(pouch.at.x - stand.x, pouch.at.z - stand.z) > 0.9, `beside the chest, out of your feet's way (${off.toFixed(2)} m from its spot)`);
  check(t.coins === was.coins && JSON.stringify(t.bag) === JSON.stringify(was.bag), `and not yet yours (${t.coins} coins, the bag unchanged)`);
  await page.evaluate(() => window.__descent.saved());
  const r = await record();
  check(r && r.savedAt > beforeWrite && r.inventory.chests.includes('oakvale-watchtower'), `the save is written at once, with the chest opened (${JSON.stringify(r?.inventory.chests)})`);
  await lookDown('02-watchtower-chest-open');

  // 3. Walk over what came out.
  await standFacing(pouch.at.x, pouch.at.z, tower.x, tower.z);
  await step(0.1);
  const after = await look();
  check(after.coins === t.coins + 10 && after.bag.includes(`${items[0].id}×1`) && after.lying === 0, `walking over it takes it all (${after.coins} coins, ${after.bag.filter(Boolean).join(', ')})`);
  await page.evaluate(() => window.__descent.saved());
}

// 4. A reload.
await open();
{
  const t = await look();
  check(
    t.lids['oakvale-watchtower'] === 1 && t.lids['oakvale-leaders-tent'] === 0 && t.lids['oakvale-strongbox'] === 0,
    `after a reload, before VR, the watchtower's chest shows open and the others shut (${JSON.stringify(t.lids)})`,
  );
  await enterVR();
  const { stand, lid } = await before(tower);
  await standFacing(stand.x, stand.z, tower.x, tower.z);
  await lookDown('03-watchtower-chest-open-after-reload');
  const was = await look();
  await touch(lid);
  await step(0.5);
  const again = await look();
  check(
    again.lying === 0 && again.buzzes.length === was.buzzes.length && again.sounds.length === was.sounds.length && again.coins === was.coins,
    `and it's empty: touching its lid again drops nothing, with no buzz or sound (${again.lying} lying, ${again.coins} coins)`,
  );
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
