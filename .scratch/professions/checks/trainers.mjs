// Checks for the trainers and their intro quests
// (issues/18-trainers-and-intro-quests.md) in headless Chromium with the IWER
// emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/professions/checks/trainers.mjs [http://localhost:5173] [shots/]
//
// Oakvale at the plain URL for a new character, paused and stepped in the page
// (`step`, `teleport`); the talk boards' buttons and the Train list's rows are
// pressed with the emulated controllers' fists, and every buzz is recorded.
// Breaking veins, cutting Hearthleaf and making at the stations have their own
// checks (mining.mjs, herbalism.mjs, anvil-adventure.mjs, bench.mjs), so here
// they go through the Adventure's own seams for them (`applyGathered`,
// `applyMade`), which count them for the quests. What it checks:
//
// 1. Raiders in the Fields handed in: a gold "!" over the smith and over the
//    herbalist.
// 2. Walking up to the smith unfolds their talk board with "Ore and Fire" and
//    Accept, Not now and Trade. Accept teaches Mining and Smithing ("Mining and
//    Smithing learned") and hangs the pick on the tool loop.
// 3. Hale's The Lumber Camp taken too; in the house by the well the
//    herbalist's board offers "Leaves for the Pot", and Accept teaches
//    Herbalism and Alchemy and hangs the knife. The tracker lists three
//    quests, the newest last, and the herbalist's bark follows what you've learned.
// 4. Two veins and a whetstone, two clumps and a potion: both quests ready,
//    each trainer's marker a gold "?".
// 5. At the smith: Hand in, Trade and Train; handing in pays 120 XP and 5
//    coins, floated over the smith, and the whetstone stays in the bag. Train
//    shows the copper gauntlets, grey, with their price and proficiency; Back
//    returns to the talk.
// 6. At the herbalist: handing in pays the same. With Alchemy at 5 and 10
//    coins, Train lights the rage draught and the mana potion, and greys the
//    elixir; pressing the elixir buys nothing with a strong buzz, pressing the
//    rage draught buys it for 10 coins and its row says Known.
// 7. The bag panel shows a line per profession under the coins.
// 8. A reload keeps it all; the ?proto= prototypes still run.
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

// Every canvas remembers what was written on it since it was last cleared, so
// the check can read the boards, the tracker, the markers and the floats back.
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
/** Events into the Adventure, as the world sends them. */
const apply = (...events) =>
  page.evaluate((events) => {
    const { adventure } = window.__descent;
    for (const e of events) adventure.apply(e, adventure.hale.position);
  }, events);

/** Oakvale in VR, paused: a new character in this fresh browser, or the saved one on a reload. */
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
    await fistTo(
      hand,
      await page.evaluate((x) => {
        const d = window.__descent;
        const p = d.player.rig.localToWorld(d.player.rig.position.clone().set(x, 0.7, 0.15));
        return { x: p.x, y: p.y, z: p.z };
      }, x),
    );
  }
}

/**
 * Stand `d` m from villager `id`, `turn` rad round from the way they face,
 * looking at their head; in `interior` if they're indoors.
 */
async function standBy(id, d, turn = 0, interior = null) {
  await page.evaluate(
    ([id, d, turn, interior]) => {
      const x = window.__descent;
      const v = x.adventure.villagers.get(id);
      const p = v.root.getWorldPosition(v.root.position.clone());
      const a = v.spot.yaw + turn;
      const ex = p.x + Math.sin(a) * d;
      const ez = p.z + Math.cos(a) * d;
      if (interior) x.world.settle(interior);
      x.teleport(ex, ez, Math.atan2(ex - p.x, ez - p.z));
      Object.assign(x.device.quaternion, { x: Math.sin(-0.08), y: 0, z: 0, w: Math.cos(-0.08) });
    },
    [id, d, turn, interior],
  );
  await xrFrames(2);
  await step(0.6);
}
/** Walk well away (to the crossroads), so boards fold and barks rearm. */
async function walkOff() {
  await page.evaluate(() => {
    const x = window.__descent;
    const s = x.world.zoneAt(0, 0).spawn;
    x.world.settle(null);
    x.teleport(s.x, s.z, s.yaw);
  });
  await xrFrames(2);
  await step(0.5);
}

