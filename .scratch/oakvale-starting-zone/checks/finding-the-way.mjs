// Checks for finding the way (issues/32-finding-the-way.md) in headless
// Chromium, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/oakvale-starting-zone/checks/finding-the-way.mjs [http://localhost:5173] [shots/]
//
// Part 1, Oakvale in walk mode on the desktop camera (`?map=forest&noemulate`),
// 2400×1600 cropped to its middle 1200×800, about the Quest 3's pixels per
// degree: screenshots of both signposts and the map board from a few steps
// away, and the smoke over the village. Each signpost's names and the map
// board's face are one mesh each, and the smoke's 60 puffs one more.
//
// Part 2, the Adventure at the plain URL with the IWER emulator, paused and
// stepped by `__descent.step` (and `teleport`); quests moved on through the
// adventure state. What it checks:
//
// 1. No quest, no tracker and no arrow.
// 2. Raiders in the Fields taken: the arrow shows at the left of its line,
//    pointing towards the farm as the crow flies; turn your head and it turns
//    by as much, and pointing up once you face the farm.
// 3. In the farm's clearing it hides; back out on the road it shows.
// 4. Ready: it points at Hale, hides within 10 m of them, and shows past that.
// 5. The Lumber Camp: beside the bandits' line, then beside the orders' once
//    the bandits are done. Indoors (the inn) it hides, and shows as you step out.
// 6. What Lies Below: towards the mine's mouth; hidden from its front on and
//    all the way down the mine.
// 7. Showing the arrow compiles no new shader program once the tracker has shown: it's drawn as the tracker is.
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
const errors = [];
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
/** The difference between two angles, in (−π, π]. */
const turnBetween = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// ------------------------------------------------------------ part 1: walk mode

