// Checks for using what professions make
// (issues/17-using-what-professions-make.md) in headless Chromium with the
// IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/professions/checks/consumables.mjs [http://localhost:5173] [shots/]
//
// Oakvale at the plain URL for a new warrior, brought to level 2 for the War
// Cry (and so rage), paused and stepped in the page (`step`, `teleport`); the
// hands moved and the grips squeezed through the emulated controllers, and
// every buzz recorded. What it checks:
//
// 1. Against a camp, fighting you: a rage draught taken off the left hip and
//    held at the mouth is drunk, rage rises by 30 in that frame, and the belt
//    dims for the shared 60 s cooldown.
// 2. Out of the fight, the bag open: a whetstone carried in the left fist and
//    rubbed along the sword's blade sharpens it: it leaves the bag, your
//    damage is 5% more, and the whetstone's icon shows beside the belt HUD
//    with 10 minutes left, counting down to 9 a minute later.
// 3. The elixir carried from the bag to the mouth is drunk while the belt is
//    still dim: both buffs on you, 15% more damage in all.
// 4. At the alchemy bench, a minor healing potion brewed and taken off its
//    stand, held at the mouth: refused while the cooldown runs (it stays in
//    the hand), then drunk once it's over, out of the bag, healing 40%.
// 5. A reload keeps no buff; `?belt` and `?proto=brew` still run.
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
    // Stand away from Hale, facing away, so their board stays folded.
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
const up = (v, dy) => ({ x: v.x, y: v.y + dy, z: v.z });
const hip = (i) => page.evaluate((i) => {
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
const mouth = () => page.evaluate(() => {
  const { adventure, player } = window.__descent;
  const m = adventure.belt.mouth(player.camera.position.clone());
  return { x: m.x, y: m.y, z: m.z };
});
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
    const inv = state.inventory;
    const hud = adventure.hud;
    return {
      bag: inv.bag.map((s) => (s ? { id: s.id, count: s.count } : null)),
      belt: inv.belt.map((s) => (s ? `${s.id}×${s.count}` : null)),
      count: Object.fromEntries(['rage-draught', 'whetstone', 'elixir-of-the-keen-eye', 'minor-healing-potion'].map((id) => [id, inv.count(id)])),
      cooldown: inv.cooldown,
      buffs: inv.buffs.map((b) => ({ kind: b.kind, left: b.left })),
      damage: player.stats.damage,
      stateDamage: state.stats.damage,
      rage: player.rage,
      hp: player.hp,
      maxHp: player.maxHp,
      level: state.level,
      fighting: adventure.camps.fighting,
      bagOpen: d.bag.isOpen,
      holding: d.bag.holding?.id ?? null,
      icons: { shown: hud.buffPanel.visible, key: hud.lastBuffs, status: hud.status.buffs.map((b) => b.kind) },
      beltLines: [...adventure.belt.lines],
      bagLines: [...d.bag.lines],
      buzzes: [...d.buzzes],
    };
  });

await enter();

// A warrior at level 2, for the War Cry and so rage, with what professions make in the bag.
await page.evaluate(() => {
  const d = window.__descent;
  const { adventure, state } = d;
  const at = adventure.player.rig.position.clone();
  for (let i = 0; i < 50 && state.level < 2; i++) adventure.apply({ kind: 'kill', camp: null, level: 2, role: 'leader', family: 'bandit', seed: i + 1 }, at);
  const inv = state.inventory;
  adventure.applyThings(inv.take([
    { id: 'rage-draught', count: 2 },
    { id: 'whetstone', count: 1 },
    { id: 'elixir-of-the-keen-eye', count: 1 },
  ]), at);
  const from = inv.bag.findIndex((s) => s?.id === 'rage-draught');
  adventure.applyThings(inv.move({ in: 'bag', slot: from }, { in: 'belt', slot: 0 }, 1), at);
  // Nothing lying about from the kills.
  adventure.drops.clear?.();
});
await step(0.2);
let s = await state();
check(s.level >= 2 && s.belt[0] === 'rage-draught×1', `a level ${s.level} warrior with a rage draught on the left hip (${JSON.stringify(s.belt)})`);

