// Checks for the old mine, from its mouth to the gallery
// (issues/25-the-old-mine-mouth-to-gallery.md) in headless Chromium with the
// IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/oakvale-starting-zone/checks/mine.mjs [http://localhost:5173] [shots/]
//
// Game time is stepped through the debug handle (`paused`, `step`,
// `teleport`); you walk with the left stick. The mine's switch is read off
// the World.
//
// 1. Out on the rail bed: not in the mine, only its adit drawn, the pool on
//    the adit's lanterns.
// 2. Walking in through the mouth puts you in the mine, on its floor level
//    with the rail bed, still in the outdoors' light.
// 3. Walking round the bend: once you can't see out, the sun fades, the
//    mine's light and fog come up and the outdoors is hidden, with no new
//    shader program (`renderer.info.programs`). Only the part you're in and
//    its neighbours are drawn; each part is a few thousand triangles in a
//    few draw calls. Screenshots down the route.
// 4. Walking back to the bend: the sun is up before the mouth can be seen.
// 5. A save made in the gallery records the mine; reloading loads you there
//    in the mine's light.
// 6. Dying in the mine wakes you on the rail bed outside, facing the mouth.
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

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};
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
/** A screenshot of what you see, with your hands (the sword and the shield) lowered out of view. */
const shot = async (name) => {
  if (!shots) return;
  const held = await page.evaluate(() => {
    const { left, right } = window.__descent.device.controllers;
    const was = [left, right].map(({ position: p }) => [p.x, p.y, p.z]);
    Object.assign(left.position, { x: -0.3, y: -1, z: 0.2 });
    Object.assign(right.position, { x: 0.3, y: -1, z: 0.2 });
    return was;
  });
  await xrFrames(3);
  await page.screenshot({ path: `${shots}/${name}.png` });
  await page.evaluate((was) => {
    const { left, right } = window.__descent.device.controllers;
    [left, right].forEach(({ position: p }, i) => Object.assign(p, { x: was[i][0], y: was[i][1], z: was[i][2] }));
  }, held);
  await xrFrames(2);
};
const step = (s, dt = 1 / 72) => page.evaluate(([s, dt]) => window.__descent.step(s, dt), [s, dt]);

/** The mine's switch, the World's light, what's drawn, and where you stand in the mouth's frame. */
const mine = () =>
  page.evaluate(() => {
    const { world, camera, renderer } = window.__descent;
    const { mine: m, switch: sw } = world.underground;
    const head = camera.getWorldPosition(camera.position.clone());
    const { x, z, yaw, y } = m.mouth;
    const dx = head.x - x;
    const dz = head.z - z;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const seesOut = [-1.5, -0.5, 0.5, 1.5].some((lx) => m.sees(head.x, head.z, ...at(lx, 0)));
    const onMine = world.pool.filter((l) => l.intensity > 0 && m.flames.some((f) => Math.hypot(l.position.x - f.x, l.position.y - f.y, l.position.z - f.z) < 1e-6)).length;
    return {
      state: sw.state,
      light: sw.light,
      interior: world.interior,
      outdoors: world.outdoorsShown,
      zoneShown: world.zoneAt(0, 0).root.visible,
      sun: world.sun.intensity,
      fog: [world.fog.near, world.fog.far],
      parts: m.drawn.slice(0, 3),
      part: m.partAt(head.x, head.z),
      lit: world.pool.filter((l) => l.intensity > 0).length,
      onMine,
      programs: renderer.info.programs.length,
      lx: dx * c - dz * s,
      lz: dx * s + dz * c,
      floor: world.heightAt(head.x, head.z) - y,
      seesOut,
      yaw: window.__descent.player.rig.rotation.y,
    };
  });

