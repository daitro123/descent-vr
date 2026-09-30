// Checks for the mage prototype (issues/06-how-the-mage-fights.md) in headless
// Chromium with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/abilities/checks/mage.mjs [http://localhost:5173] [shots/]
//
// The arena at `?arena&class=mage`, paused and stepped a frame at a time by
// `__descent.game.update`, the grips held where a player's hands would be and
// the triggers, grips and B pressed through the emulated controllers.
//
// 1. The mage holds no sword, has no rage or War Cry, and starts on kit A.
// 2. Kit A: bolts charged on the trigger and thrown kill wave 1's grunts:
//    a full bolt takes 20, so three kill one (two with a head shot).
// 3. A gentle toss makes a bigger, slower bolt than a hard throw.
// 4. Let go without throwing and nothing is cast.
// 5. The left grip raises the ward: an archer's arrow at your chest stops on
//    it, costs 10 mana and no health; with the grip let go, the same arrow hurts.
// 6. B blinks you 3.5 m back (the dash is 1.7 m); the dash doesn't also fire,
//    and the blink waits out its cooldown.
// 7. Kit B: the wand, pointed and triggered, kills a grunt, each bolt costing
//    5 mana; its off hand only wards.
// 8. Kit C: charged and pushed out, the palm's bolts kill a grunt, both hands casting.
// 9. The right stick's click steps to the next kit.
// 10. `?arena` alone is the warrior's: the sword in the right hand, the War Cry there.
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
const near = (a, b, tol) => Math.abs(a - b) <= tol;
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

async function open(query) {
  await page.goto(`${base}/?${query}&emulate&nodevui`);
  await page.waitForFunction(() => window.__descent?.game, null, { timeout: 120000 });
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  await page.evaluate(() => {
    const d = window.__descent;
    d.paused = true;
    const { game } = d;
    const { player } = game;
    const V = player.rig.position.constructor;
    const Q = player.rig.quaternion.constructor;
    const { hands } = player.input;
    const kit = game.kit;
    // Every buzz the kit asks for.
    window.__buzzes = [];
    if (kit) kit.onPulse = (hand, intensity, ms) => window.__buzzes.push({ hand, intensity, ms });
    const DOWN = { left: [-0.35, 0.8, 0.1], right: [0.35, 0.8, 0.1] };
    /** A grip where the controller would put it (rig space), and the emulated controller with it, so an XR frame doesn't move it. */
    const hold = (hand, p, q = [0, 0, 0, 1]) => {
      const g = hands[hand].grip;
      g.position.set(...p);
      g.quaternion.set(...q);
      g.updateMatrix();
      const c = d.device.controllers[hand];
      c.position.set(...p);
      c.quaternion.set(...q);
    };
    const tick = (dt = 1 / 72) => {
      player.rig.updateMatrixWorld(true);
      game.update(dt);
    };
    const head = () => player.camera.getWorldPosition(new V());
    /** Stand where you are, facing (x, z). */
    const face = (x, z) => {
      const h = head();
      player.place(h.x, h.z, Math.atan2(-(x - h.x), -(z - h.z)));
      player.rig.updateMatrixWorld(true);
    };
    /** The nearest grunt standing, or null. */
    const grunt = () => {
      const me = head();
      let best = null;
      for (const e of game.enemies) {
        if (!e.alive || !e.hittable || e.kind !== 'grunt') continue;
        if (!best || e.position.distanceTo(me) < best.position.distanceTo(me)) best = e;
      }
      return best;
    };
    /** Keep a grunt at `range` m in front of you: step back as it closes (a mage keeps its distance). */
    const keepAt = (e, range) => {
      const h = head();
      const dx = h.x - e.position.x;
      const dz = h.z - e.position.z;
      const d0 = Math.hypot(dx, dz) || 1;
      const x = e.position.x + (dx / d0) * range;
      const z = e.position.z + (dz / d0) * range;
      player.place(Math.max(-5, Math.min(5, x)), Math.max(-5, Math.min(5, z)), Math.atan2(-(e.position.x - x), -(e.position.z - z)));
      player.rig.updateMatrixWorld(true);
    };
    const down = () => {
      hold('left', DOWN.left);
      hold('right', DOWN.right);
    };
    /** Wait for the wave: step with hands down until a grunt stands (up to `seconds`). */
    const waitForGrunt = (seconds = 12) => {
      for (let t = 0; t < seconds; t += 1 / 72) {
        down();
        tick();
        const g = grunt();
        if (g && g.state !== 'rising') return true;
      }
      return false;
    };
    /** Aim: a quaternion turning the grip's -Z onto a rig-space direction. */
    const aim = (dir) => new Q().setFromUnitVectors(new V(0, 0, -1), new V(...dir).normalize()).toArray();
    window.__mage = { d, game, player, kit, hold, tick, head, face, grunt, keepAt, down, waitForGrunt, aim, V };
  });
}

