// The Sallows' enemies where they'll stand, at walking height, in headless
// Chromium with the IWER emulator. Start `npx vite --port 5173` first, then:
//
//   node .scratch/sallows-enemies/checks/zone.mjs [http://localhost:5173] [shots/]
//
// No zone places them yet (the Sallows' and Aldhaven's placement threads do),
// so this adds their camps for the check, at the posts the inhabitant specs
// give, left neutral so they stand at their posts rather than fight:
// the Sluice House (the Lantern Men round Captain Crake on the lock), the
// Eelworks, Smugglers' Hythe (the bosun in his woad sash), Cockle End (the
// fen raiders round Abel Thatch) and Kiln Edge; and in Aldhaven, the
// Undergate's thieves by the Drowned Lamp. Gil Tarr stands by Hask's office
// in Reedholm and Cass by the lamp, at ease. Each must be built, standing on
// the ground, under 900 triangles.
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

/** Neutral until a quest moment a new game hasn't reached: they stand and watch. */
const NEUTRAL = { quest: 'letters', stage: 'active' };
const post = (behaviour, family, x, z, yaw, extra = {}) => ({ behaviour, family, x, z, yaw, ...extra });
const camp = (id, level, posts) => {
  const x = posts.reduce((s, p) => s + p.x, 0) / posts.length;
  const z = posts.reduce((s, p) => s + p.z, 0) / posts.length;
  return { id, place: { x, z, r: 12 }, level, posts, neutralUntil: NEUTRAL };
};
const W = 0; // each post is turned to face you as you come (visit)
const CAMPS = [
  camp('check-sluice-house', 15, [
    post('grunt', 'smuggler', 447.5, 690, W),
    post('grunt', 'smuggler', 444, 700, W),
    post('grunt', 'smuggler', 448, 705, W),
    post('archer', 'smuggler', 452, 714, W),
    post('brute', 'smuggler', 448.5, 698, W, { role: 'leader', named: 'leader', level: 16 }),
    post('archer', 'smuggler', 460.5, 701, W),
    post('brute', 'smuggler', 476, 697.5, W),
    post('brute', 'smuggler', 469.7, 699, W, { named: 'crake', level: 16 }),
  ]),
  camp('check-eelworks', 13, [
    post('grunt', 'smuggler', 404, 697, 0),
    post('grunt', 'smuggler', 397, 696, 0),
    post('grunt', 'smuggler', 402, 708, 0),
    post('archer', 'smuggler', 395, 705, 0),
    post('brute', 'smuggler', 408, 702, 0),
  ]),
  camp('check-hythe', 15, [
    post('grunt', 'smuggler', 680, 625, 0),
    post('grunt', 'smuggler', 684, 630, 0),
    post('grunt', 'smuggler', 676, 620, 0),
    post('archer', 'smuggler', 692, 614, 0),
    post('archer', 'smuggler', 695, 628, 0),
    post('brute', 'smuggler', 686, 618, 0),
    post('brute', 'smuggler', 688, 626, 0, { role: 'leader', named: 'leader', level: 16 }),
  ]),
  camp('check-cockle-end', 11, [
    post('grunt', 'raider', 300, 712, 0),
    post('grunt', 'raider', 310, 707, 0),
    post('grunt', 'raider', 305, 718, 0),
    post('archer', 'raider', 309.5, 713, 0),
    post('brute', 'raider', 322, 721.5, 0),
    post('brute', 'raider', 296, 716, 0, { role: 'leader', named: 'headman', level: 12 }),
  ]),
  camp('check-kiln-edge', 15, [
    post('grunt', 'raider', 325, 862, 0),
    post('grunt', 'raider', 318, 868.5, 0),
    post('archer', 'raider', 325.5, 856, 0),
    post('brute', 'raider', 331.5, 871, 0),
  ]),
  // In the street before the Drowned Lamp (the cellars they'll keep are an interior, not built yet).
  camp('check-undergate', 14, [
    post('grunt', 'undergate', 455, 383.2, 0),
    post('grunt', 'undergate', 457.5, 383.8, 0),
    post('grunt', 'undergate', 452.5, 383.6, 0),
    post('archer', 'undergate', 450, 384, 0),
    post('archer', 'undergate', 460, 383.4, 0),
  ]),
];

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 180000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => {
  const d = window.__descent;
  d.paused = true;
  Object.assign(d.device.controllers.left.position, { x: -0.3, y: -1, z: 0.2 });
  Object.assign(d.device.controllers.right.position, { x: 0.3, y: -1, z: 0.2 });
});

