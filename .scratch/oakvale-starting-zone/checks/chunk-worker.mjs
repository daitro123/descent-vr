// Checks for building chunks in a worker (issues/35-building-chunks-in-a-worker.md)
// in headless Chromium, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/oakvale-starting-zone/checks/chunk-worker.mjs [http://localhost:5173]
//
// 1. Oakvale's worker, started as the zone starts it, builds every chunk at
//    both details byte for byte as the page's own builder does.
// 2. In the Adventure (in VR, the IWER emulator), with `?perf`: walking the
//    main road north to south a metre an XR frame, then running it back
//    south to north two metres a frame, looking the way you go. The chunks
//    come from the worker; no frame uploads more than one chunk (counted at
//    each render, and in bytes handed to WebGL, apart from the renders that
//    upload a building's or the mine's meshes as you come near, ticket 34); `renderer.info.programs`
//    is the same at the end as before the first step; and the streamer's own
//    time on the main thread each frame.
// 3. The same walk with no `Worker` in the page: the streamer builds on the
//    main thread, still one chunk a frame, and catches up.
// 4. `?perf` shows the bytes uploaded.
//
// Playwright is the global install; Chromium is the pre-installed one.

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
let page = null;
/** A new page in a new context: no save carried over from the last run. */
async function fresh(init) {
  await page?.context().close();
  page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(countUploads);
  if (init) await page.addInitScript(init);
}

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

/** Every byte the page hands WebGL's buffers, counted per render. */
function countUploads() {
  window.__bytes = 0;
  for (const name of ['bufferData', 'bufferSubData']) {
    const f = WebGL2RenderingContext.prototype[name];
    WebGL2RenderingContext.prototype[name] = function (...args) {
      const data = name === 'bufferData' ? args[1] : args[2];
      window.__bytes += typeof data === 'number' ? data : (data?.byteLength ?? 0);
      return f.apply(this, args);
    };
  }
}

// 1. The worker's chunks, byte for byte the page's.
{
  await fresh();
  await page.goto(`${base}/?map=forest&noemulate`);
  await page.waitForFunction(() => window.__descent?.map, null, { timeout: 120000 });
  const result = await page.evaluate(async () => {
    const { buildOakvaleChunk, oakvaleChunks } = await import('/src/maps/forest/chunks.ts');
    const { buildLayout } = await import('/src/maps/forest/layout.ts');
    const plan = buildLayout();
    // The worker as Oakvale starts it (forest.ts).
    const worker = new Worker(new URL('/src/maps/forest/chunkWorker.ts', location.href), { type: 'module' });
    const back = new Map();
    let id = 0;
    const keys = oakvaleChunks();
    const asked = ['full', 'standIn'].flatMap((detail) => keys.map((key) => ({ id: id++, key, detail })));
    const t0 = performance.now();
    await new Promise((done, fail) => {
      worker.onmessage = ({ data }) => {
        if (data.error) fail(new Error(data.error));
        back.set(data.id, data.data);
        if (back.size === asked.length) done();
      };
      worker.onerror = (e) => fail(new Error(e.message));
      for (const r of asked) worker.postMessage(r);
    });
    const ms = performance.now() - t0;
    worker.terminate();
    const differ = [];
    let bytes = 0;
    for (const { id, key, detail } of asked) {
      const a = back.get(id);
      const b = buildOakvaleChunk(plan, key, detail);
      for (const k of ['position', 'normal', 'color', 'fx', 'uv']) {
        const [x, y] = [new Uint8Array(a[k].buffer), new Uint8Array(b[k].buffer)];
        bytes += x.length;
        if (x.length !== y.length || x.some((v, i) => v !== y[i])) differ.push(`${key} ${detail} ${k}`);
      }
      if (JSON.stringify(a.sphere) !== JSON.stringify(b.sphere)) differ.push(`${key} ${detail} sphere`);
    }
    return { n: asked.length, differ, ms, bytes, offThread: window.__descent.world.streamer.offThread };
  });
  check(
    result.differ.length === 0,
    `the worker's ${result.n} chunks (every one, full and stand-in) match the page's byte for byte: ${(result.bytes / 1e6).toFixed(1)} MB, built in ${(result.ms / 1000).toFixed(1)} s${result.differ.length ? `; differ: ${result.differ.slice(0, 5).join(', ')}` : ''}`,
  );
  check(result.offThread, "?map=forest streams Oakvale's chunks from its worker");
}

