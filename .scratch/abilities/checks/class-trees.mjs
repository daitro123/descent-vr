// Checks for the ranger's and mage's trees
// (issues/26-the-rangers-and-mages-trees.md) in headless Chromium with the
// IWER emulator. Start `npx vite --port 5173` first, then:
//
//   node .scratch/abilities/checks/class-trees.mjs [http://localhost:5173] [shots/]
//
// Oakvale for a new ranger, then a new mage, made on the page with the level
// cap raised (`&cap=10`), paused and stepped in the page; the hands moved and
// the grips squeezed through the emulated controllers. Levels come from kills
// fed to the Adventure as the camps feed them. For each class, each tree in
// turn: points spent on the Talents tab to tier 3 and its ability, then the
// ability drawn as a triangle and fired on the farm's bandits. What it checks:
//
// 1. The ranger at level 8: the Talents tab shows Marksmanship and Survival,
//    every talent a button.
// 2. Marksmanship: Steady Aim 3, Efficiency 1, Swift Arrows 2 open tier 3,
//    and Trueshot takes the last point, in the triangle. Drawn, it costs 30
//    focus and lasts 8 s; an arrow loosed half a metre wide of a bandit
//    bends onto it.
// 3. Out of the fight, Reset gives the 7 points back; Survival: Trapper 3,
//    Fleet Foot 1, Serrated Tips 2 and Explosive Trap. Drawn, the trap lies
//    at your feet for 30 focus; the bandit that steps on it takes 25 times
//    your damage, and bleeds from Serrated Tips when an arrow lands after.
// 4. The mage at level 8: Fire and Frost on the tab.
// 5. Frost: Frostbite 1, Ice Shards 2, Permafrost 2, Arctic Reach 1 and Ice
//    Barrier. Drawn, it costs 30 mana and holds 40 times level 8's step (96);
//    the bandit's blows land on the ice, not on you.
// 6. Reset; Fire: Ignite 3, Improved Fireball 1, Critical Mass 2 and
//    Pyroblast. Drawn, it waits on the next bolt; held 1.25 s and thrown, it
//    leaves as a huge slow orb, and hits a bandit for 60 times your damage.
// 7. No page errors.
//
// Playwright is the global install; Chromium is the pre-installed one.

import { mkdirSync, writeFileSync } from 'node:fs';
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

// Every canvas remembers what was written on it since it was last cleared.
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

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};
const shot = async (name) => {
  if (!shots) return;
  await page.screenshot({ path: `${shots}/${name}.png` });
  const url = await page.evaluate(() => (window.__descent.bag.isOpen ? window.__descent.bag.panel.board.ctx.canvas.toDataURL() : null));
  if (url) writeFileSync(`${shots}/${name}-board.png`, Buffer.from(url.split(',')[1], 'base64'));
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
/** Run the game `s` seconds, your health kept full unless `hurt`. */
const step = (s, hurt = false) =>
  page.evaluate(
    ([s, hurt]) => {
      const { adventure } = window.__descent;
      for (let t = 0; t < s - 1e-9; t += 1 / 72) {
        if (!hurt && adventure.player.alive) adventure.player.hp = adventure.player.maxHp;
        adventure.update(1 / 72);
      }
    },
    [s, hurt],
  );
async function button(hand, name, value) {
  await page.evaluate(([hand, name, value]) => window.__descent.device.controllers[hand].updateButtonValue(name, value), [hand, name, value]);
  await xrFrames(2);
  await step(1 / 72);
}

/** A new character of `klass` named `name` made on the page, played in Oakvale with the cap at 10: into VR, paused. */
async function play(klass, name) {
  await page.goto(`${base}/?emulate&nodevui&cap=10`);
  await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 180000 });
  await page.evaluate(
    async ([klass, name]) => {
      const { characters } = window.__descent;
      for (const s of [...characters.slots]) await characters.remove(s.key);
      await characters.make(klass, name);
    },
    [klass, name],
  );
  await page.goto(`${base}/?emulate&nodevui&cap=10`);
  await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 180000 });
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  await page.evaluate(async () => {
    const d = window.__descent;
    d.paused = true;
    d.device.controllers.left.position.set(-0.3, 1.0, -0.1);
    d.device.controllers.right.position.set(0.3, 1.0, -0.1);
    window.__strokes = await import('/tests/support/gestureStrokes.ts');
  });
  await xrFrames(3);
  await step(0.3);
}

