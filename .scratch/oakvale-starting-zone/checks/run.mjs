// Checks for the run (issues/33-the-run.md) in headless Chromium with the IWER
// emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/oakvale-starting-zone/checks/run.mjs [http://localhost:5173] [shots/]
//
// The Adventure at the plain URL, paused and stepped by `__descent.step` (and
// `teleport`); the left stick pushed and clicked through the emulated
// controller. Every buzz the game asks for is recorded.
//
// 1. On the farm road with the stick pushed ahead you walk at 2.2 m/s.
// 2. A click of the left stick and you run at 3.5 m/s, and the edges of your
//    view darken: the ring shows, one draw call, fading in over about 0.2 s,
//    compiling no new shader program (it was warmed as the Adventure started).
// 3. Push the stick sideways and you walk, still latched; ahead again, you run.
// 4. Let go of the stick and it ends; the ring fades out over about 0.2 s. Push
//    the stick again without a click and you walk.
// 5. Running at the farm's first pair: the pull ends the run on the spot, with
//    one buzz in the left hand. A click while they fight you does nothing.
// 6. Led past their leash, they walk home, and walking home doesn't count: a
//    click runs again.
// 7. The arena's player has no run.
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
const near = (a, b, tol) => Math.abs(a - b) <= tol;
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
const step = (s, dt = 1 / 72) => page.evaluate(([s, dt]) => window.__descent.step(s, dt), [s, dt]);
/** Stand at (x, z) facing the point (tx, tz), then let an XR frame bring the head there. */
async function standFacing(x, z, tx, tz) {
  await page.evaluate(([x, z, tx, tz]) => window.__descent.teleport(x, z, Math.atan2(-(tx - x), -(tz - z))), [x, z, tx, tz]);
  await xrFrames(2);
  await step(1 / 72);
}
/** Push the left stick (x right, y back: ahead is y = −1). */
async function stick(x, y) {
  await page.evaluate(([x, y]) => window.__descent.device.controllers.left.updateAxes('thumbstick', x, y), [x, y]);
  await xrFrames(2);
}
/** Click the left stick down and let it up, a frame of the game in between. */
async function click() {
  await page.evaluate(() => window.__descent.device.controllers.left.updateButtonValue('thumbstick', 1));
  await xrFrames(2);
  await step(1 / 72);
  await page.evaluate(() => window.__descent.device.controllers.left.updateButtonValue('thumbstick', 0));
  await xrFrames(2);
}
/** Where your feet are, the run, the ring, and whether anything fights you. */
const you = () =>
  page.evaluate(() => {
    const { player, camera, adventure, camps } = window.__descent;
    const p = player.feetPosition(camera.position.clone());
    const ring = adventure.runVignette.mesh;
    return {
      x: p.x,
      z: p.z,
      running: player.running,
      latched: player.run.latched,
      ring: ring.visible ? ring.material.uniforms.uStrength.value : 0,
      fighting: camps.fighting,
    };
  });
/** How far you go in `s` seconds of game time, in m/s. */
async function speedOver(s) {
  const a = await you();
  await step(s);
  const b = await you();
  return Math.hypot(b.x - a.x, b.z - a.z) / s;
}
/** The farm's members' minds. */
const minds = () => page.evaluate(() => window.__descent.camps.camps.find((c) => c.plan.id === 'farm').members.map((m) => m.mind).join(' '));

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => {
  const { device, player } = window.__descent;
  window.__descent.paused = true;
  // Arms at your sides, so the shield and the sword don't fill the screenshots.
  device.controllers.left.position.set(-0.4, 0.3, 0.2);
  device.controllers.right.position.set(0.4, 0.3, 0.2);
  // Every buzz the game asks for, by hand.
  window.__buzzes = [];
  const pulse = player.input.pulse.bind(player.input);
  player.input.pulse = (hand, intensity, ms) => {
    window.__buzzes.push({ hand, intensity, ms });
    pulse(hand, intensity, ms);
  };
});
await xrFrames(2);
await step(2); // everyone rises at their posts
const { RUN, WALK, BUZZ, FADE, STRENGTH } = await page.evaluate(() => {
  const { CONFIG } = window.__descent;
  return { RUN: CONFIG.run.speed, WALK: CONFIG.player.moveSpeed, BUZZ: CONFIG.run.buzz, FADE: CONFIG.run.vignette.fade, STRENGTH: CONFIG.run.vignette.strength };
});
const buzzes = () => page.evaluate(() => window.__buzzes);

// 1. Walking the farm road east from the crossroads, towards the farm.
await standFacing(12, 5.5, 40, 16);
await stick(0, -1);
{
  const v = await speedOver(1);
  const me = await you();
  check(near(v, WALK, 0.15) && !me.running && me.ring === 0, `stick ahead, no click: you walk at ${v.toFixed(2)} m/s, no ring`);
  await xrFrames(2);
  await shot('01-walking-the-farm-road');
}

