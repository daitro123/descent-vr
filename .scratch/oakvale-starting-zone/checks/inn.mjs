// Checks for the inn (issues/23-the-inn.md) in headless Chromium with the
// IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/oakvale-starting-zone/checks/inn.mjs [http://localhost:5173] [shots/]
//
// Game time is stepped through the debug handle (`paused`, `step`,
// `teleport`); you walk with the left stick. The Interiors switch is read off
// the World.
//
// 1. Out on the road before the inn: its door shut, the room hidden, the pool dark.
// 2. Walking up to the door opens it: the room shows, lit by the pool on its
//    four flames, under the afternoon sun.
// 3. Walking in: the door shuts behind you, then the sun fades out, the pool
//    stays on the room's flames and the outdoors (zone and sky) is hidden. The
//    room is a few thousand triangles and one draw call, plus its glows and
//    the door's two leaves.
// 4. Turning round and walking back to the door: the sun is back up before
//    the door opens. Out on the road the room is hidden and the pool dark.
//    Walking in and out compiles no new program (`renderer.info.programs`).
// 5. Dying wakes you by the hearth, inside with the door shut and the room lit.
// 6. A save made inside records the inn; reloading loads you inside it with
//    the door shut and the room lit.
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

/** The inn's switch, its light and the World's, and where you stand in the inn's frame. */
const inn = () =>
  page.evaluate(() => {
    const { world, camera } = window.__descent;
    const held = world.interiors.find((h) => h.interior.id === 'inn');
    const { interior, switch: sw } = held;
    const { frame, flames } = interior;
    const head = camera.getWorldPosition(camera.position.clone());
    const dx = head.x - frame.x;
    const dz = head.z - frame.z;
    const c = Math.cos(frame.yaw);
    const s = Math.sin(frame.yaw);
    const onFlames = world.pool.filter((l) => l.intensity > 0 && flames.some((f) => Math.hypot(l.position.x - f.x, l.position.y - f.y, l.position.z - f.z) < 1e-6)).length;
    return {
      state: sw.state,
      door: sw.door,
      light: sw.light,
      interior: world.interior,
      room: interior.room.visible,
      outdoors: world.zoneAt(0, 0).root.visible,
      sun: world.sun.intensity,
      lit: world.pool.filter((l) => l.intensity > 0).length,
      onFlames,
      programs: window.__descent.renderer.info.programs.length,
      lx: dx * c - dz * s,
      lz: dx * s + dz * c,
      hd: interior.footprint.hd,
    };
  });

/** Stand at (lx, lz) in the inn's frame, facing the point (tx, tz) in it. */
async function standInInn(lx, lz, tx, tz) {
  await page.evaluate(
    ([lx, lz, tx, tz]) => {
      const { frame } = window.__descent.world.interiors[0].interior;
      const c = Math.cos(frame.yaw);
      const s = Math.sin(frame.yaw);
      const toWorld = (a, b) => [frame.x + a * c + b * s, frame.z - a * s + b * c];
      const [x, z] = toWorld(lx, lz);
      const [X, Z] = toWorld(tx, tz);
      window.__descent.teleport(x, z, Math.atan2(-(X - x), -(Z - z)));
    },
    [lx, lz, tx, tz],
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
    if (watch) await watch(await inn());
  }
  await page.evaluate(() => window.__descent.device.controllers.left.updateAxes('thumbstick', 0, 0));
  await xrFrames(2);
}

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => (window.__descent.paused = true));
const outdoorSun = await page.evaluate(() => window.__descent.world.zoneAt(0, 0).atmosphere.sun.intensity);

// 1. Out on the road.
await standInInn(0, 4 + 7, 0, 0);
await step(1);
let s = await inn();
check(s.state === 'outside' && s.door === 0 && !s.room && s.lit === 0, `7 m out: the door shut, the room hidden, the pool dark (${s.state}, door ${s.door}, ${s.lit} lit)`);
await shot('01-the-inn-from-the-road');
const programs = s.programs;

// 2. Up to the door.
let openedAt = null;
await walkFor(3, (i) => {
  if (openedAt === null && i.door > 0) openedAt = i.hd - i.lz;
}, 0.05);
s = await inn();
check(openedAt !== null && openedAt < -1.7 && openedAt > -2.3, `the door starts to open about 2 m out (${openedAt?.toFixed(2)} m)`);
await standInInn(0, s.hd + 1.2, 0, 0);
await step(1);
s = await inn();
check(s.state === 'atDoor' && s.door === 1 && s.room, `at the door: open, the room showing (${s.state}, door ${s.door})`);
check(s.onFlames === 4 && s.sun === outdoorSun && s.outdoors, `the room's four flames lit by the pool (${s.onFlames}), under the sun (${s.sun})`);
await shot('02-the-hearth-through-the-open-door');

