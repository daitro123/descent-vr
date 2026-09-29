// Checks for the patrol and the watchtower (issues/22-the-patrol-and-the-watchtower.md)
// in headless Chromium with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/oakvale-starting-zone/checks/patrol-and-watchtower.mjs [http://localhost:5173] [shots/]
//
// Game time is stepped through the debug handle (`paused`, `step`,
// `teleport`), not XR frames. Raiders in the Fields and the taking of The
// Lumber Camp are done straight through the Adventure, as the board and the
// farm would do them. Bandits are felled with a blow big enough to kill.
//
// 1. The patrol: two bandit thugs at level 2 on the camp road, walking it in
//    single file at 0.8 m/s, 1.8 m apart, each on the road; they pause 3 s
//    at each end and walk back, the last in the file leading.
// 2. Walking the main road past where the camp road leaves it, they never
//    notice you.
// 3. Jumped on their road, both fight you. Felled, each pays 20 XP (level 2),
//    and the tracker still says "Bandits defeated at the lumber camp: 0/5".
// 4. The watchtower: two bandit thugs and a bandit archer at level 2 on the
//    hill's flat top. Coming up the road to the door brings the door's thug
//    and the archer, and leaves the thug round the back.
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

// Every canvas remembers what was written on it since it was last cleared, so
// the check can read the tracker back.
await page.addInitScript(() => {
  const P = CanvasRenderingContext2D.prototype;
  const fill = P.fillText;
  const clear = P.clearRect;
  P.fillText = function (text, ...rest) {
    (this.__texts ??= []).push(String(text));
    return fill.call(this, text, ...rest);
  };
  P.clearRect = function (...args) {
    this.__texts = [];
    return clear.apply(this, args);
  };
});

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => {
  const d = window.__descent;
  d.paused = true;
  d.device.controllers.left.position.set(-0.4, 0.3, 0.2);
  d.device.controllers.right.position.set(0.4, 0.3, 0.2);
});
await xrFrames(2);

/** Stand at (x, z) facing (tx, tz); one XR frame brings the head there. */
async function standFacing(x, z, tx, tz) {
  await page.evaluate(([x, z, tx, tz]) => window.__descent.teleport(x, z, Math.atan2(-(tx - x), -(tz - z))), [x, z, tx, tz]);
  await xrFrames(2);
  await step(1 / 72);
}
/** Tilt the head down (negative) or up by `a` radians, for a screenshot. */
async function tilt(a) {
  await page.evaluate((a) => window.__descent.device.quaternion.set(Math.sin(a / 2), 0, 0, Math.cos(a / 2)), a);
  await xrFrames(3);
}
/** A camp's members: what each is, where, and what it's doing. */
const members = (id) =>
  page.evaluate(
    (id) =>
      window.__descent.camps.camps
        .find((c) => c.plan.id === id)
        .members.map((m) => ({
          kind: m.enemy.kind,
          family: m.enemy.family,
          level: m.enemy.level,
          alive: m.enemy.alive,
          mind: m.mind,
          x: m.enemy.position.x,
          z: m.enemy.position.z,
          yaw: m.enemy.root.rotation.y,
        })),
    id,
  );
const pausing = () => page.evaluate(() => window.__descent.camps.camps.find((c) => c.plan.id === 'patrol').patrol.pausing);
const tracker = () =>
  page.evaluate(() => {
    const { tracker } = window.__descent.adventure;
    return tracker.mesh.visible ? tracker.card.ctx.__texts : null;
  });
const xp = () => page.evaluate(() => window.__descent.state.xp);
/** Fell a camp's member at `i` with one blow. */
const fell = (id, i) =>
  page.evaluate(
    ([id, i]) => {
      const m = window.__descent.camps.camps.find((c) => c.plan.id === id).members[i];
      m.enemy.takeHit(99999, m.enemy.position.clone().set(0, 0, 0));
    },
    [id, i],
  );

