// Checks for the Lumber Camp (issues/21-the-lumber-camp.md) in headless
// Chromium with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/oakvale-starting-zone/checks/lumber-camp.mjs [http://localhost:5173] [shots/]
//
// Game time is stepped through the debug handle (`paused`, `step`,
// `teleport`), not XR frames. Raiders in the Fields is the Hale check's
// business: here it goes straight into the Adventure as the board would send
// it. The Lumber Camp is taken and handed in with a fist on the board's
// buttons, its bandits are felled with a blow big enough to kill (their camp
// reports the kill as for any other), and the orders are taken by moving the
// left controller until its fist touches them.
//
// 1. With The Lumber Camp on offer at level 2, nothing lies in the leader's
//    tent, and a fist where the orders will be takes nothing. (Standing there
//    wakes the camp; the check waits for it to walk home before 3.)
// 2. "Accept" with the left fist: the tracker shows "The Lumber Camp",
//    "Bandits defeated at the lumber camp: 0/5" and "Leader's orders taken:
//    0/1", and the orders now lie on the crates just inside the tent's door.
// 3. The camp holds three bandit thugs, a bandit archer and their leader
//    (the big build, about 1.97 m, with a felling axe), at level 2.
// 4. Stand square behind the tent: the leader comes round it and swings at
//    you (you're kept at full health meanwhile), never walking through it.
// 5. Fell them: the leader pays 60 XP (triple), the others 20 each, and the
//    tracker counts 1/5 to 5/5. Hale's "?" stays grey: the orders are still
//    to find.
// 6. Walk up to the tent's door with the left stick: the tent stops you in
//    the doorway, with the orders on the crates just inside in arm's reach.
//    Touching them with the left fist takes them: the left hand buzzes, they're
//    gone, the tracker says "Return to Marshal Hale" and Hale's "?" turns
//    gold. Touching the spot again takes nothing.
// 7. "Hand in" at Hale with the right fist: "+120 XP" then "LEVEL 3" over
//    Hale, level 3 at 370 XP, Earthshaker's line, and Hale offers What Lies
//    Below.
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
const shot = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });
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

// Every canvas remembers what was written on it since it was last cleared, so
// the check can read the board, the tracker, the marker and the floats back.
await page.addInitScript(() => {
  const P = CanvasRenderingContext2D.prototype;
  const fill = P.fillText;
  const clear = P.clearRect;
  P.fillText = function (text, ...rest) {
    (this.__texts ??= []).push(String(text));
    return fill.call(this, text, ...rest);
  };
  P.clearRect = function (...args) {
    this.__texts = [];
    return clear.apply(this, args);
  };
});

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => {
  const d = window.__descent;
  d.paused = true;
  d.device.controllers.left.position.set(-0.4, 0.3, 0.2);
  d.device.controllers.right.position.set(0.4, 0.3, 0.2);
  // Count each buzz, by hand.
  d.buzzes = [];
  const input = d.player.input;
  const pulse = input.pulse.bind(input);
  input.pulse = (hand, i, ms) => {
    d.buzzes.push(hand);
    pulse(hand, i, ms);
  };
});
await xrFrames(2);

const HALE = await page.evaluate(() => {
  const { hale } = window.__descent.adventure;
  return { x: hale.position.x, y: hale.position.y, z: hale.position.z, headY: hale.headY };
});
const START = await page.evaluate(() => window.__descent.world.zoneAt(0, 0).spawn);
/** Where the orders lie (on the crates) and which way the tent faces. */
const ORDERS = await page.evaluate(() => window.__descent.world.zoneAt(0, 0).pickups.find((p) => p.item === 'orders'));
/** The tent's frame from the layout (the dev server serves its source): the orders lie `orders.z` in front of its centre, just inside its door at `hd`. */
const TENT = await page.evaluate(async () => (await import('/src/maps/forest/layout.ts')).TENT);
/** A point in the tent's own frame (door towards +z), in the world. */
const inTent = (lx, lz) => {
  const c = Math.cos(ORDERS.yaw);
  const s = Math.sin(ORDERS.yaw);
  const dz = lz - TENT.orders.z;
  return { x: ORDERS.x + lx * c + dz * s, z: ORDERS.z - lx * s + dz * c };
};

