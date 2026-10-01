// A close look at one character in the model inspector (`?inspect`):
//
//   node .scratch/sallows-enemies/checks/closeup.mjs <base> <out.png> <label> [clip] [at] [turn] [height] [distance]
//
// The camera stands `distance` m off (default 1.2), looking at `height` m up
// the body (default its head), with the character turned `turn` rad.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const [base, out, label, clip = 'idle', at = '0', turn = '0.45', height = '', distance = '1.2'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 700, height: 700 } });
await page.goto(`${base}/?inspect&noemulate`);
await page.waitForFunction(() => window.__descent?.inspector, null, { timeout: 120000 });
const ok = await page.evaluate(
  async ([label, clip, at, turn, height, distance]) => {
    const { ENTRIES } = await import('/src/inspector/inspector.ts');
    const { inspector, camera } = window.__descent;
    const i = ENTRIES.findIndex((e) => e.label === label);
    if (i < 0) return false;
    inspector.show(i);
    const b = inspector.current;
    inspector.playClip(Math.max(0, b.clips.findIndex((c) => c.name === clip)));
    inspector.playing = false;
    inspector.time = at * b.clips[inspector.clip].duration;
    inspector.reset();
    inspector.turntable.rotation.y = turn;
    inspector.showGuides = false;
    inspector.update(0);
    inspector.panel.mesh.visible = false;
    const p = b.rig.proportions;
    const y = height === '' ? p.hipY + p.neck + 0.1 : Number(height);
    camera.position.set(0, y + distance * 0.15, -1.8 + distance);
    camera.lookAt(0, y, -1.8);
    return true;
  },
  [label, clip, Number(at), Number(turn), height, Number(distance)],
);
if (!ok) console.log(`no ${label}`);
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
await page.screenshot({ path: out });
await browser.close();
