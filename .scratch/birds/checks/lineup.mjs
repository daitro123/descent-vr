// Every bird beside a man, for scale: the model inspector (`?inspect`) with a
// villager on the turntable and a flock of every look standing in a row
// beside him on the plinth (one mesh, as in the zones). Start
// `npx vite --port 5173` first, then:
//
//   node .scratch/birds/checks/lineup.mjs [http://localhost:5173] [shots/]
//
import { mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const shots = process.argv[3] ?? 'shots';
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const frames = (n) =>
  page.evaluate((n) => new Promise((done) => {
    let k = 0;
    const next = () => (++k >= n ? done() : requestAnimationFrame(next));
    requestAnimationFrame(next);
  }), n);

await page.goto(`${base}/?inspect&noemulate`);
await page.waitForFunction(() => window.__descent?.inspector, null, { timeout: 120000 });
for (const [name, row, at] of [
  ['lineup-water', ['heron', 'egret', 'bittern', 'curlew', 'swan', 'goose', 'mallard', 'mallardDuck'], [1.35, 0.8, 1.15]],
  ['lineup-land', ['gull', 'gullYoung', 'raven', 'crow', 'pigeon', 'cock', 'hen', 'henWhite', 'henBlack', 'henSpeckled', 'grouse'], [1.25, 0.75, 1.05]],
]) {
  await page.evaluate(async ([row, at]) => {
    const { ENTRIES } = await import('/src/inspector/inspector.ts');
    const { FlockMesh } = await import('/src/birds/flock.ts');
    const { Bird } = await import('/src/birds/mover.ts');
    const { BIRD_LOOKS } = await import('/src/models/bird.ts');
    const { inspector, camera } = window.__descent;
    inspector.show(ENTRIES.findIndex((e) => e.person === 'farmer'));
    inspector.playing = false;
    inspector.time = 0;
    inspector.reset();
    inspector.showGuides = false;
    inspector.panel.mesh.visible = false;
    inspector.update(0);
    window.__lineup?.dispose();
    const material = inspector.current.mesh.material;
    const flock = new FlockMesh(row, Array.isArray(material) ? material[0] : material);
    flock.mesh.matrixAutoUpdate = true;
    flock.mesh.frustumCulled = false;
    const floor = { heightAt: () => 0, waterAt: () => NaN };
    let x = 0.3;
    row.forEach((look, i) => {
      const body = BIRD_LOOKS[look].body;
      // Room for its body and its bill and tail, side on.
      const half = Math.max(0.09, (body.breast.z - body.rump.z + body.tail[0] + body.beak[0] + body.head[2]) * 0.42);
      x += half;
      const b = new Bird(look, 1, 7 + i);
      b.standAt(x, 0.2, 1.15, floor);
      b.update(1 / 72, floor);
      flock.pose(i, b.at, b.pose);
      x += half;
    });
    flock.commit();
    inspector.turntable.add(flock.mesh);
    inspector.turntable.rotation.y = 0;
    window.__lineup = flock;
    const [cx, cy, d] = at;
    camera.position.set(cx, cy + 0.15, -1.8 + d * 2.2);
    camera.lookAt(cx, cy - 0.2, -1.8);
  }, [row, at]);
  await frames(4);
  await page.screenshot({ path: `${shots}/${name}.png` });
}
console.log(errors.length ? `errors: ${errors.join('\n')}` : 'no errors');
await browser.close();