/** Stand where a new character starts, facing away from Hale, and wait until nothing fights you. */
async function standOutside() {
  await page.evaluate(() => {
    const d = window.__descent;
    d.adventure.world.settle(null);
    const h = d.adventure.hale.position;
    const start = d.adventure.respawns.village;
    const x = h.x + (start.x - h.x) * 3;
    const z = h.z + (start.z - h.z) * 3;
    d.teleport(x, z, Math.atan2(x - h.x, z - h.z));
    d.adventure.world.fill(x, z);
  });
  for (let i = 0; i < 40 && (await page.evaluate(() => window.__descent.adventure.fighting)); i++) await step(1);
  await step(0.3);
}

/** Kills fed as the camps feed them, until `level`. */
const levelTo = (level) =>
  page.evaluate((level) => {
    const { adventure, state } = window.__descent;
    let n = 0;
    while (state.level < level && n++ < 200) adventure.apply({ kind: 'kill', camp: null, level: 10, role: 'ordinary', family: 'bandit', seed: n }, adventure.player.rig.position);
    return state.level;
  }, level);

// ---------------------------------------------------------------- the bag and the talent page

async function fistTo(hand, w) {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(
      ([hand, w]) => {
        const { player, device } = window.__descent;
        const want = player.rig.worldToLocal(player.rig.position.clone().set(w.x, w.y, w.z));
        const g = player.input.hands[hand].grip.position;
        const c = device.controllers[hand].position;
        c.set(c.x + want.x - g.x, c.y + want.y - g.y, c.z + want.z - g.z);
      },
      [hand, w],
    );
    await xrFrames(2);
  }
}
async function fistAt(hand, w) {
  await fistTo(hand, w);
  await step(1 / 72);
}
async function grip(hand, value) {
  await page.evaluate(([hand, v]) => window.__descent.device.controllers[hand].updateButtonValue('squeeze', v), [hand, value]);
  await xrFrames(2);
  await step(1 / 72);
}
const zone = (hand) =>
  page.evaluate((hand) => {
    const c = window.__descent.bag.reach.centre[hand];
    return { x: c.x, y: c.y, z: c.z };
  }, hand);
/** A slow reach over the right shoulder: in, a moment still, squeeze, back down; then the hands at rest. */
async function reachBack() {
  const z = await zone('right');
  await fistTo('right', z);
  await step(0.3);
  await grip('right', 1);
  await step(0.1);
  await fistAt('right', { x: z.x, y: z.y - 0.6, z: z.z - 0.4 });
  await grip('right', 0);
  await step(0.1);
  await fistAt(
    'right',
    await page.evaluate(() => {
      const d = window.__descent;
      const p = d.player.rig.localToWorld(d.player.rig.position.clone().set(0.3, 0.9, 0.1));
      return { x: p.x, y: p.y, z: p.z };
    }),
  );
  await step(0.3);
}
const outFrom = (w, d) =>
  page.evaluate(
    ([w, d]) => {
      const { root } = window.__descent.bag.panel;
      const o = root.getWorldPosition(root.position.clone());
      const n = root.localToWorld(root.position.clone().set(0, 0, 1)).sub(o);
      return { x: w.x + n.x * d, y: w.y + n.y * d, z: w.z + n.z * d };
    },
    [w, d],
  );
const tabAt = (tab) =>
  page.evaluate((tab) => {
    const { bag, camera } = window.__descent;
    const p = bag.panel.tabWorld(tab, camera.position.clone(), 0.015);
    return { x: p.x, y: p.y, z: p.z };
  }, tab);
