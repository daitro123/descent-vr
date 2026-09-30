// Checks for the ranger prototype (issues/05-how-the-ranger-fights.md) in
// headless Chromium with the IWER emulator. Start `npx vite --port 5173` first, then:
//
//   node .scratch/abilities/checks/ranger.mjs [http://localhost:5173] [shots/]
//
// The arena at `?arena&class=ranger-prototype` (`&class=ranger` since the
// ranger was built, ticket 21), paused and stepped in the page. The
// controllers are posed by code: the bow hand held out towards a grunt, the
// draw hand on the string, the trigger held, the hand pulled back, let go.
// What it checks:
//
// 1. The ranger has a bow and no sword, shield or War Cry; the default variant is the ward.
// 2. Touching the string with the trigger held nocks an arrow; pulling back draws it to full.
// 3. Letting go looses it: two full-draw body shots kill wave 1's first grunt, and a
//    full-draw head shot drops the second in one.
// 4. The ward, raised in time, sends an enemy arrow back; clicking the right stick
//    steps to the next variant.
// 5. Without `&class=`, the arena is the warrior's as before.
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
/** Run the game and the ranger's kit `s` seconds, your health kept full. */
const step = (s) =>
  page.evaluate((s) => {
    const { game, classKit } = window.__descent;
    for (let t = 0; t < s - 1e-9; t += 1 / 72) {
      if (game.player.alive) game.player.hp = game.player.maxHp;
      game.update(1 / 72);
      classKit?.update(1 / 72);
    }
  }, s);
const button = async (hand, name, value) => {
  await page.evaluate(([hand, name, value]) => window.__descent.device.controllers[hand].updateButtonValue(name, value), [hand, name, value]);
  await xrFrames(2);
  await step(1 / 72);
};

async function enter(query) {
  await page.goto(`${base}/?emulate&nodevui&${query}`);
  await page.waitForFunction(() => window.__descent?.game, null, { timeout: 120000 });
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  await page.evaluate(() => (window.__descent.paused = true));
}

/**
 * Hold the bow out towards the enemy's head (`head`) or chest, the fist's line
 * upright, then put the draw hand on the string. `index` picks the enemy from
 * the list; 'same' keeps the last one.
 */
async function aim(index, head, pull = null) {
  await page.evaluate(
    ([index, head]) => {
      const { game, device } = window.__descent;
      // Keep hold of the enemy itself: the dead leave the list.
      const e = typeof index === 'number' ? (window.__target = game.enemies[index]) : window.__target;
      const V = game.player.rig.position.constructor;
      const target = new V();
      if (head) {
        e.headSphere(target);
        target.y += 0.03; // the arrow drops a little over the room
      } else {
        const bottom = new V();
        e.capsule(bottom, target);
        target.lerp(bottom, 0.35);
      }
      game.player.rig.worldToLocal(target);
      const eye = new V(device.position.x, device.position.y, device.position.z);
      const left = eye.clone().addScaledVector(target.clone().sub(eye).normalize(), 0.55).add(new V(0, -0.12, 0));
      // The fist's line upright: grip −Z turned to +Y.
      const s = Math.SQRT1_2;
      const { left: L, right: R } = device.controllers;
      L.position.set(left.x, left.y, left.z);
      Object.assign(L.quaternion, { x: s, y: 0, z: 0, w: s });
      Object.assign(R.quaternion, { x: s, y: 0, z: 0, w: s });
      window.__aim = { target: target.toArray() };
    },
    [index, head],
  );
  await xrFrames(2);
  await step(1 / 72);
  await placeDrawHand(pull);
}

/**
 * Put the draw hand's grip on the string at rest (`pull` null), or `pull`
 * metres behind the arrow rest on the line to the target. The emulator's
 * controller sits a little off its grip, so this aims by the grip itself.
 */
async function placeDrawHand(pull) {
  await page.evaluate((pull) => {
    const { game, device, classKit } = window.__descent;
    const { rig } = game.player;
    const V = rig.position.constructor;
    const R = device.controllers.right;
    const grip = rig.worldToLocal(game.player.input.hands.right.grip.getWorldPosition(new V()));
    const offset = grip.sub(new V(R.position.x, R.position.y, R.position.z));
    const rest = rig.worldToLocal(classKit.bow.rest.clone());
    const want =
      pull === null
        ? rig.worldToLocal(classKit.bow.stringRest.clone())
        : rest.clone().addScaledVector(new V(...window.__aim.target).sub(rest).normalize(), -pull);
    want.sub(offset);
    R.position.set(want.x, want.y, want.z);
  }, pull);
  await xrFrames(2);
  await step(1 / 72);
}

