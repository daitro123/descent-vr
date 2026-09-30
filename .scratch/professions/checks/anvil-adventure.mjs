// Checks for the smith's anvil in the Adventure (issues/15-the-smiths-anvil.md)
// in headless Chromium with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/professions/checks/anvil-adventure.mjs [http://localhost:5173] [shots/]
//
// Oakvale at the plain URL for a new character who has learned Smithing, with
// ore, rough stone and two bars in the bag (the debug handle's `professions`).
// The game is paused and stepped a thirtieth of a second per XR frame from
// inside the frame loop, the emulated controllers moved a frame at a time, so
// every strike, grab and press goes through the same detection as in the
// headset: the hammer's face coming down onto the anvil, the tongs' jaws at a
// piece, the hammer on the board (from checks/anvil.mjs, the prototype's).
//
// 1. Walking up to the anvil with the stick swaps the sword and shield for
//    the smith's hammer and tongs, and the smith steps aside.
// 2. The hammer on the board's Copper bar smelts two ore into a bar, into the bag;
//    twice.
// 3. The whetstone: three great strikes on its marks make it, into the bag.
//    A tap and a strike off the marks do nothing.
// 4. At Smithing 15 with the recipe bought, the gauntlets of Strength: the
//    bars heat in the fire, the tongs carry the blank to the anvil, ten good
//    strikes shape it and the bucket quenches it into the bag.
// 5. Smithing rose with each make. The copper bar, with no ore left, is greyed
//    on the board, and pressing it is refused with nothing taken.
// 6. Stepping 2 m back swaps the hands back; the smith goes back to the anvil.
//    No page errors.
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
const context = await browser.newContext({ viewport: { width: 800, height: 520 } });
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

// In the page: run a list of steps, one per XR frame, each followed by a
// thirtieth of a second of the game. A step places a controller so a point on
// what it holds (the hammer's face, the tongs' jaws, or the grip itself) is at
// a point in the smithy's frame, sets a squeeze or the stick, or waits (`hold`
// frames, or `until` a condition holds).
await page.addInitScript(() => {
  const HELD = { face: [0, -0.045, -0.3], jaw: [0, 0, -0.34], grip: [0, 0, 0] };
  const put = (hand, what, p) => {
    const { adventure, player, device } = window.__descent;
    const V = player.rig.position.constructor;
    const c = device.controllers[hand];
    c.quaternion.x = c.quaternion.y = c.quaternion.z = 0;
    c.quaternion.w = 1;
    // The emulator's grip sits turned and offset from the controller's pose: read the offset off this frame's grip.
    player.rig.updateMatrixWorld(true);
    const grip = player.input.hands[hand].grip;
    const held = player.rig.worldToLocal(grip.localToWorld(new V(...HELD[what])));
    const off = held.sub(c.position);
    const r = player.rig.worldToLocal(adventure.anvil.frame.localToWorld(new V(p.x, p.y, p.z)));
    Object.assign(c.position, { x: r.x - off.x, y: r.y - off.y, z: r.z - off.z });
  };
  window.__anvil = {
    run: (steps) =>
      new Promise((done) => {
        const d = window.__descent;
        const session = d.renderer.xr.getSession();
        let i = 0;
        let held = 0;
        const frame = () => {
          const s = steps[i];
          if (!s) return done();
          const tick = () => {
            if (d.player.alive) d.player.hp = d.player.maxHp;
            d.adventure.update(1 / 30);
          };
          if (s.until && !new Function('d', `return ${s.until}`)(d)) {
            tick();
            return session.requestAnimationFrame(frame);
          }
          if (s.p) put(s.hand, s.what ?? (s.hand === 'right' ? 'face' : 'jaw'), s.p);
          if (s.squeeze !== undefined) d.device.controllers[s.hand].updateButtonValue('squeeze', s.squeeze);
          if (s.stick !== undefined) d.device.controllers.left.updateAxes('thumbstick', 0, s.stick);
          tick();
          if (++held >= (s.hold ?? 1)) {
            i++;
            held = 0;
          }
          session.requestAnimationFrame(frame);
        };
        session.requestAnimationFrame(frame);
      }),
  };
});
const run = (steps) => page.evaluate((steps) => window.__anvil.run(steps), steps);
const wait = (n) => run([{ hold: n }]);
const lines = () => page.evaluate(() => [...window.__descent.adventure.anvil.lines]);
const count = (id) => page.evaluate((id) => window.__descent.state.inventory.count(id), id);
const smithing = () => page.evaluate(() => window.__descent.state.professions.proficiency('smithing'));
const tools = () =>
  page.evaluate(() => {
    const { adventure, player } = window.__descent;
    const { left, right } = player.input.hands;
    return {
      on: player.holdingTools,
      hammer: adventure.anvil.hammer.parent === right.grip,
      tongs: adventure.anvil.tongs.model.parent === left.grip,
      sword: player.sword.model.parent === right.grip,
      shield: player.shield.model.parent === left.grip,
    };
  });
