// Checks for the villagers at work (issues/29-villagers-at-work.md) in
// headless Chromium with the IWER emulator. Start `npx vite --port 5173`
// first, then:
//
//   node .scratch/oakvale-starting-zone/checks/villagers.mjs [http://localhost:5173] [shots/]
//
// The Adventure at the plain URL, paused, stepped by `__descent.step` (and
// `teleport`); you walk with the left stick. What it checks:
//
// 1. The innkeeper stands behind the inn's bar (hung from its room, so drawn
//    only while it is), the smith at the anvil, the farmer by the well.
// 2. From 6 m off, each is at work: their pose keeps changing, and the
//    smith's blows land in bursts, each an event (for ticket 30's sound).
// 3. Walking up to 3 m: they stop work and turn their head to follow you;
//    their bark shows over their head, turned to you, with the adventure
//    state's line, for about 4 s, and not again until you've been 10 m off.
//    Walking away, they go back to work.
// 4. The lines move on with the chain: the farmer's after Raiders in the
//    Fields is handed in, the smith's after The Lumber Camp, the innkeeper's
//    as What Lies Below starts and once the Warden is beaten.
// 5. They're solid: walking into the farmer stops you at their edge.
// 6. A bark is drawn with Hale's board's shader: no new program for it.
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
const step = (s, dt = 1 / 72) => page.evaluate(([s, dt]) => window.__descent.step(s, dt), [s, dt]);
const shot = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => {
  const d = window.__descent;
  d.paused = true;
  // Hands lowered out of view, for the screenshots.
  Object.assign(d.device.controllers.left.position, { x: -0.3, y: -1, z: 0.2 });
  Object.assign(d.device.controllers.right.position, { x: 0.3, y: -1, z: 0.2 });
  // Count the smith's blows.
  d.blows = 0;
  d.adventure.villagers.onStrike = () => d.blows++;
});
const CONFIG = await page.evaluate(async () => {
  const { villagers } = (await import('/src/config.ts')).CONFIG;
  return JSON.parse(JSON.stringify(villagers));
});

/** Where each villager is, what they're doing, and their bark. */
const villager = (id) =>
  page.evaluate((id) => {
    const d = window.__descent;
    const v = d.adventure.villagers.get(id);
    const card = v.bark.mesh;
    const head = d.player.camera.getWorldPosition(v.root.position.clone());
    const at = card.getWorldPosition(v.root.position.clone());
    const normal = card.getWorldDirection(v.root.position.clone());
    const to = head.clone().sub(at).setY(0).normalize();
    const b = v.rig.bones;
    return {
      x: v.root.position.x,
      y: v.root.position.y,
      z: v.root.position.z,
      yaw: v.spot.yaw,
      rootYaw: v.root.rotation.y,
      shown: v.shown,
      parent: v.root.parent?.name,
      clock: v.clock,
      attend: v.attend,
      look: v.look,
      headYaw: b.head.rotation.y + b.spine.rotation.y,
      pose: ['spine', 'upperArmR', 'forearmR', 'upperArmL', 'forearmL', 'head', 'thighL'].map((n) => [b[n].rotation.x, b[n].rotation.y, b[n].rotation.z]).flat(),
      barking: d.adventure.villagers.barking(id),
      barkShown: card.visible,
      barkFacing: normal.setY(0).normalize().dot(to),
      barkAbove: at.y - (v.root.position.y + v.headY),
      bark: d.adventure.state.bark(id),
      far: v.far(head),
    };
  }, id);

/** Stand `d` m from `id`, `ang` rad round from the way they face, looking at them. */
async function standBy(id, d, ang = 0, pitch = -0.1) {
  await page.evaluate(
    ([id, d, ang, pitch]) => {
      const x = window.__descent;
      const v = x.adventure.villagers.get(id);
      const { x: vx, z: vz } = v.root.position;
      const a = v.spot.yaw + ang;
      const ex = vx + Math.sin(a) * d;
      const ez = vz + Math.cos(a) * d;
      x.teleport(ex, ez, Math.atan2(-(vx - ex), -(vz - ez)));
      Object.assign(x.device.quaternion, { x: Math.sin(pitch / 2), y: 0, z: 0, w: Math.cos(pitch / 2) });
    },
    [id, d, ang, pitch],
  );
  await xrFrames(2);
  await step(1 / 72);
}

