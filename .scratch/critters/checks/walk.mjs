// The crawlers and critters in the game, at walking height, in headless
// Chromium with the IWER emulator. Start `npx vite --port 5173` first, then:
//
//   node .scratch/critters/checks/walk.mjs [http://localhost:5173] [shots/]
//
// The Adventure at the plain URL, paused, stepped by `__descent.step` (and
// `teleport`). No zone places its biters yet (their camps wait on the zone
// threads), so the leeches and adders are put where the inhabitant specs put
// them, as camps added by hand; so are the Sallows' frogs and Aldhaven's rats.
// Brackenmoor's hares are the zone's own. What it checks, and shoots:
//
// 1. Brackenmoor's hare sits about its spot, sits up to watch you, and bolts.
// 2. The Blackmire's mire leeches lie at the surface of their pool, come at
//    you through the water and lunge at your shins.
// 3. An adder on the Long Stones ridge does the same on dry ground.
// 4. The Sallows: fen leeches in the Gibbet Willow's moat, the Old Mother off
//    the Dyke Path, frogs on a pool's bank that leap in as you come.
// 5. Aldhaven: a gutter rat along a house wall that scurries off.
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
const shot = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });
const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
/** Stand at (x, z) looking towards (tx, tz), and let the chunks round you come in. */
const standLooking = async (x, z, tx, tz, settle = 0.5) => {
  await page.evaluate(([x, z, yaw]) => window.__descent.teleport(x, z, yaw), [x, z, yawTo(x, z, tx, tz)]);
  await step(settle);
  for (let i = 0; i < 600; i++) {
    const pending = await page.evaluate(() => window.__descent.world.chunksPending + window.__descent.world.neighboursPending);
    if (pending === 0) break;
    await step(1 / 72);
    await xrFrames(1);
  }
  await xrFrames(3);
};
/**
 * Look from (x, z), at walking height, straight at the point (tx, ty, tz),
 * without moving the game on: what's there stays as it is.
 */
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
/** A spot on dry ground `r` m from (tx, tz), as near the bearing `a` (rad, 0 towards +Z) as there is one. */
const dryNear = (tx, tz, r, a = 0) =>
  page.evaluate(
    ([tx, tz, r, a]) => {
      const w = window.__descent.world;
      for (let k = 0; k < 32; k++) {
        const b = a + Math.ceil(k / 2) * (k % 2 ? 1 : -1) * (Math.PI / 16);
        const x = tx + Math.sin(b) * r;
        const z = tz + Math.cos(b) * r;
        if (w.waterAt(x, z) == null) return { x, z };
      }
      return { x: tx + Math.sin(a) * r, z: tz + Math.cos(a) * r };
    },
    [tx, tz, r, a],
  );
/** Look at (tx, ty, tz) from dry ground `r` m off, towards bearing `a`. */
const lookFromBank = async (tx, ty, tz, r, a = 0) => {
  const at = await dryNear(tx, tz, r, a);
  await lookAt(at.x, at.z, tx, ty, tz);
  return at;
};
const levelHead = () => page.evaluate(() => Object.assign(window.__descent.device.quaternion, { x: 0, y: 0, z: 0, w: 1 }));

/** Biters near you: where, their state, and how high over the ground and water they lie. */
const biters = () =>
  page.evaluate(() => {
    const d = window.__descent;
    return d.camps.enemies
      .filter((e) => e.kind === 'biter')
      .map((e) => ({
        family: e.family,
        length: e.rig.proportions.length,
        x: e.position.x,
        y: e.position.y,
        z: e.position.z,
        state: e.state,
        attacking: e.attacking,
        ground: d.world.heightAt(e.position.x, e.position.z),
        water: d.world.waterAt(e.position.x, e.position.z),
      }));
  });
const health = () => page.evaluate(() => window.__descent.player.hp);

/** Add one camp of biters, lazily as another zone's, standing on the world. */
const addCamp = (id, level, posts) =>
  page.evaluate(
    ([id, level, posts]) => {
      const d = window.__descent;
      const x = posts.reduce((s, p) => s + p.x, 0) / posts.length;
      const z = posts.reduce((s, p) => s + p.z, 0) / posts.length;
      d.camps.add([{ id, place: { x, z, r: 6 }, level, posts }], d.world, true);
    },
    [id, level, posts],
  );
