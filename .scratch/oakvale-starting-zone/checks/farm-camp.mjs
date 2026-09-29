// Checks for the farm's camp (issues/16-the-farms-camp.md) in headless
// Chromium with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/oakvale-starting-zone/checks/farm-camp.mjs [http://localhost:5173] [shots/]
//
// Game time is stepped through the debug handle (`paused`, `step`,
// `teleport`), not XR frames, except for the sword swings, which need the
// controller's pose to change between steps.
//
// 1. The farm's four wait at their posts, on the ground.
// 2. Pulling one pair: walking in from the road's end brings the first pair
//    and leaves the second.
// 3. The leash: led away, they give up 30 m from their posts and walk home
//    untouchable; a swing at one floats "Evade" and does nothing; home, they
//    heal. A swing at one waiting at its post hurts it.
// 4. A death: the view fades to black, you wake at the village respawn point
//    with full health and no rage, and it fades back in. Whoever was fighting
//    walks home; the one you killed stays dead.
// 5. Healing: after 5 s out of a fight, health refills over about 10 s.
// 6. The cleared camp refills 3 minutes after the last falls, with you in the village.
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
/** The farm's members: mind, health, where they stand and how far from their posts. */
const farm = () =>
  page.evaluate(() => {
    const { camps, world } = window.__descent;
    const camp = camps.camps.find((c) => c.plan.id === 'farm');
    return camp.members.map((m) => ({
      mind: m.mind,
      hp: m.enemy.hp,
      maxHp: m.enemy.maxHp,
      hittable: m.enemy.hittable,
      x: m.enemy.position.x,
      z: m.enemy.position.z,
      y: m.enemy.position.y,
      ground: world.heightAt(m.enemy.position.x, m.enemy.position.z),
      fromPost: Math.hypot(m.enemy.position.x - m.post.x, m.enemy.position.z - m.post.z),
      post: { x: m.post.x, z: m.post.z },
    }));
  });
const minds = (ms) => ms.map((m) => m.mind).join(' ');
const you = () =>
  page.evaluate(() => {
    const { player, camera, adventure } = window.__descent;
    const p = player.feetPosition(camera.position.clone());
    return { x: p.x, z: p.z, hp: player.hp, maxHp: player.maxHp, rage: player.rage, alive: player.alive, fade: adventure.fade.level };
  });
/** Floating words alive right now (damage numbers, "Evade"). */
const floating = () => page.evaluate(() => window.__descent.adventure.text.active.map((f) => f.sprite.material.map.image.getContext('2d').__text ?? ''));

/**
 * Swing the sword level, right to left across the front of you, through an
 * XR frame per step so the grip's pose changes between steps. Returns every
 * floating word seen during the swing.
 */
async function swing() {
  const q = [-0.5, 0, 0, 0.866]; // the blade level, pointing ahead
  const seen = new Set();
  for (let i = 0; i <= 14; i++) {
    const x = 0.45 - i * 0.065;
    await page.evaluate(
      ([x, q]) => {
        const r = window.__descent.device.controllers.right;
        r.position.set(x, 1.25, -0.25);
        r.quaternion.set(...q);
      },
      [x, q],
    );
    await xrFrames(1);
    await step(1 / 72, 1 / 72);
    for (const w of await floating()) seen.add(w);
  }
  // Bring the hand back down slowly, so the return isn't a swing.
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    await page.evaluate(([x, y, z]) => window.__descent.device.controllers.right.position.set(x, y, z), [-0.46 + 0.86 * t, 1.25 - 0.95 * t, -0.25 + 0.45 * t]);
    await xrFrames(1);
    await step(0.1, 1 / 72);
  }
  return [...seen];
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
  // Arms at your sides, so the shield and the sword don't fill the screenshots.
  device.controllers.left.position.set(-0.4, 0.3, 0.2);
  device.controllers.right.position.set(0.4, 0.3, 0.2);
});
await xrFrames(2);
await step(2); // everyone rises at their posts

// 1. The farm's four wait at their posts.
{
  const ms = await farm();
  check(ms.length === 4 && minds(ms) === 'idle idle idle idle', `the farm holds four, all waiting (${minds(ms)})`);
  check(
    ms.every((m) => m.fromPost < 0.3 && Math.abs(m.y - m.ground) < 0.01),
    `each at its post, on the ground (${ms.map((m) => `${m.fromPost.toFixed(2)} m off, ${(m.y - m.ground).toFixed(3)} m up`).join('; ')})`,
  );
  check(ms.every((m) => m.maxHp === 63), `with 1.4 times a grunt's health (${ms.map((m) => m.maxHp).join(', ')})`);
  const fighting = await page.evaluate(() => window.__descent.camps.fighting);
  check(!fighting, 'nothing is fighting you at the start');
}

