// Checks for the mage (issues/23-the-mage.md) in headless Chromium with the
// IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/abilities/checks/mage.mjs [http://localhost:5173] [shots/]
//
// (Until ticket 23 this file checked the mage prototype, `?arena&class=mage&kit=`;
// that flag now plays the built mage, and the prototype's check is in git's history.)
//
// Game time is stepped in the page (`__descent.game.update` in the arena, the
// Adventure's `step`), the grips held where a player's hands would be (in the
// rig's space, as the controllers put them) and the triggers, grips and
// buttons pressed through the emulated controllers.
//
// The arena, `?arena&class=mage`:
// 1. The mage holds a wand and a focus, no sword; 100 health and 100 mana,
//    the belt's right orb blue; every base ability of the mage.
// 2. Bolts charged on the trigger and thrown kill wave 1's grunts; a full bolt
//    takes 20.
// 3. The left grip raises the ward: an archer's arrow stops on it for 10 mana.
// 4. B blinks you 3.5 m back.
// 5. X: Frost Nova freezes the grunt in front of you, for 30 mana.
// 6. A ring drawn with the right grip is Fireball: the next bolt burns, and
//    bursts on the grunt beside the one it hits.
// 7. `&kit=B` changes nothing: the prototype's kits no longer load.
//
// Oakvale, a mage from the page before VR:
// 8. `?newgame`'s form has the mage's card; a mage made there plays Oakvale
//    with a wand and mana, and no rage.
// 9. Bolts kill the farm's camp (the first clearing, all four of them); the
//    camp cleared twice more (by the debug handle) reaches level 2, "Frost
//    Nova: press A or X", 120 health.
// 10. X freezes a bandit grunt of the farm's camp standing beside you.
// 11. Five more clearings reach level 3, "Fireball: hold the right grip, draw
//    a ring, let go", the ring hanging in the air; drawn, it's Fireball, and
//    the next bolt bursts on the farm's bandits.
// 12. No page errors.
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
    const cast = b && { damage: b.damage, fire: b.fire, locked: b.target === window.__target };
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

// 1.
{
  const s = await page.evaluate(() => {
    const { player, game } = window.__mage;
    const right = player.input.hands.right.grip;
    return {
      klass: player.klass,
      sword: player.sword.model.parent !== null,
      wand: right.children.length,
      mana: player.resource,
      bar: player.bar.kind,
      hp: player.hp,
      abilities: player.stats.abilities.join(' '),
      mage: !!game.mage,
      kit: window.__descent.classKit,
    };
  });
  check(s.klass === 'mage' && s.mage && !s.sword && s.kit === null, `?arena&class=mage plays the built mage: no sword, no prototype (${JSON.stringify(s)})`);
  check(s.mana === 100 && s.bar === 'mana' && s.hp === 100, `100 health and 100 mana (${s.hp}, ${s.mana} ${s.bar})`);
  check(s.abilities === 'frostNova fireball frostbolt chainLightning blizzard', `every base ability of the mage: ${s.abilities}`);
}

// 2. Bolts at wave 1.
{
  const up = await page.evaluate(() => {
    const { down, tick, game } = window.__mage;
    for (let t = 0; t < 12; t += 1 / 72) {
      down();
      game.phaseTime = Math.max(game.phaseTime, 0);
      game.player.rig.updateMatrixWorld(true);
      game.update(1 / 72);
      if (game.enemies.some((e) => e.kind === 'grunt' && e.hittable)) return true;
    }
    return false;
  });
  check(up, 'wave 1 rises: a grunt stands');
  await shot('arena-wave1');
  const nearestGrunt = '(foes) => foes.filter((e) => e.kind === "grunt" && e.hittable)[0]';
  const first = await throwAt(nearestGrunt);
  check(first?.cast?.damage === 20 && first.cast.locked, `a full bolt, thrown, leaves for 20 locked on the grunt (${JSON.stringify(first?.cast)})`);
  let kills = await page.evaluate(() => window.__descent.combatStats.kills);
  for (let i = 0; i < 12 && kills === 0; i++) {
    await throwAt(nearestGrunt);
    kills = await page.evaluate(() => window.__descent.combatStats.kills);
  }
  check(kills > 0, `thrown bolts kill a wave 1 grunt (${kills} kills)`);
}