/** How far the smith is from their spot at the anvil. */
const smithAway = () =>
  page.evaluate(() => {
    const s = window.__descent.adventure.villagers.get('smith');
    return Math.hypot(s.root.position.x - s.spot.x, s.root.position.z - s.spot.z);
  });
/** A point in the smithy's frame, worked out in the page. */
const where = (expr) =>
  page.evaluate(
    `(() => { const { adventure } = window.__descent; const a = adventure.anvil; const V = a.frame.position.constructor; const v = (${expr}); return { x: v.x, y: v.y, z: v.z }; })()`,
  );
const REST = { x: -0.2, y: 0.9, z: -0.7 };
const ANVIL = { x: -0.35, y: 0.745, z: -0.2 };

/** A key on the board, and points 12 and 30 cm out in front of it, in the smithy's frame. */
async function key(id) {
  const mesh = `a.board.keys.find((k) => k.id === '${id}').mesh`;
  return {
    at: await where(`a.frame.worldToLocal(${mesh}.getWorldPosition(new V()))`),
    front: await where(`a.frame.worldToLocal(${mesh}.localToWorld(new V(0, 0, 0.12)))`),
    clear: await where(`a.frame.worldToLocal(${mesh}.localToWorld(new V(0, 0, 0.3)))`),
  };
}

/** Steps moving a hand's `what` from `a` to `b` in `n` even steps: the emulated grip lags a frame, so a jump can land it anywhere on the way. */
const glide = (hand, what, a, b, n = 8) =>
  Array.from({ length: n }, (_, i) => {
    const t = (i + 1) / n;
    return { hand, what, p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t } };
  });

/** Press a key with the hammer's face, coming at it straight from well in front, and draw back. */
async function press(id) {
  const k = await key(id);
  await run([
    ...glide('right', 'face', REST, k.clear),
    { hand: 'right', p: k.clear, hold: 3 },
    ...glide('right', 'face', k.clear, k.at, 6),
    { hand: 'right', p: k.at, hold: 2 },
    ...glide('right', 'face', k.at, k.clear, 6),
    { hand: 'right', p: k.clear, hold: 2 },
    ...glide('right', 'face', k.clear, REST),
    { hand: 'right', p: REST, hold: 2 },
  ]);
}

/** The top of what's on the anvil. */
const top = async () =>
  ANVIL.y + (await page.evaluate(() => {
    const a = window.__descent.adventure.anvil;
    return a.work.piece?.place === 'anvil' ? a.view?.top ?? 0 : 0;
  }));

/** The face comes down from 0.25 m over the work at (x, z) from the anvil's middle, `step` m a frame (0.1 = 3 m/s), and lifts off. */
async function strike(x, z, step) {
  const t = await top();
  const at = (y) => ({ x: ANVIL.x + x, y, z: ANVIL.z + z });
  const steps = [{ hand: 'right', p: at(t + 0.25), hold: 3 }];
  for (let y = t + 0.25 - step; y > t - 0.03 - step; y -= step) steps.push({ hand: 'right', p: at(y) });
  steps.push({ hand: 'right', p: at(t + 0.25), hold: 3 });
  await run(steps);
}
const marks = () => page.evaluate(() => window.__descent.adventure.anvil.work.piece?.marks.map((m) => ({ x: m.x, z: m.z })) ?? []);

