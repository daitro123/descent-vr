// Wolves fighting in the game, at walking height, in headless Chromium with the
// IWER emulator. Start `npx vite --port 5173` first, then:
//
//   node .scratch/quadruped/checks/wolves.mjs [http://localhost:5173] [shots/]
//
// The Adventure at the plain URL, paused, stepped by `__descent.step` (and
// `teleport`). No zone places wolves yet (Brackenmoor's wolf camps wait on its
// placement thread and its respawn points), so a pack of three is put on the
// open moor by hand, as a camp. What it checks, and shoots:
//
// 1. The pack at its posts, on the ground.
// 2. Walking in: they come for you, taking turns, and spring at you from a
//    few metres out (shot from where you stand and from beside it, mid-air)
//    and snap at your legs up close (from beside). They hurt.
// 3. One struck dead rolls onto its side.
//
import { mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const shots = process.argv[3];
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
const step = (s, dt = 1 / 72) => page.evaluate(([s, dt]) => window.__descent.step(s, dt), [s, dt]);
const shot = async (name) => {
  if (!shots) return;
  await xrFrames(2);
  await page.screenshot({ path: `${shots}/${name}.png` });
};
const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
/** Stand at (x, z) looking towards (tx, tz), head level, and let the chunks round you come in. */
const standLooking = async (x, z, tx, tz, settle = 0.5) => {
  await page.evaluate(([x, z, yaw]) => {
    const d = window.__descent;
    d.teleport(x, z, yaw);
    Object.assign(d.device.quaternion, { x: 0, y: 0, z: 0, w: 1 });
  }, [x, z, yawTo(x, z, tx, tz)]);
  await step(settle);
  for (let i = 0; i < 600; i++) {
    const pending = await page.evaluate(() => window.__descent.world.chunksPending + window.__descent.world.neighboursPending);
    if (pending === 0) break;
    await step(1 / 72);
    await xrFrames(1);
  }
  await xrFrames(3);
};
/** Look from (x, z), at walking height, straight at (tx, ty, tz), without moving the game on. */
const lookAt = async (x, z, tx, ty, tz) => {
  await page.evaluate(
    ([x, z, tx, ty, tz, yaw]) => {
      const d = window.__descent;
      d.teleport(x, z, yaw);
      const eye = d.player.rig.position.y + d.device.position.y;
      const pitch = -Math.atan2(eye - ty, Math.hypot(tx - x, tz - z));
      Object.assign(d.device.quaternion, { x: Math.sin(pitch / 2), y: 0, z: 0, w: Math.cos(pitch / 2) });
    },
    [x, z, tx, ty, tz, yawTo(x, z, tx, tz)],
  );
  await xrFrames(3);
};
/** Where you stand. */
const feet = () =>
  page.evaluate(() => {
    const p = window.__descent.player.rig.position;
    return { x: p.x, z: p.z, yaw: window.__descent.player.rig.rotation.y };
  });
/** The wolves raised: where, how they stand and what they're doing. */
const wolves = () =>
  page.evaluate(() => {
    const d = window.__descent;
    return d.camps.enemies
      .filter((e) => e.family === 'wolf')
      .map((e, i) => ({
        i,
        x: e.position.x,
        y: e.position.y,
        z: e.position.z,
        yaw: e.root.rotation.y,
        state: e.state,
        attack: e.attack?.pose,
        phase: e.phase,
        ground: d.world.heightAt(e.position.x, e.position.z),
        hips: e.rig.bones.hips.getWorldPosition(new e.position.constructor()).y - e.position.y,
      }));
  });

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 180000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => {
  const d = window.__descent;
  d.paused = true;
  // A narrower view than the headset's, for the screenshots, at its height.
  d.device.fovy = (60 * Math.PI) / 180;
  // Hands lowered out of view, for the screenshots.
  Object.assign(d.device.controllers.left.position, { x: -0.3, y: -1, z: 0.2 });
  Object.assign(d.device.controllers.right.position, { x: 0.3, y: -1, z: 0.2 });
});

// 1. A pack of three on the open moor north of Cairnford.
const PACK = [60, 215];
await standLooking(PACK[0] - 22, PACK[1] - 14, ...PACK, 1);
await step(6, 1 / 30); // the zone's name floats up and away
await page.evaluate(([x, z]) => {
  const d = window.__descent;
  const post = (dx, dz, yaw, variant) => ({ behaviour: 'grunt', family: 'wolf', x: x + dx, z: z + dz, yaw, variant });
  d.camps.add([{ id: 'brackenmoor-check-wolves', place: { x, z, r: 6 }, level: 3, posts: [post(0, 0, -2.4, 0), post(2.2, 1.4, -2.0, 1), post(-1.6, 2.4, -2.8, 2)] }], d.world, true);
}, PACK);
await standLooking(PACK[0] - 11, PACK[1] - 5.5, ...PACK, 0.3);
let pack = await wolves();
check(pack.length === 3, `three wolves raised (${pack.length})`);
for (const w of pack) check(Math.abs(w.y - w.ground) < 0.05 && w.hips > 0.4, `a wolf on its feet on the ground (feet ${(w.y - w.ground).toFixed(2)} m, hips ${w.hips.toFixed(2)} m up)`);
await lookAt(PACK[0] - 8, PACK[1] - 4, PACK[0], 0.4 + pack[0].y, PACK[1] + 1);
await shot('01-pack');

