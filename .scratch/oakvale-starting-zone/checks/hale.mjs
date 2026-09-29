// Checks for Marshal Hale and Raiders in the Fields
// (issues/18-marshal-hale-and-raiders-in-the-fields.md) in headless Chromium
// with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/oakvale-starting-zone/checks/hale.mjs [http://localhost:5173] [shots/]
//
// Game time is stepped through the debug handle (`paused`, `step`,
// `teleport`), not XR frames. Fists and the sword's tip are moved onto the
// board's buttons through the emulator's controllers; the farm's bandits are
// felled with a blow big enough to kill (their camp reports the kill as for
// any other).
//
// 1. A new character faces Hale 3.5 m off: a gold "!" over their head, Hale
//    turned to you and waving, no board yet and no tracker.
// 2. Walk up looking at Hale: the board unfolds on your right with Hale's
//    name, their offer and "Accept" and "Not now". "Not now" with the right
//    fist buzzes that hand, folds it and leaves the "!". It stays shut until
//    you've walked away.
// 3. Come back with the left fist resting where "Accept" appears: nothing
//    fires until it leaves and comes back, then the quest is taken, the left
//    hand buzzes, the board folds, the "?" over Hale turns grey, and the
//    tracker shows "Raiders in the Fields" and "Bandits defeated at the farm:
//    0/3" at the top left of your view, flashing. It lags a quick head turn.
// 4. At the farm, three kills count 1/3, 2/3, 3/3, then "Return to Marshal
//    Hale" and a gold "?"; a fourth counts nothing.
// 5. Back at Hale: "Hand in", pressed with the sword's tip. "+80 XP" floats
//    over Hale, then "LEVEL 2"; you're level 2 at 120 XP; the board offers The
//    Lumber Camp with a gold "!" over Hale, and the tracker is gone.
// 6. Hale is solid: standing on their spot puts you beside them.
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
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
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

/** Stand `d` metres from Hale on the line to the start, facing Hale; one XR frame brings the head there. */
async function standBy(d) {
  const dx = START.x - HALE.x;
  const dz = START.z - HALE.z;
  const k = d / Math.hypot(dx, dz);
  const [x, z] = [HALE.x + dx * k, HALE.z + dz * k];
  await page.evaluate(([x, z, yaw]) => window.__descent.teleport(x, z, yaw), [x, z, Math.atan2(-(HALE.x - x), -(HALE.z - z))]);
  await xrFrames(2);
  await step(1 / 72);
}
async function standFacing(x, z, tx, tz) {
  await page.evaluate(([x, z, tx, tz]) => window.__descent.teleport(x, z, Math.atan2(-(tx - x), -(tz - z))), [x, z, tx, tz]);
  await xrFrames(2);
  await step(1 / 72);
}
/** What Hale, the board and the tracker show. */
const talk = () =>
  page.evaluate(() => {
    const { adventure, state, buzzes } = window.__descent;
    const { board, tracker, hale } = adventure;
    const marker = hale.marker;
    const markerCtx = marker.canvas.getContext('2d');
    return {
      marker: state.hale.marker,
      markerShown: marker.sprite.visible ? `${markerCtx.__texts?.at(-1) ?? ''} ${markerCtx.fillStyle}` : 'none',
      boardOpen: board.isOpen,
      boardText: board.text.ctx.__texts ?? [],
      keys: board.keys.map((k) => k.face.ctx.__texts?.at(-1)),
      tracker: tracker.mesh.visible ? tracker.card.ctx.__texts : null,
      level: state.level,
      xp: state.xp,
      buzzes: [...buzzes],
    };
  });