const buttonAt = (button) =>
  page.evaluate((button) => {
    const { bag, camera } = window.__descent;
    const p = bag.panel.buttonWorld(button, camera.position.clone(), 0.015);
    return p && { x: p.x, y: p.y, z: p.z };
  }, button);
async function press(at) {
  await fistAt('right', await outFrom(at, 0.1));
  await step(0.1);
  await fistAt('right', at);
  await step(1 / 72);
  await fistAt('right', await outFrom(at, 0.1));
  await step(0.4);
}
const pressTalent = async (talent) => press(await buttonAt({ kind: 'talent', talent }));
const state = () =>
  page.evaluate(() => {
    const d = window.__descent;
    const { bag, state, player } = d;
    return {
      level: state.level,
      open: bag.isOpen,
      page: bag.panel.page,
      board: bag.panel.board.ctx.__texts ?? [],
      last: bag.lines.at(-1) ?? '',
      points: state.pointsLeft,
      talents: { ...state.talents },
      triangle: state.slots.triangle,
      abilities: [...player.stats.abilities],
      resource: player.resource,
      fighting: d.adventure.fighting,
    };
  });

/** Open the Talents tab (the bag opened over the shoulder), and leave it open. */
async function openTalents() {
  await reachBack();
  const s = await state();
  if (s.page !== 'talents') await press(await tabAt('talents'));
  return state();
}

/** On the open talent page, spend a point in each of `talents` (Reset first if `reset`), then shut the bag. */
async function spendOnPage(talents, reset = false) {
  let s = await openTalents();
  const had = s.points;
  if (reset) {
    await press(await buttonAt({ kind: 'reset' }));
    s = await state();
    check(s.points === 7 && Object.keys(s.talents).length === 0 && s.triangle === null, `out of the fight, Reset gives every point back (${had} → ${s.points}, "${s.last}")`);
  }
  for (const t of talents) await pressTalent(t);
  s = await state();
  await shot(`talents-${talents.at(-1)}`);
  await reachBack();
  return s;
}

/**
 * Draw `shape` with the right hand: the grip squeezed at its first point, the
 * hand moved along a sloppy seeded stroke frame by frame, the grip let go.
 * Returns the gestures' last outcome.
 */
async function draw(shape, seed = 3) {
  const n = await page.evaluate(
    ([shape, seed]) => {
      const { adventure, device } = window.__descent;
      const S = window.__strokes;
      const stroke = S.performShape(shape, S.rng(seed));
      const { player } = adventure;
      const V = player.rig.position.constructor;
      const head = player.rig.worldToLocal(player.headPosition(new V()));
      const gaze = player.camera.getWorldDirection(new V()).applyQuaternion(player.rig.quaternion.clone().invert());
      const f = new V(gaze.x, 0, gaze.z).normalize();
      const right = new V(-f.z, 0, f.x);
      window.__stroke = stroke.points.map(([x, y, z]) => head.clone().addScaledVector(right, x).add(new V(0, y, 0)).addScaledVector(f, z).toArray());
      const p = window.__stroke[0];
      device.controllers.right.position.set(p[0], p[1], p[2]);
      return window.__stroke.length;
    },
    [shape, seed],
  );
  await xrFrames(2);
  await page.evaluate(() => window.__descent.device.controllers.right.updateButtonValue('squeeze', 1));
  await xrFrames(2);
  await page.evaluate((n) => {
    const { adventure } = window.__descent;
    const grip = adventure.player.input.hands.right.grip;
    for (let i = 0; i < n; i++) {
      grip.position.fromArray(window.__stroke[i]);
      grip.updateMatrix();
      adventure.player.hp = adventure.player.maxHp;
      adventure.update(1 / 72);
    }
  }, n);
  await page.evaluate(() => {
    const p = window.__stroke[window.__stroke.length - 1];
    window.__descent.device.controllers.right.position.set(p[0], p[1], p[2]);
    window.__descent.device.controllers.right.updateButtonValue('squeeze', 0);
  });
  await xrFrames(2);
  await page.evaluate(() => {
    const grip = window.__descent.adventure.player.input.hands.right.grip;
    grip.position.fromArray(window.__stroke[window.__stroke.length - 1]);
    grip.updateMatrix();
  });
  await step(1 / 72);
  return page.evaluate(() => {
    const l = window.__descent.adventure.gestures.last;
    return { event: l?.event, id: l?.verdict?.id ?? null, ability: l?.ability ?? null, use: l?.use ?? null, reason: l?.reason ?? null };
  });
}