const leech = (x, z, yaw = 0, variant) => ({ behaviour: 'biter', family: 'leech', x, z, yaw, variant });
const adder = (x, z, yaw = 0) => ({ behaviour: 'biter', family: 'snake', x, z, yaw });

/** Turn your head (not your body) to look at (tx, ty, tz). */
const turnHeadTo = (tx, ty, tz) =>
  page.evaluate(
    ([tx, ty, tz]) => {
      const d = window.__descent;
      const rig = d.player.rig;
      const head = d.device.position;
      // The head in the world: the rig turned by its yaw, then moved.
      const c = Math.cos(rig.rotation.y);
      const s = Math.sin(rig.rotation.y);
      const hx = rig.position.x + head.x * c + head.z * s;
      const hz = rig.position.z - head.x * s + head.z * c;
      const hy = rig.position.y + head.y;
      const yaw = Math.atan2(-(tx - hx), -(tz - hz)) - rig.rotation.y;
      const pitch = -Math.atan2(hy - ty, Math.hypot(tx - hx, tz - hz));
      const E = d.camera.rotation.constructor;
      const q = new (d.camera.quaternion.constructor)().setFromEuler(new E(pitch, yaw, 0, 'YXZ'));
      Object.assign(d.device.quaternion, { x: q.x, y: q.y, z: q.z, w: q.w });
    },
    [tx, ty, tz],
  );
/**
 * Step the game until a biter is lunging at you (its strike out), looking at
 * it as it comes, and shoot it from where you stand; then from beside it.
 * Returns where it was, when, and the health you lost.
 */
const shootLunge = async (name, max = 8) => {
  const before = await health();
  for (let t = 0; t < max; t += 1 / 24) {
    await step(1 / 24);
    const b = await page.evaluate(() => {
      const d = window.__descent;
      const near = d.camps.enemies
        .filter((e) => e.kind === 'biter' && e.state !== 'dead')
        .sort((a, b) => a.position.distanceTo(d.player.rig.position) - b.position.distanceTo(d.player.rig.position))[0];
      return near && { x: near.position.x, y: near.position.y, z: near.position.z, yaw: near.root.rotation.y, lunging: near.attacking && near.phase === 'active' };
    });
    if (!b) continue;
    await turnHeadTo(b.x, b.y, b.z);
    if (b.lunging) {
      await xrFrames(2);
      await shot(`${name}-yours`);
      const lost = before - (await health());
      // From its side, 1.6 m off, a little ahead of it.
      const side = b.yaw + Math.PI / 2;
      const ax = b.x + Math.sin(side) * 1.6 + Math.sin(b.yaw) * 0.3;
      const az = b.z + Math.cos(side) * 1.6 + Math.cos(b.yaw) * 0.3;
      await lookAt(ax, az, b.x + Math.sin(b.yaw) * 0.3, b.y, b.z + Math.cos(b.yaw) * 0.3);
      await shot(`${name}-side`);
      return { lost, at: t, ...b };
    }
  }
  return null;
};

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 180000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => {
  const d = window.__descent;
  d.paused = true;
  // Hands lowered out of view, for the screenshots.
  Object.assign(d.device.controllers.left.position, { x: -0.3, y: -1, z: 0.9 });
  Object.assign(d.device.controllers.right.position, { x: 0.3, y: -1, z: 0.9 });
});

// 1. Brackenmoor's hare at (-20, 480), on open grass.
const HARE = { x: -20, z: 480 };
await standLooking(HARE.x, HARE.z + 30, HARE.x, HARE.z, 1);
const hare = () =>
  page.evaluate(() => {
    const c = window.__descent.critters.placed.find((c) => c.plan.look === 'hare' && c.plan.x === -20);
    return c && { x: c.position.x, z: c.position.z, state: c.state, frame: c.frame, shown: window.__descent.critters.shown.includes(c) };
  });
