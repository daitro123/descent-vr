// The robed and named figures where the zone specs stand them, at walking
// height, in headless Chromium with the IWER emulator. Start
// `npx vite --port 5173` first, then:
//
//   node .scratch/robed-figures/checks/zone.mjs [http://localhost:5173] [shots/] [spot ...]
//
// None of them is placed by a zone yet (the zones' placement threads do
// that), so this adds each at their spot from /mnt/project-files/zones/
// <zone>-inhabitants.md, facing as the spec says and at their own work, then
// stands you a few metres off at eye height and checks that each is built,
// stands with their soles on the ground, and plays their work.
import { mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const shots = process.argv[3];
const only = process.argv.slice(4);
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
/** Each of ours that is built: where their root is, the ground under it, their lowest sole, and their pose's right forearm (to see the work move). */
const ours = () =>
  page.evaluate(() => {
    const d = window.__descent;
    return d.people.built
      .filter(({ plan }) => plan.id.startsWith('check-'))
      .map(({ plan, person }) => {
        const p = person.root.position;
        let sole = Infinity;
        let arm = 0;
        person.root.traverse((o) => {
          if (!o.isSkinnedMesh) return;
          o.updateMatrixWorld(true);
          const skin = o.geometry.getAttribute('skinIndex');
          const feet = ['footL', 'footR'].map((n) => o.skeleton.bones.findIndex((b) => b.name === n));
          const v = new p.constructor();
          for (let i = 0; i < skin.count; i++) {
            if (!feet.includes(skin.getX(i))) continue;
            o.getVertexPosition(i, v);
            o.localToWorld(v);
            sole = Math.min(sole, v.y);
          }
          const bones = o.skeleton.bones;
          for (const n of ['forearmR', 'forearmL', 'upperArmR', 'handR', 'handL', 'spine', 'head']) {
            const b = bones.find((b) => b.name === n);
            if (b) arm += b.rotation.x * 7 + b.rotation.y * 3 + b.rotation.z;
          }
        });
        return { id: plan.id, x: p.x, y: p.y, z: p.z, ground: d.world.heightAt(p.x, p.z), sole, arm };
      });
  });

// yaw: their front faces (sin yaw, cos yaw); 0 faces south (+Z).
const S = 0;
const N = Math.PI;
const E = Math.PI / 2;
const W = -Math.PI / 2;
const SW = -Math.PI / 4;
/** Each spot: who stands there (from the zone's inhabitants spec), and where you stand to look. */
const SPOTS = [
  {
    name: 'aldhaven-council-porch',
    people: [
      { cast: 'lordCorvane', x: 399.5, z: 274, yaw: E, work: 'converse' },
      { cast: 'corvaneSecretary', x: 399.5, z: 271.8, yaw: E, work: 'ledger' },
    ],
    eye: [402.6, 274.6],
    at: [399.5, 272.9],
  },
  // Her spec spot (461.5, 307.2), Rook's (475, 264.5) and the cathedral's
  // (430, 350) and (429.5, 346.5) are on their doors' built steps, which the
  // ground's height doesn't know: there they stand sunk in them. So they
  // stand at the steps' foot here.
  { name: 'aldhaven-harrowgate-steps', people: [{ cast: 'ladyHarrowgate', x: 461.5, z: 310.8, yaw: S }], eye: [462.4, 313.7], at: [461.5, 310.8] },
  {
    name: 'aldhaven-crown-terrace',
    people: [
      { cast: 'courtier', x: 420, z: 314, yaw: E + 0.5, work: 'converse' },
      { cast: 'courtierLady', x: 421.4, z: 314.6, yaw: W - 0.3, work: 'converse' },
    ],
    eye: [421, 317.2],
    at: [420.7, 314.3],
  },
  { name: 'aldhaven-barracks-yard', people: [{ cast: 'sergeantRook', x: 475, z: 267.2, yaw: S, work: 'form' }], eye: [475.8, 270.1], at: [475, 267.2] },
  { name: 'aldhaven-kings-garden-range', people: [{ cast: 'lodgemasterAshgrove', x: 332, z: 269, yaw: E, work: 'loose' }], eye: [334.8, 268], at: [332, 269] },
  {
    name: 'aldhaven-cathedral-west-door',
    // The west steps reach to within a metre of the close's wall (x 428), so
    // the pair stand just north of them, seen from the close's west gate.
    people: [
      { cast: 'motherYsolde', x: 430, z: 343.8, yaw: W, work: 'pray' },
      { cast: 'dawnPriest', x: 430.3, z: 341.6, yaw: W + 0.3, work: 'read' },
    ],
    eye: [426.6, 344.6],
    at: [430.1, 342.7],
  },
  { name: 'aldhaven-almonry', people: [{ cast: 'sisterAgna', x: 438, z: 370.5, yaw: N, work: 'alms' }], eye: [438.4, 367.7], at: [438, 370.5] },
  {
    name: 'aldhaven-collegium-door',
    people: [
      { cast: 'magisterVey', x: 427.5, z: 383.6, yaw: N, work: 'ledger' },
      { cast: 'magisterQuill', x: 432.5, z: 383.6, yaw: N, work: 'read' },
    ],
    eye: [430, 380.2],
    at: [430, 383.6],
  },
  {
    name: 'aldhaven-old-well',
    people: [
      { cast: 'student', x: 442, z: 386.6, yaw: E, work: 'read' },
      { cast: 'studentWoman', x: 444.4, z: 387.4, yaw: W, work: 'converse' },
    ],
    eye: [443.4, 384.3],
    at: [443.2, 387],
  },
  { name: 'aldhaven-turning-page', people: [{ cast: 'mistressWren', x: 417.5, z: 385.5, yaw: E, work: 'read' }], eye: [420.3, 385.9], at: [417.5, 385.5] },
  {
    name: 'aldhaven-counting-house',
    people: [
      { cast: 'ferrow', x: 336.5, z: 364, yaw: N, work: 'coins' },
      { cast: 'ferrowDaughter', x: 339.5, z: 364, yaw: N, work: 'ledger' },
    ],
    eye: [338, 361],
    at: [338, 364],
  },
  { name: 'aldhaven-long-quay', people: [{ cast: 'masterAshby', x: 492, z: 373, yaw: S, work: 'point' }], eye: [492.4, 375.8], at: [492, 373] },
  { name: 'cairnford-chapel-door', people: [{ cast: 'brotherCuthwin', x: 10, z: 342.6, yaw: E, work: 'read' }], eye: [12.8, 343], at: [10, 342.6] },
  { name: 'fellgate-porch', people: [{ cast: 'sirDunmore', x: 160, z: 325.6, yaw: S }], eye: [160.4, 328.4], at: [160, 325.6] },
  { name: 'fellgate-forecourt', people: [{ cast: 'stewardPell', x: 165, z: 336, yaw: S, work: 'ledger' }], eye: [165.4, 338.8], at: [165, 336] },
  { name: 'reedholm-hask-office', people: [{ cast: 'joryHask', x: 402.8, z: 616.8, yaw: W, work: 'ledger' }], eye: [400, 617.2], at: [402.8, 616.8] },
  // The trainers stand at the moot hall island's corners, facing west over the
  // plank square; you look from the island's rim, clear of the hall.
  { name: 'reedholm-moot-island', people: [{ cast: 'warriorTrainer', x: 417.5, z: 604.5, yaw: W + 0.3, work: 'form' }], eye: [415.3, 607.4], at: [417.5, 604.5] },
  { name: 'reedholm-moot-island-east', people: [{ cast: 'mageTrainer', x: 424, z: 604.3, yaw: W - 0.3, work: 'read' }], eye: [426.3, 607.1], at: [424, 604.3] },
  { name: 'reedholm-moot-island-south', people: [{ cast: 'rangerTrainer', x: 417.5, z: 617.5, yaw: W, work: 'fletch' }], eye: [415.3, 614.8], at: [417.5, 617.5] },
  { name: 'saint-odo-churchyard-gate', people: [{ cast: 'brotherAnsgar', x: 308, z: 824, yaw: SW, work: 'salt' }], eye: [306, 826], at: [308, 824] },
];

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 180000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => {
  const d = window.__descent;
  d.paused = true;
  d.step(1);
  Object.assign(d.device.controllers.left.position, { x: -0.3, y: -1, z: 0.2 });
  Object.assign(d.device.controllers.right.position, { x: 0.3, y: -1, z: 0.2 });
});

