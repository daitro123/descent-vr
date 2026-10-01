// The guards at walking height where the zone specs place them, and House
// Corvane's bailiffs at Fellgate Hall, in headless Chromium with the IWER
// emulator. Start `npx vite --port 5173` first, then:
//
//   node .scratch/guard-models/checks/aldhaven.mjs [http://localhost:5173] [shots/]
//
// No zone places them yet (that's each zone's placement), so this adds them
// to the running Adventure as a zone would: the guards as villagers by
// `PersonPlan` at the Aldhaven, Sallows and Brackenmoor specs' spots, the
// bailiffs as a camp that leaves you be. What it checks:
//
// 1. Each guard is built as you come near, on the ground at their spot.
// 2. The four recruits at the dummies strike together.
// 3. The bailiffs stand at their posts in Corvane's crimson.
//
// And a screenshot at each place, from where you'd walk up.
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
  for (let i = 0; i < 900; i++) {
    const pending = await page.evaluate(() => window.__descent.world.chunksPending + window.__descent.world.neighboursPending);
    if (pending === 0) break;
    await step(1 / 72);
    await xrFrames(1);
  }
  await xrFrames(3);
};
const built = () =>
  page.evaluate(() =>
    window.__descent.people.built.map(({ plan, person }) => {
      const p = person.root.position;
      return { id: plan.id, y: p.y, ground: window.__descent.world.heightAt(p.x, p.z) };
    }),
  );

const S = 0; // facing south (+Z)
const N = Math.PI;
const W = -Math.PI / 2;
const E = Math.PI / 2;
const toward = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
/** The guards, at the specs' spots (Aldhaven's, the Sallows', Brackenmoor's). */
const GUARDS = [
  // Aldhaven: the Kingsgate pair facing each other, the Watch house, the keep gate, the barracks yard, the great houses, the Gorgegate, the sinkhole.
  { id: 'kingsgate-n', cast: 'watchman', x: 315, z: 341, yaw: S, work: 'sentry' },
  { id: 'kingsgate-s', cast: 'watchHalberdier', x: 315, z: 349, yaw: N, work: 'sentry' },
  { id: 'holloway', cast: 'watchCommander', x: 320, z: 340, yaw: S, label: 'Commander Holloway' },
  { id: 'quartermaster', cast: 'quartermaster', x: 326, z: 339, yaw: S, work: 'blades', turn: 1.6 },
  { id: 'keep-w', cast: 'royalGuard', x: 417, z: 293, yaw: S, work: 'attention' },
  { id: 'keep-e', cast: 'royalGuard', x: 423, z: 293, yaw: S, work: 'attention' },
  ...[466, 472, 478, 484].map((x, i) => ({ id: `recruit-${i}`, cast: 'recruit', x, z: 270.4, yaw: S, work: 'drill' })),
  // At the foot of Corvane House's steps: the spec's spots (389.5, 309.2) and (394.5, 309.2) are on them,
  // and the steps aren't in the ground's height (it's the slope under them), so a man there stands sunk in them.
  { id: 'corvane-w', cast: 'corvaneMan', x: 389.5, z: 314.5, yaw: S, work: 'sentry' },
  { id: 'corvane-e', cast: 'corvaneMan', x: 394.5, z: 314.5, yaw: S, work: 'sentry' },
  { id: 'ulf', cast: 'watchSergeant', x: 317, z: 232.5, yaw: S, label: 'Sergeant Ulf' },
  { id: 'gorgegate', cast: 'watchman', x: 324, z: 232.4, yaw: S, work: 'sentry' },
  { id: 'sinkhole-n', cast: 'watchman', x: 409.3, z: 386.2, yaw: toward(409.3, 386.2, 406, 390), work: 'peer' },
  { id: 'sinkhole-s', cast: 'watchHalberdier', x: 402, z: 393.5, yaw: toward(402, 393.5, 406, 390), work: 'sentry' },
  // A line-up of every look across the barracks yard, facing south down it.
  ...['watchman', 'watchHalberdier', 'watchSergeant', 'watchCommander', 'quartermaster', 'royalGuard', 'recruit', 'corvaneMan', 'harrowgateRetainer', 'tollMan', 'tollSergeant', 'townWatchman'].map((cast, i) => ({
    id: `lineup-${cast}`,
    cast,
    x: 468.4 + i * 1.2,
    z: 276,
    yaw: S,
  })),
  // The Sallows: the toll house's sergeant and the man at the barred gate, both facing west to the causeway.
  { id: 'brisk', cast: 'tollSergeant', x: 388.5, z: 513, yaw: W, work: 'lean', label: 'Sergeant Brisk' },
  { id: 'toll-gate', cast: 'tollMan', x: 383.5, z: 516.5, yaw: W, work: 'lean' },
  // Brackenmoor: Cairnford's watch at the east gate, looking out along the Kingsroad.
  { id: 'cairnford-watch-a', cast: 'townWatchman', x: 110, z: 357.5, yaw: E, work: 'sentry' },
  { id: 'cairnford-watch-b', cast: 'townWatchman', x: 110, z: 363.5, yaw: E, work: 'sentry' },
];
/** Fellgate Hall's bailiffs (Brackenmoor's spec), peaceful as they are until the chain turns. */
const FELLGATE = {
  id: 'review-fellgate',
  place: { x: 163, z: 338, r: 14 },
  level: 10,
  neutralUntil: { quest: 'never', stage: 'done' },
  posts: [
    { behaviour: 'grunt', family: 'corvane', x: 156.4, z: 348.4, yaw: S },
    { behaviour: 'grunt', family: 'corvane', x: 163.6, z: 348.4, yaw: S },
    { behaviour: 'archer', family: 'corvane', x: 164.0, z: 325.6, yaw: S },
    { behaviour: 'brute', family: 'corvane', x: 170.0, z: 334.0, yaw: S },
    { behaviour: 'grunt', family: 'corvane', x: 150, z: 336, yaw: E },
  ],
};

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 180000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate((plans) => {
  const d = window.__descent;
  d.paused = true;
  // Hands lowered out of view, for the screenshots.
  Object.assign(d.device.controllers.left.position, { x: -0.3, y: -1, z: 0.2 });
  Object.assign(d.device.controllers.right.position, { x: 0.3, y: -1, z: 0.2 });
});