/** The world point just off a key's face, and the same in the rig's space. */
const keyAt = (label, out = 0.02) =>
  page.evaluate(
    ([label, out]) => {
      const { adventure, player } = window.__descent;
      const key = adventure.board.keys.find((k) => k.face.ctx.__texts?.at(-1) === label);
      if (!key) return null;
      adventure.board.root.updateMatrixWorld(true);
      const w = key.mesh.localToWorld(key.mesh.position.clone().set(0, 0, 0.02 + out));
      const r = player.rig.worldToLocal(w.clone());
      return { world: { x: w.x, y: w.y, z: w.z }, rig: { x: r.x, y: r.y, z: r.z } };
    },
    [label, out],
  );
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
/** Point the sword level ahead and bring its tip to a world point, stepping the game so the heavy tip settles. */
async function tipTo(world) {
  await page.evaluate(() => window.__descent.device.controllers.right.quaternion.set(-0.5, 0, 0, 0.866));
  for (let i = 0; i < 4; i++) {
    await step(0.4);
    await page.evaluate((t) => {
      const { player, device } = window.__descent;
      const tip = player.sword.tip.worldNow(player.rig, player.rig.position.clone());
      const want = player.rig.worldToLocal(tip.clone().set(t.x, t.y, t.z));
      const now = player.rig.worldToLocal(tip);
      const c = device.controllers.right.position;
      c.set(c.x + want.x - now.x, c.y + want.y - now.y, c.z + want.z - now.z);
    }, world);
    await xrFrames(2);
  }
  await step(0.4);
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

await step(2);

// 1. A new character, 3.5 m from Hale.
{
  const t = await talk();
  check(t.marker === 'offered' && t.markerShown === '! #ffd23a', `a gold "!" floats over Hale (${t.marker}, ${t.markerShown})`);
  check(!t.boardOpen && t.tracker === null, `no board yet at 3.5 m, and no tracker (board ${t.boardOpen}, tracker ${JSON.stringify(t.tracker)})`);
  const h = await page.evaluate(() => {
    const { adventure, camera } = window.__descent;
    const { hale } = adventure;
    const head = camera.getWorldPosition(camera.position.clone());
    const want = Math.atan2(head.x - hale.position.x, head.z - hale.position.z);
    const off = Math.abs(Math.atan2(Math.sin(want - hale.root.rotation.y), Math.cos(want - hale.root.rotation.y)));
    return { off, waved: hale.waving > 0 || hale.waveReady === false };
  });
  check(h.off < 0.1 && h.waved, `Hale has turned to face you (${h.off.toFixed(3)} rad off) and waved`);
  await xrFrames(2);
  await shot('01-hale-at-the-start');
}

// 2. Walk up: the board unfolds. "Not now" folds it.
let acceptRig;
{
  await standBy(1.9);
  await step(0.5);
  let t = await talk();
  check(t.boardOpen, `within 2.3 m and looking at Hale, the board unfolds`);
  check(
    t.boardText[0] === 'Marshal Hale' && t.boardText.slice(1).join(' ').startsWith('Bandits in red masks are raiding the farm'),
    `with Hale's name and their offer (${t.boardText.slice(0, 2).join(' | ')}…)`,
  );
  check(t.keys.join(',') === 'Accept,Not now', `and "Accept" and "Not now" (${t.keys.join(', ')})`);
  const side = await page.evaluate(() => {
    const { adventure, camera } = window.__descent;
    const p = camera.worldToLocal(adventure.board.root.getWorldPosition(camera.position.clone().set(0, 0, 0)));
    return p.x;
  });
  check(side > 0.2, `on your right (${side.toFixed(2)} m right of your view's centre)`);
  await xrFrames(2);
  await shot('02-the-board');
  acceptRig = (await keyAt('Accept')).rig;

  const notNow = await keyAt('Not now', 0.15);
  await fistTo('right', notNow.rig);
  await step(0.1);
  t = await talk();
  check(t.boardOpen && t.buzzes.length === 0, `a fist in front of "Not now" presses nothing`);
  await fistTo('right', (await keyAt('Not now')).rig);
  await step(0.1);
  t = await talk();
  check(!t.boardOpen && t.buzzes.join() === 'right', `"Not now" with the right fist folds the board and buzzes the right hand (${t.buzzes.join()})`);
  check(t.marker === 'offered' && t.tracker === null, `and leaves the "!" (${t.marker})`);
  await handDown('right');
  await step(1);
  t = await talk();
  check(!t.boardOpen, `it stays shut while you stand there`);
}

// 3. Come back with the left fist already where "Accept" appears.
{
  await standBy(5);
  await step(0.5);
  await fistTo('left', acceptRig);
  await standBy(1.9);
  await step(0.8);
  let t = await talk();
  const resting = await page.evaluate(() => {
    const { adventure, player } = window.__descent;
    const key = adventure.board.keys.find((k) => k.face.ctx.__texts?.at(-1) === 'Accept');
    const p = key.mesh.worldToLocal(player.input.hands.left.grip.getWorldPosition(player.rig.position.clone()));
    return Math.abs(p.x) < 0.145 && Math.abs(p.y) < 0.07 && p.z < 0.05 && p.z > -0.08;
  });
  check(t.boardOpen && resting && t.marker === 'offered', `back at Hale, the board unfolds with the left fist resting in "Accept", and nothing fires`);
  await fistTo('left', { ...acceptRig, z: acceptRig.z + 0.25 });
  await step(0.1);
  await fistTo('left', acceptRig);
  await step(0.1);
  t = await talk();
  check(t.marker === 'active' && !t.boardOpen, `taken out and pushed back in, it accepts: the board folds and the "?" turns grey (${t.marker}, ${t.markerShown})`);
  check(t.markerShown === '? #a8a8a8', `grey "?" drawn (${t.markerShown})`);
  check(t.buzzes.at(-1) === 'left', `the left hand buzzes (${t.buzzes.join()})`);
  check(
    JSON.stringify(t.tracker) === JSON.stringify(['Raiders in the Fields', 'Bandits defeated at the farm: 0/3']),
    `the tracker shows the quest (${JSON.stringify(t.tracker)})`,
  );
  await handDown('left');
  const flashing = await page.evaluate(() => window.__descent.adventure.tracker.flashFor > 0);
  check(flashing, `and flashes`);
  await step(2);
  // Top left of your view.
  const where = await page.evaluate(() => {
    const { adventure, camera } = window.__descent;
    const p = camera.worldToLocal(adventure.tracker.mesh.getWorldPosition(camera.position.clone().set(0, 0, 0)));
    return { x: p.x, y: p.y, z: p.z };
  });
  check(where.x < -0.2 && where.y > 0.1 && where.z < -0.8, `at the top left of your view (${where.x.toFixed(2)}, ${where.y.toFixed(2)}, ${where.z.toFixed(2)})`);
  await xrFrames(2);
  await shot('03-the-tracker');
  // A quick head turn: it drifts after, rather than sticking.
  /** How far right of straight ahead the tracker is, in degrees (it sits left: negative). */
  const bearing = () =>
    page.evaluate(() => {
      const { adventure, camera } = window.__descent;
      const p = camera.worldToLocal(adventure.tracker.mesh.getWorldPosition(camera.position.clone().set(0, 0, 0)));
      return (Math.atan2(p.x, -p.z) * 180) / Math.PI;
    });
  const home = await bearing();
  await page.evaluate(() => window.__descent.device.quaternion.set(0, Math.sin(-0.35), 0, Math.cos(-0.35))); // 40° right
  await xrFrames(2);
  await step(1 / 30, 1 / 30);
  const turned = await bearing();
  await step(1.5);
  const settled = await bearing();
  check(
    turned < home - 15 && Math.abs(settled - home) < 2,
    `a quick 40° head turn leaves it behind (${home.toFixed(0)}° → ${turned.toFixed(0)}°), then it catches up (${settled.toFixed(0)}°)`,
  );
  await page.evaluate(() => window.__descent.device.quaternion.set(0, 0, 0, 1));
  await xrFrames(2);
}

// 4. The farm's bandits.
{
  await standFacing(54.5, 26, 60, 33);
  const lines = [];
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => {
      const camp = window.__descent.camps.camps.find((c) => c.plan.id === 'farm');
      const m = camp.members.find((m) => m.enemy.alive);
      m.enemy.takeHit(999, m.enemy.position.clone().set(0, 0, 0));
    });
    await step(0.2);
    const t = await talk();
    lines.push(t.tracker?.[1] ?? '');
    if (i === 2) check(t.marker === 'ready' && t.markerShown === '? #ffd23a', `the third makes it ready: a gold "?" over Hale (${t.markerShown})`);
  }
  check(
    lines.join(' | ') === 'Bandits defeated at the farm: 1/3 | Bandits defeated at the farm: 2/3 | Return to Marshal Hale | Return to Marshal Hale',
    `the tracker counts each and then says to return (${lines.join(' | ')})`,
  );
  const t = await talk();
  check(t.xp === 40 && t.level === 1, `four kills pay 40 XP (${t.xp}, level ${t.level})`);
}

