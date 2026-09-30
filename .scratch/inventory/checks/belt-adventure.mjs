// Checks for the belt in the Adventure (issues/10-the-belt-in-the-adventure.md)
// in headless Chromium with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/inventory/checks/belt-adventure.mjs [http://localhost:5173] [shots/]
//
// Oakvale at the plain URL for a new character, paused and stepped in the page
// (`step`, `teleport`); the hands moved and the grips squeezed through the
// emulated controllers, and every buzz recorded. What it checks:
//
// 1. A new character has three minor healing potions on the right hip. The
//    two slots hang below the neck, one at each hip, and cost a few draws.
// 2. A hand arriving at the right hip makes it glow, with one tick. Its grip
//    takes the flask: the sword fades out of the hand and can't hit, and no
//    new shader program compiles for it.
// 3. At the mouth and pulled away early, the drink is cancelled: health is
//    unchanged and the flask stays in the hand. Let go, it goes back to its
//    slot and the sword comes back.
// 4. Against a bandit camp, fighting you: held at the mouth for 0.7 s, with a
//    steady buzz and then a strong one, the potion is drunk and health rises
//    by 40% of the maximum. The flask is gone, the sword comes back, and the
//    slot, drunk empty, refills from the bag's stack.
// 5. Every flask on the belt dims for 60 s, a ring on each draining; a grip at
//    a dimmed flask is refused with a strong buzz. After 60 s they're bright.
// 6. A potion carried from the bag panel onto the figure's belt slot goes onto
//    the left hip; another carried off the panel down to the real left hip
//    stacks on it; a tunic carried there is refused.
// 7. A reload keeps the belt, and what's left of a cooldown.
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
/** Run the game `s` seconds; `full` keeps your health full. */
const step = (s, full = true) =>
  page.evaluate(
    ([s, full]) => {
      const { adventure } = window.__descent;
      for (let t = 0; t < s - 1e-9; t += 1 / 72) {
        if (full && adventure.player.alive) adventure.player.hp = adventure.player.maxHp;
        adventure.update(1 / 72);
      }
    },
    [s, full],
  );

/** Oakvale at the plain URL: a new character in a fresh browser, or the one saved in it. */
async function enter() {
  await page.goto(`${base}/?emulate&nodevui`);
  await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 180000 });
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  await page.evaluate(() => {
    const d = window.__descent;
    d.paused = true;
    d.device.controllers.left.position.set(-0.3, 1.0, -0.1);
    d.device.controllers.right.position.set(0.3, 1.0, -0.1);
    d.buzzes = [];
    const input = d.player.input;
    const pulse = input.pulse.bind(input);
    input.pulse = (hand, intensity, ms) => {
      d.buzzes.push({ hand, intensity, ms });
      pulse(hand, intensity, ms);
    };
    // Stand where a new character starts, facing away from Hale so their board stays folded.
    const h = d.adventure.hale.position;
    const p = d.player.rig.position;
    const x = h.x + (p.x - h.x) * 3;
    const z = h.z + (p.z - h.z) * 3;
    d.teleport(x, z, Math.atan2(x - h.x, z - h.z));
  });
  await xrFrames(3);
  await step(0.3);
}

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
async function fistAt(hand, w, full = true) {
  await fistTo(hand, w);
  await step(1 / 72, full);
}
async function grip(hand, value, full = true) {
  await page.evaluate(([hand, v]) => window.__descent.device.controllers[hand].updateButtonValue('squeeze', v), [hand, value]);
  await xrFrames(2);
  await step(1 / 72, full);
}
const hip = (i) =>
  page.evaluate((i) => {
    const p = window.__descent.adventure.belt.slotWorld(i, window.__descent.camera.position.clone());
    return { x: p.x, y: p.y, z: p.z };
  }, i);
/** Where the fist must be for the flask in it (held just ahead of the grip) to sit at the mouth. */
const mouthFor = (hand) =>
  page.evaluate((hand) => {
    const { adventure, player } = window.__descent;
    const m = adventure.belt.mouth(player.camera.position.clone());
    const grip = player.input.hands[hand].grip;
    const off = grip.localToWorld(m.clone().set(0, 0.01, -0.03)).sub(grip.getWorldPosition(m.clone()));
    return { x: m.x - off.x, y: m.y - off.y, z: m.z - off.z };
  }, hand);