/** The right hand back down at rest (a stroke leaves it in the air). */
async function handsDown() {
  await page.evaluate(() => window.__descent.device.controllers.right.position.set(0.3, 1.0, -0.1));
  await xrFrames(2);
  await step(1 / 72);
}

// ---------------------------------------------------------------- the farm's bandits

/** The nearest standing farm bandit, as `window.__target`; its hp, or null. */
const pickBandit = () =>
  page.evaluate(() => {
    const d = window.__descent;
    const me = d.player.rig.position;
    const e = d.camps.camps
      .find((c) => c.plan.id === 'farm')
      .members.map((m) => m.enemy)
      .filter((e) => e.alive && e.hittable)
      .sort((a, b) => a.position.distanceTo(me) - b.position.distanceTo(me))[0];
    window.__target = e ?? null;
    return e ? { hp: e.hp, maxHp: e.maxHp } : null;
  });
const target = () =>
  page.evaluate(() => {
    const e = window.__target;
    return { hp: e.hp, maxHp: e.maxHp, alive: e.alive, x: e.position.x, z: e.position.z };
  });
/** Stand `d` m from the target, on its side towards the road's end (a clear line past the windmill's props), facing it. */
async function standBy(d) {
  await page.evaluate((d) => {
    const e = window.__target;
    const dx = 54.5 - e.position.x;
    const dz = 26 - e.position.z;
    const n = Math.hypot(dx, dz);
    const x = e.position.x + (dx / n) * d;
    const z = e.position.z + (dz / n) * d;
    window.__descent.teleport(x, z, Math.atan2(-(e.position.x - x), -(e.position.z - z)));
  }, d);
  await xrFrames(2);
  await step(1 / 72);
}
/** Near the farm, by the road's end. */
async function toFarm() {
  await page.evaluate(() => {
    const d = window.__descent;
    d.teleport(54.5, 26, Math.atan2(-(60 - 54.5), -(33 - 26)));
    d.adventure.world.fill(54.5, 26);
  });
  await step(0.5);
}

// ---------------------------------------------------------------- the ranger's bow

/**
 * Hold the bow out at the target's chest, `side` m to its right, the fist's
 * line upright, then the draw hand on the string (`pull` null) or `pull` m
 * behind the arrow rest.
 */