{
  const page = await browser.newPage({ viewport: { width: 2400, height: 1600 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${base}/?map=forest&noemulate`);
  await page.waitForFunction(() => window.__descent?.walker, null, { timeout: 120000 });
  const layout = await page.evaluate(async () => {
    const { buildLayout } = await import('/src/maps/forest/layout.ts');
    const l = buildLayout();
    return { structures: l.structures.filter((s) => ['signpost', 'mapboard', 'inn'].includes(s.kind)) };
  });
  const [crossroads, fork] = layout.structures.filter((s) => s.kind === 'signpost');
  const board = layout.structures.find((s) => s.kind === 'mapboard');

  const meshes = await page.evaluate(() => {
    const zone = window.__descent.world.zoneAt(0, 0);
    const named = (n) => zone.root.children.filter((o) => o.name === n);
    const smoke = named('smoke')[0];
    return {
      names: named('sign-names').map((m) => ({ tris: m.geometry.index.count / 3, map: !!m.material.map })),
      face: named('map-board').map((m) => ({ tris: m.geometry.index.count / 3, map: !!m.material.map, w: m.material.map?.image.width, h: m.material.map?.image.height })),
      smoke: smoke && { count: smoke.count, instanced: smoke.isInstancedMesh },
    };
  });
  check(meshes.names.length === 2 && meshes.names.every((n) => n.map), `each signpost's names are one textured mesh (${JSON.stringify(meshes.names)})`);
  check(meshes.face.length === 1 && meshes.face[0].tris === 2 && meshes.face[0].map, `the map board's face is one painted quad (${JSON.stringify(meshes.face)})`);
  check(meshes.smoke?.instanced && meshes.smoke.count === 60, `the smoke is one instanced mesh of 60 puffs (${JSON.stringify(meshes.smoke)})`);

  /** Stand at (x, z) looking at (tx, tz), `pitch` up, and let the world move on a moment. */
  const look = async (x, z, tx, tz, pitch = 0) => {
    await page.evaluate(
      ([x, z, tx, tz, pitch]) => {
        const d = window.__descent;
        d.teleport(x, z, Math.atan2(-(tx - x), -(tz - z)));
        d.walker.pitch = pitch;
      },
      [x, z, tx, tz, pitch],
    );
    await page.waitForTimeout(600);
  };
  const shot = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png`, clip: { x: 600, y: 400, width: 1200, height: 800 } });
  /** How many draw calls the last frame took. */
  const calls = () => page.evaluate(() => window.__descent.renderer.info.render.calls);

  // The crossroads signpost from about 3 m: from the north its east and west boards face you,
  // from the west its north and south boards do.
  await look(crossroads.x - 0.4, crossroads.z - 3, crossroads.x, crossroads.z, 0.18);
  await shot('01-crossroads-signpost-from-the-north');
  await look(crossroads.x - 3, crossroads.z - 0.8, crossroads.x, crossroads.z, 0.2);
  await shot('02-crossroads-signpost-from-the-west');
  // The second signpost from the main road, walking up from the bridge, and from across the road.
  await look(fork.x + 3.2, fork.z + 3.2, fork.x, fork.z, 0.2);
  await shot('03-fork-signpost-from-the-bridge-road');
  await look(fork.x + 3.6, fork.z - 0.3, fork.x, fork.z, 0.16);
  await shot('04-fork-signpost-from-the-main-road');
  // The map board from 2 m and from 3.5 m, facing east as it faces west.
  const before = await calls();
  await look(board.x - 2, board.z, board.x, board.z, -0.22);
  await shot('05-map-board-from-2-m');
  const withBoard = await calls();
  check(withBoard >= 1, `the map board draws (${withBoard} draw calls in view, ${before} before)`);
  await look(board.x - 3.5, board.z + 0.3, board.x, board.z, -0.12);
  await shot('06-map-board-from-3.5-m');
  // Smoke over the village, from the crossroads and from the watchtower's hill.
  const inn = layout.structures.find((s) => s.kind === 'inn');
  await look(-2, 8, inn.x, inn.z, 0.3);
  await page.waitForTimeout(1500);
  await shot('07-smoke-over-the-inn');
  await look(28, -52, 0, 0, 0.05);
  await page.waitForTimeout(1500);
  await shot('08-smoke-from-the-watchtower-road');
  await page.close();
}

// ------------------------------------------------------------ part 2: the arrow

const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
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
/** A screenshot of what you see, once the tracker has caught up with your head. */
const shot = async (name) => {
  if (!shots) return;
  await step(1.5);
  await xrFrames(3);
  await page.screenshot({ path: `${shots}/${name}.png` });
};

// A new page is a new browser context: no save, a new character.
await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => {
  const d = window.__descent;
  d.paused = true;
  Object.assign(d.device.controllers.left.position, { x: -0.3, y: -1, z: 0.2 });
  Object.assign(d.device.controllers.right.position, { x: 0.3, y: -1, z: 0.2 });
});
const plan = await page.evaluate(async () => {
  const { buildLayout } = await import('/src/maps/forest/layout.ts');
  const l = buildLayout();
  return { places: l.places, hale: l.hale, village: l.respawns.village };
});

/** The tracker and its arrow: shown, which line it sits by, its turn, and your head's yaw and place. */
const arrow = () =>
  page.evaluate(() => {
    const d = window.__descent;
    const tracker = d.adventure.tracker.mesh;
    const a = tracker.children.find((c) => c.name === 'quest-arrow');
    const head = d.camera.getWorldPosition(d.camera.position.clone());
    const q = d.camera.getWorldQuaternion(d.camera.quaternion.clone());
    const e = new d.camera.rotation.constructor().setFromQuaternion(q, 'YXZ');
    return {
      tracker: tracker.visible,
      shown: tracker.visible && a.visible,
      y: a.position.y,
      turn: a.rotation.z,
      x: head.x,
      z: head.z,
      yaw: e.y,
      interior: d.world.interior,
      programs: d.renderer.info.programs.length,
      state: d.state.arrow,
    };
  });
/** Where `to` should be on the arrow from where you stand and look: 0 is ahead, positive to your left. */
const expected = (a, to) => {
  const dx = to.x - a.x;
  const dz = to.z - a.z;
  return Math.atan2(-dx * Math.cos(a.yaw) + dz * Math.sin(a.yaw), -dx * Math.sin(a.yaw) - dz * Math.cos(a.yaw));
};
/** Stand at (x, z) facing `yaw` (0 looks down −Z), with your head level and straight. */
const stand = async (x, z, yaw = 0) => {
  await page.evaluate(
    ([x, z, yaw]) => {
      const d = window.__descent;
      Object.assign(d.device.quaternion, { x: 0, y: 0, z: 0, w: 1 });
      d.teleport(x, z, yaw);
    },
    [x, z, yaw],
  );
  await xrFrames(2);
  await step(0.1);
};
/** Turn your head by `yaw` (radians, to the left) without moving. */
const turnHead = async (yaw) => {
  await page.evaluate((yaw) => Object.assign(window.__descent.device.quaternion, { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }), yaw);
  await xrFrames(2);
  await step(0.1);
};
const apply = (...events) => page.evaluate((events) => events.forEach((e) => window.__descent.adventure.apply(e, window.__descent.adventure.hale.position)), events);
const farm = { kind: 'kill', camp: 'farm', level: 1, role: 'ordinary', family: 'bandit', seed: 1 };
const bandit = { kind: 'kill', camp: 'lumberCamp', level: 2, role: 'ordinary', family: 'bandit', seed: 1 };

// 1. No quest yet.
let a = await arrow();
check(!a.tracker && !a.shown && a.state === null, 'no quest: no tracker and no arrow');

// 2. Raiders in the Fields: taken in the farm's clearing, the tracker shows with no arrow (so its shader is compiled).
await apply({ kind: 'accept' });
await stand(plan.places.farm.x - 20, plan.places.farm.z - 5);
a = await arrow();
check(a.tracker && !a.shown, 'taken in the farm clearing: the tracker shows and the arrow hides');
const programs = a.programs;
await stand(12, -2, -Math.PI / 2);
a = await arrow();
check(a.shown && a.state.target === 'farm' && a.state.line === 0, `taken: the arrow shows beside the objective, pointing at the farm (${JSON.stringify(a.state)})`);
check(near(turnBetween(a.turn, expected(a, plan.places.farm)), 0, 0.02), `it points at the farm as the crow flies (${a.turn.toFixed(3)} rad, expected ${expected(a, plan.places.farm).toFixed(3)})`);
const firstLineY = a.y;
await shot('09-the-arrow-towards-the-farm');
const was = a.turn;
await turnHead(0.6);
a = await arrow();
check(near(turnBetween(a.turn, was), -0.6, 0.03), `turning your head 0.6 rad left turns it 0.6 rad right (${turnBetween(a.turn, was).toFixed(3)})`);
await turnHead(0);
const faceFarm = Math.atan2(-(plan.places.farm.x - 12), -(plan.places.farm.z - -2));
await stand(12, -2, faceFarm);
a = await arrow();
check(near(a.turn, 0, 0.03), `facing the farm it points straight up (${a.turn.toFixed(3)})`);
check(a.programs <= programs, `showing the arrow compiles no new program (${programs} → ${a.programs})`);

// 3. The farm's clearing.
await stand(plan.places.farm.x - 20, plan.places.farm.z - 5);
a = await arrow();
check(a.tracker && !a.shown, 'in the farm clearing the tracker stays but the arrow hides');
await stand(26, 3);
a = await arrow();
check(a.shown, 'back out on the road it shows again');

// 4. Ready: back to Hale.
await apply(farm, farm, farm);
await stand(26, 3, Math.PI / 2);
a = await arrow();
check(a.shown && a.state.target === 'hale' && near(turnBetween(a.turn, expected(a, plan.hale)), 0, 0.02), `ready: it points at Hale (${JSON.stringify(a.state)}, ${a.turn.toFixed(3)})`);
check(near(a.y, firstLineY, 1e-6), 'beside "Return to Marshal Hale", the one line');
await shot('10-the-arrow-back-to-hale');
await stand(plan.hale.x + 9, plan.hale.z - 2);
a = await arrow();
check(!a.shown, 'within 10 m of Hale it hides');
await stand(plan.hale.x + 11, plan.hale.z - 2);
a = await arrow();
check(a.shown, 'past 10 m it shows');

// 5. The Lumber Camp, and indoors.
await apply({ kind: 'handIn' }, { kind: 'accept' });
await stand(-5, -38, 0);
a = await arrow();
check(a.shown && a.state.target === 'lumberCamp' && a.state.line === 0 && near(turnBetween(a.turn, expected(a, plan.places.lumberCamp)), 0, 0.02), `The Lumber Camp: towards the camp, beside the bandits' line (${JSON.stringify(a.state)})`);
await apply(bandit, bandit, bandit, bandit, bandit);
await step(0.1);
a = await arrow();
check(a.shown && a.state.line === 1 && a.y < firstLineY - 0.02, `bandits done: beside the orders' line, one line down (${(firstLineY - a.y).toFixed(4)} m lower)`);
await shot('11-the-arrow-by-the-orders');
await page.evaluate(([x, z, yaw]) => {
  const d = window.__descent;
  d.world.settle('inn');
  d.teleport(x, z, yaw);
}, [plan.village.x, plan.village.z, plan.village.yaw]);
await xrFrames(2);
await step(0.1);
a = await arrow();
check(a.interior === 'inn' && a.tracker && !a.shown, `in the inn it hides (${a.interior})`);
await page.evaluate(() => window.__descent.world.settle(null));
await stand(0, -3);
a = await arrow();
check(a.interior === null && a.shown, 'stepping out, it shows again');

// 6. What Lies Below.
await apply({ kind: 'pickup', item: 'orders' }, { kind: 'handIn' }, { kind: 'accept' });
await stand(-8, -55, 0);
a = await arrow();
check(a.shown && a.state.target === 'mine' && near(turnBetween(a.turn, expected(a, plan.places.mine)), 0, 0.02), `What Lies Below: towards the mine's mouth (${JSON.stringify(a.state)})`);
const front = plan.places.mine.clearing;
await stand(front.x, front.z + front.r - 1, 0);
a = await arrow();
check(!a.shown, "from the mine's front on it hides");
// Walk in by the mouth.
await page.evaluate(() => {
  const d = window.__descent;
  const { x, z, yaw } = d.world.mine.mouth;
  const at = (a, b) => [x + a * Math.cos(yaw) + b * Math.sin(yaw), z - a * Math.sin(yaw) + b * Math.cos(yaw)];
  const [fx, fz] = at(0, 1.5);
  const [tx, tz] = at(0, -10);
  Object.assign(d.device.quaternion, { x: 0, y: 0, z: 0, w: 1 });
  d.teleport(fx, fz, Math.atan2(-(tx - fx), -(tz - fz)));
  d.device.controllers.left.updateAxes('thumbstick', 0, -1);
});
await xrFrames(2);
for (let t = 0; t < 4; t += 0.25) await step(0.25);
await page.evaluate(() => window.__descent.device.controllers.left.updateAxes('thumbstick', 0, 0));
await xrFrames(2);
a = await arrow();
check(a.interior === 'mine' && !a.shown, `in the mine it hides (${a.interior})`);

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