async function handsDown(full = true) {
  for (const hand of ['left', 'right']) {
    await fistAt(
      hand,
      await page.evaluate((hand) => {
        const d = window.__descent;
        const p = d.player.rig.localToWorld(d.player.rig.position.clone().set(hand === 'right' ? 0.35 : -0.35, 1.0, -0.25));
        return { x: p.x, y: p.y, z: p.z };
      }, hand),
      full,
    );
  }
}
/** What a player would notice. */
const state = () =>
  page.evaluate(() => {
    const d = window.__descent;
    const { adventure, state, player } = d;
    const belt = adventure.belt;
    const inv = state.inventory;
    const slots = belt.root.children.filter((c) => /Hip$/.test(c.name));
    return {
      belt: inv.belt.map((s) => (s ? { id: s.id, count: s.count } : null)),
      bag: inv.bag.map((s) => (s ? { id: s.id, count: s.count } : null)),
      cooldown: inv.cooldown,
      holding: { left: belt.holding('left'), right: belt.holding('right') },
      glow: slots.map((s) => s.children[2].visible),
      glowColour: slots.map((s) => s.children[2].material.color.getHex()),
      flaskShown: slots.map((s) => s.children[1].visible),
      flaskBright: slots.map((s) => s.children[1].material.color.r),
      dial: slots.map((s) => s.children[3].material.map.image.__texts ?? []),
      swordAway: player.sword.away,
      ghost: belt.hands.right.ghost?.visible ? belt.hands.right.ghostMat.opacity : 0,
      swordCanHit: player.sword.tip.valid,
      swordShown: player.sword.model.visible,
      hp: player.hp,
      maxHp: player.maxHp,
      alive: player.alive,
      fighting: adventure.camps.fighting,
      log: { ...belt.log },
      lines: [...belt.lines],
      bagLines: [...d.bag.lines],
      buzzes: [...d.buzzes],
    };
  });

// Every canvas remembers what was written on it since it was last cleared (the slots' counts).
await page.addInitScript(() => {
  const P = CanvasRenderingContext2D.prototype;
  const fill = P.fillText;
  const clear = P.clearRect;
  P.fillText = function (text, ...rest) {
    (this.canvas.__texts ??= []).push(String(text));
    return fill.call(this, text, ...rest);
  };
  P.clearRect = function (...args) {
    this.canvas.__texts = [];
    return clear.apply(this, args);
  };
});

await enter();

// 1. A new character's belt.
{
  const s = await state();
  check(s.belt[0] === null && s.belt[1]?.id === 'minor-healing-potion' && s.belt[1].count === 3, `a new character has three potions on the right hip (${JSON.stringify(s.belt)})`);
  const where = await page.evaluate(() => {
    const { adventure, camera } = window.__descent;
    const eyes = camera.getWorldPosition(camera.position.clone());
    return [0, 1].map((i) => {
      const p = adventure.belt.slotWorld(i, eyes.clone());
      return { down: eyes.y - p.y };
    });
  });
  check(where.every((w) => Math.abs(w.down - 0.7) < 0.02), `both hips hang 70 cm below the eyes (${where.map((w) => (w.down * 100).toFixed(0)).join(', ')} cm)`);
  check(s.dial[1].includes('3'), `the right hip's count shows 3 (${JSON.stringify(s.dial[1])})`);
  // Look down at your hips for it.
  await page.evaluate(() => window.__descent.device.quaternion.set(-0.5, 0, 0, 0.866));
  await xrFrames(4);
  // Each of the belt's meshes counts its own draws over one frame.
  const calls = await page.evaluate(async () => {
    const { adventure, renderer } = window.__descent;
    const session = renderer.xr.getSession();
    const frame = () => new Promise((r) => session.requestAnimationFrame(r));
    await frame();
    let draws = 0;
    const seen = {};
    const meshes = [];
    adventure.belt.root.traverse((o) => o.isMesh && meshes.push(o));
    for (const m of meshes) m.onAfterRender = () => { draws++; const k = `${m.parent.name}/${m.geometry.type}`; seen[k] = (seen[k] ?? 0) + 1; };
    await frame();
    for (const m of meshes) delete m.onAfterRender;
    return { belt: draws, views: renderer.xr.getCamera().cameras.length, seen: JSON.stringify(seen) };
  });
  check(calls.belt / calls.views >= 2 && calls.belt / calls.views <= 6, `looking down, the belt costs ${calls.belt / calls.views} draws an eye (${calls.belt} over ${calls.views} eyes: ${calls.seen})`);
  await shot('01-belt');
  await page.evaluate(() => window.__descent.device.quaternion.set(0, 0, 0, 1));
  await xrFrames(4);
  await step(0.1);
}