async function aim(side, pull = null) {
  await page.evaluate((side) => {
    const { device, player } = window.__descent;
    const e = window.__target;
    const V = player.rig.position.constructor;
    const bottom = new V();
    const at = new V();
    e.capsule(bottom, at);
    at.lerp(bottom, 0.35);
    const head = player.headPosition(new V());
    const across = new V(-(at.z - head.z), 0, at.x - head.x).normalize();
    at.addScaledVector(across, side);
    const far = at.distanceTo(head);
    at.y += Math.max(0, 0.5 * 9.8 * (far / 42) ** 2 - 0.1);
    player.rig.worldToLocal(at);
    const eye = new V(device.position.x, device.position.y, device.position.z);
    const left = eye.clone().addScaledVector(at.clone().sub(eye).normalize(), 0.55).add(new V(0, -0.12, 0));
    const s = Math.SQRT1_2;
    const { left: L, right: R } = device.controllers;
    L.position.set(left.x, left.y, left.z);
    Object.assign(L.quaternion, { x: s, y: 0, z: 0, w: s });
    Object.assign(R.quaternion, { x: s, y: 0, z: 0, w: s });
    window.__aim = at.toArray();
  }, side);
  await xrFrames(2);
  await step(1 / 72);
  await page.evaluate((pull) => {
    const { device, player, adventure } = window.__descent;
    const { rig } = player;
    const V = rig.position.constructor;
    const Rc = device.controllers.right;
    const grip = rig.worldToLocal(player.input.hands.right.grip.getWorldPosition(new V()));
    const offset = grip.sub(new V(Rc.position.x, Rc.position.y, Rc.position.z));
    const bow = adventure.combat.ranger.bow;
    const rest = rig.worldToLocal(bow.rest.clone());
    const want = pull === null ? rig.worldToLocal(bow.stringRest.clone()) : rest.clone().addScaledVector(new V(...window.__aim).sub(rest).normalize(), -pull);
    want.sub(offset);
    Rc.position.set(want.x, want.y, want.z);
  }, pull);
  await xrFrames(2);
  await step(1 / 72);
}
/** Nock, draw full, loose `side` m wide of the target, and let it fly. */
async function loose(side = 0) {
  await aim(side);
  await button('right', 'trigger', 1);
  await aim(side, 0.75);
  await aim(side, 0.75);
  await button('right', 'trigger', 0);
  await step(0.5);
  await handsDown();
}
const kit = () => page.evaluate(() => ({ ...window.__descent.adventure.combat.ranger.stats, focus: window.__descent.player.resource, trueshooting: window.__descent.adventure.combat.ranger.trueshooting }));

// ---------------------------------------------------------------- the mage's bolts

/** A bolt held `charge` s by the shoulder and thrown at the target from `range` m: the bolt as thrown, and the target after. */
async function throwAt(range, charge) {
  const hold = (p) =>
    page.evaluate((p) => {
      const { player, device } = window.__descent;
      const g = player.input.hands.right.grip;
      g.position.set(...p);
      g.quaternion.set(0, 0, 0, 1);
      g.updateMatrix();
      device.controllers.right.position.set(...p);
      device.controllers.right.quaternion.set(0, 0, 0, 1);
    }, p);
  await standBy(range);
  await hold([0.25, 1.5, 0.15]);
  await button('right', 'trigger', 1);
  await page.evaluate((charge) => {
    const { player, adventure } = window.__descent;
    const g = player.input.hands.right.grip;
    for (let t = 0; t < charge; t += 1 / 72) {
      g.position.set(0.25, 1.5, 0.15);
      g.updateMatrix();
      player.hp = player.maxHp;
      adventure.update(1 / 72);
    }
    for (let i = 1; i <= 3; i++) {
      g.position.set(0.25, 1.5 - i * 0.004, 0.15 - (i * 4.5) / 72);
      g.updateMatrix();
      adventure.update(1 / 72);
    }
  }, charge);
  const n = await page.evaluate(() => window.__descent.adventure.combat.bolts.bolts.length);
  await hold([0.25, 1.5 - 4 * 0.004, 0.15 - (4 * 4.5) / 72]);
  await button('right', 'trigger', 0);
  const bolt = await page.evaluate((n) => {
    const bolts = window.__descent.adventure.combat.bolts.bolts;
    const b = bolts.length > n ? bolts[bolts.length - 1] : null;
    return b && { charge: b.charge, radius: b.radius, speed: b.vel.length(), damage: b.damage, locked: b.target === window.__target };
  }, n);
  await step(1.5);
  await handsDown();
  return { bolt, after: await target() };
}

// ================================================================ the ranger
await play('ranger', 'Robin');
await standOutside();
{
  const level = await levelTo(8);
  const s = await openTalents();
  const has = (t) => s.board.includes(t);
  check(level === 8 && s.points === 7, `a level-8 ranger has 7 points (level ${level}, ${s.points})`);
  check(s.page === 'talents' && has('Marksmanship  0') && has('Survival  0'), `the Talents tab shows Marksmanship and Survival (${s.board.filter((t) => /Marksmanship|Survival/.test(t)).join(' / ')})`);
  check(['Steady Aim', 'Keen Eye', 'Efficiency', 'Swift Arrows', 'Trueshot', 'Improved Volley', 'Trapper', 'Fleet Foot', 'Serrated Tips', 'Steady Ward', 'Explosive Trap', 'Improved Scatter'].every(has), 'every talent of both trees a button');
  await shot('01-ranger-page');
  await reachBack();
}

