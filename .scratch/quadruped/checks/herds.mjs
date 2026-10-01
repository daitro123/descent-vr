// Checks for the animals a zone places (animals/herds.ts) in the Adventure,
// in headless Chromium with the IWER emulator, at walking height on
// Brackenmoor. Start `npx vite --port 5173` first, then:
//
//   node .scratch/quadruped/checks/herds.mjs [http://localhost:5173] [shots/]
//
// 1. Hob's Fold from the track: Wenna's flock grazing in the fold, her
//    sheepdog lying by her door. Walking up, the flock runs from you, out
//    through the fold's gap and away, and the dog follows it; walking off
//    down the track, they drift back home, and the dog goes back to its bed.
// 2. The landlord's white sheep in the enclosure's north field don't run:
//    standing among them, they only step aside.
// 3. Joss's cart horse in the wagon yard, Dunmore's riding horse in the
//    forecourt, the town dog by the inn's barrels: they stand (or lie) at their
//    spots, on the ground, and turn their heads to you.
// 4. A pack of three wolves stood on the moor by hand (no zone places one
//    yet): they idle, notice you, close in and lunge.
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
const shot = async (name) => {
  if (!shots) return;
  await xrFrames(2);
  await page.screenshot({ path: `${shots}/${name}.png` });
};
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
/** Look towards (tx, tz) from where you stand. */
const look = async (tx, tz) => {
  await page.evaluate(([tx, tz]) => {
    const d = window.__descent;
    const p = d.adventure.player.feetPosition(new d.camera.position.constructor());
    d.teleport(p.x, p.z, Math.atan2(-(tx - p.x), -(tz - p.z)));
  }, [tx, tz]);
  await step(1 / 72);
};
/** A herd's animals: where each is, its stance, and the ground under it. */
const herd = (id) =>
  page.evaluate((id) => {
    const d = window.__descent;
    const h = d.herds.get(id);
    if (!h) return null;
    return {
      minding: h.minding,
      scared: h.scared,
      animals: h.animals.map((a) => ({ x: a.position.x, y: a.position.y, z: a.position.z, stance: a.stance, looking: !!a.lookAt, ground: d.world.heightAt(a.position.x, a.position.z) })),
    };
  }, id);
const far = (h, x, z) => Math.max(...h.animals.map((a) => Math.hypot(a.x - x, a.z - z)));
const near = (h, x, z) => Math.min(...h.animals.map((a) => Math.hypot(a.x - x, a.z - z)));

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 180000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => {
  const d = window.__descent;
  d.paused = true;
  // A narrower view than the headset's, for the screenshots, at its height.
  d.device.fovy = (60 * Math.PI) / 180;
  // Hands lowered out of view, for the screenshots.
  Object.assign(d.device.controllers.left.position, { x: -0.3, y: -1, z: 0.2 });
  Object.assign(d.device.controllers.right.position, { x: 0.3, y: -1, z: 0.2 });
});

// 1. Hob's Fold.
const FOLD = [-36, 222];
const BED = [-27.6, 233.2];
await standLooking(-14, 230, -34, 224, 1);
// Long enough for the zone's name to float up and away.
await step(6, 1 / 30);
let fold = await herd('brackenmoor-hobs-fold');
check(fold && fold.animals.length === 6, `Wenna's flock built from the track (${fold?.animals.length})`);
check(far(fold, ...FOLD) < 5, `grazing in the fold (farthest ${far(fold, ...FOLD).toFixed(1)} m from its middle)`);
for (const a of fold.animals) check(Math.abs(a.y - a.ground) < 0.3, `a sheep on the ground (${a.y.toFixed(2)} vs ${a.ground.toFixed(2)})`);
let dog = await herd('brackenmoor-wennas-dog');
check(dog.minding === 'lie' || dog.minding === 'round' || dog.minding === 'sniff', `her dog lying by her door, or going round (${dog.minding})`);
await shot('01-hobs-fold');
await standLooking(-27.5, 223.5, -36, 222, 0.2);
await shot('02-hobs-fold-gap');
// Up to the fold's gap: they run.
for (let x = -26; x > -31; x -= 0.05) {
  await page.evaluate(([x]) => window.__descent.teleport(x, 224, Math.atan2(-(-36 - x), -(222 - 224))), [x]);
  await step(0.05 / 1.4);
}
await step(1.2);
await shot('03-hobs-fold-running');
await step(6);
fold = await herd('brackenmoor-hobs-fold');
check(fold.scared, 'the flock ran from you');
check(near(fold, -31, 224) > 6, `and keeps off (nearest ${near(fold, -31, 224).toFixed(1)} m)`);
dog = await herd('brackenmoor-wennas-dog');
check(dog.minding === 'follow', `the dog follows it (${dog.minding})`);
await look(...fold.animals.reduce((s, a) => [s[0] + a.x / 6, s[1] + a.z / 6], [0, 0]));
await shot('04-hobs-fold-scattered');
// Off down the track: they drift home.
await standLooking(-5, 214, -36, 222, 0.2);
await step(90, 1 / 30);
fold = await herd('brackenmoor-hobs-fold');
dog = await herd('brackenmoor-wennas-dog');
check(!fold.scared && far(fold, ...FOLD) < 6, `home again once you've gone (farthest ${far(fold, ...FOLD).toFixed(1)} m)`);
check(dog.minding !== 'follow', `and the dog leaves off following (${dog.minding})`);
await step(40, 1 / 30);
dog = await herd('brackenmoor-wennas-dog');
// Close by her door: the dog lifts its head.
await standLooking(-24.5, 230.5, ...BED, 0.5);
dog = await herd('brackenmoor-wennas-dog');
await shot('05-sheepdog');
check(dog.animals[0].looking || dog.minding !== 'lie', `the dog lifts its head to you (${dog.minding}, looking ${dog.animals[0].looking})`);