const IDS = ['innkeeper', 'smith', 'farmer'];
/** How far round from the way each faces to stand while they bark: behind the bar, clear of the inn's tables. */
const ROUND = { innkeeper: 0.3, smith: 0.6, farmer: 0.6 };
const NEAR = { innkeeper: 2.6, smith: 3, farmer: 3 };

// 1. Where they stand.
const where = await page.evaluate(async () => {
  const { INN } = await import('/src/maps/forest/inn.ts');
  const { SMITHY } = await import('/src/maps/forest/smithy.ts');
  const { toFrame } = await import('/src/world/interiors.ts');
  const d = window.__descent;
  const zone = d.world.zoneAt(0, 0);
  const inn = zone.interiors.find((i) => i.id === 'inn');
  const v = d.adventure.villagers;
  const keeper = toFrame(inn.frame, v.get('innkeeper').root.position.x, v.get('innkeeper').root.position.z, { x: 0, z: 0 });
  const smith = v.get('smith').root.position;
  const farmer = v.get('farmer').root.position;
  return {
    keeper,
    bar: { back: INN.bar.z - INN.bar.depth, x0: INN.bar.x0, x1: INN.bar.x1, shelves: -INN.room.hd + INN.shelves.depth },
    keeperIn: v.get('innkeeper').root.parent === inn.room,
    anvil: SMITHY.anvil,
    smith: { x: smith.x, z: smith.z },
    farmer: { x: farmer.x, z: farmer.z },
    hale: !!v.get('hale'),
  };
});
const { keeper, bar } = where;
check(where.keeperIn && keeper.z < bar.back && keeper.z > bar.shelves && keeper.x > bar.x0 && keeper.x < bar.x1, `the innkeeper stands behind the bar, hung from the inn's room (at ${keeper.x.toFixed(2)}, ${keeper.z.toFixed(2)} in its frame)`);
check(Math.hypot(where.farmer.x + 5.5, where.farmer.z + 5.5) < 2, `the farmer stands by the well (${Math.hypot(where.farmer.x + 5.5, where.farmer.z + 5.5).toFixed(2)} m from it)`);
check(!where.hale, 'Hale is no villager: they don’t bark');
const smithNear = await page.evaluate(async () => {
  const { SMITHY } = await import('/src/maps/forest/smithy.ts');
  const { toFrame } = await import('/src/world/interiors.ts');
  const d = window.__descent;
  const v = d.adventure.villagers.get('smith');
  // The smithy's frame: the smith's spot less its offset, turned as they face.
  const yaw = v.spot.yaw;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const { x: lx, z: lz } = SMITHY.smith;
  const frame = { x: v.spot.x - (lx * c + lz * s), z: v.spot.z - (-lx * s + lz * c), yaw };
  const a = SMITHY.anvil;
  const [ax, az] = [frame.x + a.x * c + a.z * s, frame.z - a.x * s + a.z * c];
  const faceTo = Math.atan2(ax - v.spot.x, az - v.spot.z);
  return { d: Math.hypot(ax - v.spot.x, az - v.spot.z), off: Math.abs(Math.atan2(Math.sin(faceTo - yaw), Math.cos(faceTo - yaw))), frame: toFrame(frame, v.spot.x, v.spot.z, { x: 0, z: 0 }) };
});
check(smithNear.d < 1 && smithNear.off < 0.5, `the smith stands at the anvil, facing it (${smithNear.d.toFixed(2)} m, ${smithNear.off.toFixed(2)} rad off)`);

const cost = await page.evaluate(() => window.__descent.adventure.villagers.all.map((v) => `${v.id} ${v.rig.triangles}`));
console.log(`     their bodies: ${cost.join(', ')} triangles, one draw call each`);