/** Stand at (lx, lz) in the mouth's frame, facing the point (tx, tz) in it, looking up by `pitch`. */
async function standIn(lx, lz, tx, tz, pitch = 0) {
  await page.evaluate(
    ([lx, lz, tx, tz, pitch]) => {
      const { x: fx, z: fz, yaw } = window.__descent.world.mine.mouth;
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const toWorld = (a, b) => [fx + a * c + b * s, fz - a * s + b * c];
      const [x, z] = toWorld(lx, lz);
      const [X, Z] = toWorld(tx, tz);
      window.__descent.teleport(x, z, Math.atan2(-(X - x), -(Z - z)));
      const q = window.__descent.device.quaternion;
      Object.assign(q, { x: Math.sin(pitch / 2), y: 0, z: 0, w: Math.cos(pitch / 2) });
    },
    [lx, lz, tx, tz, pitch],
  );
  await xrFrames(2);
  await step(1 / 72);
}
/** Push the left stick forward and walk for `seconds`, `each` s at a time, calling `watch` after each. */
async function walkFor(seconds, watch, each = 0.05) {
  await page.evaluate(() => window.__descent.device.controllers.left.updateAxes('thumbstick', 0, -1));
  await xrFrames(2);
  for (let t = 0; t < seconds - 1e-9; t += each) {
    await step(each);
    if (watch) await watch(await mine());
  }
  await page.evaluate(() => window.__descent.device.controllers.left.updateAxes('thumbstick', 0, 0));
  await xrFrames(2);
}
/** One frame's draw calls and triangles, as the renderer counted them. */
const frameCost = () =>
  page.evaluate(async () => {
    const { renderer } = window.__descent;
    await new Promise((r) => renderer.xr.getSession().requestAnimationFrame(() => r()));
    await new Promise((r) => renderer.xr.getSession().requestAnimationFrame(() => r()));
    return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  });
async function enter() {
  await page.goto(`${base}/?emulate&nodevui`);
  await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  await page.evaluate(() => (window.__descent.paused = true));
}

await enter();
const outdoorSun = await page.evaluate(() => window.__descent.world.zoneAt(0, 0).atmosphere.sun.intensity);

// 1. Out on the rail bed.
await standIn(0, 9, 0, 0);
await step(1);
let s = await mine();
check(s.state === 'outside' && s.interior === null && s.parts.join() === 'true,false,false', `out on the rail bed: not in the mine (${s.state}), only the adit drawn (${s.parts})`);
check(s.onMine > 0 && s.sun === outdoorSun, `the pool on the adit's lanterns (${s.onMine}), under the sun`);
await shot('01-the-mouth-from-the-rail-bed');
const programs = s.programs;

// 2. In through the mouth.
await standIn(0, 3, 0, -5);
let crossed = null;
await walkFor(2.5, (i) => {
  if (crossed === null && i.state !== 'outside') crossed = i.lz;
});
s = await mine();
check(crossed !== null && crossed < 0 && crossed > -0.5, `in the mine as you walk in through the mouth (${crossed?.toFixed(2)} m past its line)`);
check(s.state === 'adit' && s.interior === 'mine' && Math.abs(s.floor) < 1e-6 && s.sun === outdoorSun && s.outdoors, `in the adit: on its floor (${s.floor.toFixed(3)} m), in the outdoors' light (${s.sun})`);
await standIn(0.6, -1.5, -0.4, -10);
await shot('02-the-adit');

