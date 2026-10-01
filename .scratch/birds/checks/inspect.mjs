// Screenshots of every bird in the model inspector (`?inspect`): each look
// standing, turned a little toward you, and caught mid-clip. Start
// `npx vite --port 5173` first, then:
//
//   node .scratch/birds/checks/inspect.mjs [http://localhost:5173] [shots/] [look,...] [clip,...]
//
import { mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const shots = process.argv[3] ?? 'shots';
const only = process.argv[4] ? process.argv[4].split(',') : null;
const clips = process.argv[5] ? process.argv[5].split(',') : ['stand'];
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
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
const looks = await page.evaluate(async () => (await import('/src/inspector/inspector.ts')).ENTRIES.filter((e) => 'bird' in e).map((e) => e.bird));
for (const look of looks) {
  if (only && !only.includes(look)) continue;
  for (const clip of clips) {
    const [name, at, turn] = clip.split(':');
    const ok = await page.evaluate(
      async ([look, name, at, turn]) => {
        const { ENTRIES } = await import('/src/inspector/inspector.ts');
        const { inspector, camera } = window.__descent;
        inspector.show(ENTRIES.findIndex((e) => e.bird === look));
        const b = inspector.current;
        const c = b.clips.findIndex((c) => c.name === name);
        if (c < 0) return false;
        inspector.playClip(c);
        inspector.playing = false;
        inspector.time = Number(at ?? 0.3) * b.clips[c].duration;
        inspector.reset();
        inspector.turntable.rotation.y = Number(turn ?? 0.6);
        inspector.showGuides = false;
        inspector.panel.mesh.visible = false;
        inspector.update(0);
        // Framed on the bird, wherever its clip has it: its posed vertices' box.
        const mesh = b.mesh;
        mesh.updateMatrixWorld(true);
        const pos = mesh.geometry.getAttribute('position');
        const skin = mesh.geometry.getAttribute('skinIndex');
        const m = mesh.skeleton.boneMatrices;
        const lo = [Infinity, Infinity, Infinity];
        const hi = [-Infinity, -Infinity, -Infinity];
        const e = mesh.matrixWorld.elements;
        for (let v = 0; v < pos.count; v++) {
          const t = skin.getX(v) * 16;
          const [x, y, z] = [pos.getX(v), pos.getY(v), pos.getZ(v)];
          const p = [m[t] * x + m[t + 4] * y + m[t + 8] * z + m[t + 12], m[t + 1] * x + m[t + 5] * y + m[t + 9] * z + m[t + 13], m[t + 2] * x + m[t + 6] * y + m[t + 10] * z + m[t + 14]];
          const w = [e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12], e[1] * p[0] + e[5] * p[1] + e[9] * p[2] + e[13], e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14]];
          for (let k = 0; k < 3; k++) {
            lo[k] = Math.min(lo[k], w[k]);
            hi[k] = Math.max(hi[k], w[k]);
          }
        }
        const mid = lo.map((l, k) => (l + hi[k]) / 2);
        const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
        const d = size * 1.25 + 0.3;
        camera.position.set(mid[0], mid[1] + d * 0.25, mid[2] + d);
        camera.lookAt(mid[0], mid[1], mid[2]);
        return true;
      },
      [look, name, at, turn],
    );
    if (!ok) continue;
    await frames(3);
    await page.screenshot({ path: `${shots}/${look}-${name.replace(' ', '-')}.png` });
  }
}
console.log(errors.length ? `errors: ${errors.join('\n')}` : 'no errors');
await browser.close();
