// Checks for the vendors (issues/14-vendors.md) in headless Chromium with the
// IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/inventory/checks/vendors.mjs [http://localhost:5173] [shots/]
//
// Oakvale at the plain URL for a new character carrying some junk and a spare
// tunic, paused and stepped in the page (`step`, `teleport`); the hands moved
// and the grips squeezed through the emulated controllers, and every buzz
// recorded. What it checks:
//
// 1. Walking up to the smith looking their way unfolds their wares board
//    beside them, with the bag panel opening beside it (no reach), both in
//    one plane. The board shows the smith's sixteen wares, each with its price
//    under it, all dimmed with 0 coins. It costs about three draws an eye.
// 2. Touching the level-1 iron longsword shows its card with its price in
//    red; the grip on it refuses (too few coins) with a strong buzz.
// 3. "Sell junk" sells every grey in the bag at once: the coins come, the
//    slots empty, and the Sold row fills.
// 4. The spare tunic carried onto the board is sold; carried back off the
//    Sold row into the bag it's bought back at what it fetched.
// 5. Walking off folds the board and the bag with it.
// 6. At the innkeeper's, the minor healing potion is bought by carrying it
//    into a bag slot, for 8 coins.
// 7. Leaving the zone empties the Sold row; a reload keeps coins and the bag.
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

// Every canvas remembers what was written on it (and in which colour) since it was last cleared.
await page.addInitScript(() => {
  const P = CanvasRenderingContext2D.prototype;
  const fill = P.fillText;
  const clear = P.clearRect;
  P.fillText = function (text, ...rest) {
    (this.__texts ??= []).push({ text: String(text), color: String(this.fillStyle) });
    return fill.call(this, text, ...rest);
  };
  P.clearRect = function (...args) {
    this.__texts = [];
    return clear.apply(this, args);
  };
});

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
/** Run the game `s` seconds, your health kept full. */
const step = (s) =>
  page.evaluate((s) => {
    const { adventure } = window.__descent;
    for (let t = 0; t < s - 1e-9; t += 1 / 72) {
      if (adventure.player.alive) adventure.player.hp = adventure.player.maxHp;
      adventure.update(1 / 72);
    }
  }, s);

async function enter() {
  await page.goto(`${base}/?emulate&nodevui`);
  await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 180000 });
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  await page.evaluate(() => {
    const d = window.__descent;
    d.paused = true;
    d.buzzes = [];
    const input = d.player.input;
    const pulse = input.pulse.bind(input);
    input.pulse = (hand, intensity, ms) => {
      d.buzzes.push({ hand, intensity, ms });
      pulse(hand, intensity, ms);
    };
  });
  await handsDown();
}

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
  await step(0.5);
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
  await step(0.3);
}

/** Move a controller so that its grip (the fist) lands at a world point: XR frames only, the game doesn't step. */
async function fistTo(hand, w) {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(
      ([hand, w]) => {
        const { player, device } = window.__descent;
        const want = player.rig.worldToLocal(player.rig.position.clone().set(w.x, w.y, w.z));
        const g = player.input.hands[hand].grip.position;
        const c = device.controllers[hand].position;
        c.set(c.x + want.x - g.x, c.y + want.y - g.y, c.z + want.z - g.z);
      },
      [hand, w],
    );
    await xrFrames(2);
  }
}
async function fistAt(hand, w) {
  await fistTo(hand, w);
  await step(1 / 72);
}
async function grip(hand, value) {
  await page.evaluate(([hand, v]) => window.__descent.device.controllers[hand].updateButtonValue('squeeze', v), [hand, value]);
  await xrFrames(2);
  await step(1 / 72);
}
/** Both hands low at your sides, out of the way. */
async function handsDown() {
  for (const [hand, x] of [['left', -0.3], ['right', 0.3]]) {
    await fistAt(hand, await page.evaluate((x) => {
      const d = window.__descent;
      const p = d.player.rig.localToWorld(d.player.rig.position.clone().set(x, 0.7, 0.15));
      return { x: p.x, y: p.y, z: p.z };
    }, x));
  }
}
/** The world point just off a wares slot's face (the Sold row's from 16). */
const wareAt = (i, off = 0.015) =>
  page.evaluate(([i, off]) => {
    const p = window.__descent.wares.slotWorld(i, window.__descent.camera.position.clone(), off);
    return { x: p.x, y: p.y, z: p.z };
  }, [i, off]);
/** The world point just off a bag slot's face. */
const bagAt = (i, off = 0.015) =>
  page.evaluate(([i, off]) => {
    const p = window.__descent.bag.panel.slotWorld({ in: 'grid', i }, window.__descent.camera.position.clone(), off);
    return { x: p.x, y: p.y, z: p.z };
  }, [i, off]);
const sellJunkAt = () =>
  page.evaluate(() => {
    const p = window.__descent.wares.sellJunkWorld(window.__descent.camera.position.clone());
    return { x: p.x, y: p.y, z: p.z };
  });