// 5. Hand in with the sword's tip.
{
  await standBy(1.9);
  await step(0.5);
  let t = await talk();
  check(t.boardOpen && t.boardText.slice(1).join(' ') === "The farm's quieter already. Well done." && t.keys.join() === 'Hand in', `the board says "${t.boardText.slice(1).join(' ')}" with "${t.keys.join()}"`);
  const handIn = await keyAt('Hand in');
  const before = await keyAt('Hand in', 0.2);
  await tipTo(before.world);
  t = await talk();
  check(t.level === 1 && t.boardOpen, `the sword's tip in front of "Hand in" presses nothing`);
  const buzzesBefore = t.buzzes.length;
  await tipTo(handIn.world);
  t = await talk();
  const fist = await page.evaluate((w) => {
    const { player } = window.__descent;
    const g = player.input.hands.right.grip.getWorldPosition(player.rig.position.clone());
    return Math.hypot(g.x - w.x, g.y - w.y, g.z - w.z);
  }, handIn.world);
  check(t.level === 2 && t.xp === 120 && fist > 0.5, `the sword's tip hands it in, the fist ${fist.toFixed(2)} m away: level ${t.level} at ${t.xp} XP`);
  check(t.buzzes.length > buzzesBefore && t.buzzes.at(-1) === 'right', `and the right hand buzzes`);
  const words = await floating();
  const over = (w) => Math.hypot(w.x - HALE.x, w.z - HALE.z) < 0.15 && w.y > HALE.y + HALE.headY + 0.2;
  const xp = words.find((w) => w.text === '+80 XP');
  const level = words.find((w) => w.text === 'LEVEL 2');
  check(xp && over(xp), `"+80 XP" floats over Hale (${words.map((w) => w.text).join(', ')})`);
  check(level && over(level) && level.y > xp.y, `then "LEVEL 2", above it`);
  check(words.some((w) => w.text === 'War Cry: press A or X'), `with the War Cry's line in view`);
  check(
    t.marker === 'offered' && t.boardOpen && t.boardText.slice(1).join(' ').startsWith('The same gang holds the lumber camp') && t.keys.join() === 'Accept,Not now',
    `Hale offers The Lumber Camp on the board with a gold "!" (${t.markerShown})`,
  );
  check(t.tracker === null, `and the tracker is gone`);
  await handDown('right');
  await page.evaluate(() => window.__descent.device.quaternion.set(Math.sin(0.12), 0, 0, Math.cos(0.12)));
  await xrFrames(3);
  await shot('04-hand-in');
  await page.evaluate(() => window.__descent.device.quaternion.set(0, 0, 0, 1));
  await xrFrames(2);
  await step(3);
  await fistTo('right', (await keyAt('Not now', 0.15)).rig);
  await step(0.1);
  await fistTo('right', (await keyAt('Not now')).rig);
  await step(0.1);
  t = await talk();
  check(!t.boardOpen && t.marker === 'offered', `"Not now" folds it and the "!" stays for The Lumber Camp`);
  await handDown('right');
}

// 6. Hale is solid.
{
  await page.evaluate(([x, z]) => window.__descent.teleport(x, z, 0), [HALE.x, HALE.z]);
  await xrFrames(2);
  await step(0.5);
  const d = await page.evaluate(([x, z]) => {
    const { player, camera } = window.__descent;
    const feet = player.feetPosition(camera.position.clone());
    return Math.hypot(feet.x - x, feet.z - z);
  }, [HALE.x, HALE.z]);
  check(d > 0.55, `standing on Hale's spot puts you beside them (${d.toFixed(2)} m off)`);
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
