// Checks for the Adventure and the arena's move to ?arena
// (issues/15-the-adventure-at-the-plain-url-and-the-arena-at-arena.md) in
// headless Chromium with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/oakvale-starting-zone/checks/adventure.mjs [http://localhost:5173] [shots/]
//
// 1. The plain URL, before VR: Oakvale's intro over Oakvale seen from the
//    start, turning.
// 2. The plain URL in VR: you stand at the crossroads, facing Hale's spot, on
//    the ground. The left stick walks at 2.2 m/s, the right stick snap-turns
//    45° and B dashes, on the World's ground and colliders; the belt shows no
//    wave. Game time is stepped through the debug handle, not XR frames.
// 3. `?perf` over the Adventure and over the arena.
// 4. `?arena`, `?arena&duel`, `?wave=7` and `?showcase` play as the plain URL
//    did before; `?map=forest` walks from Oakvale's start.
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
async function enterVR() {
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
}
/** Where you stand and face: feet on the floor plane, and the head's heading (0 looks down −Z). */
const stance = () =>
  page.evaluate(() => {
    const { player, world, camera } = window.__descent;
    const feet = player.feetPosition(camera.position.clone());
    const dir = camera.getWorldDirection(camera.position.clone());
    return {
      x: feet.x,
      z: feet.z,
      rigY: player.rig.position.y,
      ground: world.heightAt(feet.x, feet.z),
      heading: Math.atan2(-dir.x, -dir.z),
      rigYaw: player.rig.rotation.y,
    };
  });