// ------------------------------------------------------------------ kit A

await open('arena&class=mage');
const start = await page.evaluate(() => {
  const { player, kit } = window.__mage;
  return {
    sword: player.sword.model.parent !== null,
    abilities: player.stats.abilities.length,
    hp: player.hp,
    kit: kit?.variant,
    mana: kit?.mana,
  };
});
check(!start.sword && start.abilities === 0 && start.hp === 100, `the mage holds no sword and has none of the warrior's abilities, at level 1's 100 health (sword ${start.sword}, ${start.abilities} abilities, ${start.hp} health)`);
check(start.kit?.kit === 'A' && start.kit.cast === 'throw' && start.kit.focus === 'ward' && start.kit.move === 'blink' && start.kit.mana === 'free', `kit A by default: ${JSON.stringify(start.kit)}`);
check(start.mana === 100, `a full 100 mana (${start.mana})`);

/**
 * One thrown bolt at the nearest grunt: the trigger held 0.6 s with the hand
 * drawn back by the shoulder, then the arm thrown forward at `speed` m/s and
 * the trigger let go mid-throw. Returns the grunt's health before and after
 * the bolt lands (or flies wide).
 */
async function throwAt({ speed = 4.5, charge = 0.6, range = 4, hand = 'right' } = {}) {
  const x = hand === 'right' ? 0.25 : -0.25;
  const before = await page.evaluate(([range, x, hand]) => {
    const { grunt, keepAt, hold, tick } = window.__mage;
    const g = grunt();
    if (!g) return null;
    keepAt(g, range);
    hold(hand, [x, 1.5, 0.15]);
    tick();
    window.__target = g;
    return { hp: g.hp, id: g.root.id };
  }, [range, x, hand]);
  if (!before) return null;
  await button(hand, 'trigger', 1);
  const after = await page.evaluate(([charge, x, hand]) => {
    const { hold, tick, keepAt, kit } = window.__mage;
    for (let t = 0; t < charge; t += 1 / 72) {
      keepAt(window.__target, 4);
      hold(hand, [x, 1.5, 0.15]);
      tick();
    }
    return { charging: kit.casters[hand].held, orb: kit.casters[hand].orb.visible, fraction: kit.casters[hand].fraction };
  }, [charge, x, hand]);
  // The throw: forward (−Z, toward the grunt) and a little down, `speed` m/s, three frames before the release…
  const stepZ = speed / 72;
  await page.evaluate(([stepZ, x, hand]) => {
    const { hold, tick } = window.__mage;
    for (let i = 1; i <= 3; i++) {
      hold(hand, [x, 1.5 - i * 0.004, 0.15 - i * stepZ]);
      tick();
    }
  }, [stepZ, x, hand]);
  await button(hand, 'trigger', 0);
  // …and the frame the trigger is read as let go, the hand still going.
  const cast = await page.evaluate(([stepZ, x, hand]) => {
    const { hold, tick, kit } = window.__mage;
    const n = kit.bolts.bolts.length;
    hold(hand, [x, 1.5 - 4 * 0.004, 0.15 - 4 * stepZ]);
    tick();
    const b = kit.bolts.bolts[kit.bolts.bolts.length - 1];
    return kit.bolts.bolts.length > n ? { speed: b.vel.length(), radius: b.radius, damage: b.damage, locked: b.target === window.__target } : null;
  }, [stepZ, x, hand]);
  // Let it fly, keeping the grunt at range.
  const hp = await page.evaluate(() => {
    const { tick, keepAt, down, kit } = window.__mage;
    for (let t = 0; t < 1.2 && kit.bolts.bolts.length; t += 1 / 72) {
      if (window.__target.alive) keepAt(window.__target, 4);
      down();
      tick();
    }
    return { hp: window.__target.hp, alive: window.__target.alive };
  });
  return { before: before.hp, ...hp, charging: after, cast };
}

