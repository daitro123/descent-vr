// Checks for the human body's new builds (woman, elder, elder woman, child),
// the skirt and the long robe, and the friendly walk, in headless Chromium
// against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/human-builds/checks/builds.mjs [http://localhost:5173] [shots/]
//
// 1. The model inspector (`?inspect`) lists every cast member, and each plays
//    every one of its clips (stand, stand about, walk) with every bone in
//    place, one body under 900 triangles.
// 2. Close-ups of each new look standing, from the front and behind, and
//    walking from the side.
// 3. Everyone in a row beside a skeleton grunt for scale, and a strip of each
//    build's walk: the same body at eight moments of a cycle, side on, set
//    along the ground as far as it walks, so a planted foot shows in the same
//    place in consecutive frames.
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

const NEW = ['Goodwife', 'Maid', 'Greybeard', 'Granny', 'Boy', 'Girl', 'Friar', 'Sister'];

const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}/?inspect&noemulate`);
await page.waitForFunction(() => window.__descent?.inspector, null, { timeout: 120000 });

// ---------------------------------------------------------------- 1. every clip
const labels = await page.evaluate(async () => (await import('/src/inspector/inspector.ts')).ENTRIES.map((e) => e.label));
check(NEW.every((h) => labels.includes(h)), `the inspector lists the new looks (${NEW.join(', ')})`);
for (const label of [...NEW, 'Shepherd', 'Marshal Hale', 'Innkeeper', 'Smith', 'Farmer', 'Herbalist']) {
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
  check(r.placed && r.clips.includes('walk'), `${label} plays all ${r.clips.length} clips, every bone in place (${r.clips.join(', ')})`);
  check(r.triangles < 900, `${label} is one body of ${r.triangles} triangles`);
}

// ---------------------------------------------------------------- 2. close-ups
const pose = (label, clip, at, turn, side = false) =>
  page.evaluate(
    async ([label, clip, at, turn, side]) => {
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
      const far = Math.max(2.2, top * 1.6);
      camera.fov = 50;
      camera.updateProjectionMatrix();
      camera.position.set(side ? 0.0 : 0, top * 0.55, -1.8 + far);
      camera.lookAt(0, top * 0.5, -1.8);
    },
    [label, clip, at, turn, side],
  );
if (shots) {
  let n = 1;
  for (const label of NEW) {
    const slug = label.toLowerCase();
    const id = String(n++).padStart(2, '0');
    await pose(label, 'stand', 0, 0.45);
    await frames(page, 3);
    await page.screenshot({ path: `${shots}/${id}-${slug}.png` });
    await pose(label, 'stand', 0, Math.PI - 0.45);
    await frames(page, 3);
    await page.screenshot({ path: `${shots}/${id}-${slug}-behind.png` });
    for (const [k, at] of [
      [1, 0.0],
      [2, 0.14],
      [3, 0.29],
    ]) {
      await pose(label, 'walk', at, Math.PI / 2 - 0.15);
      await frames(page, 3);
      await page.screenshot({ path: `${shots}/${id}-${slug}-walk-${k}.png` });
    }
  }
}

// ---------------------------------------------------------------- 3. the row, and walk strips
await page.setViewportSize({ width: 1800, height: 800 });
await page.evaluate(() => {
  const { inspector } = window.__descent;
  inspector.turntable.parent.parent.visible = false;
  inspector.panel.mesh.visible = false;
  inspector.showGuides = false;
});
const row = await page.evaluate(async () => {
  const { CAST, Wardrobe } = await import('/src/people/cast.ts');
  const { buildCharacter } = await import('/src/models/characters.ts');
  const { createModelMaterial } = await import('/src/models/materials.ts');
  const { IDLE } = await import('/src/enemies/poses.ts');
  const { inspector, camera } = window.__descent;
  const group = new (await import('/node_modules/.vite/deps/three.js')).Group();
  group.name = 'row';
  inspector.root.add(group);
  const heights = [];
  const ids = ['farmer', 'goodwife', 'maid', 'sister', 'friar', 'greybeard', 'granny', 'boy', 'girl', 'shepherd'];
  const rigs = ids.map((id) => {
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
    m.position.set((i - (rigs.length - 1) / 2) * 0.8, 0, -4.5);
    group.add(m);
  });
  camera.fov = 30;
  camera.updateProjectionMatrix();
  camera.position.set(0, 1.1, 3.8);
  camera.lookAt(0, 0.9, -4.5);
  return heights;
});
console.log(`     heights: ${row.join(', ')}`);
if (shots) {
  await frames(page, 3);
  await page.screenshot({ path: `${shots}/00-everyone.png` });
}

// Walk strips: per build, one look at eight moments of a cycle.
const strips = [
  ['farmer', 'average'],
  ['innkeeper', 'stout'],
  ['goodwife', 'woman'],
  ['greybeard', 'elder'],
  ['granny', 'elder woman'],
  ['boy', 'child (boy)'],
  ['girl', 'child (girl, skirt)'],
  ['friar', 'average, robe'],
  ['sister', 'woman, robe'],
];
for (const [id, name] of strips) {
  const slip = await page.evaluate(async (id) => {
    const { CAST, Wardrobe } = await import('/src/people/cast.ts');
    const { BUILDS } = await import('/src/models/human.ts');
    const { createModelMaterial } = await import('/src/models/materials.ts');
    const { walkFrame, walkOver } = await import('/src/people/walk.ts');
    const { friendlyPose } = await import('/src/people/poses.ts');
    const { Vector3 } = await import('/node_modules/.vite/deps/three.js');
    const { inspector, camera } = window.__descent;
    const group = inspector.root.getObjectByName('row');
    group.clear();
    const person = CAST[id];
    const build = BUILDS[person.look.build];
    const N = 8;
    const stride = 2 * build.gait.step;
    // Where the left ankle is on the ground through the stance, for the check.
    const ground = [];
    const v = new Vector3();
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const rig = new Wardrobe().dress(id, createModelMaterial());
      const pose = JSON.parse(JSON.stringify(friendlyPose(person.stand, 0)));
      const hip = walkOver(pose, walkFrame(u, build), 1);
      rig.apply(pose);
      rig.setHipOffset(hip[0], hip[1], hip[2]);
      // Side on, walking to the right of the picture, spread out so each frame stands clear.
      rig.mesh.rotation.y = Math.PI / 2;
      rig.mesh.position.set(-3.2 + i * 0.85 + u * stride, 0, -4.5);
      group.add(rig.mesh);
      rig.mesh.updateMatrixWorld(true);
      const a = v.set(0, -rig.proportions.shin, 0).applyMatrix4(rig.bones.shinL.matrixWorld);
      if (u < 0.5) ground.push((a.x - (-3.2 + i * 0.85)).toFixed(3) + '@' + a.y.toFixed(3));
    }
    camera.fov = 30;
    camera.updateProjectionMatrix();
    camera.position.set(0, 0.9, 3.8);
    camera.lookAt(0, 0.75, -4.5);
    return ground;
  }, id);
  console.log(`     ${name} left ankle (x along the walk @ height), first half: ${slip.join(' ')}`);
  if (shots) {
    await frames(page, 3);
    await page.screenshot({ path: `${shots}/walk-${id}.png` });
  }
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
