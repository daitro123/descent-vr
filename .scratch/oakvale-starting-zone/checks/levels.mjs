// Checks for levels and XP (issues/17-levels-and-xp.md) in headless Chromium
// with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/oakvale-starting-zone/checks/levels.mjs [http://localhost:5173] [shots/]
//
// Game time is stepped through the debug handle (`paused`, `step`,
// `teleport`), not XR frames. Enemies are felled with a blow big enough to
// kill (their camp reports the kill as for any other); the sword's own blows
// are the farm camp check's business.
//
// 1. A new character: level 1, no XP, 100 health; the belt shows the level
//    and an empty XP bar, and no rage orb or pips. Rage doesn't build, and
//    neither the War Cry's button nor the ground slam does anything.
// 2. Killing the farm's camp at level 1 pays 40 XP, "+10 XP" floating in gold
//    over each one where it fell.
// 3. The camp refills; the third clearing reaches level 2 at 100 XP: "LEVEL 2"
//    with "War Cry: press A or X", health full at 120, the rage orb and the
//    War Cry's pip on the belt, rage building and the War Cry working.
// 4. Five more clearings reach level 3 at 300 XP: "Earthshaker: drive your
//    sword's tip into the ground", 140 health, and the slam works.
// 5. The arena is unchanged: 100 health, every ability, a wave-1 grunt at 45.
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
/** Stand at (x, z) facing the point (tx, tz), then let an XR frame bring the head there. */
async function standFacing(x, z, tx, tz) {
  await page.evaluate(([x, z, tx, tz]) => window.__descent.teleport(x, z, Math.atan2(-(tx - x), -(tz - z))), [x, z, tx, tz]);
  await xrFrames(2);
  await step(1 / 72);
}
/** Look `a` radians down (0 is level), for the belt. */
async function look(a) {
  await page.evaluate((a) => window.__descent.device.quaternion.set(Math.sin(-a / 2), 0, 0, Math.cos(-a / 2)), a);
  await xrFrames(3);
}
const you = () =>
  page.evaluate(() => {
    const { player, state } = window.__descent;
    return {
      level: state.level,
      xp: state.xp,
      toNext: state.xpToNext,
      hp: player.hp,
      maxHp: player.maxHp,
      rage: player.rage,
      frenzy: player.frenzy,
      warCry: player.can('warCry'),
      earthshaker: player.can('earthshaker'),
    };
  });
/** Floating words alive right now, with where they float. */
const floating = () =>
  page.evaluate(() =>
    window.__descent.adventure.text.active.map((f) => ({
      text: f.sprite.material.map.image.getContext('2d').__text ?? '',
      x: f.sprite.position.x,
      y: f.sprite.position.y,
      z: f.sprite.position.z,
    })),
  );
/** What the belt's canvas has drawn, by region. */
const belt = () =>
  page.evaluate(() => {
    const ctx = window.__descent.adventure.hud.canvas.getContext('2d');
    const count = (x, y, w, h) => {
      const d = ctx.getImageData(x, y, w, h).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++;
      return n;
    };
    // The XP bar is one row at y 12 from x 22: count how much of it is gold.
    const bar = ctx.getImageData(22, 12, 20, 1).data;
    let xp = 0;
    for (let i = 0; i < bar.length; i += 4) if (bar[i] > 200 && bar[i + 1] > 150) xp++;
    return { health: count(1, 3, 18, 18), level: count(24, 4, 16, 5), xp, rage: count(44, 3, 18, 18), slamPip: count(48, 21, 3, 2), cryPip: count(44, 21, 3, 2) };
  });
/** Fell every standing member of the farm's camp; returns where each fell. */
const clearFarm = () =>
  page.evaluate(() => {
    const { camps } = window.__descent;
    const camp = camps.camps.find((c) => c.plan.id === 'farm');
    const fell = [];
    for (const m of camp.members) {
      if (!m.enemy.alive) continue;
      fell.push({ x: m.enemy.position.x, y: m.enemy.position.y, z: m.enemy.position.z });
      m.enemy.takeHit(999, m.enemy.position.clone().set(0, 0, 0));
    }
    return fell;
  });
