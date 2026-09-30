// Checks for the tool loop and Mining in the Adventure
// (issues/13-the-tool-loop-and-mining.md) in headless Chromium with the IWER
// emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/professions/checks/mining.mjs [http://localhost:5173] [shots/]
//
// Oakvale at the plain URL (`?perf` on) for a new warrior who has learned
// Mining through the debug handle. The game is paused and stepped a thirtieth
// of a second per XR frame from inside the frame loop, the emulated right
// controller moved a frame at a time, so the grip in the loop and every swing
// go through the same detection as in the headset: the belt's frame placing
// the loop, the pick's head crossing into the vein's rock, the sword's
// committed-swing gate.
//
// 1. At the smithy's east vein, a grip in the loop behind the right hip draws
//    the pick: the sword goes away, the shield stays in the left hand.
// 2. Two swings on the glint break it: 3 copper ore and 1 rough stone to the
//    bag, Mining 1, the vein taken and dark. A tap and a strike off the ore
//    count nothing.
// 3. At the smithy's south vein, five plain swings on the ore break it: 6 ore
//    and 2 rough stone in the bag, Mining 2. A grip in the loop puts the pick
//    back and the sword comes home.
// 4. `?perf` there: the veins out of doors are one draw call (one per eye).
// 5. 10 m from every vein, a grip in the loop does nothing.
// 6. On the watchtower's hill, the pick drawn at its vein: stepping within
//    the gang's notice pulls them, the pick goes away and the sword is back
//    at once with one strong buzz, and the loop does nothing in the fight.
// 7. The taken smithy veins refill 180 s on, once you're 30 m off.
// 8. `?proto=pick` still runs. No page errors.
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
// point on what it holds (the pick's leading point, or the grip itself) is at
// a world point, turned so the pick's head lies along `along` (its leading
// point first), sets the squeeze, or waits (`hold` frames, or `until` a
// condition holds). Buzzes are counted.
await page.addInitScript(() => {
  const HELD = { point: [0, -0.17, -0.5], grip: [0, 0, 0] };
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
      // The pick's head along `along`: its leading point (grip −Y) first.
      const dir = new V(along.x, along.y, along.z).applyQuaternion(rigQ.clone().invert()).normalize();
      want = new Q().setFromUnitVectors(new V(0, -1, 0), dir);
    }
    const q = want.clone().multiply(off.clone().invert());
    Object.assign(c.quaternion, { x: q.x, y: q.y, z: q.z, w: q.w });
    // Where the held point sits from the controller, in the rig, once turned so.
    const local = new V(...HELD[what]);
    const gripPos = player.rig.worldToLocal(grip.getWorldPosition(new V()));
    const gripOff = gripPos.sub(new V(c.position.x, c.position.y, c.position.z)).applyQuaternion(ctrlQ.clone().invert()).applyQuaternion(q);
    const heldOff = gripOff.add(local.applyQuaternion(want));
    const r = player.rig.worldToLocal(new V(p.x, p.y, p.z));
    Object.assign(c.position, { x: r.x - heldOff.x, y: r.y - heldOff.y, z: r.z - heldOff.z });
  };
  window.__mine = {
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
const run = (steps) => page.evaluate((steps) => window.__mine.run(steps), steps);
const wait = (n) => run([{ hold: n }]);
const count = (id) => page.evaluate((id) => window.__descent.state.inventory.count(id), id);
const mining = () => page.evaluate(() => window.__descent.state.professions.proficiency('mining'));
const log = () => page.evaluate(() => ({ ...window.__descent.adventure.gathering.log }));
const lines = () => page.evaluate(() => [...window.__descent.adventure.gathering.lines]);
const hands = () =>
  page.evaluate(() => {
    const { adventure, player } = window.__descent;
    const { left, right } = player.input.hands;
    return {
      drawn: adventure.gathering.drawn,
      pick: adventure.gathering.pick.model.parent === right.grip,
      sword: player.sword.model.parent === right.grip && !player.sword.away,
      shield: player.shield.model.parent === left.grip && !player.shield.away,
    };
  });
/** A vein by id: its index, where it stands, and where you stand before its ore facing it. */
const vein = (id) =>
  page.evaluate((id) => {
    const g = window.__descent.adventure.gathering;
    const i = g.veins.veins.findIndex((v) => v.plan.id === id);
    const v = g.veins.veins[i];
    const { x, z, yaw } = v.plan;
    const out = 1.35;
    return { i, x, z, yaw, stand: { x: x + Math.sin(yaw) * out, z: z + Math.cos(yaw) * out } };
  }, id);
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
 * Where to strike vein `i` now: in its glint, or on its ore clear of the glint
 * (`plain`), or on its rock off the ore (`stone`); with the way in (its normal there).
 */
const target = (i, where) =>
  page.evaluate(
    ({ i, where }) => {
      const g = window.__descent.adventure.gathering;
      const V = g.veins.veins[i];
      const Vec = V.ore.constructor;
      const R = window.__descent.CONFIG.professions.vein.rockRadius;
      const glint = g.veins.glint(i, new Vec());
      let at = glint;
      if (where !== 'glint') {
        const side = new Vec().crossVectors(new Vec(0, 1, 0), V.normal).normalize();
        const up = new Vec().crossVectors(V.normal, side);
        const reach = where === 'stone' ? 0.5 : 0.13;
        const ring = Array.from({ length: 8 }, (_, k) => {
          const a = (k / 8) * Math.PI * 2;
          return V.ore.clone().sub(V.centre).addScaledVector(side, Math.cos(a) * reach).addScaledVector(up, Math.sin(a) * reach).setLength(R).add(V.centre);
        });
        at = ring.sort((a, b) => b.distanceTo(glint) - a.distanceTo(glint))[0];
      }
      const n = at.clone().sub(V.centre).normalize();
      return { at: { x: at.x, y: at.y, z: at.z }, n: { x: n.x, y: n.y, z: n.z } };
    },
    { i, where },
  );
/** Swing the pick's head into vein `i` at `where`, `step` m a frame along the rock's normal there (0.13 = 3.9 m/s), and draw it back out. */
async function swing(i, where, step = 0.13) {
  const { at, n } = await target(i, where);
  const along = { x: -n.x, y: -n.y, z: -n.z };
  const out = (k) => ({ x: at.x + n.x * k, y: at.y + n.y * k, z: at.z + n.z * k });
  const steps = [{ what: 'point', p: out(0.6), along, hold: 4 }];
  for (let k = 0.6 - step; k > -0.08; k -= step) steps.push({ what: 'point', p: out(k), along });
  steps.push({ what: 'point', p: out(-0.08), along, hold: 2 });
  for (let k = 1; k <= 12; k++) steps.push({ what: 'point', p: out(-0.08 + (0.68 * k) / 12), along });
  steps.push({ what: 'point', p: out(0.6), along, hold: 5 });
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
  d.professions.learn('mining');
  const pulse = d.player.input.pulse.bind(d.player.input);
  d.player.input.pulse = (hand, intensity, ms) => {
    window.__mine.buzzes.push({ hand, intensity, ms });
    return pulse(hand, intensity, ms);
  };
});
const east = await vein('smithy-east');
const south = await vein('smithy-south');
await stand(east.stand, east);
// The shield hand low on your left, out of the way.
const low = await page.evaluate(() => {
  const { camera } = window.__descent;
  const p = camera.localToWorld(new camera.position.constructor(-0.3, -0.6, -0.1));
  return { x: p.x, y: p.y, z: p.z };
});
await run([{ hand: 'left', p: low }, { p: await rest(), hold: 10 }]);
const start = await hands();
check(!start.drawn && start.sword && start.shield, '1: at the smithy’s east vein, sword and shield in your hands');
check((await page.evaluate(() => window.__descent.adventure.gathering.loop.root.visible)), '1: the tool loop hangs behind your right hip with Mining learned');

