// Checks for every zone's own people (people/population.ts) in headless
// Chromium with the IWER emulator. Start `npx vite --port 5173` first, then:
//
//   node .scratch/zone-population/checks/people.mjs [http://localhost:5173] [shots/]
//
// The Adventure at the plain URL, paused, stepped by `__descent.step` (and
// `teleport`). What it checks:
//
// 1. Oakvale is as it was: its four villagers, Hale and its camps stand from
//    the start, all drawn, and nobody placed by data is built there.
//    (From Cairnford, 300 m off, Oakvale's own aren't drawn.)
// 2. Walking into Cairnford, Brackenmoor's villagers are built as you come
//    within 100 m, and stand on the ground at their spots.
// 3. The goodwife strolls the square's east side; she stops and turns to you
//    as you come close, and barks her first line, then her next on the next visit.
// 4. Two fallen bodies, placed as a zone would (`fallen: true`), lie face
//    down on the green, still, and aren't solid.
// 5. Walking well away (back over the pass), they're dropped.
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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
const step = (s, dt = 1 / 72) => page.evaluate(([s, dt]) => window.__descent.step(s, dt), [s, dt]);
const shot = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });
/** Stand at (x, z) looking towards (tx, tz), and let the chunks round you come in. */
const standLooking = async (x, z, tx, tz, settle = 0.5) => {
  await page.evaluate(([x, z, yaw]) => window.__descent.teleport(x, z, yaw), [x, z, Math.atan2(-(tx - x), -(tz - z))]);
  await step(settle);
  for (let i = 0; i < 600; i++) {
    const pending = await page.evaluate(() => window.__descent.world.chunksPending + window.__descent.world.neighboursPending);
    if (pending === 0) break;
    await step(1 / 72);
    await xrFrames(1);
  }
  await xrFrames(3);
};
/** How many of Oakvale's own out of doors (Hale, its villagers, its camps) are drawn, of how many. */
const oakvalers = () =>
  page.evaluate(() => {
    const a = window.__descent.adventure;
    const roots = [a.hale.root, ...a.villagers.all.filter((v) => !v.spot.interior).map((v) => v.root), ...a.camps.camps.filter((c) => !c.lazy && !c.plan.interior).map((c) => c.root)];
    return { drawn: roots.filter((r) => r.visible).length, of: roots.length };
  });
const people = () =>
  page.evaluate(() =>
    window.__descent.people.built.map(({ plan, person }) => {
      const p = person.root.position;
      return { id: plan.id, x: p.x, y: p.y, z: p.z, bark: person.bark?.mesh.visible, attend: person.attend, ground: window.__descent.world.heightAt(p.x, p.z) };
    }),
  );

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 180000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => {
  const d = window.__descent;
  d.paused = true;
  // Hands lowered out of view, for the screenshots.
  Object.assign(d.device.controllers.left.position, { x: -0.3, y: -1, z: 0.2 });
  Object.assign(d.device.controllers.right.position, { x: 0.3, y: -1, z: 0.2 });
});

// 1. Oakvale as it was.
await standLooking(0, 8, 0, 0);
const oak = await page.evaluate(() => {
  const d = window.__descent;
  return {
    villagers: d.adventure.villagers.all.map((v) => v.id),
    camps: d.camps.camps.filter((c) => !c.lazy).map((c) => c.plan.id),
    enemies: d.camps.enemies.length,
    built: d.people.built.length,
    zone: d.world.zone.id,
  };
});
check(oak.zone === 'forest', `in Oakvale (${oak.zone})`);
check(oak.villagers.join() === 'innkeeper,smith,farmer,herbalist', `Oakvale's villagers: ${oak.villagers.join(', ')}`);
check([...oak.camps].sort().join() === 'farm,lumberCamp,mine,patrol,watchtower', `Oakvale's camps stand from the start: ${oak.camps.join(', ')}`);
check(oak.built === 0, `nobody placed by data built in Oakvale (${oak.built})`);
const home = await oakvalers();
check(home.drawn === home.of, `Oakvale's own all drawn in Oakvale (${home.drawn} of ${home.of})`);

