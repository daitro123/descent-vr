// Checks for crossing the seam (issues/37-crossing-the-seam.md) in headless
// Chromium, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/oakvale-starting-zone/checks/crossing.mjs [http://localhost:5173] [shots/]
//
// 1. ?map=forest on the desktop camera: screenshots looking south up the road
//    from 40 m short of the crest (Oakvale's light), on the crest (halfway)
//    and 40 m past it (the moor's), and the World's fog colour at each.
// 2. The Adventure, in VR (the IWER emulator): "Oakvale" floats up as you
//    load in. Then, moved along the road a step each XR frame (one game
//    update per render), you cross the crest 10 times, 128 m to 152 m and
//    back: each crossing changes the current zone 2 m past the line, floats
//    the new zone's name and writes a save; `renderer.info.programs.length`
//    is the same at the end as at the start, and no render uploads more than
//    one chunk. The sound's airs crossfade as you go.
// 3. Walking the moor end to end, Oakvale goes from full detail to
//    stand-ins to unloaded, and back on the way home.
// 4. A save made on the moor loads there: in Brackenmoor, under its light,
//    its name floating up, with Oakvale streaming in behind you.
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
const errors = [];
let context = null;
let page = null;
async function fresh(keep = false) {
  if (!keep) {
    await context?.close();
    context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  } else await page?.close();
  page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
}

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};
const shot = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });
const frames = (n) =>
  page.evaluate(
    (n) =>
      new Promise((done) => {
        let k = 0;
        const step = () => (++k >= n ? done() : requestAnimationFrame(step));
        requestAnimationFrame(step);
      }),
    n,
  );
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
const programs = () => page.evaluate(() => window.__descent.renderer.info.programs.length);
async function settled(next, max = 400) {
  for (let i = 0; i < max; i++) {
    if ((await page.evaluate(() => (window.__descent.world ?? window.__descent.adventure.world).chunksPending)) === 0) return;
    await next(1);
  }
}
/** Where the main road runs at `z`: Oakvale's up to the crest, Brackenmoor's past it. */
const roads = async () =>
  page.evaluate(async () => {
    const { planOakvale } = await import('/src/maps/forest/layout.ts');
    const { planMoor } = await import('/src/maps/brackenmoor/chunks.ts');
    return { oak: planOakvale().paths[0].line, moor: planMoor().road.line };
  });
const roadAt = ({ oak, moor }, z) => (z <= 140 ? oak : moor).reduce((best, p) => (Math.abs(p[1] - z) < Math.abs(best[1] - z) ? p : best))[0];
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

// 1. The light over the crest, in ?map=forest.
await fresh();
await page.goto(`${base}/?map=forest&noemulate`);
await page.waitForFunction(() => window.__descent?.world, null, { timeout: 120000 });
await frames(5);
const lines = await roads();
const atmospheres = await page.evaluate(async () => {
  const { OAKVALE_ATMOSPHERE } = await import('/src/maps/forest/layout.ts');
  const { MOOR_ATMOSPHERE } = await import('/src/maps/brackenmoor/plan.ts');
  return { oak: OAKVALE_ATMOSPHERE.fog.color, moor: MOOR_ATMOSPHERE.fog.color };
});
const fogs = [];
for (const [name, z] of [
  ['01-40-m-short-of-the-crest', 100],
  ['02-on-the-crest', 140],
  ['03-40-m-past-the-crest', 180],
]) {
  await page.evaluate(
    ([x, z]) => {
      const d = window.__descent;
      d.teleport(x, z, Math.PI);
      d.walker.pitch = 0.04;
      d.world.fill(x, z);
    },
    [roadAt(lines, z) - 1.2, z],
  );
  await frames(6);
  await settled(frames);
  fogs.push(await page.evaluate(() => window.__descent.world.fog.color.getHex()));
  await shot(name);
}
check(fogs[0] === atmospheres.oak, `40 m short of the crest the haze is Oakvale's (${hex(fogs[0])})`);
check(fogs[1] !== atmospheres.oak && fogs[1] !== atmospheres.moor, `on the crest it's between the two (${hex(fogs[1])})`);
check(fogs[2] === atmospheres.moor, `40 m past it the haze is the moor's (${hex(fogs[2])})`);