// 1. A rage draught against a camp.
{
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
  s = await state();
  check(s.fighting, `the ${camp} camp is fighting you`);
  await page.evaluate(() => (window.__descent.player.rage = 5));
  const left = await hip(0);
  await fistAt('left', up(left, 0.05));
  await grip('left', 1);
  s = await state();
  check(/took: Rage Draught from leftHip/.test(s.beltLines.at(-1)), `the left hand takes the rage draught off the left hip (${s.beltLines.at(-1)})`);
  await fistAt('left', await mouthFor('left'));
  const drink = await page.evaluate(() => {
    const { adventure, player } = window.__descent;
    const belt = adventure.belt;
    for (let i = 0; i < 72; i++) {
      player.hp = player.maxHp;
      const rage = player.rage;
      const drunk = belt.log.drunk;
      adventure.update(1 / 72);
      if (belt.log.drunk > drunk) return { before: rage, after: player.rage, t: (i + 1) / 72 };
    }
    return null;
  });
  s = await state();
  check(!!drink && Math.abs(drink.after - drink.before - 30) < 1, `held at the mouth ${drink?.t.toFixed(2)} s in the fight, it's drunk: rage ${drink?.before.toFixed(1)} to ${drink?.after.toFixed(1)}`);
  check(s.cooldown > 59 && s.belt[0] === 'rage-draught×1', `the belt dims for 60 s (${s.cooldown.toFixed(1)} s), and the left hip refills from the bag (${s.belt[0]})`);
  await grip('left', 0);
  await shot('01-rage-draught');
}

// Out of the fight, back where you started, the bag open (a slow reach over the right shoulder).
await page.evaluate(() => {
  const d = window.__descent;
  const h = d.adventure.hale.position;
  d.teleport(h.x + 6, h.z + 6, Math.atan2(6, 6));
});
await xrFrames(3);
await handsDown();
await step(1);
const openBag = async () => {
  const zone = await page.evaluate(() => vec3(window.__descent.bag.reach.centre.right));
  await fistTo('right', zone);
  await step(0.3);
  await grip('right', 1);
  await step(0.1);
  await handsDown();
  await grip('right', 0);
  await step(0.3);
};
await page.evaluate(() => (window.vec3 = (v) => ({ x: v.x, y: v.y, z: v.z })));
await openBag();
check((await state()).bagOpen, 'the bag opens');
const spot = (i) =>
  page.evaluate((i) => {
    const { bag, camera } = window.__descent;
    const p = bag.panel.slotWorld({ in: 'grid', i }, camera.position.clone(), 0.015);
    return { x: p.x, y: p.y, z: p.z };
  }, i);
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
/** Pick up bag slot `i` with the left fist. */
const pickUp = async (i) => {
  const at = await spot(i);
  await fistAt('left', await outFrom(at, 0.1));
  await fistAt('left', at);
  await grip('left', 1);
  return (await state()).holding;
};

