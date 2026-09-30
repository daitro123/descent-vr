// Checks for Herbalism in the Adventure (issues/14-herbalism.md) in headless
// Chromium with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/professions/checks/herbalism.mjs [http://localhost:5173] [shots/]
//
// Oakvale at the plain URL (`?perf` on) for a new warrior who has learned
// Herbalism through the debug handle. The game is paused and stepped a
// thirtieth of a second per XR frame from inside the frame loop, the emulated
// right controller moved a frame at a time, so the grip in the loop and every
// cut go through the same detection as in the headset: the belt's frame
// placing the loop, the knife's edge passing through the clump's bands, the
// knife's committed-swing gate.
//
// 1. By the Hearthleaf west of the farm's wheat, a grip in the loop behind
//    the right hip draws the knife: the sword goes away, the shield stays.
// 2. A hot slice through the leaves trims one and says "Cut lower", and
//    doesn't take the clump; a slow pass through the stems only brushes it.
// 3. A hot slice through the stems takes it: 2 Hearthleaf to the bag,
//    Herbalism 1, the clump taken and cut to stubs.
// 4. `?perf` there: the Hearthleaf out of doors are one draw call (one per eye).
// 5. In the old mine's gallery, the knife at a Duskcap whose caps glow: a
//    slice through its stems gives 2 Duskcap, and Herbalism is 2.
// 6. With Mining learned too, the loop gives the pick at a vein and the knife
//    at a clump.
// 7. The taken clumps grow back 180 s on, once you're 30 m off.
// 8. `?proto=pick` still runs and cuts its Hearthleaf. No page errors.
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
const context = await browser.newContext({ viewport: { width: 800, height: 520 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};
const shot = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });

// In the page: run a list of steps, one per XR frame, each followed by a
// thirtieth of a second of the game. A step places the right controller so a
// point on what it holds (the knife's blade's middle, or the grip itself) is
// at a world point, turned so the blade points along `along`, sets the
// squeeze, or waits (`hold` frames, or `until` a condition holds).
await page.addInitScript(() => {
  const HELD = { blade: [0, 0, -0.2], grip: [0, 0, 0] };
  const put = (hand, what, p, along) => {
    const { player, device } = window.__descent;
    const V = player.rig.position.constructor;
    const Q = player.rig.quaternion.constructor;
    const c = device.controllers[hand];
    player.rig.updateMatrixWorld(true);
    const grip = player.input.hands[hand].grip;
    // The emulator's grip sits turned and offset from the controller's pose: read both off this frame's grip.
    const rigQ = player.rig.getWorldQuaternion(new Q());
    const gripQ = rigQ.clone().invert().multiply(grip.getWorldQuaternion(new Q()));
    const ctrlQ = new Q(c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w);
    const off = ctrlQ.clone().invert().multiply(gripQ); // grip = controller · off
    let want = gripQ;
    if (along) {
      // The blade (grip −Z) along `along`.
      const dir = new V(along.x, along.y, along.z).applyQuaternion(rigQ.clone().invert()).normalize();
      want = new Q().setFromUnitVectors(new V(0, 0, -1), dir);
    }
    const q = want.clone().multiply(off.clone().invert());
    Object.assign(c.quaternion, { x: q.x, y: q.y, z: q.z, w: q.w });
    const local = new V(...HELD[what]);
    const gripPos = player.rig.worldToLocal(grip.getWorldPosition(new V()));
    const gripOff = gripPos.sub(new V(c.position.x, c.position.y, c.position.z)).applyQuaternion(ctrlQ.clone().invert()).applyQuaternion(q);
    const heldOff = gripOff.add(local.applyQuaternion(want));
    const r = player.rig.worldToLocal(new V(p.x, p.y, p.z));
    Object.assign(c.position, { x: r.x - heldOff.x, y: r.y - heldOff.y, z: r.z - heldOff.z });
  };
  window.__herbs = {
    buzzes: [],
    run: (steps) =>
      new Promise((done) => {
        const d = window.__descent;
        const session = d.renderer.xr.getSession();
        let i = 0;
        let held = 0;
        const frame = () => {
          const s = steps[i];
          if (!s) return done();
          const tick = () => d.adventure.update(1 / 30);
          if (s.until && !new Function('d', `return ${s.until}`)(d)) {
            tick();
            return session.requestAnimationFrame(frame);
          }
          if (s.p) put(s.hand ?? 'right', s.what ?? 'grip', s.p, s.along);
          if (s.squeeze !== undefined) d.device.controllers[s.hand ?? 'right'].updateButtonValue('squeeze', s.squeeze);
          tick();
          if (++held >= (s.hold ?? 1)) {
            i++;
            held = 0;
          }
          session.requestAnimationFrame(frame);
        };
        session.requestAnimationFrame(frame);
      }),
  };
});
const run = (steps) => page.evaluate((steps) => window.__herbs.run(steps), steps);
const wait = (n) => run([{ hold: n }]);
const count = (id) => page.evaluate((id) => window.__descent.state.inventory.count(id), id);
const herbalism = () => page.evaluate(() => window.__descent.state.professions.proficiency('herbalism'));
const log = () => page.evaluate(() => ({ ...window.__descent.adventure.gathering.log }));
const lines = () => page.evaluate(() => [...window.__descent.adventure.gathering.lines]);
const phase = (i) => page.evaluate((i) => window.__descent.adventure.gathering.states.phase(i), i);
const hands = () =>
  page.evaluate(() => {
    const { adventure, player } = window.__descent;
    const { left, right } = player.input.hands;
    const g = adventure.gathering;
    return {
      drawn: g.drawn,
      knife: g.knife.model.parent === right.grip,
      pick: g.pick.model.parent === right.grip,
      sword: player.sword.model.parent === right.grip && !player.sword.away,
      shield: player.shield.model.parent === left.grip && !player.shield.away,
    };
  });