// 2. Crossing ten times in the Adventure.
await fresh();
await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await page.evaluate(() => {
  const { device } = window.__descent;
  device.controllers.left.position.set(-0.3, 0.1, 0.3);
  device.controllers.right.position.set(0.3, 0.1, 0.3);
});
await xrFrames(4);
const loadedIn = await page.evaluate(() => ({ name: window.__descent.adventure.zoneName.shown, zone: window.__descent.world.zone.id }));
check(loadedIn.name === 'Oakvale' && loadedIn.zone === 'forest', `"Oakvale" floats up as you load in (${loadedIn.name})`);
await shot('04-oakvale-as-you-load-in');
const x0 = roadAt(lines, 124);
await page.evaluate(([x, z]) => {
  const d = window.__descent;
  d.teleport(x, z, Math.PI);
  d.world.fill(x, z);
  // Every write of the save, where it stood.
  window.__writes = [];
  const store = d.adventure.saves.store;
  const write = store.write.bind(store);
  store.write = (r) => (window.__writes.push({ ...r.position }), write(r));
  // At each render: the chunks staged for it (uploaded unseen).
  window.__renders = [];
  const { stager } = d.world;
  const apply = stager.apply.bind(stager);
  stager.apply = () => {
    window.__renders.push(stager.queued.filter((q) => q.root.name.startsWith('chunk-')).length);
    apply();
  };
}, [x0, 124]);
await xrFrames(4);
await settled(xrFrames);
await xrFrames(4);
const programsBefore = await programs();
await page.evaluate(() => (window.__renders.length = 0));

/** Walk the road to `to`, `stride` m an XR frame, from inside the page: one game update a render. Returns what each frame saw. */
const walkTo = (to, stride = 0.4) =>
  page.evaluate(
    ([to, stride, lines]) =>
      new Promise((done) => {
        const d = window.__descent;
        const session = d.renderer.xr.getSession();
        const road = (z) => (z <= 140 ? lines.oak : lines.moor).reduce((best, p) => (Math.abs(p[1] - z) < Math.abs(best[1] - z) ? p : best))[0];
        const seen = [];
        const head = () => d.camera.getWorldPosition(d.camera.position.clone());
        const step = () => {
          const at = head();
          seen.push({ z: at.z, zone: d.world.zone.id, name: d.adventure.zoneName.shown, writes: window.__writes.length, airs: d.adventure.ambience.gains?.zones ?? null });
          const left = to - at.z;
          if (Math.abs(left) < 0.05) return done(seen);
          const z = at.z + Math.sign(left) * Math.min(stride, Math.abs(left));
          d.teleport(road(z) - 0.8, z, left > 0 ? Math.PI : 0);
          session.requestAnimationFrame(step);
        };
        session.requestAnimationFrame(step);
      }),
    [to, stride, lines],
  );

let crossings = 0;
let good = 0;
const notes = [];
for (let i = 0; i < 10; i++) {
  const south = i % 2 === 0;
  const seen = await walkTo(south ? 152 : 128);
  await page.evaluate(() => window.__descent.saved());
  const want = south ? 'brackenmoor' : 'forest';
  const label = south ? 'Brackenmoor' : 'Oakvale';
  const change = seen.findIndex((s, k) => k > 0 && s.zone !== seen[k - 1].zone);
  const changedAt = change > 0 ? seen[change].z : NaN;
  const before = change > 0 ? seen[change - 1].z : NaN;
  const past = south ? before <= 142 + 1e-6 && changedAt > 142 : before >= 138 - 1e-6 && changedAt < 138;
  const floated = change > 0 && seen.slice(change + 1).some((s) => s.name === label);
  const wrote = change > 0 && seen.at(-1).writes > seen[change - 1].writes;
  const last = await page.evaluate(() => window.__writes.at(-1));
  const where = south ? last.z > 142 : last.z < 138;
  crossings++;
  if (seen.at(-1).zone === want && past && floated && wrote && where) good++;
  notes.push(`${label} at z ${changedAt.toFixed(2)}, "${seen.at(-1).name}", save at z ${last.z.toFixed(1)}`);
  if (i === 0) {
    const mid = seen.reduce((best, s) => (Math.abs(s.z - 140) < Math.abs(best.z - 140) ? s : best));
    check(mid.airs && Math.abs(mid.airs.forest - Math.SQRT1_2) < 0.05 && Math.abs(mid.airs.brackenmoor - Math.SQRT1_2) < 0.05, `on the crest both zones' airs are heard, crossfading (${JSON.stringify(mid.airs)})`);
    // 12 m either side of the line, inside the 40 m band: mostly the near zone's air, some of the other's.
    const a = seen[0].airs;
    const b = seen.at(-1).airs;
    check(a?.forest > a?.brackenmoor && b?.brackenmoor > b?.forest, `mostly Oakvale's air at 128 m, mostly the moor's at 152 m (${JSON.stringify(a)} → ${JSON.stringify(b)})`);
    await shot('05-brackenmoor-floats-up');
  }
}
for (const n of notes) console.log(`     ${n}`);
check(good === crossings, `each of ${crossings} crossings changed zone 2 m past the crest, floated its name and wrote a save there (${good} did)`);
const renders = await page.evaluate(() => window.__renders);
check(Math.max(...renders) <= 1, `no render uploaded more than one chunk (${renders.length} renders, at most ${Math.max(...renders)}, ${renders.reduce((a, b) => a + b, 0)} chunks in all)`);
const programsAfter = await programs();
check(programsAfter === programsBefore, `renderer.info.programs unchanged across the crossings (${programsBefore} before, ${programsAfter} after)`);

