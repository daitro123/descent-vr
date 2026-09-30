// Checks for Oakvale in streamed chunks (issues/34-oakvale-in-streamed-chunks.md)
// in headless Chromium, against a running dev server and, to compare with,
// one serving the build before streaming:
//
//   npx vite --port 5173                       # this build
//   (in a checkout of main) npx vite --port 5174   # before streaming
//   node .scratch/oakvale-starting-zone/checks/streaming.mjs [http://localhost:5173] [shots/] [http://localhost:5174]
//
// 1. ?fly=forest from every one of the viewer's spots, ?map=forest from its
//    start, and the Adventure from the start (in VR, the IWER emulator):
//    screenshots, each compared with the older build's by the mean difference
//    of its pixels (of 255), and the shader programs after each.
// 2. Walking the main road north to south in the Adventure, from the old
//    mine's front to the southern edge, a metre an XR frame, looking the way
//    you walk: the frame's triangles at each step, never more than the older
//    build's there; the chunks loaded at each detail; and never more than one
//    chunk built in a frame.
// 3. `?perf` shows the loaded chunks by detail.
// 4. At ?map=forest, coming within 40 m of the mine's mouth uploads every one
//    of its meshes, hidden as they are.
//
// Playwright is the global install; Chromium is the pre-installed one.

import { mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const shots = process.argv[3];
const before = process.argv[4];
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
let page = null;
/** A new page in a new context: no save carried over from the last run. */
async function fresh() {
  await page?.context().close();
  page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
}

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};

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
/** Wait (up to `max` frames) until the World has nothing left to stream. Older builds have no streamer. */
async function settled(world, next, max = 200) {
  for (let i = 0; i < max; i++) {
    const pending = await page.evaluate((w) => (w === 'viewer' ? window.__descent.viewer.world : window.__descent.world)?.chunksPending ?? 0, world);
    if (pending === 0) return;
    await next(1);
  }
}

/** Every picture this run takes, by name, to compare with the older build's. */
async function pictures(url) {
  const out = {};
  const counts = {};
  await fresh();

  // ?fly=forest, each of the viewer's spots.
  await page.goto(`${url}/?fly=forest&noemulate`);
  await page.waitForFunction(() => window.__descent?.viewer?.map, null, { timeout: 120000 });
  await page.addStyleTag({ content: '#viewer-hud { display: none !important; }' });
  await frames(3);
  const spots = await page.evaluate(() => window.__descent.viewer.spots.map((s) => s.label));
  for (let i = 0; i < spots.length; i++) {
    await page.evaluate((i) => window.__descent.viewer.goTo(i), i);
    await frames(2);
    await settled('viewer', frames);
    await frames(2);
    out[`fly-${String(i).padStart(2, '0')}-${spots[i].replace(/\W+/g, '-')}`] = await page.screenshot();
  }
  counts.fly = await programs();

  // ?map=forest from its start.
  await page.goto(`${url}/?map=forest&noemulate`);
  await page.waitForFunction(() => window.__descent?.map, null, { timeout: 120000 });
  await page.addStyleTag({ content: '#intro { display: none !important; }' });
  await frames(4);
  await settled('map', frames);
  counts.mineLight = await page.evaluate(() => window.__descent.world.underground?.switch.light ?? 0);
  // The build before streaming could start with the mine's light up for a few seconds (a first
  // frame's time from before its timer, fixed with streaming): wait it out, to compare like with like.
  await page.waitForFunction(() => !(window.__descent.world.underground?.switch.light > 0), null, { timeout: 120000 });
  await frames(2);
  out['map-start'] = await page.screenshot();
  counts.map = await programs();

  // The Adventure from the start, in VR.
  await fresh();
  await page.goto(`${url}/?emulate&nodevui`);
  await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  await page.evaluate(() => {
    const { device } = window.__descent;
    window.__descent.paused = true;
    device.controllers.left.position.set(-0.4, 0.3, 0.2);
    device.controllers.right.position.set(0.4, 0.3, 0.2);
  });
  await xrFrames(4);
  out['adventure-start'] = await page.screenshot();
  counts.adventure = await programs();
  return { out, counts };
}

