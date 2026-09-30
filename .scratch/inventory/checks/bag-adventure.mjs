// Checks for the bag in the Adventure (issues/09-the-bag-in-the-adventure.md)
// in headless Chromium with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/inventory/checks/bag-adventure.mjs [http://localhost:5173] [shots/]
//
// Oakvale at the plain URL for a new character, paused and stepped in the page
// (`step`, `teleport`); the hands moved and the grips squeezed through the
// emulated controllers, and every buzz recorded. What it checks:
//
// 1. An overhead chop starting over the shoulder, grip held throughout,
//    leaves the bag shut, and so does a grip squeezed as the hand swings up
//    into the zone fast.
// 2. A slow reach over the right shoulder and a squeeze opens the bag ~45 cm
//    in front, with a light buzz in the zone and a pulse as it opens, and no
//    new shader program compiles as it first opens. The panel costs about 4
//    draws an eye.
// 3. Touching Hale's old longsword shows its card: its name in blue, its item
//    level in red. Carried to the main hand at level 1 it's refused (too high)
//    with a strong buzz; the short bow is refused too (a ranger's).
// 4. At level 5 the longsword carried to the main hand is worn: the sword in
//    your hand is Hale's, your damage goes up, and the plain sword goes into
//    the slot it came from.
// 5. The bone charm let go off the panel is dropped, falls and lies on the
//    ground; a fist touching it takes it back into the bag.
// 6. The Quests tab switches the page to the quest page, and the Bag tab back.
//    The coin count sits under the slots.
// 7. The shield carried into the bag leaves your arm bare, and can't block.
// 8. The same reach shuts the bag. A reload keeps it all.
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
    d.device.controllers.left.position.set(-0.3, 1.0, -0.1);
    d.device.controllers.right.position.set(0.3, 1.0, -0.1);
    d.buzzes = [];
    const input = d.player.input;
    const pulse = input.pulse.bind(input);
    input.pulse = (hand, intensity, ms) => {
      d.buzzes.push({ hand, intensity, ms });
      pulse(hand, intensity, ms);
    };
    // Stand where a new character starts, facing away from Hale so their board stays folded.
    const h = d.adventure.hale.position;
    const p = d.player.rig.position;
    const x = h.x + (p.x - h.x) * 3;
    const z = h.z + (p.z - h.z) * 3;
    d.teleport(x, z, Math.atan2(x - h.x, z - h.z));
  });
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
/** Move a fist there and let a frame of the game see it. */
async function fistAt(hand, w) {
  await fistTo(hand, w);
  await step(1 / 72);
}
/** Squeeze the grip (1) or let it go (0), and let a frame of the game see it. */
async function grip(hand, value) {
  await page.evaluate(([hand, v]) => window.__descent.device.controllers[hand].updateButtonValue('squeeze', v), [hand, value]);
  await xrFrames(2);
  await step(1 / 72);
}
/** The world point just off a slot's face: a page slot's index, or a gear slot's name. */
const slotAt = (ref, off = 0.015) =>
  page.evaluate(
    ([ref, off]) => {
      const { bag, camera } = window.__descent;
      const spot = typeof ref === 'number' ? { in: 'grid', i: ref } : { in: 'gear', slot: ref };
      const p = bag.panel.slotWorld(spot, camera.position.clone(), off);
      return { x: p.x, y: p.y, z: p.z };
    },
    [ref, off],
  );
const tabAt = (tab) =>
  page.evaluate((tab) => {
    const { bag, camera } = window.__descent;
    const p = bag.panel.tabWorld(tab, camera.position.clone(), 0.015);
    return { x: p.x, y: p.y, z: p.z };
  }, tab);
/** A point `d` metres straight out from the panel's face at `w` (towards you). */
const outFrom = (w, d) =>
  page.evaluate(
    ([w, d]) => {
      const { root } = window.__descent.bag.panel;
      const o = root.getWorldPosition(root.position.clone());
      const n = root.localToWorld(root.position.clone().set(0, 0, 1)).sub(o);
      return { x: w.x + n.x * d, y: w.y + n.y * d, z: w.z + n.z * d };
    },
    [w, d],
  );