// 3. The ward.
{
  await page.evaluate(() => {
    const { player, down, tick } = window.__mage;
    player.resource = 100;
    down();
    tick();
  });
  await button('left', 'squeeze', 1);
  const warded = await page.evaluate(() => {
    const { player, game, hold, tick, head, V, d } = window.__mage;
    const up = () => {
      hold('left', [-0.05, 1.3, -0.4]);
      const g = player.input.hands.left.grip;
      g.quaternion.set(Math.sin(Math.PI / 8), 0, 0, Math.cos(Math.PI / 8));
      d.device.controllers.left.quaternion.set(Math.sin(Math.PI / 8), 0, 0, Math.cos(Math.PI / 8));
    };
    up();
    tick();
    tick();
    const warding = game.mage.warding;
    const before = { hp: player.hp, blocks: d.combatStats.blocks };
    const h = head();
    const fwd = player.camera.getWorldDirection(new V()).setY(0).normalize();
    const from = h.clone().addScaledVector(fwd, 5).setY(h.y - 0.3);
    const at = h.clone().setY(h.y - 0.35);
    let low = player.resource;
    player.hp = player.maxHp;
    game.combat.projectiles.fire(game.enemies[0], from, at, 10);
    for (let i = 0; i < 60; i++) {
      up();
      const hp = player.hp;
      player.rig.updateMatrixWorld(true);
      game.phaseTime = Math.min(game.phaseTime, 0);
      game.update(1 / 72);
      if (player.hp < hp) before.hurt = hp - player.hp;
      low = Math.min(low, player.resource);
    }
    return { warding, blocks: d.combatStats.blocks - before.blocks, spent: 100 - low, hurt: before.hurt ?? 0 };
  });
  await button('left', 'squeeze', 0);
  check(warded.warding && warded.blocks >= 1 && warded.hurt === 0, `the ward up, an arrow at your chest stops on it (${JSON.stringify(warded)})`);
  check(warded.spent >= 9.5 && warded.spent <= 12, `the block cost 10 mana (${warded.spent.toFixed(1)})`);
  await shot('arena-ward');
}

// 4. The blink.
{
  await page.evaluate(() => {
    const { player, down, tick } = window.__mage;
    player.place(0, 0, 0);
    down();
    tick();
    window.__from = window.__mage.head();
  });
  await button('right', 'b-button', 1);
  const blinked = await page.evaluate(() => {
    const { head, tick, player } = window.__mage;
    tick();
    const h = head();
    return { back: h.z - window.__from.z, side: Math.abs(h.x - window.__from.x), dash: player.dashCooldown };
  });
  await button('right', 'b-button', 0);
  check(Math.abs(blinked.back - 3.5) < 0.05 && blinked.side < 0.05 && blinked.dash > 0, `B blinks you 3.5 m back at once, shown on the dash bar (${JSON.stringify(blinked)})`);
}

// 5. Frost Nova on X.
{
  const set = await page.evaluate(() => {
    const { game, player, keepAt, down, tick } = window.__mage;
    for (let t = 0; t < 20 && !game.enemies.some((e) => e.hittable && e.kind !== 'archer'); t += 1 / 72) tick();
    const g = game.enemies.find((e) => e.hittable && e.kind !== 'archer');
    if (!g) return null;
    window.__target = g;
    player.resource = 100;
    keepAt(g, 2);
    down();
    tick();
    return { kind: g.kind, hp: g.hp };
  });
  await press('left', 'x-button');
  const froze = await page.evaluate(() => {
    const { player, words } = window.__mage;
    return { state: window.__target.state, hp: window.__target.hp, mana: player.resource, said: words().includes('FROST NOVA') };
  });
  check(set && froze.state === 'frozen' && froze.hp < set.hp && froze.said, `X: Frost Nova freezes the ${set?.kind} beside you (${JSON.stringify(froze)})`);
  check(froze.mana > 68 && froze.mana < 72, `for 30 mana (${froze.mana.toFixed(1)} left)`);
  await shot('arena-frost-nova');
}

