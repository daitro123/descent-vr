// Checks for the ranger as a class (issues/21-the-ranger.md) in headless
// Chromium with the IWER emulator. Start `npx vite --port 5173` first, then:
//
//   node .scratch/abilities/checks/ranger-class.mjs [http://localhost:5173] [shots/]
//
// Game time is stepped in the page, your health kept full. The controllers
// are posed by code: the bow hand held out towards an enemy, the draw hand on
// the string, the trigger held, the hand pulled back, let go. Gestures are
// played through the real input with the stroke maker the unit tests use
// (tests/support/gestureStrokes.ts, seeded). What it checks:
//
// The arena, `?arena&class=ranger`:
// 1. A bow in the left hand, no sword or shield; every base ability of the
//    ranger; focus full at 100.
// 2. Two full-draw body shots kill wave 1's first grunt; a short draw does less.
// 3. Power Shot: A while drawing makes the arrow glow for 20 focus (not twice),
//    and it passes through the first of two grunts in a line, killing both.
//    A with no arrow drawn does nothing.
// 4. A ring drawn with an arrow nocked is dropped; drawn free, it lays Snare
//    Trap for 20 focus, and a grunt that walks onto it is rooted where it stands.
// 5. The ward, raised in time, sends an enemy's arrow back.
// 6. `&class=ranger&variant=knife` is the ranger, not the prototype; the
//    prototype is at `&class=ranger-prototype`.
//
// Oakvale, the plain URL:
// 7. A ranger made on the page plays as a ranger: the bow, focus, level 1.
// 8. Arrows kill the farm's camp (all four); it pays 40 XP.
// 9. At level 2, Power Shot fires on A at a bandit; at level 3, a ring lays a
//    trap that roots the bandit coming for you.
// 10. No page errors.

import { mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const shots = process.argv[3];
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
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

/**
 * Run the game `s` seconds, `dt` at a time: your health kept full, the arena's
 * waves held back if `window.__holdWaves`, and each enemy in `window.__hold`
 * kept where it was put.
 */
const step = (s, dt = 1 / 72) =>
  page.evaluate(
    ([s, dt]) => {
      const R = window.__R;
      for (let t = 0; t < s - 1e-9; t += dt) {
        if (R.player.alive) R.player.hp = R.player.maxHp;
        if (window.__holdWaves) window.__descent.game.phaseTime = -1e6;
        for (const [e, x, z] of window.__hold ?? []) if (e.alive) e.position.set(x, e.position.y, z);
        R.update(dt);
      }
    },
    [s, dt],
  );
const button = async (hand, name, value) => {
  await page.evaluate(([hand, name, value]) => window.__descent.device.controllers[hand].updateButtonValue(name, value), [hand, name, value]);
  await xrFrames(2);
  await step(1 / 72);
};
const press = async (hand, name) => {
  await button(hand, name, 1);
  await button(hand, name, 0);
};

/** Enter VR at `query`, paused, with `__R` the game's parts whichever game it is. */
async function enter(query) {
  await page.goto(`${base}/?emulate&nodevui${query ? `&${query}` : ''}`);
  await page.waitForFunction(() => window.__descent?.game || window.__descent?.adventure, null, { timeout: 120000 });
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  await page.evaluate(async () => {
    const d = window.__descent;
    d.paused = true;
    const g = d.game;
    window.__R = g
      ? { player: g.player, combat: g.combat, gestures: g.gestures, update: (dt) => g.update(dt), enemies: () => g.enemies }
      : { player: d.player, combat: d.adventure.combat, gestures: d.adventure.gestures, update: (dt) => d.adventure.update(dt), enemies: () => d.camps.enemies };
    window.__hold = [];
    window.__holdWaves = false;
    window.__strokes = await import('/tests/support/gestureStrokes.ts');
  });
  await step(1 / 72);
}

/**
 * Hold the bow out towards `e`'s head (`head`) or chest, the fist's line
 * upright, then put the draw hand on the string (`pull` null) or `pull` m
 * behind the arrow rest. `e` is an expression over `window.__target`, set here.
 */
async function aim(pick, head = false, pull = null) {
  await page.evaluate(
    ([pick, head]) => {
      const { device } = window.__descent;
      const { player } = window.__R;
      if (pick !== 'same') window.__target = new Function('R', `return ${pick}`)(window.__R);
      const e = window.__target;
      const V = player.rig.position.constructor;
      const target = new V();
      if (head) {
        e.headSphere(target);
        target.y += 0.03;
      } else {
        const bottom = new V();
        e.capsule(bottom, target);
        target.lerp(bottom, 0.35);
      }
      // Over it by what a full draw drops over the distance, past the first 10 cm (nothing in the arena).
      const far = target.distanceTo(player.headPosition(new V()));
      target.y += Math.max(0, 0.5 * 9.8 * (far / 42) ** 2 - 0.1);
      player.rig.worldToLocal(target);
      const eye = new V(device.position.x, device.position.y, device.position.z);
      const left = eye.clone().addScaledVector(target.clone().sub(eye).normalize(), 0.55).add(new V(0, -0.12, 0));
      const s = Math.SQRT1_2;
      const { left: L, right: Rc } = device.controllers;
      L.position.set(left.x, left.y, left.z);
      Object.assign(L.quaternion, { x: s, y: 0, z: 0, w: s });
      Object.assign(Rc.quaternion, { x: s, y: 0, z: 0, w: s });
      window.__aim = { target: target.toArray() };
    },
    [pick, head],
  );
  await xrFrames(2);
  await step(1 / 72);
  await drawHand(pull);
}

/** The draw hand's grip on the string at rest (`pull` null), or `pull` m behind the arrow rest on the line to the target. */
async function drawHand(pull) {
  await page.evaluate((pull) => {
    const { device } = window.__descent;
    const { player, combat } = window.__R;
    const { rig } = player;
    const V = rig.position.constructor;
    const Rc = device.controllers.right;
    const grip = rig.worldToLocal(player.input.hands.right.grip.getWorldPosition(new V()));
    const offset = grip.sub(new V(Rc.position.x, Rc.position.y, Rc.position.z));
    const bow = combat.ranger.bow;
    const rest = rig.worldToLocal(bow.rest.clone());
    const want = pull === null ? rig.worldToLocal(bow.stringRest.clone()) : rest.clone().addScaledVector(new V(...window.__aim.target).sub(rest).normalize(), -pull);
    want.sub(offset);
    Rc.position.set(want.x, want.y, want.z);
  }, pull);
  await xrFrames(2);
  await step(1 / 72);
}

const kit = () =>
  page.evaluate(() => {
    const { player, combat } = window.__R;
    const k = combat.ranger;
    return { nocked: k.bow.nocked, draw: k.bow.draw, powered: k.powered, focus: player.resource, ...k.stats, traps: k.traps.laid.length, flying: k.shots.flying.length };
  });
const target = () =>
  page.evaluate(() => {
    const e = window.__target;
    return { hp: e.hp, maxHp: e.maxHp, alive: e.alive, rooted: e.afflictedFor('rooted'), x: e.position.x, z: e.position.z };
  });

/** Nock at `pick`, draw `pull` m, (press A for Power Shot), loose, and let it fly `fly` s. */
async function shoot(pick, { head = false, pull = 0.75, powerShot = false, fly = 0.4 } = {}) {
  await aim(pick, head);
  await button('right', 'trigger', 1);
  const nocked = await kit();
  await drawHand(pull);
  await aim('same', head, pull);
  if (powerShot) await press('right', 'a-button');
  const drawn = await kit();
  await button('right', 'trigger', 0);
  const loosed = await kit();
  await step(fly);
  return { nocked, drawn, loosed };
}

/**
 * Play a stroke with the right hand (`shape:<id>`): the grip squeezed at its
 * first point, the hand moved along it frame by frame, let go at its last.
 * Returns the gestures' last outcome.
 */
async function play(how, seed = 1) {
  const n = await page.evaluate(
    ([how, seed]) => {
      const { player } = window.__R;
      const S = window.__strokes;
      const stroke = S.performShape(how.slice(6), S.rng(seed));
      const V = player.rig.position.constructor;
      const head = player.rig.worldToLocal(player.headPosition(new V()));
      const gaze = player.camera.getWorldDirection(new V()).applyQuaternion(player.rig.quaternion.clone().invert());
      const f = new V(gaze.x, 0, gaze.z).normalize();
      const right = new V(-f.z, 0, f.x);
      window.__stroke = stroke.points.map(([x, y, z]) => head.clone().addScaledVector(right, x).add(new V(0, y, 0)).addScaledVector(f, z).toArray());
      const p = window.__stroke[0];
      window.__descent.device.controllers.right.position.set(p[0], p[1], p[2]);
      return window.__stroke.length;
    },
    [how, seed],
  );
  await xrFrames(2);
  await page.evaluate(() => window.__descent.device.controllers.right.updateButtonValue('squeeze', 1));
  await xrFrames(2);
  await page.evaluate((n) => {
    const R = window.__R;
    const grip = R.player.input.hands.right.grip;
    for (let i = 0; i < n; i++) {
      grip.position.fromArray(window.__stroke[i]);
      grip.updateMatrix();
      R.player.hp = R.player.maxHp;
      if (window.__holdWaves) window.__descent.game.phaseTime = -1e6;
      R.update(1 / 72);
    }
  }, n);
  await page.evaluate(() => {
    const p = window.__stroke[window.__stroke.length - 1];
    window.__descent.device.controllers.right.position.set(p[0], p[1], p[2]);
    window.__descent.device.controllers.right.updateButtonValue('squeeze', 0);
  });
  await xrFrames(2);
  await step(1 / 72);
  return page.evaluate(() => {
    const l = window.__R.gestures.last;
    return { event: l?.event, id: l?.verdict?.id ?? null, ability: l?.ability ?? null, use: l?.use ?? null, reason: l?.reason ?? null };
  });
}

/** Put `kind` `ahead` m along your gaze (`side` m to its right); returns its index. Stepped until it has risen. */
async function spawn(kind, ahead, side = 0) {
  const i = await page.evaluate(
    ([kind, ahead, side]) => {
      const { game } = window.__descent;
      const V = game.player.rig.position.constructor;
      const head = game.player.headPosition(new V());
      const f = game.player.camera.getWorldDirection(new V()).setY(0).normalize();
      const p = head.clone().addScaledVector(f, ahead).add(new V(-f.z, 0, f.x).multiplyScalar(side)).setY(0);
      game.addEnemy(kind, p);
      window.__last = game.enemies[game.enemies.length - 1];
      return game.enemies.length - 1;
    },
    [kind, ahead, side],
  );
  await step(3);
  return i;
}

// ================================================================ the arena
await enter('arena&class=ranger');
{
  const k = await page.evaluate(() => {
    const { player, combat } = window.__R;
    return {
      class: player.klass,
      bow: combat.ranger?.bow.root.parent !== null && combat.ranger?.bow.root.visible,
      sword: player.sword.model.parent !== null,
      shield: player.shield.model.parent !== null,
      abilities: player.stats.abilities.join(' '),
      bar: player.stats.resource.kind,
      focus: player.resource,
      proto: window.__descent.classKit,
    };
  });
  check(k.class === 'ranger' && k.bow && !k.sword && !k.shield && k.proto === null, `the ranger holds a bow, no sword or shield, no prototype (${JSON.stringify(k)})`);
  check(k.abilities === 'powerShot snareTrap volley scatter huntersMark', `every base ability of the ranger (${k.abilities})`);
  check(k.bar === 'focus' && k.focus === 100, `focus, full at 100 (${k.bar} ${k.focus})`);
}

// 2. The plain attack: wave 1's grunts.
await step(5.6);
{
  const foes = await page.evaluate(() => window.__R.enemies().map((e) => e.kind));
  check(foes.length === 2 && foes.every((k) => k === 'grunt'), `wave 1 is two grunts (${foes})`);
  const first = await shoot('R.enemies()[0]');
  check(first.nocked.nocked && first.drawn.draw > 0.99 && !first.loosed.nocked && first.loosed.shots === 1, `touch, draw to full, let go: one arrow (${JSON.stringify(first.drawn)})`);
  let t = await target();
  check(t.hp === 15, `a full-draw body shot takes 30 of the grunt's 45 (${t.hp})`);
  await shoot('same');
  t = await target();
  check(!t.alive, `a second kills it (${JSON.stringify(t)})`);
  await shot('ranger-arena');
  // A short draw does less.
  await aim('R.enemies().find((e) => e.alive)');
  await button('right', 'trigger', 1);
  await drawHand(0.3);
  await aim('same', false, 0.3);
  const short = await kit();
  await button('right', 'trigger', 0);
  await step(0.6);
  t = await target();
  check(short.draw > 0.2 && short.draw < 0.5 && t.hp < 45 && t.hp > 15, `a short draw (${short.draw.toFixed(2)}) does less (${45 - t.hp})`);
  // A with no arrow drawn does nothing.
  const before = (await kit()).focus;
  await press('right', 'a-button');
  const after = await kit();
  check(after.focus === before && !after.powered, `A with no arrow drawn does nothing (${before} → ${after.focus})`);
  await page.evaluate(() => window.__R.enemies().forEach((e) => e.alive && e.takeHit(999, e.position.clone().set(0, 0, 0))));
  await step(2);
}

// 3. Power Shot through two grunts in a line.
await page.evaluate(() => (window.__holdWaves = true));
{
  await spawn('grunt', 5);
  await spawn('grunt', 7.5);
  // They walk at you while they rise: put them back on one line along your gaze, 5 and 7.5 m out.
  await page.evaluate(() => {
    const { player } = window.__R;
    const V = player.rig.position.constructor;
    const head = player.headPosition(new V());
    const f = player.camera.getWorldDirection(new V()).setY(0).normalize();
    window.__hold = window.__R.enemies()
      .filter((e) => e.alive)
      .map((e, i) => [e, head.x + f.x * (5 + 2.5 * i), head.z + f.z * (5 + 2.5 * i)]);
  });
  await step(0.3);
  await page.evaluate(() => {
    for (const e of window.__R.enemies()) e.hp = e.maxHp;
  });
  const before = await kit();
  await aim('R.enemies().filter((e) => e.alive)[0]');
  await button('right', 'trigger', 1);
  await drawHand(0.75);
  await aim('same', false, 0.75);
  await press('right', 'a-button');
  const powered = await kit();
  await press('right', 'a-button');
  const again = await kit();
  await button('right', 'trigger', 0);
  await step(0.5);
  const after = await kit();
  const foes = await page.evaluate(() => window.__R.enemies().map((e) => ({ hp: e.hp, alive: e.alive })));
  check(powered.powered && powered.focus <= before.focus - 20 + 0.5, `A while drawing makes it a Power Shot for 20 focus (${before.focus.toFixed(1)} → ${powered.focus.toFixed(1)})`);
  check(again.focus <= powered.focus + 0.5 && again.focus >= powered.focus - 0.5, `A again on the same arrow spends nothing (${again.focus.toFixed(1)})`);
  check(after.hits - before.hits === 2 && after.pierced - before.pierced === 1 && foes.every((f) => !f.alive), `it passes through the first grunt and kills both (${JSON.stringify(foes)}, ${JSON.stringify(after)})`);
  await page.evaluate(() => (window.__hold = []));
  await page.evaluate(() => window.__R.enemies().forEach((e) => e.alive && e.takeHit(999, e.position.clone().set(0, 0, 0))));
  await step(2);
}

// 4. Snare Trap: dropped with an arrow nocked, laid free, and a grunt rooted on it.
{
  await page.evaluate(() => (window.__R.player.resource = 100));
  await page.evaluate(() => {
    const s = Math.SQRT1_2;
    const L = window.__descent.device.controllers.left;
    L.position.set(-0.05, 1.35, -0.4);
    Object.assign(L.quaternion, { x: s, y: 0, z: 0, w: s });
  });
  await xrFrames(2);
  await step(1 / 72);
  await drawHand(null);
  await button('right', 'trigger', 1);
  check((await kit()).nocked, 'an arrow is nocked');
  const busy = await play('shape:ring', 3);
  await button('right', 'trigger', 0);
  check(busy.event === 'dropped' && busy.reason === 'busy', `a ring drawn with an arrow nocked is dropped (${JSON.stringify(busy)})`);
  await step(0.5);
  const read = await play('shape:ring', 4);
  const laid = await kit();
  check(read.ability === 'snareTrap' && read.use === 'cast' && laid.traps === 1 && laid.focus <= 80.5, `a ring lays Snare Trap for 20 focus (${JSON.stringify(read)}, ${laid.traps} trap, focus ${laid.focus.toFixed(1)})`);
  // A grunt ahead; you step back 3 m, and it walks over the trap coming for you.
  await spawn('grunt', 7);
  await page.evaluate(() => {
    const { player } = window.__R;
    const V = player.rig.position.constructor;
    const f = player.camera.getWorldDirection(new V()).setY(0).normalize();
    const head = player.headPosition(new V());
    player.place(head.x - f.x * 3, head.z - f.z * 3, Math.atan2(-f.x, -f.z));
  });
  await page.evaluate(() => (window.__target = window.__last));
  let rooted = null;
  for (let s = 0; s < 12 && !rooted; s++) {
    await step(0.5);
    const t = await target();
    if (t.rooted > 0) rooted = t;
  }
  const sprung = await kit();
  check(rooted && rooted.rooted > 3 && sprung.rooted === 1 && sprung.traps === 0, `the grunt walks onto it and is rooted (${JSON.stringify(rooted)}, ${JSON.stringify(sprung)})`);
  await step(2);
  const held = await target();
  check(rooted && Math.hypot(held.x - rooted.x, held.z - rooted.z) < 0.01 && held.hp === rooted.hp, `it stands where it was caught, unhurt by the trap (${JSON.stringify(held)})`);
  await shot('ranger-rooted');
  await page.evaluate(() => window.__R.enemies().forEach((e) => e.alive && e.takeHit(999, e.position.clone().set(0, 0, 0))));
  await step(2);
}

// 5. The ward sends an arrow back.
{
  await spawn('archer', 6);
  await page.evaluate(() => {
    const s = Math.SQRT1_2;
    const L = window.__descent.device.controllers.left;
    L.position.set(-0.05, 1.35, -0.4);
    Object.assign(L.quaternion, { x: s, y: 0, z: 0, w: s });
  });
  await xrFrames(2);
  await step(1 / 72);
  await button('left', 'squeeze', 1);
  const up = await page.evaluate(() => {
    const { player, combat } = window.__R;
    const bow = combat.ranger.bow;
    const V = player.rig.position.constructor;
    const head = player.headPosition(new V());
    const from = bow.grip.clone().add(bow.grip.clone().sub(head).setY(0).normalize().multiplyScalar(2.5));
    combat.projectiles.fire(window.__last, from, bow.grip.clone(), 10);
    return combat.ranger.ward.up;
  });
  await step(0.5);
  const k = await kit();
  check(up && k.wardReturns === 1, `a ward raised in time sends an arrow back (${JSON.stringify(k)})`);
  await button('left', 'squeeze', 0);
}

// 6. The prototype's flags.
await enter('arena&class=ranger&variant=knife');
{
  const k = await page.evaluate(() => ({ proto: window.__descent.classKit, ranger: !!window.__R.combat.ranger }));
  check(k.proto === null && k.ranger, `&class=ranger&variant=knife is the ranger, not the prototype (${JSON.stringify(k)})`);
}
await enter('arena&class=ranger-prototype');
await page.waitForFunction(() => window.__descent.classKit, null, { timeout: 30000 });
{
  const k = await page.evaluate(() => ({ variant: window.__descent.classKit.variant, ranger: window.__R.combat.ranger }));
  check(k.variant === 'ward' && k.ranger === null, `&class=ranger-prototype is the prototype, over the warrior's arena (${JSON.stringify(k)})`);
}

// ================================================================ Oakvale
await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
await page.evaluate(async () => {
  const { characters } = window.__descent;
  for (const s of [...characters.slots]) await characters.remove(s.key);
  await characters.make('ranger', 'Robin');
});
await enter('');
await page.evaluate(() => {
  const { device } = window.__descent;
  device.controllers.left.position.set(-0.4, 0.3, 0.2);
  device.controllers.right.position.set(0.4, 0.3, 0.2);
});
await xrFrames(2);
await step(2);
{
  const me = await page.evaluate(() => {
    const { adventure, player, characters } = window.__descent;
    return {
      class: adventure.state.class,
      name: characters.play().who.name,
      level: adventure.state.level,
      bow: !!adventure.combat.ranger && adventure.combat.ranger.bow.root.visible,
      worn: adventure.state.inventory.gear.mainHand,
      sword: player.sword.model.parent !== null,
      bar: player.stats.resource.kind,
      focus: player.resource,
    };
  });
  check(me.class === 'ranger' && me.name === 'Robin' && me.level === 1 && me.bow && me.worn === 'short-bow' && !me.sword, `a ranger made on the page plays with the bow (${JSON.stringify(me)})`);
  check(me.bar === 'focus' && me.focus === 100, `focus is full (${me.focus})`);
}

const farm = () =>
  page.evaluate(() =>
    window.__descent.camps.camps
      .find((c) => c.plan.id === 'farm')
      .members.map((m) => ({ alive: m.enemy.alive, hittable: m.enemy.hittable, mind: m.mind, hp: m.enemy.hp, d: Math.hypot(m.enemy.position.x - window.__descent.player.rig.position.x, m.enemy.position.z - window.__descent.player.rig.position.z) })),
  );
const farmPick = `window.__descent.camps.camps.find((c) => c.plan.id === 'farm').members.map((m) => m.enemy).filter((e) => e.alive && e.hittable).sort((a, b) => a.position.distanceTo(R.player.rig.position) - b.position.distanceTo(R.player.rig.position))[0]`;
async function standFacing(x, z, tx, tz) {
  await page.evaluate(([x, z, tx, tz]) => window.__descent.teleport(x, z, Math.atan2(-(tx - x), -(tz - z))), [x, z, tx, tz]);
  await xrFrames(2);
  await step(1 / 72);
}
/** Stand `d` m from the nearest standing farm bandit, on its side towards the road's end, facing it (a clear line past the windmill's props). */
async function standBy(d) {
  const at = await page.evaluate(
    ([pick, d]) => {
      const e = new Function('R', `return ${pick}`)(window.__R);
      if (!e) return null;
      const dx = 54.5 - e.position.x;
      const dz = 26 - e.position.z;
      const n = Math.hypot(dx, dz);
      return [e.position.x + (dx / n) * d, e.position.z + (dz / n) * d, e.position.x, e.position.z];
    },
    [farmPick, d],
  );
  if (at) await standFacing(...at);
  return at !== null;
}
/** Shoot the nearest of the farm's standing bandits until none stands, or `tries` run out. */
async function clearFarmWithArrows(tries = 40) {
  for (let i = 0; i < tries; i++) {
    const left = (await farm()).filter((m) => m.alive);
    if (!left.length) return true;
    if (!left.some((m) => m.hittable)) {
      await step(0.5);
      continue;
    }
    await shoot(farmPick, { fly: 0.6 });
  }
  return (await farm()).every((m) => !m.alive);
}
const you = () => page.evaluate(() => ({ level: window.__descent.adventure.state.level, xp: window.__descent.adventure.state.xp, focus: window.__descent.player.resource }));
const village = await page.evaluate(() => window.__descent.world.zoneAt(0, 0).respawns.village);
/** Kill farm bandits outright (a blow of 999, as the levels check does), waiting out refills from the village, until `level`. */
async function levelTo(level) {
  for (let i = 0; i < 12; i++) {
    const me = await you();
    if (me.level >= level) return;
    const felled = await page.evaluate((level) => {
      const { camps, adventure } = window.__descent;
      const camp = camps.camps.find((c) => c.plan.id === 'farm');
      let n = 0;
      for (const m of camp.members) {
        if (!m.enemy.alive || !m.enemy.hittable || adventure.state.level >= level) continue;
        m.enemy.takeHit(999, m.enemy.position.clone().set(0, 0, 0));
        window.__descent.step(0.1);
        n++;
      }
      return n;
    }, level);
    if ((await you()).level >= level) return;
    if (!felled || (await farm()).every((m) => !m.alive)) {
      await standFacing(village.x, village.z, 0, 0);
      await step(185, 1 / 30);
    }
  }
}

// 8. The farm's camp, by arrow. The first pair from the road's end, then the pair by the windmill.
{
  await standFacing(54.5, 26, 60, 33);
  await step(0.5);
  const cleared = await clearFarmWithArrows();
  if (!cleared) await standFacing(62, 38, 67.5, 43);
  const all = cleared || (await clearFarmWithArrows());
  const k = await kit();
  const me = await you();
  check(all && k.hits >= 8, `arrows kill the farm's four (${JSON.stringify(await farm())}, ${k.shots} loosed, ${k.hits} hits)`);
  check(me.xp === 40 && me.level === 1, `the farm's camp pays 40 XP (${me.xp} XP, level ${me.level})`);
  await shot('ranger-farm');
}

// 9. Level 2: Power Shot at a bandit.
{
  await levelTo(2);
  const me = await you();
  check(me.level === 2, `level 2 (${JSON.stringify(me)})`);
  const pips = await page.evaluate(() => window.__descent.player.stats.abilities.join(' '));
  check(pips === 'powerShot', `level 2 brings Power Shot (${pips})`);
  // Back at the farm, the camp standing again.
  await page.evaluate(() => (window.__descent.player.resource = 100));
  if ((await farm()).every((m) => !m.alive)) {
    await standFacing(village.x, village.z, 0, 0);
    await step(185, 1 / 30);
  }
  await standBy(6);
  await step(0.5);
  const before = await kit();
  const shotAt = await shoot(farmPick, { powerShot: true, fly: 0.6 });
  const after = await kit();
  const t = await target();
  check(shotAt.drawn.powered && before.focus - shotAt.drawn.focus >= 19.5, `A while drawing makes it a Power Shot (focus ${before.focus.toFixed(1)} → ${shotAt.drawn.focus.toFixed(1)})`);
  check(after.hits === before.hits + 1 && (t.maxHp - t.hp >= 60 || !t.alive), `it hits a bandit for twice the damage: ${t.maxHp - t.hp} of ${t.maxHp} (alive ${t.alive})`);
}

// 10. Level 3: a ring lays a trap, and the bandit coming for you is rooted on it.
{
  await levelTo(3);
  const me = await you();
  const abilities = await page.evaluate(() => window.__descent.player.stats.abilities.join(' '));
  const hinted = await page.evaluate(() => window.__descent.adventure.gestures.hinted);
  check(me.level === 3 && abilities === 'powerShot snareTrap' && hinted === 'ring', `level 3 brings Snare Trap, its ring hanging in the air (${me.level}, ${abilities}, ${hinted})`);
  if ((await farm()).filter((m) => m.alive).length === 0) {
    await standFacing(village.x, village.z, 0, 0);
    await step(185, 1 / 30);
  }
  await page.evaluate(() => (window.__descent.player.resource = 100));
  // Lay the trap 6 m from the nearest bandit, step back 3 m from it, and pull the bandit with an arrow.
  await standBy(6);
  await step(0.5);
  const read = await play('shape:ring', 5);
  check(read.ability === 'snareTrap' && read.use === 'cast', `a ring lays Snare Trap (${JSON.stringify(read)})`);
  await page.evaluate(() => {
    const { player } = window.__descent;
    const V = player.rig.position.constructor;
    const f = player.camera.getWorldDirection(new V()).setY(0).normalize();
    const head = player.headPosition(new V());
    window.__descent.teleport(head.x - f.x * 3, head.z - f.z * 3, Math.atan2(-f.x, -f.z));
  });
  await xrFrames(2);
  await step(1 / 72);
  for (let i = 0; i < 3; i++) {
    const hits = (await kit()).hits;
    await shoot(farmPick, { fly: 0.5 });
    if ((await kit()).hits > hits) break;
  }
  let rooted = null;
  for (let s = 0; s < 24 && !rooted; s++) {
    await step(0.5);
    rooted = await page.evaluate(() => {
      const m = window.__descent.camps.camps.find((c) => c.plan.id === 'farm').members.find((m) => m.enemy.afflictedFor('rooted') > 0);
      return m ? { behaviour: m.enemy.kind, rooted: m.enemy.afflictedFor('rooted') } : null;
    });
  }
  const k = await kit();
  check(rooted?.behaviour === 'grunt' && k.rooted >= 1, `a bandit grunt coming for you is rooted on it (${JSON.stringify(rooted)}, ${JSON.stringify(k)})`);
  await shot('ranger-oakvale-rooted');
}

check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