const drawBack = (pull) => placeDrawHand(pull);

const bowState = () =>
  page.evaluate(() => {
    const { classKit: k } = window.__descent;
    return { nocked: k.bow.nocked, draw: k.bow.draw, shots: k.stats.shots, hits: k.stats.hits, heads: k.stats.heads, flying: k.shots.length };
  });
const enemies = () =>
  page.evaluate(() =>
    window.__descent.game.enemies.map((e) => ({ kind: e.kind, hp: e.hp, alive: e.alive, hittable: e.hittable, d: Math.hypot(e.position.x, e.position.z) })),
  );
/** The enemy last aimed at. */
const target = () =>
  page.evaluate(() => {
    const e = window.__target;
    return { hp: e.hp, alive: e.alive, state: e.state, guarded: window.__descent.combatStats.guarded };
  });

/** One full-draw shot at enemy `i`: aim, nock, draw, loose, and let it fly. */
async function shoot(i, head = false) {
  await aim(i, head);
  await button('right', 'trigger', 1);
  const nocked = await bowState();
  await drawBack(0.75);
  // Hold it there, on the target as it moves.
  await aim('same', head, 0.75);
  const drawn = await bowState();
  await button('right', 'trigger', 0);
  const loosed = await bowState();
  await step(0.4);
  return { nocked, drawn, loosed };
}

// ---------------------------------------------------------------- 1. the kit
await enter('arena&class=ranger-prototype');
await page.waitForFunction(() => window.__descent.classKit, null, { timeout: 30000 });
const kit = await page.evaluate(() => {
  const { game, classKit } = window.__descent;
  return {
    variant: classKit.variant,
    sword: game.player.sword.model.parent !== null,
    shield: game.player.shield.model.parent !== null,
    abilities: game.player.stats.abilities.length,
    bow: classKit.bow.root.parent !== null,
  };
});
check(kit.bow && !kit.sword && !kit.shield, `a bow, no sword and no shield (${JSON.stringify(kit)})`);
check(kit.abilities === 0, 'no War Cry or Earthshaker');
check(kit.variant === 'ward', `the ward is the default variant (${kit.variant})`);

// Wave 1: two grunts, after the intermission.
await step(5.6);
let foes = await enemies();
check(foes.length === 2 && foes.every((e) => e.kind === 'grunt'), `wave 1 is two grunts (${JSON.stringify(foes)})`);

// ---------------------------------------------------------------- 2–3. the draw and the plain attack
const first = await shoot(0);
check(first.nocked.nocked, 'touching the string with the trigger held nocks an arrow');
check(first.drawn.draw > 0.99, `pulling back draws it to full (${first.drawn.draw.toFixed(2)})`);
check(!first.loosed.nocked && first.loosed.shots === 1, 'letting go of the trigger looses it');
foes = await enemies();
check(foes[0].hp === 45 - 30, `a full-draw body shot takes 30 of the grunt's 45 (${foes[0].hp})`);
if (shots) await page.screenshot({ path: `${shots}/ranger-drawn.png` });
await shoot('same');
const firstDown = await target();
const kills = await page.evaluate(() => window.__descent.combatStats.kills);
check(!firstDown.alive && kills === 1, `a second one kills the grunt (${JSON.stringify(firstDown)}, kills ${kills})`);

// A quick, short draw does less.
const second = (await enemies()).findIndex((e) => e.alive);
await aim(second, false);
await button('right', 'trigger', 1);
await drawBack(0.3);
const short = await bowState();
await button('right', 'trigger', 0);
await step(0.6);
const shortHit = await target();
check(short.draw > 0.2 && short.draw < 0.5 && shortHit.hp < 45 && shortHit.hp > 45 - 30, `a short draw (${short.draw.toFixed(2)}) does less (${45 - shortHit.hp}, ${JSON.stringify(shortHit)})`);
await step(3);
await page.evaluate(() => (window.__target.hp = 45));
const headShot = await shoot('same', true);
const dropped = await target();
const heads = await bowState();
check(heads.heads === 1 && !dropped.alive, `a full-draw head shot drops a grunt in one (${JSON.stringify(dropped)}, heads ${heads.heads}, ${JSON.stringify(headShot.loosed)})`);