// 2. Walk in: they come for you.
await standLooking(PACK[0] - 6, PACK[1] - 3, ...PACK, 0.1);
const start = await page.evaluate(() => window.__descent.player.maxHp);
let lost = 0;
const blows = new Set();
const shotFrom = async (name, w, side) => {
  // From where you stand, then from `side` m off to its right, and back: the game doesn't move on.
  const me = await feet();
  await lookAt(me.x, me.z, w.x, w.y + 0.45, w.z);
  await shot(`${name}`);
  const rx = Math.cos(w.yaw) * side;
  const rz = -Math.sin(w.yaw) * side;
  await lookAt(w.x + rx, w.z + rz, w.x, w.y + 0.45, w.z);
  await shot(`${name}-side`);
  await page.evaluate(([x, z, yaw]) => {
    const d = window.__descent;
    d.teleport(x, z, yaw);
    Object.assign(d.device.quaternion, { x: 0, y: 0, z: 0, w: 1 });
  }, [me.x, me.z, me.yaw]);
};
let sprung = null;
let bit = null;
let off = Infinity;
/** Step the game `s` s, then the wolves as they are, healing whatever they've done to you and saying how much. */
const fight = (s) =>
  page.evaluate(
    ([s, start]) => {
      const d = window.__descent;
      d.step(s, 1 / 72);
      const lost = Math.max(0, start - d.player.hp);
      d.player.hp = d.player.maxHp;
      const wolves = d.camps.enemies
        .filter((e) => e.family === 'wolf')
        .map((e, i) => ({ i, x: e.position.x, y: e.position.y, z: e.position.z, state: e.state, attack: e.attack?.pose, phase: e.phase, ground: d.world.heightAt(e.position.x, e.position.z) }));
      return { lost, wolves };
    },
    [s, start],
  );
for (let i = 0; i < 900 && !(sprung && bit); i++) {
  const { lost: l, wolves: now } = await fight(1 / 24);
  lost += l;
  for (const w of now) {
    if (w.state === 'attack' && !blows.has(w.attack)) console.log(`     ${(i / 24).toFixed(1)} s: a ${w.attack}`);
    if (w.state === 'attack') blows.add(w.attack);
    if (Math.abs(w.y - w.ground) > 0.05) off = Math.min(off, i);
  }
  const s = !sprung && now.find((w) => w.state === 'attack' && w.attack === 'lunge' && w.phase === 'active');
  if (s) {
    // Mid-air: half way through its spring.
    await step(0.1, 1 / 72);
    const [w] = (await wolves()).filter((x) => x.i === s.i);
    sprung = { lift: w.hips - pack[0].hips };
    await shotFrom('02-spring', w, 3.2);
  }
  const b = !bit && now.find((w) => w.state === 'attack' && w.attack === 'bite' && w.phase === 'active');
  if (b) {
    await step(0.05, 1 / 72);
    const [w] = (await wolves()).filter((x) => x.i === b.i);
    bit = true;
    await shotFrom('03-bite', w, 2.4);
  }
}
check(blows.size > 0, `the wolves came for you (${[...blows].join(', ')})`);
check(!!sprung, `a wolf sprang at you${sprung ? `, up off the ground (${sprung.lift.toFixed(2)} m)` : ''}`);
check(sprung && sprung.lift > 0.1, 'and its spring lifted it');
check(!!bit, 'a wolf snapped at you up close');
check(lost > 0, `and they hurt (${lost} health)`);
check(off === Infinity, 'their feet stayed on the ground as they moved');

// 3. One struck dead.
const dead = await page.evaluate(() => {
  const d = window.__descent;
  const e = d.camps.enemies.find((e) => e.family === 'wolf' && e.alive);
  e.takeHit(999, new e.position.constructor(0, 0, 1));
  return { x: e.position.x, y: e.position.y, z: e.position.z };
});
await step(1.2, 1 / 72);
const roll = await page.evaluate(() => {
  const e = window.__descent.camps.enemies.find((e) => e.family === 'wolf' && !e.alive);
  return e ? e.rig.mesh.parent.rotation.z : null;
});
check(roll !== null && Math.abs(roll) > 1.2, `a wolf struck dead rolls onto its side (${roll?.toFixed(2)})`);
const me = await feet();
const dx = me.x - dead.x;
const dz = me.z - dead.z;
const r = Math.hypot(dx, dz) || 1;
await lookAt(dead.x + (dx / r) * 2.6, dead.z + (dz / r) * 2.6, dead.x, dead.y + 0.15, dead.z);
await shot('04-dead');

if (errors.length) console.log(`page errors:\n${errors.join('\n')}`);
check(errors.length === 0, 'no page errors');
console.log(failed ? `${failed} failed` : 'all ok');
await browser.close();
process.exit(failed ? 1 : 0);