// 2. At work, from 6 m off.
for (const id of IDS) {
  await standBy(id, 6, id === 'innkeeper' ? 0 : 0.3);
  const a = await villager(id);
  const blows0 = await page.evaluate(() => window.__descent.blows);
  let moved = 0;
  let prev = a.pose;
  for (let k = 0; k < 12; k++) {
    await step(0.5, 1 / 30);
    const b = await villager(id);
    if (b.pose.some((r, i) => Math.abs(r - prev[i]) > 0.005)) moved++;
    prev = b.pose;
  }
  const b = await villager(id);
  const blows = (await page.evaluate(() => window.__descent.blows)) - blows0;
  check(b.shown && b.attend === 0 && b.clock - a.clock > 5.9 && moved >= 9 && !b.barking, `the ${id} is at work from 6 m (the pose moved in ${moved} of 12 half-seconds)`);
  if (id === 'smith') check(blows >= 3, `the smith's blows land as events (${blows} in 6 s)`);
}
// At work, for the screenshots: from just outside where they notice you.
await page.evaluate(() => (window.__descent.adventure.villagers.get('smith').clock = 0.45));
await standBy('smith', 4.3, 0.9, -0.12);
await shot('01-the-smith-at-the-anvil');
await page.evaluate(() => (window.__descent.adventure.villagers.get('smith').clock = 13.3));
await standBy('smith', 4.3, -0.5, -0.12);
await shot('02-the-smith-at-the-bellows');
await page.evaluate(() => (window.__descent.adventure.villagers.get('innkeeper').clock = 7));
await standBy('innkeeper', 4.3, 0, -0.14);
await shot('03-the-innkeeper-polishing');
await page.evaluate(() => (window.__descent.adventure.villagers.get('farmer').clock = 11));
await standBy('farmer', 4.3, 0.4, -0.08);
await shot('04-the-farmer-looking-to-the-farm');

// 3. Walk up to each: they stop work and follow you with their head, and bark.
for (const id of IDS) {
  const r = ROUND[id];
  const near = NEAR[id];
  await standBy(id, 8, 0);
  await step(2, 1 / 30);
  await standBy(id, near, r);
  let s = await villager(id);
  check(s.barking && s.barkShown && s.bark.length > 0, `the ${id} barks as you come within 4 m: "${s.bark}"`);
  await step(1.2, 1 / 30);
  s = await villager(id);
  const clock = s.clock;
  check(s.attend === 1 && s.headYaw > r * 0.7, `the ${id} stops work and turns their head to you (${s.headYaw.toFixed(2)} rad round, you ${r})`);
  check(s.barkFacing > 0.98 && s.barkAbove > 0.3, `the bark is over their head (${s.barkAbove.toFixed(2)} m), turned to you (${s.barkFacing.toFixed(3)})`);
  // Round to their other side: the head follows.
  await standBy(id, near, -r);
  await step(1.2, 1 / 30);
  s = await villager(id);
  check(s.headYaw < -r * 0.7 && Math.abs(s.clock - clock) < 1e-6, `the ${id}'s head follows you round (${s.headYaw.toFixed(2)} rad), still stopped`);
  await shot(`${String(5 + IDS.indexOf(id)).padStart(2, '0')}-the-${id}-barks`);
  await step(2, 1 / 30);
  s = await villager(id);
  check(!s.barking && !s.barkShown, `the ${id}'s bark is gone after about ${CONFIG.bark.time} s`);
  // Off to 7 m and back: no bark. Off to 11 m and back: another.
  await standBy(id, 7, 0);
  await step(1.5, 1 / 30);
  s = await villager(id);
  check(s.attend === 0 && s.clock > clock, `walking off, the ${id} goes back to work`);
  await standBy(id, near, r);
  s = await villager(id);
  check(!s.barking, `back within 4 m after only 7 m off: no bark`);
  await standBy(id, 11, 0);
  await step(0.5, 1 / 30);
  await standBy(id, near, r);
  s = await villager(id);
  check(s.barking, `back within 4 m after 11 m off: the ${id} barks again`);
}

