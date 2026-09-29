// Checks for the house by the well and the smithy
// (issues/24-the-house-by-the-well-and-the-smithy.md) in headless Chromium
// with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/oakvale-starting-zone/checks/house.mjs [http://localhost:5173] [shots/]
//
// Game time is stepped through the debug handle (`paused`, `step`,
// `teleport`); you walk with the left stick. The Interiors switch is read off
// the World.
//
// 1. On the path before the house: its door shut, the room hidden, the pool dark.
// 2. Walking up to the door (right of the front's middle) opens it: the room
//    shows, lit by the pool on its two flames (the hearth and the candle).
// 3. Walking in: the door shuts behind you, then the sun fades out and the
//    outdoors is hidden. The room is a few thousand triangles and one draw
//    call, plus its glows and the door's leaf. Screenshots round the room.
// 4. Walking back out: the sun is up before the door opens, and walking in
//    and out compiles no new program (`renderer.info.programs`).
// 5. A save made inside records the house; reloading loads you inside it
//    with the door shut and the room lit.
// 6. The smithy: you walk in under its roof up to the forge and the anvil,
//    with no switch (still outdoors, in the sun), and the anvil stops you.
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

/** The house's switch, its light and the World's, and where you stand in the house's frame. */
const house = () =>
  page.evaluate(() => {
    const { world, camera } = window.__descent;
    const held = world.interiors.find((h) => h.interior.id === 'house');
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
      doorX: interior.door.x,
    };
  });

/** Stand at (lx, lz) in a structure's frame (the house by the well's, or the smithy's), facing the point (tx, tz) in it, looking up by `pitch`. */
async function standIn(kind, lx, lz, tx, tz, pitch = 0) {
  await page.evaluate(
    async ([kind, lx, lz, tx, tz, pitch]) => {
      const { buildLayout } = await import('/src/maps/forest/layout.ts');
      window.__layout ??= buildLayout();
      const frame = window.__layout.structures.find((s) => s.kind === kind && s.variant === 0);
      const c = Math.cos(frame.yaw);
      const s = Math.sin(frame.yaw);
      const toWorld = (a, b) => [frame.x + a * c + b * s, frame.z - a * s + b * c];
      const [x, z] = toWorld(lx, lz);
      const [X, Z] = toWorld(tx, tz);
      window.__descent.teleport(x, z, Math.atan2(-(X - x), -(Z - z)));
      const q = window.__descent.device.quaternion;
      Object.assign(q, { x: Math.sin(pitch / 2), y: 0, z: 0, w: Math.cos(pitch / 2) });
    },
    [kind, lx, lz, tx, tz, pitch],
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
    if (watch) await watch(await house());
  }
  await page.evaluate(() => window.__descent.device.controllers.left.updateAxes('thumbstick', 0, 0));
  await xrFrames(2);
}
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
const H = await page.evaluate(async () => (await import('/src/maps/forest/house.ts')).HOUSE);
const SM = await page.evaluate(async () => (await import('/src/maps/forest/smithy.ts')).SMITHY);
const dx = H.door.x;

// 1. On the path before the house.
await standIn('house', dx - 1.5, H.hd + 7, 0, 0);
await step(1);
let s = await house();
check(s.state === 'outside' && s.door === 0 && !s.room && s.lit === 0, `7 m out: the door shut, the room hidden, the pool dark (${s.state}, door ${s.door}, ${s.lit} lit)`);
await shot('01-the-house-by-the-well');
const programs = s.programs;

// 2. Up to the door.
await standIn('house', dx, H.hd + 5, dx, 0);
let openedAt = null;
await walkFor(2.5, (i) => {
  if (openedAt === null && i.door > 0) openedAt = i.hd - i.lz;
}, 0.05);
check(openedAt !== null && openedAt < -1.7 && openedAt > -2.3, `the door starts to open about 2 m out (${openedAt?.toFixed(2)} m)`);
await standIn('house', dx, H.hd + 1.3, 2.4, -1.75);
await step(1);
s = await house();
check(s.state === 'atDoor' && s.door === 1 && s.room, `at the door: open, the room showing (${s.state}, door ${s.door})`);
check(s.onFlames === 2 && s.sun === outdoorSun && s.outdoors, `the hearth and the candle lit by the pool (${s.onFlames}), under the sun (${s.sun})`);
await shot('02-the-room-from-the-door');

