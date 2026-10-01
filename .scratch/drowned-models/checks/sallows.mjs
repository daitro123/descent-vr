// The drowned and the bog lurkers at walking height where the Sallows spec
// places them, in headless Chromium with the IWER emulator. Start
// `npx vite --port 5173` first, then:
//
//   node .scratch/drowned-models/checks/sallows.mjs [http://localhost:5173] [shots/]
//
// No zone places them yet (that's the Sallows' placement), so this adds their
// camps to the running Adventure as the zone would, from
// /zones/sallows-inhabitants.md: the drowned round the sunken bell tower and in
// Saint Odo's graveyard, the bog lurkers in the Mire with the Mire King
// between them, and the Old Lantern Man on the Gibbet Willow's holm. What it
// checks:
//
// 1. Each lies hidden while you're away: under the water, under the ground, or
//    sunk in the mud as a mound with only its back and reeds showing.
// 2. Walk near and it rises: up out of the water at the bell tower, out of the
//    graves at Saint Odo's, heaving up out of the mud in the Mire; then it
//    stands at its post, on the ground.
//
// And screenshots before, during and after, from where you'd walk up.
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
  await xrFrames(3);
  await page.screenshot({ path: `${shots}/${name}.png` });
};
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

const S = 0;
const N = Math.PI;
const W = -Math.PI / 2;
const E = Math.PI / 2;
const toward = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
/** The camps, from the Sallows inhabitants spec. */
const CAMPS = [
  {
    // "4 drowned, standing under the water until you near, then rising", round the sunken bell tower (572.4, 695.8).
    id: 'review-bell-tower',
    place: { x: 572.4, z: 695.8, r: 9 },
    level: 17,
    posts: [
      { behaviour: 'grunt', family: 'drowned', x: 568, z: 700, yaw: toward(568, 700, 580, 712) },
      { behaviour: 'grunt', family: 'drowned', x: 577, z: 699, yaw: toward(577, 699, 580, 712) },
      { behaviour: 'grunt', family: 'drowned', x: 570, z: 690, yaw: W },
      { behaviour: 'brute', family: 'drowned', x: 576, z: 691, yaw: E },
    ],
  },
  {
    // "6 drowned that rise out of the graves as you near", in Saint Odo's churchyard round the chapel (298, 831).
    id: 'review-saint-odo',
    place: { x: 298, z: 838, r: 12 },
    level: 13,
    posts: [
      { behaviour: 'grunt', family: 'drowned', x: 293, z: 840.5, yaw: S },
      { behaviour: 'grunt', family: 'drowned', x: 297.5, z: 844, yaw: S },
      { behaviour: 'grunt', family: 'drowned', x: 303, z: 844, yaw: S },
      { behaviour: 'grunt', family: 'drowned', x: 306, z: 838, yaw: E },
      { behaviour: 'archer', family: 'drowned', x: 291.5, z: 836, yaw: W },
      { behaviour: 'brute', family: 'drowned', x: 292, z: 832.5, yaw: N },
    ],
  },
  {
    // The Mire's heart: two bog lurkers, and the Mire King between its two camps (422, 852).
    id: 'review-mire',
    place: { x: 428, z: 858, r: 14 },
    level: 15,
    posts: [
      { behaviour: 'brute', family: 'bog', x: 429, z: 866, yaw: N },
      { behaviour: 'brute', family: 'bog', x: 436.5, z: 866, yaw: N },
      { behaviour: 'brute', family: 'bog', named: 'mireKing', level: 16, x: 422, z: 852, yaw: E },
    ],
  },
  {
    // The Old Lantern Man on the Gibbet Willow's holm (318, 645).
    id: 'review-lantern-man',
    place: { x: 318, z: 645, r: 6 },
    level: 13,
    posts: [{ behaviour: 'grunt', family: 'drowned', named: 'oldLanternMan', x: 318, z: 645, yaw: S }],
  },
];

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
  // They don't come for you while you look: this is about how they rise, not how they fight.
  d.CONFIG.camps.notice = 0;
});

/** The members of camp `id`: where they stand, how far down their bodies are, and whether they're still lying in wait. */
const members = (id) =>
  page.evaluate((id) => {
    const d = window.__descent;
    const camp = d.camps.camps.find((c) => c.plan.id === id);
    return camp.members.map(({ enemy: e }) => {
      const head = e.rig.bones.head.getWorldPosition(e.position.clone());
      return {
        label: `${e.family} ${e.named ?? e.kind}`,
        state: e.state,
        lurking: e.lurking,
        x: e.position.x,
        z: e.position.z,
        y: e.position.y,
        ground: d.world.heightAt(e.position.x, e.position.z),
        water: d.world.waterAt(e.position.x, e.position.z),
        sunk: e.visual?.position.y ?? e.root.children[0].position.y,
        head: head.y,
      };
    });
  }, id);

