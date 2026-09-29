// Checks for the human body (issues/20-the-human-body.md) in headless Chromium
// with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/oakvale-starting-zone/checks/people.mjs [http://localhost:5173] [shots/]
//
// 1. The model inspector (`?inspect`) lists Hale, the villagers, six thugs,
//    the archer and the leader. Each plays every one of its animations (the
//    bandits' behaviour's, bar rising from the ground; Hale's stand and wave;
//    the villagers' stand and work) with every bone in place, and each is one body under
//    900 triangles. Screenshots of each, and of everyone in a row beside two
//    skeletons.
// 2. In the Adventure, Hale at the crossroads is the real Hale (the human
//    body, their sword at the hip), seen from the start and at talk distance.
// 3. The farm's camp is four bandit thugs standing at their posts from the
//    start, one body each under 900 triangles, with nothing over their heads
//    but a health bar (and that only once hurt). Pulled, one winds up a blow;
//    killed, it topples whole.
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
function watch(page) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
}
const frames = (page, n) =>
  page.evaluate((n) => new Promise((done) => {
    let k = 0;
    const next = () => (++k >= n ? done() : requestAnimationFrame(next));
    requestAnimationFrame(next);
  }), n);

// ---------------------------------------------------------------- 1. the inspector

const HUMANS = ['Bandit thug v0', 'Bandit thug v1', 'Bandit thug v2', 'Bandit thug v3', 'Bandit thug v4', 'Bandit thug v5', 'Bandit archer', 'Bandit leader', 'Marshal Hale', 'Innkeeper', 'Smith', 'Farmer'];
{
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
  watch(page);
  await page.goto(`${base}/?inspect&noemulate`);
  await page.waitForFunction(() => window.__descent?.inspector, null, { timeout: 120000 });
  const labels = await page.evaluate(async () => (await import('/src/inspector/inspector.ts')).ENTRIES.map((e) => e.label));
  check(HUMANS.every((h) => labels.includes(h)), `the inspector lists every human character (${labels.slice(9).join(', ')})`);

  const want = await page.evaluate(async () => {
    const { CONFIG } = await import('/src/config.ts');
    return Object.fromEntries(['grunt', 'archer', 'brute'].map((k) => [k, [...new Set(CONFIG.enemies[k].attacks.map((a) => a.pose))]]));
  });
  const behaviour = { thug: 'grunt', archer: 'archer', leader: 'brute' };
  for (const label of HUMANS) {
    const r = await page.evaluate(
      async (label) => {
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
        return { clips: b.clips.map((c) => c.name), triangles: b.rig.triangles, placed, meshes: b.rig.mesh.isSkinnedMesh };
      },
      label,
    );
    const kind = Object.entries(behaviour).find(([k]) => label.toLowerCase().includes(k))?.[1];
    const clipsOk = kind
      ? ['idle', 'walk', ...want[kind], 'stagger'].every((c) => r.clips.includes(c)) && !r.clips.includes('rise')
      : JSON.stringify(r.clips) === JSON.stringify(label === 'Marshal Hale' ? ['stand', 'wave'] : ['stand', 'work']);
    check(clipsOk && r.placed, `${label} plays all ${r.clips.length} animations, every bone in place (${r.clips.join(', ')})`);
    check(r.meshes && r.triangles < 900, `${label} is one body of ${r.triangles} triangles`);
  }

  // Close-ups: each character on the plinth, turned a little towards you.
  const pose = (label, clip, at, turn = 0.45) =>
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
        const top = b.rig.proportions.hipY + b.rig.proportions.neck + 0.3;
        camera.position.set(0, top * 0.55, -1.8 + top * 1.05);
        camera.lookAt(0, top * 0.5, -1.8);
      },
      [label, clip, at, turn],
    );
  const closeUps = [
    ['01-hale', 'Marshal Hale', 'stand', 0],
    ['02-hale-waving', 'Marshal Hale', 'wave', 0.35],
    ['03-innkeeper', 'Innkeeper', 'stand', 0],
    ['04-smith', 'Smith', 'stand', 0],
    ['05-farmer', 'Farmer', 'stand', 0],
    ['06-thug-v0', 'Bandit thug v0', 'idle', 0],
    ['07-thug-v1-chop', 'Bandit thug v1', 'chop', 0.42],
    ['09-archer-draw', 'Bandit archer', 'draw', 0.5],
    ['10-leader-slam', 'Bandit leader', 'slam', 0.42],
  ];
  if (shots) {
    for (const [name, label, clip, at] of closeUps) {
      await pose(label, clip, at);
      await frames(page, 3);
      await page.screenshot({ path: `${shots}/${name}.png` });
    }
    // A thug from behind: the kerchief's knot and the sash.
    await pose('Bandit thug v3', 'idle', 0, Math.PI - 0.5);
    await frames(page, 3);
    await page.screenshot({ path: `${shots}/08-thug-v3-from-behind.png` });
  }

  // Everyone in a row, with a skeleton grunt and archer for scale.
  await page.setViewportSize({ width: 1800, height: 800 });
  const row = await page.evaluate(async () => {
    const { buildPerson, PEOPLE } = await import('/src/models/people.ts');
    const { buildCharacter } = await import('/src/models/characters.ts');
    const { createModelMaterial } = await import('/src/models/materials.ts');
    const { IDLE } = await import('/src/enemies/poses.ts');
    const { inspector, camera } = window.__descent;
    inspector.turntable.parent.parent.visible = false;
    inspector.panel.mesh.visible = false;
    inspector.showGuides = false;
    const row = [];
    const add = (rig, pose) => {
      rig.apply(pose);
      row.push(rig.mesh);
      inspector.root.add(rig.mesh);
      return rig.triangles;
    };
    const tris = [];
    for (const id of ['hale', 'innkeeper', 'smith', 'farmer']) tris.push(add(buildPerson(id, createModelMaterial()), PEOPLE[id].stand));
    for (const v of [0, 1, 2]) tris.push(add(buildCharacter('grunt', { family: 'bandit', variant: v, material: createModelMaterial() }).rig, IDLE.grunt));
    tris.push(add(buildCharacter('archer', { family: 'bandit', material: createModelMaterial() }).rig, IDLE.archer));
    tris.push(add(buildCharacter('brute', { family: 'bandit', material: createModelMaterial() }).rig, IDLE.brute));
    add(buildCharacter('grunt', { material: createModelMaterial() }).rig, IDLE.grunt);
    add(buildCharacter('archer', { material: createModelMaterial() }).rig, IDLE.archer);
    row.forEach((m, i) => m.position.set((i - (row.length - 1) / 2) * 0.85, 0, -4.5));
    // A long lens from well back, so the row isn't bent at its ends.
    camera.fov = 30;
    camera.updateProjectionMatrix();
    camera.position.set(0, 1.1, 3.8);
    camera.lookAt(0, 0.95, -4.5);
    return tris;
  });
  check(row.every((t) => t < 900), `in a row, every human is under 900 triangles (${row.join(', ')})`);
  if (shots) {
    await frames(page, 3);
    await page.screenshot({ path: `${shots}/00-everyone.png` });
  }
  await page.close();
}