/** What a player would notice. */
const state = () =>
  page.evaluate(() => {
    const d = window.__descent;
    const { bag, state, player, adventure } = d;
    const inv = state.inventory;
    const panel = bag.panel;
    const head = d.camera.getWorldPosition(d.camera.position.clone());
    const p = panel.root.position;
    return {
      open: bag.isOpen,
      page: panel.page,
      card: panel.card.mesh.visible ? (panel.card.ctx.__texts ?? []) : null,
      board: panel.board.ctx.__texts ?? [],
      gear: { ...inv.gear },
      slots: inv.bag.map((s) => s?.id ?? null),
      coins: inv.coins,
      holding: bag.holding?.id ?? null,
      last: bag.lines.at(-1) ?? '',
      lines: [...bag.lines],
      buzzes: [...d.buzzes],
      dropped: adventure.dropped.items.map((i) => ({ id: i.stack.id, y: i.group.position.y, landed: i.landed, x: i.group.position.x, z: i.group.position.z })),
      damage: player.stats.damage,
      inHand: player.sword.sword,
      swordShown: player.sword.model.visible,
      shieldShown: player.shield.model.visible,
      canBlock: player.shield.canBlock,
      fist: player.fists?.left.colour,
      level: state.level,
      panelFrom: { out: Math.hypot(p.x - head.x, p.z - head.z), down: head.y - p.y },
    };
  });
const zone = (hand) =>
  page.evaluate((hand) => {
    const c = window.__descent.bag.reach.centre[hand];
    return { x: c.x, y: c.y, z: c.z };
  }, hand);

/** A slow reach over a shoulder: in, a moment still, squeeze, back down. */
async function reachBack(hand = 'right') {
  const z = await zone(hand);
  await fistTo(hand, z);
  await step(0.3); // still, in the zone: the light buzz
  await grip(hand, 1);
  await step(0.1);
  await fistAt(hand, { x: z.x, y: z.y - 0.6, z: z.z - 0.4 });
  await grip(hand, 0);
  await step(0.1);
}
/** Touch slot `from` (a page index or gear slot) with the right fist, squeeze, carry it to `to` (a world point) and let go. */
async function carry(from, to) {
  const at = await slotAt(from);
  await fistAt('right', await outFrom(at, 0.1));
  await fistAt('right', at);
  await grip('right', 1);
  const holding = (await state()).holding;
  await fistAt('right', to);
  await grip('right', 0);
  await step(0.2);
  return { holding };
}
/** Hands down out of the way. */
async function handsDown() {
  await fistAt('right', await page.evaluate(() => {
    const d = window.__descent;
    const p = d.player.rig.localToWorld(d.player.rig.position.clone().set(0.3, 0.9, 0.1));
    return { x: p.x, y: p.y, z: p.z };
  }));
}

await enter();
// Things to move: Hale's old longsword (item level 5), a ranger's bow, a bone charm and some potions.
await page.evaluate(() => {
  const { adventure, state } = window.__descent;
  const effects = state.inventory.take([
    { id: 'hale-longsword', count: 1 },
    { id: 'short-bow', count: 1 },
    { id: 'bone-charm', count: 1 },
    { id: 'minor-healing-potion', count: 4 },
  ], 12);
  adventure.applyThings(effects, adventure.player.rig.position);
});
await step(0.1);

// 1. Overhead swings don't open the bag.
{
  const REACH = await page.evaluate(() => window.__descent.CONFIG.bag.reach);
  const z = await zone('right');
  const path = (t) => ({ x: z.x - 0.05 * t, y: z.y + 0.1 - 0.75 * t, z: z.z - 0.7 * t });
  await fistAt('right', path(0));
  await grip('right', 1);
  let fastest = 0;
  let prev = path(0);
  for (let i = 1; i <= 10; i++) {
    const p = path(i / 10);
    await fistTo('right', p);
    await step(1 / 72);
    fastest = Math.max(fastest, Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) * 72);
    prev = p;
  }
  await grip('right', 0);
  await step(0.3);
  let s = await state();
  check(!s.open, `an overhead chop starting in the shoulder's zone, grip held throughout, leaves the bag shut (hand at up to ${fastest.toFixed(1)} m/s)`);

  const z2 = await zone('right');
  const up = (t) => ({ x: z2.x, y: z2.y - 0.6 + 0.6 * t, z: z2.z - 0.5 + 0.5 * t });
  await fistAt('right', up(0));
  for (let i = 1; i <= 6; i++) {
    await fistTo('right', up(i / 6));
    if (i === 6) await page.evaluate(() => window.__descent.device.controllers.right.updateButtonValue('squeeze', 1));
    if (i === 6) await xrFrames(2);
    await step(1 / 72);
  }
  s = await state();
  check(!s.open && /too fast/.test(s.last), `a grip squeezed as the hand swings up into the zone at speed doesn't open it ("${s.last}", gate ${REACH.speedGate} m/s)`);
  await grip('right', 0);
  await handsDown();
  await step(0.5);
}