// 2. Reach down to the right hip: glow, tick, take; the sword fades and can't hit.
{
  await xrFrames(4);
  const names = () => page.evaluate(() => window.__descent.renderer.info.programs.map((p) => p.cacheKey));
  const was = await names();
  const programs = was.length;
  await page.evaluate(() => (window.__descent.buzzes.length = 0));
  const right = await hip(1);
  await fistAt('right', { x: right.x, y: right.y + 0.3, z: right.z });
  await fistAt('right', { x: right.x, y: right.y + 0.05, z: right.z });
  await step(0.1);
  let s = await state();
  const ticks = s.buzzes.filter((b) => b.hand === 'right' && b.intensity === 0.3).length;
  check(s.glow[1] && !s.glow[0] && ticks === 1, `a hand at the right hip makes it glow, with one tick (${ticks})`);
  await grip('right', 1);
  s = await state();
  check(s.holding.right === 1 && s.swordAway && !s.swordCanHit, `the grip takes the flask, and the sword can't hit (holding ${s.holding.right}, away ${s.swordAway})`);
  check(s.dial[1].includes('2') && !s.flaskShown[1], `the slot shows the two left (${JSON.stringify(s.dial[1])})`);
  await step(0.06);
  const fading = (await state()).ghost;
  await step(0.3);
  const faded = (await state()).ghost;
  check(fading > 0.1 && fading < 0.9 && faded === 0, `the sword fades out of the hand (${fading.toFixed(2)} after 0.07 s, gone by 0.37 s)`);
  await xrFrames(4);
  // What the belt draws (its slots, the flask in the hand, the fading sword's ghost) compiles nothing new.
  // Anything else that first shows here (the sword's trail, as the check's hand jumps) is not the belt's.
  const drawn = await page.evaluate(() => {
    const { renderer, adventure, player } = window.__descent;
    const keys = [];
    const add = (o) => o.traverse((m) => m.material && keys.push(renderer.properties.get(m.material).currentProgram?.cacheKey ?? null));
    add(adventure.belt.root);
    for (const c of player.input.hands.right.grip.children) if (c !== player.sword.model && c !== player.fists?.right.mesh) add(c);
    return keys;
  });
  const fresh = drawn.filter((k) => !k || !was.includes(k)).length;
  check(fresh === 0 && drawn.length >= 6, `no new shader program compiles for the flask in the hand, the fading sword or the slots (${drawn.length} drawn, ${fresh} new)`);
  await shot('02-taken');
}

// 3. At the mouth, pulled away early: cancelled. Let go: back to the slot.
{
  const hpBefore = (await state()).hp;
  await fistAt('right', await mouthFor('right'));
  await step(0.3);
  const away = await mouthFor('right');
  await fistAt('right', { x: away.x, y: away.y - 0.35, z: away.z });
  let s = await state();
  check(s.log.cancelled === 1 && s.holding.right === 1 && s.hp === hpBefore, `pulled away after 0.3 s, the drink is cancelled and the flask stays in the hand (${s.lines.at(-1)})`);
  await grip('right', 0);
  await step(0.3);
  s = await state();
  check(s.holding.right === -1 && s.flaskShown[1] && s.belt[1].count === 3, `let go, it goes back to its slot (${s.lines.at(-1)}; ${s.belt[1].count} there)`);
  check(!s.swordAway && s.swordCanHit, 'and the sword comes back, able to hit');
  await handsDown();
}

