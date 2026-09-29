// Checks for the old mine, down from the gallery to the Warden's hall
// (issues/26-the-old-mine-down-to-the-wardens-hall.md) in headless Chromium
// with the IWER emulator. Start `npx vite --port 5173` first, then:
//
//   node .scratch/oakvale-starting-zone/checks/mine-deep.mjs [http://localhost:5173] [shots/]
//
// The Adventure at the plain URL, paused, stepped by `__descent.step` (and
// `teleport`); you walk with the left stick. What it checks:
//
// 1. In through the mouth (the mine's ground is only yours that way), then
//    down the bandits' ramp at a walk: the floor goes down smoothly, 2 m to
//    the landing and 2 m more to the dig, never a step, and only the part
//    you're in and its neighbours are drawn all the way.
// 2. The dig, the breach, the carved passage (down 3 m more), the
//    antechamber and the Warden's hall 7 m down: each on its floor, the pool
//    on the 4 nearest flames, no new shader program on the way down, and a
//    frame's cost in the dig and in the hall.
// 3. The whole mine is 4 meshes.
// 4. A save made in the hall loads there, in the mine's light.
//
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
      drawn: m.drawn,
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

// 1. In through the mouth, on to the gallery.
await standIn(0, 9, 0, 0);
await step(1);
let s = await mine();
const programs = s.programs;
await standIn(0, 3, 0, -5);
await walkFor(2.5);
s = await mine();
check(s.state === 'adit' && s.interior === 'mine', `in the mine by its mouth (${s.state})`);
await standIn(-15.5, -30, -15.5, -34);
await step(1);
s = await mine();
check(s.part === 2 && s.state === 'inside' && Math.abs(s.floor) < 1e-6, `in the gallery, on its floor (${s.floor.toFixed(3)} m)`);

// Down the ramp's first leg, east, at a walk.
await standIn(-13.5, -33.25, 10, -33.25);
await shot('09-the-head-of-the-ramp');
const down = [];
await walkFor(8.5, (i) => down.push(i), 0.1);
s = await mine();
check(Math.abs(s.floor + 2) < 0.05 && s.part === 3, `down the first leg to the landing, 2 m down (${s.floor.toFixed(2)} m, part ${s.part})`);
// And its second, north, into the dig.
await standIn(2.75, -34, 2.75, -60);
await shot('10-the-landing-and-the-second-leg');
await walkFor(7.5, (i) => down.push(i), 0.1);
s = await mine();
check(Math.abs(s.floor + 4) < 0.05 && s.part === 4, `down the second leg into the dig, 4 m down (${s.floor.toFixed(2)} m, part ${s.part})`);
let worst = 0;
for (let i = 1; i < down.length; i++) {
  const run = Math.hypot(down[i].lx - down[i - 1].lx, down[i].lz - down[i - 1].lz);
  if (run > 0.05 && run < 1) worst = Math.max(worst, Math.abs(down[i].floor - down[i - 1].floor) / run);
}
check(worst > 0.15 && worst <= 0.2 + 1e-3, `the ramp is never steeper than 1 in 5 underfoot (at most 1 in ${(1 / worst).toFixed(2)})`);
check(down.every((i) => i.drawn.every((d, k) => d === (Math.abs(k - i.part) <= 1))), 'only the part you walk in and its neighbours are drawn all the way down');
check(down.every((i) => i.onMine === 4), `the pool on 4 flames all the way down (${Math.min(...down.map((i) => i.onMine))} at the fewest)`);

// 2. The dig.
await standIn(2.75, -47.5, 6, -56, 0.05);
s = await mine();
check(s.part === 4 && s.drawn.join() === 'false,false,false,true,true,true,false,false', `in the dig: it, the ramp and the passage drawn (${s.drawn})`);
let frame = await frameCost();
console.log(`     a frame in the dig: ${frame.calls} draw calls, ${frame.triangles} triangles`);
await shot('11-the-dig');
await standIn(3, -46.8, -0.5, -50.5, -0.45);
await shot('12-what-the-bandits-dropped');
await standIn(4.5, -52, 9, -53.5, 0.05);
await shot('13-the-breach');
// Through the breach and down the carved passage.
await standIn(11.5, -53.5, 11.5, -20, -0.05);
await shot('14-the-carved-passage');
await walkFor(4, undefined, 0.1);
s = await mine();
check(s.part === 5 && s.floor < -4 && s.floor > -7, `down the carved passage (${s.floor.toFixed(2)} m, part ${s.part})`);
await standIn(11.5, -33, 22, -33);
s = await mine();
check(Math.abs(s.floor + 7) < 1e-6, `at the passage's foot, 7 m down (${s.floor.toFixed(3)} m)`);
await standIn(14, -33, 24, -35.5);
await shot('15-the-antechamber');
await standIn(22, -31, 22, -45, 0.05);
s = await mine();
check(s.part === 6 && s.drawn.join() === 'false,false,false,false,false,true,true,true', `in the antechamber: the passage and the hall drawn (${s.drawn})`);
await shot('16-through-the-gate');

// The Warden's hall.
await standIn(22, -39.5, 22, -52, 0.08);
await step(1);
s = await mine();
check(s.part === 7 && Math.abs(s.floor + 7) < 1e-6 && s.state === 'inside' && s.sun === 0 && !s.zoneShown, `in the Warden's hall, on its floor 7 m down (${s.floor.toFixed(3)} m), in the mine's light`);
check(s.onMine === 4, `the pool on the hall's 4 pillar torches (${s.onMine})`);
check(s.programs === programs, `no new shader program all the way down (${programs} → ${s.programs})`);
frame = await frameCost();
console.log(`     a frame in the hall: ${frame.calls} draw calls, ${frame.triangles} triangles`);
await shot('17-the-wardens-hall');
await standIn(19, -45.4, 30, -45.4, 0.05);
await shot('18-the-choked-east-gate');
await standIn(25, -50, 22, -39, 0.1);
await shot('19-back-to-the-gate');

// 3. The whole mine is four meshes.
const meshes = await page.evaluate(() => window.__descent.world.underground.mine.root.children.map((m) => m.name));
check(meshes.length === 4, `the whole mine is ${meshes.length} meshes: ${meshes.join(', ')}`);

// 4. A save made in the hall loads there.
await standIn(22, -42, 22, -52);
await page.evaluate(() => window.__descent.adventure.saves.onLeaving());
await page.evaluate(() => window.__descent.saved());
await enter();
await step(0.1);
s = await mine();
check(s.state === 'inside' && s.part === 7 && Math.abs(s.floor + 7) < 1e-6 && s.sun === 0 && s.onMine === 4, `reloaded in the hall, on its floor, in the mine's light (${s.state}, ${s.floor.toFixed(3)} m, ${s.onMine} flames)`);
check(s.programs <= programs, `no more shader programs loading in than walking in (${s.programs} ≤ ${programs})`);

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
