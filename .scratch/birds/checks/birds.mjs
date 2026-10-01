// The birds in the zones (birds/), in headless Chromium with the IWER
// emulator, at walking height. Start `npx vite --port 5173` first, then:
//
//   node .scratch/birds/checks/birds.mjs [http://localhost:5173] [shots/] [scene,...]
//
// The Adventure at the plain URL, paused, stepped by `__descent.step` and
// `teleport`, hopping from Oakvale over the pass to Brackenmoor, on to
// Aldhaven and down into the Sallows (each zone's neighbours come in as you
// stand in it). Each scene stands somewhere, looks at a flock (the headset
// pitched up or down), lets it live a while, and takes a screenshot; some
// walk into the flock and check what it does.
//
import { mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const shots = process.argv[3];
const only = process.argv[4] ? process.argv[4].split(',') : null;
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
/** Pitch the headset (rad, > 0 up). */
const pitch = (a) => page.evaluate((a) => Object.assign(window.__descent.device.quaternion, { x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) }), a);
/** Stand at (x, z) looking towards (tx, tz), and let the chunks (and the zones over the seams) round you come in. */
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
const flock = (id) =>
  page.evaluate((id) => {
    const f = window.__descent.birds.get(id);
    if (!f) return null;
    return f.birds.map((b) => ({ x: b.at.x, y: b.at.y, z: b.at.z, doing: b.doing, perch: b.perch, leg: b.leg, act: b.act }));
  }, id);
const zone = () => page.evaluate(() => window.__descent.world.zone.id);
/**
 * Stand `dist` m from flock `id`'s birds' middle (on the bearing `bearing`,
 * rad from +Z, from them to you), looking at them, the headset pitched to
 * them (`aim` m over their middle); let them live `settle` s first.
 */
const frame = async (id, dist, bearing, settle = 1, aim = 0) => {
  const mid = async () => {
    const birds = (await flock(id)) ?? [];
    const seen = birds.filter((b) => b.doing !== 'hidden');
    const n = Math.max(1, seen.length);
    return seen.reduce((m, b) => ({ x: m.x + b.x / n, y: m.y + b.y / n, z: m.z + b.z / n }), { x: 0, y: 0, z: 0 });
  };
  let m = await mid();
  await standLooking(m.x + Math.sin(bearing) * dist, m.z + Math.cos(bearing) * dist, m.x, m.z, settle);
  m = await mid();
  const eye = await page.evaluate(() => {
    const d = window.__descent;
    const p = d.player.camera.getWorldPosition(d.player.camera.position.clone());
    return { x: p.x, y: p.y, z: p.z };
  });
  await pitch(Math.atan2(m.y + aim - eye.y, Math.hypot(m.x - eye.x, m.z - eye.z)));
  await xrFrames(2);
};

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 180000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => {
  const d = window.__descent;
  d.paused = true;
  // Hands lowered out of view, for the screenshots; and you can't be hurt.
  Object.assign(d.device.controllers.left.position, { x: -0.3, y: -1, z: 0.2 });
  Object.assign(d.device.controllers.right.position, { x: 0.3, y: -1, z: 0.2 });
  d.player.hp = 1e9;
});
const want = (name) => !only || only.some((o) => name.startsWith(o));

// ---------------------------------------------------------------- Brackenmoor
await standLooking(5, 200, 38, 372);
check((await zone()) === 'brackenmoor', 'over the pass, in Brackenmoor');

if (want('moor-hens')) {
  await standLooking(70, 350, 75, 352, 3);
  await frame('brackenmoor-kingsroad-hens', 3, -2.2, 1);
  await shot('moor-hens');
  const hens = await flock('brackenmoor-kingsroad-hens');
  check(hens?.length === 3 && hens.every((h) => h.doing !== 'fly'), `Cairnford's back-yard hens about their yard: ${hens?.map((h) => h.doing).join(', ')}`);
  // Walk into them: they run.
  const m = hens.reduce((a, h) => ({ x: a.x + h.x / 3, z: a.z + h.z / 3 }), { x: 0, z: 0 });
  await standLooking(m.x, m.z, m.x + 3, m.z, 0.3);
  const ran = await flock('brackenmoor-kingsroad-hens');
  check(ran.some((h) => h.doing === 'walk'), 'they scatter as you walk in');
  await standLooking(-80, 362, -84, 359, 3);
  await frame('brackenmoor-turfmoss-hens', 2.5, 0.8, 1);
  await shot('moor-hens-turfmoss');
}