// 3. In.
await standIn('house', dx, H.hd + 0.8, dx, 0);
const inWalk = [];
await walkFor(1.8, (i) => inWalk.push(i), 0.05);
await step(1);
s = await house();
const firstInside = inWalk.find((i) => i.state === 'inside');
check(!!firstInside && firstInside.hd - firstInside.lz > 1.4, `the door shuts behind you ${firstInside ? (firstInside.hd - firstInside.lz).toFixed(2) : '?'} m in`);
check(inWalk.every((i) => !(i.light > 0 && i.door > 0)), 'the light swaps only once the door is shut');
check(s.state === 'inside' && s.interior === 'house' && s.door === 0 && s.light === 1, `inside: ${s.state}, the World says you're in the ${s.interior}`);
check(s.sun === 0 && !s.outdoors && s.onFlames === 2, `the sun out (${s.sun}), the outdoors hidden, the pool on the room's flames (${s.onFlames})`);
const cost = await page.evaluate(() => {
  const { interior } = window.__descent.world.interiors.find((h) => h.interior.id === 'house');
  const meshes = [];
  interior.root.traverse((o) => o.isMesh && o.visible && meshes.push(o));
  const room = meshes.find((m) => m.name === 'house-room');
  const leaves = meshes.filter((m) => m.name === 'house-door');
  const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  return { meshes: meshes.length, room: tris(room.geometry), leaves: leaves.length, leafTris: leaves.reduce((n, m) => n + tris(m.geometry), 0), glows: meshes.filter((m) => m.isInstancedMesh).length };
});
check(cost.room > 1000 && cost.room < 9000, `the room is ${cost.room} triangles in one mesh`);
check(cost.meshes === 1 + cost.glows + cost.leaves && cost.glows === 1 && cost.leaves === 1, `draw calls: the room, ${cost.glows} for its glows and ${cost.leaves} door leaf (${cost.leafTris} triangles)`);
const inside = await page.evaluate(async () => {
  const { renderer } = window.__descent;
  await new Promise((r) => renderer.xr.getSession().requestAnimationFrame(() => r()));
  await new Promise((r) => renderer.xr.getSession().requestAnimationFrame(() => r()));
  return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
});
console.log(`     a frame inside: ${inside.calls} draw calls, ${inside.triangles} triangles (everything in view)`);
await standIn('house', -0.4, 1.9, 2.6, -1.75);
await shot('03-the-hearth-and-the-pot');
await standIn('house', 1.2, 1.8, -2.6, -1.6);
await shot('04-the-bed-the-chest-and-the-table');
await standIn('house', 1.6, 0.9, -1.2, -2.4, 0.5);
await shot('05-open-to-the-rafters');
await standIn('house', -0.6, -1.3, dx, H.hd);
await shot('06-the-shut-door-from-inside');

// 4. Back out.
await standIn('house', dx, -0.6, dx, H.hd);
const outWalk = [];
await walkFor(3, (i) => outWalk.push(i), 0.02);
await step(1);
s = await house();
const firstOpen = outWalk.find((i) => i.door > 0);
check(!!firstOpen && firstOpen.sun === outdoorSun && firstOpen.outdoors, `the sun is back up (${firstOpen?.sun}) before the door opens`);
check(s.state === 'outside' && !s.room && s.lit === 0 && s.sun === outdoorSun && s.outdoors && s.interior === null, `back outside: ${s.state}, the room hidden, the pool dark, the sun up`);
check(s.programs === programs, `no new shader program walking in and out (${programs} → ${s.programs})`);

// 5. A save made inside loads inside.
await standIn('house', 0.8, -0.8, -1, 1);
await step(1);
s = await house();
check(s.interior === 'house', `standing inside again (${s.interior})`);
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
check(record?.interior === 'house', `the save records the house (${record?.interior})`);
await enter();
await step(0.1);
s = await house();
check(s.state === 'inside' && s.interior === 'house' && s.door === 0 && s.sun === 0 && !s.outdoors && s.onFlames === 2, `reloaded inside, door shut and the room lit (${s.state}, sun ${s.sun}, ${s.onFlames} flames)`);
check(Math.hypot(s.lx - 0.8, s.lz + 0.8) < 0.3, `where you stood (${s.lx.toFixed(2)}, ${s.lz.toFixed(2)} in the house)`);
await shot('07-loaded-inside');

// 6. The smithy, walked into under its roof.
await standIn('smithy', -1.8, SM.hd + 4, -1.8, 0);
await step(1);
await shot('08-the-smithy-from-the-road');
/** Where you stand in the smithy's frame, and whether you're outdoors. */
const inSmithy = () =>
  page.evaluate(() => {
    const { world, camera } = window.__descent;
    const frame = window.__layout.structures.find((s) => s.kind === 'smithy');
    const head = camera.getWorldPosition(camera.position.clone());
    const dx = head.x - frame.x;
    const dz = head.z - frame.z;
    const c = Math.cos(frame.yaw);
    const s = Math.sin(frame.yaw);
    return { lx: dx * c - dz * s, lz: dx * s + dz * c, interior: world.interior, outdoors: world.outdoorsShown, sun: world.sun.intensity };
  });
await walkFor(2.4);
let m = await inSmithy();
check(m.lz < SM.hd - 0.5 && m.interior === null && m.outdoors && m.sun === outdoorSun, `in under the roof (${m.lz.toFixed(2)} m from the middle), still outdoors in the sun`);
await walkFor(3);
m = await inSmithy();
const forgeFront = SM.forge.z + SM.forge.hd;
check(m.lz > forgeFront + 0.2 && m.lz < forgeFront + 0.45, `walking on, the forge stops you at its front (${(m.lz - forgeFront).toFixed(2)} m off it)`);
await standIn('smithy', SM.anvil.x + 1.6, SM.anvil.z, SM.anvil.x, SM.anvil.z);
await walkFor(1.5);
m = await inSmithy();
const offAnvil = Math.hypot(m.lx - SM.anvil.x, m.lz - SM.anvil.z) - SM.anvil.r;
check(offAnvil > 0.2 && offAnvil < 0.4, `the anvil stops you an arm's length off (${offAnvil.toFixed(2)} m)`);
await standIn('smithy', 1.6, 2.2, -1.2, -1.4, -0.3);
await shot('09-at-the-forge-and-the-anvil');

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