/** Walk the main road north to south, then run it back, in the Adventure; what each frame did. */
async function walkAndRun(init) {
  await fresh(init);
  await page.goto(`${base}/?perf&emulate&nodevui`);
  await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  const start = await page.evaluate(() => {
    const d = window.__descent;
    d.paused = true;
    d.device.controllers.left.position.set(-0.4, 0.3, 0.2);
    d.device.controllers.right.position.set(0.4, 0.3, 0.2);
    const { stager, streamer } = d.world;
    // At each render: the chunks staged for it (uploaded unseen), and the bytes handed to WebGL.
    window.__renders = [];
    const apply = stager.apply.bind(stager);
    stager.apply = () => {
      const chunks = stager.queued.filter((q) => q.root.name.startsWith('chunk-')).length;
      // Whatever else is staged with them: a building's or the mine's meshes as you come near.
      const others = stager.queued.filter((q) => !q.root.name.startsWith('chunk-')).map((q) => q.root.name || q.root.type);
      const bytes = window.__bytes;
      apply();
      window.__renders.push({ chunks, others, bytes });
    };
    const scene = d.world.root.parent;
    const after = scene.onAfterRender;
    scene.onAfterRender = (...args) => {
      after(...args);
      const last = window.__renders.at(-1);
      if (last) last.bytes = window.__bytes - last.bytes;
    };
    // The streamer's time on the main thread each frame, and the chunks it built itself.
    window.__ms = [];
    window.__built = 0;
    const update = streamer.update.bind(streamer);
    streamer.update = (...args) => {
      const t0 = performance.now();
      update(...args);
      window.__ms.push(performance.now() - t0);
    };
    for (const zone of new Set(streamer.owners.values())) {
      const build = zone.source.build;
      zone.source.build = (...args) => (window.__built++, build(...args));
    }
    return { programs: d.renderer.info.programs.length, offThread: streamer.offThread };
  });
  // Clear what loading in did: from here on, only the walk.
  await xrFrames(2);
  await page.evaluate(() => {
    window.__renders.length = 0;
    window.__ms.length = 0;
    window.__built = 0;
  });
  const road = await page.evaluate(async () => (await import('/src/maps/forest/layout.ts')).buildLayout().paths[0].line.filter(([, z]) => z >= -72 && z <= 82));
  /** Points along `line` every `step` m. */
  const every = (line, step) => {
    const out = [];
    let last = null;
    for (const p of line) {
      if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < step) continue;
      out.push((last = p));
    }
    return out;
  };
  const legs = [
    { name: 'walking north to south', points: every([...road].reverse(), 1), yaw: Math.PI },
    { name: 'running south to north', points: every(road, 2), yaw: 0 },
  ];
  const out = { start, legs: [] };
  for (const leg of legs) {
    for (const [x, z] of leg.points) {
      await page.evaluate(([x, z, yaw]) => window.__descent.teleport(x, z, yaw), [x, z, leg.yaw]);
      await xrFrames(1);
    }
    // Let what's still coming in come in, as standing still would.
    for (let i = 0; i < 60 && (await page.evaluate(() => window.__descent.world.chunksPending)) > 0; i++) await xrFrames(1);
    out.legs.push({
      name: leg.name,
      steps: leg.points.length,
      ...(await page.evaluate(() => {
        const d = window.__descent;
        const renders = window.__renders.splice(0);
        const ms = window.__ms.splice(0);
        const built = window.__built;
        window.__built = 0;
        return {
          renders: renders.length,
          uploads: renders.reduce((n, r) => n + r.chunks, 0),
          most: Math.max(0, ...renders.map((r) => r.chunks)),
          // Of the renders that staged chunks alone; those that staged a place's meshes with them, apart.
          mostBytes: Math.max(0, ...renders.filter((r) => !r.others.length).map((r) => r.bytes)),
          places: renders.filter((r) => r.others.length).map((r) => `${r.others.join(' + ')} ${(r.bytes / 1024).toFixed(0)} KB`),
          ms: { most: Math.max(...ms), mean: ms.reduce((a, b) => a + b, 0) / ms.length },
          built,
          pending: d.world.chunksPending,
          chunks: d.world.chunkCounts,
          programs: d.renderer.info.programs.length,
        };
      })),
    });
  }
  out.perf = await page.evaluate(() => window.__descent.perf?.panel.last ?? '');
  out.biggest = await page.evaluate(async () => {
    // The biggest chunk Oakvale has, in bytes: what one chunk's upload can come to.
    const { buildOakvaleChunk, oakvaleChunks } = await import('/src/maps/forest/chunks.ts');
    const { buildLayout } = await import('/src/maps/forest/layout.ts');
    const plan = buildLayout();
    let most = 0;
    for (const key of oakvaleChunks()) {
      const c = buildOakvaleChunk(plan, key, 'full');
      most = Math.max(most, [c.position, c.normal, c.color, c.fx, c.uv].reduce((n, a) => n + a.byteLength, 0));
    }
    return most;
  });
  return out;
}

const kb = (b) => `${(b / 1024).toFixed(0)} KB`;
const report = (run, how) => {
  for (const leg of run.legs) {
    check(
      leg.most <= 1 && leg.pending === 0,
      `${how}, ${leg.name} (${leg.steps} steps): at most one chunk uploaded in a render (most ${leg.most}; ${leg.uploads} over ${leg.renders} renders), ${leg.built} built on the main thread, all caught up (${leg.chunks.full} full ${leg.chunks.standIn} far)`,
    );
    check(
      leg.mostBytes <= run.biggest,
      `${how}, ${leg.name}: no render hands WebGL more than one chunk's bytes (most ${kb(leg.mostBytes)}; Oakvale's biggest chunk is ${kb(run.biggest)})${leg.places.length ? `, but for a place staged as you came near: ${leg.places.join(', ')}` : ''}`,
    );
    check(leg.programs === run.start.programs, `${how}, ${leg.name}: shader programs unchanged (${run.start.programs} before, ${leg.programs} after)`);
    console.log(`     the streamer's main-thread time a frame: ${leg.ms.mean.toFixed(2)} ms on average, ${leg.ms.most.toFixed(1)} ms at most`);
  }
};

// 2 and 4. With the worker.
const worker = await walkAndRun();
check(worker.start.offThread, 'the Adventure streams its chunks from the worker');
report(worker, 'with the worker');
check(worker.legs.every((l) => l.built === 0), 'with the worker, no chunk built on the main thread while walking and running');
const line = worker.perf.split('\n').find((l) => l.startsWith('uploaded')) ?? '';
check(/^uploaded\s+\d+ KB$/.test(line), `?perf shows the bytes uploaded: "${line}"`);

// 3. Without workers.
const main = await walkAndRun(() => {
  delete window.Worker;
});
check(!main.start.offThread, 'with no Worker in the page, the streamer builds on the main thread');
report(main, 'with no worker');
check(main.legs.every((l) => l.built > 0), 'with no worker, the main thread builds the chunks as in ticket 34');

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
process.exit(failed ? 1 : 0);
