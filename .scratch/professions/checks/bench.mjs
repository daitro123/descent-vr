// Checks for the herbalist and the alchemy bench
// (issues/16-the-herbalist-and-the-alchemy-bench.md) in headless Chromium with
// the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/professions/checks/bench.mjs [http://localhost:5173] [shots/]
//
// Oakvale at the plain URL for a new character, paused and stepped in the page
// (`step`, `teleport`); the hands moved and the grips squeezed through the
// emulated controllers, and every buzz recorded. What it checks:
//
// 1. Outdoors the herbalist isn't drawn; inside the house they are, at the
//    bench's end, in one draw call.
// 2. With Herbalism and Alchemy learned (the debug handle) and 2 Hearthleaf
//    and 2 Duskcap in the bag, stepping up to the bench hides the sword,
//    shield and fists for open hands, and the tray shows what the bag holds.
// 3. 2 Duskcap in the mortar, for a rage draught you don't know yet: the
//    pestle going in sends them back to the tray, with a strong buzz, and
//    nothing is taken.
// 4. 2 Hearthleaf: a pound and three turns of the pestle grind them, the bench
//    tips the mortar, three turns of the spoon stir the pot, and the bench
//    pours and corks a minor healing potion on the first stand: into the bag,
//    "+1 Alchemy".
// 5. With proficiency 5 and the rage draught taught by the debug handle, 2
//    Duskcap brew a rage draught on the second stand.
// 6. Stepping away gives you your sword and shield back, and both flasks fly
//    to the bag: a minor healing potion and a rage draught in it, and Alchemy
//    up by one for each brew.
// 7. One more minor healing potion, let go at the right hip, goes on the belt.
// 8. A reload keeps the potions and the proficiency; `?proto=brew` still runs.
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
/** Run the game `s` seconds, your health kept full. */
const step = (s) =>
  page.evaluate((s) => {
    const { adventure } = window.__descent;
    for (let t = 0; t < s - 1e-9; t += 1 / 72) {
      if (adventure.player.alive) adventure.player.hp = adventure.player.maxHp;
      adventure.update(1 / 72);
    }
  }, s);

/** Oakvale in VR, paused: a new character in this fresh browser, or the saved one on a reload. */
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
  });
  await xrFrames(3);
  await step(0.3);
}