/** Carry what's at `from` with the tongs to `to` (points in the frame), and let go. */
async function carry(from, to) {
  const up = (p, h) => ({ ...p, y: p.y + h });
  await run([
    { hand: 'left', p: up(from, 0.2), hold: 2 },
    { hand: 'left', p: from, hold: 2 },
    { hand: 'left', p: from, squeeze: 1, hold: 2 },
    { hand: 'left', p: up(from, 0.25), hold: 2 },
    { hand: 'left', p: up(to, 0.25), hold: 2 },
    { hand: 'left', p: to, hold: 2 },
    { hand: 'left', p: to, squeeze: 0, hold: 2 },
    { hand: 'left', p: up(to, 0.3), hold: 2 },
  ]);
}

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 180000 });
await page.evaluate(() => window.__descent.renderer.xr.setFramebufferScaleFactor(0.25));
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await page.evaluate(() => {
  const d = window.__descent;
  d.paused = true;
  d.professions.learn('mining');
  d.professions.fill({ 'copper-ore': 4, 'rough-stone': 2, 'copper-bar': 2 });
  // Four metres out from the smithy's open front, to the left of its middle post, facing the anvil.
  const a = d.adventure.anvil;
  const from = a.toWorld(-1.2, 0, 4);
  const to = a.at;
  d.teleport(from.x, from.z, Math.atan2(from.x - to.x, from.z - to.z));
});
await run([
  { hand: 'right', what: 'grip', p: { x: -0.9, y: 1, z: 3.6 } },
  { hand: 'left', what: 'grip', p: { x: -1.4, y: 1, z: 3.6 }, hold: 5 },
]);
check(!(await tools()).on && (await tools()).sword, '1: out in front of the smithy, your sword and shield are in your hands');

// ─── 1. Walking up ───
await run([{ stick: -1 }, { until: 'd.player.holdingTools' }, { stick: 0, hold: 1 }]);
const near = await page.evaluate(() => {
  const d = window.__descent;
  const h = d.camera.getWorldPosition(d.camera.position.clone());
  const a = d.adventure.anvil.at;
  return Math.hypot(h.x - a.x, h.z - a.z);
});
let t = await tools();
check(t.on && t.hammer && t.tongs && !t.sword && !t.shield, `1: walking up to the anvil swapped both hands for the hammer and tongs (${near.toFixed(2)} m from it)`);
await wait(90);
check((await smithAway()) > 1, `1: the smith stepped aside (${(await smithAway()).toFixed(2)} m from the anvil's spot)`);
// Round to where the smith stood, facing the anvil and the open front.
await page.evaluate(() => {
  const d = window.__descent;
  const { x, z, yaw } = d.adventure.anvil.stand;
  d.teleport(x, z, yaw);
});
await run([
  { hand: 'right', p: REST },
  { hand: 'left', what: 'grip', p: { x: 0.1, y: 0.9, z: -0.7 }, hold: 20 },
]);
await shot('1-at-the-anvil');
console.log(`     draw calls at the anvil: ${await page.evaluate(() => window.__descent.renderer.info.render.calls)}`);

// ─── 2. Two bars ───
for (const n of [1, 2]) {
  await press('copper-bar');
  await run([{ hold: 1, until: `d.adventure.anvil.lines.includes('made:copper-bar') && d.adventure.anvil.lines.filter((l) => l === 'made:copper-bar').length >= ${n}` }]);
  await wait(40);
  check((await count('copper-bar')) === 2 + n && (await count('copper-ore')) === 4 - 2 * n, `2: the hammer on Copper bar smelted two ore into a bar, into the bag (${await count('copper-bar')} bars)`);
}
check((await smithing()) === 2, `2: Smithing rose to 2 (${await smithing()})`);