// 2. The whetstone rubbed along the sword.
{
  s = await state();
  const before = s.damage;
  const slot = s.bag.findIndex((b) => b?.id === 'whetstone');
  const held = await pickUp(slot);
  check(held === 'whetstone', `the left fist carries the whetstone off the panel (${held})`);
  // The sword held still, pointing out to your right, clear of the panel.
  await page.evaluate(() => window.__descent.device.controllers.right.quaternion.set(0, -0.7071, 0, 0.7071));
  const swordAt = await page.evaluate(() => {
    const d = window.__descent;
    const p = d.player.rig.localToWorld(d.player.rig.position.clone().set(0.3, 1.0, -0.2));
    return { x: p.x, y: p.y, z: p.z };
  });
  await fistAt('right', swordAt);
  await step(0.5);
  const blade = await page.evaluate(() => {
    const { player } = window.__descent;
    const a = player.camera.position.clone();
    const b = a.clone();
    player.sword.segment(player.rig, a, b);
    return { base: { x: a.x, y: a.y, z: a.z }, tip: { x: b.x, y: b.y, z: b.z } };
  });
  const along = (t) => ({ x: blade.base.x + (blade.tip.x - blade.base.x) * t, y: blade.base.y + (blade.tip.y - blade.base.y) * t, z: blade.base.z + (blade.tip.z - blade.base.z) * t });
  await page.evaluate(() => (window.__descent.buzzes.length = 0));
  // Back and forth along the middle of the blade, a frame a step, until it's done.
  let strokes = 0;
  for (let pass = 0; pass < 6 && (await state()).holding; pass++) {
    strokes++;
    for (let k = 0; k <= 10; k++) {
      const t = pass % 2 ? 0.65 - k * 0.03 : 0.35 + k * 0.03;
      await fistAt('left', along(t));
      if (!(await state()).holding) break;
    }
  }
  s = await state();
  const scrapes = s.buzzes.filter((b) => b.intensity === 0.35).length;
  check(/sharpened: Whetstone/.test(s.bagLines.at(-1)) && s.count.whetstone === 0, `rubbed along the blade over ${strokes} strokes, it sharpens it and leaves the bag (${s.bagLines.at(-1)})`);
  check(scrapes >= 3 && s.buzzes.some((b) => b.intensity === 0.8), `a scrape's buzz in both hands as it goes (${scrapes}), and a stronger one at the end`);
  check(Math.abs(s.damage / before - 1.05) < 1e-6, `your damage is 5% more: ×${before.toFixed(3)} to ×${s.damage.toFixed(3)}`);
  check(s.buffs.length === 1 && s.buffs[0].kind === 'whetstone' && s.buffs[0].left > 599, `the whetstone's buff is on you, 10 minutes (${JSON.stringify(s.buffs)})`);
  await step(0.1);
  s = await state();
  check(s.icons.shown && s.icons.key === 'whetstone10', `its icon shows beside the belt HUD with 10 minutes left (${s.icons.key})`);
  await page.evaluate(() => window.__descent.device.quaternion.set(-0.5, 0, 0, 0.866));
  await xrFrames(4);
  await shot('02-whetstone-icon');
  await page.evaluate(() => window.__descent.device.quaternion.set(0, 0, 0, 1));
  await xrFrames(4);
  await grip('left', 0);
  await page.evaluate(() => window.__descent.device.controllers.right.quaternion.set(0, 0, 0, 1));
  await handsDown();
  await step(60.5);
  s = await state();
  check(s.icons.key === 'whetstone9' && Math.abs(s.buffs[0].left - 539) < 1, `a minute later it counts down to 9 (${s.icons.key}, ${s.buffs[0].left.toFixed(0)} s left)`);
}

// 3. The elixir from the bag, drunk at the mouth while the belt is dim.
{
  // A healing potion off the right hip dims the belt again.
  await page.evaluate(() => {
    const { adventure, state } = window.__descent;
    adventure.applyThings(state.inventory.drink(1), adventure.player.rig.position);
  });
  if (!(await state()).bagOpen) await openBag();
  s = await state();
  const plain = s.damage / 1.05;
  const slot = s.bag.findIndex((b) => b?.id === 'elixir-of-the-keen-eye');
  const held = await pickUp(slot);
  check(held === 'elixir-of-the-keen-eye' && s.cooldown > 50, `the left fist carries the elixir off the panel, the belt dim (${s.cooldown.toFixed(0)} s)`);
  const m = await mouth();
  await fistAt('left', m);
  await step(1);
  s = await state();
  check(/drank: Elixir of the Keen Eye/.test(s.bagLines.at(-1)) && s.count['elixir-of-the-keen-eye'] === 0, `held at the mouth it's drunk, and out of the bag (${s.bagLines.at(-1)})`);
  check(s.buffs.map((b) => b.kind).join() === 'whetstone,elixir' && Math.abs(s.damage / plain - 1.15) < 1e-6, `both buffs on you: 15% more damage in all (×${(s.damage / plain).toFixed(3)})`);
  await step(0.1);
  s = await state();
  check(s.icons.key === 'whetstone9:elixir5', `two icons beside the belt HUD (${s.icons.key})`);
  await grip('left', 0);
  await handsDown();
}