// 6. Fireball.
{
  const hinted = await page.evaluate(() => window.__mage.game.gestures.hinted);
  check(hinted === 'ring', `the ring hangs in the air, not drawn yet (${hinted})`);
  await page.evaluate(() => {
    const { player, down, tick } = window.__mage;
    player.resource = 100;
    player.abilities.clear();
    down();
    tick();
  });
  const read = await draw('ring');
  const primed = await page.evaluate(() => ({ primed: window.__mage.player.abilities.primed('fireball'), mana: window.__mage.player.resource }));
  check(read.id === 'ring' && read.ability === 'fireball' && read.use === 'cast' && primed.primed, `a ring is read as Fireball and waits on the next bolt (${JSON.stringify({ ...read, ...primed })})`);
  const burnt = await page.evaluate(() => window.__descent.combatStats.burnt);
  // Two enemies side by side (a grunt raised beside the first if the wave has no other): throw at one.
  await page.evaluate(() => {
    const { game, tick } = window.__mage;
    const live = game.enemies.filter((e) => e.hittable);
    const [a] = live;
    let b = live[1];
    if (!b) {
      b = game.addEnemy('grunt', a.position.clone().setX(a.position.x + 1.2));
      for (let t = 0; t < 4 && !b.hittable; t += 1 / 72) tick();
    }
    b.position.set(a.position.x + 1.2, a.position.y, a.position.z);
  });
  const fire = await throwAt('(foes) => foes.filter((e) => e.hittable)[0]');
  const after = await page.evaluate(() => window.__descent.combatStats.burnt);
  check(fire?.cast?.fire && fire.cast.damage === 30, `the next bolt burns: 30 at full charge (${JSON.stringify(fire?.cast)})`);
  check(after > burnt, `and bursts on the one beside it (${after - burnt} burnt)`);
  await shot('arena-fireball');
}