// 2. Pulling one pair.
const [a1] = (await farm()).map((m) => m.post);
await standFacing(54.5, 26, a1.x, a1.z);
await step(0.5);
{
  const ms = await farm();
  check(minds(ms) === 'idle idle idle idle', `at the road's end, 9 m from the first pair, nobody stirs (${minds(ms)})`);
  await xrFrames(2);
  await shot('01-farm-from-the-road');
}
// Walk towards the first pair until they come.
await page.evaluate(() => window.__descent.device.controllers.left.updateAxes('thumbstick', 0, -1));
await xrFrames(2);
{
  let ms = await farm();
  for (let i = 0; i < 20 && ms[0].mind === 'idle'; i++) {
    await step(0.1);
    ms = await farm();
  }
  await page.evaluate(() => window.__descent.device.controllers.left.updateAxes('thumbstick', 0, 0));
  await xrFrames(2);
  const me = await you();
  const d = Math.hypot(me.x - ms[0].x, me.z - ms[0].z);
  check(minds(ms) === 'fight fight idle idle', `walking in, the first pair comes at ${d.toFixed(1)} m and the second stays (${minds(ms)})`);
  await step(1.2);
  await xrFrames(2);
  await shot('02-the-first-pair-comes');
}

// 3. The leash: lead them off west along the road at a run they can't match.
{
  const got = await page.evaluate(
    ([a1]) => {
      const { camps, player, camera, teleport, step } = window.__descent;
      const camp = camps.camps.find((c) => c.plan.id === 'farm');
      const [m] = camp.members;
      let x = 54;
      let z = 26;
      let gaveUp = null;
      // Until both of the pair have given up.
      for (let t = 0; t < 40 && camp.members.slice(0, 2).some((k) => k.mind !== 'home'); t += 1 / 72) {
        x -= 2.6 / 72;
        z -= 1.4 / 72;
        teleport(x, z, Math.atan2(-(x - a1.x), -(z - a1.z)));
        step(1 / 72);
        if (gaveUp === null && m.mind === 'home') gaveUp = Math.hypot(m.enemy.position.x - m.post.x, m.enemy.position.z - m.post.z);
      }
      const feet = player.feetPosition(camera.position.clone());
      return { gaveUp, minds: camp.members.map((k) => k.mind).join(' '), you: [feet.x, feet.z] };
    },
    [a1],
  );
  check(got.gaveUp !== null && Math.abs(got.gaveUp - 30) < 0.2, `led away, the first gives up ${got.gaveUp?.toFixed(2)} m from its post (${got.minds})`);
  const ms = await farm();
  check(ms[0].mind === 'home' && ms[1].mind === 'home' && !ms[0].hittable, `and walks home untouchable, its partner too (${minds(ms)}, hittable ${ms[0].hittable})`);
  check(!(await page.evaluate(() => window.__descent.camps.fighting)), 'walking home, they no longer count as fighting you');

  // Catch it up and swing at it on its way.
  const m = ms[0];
  const headingHome = Math.atan2(m.post.x - m.x, m.post.z - m.z);
  await standFacing(m.x + Math.sin(headingHome) * 1.3, m.z + Math.cos(headingHome) * 1.3, m.x, m.z);
  const before = (await farm())[0];
  const words = await swing();
  const after = (await farm())[0];
  check(words.includes('Evade') && after.hp === before.hp, `a swing on its way home floats "Evade" and does nothing (${words.join(', ') || 'no words'}; health ${before.hp} → ${after.hp})`);

  // Home, and whole again.
  await step(20);
  const home = await farm();
  check(
    home.slice(0, 2).every((k) => k.mind === 'idle' && k.fromPost < 0.5 && k.hp === k.maxHp),
    `home again, they wait at their posts at full health (${home.slice(0, 2).map((k) => `${k.mind} ${k.hp}/${k.maxHp} ${k.fromPost.toFixed(2)} m off`).join('; ')})`,
  );

  // A control: the same swing lands on one that isn't walking home. (Standing
  // close enough to swing, you're well inside 8 m, so it's fighting you.) A
  // thug guards a third of swings, so a guarded one is swung again.
  const h = home[0];
  await standFacing(h.x - 1.1, h.z, h.x, h.z);
  const b = (await farm())[0];
  let hurt = await swing();
  for (let i = 0; i < 4 && hurt.includes('guarded'); i++) {
    await step(2); // past its guard and the cooldown after it
    const g = (await farm())[0];
    await standFacing(g.x - 1.1, g.z, g.x, g.z);
    hurt = await swing();
  }
  const c = (await farm())[0];
  check(c.hp < b.hp && c.mind === 'fight', `the same swing hurts one that's fighting you (${b.hp} → ${c.hp}, ${hurt.join(', ')}, ${c.mind})`);
}

