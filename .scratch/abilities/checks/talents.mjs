// Checks for talents and the warrior's trees
// (issues/25-talents-and-the-warriors-trees.md) in headless Chromium with the
// IWER emulator. Start `npx vite --port 5173` first, then:
//
//   node .scratch/abilities/checks/talents.mjs [http://localhost:5173] [shots/]
//
// Oakvale for a new warrior with the level cap raised (`&cap=10`), paused and
// stepped in the page; the hands moved and the grips squeezed through the
// emulated controllers. Levels come from kills fed to the Adventure as the
// camps feed them. What it checks:
//
// 1. Levelling: the first level-up's lines say "Talent point: open your
//    talents"; at level 8 there are 7 points to spend.
// 2. The Talents tab: reach over the shoulder, press the tab. Both trees
//    side by side with their points, the points left, Reset and the five
//    shapes; the gear slots and the figure stand aside.
// 3. Spending: a tier-2 talent refused before its tier opens; Toughness 3,
//    Quick Guard 2 and Iron Arm 1 open tier 3, and Shield Slam takes the last
//    point: it's in the triangle, a pip on the belt, and Toughness's health
//    is yours.
// 4. Shield Slam on a brute: in the mine's dig by its brute, a triangle drawn
//    arms it for 20 rage, and the next shield bash stuns the brute for 3 s
//    and exposes it.
// 5. In the fight, the talent page refuses a reset.
// 6. Out of the mine, Reset gives all 7 points back and the triangle empties.
// 7. Swapping: the ring and then the Z pressed swap Heroic Throw and Shield
//    Wall.
// 8. A reload keeps the talents and the swap (the record at version 5).
// 9. No page errors.
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
    (window.__written ??= []).push(String(text));
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
  // The bag panel's board as painted, face on.
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
/** Run the game `s` seconds, your health kept full. */
const step = (s) =>
  page.evaluate((s) => {
    const { adventure } = window.__descent;
    for (let t = 0; t < s - 1e-9; t += 1 / 72) {
      if (adventure.player.alive) adventure.player.hp = adventure.player.maxHp;
      adventure.update(1 / 72);
    }
  }, s);

async function enter() {
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

/** Stand where a new character starts, facing away from Hale so their board stays folded. */
const standOutside = () =>
  page.evaluate(() => {
    const d = window.__descent;
    d.adventure.world.settle(null);
    const h = d.adventure.hale.position;
    const start = d.adventure.respawns.village;
    const x = h.x + (start.x - h.x) * 3;
    const z = h.z + (start.z - h.z) * 3;
    d.teleport(x, z, Math.atan2(x - h.x, z - h.z));
    d.adventure.world.fill(x, z);
  });

/** Move a controller so that its grip (the fist) lands at a world point: XR frames only, the game doesn't step. */
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
/** A slow reach over a shoulder: in, a moment still, squeeze, back down. */
async function reachBack(hand = 'right') {
  const z = await zone(hand);
  await fistTo(hand, z);
  await step(0.3);
  await grip(hand, 1);
  await step(0.1);
  await fistAt(hand, { x: z.x, y: z.y - 0.6, z: z.z - 0.4 });
  await grip(hand, 0);
  await step(0.1);
}
async function handsDown() {
  await fistAt(
    'right',
    await page.evaluate(() => {
      const d = window.__descent;
      const p = d.player.rig.localToWorld(d.player.rig.position.clone().set(0.3, 0.9, 0.1));
      return { x: p.x, y: p.y, z: p.z };
    }),
  );
}
/** A point `d` metres straight out from the panel's face at `w` (towards you). */
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
/** Press a tab or button with the right fist: in from in front of it, a frame on it, back out; then the rearm passes. */
async function press(at) {
  await fistAt('right', await outFrom(at, 0.1));
  await step(0.1);
  await fistAt('right', at);
  await step(1 / 72);
  await fistAt('right', await outFrom(at, 0.1));
  await step(0.4);
}
const pressTalent = async (talent) => press(await buttonAt({ kind: 'talent', talent }));
const pressSlot = async (shape) => press(await buttonAt({ kind: 'slot', shape }));
/** What a player would notice. */
const state = () =>
  page.evaluate(() => {
    const d = window.__descent;
    const { bag, state, player } = d;
    const panel = bag.panel;
    return {
      level: state.level,
      open: bag.isOpen,
      page: panel.page,
      board: panel.board.ctx.__texts ?? [],
      gearShown: panel.slots.frames.count,
      figure: panel.figure.visible,
      last: bag.lines.at(-1) ?? '',
      lines: [...bag.lines],
      points: state.pointsLeft,
      talents: { ...state.talents },
      slots: { ...state.slots },
      abilities: [...player.stats.abilities],
      maxHp: player.maxHp,
      fighting: d.adventure.fighting,
    };
  });

/** Kills fed as the camps feed them, until `level`: every effect's level-up shown. */
const levelTo = (level) =>
  page.evaluate((level) => {
    const { adventure, state } = window.__descent;
    let n = 0;
    while (state.level < level && n++ < 200) {
      adventure.apply({ kind: 'kill', camp: null, level: 10, role: 'ordinary', family: 'bandit', seed: n }, adventure.player.rig.position);
    }
    return state.level;
  }, level);

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
    return { event: l?.event, id: l?.verdict?.id ?? null, ability: l?.ability ?? null, use: l?.use ?? null };
  });
}