/** A point `d` metres straight out from the wares board's face at `w`. */
const outFrom = (w, d) =>
  page.evaluate(([w, d]) => {
    const { root } = window.__descent.wares;
    const o = root.getWorldPosition(root.position.clone());
    const n = root.localToWorld(root.position.clone().set(0, 0, 1)).sub(o);
    return { x: w.x + n.x * d, y: w.y + n.y * d, z: w.z + n.z * d };
  }, [w, d]);
/** Touch `from` with the right fist, squeeze, carry it to `to` and let go. */
async function carry(from, to) {
  await fistAt('right', await outFrom(from, 0.1));
  await fistAt('right', from);
  await grip('right', 1);
  const holding = await page.evaluate(() => window.__descent.bag.holding?.id ?? null);
  await fistAt('right', await outFrom(to, 0.05));
  await fistAt('right', to);
  await grip('right', 0);
  await fistAt('right', await outFrom(to, 0.15));
  await step(0.2);
  return holding;
}

/** What a player would notice. */
const state = () =>
  page.evaluate(() => {
    const d = window.__descent;
    const { bag, wares, state } = d;
    const inv = state.inventory;
    const bp = bag.panel.root.getWorldPosition(bag.panel.root.position.clone());
    const wp = wares.root.getWorldPosition(wares.root.position.clone());
    const wn = wares.root.getWorldDirection(wp.clone());
    const bn = bag.panel.root.getWorldDirection(wp.clone());
    return {
      waresOpen: wares.isOpen,
      waresShown: wares.root.visible,
      vendor: wares.vendor,
      wares: Array.from({ length: 16 }, (_, i) => wares.stackAt(i)?.id ?? null),
      sold: inv.sold.map((s) => `${s.id}×${s.count} ${s.price}`),
      board: wares.board.ctx.__texts ?? [],
      card: wares.card.mesh.visible ? (wares.card.ctx.__texts ?? []) : null,
      bagCard: bag.panel.card.mesh.visible ? (bag.panel.card.ctx.__texts ?? []) : null,
      frames: Array.from({ length: 22 }, (_, i) => {
        wares.frames.getColorAt(i, d.__c ??= wares.card.mesh.material.color.clone());
        return d.__c.r + d.__c.g + d.__c.b;
      }),
      icons: Array.from(wares.icons.geometry.getAttribute('color').array.filter((_, k) => k % 12 === 0).slice(0, 22)),
      bagOpen: bag.isOpen,
      pinned: bag.isPinned,
      apart: Math.hypot(bp.x - wp.x, bp.z - wp.z),
      facing: wn.dot(bn),
      coins: inv.coins,
      slots: inv.bag.map((s) => (s ? `${s.id}×${s.count}` : null)),
      holding: bag.holding?.id ?? null,
      lines: [...bag.lines],
      buzzes: [...d.buzzes],
    };
  });

await enter();
// Junk, a spare tunic, and nothing in the purse.
await page.evaluate(() => {
  const { adventure, state } = window.__descent;
  const effects = state.inventory.take([
    { id: 'torn-cloth-1', count: 3 },
    { id: 'bone-charm-2', count: 1 },
    { id: 'worn-tunic', count: 1 },
  ]);
  adventure.applyThings(effects, adventure.player.rig.position);
});