const PLAN = await page.evaluate(() => {
  const zone = window.__descent.world.zoneAt(0, 0);
  const patrol = zone.camps.find((c) => c.id === 'patrol');
  const tower = zone.camps.find((c) => c.id === 'watchtower');
  return { road: patrol.road, tower: tower.posts };
});
const ROAD = PLAN.road;
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** How far (x, z) is from the patrol's road. */
function fromRoad(p) {
  let best = Infinity;
  for (let i = 0; i < ROAD.length - 1; i++) {
    const a = ROAD[i];
    const dx = ROAD[i + 1].x - a.x;
    const dz = ROAD[i + 1].z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z));
  }
  return best;
}
/** Metres along the road from its main-road end. */
function along(p) {
  let best = { d: Infinity, s: 0 };
  let s = 0;
  for (let i = 0; i < ROAD.length - 1; i++) {
    const a = ROAD[i];
    const dx = ROAD[i + 1].x - a.x;
    const dz = ROAD[i + 1].z - a.z;
    const len = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (len * len)));
    const d = Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z);
    if (d < best.d) best = { d, s: s + t * len };
    s += len;
  }
  return best.s;
}

await step(1);

// Raiders in the Fields, then The Lumber Camp taken, as the board and the farm would.
await page.evaluate(() => {
  const { adventure } = window.__descent;
  adventure.apply({ kind: 'accept' }, adventure.hale.position);
});
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => {
    const m = window.__descent.camps.camps.find((c) => c.plan.id === 'farm').members.find((m) => m.enemy.alive);
    m.enemy.takeHit(99999, m.enemy.position.clone().set(0, 0, 0));
  });
  await step(0.2);
}
await page.evaluate(() => {
  const { adventure } = window.__descent;
  adventure.apply({ kind: 'handIn' }, adventure.hale.position);
  adventure.apply({ kind: 'accept' }, adventure.hale.position);
});
await step(3);

// 1. The patrol walks its road, watched from the village (well out of its way).
{
  const m = await members('patrol');
  const kinds = m.map((e) => `${e.family} ${e.kind} level ${e.level}`).join(', ');
  check(kinds === 'bandit grunt level 2, bandit grunt level 2', `the patrol is two bandit thugs at level 2 (${kinds})`);
  // Sample every 0.25 s of game time for 40 s.
  const samples = [];
  for (let t = 0; t < 40; t += 0.25) {
    await step(0.25);
    samples.push({ t, m: await members('patrol'), pausing: await pausing() });
  }
  const offRoad = Math.max(...samples.flatMap((s) => s.m.map(fromRoad)));
  check(offRoad < 0.35, `both keep to the camp road (at most ${offRoad.toFixed(2)} m off it)`);
  const gaps = samples.map((s) => flat(s.m[0], s.m[1]));
  check(Math.min(...gaps) > 1.3 && Math.max(...gaps) < 2.3, `in single file, ${Math.min(...gaps).toFixed(2)} to ${Math.max(...gaps).toFixed(2)} m apart`);
  // Speed over a stretch where the file walks the whole time.
  const walking = samples.findIndex((s, i) => i > 0 && samples.slice(i, i + 17).every((q) => !q.pausing));
  const [a, b] = [samples[walking + 4], samples[walking + 16]];
  const speed = Math.abs(along(b.m[0]) - along(a.m[0])) / (b.t - a.t);
  check(Math.abs(speed - 0.8) < 0.06, `walking at ${speed.toFixed(2)} m/s`);
  // Pauses: runs of pausing samples, whole ones only.
  const runs = [];
  let run = 0;
  for (const [i, s] of samples.entries()) {
    if (s.pausing) run++;
    else if (run) {
      if (i - run > 0) runs.push(run * 0.25);
      run = 0;
    }
  }
  check(runs.length >= 2 && runs.every((r) => Math.abs(r - 3) <= 0.25), `pausing at each end (${runs.map((r) => `${r} s`).join(', ')})`);
  const ends = samples.filter((s) => s.pausing).map((s) => Math.max(...s.m.map(along)));
  const length = along(ROAD.at(-1));
  check(ends.some((e) => e > length - 0.8) && samples.some((s) => s.pausing && Math.min(...s.m.map(along)) < 0.8), `at both ends of the road (${length.toFixed(1)} m long)`);
  // The file keeps its order on the road, so the second of the pair leads out towards the camp and the first leads back.
  const inOrder = samples.filter((s) => along(s.m[1]) > along(s.m[0])).length;
  check(inOrder === samples.length, `the last in the file leads each way (in order ${inOrder}/${samples.length} samples)`);
  check(samples.every((s) => s.m.every((e) => e.mind === 'idle')), `and nothing notices you in the village`);
}