/** Stand at (x, z) facing (tx, tz); one XR frame brings the head there. */
async function standFacing(x, z, tx, tz) {
  await page.evaluate(([x, z, tx, tz]) => window.__descent.teleport(x, z, Math.atan2(-(tx - x), -(tz - z))), [x, z, tx, tz]);
  await xrFrames(2);
  await step(1 / 72);
}
/** Stand `d` metres from Hale on the line to the start, facing Hale. */
async function standByHale(d) {
  const dx = START.x - HALE.x;
  const dz = START.z - HALE.z;
  const k = d / Math.hypot(dx, dz);
  await standFacing(HALE.x + dx * k, HALE.z + dz * k, HALE.x, HALE.z);
}
/** What Hale, the board, the tracker and the orders show. */
const look = () =>
  page.evaluate(() => {
    const { adventure, state, buzzes } = window.__descent;
    const { board, tracker, hale, pickups } = adventure;
    const markerCtx = hale.marker.canvas.getContext('2d');
    return {
      marker: state.hale.marker,
      markerShown: hale.marker.sprite.visible ? `${markerCtx.__texts?.at(-1) ?? ''} ${markerCtx.fillStyle}` : 'none',
      boardOpen: board.isOpen,
      boardText: board.text.ctx.__texts ?? [],
      keys: board.keys.map((k) => k.face.ctx.__texts?.at(-1)),
      tracker: tracker.mesh.visible ? tracker.card.ctx.__texts : null,
      orders: pickups.root.children[0].visible,
      lies: state.lies('orders'),
      level: state.level,
      xp: state.xp,
      buzzes: [...buzzes],
    };
  });
/** A key on Hale's board, in the rig's space, just off its face (`out` further). */
const keyAt = (label, out = 0.02) =>
  page.evaluate(
    ([label, out]) => {
      const { adventure, player } = window.__descent;
      const key = adventure.board.keys.find((k) => k.face.ctx.__texts?.at(-1) === label);
      if (!key) return null;
      adventure.board.root.updateMatrixWorld(true);
      const w = key.mesh.localToWorld(key.mesh.position.clone().set(0, 0, 0.02 + out));
      const r = player.rig.worldToLocal(w.clone());
      return { x: r.x, y: r.y, z: r.z };
    },
    [label, out],
  );
/** A world point in the rig's space. */
const rigAt = (w) =>
  page.evaluate((w) => {
    const { player } = window.__descent;
    const r = player.rig.worldToLocal(player.rig.position.clone().set(w.x, w.y, w.z));
    return { x: r.x, y: r.y, z: r.z };
  }, w);
/** Move a controller so that its grip (the fist) lands at a rig-space point. XR frames only: the game doesn't step. */
async function fistTo(hand, rig) {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(
      ([hand, t]) => {
        const { player, device } = window.__descent;
        const g = player.input.hands[hand].grip.position;
        const c = device.controllers[hand].position;
        c.set(c.x + t.x - g.x, c.y + t.y - g.y, c.z + t.z - g.z);
      },
      [hand, rig],
    );
    await xrFrames(2);
  }
}
/** Put a hand down by your side, out of the way. */
async function handDown(hand) {
  await page.evaluate((hand) => {
    const c = window.__descent.device.controllers[hand];
    c.position.set(hand === 'left' ? -0.4 : 0.4, 0.3, 0.2);
    c.quaternion.set(0, 0, 0, 1);
  }, hand);
  await xrFrames(2);
}
/** Press a button on Hale's board with a fist: in front of it, then in. */
async function press(hand, label) {
  await fistTo(hand, await keyAt(label, 0.15));
  await step(0.1);
  await fistTo(hand, await keyAt(label));
  await step(0.1);
  await handDown(hand);
}
/** Floating words alive now, with where they float. */
const floating = () =>
  page.evaluate(() =>
    window.__descent.adventure.text.active.map((f) => ({
      text: f.sprite.material.map.image.getContext('2d').__texts?.at(-1) ?? '',
      x: f.sprite.position.x,
      y: f.sprite.position.y,
      z: f.sprite.position.z,
    })),
  );
