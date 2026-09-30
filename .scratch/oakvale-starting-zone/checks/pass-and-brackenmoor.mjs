// Checks for the pass and Brackenmoor's land (issues/36-the-pass-and-brackenmoors-land.md)
// in headless Chromium, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/oakvale-starting-zone/checks/pass-and-brackenmoor.mjs [http://localhost:5173] [shots/]
//
// 1. ?map=forest on the desktop camera, under Oakvale's light: screenshots
//    from the upper pass looking south (Brackenmoor's far hills in haze over
//    the crest), from the crest looking south over the moor, and from the
//    crest looking north over Oakvale. Both zones' chunks come from their
//    workers, and the moor adds no shader program.
// 2. ?map=brackenmoor starts on the road just over the crest, looking south,
//    under Brackenmoor's light, with Oakvale loaded behind it: screenshots
//    from its start and from the moor towards the rockfall.
// 3. ?fly=brackenmoor flies the moor: every one of the viewer's spots.
// 4. The Adventure, in VR (the IWER emulator), stepped by `__descent.step`:
//    from the road at the pass's foot, the stick pushed ahead, you walk up the
//    pass, over the crest and across the moor to the rockfall, where the
//    walkable edge stops you; nothing fights you on the way; and
//    `renderer.info.programs.length` is the same at the end as at the start.
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
const errors = [];
let page = null;
async function fresh() {
  await page?.context().close();
  page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
}

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};
const shot = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });
const frames = (n) =>
  page.evaluate(
    (n) =>
      new Promise((done) => {
        let k = 0;
        const step = () => (++k >= n ? done() : requestAnimationFrame(step));
        requestAnimationFrame(step);
      }),
    n,
  );
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
const programs = () => page.evaluate(() => window.__descent.renderer.info.programs.length);
/** Wait until the World has nothing left to stream (chunks from a worker take a few frames). */
async function settled(world, next, max = 300) {
  for (let i = 0; i < max; i++) {
    if ((await page.evaluate((w) => (w === 'viewer' ? window.__descent.viewer.world : window.__descent.world).chunksPending, world)) === 0) return;
    await next(1);
  }
}
/** Where the main road runs at `z`: Oakvale's up to the crest, Brackenmoor's past it. */
const roads = async () =>
  page.evaluate(async () => {
    const { planOakvale } = await import('/src/maps/forest/layout.ts');
    const { planMoor } = await import('/src/maps/brackenmoor/chunks.ts');
    return { oak: planOakvale().paths[0].line, moor: planMoor().road.line };
  });
const roadAt = ({ oak, moor }, z) => (z <= 140 ? oak : moor).reduce((best, p) => (Math.abs(p[1] - z) < Math.abs(best[1] - z) ? p : best))[0];

// 1. The pass and the crest, under Oakvale's light.
await fresh();
await page.goto(`${base}/?map=forest&noemulate`);
await page.waitForFunction(() => window.__descent?.world, null, { timeout: 120000 });
await frames(5);
await settled('map', frames);
const before = await programs();
const lines = await roads();
const views = [
  ['01-the-upper-pass-looking-south', 118, Math.PI, 0.06],
  ['02-the-crest-looking-south', 139, Math.PI, -0.04],
  ['03-the-crest-looking-north', 141, 0, -0.1],
];
for (const [name, z, yaw, pitch] of views) {
  await page.evaluate(
    ([x, z, yaw, pitch]) => {
      const d = window.__descent;
      d.teleport(x, z, yaw);
      d.walker.pitch = pitch;
      d.world.fill(x, z);
    },
    [roadAt(lines, z) - 1.2, z, yaw, pitch],
  );
  await frames(6);
  await settled('map', frames);
  await shot(name);
}
const walkMap = await page.evaluate(() => {
  const { world } = window.__descent;
  const zones = [...new Set(world.streamer.owners.values())].length;
  return { zones, offThread: world.streamer.offThread, counts: world.chunkCounts };
});
check(walkMap.zones === 2, `?map=forest streams both zones, Oakvale and Brackenmoor (${walkMap.zones})`);
check(walkMap.offThread, "both zones' chunks come from their workers");
check((await programs()) === before, `the moor and the pass add no shader program (${before} before, ${await programs()} after the crest)`);