/**
 * A spot by id: its index, its foot (for a clump, where its stems start), and
 * where to stand to work it: `out` m off it on the first side round it where
 * a body fits, facing it.
 */
const spot = (id, out = 0.95) =>
  page.evaluate(
    ({ id, out }) => {
      const d = window.__descent;
      const g = d.adventure.gathering;
      const i = g.spot(id);
      const s = g.spots[i];
      const V = d.camera.position.constructor;
      const c = g.clumps.clumps.find((c) => c.plan.id === id);
      const foot = c ? { x: c.foot.x, y: c.foot.y, z: c.foot.z } : { x: s.x, y: s.y, z: s.z };
      let stand = null;
      for (let k = 0; k < 16 && !stand; k++) {
        const a = (k / 16) * Math.PI * 2;
        const p = new V(s.x + Math.sin(a) * out, 0, s.z + Math.cos(a) * out);
        if (!d.world.resolve(p, d.CONFIG.player.bodyRadius + 0.05)) stand = { x: p.x, z: p.z };
      }
      return { i, x: s.x, z: s.z, yaw: s.yaw, foot, stand, interior: s.interior };
    },
    { id, out },
  );
/** Stand at (x, z) looking at (tx, tz). */
const stand = (at, to) =>
  page.evaluate(({ at, to }) => window.__descent.teleport(at.x, at.z, Math.atan2(at.x - to.x, at.z - to.z)), { at, to });
/** The loop's middle now (world). */
const loopAt = () =>
  page.evaluate(() => {
    const p = window.__descent.adventure.gathering.loopAt(window.__descent.camera.position.clone());
    return { x: p.x, y: p.y, z: p.z };
  });
/** Rest the right hand in front of you, a little to the right. */
const rest = () =>
  page.evaluate(() => {
    const { camera } = window.__descent;
    const V = camera.position.constructor;
    const p = camera.localToWorld(new V(0.25, -0.35, -0.35));
    return { x: p.x, y: p.y, z: p.z };
  });
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
/** Glide the right grip from where it rests into the loop, squeeze and let go there, and glide back out. */
async function gripInLoop() {
  const from = await rest();
  const to = await loopAt();
  const steps = [];
  for (let k = 1; k <= 10; k++) steps.push({ p: lerp(from, to, k / 10) });
  steps.push({ p: to, hold: 3 }, { p: to, squeeze: 1, hold: 3 }, { p: to, squeeze: 0, hold: 3 });
  for (let k = 1; k <= 10; k++) steps.push({ p: lerp(to, from, k / 10) });
  await run(steps);
}
/**
 * Slice across the clump at `c` from `from` (where you stand), `height` m over
 * its foot: the blade pointing at it, swept sideways from 0.45 m one side to
 * 0.45 m the other, `step` m a frame (0.06 = 1.8 m/s), and back out slowly.
 */
async function slice(c, from, height, step = 0.06) {
  const fx = c.foot.x - from.x;
  const fz = c.foot.z - from.z;
  const n = Math.hypot(fx, fz);
  const along = { x: fx / n, y: -0.15, z: fz / n };
  const side = { x: -fz / n, z: fx / n };
  const at = (k) => ({ x: c.foot.x + side.x * k, y: c.foot.y + height, z: c.foot.z + side.z * k });
  const steps = [{ what: 'blade', p: at(-0.45), along, hold: 4 }];
  for (let k = -0.45 + step; k < 0.45; k += step) steps.push({ what: 'blade', p: at(k), along });
  steps.push({ what: 'blade', p: at(0.45), along, hold: 4 });
  // Up and out of the clump, then back round slowly to the start, over it.
  steps.push({ what: 'blade', p: { ...at(0.45), y: c.foot.y + 0.6 }, along, hold: 6 });
  for (let k = 1; k <= 20; k++) steps.push({ what: 'blade', p: { ...at(0.45 - 0.9 * (k / 20)), y: c.foot.y + 0.6 }, along });
  steps.push({ what: 'blade', p: { ...at(-0.45), y: c.foot.y + 0.6 }, along, hold: 6 });
  await run(steps);
}