/** The lumber camp's members: what each is, and where. */
const members = () =>
  page.evaluate(() =>
    window.__descent.camps.camps
      .find((c) => c.plan.id === 'lumberCamp')
      .members.map((m) => {
        const e = m.enemy;
        e.rig.bones.head.updateWorldMatrix(true, false);
        return {
          kind: e.kind,
          family: e.family,
          level: e.level,
          role: m.plan.role ?? 'ordinary',
          alive: e.alive,
          attacking: e.attacking,
          mind: m.mind,
          x: e.position.x,
          z: e.position.z,
          height: e.rig.proportions.hipY,
          weapon: e.weapon.bone,
        };
      }),
  );
/** Fell the lumber camp's member at `i` with one blow. */
const fell = (i) =>
  page.evaluate((i) => {
    const m = window.__descent.camps.camps.find((c) => c.plan.id === 'lumberCamp').members[i];
    m.enemy.takeHit(99999, m.enemy.position.clone().set(0, 0, 0));
  }, i);

await step(1);

// Raiders in the Fields, done as the board and the farm would: level 2, with The Lumber Camp on offer.
await page.evaluate(() => {
  const { adventure } = window.__descent;
  adventure.apply({ kind: 'accept' }, adventure.hale.position);
});
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => {
    const m = window.__descent.camps.camps.find((c) => c.plan.id === 'farm').members.find((m) => m.enemy.alive);
    m.enemy.takeHit(99999, m.enemy.position.clone().set(0, 0, 0));
  });
  await step(0.2);
}
await page.evaluate(() => {
  const { adventure } = window.__descent;
  adventure.apply({ kind: 'handIn' }, adventure.hale.position);
});
await step(3);

// 1. On offer: nothing in the tent yet.
{
  const t = await look();
  check(t.level === 2 && t.marker === 'offered', `level 2 with The Lumber Camp on offer (level ${t.level}, ${t.xp} XP, ${t.marker})`);
  check(!t.orders && !t.lies, `the orders don't lie in the tent yet (shown ${t.orders})`);
  const stand = inTent(0, TENT.hd + 0.35);
  await standFacing(stand.x, stand.z, ORDERS.x, ORDERS.z);
  await fistTo('left', await rigAt({ x: ORDERS.x, y: ORDERS.y + 0.035, z: ORDERS.z }));
  await step(0.1);
  const after = await look();
  check(after.buzzes.length === 0 && after.tracker === null, `a fist where they'll lie takes nothing`);
  await handDown('left');
}

// 2. Accept at Hale with the left fist.
{
  await standByHale(4);
  await step(0.5);
  await standByHale(1.9);
  await step(0.8);
  let t = await look();
  check(t.boardOpen && t.boardText.slice(1).join(' ').startsWith('The same gang holds the lumber camp') && t.keys.join() === 'Accept,Not now', `Hale's board offers The Lumber Camp`);
  await press('left', 'Accept');
  t = await look();
  check(t.marker === 'active' && t.buzzes.at(-1) === 'left', `"Accept" with the left fist takes it (${t.marker}, buzz ${t.buzzes.join()})`);
  check(
    JSON.stringify(t.tracker) === JSON.stringify(['The Lumber Camp', 'Bandits defeated at the lumber camp: 0/5', "Leader's orders taken: 0/1"]),
    `the tracker shows the quest (${JSON.stringify(t.tracker)})`,
  );
  check(t.orders && t.lies, `and the orders now lie in the tent`);
}