if (want('moor-ravens')) {
  await standLooking(56.5, 312, 56.5, 289.6, 4);
  await standLooking(52, 300, 56.5, 289.6, 1);
  await pitch(0.42);
  await shot('moor-ravens-stone');
  const r = await flock('brackenmoor-longstones-ravens');
  check(r?.[0].perch > 17 && Math.abs(r[0].y - r[0].perch - r[0].leg) < 0.01, `a raven on the third Long Stone's top (${r?.[0].y.toFixed(2)})`);
  await standLooking(56.5, 296, 56.5, 289.6, 1.5);
  await pitch(0.6);
  await shot('moor-ravens-up');
  const up = await flock('brackenmoor-longstones-ravens');
  check(up[0].doing === 'fly' && up[1].doing === 'stand', `the near raven up as you come within 10 m, the far one (29 m off) still on its stone: ${up.map((b) => b.doing).join(', ')}`);
  await standLooking(56.5, 360, 56.5, 289.6, 25);
  const back = await flock('brackenmoor-longstones-ravens');
  check(back && back.every((b) => b.doing === 'stand' && b.perch > 17), `back on their stones once you've gone: ${back?.map((b) => b.doing).join(', ')}`);
  await pitch(0);
}

if (want('moor-grouse')) {
  await standLooking(66, 268, 66, 254, 2);
  const hidden = await flock('brackenmoor-grouse-2');
  check(hidden?.every((b) => b.doing === 'hidden'), 'a covey hidden in the heather');
  await shot('moor-grouse-hidden');
  await standLooking(66, 259.5, 66, 254, 0.45);
  await pitch(0.1);
  await shot('moor-grouse-flush');
  const flush = await flock('brackenmoor-grouse-2');
  check(flush.every((b) => b.doing === 'fly'), `whirring up as you come within 6 m: ${flush.map((b) => b.doing).join(', ')}`);
  await step(0.5);
  await xrFrames(2);
  await shot('moor-grouse-away');
  await step(10);
  const down = await flock('brackenmoor-grouse-2');
  const d = down.map((b) => Math.hypot(b.x - 66, b.z - 254));
  check(down.every((b) => b.doing === 'hidden') && d.every((x) => x > 25 && x < 65), `down out of sight ${d.map((x) => x.toFixed(0)).join(', ')} m on`);
  await pitch(0);
}

// ---------------------------------------------------------------- Aldhaven
await standLooking(230, 360, 300, 360, 1);
await standLooking(330, 355, 348, 340, 1);
check((await zone()) === 'aldhaven', `on to Aldhaven (${await zone()})`);

if (want('city-market')) {
  await standLooking(340, 352, 348, 340, 5);
  await frame('aldhaven-market-pigeons', 4, -2.6, 1);
  await shot('city-market-pigeons');
  const p = await flock('aldhaven-market-pigeons');
  check(p?.length === 10 && p.every((b) => b.doing === 'stand' || b.doing === 'walk'), `the market's pigeons feeding: ${p?.map((b) => b.doing).join(',')}`);
  const m = p.reduce((a, b) => ({ x: a.x + b.x / 10, z: a.z + b.z / 10 }), { x: 0, z: 0 });
  await standLooking(m.x - 2, m.z + 2, m.x + 4, m.z - 4, 0.5);
  await pitch(0.3);
  await shot('city-market-flush');
  const up = await flock('aldhaven-market-pigeons');
  check(up.every((b) => b.doing === 'fly'), `all up as you walk through: ${up.map((b) => b.doing).join(',')}`);
  await standLooking(343, 354, 350, 341, 14);
  await pitch(0.15);
  await shot('city-market-perched');
  const perched = await flock('aldhaven-market-pigeons');
  check(perched.every((b) => b.doing === 'stand' && b.perch > 3), `settled on the cross and the awnings: ${perched.map((b) => b.perch.toFixed(1)).join(',')}`);
  await standLooking(355, 352, 350, 345, 0.5);
  await pitch(0.35);
  await shot('city-market-cross');
  await pitch(0);
}

