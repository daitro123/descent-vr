// The new builds in a zone, at walking height: Cairnford's square in
// Brackenmoor (x 24–52, z 361–383), in headless Chromium with the IWER
// emulator. Start `npx vite --port 5173` first, then:
//
//   node .scratch/human-builds/checks/zone.mjs [http://localhost:5173] [shots/]
//
// Adds a plain villager of every new look to the square for the check (none
// are placed by a zone yet: the zones' own placement threads do that), then:
// 1. they stand in a row on the square, each on the ground;
// 2. they stroll across it, each at their own build's pace, feet on the
//    ground as they go, and stop for you as you come near.
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
  for (let i = 0; i < 600; i++) {
    const pending = await page.evaluate(() => window.__descent.world.chunksPending + window.__descent.world.neighboursPending);
    if (pending === 0) break;
    await step(1 / 72);
    await xrFrames(1);
  }
  await xrFrames(3);
};
/** Each built villager of ours: where their root is, the ground under it, and their lowest sole. */
const ours = () =>
  page.evaluate(() => {
    const d = window.__descent;
    return d.people.built
      .filter(({ plan }) => plan.id.startsWith('check-'))
      .map(({ plan, person }) => {
        const p = person.root.position;
        // The lowest vertex on the feet, in the world.
        let sole = Infinity;
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
        });
        return { id: plan.id, x: p.x, y: p.y, z: p.z, ground: d.world.heightAt(p.x, p.z), sole, attend: person.attend };
      });
  });

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

const LOOKS = ['goodwife', 'maid', 'greybeard', 'granny', 'boy', 'girl', 'friar', 'sister'];

// 1. A row of them on the square, facing south, seen from 5 m off.
await page.evaluate((looks) => {
  window.__descent.people.add(looks.map((cast, i) => ({ id: `check-stand-${cast}`, cast, x: 33.5 + i * 1.3, z: 374, yaw: 0 })));
}, LOOKS);
await standLooking(38, 380, 38, 374, 8);
let row = await ours();
check(row.length === LOOKS.length, `all ${LOOKS.length} built on the square (${row.length})`);
for (const p of row) check(Math.abs(p.sole - p.ground) < 0.02, `${p.id} stands with their soles on the ground (${(p.sole - p.ground).toFixed(3)} m)`);
await shot('01-row');
await standLooking(35.5, 377.5, 35.5, 374, 0.5);
await shot('02-row-left');
await standLooking(40.5, 377.5, 40.5, 374, 0.5);
await shot('03-row-right');

// 2. The row gone, the same eight strolling east and west across the square.
await standLooking(0, 60, 0, 0, 1); // back over the pass: everyone in Cairnford dropped
await page.evaluate((looks) => {
  const d = window.__descent;
  // Pull the standing row (dropped now) out, so only the strollers come back.
  const slots = d.people.slots;
  for (let i = slots.length - 1; i >= 0; i--) if (slots[i].plan.id.startsWith('check-stand-')) slots.splice(i, 1);
  // Rows south of the market cross, half going east and half west.
  d.people.add(
    looks.map((cast, i) => {
      const z = 373.4 + i * 0.5;
      const [from, to] = i % 2 ? [45, 30] : [30, 45];
      return { id: `check-walk-${cast}`, cast, x: from + (to - from) * 0.1 * (i % 4), z, yaw: i % 2 ? -Math.PI / 2 : Math.PI / 2, route: [{ x: to, z }] };
    }),
  );
}, LOOKS);
await standLooking(38, 382.5, 38, 370, 1);
let before = (await ours()).filter((p) => p.id.startsWith('check-walk-'));
await step(4);
let after = (await ours()).filter((p) => p.id.startsWith('check-walk-'));
for (const a of after) {
  const b = before.find((p) => p.id === a.id);
  check(b && Math.hypot(a.x - b.x, a.z - b.z) > 1.5, `${a.id} strolls (${b ? Math.hypot(a.x - b.x, a.z - b.z).toFixed(1) : '?'} m in 4 s)`);
}
await shot('04-strolling');
for (let k = 0; k < 6; k++) {
  await step(0.31);
  await xrFrames(2);
  for (const p of (await ours()).filter((p) => p.id.startsWith('check-walk-'))) {
    if (Math.abs(p.sole - p.ground) > 0.03) check(false, `${p.id} walking with a sole ${(p.sole - p.ground).toFixed(3)} m off the ground`);
  }
}
await shot('05-strolling');
// Closer, at walking height: they go by.
await standLooking(37.5, 383.5, 37.5, 374, 0.2);
for (let k = 0; k < 4; k++) {
  await step(0.6);
  await xrFrames(2);
  await shot(`06-passing-${k + 1}`);
}

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