/**
 * Place those of `ids` not yet placed, as their zone would. Only once you're
 * there and the ground round you is in: one built before their chunk is
 * stands at whatever height the zone gave before it came in.
 */
const placed = new Set();
async function place(ids) {
  const plans = GUARDS.filter((g) => ids.includes(g.id) && !placed.has(g.id));
  for (const g of plans) placed.add(g.id);
  await page.evaluate((plans) => window.__descent.people.add(plans), plans);
}

/** Walk up to (x, z) looking at (tx, tz) and check that everyone in `ids` is built on the ground there. */
async function visit(name, ids, [x, z], [tx, tz], settle = 3) {
  await standLooking(x, z, tx, tz, 0.5);
  await place(ids);
  await step(settle);
  await xrFrames(3);
  const here = await built();
  for (const id of ids) {
    const p = here.find((b) => b.id === id);
    check(p && Math.abs(p.y - p.ground) < 0.01, `${id} is built, on the ground${p ? ` (${p.y.toFixed(2)} vs ${p.ground.toFixed(2)})` : ''}`);
  }
  await shot(name);
}

// 1. Aldhaven.
await standLooking(475, 285, 475, 276, 8); // the zone's name floats away
await visit('01-lineup', GUARDS.filter((g) => g.id.startsWith('lineup')).map((g) => g.id), [475, 284], [475, 276], 9);
await standLooking(352, 345, 352, 331, 1); // and the line-up's dropped as you go
await visit('02-kingsgate', ['kingsgate-n', 'kingsgate-s', 'holloway', 'quartermaster'], [324, 347], [315, 343]);
await visit('03-watch-house', ['holloway', 'quartermaster'], [323, 345.5], [323, 339.5]);
await visit('04-keep-gate', ['keep-w', 'keep-e'], [420, 301], [420, 293]);
await visit('05-corvane-door', ['corvane-w', 'corvane-e'], [390.5, 320.5], [392, 312]);
await visit('07-gorgegate', ['ulf', 'gorgegate'], [320.5, 239.5], [320.5, 232.5]);
await visit('08-sinkhole', ['sinkhole-n', 'sinkhole-s'], [409, 399.5], [405.5, 389]);

// 2. The recruits' drill, from the barracks yard: all four strike at once.
await standLooking(475, 279, 475, 270.4, 1);
await place([0, 1, 2, 3].map((i) => `recruit-${i}`));
await step(1);
const arms = async () =>
  page.evaluate(() =>
    [0, 1, 2, 3].map((i) => {
      const r = window.__descent.people.get(`recruit-${i}`)?.rig.bones.upperArmR.rotation;
      return r ? [r.x, r.y, r.z] : null;
    }),
  );
let together = true;
let moving = false;
let first = null;
for (let k = 0; k < 12; k++) {
  const a = await arms();
  if (a.some((r) => !r)) together = false;
  else {
    for (const r of a.slice(1)) if (r.some((v, i) => Math.abs(v - a[0][i]) > 1e-4)) together = false;
    if (first && a[0].some((v, i) => Math.abs(v - first[i]) > 0.2)) moving = true;
    first ??= a[0];
  }
  await step(0.37);
}
check(together, 'the four recruits strike together');
check(moving, 'and they are at it, not standing');
// A moment mid-blow.
for (let k = 0; k < 40; k++) {
  const a = (await arms())[0];
  if (a && a[0] < -1.2) break;
  await step(0.1);
}
await xrFrames(3);
await shot('09-recruits-drill');

// 3. The Sallows' toll house, and Cairnford's east gate.
await visit('10-toll-house', ['brisk', 'toll-gate'], [379, 512.5], [386, 515], 9);
await visit('11-cairnford-watch', ['cairnford-watch-a', 'cairnford-watch-b'], [117, 361], [110, 360.5], 9);

// 4. House Corvane's bailiffs at Fellgate Hall.
await page.evaluate((plan) => {
  const d = window.__descent;
  d.camps.add([plan], d.world, true);
}, FELLGATE);
await standLooking(160, 358, 162, 340, 1);
await page.evaluate(() => window.__descent.camps.fill({ x: 160, z: 358 }));
await step(1.5);
await xrFrames(3);
const raised = await page.evaluate(() => window.__descent.camps.enemies.filter((e) => e.family === 'corvane').map((e) => ({ kind: e.kind, x: e.position.x, z: e.position.z, body: e.body })));
check(raised.length === FELLGATE.posts.length, `Fellgate's bailiffs stand at their posts: ${raised.map((e) => `${e.kind} (${e.x.toFixed(1)}, ${e.z.toFixed(1)})`).join(', ')}`);
check(raised.every((e) => e.body === 'human'), 'in the human body');
await shot('12-fellgate-gate');
await standLooking(158, 340, 166, 330, 0.5);
await shot('13-fellgate-forecourt');
const calm = await page.evaluate(() => window.__descent.camps.camps.find((c) => c.plan.id === 'review-fellgate').fighting);
check(!calm, 'and leave you be, walking among them');

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