// ---------------------------------------------------------------- 2 and 3. the Adventure

const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
watch(page);
const shot = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });
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
/** Stand at (x, z) facing the point (tx, tz), then let an XR frame bring the head there. */
async function standFacing(x, z, tx, tz) {
  await page.evaluate(([x, z, tx, tz]) => window.__descent.teleport(x, z, Math.atan2(-(tx - x), -(tz - z))), [x, z, tx, tz]);
  await xrFrames(2);
  await step(1 / 72);
}
const farm = () =>
  page.evaluate(() => {
    const { camps, world } = window.__descent;
    const camp = camps.camps.find((c) => c.plan.id === 'farm');
    return camp.members.map((m) => {
      const e = m.enemy;
      const hips = e.rig.bones.hips.getWorldPosition(e.position.clone());
      return {
        family: e.family,
        state: e.state,
        mind: m.mind,
        hittable: e.hittable,
        triangles: e.rig.triangles,
        hipsUp: hips.y - world.heightAt(e.position.x, e.position.z),
        overHead: e.healthBar.root.children.length,
        barShown: e.healthBar.root.visible,
        x: e.position.x,
        z: e.position.z,
      };
    });
  });

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => {
  const { device } = window.__descent;
  window.__descent.paused = true;
  // Arms at your sides, so the shield and the sword don't fill the screenshots.
  device.controllers.left.position.set(-0.4, 0.3, 0.2);
  device.controllers.right.position.set(0.4, 0.3, 0.2);
});
await xrFrames(2);