// 3. Round the bend and on to the gallery.
await standIn(0, -8.6, -10, -10.3);
const inWalk = [];
await walkFor(3.2, (i) => inWalk.push(i), 0.05);
await step(1);
s = await mine();
const firstInside = inWalk.find((i) => i.state === 'inside');
check(!!firstInside && firstInside.lx < -3.3, `the switch runs ${firstInside ? (-firstInside.lx - 0).toFixed(2) : '?'} m round the bend, out of sight of the mouth`);
check(inWalk.every((i) => !(i.seesOut && (!i.outdoors || i.sun !== outdoorSun))), 'the outdoors is never hidden nor the sun faded while the mouth can be seen');
check(s.state === 'inside' && s.sun === 0 && !s.zoneShown && s.fog.join() === '6,18', `past the bend: the sun out (${s.sun}), the outdoors hidden, fog at ${s.fog}`);
check(s.onMine === 4, `the pool on the 4 nearest flames (${s.onMine})`);
check(s.programs === programs, `no new shader program walking in (${programs} → ${s.programs})`);
const cost = await page.evaluate(() => {
  const { mine: m } = window.__descent.world.underground;
  return { meshes: m.root.children.length, parts: m.parts.slice(0, 3).map((name, i) => ({ name, triangles: m.triangles(i) })) };
});
check(cost.meshes === 4, `the whole mine is ${cost.meshes} meshes (the rock and props, flagstones, bricks, glows)`);
for (const c of cost.parts) check(c.triangles > 1000 && c.triangles < 6000, `${c.name}: ${c.triangles} triangles`);
await standIn(-6.4, -10.6, -12, -12.4);
s = await mine();
check(s.part === 1 && s.parts.join() === 'true,true,true', `in the cart hall: it and its neighbours drawn (${s.parts})`);
let frame = await frameCost();
console.log(`     a frame in the cart hall: ${frame.calls} draw calls, ${frame.triangles} triangles`);
await shot('03-the-cart-hall');
await standIn(-15.8, -12, -9, -9.5);
await shot('04-the-cart-hall-from-the-passage');
await standIn(-15.5, -20.5, -15.5, -35, 0.15);
s = await mine();
check(s.part === 2 && s.parts.join() === 'false,true,true', `in the gallery: the adit not drawn (${s.parts})`);
frame = await frameCost();
console.log(`     a frame in the gallery: ${frame.calls} draw calls, ${frame.triangles} triangles`);
await shot('05-the-gallery');
await standIn(-15.8, -31.5, -10, -33.5, 0.1);
await shot('06-the-head-of-the-ramp');

// 4. Back to the bend.
await standIn(-7.5, -10, 0, -10);
const outWalk = [];
await walkFor(4, (i) => outWalk.push(i), 0.02);
await step(0.5);
const firstSeen = outWalk.find((i) => i.seesOut);
check(!!firstSeen && firstSeen.sun === outdoorSun && firstSeen.outdoors, `the sun is back up (${firstSeen?.sun}) before the mouth can be seen (from ${firstSeen ? (-firstSeen.lx).toFixed(2) : '?'} m round the bend)`);
s = await mine();
check(s.state === 'adit' && s.sun === outdoorSun && s.programs === programs, `back in the adit, in the sun (${s.state}), no new program (${s.programs})`);

// 5. A save made in the gallery loads there.
await standIn(-15.5, -26, -15.5, -35);
await step(1);
s = await mine();
check(s.state === 'inside' && s.interior === 'mine', `standing in the gallery again (${s.state})`);
await page.evaluate(() => window.__descent.adventure.saves.onLeaving());
const record = await page.evaluate(async () => {
  await window.__descent.saved();
  return new Promise((resolve) => {
    const open = indexedDB.open('descent-vr');
    open.onsuccess = () => {
      const get = open.result.transaction('save').objectStore('save').get('character');
      get.onsuccess = () => (open.result.close(), resolve(get.result));
    };
  });
});
check(record?.interior === 'mine', `the save records the mine (${record?.interior})`);
await enter();
await step(0.1);
s = await mine();
check(s.state === 'inside' && s.interior === 'mine' && s.sun === 0 && !s.zoneShown && s.onMine === 4, `reloaded in the mine, in its light (${s.state}, sun ${s.sun}, ${s.onMine} flames)`);
check(Math.hypot(s.lx + 15.5, s.lz + 26) < 0.3 && Math.abs(s.floor) < 1e-6, `where you stood (${s.lx.toFixed(2)}, ${s.lz.toFixed(2)}), on the gallery's floor`);
// A fresh page in the mine compiles only what it draws, never more than walking in did.
check(s.programs <= programs, `no more shader programs loading in than walking in (${s.programs} ≤ ${programs})`);
await shot('07-loaded-in-the-gallery');

// 6. Dying in the mine wakes you outside its mouth.
await page.evaluate(() => window.__descent.player.damage(9999));
await step(5);
s = await mine();
check(s.state === 'outside' && s.interior === null && s.sun === outdoorSun && s.zoneShown, `you wake outside, in the sun (${s.state}, sun ${s.sun})`);
check(Math.abs(s.lx) < 0.3 && s.lz > 2 && s.lz < 4 && Math.abs(s.yaw) < 0.05, `on the rail bed ${s.lz.toFixed(2)} m out, facing the mouth (yaw ${s.yaw.toFixed(3)})`);
await shot('08-waking-outside-the-mouth');

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