// ─── 1. Drawing the pick ───
await gripInLoop();
let h = await hands();
check(h.drawn === 'pick' && h.pick && !h.sword && h.shield, '1: a grip in the loop drew the pick; the sword went away and the shield stayed');
await shot('1-pick-drawn');

// ─── 2. Two strikes in the glint ───
await swing(east.i, 'glint', 0.02);
let l = await log();
check(l.taps >= 1 && l.strikes === 0, `2: a slow swing is only a tap (${l.taps} taps)`);
await swing(east.i, 'stone');
l = await log();
check(l.stone === 1 && l.strikes === 0, '2: a hot strike off the ore counts nothing');
await swing(east.i, 'glint');
l = await log();
check(l.glints === 1 && l.broken === 0, `2: the first swing in the glint counted (${(await lines()).at(-1)})`);
await shot('2-vein-cracked');
await swing(east.i, 'glint');
l = await log();
check(l.glints === 2 && l.broken === 1, `2: the second broke the vein (${(await lines()).at(-1)})`);
await wait(30);
check((await count('copper-ore')) === 3 && (await count('rough-stone')) === 1, `2: 3 copper ore and 1 rough stone to the bag (${await count('copper-ore')}, ${await count('rough-stone')})`);
check((await mining()) === 1, `2: Mining 1 (${await mining()})`);
check((await page.evaluate((i) => window.__descent.adventure.gathering.states.phase(i), east.i)) === 'taken', '2: the vein is taken');
await shot('2-vein-taken');

// ─── 3. Five plain strikes ───
await stand(south.stand, south);
await run([{ p: await rest(), hold: 5 }]);
check((await hands()).drawn === 'pick', '3: still holding the pick at the smithy’s south vein');
for (let k = 1; k <= 5; k++) await swing(south.i, 'plain');
l = await log();
check(l.strikes === 7 && l.glints === 2 && l.broken === 2, `3: five plain swings on the ore broke it (${l.strikes - 2} counted)`);
await wait(30);
check((await count('copper-ore')) === 6 && (await count('rough-stone')) === 2, `3: 6 copper ore and 2 rough stone in the bag (${await count('copper-ore')}, ${await count('rough-stone')})`);
check((await mining()) === 2, `3: Mining 2 (${await mining()})`);
await gripInLoop();
h = await hands();
check(!h.drawn && !h.pick && h.sword && h.shield, '3: a grip in the loop put the pick back, and the sword is home');