// 2. Over the pass and down into Cairnford's square: its people are built as you come near.
await standLooking(5, 200, 38, 372);
let built = await people();
check(built.length === 0, `on the moor 170 m off, nobody built yet (${built.length})`);
await standLooking(38, 300, 38, 372, 1);
built = await people();
check(built.length === 2, `80 m from the square, both built: ${built.map((p) => p.id).join(', ')}`);
for (const p of built) check(Math.abs(p.y - p.ground) < 0.01, `${p.id} stands on the ground (${p.y.toFixed(2)} vs ${p.ground.toFixed(2)})`);
check((await page.evaluate(() => window.__descent.world.zone.id)) === 'brackenmoor', 'in Brackenmoor');
const away = await oakvalers();
check(away.drawn === 0, `Oakvale's own not drawn from Cairnford, 300 m off (${away.drawn} of ${away.of})`);

// The square from its south side, both in view, once the zone's name has floated away.
await standLooking(36, 382, 38, 366, 8);
await shot('01-square');
// The shepherd by the well, from a few steps off: he turns to you and says his piece.
await standLooking(37.7, 368.3, 35.4, 365.6, 1);
await shot('02-shepherd');

// 3. The goodwife walks; as you come close she stops, turns to you and barks.
const wife = async () => (await people()).find((p) => p.id === 'cairnford-goodwife');
await standLooking(20, 395, 41, 370, 0.2);
const a = await wife();
await step(3);
const b = await wife();
check(Math.hypot(b.x - a.x, b.z - a.z) > 1.5, `the goodwife strolls (${Math.hypot(b.x - a.x, b.z - a.z).toFixed(1)} m in 3 s)`);
await shot('03-goodwife-walking');
const w = await wife();
await standLooking(w.x - 2.5, w.z + 1.5, w.x, w.z, 0.1);
await step(2);
const c = await wife();
await step(1);
const d = await wife();
check(c.attend > 0.9 && Math.hypot(d.x - c.x, d.z - c.z) < 0.05, `she stops for you (attend ${c.attend.toFixed(2)}, ${Math.hypot(d.x - c.x, d.z - c.z).toFixed(2)} m in 1 s)`);
check(d.bark, 'and barks');
const line = await page.evaluate(() => window.__descent.people.get('cairnford-goodwife').bark.mesh.visible);
await page.evaluate(([x, z]) => window.__descent.teleport(x, z, 0), [d.x - 2.5, d.z + 1.5]);
await standLooking(d.x - 2, d.z + 1.2, d.x, d.z, 0.5);
await shot('04-goodwife-bark');
check(line, 'her bark shows over her head');

// 4. The fallen: two lying on the square's west side, as the diggers by the open barrow will.
await page.evaluate(() =>
  window.__descent.people.add([
    { id: 'check-fallen-1', cast: 'goodwife', x: 27.5, z: 373.5, yaw: 2.2, fallen: true },
    { id: 'check-fallen-2', cast: 'smith', x: 24.8, z: 371.2, yaw: -0.4, fallen: true },
  ]),
);
await standLooking(28.5, 378.5, 26, 372, 1);
const fallen = await page.evaluate(() =>
  window.__descent.people.built
    .filter(({ plan }) => plan.fallen)
    .map(({ plan, person }) => {
      const d = window.__descent;
      const box = new person.rig.mesh.geometry.boundingBox.constructor().setFromObject(person.rig.mesh, true);
      return { id: plan.id, low: box.min.y - d.world.heightAt(plan.x, plan.z), high: box.max.y - d.world.heightAt(plan.x, plan.z), still: !person.root.matrixAutoUpdate };
    }),
);
check(fallen.length === 2, `both fallen built: ${fallen.map((f) => f.id).join(', ')}`);
for (const f of fallen) check(f.low > -0.3 && f.high < 0.8 && f.still, `${f.id} lies still on the ground (${f.low.toFixed(2)} to ${f.high.toFixed(2)} m over it)`);
await shot('05-fallen');

// 5. Back over the pass: dropped.
await standLooking(0, 60, 0, 0, 1);
built = await people();
check(built.length === 0, `back in Oakvale, nobody of Cairnford's built (${built.length})`);

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
