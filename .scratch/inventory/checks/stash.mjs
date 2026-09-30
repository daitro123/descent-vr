// Checks for the stash (issues/15-the-stash.md) in headless Chromium with the
// IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/inventory/checks/stash.mjs [http://localhost:5173] [shots/]
//
// A new character in Oakvale at the plain URL, paused and stepped in the page
// (`step`, `teleport`), standing in the Golden Tankard before the stash's
// chest; the hands moved and the grips squeezed through the emulated
// controllers, and every buzz recorded. What it checks:
//
// 1. The chest stands in the inn's room by the hearth, drawn while you're in.
//    A fist arriving on its lid opens the stash panel on the bag panel's left
//    with the bag's beside it, no reach needed, with a buzz, and the lid
//    swings up. No new shader program compiles as it first opens, and the
//    stash panel costs about 3 draws an eye.
// 2. The bone charm carried from the bag onto the stash's first page goes in;
//    the Page 2 tab shows the second page, and the potions carried onto it go
//    in too. The stash's caption counts them.
// 3. The leader's orders can't be carried off the quest page, so can't be
//    stashed.
// 4. Walking off shuts both panels, and the lid.
// 5. A reload keeps the stash. Back at the chest, the potions are taken from
//    the second page back into the bag.
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

// Every canvas remembers what was written on it since it was last cleared.
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
    d.device.controllers.left.position.set(-0.3, 1.0, -0.1);
    d.device.controllers.right.position.set(0.3, 1.0, -0.1);
    d.buzzes = [];
    const input = d.player.input;
    const pulse = input.pulse.bind(input);
    input.pulse = (hand, intensity, ms) => {
      d.buzzes.push({ hand, intensity, ms });
      pulse(hand, intensity, ms);
    };
  });
  await xrFrames(3);
  await step(0.3);
}