/** Mean difference of two screenshots' pixels, of 255, worked out in the page. */
async function difference(a, b) {
  return page.evaluate(
    async ([a, b]) => {
      const load = async (s) => {
        const img = new Image();
        img.src = `data:image/png;base64,${s}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height).data;
      };
      const [pa, pb] = [await load(a), await load(b)];
      let sum = 0;
      let n = 0;
      for (let i = 0; i < pa.length; i += 4) {
        for (let k = 0; k < 3; k++) sum += Math.abs(pa[i + k] - pb[i + k]);
        n += 3;
      }
      return sum / n;
    },
    [Buffer.from(a).toString('base64'), Buffer.from(b).toString('base64')],
  );
}

/** Walk the main road north to south in the Adventure, a metre an XR frame, looking south. */
async function walkSouth(url) {
  await fresh();
  await page.goto(`${url}/?perf&emulate&nodevui`);
  await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  await page.evaluate(() => {
    const d = window.__descent;
    d.paused = true;
    d.device.controllers.left.position.set(-0.4, 0.3, 0.2);
    d.device.controllers.right.position.set(0.4, 0.3, 0.2);
    // Count the chunks built each frame, where there's a streamer.
    const streamer = d.world.streamer;
    // Count the builds in each of the streamer's frames, and the most in any one frame.
    window.__built = 0;
    window.__most = 0;
    if (streamer) {
      const build = streamer.build.bind(streamer);
      streamer.build = (...args) => (window.__built++, build(...args));
      const update = streamer.update.bind(streamer);
      streamer.update = (...args) => {
        const before = window.__built;
        update(...args);
        window.__most = Math.max(window.__most, window.__built - before);
      };
    }
  });
  const road = await page.evaluate(async () => (await import('/src/maps/forest/layout.ts')).buildLayout().paths[0].line.filter(([, z]) => z >= -72 && z <= 82));
  const steps = [];
  let last = null;
  for (const [x, z] of road.reverse()) {
    if (last && Math.hypot(x - last[0], z - last[1]) < 1) continue;
    last = [x, z];
    await page.evaluate(([x, z]) => {
      window.__built = 0;
      window.__descent.teleport(x, z, Math.PI); // looking south, down +z
    }, [x, z]);
    await xrFrames(2);
    steps.push(
      await page.evaluate(([x, z]) => {
        const d = window.__descent;
        return { x, z, triangles: d.renderer.info.render.triangles, built: window.__built, most: window.__most, chunks: d.world.chunkCounts ?? null };
      }, [x, z]),
    );
  }
  const perf = await page.evaluate(() => window.__descent.perf?.panel.last ?? '');
  return { steps, perf };
}

// 1. The pictures, against the older build's.
const now = await pictures(base);
check(now.counts.mineLight === 0, `?map=forest starts in the daylight, the mine's light off (${now.counts.mineLight.toFixed(2)})`);
console.log(`programs: ?fly=forest after every spot ${now.counts.fly}, ?map=forest ${now.counts.map}, the Adventure ${now.counts.adventure}`);
if (shots) for (const [name, png] of Object.entries(now.out)) await import('node:fs').then((fs) => fs.writeFileSync(`${shots}/${name}.png`, png));
if (before) {
  const old = await pictures(before);
  console.log(`programs before streaming: ?fly=forest ${old.counts.fly}, ?map=forest ${old.counts.map}, the Adventure ${old.counts.adventure}`);
  check(now.counts.fly <= old.counts.fly && now.counts.map <= old.counts.map && now.counts.adventure <= old.counts.adventure, 'no more shader programs than before streaming');
  for (const [name, png] of Object.entries(now.out)) {
    const d = await difference(png, old.out[name]);
    if (shots) await import('node:fs').then((fs) => fs.writeFileSync(`${shots}/${name}-before.png`, old.out[name]));
    check(d < 3, `${name} looks as before: pixels differ by ${d.toFixed(2)} of 255 on average`);
  }
}

// 2 and 3. Walking north to south.
const walk = await walkSouth(base);
const most = walk.steps.at(-1).most;
check(most <= 1, `walking north to south, at most one chunk built in a frame (most: ${most}; ${walk.steps.reduce((n, s) => n + s.built, 0)} in all over ${walk.steps.length} steps)`);
const sample = (s) => `z ${s.z.toFixed(0)}: ${(s.triangles / 1000).toFixed(1)}k triangles, ${s.chunks.full} full ${s.chunks.standIn} far`;
for (const s of walk.steps.filter((_, i) => i % 20 === 0)) console.log(`     ${sample(s)}`);
check(/chunks\s+\d+ full \d+ far/.test(walk.perf), `?perf shows the chunks: "${walk.perf.split('\n').pop()}"`);
if (before) {
  const old = await walkSouth(before);
  const worse = walk.steps.filter((s, i) => s.triangles > old.steps[i].triangles);
  const sum = (steps) => steps.reduce((n, s) => n + s.triangles, 0);
  check(
    worse.length === 0,
    `walking north to south, the frame's triangles never above before streaming (${(sum(walk.steps) / walk.steps.length / 1000).toFixed(1)}k a frame on average, against ${(sum(old.steps) / old.steps.length / 1000).toFixed(1)}k; most saved ${(Math.max(...walk.steps.map((s, i) => old.steps[i].triangles - s.triangles)) / 1000).toFixed(1)}k)`,
  );
  for (const s of worse.slice(0, 5)) console.log(`     over at ${sample(s)}`);
}

// 4. The mine's meshes, uploaded unseen from 40 m: every array the page hands WebGL is noted.
await fresh();
await page.addInitScript(() => {
  window.__uploaded = new WeakSet();
  const bufferData = WebGL2RenderingContext.prototype.bufferData;
  WebGL2RenderingContext.prototype.bufferData = function (target, data, ...rest) {
    if (data && typeof data === 'object') window.__uploaded.add(data);
    return bufferData.call(this, target, data, ...rest);
  };
});
await page.goto(`${base}/?map=forest&noemulate`);
await page.waitForFunction(() => window.__descent?.map, null, { timeout: 120000 });
await frames(3);
const mouth = await page.evaluate(() => window.__descent.world.mine.mouth);
/** Stand `d` m out from the mine's mouth along its front, facing it. */
const outFront = (d) => [mouth.x + Math.sin(mouth.yaw) * d, mouth.z + Math.cos(mouth.yaw) * d, mouth.yaw + Math.PI];
/** The mine's meshes whose vertices aren't on the GPU yet. */
const notUploaded = () =>
  page.evaluate(() => {
    const out = [];
    window.__descent.world.mine.root.traverse((o) => o.geometry && !window.__uploaded.has(o.geometry.attributes.position.array) && out.push(o.name));
    return out;
  });
await page.evaluate(([x, z, yaw]) => window.__descent.teleport(x, z, yaw), outFront(45));
await frames(4);
const far = await notUploaded();
await page.evaluate(([x, z, yaw]) => window.__descent.teleport(x, z, yaw), outFront(38));
await frames(2);
const near = await notUploaded();
const inside = await page.evaluate(() => window.__descent.world.interior);
check(
  far.length > 0 && near.length === 0 && inside === null,
  `the mine's meshes upload unseen from 40 m out: at 45 m ${far.length ? `${far.join(', ')} not yet` : 'all already'}; at 38 m, still outside, ${near.length ? `${near.join(', ')} not yet` : 'all of them'}`,
);

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
process.exit(failed ? 1 : 0);