const farmMinds = () =>
  page.evaluate(() => window.__descent.camps.camps.find((c) => c.plan.id === 'farm').members.map((m) => m.mind).join(' '));
/** Clear the farm from the village and wait out its refill: 40 XP a time. */
async function clearAndWait(times) {
  for (let i = 0; i < times; i++) {
    await clearFarm();
    await step(0.2);
    await step(185, 1 / 30);
  }
}
/** Press a controller's button for a frame, then let go. */
async function press(hand, button) {
  await page.evaluate(([hand, button]) => window.__descent.device.controllers[hand].updateButtonValue(button, 1), [hand, button]);
  await xrFrames(2);
  await step(1 / 72);
  await page.evaluate(([hand, button]) => window.__descent.device.controllers[hand].updateButtonValue(button, 0), [hand, button]);
  await xrFrames(2);
  await step(1 / 72);
}
/** Drive the sword's tip down into the ground ahead of you, fast, through an XR frame per step. */
async function slam() {
  await page.evaluate(() => {
    const r = window.__descent.device.controllers.right;
    r.quaternion.set(-0.9659, 0, 0, 0.2588); // blade pointing straight down (identity points it 60° up)
  });
  let slams = 0;
  for (let i = 0; i <= 8; i++) {
    await page.evaluate((y) => window.__descent.device.controllers.right.position.set(0.25, y, -0.45), 1.7 - i * 0.15);
    await xrFrames(1);
    await step(1 / 72, 1 / 72);
    slams += (await floating()).filter((f) => f.text === 'EARTHSHAKER').length;
  }
  await page.evaluate(() => {
    const r = window.__descent.device.controllers.right;
    r.position.set(0.4, 0.3, 0.2);
    r.quaternion.set(0, 0, 0, 1);
  });
  await xrFrames(2);
  await step(0.3);
  return slams > 0;
}

// Remember each floating text's words, so the check can read them back.
await page.addInitScript(() => {
  const fill = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) {
    this.__text = text;
    return fill.call(this, text, ...rest);
  };
});

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => {
  const { device } = window.__descent;
  window.__descent.paused = true;
  device.controllers.left.position.set(-0.4, 0.3, 0.2);
  device.controllers.right.position.set(0.4, 0.3, 0.2);
});
await xrFrames(2);
await step(2); // everyone rises at their posts
const village = await page.evaluate(() => window.__descent.world.zoneAt(0, 0).respawns.village);

// 1. A new character.
{
  const me = await you();
  check(me.level === 1 && me.xp === 0 && me.toNext === 100, `a new character is level 1 with no XP and 100 to go (${me.level}, ${me.xp}, ${me.toNext})`);
  check(me.hp === 100 && me.maxHp === 100 && !me.warCry && !me.earthshaker, `with 100 health and no abilities (${me.hp}/${me.maxHp})`);
  await look(1.2);
  await shot('01-belt-at-level-1');
  const b = await belt();
  check(b.health > 0 && b.level > 0 && b.xp === 0, `the belt shows health, the level and an empty XP bar (${JSON.stringify(b)})`);
  check(b.rage === 0 && b.slamPip === 0 && b.cryPip === 0, `and no rage orb or ability pips (${b.rage} rage pixels, ${b.slamPip + b.cryPip} pip pixels)`);
  await look(0);
  const built = await page.evaluate(() => {
    const { player } = window.__descent;
    player.addRage(50);
    return player.rage;
  });
  check(built === 0, `rage doesn't build before the War Cry (${built})`);
  // With rage given by hand, neither ability answers.
  await page.evaluate(() => (window.__descent.player.rage = 100));
  await press('right', 'a-button');
  let after = await you();
  check(after.frenzy === 0 && after.rage > 99, `A does nothing at level 1 (rage ${after.rage.toFixed(1)}, frenzy ${after.frenzy})`);
  await press('left', 'x-button');
  after = await you();
  check(after.frenzy === 0 && after.rage > 99, `nor X (rage ${after.rage.toFixed(1)}, frenzy ${after.frenzy})`);
  const slammed = await slam();
  after = await you();
  check(!slammed && after.rage > 98, `driving the sword's tip into the ground does nothing either (rage ${after.rage.toFixed(1)})`);
  await page.evaluate(() => (window.__descent.player.rage = 0));
}