/** The world point just off the face of a key on `board` ('vendorBoard' or 'herbalistBoard') that says `label`. */
const keyAt = (board, label, out = 0.01) =>
  page.evaluate(
    ([board, label, out]) => {
      const b = window.__descent.adventure[board];
      const key = b.keys.find((k) => k.face.ctx.__texts?.at(-1)?.text === label);
      if (!key) return null;
      b.root.updateMatrixWorld(true);
      const w = key.mesh.localToWorld(key.mesh.position.clone().set(0, 0, 0.02 + out));
      return { x: w.x, y: w.y, z: w.z };
    },
    [board, label, out],
  );
/** Press the key saying `label` on `board` with the right fist: in front of it, into it, and back out. */
async function press(board, label) {
  const front = await keyAt(board, label, 0.12);
  const on = await keyAt(board, label, 0);
  if (!front || !on) return false;
  await fistAt('right', front);
  await step(0.7); // the board arms
  await fistAt('right', on);
  await step(0.1);
  await fistAt('right', front);
  await step(0.7);
  return true;
}

/** What a player would notice. */
const seen = () =>
  page.evaluate(() => {
    const d = window.__descent;
    const { adventure, state } = d;
    const texts = (card) => (card.ctx.__texts ?? []).map((t) => t.text);
    const board = (b) => ({
      open: b.isOpen,
      training: b.isTraining,
      text: texts(b.text),
      keys: b.keys.map((k) => ({ label: k.face.ctx.__texts?.at(-1)?.text, all: texts(k.face), lit: k.face.ctx.__texts?.at(-1)?.color !== '#b8b0a0' })),
    });
    const marker = (id) => {
      const v = adventure.villagers.get(id);
      const t = v.marker.canvas.getContext('2d').__texts?.at(-1);
      return v.marker.sprite.visible ? `${t?.text ?? ''} ${t?.color ?? ''}` : 'none';
    };
    const { loop } = adventure.gathering;
    return {
      stages: Object.fromEntries(Object.entries(state.snapshot().quests).map(([k, q]) => [k, q.stage])),
      markers: { smith: marker('smith'), herbalist: marker('herbalist') },
      giverMarkers: { smith: state.giver('smith').marker, herbalist: state.giver('herbalist').marker },
      vendor: board(adventure.vendorBoard),
      herbalist: board(adventure.herbalistBoard),
      wares: adventure.wares.isOpen,
      learned: [...state.professions.learned],
      recipes: [...state.professions.recipes],
      loop: loop.root.visible,
      handles: { pick: loop.handles.pick.visible, knife: loop.handles.knife.visible },
      tracker: adventure.tracker.mesh.visible ? texts(adventure.tracker.card) : [],
      titles: state.tracker.map((t) => t.title),
      arrow: state.arrow,
      xp: state.xp,
      coins: state.inventory.coins,
      bag: Object.fromEntries(['whetstone', 'minor-healing-potion', 'copper-ore', 'hearthleaf'].map((id) => [id, state.inventory.count(id)])),
      barks: { smith: state.bark('smith'), herbalist: state.bark('herbalist') },
      herbalistBark: (() => {
        const v = adventure.villagers.get('herbalist');
        return v.bark.mesh.visible ? texts(v.bark).slice(1).join(' ') : null;
      })(),
      floats: adventure.text.active.map((f) => f.sprite.material.map.image.getContext('2d').__texts?.at(-1)?.text ?? ''),
      buzzes: [...d.buzzes],
      interior: d.world.interior,
      bare: adventure.bench.bare,
      tools: adventure.anvil.tools,
      proficiency: Object.fromEntries(state.professions.learned.map((p) => [p, state.professions.proficiency(p)])),
    };
  });

// ---------------------------------------------------------------------------

await enter();

// 1. Raiders in the Fields, handed in: both trainers have a gold "!".
await apply({ kind: 'accept' }, ...Array(3).fill({ kind: 'kill', camp: 'farm', level: 1, role: 'ordinary', family: 'bandit', seed: 1 }), { kind: 'handIn' });
await step(0.2);
let s = await seen();
check(s.stages.raiders === 'handedIn', `Raiders in the Fields is handed in (${s.stages.raiders})`);
check(
  s.giverMarkers.smith === 'offered' && s.giverMarkers.herbalist === 'offered' && s.markers.smith === '! #ffd23a',
  `a gold "!" over the smith (${s.markers.smith}) and the herbalist offers too (${s.giverMarkers.herbalist})`,
);