// ---------------------------------------------------------------- 4. the ward, and cycling variants
await step(2);
await page.evaluate(() => {
  const { device } = window.__descent;
  // Bow hand held out in front, fist upright.
  const s = Math.SQRT1_2;
  device.controllers.left.position.set(-0.05, 1.35, -0.4);
  Object.assign(device.controllers.left.quaternion, { x: s, y: 0, z: 0, w: s });
});
await xrFrames(2);
await step(1 / 72);
await button('left', 'squeeze', 1);
const fired = await page.evaluate(() => {
  const { game, classKit } = window.__descent;
  const V = game.player.rig.position.constructor;
  const grip = classKit.bow.grip.clone();
  const head = new V();
  game.player.headPosition(head);
  const from = grip.clone().add(grip.clone().sub(head).setY(0).normalize().multiplyScalar(2.5));
  // An archer's arrow, loosed from 2.5 m out straight at the bow hand; the ward is fresh.
  const owner = game.enemies.find((e) => e.alive) ?? null;
  game.combat.projectiles.fire(owner, from, grip, 10);
  return { up: classKit.wardUp };
});
await step(0.5);
const warded = await page.evaluate(() => window.__descent.classKit.stats);
check(fired.up && warded.wardReturns === 1, `a ward raised in time sends an arrow back (${JSON.stringify(warded)})`);
await button('left', 'squeeze', 0);
await button('right', 'thumbstick', 1);
await button('right', 'thumbstick', 0);
const next = await page.evaluate(() => window.__descent.classKit.variant);
check(next === 'knife', `clicking the right stick steps to the knife (${next})`);

// The knife (B): a grunt stood close, the draw hand slashed across it.
for (let i = 0; i < 20 && !(await page.evaluate(() => window.__descent.game.enemies.some((e) => e.alive && e.hittable))); i++) await step(0.5);
await page.evaluate(() => {
  const { game } = window.__descent;
  const V = game.player.rig.position.constructor;
  const e = (window.__target = game.enemies.find((x) => x.alive && x.hittable));
  const head = game.player.headPosition(new V());
  e.position.set(head.x, 0, head.z - 0.75);
  e.hp = 45;
  Object.assign(window.__descent.device.controllers.right.quaternion, { x: 0, y: 0, z: 0, w: 1 });
});
for (let i = 0; i <= 5; i++) {
  await page.evaluate((x) => window.__descent.device.controllers.right.position.set(x, 1.3, -0.3), 0.4 - i * 0.16);
  await xrFrames(2);
  await step(1 / 72);
}
const cut = await target();
const knifeHits = await page.evaluate(() => window.__descent.classKit.stats.knifeHits);
check(knifeHits >= 1 && cut.hp < 45, `a slash of the draw hand cuts with the knife (${45 - cut.hp}, ${JSON.stringify(cut)})`);

// Kiting (C): arrows run out, and two dashes come one after the other.
await page.evaluate(() => window.__descent.classKit.setVariant('kite'));
await step(1 / 72);
const quiverFull = await page.evaluate(() => window.__descent.classKit.quiver);
await shoot(0);
const quiverAfter = await page.evaluate(() => window.__descent.classKit.quiver);
check(quiverFull === 12 && quiverAfter === 11, `a shot takes one of 12 arrows (${quiverFull} → ${quiverAfter})`);
await step(1.2);
await button('right', 'b-button', 1);
await button('right', 'b-button', 0);
const oneDash = await page.evaluate(() => ({ dashes: window.__descent.classKit.dashes, cooldown: window.__descent.game.player.dashCooldown }));
await step(0.25);
await button('right', 'b-button', 1);
await button('right', 'b-button', 0);
const twoDashes = await page.evaluate(() => window.__descent.classKit.dashes);
check(oneDash.dashes === 1 && oneDash.cooldown <= 0.2 && twoDashes === 0, `two dashes back to back (${JSON.stringify(oneDash)}, then ${twoDashes} left)`);

// ---------------------------------------------------------------- 5. without the flag
await enter('arena');
await xrFrames(3);
const warrior = await page.evaluate(() => {
  const { game, classKit } = window.__descent;
  return { sword: game.player.sword.model.parent !== null, shield: game.player.shield.model.parent !== null, kit: classKit, abilities: game.player.stats.abilities.length };
});
check(warrior.sword && warrior.shield && warrior.kit === null && warrior.abilities > 0, `?arena alone is the warrior's (${JSON.stringify(warrior)})`);

check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
