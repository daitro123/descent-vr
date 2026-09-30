// Checks for the anvil prototype (issues/06-hammering-at-the-anvil.md) in
// headless Chromium with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/professions/checks/anvil.mjs [http://localhost:5173] [shots/]
//
// The emulated controllers are moved a frame at a time from inside the XR
// frame loop, so every strike, grab and press goes through the same
// detection as in the headset: the hammer's face coming down onto the anvil,
// the tongs' jaws at a piece, a fist on the board, the right hand gripping in
// the tool loop. Each frame is a thirtieth of a second of game time
// (`fixedDt`), so a face moved 0.1 m a frame comes down at 3 m/s.
//
// 1. A: press Whetstone on the board with a fist; draw the hammer and tongs
//    from the loop; three great strikes on the marks make it, into the bag.
//    A tap and a strike off the marks do nothing.
// 2. A: press Copper bar with the hammer: two ore smelt in the crucible and
//    the bar goes into the bag (four now). Press Copper gauntlets: the bars
//    heat in the fire; the tongs carry the blank to the anvil; ten good
//    strikes, two to a mark, shape it in one heat; the bucket quenches it
//    into the bag.
// 3. B: two ore from the tray into the crucible smelt to a bar on the mould;
//    a stone from the tray onto the anvil; a whetstone made stays on the
//    anvil until taken, and let go of in the air it goes in the bag.
// 4. C: a strike well off the beat does nothing; strikes on the beat make it.
// 5. Walking off puts the tools away. No page errors.
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