await page.goto(`${base}/?emulate&nodevui&perf`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 180000 });
await page.evaluate(() => window.__descent.renderer.xr.setFramebufferScaleFactor(0.25));
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await page.evaluate(() => {
  const d = window.__descent;
  d.paused = true;
  d.professions.learn('herbalism');
  const pulse = d.player.input.pulse.bind(d.player.input);
  d.player.input.pulse = (hand, intensity, ms) => {
    window.__herbs.buzzes.push({ hand, intensity, ms });
    return pulse(hand, intensity, ms);
  };
  // What floats over the world, for "Cut lower".
  const spawn = d.adventure.text.spawn.bind(d.adventure.text);
  window.__herbs.floats = [];
  d.adventure.text.spawn = (words, at, style) => {
    window.__herbs.floats.push(words);
    return spawn(words, at, style);
  };
});
const field = await spot('hearthleaf-farm-wheat-west');
check(field.i >= 0 && !!field.stand, `the Hearthleaf west of the farm's wheat is a spot you can stand at (${JSON.stringify(field.stand)})`);
await stand(field.stand, field);
const low = await page.evaluate(() => {
  const { camera } = window.__descent;
  const p = camera.localToWorld(new camera.position.constructor(-0.3, -0.6, -0.1));
  return { x: p.x, y: p.y, z: p.z };
});
await run([{ hand: 'left', p: low }, { p: await rest(), hold: 10 }]);
const start = await hands();
check(!start.drawn && start.sword && start.shield, '1: by the farm’s Hearthleaf, sword and shield in your hands');
check(await page.evaluate(() => window.__descent.adventure.gathering.loop.root.visible), '1: the tool loop hangs behind your right hip with Herbalism learned');

// ─── 1. Drawing the knife ───
await gripInLoop();
let h = await hands();
check(h.drawn === 'knife' && h.knife && !h.pick && !h.sword && h.shield, `1: a grip in the loop drew the knife; the sword went away and the shield stayed (${JSON.stringify(h)})`);
await shot('1-knife-drawn');

// ─── 2. Too high, and too slow ───
await slice(field, field.stand, 0.2);
let l = await log();
const floats = await page.evaluate(() => [...window.__herbs.floats]);
check(l.trimmed === 1 && l.cut === 0 && (await phase(field.i)) === 'full', `2: a slice through the leaves trimmed one and left the clump (${(await lines()).at(-1)})`);
check(floats.includes('Cut lower'), `2: it said "Cut lower" (${floats.join(', ')})`);
check((await count('hearthleaf')) === 0, '2: nothing to the bag for a trim');
await shot('2-trimmed');
await slice(field, field.stand, 0.05, 0.02);
l = await log();
check(l.brushed >= 1 && l.cut === 0 && (await phase(field.i)) === 'full', `2: a slow pass through the stems only brushed it (${l.brushed} brushes)`);

// ─── 3. Through the stems ───
await slice(field, field.stand, 0.05);
l = await log();
check(l.cut === 1 && (await phase(field.i)) === 'taken', `3: a slice through the stems took the clump (${(await lines()).at(-1)})`);
await wait(30);
check((await count('hearthleaf')) === 2, `3: 2 Hearthleaf to the bag (${await count('hearthleaf')})`);
check((await herbalism()) === 1, `3: Herbalism 1 (${await herbalism()})`);
await shot('3-taken');

// ─── 4. ?perf: the Hearthleaf are one draw call ───
const perf = await page.evaluate(async () => {
  const d = window.__descent;
  const { mesh } = d.adventure.gathering.meshes.find((m) => m.mesh.name === 'hearthleaf');
  let draws = 0;
  mesh.onBeforeRender = () => draws++;
  const frame = () => new Promise((r) => d.renderer.xr.getSession().requestAnimationFrame(() => setTimeout(r, 0)));
  await frame();
  await frame();
  draws = 0;
  await frame();
  const withClumps = { calls: d.renderer.info.render.calls, draws };
  mesh.visible = false;
  await frame();
  await frame();
  const without = d.renderer.info.render.calls;
  mesh.visible = true;
  mesh.onBeforeRender = () => {};
  return { ...withClumps, without, instances: mesh.count, triangles: mesh.geometry.attributes.position.count / 3 };
});
check(
  perf.draws === 2 && perf.calls - perf.without === 2,
  `4: ?perf by the farm: all ${perf.instances} Hearthleaf are one draw call per eye (${perf.calls} calls, ${perf.without} without them), ${perf.triangles} triangles a clump`,
);
await gripInLoop();
check(!(await hands()).drawn && (await hands()).sword, '4: a grip in the loop put the knife back, and the sword is home');