// 2. The enclosure's white sheep.
await standLooking(166, 283, 175, 280, 1);
let white = await herd('brackenmoor-enclosure-north');
check(white && white.animals.length === 4, `the white sheep built (${white?.animals.length})`);
await shot('06-enclosure');
const one = white.animals[0];
await standLooking(one.x + 0.7, one.z, one.x - 4, one.z, 0.2);
await step(5, 1 / 30);
white = await herd('brackenmoor-enclosure-north');
check(!white.scared && far(white, 175, 280) < 9, `they only step aside (farthest ${far(white, 175, 280).toFixed(1)} m)`);
check(near(white, one.x + 0.7, one.z) > 1.2, `out of your way (${near(white, one.x + 0.7, one.z).toFixed(1)} m)`);
await look(175, 280);
await shot('07-enclosure-among');

// 3. The horses and the town dog.
await standLooking(95.5, 361.5, 92.6, 354.8, 1);
let cart = await herd('brackenmoor-cart-horse');
check(cart && Math.hypot(cart.animals[0].x - 92.6, cart.animals[0].z - 354.8) < 0.01, 'the cart horse at its tether');
check(cart.animals[0].looking, 'turning its head to you');
await shot('08-cart-horse');
await standLooking(165.5, 333, 169.4, 329, 1);
let riding = await herd('brackenmoor-riding-horse');
check(riding && Math.abs(riding.animals[0].y - riding.animals[0].ground) < 0.3, 'the riding horse in the forecourt, on the ground');
await shot('09-riding-horse');
await standLooking(49.5, 362.5, 52.2, 359.9, 1);
const town = await herd('brackenmoor-town-dog');
check(town && town.animals[0].stance === 'lie' && town.animals[0].looking, `the town dog lies by the barrels and lifts its head (${town?.animals[0].stance})`);
await shot('10-town-dog');

// 4. A pack of wolves, stood on the moor by hand.
const PACK = [60, 215];
await page.evaluate(([x, z]) => {
  const d = window.__descent;
  const post = (dx, dz, yaw) => ({ behaviour: 'grunt', family: 'wolf', x: x + dx, z: z + dz, yaw });
  d.camps.add([{ id: 'brackenmoor-check-wolves', place: { x, z, r: 6 }, level: 3, posts: [post(0, 0, -2.4), post(2.2, 1.4, -2.0), post(-1.6, 2.4, -2.8)] }], d.world, true);
}, PACK);
await standLooking(PACK[0] - 22, PACK[1] - 14, ...PACK, 1);
await standLooking(PACK[0] - 9.5, PACK[1] - 5, ...PACK, 0.2);
let wolves = await page.evaluate(() => window.__descent.camps.enemies.filter((e) => e.family === 'wolf').length);
check(wolves === 3, `three wolves raised (${wolves})`);
await shot('11-wolves');
// Walk in: they come for you.
await standLooking(PACK[0] - 6, PACK[1] - 3, ...PACK, 0.2);
const blows = new Set();
let lunged = false;
for (let i = 0; i < 900 && !lunged; i++) {
  await step(1 / 36);
  const s = await page.evaluate(() => window.__descent.camps.enemies.filter((e) => e.family === 'wolf').map((e) => ({ state: e.state, attack: e.attack?.pose, phase: e.phase, x: e.position.x, z: e.position.z })));
  for (const e of s) if (e.state === 'attack') blows.add(e.attack);
  const w = s.find((e) => e.state === 'attack' && e.attack === 'lunge' && e.phase === 'active');
  if (w) {
    lunged = true;
    await look(w.x, w.z);
    await shot('12-wolf-lunge');
  }
  // Keep standing: heal whatever they've done.
  await page.evaluate(() => (window.__descent.player.hp = window.__descent.player.maxHp));
}
check(blows.size > 0, `the wolves came for you (${[...blows].join(', ')})`);
check(lunged, 'a wolf lunged at you');
if (errors.length) console.log(`page errors:\n${errors.join('\n')}`);
console.log(failed ? `${failed} failed` : 'all ok');
await browser.close();
process.exit(failed ? 1 : 0);
