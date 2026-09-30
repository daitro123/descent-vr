// Checks for rooted, frozen and slowed (issues/20-rooted-frozen-and-slowed.md)
// in headless Chromium with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/abilities/checks/enemy-states.mjs [http://localhost:5173] [shots/]
//
// The Adventure at the plain URL, paused and stepped through the debug handle
// (`paused`, `step`, `teleport`). You stand 5 m from the farm camp's first
// bandit, which comes at you (you're kept at full health meanwhile), and the
// handle's `enemies` roots, freezes and slows it, as an ability will.
//
// 1. Rooted for 3 s: it stays where it stood with vines at its feet (drawn,
//    one instance), then they're gone and it comes on.
// 2. Frozen for 3 s: it stands stock still, not swinging, tinted pale blue,
//    then thaws and fights on. Frozen again, a blow breaks it.
// 3. Slowed by half for 4 s: it walks at half its pace with a faint frost,
//    then at its own again.
// 4. No errors on the page.
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
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
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
/** Step `s` of game time, keeping you at full health. */
const step = (s) =>
  page.evaluate((s) => {
    const d = window.__descent;
    for (let t = 0; t < s - 1e-9; t += 0.1) {
      d.step(Math.min(0.1, s - t));
      d.player.hp = d.player.maxHp;
    }
  }, s);
/** The farm's first bandit, as a player would see it. */
const bandit = () =>
  page.evaluate(() => {
    const { camps, adventure } = window.__descent;
    const m = camps.camps.find((c) => c.plan.id === 'farm').members[0];
    const e = m.enemy;
    const c = e.material.color;
    return {
      mind: m.mind,
      state: e.state,
      attacking: e.attacking,
      x: e.position.x,
      z: e.position.z,
      hp: e.hp,
      rooted: e.afflictedFor('rooted'),
      frozen: e.afflictedFor('frozen'),
      slowness: e.slowness,
      vines: e.vineGrowth,
      drawnVines: adventure.vines.mesh.visible ? adventure.vines.count : 0,
      tint: [c.r, c.g, c.b],
    };
  });
const moved = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** Apply one of the handle's states to the farm's first bandit. */
const afflict = (what, ...args) =>
  page.evaluate(
    ([what, args]) => {
      const { camps, enemies } = window.__descent;
      const e = camps.camps.find((c) => c.plan.id === 'farm').members[0].enemy;
      return enemies[what](...args, e);
    },
    [what, args],
  );
/** Stand 5 m from it, on the side towards its post, facing it; then let it come to 1.5 m. */
async function faceIt() {
  const b = await bandit();
  await page.evaluate(([x, z]) => window.__descent.teleport(x, z + 5, 0), [b.x, b.z]);
  await xrFrames(2);
  await step(0.1);
}

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => {
  const { device } = window.__descent;
  window.__descent.paused = true;
  device.controllers.left.position.set(-0.4, 0.3, 0.2);
  device.controllers.right.position.set(0.4, 0.3, 0.2);
});
await xrFrames(2);
await step(2); // everyone rises at their posts

// 1. Rooted.
await faceIt();
{
  const before = await bandit();
  check(before.mind === 'fight', `5 m off, the farm's bandit comes at you (${before.mind})`);
  const took = await afflict('root', 3);
  check(took === 3, `the handle roots it for 3 s (took ${took})`);
  await step(0.5);
  let b = await bandit();
  check(b.drawnVines === 1 && b.vines === 1, `vines grow at its feet, one drawn (${b.drawnVines}, grown ${b.vines.toFixed(2)})`);
  await xrFrames(2);
  await shot('01-rooted');
  await step(2);
  b = await bandit();
  check(moved(b, before) < 0.01 && b.rooted > 0, `2.5 s on it hasn't taken a step (${moved(b, before).toFixed(3)} m, ${b.rooted.toFixed(2)} s left)`);
  await step(0.6);
  b = await bandit();
  check(b.rooted === 0 && b.drawnVines === 0, `at 3 s the root has ended and the vines are gone (${b.rooted}, ${b.drawnVines})`);
  await step(1);
  const after = await bandit();
  check(moved(after, b) > 0.3 || after.attacking, `and it comes on (${moved(after, b).toFixed(2)} m${after.attacking ? ', swinging' : ''})`);
}

// 2. Frozen.
await faceIt();
{
  const took = await afflict('freeze', 3);
  const before = await bandit();
  check(took === 3 && before.state === 'frozen', `the handle freezes it for 3 s (took ${took}, ${before.state})`);
  await step(0.1);
  let b = await bandit();
  check(b.tint[2] > b.tint[0] + 0.2, `tinted pale blue (${b.tint.map((c) => c.toFixed(2)).join(', ')})`);
  await xrFrames(2);
  await shot('02-frozen');
  let acted = false;
  for (let i = 0; i < 24; i++) {
    await step(0.1);
    b = await bandit();
    acted ||= b.attacking || b.state !== 'frozen';
  }
  check(!acted && moved(b, before) < 0.01, `for 2.5 s it neither moves nor swings (${moved(b, before).toFixed(3)} m)`);
  await step(0.6);
  b = await bandit();
  check(b.state !== 'frozen' && b.frozen === 0 && b.tint[0] === 1, `at 3 s it has thawed (${b.state}), its colour its own`);
  await afflict('freeze', 5);
  const hurt = await page.evaluate(() => {
    const { camps, player } = window.__descent;
    const e = camps.camps.find((c) => c.plan.id === 'farm').members[0].enemy;
    e.takeHit(3, e.position.clone().sub(player.feetPosition(e.position.clone())).setY(0).normalize());
    return { state: e.state, frozen: e.afflictedFor('frozen') };
  });
  check(hurt.state !== 'frozen' && hurt.frozen === 0, `frozen again, a blow breaks it (${hurt.state})`);
}

// 3. Slowed: lead it off west along the road, 12 m ahead of it, and measure its pace.
async function pace(seconds) {
  const b0 = await bandit();
  await page.evaluate(([x, z]) => window.__descent.teleport(x - 12, z, -Math.PI / 2), [b0.x, b0.z]);
  await xrFrames(2);
  await step(0.5); // up to pace
  const from = await bandit();
  await step(seconds);
  return moved(await bandit(), from) / seconds;
}
await step(1);
{
  const plain = await pace(1.5);
  const took = await afflict('slow', 4, 0.5);
  await step(0.1);
  let b = await bandit();
  check(took === 4 && b.slowness === 0.5, `the handle slows it by half for 4 s (took ${took}, ${b.slowness})`);
  check(b.tint[2] > b.tint[0] && b.tint[0] > 0.7, `with a faint frost (${b.tint.map((c) => c.toFixed(2)).join(', ')})`);
  const slowed = await pace(1.5);
  await xrFrames(2);
  await shot('03-slowed');
  check(Math.abs(slowed / plain - 0.5) < 0.12, `it walks at half its pace (${slowed.toFixed(2)} against ${plain.toFixed(2)} m/s)`);
  await step(2.4);
  b = await bandit();
  check(b.slowness === 0 && b.tint[0] === 1, `at 4 s the slow has ended (${b.slowness})`);
  const again = await pace(1.5);
  check(Math.abs(again / plain - 1) < 0.12, `and it walks at its pace again (${again.toFixed(2)} m/s)`);
}

check(errors.length === 0, `no errors on the page${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
