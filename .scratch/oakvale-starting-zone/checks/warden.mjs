// Checks for the Warden and What Lies Below (issues/28-the-warden-and-what-lies-below.md)
// in headless Chromium with the IWER emulator. Start `npx vite --port 5173` first, then:
//
//   node .scratch/oakvale-starting-zone/checks/warden.mjs [http://localhost:5173] [shots/]
//
// The Adventure at the plain URL for a new character, paused and stepped in
// the page (`step`, `teleport`); the chain's first two quests are played as
// events, and the mine's undead are cut down where they stand. What it checks:
//
// 1. With What Lies Below under way, the Warden sits slumped on its throne,
//    level 5 with 1,080 health, and stays there while you stand in the
//    antechamber and in the gate.
// 2. Step through the gate and it rises; while it's up only two may swing at
//    you. Walk back out and it walks back to its throne whole and sits again.
// 3. Beat it: "Return to Marshal Hale". Hand in to Hale: 300 XP, level 5,
//    Hale's longsword in your hand (2.0 damage), gone from Hale's hip, Hale
//    pointing you to Brackenmoor with no marker.
// 4. A reload: the longsword still in your hand, Hale without it, and in
//    the hall an empty throne.
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
const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const page = await context.newPage();
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
/** A screenshot of what you see; unless `hands`, with your sword and shield lowered out of view. */
const shot = async (name, hands = false) => {
  if (!shots) return;
  const held = await page.evaluate((hands) => {
    const { left, right } = window.__descent.device.controllers;
    const was = [left, right].map(({ position: p }) => [p.x, p.y, p.z]);
    if (!hands) {
      Object.assign(left.position, { x: -0.3, y: -1, z: 0.2 });
      Object.assign(right.position, { x: 0.3, y: -1, z: 0.2 });
    }
    return was;
  }, hands);
  await xrFrames(3);
  await page.screenshot({ path: `${shots}/${name}.png` });
  await page.evaluate((was) => {
    const { left, right } = window.__descent.device.controllers;
    [left, right].forEach(({ position: p }, i) => Object.assign(p, { x: was[i][0], y: was[i][1], z: was[i][2] }));
  }, held);
  await xrFrames(2);
};
/** Run the game `s` seconds, your health kept full. */
const step = (s) =>
  page.evaluate((s) => {
    const { adventure } = window.__descent;
    for (let t = 0; t < s - 1e-9; t += 1 / 72) {
      if (adventure.player.alive) adventure.player.hp = adventure.player.maxHp;
      adventure.update(1 / 72);
    }
  }, s);

/** Stand at (lx, lz) in the mine mouth's frame, facing the point (tx, tz) in it, looking up by `pitch`. */
async function standIn(lx, lz, tx, tz, pitch = 0) {
  await page.evaluate(
    ([lx, lz, tx, tz, pitch]) => {
      const { x: fx, z: fz, yaw } = window.__descent.world.mine.mouth;
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const toWorld = (a, b) => [fx + a * c + b * s, fz - a * s + b * c];
      const [x, z] = toWorld(lx, lz);
      const [X, Z] = toWorld(tx, tz);
      window.__descent.teleport(x, z, Math.atan2(-(X - x), -(Z - z)));
      const q = window.__descent.device.quaternion;
      Object.assign(q, { x: Math.sin(pitch / 2), y: 0, z: 0, w: Math.cos(pitch / 2) });
    },
    [lx, lz, tx, tz, pitch],
  );
  await xrFrames(2);
  await step(1 / 72);
}

/** The throne, the Warden, you, the state and Hale, as a player would notice them. */
const look = () =>
  page.evaluate(() => {
    const { adventure, state, world, player } = window.__descent;
    const { throne, hale } = adventure;
    const w = throne.body;
    const m = world.mine;
    const { seat } = m.throne;
    return {
      throne: throne.state,
      bodies: throne.enemies.length,
      warden: w && {
        state: w.state,
        level: w.level,
        hp: w.hp,
        maxHp: w.maxHp,
        hittable: w.hittable,
        seated: w.seated,
        onSeat: Math.hypot(w.position.x - seat.x, w.position.z - seat.z),
        drawn: w.root.visible && throne.root.visible,
      },
      melee: adventure.camps.meleeTokens.max,
      onThrone: state.wardenSeated,
      beaten: state.wardenBeaten,
      tracker: state.tracker,
      hale: state.hale,
      level: state.level,
      xp: state.xp,
      sword: state.sword,
      inHand: player.sword.sword,
      damage: player.stats.damage,
      atHip: hale.swordAtHip,
      interior: world.interior,
    };
  });