// 3. The camp, seen from its road. Standing in the tent in 1 woke it: wait until everyone has walked home.
const ROAD = { x: -29.5, z: -44.6 };
{
  for (let t = 0; t < 120; t += 5) {
    if ((await members()).every((e) => e.mind === 'idle')) break;
    await step(5);
  }
  const m = await members();
  const kinds = m.map((e) => `${e.family} ${e.kind} ${e.role}`).join(', ');
  check(
    kinds === 'bandit grunt ordinary, bandit grunt ordinary, bandit grunt ordinary, bandit archer ordinary, bandit brute leader',
    `the camp holds three thugs, an archer and their leader (${kinds})`,
  );
  check(m.every((e) => e.level === 2 && e.alive && e.mind === 'idle'), `all at level 2, standing at their posts`);
  const height = await page.evaluate(() => {
    const e = window.__descent.camps.camps.find((c) => c.plan.id === 'lumberCamp').members[4].enemy;
    e.root.updateMatrixWorld(true);
    return e.rig.bones.head.getWorldPosition(e.position.clone()).y + 0.2 - e.position.y;
  });
  check(height > 1.85 && height < 2.1, `the leader stands about 1.97 m (${height.toFixed(2)} m to the crown)`);
  await standFacing(ROAD.x, ROAD.z, -48, -43);
  await step(0.1);
  await page.evaluate(() => window.__descent.device.quaternion.set(Math.sin(-0.04), 0, 0, Math.cos(-0.04)));
  await xrFrames(3);
  await shot('01-the-lumber-camp');
  await page.evaluate(() => window.__descent.device.quaternion.set(0, 0, 0, 1));
  await xrFrames(2);
  check((await members()).every((e) => e.mind === 'idle'), `and they don't notice you on the camp road ${Math.hypot(ROAD.x - m[0].x, ROAD.z - m[0].z).toFixed(1)} m off`);
}

// 4. Behind the tent: the leader comes round it and swings at you.
{
  const behind = inTent(0, -TENT.hd - 2.5);
  const door = inTent(0, TENT.hd + 1);
  await standFacing(behind.x, behind.z, door.x, door.z);
  let reached = null;
  let insideWalls = 0;
  for (let t = 0; t < 12 && reached === null; t += 0.25) {
    // Kept at full health: this is about the way round, not the fight.
    await page.evaluate(() => (window.__descent.player.hp = window.__descent.player.maxHp));
    await step(0.25);
    const l = (await members())[4];
    // Its feet in the tent's frame: never inside it.
    const c = Math.cos(ORDERS.yaw);
    const s = Math.sin(ORDERS.yaw);
    const centre = inTent(0, 0);
    const lx = (l.x - centre.x) * c - (l.z - centre.z) * s;
    const lz = (l.x - centre.x) * s + (l.z - centre.z) * c;
    if (Math.abs(lz) < TENT.hd && Math.abs(lx) < TENT.hw) insideWalls++;
    if (l.attacking) reached = t + 0.25;
  }
  check(reached !== null, `the leader comes round the tent and swings at you (after ${reached ?? 'never'} s)`);
  check(insideWalls === 0, `without walking through it (${insideWalls} steps inside)`);
}

// 5. Fell the camp: the leader first.
{
  const lines = [];
  const xp = [];
  let before = (await look()).xp;
  for (const i of [4, 0, 1, 2, 3]) {
    await fell(i);
    await step(0.2);
    const t = await look();
    lines.push(t.tracker?.[1] ?? '');
    xp.push(t.xp - before);
    before = t.xp;
  }
  check(
    lines.join(' | ') ===
      'Bandits defeated at the lumber camp: 1/5 | Bandits defeated at the lumber camp: 2/5 | Bandits defeated at the lumber camp: 3/5 | Bandits defeated at the lumber camp: 4/5 | Bandits defeated at the lumber camp: 5/5',
    `the tracker counts each (${lines.at(-1)})`,
  );
  check(xp.join() === '60,20,20,20,20', `the leader pays 60 XP, triple a thug's 20 (${xp.join(', ')})`);
  const t = await look();
  check(t.tracker?.[2] === "Leader's orders taken: 0/1" && t.marker === 'active', `and the quest waits on the orders: a grey "?" (${t.markerShown})`);
  await step(1);
}

