// Checks for quest items and hand-in picks (issues/12-quest-items-and-hand-in-picks.md)
// in headless Chromium with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/inventory/checks/hand-in-picks.mjs [http://localhost:5173] [shots/]
//
// Oakvale at the plain URL for a new character, paused and stepped in the page
// (`step`, `teleport`). The quests' kills and Accept go straight into the
// Adventure; the picks are carried off Hale's board with the right fist
// through the emulated controller. What it checks:
//
// 1. Raiders in the Fields ready: Hale's board shows no "Hand in" button but
//    a reward row of the Farmstead Gloves and the Hedgerow Boots, each in a
//    green frame with its card under it, and "Carry one into your bag."
// 2. A fist on the gloves lights their frame with a light buzz. Squeezing the
//    grip with the bag shut swings the bag round with the gloves in hand, and
//    the frame on the board empties. Let go over bag slot 4: the quest is
//    handed in (+80 XP, level 2), the gloves are in slot 4, and the board
//    goes on to offer The Lumber Camp.
// 3. The leader's orders, touched in the tent, go on the bag's quest page.
//    With the lumber camp done and the bag full, a pick carried into the bag
//    is refused with a strong buzz: the pick and the quest wait on the board,
//    and the orders stay on the page. With a slot freed, the Marshal's Cap
//    carried into it hands the quest in, and the orders are gone.
// 4. What Lies Below: a warrior offered Hale's old longsword and the
//    Warden's Mantle takes the mantle, and Hale's sword stays at their hip.
// 5. A reload keeps the picks where they went.
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
/** Events straight into the Adventure, as the world and the board's buttons send them. */
const apply = (...events) =>
  page.evaluate((events) => {
    const { adventure } = window.__descent;
    for (const e of events) adventure.apply(e, adventure.hale.position);
  }, events);

async function enter() {
  await page.goto(`${base}/?emulate&nodevui`);
  await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 180000 });
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  await page.evaluate(() => {
    const d = window.__descent;
    d.paused = true;
    d.device.controllers.left.position.set(-0.4, 0.3, 0.2);
    d.device.controllers.right.position.set(0.4, 0.3, 0.2);
    d.buzzes = [];
    const input = d.player.input;
    const pulse = input.pulse.bind(input);
    input.pulse = (hand, intensity, ms) => {
      d.buzzes.push({ hand, intensity, ms });
      pulse(hand, intensity, ms);
    };
  });
  await xrFrames(2);
}