// ---- Marksmanship and Trueshot
{
  const s = await spendOnPage(['steadyAim', 'steadyAim', 'steadyAim', 'efficiency', 'swiftArrows', 'swiftArrows', 'trueshot']);
  check(s.points === 0 && s.talents.trueshot === 1 && s.triangle === 'trueshot' && s.abilities.includes('trueshot'), `Marksmanship to tier 3 and Trueshot, in the triangle (${JSON.stringify(s.talents)}, ${s.triangle})`);
  await toFarm();
  const had = await pickBandit();
  check(had !== null, 'a farm bandit stands');
  await standBy(6);
  const before = await kit();
  const drawn = await draw('triangle');
  const after = await kit();
  check(drawn.ability === 'trueshot' && drawn.use === 'cast', `a triangle casts Trueshot (${JSON.stringify(drawn)})`);
  check(before.focus - after.focus > 25 && after.trueshooting, `for 30 focus, and it's on (${before.focus.toFixed(0)} → ${after.focus.toFixed(0)} focus)`);
  await standBy(6);
  const hp = (await target()).hp;
  await loose(0.5);
  const k = await kit();
  const t = await target();
  check(k.trueshots >= 1 && k.bent >= 1 && (t.hp < hp || !t.alive), `an arrow loosed half a metre wide bends onto the bandit (${k.trueshots} loosed under it, ${k.bent} bent, ${hp} → ${t.hp} hp)`);
  await shot('02-trueshot');
}