// ---------------------------------------------------------------- 1.
await enter();
await standOutside();
await step(0.3);
{
  await page.evaluate(() => (window.__written = []));
  const level = await levelTo(2);
  const said = await page.evaluate(() => window.__written);
  check(level === 2 && said.includes('LEVEL 2') && said.includes('Talent point: open your talents'), `level 2's lines say "Talent point: open your talents" (${said.filter((t) => /LEVEL|Talent|War Cry/.test(t)).join(' / ')})`);
  await levelTo(8);
  const s = await state();
  check(s.level === 8 && s.points === 7, `a level-8 warrior has 7 points to spend (level ${s.level}, ${s.points} points)`);
}

// ---------------------------------------------------------------- 2.
await reachBack('right');
await handsDown();
await step(0.3);
{
  let s = await state();
  check(s.open && s.page === 'bag', `the reach opens the bag (${s.open}, ${s.page})`);
  await press(await tabAt('talents'));
  s = await state();
  const has = (t) => s.board.includes(t);
  check(s.page === 'talents', `the Talents tab shows the talent page (${s.page})`);
  check(has('Arms  0') && has('Protection  0') && has('7 points to spend') && has('Reset'), `both trees with their points, the points left and Reset (${s.board.filter((t) => /Arms|Protection|points|Reset/.test(t)).join(' / ')})`);
  check(['Deep Cuts', 'Blood Rage', 'Tactician', 'Heavy Swing', 'Mortal Strike', 'Sweeping Mastery', 'Toughness', 'Shield Spikes', 'Quick Guard', 'Iron Arm', 'Shield Slam', 'Unbreakable'].every(has), 'every talent of both trees a button');
  check(has('Heroic Throw') && has('Shield Wall') && s.board.filter((t) => t === 'empty').length === 3, `the five shapes, two holding abilities and three empty`);
  check(s.gearShown === 0 && !s.figure, `the gear slots and the figure stand aside (${s.gearShown} slots, figure ${s.figure})`);
  await shot('01-talent-page');
}

// ---------------------------------------------------------------- 3.
{
  await pressTalent('quickGuard');
  let s = await state();
  check(s.last === 'refused (tier not open): Quick Guard' && s.points === 7, `Quick Guard is refused before tier 2 opens ("${s.last}")`);
  const hp = s.maxHp;
  for (const t of ['toughness', 'toughness', 'toughness', 'quickGuard', 'quickGuard', 'ironArm']) await pressTalent(t);
  s = await state();
  check(s.points === 1 && s.talents.toughness === 3 && s.talents.quickGuard === 2 && s.talents.ironArm === 1, `Toughness 3, Quick Guard 2, Iron Arm 1: one point left (${JSON.stringify(s.talents)})`);
  check(s.board.includes('Protection  6') && s.board.includes('3/3'), `the page shows Protection's 6 and Toughness full`);
  check(s.maxHp === Math.round(hp * 1.15), `Toughness adds 15% health (${hp} → ${s.maxHp})`);
  await pressTalent('shieldSlam');
  s = await state();
  check(s.last === 'spent: Shield Slam 1/1' && s.points === 0, `Shield Slam takes the last point ("${s.last}")`);
  check(s.slots.triangle === 'shieldSlam' && s.abilities.includes('shieldSlam'), `Shield Slam is in the triangle (${JSON.stringify(s.slots)})`);
  check(s.board.includes('0 points to spend') && s.board.includes('Shield Slam'), 'the page says so');
  await pressTalent('deepCuts');
  s = await state();
  check(s.last === 'refused (no points left): Deep Cuts', `with none left, another press is refused ("${s.last}")`);
  await shot('02-spent');
}

