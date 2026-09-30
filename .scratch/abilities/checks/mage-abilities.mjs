// Checks for the mage's abilities at 6, 8 and 10 (issues/24-the-mages-abilities-at-6-8-and-10.md)
// in headless Chromium with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/abilities/checks/mage-abilities.mjs [http://localhost:5173] [shots/]
//
// The harness (stepping game time in the page, holding the grips where hands
// would be, drawing a shape with the right grip, throwing a bolt) is
// mage.mjs's. In the arena, `?arena&class=mage`, with three of wave 1's
// grunts stood in a loose line in front of you:
// 1. The arena's mage holds Frostbolt on the Z, Chain Lightning on the V and
//    Blizzard on the S.
// 2. A Z drawn is Frostbolt, for 15 mana; a ring drawn while it waits says
//    "Fireball: Frostbolt is waiting" and spends nothing.
// 3. The next bolt, thrown, deals 20 and slows the grunt it hits by 40%.
// 4. A V drawn is Chain Lightning, for 30 mana; the next bolt hits a grunt
//    and arcs on to the two others.
// 5. An S drawn facing a grunt is Blizzard, for 40 mana: its circle falls on
//    that grunt, ice falls in it, and every grunt in it takes a tick every
//    0.5 s and is slowed by half; after 5 s the ice stops.
// 6. No page errors.
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

/** A button on an emulated controller, then two XR frames so the gamepad reads it. */
async function button(hand, name, value) {
  await page.evaluate(([hand, name, value]) => window.__descent.device.controllers[hand].updateButtonValue(name, value), [hand, name, value]);
  await xrFrames(2);
}

// Remember each floating text's words, so the check can read them back.
await page.addInitScript(() => {
  const fill = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) {
    this.__text = text;
    return fill.call(this, text, ...rest);
  };
});

/** Into VR, paused, with the helpers the steps share on `window.__mage`. */
async function enter() {
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  await page.evaluate(async () => {
    const d = window.__descent;
    d.paused = true;
    window.__strokes = await import('/tests/support/gestureStrokes.ts');
    const game = d.game ?? d.adventure;
    const { player } = game;
    const V = player.rig.position.constructor;
    const { hands } = player.input;
    const arena = !!d.game;
    /** A grip where the controller would put it (rig space), and the emulated controller with it, so an XR frame doesn't move it. */
    const hold = (hand, p) => {
      const g = hands[hand].grip;
      g.position.set(...p);
      g.quaternion.set(0, 0, 0, 1);
      g.updateMatrix();
      const c = d.device.controllers[hand];
      c.position.set(...p);
      c.quaternion.set(0, 0, 0, 1);
    };
    const foes = () => (arena ? game.enemies : [...game.camps.enemies]);
    /** One frame, your health kept full (and in the arena the next wave held back). */
    const tick = (dt = 1 / 72) => {
      player.hp = player.maxHp;
      if (arena) game.phaseTime = Math.min(game.phaseTime, 0);
      player.rig.updateMatrixWorld(true);
      if (arena) game.update(dt);
      else d.step(dt, dt);
    };
    const head = () => player.camera.getWorldPosition(new V());
    const down = () => {
      hold('left', [-0.35, 0.8, 0.1]);
      hold('right', [0.35, 0.8, 0.1]);
    };
    /** Stand `range` m from `e`, facing it. */
    const keepAt = (e, range) => {
      const h = head();
      const dx = h.x - e.position.x;
      const dz = h.z - e.position.z;
      const d0 = Math.hypot(dx, dz) || 1;
      const x = e.position.x + (dx / d0) * range;
      const z = e.position.z + (dz / d0) * range;
      player.place(x, z, Math.atan2(-(e.position.x - x), -(e.position.z - z)));
      player.rig.updateMatrixWorld(true);
    };
    const words = () => (game.text.active ?? []).map((f) => f.sprite.material.map.image.getContext('2d').__text ?? '');
    window.__mage = { d, game, player, hold, tick, head, down, keepAt, foes, words, V, arena };
  });
}

/**
 * One bolt thrown with the right hand at `target()` (an enemy the page picks):
 * standing `range` m from it, the trigger held 0.6 s with the hand drawn back
 * by the shoulder, then the arm thrown forward at 4.5 m/s and the trigger let
 * go mid-throw; the bolt let fly for up to a second. What came of it.
 */