// 2. Open, with no new shader program; the panel's draws.
{
  await xrFrames(4);
  const before = await page.evaluate(() => window.__descent.renderer.info.programs.length);
  await page.evaluate(() => (window.__descent.buzzes.length = 0));
  await reachBack('right');
  await handsDown();
  await step(0.5);
  await xrFrames(4);
  const after = await page.evaluate(() => window.__descent.renderer.info.programs.length);
  const s = await state();
  const zoneBuzz = s.buzzes.filter((b) => b.intensity < 0.3).length;
  const openPulse = s.buzzes.find((b) => b.intensity >= 0.9);
  check(s.open && /opened: right/.test(s.lines.join('\n')), `a slow reach over the right shoulder and a squeeze opens the bag (${s.lines.find((l) => l.startsWith('opened'))})`);
  check(zoneBuzz >= 1 && !!openPulse, `a light buzz in the zone (${zoneBuzz}) and a pulse as it opens`);
  check(Math.abs(s.panelFrom.out - 0.45) < 0.03 && s.panelFrom.down > 0.15, `it opens ${(s.panelFrom.out * 100).toFixed(0)} cm out and ${(s.panelFrom.down * 100).toFixed(0)} cm below the eyes`);
  check(after === before, `no new shader program compiles as it first opens (${before} before, ${after} after)`);
  const coins = s.board.map((t) => t.text).find((t) => /coins?$/.test(t));
  check(coins === '12 coins', `the coin count under the slots ("${coins}")`);
  await shot('01-open');

  const calls = await page.evaluate(async () => {
    const { bag, renderer } = window.__descent;
    const session = renderer.xr.getSession();
    const frame = () => new Promise((r) => session.requestAnimationFrame(() => session.requestAnimationFrame(r)));
    const diffs = [];
    for (let i = 0; i < 3; i++) {
      await frame();
      const open = renderer.info.render.calls;
      bag.panel.root.visible = false;
      await frame();
      const shut = renderer.info.render.calls;
      bag.panel.root.visible = true;
      diffs.push(open - shut);
    }
    diffs.sort((a, b) => a - b);
    return { panel: diffs[1], views: renderer.xr.getCamera().cameras.length };
  });
  const perEye = calls.panel / calls.views;
  check(perEye >= 3 && perEye <= 5, `the panel costs ${perEye} draws an eye (${calls.panel} over ${calls.views} eyes)`);
}

