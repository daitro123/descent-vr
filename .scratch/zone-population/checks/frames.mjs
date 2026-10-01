// The frame with people in it, at each zone's busiest spots, in the Adventure
// (character-notes.md, "Placing people in a zone"). Run it after placing a
// zone's people and camps. Start `npx vite --port 5173` first, then:
//
//   node .scratch/zone-population/checks/frames.mjs [http://localhost:5173] [zone ...]
//
// For each spot: both eyes at 96° each in the IWER emulator, the worst of 8
// headings; the frame's triangles and draw calls, and how much of it is the
// characters (every villager, enemy and Hale shown, measured by drawing the
// frame again without them). The budget is 600k triangles both eyes and
// about 300 draw calls. Spots are walked in order (Oakvale, Brackenmoor,
// Aldhaven, the Sallows), so each zone's neighbours are loaded by the time
// you stand in it. Name zones to measure only theirs.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const only = process.argv.slice(3);

/** The busiest spots by the inhabitants specs (zones/<zone>-inhabitants.md), in walking order. */
const SPOTS = [
  ['forest', 'village', 0, 8],
  ['forest', 'mine front', -8, -60],
  ['brackenmoor', 'Cairnford square', 35, 365],
  ['brackenmoor', 'east gate', 110, 362],
  ['brackenmoor', "Fellgate's forecourt", 168, 331.6],
  ['aldhaven', 'market cross', 350, 345],
  ['aldhaven', 'cathedral front', 428, 345],
  ['aldhaven', 'Aldbridge', 390, 420],
  ['sallows', "Reedholm's landing", 364, 608],
  ['sallows', "Reedholm's square", 393, 611],
];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

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
const update = (s) => page.evaluate((s) => window.__descent.step(s, 1 / 72), s);

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 180000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => {
  const d = window.__descent;
  d.paused = true;
  d.device.stereoEnabled = true;
  d.device.fovy = (96 * Math.PI) / 180;
  Object.assign(d.device.controllers.left.position, { x: -0.3, y: -1, z: 0.2 });
  Object.assign(d.device.controllers.right.position, { x: 0.3, y: -1, z: 0.2 });
});

/** Everything that draws a character: the population, the camps, Oakvale's own villagers and Hale. */
const characters = (shown) =>
  page.evaluate((shown) => {
    const a = window.__descent.adventure;
    for (const root of [a.peopleRoot, a.camps.root, a.villagers.root, a.hale.root]) root.visible = shown;
  }, shown);
const frame = async () => {
  await xrFrames(2);
  return page.evaluate(() => {
    const { calls, triangles } = window.__descent.renderer.info.render;
    return { calls, triangles };
  });
};

console.log('spot: worst frame both eyes (calls) | characters in it (calls) | built near you');
for (const [zone, name, x, z] of SPOTS) {
  const skip = only.length && !only.includes(zone);
  await page.evaluate(([x, z]) => window.__descent.teleport(x, z, 0), [x, z]);
  await update(0.5);
  for (let i = 0; i < 900; i++) {
    const pending = await page.evaluate(() => window.__descent.world.chunksPending + window.__descent.world.neighboursPending);
    if (pending === 0) break;
    await update(1 / 72);
    await xrFrames(1);
  }
  // Long enough for the crowd round you to be built, a few a frame.
  await update(2);
  if (skip) continue;
  const here = await page.evaluate(() => window.__descent.world.zone?.id);
  let worst = null;
  for (let k = 0; k < 8; k++) {
    const yaw = (k * Math.PI) / 4;
    await page.evaluate(([x, z, yaw]) => window.__descent.teleport(x, z, yaw), [x, z, yaw]);
    await update(1 / 72);
    const all = await frame();
    await characters(false);
    const bare = await frame();
    await characters(true);
    if (!worst || all.triangles > worst.all.triangles) worst = { all, bare };
  }
  const built = await page.evaluate(() => {
    const d = window.__descent;
    return { people: d.people.built.length, enemies: d.camps.enemies.length };
  });
  const k = (n) => `${(n / 1000).toFixed(1)}k`;
  const { all, bare } = worst;
  const flag = all.triangles > 600000 || all.calls > 300 ? '  OVER' : '';
  console.log(
    `${here === zone ? '' : `(in ${here}) `}${zone}, ${name}: ${k(all.triangles)} (${all.calls}) | ${k(all.triangles - bare.triangles)} (${all.calls - bare.calls}) | ${built.people} people, ${built.enemies} enemies${flag}`,
  );
}
if (errors.length) console.log(`page errors:\n${errors.join('\n')}`);
await browser.close();