async function throwAt(pick, range = 4) {
  const before = await page.evaluate(
    ([pick, range]) => {
      const { keepAt, hold, tick, foes } = window.__mage;
      const target = new Function('foes', `return (${pick})(foes)`)(foes());
      if (!target) return null;
      window.__target = target;
      keepAt(target, range);
      hold('right', [0.25, 1.5, 0.15]);
      tick();
      return { hp: target.hp };
    },
    [pick, range],
  );
  if (!before) return null;
  await button('right', 'trigger', 1);
  await page.evaluate((range) => {
    const { hold, tick, keepAt } = window.__mage;
    for (let t = 0; t < 0.6; t += 1 / 72) {
      keepAt(window.__target, range);
      hold('right', [0.25, 1.5, 0.15]);
      tick();
    }
    for (let i = 1; i <= 3; i++) {
      hold('right', [0.25, 1.5 - i * 0.004, 0.15 - (i * 4.5) / 72]);
      tick();
    }
  }, range);
  await button('right', 'trigger', 0);
  return page.evaluate((range) => {
    const { hold, tick, keepAt, down, game } = window.__mage;
    const bolts = game.combat.bolts.bolts;
    const n = bolts.length;
    hold('right', [0.25, 1.5 - 4 * 0.004, 0.15 - (4 * 4.5) / 72]);
    tick();
    const b = bolts.length > n ? bolts[bolts.length - 1] : null;
    const cast = b && { damage: b.damage, fire: b.charge === 'fireball', locked: b.target === window.__target };
    for (let t = 0; t < 1 && bolts.length; t += 1 / 72) {
      if (window.__target.alive) keepAt(window.__target, range);
      down();
      tick();
    }
    return { hp: window.__target.hp, alive: window.__target.alive, cast };
  }, range);
}

/**
 * Draw a shape with the right hand: the grip squeezed at the stroke's first
 * point, the hand moved along it frame by frame, the grip let go at its last.
 * Returns the gestures' last outcome.
 */
async function draw(shape, seed = 1) {
  const n = await page.evaluate(
    ([shape, seed]) => {
      const { player, V, d } = window.__mage;
      const S = window.__strokes;
      const stroke = S.performShape(shape, S.rng(seed));
      const head = player.rig.worldToLocal(player.headPosition(new V()));
      const gaze = player.camera.getWorldDirection(new V()).applyQuaternion(player.rig.quaternion.clone().invert());
      const f = new V(gaze.x, 0, gaze.z).normalize();
      const right = new V(-f.z, 0, f.x);
      window.__stroke = stroke.points.map(([x, y, z]) => head.clone().addScaledVector(right, x).add(new V(0, y, 0)).addScaledVector(f, z).toArray());
      d.device.controllers.right.position.set(...window.__stroke[0]);
      return window.__stroke.length;
    },
    [shape, seed],
  );
  await xrFrames(2);
  await button('right', 'squeeze', 1);
  await page.evaluate((n) => {
    const { player, tick } = window.__mage;
    const grip = player.input.hands.right.grip;
    for (let i = 0; i < n; i++) {
      grip.position.fromArray(window.__stroke[i]);
      grip.updateMatrix();
      tick();
    }
    window.__descent.device.controllers.right.position.set(...window.__stroke[n - 1]);
  }, n);
  await button('right', 'squeeze', 0);
  return page.evaluate(() => {
    const { game, player, tick } = window.__mage;
    const grip = player.input.hands.right.grip;
    grip.position.fromArray(window.__stroke[window.__stroke.length - 1]);
    grip.updateMatrix();
    tick();
    const l = game.gestures.last;
    return { id: l?.verdict?.id ?? null, ability: l?.ability ?? null, use: l?.use ?? null };
  });
}

/** Press a controller's button for a frame, then let go. */
async function press(hand, name) {
  await button(hand, name, 1);
  await page.evaluate(() => window.__mage.tick());
  await button(hand, name, 0);
  await page.evaluate(() => window.__mage.tick());
}

// ================================================================ the arena