// 2. The smith: their talk board, and Accept.
await standBy('smith', 1.9, 0.9);
s = await seen();
check(!s.tools, 'standing by the smith, the anvil has not taken your hands');
check(s.vendor.open && !s.wares, `walking up to the smith unfolds their talk board, not their wares (talk ${s.vendor.open}, wares ${s.wares})`);
check(s.vendor.text[0] === 'Smith' && /copper veins/.test(s.vendor.text.slice(1).join(' ')), `with "Ore and Fire" on offer: "${s.vendor.text.slice(1).join(' ').slice(0, 70)}…"`);
check(s.vendor.keys.map((k) => k.label).join() === 'Accept,Not now,Trade', `and Accept, Not now and Trade (${s.vendor.keys.map((k) => k.label).join(', ')})`);
await shot('01-the-smith-offers');
await page.evaluate(() => (window.__descent.buzzes = []));
check(await press('vendorBoard', 'Accept'), 'pressed Accept with the right fist');
s = await seen();
check(s.learned.join() === 'mining,smithing', `accepting teaches Mining and Smithing (${s.learned.join(', ')})`);
check(s.loop && s.handles.pick && !s.handles.knife, `the pick hangs on the tool loop (loop ${s.loop}, pick ${s.handles.pick}, knife ${s.handles.knife})`);
check(!s.vendor.open && s.stages['ore-and-fire'] === 'active' && s.giverMarkers.smith === 'active', `the board folds and Ore and Fire is under way (${s.stages['ore-and-fire']}, marker ${s.markers.smith})`);
check(s.buzzes.some((b) => b.hand === 'right'), 'with a buzz in the right hand');
check(s.tracker.includes('Ore and Fire'), `the tracker shows Ore and Fire (${s.tracker.join(' | ')})`);
await shot('02-accepted');

// 3. Hale's The Lumber Camp, then the herbalist's quest: three at once.
await apply({ kind: 'accept' });
await walkOff();
await standBy('herbalist', 1.6, 0, 'house');
s = await seen();
check(s.interior === 'house' && !s.bare, `in the house by the well, talking to the herbalist holds the bench off (in ${s.interior}, bench hands ${s.bare})`);
check(s.herbalistBark === "Mind where you step, there's Hearthleaf by that road.", `the herbalist barks "${s.herbalistBark}"`);
check(s.herbalist.open && /Hearthleaf/.test(s.herbalist.text.slice(1).join(' ')), `their board unfolds with "Leaves for the Pot": "${s.herbalist.text.slice(1).join(' ').slice(0, 70)}…"`);
check(s.herbalist.keys.map((k) => k.label).join() === 'Accept,Not now', `with Accept and Not now (${s.herbalist.keys.map((k) => k.label).join(', ')})`);
await shot('03-the-herbalist-offers');
check(await press('herbalistBoard', 'Accept'), 'pressed Accept');
s = await seen();
check(s.learned.join() === 'mining,smithing,herbalism,alchemy' && s.handles.knife, `accepting teaches Herbalism and Alchemy and hangs the knife (${s.learned.join(', ')})`);
check(
  s.titles.join() === 'Ore and Fire,The Lumber Camp,Leaves for the Pot' && ['Ore and Fire', 'The Lumber Camp', 'Leaves for the Pot'].every((t) => s.tracker.includes(t)),
  `three quests in the tracker while Hale's is also active, the newest last (${s.titles.join(', ')})`,
);
check(s.arrow?.target === 'fields' && s.arrow.line === 0, `the arrow is on Leaves for the Pot's first line, pointing to the fields (${JSON.stringify(s.arrow)})`);
check(s.barks.herbalist.startsWith('Bring me Duskcap') && s.barks.smith === 'Keep your pick sharp and your fire hot.', `the barks follow what you've learned: "${s.barks.herbalist}" / "${s.barks.smith}"`);
await shot('04-three-quests');
await walkOff();
await standBy('herbalist', 1.6, 0, 'house');
s = await seen();
check(s.herbalistBark?.startsWith('Bring me Duskcap'), `coming back, the herbalist barks "${s.herbalistBark}"`);