// 2. Kill the farm's camp at level 1, from the road's end.
{
  await standFacing(54.5, 26, 60, 33);
  const fell = await clearFarm();
  await step(0.25);
  const words = await floating();
  const xp = words.filter((w) => w.text === '+10 XP');
  const over = fell.every((f) => xp.some((w) => Math.hypot(w.x - f.x, w.z - f.z) < 0.3 && w.y - f.y > 1.8 && w.y - f.y < 2.3));
  check(xp.length === 4 && over, `killing the farm's four floats "+10 XP" over each where it fell (${xp.length} floats: ${xp.map((w) => `(${w.x.toFixed(1)}, ${w.z.toFixed(1)})`).join(' ')})`);
  const me = await you();
  check(me.xp === 40 && me.level === 1 && me.toNext === 60, `the farm's camp pays 40 XP at level 1 (${me.xp} XP, level ${me.level}, ${me.toNext} to go)`);
  const gold = await page.evaluate(() => window.__descent.adventure.text.active.find((f) => f.sprite.material.map.image.getContext('2d').__text === '+10 XP')?.sprite.material.map.image.getContext('2d').fillStyle);
  check(gold === '#ffd23a', `in gold (${gold})`);
  await xrFrames(2);
  await shot('02-plus-ten-xp');
  await look(1.2);
  const b = await belt();
  check(b.xp === 8, `the XP bar fills 40% (${b.xp} of 20)`);
  await look(0);
  // Away to the village while it refills.
  await standFacing(village.x, village.z, 0, 0);
  await step(185, 1 / 30);
  check((await farmMinds()) === 'idle idle idle idle', `from the village, the farm fills again (${await farmMinds()})`);
}

// 3. Two more clearings: level 2 on the tenth kill.
{
  await clearAndWait(1);
  let me = await you();
  check(me.xp === 80 && me.level === 1, `a second clearing: ${me.xp} XP, still level ${me.level}`);
  await page.evaluate(() => window.__descent.player.damage(70));
  // Fell one, then a second to reach 100.
  const got = await page.evaluate(() => {
    const { camps, adventure } = window.__descent;
    const camp = camps.camps.find((c) => c.plan.id === 'farm');
    const words = () => adventure.text.active.map((f) => f.sprite.material.map.image.getContext('2d').__text);
    const [a, b] = camp.members;
    a.enemy.takeHit(999, a.enemy.position.clone().set(0, 0, 0));
    window.__descent.step(0.1);
    const before = { level: adventure.state.level, words: words() };
    b.enemy.takeHit(999, b.enemy.position.clone().set(0, 0, 0));
    window.__descent.step(0.1);
    return { before, after: words() };
  });
  me = await you();
  check(got.before.level === 1 && me.level === 2 && me.xp === 100 && me.toNext === 200, `the tenth kill reaches level 2 at 100 XP (${got.before.level} → ${me.level}, ${me.xp} XP, ${me.toNext} to go)`);
  check(
    got.after.includes('LEVEL 2') && got.after.includes('War Cry: press A or X') && !got.before.words.includes('LEVEL 2'),
    `"LEVEL 2" shows with "War Cry: press A or X" (${got.after.filter((w) => !w.startsWith('+')).join(' | ')})`,
  );
  check(me.hp === 120 && me.maxHp === 120, `and fills your health, now 120 (${me.hp}/${me.maxHp})`);
  check(me.warCry && !me.earthshaker, `the War Cry has come, Earthshaker not yet`);
  await xrFrames(2);
  await shot('03-level-2');
  await look(1.2);
  await shot('04-belt-at-level-2');
  const b = await belt();
  check(b.level > 0 && b.xp === 0 && b.rage > 0 && b.cryPip === 6 && b.slamPip === 0, `the belt shows the rage orb and the War Cry's pip, the XP bar empty again (${JSON.stringify(b)})`);
  await look(0);
  const built = await page.evaluate(() => {
    const { player } = window.__descent;
    player.addRage(60);
    return player.rage;
  });
  check(built === 60, `rage builds now (${built})`);
  await press('right', 'a-button');
  me = await you();
  check(me.frenzy > 0 && me.rage < 11, `and A lets out the War Cry (rage ${me.rage.toFixed(1)}, frenzy ${me.frenzy.toFixed(1)} s)`);
  await page.evaluate(() => (window.__descent.player.rage = 100));
  const slammed = await slam();
  check(!slammed, `the ground slam still waits for level 3`);
  await clearFarm(); // the rest of the third clearing
  await step(185, 1 / 30);
  me = await you();
  check(me.xp === 120, `the third clearing done: ${me.xp} XP`);
}