// ─── 3. The whetstone ───
await press('whetstone');
let ev = await lines();
check(ev.includes('choose:whetstone') && (await count('rough-stone')) === 1, '3: the board took a rough stone and laid it on the anvil');
let m = await marks();
check(m.length === 3, '3: …with 3 glowing marks');
await strike(m[0].x, m[0].z, 0.02);
await strike(0.2, 0.08, 0.1);
ev = await lines();
check(ev.includes('strike:tap:idle'), '3: a slow strike is only a tap');
check(ev.includes('strike:great:miss'), '3: a strike off the marks works nothing');
await strike(m[0].x, m[0].z, 0.1);
await shot('3-whetstone-struck');
for (const mk of m.slice(1)) await strike(mk.x, mk.z, 0.1);
ev = await lines();
check(ev.filter((e) => e === 'strike:great:worked').length === 3 && ev.includes('made:whetstone'), '3: three great strikes on the marks made the whetstone');
await wait(40);
check((await count('whetstone')) === 1, '3: …into the bag');
check((await smithing()) === 3, `3: Smithing rose to 3 (${await smithing()})`);

// ─── 4. The gauntlets of Strength ───
await page.evaluate(() => {
  const d = window.__descent;
  d.professions.proficiency('smithing', 15);
  d.state.inventory.take([], 25);
  d.state.professions.buy('copper-gauntlets-of-strength');
});
await wait(3);
await press('copper-gauntlets-of-strength');
ev = await lines();
check(ev.includes('choose:copper-gauntlets-of-strength') && (await count('copper-bar')) === 0, '4: the board took four bars for the gauntlets of Strength, into the fire');
await wait(50);
check(await page.evaluate(() => window.__descent.adventure.anvil.work.workable), '4: …and the blank glows');
await shot('4-blank-in-fire');
await carry({ x: -2.0, y: 1.02, z: -1.45 }, { x: -0.35, y: 0.78, z: -0.2 });
ev = await lines();
check(ev.some((l) => l.startsWith('grab:copper-gauntlets')) && ev.includes('drop:copper-gauntlets-of-strength:anvil'), '4: the tongs carried the hot blank to the anvil');
m = await marks();
for (const mk of m) {
  await strike(mk.x, mk.z, 0.055);
  await strike(mk.x, mk.z, 0.055);
}
ev = await lines();
check(ev.filter((e) => e === 'strike:good:worked').length === 10, '4: ten good strikes, two to a mark, in one heat');
check(await page.evaluate(() => window.__descent.adventure.anvil.work.shaped), '4: …shaped the gauntlets');
await shot('4-gauntlets-shaped');
await carry({ x: -0.35, y: 0.78, z: -0.2 }, { x: 0.45, y: 0.45, z: -0.5 });
ev = await lines();
check(ev.includes('dunk:quenched') && ev.includes('made:copper-gauntlets-of-strength'), '4: the bucket quenched them');
await wait(40);
check((await count('copper-gauntlets-of-strength')) === 1, '4: …into the bag');

// ─── 5. Smithing, and a recipe short of materials ───
check((await smithing()) === 18, `5: Smithing rose by 3 for the gauntlets, to 18 (${await smithing()})`);
const bar = await page.evaluate(() => window.__descent.adventure.anvil.rows().find((r) => r.id === 'copper-bar'));
check(bar && !bar.ready, `5: Copper bar is greyed with no ore left ("${bar?.line}")`);
await press('copper-bar');
ev = await lines();
check(ev.at(-1) === 'refused:copper-bar' && (await count('copper-bar')) === 0 && !(await page.evaluate(() => window.__descent.adventure.anvil.work.busy)), '5: …and pressing it is refused with nothing taken');

// ─── 6. Stepping back ───
const back = await page.evaluate(() => {
  const d = window.__descent;
  const a = d.adventure.anvil;
  const from = a.toWorld(-0.35, 0, 2.1);
  const to = a.at;
  d.teleport(from.x, from.z, Math.atan2(from.x - to.x, from.z - to.z));
  const h = d.camera.getWorldPosition(d.camera.position.clone());
  return Math.hypot(h.x - to.x, h.z - to.z);
});
await wait(3);
t = await tools();
check(!t.on && t.sword && t.shield && !t.hammer, `6: stepping back ${back.toFixed(2)} m from the anvil swapped the hammer and tongs back for the sword and shield`);
await wait(150);
check((await smithAway()) < 0.05, '6: …and the smith went back to the anvil');

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