async function enter(query = '') {
  await page.goto(`${base}/?emulate&nodevui${query}`);
  await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  await page.evaluate(() => (window.__descent.paused = true));
}

await enter();
// Where a new character starts, looking at Hale: to look at them from again.
const start = await page.evaluate(() => {
  const { player } = window.__descent;
  return { x: player.rig.position.x, z: player.rig.position.z };
});
/** Stand `d` m from Hale on the way to where you started, facing them. */
const faceHale = (d) =>
  page.evaluate(
    ([start, d]) => {
      const h = window.__descent.adventure.hale.position;
      const len = Math.hypot(start.x - h.x, start.z - h.z);
      const x = h.x + ((start.x - h.x) / len) * d;
      const z = h.z + ((start.z - h.z) / len) * d;
      window.__descent.teleport(x, z, Math.atan2(-(h.x - x), -(h.z - z)));
      const q = window.__descent.device.quaternion;
      Object.assign(q, { x: Math.sin(-0.12), y: 0, z: 0, w: Math.cos(-0.12) });
    },
    [start, d],
  );

// The chain's first two quests, as the events they are, then What Lies Below taken.
await page.evaluate(() => {
  const { adventure } = window.__descent;
  const at = adventure.hale.position;
  const kill = (camp, level, role = 'ordinary') => adventure.apply({ kind: 'kill', camp, level, role, family: 'bandit', seed: 1 }, at);
  adventure.apply({ kind: 'accept' }, at);
  for (let i = 0; i < 3; i++) kill('farm', 1);
  adventure.apply({ kind: 'handIn' }, at);
  adventure.apply({ kind: 'accept' }, at);
  for (let i = 0; i < 4; i++) kill('lumberCamp', 2);
  kill('lumberCamp', 2, 'leader');
  adventure.apply({ kind: 'pickup', item: 'orders' }, at);
  adventure.apply({ kind: 'handIn' }, at);
  adventure.apply({ kind: 'accept' }, at);
});
await step(0.5);
let s = await look();
check(s.onThrone && s.tracker?.lines[0] === 'What woke the dead defeated: 0/1', `What Lies Below under way (${s.tracker?.lines})`);

// In through the mouth, and the mine's undead cut down where they stand (for their XP).
await standIn(0, 9, 0, 0);
await standIn(0, 3, 0, -5);
await page.evaluate(() => window.__descent.device.controllers.left.updateAxes('thumbstick', 0, -1));
await xrFrames(2);
await step(2.5);
await page.evaluate(() => window.__descent.device.controllers.left.updateAxes('thumbstick', 0, 0));
await xrFrames(2);
await step(2);
await page.evaluate(() => {
  const { camps, camera } = window.__descent;
  const Vector3 = camera.position.constructor;
  for (const m of camps.camps.find((c) => c.plan.id === 'mine').members) m.enemy.takeHit(1e6, new Vector3());
});
await step(1);
s = await look();
check(s.interior === 'mine' && s.level === 4, `in the mine, level 4 once its undead are down (${s.interior}, level ${s.level}, ${s.xp} XP)`);

// 1. The antechamber, then the gate, looking in at the throne.
await standIn(22, -31, 22, -52, 0.05);
await step(1);
s = await look();
check(s.throne === 'seated' && s.warden?.state === 'seated' && s.warden.onSeat < 1e-6, `the Warden sits on its throne (${s.throne}, ${s.warden?.state})`);
check(s.warden?.level === 5 && s.warden.maxHp === 1080 && s.warden.hp === 1080, `level 5 with 1,080 health (${s.warden?.level}, ${s.warden?.hp}/${s.warden?.maxHp})`);
check(s.warden?.drawn && !s.warden.hittable, `drawn from the antechamber, and out of reach (${s.warden?.drawn}, ${s.warden?.hittable})`);
await standIn(22, -37.7, 22, -52, 0.02);
await step(2);
s = await look();
check(s.throne === 'seated' && s.warden?.onSeat < 1e-6, `standing in the gate doesn't wake it (${s.throne})`);
await shot('24-the-warden-on-its-throne');