// ---------------------------------------------------------------- 4.
await reachBack('right');
await handsDown();
{
  const s = await state();
  check(!s.open, 'the same reach shuts the bag');
  // Into the mine's dig, a step from its brute, facing it.
  const brute = await page.evaluate(() => {
    const d = window.__descent;
    const camp = d.camps.camps.find((c) => c.plan.interior === 'mine');
    const m = camp.members.find((m) => m.enemy.kind === 'brute');
    const e = m.enemy;
    d.adventure.world.settle('mine');
    const P = d.player.rig.position;
    const post = m.post;
    // Stand 1.1 m from its post, on the side it faces.
    const yaw = post.yaw ?? 0;
    const x = post.x - Math.sin(yaw) * 1.1;
    const z = post.z - Math.cos(yaw) * 1.1;
    d.teleport(x, z, Math.atan2(-(post.x - x), -(post.z - z)));
    void P;
    return { x: post.x, z: post.z, hp: e.hp };
  });
  await xrFrames(3);
  await step(0.5);
  const near = await page.evaluate(() => {
    const d = window.__descent;
    const e = d.camps.camps.find((c) => c.plan.interior === 'mine').members.find((m) => m.enemy.kind === 'brute').enemy;
    const head = d.player.headPosition(d.player.rig.position.clone());
    // Held where it stands for the check (a brute takes a root at half).
    d.enemies.root(20, e);
    return { d: Math.hypot(e.position.x - head.x, e.position.z - head.z), state: e.state, interior: d.adventure.world.interior };
  });
  check(near.d < 2 && near.interior === 'mine', `in the mine by the dig's brute (${near.d.toFixed(2)} m, ${near.interior}, ${near.state})`);
  await page.evaluate(() => (window.__descent.player.rage = 100));
  const drawn = await draw('triangle');
  const armed = await page.evaluate(() => ({ rage: window.__descent.player.rage, left: window.__descent.player.abilities.left('shieldSlam') }));
  check(drawn.id === 'triangle' && drawn.ability === 'shieldSlam' && drawn.use === 'cast', `a triangle casts Shield Slam (${JSON.stringify(drawn)})`);
  check(armed.rage > 78 && armed.rage <= 80 && armed.left > 2.5, `for 20 rage, arming the next bash for 3 s (rage ${armed.rage.toFixed(1)}, ${armed.left.toFixed(2)} s)`);
  // A shield bash: the left hand punched straight at the brute's chest, fast.
  const bash = await page.evaluate(() => {
    const d = window.__descent;
    const e = d.camps.camps.find((c) => c.plan.interior === 'mine').members.find((m) => m.enemy.kind === 'brute').enemy;
    const { player, device } = d;
    const V = player.rig.position.constructor;
    const head = player.headPosition(new V());
    const to = new V(e.position.x - head.x, 0, e.position.z - head.z).normalize();
    const from = head.clone().addScaledVector(to, 0.15).setY(head.y - 0.35);
    const local = (w) => player.rig.worldToLocal(w.clone());
    window.__bash = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => local(from.clone().addScaledVector(to, i * 0.08)).toArray());
    const p = window.__bash[0];
    device.controllers.left.position.set(p[0], p[1], p[2]);
    return { slams: d.adventure.combat && 0 };
  });
  void bash;
  await xrFrames(2);
  const before = await page.evaluate(async () => (await import('/src/combat/combat.ts')).combatStats.shieldSlams);
  for (let i = 1; i < 8; i++) {
    await page.evaluate((i) => {
      const p = window.__bash[i];
      window.__descent.device.controllers.left.position.set(p[0], p[1], p[2]);
    }, i);
    await xrFrames(1);
    await step(1 / 72);
  }
  const hit = await page.evaluate(async () => {
    const d = window.__descent;
    const e = d.camps.camps.find((c) => c.plan.interior === 'mine').members.find((m) => m.enemy.kind === 'brute').enemy;
    return { slams: (await import('/src/combat/combat.ts')).combatStats.shieldSlams, state: e.state, exposed: e.exposed, left: d.player.abilities.left('shieldSlam') };
  });
  check(hit.slams === before + 1 && hit.state === 'stagger' && hit.exposed > 2.5 && hit.left === 0, `the next bash slams the brute: stunned and exposed, the charge spent (${JSON.stringify(hit)})`);
  await page.evaluate(() => {
    const p = window.__descent.player.rig.position.constructor;
    window.__descent.device.controllers.left.position.set(-0.3, 1.0, -0.1);
    void p;
  });
  await xrFrames(2);
  await step(2.6);
  const held = await page.evaluate(() => window.__descent.camps.camps.find((c) => c.plan.interior === 'mine').members.find((m) => m.enemy.kind === 'brute').enemy.state);
  await step(0.6);
  const after = await page.evaluate(() => window.__descent.camps.camps.find((c) => c.plan.interior === 'mine').members.find((m) => m.enemy.kind === 'brute').enemy.state);
  check(held === 'stagger' && after !== 'stagger', `it stays stunned for 3 s, then comes on (${held} at 2.6 s, ${after} at 3.2 s)`);
  await shot('03-shield-slam');
}