await page.goto(`${base}/?arena&class=mage&emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.game, null, { timeout: 120000 });
await enter();

/** Three grunts in a loose line `range` m ahead, 2.5 m apart, standing; mana full and nothing cooling. */
async function line(range = 5) {
  return page.evaluate((range) => {
    const { game, player, tick, down, V } = window.__mage;
    for (let t = 0; t < 12 && !game.enemies.some((e) => e.kind === 'grunt' && e.hittable); t += 1 / 72) {
      down();
      game.phaseTime = Math.max(game.phaseTime, 0);
      player.rig.updateMatrixWorld(true);
      game.update(1 / 72);
    }
    for (const e of game.enemies.filter((e) => e.kind !== 'grunt')) e.hp = 0;
    const grunts = game.enemies.filter((e) => e.kind === 'grunt' && e.alive);
    while (grunts.length < 3) grunts.push(game.addEnemy('grunt', new V(0, 0, -range)));
    for (let t = 0; t < 4 && grunts.some((g) => !g.hittable); t += 1 / 72) tick();
    player.place(0, 2, 0);
    player.rig.updateMatrixWorld(true);
    grunts.slice(0, 3).forEach((g, i) => {
      g.hp = g.maxHp;
      g.position.set((i - 1) * 2.5, g.position.y, 2 - range - i * 0.5);
    });
    window.__grunts = grunts.slice(0, 3);
    player.resource = player.bar.size;
    player.abilities.clear();
    down();
    tick();
    return window.__grunts.map((g) => g.hittable);
  }, range);
}

// 1.
{
  const s = await page.evaluate(async () => {
    const { player } = window.__mage;
    const { slotsOf } = await import('/src/classes.ts');
    const slots = slotsOf(player.stats.abilities);
    return { z: slots.z, v: slots.v, s: slots.s };
  });
  check(s.z === 'frostbolt' && s.v === 'chainLightning' && s.s === 'blizzard', `the arena's mage holds Frostbolt on the Z, Chain Lightning on the V, Blizzard on the S (${JSON.stringify(s)})`);
}

// 2. Frostbolt on the Z, and one charge at a time.
{
  const up = await line();
  check(up.every(Boolean), `three grunts stand in front of you (${JSON.stringify(up)})`);
  const z = await draw('z');
  const after = await page.evaluate(() => ({ mana: window.__mage.player.resource, waiting: window.__mage.player.abilities.waitingOn() }));
  check(z.id === 'z' && z.ability === 'frostbolt' && z.use === 'cast' && after.waiting === 'frostbolt', `a Z is read as Frostbolt and waits on the next bolt (${JSON.stringify({ ...z, ...after })})`);
  check(Math.abs(after.mana - 85) < 0.5, `for 15 mana (${after.mana.toFixed(1)} left)`);
  const ring = await draw('ring', 2);
  const said = await page.evaluate(() => ({ mana: window.__mage.player.resource, words: window.__mage.words() }));
  check(ring.ability === 'fireball' && ring.use === 'waiting' && said.words.some((w) => w === 'Fireball: Frostbolt is waiting'), `a ring drawn while it waits says so (${JSON.stringify({ ...ring, words: said.words })})`);
  check(said.mana >= after.mana - 0.01, `and spends nothing (${said.mana.toFixed(1)} left)`);
  await shot('frostbolt-ready');
}

// 3. The frost bolt slows the grunt it hits.
{
  const cast = await throwAt('(foes) => window.__grunts[1]');
  const slow = await page.evaluate(() => ({ slowness: window.__grunts[1].slowness, chilled: window.__descent.combatStats.chilled }));
  check(cast?.cast?.damage === 20 && cast.cast.locked, `the next bolt leaves for 20, locked on the grunt (${JSON.stringify(cast?.cast)})`);
  check(Math.abs(slow.slowness - 0.4) < 1e-6 && slow.chilled === 1, `and slows it by 40% (${JSON.stringify(slow)})`);
  await shot('frostbolt-slowed');
}