// Camps raise their members only once they're near you, so each is added as you come to it.
const members = (id) =>
  page.evaluate((id) => {
    const d = window.__descent;
    const c = d.camps.camps.find((c) => c.plan.id === id);
    return (c?.members ?? []).map((m) => {
      const e = m.enemy;
      const p = e.position;
      return { family: e.family, kind: e.kind, named: m.plan.named ?? null, x: p.x, y: p.y, z: p.z, ground: d.world.heightAt(p.x, p.z), triangles: e.rig.triangles, shown: e.root.visible, mind: m.mind, state: e.state, off: Math.hypot(p.x - m.plan.x, p.z - m.plan.z) };
    });
  }, id);
const visit = async (camp, from, at, name, more = []) => {
  // Everyone turned to the spot you first see them from (an enemy at yaw 0 faces +Z).
  const plan = { ...camp, posts: camp.posts.map((p) => ({ ...p, yaw: Math.atan2(from[0] - p.x, from[1] - p.z) })) };
  await standLooking(from[0], from[1], at[0], at[1], 0.2);
  await page.evaluate((plan) => window.__descent.camps.add([plan], window.__descent.world, true), plan);
  await standLooking(from[0], from[1], at[0], at[1], 2);
  const ms = await members(plan.id);
  check(ms.length === plan.posts.length, `${plan.id}: all ${plan.posts.length} raised (${ms.length})`);
  for (const m of ms) {
    const who = `${plan.id}: ${m.family} ${m.named ?? m.kind}`;
    check(m.triangles < 900, `${who} is ${m.triangles} triangles`);
    check(Math.abs(m.y - m.ground) < 0.05, `${who} stands on the ground (${(m.y - m.ground).toFixed(2)} m)`);
    check(m.mind === 'idle' && m.off < 0.5, `${who} keeps its post (${m.mind}, ${m.state}, ${m.off.toFixed(2)} m off it)`);
  }
  await shot(name);
  for (const [i, [fx, fz, tx, tz]] of more.entries()) {
    await standLooking(fx, fz, tx, tz, 0.3);
    await shot(`${name}-${i + 1}`);
  }
};

// The Sluice House: from the Dyke Path's north gap, looking south-east at the tower, then up the lock to Crake.
await visit(CAMPS[0], [440, 688], [452, 700], '01-sluice-house', [
  [443.5, 694.5, 448.5, 698],
  [462.5, 700.5, 469.7, 699],
  [466.6, 699.6, 469.7, 699],
]);
// The Eelworks, round the ruined smokehouse.
await visit(CAMPS[1], [396, 689], [402, 702], '02-eelworks', [[401, 699.5, 404, 697]]);
// Smugglers' Hythe on the shell bank, the bosun among them.
await visit(CAMPS[2], [679, 636], [686, 623], '03-hythe', [[684.5, 629.5, 688, 626]]);
// Cockle End's sunk cottages, the raiders round their headman.
await visit(CAMPS[3], [301, 702], [304, 714], '04-cockle-end', [
  [298, 711.5, 296, 716],
  [305, 712, 310, 707],
]);
// Kiln Edge.
await visit(CAMPS[4], [319, 857], [325, 864], '05-kiln-edge');
// Aldhaven: the Undergate's thieves by the Drowned Lamp, and Cass among them at ease.
await page.evaluate(() =>
  window.__descent.people.add([
    { id: 'check-cass', cast: 'undergateAtEase', x: 464, z: 384.2, yaw: Math.PI },
    { id: 'check-gil', cast: 'lanternManAtEase', x: 401.5, z: 614.5, yaw: -2.4 },
  ]),
);
await visit(CAMPS[5], [455, 378.5], [455, 384], '06-undergate', [
  [461.5, 382, 464, 384.2],
  [455.5, 380.6, 456, 383.5],
]);
// Reedholm: Gil Tarr by Hask's office, his lantern dark.
await standLooking(398.5, 611, 401.5, 614.5, 1);
await shot('07-gil-tarr');

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
