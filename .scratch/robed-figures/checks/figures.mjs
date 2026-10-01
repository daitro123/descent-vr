// Checks for the robed and named figures (`priest`, `scholar`, `noble`,
// `merchant`, `class trainer`, and Corvane's secretary and Mistress Wren), in
// headless Chromium against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/robed-figures/checks/figures.mjs [http://localhost:5173] [shots/] [label ...]
//
// 1. The model inspector (`?inspect`) lists every one of them, and each plays
//    every one of its clips (stand, stand about, walk, and its own works) with
//    every bone in place, one body under 900 triangles.
// 2. Close-ups of each standing, from the front and behind, walking, and at
//    each of their works, part way in.
// 3. Each family in a row beside a skeleton grunt for scale.
//
// Give labels to shoot only those (close-ups only). Playwright is the global
// install; Chromium is the pre-installed one.

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

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};
const errors = [];
const frames = (page, n) =>
  page.evaluate(
    (n) =>
      new Promise((done) => {
        let k = 0;
        const next = () => (++k >= n ? done() : requestAnimationFrame(next));
        requestAnimationFrame(next);
      }),
    n,
  );

const FAMILIES = {
  priest: ['brotherCuthwin', 'brotherAnsgar', 'motherYsolde', 'sisterAgna', 'dawnPriest'],
  scholar: ['magisterVey', 'student', 'studentWoman'],
  noble: ['lordCorvane', 'ladyHarrowgate', 'sirDunmore', 'courtier', 'courtierLady'],
  merchant: ['joryHask', 'stewardPell', 'masterAshby', 'ferrow', 'ferrowDaughter'],
  villager: ['corvaneSecretary', 'mistressWren'],
  'class trainer': ['sergeantRook', 'lodgemasterAshgrove', 'magisterQuill', 'warriorTrainer', 'rangerTrainer', 'mageTrainer'],
};

const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}/?inspect&noemulate`);
await page.waitForFunction(() => window.__descent?.inspector, null, { timeout: 120000 });

const ids = Object.values(FAMILIES).flat();
const labels = await page.evaluate(async (ids) => {
  const { CAST } = await import('/src/people/cast.ts');
  return Object.fromEntries(ids.map((id) => [id, CAST[id]?.label]));
}, ids);

// ---------------------------------------------------------------- 1. every clip
const listed = await page.evaluate(async () => (await import('/src/inspector/inspector.ts')).ENTRIES.map((e) => e.label));
const clipsOf = {};
for (const id of ids) {
  const label = labels[id];
  check(listed.includes(label), `the inspector lists ${id} as "${label}"`);
  const r = await page.evaluate(async (label) => {
    const { ENTRIES } = await import('/src/inspector/inspector.ts');
    const { inspector } = window.__descent;
    inspector.show(ENTRIES.findIndex((e) => e.label === label));
    const b = inspector.current;
    let placed = true;
    for (let c = 0; c < b.clips.length; c++) {
      inspector.playClip(c);
      inspector.playing = true;
      for (let t = 0; t < b.clips[c].duration; t += 1 / 15) {
        inspector.update(1 / 15);
        for (const bone of Object.values(b.rig.bones)) if (!bone.matrixWorld.elements.every(Number.isFinite)) placed = false;
      }
    }
    return { clips: b.clips.map((c) => c.name), triangles: b.rig.triangles, placed };
  }, label);
  clipsOf[id] = r.clips;
  check(r.placed && r.clips.includes("walk"), `${label} plays all ${r.clips.length} clips, every bone in place (${r.clips.join(', ')})`);
  check(r.triangles < 900, `${label} is one body of ${r.triangles} triangles`);
}

// ---------------------------------------------------------------- 2. close-ups
const pose = (label, clip, at, turn) =>
  page.evaluate(
    async ([label, clip, at, turn]) => {
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
      inspector.panel.mesh.visible = false;
      inspector.update(0);
      const top = b.rig.proportions.hipY + b.rig.proportions.neck + 0.3;
      const far = Math.max(2.4, top * 1.7);
      camera.fov = 50;
      camera.updateProjectionMatrix();
      camera.position.set(0, top * 0.55, -1.8 + far);
      camera.lookAt(0, top * 0.5, -1.8);
    },
    [label, clip, at, turn],
  );
if (shots) {
  for (const id of only.length ? only : ids) {
    const label = labels[id];
    await pose(label, 'stand', 0, 0.45);
    await frames(page, 3);
    await page.screenshot({ path: `${shots}/${id}.png` });
    if (only.length) continue;
    await pose(label, 'stand', 0, Math.PI - 0.45);
    await frames(page, 3);
    await page.screenshot({ path: `${shots}/${id}-behind.png` });
    await pose(label, 'walk', 0.14, Math.PI / 2 - 0.15);
    await frames(page, 3);
    await page.screenshot({ path: `${shots}/${id}-walk.png` });
    for (const work of clipsOf[id].slice(3)) {
      for (const at of [0.3, 0.6]) {
        await pose(label, work, at, 0.45);
        await frames(page, 3);
        await page.screenshot({ path: `${shots}/${id}-${work}-${Math.round(at * 10)}.png` });
      }
    }
  }
}

// ---------------------------------------------------------------- 3. the families in rows
if (shots && !only.length) {
  await page.setViewportSize({ width: 1800, height: 800 });
  await page.evaluate(() => {
    const { inspector } = window.__descent;
    inspector.turntable.parent.parent.visible = false;
    inspector.panel.mesh.visible = false;
    inspector.showGuides = false;
  });
  for (const [family, members] of Object.entries(FAMILIES)) {
    const heights = await page.evaluate(async (members) => {
      const { CAST, Wardrobe } = await import('/src/people/cast.ts');
      const { buildCharacter } = await import('/src/models/characters.ts');
      const { createModelMaterial } = await import('/src/models/materials.ts');
      const { IDLE } = await import('/src/enemies/poses.ts');
      const { inspector, camera } = window.__descent;
      let group = inspector.root.getObjectByName('row');
      if (!group) {
        group = new (await import('/node_modules/.vite/deps/three.js')).Group();
        group.name = 'row';
        inspector.root.add(group);
      }
      group.clear();
      const heights = [];
      const rigs = members.map((id) => {
        const rig = new Wardrobe().dress(id, createModelMaterial());
        rig.apply(CAST[id].stand);
        rig.mesh.updateMatrixWorld(true);
        rig.mesh.geometry.computeBoundingBox();
        heights.push(`${id} ${rig.mesh.geometry.boundingBox.max.y.toFixed(2)} m`);
        return rig.mesh;
      });
      const grunt = buildCharacter('grunt', { material: createModelMaterial() }).rig;
      grunt.apply(IDLE.grunt);
      rigs.push(grunt.mesh);
      rigs.forEach((m, i) => {
        m.position.set((i - (rigs.length - 1) / 2) * 1.0, 0, -4.5);
        m.rotation.y = 0.25;
        group.add(m);
      });
      camera.fov = 30;
      camera.updateProjectionMatrix();
      camera.position.set(0, 1.1, 3.8);
      camera.lookAt(0, 0.9, -4.5);
      return heights;
    }, members);
    console.log(`     ${family}: ${heights.join(', ')}`);
    await frames(page, 3);
    await page.screenshot({ path: `${shots}/00-${family.replace(' ', '-')}.png` });
  }
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