const todo = SPOTS.filter((s) => !only.length || only.includes(s.name));
// The first move after you come in can be undone by the game settling you at
// its spawn; go there once to warm up.
await standLooking(todo[0].eye[0], todo[0].eye[1], todo[0].at[0], todo[0].at[1], 3);
for (const spot of todo) {
  await page.evaluate((spot) => {
    window.__descent.people.add(spot.people.map((p) => ({ ...p, id: `check-${spot.name}-${p.cast}` })));
  }, spot);
  await standLooking(spot.eye[0], spot.eye[1], spot.at[0], spot.at[1], 3);
  for (let i = 0; i < 20 && (await ours()).filter((p) => p.id.startsWith(`check-${spot.name}-`)).length < spot.people.length; i++) await step(0.5);
  const eye = await page.evaluate(() => {
    const d = window.__descent;
    const v = d.renderer.xr.getCamera().position;
    return [v.x, v.y, v.z, d.world.heightAt(v.x, v.z)].map((n) => +n.toFixed(2));
  });
  console.log(`     ${spot.name}: eye at ${eye.slice(0, 3).join(', ')} over ground ${eye[3]}`);
  const here = (await ours()).filter((p) => p.id.startsWith(`check-${spot.name}-`));
  check(here.length === spot.people.length, `${spot.name}: all ${spot.people.length} built (${here.length})`);
  for (const p of here) check(Math.abs(p.sole - p.ground) < 0.03, `${p.id} stands with their soles on the ground (${(p.sole - p.ground).toFixed(3)} m; feet at ${p.y.toFixed(2)})`);
  await shot(`${spot.name}-1`);
  await step(1.3);
  await xrFrames(2);
  const later = (await ours()).filter((p) => p.id.startsWith(`check-${spot.name}-`));
  for (const p of later) {
    const was = here.find((h) => h.id === p.id);
    const worked = spot.people.find((q) => p.id.endsWith(q.cast))?.work;
    if (worked) check(was && Math.abs(p.arm - was.arm) > 0.02, `${p.id} is at their work (${worked})`);
  }
  await shot(`${spot.name}-2`);
}

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