check(await page.evaluate(() => window.__mage.waitForGrunt()), 'wave 1 rises: a grunt stands');
await shot('mage-wave1');
const kills0 = await page.evaluate(() => window.__descent.combatStats.kills);
const first = await throwAt();
check(first?.charging.charging && first.charging.orb && first.charging.fraction >= 0.95, `holding the trigger charges a bolt in the palm, the orb showing (${JSON.stringify(first?.charging)})`);
check(first?.cast && near(first.cast.damage, 20, 0.01), `let go mid-throw, a full bolt leaves: ${first?.cast?.damage} damage`);
check(first?.cast?.locked, 'the aim assist locked it onto the grunt');
check(first && first.before - first.hp >= 20, `it lands on the grunt: ${first?.before} → ${first?.hp} health`);
const buzzes = await page.evaluate(() => window.__buzzes.length);
check(buzzes >= 6, `the hand ticks through the charge and pulses on the cast and the hit (${buzzes} buzzes)`);

// The assist may send a bolt to either of the wave's grunts: throw until one falls.
let bolts = 1;
while ((await page.evaluate(() => window.__descent.combatStats.kills)) === kills0 && bolts < 10) {
  await throwAt();
  bolts++;
}
const kills1 = await page.evaluate(() => window.__descent.combatStats.kills);
check(kills1 > kills0, `thrown bolts killed a wave 1 grunt (kills ${kills0} → ${kills1})`);
check(bolts >= 2 && bolts <= 5, `in ${bolts} bolts, some maybe landing on the other grunt (three full bolts kill one, two with a head shot)`);

// 3. The throw shapes the bolt.
const ready = async () => check(await page.evaluate(() => window.__mage.waitForGrunt(10)), 'a grunt stands');
await ready();
const toss = await throwAt({ speed: 1.6 });
await ready();
const hard = await throwAt({ speed: 5 });
check(toss?.cast && hard?.cast && toss.cast.radius > hard.cast.radius && toss.cast.speed < hard.cast.speed, `a gentle toss makes a bigger, slower bolt (${toss?.cast?.radius.toFixed(2)} m at ${toss?.cast?.speed.toFixed(1)} m/s) than a hard throw (${hard?.cast?.radius.toFixed(2)} m at ${hard?.cast?.speed.toFixed(1)} m/s)`);

// 4. No throw, no cast.
await ready();
const still = await throwAt({ speed: 0.3 });
check(still && !still.cast, 'let go with the hand still: nothing is cast (a fizzle)');
let more = 0;
while ((await page.evaluate(() => !!window.__mage.grunt())) && more < 10) {
  await throwAt();
  more++;
}
const kills2 = await page.evaluate(() => window.__descent.combatStats.kills);
check(kills2 >= 2, `wave 1 is down to bolts: ${kills2} kills`);

// 5. The ward.
/** An arrow from 5 m ahead at your chest, with the left grip held (the ward up in front of the chest) or not. */
async function arrow(ward) {
  await button('left', 'squeeze', ward ? 1 : 0);
  return page.evaluate(() => {
    const { d, game, player, kit, hold, tick, head, V } = window.__mage;
    player.place(0, 2, 0);
    // Tip the fist up 45° so the ward (the shield's board, pitched down 45°) stands upright.
    hold('left', [-0.05, 1.3, -0.4], [Math.sin(Math.PI / 8), 0, 0, Math.cos(Math.PI / 8)]);
    hold('right', [0.35, 0.8, 0.1]);
    tick();
    tick();
    const warding = kit.warding;
    const before = { hp: player.hp, mana: kit.mana, blocks: d.combatStats.blocks };
    const h = head();
    const from = new V(h.x, h.y - 0.3, h.z - 5);
    const at = new V(h.x, h.y - 0.35, h.z);
    const shooter = game.enemies[0] ?? null;
    game.combat.projectiles.fire(shooter, from, at, 10);
    let spent = 0;
    for (let i = 0; i < 60; i++) {
      hold('left', [-0.05, 1.3, -0.4], [Math.sin(Math.PI / 8), 0, 0, Math.cos(Math.PI / 8)]);
      const mana = kit.mana;
      tick();
      // The pool refills out of a fight, so read the cost on the frame it's paid.
      if (mana - kit.mana > spent) spent = mana - kit.mana;
    }
    return { warding, hp: before.hp - player.hp, mana: spent, blocks: d.combatStats.blocks - before.blocks };
  });
}
// Out of the fight the pool refills; wait for it to be full.
await page.evaluate(() => {
  const { down, tick, kit } = window.__mage;
  for (let t = 0; t < 6 && kit.mana < 100; t += 1 / 72) {
    down();
    tick();
  }
});
const warded = await arrow(true);
check(warded.warding && warded.blocks === 1 && warded.hp === 0, `the ward up, an arrow at your chest stops on it: no health lost (${JSON.stringify(warded)})`);
check(near(warded.mana, 10, 0.6), `the block cost 10 mana (${warded.mana.toFixed(1)})`);
await shot('mage-ward');
const open_ = await arrow(false);
check(!open_.warding && open_.hp === 10 && open_.blocks === 0, `with the grip let go the ward drops and the same arrow hurts: ${open_.hp} health`);