// 2. A click, and you run.
{
  const programs = await page.evaluate(() => window.__descent.renderer.info.programs.length);
  await click();
  const v = await speedOver(1);
  const me = await you();
  check(me.running && me.latched && near(v, RUN, 0.2), `a click of the left stick: you run at ${v.toFixed(2)} m/s`);
  check(near(me.ring, STRENGTH, 0.01), `the ring over the edges shows at full strength (${me.ring.toFixed(2)})`);
  await xrFrames(2);
  await shot('02-running-the-edges-darken');
  if (shots) {
    // The same view without the ring, to compare.
    await page.evaluate(() => (window.__descent.adventure.runVignette.mesh.visible = false));
    await xrFrames(1);
    await shot('02b-the-same-without-the-ring');
    await step(1 / 72);
  }
  const calls = await page.evaluate(async () => {
    const { adventure, renderer } = window.__descent;
    const session = renderer.xr.getSession();
    const frame = () => new Promise((r) => session.requestAnimationFrame(() => session.requestAnimationFrame(r)));
    await frame();
    const withRing = renderer.info.render.calls;
    adventure.runVignette.mesh.visible = false;
    await frame();
    const without = renderer.info.render.calls;
    adventure.runVignette.mesh.visible = true;
    return { withRing, without };
  });
  const views = await page.evaluate(() => window.__descent.renderer.xr.getCamera().cameras.length);
  check(calls.withRing - calls.without === views, `it's one draw call a view (${calls.withRing} with it, ${calls.without} without, ${views} views)`);
  const after = await page.evaluate(() => window.__descent.renderer.info.programs.length);
  check(after <= programs, `showing it compiled no new shader program (${programs} before, ${after} after)`);
}

// 3. Sideways you walk, still latched; ahead again, you run.
{
  await stick(1, 0);
  const v = await speedOver(0.5);
  const me = await you();
  check(!me.running && me.latched && near(v, WALK, 0.15), `stick pushed sideways: you walk at ${v.toFixed(2)} m/s, the run still latched`);
  await stick(-0.5, -0.8); // 32° left of ahead
  const v2 = await speedOver(0.5);
  check((await you()).running && near(v2, RUN, 0.2), `stick 32° off ahead: you run again at ${v2.toFixed(2)} m/s`);
}

// 4. Let go, and it ends; the ring fades out.
{
  await stick(0, 0);
  await step(FADE / 2);
  const half = await you();
  check(!half.running && !half.latched, 'letting go of the stick ends the run');
  check(near(half.ring, STRENGTH / 2, 0.06), `the ring half faded after ${FADE / 2} s (${half.ring.toFixed(2)})`);
  await step(FADE / 2 + 0.02);
  check((await you()).ring === 0, `and gone after ${FADE} s`);
  await stick(0, -1);
  const v = await speedOver(0.5);
  check(!(await you()).running && near(v, WALK, 0.15), `pushed again without a click: you walk (${v.toFixed(2)} m/s)`);
  await stick(0, 0);
}

// 5. Running at the farm's first pair: the pull ends it, with one buzz.
{
  const posts = await page.evaluate(() => window.__descent.camps.camps.find((c) => c.plan.id === 'farm').members.map((m) => ({ x: m.post.x, z: m.post.z })));
  await standFacing(54.5, 26, posts[0].x, posts[0].z);
  await stick(0, -1);
  await click();
  const before = (await buzzes()).length;
  let me = await you();
  check(me.running && !me.fighting, 'running up the road to the farm');
  for (let i = 0; i < 80 && !me.fighting; i++) {
    await step(0.05);
    me = await you();
  }
  // The camps move after you in a frame, so the run hears of the pull on the next one.
  await step(1 / 72);
  me = await you();
  check(me.fighting && !me.running && !me.latched, `the pull (${await minds()}) ends the run on the spot, the next frame`);
  await step(0.3);
  const got = (await buzzes()).slice(before);
  const runBuzzes = got.filter((b) => b.intensity === BUZZ.intensity && b.ms === BUZZ.ms);
  check(runBuzzes.length === 1 && runBuzzes[0].hand === 'left', `one buzz in the left hand (${JSON.stringify(got)})`);
  await xrFrames(2);
  await shot('03-the-pull-ends-the-run');
  // Turn and click while they fight you: nothing.
  await standFacing(me.x, me.z, 12, 5.5);
  await stick(0, -1);
  await click();
  me = await you();
  const v = await speedOver(0.3);
  check(me.fighting && !me.latched && !me.running && near(v, WALK, 0.2), `a click while they fight you does nothing: you walk (${v.toFixed(2)} m/s)`);
  await stick(0, 0);
}

// 6. Led past their leash they walk home, which doesn't count as a fight.
{
  await standFacing(12, 5.5, 0, 0);
  let m = await minds();
  for (let i = 0; i < 80 && m.includes('fight'); i++) {
    await step(0.25);
    m = await minds();
  }
  check(m.includes('home') && !m.includes('fight'), `led off to the crossroads, they give up and walk home (${m})`);
  await stick(0, -1);
  await click();
  const me = await you();
  check(me.running && !me.fighting, `with them walking home, a click runs (${await minds()})`);
  await stick(0, 0);
}

check(errors.length === 0, `no page errors (${errors.join('; ')})`);

// 7. The arena's player never runs.
{
  await page.goto(`${base}/?arena&emulate&nodevui`);
  await page.waitForFunction(() => window.__descent?.game, null, { timeout: 120000 });
  const run = await page.evaluate(() => window.__descent.game.player.run);
  check(run === null, 'the arena has no run');
}

await browser.close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