// 2. Walk the main road past the camp road's junction: the patrol never notices.
{
  let woken = 0;
  for (const z of [-38, -41, -44, -47, -50, -53, -56]) {
    // The main road's middle here, read from the layout's own line.
    const at = await page.evaluate(async (z) => {
      const { buildLayout } = await import('/src/maps/forest/layout.ts');
      window.__layout ??= buildLayout();
      const line = window.__layout.paths.find((p) => p.id === 'main').line;
      const [x] = line.reduce((best, p) => (Math.abs(p[1] - z) < Math.abs(best[1] - z) ? p : best));
      return x;
    }, z);
    // Its near edge, towards the camp road.
    await standFacing(at - 1.8, z, at - 1.8, z - 5);
    for (let t = 0; t < 4; t += 0.5) {
      await step(0.5);
      if ((await members('patrol')).some((e) => e.mind !== 'idle')) woken++;
    }
  }
  check(woken === 0, `walking the main road's near edge past the junction, the patrol never notices you`);
  // A look at it from the woods beside its road, as it walks by.
  const length = along(ROAD.at(-1));
  for (let t = 0; t < 40; t += 0.25) {
    const m = await members('patrol');
    if (!(await pausing()) && Math.abs((along(m[0]) + along(m[1])) / 2 - length / 2) < 0.5) break;
    await step(0.25);
  }
  const mid = ROAD[Math.floor(ROAD.length / 2)];
  await standFacing(mid.x + 1, mid.z + 8.6, mid.x - 1, mid.z);
  await tilt(-0.12);
  await shot('01-the-patrol-on-the-camp-road');
  await tilt(0);
}

// 3. Jump the patrol on its road and fell it: it isn't the lumber camp's.
{
  const m = await members('patrol');
  const mid = { x: (m[0].x + m[1].x) / 2, z: (m[0].z + m[1].z) / 2 };
  await standFacing(mid.x - 3, mid.z + 3, mid.x, mid.z);
  await step(0.5);
  const minds = (await members('patrol')).map((e) => e.mind).join();
  check(minds === 'fight,fight', `jumped on its road, both fight you (${minds})`);
  await page.evaluate(() => (window.__descent.player.hp = window.__descent.player.maxHp));
  await tilt(-0.05);
  await shot('02-the-patrol-jumped');
  await tilt(0);
  const before = await tracker();
  const pay = [];
  for (const i of [0, 1]) {
    const was = await xp();
    await fell('patrol', i);
    await step(0.3);
    pay.push((await xp()) - was);
  }
  check(pay.join() === '20,20', `felled, each pays 20 XP (${pay.join(', ')})`);
  const after = await tracker();
  check(
    before?.[1] === 'Bandits defeated at the lumber camp: 0/5' && after?.[1] === 'Bandits defeated at the lumber camp: 0/5',
    `and the lumber camp's count stays at 0/5 (${JSON.stringify(after)})`,
  );
  await step(3);
}

// 4. The watchtower's camp, and coming up its road.
{
  const m = await members('watchtower');
  const kinds = m.map((e) => `${e.family} ${e.kind} level ${e.level}`).join(', ');
  check(kinds === 'bandit grunt level 2, bandit archer level 2, bandit grunt level 2', `the watchtower holds two thugs and an archer at level 2 (${kinds})`);
  check(m.every((e) => e.alive && e.mind === 'idle'), `all at their posts`);
  const tower = await page.evaluate(() => {
    const t = window.__descent.world.zoneAt(0, 0);
    return { x: 40, z: -58, y: t.heightAt(40, -58) };
  });
  // From down the tower road, 20 m off, looking up the hill.
  await standFacing(tower.x - 20, tower.z + 3, tower.x, tower.z);
  await tilt(0.1);
  await shot('03-the-watchtower-from-its-road');
  await tilt(0);
  check((await members('watchtower')).every((e) => e.mind === 'idle'), `nobody notices you 20 m down the road`);
  // Walk up the road towards the door until someone comes.
  const [door] = PLAN.tower;
  let at = null;
  for (let d = 16; d >= 4; d -= 0.5) {
    await standFacing(door.x - d, door.z + 1.5, door.x, door.z);
    await step(0.1);
    if ((await members('watchtower')).some((e) => e.mind !== 'idle')) {
      at = d;
      break;
    }
  }
  const minds = (await members('watchtower')).map((e) => e.mind).join();
  check(at !== null && minds === 'fight,fight,idle', `coming up to the door (${at} m off) brings its thug and the archer, not the one round the back (${minds})`);
  await step(1.5);
  await page.evaluate(() => (window.__descent.player.hp = window.__descent.player.maxHp));
  await tilt(0.05);
  await shot('04-the-watchtower-pulled');
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