// 6. Up to the tent's door for the orders.
{
  const door = inTent(0, TENT.hd + 3);
  const crates = inTent(0, 0);
  await standFacing(door.x, door.z, crates.x, crates.z);
  await handDown('left');
  await page.evaluate(() => window.__descent.device.quaternion.set(Math.sin(-0.08), 0, 0, Math.cos(-0.08)));
  await xrFrames(3);
  await shot('02-the-tent-door');
  await page.evaluate(() => window.__descent.device.quaternion.set(0, 0, 0, 1));
  await xrFrames(2);
  await page.evaluate(() => window.__descent.device.controllers.left.updateAxes('thumbstick', 0, -1));
  await xrFrames(2);
  await step(3);
  await page.evaluate(() => window.__descent.device.controllers.left.updateAxes('thumbstick', 0, 0));
  await xrFrames(2);
  await step(0.1);
  const head = await page.evaluate(() => {
    const { camera } = window.__descent;
    const p = camera.getWorldPosition(camera.position.clone());
    return { x: p.x, y: p.y, z: p.z };
  });
  const centre = inTent(0, 0);
  const c = Math.cos(ORDERS.yaw);
  const s = Math.sin(ORDERS.yaw);
  const lx = (head.x - centre.x) * c - (head.z - centre.z) * s;
  const lz = (head.x - centre.x) * s + (head.z - centre.z) * c;
  check(Math.abs(lx) < 0.1 && lz > TENT.hd && lz < TENT.hd + 0.4, `walking up to the door, the tent stops you in the doorway (${lx.toFixed(2)}, ${lz.toFixed(2)} in the tent)`);
  const reach = Math.hypot(ORDERS.x - head.x, ORDERS.z - head.z);
  check(reach < 0.55, `with the orders ${reach.toFixed(2)} m in front of you`);
  await page.evaluate(() => window.__descent.device.quaternion.set(Math.sin(-0.3), 0, 0, Math.cos(-0.3)));
  await xrFrames(3);
  await shot('03-the-orders-in-the-tent');
  const at = { x: ORDERS.x, y: ORDERS.y + 0.035, z: ORDERS.z };
  const rig = await rigAt(at);
  const eye = await page.evaluate(() => window.__descent.device.position.y);
  await fistTo('left', rig);
  await step(0.1);
  const lift = at.y - (await page.evaluate(() => window.__descent.player.rig.position.y));
  check(eye - rig.y > 0.4 && lift > 0.8, `your fist reaches them ${(eye - rig.y).toFixed(2)} m below your eyes, ${lift.toFixed(2)} m off the floor`);
  const t = await look();
  check(t.buzzes.at(-1) === 'left' && !t.orders && !t.lies, `the left fist takes them: a buzz in that hand, and they're gone`);
  check(JSON.stringify(t.tracker) === JSON.stringify(['The Lumber Camp', 'Return to Marshal Hale']), `the tracker says to return (${JSON.stringify(t.tracker)})`);
  check(t.marker === 'ready' && t.markerShown === '? #ffd23a', `and Hale's "?" turns gold (${t.markerShown})`);
  await xrFrames(3);
  await shot('04-orders-taken');
  const buzzes = t.buzzes.length;
  await handDown('left');
  await step(0.2);
  await fistTo('left', rig);
  await step(0.2);
  check((await look()).buzzes.length === buzzes, `touching the spot again takes nothing`);
  await handDown('left');
  await page.evaluate(() => window.__descent.device.quaternion.set(0, 0, 0, 1));
  await xrFrames(2);
}

// 7. Hand in at Hale.
{
  await standByHale(4);
  await step(0.5);
  await standByHale(1.9);
  await step(0.8);
  let t = await look();
  check(t.boardOpen && t.keys.join() === 'Hand in' && t.boardText.slice(1).join(' ').startsWith('Orders...'), `Hale reads the orders: "${t.boardText.slice(1).join(' ')}"`);
  await press('right', 'Hand in');
  t = await look();
  check(t.level === 3 && t.xp === 370, `"Hand in" with the right fist: level ${t.level} at ${t.xp} XP`);
  await step(0.8);
  const words = await floating();
  const over = (w) => Math.hypot(w.x - HALE.x, w.z - HALE.z) < 0.15 && w.y > HALE.y + HALE.headY + 0.2;
  const xp = words.find((w) => w.text === '+120 XP');
  const level = words.find((w) => w.text === 'LEVEL 3');
  check(xp && over(xp) && level && over(level) && level.y > xp.y, `"+120 XP" then "LEVEL 3" float over Hale (${words.map((w) => w.text).join(', ')})`);
  check(words.some((w) => w.text === "Earthshaker: drive your sword's tip into the ground"), `with Earthshaker's line in view`);
  check(t.marker === 'offered' && t.boardText.slice(1).join(' ').startsWith('Something stirs under that hill'), `and Hale offers What Lies Below`);
  await page.evaluate(() => window.__descent.device.quaternion.set(Math.sin(0.12), 0, 0, Math.cos(0.12)));
  await xrFrames(3);
  await shot('05-hand-in-level-3');
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