// 4. A death, with one of the pair killed first.
{
  await page.evaluate(() => {
    const { camps } = window.__descent;
    const camp = camps.camps.find((c) => c.plan.id === 'farm');
    camp.members[1].enemy.takeHit(999, camp.members[1].enemy.position.clone().set(0, 0, 0));
  });
  await step(0.5);
  // Drop the shield and the sword to your sides, and wait for a blow at 1 health.
  await page.evaluate(() => {
    const { device } = window.__descent;
    device.controllers.left.position.set(-0.4, 0.3, 0.2);
    device.controllers.right.position.set(0.4, 0.3, 0.2);
  });
  await xrFrames(2);
  const fell = await page.evaluate(() => {
    const { player, step } = window.__descent;
    player.hp = 1;
    player.rage = 40;
    for (let t = 0; t < 20 && player.alive; t += 1 / 72) step(1 / 72);
    return !player.alive;
  });
  check(fell, `standing in the fight at 1 health, you fall`);
  await step(1 / 72);
  const down = await farm();
  check(down[0].mind === 'home' && down[1].mind === 'dead', `whoever was fighting walks home, the one you killed stays down (${minds(down)})`);
  const D = await page.evaluate(() => window.__descent.CONFIG.death);
  await step(D.linger + D.fadeOut / 2);
  let me = await you();
  check(me.fade > 0.3 && me.fade < 0.7, `the view is fading to black (${me.fade.toFixed(2)})`);
  await xrFrames(2);
  await shot('03-fading');
  await step(D.fadeOut / 2 + D.dark / 2);
  me = await you();
  check(me.fade > 0.99, `then black (${me.fade.toFixed(2)})`);
  await step(D.dark / 2 + 0.05);
  me = await you();
  const village = await page.evaluate(() => window.__descent.world.zoneAt(0, 0).respawns.village);
  check(
    Math.hypot(me.x - village.x, me.z - village.z) < 0.3 && me.alive && me.hp === me.maxHp && me.rage === 0,
    `you wake at the inn's door (${me.x.toFixed(1)}, ${me.z.toFixed(1)}) with full health (${me.hp}) and no rage (${me.rage})`,
  );
  await step(D.fadeIn + 0.05);
  me = await you();
  check(me.fade === 0, `and the view fades back in (${me.fade.toFixed(2)})`);
  await xrFrames(2);
  await shot('04-waking-at-the-inn');
  await step(20);
  const after = await farm();
  check(after[0].mind === 'idle' && after[0].hp === after[0].maxHp && after[1].mind === 'dead', `at the farm, the one that was fighting is home and whole, the dead one still down (${minds(after)})`);
}

// 5. Healing.
{
  await page.evaluate(() => window.__descent.player.damage(60));
  await step(4.5);
  let me = await you();
  check(me.hp === 40, `hurt, your health waits while the fight might go on (${me.hp} after 4.5 s)`);
  await step(3);
  me = await you();
  check(me.hp > 40 && me.hp < 100, `after 5 s out of a fight it comes back (${me.hp.toFixed(0)} after 7.5 s)`);
  await step(6);
  me = await you();
  check(me.hp === me.maxHp, `full again within about 10 s (${me.hp.toFixed(0)} after 13.5 s)`);
}

// 6. Clear the farm from the village; three minutes later it's full again.
{
  const kills = await page.evaluate(() => {
    const { camps } = window.__descent;
    const camp = camps.camps.find((c) => c.plan.id === 'farm');
    for (const m of camp.members) if (m.enemy.alive) m.enemy.takeHit(999, m.enemy.position.clone().set(0, 0, 0));
    return camp.members.length;
  });
  await step(1);
  let ms = await farm();
  check(minds(ms) === 'dead dead dead dead', `cleared (${minds(ms)})`);
  await step(170, 1 / 30);
  ms = await farm();
  check(minds(ms) === 'dead dead dead dead', `still empty after 171 s (${minds(ms)})`);
  await step(12, 1 / 30);
  ms = await farm();
  check(minds(ms) === 'idle idle idle idle' && kills === 4, `full again after 3 minutes, with you in the village (${minds(ms)})`);
}

// Numbers at the farm, the camp in view.
{
  await step(3);
  await standFacing(54.5, 26, a1.x, a1.z);
  await page.evaluate(() => (window.__descent.paused = false));
  await xrFrames(6);
  const info = await page.evaluate(() => {
    const { renderer } = window.__descent;
    return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs.length };
  });
  console.log(`     at the farm's road end: ${info.calls} draw calls, ${(info.triangles / 1000).toFixed(1)}k triangles, ${info.programs} programs (the emulator's view)`);
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