// 3 (first): the farm's thugs are there from the very first frame.
{
  const ms = await farm();
  check(ms.length === 4 && ms.every((m) => m.family === 'bandit'), `the farm's camp is four bandits (${ms.map((m) => m.family).join(', ')})`);
  check(
    ms.every((m) => m.state !== 'rising' && m.hittable && m.hipsUp > 0.8),
    `standing at their posts from the start, not rising from the ground (${ms.map((m) => `${m.state}, hips ${m.hipsUp.toFixed(2)} m up`).join('; ')})`,
  );
  check(ms.every((m) => m.triangles < 900), `each one body under 900 triangles (${ms.map((m) => m.triangles).join(', ')})`);
  check(ms.every((m) => m.overHead === 1 && !m.barShown), `nothing over their heads but a health bar, hidden until hurt (${ms.map((m) => `${m.overHead} part, shown ${m.barShown}`).join('; ')})`);
}
await step(2);

// 2. Hale.
{
  const h = await page.evaluate(() => {
    const { hale } = window.__descent.adventure;
    const mesh = hale.root.children.find((c) => c.isSkinnedMesh);
    return { triangles: mesh.geometry.getAttribute('position').count / 3, hipY: mesh.skeleton.getBoneByName('hips').position.y };
  });
  check(h.triangles < 900 && Math.abs(h.hipY - 0.95) < 0.001, `Hale is the human body in the average build (${h.triangles} triangles, hips at ${h.hipY} m)`);
  await xrFrames(2);
  await shot('11-hale-from-the-start');
  const spot = await page.evaluate(() => {
    const { hale } = window.__descent.adventure;
    return { x: hale.position.x, z: hale.position.z };
  });
  // At talk distance, a little to their left so the board opens clear of their face.
  await standFacing(spot.x - 1.6, spot.z - 0.9, spot.x, spot.z);
  await step(1.2);
  await xrFrames(2);
  await shot('12-hale-at-talk-distance');
}

// 3. At the farm.
{
  const posts = await page.evaluate(() => window.__descent.camps.camps.find((c) => c.plan.id === 'farm').members.map((m) => m.post));
  const [a1] = posts;
  await standFacing(50, 30, a1.x, a1.z);
  await step(0.3);
  await xrFrames(2);
  await shot('13-farm-thugs-from-the-road');

  // Walk into the first pair and wait for a blow.
  await standFacing(a1.x - 5.5, a1.z - 2, a1.x, a1.z);
  let winding = null;
  for (let i = 0; i < 80 && !winding; i++) {
    await step(0.1);
    winding = await page.evaluate(() => {
      const { camps } = window.__descent;
      const m = camps.camps.find((c) => c.plan.id === 'farm').members.find((m) => m.enemy.attacking && m.enemy.phase === 'windup' && m.enemy.phaseTime > 0.3);
      return m ? { x: m.enemy.position.x, z: m.enemy.position.z, pose: m.enemy.attack.pose } : null;
    });
  }
  check(winding !== null, `pulled, a thug winds up a blow (${winding?.pose})`);
  if (winding) {
    await xrFrames(2);
    await shot('14-a-thug-winds-up');
  }

  const fell = await page.evaluate(async () => {
    const { camps, step } = window.__descent;
    const m = camps.camps.find((c) => c.plan.id === 'farm').members.find((m) => m.mind === 'fight');
    const e = m.enemy;
    const gap = () => e.rig.bones.head.getWorldPosition(e.position.clone()).distanceTo(e.rig.bones.hips.getWorldPosition(e.position.clone()));
    const before = gap();
    e.takeHit(10000, e.position.clone().set(0, 0, 1));
    step(0.5);
    return { before, after: gap(), alive: e.alive };
  });
  check(!fell.alive && Math.abs(fell.after - fell.before) < 0.01, `killed, a thug topples whole (head to hips ${fell.before.toFixed(2)} m, then ${fell.after.toFixed(2)} m)`);
  await xrFrames(2);
  await shot('15-a-thug-falls');
}

check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`);
await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