const HALE = { x: 1.5, z: 4.8 };
const angle = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// 1. The plain URL, before VR.
await page.goto(`${base}/?noemulate`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
await frames(3);
{
  const intro = await page.evaluate(() => {
    const el = document.getElementById('intro');
    const shown = [...el.querySelectorAll('section')].filter((s) => getComputedStyle(s).display !== 'none');
    return { game: el.dataset.game, shown: shown.map((s) => s.dataset.game), loading: !!el.querySelector('.loading') };
  });
  check(intro.game === 'adventure' && intro.shown.join() === 'adventure' && !intro.loading, `intro shows Oakvale's text only, loaded (${JSON.stringify(intro)})`);
  const a = await page.evaluate(() => {
    const { camera, adventure } = window.__descent;
    const p = camera.getWorldPosition(camera.position.clone());
    return { x: p.x, y: p.y, z: p.z, yaw: camera.rotation.y, spawn: adventure.world.zoneAt(0, 0).spawn };
  });
  await frames(10);
  const turned = await page.evaluate(() => window.__descent.camera.rotation.y);
  check(Math.hypot(a.x - a.spawn.x, a.z - a.spawn.z) < 0.01, `the page looks out from the start (${a.x.toFixed(2)}, ${a.z.toFixed(2)})`);
  check(turned > a.yaw, `and slowly turns (${a.yaw.toFixed(3)} → ${turned.toFixed(3)} rad)`);
  await page.evaluate(() => (window.__descent.camera.rotation.y = 0));
  await frames(2);
  await shot('01-page');
}

// 2. The plain URL in VR.
await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
await enterVR();
{
  const s = await stance();
  const toHale = Math.atan2(-(HALE.x - s.x), -(HALE.z - s.z));
  check(Math.hypot(s.x - 0.2, s.z - 1.5) < 0.3, `enters VR at the crossroads start (${s.x.toFixed(2)}, ${s.z.toFixed(2)})`);
  check(angle(s.heading, toHale) < 0.05, `facing Hale's spot (heading ${s.heading.toFixed(2)}, to Hale ${toHale.toFixed(2)})`);
  check(Math.abs(s.rigY - s.ground) < 0.02, `on the ground (rig ${s.rigY.toFixed(2)}, ground ${s.ground.toFixed(2)})`);
  const programs = await page.evaluate(() => window.__descent.renderer.info.programs.length);
  console.log(`     shader programs in VR: ${programs}`);
  await shot('02-vr-start');

  // Look down at the belt.
  await page.evaluate(() => {
    const { device } = window.__descent;
    const a = -0.6; // about 70° down
    device.quaternion.set(Math.sin(a), 0, 0, Math.cos(a));
  });
  await xrFrames(3);
  await shot('03-vr-belt');
  const belt = await page.evaluate(() => {
    const hud = window.__descent.adventure.hud;
    return { waves: hud.waves, drawn: hud.lastKey };
  });
  check(belt.waves === false, `the belt has no wave or enemies left (${JSON.stringify(belt)})`);
  await page.evaluate(() => window.__descent.device.quaternion.set(0, 0, 0, 1));
  await xrFrames(2);

  // Walk: the left stick forward for 2 s of game time.
  await page.evaluate(() => (window.__descent.paused = true));
  const before = await stance();
  await page.evaluate(() => window.__descent.device.controllers.left.updateAxes('thumbstick', 0, -1));
  await xrFrames(2);
  await page.evaluate(() => window.__descent.step(2));
  await page.evaluate(() => window.__descent.device.controllers.left.updateAxes('thumbstick', 0, 0));
  await xrFrames(2);
  const walked = await stance();
  const d = Math.hypot(walked.x - before.x, walked.z - before.z);
  check(Math.abs(d - 4.4) < 0.3, `the left stick walks 2.2 m/s (${d.toFixed(2)} m in 2 s)`);
  check(Math.abs(walked.rigY - walked.ground) < 0.05, `still on the ground (rig ${walked.rigY.toFixed(2)}, ground ${walked.ground.toFixed(2)})`);

  // Snap turn.
  await page.evaluate(() => window.__descent.device.controllers.right.updateAxes('thumbstick', 1, 0));
  await xrFrames(2);
  await page.evaluate(() => window.__descent.step(0.1));
  await page.evaluate(() => window.__descent.device.controllers.right.updateAxes('thumbstick', 0, 0));
  await xrFrames(2);
  await page.evaluate(() => window.__descent.step(0.1));
  const turned = await stance();
  const turn = Math.atan2(Math.sin(turned.rigYaw - walked.rigYaw), Math.cos(turned.rigYaw - walked.rigYaw));
  check(Math.abs(Math.abs(turn) - Math.PI / 4) < 0.01, `the right stick snap-turns (${((turn * 180) / Math.PI).toFixed(1)}°)`);

  // Dash back with B.
  await page.evaluate(() => window.__descent.device.controllers.right.updateButtonValue('b-button', 1));
  await xrFrames(2);
  await page.evaluate(() => window.__descent.step(0.5));
  await page.evaluate(() => window.__descent.device.controllers.right.updateButtonValue('b-button', 0));
  await xrFrames(2);
  const dashed = await stance();
  const dash = await page.evaluate(() => window.__descent.CONFIG.dash.distance);
  const dd = Math.hypot(dashed.x - turned.x, dashed.z - turned.z);
  check(Math.abs(dd - dash) < 0.2, `B dashes ${dd.toFixed(2)} m (the arena's dash is ${dash} m)`);

  // Colliders: walk into the signpost at (3.8, 4.4) and stop outside it.
  await page.evaluate(() => {
    const { teleport } = window.__descent;
    teleport(3.8, 1.5, Math.PI); // facing +Z, 2.9 m north of the post
  });
  await xrFrames(2);
  await page.evaluate(() => window.__descent.device.controllers.left.updateAxes('thumbstick', 0, -1));
  await xrFrames(2);
  await page.evaluate(() => window.__descent.step(3));
  await page.evaluate(() => window.__descent.device.controllers.left.updateAxes('thumbstick', 0, 0));
  await xrFrames(2);
  const blocked = await stance();
  const gap = Math.hypot(blocked.x - 3.8, blocked.z - 4.4);
  check(gap > 0.45, `the signpost stops you (${gap.toFixed(2)} m from its centre after walking into it)`);

  // Over a hill: walk north-west up the valley and stay on the ground.
  await page.evaluate(() => window.__descent.teleport(-20, 30, Math.PI / 4));
  await xrFrames(2);
  await page.evaluate(() => window.__descent.device.controllers.left.updateAxes('thumbstick', 0, -1));
  await xrFrames(2);
  await page.evaluate(() => window.__descent.step(4));
  await page.evaluate(() => window.__descent.device.controllers.left.updateAxes('thumbstick', 0, 0));
  await xrFrames(2);
  await page.evaluate(() => window.__descent.step(0.5));
  const hill = await stance();
  check(Math.abs(hill.rigY - hill.ground) < 0.05, `on the hills too (at ${hill.x.toFixed(1)}, ${hill.z.toFixed(1)}: rig ${hill.rigY.toFixed(2)}, ground ${hill.ground.toFixed(2)})`);
}

// 3. ?perf over the Adventure and the arena.
for (const q of ['?perf&emulate&nodevui', '?arena&perf&emulate&nodevui']) {
  await page.goto(`${base}/${q}`);
  await page.waitForFunction(() => window.__descent?.renderer, null, { timeout: 120000 });
  await enterVR();
  await xrFrames(6);
  const info = await page.evaluate(() => {
    const { renderer } = window.__descent;
    return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs.length };
  });
  console.log(`     ${q}: ${info.calls} draw calls, ${(info.triangles / 1000).toFixed(1)}k triangles, ${info.programs} programs (both eyes)`);
  await shot(q.includes('arena') ? '05-perf-arena' : '04-perf-adventure');
}