await step(4);
let h = await hare();
check(h?.shown && h.state === 'about', `the hare is drawn, sitting about its spot 30 m off (${h?.state}, ${h?.frame})`);
await lookAt(h.x + 1.2, h.z + 2.2, h.x, 0.15 + (await page.evaluate(([x, z]) => window.__descent.world.heightAt(x, z), [h.x, h.z])), h.z);
await shot('01-hare-about');
// Walk to 9 m: it sits up and watches.
await levelHead();
await page.evaluate(([x, z, yaw]) => window.__descent.teleport(x, z, yaw), [h.x, h.z + 9, 0]);
await step(1.5);
h = await hare();
check(h.state === 'watch' && h.frame === 'up', `at 9 m it sits up to watch you (${h.state}, ${h.frame})`);
const hy = await page.evaluate(([x, z]) => window.__descent.world.heightAt(x, z), [h.x, h.z]);
await lookAt(h.x + 0.6, h.z + 2.2, h.x, hy + 0.2, h.z);
await shot('02-hare-watch');
// Step in to 5 m: it bolts. Shot mid-bolt, from where you stand.
await page.evaluate(([x, z, yaw]) => window.__descent.teleport(x, z, yaw), [h.x, h.z + 5, 0]);
await levelHead();
let leap = null;
for (let t = 0; t < 1.5 && !leap; t += 1 / 72) {
  await step(1 / 72);
  const c = await hare();
  if (c.state === 'flee' && c.frame === 'leap' && t > 0.4) leap = c;
}
check(leap != null, `at 5 m it bolts (${(await hare()).state})`);
if (leap) {
  await lookAt(leap.x + 2.4, leap.z + 0.8, leap.x, hy + 0.2, leap.z);
  await shot('03-hare-bolt');
}
await levelHead();

// 2. The Blackmire's mire leeches, level 8, in the pools' shallows.
const MIRE = [leech(-116, 395, 0.4), leech(-122, 385, 2.2), leech(-147, 408, -1)];
await standLooking(-110, 404, -116, 395, 1);
await addCamp('brackenmoor-blackmire-test', 8, MIRE);
await step(1);
let bs = await biters();
check(bs.length === 3, `three leeches raised in the Blackmire (${bs.length})`);
for (const b of bs) {
  const awash = b.water != null && b.y > b.ground && b.y < b.water && b.y > b.water - 0.02;
  check(b.water == null || awash, `a leech at (${b.x.toFixed(0)}, ${b.z.toFixed(0)}): ${b.water == null ? 'on dry ground' : `swimming, belly ${((b.water - b.y) * 100).toFixed(1)} cm under the surface ${b.water.toFixed(2)} over bed ${b.ground.toFixed(2)}`}`);
}
const near = bs[0];
await lookFromBank(near.x, near.y, near.z, 2.2, 0.6);
await shot('04-leech-blackmire');
await levelHead();
// You stand on the bank 5 m off: it notices you and comes on through the water, and lunges.
const bank5 = await dryNear(near.x, near.z, 5, 0.6);
await standLooking(bank5.x, bank5.z, near.x, near.z, 0.05);
let lunge = await shootLunge('05-leech-lunge');
check(lunge != null, `a leech closes in and lunges (after ${lunge?.at.toFixed(1)} s, ${lunge?.lost?.toFixed(0)} health lost)`);
await page.evaluate(() => (window.__descent.player.hp = window.__descent.player.maxHp));
await levelHead();

// 3. An adder on the Long Stones ridge at (58, 304), level 6.
await standLooking(58, 316, 58, 304, 1);
await addCamp('brackenmoor-long-stones-test', 6, [adder(58, 304, 2.6)]);
await step(1);
bs = (await biters()).filter((b) => b.family === 'snake');
check(bs.length === 1 && bs[0].water == null && Math.abs(bs[0].y - bs[0].ground) < 0.01, `an adder lies on the ridge (${bs.map((b) => b.y.toFixed(2)).join()})`);
await lookAt(bs[0].x + 1.1, bs[0].z + 1.7, bs[0].x, bs[0].y, bs[0].z);
await shot('06-adder');
await levelHead();
await standLooking(bs[0].x + 1.5, bs[0].z + 5, bs[0].x, bs[0].z, 0.05);
lunge = await shootLunge('07-adder-lunge');
check(lunge != null, `the adder closes in and strikes (after ${lunge?.at.toFixed(1)} s, ${lunge?.lost?.toFixed(0)} health lost)`);
await page.evaluate(() => (window.__descent.player.hp = window.__descent.player.maxHp));
await levelHead();