// 4. Against a camp, a drink heals 40%, and the slot drunk empty refills from the bag.
{
  // One potion on the right hip, four more in the bag.
  await page.evaluate(() => {
    const { adventure, state } = window.__descent;
    const inv = state.inventory;
    const at = adventure.player.rig.position;
    adventure.applyThings(inv.move({ in: 'belt', slot: 1 }, { in: 'bag', slot: 3 }, 2), at);
    adventure.applyThings(inv.take([{ id: 'minor-healing-potion', count: 2 }]), at);
  });
  // Walk up to the nearest bandit camp until it fights you.
  const camp = await page.evaluate(() => {
    const d = window.__descent;
    const me = d.player.rig.position;
    const camps = d.camps.camps.filter((c) => !c.plan.interior && !c.plan.road);
    camps.sort((a, b) => Math.hypot(a.plan.place.x - me.x, a.plan.place.z - me.z) - Math.hypot(b.plan.place.x - me.x, b.plan.place.z - me.z));
    const c = camps[0].plan;
    const post = c.posts[0];
    const px = post.x ?? c.place.x;
    const pz = post.z ?? c.place.z;
    const dx = me.x - px;
    const dz = me.z - pz;
    const k = 6 / Math.hypot(dx, dz);
    const x = px + dx * k;
    const z = pz + dz * k;
    d.teleport(x, z, Math.atan2(x - px, z - pz));
    return c.id;
  });
  await xrFrames(3);
  for (let i = 0; i < 20 && !(await state()).fighting; i++) await step(0.25);
  let s = await state();
  check(s.fighting, `the ${camp} camp is fighting you`);
  await page.evaluate(() => (window.__descent.player.hp = window.__descent.player.maxHp * 0.3));
  await page.evaluate(() => (window.__descent.buzzes.length = 0));
  const right = await hip(1);
  await fistAt('right', { x: right.x, y: right.y + 0.05, z: right.z }, false);
  await grip('right', 1, false);
  await fistAt('right', await mouthFor('right'), false);
  // Frame by frame at the mouth, noting health across the frame the potion is drunk.
  const drink = await page.evaluate(() => {
    const { adventure, player } = window.__descent;
    const belt = adventure.belt;
    for (let i = 0; i < 72; i++) {
      const hp = player.hp;
      const drunk = belt.log.drunk;
      adventure.update(1 / 72);
      if (belt.log.drunk > drunk) return { before: hp, after: player.hp, max: player.maxHp, t: (i + 1) / 72 };
    }
    return null;
  });
  s = await state();
  const steady = s.buzzes.filter((b) => b.hand === 'right' && b.intensity === 0.15).length;
  const gulp = s.buzzes.some((b) => b.hand === 'right' && b.intensity === 0.9);
  const rose = drink ? (drink.after - drink.before) / drink.max : 0;
  check(!!drink && Math.abs(rose - 0.4) < 0.02, `held at the mouth ${drink?.t.toFixed(2)} s in a fight, it's drunk and health rises by ${(rose * 100).toFixed(0)}% of the maximum`);
  check(steady >= 6 && gulp, `a steady buzz while drinking (${steady}) and a strong one as it's drunk`);
  check(s.holding.right === -1 && s.belt[1]?.count === 4, `the flask is gone, and the right hip refilled from the bag's stack (${JSON.stringify(s.belt[1])})`);
  await step(0.2, false);
  s = await state();
  check(!s.swordAway && s.swordCanHit, 'the sword is back in the hand, able to hit');
  await grip('right', 0, false);
  await shot('03-drunk');
}

// 5. The cooldown dims the belt for 60 s.
{
  // Out of the fight, back where you started.
  await page.evaluate(() => {
    const d = window.__descent;
    const h = d.adventure.hale.position;
    d.teleport(h.x + 6, h.z + 6, Math.atan2(6, 6));
  });
  await xrFrames(3);
  await handsDown();
  await step(1);
  let s = await state();
  check(s.cooldown > 55 && s.flaskBright[1] < 0.5, `every flask dims (${s.flaskBright[1]}), ${s.cooldown.toFixed(0)} s to go`);
  const ringBefore = await page.evaluate(() => window.__descent.adventure.belt.root.children.find((c) => c.name === 'rightHip').children[3].material.map.version);
  await page.evaluate(() => (window.__descent.buzzes.length = 0));
  const right = await hip(1);
  await fistAt('right', { x: right.x, y: right.y + 0.05, z: right.z });
  await grip('right', 1);
  s = await state();
  check(s.holding.right === -1 && s.log.refused === 1 && s.buzzes.some((b) => b.intensity >= 1), `a grip at a dimmed flask is refused with a strong buzz (${s.lines.at(-1)})`);
  await grip('right', 0);
  await handsDown();
  await step(30);
  const ringAfter = await page.evaluate(() => window.__descent.adventure.belt.root.children.find((c) => c.name === 'rightHip').children[3].material.map.version);
  s = await state();
  check(s.flaskBright[1] < 0.5 && ringAfter > ringBefore, `half-way, still dim, its ring drawn again as it drains (${s.cooldown.toFixed(0)} s left)`);
  await page.evaluate(() => window.__descent.saved());
}