// 3. The longsword's card, and two refusals at level 1.
{
  const longsword = await slotAt(0);
  await fistAt('right', await outFrom(longsword, 0.1));
  await fistAt('right', longsword);
  let s = await state();
  const card = s.card ?? [];
  const title = card[0];
  const level = card.find((t) => /^Item level/.test(t.text));
  check(title?.text === "Hale's Old Longsword" && /#0070dd/i.test(title.color), `touching Hale's old longsword shows its card, its name in blue (${JSON.stringify(title)})`);
  check(level?.text === 'Item level 5' && /#ff5040/i.test(level.color), `its item level in red, above yours (${JSON.stringify(level)})`);
  check(card.some((t) => t.text === 'Damage +20%'), `its damage on the card (${card.map((t) => t.text).join(' | ')})`);
  await shot('02-card');

  await page.evaluate(() => (window.__descent.buzzes.length = 0));
  const main = await slotAt('mainHand');
  let r = await carry(0, main);
  s = await state();
  check(r.holding === 'hale-longsword' && s.gear.mainHand === 'plain-sword' && s.slots[0] === 'hale-longsword', `carried to the main hand at level 1, it's refused and stays in the bag (${s.last})`);
  check(/above your level/.test(s.last) && s.buzzes.some((b) => b.intensity >= 1), 'with a strong buzz: too high a level');

  r = await carry(1, main);
  s = await state();
  check(r.holding === 'short-bow' && s.gear.mainHand === 'plain-sword' && /not your class/.test(s.last), `the short bow is refused too: a ranger's (${s.last})`);
}

// 4. At level 5 the longsword goes on.
{
  await page.evaluate(() => {
    const { adventure } = window.__descent;
    const at = adventure.player.rig.position;
    for (let i = 0; i < 40 && adventure.state.level < 5; i++) adventure.apply({ kind: 'kill', camp: null, level: 5, role: 'ordinary' }, at);
  });
  await step(0.1);
  let s = await state();
  const before = s.damage;
  const main = await slotAt('mainHand');
  await carry(0, main);
  s = await state();
  check(s.level === 5 && s.gear.mainHand === 'hale-longsword' && s.slots[0] === 'plain-sword', `at level ${s.level} it's worn, the plain sword back where it came from (${s.last})`);
  check(s.inHand === 'hale' && s.swordShown, `Hale's sword is in your hand (${s.inHand})`);
  check(s.damage > before + 0.15, `your damage goes up (${before.toFixed(3)} to ${s.damage.toFixed(3)})`);
  await shot('03-worn');
}

// 5. Drop the charm, and take it back.
{
  const charm = await slotAt(2);
  await fistAt('right', await outFrom(charm, 0.1));
  const off = { x: charm.x + 0.5, y: charm.y - 0.2, z: charm.z + 0.2 };
  await carry(2, off);
  let s = await state();
  check(s.slots[2] === null && s.dropped.some((d) => d.id === 'bone-charm'), `the charm let go off the panel is dropped (${s.last})`);
  await step(1.5);
  s = await state();
  const lying = s.dropped.find((d) => d.id === 'bone-charm');
  const ground = await page.evaluate((p) => window.__descent.world.heightAt(p.x, p.z), lying);
  check(lying?.landed && Math.abs(lying.y - ground - 0.04) < 0.02, `and lies on the ground (${(lying?.y - ground).toFixed(2)} m over it)`);
  await fistAt('left', { x: lying.x, y: lying.y + 0.05, z: lying.z });
  await step(0.1);
  s = await state();
  check(!s.dropped.length && s.slots.includes('bone-charm'), `a fist touching it takes it back into the bag (bag slot ${s.slots.indexOf('bone-charm') + 1})`);
  await fistAt('left', await page.evaluate(() => {
    const d = window.__descent;
    const p = d.player.rig.localToWorld(d.player.rig.position.clone().set(-0.3, 0.9, 0.1));
    return { x: p.x, y: p.y, z: p.z };
  }));
}

// 6. The tabs.
{
  await handsDown();
  await step(0.5);
  const quests = await tabAt('quest');
  await fistAt('right', await outFrom(quests, 0.08));
  await fistAt('right', quests);
  let s = await state();
  check(s.page === 'quest' && s.buzzes.length > 0, `pressing the Quests tab shows the quest page (${s.page})`);
  await page.evaluate(() => {
    const { adventure, state } = window.__descent;
    adventure.applyThings(state.inventory.take([{ id: 'leaders-orders', count: 1 }]), adventure.player.rig.position);
  });
  await step(0.05);
  const first = await slotAt(0);
  await fistAt('right', await outFrom(first, 0.1));
  await fistAt('right', first);
  s = await state();
  check(s.card?.[0]?.text === "Leader's Orders", `the orders on the quest page, with their card (${s.card?.[0]?.text})`);
  await shot('04-quest-page');
  await grip('right', 1);
  s = await state();
  check(!s.holding && /quest items stay/.test(s.last), `and they can't be carried off it (${s.last})`);
  await grip('right', 0);
  await fistAt('right', await outFrom(first, 0.1));
  await step(0.4);
  const bagTab = await tabAt('bag');
  await fistAt('right', await outFrom(bagTab, 0.08));
  await fistAt('right', bagTab);
  s = await state();
  check(s.page === 'bag', `the Bag tab switches back (${s.page})`);
  await fistAt('right', await outFrom(bagTab, 0.1));
}

// 7. The shield off your arm.
{
  const s0 = await state();
  const free = s0.slots.indexOf(null);
  await carry('offHand', await slotAt(free));
  const s = await state();
  check(s.gear.offHand === null && s.slots[free] === 'round-shield', `the shield carried into the bag (${s.last})`);
  check(!s.shieldShown && !s.canBlock, `leaves your arm bare, and can't block (shown ${s.shieldShown}, blocks ${s.canBlock})`);
  check(typeof s.fist === 'number', `your fists show (colour #${s.fist?.toString(16)})`);
}

// 8. The same reach shuts it; a reload keeps it all.
{
  await handsDown();
  await reachBack('right');
  let s = await state();
  check(!s.open && /closed: right hand reached back/.test(s.lines.join('\n')), 'the same reach over the shoulder shuts the bag');
  await page.evaluate(() => window.__descent.saved());
  await enter();
  s = await state();
  check(s.gear.mainHand === 'hale-longsword' && s.gear.offHand === null && s.inHand === 'hale', `after a reload: Hale's sword in your hand, the shield off (${JSON.stringify(s.gear)})`);
  check(s.slots.includes('plain-sword') && s.slots.includes('round-shield') && s.slots.includes('bone-charm') && s.coins === 12, `and the bag as you left it (${s.slots.filter(Boolean).join(', ')}; ${s.coins} coins)`);
}

check(errors.length === 0, `no page errors (${errors.join('; ')})`);
await browser.close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
