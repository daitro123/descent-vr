// Checks for Oakvale's ambience and places' sounds
// (issues/30-oakvales-ambience-and-places-sounds.md) in headless Chromium with
// the IWER emulator. Start `npx vite --port 5173` first, then:
//
//   node .scratch/oakvale-starting-zone/checks/ambience.mjs [http://localhost:5173]
//
// The Adventure at the plain URL, paused, stepped frame by frame in the page
// (with `teleport`). What it checks:
//
// 1. Entering VR unlocks audio, and the wind starts.
// 2. Walking the main road from the crossroads to the bridge at a walk, never
//    more than 8 ambient sounds (places' sounds and bird calls, counting any
//    still fading out) play at once, nor more than 3 by HRTF; and walking
//    back with birds trying to call every few frames, the cap holds at 8.
// 3. At the crossroads the smithy's forge and anvil sound, placed by HRTF,
//    and the smith's hammer rings on the anvil in time with their blows; at
//    the bridge the stream sounds, placed by HRTF, and the smithy has stopped.
// 4. Birds call along the way, from 10 to 30 m off.
// 5. Far from every place (on the southern road), no place sounds.
// 6. Each place's sound plays at its place: the windmill, the dock, the lumber
//    camp's fire and the mine's mouth, standing by each.
//
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};
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

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => {
  const d = window.__descent;
  d.paused = true;
  // Count the smith's blows, and those the anvil rang for.
  const amb = d.adventure.ambience;
  d.rung = 0;
  d.blows = 0;
  const strike = amb.strike.bind(amb);
  d.adventure.villagers.onStrike = () => {
    d.blows++;
    if (amb.sounding.some((s) => s.id === 'anvil')) d.rung++;
    strike('anvil');
  };
});

// 1. Audio unlocked, the wind going.
const unlocked = await page.evaluate(() => {
  window.__descent.step(0.1);
  const { kit } = window.__descent.adventure.ambience;
  return { kit: !!kit, state: kit?.ctx.state };
});
check(unlocked.kit, `entering VR unlocks audio (context ${unlocked.state})`);

/**
 * Walk from (x0, z0) to (x1, z1) at `speed` m/s, a frame at a time, then stand
 * `stay` s: the most ambient sounds playing at once and by HRTF, what sounded
 * where, and each bird's distance as it started calling.
 */
const walk = (x0, z0, x1, z1, speed = 1.4, stay = 0) =>
  page.evaluate(
    ([x0, z0, x1, z1, speed, stay]) => {
      const d = window.__descent;
      const amb = d.adventure.ambience;
      const dt = 1 / 72;
      const len = Math.hypot(x1 - x0, z1 - z0);
      const yaw = Math.atan2(-(x1 - x0), -(z1 - z0));
      const out = { most: 0, hrtf: 0, heard: {}, birds: [], frames: 0 };
      let calling = amb.calling;
      const frames = Math.ceil(len / speed / dt) + Math.ceil(stay / dt);
      for (let f = 0; f <= frames; f++) {
        const t = Math.min(1, (f * dt * speed) / Math.max(len, 1e-6));
        d.teleport(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, yaw);
        d.adventure.update(dt);
        out.frames++;
        out.most = Math.max(out.most, amb.playing);
        const sounding = amb.sounding;
        out.hrtf = Math.max(out.hrtf, sounding.filter((s) => s.hrtf).length);
        for (const s of sounding) out.heard[s.id] = s.hrtf ? 'hrtf' : out.heard[s.id] ?? 'cheap';
        if (amb.calling > calling) {
          const b = amb.birds[amb.birds.length - 1];
          const head = d.adventure.you.head;
          out.birds.push(Math.hypot(b.voice.x - head.x, b.voice.z - head.z));
        }
        calling = amb.calling;
      }
      return out;
    },
    [x0, z0, x1, z1, speed, stay],
  );

const { spawn, bridge, sounds } = await page.evaluate(async () => {
  const { buildLayout } = await import('/src/maps/forest/layout.ts');
  const l = buildLayout();
  return { spawn: l.spawn, bridge: { x: l.bridge.x, z: l.bridge.z }, sounds: l.sounds };
});
const at = (id) => sounds.find((s) => s.id === id);

