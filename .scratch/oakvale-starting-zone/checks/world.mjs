// Checks for the World (issues/14-the-world-shared-light-sky-fog-and-ground.md)
// in headless Chromium, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/oakvale-starting-zone/checks/world.mjs [http://localhost:5173]
//
// 1. Shader programs after loading Oakvale at ?map=forest, on the page and in
//    VR with the IWER emulator, and at ?fly=forest after visiting every spot
//    (the overview turns the fog off). Before the World (main at 44dc7f9)
//    they were 5, 5 and 7; with it, 5, 5 and 5.
// 2. Radial fog: the same spot of the valley, seen straight ahead and then
//    near the edge of view without moving, keeps its colour. With the old
//    depth fog it cleared towards the edge (by 32 of 255 at 44dc7f9; now 1).
//
// Playwright is the global install; Chromium is the pre-installed one.

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on('pageerror', (e) => console.log('page error:', e.message));

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
const programs = () => page.evaluate(() => window.__descent.renderer.info.programs.length);

// 1a. ?map=forest on the page.
await page.goto(`${base}/?map=forest&noemulate`);
await page.waitForFunction(() => window.__descent?.map, null, { timeout: 120000 });
await frames(5);
console.log(`?map=forest programs: ${await programs()}`);

// 2. Radial fog: from 30 m over the crossroads, a spot of the valley about
// 120 m away (whatever is there, ground or treetops: turning the head without
// moving still sees the same surface along that ray).
const fog = await page.evaluate(() => {
  const { walker, camera, renderer } = window.__descent;
  const ground = window.__descent.world ?? window.__descent.map;
  const scene = walker.rig.parent;
  const gl = renderer.getContext();
  const eye = { x: 0, z: 0 };
  const target = { x: -70, z: -85 };
  walker.hover = 30;
  walker.teleport(eye.x, eye.z, 0);
  const ty = ground.heightAt(target.x, target.z);
  const sample = (offYaw) => {
    const dx = target.x - eye.x;
    const dz = target.z - eye.z;
    walker.yaw = Math.atan2(-dx, -dz) + offYaw;
    const ey = walker.rig.position.y + 1.6;
    walker.pitch = Math.atan2(ty - ey, Math.hypot(dx, dz));
    walker.update(0);
    walker.rig.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const p = camera.position.clone().set(target.x, ty, target.z).project(camera);
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    const px = Math.round(((p.x + 1) / 2) * w);
    const py = Math.round(((p.y + 1) / 2) * h);
    renderer.render(scene, camera);
    const rgb = new Uint8Array(4);
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgb);
    return { px, py, rgb: [...rgb.slice(0, 3)] };
  };
  const centre = sample(0);
  const edge = sample(0.7); // turned about 40° away: the hill sits near the side of the view
  const distance = Math.hypot(target.x - eye.x, ty - walker.rig.position.y - 1.6, target.z - eye.z);
  return { centre, edge, distance };
});
const drift = Math.max(...fog.centre.rgb.map((c, i) => Math.abs(c - fog.edge.rgb[i])));
console.log(
  `radial fog: a spot ${fog.distance.toFixed(0)} m away is rgb(${fog.centre.rgb}) ahead (pixel ${fog.centre.px},${fog.centre.py})` +
    ` and rgb(${fog.edge.rgb}) near the edge of view (pixel ${fog.edge.px},${fog.edge.py}): ${drift <= 6 ? 'same' : `drifts by ${drift}`}`,
);

// 1b. ?map=forest in VR (IWER emulator).
await page.goto(`${base}/?map=forest&emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.map, null, { timeout: 120000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await page.evaluate(
  () =>
    new Promise((done) => {
      const session = window.__descent.renderer.xr.getSession();
      let k = 0;
      const step = () => (++k >= 4 ? done() : session.requestAnimationFrame(step));
      session.requestAnimationFrame(step);
    }),
);
console.log(`?map=forest in VR programs: ${await programs()}`);

// 1c. ?fly=forest, every viewer spot.
await page.goto(`${base}/?fly=forest&noemulate`);
await page.waitForFunction(() => window.__descent?.viewer?.map, null, { timeout: 120000 });
await frames(3);
const spots = await page.evaluate(() => window.__descent.viewer.spots.length);
for (let i = 0; i < spots; i++) {
  await page.evaluate((i) => window.__descent.viewer.goTo(i), i);
  await frames(2);
}
console.log(`?fly=forest programs after every spot: ${await programs()}`);

await browser.close();