// 4. Two veins and a whetstone; two clumps and a potion.
await walkOff();
await page.evaluate(() => {
  const { adventure, state } = window.__descent;
  const at = adventure.hale.position.clone();
  for (let i = 0; i < 2; i++) adventure.applyGathered(state.professions.gather('copperVein'), at);
  adventure.applyMade([...state.professions.start('whetstone'), ...state.professions.finish('anvil')], at);
  for (let i = 0; i < 2; i++) adventure.applyGathered(state.professions.gather('hearthleaf'), at);
  adventure.applyMade([...state.professions.start('minor-healing-potion'), ...state.professions.finish('bench')], at);
});
await step(0.3);
s = await seen();
check(
  s.stages['ore-and-fire'] === 'ready' && s.stages['leaves-for-the-pot'] === 'ready',
  `two veins and a whetstone, two clumps and a potion: both ready (${s.stages['ore-and-fire']}, ${s.stages['leaves-for-the-pot']})`,
);
check(s.markers.smith === '? #ffd23a', `a gold "?" over the smith (${s.markers.smith})`);
check(s.tracker.includes('Return to the smith') && s.tracker.includes('Return to the herbalist'), `the tracker says to return to each (${s.tracker.join(' | ')})`);

// 5. The smith: hand in, and Train.
await standBy('smith', 1.9, 0.9);
s = await seen();
check(s.vendor.open && s.vendor.keys.map((k) => k.label).join() === 'Hand in,Trade,Train', `the smith's board: Hand in, Trade and Train (${s.vendor.keys.map((k) => k.label).join(', ')})`);
const before = s;
check(await press('vendorBoard', 'Hand in'), 'pressed Hand in');
s = await seen();
check(s.stages['ore-and-fire'] === 'handedIn' && s.xp === before.xp + 120 && s.coins === before.coins + 5, `handed in for 120 XP and 5 coins (XP ${before.xp} → ${s.xp}, coins ${before.coins} → ${s.coins})`);
check(s.floats.includes('+120 XP') && s.floats.includes('+5 coins'), `"+120 XP" and "+5 coins" float over the smith (${s.floats.join(', ')})`);
check(s.bag.whetstone === 1, `the whetstone stays yours (${s.bag.whetstone})`);
check(s.markers.smith === 'none' && s.vendor.open && s.vendor.keys.map((k) => k.label).join() === 'Goodbye,Trade,Train', `no marker now, and the talk goes on: ${s.vendor.keys.map((k) => k.label).join(', ')}`);
check(await press('vendorBoard', 'Train'), 'pressed Train');
s = await seen();
const gauntlets = s.vendor.keys.find((k) => k.label === 'Copper Gauntlets');
check(s.vendor.training && !!gauntlets && gauntlets.all.join(' ') === '25 coins, Smithing 15 Copper Gauntlets', `the Train list: ${s.vendor.keys.map((k) => k.all.join(' ')).join(' | ')}`);
check(gauntlets && !gauntlets.lit, 'the gauntlets are grey: too little Smithing and too few coins');
await shot('05-the-smith-trains');
check(await press('vendorBoard', 'Back'), 'pressed Back');
s = await seen();
check(!s.vendor.training && s.vendor.keys.map((k) => k.label).join() === 'Goodbye,Trade,Train', `back to the talk (${s.vendor.keys.map((k) => k.label).join(', ')})`);