// 6. The blink.
const blink = await page.evaluate(() => {
  const { player, head, tick, down } = window.__mage;
  player.place(0, 0, 0);
  down();
  tick();
  window.__from = head();
  return true;
});
await button('right', 'b-button', 1);
const blinked = await page.evaluate(() => {
  const { head, tick, down, kit, player } = window.__mage;
  down();
  tick();
  const h1 = head();
  // A dash would carry on over the next frames; a blink is done.
  for (let i = 0; i < 20; i++) tick();
  const h2 = head();
  return { back: h1.z - window.__from.z, side: Math.abs(h1.x - window.__from.x), after: Math.hypot(h2.x - h1.x, h2.z - h1.z), cooldown: kit.blinkCooldown, dash: player.dashCooldown };
});
await button('right', 'b-button', 0);
check(blink && near(blinked.back, 3.5, 0.05) && blinked.side < 0.05, `B blinks you 3.5 m back at once (${blinked.back.toFixed(2)} m)`);
check(blinked.after < 0.01, `and no dash follows (moved ${blinked.after.toFixed(3)} m after)`);
check(blinked.cooldown > 1.8 && blinked.dash > 0, `the blink cools down (${blinked.cooldown.toFixed(2)} s), shown on the belt's dash bar`);
await button('right', 'b-button', 1);
const again = await page.evaluate(() => {
  const { head, tick, down } = window.__mage;
  const h0 = head();
  down();
  tick();
  const h1 = head();
  return Math.hypot(h1.x - h0.x, h1.z - h0.z);
});
await button('right', 'b-button', 0);
check(again < 0.01, `pressed again inside its cooldown, nothing (${again.toFixed(3)} m)`);

// 9. The right stick's click.
await button('right', 'thumbstick', 1);
const next = await page.evaluate(() => {
  const { tick, down, kit } = window.__mage;
  down();
  tick();
  return kit.variant.kit;
});
await button('right', 'thumbstick', 0);
check(next === 'B', `the right stick's click steps to kit ${next}`);

// ------------------------------------------------------------------ kit B: the wand