// ---------------------------------------------------------------- 5.
{
  const fighting = await page.evaluate(() => window.__descent.adventure.fighting);
  await reachBack('right');
  await handsDown();
  await press(await tabAt('talents'));
  await press(await buttonAt({ kind: 'reset' }));
  const s = await state();
  check(fighting && s.last === 'refused (in a fight): reset' && s.points === 0, `in the fight, Reset is refused (fighting ${fighting}, "${s.last}")`);
  check(s.board.some((t) => /Not in a fight/.test(t)), 'the page says talents wait until nothing fights you');
  await reachBack('right');
  await handsDown();
}

// ---------------------------------------------------------------- 6.
await standOutside();
await step(1);
{
  const fighting = await page.evaluate(() => window.__descent.adventure.fighting);
  await reachBack('right');
  await handsDown();
  let s = await state();
  if (s.page !== 'talents') await press(await tabAt('talents'));
  await press(await buttonAt({ kind: 'reset' }));
  s = await state();
  check(!fighting && s.last === 'reset: 7 points back' && s.points === 7 && Object.keys(s.talents).length === 0, `out of the mine, Reset gives all 7 points back ("${s.last}", ${s.points} points)`);
  check(s.slots.triangle === null && !s.abilities.includes('shieldSlam') && s.board.includes('7 points to spend'), `the triangle is empty again (${JSON.stringify(s.slots)})`);
}

// ---------------------------------------------------------------- 7.
{
  await pressSlot('ring');
  let s = await state();
  check(s.last === 'picked: ring', `pressing the ring picks it ("${s.last}")`);
  await pressSlot('z');
  s = await state();
  check(s.last === 'swapped: ring and z' && s.slots.ring === 'shieldWall' && s.slots.z === 'heroicThrow', `then the Z swaps them (${JSON.stringify(s.slots)})`);
  await pressTalent('deepCuts');
  await shot('04-swapped');
  await reachBack('right');
  await handsDown();
}

// ---------------------------------------------------------------- 8.
{
  await page.evaluate(() => window.__descent.saved());
  const record = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('descent-vr');
        open.onsuccess = () => {
          const get = open.result.transaction('save').objectStore('save').get('character');
          get.onsuccess = () => (open.result.close(), resolve(get.result));
        };
      }),
  );
  check(record?.version === 5 && record.talents.deepCuts === 1 && record.placed?.heroicThrow === 'z', `the record is version 5 with the talents and the swap (${JSON.stringify({ v: record?.version, talents: record?.talents, placed: record?.placed })})`);
  await page.goto(`${base}/?emulate&nodevui&cap=10`);
  await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 180000 });
  const back = await page.evaluate(() => ({ talents: { ...window.__descent.state.talents }, slots: { ...window.__descent.state.slots }, points: window.__descent.state.pointsLeft }));
  check(back.talents.deepCuts === 1 && back.slots.ring === 'shieldWall' && back.slots.z === 'heroicThrow' && back.points === 6, `a reload keeps them (${JSON.stringify(back)})`);
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