// 6. The herbalist: hand in, then buy the rage draught.
await walkOff();
await standBy('herbalist', 1.6, 0, 'house');
s = await seen();
check(s.herbalist.keys.map((k) => k.label).join() === 'Hand in,Train', `the herbalist's board: Hand in and Train (${s.herbalist.keys.map((k) => k.label).join(', ')})`);
const potions = s.bag['minor-healing-potion'];
check(await press('herbalistBoard', 'Hand in'), 'pressed Hand in');
s = await seen();
check(s.stages['leaves-for-the-pot'] === 'handedIn' && s.coins === 10 && s.bag['minor-healing-potion'] === potions, `handed in for 5 more coins (${s.coins}), the potion kept (${s.bag['minor-healing-potion']})`);
await page.evaluate(() => window.__descent.professions.proficiency('alchemy', 5));
check(await press('herbalistBoard', 'Train'), 'pressed Train');
s = await seen();
const row = (name) => s.herbalist.keys.find((k) => k.label === name);
check(
  row('Rage Draught')?.lit && row('Minor Mana Potion')?.lit && row('Elixir of the Keen Eye') && !row('Elixir of the Keen Eye').lit,
  `with Alchemy 5 and 10 coins: ${s.herbalist.keys.map((k) => `${k.all.join(' ')}${k.lit ? '' : ' (grey)'}`).join(' | ')}`,
);
await shot('06-the-herbalist-trains');
await page.evaluate(() => (window.__descent.buzzes = []));
await press('herbalistBoard', 'Elixir of the Keen Eye');
s = await seen();
check(s.coins === 10 && !s.recipes.includes('elixir-of-the-keen-eye') && s.buzzes.some((b) => b.intensity >= 1 && b.ms >= 100), `the grey elixir buys nothing, with a strong buzz (${s.coins} coins)`);
await page.evaluate(() => (window.__descent.buzzes = []));
await press('herbalistBoard', 'Rage Draught');
s = await seen();
check(s.coins === 0 && s.recipes.includes('rage-draught'), `the rage draught is bought for 10 coins (${s.coins} left, knows ${s.recipes.join(', ')})`);
check(s.floats.includes('Learned: Rage Draught'), `"Learned: Rage Draught" floats over the board (${s.floats.join(', ')})`);
{
  const rage = s.herbalist.keys.find((k) => k.label === 'Rage Draught');
  const mana = s.herbalist.keys.find((k) => k.label === 'Minor Mana Potion');
  check(rage?.all[0] === 'Known' && !rage.lit && mana && !mana.lit, `its row says Known, and the mana potion is grey now (${s.herbalist.keys.map((k) => `${k.all.join(' ')}${k.lit ? '' : ' (grey)'}`).join(' | ')})`);
}
await shot('07-bought');

// 7. The bag panel: a line per profession.
await walkOff();
await handsDown();
{
  const z = await page.evaluate(() => {
    const c = window.__descent.bag.reach.centre.right;
    return { x: c.x, y: c.y, z: c.z };
  });
  await fistTo('right', z);
  await step(0.3);
  await grip('right', 1);
  await step(0.1);
  await fistAt('right', { x: z.x, y: z.y - 0.6, z: z.z - 0.4 });
  await grip('right', 0);
  await step(0.3);
}
{
  const bag = await page.evaluate(() => ({ open: window.__descent.bag.isOpen, board: (window.__descent.bag.panel.board.ctx.__texts ?? []).map((t) => t.text) }));
  const lines = bag.board.filter((t) => /^(Mining|Smithing|Herbalism|Alchemy):/.test(t));
  check(bag.open, 'the bag opens');
  check(
    lines.join() === 'Mining: Apprentice 2/25,Smithing: Apprentice 1/25,Herbalism: Apprentice 2/25,Alchemy: Apprentice 5/25',
    `under the coins, a line per profession (${lines.join(' | ')})`,
  );
  await shot('08-the-bag');
}

// 8. A reload keeps it all; the prototypes still run.
await page.evaluate(() => window.__descent.adventure.saves.onLeaving());
await page.evaluate(() => window.__descent.saved());
await enter();
s = await seen();
check(
  s.stages['ore-and-fire'] === 'handedIn' && s.stages['leaves-for-the-pot'] === 'handedIn' && s.recipes.includes('rage-draught') && s.coins === 0 && s.learned.length === 4,
  `a reload keeps the quests, the professions and the recipe (${s.stages['ore-and-fire']}, ${s.stages['leaves-for-the-pot']}, ${s.learned.join(', ')})`,
);
check(s.giverMarkers.smith === null && s.giverMarkers.herbalist === null, 'and no marker over either trainer');
for (const proto of ['pick', 'anvil', 'brew']) {
  const before = errors.length;
  await page.goto(`${base}/?proto=${proto}&emulate&nodevui`);
  await page.waitForFunction(() => window.__descent, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  check(errors.length === before, `?proto=${proto} still runs (${errors.slice(before).join('; ') || 'no errors'})`);
}

check(errors.length === 0, `no page errors (${errors.join('; ') || 'none'})`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