// In the page: run a list of steps, one per XR frame. A step places a
// controller so a point on what it holds (the hammer's face, the tongs'
// jaws, or the grip itself) is at a point in the smithy's frame, sets a
// squeeze, or waits (`hold` frames, or `until` a condition holds).
await page.addInitScript(() => {
  const HELD = { face: [0, -0.045, -0.3], jaw: [0, 0, -0.34], grip: [0, 0, 0] };
  const put = (hand, what, p) => {
    const { station, smith, device } = window.__descent;
    const V = smith.rig.position.constructor;
    const c = device.controllers[hand];
    c.quaternion.x = c.quaternion.y = c.quaternion.z = 0;
    c.quaternion.w = 1;
    // The emulator's grip sits turned and offset from the controller's pose: read the offset off this frame's grip.
    smith.rig.updateMatrixWorld(true);
    const grip = smith.input.hands[hand].grip;
    const held = smith.rig.worldToLocal(grip.localToWorld(new V(...HELD[what])));
    const off = held.sub(c.position);
    const r = smith.rig.worldToLocal(station.frame.localToWorld(new V(p.x, p.y, p.z)));
    Object.assign(c.position, { x: r.x - off.x, y: r.y - off.y, z: r.z - off.z });
  };
  window.__anvil = {
    run: (steps) =>
      new Promise((done) => {
        const session = window.__descent.renderer.xr.getSession();
        let i = 0;
        let held = 0;
        const frame = () => {
          const s = steps[i];
          if (!s) return done();
          if (s.until && !new Function('d', `return ${s.until}`)(window.__descent)) return session.requestAnimationFrame(frame);
          if (s.p) put(s.hand, s.what ?? (s.hand === 'right' ? 'face' : 'jaw'), s.p);
          if (s.squeeze !== undefined) window.__descent.device.controllers[s.hand].updateButtonValue('squeeze', s.squeeze);
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
const events = () => page.evaluate(() => [...window.__descent.station.events]);
const bag = () => page.evaluate(() => ({ ...window.__descent.station.bag }));
/** A point in the smithy's frame, worked out in the page. */
const where = (expr) =>
  page.evaluate(`(() => { const { station, smith } = window.__descent; const V = smith.rig.position.constructor; const v = (${expr}); return { x: v.x, y: v.y, z: v.z }; })()`);
const inFrame = (obj) => `station.frame.worldToLocal(${obj}.getWorldPosition(new V()))`;
const REST = { x: -0.2, y: 0.9, z: -0.7 };
const ANVIL = { x: -0.35, y: 0.745, z: -0.2 };
const shot = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });

/** Grip in the tool loop with the right hand. */
async function drawTools() {
  const loop = await where(inFrame('smith.loop'));
  await run([
    { hand: 'right', what: 'grip', p: loop, hold: 3 },
    { hand: 'right', what: 'grip', p: loop, squeeze: 1, hold: 2 },
    { hand: 'right', what: 'grip', p: loop, squeeze: 0 },
    { hand: 'right', p: REST, hold: 2 },
  ]);
}

/** Press a point with the right hand's `what` (its fist, or the hammer's face), and draw back. */
async function press(point, what) {
  await run([
    { hand: 'right', what, p: { ...point, z: point.z - 0.12 }, hold: 2 },
    { hand: 'right', what, p: point, hold: 2 },
    { hand: 'right', p: REST, hold: 2 },
  ]);
}

/** The top of what's on the anvil. */
const top = async () => ANVIL.y + (await page.evaluate(() => window.__descent.station.pieces.find((p) => p.place === 'anvil')?.top ?? 0));

/**
 * The face comes down from 0.25 m over the work at (x, z) from the anvil's
 * middle, `step` metres a frame (0.1 = 3 m/s), through it, and lifts off.
 * `until` holds the swing at the top until a condition in the page.
 */
async function strike(x, z, step, until) {
  const t = await top();
  const at = (y) => ({ x: ANVIL.x + x, y, z: ANVIL.z + z });
  const steps = [{ hand: 'right', p: at(t + 0.25), hold: 3 }];
  if (until) steps.push({ hand: 'right', p: at(t + 0.25), until });
  for (let y = t + 0.25 - step; y > t - 0.03 - step; y -= step) steps.push({ hand: 'right', p: at(y) });
  steps.push({ hand: 'right', p: at(t + 0.25), hold: 3 });
  await run(steps);
}
const marks = () =>
  page.evaluate(() => {
    const p = window.__descent.station.pieces.find((p) => p.place === 'anvil');
    return p?.work ? p.work.marks.map((m) => ({ x: m.x, z: m.z })) : [];
  });

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

await page.goto(`${base}/?proto=anvil&emulate&nodevui&v=A`);
await page.waitForFunction(() => window.__descent?.station, null, { timeout: 120000 });
// A small framebuffer: the emulator renders both eyes in software.
await page.evaluate(() => window.__descent.renderer.xr.setFramebufferScaleFactor(0.25));
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await page.evaluate(() => (window.__descent.fixedDt = 1 / 30));
await run([
  { hand: 'right', what: 'grip', p: { x: -0.4, y: 0.3, z: -1.1 } },
  { hand: 'left', what: 'grip', p: { x: 0, y: 0.3, z: -1.1 }, hold: 30 },
]);
await shot('a-start');
console.log(`     draw calls at the anvil: ${await page.evaluate(() => window.__descent.renderer.info.render.calls)}`);

// ─── 1. A: the whetstone ───
const key = (i) => where(inFrame(`station.board.keys[${i}].mesh`));
await press(await key(1), 'grip');
let ev = await events();
check(ev.includes('choose:whetstone') && ev.includes('put:whetstone:anvil'), 'A: a fist on the board chose the whetstone; the stone is on the anvil');
await drawTools();
check(await page.evaluate(() => window.__descent.smith.tools), 'A: gripping in the loop drew the hammer and tongs');
let m = await marks();
await strike(m[0].x, m[0].z, 0.02);
await strike(0.2, 0.08, 0.1);
ev = await events();
check(ev.includes('strike:tap:idle'), 'A: a slow strike is only a tap');
check(ev.includes('strike:great:miss'), 'A: a strike off the marks works nothing');
await strike(m[0].x, m[0].z, 0.1);
await shot('a-whetstone-struck');
for (const mk of m.slice(1)) await strike(mk.x, mk.z, 0.1);
ev = await events();
check(ev.filter((e) => e === 'strike:great:worked').length === 3, 'A: three great strikes on the marks');
check(ev.includes('made:whetstone'), 'A: …made the whetstone');
await wait(40);
check((await bag()).whetstone === 1 && (await bag()).stone === 2, 'A: …and it went into the bag');

// ─── 2. A: a bar, then the gauntlets ───
await press(await key(0), 'face');
await wait(100);
ev = await events();
check(ev.includes('choose:bar') && ev.includes('smelted:bar'), 'A: the hammer on the board put two ore in the crucible; they smelted');
await wait(40);
check((await bag()).bar === 4 && (await bag()).ore === 4, 'A: …and the bar went into the bag: 4 bars');
await press(await key(2), 'face');
await wait(50);
ev = await events();
check(ev.includes('choose:gauntlets') && ev.includes('put:blank:fire'), 'A: the board took four bars for the gauntlets; they are in the fire as a blank');
check(await page.evaluate(() => window.__descent.station.pieces.find((p) => p.place === 'fire')?.hot), 'A: …and it glows');
await shot('a-blank-in-fire');
await carry({ x: -2.0, y: 1.02, z: -1.45 }, { x: -0.35, y: 0.78, z: -0.2 });
ev = await events();
check(ev.includes('put:blank:anvil'), 'A: the tongs carried the hot blank to the anvil');
m = await marks();
for (const mk of m) {
  await strike(mk.x, mk.z, 0.055);
  await strike(mk.x, mk.z, 0.055);
}
ev = await events();
check(ev.filter((e) => e === 'strike:good:worked').length === 10, 'A: ten good strikes, two to a mark, in one heat');
check(ev.includes('worked:gauntlets'), 'A: …shaped the gauntlets');
if (!ev.includes('worked:gauntlets')) console.log('     ', ev.slice(-12).join(' '));
await shot('a-gauntlets-shaped');
await carry({ x: -0.35, y: 0.78, z: -0.2 }, { x: 0.45, y: 0.45, z: -0.5 });
ev = await events();
check(ev.includes('dunk:gauntlets') && ev.includes('made:gauntlets'), 'A: the bucket quenched them');
await wait(40);
check((await bag()).gauntlets === 1 && (await bag()).bar === 0, 'A: …into the bag');

// ─── 3. B: laying it out ───
await page.evaluate(() => window.__descent.setVariant('B'));
await wait(5);
await drawTools();
await carry({ x: 0.62, y: 0.89, z: -1.26 }, { x: -1.62, y: 1.1, z: -1.3 });
ev = await events();
check(ev.includes('grab:ore') && ev.includes('put:ore:crucible'), 'B: two ore from the tray into the crucible');
await wait(100);
ev = await events();
check(ev.includes('smelted:bar') && (await bag()).ore === 4, 'B: …smelted into a bar on the mould');
await carry({ x: -1.42, y: 1.02, z: -1.18 }, { x: 0.62, y: 0.9, z: -1.15 });
check((await bag()).bar === 4, 'B: the tongs took the bar to the tray: 4 bars in the bag');
await carry({ x: 0.62, y: 0.9, z: -1.15 }, { x: -0.35, y: 0.78, z: -0.2 });
ev = await events();
check(ev.includes('put:whetstone:anvil'), 'B: a stone from the tray, laid on the anvil, is a whetstone to make');
await shot('b-stone-laid');
for (const mk of await marks()) await strike(mk.x, mk.z, 0.1);
await wait(40);
check(
  await page.evaluate(() => window.__descent.station.pieces.some((p) => p.place === 'anvil' && p.made)),
  'B: the whetstone made stays on the anvil',
);
await carry({ x: -0.35, y: 0.78, z: -0.2 }, { x: -0.2, y: 1.3, z: -0.6 });
await wait(30);
check((await bag()).whetstone === 1, 'B: taken and let go of in the air, it went in the bag');

// ─── 4. C: on the beat ───
await page.evaluate(() => window.__descent.setVariant('C'));
await wait(5);
await drawTools();
await carry({ x: 0.62, y: 0.9, z: -1.15 }, { x: -0.35, y: 0.78, z: -0.2 });
await wait(3);
await shot('c-beat');
// The face crosses the work four frames (0.13 s) after the swing leaves the top.
// Leaving 0.13 s before the beat lands on it; leaving 0.45 s before lands 0.32 s early.
const leaveAt = (toBeat) => `Math.abs(d.TUNE.beat - d.station.beatPhase - ${toBeat}) < 1 / 60`;
await strike(0, 0, 0.1, leaveAt(0.45));
ev = await events();
check(ev.includes('strike:great:offbeat'), 'C: a strike well off the beat does nothing');
for (let i = 0; i < 3; i++) await strike(0, 0, 0.1, leaveAt(0.13));
ev = await events();
check(ev.filter((e) => e === 'strike:great:worked').length === 3 && ev.includes('made:whetstone'), 'C: three great strikes on the beat made the whetstone');
if (!ev.includes('made:whetstone')) console.log('     ', ev.slice(-8).join(' '));

// ─── 5. Walking off ───
await page.evaluate(() => {
  const { smith, station } = window.__descent;
  const { x, z, yaw } = station.stand;
  smith.teleport(x + 7, z, yaw);
});
await wait(5);
check(!(await page.evaluate(() => window.__descent.smith.tools)), 'walking off put the hammer and tongs away');

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