/** Move a controller so that its grip lands at a world point: XR frames only, the game doesn't step. */
async function gripTo(hand, w) {
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
/** Move a hand there and let a frame of the game see it. */
async function handAt(hand, w) {
  await gripTo(hand, w);
  await step(1 / 72);
}
/** Squeeze the grip (1) or let it go (0), and let a frame of the game see it. */
async function grip(hand, value) {
  await page.evaluate(([hand, v]) => window.__descent.device.controllers[hand].updateButtonValue('squeeze', v), [hand, value]);
  await xrFrames(2);
  await step(1 / 72);
}
/** Move the held tool so its tip lands at a world point, and let a frame see it. */
async function tipAt(hand, tool, w) {
  const off = await page.evaluate(
    ([hand, tool]) => {
      const { adventure, player } = window.__descent;
      const tip = adventure.bench.tipOf(tool);
      const g = player.input.hands[hand].grip.getWorldPosition(tip.clone());
      return { x: tip.x - g.x, y: tip.y - g.y, z: tip.z - g.z };
    },
    [hand, tool],
  );
  await handAt(hand, { x: w.x - off.x, y: w.y - off.y, z: w.z - off.z });
}
const vec = (v) => ({ x: v.x, y: v.y, z: v.z });
const up = (v, dy) => ({ x: v.x, y: v.y + dy, z: v.z });

/** The bench, the bag and you, as a player would notice them. */
const state = () =>
  page.evaluate(() => {
    const d = window.__descent;
    const { adventure, player, state } = d;
    const { bench, herbalist } = adventure;
    const inv = state.inventory;
    let drawn = true;
    for (let o = herbalist.root; o; o = o.parent) if (!o.visible) drawn = false;
    let meshes = 0;
    herbalist.root.traverse((o) => o.isMesh && meshes++);
    return {
      bare: bench.bare,
      step: bench.step,
      progress: bench.progress,
      shown: bench.shown,
      sword: player.sword.model.visible,
      shield: player.shield.model.visible,
      fists: player.fists ? player.fists.left.mesh.visible && player.fists.right.mesh.visible : null,
      hands: adventure.bench.hands.left.root.visible && adventure.bench.hands.right.root.visible,
      bag: Object.fromEntries(['hearthleaf', 'duskcap', 'minor-healing-potion', 'rage-draught'].map((id) => [id, inv.count(id)])),
      belt: inv.belt.map((s) => (s ? `${s.id}×${s.count}` : null)),
      alchemy: state.professions.proficiency('alchemy'),
      herbalist: { drawn, meshes },
      buzzes: [...d.buzzes],
      interior: d.world.interior,
    };
  });

/** Stand at (lx, lz) in the bench's frame, facing (tx, tz) in it. */
async function standAtBench(lx, lz, tx = 0, tz = -0.3) {
  await page.evaluate(
    ([lx, lz, tx, tz]) => {
      const d = window.__descent;
      const { bench } = d.adventure;
      const at = bench.point(lx, 0, lz);
      const to = bench.point(tx, 0, tz);
      d.teleport(at.x, at.z, Math.atan2(-(to.x - at.x), -(to.z - at.z)));
      d.world.settle('house');
    },
    [lx, lz, tx, tz],
  );
  await xrFrames(3);
  await step(0.2);
}

/** Take a herb of `id` off the tray and let it go over the mortar. */
async function dropHerb(id, hand = 'left') {
  const at = await page.evaluate((id) => {
    const p = window.__descent.adventure.bench.grabPoint(id);
    return p && { x: p.x, y: p.y, z: p.z };
  }, id);
  if (!at) return false;
  await handAt(hand, up(at, 0.01));
  await grip(hand, 1);
  const mouth = await page.evaluate(() => {
    const p = window.__descent.adventure.bench.spots.mortar;
    return { x: p.x, y: p.y, z: p.z };
  });
  await handAt(hand, up(mouth, 0.08));
  await grip(hand, 0);
  await step(0.25);
  return true;
}

/** Take a tool from its place with `hand`. */
async function takeTool(tool, hand = 'right') {
  const at = await page.evaluate((tool) => {
    const p = window.__descent.adventure.bench.grabPoint(tool);
    return { x: p.x, y: p.y, z: p.z };
  }, tool);
  await handAt(hand, at);
  await grip(hand, 1);
}

/** Round and round with the tip of the held tool, `turns` times at radius `r`, about `centre`. */
async function circle(hand, tool, centre, turns, r) {
  const steps = 16;
  for (let i = 0; i <= turns * steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    await tipAt(hand, tool, { x: centre.x + Math.cos(a) * r, y: centre.y, z: centre.z + Math.sin(a) * r });
  }
}

/** Grind what's in the mortar: a pound first when `pound`, then turns until the bench takes over. */
async function grind(hand = 'right', pound = false) {
  const s = await page.evaluate(() => {
    const { mortarFloor } = window.__descent.adventure.bench.spots;
    return { x: mortarFloor.x, y: mortarFloor.y, z: mortarFloor.z };
  });
  await takeTool('pestle', hand);
  if (pound) {
    await tipAt(hand, 'pestle', up(s, 0.1));
    await tipAt(hand, 'pestle', up(s, 0.015));
  }
  await circle(hand, 'pestle', up(s, 0.015), 3.2, 0.025);
  await handAt(hand, up(s, 0.35));
  await grip(hand, 0);
}

/** Stir with the spoon until the bench pours. */
async function stir(hand = 'right') {
  const s = await page.evaluate(() => {
    const { pot } = window.__descent.adventure.bench.spots;
    return { x: pot.x, y: pot.y, z: pot.z };
  });
  await takeTool('spoon', hand);
  await circle(hand, 'spoon', s, 3.2, 0.05);
  await handAt(hand, up(s, 0.4));
  await grip(hand, 0);
}

/** Brew what's in the mortar end to end. */
async function brew(pound = false) {
  await grind('right', pound);
  const ground = await state();
  await step(1.4); // the bench tips the mortar
  const tipped = await state();
  await stir('right');
  const stirred = await state();
  await step(2.6); // the bench pours and corks
  return { ground, tipped, stirred, done: await state() };
}

// ---------------------------------------------------------------------------

await enter();
await page.evaluate(() => {
  const d = window.__descent;
  d.professions.learn('herbalism');
  d.professions.fill({ hearthleaf: 2, duskcap: 2 });
});

// 1. The herbalist: hidden outdoors, drawn in the house, one draw call.
let s = await state();
check(!s.herbalist.drawn, `outdoors the herbalist isn't drawn (in ${s.interior ?? 'the open'})`);
await standAtBench(0, 2.2);
s = await state();
check(s.interior === 'house' && s.herbalist.drawn, `inside the house the herbalist is drawn (in ${s.interior})`);
check(s.herbalist.meshes === 1, `the herbalist is one mesh, one draw call (${s.herbalist.meshes})`);
check(!s.bare, 'two metres back from the bench your weapons stay yours');
await shot('01-the-bench-and-the-herbalist');

// 2. Step up.
await standAtBench(0, 0.5);
s = await state();
check(s.bare && !s.sword && !s.shield && s.fists === false && s.hands, `at the bench your hands are bare (bare ${s.bare}, sword ${s.sword}, shield ${s.shield}, fists ${s.fists}, hands ${s.hands})`);
check(s.shown.tray.hearthleaf === 2 && s.shown.tray.duskcap === 2, `the tray shows what the bag holds: ${JSON.stringify(s.shown.tray)}`);
await shot('02-stepped-up');

// 3. Duskcap for a rage draught you don't know: back to the tray, nothing taken.
await dropHerb('duskcap');
await dropHerb('duskcap');
s = await state();
check(s.shown.mortar.duskcap === 2, `2 Duskcap in the mortar: ${JSON.stringify(s.shown.mortar)}`);
await page.evaluate(() => (window.__descent.buzzes = []));
await takeTool('pestle');
const mf = await page.evaluate(() => {
  const p = window.__descent.adventure.bench.spots.mortarFloor;
  return { x: p.x, y: p.y, z: p.z };
});
await tipAt('right', 'pestle', up(mf, 0.03));
await tipAt('right', 'pestle', up(mf, 0.02));
await step(0.5);
s = await state();
check(!s.shown.mortar.duskcap && s.shown.tray.duskcap === 2, `the Duskcap glide back to the tray: tray ${JSON.stringify(s.shown.tray)}, mortar ${JSON.stringify(s.shown.mortar)}`);
check(s.bag.duskcap === 2 && s.step === 'load', `nothing is taken: ${s.bag.duskcap} Duskcap in the bag, the bench at ${s.step}`);
check(s.buzzes.some((b) => b.hand === 'right' && b.intensity >= 1), 'a strong buzz in the pestle hand');
await handAt('right', up(mf, 0.35));
await grip('right', 0);

// 4. A minor healing potion.
await dropHerb('hearthleaf');
await dropHerb('hearthleaf');
let b = await brew(true);
check(b.ground.step === 'tip' && b.ground.bag.hearthleaf === 0, `grinding started the make and took the Hearthleaf (${b.ground.step}, ${b.ground.bag.hearthleaf} left)`);
check(b.tipped.step === 'stir', `the bench tipped the mortar into the pot (${b.tipped.step})`);
check(b.stirred.step === 'pour', `three turns of the spoon stirred it (${b.stirred.step})`);
s = b.done;
check(s.shown.stands[0]?.potion === 'minor-healing-potion', `a minor healing potion corked on the first stand: ${JSON.stringify(s.shown.stands)}`);
check(s.bag['minor-healing-potion'] === 1 && s.alchemy === 1, `in the bag (${s.bag['minor-healing-potion']}), Alchemy ${s.alchemy}`);
check(s.step === 'load', `the bench is ready for the next brew (${s.step})`);
await shot('03-a-minor-healing-potion');

// 5. A rage draught, with the recipe taught.
const taught = await page.evaluate(() => {
  const d = window.__descent;
  d.professions.proficiency('alchemy', 5);
  return d.professions.teach('rage-draught').map((e) => e.kind);
});
check(taught.includes('recipe'), `the debug handle teaches the rage draught (${taught.join(', ')})`);
await step(0.5);
await dropHerb('duskcap');
await dropHerb('duskcap');
b = await brew(false);
s = b.done;
check(s.shown.stands[1]?.potion === 'rage-draught', `a rage draught on the second stand: ${JSON.stringify(s.shown.stands)}`);
check(s.alchemy === 6, `Alchemy up by one (${s.alchemy})`);
await shot('04-two-on-the-stands');

// 6. Step away: weapons back, flasks to the bag.
await standAtBench(0, 2.5);
await step(0.8);
s = await state();
check(!s.bare && s.sword && s.shield && s.fists === true, `stepping away brings the sword and shield back (sword ${s.sword}, shield ${s.shield}, fists ${s.fists})`);
check(s.shown.stands.every((f) => f && f.potion === null), `both flasks left their stands: ${JSON.stringify(s.shown.stands)}`);
check(s.bag['minor-healing-potion'] === 1 && s.bag['rage-draught'] === 1, `the bag holds them: ${JSON.stringify(s.bag)}`);
check(s.alchemy === 6, `Alchemy is 6: 1 for the healing potion, set to 5, 1 for the rage draught (${s.alchemy})`);

// 7. One more, belted at the right hip.
await page.evaluate(() => window.__descent.professions.fill({ hearthleaf: 2 }));
await standAtBench(0, 0.5);
await dropHerb('hearthleaf');
await dropHerb('hearthleaf');
b = await brew(false);
const before = b.done.belt;
const flask = await page.evaluate(() => {
  const p = window.__descent.adventure.bench.grabPoint(0);
  return { x: p.x, y: p.y, z: p.z };
});
await handAt('right', flask);
await grip('right', 1);
const hip = await page.evaluate(() => {
  const p = window.__descent.adventure.bench.spots.hips[1];
  return { x: p.x, y: p.y, z: p.z };
});
await handAt('right', hip);
await grip('right', 0);
await step(0.2);
s = await state();
check(s.belt[1] === 'minor-healing-potion×4' && before[1] === 'minor-healing-potion×3', `let go at the right hip, it's on the belt: ${before[1]} to ${s.belt[1]}`);
check(s.bag['minor-healing-potion'] === 1 && s.shown.stands[0]?.potion === null, `and out of the bag and off its stand (${s.bag['minor-healing-potion']} in the bag)`);

// 8. A reload keeps it; the prototype still runs.
await standAtBench(0, 2.5);
await step(0.5);
await page.evaluate(() => window.__descent.adventure.saves.onLeaving());
await page.evaluate(() => window.__descent.saved());
await enter();
s = await state();
check(s.alchemy === 7 && s.bag['rage-draught'] === 1 && s.belt[1] === 'minor-healing-potion×4', `a reload keeps it: Alchemy ${s.alchemy}, ${JSON.stringify(s.bag)}, belt ${s.belt}`);

await page.goto(`${base}/?proto=brew&emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.station, null, { timeout: 180000 });
const proto = await page.evaluate(() => window.__descent.station.variant.key);
check(proto === 'A' || proto === 'B' || proto === 'C', `?proto=brew still runs (variant ${proto})`);

check(errors.length === 0, `no errors on the page${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