if (want('city-forecourt')) {
  await standLooking(424, 352, 432, 338, 6);
  await frame('aldhaven-forecourt-pigeons', 4, -1.2, 1);
  await shot('city-forecourt-pigeons');
  const p = await flock('aldhaven-forecourt-pigeons');
  const m = p.reduce((a, b) => ({ x: a.x + b.x / p.length, z: a.z + b.z / p.length }), { x: 0, z: 0 });
  await standLooking(m.x, m.z, m.x, m.z - 4, 12);
  await standLooking(m.x - 3, m.z + 8, 430, 336, 0.5);
  await pitch(0.3);
  await shot('city-forecourt-perched');
  const perched = await flock('aldhaven-forecourt-pigeons');
  check(perched.every((b) => b.doing === 'stand' && b.perch > 8), `the forecourt's pigeons up on the statue and the walls: ${perched.map((b) => b.perch.toFixed(1)).join(',')}`);
  await pitch(0);
}

if (want('city-pond')) {
  await standLooking(330, 292, 338, 284, 6);
  await frame('aldhaven-pond-waterfowl', 7, -0.9, 1);
  await shot('city-pond');
  const f = await flock('aldhaven-pond-waterfowl');
  check(f?.every((b) => b.doing === 'swim'), `swans and mallards on the pond: ${f?.map((b) => b.doing).join(',')}`);
  await pitch(0);
}

if (want('city-hens')) {
  await standLooking(288, 460, 294, 454, 5);
  await frame('aldhaven-barnyard-hens', 3, -0.8, 1);
  await shot('city-barnyard-hens');
  await pitch(0);
}

if (want('city-harbour')) {
  await standLooking(492, 382, 500, 389.2, 4);
  await standLooking(493, 384.5, 505, 389.2, 1);
  await pitch(-0.12);
  await shot('city-longquay-gulls');
  const g = await flock('aldhaven-longquay-gulls');
  check(g?.every((b) => b.doing === 'stand' && Math.abs(b.perch - 3.15) < 0.01), 'gulls on the Long Quay’s bollards');
  await standLooking(500, 386, 510, 420, 3);
  await pitch(0.4);
  await shot('city-basin-gulls');
  const c = await flock('aldhaven-basin-gulls');
  check(c?.every((b) => b.doing === 'fly' && b.y > 8), `gulls circling over the basin: ${c?.map((b) => b.y.toFixed(0)).join(',')}`);
  await standLooking(553, 395, 570, 405, 4);
  await pitch(0.15);
  await shot('city-mole-gulls');
  await pitch(0.55);
  await shot('city-light-gulls');
  await pitch(0);
}

// ---------------------------------------------------------------- the Sallows
await standLooking(352, 600, 356, 606, 1);
check((await zone()) === 'sallows', `down into the Sallows (${await zone()})`);

if (want('fen-geese')) {
  await standLooking(348, 600, 356, 606, 5);
  await frame('sallows-landing-geese', 5, -2.2, 1);
  await shot('fen-geese');
  const g0 = await flock('sallows-landing-geese');
  const m = g0.reduce((a, b) => ({ x: a.x + b.x / 5, z: a.z + b.z / 5 }), { x: 0, z: 0 });
  await standLooking(m.x - 3, m.z - 2, m.x, m.z, 1.5);
  await pitch(-0.35);
  await shot('fen-geese-hiss');
  const g = await flock('sallows-landing-geese');
  check(g?.some((b) => b.act === 'hiss'), `one goose hisses at you: ${g?.map((b) => b.act).join(',')}`);
  await pitch(0);
}

if (want('fen-heron')) {
  await standLooking(403, 682, 403, 664, 4);
  await frame('sallows-heron-south-lode', 14, 0, 1);
  await shot('fen-heron');
  const h = await flock('sallows-heron-south-lode');
  check(h?.[0].doing === 'stand', `a heron in the lode south of Reedholm (${h?.[0].doing})`);
  await standLooking(h[0].x, h[0].z + 11, h[0].x, h[0].z, 1.2);
  await pitch(0.25);
  await shot('fen-heron-up');
  await pitch(0);
}

if (want('fen-ducks')) {
  await standLooking(352, 652, 360, 645.5, 5);
  await frame('sallows-pool-mallards', 5, -0.9, 1);
  await shot('fen-mallards');
  await pitch(0);
}

if (want('fen-gibbet')) {
  await standLooking(334, 652, 323, 641, 4);
  await pitch(0.2);
  await shot('fen-gibbet-crows');
  await pitch(0);
}

if (want('fen-hythe')) {
  await standLooking(704, 652, 694, 632, 4);
  await pitch(-0.02);
  await shot('fen-hythe-gulls');
  await pitch(0);
}

const cost = await page.evaluate(() => window.__descent.birds.cost);
console.log(`birds built now: ${cost.calls} flocks, ${cost.triangles} triangles`);
check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