/** Stand `d` metres from Hale on the line to the start, facing Hale, and let the board unfold. */
async function standBy(d) {
  await page.evaluate((d) => {
    const w = window.__descent;
    const h = w.adventure.hale.position;
    const start = w.world.zoneAt(0, 0).spawn;
    const k = d / Math.hypot(start.x - h.x, start.z - h.z);
    const [x, z] = [h.x + (start.x - h.x) * k, h.z + (start.z - h.z) * k];
    w.teleport(x, z, Math.atan2(-(h.x - x), -(h.z - z)));
  }, d);
  await xrFrames(2);
  await step(0.6);
}
/** Walk off, so the board folds and opens afresh on coming back. */
async function walkOff() {
  await standBy(6);
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
async function handsDown() {
  await page.evaluate(() => {
    const d = window.__descent;
    d.device.controllers.left.position.set(-0.4, 0.3, 0.2);
    d.device.controllers.right.position.set(0.4, 0.3, 0.2);
  });
  await xrFrames(2);
  await step(1 / 72);
}
/** The world point just off pick `i`'s frame on Hale's board, `off` metres out. */
const pickAt = (i, off = 0.02) =>
  page.evaluate(
    ([i, off]) => {
      const { board } = window.__descent.adventure;
      board.root.updateMatrixWorld(true);
      const p = board.pickSlots[i].frame.localToWorld(board.root.position.clone().set(0, 0, 0.01 + off));
      return { x: p.x, y: p.y, z: p.z };
    },
    [i, off],
  );
/** The world point just off bag slot `i` on the panel. */
const slotAt = (i) =>
  page.evaluate((i) => {
    const { bag, camera } = window.__descent;
    const p = bag.panel.slotWorld({ in: 'grid', i }, camera.position.clone(), 0.015);
    return { x: p.x, y: p.y, z: p.z };
  }, i);

/** What a player would notice. */
const seen = () =>
  page.evaluate(() => {
    const d = window.__descent;
    const { adventure, state, bag } = d;
    const { board, hale } = adventure;
    const texts = (card) => card.ctx.__texts ?? [];
    return {
      boardOpen: board.isOpen,
      boardText: texts(board.text).map((t) => t.text),
      keys: board.keys.map((k) => texts(k.face).at(-1)?.text),
      picks: board.pickSlots.map((p) => ({
        id: p.id,
        // Lit where a fist touches it, or its rarity's colour (its card's name's) a little darker.
        frame: (() => {
          const colour = p.frame.material.color;
          const C = colour.constructor;
          if (colour.equals(new C(0xf0c060))) return 'lit';
          const rarity = texts(p.card)[0]?.color;
          return rarity && colour.equals(new C(rarity).multiplyScalar(0.8)) ? rarity : `#${colour.getHexString()}`;
        })(),
        shown: p.model.visible,
        card: texts(p.card),
      })),
      bagOpen: bag.isOpen,
      holding: bag.holding?.id ?? null,
      last: bag.lines.at(-1) ?? '',
      slots: state.inventory.bag.map((s) => s?.id ?? null),
      questPage: [...state.inventory.quest],
      stages: Object.fromEntries(Object.entries(state.snapshot().quests).map(([k, q]) => [k, q.stage])),
      xp: state.xp,
      level: state.level,
      swordAtHip: hale.swordAtHip,
      buzzes: [...d.buzzes],
    };
  });

await enter();

// 1. Raiders in the Fields ready: the pick on Hale's board.
await apply({ kind: 'accept' }, ...Array(3).fill({ kind: 'kill', camp: 'farm', level: 1, role: 'ordinary' }));
await standBy(1.3);
{
  const s = await seen();
  check(s.boardOpen && s.keys.length === 0, `the board is open with no button to press (${s.keys.join() || 'none'})`);
  check(s.boardText.includes('Carry one into your bag.'), `it says "Carry one into your bag."`);
  check(
    s.picks.map((p) => p.id).join() === 'farmstead-gloves-strength,hedgerow-boots-strength',
    `the reward row: ${s.picks.map((p) => p.id).join(', ')}`,
  );
  const names = s.picks.map((p) => p.card[0]);
  check(
    names[0]?.text === 'Farmstead Gloves' && names[1]?.text === 'Hedgerow Boots' && names.every((n) => n?.color === '#1eff00'),
    `each has its card with its name in green (${names.map((n) => `${n?.text} ${n?.color}`).join(', ')})`,
  );
  check(s.picks.every((p) => p.frame === '#1eff00'), `each in a green frame (${s.picks.map((p) => p.frame).join(', ')})`);
  const stats = s.picks[0].card.map((t) => t.text).join(' | ');
  check(/Strength/.test(stats) && /Stamina/.test(stats), `the gloves carry Stamina and Strength for a warrior (${stats})`);
  await shot('01-picks');
}

// 2. Carry the gloves into bag slot 4.
{
  await page.evaluate(() => (window.__descent.buzzes.length = 0));
  await fistAt('right', await pickAt(0, 0.1));
  await fistAt('right', await pickAt(0));
  let s = await seen();
  check(s.picks[0].frame === 'lit' && s.buzzes.some((b) => b.hand === 'right' && b.intensity < 0.3), `a fist on the gloves lights their frame, with a light buzz`);
  check(!s.bagOpen, `the bag is still shut`);
  await grip('right', 1);
  s = await seen();
  check(s.bagOpen && s.holding === 'farmstead-gloves-strength', `squeezing swings the bag round with the gloves in hand (${s.last})`);
  check(!s.picks[0].shown && s.picks[1].shown, `and their frame on the board empties`);
  await fistAt('right', await slotAt(3));
  await step(0.1);
  await shot('02-carried');
  const before = await seen();
  await grip('right', 0);
  await step(0.3);
  s = await seen();
  check(before.stages.raiders === 'ready', `the quest waits while the gloves are carried`);
  check(s.stages.raiders === 'handedIn' && s.slots[3] === 'farmstead-gloves-strength', `let go over bag slot 4, the quest is handed in and the gloves are in it (${s.last})`);
  check(s.xp === 110 && s.level === 2, `+80 XP and level 2 (${s.xp} XP, level ${s.level})`);
  check(s.boardOpen && s.picks.length === 0 && s.keys.join() === 'Accept,Not now' && s.boardText.join(' ').includes('lumber camp'), `the board goes on to offer The Lumber Camp (${s.keys.join()})`);
  await handsDown();
  await page.evaluate(() => window.__descent.bag.close('check'));
}

// 3. The orders, and a full bag.
{
  await apply({ kind: 'accept' });
  await page.evaluate(() => {
    const { adventure } = window.__descent;
    for (let i = 0; i < 5; i++) adventure.apply({ kind: 'kill', camp: 'lumberCamp', level: 2, role: i === 4 ? 'leader' : 'ordinary' }, adventure.hale.position);
  });
  let s = await seen();
  check(s.questPage.length === 0, `no orders on the quest page before they're touched`);
  await apply({ kind: 'pickup', item: 'orders' });
  s = await seen();
  check(s.questPage.join() === 'leaders-orders' && s.stages.lumber === 'ready', `touched in the tent, the orders go on the quest page`);
  // Fill every other slot.
  await page.evaluate(() => {
    const { adventure, state } = window.__descent;
    adventure.applyThings(state.inventory.take(Array.from({ length: 15 }, () => ({ id: 'worn-tunic', count: 1 }))), adventure.player.rig.position);
  });
  await walkOff();
  await standBy(1.3);
  s = await seen();
  check(s.picks.map((p) => p.id).join() === 'timberline-leggings-strength,marshals-cap-strength', `the board offers the Timberline Leggings or the Marshal's Cap`);
  await page.evaluate(() => (window.__descent.buzzes.length = 0));
  await fistAt('right', await pickAt(1, 0.1));
  await fistAt('right', await pickAt(1));
  await grip('right', 1);
  await fistAt('right', await slotAt(5));
  await step(0.1);
  const red = await page.evaluate(() => {
    const { bag } = window.__descent;
    const frames = bag.panel.frames;
    // The seven gear slots come first, then the page's sixteen.
    const i = 7 + 5;
    const C = frames.material.color.constructor;
    const now = new C(frames.instanceColor.getX(i), frames.instanceColor.getY(i), frames.instanceColor.getZ(i));
    return { red: now.equals(new C(0xd03030)), is: `#${now.getHexString()}` };
  });
  check(red.red, `over a slot of the full bag it shows red (${red.is})`);
  await grip('right', 0);
  await step(0.3);
  s = await seen();
  check(s.stages.lumber === 'ready' && s.picks.length === 2 && s.picks.every((p) => p.shown), `let go, it's refused: the pick and the quest wait on the board (${s.last})`);
  check(s.buzzes.some((b) => b.intensity >= 0.9), `with a strong buzz`);
  check(s.questPage.join() === 'leaders-orders', `and the orders stay on the quest page`);
  await shot('03-full');
  // Room: drop a tunic from slot 6.
  await page.evaluate(() => {
    const { adventure, state } = window.__descent;
    adventure.applyThings(state.inventory.move({ in: 'bag', slot: 5 }, { in: 'ground' }), adventure.player.rig.position);
  });
  await fistAt('right', await pickAt(1, 0.1));
  await fistAt('right', await pickAt(1));
  await grip('right', 1);
  await fistAt('right', await slotAt(5));
  await step(0.1);
  await grip('right', 0);
  await step(0.3);
  s = await seen();
  check(s.stages.lumber === 'handedIn' && s.slots[5] === 'marshals-cap-strength', `with a slot freed, the Marshal's Cap carried into it hands the quest in (${s.last})`);
  check(s.questPage.length === 0, `and the orders are gone from the quest page`);
  await handsDown();
  await page.evaluate(() => window.__descent.bag.close('check'));
}

// 4. What Lies Below: a warrior takes the mantle, and Hale keeps their sword.
{
  await page.evaluate(() => {
    const { adventure, state } = window.__descent;
    adventure.applyThings(state.inventory.move({ in: 'bag', slot: 6 }, { in: 'ground' }), adventure.player.rig.position);
  });
  await apply({ kind: 'accept' }, { kind: 'kill', camp: null, level: 5, role: 'warden' });
  await walkOff();
  await standBy(1.3);
  let s = await seen();
  check(s.picks.map((p) => p.id).join() === 'hale-longsword,wardens-mantle-strength', `What Lies Below offers Hale's old longsword or the Warden's Mantle`);
  check(s.picks.every((p) => p.frame === '#0070dd'), `both in blue frames (${s.picks.map((p) => p.frame).join(', ')})`);
  check(s.swordAtHip, `Hale's sword is at their hip`);
  await fistAt('right', await pickAt(1, 0.1));
  await fistAt('right', await pickAt(1));
  await grip('right', 1);
  await fistAt('right', await slotAt(6));
  await step(0.1);
  await grip('right', 0);
  await step(0.3);
  s = await seen();
  check(s.stages.below === 'handedIn' && s.slots[6] === 'wardens-mantle-strength', `the Warden's Mantle is carried into the bag (${s.last})`);
  check(s.swordAtHip, `and Hale's sword stays at their hip`);
  await shot('04-mantle');
}

// 5. A reload keeps it all.
{
  await step(3);
  await page.evaluate(() => window.__descent.saved());
  await enter();
  const s = await seen();
  check(
    s.slots[3] === 'farmstead-gloves-strength' && s.slots[5] === 'marshals-cap-strength' && s.slots[6] === 'wardens-mantle-strength',
    `after a reload the picks are where they went`,
  );
  check(s.swordAtHip && s.questPage.length === 0, `Hale's sword is at their hip, and the quest page is empty`);
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