// 4. At the bench: a potion off its stand, refused while the cooldown runs, then drunk.
{
  await page.evaluate(() => window.__descent.bag.close('the check'));
  await page.evaluate(() => {
    const d = window.__descent;
    d.professions.learn('herbalism');
    d.professions.fill({ hearthleaf: 2 });
  });
  const handAt = async (hand, w) => fistAt(hand, w);
  const tipAt = async (hand, tool, w) => {
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
  };
  const standAtBench = async (lx, lz, tx = 0, tz = -0.3) => {
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
  };
  const dropHerb = async (id, hand = 'left') => {
    const at = await page.evaluate((id) => {
      const p = window.__descent.adventure.bench.grabPoint(id);
      return p && { x: p.x, y: p.y, z: p.z };
    }, id);
    await handAt(hand, up(at, 0.01));
    await grip(hand, 1);
    const mouthAt = await page.evaluate(() => vec3(window.__descent.adventure.bench.spots.mortar));
    await handAt(hand, up(mouthAt, 0.08));
    await grip(hand, 0);
    await step(0.25);
  };
  const takeTool = async (tool, hand = 'right') => {
    const at = await page.evaluate((tool) => vec3(window.__descent.adventure.bench.grabPoint(tool)), tool);
    await handAt(hand, at);
    await grip(hand, 1);
  };
  const circle = async (hand, tool, centre, turns, r) => {
    for (let i = 0; i <= turns * 16; i++) {
      const a = (i / 16) * 2 * Math.PI;
      await tipAt(hand, tool, { x: centre.x + Math.cos(a) * r, y: centre.y, z: centre.z + Math.sin(a) * r });
    }
  };
  await standAtBench(0, 0.5);
  await dropHerb('hearthleaf');
  await dropHerb('hearthleaf');
  const floor = await page.evaluate(() => vec3(window.__descent.adventure.bench.spots.mortarFloor));
  await takeTool('pestle');
  await tipAt('right', 'pestle', up(floor, 0.1));
  await tipAt('right', 'pestle', up(floor, 0.015));
  await circle('right', 'pestle', up(floor, 0.015), 3.2, 0.025);
  await handAt('right', up(floor, 0.35));
  await grip('right', 0);
  await step(1.4);
  const pot = await page.evaluate(() => vec3(window.__descent.adventure.bench.spots.pot));
  await takeTool('spoon');
  await circle('right', 'spoon', pot, 3.2, 0.05);
  await handAt('right', up(pot, 0.4));
  await grip('right', 0);
  await step(2.6);
  s = await state();
  const stands = await page.evaluate(() => window.__descent.adventure.bench.shown.stands);
  check(stands[0]?.potion === 'minor-healing-potion', `a minor healing potion corked on the first stand (${JSON.stringify(stands)})`);
  // Dim again, so the first try is refused.
  await page.evaluate(() => {
    const inv = window.__descent.state.inventory;
    inv.tick(60);
    inv.drink(1);
  });
  const potions = (await state()).count['minor-healing-potion'];
  const flaskAt = await page.evaluate(() => vec3(window.__descent.adventure.bench.grabPoint(0)));
  await handAt('right', flaskAt);
  await grip('right', 1);
  /** Where the fist must be for the held flask's mouth to sit at yours. */
  const flaskToMouth = () =>
    page.evaluate(() => {
      const { adventure, player } = window.__descent;
      const bench = adventure.bench;
      const f = bench.held.right;
      const m = adventure.belt.mouth(player.camera.position.clone());
      const fm = bench.mouthOf(f, m.clone());
      const g = player.input.hands.right.grip.getWorldPosition(m.clone());
      return { x: m.x - (fm.x - g.x), y: m.y - (fm.y - g.y), z: m.z - (fm.z - g.z) };
    });
  await handAt('right', await flaskToMouth());
  await page.evaluate(() => (window.__descent.buzzes.length = 0));
  await step(1);
  s = await state();
  let held = await page.evaluate(() => window.__descent.adventure.bench.held.right?.kind ?? null);
  check(held === 'flask' && s.count['minor-healing-potion'] === potions && s.buzzes.some((b) => b.intensity >= 1), `held at the mouth while the belt is dim, it's refused with a strong buzz and stays in the hand (${held}, ${s.count['minor-healing-potion']} in the bag)`);
  // Kept at the mouth it isn't tried again; taken away and brought back once the cooldown is over, it is.
  await step(1);
  s = await state();
  check(s.count['minor-healing-potion'] === potions, `kept there, it isn't tried again (${s.count['minor-healing-potion']} in the bag)`);
  const m = await mouth();
  await handAt('right', up(m, -0.4));
  await page.evaluate(() => window.__descent.state.inventory.tick(60));
  await page.evaluate(() => (window.__descent.player.hp = window.__descent.player.maxHp * 0.3));
  await fistAt('right', await flaskToMouth(), false);
  const drank = await page.evaluate(() => {
    const { adventure, player } = window.__descent;
    for (let i = 0; i < 144; i++) {
      const hp = player.hp;
      adventure.update(1 / 72);
      if (player.hp > hp + 1) return { rose: (player.hp - hp) / player.maxHp, t: (i + 1) / 72 };
    }
    return null;
  });
  s = await state();
  held = await page.evaluate(() => window.__descent.adventure.bench.held.right?.kind ?? null);
  check(!!drank && Math.abs(drank.rose - 0.4) < 0.02 && held === null, `after the cooldown, held there ${drank?.t.toFixed(2)} s it's drunk, healing ${(100 * (drank?.rose ?? 0)).toFixed(0)}%`);
  check(s.count['minor-healing-potion'] === potions - 1 && s.cooldown > 59, `out of the bag (${potions} to ${s.count['minor-healing-potion']}), and on the shared cooldown (${s.cooldown.toFixed(0)} s)`);
  const after = await page.evaluate(() => window.__descent.adventure.bench.shown.stands);
  check(after[0]?.potion === null, `and off its stand (${JSON.stringify(after)})`);
  await grip('right', 0);
  await shot('03-drunk-off-the-stand');
  await standAtBench(0, 2.5);
  await step(0.5);
}

// 5. A reload keeps no buff; the prototypes still run.
{
  await page.evaluate(() => window.__descent.adventure.saves.onLeaving());
  await page.evaluate(() => window.__descent.saved());
  await enter();
  s = await state();
  check(s.buffs.length === 0 && !s.icons.shown, `a reload keeps no buff (${JSON.stringify(s.buffs)})`);
  await page.goto(`${base}/?belt&emulate&nodevui`);
  await page.waitForFunction(() => window.__descent, null, { timeout: 180000 });
  check(true, '?belt still loads');
  await page.goto(`${base}/?proto=brew&emulate&nodevui`);
  await page.waitForFunction(() => window.__descent?.station, null, { timeout: 180000 });
  const proto = await page.evaluate(() => window.__descent.station.variant.key);
  check(['A', 'B', 'C'].includes(proto), `?proto=brew still runs (variant ${proto})`);
}

check(errors.length === 0, `no page errors (${errors.slice(0, 3).join('; ')})`);
await browser.close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