// 4. Five more clearings: level 3 on the thirtieth kill.
{
  await clearAndWait(4);
  let me = await you();
  check(me.xp === 280 && me.level === 2, `four more clearings: ${me.xp} XP, level ${me.level}`);
  await clearFarm();
  await step(0.1);
  const words = (await floating()).map((w) => w.text);
  me = await you();
  check(me.level === 3 && me.xp === 320 && me.toNext === 280, `the next reaches level 3 (${me.level}, ${me.xp} XP, ${me.toNext} to go)`);
  check(
    words.includes('LEVEL 3') && words.includes("Earthshaker: drive your sword's tip into the ground"),
    `"LEVEL 3" shows with the Earthshaker's line (${words.filter((w) => !w.startsWith('+')).join(' | ')})`,
  );
  check(me.hp === 140 && me.maxHp === 140 && me.earthshaker, `140 health, and Earthshaker has come (${me.hp}/${me.maxHp})`);
  await xrFrames(2);
  await shot('05-level-3');
  await page.evaluate(() => (window.__descent.player.rage = 100));
  const slammed = await slam();
  me = await you();
  check(slammed && me.rage < 70, `driving the sword's tip into the ground slams now (rage ${me.rage.toFixed(1)})`);
  await look(1.2);
  const b = await belt();
  check(b.slamPip === 6 && b.cryPip === 6, `the belt shows both pips (${JSON.stringify(b)})`);
  await look(0);
}

// 5. The arena is as it was.
{
  await page.goto(`${base}/?arena&emulate&nodevui`);
  await page.waitForFunction(() => window.__descent?.game, null, { timeout: 120000 });
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  const got = await page.evaluate(() => {
    const { game } = window.__descent;
    window.__descent.paused = true;
    for (let i = 0; i < 30 * 12 && !game.enemies.length; i++) game.update(1 / 30);
    const p = game.player;
    p.addRage(30);
    return { hp: p.maxHp, warCry: p.can('warCry'), earthshaker: p.can('earthshaker'), rage: p.rage, damage: p.stats.damage, enemy: game.enemies[0]?.maxHp, kind: game.enemies[0]?.kind };
  });
  check(got.hp === 100 && got.damage === 1 && got.warCry && got.earthshaker && got.rage === 30, `?arena: 100 health, plain damage, every ability, rage building (${JSON.stringify(got)})`);
  check(got.kind === 'grunt' && got.enemy === 45, `a wave-1 grunt has 45 health, as before (${got.kind} ${got.enemy})`);
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