// ---- Survival and Explosive Trap
await standOutside();
{
  const s = await spendOnPage(['trapper', 'trapper', 'trapper', 'fleetFoot', 'serratedTips', 'serratedTips', 'explosiveTrap'], true);
  check(s.points === 0 && s.triangle === 'explosiveTrap' && !s.abilities.includes('trueshot'), `Survival to tier 3 and Explosive Trap, in the triangle (${JSON.stringify(s.talents)}, ${s.triangle})`);
  const talents = await page.evaluate(() => ({ ...window.__descent.player.stats.talents }));
  check(talents.trapRoot === 3 && Math.abs(talents.dashSooner - 0.3) < 1e-9 && talents.bleed === 4 && talents.arrowDamage === 0, `the numbers follow the points: roots +3 s, dash 0.3 s sooner, a bleed of 4 (${JSON.stringify({ trapRoot: talents.trapRoot, dashSooner: talents.dashSooner, bleed: talents.bleed })})`);
  await toFarm();
  await pickBandit();
  await standBy(3);
  const before = await kit();
  const drawn = await draw('triangle');
  const laid = await page.evaluate(() => window.__descent.adventure.combat.ranger.traps.laid.map((t) => ({ kind: t.kind, x: t.at.x, z: t.at.z })));
  const after = await kit();
  check(drawn.ability === 'explosiveTrap' && drawn.use === 'cast' && laid.length === 1 && laid[0].kind === 'explosive', `a triangle lays an explosive trap at your feet (${JSON.stringify(drawn)}, ${JSON.stringify(laid)})`);
  check(before.focus - after.focus > 25, `for 30 focus (${before.focus.toFixed(0)} → ${after.focus.toFixed(0)})`);
  // The bandit walks onto it.
  const hp = (await target()).hp;
  const damage = await page.evaluate(() => window.__descent.player.stats.damage);
  await page.evaluate(() => {
    const e = window.__target;
    const t = window.__descent.adventure.combat.ranger.traps.laid[0];
    e.position.set(t.at.x + 0.2, e.position.y, t.at.z);
  });
  await step(3 / 72);
  const k = await kit();
  const t = await target();
  const burst = Math.round(25 * damage);
  check(k.bursts === 1 && k.burst >= 1 && (t.hp === hp - burst || !t.alive), `it bursts under the bandit for 25 times your damage (${hp} → ${t.hp} hp, ${burst} expected)`);
  await shot('03-explosive-trap');
  // Tough enough to live through a full-drawn arrow (a bandit would die of it), then an arrow.
  if (!t.alive) await pickBandit();
  await page.evaluate(() => (window.__target.hp = 1000));
  await standBy(6);
  const hitsBefore = (await kit()).hits;
  const ticksBefore = await page.evaluate(() => window.__descent.combatStats.dotTicks);
  // Every bleed laid, as it is laid (the bandit, knocked about, may turn for home before we look).
  await page.evaluate(() => {
    const dots = window.__descent.adventure.combat.dots;
    window.__bleeds = [];
    const add = dots.add.bind(dots);
    dots.add = (enemy, kind, damage, seconds) => {
      if (kind === 'bleed') window.__bleeds.push({ mine: enemy === window.__target, hittable: enemy.hittable, damage, seconds });
      add(enemy, kind, damage, seconds);
    };
  });
  await loose(0);
  const bleeds = await page.evaluate(() => window.__bleeds);
  const bled = await page.evaluate(() => window.__descent.adventure.combat.dots.on.filter((d) => d.enemy === window.__target && d.kind === 'bleed').length);
  const ticks = (await page.evaluate(() => window.__descent.combatStats.dotTicks)) - ticksBefore;
  const hits = (await kit()).hits - hitsBefore;
  const state = await page.evaluate(() => ({ hittable: window.__target.hittable, evading: window.__target.evading, state: window.__target.state }));
  const want = Math.round(4 * damage * 100) / 100;
  check(
    hits >= 1 && bleeds.some((b) => b.mine && b.hittable && Math.abs(b.damage - 4 * damage) < 1e-6 && b.seconds === 4),
    `an arrow that lands after makes it bleed 4 times your damage over 4 s (Serrated Tips): ${hits} hit, ${JSON.stringify(bleeds)}, ${want} expected; ${bled} bleeding, ${ticks} ticks, bandit ${JSON.stringify(state)}`,
  );
}

// ================================================================ the mage
await play('mage', 'Merlin');
await standOutside();
{
  const level = await levelTo(8);
  const s = await openTalents();
  const has = (t) => s.board.includes(t);
  check(level === 8 && s.points === 7, `a level-8 mage has 7 points (level ${level}, ${s.points})`);
  check(has('Fire  0') && has('Frost  0'), `the Talents tab shows Fire and Frost (${s.board.filter((t) => /^Fire|^Frost/.test(t)).join(' / ')})`);
  check(['Ignite', 'Incineration', 'Improved Fireball', 'Critical Mass', 'Pyroblast', 'Master of Elements', 'Frostbite', 'Ice Shards', 'Permafrost', 'Arctic Reach', 'Ice Barrier', 'Frozen Ward'].every(has), 'every talent of both trees a button');
  await shot('04-mage-page');
  await reachBack();
}