// 1. Walking up to the smith.
{
  await standBy('smith', 2);
  await step(0.4);
  await xrFrames(4);
  const s = await state();
  check(s.waresOpen && s.vendor === 'smith', `walking up to the smith unfolds their wares board (${s.vendor})`);
  check(s.bagOpen && s.pinned && s.lines.some((l) => /opened: beside the smith's wares/.test(l)), `the bag panel opens beside it, no reach (${s.lines.at(-1)})`);
  check(s.apart > 0.45 && s.apart < 0.8 && s.facing > 0.9, `side by side, ${(s.apart * 100).toFixed(0)} cm apart, facing the same way (${s.facing.toFixed(2)})`);
  const levels = s.wares.map((id) => id?.replace(/.*-/, '')).join(',');
  check(s.wares.filter(Boolean).length === 16 && s.wares.includes('iron-longsword-5') && s.wares.includes('padded-jerkin-4'), `sixteen wares: ${s.wares.slice(0, 6).join(', ')}… (levels ${levels})`);
  const prices = s.board.filter((t) => /coins?$/.test(t.text));
  check(prices.length === 16 && prices.every((t) => /#b02818/i.test(t.color)), `each ware's price under it, in red with 0 coins (${prices.slice(0, 4).map((t) => t.text).join(', ')}…)`);
  check(s.icons.slice(0, 16).every((k) => k < 0.5) && s.frames.slice(0, 16).every((k) => k < 1.2), `every ware dimmed (icons at ${s.icons[0]})`);
  await shot('01-smith-wares');

  const calls = await page.evaluate(async () => {
    const { wares, renderer } = window.__descent;
    const session = renderer.xr.getSession();
    const frame = () => new Promise((r) => session.requestAnimationFrame(() => session.requestAnimationFrame(r)));
    const diffs = [];
    for (let i = 0; i < 3; i++) {
      await frame();
      const open = renderer.info.render.calls;
      wares.root.visible = false;
      await frame();
      const shut = renderer.info.render.calls;
      wares.root.visible = true;
      diffs.push(open - shut);
    }
    diffs.sort((a, b) => a - b);
    return { board: diffs[1], views: renderer.xr.getCamera().cameras.length };
  });
  const perEye = calls.board / calls.views;
  check(perEye >= 2 && perEye <= 4, `the wares board costs ${perEye} draws an eye (${calls.board} over ${calls.views} eyes)`);
}

// 2. What you can't afford.
await stepUp();
{
  await page.evaluate(() => (window.__descent.buzzes.length = 0));
  const sword = await wareAt(0);
  await fistAt('right', await outFrom(sword, 0.1));
  await fistAt('right', sword);
  await step(1 / 72); // the board shows what the bag's hands touched a frame later
  let s = await state();
  const title = s.card?.[0];
  const cost = s.card?.find((t) => /^Costs/.test(t.text));
  check(title?.text === 'Iron Longsword' && cost?.text === 'Costs 12 coins' && /#ff5040/i.test(cost.color), `touching the iron longsword shows its card, "${cost?.text}" in red`);
  await grip('right', 1);
  s = await state();
  check(!s.holding && /refused \(too few coins\): Iron Longsword/.test(s.lines.at(-1)) && s.buzzes.some((b) => b.intensity >= 1), `the grip on it refuses with a strong buzz (${s.lines.at(-1)})`);
  await grip('right', 0);
  await shot('02-too-dear');
}

// 3. Sell junk.
{
  await page.evaluate(() => (window.__descent.buzzes.length = 0));
  const button = await sellJunkAt();
  await fistAt('right', await outFrom(button, 0.1));
  await fistAt('right', button);
  await step(0.1);
  const s = await state();
  check(s.coins === 3 * 2 + 2 * 2 && s.slots[0] === null && s.slots[1] === null, `"Sell junk" sells the torn cloth and the bone charm: ${s.coins} coins`);
  check(s.sold.length === 2 && s.sold[0] === 'bone-charm-2×1 4', `the Sold row holds them, newest first (${s.sold.join(', ')})`);
  check(s.buzzes.some((b) => b.hand === 'right' && b.intensity >= 0.8), 'with a buzz in the hand that pressed');
  await handsDown();
}

// 4. Sell the tunic onto the board, and buy it back.
{
  const s0 = await state();
  const tunic = s0.slots.indexOf('worn-tunic×1');
  let held = await carry(await bagAt(tunic), await wareAt(5));
  let s = await state();
  check(held === 'worn-tunic' && s.slots[tunic] === null && s.coins === s0.coins + 3 && s.sold[0] === 'worn-tunic×1 3', `the tunic carried onto the board is sold for 3 coins (${s.lines.at(-1)})`);
  await shot('03-sold');
  held = await carry(await wareAt(16), await bagAt(6));
  s = await state();
  check(held === 'worn-tunic' && s.slots[6] === 'worn-tunic×1' && s.coins === s0.coins && s.sold.length === 2, `carried off the Sold row into bag slot 7, it's bought back at 3 (${s.lines.at(-1)})`);
  await handsDown();
}

// 5. Walk off.
{
  await standBy('smith', 4.5);
  await step(0.5);
  const s = await state();
  check(!s.waresOpen && !s.waresShown && !s.bagOpen, `walking off folds the board and the bag with it (${s.lines.at(-1)})`);
}

// 6. The innkeeper's potion.
{
  await page.evaluate(() => {
    const { adventure, state } = window.__descent;
    adventure.applyThings(state.inventory.take([], 20), adventure.player.rig.position);
  });
  await standBy('innkeeper', 2);
  await step(0.4);
  let s = await state();
  check(s.waresOpen && s.vendor === 'innkeeper' && s.wares.filter(Boolean).join() === 'minor-healing-potion' && s.bagOpen, `the innkeeper's board unfolds with the minor healing potion (${s.board.filter((t) => /coins?$/.test(t.text)).map((t) => t.text).join()})`);
  await stepUp();
  const coins = s.coins;
  const held = await carry(await wareAt(0), await bagAt(12));
  s = await state();
  check(held === 'minor-healing-potion' && s.slots[12] === 'minor-healing-potion×1' && s.coins === coins - 8, `carried into the bag it's bought for 8 coins (${coins} to ${s.coins}; ${s.lines.at(-1)})`);
  check(s.wares[0] === 'minor-healing-potion', 'and the innkeeper still has it: stock never runs out');
  await shot('04-innkeeper');
}

// 7. Leaving the zone, and a reload.
{
  await page.evaluate(() => window.__descent.world.onZone({ label: 'Brackenmoor', id: 'brackenmoor' }));
  let s = await state();
  check(s.sold.length === 0, 'leaving the zone empties the Sold row');
  const before = { coins: s.coins, slots: s.slots };
  await page.evaluate(() => window.__descent.saved());
  await enter();
  s = await state();
  check(s.coins === before.coins && JSON.stringify(s.slots) === JSON.stringify(before.slots), `a reload keeps your coins (${s.coins}) and what you bought`);
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