// 3a. At the crossroads, a while.
const cross = await walk(spawn.x, spawn.z, spawn.x, spawn.z, 1.4, 12);
const blows = await page.evaluate(() => ({ blows: window.__descent.blows, rung: window.__descent.rung }));
check(cross.heard.forge === 'hrtf' && cross.heard.anvil === 'hrtf', `at the crossroads the forge and the anvil sound, placed by HRTF (${JSON.stringify(cross.heard)})`);
check(blows.blows > 3 && blows.rung === blows.blows, `the smith's hammer rings on the anvil with each blow (${blows.rung} of ${blows.blows})`);

// 2. The walk to the bridge (the main road's line, 1.5 m short of the bridge's middle, then onto it).
const road = await walk(spawn.x, spawn.z, bridge.x, bridge.z + 1.5, 1.4, 8);
check(road.most <= 8, `walking from the crossroads to the bridge, at most 8 ambient sounds play at once (most ${road.most} over ${road.frames} frames)`);
check(road.hrtf <= 3, `…and at most 3 by HRTF (most ${road.hrtf})`);
const atBridge = await page.evaluate(() => window.__descent.adventure.ambience.sounding);
check(atBridge.some((s) => s.id === 'stream' && s.hrtf), `on the bridge the stream sounds, placed by HRTF (${JSON.stringify(atBridge)})`);
const smithyGone = !atBridge.some((s) => s.id === 'forge' || s.id === 'anvil');
const smithyFar = Math.hypot(at('forge').x - bridge.x, at('forge').z - bridge.z);
check(smithyGone === smithyFar > 40, `the smithy is ${smithyGone ? 'silent' : 'still sounding'} from the bridge, ${smithyFar.toFixed(1)} m off`);

// 2b. The same walk back with birds trying to call every few frames, so the cap is what holds it at 8.
const busy = await page.evaluate(() => {
  const { birds } = window.__descent.CONFIG.sound;
  const was = birds.every;
  birds.every = [0.02, 0.05];
  return was;
});
const crowded = await walk(bridge.x, bridge.z + 1.5, spawn.x, spawn.z, 1.4, 4);
await page.evaluate((was) => (window.__descent.CONFIG.sound.birds.every = was), busy);
check(crowded.most === 8, `with a bird trying to call every few frames, still never more than 8 at once (most ${crowded.most}, ${crowded.birds.length} calls)`);
check(crowded.hrtf <= 3, `…and never more than 3 by HRTF (most ${crowded.hrtf})`);

// 4. Birds, from 10 to 30 m.
const birds = [...cross.birds, ...road.birds];
check(birds.length >= 3, `birds call along the way (${birds.length} calls)`);
check(birds.every((d) => d >= 10 - 1.5 && d <= 30 + 1.5), `each from 10 to 30 m off (${birds.map((d) => d.toFixed(0)).join(', ')} m)`);

// 5. Far from every place: on the southern road, over 40 m from each.
const south = { x: 1, z: 60 };
const nearest = Math.min(...sounds.map((s) => Math.hypot(s.x - south.x, s.z - south.z)));
await walk(south.x, south.z, south.x, south.z, 1.4, 3);
const quiet = await page.evaluate(() => window.__descent.adventure.ambience.sounding);
check(nearest > 40 && quiet.length === 0, `on the southern road, ${nearest.toFixed(1)} m from the nearest place, no place sounds (${JSON.stringify(quiet)})`);

// 6. Each other place, standing by it.
for (const [id, dx, dz] of [['windmill', 6, 6], ['dock', -2, 0], ['campfire', 3, 3], ['mineMouth', 0, 8]]) {
  const p = at(id);
  await walk(p.x + dx, p.z + dz, p.x + dx, p.z + dz, 1.4, 1);
  const now = await page.evaluate(() => window.__descent.adventure.ambience.sounding);
  check(now.some((s) => s.id === id && s.hrtf), `by the ${id}, it sounds, placed by HRTF (${JSON.stringify(now.map((s) => s.id))})`);
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
if (failed) {
  console.log(`${failed} FAILED`);
  process.exit(1);
}
console.log('all passed');