// ─── 5. Duskcap in the mine ───
// Arrive in the mine as a save made there loads, beside the Duskcap by the gallery's east wall:
// more than 8 m from its undead, so they don't see you.
await page.evaluate(() => {
  const d = window.__descent;
  const g = d.adventure.gathering;
  const s = g.spots[g.spot('duskcap-mine-gallery-2')];
  const { yaw } = d.world.mine.mouth;
  d.world.settle('mine');
  d.teleport(s.x - 1.05 * Math.cos(yaw), s.z + 1.05 * Math.sin(yaw), yaw);
});
await run([{ p: await rest(), hold: 20 }]);
const cap = await spot('duskcap-mine-gallery-2', 1.05);
check(cap.interior === 'mine' && !!cap.stand, `5: the gallery's Duskcap is a spot in the mine (${JSON.stringify(cap.stand)})`);
await stand(cap.stand, cap);
await run([{ p: await rest(), hold: 20 }]);
const inMine = await page.evaluate(() => {
  const d = window.__descent;
  const m = d.adventure.gathering.meshes.find((m) => m.mesh.name === 'duskcap in the mine');
  return { interior: d.world.interior, shown: m.mesh.visible, glow: m.mesh.material.userData.glow, fighting: d.adventure.camps.fighting };
});
check(inMine.interior === 'mine' && inMine.shown && inMine.glow > 0 && !inMine.fighting, `5: in the gallery, its Duskcap drawn with their caps glowing (${JSON.stringify(inMine)})`);
await shot('5-duskcap-in-the-mine');
await gripInLoop();
h = await hands();
check(h.drawn === 'knife', '5: the loop gave the knife at the Duskcap');
await slice(cap, cap.stand, 0.04);
await wait(30);
l = await log();
check(l.cut === 2 && (await phase(cap.i)) === 'taken', `5: a slice through its stems took it (${(await lines()).at(-1)})`);
check((await count('duskcap')) === 2 && (await count('hearthleaf')) === 2, `5: 2 Duskcap and 2 Hearthleaf in the bag (${await count('duskcap')}, ${await count('hearthleaf')})`);
check((await herbalism()) === 2, `5: Herbalism 2 (${await herbalism()})`);
await shot('5-duskcap-taken');
await gripInLoop();

// ─── 6. Both learned: the pick at a vein, the knife at a clump ───
await page.evaluate(() => window.__descent.professions.learn('mining'));
const vein = await spot('smithy-east', 1.4);
await stand(vein.stand, vein);
await run([{ p: await rest(), hold: 10 }]);
await gripInLoop();
const atVein = await hands();
await gripInLoop();
const leaf = await spot('hearthleaf-road-south');
await stand(leaf.stand, leaf);
await run([{ p: await rest(), hold: 10 }]);
await gripInLoop();
const atLeaf = await hands();
check(atVein.drawn === 'pick' && atVein.pick && atLeaf.drawn === 'knife' && atLeaf.knife, `6: with Mining and Herbalism, the pick at a vein (${atVein.drawn}) and the knife at a clump (${atLeaf.drawn})`);
await gripInLoop();
check(!(await hands()).drawn, '6: and a grip in the loop put the knife back');

// ─── 7. Growing back ───
// By the house west of the crossroads, well over 30 m from both.
await stand({ x: -8, z: -2 }, { x: 1.5, z: 4.8 });
await page.evaluate(() => {
  const d = window.__descent;
  for (let s = 0; s < 181; s += 1) {
    d.player.hp = d.player.maxHp;
    d.step(1, 1 / 30);
  }
});
await wait(3);
const grown = [await phase(field.i), await phase(cap.i)];
check(grown.every((p) => p === 'full'), `7: 180 s on and 30 m off, both clumps grew back (${grown.join(', ')})`);

// ─── 8. The prototype ───
const proto = await context.newPage();
proto.on('pageerror', (e) => errors.push(`?proto=pick: ${e.message}`));
await proto.goto(`${base}/?proto=pick&variant=C&emulate&nodevui`);
await proto.waitForFunction(() => window.__descent?.proto, null, { timeout: 180000 });
const protoRan = await proto.evaluate(() => {
  const p = window.__descent.proto;
  p.cut(false);
  p.cut(true);
  p.step(1);
  return { variant: p.variant, taken: p.herb.taken };
});
check(protoRan.variant === 'C' && protoRan.taken, `8: ?proto=pick still runs: variant C's Hearthleaf is cut with the game's knife sounds (${JSON.stringify(protoRan)})`);
await proto.close();

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
console.log((await lines()).map((x) => `     ${x}`).join('\n'));
await browser.close();
process.exit(failed ? 1 : 0);