// 4. The Sallows: the Gibbet Willow's moat (fen leeches, level 11) and the Old Mother off the Dyke Path.
const MOAT = [leech(311.5, 651.5, 0, 1), leech(323, 633.5, 0, 1), leech(310, 640, 0, 1), leech(318, 656.5, 0, 1)];
await standLooking(300, 652, 311.5, 651.5, 1);
await addCamp('sallows-gibbet-moat-test', 11, MOAT);
await step(1);
bs = (await biters()).filter((b) => Math.abs(b.x - 315) < 15);
check(bs.length === 4 && bs.every((b) => b.water != null), `four fen leeches swimming in the moat (${bs.map((b) => (b.water == null ? 'dry' : 'wet')).join()})`);
const fen = bs[0];
await lookFromBank(fen.x, fen.y, fen.z, 2, -1.6);
await shot('08-fen-leech-moat');
await levelHead();

await standLooking(450, 656, 450, 644.5, 1);
await addCamp('sallows-old-mother-test', 12, [leech(450, 644.5, 0.3, 2)]);
await step(1);
bs = (await biters()).filter((b) => Math.abs(b.x - 450) < 10);
check(bs.length === 1 && bs[0].length > 0.8, `the Old Mother Leech, twice the size (${bs[0]?.length} m, ${bs[0]?.water == null ? 'dry' : 'in water'})`);
await lookFromBank(bs[0].x, bs[0].y, bs[0].z, 2.6, 0.5 + Math.PI);
await shot('09-old-mother');
await lookFromBank(bs[0].x, bs[0].y, bs[0].z, 2.6, -1.2);
await shot('09-old-mother-b');
await levelHead();
const bank6 = await dryNear(bs[0].x, bs[0].z, 5, 0.5);
await standLooking(bank6.x, bank6.z, bs[0].x, bs[0].z, 0.05);
lunge = await shootLunge('10-old-mother-lunge');
check(lunge != null, `the Old Mother closes in and lunges (after ${lunge?.at.toFixed(1)} s, ${lunge?.lost?.toFixed(0)} health lost)`);
await page.evaluate(() => (window.__descent.player.hp = window.__descent.player.maxHp));
await levelHead();

// Frogs on a pool's bank near the beck pool by the Last Stone (290.5, 534): find the bank, face them into the water.
const bank = await page.evaluate(() => {
  const w = window.__descent.world;
  const out = [];
  for (let a = 0; a < Math.PI * 2 && out.length < 4; a += Math.PI / 10) {
    for (let r = 0.5; r < 9; r += 0.25) {
      const x = 290.5 + Math.cos(a) * r;
      const z = 534 + Math.sin(a) * r;
      if (w.waterAt(x, z) == null) {
        // Its first dry spot going out from the pool, a little up the bank: face back towards the water.
        const bx = x + Math.cos(a) * 0.2;
        const bz = z + Math.sin(a) * 0.2;
        if (out.every((o) => Math.hypot(o.x - bx, o.z - bz) > 1.2)) out.push({ x: bx, z: bz, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) });
        break;
      }
    }
  }
  return out;
});
check(bank.length >= 3, `found the beck pool's bank (${bank.length} spots)`);
await page.evaluate((bank) => window.__descent.critters.add(bank.map((b) => ({ look: 'frog', ...b }))), bank);
const f0 = bank[0];
// Stand back 8 m on the dry side and let them settle.
const back = (d, side = 0) => ({ x: f0.x - Math.sin(f0.yaw) * d + Math.cos(f0.yaw) * side, z: f0.z - Math.cos(f0.yaw) * d - Math.sin(f0.yaw) * side });
let at = back(8);
await standLooking(at.x, at.z, f0.x, f0.z, 2);
const frogs = () =>
  page.evaluate(() =>
    window.__descent.critters.placed.filter((c) => c.plan.look === 'frog').map((c) => ({ x: c.position.x, y: c.position.y, z: c.position.z, state: c.state, frame: c.frame, hidden: c.hidden })),
  );