// 2. Through the gate: it rises.
await standIn(22, -40, 22, -52, 0.02);
s = await look();
check(s.throne === 'fighting', `it rises as you step through the gate (${s.throne})`);
check(s.melee === 2, `while it's up only two may swing at you (${s.melee})`);
await step(1.2);
await shot('25-the-warden-rises');
await step(1.5);
s = await look();
check(!s.warden?.seated && s.warden?.hittable, `up off its throne and fighting (${s.warden?.state})`);
await step(2);
await shot('26-the-warden-comes');
// Back out through the gate: it walks back and sits, whole.
await page.evaluate(() => window.__descent.adventure.throne.body.takeHit(300, new window.__descent.camera.position.constructor(), { ignorePoise: true }));
await standIn(22, -31, 22, -52, 0.02);
s = await look();
check(s.throne === 'resetting' && s.warden?.hp === s.warden?.maxHp && !s.warden.hittable, `out through the gate: it resets, whole and untouchable (${s.throne}, ${s.warden?.hp})`);
check(s.melee === 3, `the melee pool back to the camps' three once it's reset (${s.melee})`);
await step(15);
s = await look();
check(s.throne === 'seated' && s.warden?.state === 'seated' && s.warden.onSeat < 1e-6, `back on its throne (${s.throne}, ${s.warden?.state})`);

// 3. Beat it.
await standIn(22, -40, 22, -52, 0.02);
await step(3);
await page.evaluate(() => window.__descent.adventure.throne.body.takeHit(1e6, new window.__descent.camera.position.constructor(), { ignorePoise: true }));
await step(1 / 72);
await step(1 / 72);
s = await look();
check(s.beaten && s.throne === 'absent' && !s.onThrone, `beaten, and the throne's empty (${s.throne})`);
check(s.tracker?.lines.join() === 'Return to Marshal Hale' && s.hale.marker === 'ready', `"Return to Marshal Hale" (${s.tracker?.lines}, ${s.hale.marker})`);
await step(4);
s = await look();
check(s.bodies === 0, `its bones swept away (${s.bodies} bodies)`);

// Back to Hale, and hand in.
await faceHale(2.8);
await page.evaluate(() => {
  window.__descent.world.settle(null);
  window.__descent.step(1 / 72);
});
await step(1);
check((await look()).atHip, "Hale's sword still at their hip before the hand-in");
await shot('27-hale-before-the-hand-in');
await page.evaluate(() => window.__descent.adventure.apply({ kind: 'handIn' }, window.__descent.adventure.hale.position));
await step(0.5);
s = await look();
check(s.level === 5 && s.xp === 1000 && s.hale.marker === null, `300 XP: level 5, and no marker over Hale (${s.level}, ${s.xp})`);
check(s.sword === 'hale' && s.inHand === 'hale' && Math.abs(s.damage - 2) < 1e-9, `Hale's longsword in your hand, 2.0 damage (${s.inHand}, ${s.damage})`);
check(!s.atHip, "gone from Hale's hip");
check(s.hale.line.includes('Brackenmoor') && s.hale.line.includes('south'), `Hale points south to Brackenmoor ("${s.hale.line}")`);
await shot('28-hale-after-the-hand-in');

// 4. A reload.
await page.evaluate(() => window.__descent.adventure.saves.onLeaving());
await page.evaluate(() => window.__descent.saved());
await enter();
await faceHale(2.8);
await step(1);
s = await look();
check(s.beaten && s.sword === 'hale' && s.inHand === 'hale' && !s.atHip, `reloaded: beaten, the longsword in your hand, Hale without it (${s.inHand}, at hip ${s.atHip})`);
await shot('29-hale-without-their-sword');
// The longsword held up in view.
await page.evaluate(() => {
  const { right } = window.__descent.device.controllers;
  Object.assign(right.position, { x: 0.12, y: 1.3, z: -0.35 });
  Object.assign(right.quaternion, { x: -0.25, y: 0.62, z: 0.2, w: 0.72 });
});
await step(0.2);
await shot('30-the-longsword-in-hand', true);
// Down in the hall: an empty throne.
await standIn(22, -41, 22, -52, 0.05);
// (While paused, the page's frames keep stepping the World, so settle in the same breath as the step.)
await page.evaluate(() => {
  window.__descent.world.settle('mine');
  window.__descent.step(1 / 72);
});
await step(1);
s = await look();
check(s.throne === 'absent' && s.bodies === 0 && s.interior === 'mine', `in the hall, the throne is empty (${s.throne}, ${s.bodies} bodies)`);
await shot('31-the-empty-throne');

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