// ─── 4. ?perf: the veins are one draw call ───
await stand({ x: south.x + Math.sin(south.yaw) * 3.5, z: south.z + Math.cos(south.yaw) * 3.5 }, { x: (east.x + south.x) / 2, z: (east.z + south.z) / 2 });
await wait(20);
const perf = await page.evaluate(async () => {
  const d = window.__descent;
  const mesh = d.adventure.gathering.veins.outdoors;
  let draws = 0;
  mesh.onBeforeRender = () => draws++;
  const frame = () => new Promise((r) => d.renderer.xr.getSession().requestAnimationFrame(() => setTimeout(r, 0)));
  await frame();
  await frame();
  draws = 0;
  await frame();
  const withVeins = { calls: d.renderer.info.render.calls, draws };
  mesh.visible = false;
  await frame();
  await frame();
  const without = d.renderer.info.render.calls;
  mesh.visible = true;
  mesh.onBeforeRender = () => {};
  return { ...withVeins, without, instances: mesh.count };
});
check(perf.draws === 2 && perf.calls - perf.without === 2, `4: ?perf from the smithy's veins: all ${perf.instances} veins out of doors are one draw call per eye (${perf.calls} calls, ${perf.without} without them)`);
await shot('4-perf');

// ─── 5. Far from every vein ───
await stand({ x: 0.2, z: 1.5 }, { x: 1.5, z: 4.8 });
await run([{ p: await rest(), hold: 30 }]);
const far = await page.evaluate(() => {
  const d = window.__descent;
  const h = d.camera.getWorldPosition(d.camera.position.clone());
  return Math.min(...d.adventure.gathering.veins.veins.map((v) => Math.hypot(v.plan.x - h.x, v.plan.z - h.z)));
});
const before = await log();
await gripInLoop();
l = await log();
h = await hands();
check(far >= 10 && l.nothing === before.nothing + 1 && l.drawn === before.drawn && !h.drawn && h.sword, `5: ${far.toFixed(1)} m from any vein, a grip in the loop does nothing`);

// ─── 6. A pull ───
const tower = await vein('watchtower');
// On the vein's far side from the gang, out of their notice.
const behind = { x: tower.x + Math.sin(tower.yaw + Math.PI) * 1.7, z: tower.z + Math.cos(tower.yaw + Math.PI) * 1.7 };
await stand(behind, tower);
await run([{ p: await rest(), hold: 30 }]);
check(!(await page.evaluate(() => window.__descent.adventure.camps.fighting)), '6: behind the watchtower’s vein, the gang hasn’t seen you');
await gripInLoop();
check((await hands()).drawn === 'pick', '6: the pick drawn at the watchtower’s vein');
const buzzesBefore = await page.evaluate(() => window.__mine.buzzes.length);
await stand(tower.stand, tower);
await run([{ p: await rest(), until: 'd.adventure.camps.fighting' }, { p: await rest(), hold: 2 }]);
h = await hands();
const pulledBuzz = await page.evaluate((n) => window.__mine.buzzes.slice(n).filter((b) => b.intensity >= 1 && b.ms >= 120).length, buzzesBefore);
l = await log();
check(!h.drawn && !h.pick && h.sword && l.pulled === 1 && pulledBuzz === 1, `6: the pull put the pick away and the sword back at once, with one strong buzz (${pulledBuzz})`);
const fightBefore = await log();
await run([{ p: await rest(), hold: 30 }]);
await gripInLoop();
l = await log();
check(!(await hands()).drawn && l.nothing === fightBefore.nothing + 1, '6: in the fight the loop does nothing');

// ─── 7. Refilling ───
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
const refilled = await page.evaluate(({ a, b }) => {
  const s = window.__descent.adventure.gathering.states;
  return [s.phase(a), s.phase(b)];
}, { a: east.i, b: south.i });
check(refilled.every((p) => p === 'full'), `7: 180 s on and 30 m off, both smithy veins refilled (${refilled.join(', ')})`);

// ─── 8. The prototype ───
const proto = await context.newPage();
proto.on('pageerror', (e) => errors.push(`?proto=pick: ${e.message}`));
await proto.goto(`${base}/?proto=pick&variant=C&emulate&nodevui`);
await proto.waitForFunction(() => window.__descent?.proto, null, { timeout: 180000 });
const protoRan = await proto.evaluate(() => {
  const p = window.__descent.proto;
  p.useLoop();
  const drawn = p.drawn;
  p.strike('glint', 3);
  p.strike('glint', 3);
  p.step(1);
  return { drawn, variant: p.variant, broken: p.vein.broken };
});
check(!!protoRan.drawn && protoRan.variant === 'C' && protoRan.broken, `8: ?proto=pick still runs: variant C's loop draws a tool and two glint strikes break its vein (${JSON.stringify(protoRan)})`);
await proto.close();

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
console.log((await lines()).map((x) => `     ${x}`).join('\n'));
await browser.close();
process.exit(failed ? 1 : 0);