/** Stand inside the inn, `back` m out from the chest's front, facing it. */
async function standAtChest(back = 0.5) {
  await page.evaluate((back) => {
    const d = window.__descent;
    const { spot } = d.adventure.stashChest;
    const fx = Math.sin(spot.yaw);
    const fz = Math.cos(spot.yaw);
    const x = spot.x + fx * (0.225 + back);
    const z = spot.z + fz * (0.225 + back);
    d.world.settle('inn');
    // Yaw 0 looks down −Z: look back along the chest's front, at it.
    d.teleport(x, z, Math.atan2(fx, fz));
  }, back);
  await xrFrames(3);
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
const vec = (p) => ({ x: p.x, y: p.y, z: p.z });
/** The world point just off a bag slot's face: a page slot's index, or a gear slot's name. */
const bagSlot = (ref, off = 0.015) =>
  page.evaluate(
    ([ref, off]) => {
      const { bag, camera } = window.__descent;
      const spot = typeof ref === 'number' ? { in: 'grid', i: ref } : { in: 'gear', slot: ref };
      const p = bag.panel.slotWorld(spot, camera.position.clone(), off);
      return { x: p.x, y: p.y, z: p.z };
    },
    [ref, off],
  );
const stashSlot = (i, off = 0.015) =>
  page.evaluate(
    ([i, off]) => {
      const { adventure, camera } = window.__descent;
      const p = adventure.stash.slotWorld(i, camera.position.clone(), off);
      return { x: p.x, y: p.y, z: p.z };
    },
    [i, off],
  );
const bagTab = (tab) =>
  page.evaluate((tab) => {
    const { bag, camera } = window.__descent;
    const p = bag.panel.tabWorld(tab, camera.position.clone(), 0.015);
    return { x: p.x, y: p.y, z: p.z };
  }, tab);
const stashTab = (n) =>
  page.evaluate((n) => {
    const { adventure, camera } = window.__descent;
    const p = adventure.stash.tabWorld(n, camera.position.clone(), 0.015);
    return { x: p.x, y: p.y, z: p.z };
  }, n);
/** A point `d` metres straight out from a panel's face at `w` (towards you): the bag's, or the stash's. */
const outFrom = (w, d, which = 'bag') =>
  page.evaluate(
    ([w, d, which]) => {
      const { bag, adventure } = window.__descent;
      const root = which === 'stash' ? adventure.stash.root : bag.panel.root;
      const o = root.getWorldPosition(root.position.clone());
      const n = root.localToWorld(root.position.clone().set(0, 0, 1)).sub(o);
      return { x: w.x + n.x * d, y: w.y + n.y * d, z: w.z + n.z * d };
    },
    [w, d, which],
  );
/** What a player would notice. */
const state = () =>
  page.evaluate(() => {
    const d = window.__descent;
    const { bag, state, adventure } = d;
    const inv = state.inventory;
    const { stash, stashChest } = adventure;
    const head = d.camera.getWorldPosition(d.camera.position.clone());
    const bp = bag.panel.root.getWorldPosition(bag.panel.root.position.clone());
    const sp = stash.root.getWorldPosition(stash.root.position.clone());
    // Which side of you the stash panel is on: + to your right.
    const gaze = d.camera.getWorldDirection(d.camera.position.clone());
    const right = { x: -gaze.z, z: gaze.x };
    return {
      open: bag.isOpen,
      stashOpen: stash.isOpen,
      stashPage: stash.page,
      bagPage: bag.panel.page,
      chestShown: stashChest.shown,
      lid: stashChest.lidUp,
      stashSide: (sp.x - bp.x) * right.x + (sp.z - bp.z) * right.z,
      stashCard: stash.card.mesh.visible ? (stash.card.ctx.__texts ?? []) : null,
      stashBoard: stash.board.ctx.__texts ?? [],
      slots: inv.bag.map((s) => (s ? `${s.id}×${s.count}` : null)),
      stash: inv.stash.map((s) => (s ? `${s.id}×${s.count}` : null)),
      quest: [...inv.quest],
      holding: bag.holding?.id ?? null,
      last: bag.lines.at(-1) ?? '',
      lines: [...bag.lines],
      buzzes: [...d.buzzes],
      interior: d.world.interior,
      panelFrom: { out: Math.hypot(bp.x - head.x, bp.z - head.z) },
    };
  });

/** Touch a slot at `from` (a world point) with the right fist, squeeze, carry it to `to` and let go. */
async function carry(from, to, fromPanel = 'bag') {
  await fistAt('right', await outFrom(from, 0.1, fromPanel));
  await fistAt('right', from);
  await grip('right', 1);
  const holding = (await state()).holding;
  await fistAt('right', to);
  await grip('right', 0);
  await step(0.2);
  return { holding };
}
/** Hands down out of the way. */
async function handsDown() {
  for (const [hand, x] of [['right', 0.3], ['left', -0.3]]) {
    await fistAt(hand, await page.evaluate((x) => {
      const d = window.__descent;
      const p = d.player.rig.localToWorld(d.player.rig.position.clone().set(x, 0.9, 0.1));
      return { x: p.x, y: p.y, z: p.z };
    }, x));
  }
}
/** Press a tab at `w` with the right fist: in from in front of it. */
async function press(w, which) {
  await fistAt('right', await outFrom(w, 0.08, which));
  await step(0.1);
  await fistAt('right', w);
  await step(0.05);
  await fistAt('right', await outFrom(w, 0.1, which));
}
/** Touch the chest's lid with the right fist, from over it. */
async function touchLid() {
  const lid = await page.evaluate(() => {
    const d = window.__descent;
    return (({ x, y, z }) => ({ x, y, z }))(d.adventure.stashChest.lidWorld(d.camera.position.clone(), 0.02));
  });
  await fistAt('right', { ...lid, y: lid.y + 0.3 });
  await step(0.1);
  await fistAt('right', lid);
  await step(0.05);
  await fistAt('right', { ...lid, y: lid.y + 0.3 });
  await step(0.4);
}

await enter();
// Things to stash: a bone charm and five potions; and the leader's orders on the quest page.
await page.evaluate(() => {
  const { adventure, state } = window.__descent;
  const effects = state.inventory.take([
    { id: 'bone-charm-1', count: 1 },
    { id: 'minor-healing-potion', count: 5 },
    { id: 'leaders-orders', count: 1 },
  ]);
  adventure.applyThings(effects, adventure.player.rig.position);
});
await standAtChest();

// 1. The chest, and opening the stash at it.
{
  let s = await state();
  check(s.interior === 'inn' && s.chestShown && !s.stashOpen && !s.open, `in the inn, the chest is drawn and the stash shut (in the ${s.interior}, drawn ${s.chestShown})`);
  await shot('01-chest');
  // A quick hand draws the sword's trail, whose shader isn't the stash's: have it compiled first.
  const lidAt = await page.evaluate(() => {
    const d = window.__descent;
    return (({ x, y, z }) => ({ x, y, z }))(d.adventure.stashChest.lidWorld(d.camera.position.clone(), 0.02));
  });
  await fistAt('right', { ...lidAt, y: lidAt.y + 0.3 });
  await handsDown();
  await step(0.5);
  await xrFrames(4);
  const before = await page.evaluate(() => window.__descent.renderer.info.programs.length);
  await page.evaluate(() => (window.__descent.buzzes.length = 0));
  await touchLid();
  await handsDown();
  await step(0.3);
  await xrFrames(4);
  const after = await page.evaluate(() => window.__descent.renderer.info.programs.length);
  s = await state();
  check(s.stashOpen && s.open && /opened: the stash, right hand on its lid/.test(s.lines.join('\n')), `a fist on the lid opens the stash panel and the bag's with it (${s.lines.find((l) => l.startsWith('opened'))})`);
  check(s.buzzes.some((b) => b.hand === 'right' && b.intensity >= 0.5), 'with a buzz in that hand');
  check(s.stashSide < -0.3, `the stash panel stands on the bag panel's left (${s.stashSide.toFixed(2)} m to your right)`);
  check(Math.abs(s.panelFrom.out - 0.45) < 0.03, `the bag panel comes round ${(s.panelFrom.out * 100).toFixed(0)} cm in front, no reach needed`);
  check(s.lid > 0.99, `the lid swings up (${s.lid.toFixed(2)})`);
  check(after === before, `no new shader program compiles as it first opens (${before} before, ${after} after)`);
  check(s.stashBoard.some((t) => t.text === 'Page 1') && s.stashBoard.some((t) => t.text === 'Page 2') && s.stashBoard.some((t) => t.text === '0 of 32 slots'), `its two page tabs and caption (${s.stashBoard.map((t) => t.text).join(' | ')})`);
  await shot('02-open');

  const calls = await page.evaluate(async () => {
    const { adventure, renderer } = window.__descent;
    const session = renderer.xr.getSession();
    const frame = () => new Promise((r) => session.requestAnimationFrame(() => session.requestAnimationFrame(r)));
    const diffs = [];
    for (let i = 0; i < 3; i++) {
      await frame();
      const open = renderer.info.render.calls;
      adventure.stash.root.visible = false;
      await frame();
      const shut = renderer.info.render.calls;
      adventure.stash.root.visible = true;
      diffs.push(open - shut);
    }
    diffs.sort((a, b) => a - b);
    return { panel: diffs[1], views: renderer.xr.getCamera().cameras.length };
  });
  const perEye = calls.panel / calls.views;
  check(perEye >= 2 && perEye <= 4, `the stash panel costs ${perEye} draws an eye (${calls.panel} over ${calls.views} eyes)`);
}

// 2. Into the stash, on both pages.
{
  let s = await state();
  const charm = s.slots.indexOf('bone-charm-1×1');
  await carry(await bagSlot(charm), await stashSlot(0));
  s = await state();
  check(s.slots[charm] === null && s.stash[0] === 'bone-charm-1×1', `the charm carried onto the stash's first page goes in (${s.last})`);
  // Its card shows over the stash panel.
  const first = await stashSlot(0);
  await fistAt('right', await outFrom(first, 0.1, 'stash'));
  await fistAt('right', first);
  s = await state();
  check(s.stashCard?.[0]?.text === 'Bone Charm', `touching it shows its card over the stash panel (${s.stashCard?.[0]?.text})`);
  await fistAt('right', await outFrom(first, 0.1, 'stash'));
  await step(0.4);

  await press(await stashTab(1), 'stash');
  s = await state();
  check(s.stashPage === 1, `the Page 2 tab shows the second page (${s.last})`);
  const potions = s.slots.indexOf('minor-healing-potion×5');
  await carry(await bagSlot(potions), await stashSlot(5));
  s = await state();
  check(s.slots[potions] === null && s.stash[21] === 'minor-healing-potion×5', `the potions carried onto its sixth slot go into the stash's 22nd (${s.last})`);
  check(s.stashBoard.some((t) => t.text === '2 of 32 slots'), `the caption counts them (${s.stashBoard.map((t) => t.text).join(' | ')})`);
  await shot('03-stashed');
}

// 3. The orders stay on the quest page.
{
  await press(await bagTab('quest'), 'bag');
  let s = await state();
  check(s.bagPage === 'quest', `the bag's Quests tab (${s.bagPage})`);
  const orders = await bagSlot(0);
  await fistAt('right', await outFrom(orders, 0.1));
  await fistAt('right', orders);
  await grip('right', 1);
  s = await state();
  check(!s.holding && /quest items stay/.test(s.last), `the leader's orders can't be carried off it to the stash (${s.last})`);
  await grip('right', 0);
  const refused = await page.evaluate(() => window.__descent.state.inventory.check({ in: 'quest', slot: 0 }, { in: 'stash', slot: 1 }));
  check(refused === 'quest' && s.quest.includes('leaders-orders') && !s.stash.some((x) => x?.startsWith('leaders-orders')), `and the inventory refuses them the stash (${refused})`);
  await fistAt('right', await outFrom(orders, 0.1));
  await step(0.4);
  await press(await bagTab('bag'), 'bag');
}

// 4. Walking off shuts both, and the lid.
{
  await handsDown();
  await page.evaluate(() => {
    const d = window.__descent;
    const { spot } = d.adventure.stashChest;
    const x = spot.x + Math.sin(spot.yaw) * 2.2;
    const z = spot.z + Math.cos(spot.yaw) * 2.2;
    d.teleport(x, z, Math.atan2(Math.sin(spot.yaw), Math.cos(spot.yaw)));
  });
  await xrFrames(2);
  await step(0.6);
  const s = await state();
  check(!s.open && !s.stashOpen && /closed: walked away/.test(s.lines.join('\n')), `walking off shuts the bag and the stash (${s.last})`);
  check(s.lid === 0, `and the lid (${s.lid.toFixed(2)})`);
}

// 5. A reload keeps it; take the potions back.
{
  await page.evaluate(() => window.__descent.saved());
  await enter();
  let s = await state();
  check(s.stash[0] === 'bone-charm-1×1' && s.stash[21] === 'minor-healing-potion×5', `after a reload the stash is as you left it (${s.stash.filter(Boolean).join(', ')})`);
  await standAtChest();
  await touchLid();
  await handsDown();
  await step(0.3);
  s = await state();
  check(s.stashOpen && s.stashPage === 0, `the lid opens it again, on its first page (${s.last})`);
  await press(await stashTab(1), 'stash');
  const free = (await state()).slots.indexOf(null);
  await carry(await stashSlot(5), await bagSlot(free), 'stash');
  s = await state();
  check(s.stash[21] === null && s.slots[free] === 'minor-healing-potion×5', `the potions taken back into the bag (${s.last})`);
  await page.evaluate(() => window.__descent.saved());
  await enter();
  s = await state();
  check(s.stash[21] === null && s.slots.includes('minor-healing-potion×5') && s.stash[0] === 'bone-charm-1×1', `and a reload keeps that too (${s.slots.filter(Boolean).join(', ')})`);
}

check(errors.length === 0, `no page errors (${errors.join('; ')})`);
await browser.close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