// 3. The moor end to end, and home: what's loaded of Oakvale.
const oakvale = () =>
  page.evaluate(async () => {
    const d = window.__descent;
    const zone = d.world.zoneAt(0, 0);
    const n = { full: 0, standIn: 0 };
    const now = new Map();
    for (const m of d.world.chunksOf(zone).children) {
      const [, key, detail] = m.name.match(/^chunk-(.+)-(full|standIn)$/);
      n[detail]++;
      now.set(key, detail);
    }
    // What a fresh decision standing here wants of Oakvale: all of it should be in, at least as detailed.
    const { decide, reachTo } = await import('/src/world/streaming.ts');
    const p = d.camera.getWorldPosition(d.camera.position.clone());
    const fresh = decide(p.x, p.z, zone.chunks.keys, new Map(), reachTo(d.world.fog.far));
    const short = [...fresh].filter(([k, detail]) => !now.has(k) || (detail === 'full' && now.get(k) !== 'full')).length;
    return { ...n, none: 49 - n.full - n.standIn, short };
  });
const along = [];
for (const z of [152, 200, 258, 200, 120]) {
  await walkTo(z, 2);
  await settled(xrFrames);
  await xrFrames(2);
  along.push({ z, ...(await oakvale()) });
}
console.log(`     Oakvale's chunks (full, stand-in, unloaded): ${along.map((a) => `z ${a.z}: ${a.full}/${a.standIn}/${a.none}`).join(', ')}`);
check(along[0].none === 0 && along[2].none > 15 && along[2].full < along[0].full, 'walking the moor to the rockfall takes Oakvale from full detail to stand-ins to unloaded');
check(along[4].short === 0 && along[4].full > along[2].full && along[4].none < along[2].none, `and back on the way home (everything a fresh decision at z 120 wants is in: ${along[4].short} short)`);

// 4. A save made on the moor loads there.
await walkTo(200, 2);
await page.evaluate(async () => {
  window.__descent.adventure.saves.onLeaving();
  await window.__descent.saved();
});
const savedAt = await page.evaluate(() => window.__writes.at(-1));
await fresh(true);
await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
const loaded = await page.evaluate(() => {
  const d = window.__descent;
  const p = d.camera.getWorldPosition(d.camera.position.clone());
  return { zone: d.world.zone.id, fog: d.world.fog.color.getHex(), x: p.x, z: p.z };
});
check(loaded.zone === 'brackenmoor' && loaded.fog === atmospheres.moor, `a save made on the moor (z ${savedAt.z.toFixed(1)}) loads in Brackenmoor, under its light (${loaded.zone}, ${hex(loaded.fog)})`);
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(4);
const there = await page.evaluate(() => {
  const d = window.__descent;
  const p = d.camera.getWorldPosition(d.camera.position.clone());
  return { name: d.adventure.zoneName.shown, x: p.x, z: p.z };
});
check(Math.abs(there.z - savedAt.z) < 0.5 && there.name === 'Brackenmoor', `…where you stood (z ${there.z.toFixed(1)}), "${there.name}" floating up`);
// Turn round to look back north over the crest, hands down.
await page.evaluate(() => {
  const d = window.__descent;
  d.device.controllers.left.position.set(-0.3, 0.1, 0.3);
  d.device.controllers.right.position.set(0.3, 0.1, 0.3);
  const p = d.camera.getWorldPosition(d.camera.position.clone());
  d.teleport(p.x, p.z, 0);
});
await settled(xrFrames);
await xrFrames(4);
const behind = await oakvale();
check(behind.full > 0 && behind.standIn > 0, `with Oakvale in behind you (${behind.full} full, ${behind.standIn} stand-ins, ${behind.none} unloaded)`);
await shot('06-loaded-on-the-moor-looking-north');

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