// 2. ?map=brackenmoor from its start, under Brackenmoor's light.
await fresh();
await page.goto(`${base}/?map=brackenmoor&noemulate`);
await page.waitForFunction(() => window.__descent?.world, null, { timeout: 120000 });
await frames(5);
await settled('map', frames);
const start = await page.evaluate(() => {
  const { map, walker, world } = window.__descent;
  return { id: map.id, x: walker.rig.position.x, z: walker.rig.position.z, yaw: walker.rig.rotation.y, spawn: map.spawn, oak: world.zoneAt(0, 100)?.id };
});
check(start.id === 'brackenmoor' && Math.abs(start.z - start.spawn.z) < 0.01 && start.z > 140 && start.z < 150, `?map=brackenmoor starts just over the crest (z ${start.z.toFixed(1)})`);
check(start.oak === 'forest', 'with Oakvale loaded behind it');
await shot('04-brackenmoor-from-its-start');
await page.evaluate(() => {
  const d = window.__descent;
  d.teleport(2, 205, Math.PI);
  d.walker.pitch = 0.02;
  d.world.fill(2, 205);
});
await frames(6);
await settled('map', frames);
await shot('05-the-moor-towards-the-rockfall');

// 3. ?fly=brackenmoor.
await fresh();
await page.goto(`${base}/?fly=brackenmoor&noemulate`);
await page.waitForFunction(() => window.__descent?.viewer?.map, null, { timeout: 120000 });
const spots = await page.evaluate(() => window.__descent.viewer.spots.map((s) => s.label));
check(spots.length >= 4, `?fly=brackenmoor flies the moor: ${spots.join(', ')}`);
for (let i = 0; i < spots.length; i++) {
  await page.evaluate((i) => window.__descent.viewer.goTo(i), i);
  await frames(6);
  await settled('viewer', frames);
  if (spots[i] === 'Overview') await shot('06-brackenmoor-from-above');
}

// 4. Walking it in the Adventure.
await fresh();
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
const you = () =>
  page.evaluate(() => {
    const { player, camera, camps } = window.__descent;
    const p = player.feetPosition(camera.position.clone());
    return { x: p.x, z: p.z, fighting: camps.fighting };
  });
const step = (s) => page.evaluate((s) => window.__descent.step(s, 1 / 72), s);
const foot = 80;
await page.evaluate(([x, z]) => window.__descent.teleport(x, z, Math.PI), [roadAt(lines, foot), foot]);
await xrFrames(3);
await step(1 / 72);
await xrFrames(10);
const programsAtStart = await programs();
let at = await you();
const track = [at];
let fought = false;
let back = 0;
// Along the road: turn to face a point 8 m on each second, stick pushed ahead.
for (let t = 0; t < 110 && at.z < 262; t++) {
  const ahead = Math.min(at.z + 8, 264);
  const tx = roadAt(lines, ahead);
  await page.evaluate(([x, z, tx, tz]) => window.__descent.teleport(x, z, Math.atan2(-(tx - x), -(tz - z))), [at.x, at.z, tx, ahead]);
  await page.evaluate(() => window.__descent.device.controllers.left.updateAxes('thumbstick', 0, -1));
  await xrFrames(2);
  await step(1);
  const now = await you();
  back = Math.min(back, now.z - at.z);
  fought ||= now.fighting;
  at = now;
  track.push(at);
  if (Math.abs(at.z - 139) < 1.2 && shots) await shot('07-the-crest-in-the-headset');
}
await page.evaluate(() => window.__descent.device.controllers.left.updateAxes('thumbstick', 0, 0));
const crossed = track.findIndex((p) => p.z > 141);
check(crossed > 0, `walked up the pass from z ${foot} and over the crest (past z 141 after ${crossed} s)`);
check(back > -0.05, `never pushed back on the way (least progress in a second ${back.toFixed(2)} m)`);
check(at.z > 258 && at.z <= 260, `across the moor to the rockfall, where the walkable edge stops you (z ${at.z.toFixed(2)})`);
check(!fought, 'nothing fought you on the way');
await xrFrames(20);
check((await programs()) === programsAtStart, `renderer.info.programs.length unchanged from the pass's foot to the rockfall (${programsAtStart}, ${await programs()})`);

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