// 7. The prototype's kits are gone.
{
  await page.goto(`${base}/?arena&class=mage&kit=B&emulate&nodevui`);
  await page.waitForFunction(() => window.__descent?.game, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const k = await page.evaluate(() => ({ kit: window.__descent.classKit, mage: !!window.__descent.game.mage }));
  check(k.kit === null && k.mage, `&kit=B loads no prototype: the built mage still (${JSON.stringify(k)})`);
}

// ================================================================ Oakvale

// 8. A mage from the page before VR.
{
  await page.goto(`${base}/?newgame&emulate&nodevui`);
  await page.waitForSelector('#new-character[open] .class-card', { timeout: 120000 });
  const cards = await page.$$eval('#new-character .class-card', (cs) => cs.map((c) => c.innerText.replace(/\s+/g, ' ').trim()));
  check(cards.some((c) => c.startsWith('Mage')), `the form has the mage's card: ${cards.join(' | ')}`);
  await page.click('#new-character input[value=mage]');
  await page.fill('#new-character input[name=name]', 'Merlin');
  await shot('oakvale-new-mage');
  await page.click('#new-character button[value=make]');
  await page.waitForFunction(() => window.__descent?.adventure && document.querySelector('#characters'), null, { timeout: 120000 });
  await enter();
  await page.evaluate(() => window.__descent.step(2));
  const me = await page.evaluate(() => {
    const { state, player, adventure } = window.__descent;
    return { class: state.class, name: window.__descent.characters.play().who.name, klass: player.klass, bar: player.bar.kind, mana: player.resource, wand: adventure.state.inventory.gear.mainHand, sword: player.sword.model.parent !== null, level: state.level };
  });
  check(me.class === 'mage' && me.klass === 'mage' && me.name === 'Merlin', `a mage named Merlin plays Oakvale (${JSON.stringify(me)})`);
  check(me.bar === 'mana' && me.mana === 100 && me.wand === 'apprentice-wand' && !me.sword, `with a wand, no sword, and 100 mana`);
}

const clearFarm = () =>
  page.evaluate(() => {
    const camp = window.__descent.camps.camps.find((c) => c.plan.id === 'farm');
    for (const m of camp.members) if (m.enemy.alive) m.enemy.takeHit(999, m.enemy.position.clone().set(0, 0, 0));
  });
/** Clear the farm from where you stand and wait out its refill away in the village: 40 XP a time. */
async function clearAndWait(times) {
  for (let i = 0; i < times; i++) {
    await clearFarm();
    await page.evaluate(() => window.__descent.step(0.2));
    await page.evaluate(() => {
      const d = window.__descent;
      const v = d.world.zoneAt(0, 0).respawns.village;
      d.teleport(v.x, v.z, 0);
      d.step(185, 1 / 30);
    });
  }
}
const farmStanding = () => page.evaluate(() => window.__descent.camps.camps.find((c) => c.plan.id === 'farm').members.filter((m) => m.enemy.alive).length);

// 9. The farm's camp, by bolts.
{
  await page.evaluate(() => {
    window.__descent.teleport(54.5, 26, Math.atan2(-(60 - 54.5), -(33 - 26)));
    window.__descent.step(0.5);
  });
  const farmer = '(foes) => { const camp = window.__descent.camps.camps.find((c) => c.plan.id === "farm"); return camp.members.map((m) => m.enemy).find((e) => e.alive && e.hittable) ?? null; }';
  let throws = 0;
  while ((await farmStanding()) > 0 && throws < 40) {
    const r = await throwAt(farmer, 5);
    if (!r) await page.evaluate(() => window.__descent.step(0.3));
    throws++;
  }
  const xp = await page.evaluate(() => window.__descent.state.xp);
  check((await farmStanding()) === 0 && xp === 40, `bolts kill the farm's four in ${throws} throws: 40 XP (${xp})`);
  await shot('oakvale-farm-cleared');
  await page.evaluate(() => {
    const d = window.__descent;
    const v = d.world.zoneAt(0, 0).respawns.village;
    d.teleport(v.x, v.z, 0);
    d.step(185, 1 / 30);
  });
  await clearAndWait(2);
  const me = await page.evaluate(() => ({ level: window.__descent.state.level, hp: window.__descent.player.maxHp, frostNova: window.__descent.player.can('frostNova') }));
  check(me.level === 2 && me.hp === 120 && me.frostNova, `two more clearings: level 2, 120 health, Frost Nova (${JSON.stringify(me)})`);
}

// 10. Frost Nova on a bandit.
{
  const set = await page.evaluate(() => {
    const d = window.__descent;
    const { keepAt, tick, down, player } = window.__mage;
    const camp = d.camps.camps.find((c) => c.plan.id === 'farm');
    const g = camp.members.map((m) => m.enemy).find((e) => e.alive && e.hittable && e.kind === 'grunt');
    if (!g) return null;
    window.__target = g;
    player.resource = player.bar.size;
    keepAt(g, 2);
    down();
    tick();
    return { hp: g.hp };
  });
  await press('left', 'x-button');
  const froze = await page.evaluate(() => ({ state: window.__target.state, hp: window.__target.hp, family: window.__target.family, mana: window.__mage.player.resource }));
  check(set && froze.state === 'frozen' && froze.family === 'bandit' && froze.hp < set.hp, `X freezes a bandit grunt beside you (${JSON.stringify(froze)})`);
  await shot('oakvale-frost-nova');
  await page.evaluate(() => window.__descent.step(5));
}

// 11. Level 3 and Fireball.
{
  await clearAndWait(5);
  const me = await page.evaluate(() => ({ level: window.__descent.state.level, fireball: window.__descent.player.can('fireball'), hinted: window.__descent.adventure.gestures.hinted }));
  check(me.level === 3 && me.fireball && me.hinted === 'ring', `five more clearings: level 3 and Fireball, the ring hanging in the air (${JSON.stringify(me)})`);
  // Back to the farm: its camp stands again.
  await page.evaluate(() => {
    window.__descent.teleport(54.5, 26, Math.atan2(-(60 - 54.5), -(33 - 26)));
    window.__descent.step(0.5);
    window.__mage.player.resource = window.__mage.player.bar.size;
    window.__mage.down();
    window.__mage.tick();
  });
  const read = await draw('ring');
  const learned = await page.evaluate(() => window.__descent.adventure.gestures.hinted);
  check(read.ability === 'fireball' && read.use === 'cast' && learned === null, `a ring drawn is Fireball, and no longer hangs (${JSON.stringify(read)}, hint ${learned})`);
  const burnt = await page.evaluate(() => window.__descent.combatStats.burnt);
  // Two of the farm's side by side: throw at one.
  await page.evaluate(() => {
    const camp = window.__descent.camps.camps.find((c) => c.plan.id === 'farm');
    const [a, b] = camp.members.map((m) => m.enemy).filter((e) => e.alive && e.hittable);
    if (a && b) b.position.set(a.position.x + 1.2, a.position.y, a.position.z);
  });
  const farmer = '(foes) => window.__descent.camps.camps.find((c) => c.plan.id === "farm").members.map((m) => m.enemy).find((e) => e.alive && e.hittable) ?? null';
  const fire = await throwAt(farmer, 5);
  const after = await page.evaluate(() => window.__descent.combatStats.burnt);
  check(fire?.cast?.fire && after > burnt, `the next bolt burns and bursts on the bandit beside the one it hit (${JSON.stringify(fire?.cast)}, ${after - burnt} burnt)`);
  await shot('oakvale-fireball');
}

check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