/** Add camp `id` and raise it, standing at (x, z) looking at (tx, tz). */
async function raise(id, [x, z], [tx, tz]) {
  const plan = CAMPS.find((c) => c.id === id);
  await standLooking(x, z, tx, tz, 1);
  await page.evaluate((plan) => window.__descent.camps.add([plan], window.__descent.world, true), plan);
  await page.evaluate(([x, z]) => window.__descent.camps.fill({ x, z }), [x, z]);
  for (let i = 0; i < 20 && (await members(id)).length < plan.posts.length; i++) await step(0.25);
  await step(1.5);
  return plan;
}

const setWake = (m) => page.evaluate((m) => (window.__descent.CONFIG.camps.lurk.wake = m), m);

/**
 * Camp `id` raised while you stand at `far` looking at `look`, and still lying
 * in wait there (`hidden` says how it should be hidden). Then each of `walk`:
 * stand at `at` looking at `look` and let `t` s pass, taking shot `name`, and
 * check that those within the wake range have woken and risen by the end.
 */
async function visit(name, id, far, look, hidden, walk) {
  // Shortened while you look at them lying in wait from where you'd see them; they rise only as you walk in.
  await setWake(1);
  const plan = await raise(id, far, look);
  let m = await members(id);
  console.log(m.map((e) => `   ${e.label} at (${e.x.toFixed(1)}, ${e.z.toFixed(1)}): ground ${e.ground.toFixed(2)}, water ${e.water?.toFixed(2) ?? '-'}, sunk ${e.sunk.toFixed(2)}`).join('\n'));
  check(m.length === plan.posts.length, `${id}: every member is raised`);
  check(m.every((e) => e.lurking && e.state === 'rising'), `${id}: they lie in wait`);
  check(m.every(hidden), `${id}: hidden as they should be (${m.map((e) => `head ${(e.head - e.ground).toFixed(2)} over the ground`).join(', ')})`);
  await shot(`${name}-a-waiting`);
  await setWake(11);
  let k = 0;
  for (const { at, look: to = look, t, shots: names, wake = 11 } of walk) {
    await setWake(wake);
    await standLooking(at[0], at[1], to[0], to[1], 0);
    for (let i = 0; i < t.length; i++) {
      await step(t[i]);
      await shot(`${name}-${String.fromCharCode(98 + k++)}-${names[i]}`);
    }
  }
  await step(3);
  m = await members(id);
  check(m.some((e) => !e.lurking), `${id}: walking in wakes them (${m.filter((e) => !e.lurking).length} of ${m.length})`);
  check(
    m.filter((e) => !e.lurking).every((e) => e.state !== 'rising' && Math.abs(e.sunk) < 0.01 && Math.abs(e.y - e.ground) < 0.05),
    `${id}: and they stand up on the ground (${m.map((e) => `${e.state} ${e.sunk.toFixed(2)}`).join(', ')})`,
  );
}

// Into the Sallows, and let the zone's name float away.
await standLooking(560, 740, 572, 696, 8);
// 1. The bell tower: under the water until you near.
await visit('01-bell-tower', 'review-bell-tower', [572, 709], [572, 696], (e) => e.water !== null && e.head < e.water, [
  { at: [572, 705], t: [0.5, 0.6, 3], shots: ['surfacing', 'surfacing', 'risen'] },
  { at: [566, 702.5], look: [568, 700], t: [0.1], shots: ['close'] },
  { at: [565, 694], look: [573, 691], t: [0.6, 3], shots: ['far-side-surfacing', 'far-side-risen'] },
]);
// 2. Saint Odo's graveyard: under the ground. From inside the churchyard wall, by its south-east side.
await visit('02-saint-odo', 'review-saint-odo', [304, 846], [294, 837], (e) => e.head < e.ground, [
  { at: [304, 846], t: [0.4, 0.5, 3], shots: ['clawing', 'clawing', 'risen'] },
  { at: [296, 847.5], look: [292, 836], t: [0.5, 3], shots: ['west-clawing', 'west-risen'] },
  { at: [294.5, 839], look: [291.5, 834.5], t: [3], shots: ['archer-brute-close'] },
  { at: [295.5, 846], look: [297.5, 844], t: [0.1], shots: ['grunt-close'] },
]);
// 3. The Mire: mounds, heaving up out of the mud. The Mire King between its camps.
await visit('03-mire', 'review-mire', [433, 875], [432, 866], (e) => e.head < e.ground + 0.6, [
  { at: [433, 873], t: [0.5, 0.6, 3], shots: ['heaving', 'heaving', 'risen'] },
  { at: [431, 869], look: [429, 866], t: [0.1], shots: ['close'] },
  { at: [427, 858], look: [422, 852], t: [0.1], shots: ['mire-king-mound'], wake: 1 },
  { at: [418, 858], look: [422, 852], t: [0.6, 3], shots: ['mire-king-heaving', 'mire-king-risen'] },
]);
// 4. The Old Lantern Man, on the Gibbet Willow's holm.
await visit('04-lantern-man', 'review-lantern-man', [318, 657], [318, 645], (e) => e.head < Math.max(e.ground, e.water ?? -99), [
  { at: [318, 652], t: [0.5, 0.5, 3], shots: ['clawing', 'clawing', 'risen'] },
  { at: [319.5, 647.5], look: [318, 645], t: [0.1], shots: ['close'] },
]);

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