// 4. The arena as it was.
async function arena(q, until, what) {
  await page.goto(`${base}/${q}&emulate&nodevui`);
  await page.waitForFunction(() => window.__descent?.game, null, { timeout: 120000 });
  await enterVR();
  await page.evaluate(() => (window.__descent.paused = true));
  // Step past the intermission and the first spawns.
  const got = await page.evaluate(
    ({ until }) => {
      const { game } = window.__descent;
      for (let i = 0; i < 30 * 12; i++) {
        game.update(1 / 30);
        const kinds = game.enemies.map((e) => e.kind);
        const test = new Function('game', 'kinds', `return ${until}`);
        if (test(game, kinds)) return { wave: game.wave, kinds, t: i / 30 };
      }
      return { wave: game.wave, kinds: game.enemies.map((e) => e.kind), t: null };
    },
    { until },
  );
  check(got.t !== null, `${q}: ${what} (wave ${got.wave}, ${got.kinds.join(' ') || 'none'} after ${got.t?.toFixed(1)} s)`);
  await page.evaluate(() => (window.__descent.paused = false));
  await xrFrames(3);
}
await arena('?arena', "game.wave === 1 && kinds.length > 0 && !kinds.includes('warden')", 'wave 1 rises');
await shot('06-arena');
await arena('?arena&duel', "game.wave === 1 && kinds.length === 1 && game.enemies[0].def !== undefined && game.duel === true", 'one duelist');
await arena('?duel', 'game.duel === true && kinds.length === 1', '?duel alone opens the duel');
await arena('?wave=7', "game.wave === 7 && kinds.includes('warden')", 'the Warden rises');

await page.goto(`${base}/?showcase&noemulate`);
await page.waitForFunction(() => window.__descent?.showcase, null, { timeout: 120000 });
await frames(3);
{
  const s = await page.evaluate(() => {
    const { showcase, game } = window.__descent;
    const intro = document.getElementById('intro');
    const shown = [...intro.querySelectorAll('section')].filter((x) => getComputedStyle(x).display !== 'none');
    return { lineup: Object.keys(showcase.rigs).length, inScene: !!showcase.root.parent, arena: !!game.arena, shown: shown.map((x) => x.dataset.game) };
  });
  check(s.lineup === 4 && s.inScene && s.shown.join() === 'arena', `?showcase keeps the bestiary lineup on the arena's page (${JSON.stringify(s)})`);
  await shot('07-showcase');
}

await page.goto(`${base}/?map=forest&noemulate`);
await page.waitForFunction(() => window.__descent?.walker, null, { timeout: 120000 });
{
  const w = await page.evaluate(() => {
    const { walker, map } = window.__descent;
    return { x: walker.rig.position.x, z: walker.rig.position.z, spawn: map.spawn, enemies: 'game' in window.__descent };
  });
  check(Math.hypot(w.x - w.spawn.x, w.z - w.spawn.z) < 0.01 && !w.enemies, `?map=forest walks from Oakvale's start with no game (${w.x.toFixed(2)}, ${w.z.toFixed(2)})`);
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
process.exit(failed ? 1 : 0);