// 3. In.
const inWalk = [];
await walkFor(2, (i) => inWalk.push(i), 0.05);
await step(1);
s = await inn();
const firstInside = inWalk.find((i) => i.state === 'inside');
check(!!firstInside && firstInside.hd - firstInside.lz > 1.4, `the door shuts behind you ${firstInside ? (firstInside.hd - firstInside.lz).toFixed(2) : '?'} m in`);
check(inWalk.every((i) => !(i.light > 0 && i.door > 0)), 'the light swaps only once the door is shut');
check(s.state === 'inside' && s.interior === 'inn' && s.door === 0 && s.light === 1, `inside: ${s.state}, the World says you're in the ${s.interior}`);
check(s.sun === 0 && !s.outdoors && s.onFlames === 4, `the sun out (${s.sun}), the outdoors hidden, the pool on the room's flames (${s.onFlames})`);
const cost = await page.evaluate(() => {
  const { interior } = window.__descent.world.interiors[0];
  const meshes = [];
  // The innkeeper hangs from the room too: they're the villagers' check's (villagers.mjs), one draw call.
  // So does the stash's chest, two draws: the stash's (inventory/checks/stash.mjs).
  interior.root.traverse((o) => o.isMesh && o.visible && o.name !== 'innkeeper-bark' && !o.isSkinnedMesh && !o.name.startsWith('stash-chest') && meshes.push(o));
  const room = meshes.find((m) => m.name === 'inn-room');
  const leaves = meshes.filter((m) => m.name === 'inn-door');
  const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  return { meshes: meshes.length, room: tris(room.geometry), leaves: leaves.length, leafTris: leaves.reduce((n, m) => n + tris(m.geometry), 0), glows: meshes.filter((m) => m.isInstancedMesh).length };
});
check(cost.room > 1000 && cost.room < 9000, `the room is ${cost.room} triangles in one mesh`);
check(cost.meshes === 1 + cost.glows + cost.leaves && cost.glows === 1 && cost.leaves === 2, `draw calls: the room, ${cost.glows} for its glows and ${cost.leaves} door leaves (${cost.leafTris} triangles)`);
const inside = await page.evaluate(async () => {
  const { renderer } = window.__descent;
  await new Promise((r) => renderer.xr.getSession().requestAnimationFrame(() => r()));
  await new Promise((r) => renderer.xr.getSession().requestAnimationFrame(() => r()));
  return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
});
console.log(`     a frame inside: ${inside.calls} draw calls, ${inside.triangles} triangles (everything in view)`);
await standInInn(-1.5, 1.5, 4.5, -1);
await shot('03-the-taproom-and-the-hearth');
await standInInn(2.5, 0.5, -1, -3.2);
await shot('04-the-bar');
await standInInn(0, -1, 0, 4);
await shot('05-the-shut-door-from-inside');

// 4. Back out.
const outWalk = [];
await walkFor(4, (i) => outWalk.push(i), 0.02);
await step(1);
s = await inn();
const firstOpen = outWalk.find((i) => i.door > 0);
check(!!firstOpen && firstOpen.sun === outdoorSun && firstOpen.outdoors, `the sun is back up (${firstOpen?.sun}) before the door opens`);
if (process.env.TRACE) console.log(outWalk.map((i) => `${i.state[0]}${(i.hd - i.lz).toFixed(2)}:${i.light.toFixed(2)}/${i.door.toFixed(2)}`).join(' '));
const leaving = outWalk.filter((i) => i.state === 'leaving');
check(leaving.length > 0 && leaving.every((i) => i.door === 0 && i.outdoors), `walking back to the door: the door stays shut while the sun comes up (${leaving.length} steps)`);
check(s.state === 'outside' && !s.room && s.lit === 0 && s.sun === outdoorSun && s.outdoors && s.interior === null, `back on the road: ${s.state}, the room hidden, the pool dark, the sun up`);
check(s.programs === programs, `no new shader program walking in and out (${programs} → ${s.programs})`);

// 5. Death wakes you by the hearth.
await page.evaluate(() => window.__descent.player.damage(9999));
await step(4.5, 1 / 30);
s = await inn();
check(s.state === 'inside' && s.interior === 'inn' && s.door === 0 && s.sun === 0 && !s.outdoors, `you wake inside, door shut, the room lit (${s.state}, sun ${s.sun})`);
check(Math.hypot(s.lx - 3.5, s.lz + 0.8) < 0.3, `by the hearth (${s.lx.toFixed(2)}, ${s.lz.toFixed(2)} in the inn)`);
await shot('06-waking-by-the-hearth');

// 6. A save made inside loads inside.
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
check(record?.interior === 'inn', `the save records the inn (${record?.interior})`);
await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => (window.__descent.paused = true));
await step(0.1);
s = await inn();
check(s.state === 'inside' && s.interior === 'inn' && s.door === 0 && s.sun === 0 && !s.outdoors && s.onFlames === 4, `reloaded inside, door shut and the room lit (${s.state}, sun ${s.sun}, ${s.onFlames} flames)`);
check(Math.hypot(s.lx - 3.5, s.lz + 0.8) < 0.3, `where you stood (${s.lx.toFixed(2)}, ${s.lz.toFixed(2)} in the inn)`);
await shot('07-loaded-inside');

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
