// Screenshots of the critters and crawlers in the model inspector (`?inspect`),
// close up on the plinth, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/critters/checks/inspect.mjs [http://localhost:5173] [shots/] [label filter]
//
// For each matching entry: every clip, paused at a few moments, from the
// front three-quarter and the side. Prints each one's triangles.

import { mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const shots = process.argv[3] ?? 'shots';
const only = process.argv[4] ? new RegExp(process.argv[4], 'i') : null;
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}/?inspect&noemulate`);
await page.waitForFunction(() => window.__descent?.inspector, null, { timeout: 120000 });

const entries = await page.evaluate(async () => (await import('/src/inspector/inspector.ts')).ENTRIES.map((e, i) => ({ i, label: e.label, creature: 'critter' in e || 'crawler' in e, long: 'crawler' in e })));
for (const e of entries.filter((e) => e.creature && (!only || only.test(e.label)))) {
  const clips = await page.evaluate((i) => {
    const { inspector } = window.__descent;
    inspector.show(i);
    return inspector.current.clips.map((c) => ({ name: c.name, duration: c.duration }));
  }, e.i);
  for (let c = 0; c < clips.length; c++) {
    const { name, duration } = clips[c];
    const moments = duration > 2.1 ? [0.25, 0.45, 0.6, 0.8].map((k) => k * duration) : [0.5];
    for (const [m, t] of moments.entries()) {
      for (const view of ['front', 'side']) {
        const tris = await page.evaluate(
          ([c, t, view, long]) => {
            const { inspector, camera } = window.__descent;
            inspector.playClip(c);
            inspector.playing = false;
            inspector.showGuides = true;
            inspector.time = t;
            inspector.update(0);
            const b = inspector.current;
            const box = { h: Math.max(0.25, b.height * 1.74) };
            const d = long ? 0.95 : 0.25 + box.h * 1.6;
            camera.fov = 30;
            camera.updateProjectionMatrix();
            if (long) {
              // A crawler: long and low, framed by its length and seen from a crouch.
              if (view === 'front') camera.position.set(d * 0.55, 0.4, -1.8 + d * 0.8);
              else camera.position.set(d, 0.12, -1.65);
              camera.lookAt(0, 0.05, -1.65);
            } else {
              if (view === 'front') camera.position.set(d * 0.6, box.h * 0.8 + 0.1, -1.8 + d * 0.8);
              else camera.position.set(d, box.h * 0.4 + 0.05, -1.8);
              camera.lookAt(0, box.h * 0.3, -1.8);
            }
            return b.triangles;
          },
          [c, t, view, e.long],
        );
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const file = `${shots}/${e.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${name.replace(/[^a-z0-9]+/g, '-')}-${m}-${view}.png`;
        await page.screenshot({ path: file });
        if (view === 'front' && m === 0) console.log(`${e.label} / ${name}: ${tris} tris`);
      }
    }
  }
}
if (errors.length) console.log('errors:', errors.slice(0, 5));
await browser.close();