// 7 (before the cooldown runs out). A reload keeps the belt and what's left of the cooldown.
{
  const before = await state();
  await enter();
  const s = await state();
  check(JSON.stringify(s.belt) === JSON.stringify(before.belt), `after a reload the belt is as it was (${JSON.stringify(s.belt)})`);
  check(Math.abs(s.cooldown - before.cooldown) < 3 && s.flaskBright[1] < 0.5, `and still dim, ${s.cooldown.toFixed(0)} s to go`);
  await step(s.cooldown + 0.5);
  const after = await state();
  check(after.cooldown === 0 && after.flaskBright[1] === 1, 'after 60 s in all, the flasks are bright again');
}

// 6. Potions from the bag onto the belt: the figure's belt slot, and the real hip.
{
  await page.evaluate(() => {
    const { adventure, state } = window.__descent;
    adventure.applyThings(state.inventory.take([{ id: 'worn-tunic', count: 1 }, { id: 'minor-healing-potion', count: 3 }]), adventure.player.rig.position);
  });
  // Open the bag: a slow reach over the right shoulder.
  const zone = await page.evaluate(() => {
    const c = window.__descent.bag.reach.centre.right;
    return { x: c.x, y: c.y, z: c.z };
  });
  await fistTo('right', zone);
  await step(0.3);
  await grip('right', 1);
  await step(0.1);
  await handsDown();
  await grip('right', 0);
  await step(0.3);
  check(await page.evaluate(() => window.__descent.bag.isOpen), 'the bag opens');
  const spot = (ref) =>
    page.evaluate((ref) => {
      const { bag, camera } = window.__descent;
      const p = bag.panel.slotWorld(ref, camera.position.clone(), 0.015);
      return { x: p.x, y: p.y, z: p.z };
    }, ref);
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
  const carry = async (from, to) => {
    const at = await spot(from);
    await fistAt('right', await outFrom(at, 0.1));
    await fistAt('right', at);
    await grip('right', 1);
    const holding = await page.evaluate(() => window.__descent.bag.holding?.id ?? null);
    for (const w of Array.isArray(to) ? to : [to]) await fistAt('right', w);
    const lit = (await state()).glow;
    await grip('right', 0);
    await step(0.2);
    return { holding, lit };
  };
  let s = await state();
  const potionSlot = s.bag.findIndex((b) => b?.id === 'minor-healing-potion');
  const tunicSlot = s.bag.findIndex((b) => b?.id === 'worn-tunic');
  const count = s.bag[potionSlot].count;
  await carry({ in: 'grid', i: potionSlot }, await spot({ in: 'belt', slot: 0 }));
  s = await state();
  check(s.belt[0]?.id === 'minor-healing-potion' && s.belt[0].count === count, `carried onto the figure's left hip slot, the potions go on the left hip (${s.bagLines.at(-1)})`);
  await shot('04-panel-belt');

  // Two more in the bag, carried off the panel down to the real left hip.
  await page.evaluate(() => {
    const { adventure, state } = window.__descent;
    adventure.applyThings(state.inventory.take([{ id: 'minor-healing-potion', count: 2 }]), adventure.player.rig.position);
  });
  await step(0.05);
  s = await state();
  const more = s.bag.findIndex((b) => b?.id === 'minor-healing-potion');
  const left = await hip(0);
  const r = await carry({ in: 'grid', i: more }, [{ x: left.x + 0.2, y: left.y + 0.3, z: left.z }, { x: left.x, y: left.y + 0.04, z: left.z }]);
  s = await state();
  check(r.lit[0] && s.belt[0]?.count === count + 2 && s.bag[more] === null, `carried off the panel down to the real left hip, it lights and they stack there (${s.bagLines.at(-1)}; ${s.belt[0]?.count})`);
  const t = await carry({ in: 'grid', i: tunicSlot }, [{ x: left.x + 0.2, y: left.y + 0.3, z: left.z }, { x: left.x, y: left.y + 0.04, z: left.z }]);
  s = await state();
  check(t.lit[0] && s.bag[tunicSlot]?.id === 'worn-tunic' && /refused/.test(s.bagLines.at(-1)), `a tunic carried to the hip is refused and stays in the bag (${s.bagLines.at(-1)})`);
  await shot('05-hip');
}

check(errors.length === 0, `no page errors (${errors.join('; ')})`);
await browser.close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