// 4. The lines move on with the chain.
const lines = async () => Object.fromEntries(await Promise.all(IDS.map(async (id) => [id, (await villager(id)).bark])));
const told = [await lines()];
await page.evaluate(() => {
  const { state } = window.__descent.adventure;
  state.apply({ kind: 'accept' });
  for (let k = 0; k < 3; k++) state.apply({ kind: 'kill', camp: 'farm', level: 1, role: 'ordinary' });
  state.apply({ kind: 'handIn' });
});
told.push(await lines());
await page.evaluate(() => {
  const { state } = window.__descent.adventure;
  state.apply({ kind: 'accept' });
  for (let k = 0; k < 5; k++) state.apply({ kind: 'kill', camp: 'lumberCamp', level: 2, role: 'ordinary' });
  state.apply({ kind: 'pickup', item: 'orders' });
  state.apply({ kind: 'handIn' });
});
told.push(await lines());
await page.evaluate(() => window.__descent.adventure.state.apply({ kind: 'accept' }));
told.push(await lines());
await page.evaluate(() => window.__descent.adventure.state.apply({ kind: 'kill', camp: null, level: 5, role: 'warden' }));
told.push(await lines());
check(told[1].farmer !== told[0].farmer && told[1].smith === told[0].smith, `the farmer's line moves on with Raiders in the Fields: "${told[1].farmer}"`);
check(told[2].smith !== told[1].smith && told[2].innkeeper === told[0].innkeeper, `the smith's with The Lumber Camp: "${told[2].smith}"`);
check(told[3].innkeeper !== told[2].innkeeper && told[4].innkeeper !== told[3].innkeeper, `the innkeeper's as What Lies Below starts ("${told[3].innkeeper}") and once the Warden is beaten ("${told[4].innkeeper}")`);
// A bark shown now says the new line.
await standBy('farmer', 11, 0);
await step(0.5, 1 / 30);
await standBy('farmer', 3, 0.6);
const painted = await page.evaluate(() => {
  const v = window.__descent.adventure.villagers.get('farmer');
  return v.bark.key;
});
check(painted === told[4].farmer, `the farmer's bark now says "${painted}"`);

// 5. Solid: walk straight into the farmer.
await standBy('farmer', 1.5, 0);
await page.evaluate(() => window.__descent.device.controllers.left.updateAxes('thumbstick', 0, -1));
await xrFrames(2);
let nearest = Infinity;
for (let k = 0; k < 20; k++) {
  await step(0.1, 1 / 30);
  nearest = Math.min(nearest, (await villager('farmer')).far);
}
await page.evaluate(() => window.__descent.device.controllers.left.updateAxes('thumbstick', 0, 0));
await xrFrames(2);
const bodyR = await page.evaluate(async () => (await import('/src/config.ts')).CONFIG.player.bodyRadius);
check(nearest > CONFIG.radius + bodyR - 0.05, `walking into the farmer stops you at their edge (${nearest.toFixed(2)} m, their ${CONFIG.radius} m and your ${bodyR} m)`);

// 6. A bark's shader is Hale's board's.
const same = await page.evaluate(async () => {
  const d = window.__descent;
  const { hale, board } = d.adventure;
  const x = hale.position.x;
  const z = hale.position.z + 2;
  d.teleport(x, z, 0);
  await new Promise((r) => d.renderer.xr.getSession().requestAnimationFrame(r));
  await new Promise((r) => d.renderer.xr.getSession().requestAnimationFrame(r));
  d.step(1);
  await new Promise((r) => d.renderer.xr.getSession().requestAnimationFrame(r));
  await new Promise((r) => d.renderer.xr.getSession().requestAnimationFrame(r));
  const text = board.root.children.find((m) => m.isMesh);
  const bark = d.adventure.villagers.get('farmer').bark.mesh;
  const p = (m) => d.renderer.properties.get(m.material).currentProgram;
  return { open: board.isOpen, same: !!p(bark) && p(bark) === p(text) };
});
check(same.open && same.same, 'a bark is drawn with the shader program of Hale’s board');

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
if (failed) {
  console.log(`${failed} FAILED`);
  process.exit(1);
}
console.log('all passed');
