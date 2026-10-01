// Screenshots of model viewer entries at one moment of their clips, on the
// turntable. Start `npx vite --port 5173` first, then:
//
//   node .scratch/quadruped/checks/inspect.mjs <out dir> <label filter> [clips] [turn] [zoom] [at]
//
// <label filter> picks entries whose label contains it (comma list: 'Moor ewe,Wolf');
// [clips] is a comma list of clip names; [turn] the turntable's angle (rad),
// [zoom] its scale and [at] how far into each clip (0 to 1).
import { mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const out = process.argv[2];
const filter = process.argv[3] ?? '';
const clipNames = (process.argv[4] ?? 'stand').split(',');
const turn = Number(process.argv[5] ?? 0.9);
const zoom = Number(process.argv[6] ?? 1);
const at = Number(process.argv[7] ?? 0.3);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${process.env.BASE ?? 'http://localhost:5173'}/?inspect&noemulate`);
await page.waitForFunction(() => window.__descent?.inspector, null, { timeout: 120000 });
const labels = await page.evaluate(async () => (await import('/src/inspector/inspector.ts')).ENTRIES.map((e) => e.label));
for (const label of labels.filter((l) => filter.split(',').some((f) => l.includes(f)))) {
  for (const clip of clipNames) {
    const info = await page.evaluate(async ({ label, clip, turn, zoom, at }) => {
      const { ENTRIES } = await import('/src/inspector/inspector.ts');
      const { inspector, camera } = window.__descent;
      inspector.show(ENTRIES.findIndex((e) => e.label === label));
      const b = inspector.current;
      const c = b.clips.findIndex((x) => x.name === clip);
      if (c < 0) return null;
      inspector.playClip(c);
      inspector.playing = false;
      inspector.time = b.clips[c].duration * at;
      inspector.turntable.rotation.y = turn;
      inspector.scaled.scale.setScalar(zoom);
      inspector.showGuides = true;
      inspector.update(0);
      return { tris: b.triangles };
    }, { label, clip, turn, zoom, at });
    if (!info) continue;
    await page.waitForTimeout(150);
    const file = `${out}/${label.replace(/\W+/g, '-').toLowerCase()}-${clip.replace(/\W+/g, '-')}.png`;
    await page.screenshot({ path: file });
    console.log(file, info.tris);
  }
}
await browser.close();