// ---- Frost and Ice Barrier
{
  const s = await spendOnPage(['frostbite', 'iceShards', 'iceShards', 'permafrost', 'permafrost', 'arcticReach', 'iceBarrier']);
  check(s.points === 0 && s.triangle === 'iceBarrier', `Frost to tier 3 and Ice Barrier, in the triangle (${JSON.stringify(s.talents)}, ${s.triangle})`);
  await toFarm();
  await pickBandit();
  await standBy(1.6);
  const mana = await page.evaluate(() => window.__descent.player.resource);
  const drawn = await draw('triangle');
  await step(2 / 72); // the ring shows from the next frame
  const up = await page.evaluate(() => ({ held: window.__descent.adventure.combat.barrier.held, mana: window.__descent.player.resource, ring: window.__descent.adventure.combat.barrier.ring.visible }));
  check(drawn.ability === 'iceBarrier' && drawn.use === 'cast', `a triangle casts Ice Barrier (${JSON.stringify(drawn)})`);
  check(up.held === 96 && mana - up.mana > 25 && up.ring, `for 30 mana it holds 40 times level 8's step: 96, its ring round you (${JSON.stringify(up)}, ${mana.toFixed(0)} mana before)`);
  // Let the bandit come and swing at you, your health not kept full.
  const hp = await page.evaluate(() => window.__descent.player.hp);
  let absorbed = 0;
  for (let i = 0; i < 20 && absorbed === 0; i++) {
    await page.evaluate(() => {
      const e = window.__target;
      const d = window.__descent;
      const me = d.player.rig.position;
      d.player.place(me.x, me.z, Math.atan2(-(e.position.x - me.x), -(e.position.z - me.z)));
    });
    await step(0.5, true);
    absorbed = await page.evaluate(() => window.__descent.combatStats.absorbed);
  }
  const after = await page.evaluate(() => ({ hp: window.__descent.player.hp, held: window.__descent.adventure.combat.barrier.held }));
  check(absorbed > 0 && (after.hp === hp || absorbed >= 96), `the bandit's blows land on the ice, not on you (${absorbed} taken by it, health ${hp} → ${after.hp}, ${after.held} left)`);
  await shot('05-ice-barrier');
}

// ---- Fire and Pyroblast
await standOutside();
{
  const s = await spendOnPage(['ignite', 'ignite', 'ignite', 'improvedFireball', 'criticalMass', 'criticalMass', 'pyroblast'], true);
  check(s.points === 0 && s.triangle === 'pyroblast' && !s.abilities.includes('iceBarrier'), `Fire to tier 3 and Pyroblast, in the triangle (${JSON.stringify(s.talents)}, ${s.triangle})`);
  await toFarm();
  await pickBandit();
  await standBy(5);
  const mana = await page.evaluate(() => window.__descent.player.resource);
  const drawn = await draw('triangle');
  const waiting = await page.evaluate(() => ({ on: window.__descent.player.abilities.waitingOn(), mana: window.__descent.player.resource, charge: window.__descent.adventure.mage.chargeTime() }));
  check(drawn.ability === 'pyroblast' && drawn.use === 'cast' && waiting.on === 'pyroblast', `a triangle puts Pyroblast on the next bolt (${JSON.stringify(drawn)}, ${JSON.stringify(waiting)})`);
  check(mana - waiting.mana > 30 && waiting.charge === 1.2, `for 35 mana, and the bolt charges in 1.2 s (${mana.toFixed(0)} → ${waiting.mana.toFixed(0)})`);
  // Tough enough to live through it (a bandit would die), so the burn shows.
  await page.evaluate(() => (window.__target.hp = 1000));
  const hp = (await target()).hp;
  const damage = await page.evaluate(() => window.__descent.player.stats.damage);
  const { bolt, after } = await throwAt(5, 1.25);
  const hits = await page.evaluate(() => ({ ...window.__descent.combatStats }));
  const burn = await page.evaluate(() => window.__descent.adventure.combat.dots.of(window.__target, 'burn'));
  check(bolt?.charge === 'pyroblast' && bolt.radius === 0.3 && Math.abs(bolt.speed - 6) < 0.01 && bolt.damage > 55, `held 1.25 s and thrown, a huge slow orb (${JSON.stringify(bolt)})`);
  check(hits.pyroblastHits === 1 && hp - after.hp >= Math.round(60 * damage), `it hits the bandit for 60 times your damage (${hp} → ${after.hp} hp, ${Math.round(60 * damage)} expected)`);
  check(burn >= 15 * damage, `and sets it burning: Pyroblast's 15 and Ignite's 30% to come (${burn.toFixed(1)} to come, over ${Math.round(15 * damage)})`);
  await shot('06-pyroblast');
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