let fs = await frogs();
check(fs.every((f) => !f.hidden), `the frogs sit on the bank (${fs.map((f) => f.frame).join()})`);
at = back(1.3, 0.5);
await lookAt(at.x, at.z, f0.x, fs[0].y, f0.z);
await shot('11-frog-bank');
// Walk up to 3 m: it leaps in.
at = back(3);
await page.evaluate(([x, z, yaw]) => window.__descent.teleport(x, z, yaw), [at.x, at.z, f0.yaw + Math.PI]);
await levelHead();
let jump = null;
for (let t = 0; t < 1 && !jump; t += 1 / 72) {
  await step(1 / 72);
  const f = (await frogs())[0];
  if (f.frame === 'leap' && f.y > fs[0].y + 0.08) jump = f;
}
check(jump != null, 'the frog leaps as you come');
if (jump) {
  at = back(1.2, 1.4);
  await lookAt(at.x, at.z, jump.x, jump.y, jump.z);
  await shot('12-frog-leap');
}
await levelHead();
await step(1.5);
fs = await frogs();
check(fs[0].hidden, `the frog is gone into the pool (${fs.map((f) => (f.hidden ? 'gone' : f.state)).join()})`);

// 5. Aldhaven: gutter rats along house walls; find each wall and set the rat against it, facing along it.
const RATS = [
  { x: 414, z: 374 },
  { x: 446, z: 378 },
  { x: 408.8, z: 382.6 },
];
await standLooking(420, 390, 414, 374, 1);
const rats = await page.evaluate((spots) => {
  const w = window.__descent.world;
  const V = window.__descent.camera.position.constructor;
  return spots.map((s) => {
    // The wall: the nearest a small probe is pushed back from. The rat sits against it and runs along it.
    for (let r = 0.2; r < 4; r += 0.1) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) {
        const p = new V(s.x + Math.sin(a) * r, 0, s.z + Math.cos(a) * r);
        if (w.resolve(p, 0.05)) {
          const back = Math.max(0, r - 0.18);
          return { look: 'rat', x: s.x + Math.sin(a) * back, z: s.z + Math.cos(a) * back, yaw: a + Math.PI / 2, wall: r };
        }
      }
    }
    return { look: 'rat', x: s.x, z: s.z, yaw: 0, wall: null };
  });
}, RATS);
check(rats.every((r) => r.wall != null), `each rat's spot is by a wall, which the spec's spots are not always right against (${rats.map((r) => r.wall?.toFixed(1)).join(', ')} m)`);
await page.evaluate((rats) => window.__descent.critters.add(rats.map(({ wall, ...r }) => r)), rats);
await step(2);
const r0 = rats.reduce((a, b) => (b.wall != null && (a.wall == null || b.wall < a.wall) ? b : a));
const ry = await page.evaluate(([x, z]) => window.__descent.world.heightAt(x, z), [r0.x, r0.z]);
// From 1.8 m off the wall, a little along it.
const out = r0.yaw - Math.PI / 2 + Math.PI; // away from the wall
await lookAt(r0.x + Math.sin(out) * 1.6 + Math.sin(r0.yaw) * 0.8, r0.z + Math.cos(out) * 1.6 + Math.cos(r0.yaw) * 0.8, r0.x, ry + 0.05, r0.z);
await shot('13-rat-wall');
await levelHead();
await page.evaluate(([x, z, yaw]) => window.__descent.teleport(x, z, yaw), [r0.x + Math.sin(out) * 2 + Math.sin(r0.yaw) * 3, r0.z + Math.cos(out) * 2 + Math.cos(r0.yaw) * 3, 0]);
await step(0.3);
const rr = await page.evaluate((r0) => {
  const c = window.__descent.critters.placed.find((c) => c.plan.look === 'rat' && c.plan.x === r0.x);
  return { x: c.position.x, z: c.position.z, state: c.state, frame: c.frame, hidden: c.hidden };
}, r0);
check(rr.state === 'flee', `the rat scurries off along its wall (${rr.state}, ${rr.frame})`);
await lookAt(rr.x + Math.sin(out) * 1.6, rr.z + Math.cos(out) * 1.6, rr.x, ry + 0.05, rr.z);
await shot('14-rat-run');
await levelHead();

const cost = await page.evaluate(() => window.__descent.critters.cost);
console.log(`critters drawn: ${JSON.stringify(cost)}`);
if (errors.length) console.log('errors:', errors.slice(0, 5));
check(errors.length === 0, 'no errors on the page');
await browser.close();
process.exit(failed ? 1 : 0);