await open('arena&class=mage&kit=B');
check(await page.evaluate(() => window.__mage.waitForGrunt()), 'kit B: wave 1 rises');
/** Point the wand at the grunt, hold the trigger `charge` s, let go. */
async function wandAt(charge = 0.6) {
  const ready = await page.evaluate(() => {
    const { grunt, keepAt, hold, tick, aim } = window.__mage;
    const g = grunt();
    if (!g) return false;
    keepAt(g, 4);
    hold('right', [0.2, 1.4, -0.2], aim([-0.05, -0.05, -1]));
    tick();
    window.__target = g;
    return true;
  });
  if (!ready) return null;
  await button('right', 'trigger', 1);
  await page.evaluate((charge) => {
    const { hold, tick, keepAt, aim } = window.__mage;
    for (let t = 0; t < charge; t += 1 / 72) {
      keepAt(window.__target, 4);
      hold('right', [0.2, 1.4, -0.2], aim([-0.05, -0.05, -1]));
      tick();
    }
  }, charge);
  await button('right', 'trigger', 0);
  return page.evaluate(() => {
    const { hold, tick, keepAt, down, kit, aim } = window.__mage;
    const mana = kit.mana;
    const n = kit.bolts.bolts.length;
    hold('right', [0.2, 1.4, -0.2], aim([-0.05, -0.05, -1]));
    tick();
    const fired = kit.bolts.bolts.length > n;
    const spent = mana - kit.mana;
    for (let t = 0; t < 1.2 && kit.bolts.bolts.length; t += 1 / 72) {
      if (window.__target.alive) keepAt(window.__target, 4);
      down();
      tick();
    }
    return { fired, spent, alive: window.__target.alive, hp: window.__target.hp };
  });
}
const wandKit = await page.evaluate(() => ({ wand: !!window.__mage.kit.variant && window.__mage.kit.variant.cast, held: window.__mage.player.input.hands.right.grip.children.length }));
check(wandKit.wand === 'wand', `kit B casts with a wand (${wandKit.wand})`);
let w = await wandAt();
check(w?.fired && near(w.spent, 5, 0.1), `the wand fires where it points, the bolt costing 5 mana (${w?.spent?.toFixed(2)})`);
let wandBolts = 1;
while (w && w.alive && wandBolts < 8) {
  w = await wandAt();
  wandBolts++;
}
check(w && !w.alive, `the wand killed a wave 1 grunt in ${wandBolts} bolts`);
await shot('mage-wand');
const offHand = await page.evaluate(() => window.__mage.kit.variant.focus);
check(offHand === 'wardOnly', `kit B's off hand only wards (${offHand})`);

// ------------------------------------------------------------------ kit C: the push

await open('arena&class=mage&kit=C');
check(await page.evaluate(() => window.__mage.waitForGrunt()), 'kit C: wave 1 rises');
/** Hold the trigger by the chest, then push the palm out toward the grunt, the trigger still held. */
async function pushAt(hand = 'right') {
  const x = hand === 'right' ? 0.15 : -0.15;
  const ready = await page.evaluate(([x, hand]) => {
    const { grunt, keepAt, hold, tick } = window.__mage;
    const g = grunt();
    if (!g) return false;
    keepAt(g, 4);
    hold(hand, [x, 1.35, -0.05]);
    tick();
    window.__target = g;
    return true;
  }, [x, hand]);
  if (!ready) return null;
  await button(hand, 'trigger', 1);
  const res = await page.evaluate(([x, hand]) => {
    const { hold, tick, keepAt, down, kit } = window.__mage;
    for (let t = 0; t < 0.6; t += 1 / 72) {
      keepAt(window.__target, 4);
      hold(hand, [x, 1.35, -0.05]);
      tick();
    }
    const n = kit.bolts.bolts.length;
    // The push: 3 m/s straight out, 0.5 m.
    for (let i = 1; i <= 12; i++) {
      hold(hand, [x, 1.35, -0.05 - (i * 3) / 72]);
      tick();
    }
    const fired = kit.bolts.bolts.length > n;
    for (let t = 0; t < 1.2 && kit.bolts.bolts.length; t += 1 / 72) {
      if (window.__target.alive) keepAt(window.__target, 4);
      down();
      tick();
    }
    return { fired, alive: window.__target.alive };
  }, [x, hand]);
  await button(hand, 'trigger', 0);
  return res;
}
let p = await pushAt();
check(p?.fired, 'the palm pushed out casts, the trigger still held');
const leftPush = await pushAt('left');
check(leftPush?.fired, 'the off hand casts as well: kit C has two casters');
p = leftPush;
let pushes = 2;
while (p && p.alive && pushes < 10) {
  p = await pushAt(pushes % 2 ? 'left' : 'right');
  pushes++;
}
check(p && !p.alive, `pushed bolts killed a wave 1 grunt in ${pushes} bolts`);

// ------------------------------------------------------------------ the warrior's arena, unchanged

await open('arena');
const warrior = await page.evaluate(() => {
  const { player, kit } = window.__mage;
  return { sword: player.sword.model.parent !== null, shield: player.shield.model.parent !== null, warCry: player.can('warCry'), kit: kit ?? null, dashes: player.dashes };
});
check(warrior.sword && warrior.shield && warrior.warCry && warrior.kit === null && warrior.dashes, `?arena alone is the warrior's: sword, shield, War Cry, dash, no kit (${JSON.stringify(warrior)})`);

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