// 4. Chain Lightning on the V.
{
  await line();
  const v = await draw('v', 3);
  const mana = await page.evaluate(() => window.__mage.player.resource);
  check(v.id === 'v' && v.ability === 'chainLightning' && v.use === 'cast', `a V is read as Chain Lightning (${JSON.stringify(v)})`);
  check(Math.abs(mana - 70) < 0.5, `for 30 mana (${mana.toFixed(1)} left)`);
  const before = await page.evaluate(() => window.__grunts.map((g) => g.hp));
  const cast = await throwAt('(foes) => window.__grunts[0]');
  const after = await page.evaluate(() => ({ hp: window.__grunts.map((g) => g.hp), arcs: window.__descent.combatStats.arcs }));
  const lost = before.map((hp, i) => hp - after.hp[i]);
  check(cast?.cast && after.arcs === 2, `the next bolt arcs on to two more (${after.arcs} arcs)`);
  check(lost[0] >= 20 && lost[1] >= 14 && lost[2] >= 14, `the one it hit took 20, each arc 14 (${JSON.stringify(lost)})`);
  await shot('chain-lightning');
}

// 5. Blizzard on the S.
{
  await line(6);
  await page.evaluate(() => {
    const { keepAt, tick, down } = window.__mage;
    keepAt(window.__grunts[1], 6);
    down();
    tick();
    // The wand level at the end of the stroke: the emulated controller's grip otherwise points 45° up.
    window.__descent.device.controllers.right.quaternion.set(Math.sin(-Math.PI / 8), 0, 0, Math.cos(-Math.PI / 8));
  });
  const s = await draw('s', 4);
  const cast = await page.evaluate(() => {
    const { game, player } = window.__mage;
    const b = game.combat.blizzard;
    const g = window.__grunts[1];
    return {
      mana: player.resource,
      active: b.active,
      off: Math.hypot(b.centre.x - g.position.x, b.centre.z - g.position.z),
      hits: window.__descent.combatStats.blizzardHits,
      centre: b.centre.toArray().map((v) => +v.toFixed(2)),
      grunts: window.__grunts.map((g) => [+g.position.x.toFixed(2), +g.position.z.toFixed(2)]),
      me: window.__mage.head().toArray().map((v) => +v.toFixed(2)),
      hand: new window.__mage.V(0, 0, -1).applyQuaternion(player.input.hands.right.grip.getWorldQuaternion(new player.rig.quaternion.constructor())).toArray().map((v) => +v.toFixed(2)),
    };
  });
  check(s.id === 's' && s.ability === 'blizzard' && s.use === 'cast' && cast.active, `an S is read as Blizzard, and ice falls (${JSON.stringify({ ...s, ...cast })})`);
  check(Math.abs(cast.mana - 60) < 0.5, `for 40 mana (${cast.mana.toFixed(1)} left)`);
  check(cast.off < 1, `its circle falls on the grunt you face (${cast.off.toFixed(2)} m off)`);
  const mid = await page.evaluate(() => {
    const { game, tick } = window.__mage;
    const b = game.combat.blizzard;
    const hits0 = window.__descent.combatStats.blizzardHits;
    const hp0 = window.__grunts.map((g) => g.hp);
    for (let t = 0; t < 1.9; t += 1 / 72) {
      // The grunts held inside the circle, near its middle.
      window.__grunts.forEach((g, i) => g.position.set(b.centre.x + (i - 1) * 1.5, g.position.y, b.centre.z));
      tick();
    }
    return {
      hits: window.__descent.combatStats.blizzardHits - hits0,
      lost: window.__grunts.map((g, i) => hp0[i] - g.hp),
      slow: window.__grunts.map((g) => g.slowness),
      shards: b.shards.count,
      disc: b.disc.visible,
      tris: b.triangles,
    };
  });
  check(mid.hits >= 9 && mid.lost.every((l) => l >= 18), `the ice bites every grunt in it every 0.5 s (${JSON.stringify(mid)})`);
  check(mid.slow.every((s) => Math.abs(s - 0.5) < 1e-6), `and slows each by half (${JSON.stringify(mid.slow)})`);
  check(mid.shards > 0 && mid.disc && mid.tris <= 500, `ice falls in a circle on the floor, ${mid.tris} triangles at most (${mid.shards} shards)`);
  await shot('blizzard');
  const done = await page.evaluate(() => {
    const { game, tick } = window.__mage;
    for (let t = 0; t < 3.5; t += 1 / 72) tick();
    return game.combat.blizzard.active;
  });
  check(done === false, 'after 5 s the ice stops');
}

// 6.
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
