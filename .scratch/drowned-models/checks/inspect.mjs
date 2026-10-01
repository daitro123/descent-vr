// Screenshots of the drowned and the bog beasts in the model inspector
// (`?inspect`), against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/drowned-models/checks/inspect.mjs [http://localhost:5173] [shots/] [label filter]
//
// For every drowned look, the Drowned Reeve, the Old Lantern Man, the bog
// lurkers, the Mire King and the sewer beast: each animation plays with every
// bone in place, and the body is one mesh under its cap. Then a close-up of
// each standing, from behind, and at its attacks and its rise at a telling
// moment, and a line-up beside an undead grunt and a bandit for scale.
//
// Playwright is the global install; Chromium is the pre-installed one.

import { mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const shots = process.argv[3];
const only = process.argv[4];
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};
const errors = [];
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}/?inspect&noemulate`);
await page.waitForFunction(() => window.__descent?.inspector, null, { timeout: 120000 });

const entries = await page.evaluate(async () => (await import('/src/inspector/inspector.ts')).ENTRIES.map((e) => ({ label: e.label, family: e.family })));
const WANT = entries.filter((e) => e.family === 'drowned' || e.family === 'bog').map((e) => e.label).filter((l) => !only || l.toLowerCase().includes(only.toLowerCase()));
check(WANT.length > 0, `the inspector lists the drowned and the bog beasts (${WANT.join(', ')})`);

/** Each body's cap: a drowned as a skeleton's, the big ones and the Reeve more, the lurkers less (they are lumps). */
const cap = (label) =>
  /Reeve/.test(label) ? 2000 : /lock-warden/.test(label) ? 1700 : /Mire King/.test(label) ? 1300 : /lurker|sewer/.test(label) ? 900 : 1400;

for (const label of WANT) {
  const r = await page.evaluate(async (label) => {
    const { ENTRIES } = await import('/src/inspector/inspector.ts');
    const { inspector } = window.__descent;
    inspector.show(ENTRIES.findIndex((e) => e.label === label));
    const b = inspector.current;
    let placed = true;
    for (let c = 0; c < b.clips.length; c++) {
      inspector.playClip(c);
      inspector.playing = true;
      for (let t = 0; t < b.clips[c].duration; t += 1 / 10) {
        inspector.update(1 / 10);
        for (const bone of Object.values(b.rig.bones)) if (!bone.matrixWorld.elements.every(Number.isFinite)) placed = false;
      }
    }
    return { clips: b.clips.map((c) => c.name), triangles: b.rig.triangles, placed };
  }, label);
  check(r.placed, `${label} plays ${r.clips.join(', ')} with every bone in place`);
  check(r.triangles < cap(label), `${label} is one body of ${r.triangles} triangles (cap ${cap(label)})`);
}

/** On the plinth, `turn` round, the clip `clip` paused `at` of the way through. */
const pose = (label, clip, at, turn = 0.45, wide = 1) =>
  page.evaluate(
    async ([label, clip, at, turn, wide]) => {
      const { ENTRIES } = await import('/src/inspector/inspector.ts');
      const { inspector, camera } = window.__descent;
      inspector.show(ENTRIES.findIndex((e) => e.label === label));
      const b = inspector.current;
      inspector.playClip(Math.max(0, b.clips.findIndex((c) => c.name === clip)));
      inspector.playing = false;
      inspector.time = at * b.clips[inspector.clip].duration;
      inspector.reset();
      inspector.turntable.rotation.y = turn;
      inspector.showGuides = false;
      inspector.update(0);
      inspector.panel.mesh.visible = false;
      const geometry = b.rig.mesh.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const top = Math.max(b.rig.proportions.hipY + b.rig.proportions.neck + 0.3, geometry.boundingBox.max.y + 0.08) * wide;
      camera.position.set(0, top * 0.55, -1.8 + top * 1.05);
      camera.lookAt(0, top * 0.5, -1.8);
      return b.clips.map((c) => c.name);
    },
    [label, clip, at, turn, wide],
  );
const shot = async (name) => {
  if (!shots) return;
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${shots}/${name}.png` });
};

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
let n = 0;
for (const label of WANT) {
  const clips = await pose(label, 'idle', 0);
  const name = `${String(++n).padStart(2, '0')}-${slug(label)}`;
  await pose(label, 'idle', 0, 0.45);
  await shot(name);
  await pose(label, 'idle', 0, Math.PI + 0.6);
  await shot(`${name}-back`);
  const moments = { chop: 0.45, slashR: 0.42, slam: 0.5, draw: 0.5, summon: 0.4, rise: 0.5, surface: 0.5, mound: 0.5 };
  for (const c of clips) {
    if (!(c in moments)) continue;
    await pose(label, c, moments[c], c === 'mound' || c === 'surface' ? 0.9 : 0.6);
    await shot(`${name}-${slug(c)}`);
    if (c === 'mound' || c === 'surface') {
      await pose(label, c, moments[c], Math.PI / 2);
      await shot(`${name}-${slug(c)}-side`);
    }
  }
}

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
