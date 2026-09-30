// Checks for the ranger and mage in the inventory (issues/16-the-ranger-and-mage-in-the-inventory.md)
// in headless Chromium with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/inventory/checks/classes.mjs [http://localhost:5173] [shots/]
//
// For a ranger, then a mage, each a first visit's character made on the page
// before VR as a player would make one. Oakvale is paused and stepped in the
// page (`step`, `teleport`); kills and Accept go straight into the Adventure,
// as the world and the board's buttons send them. What it checks, per class:
//
// 1. "Make" plays a level 1 ranger (mage) in their kit: the Short Bow and
//    Quiver (the Apprentice's Wand and Glass Focus), the worn tunic and
//    boots, three potions on the right hip. The left hand holds the short
//    bow (the right the wand, with its bolt 0.32 m out).
// 2. A farm bandit falls with a seed whose roll drops a weapon of their class
//    (the roll is the game's own, `rollLoot`, found in the page); walking over
//    the drop takes it into the bag. Worn from the bag, the hand draws it:
//    the Ash Longbow's look and longer limbs (the Birch Wand's look). The
//    smith's white weapon for the other class, taken into the bag, is refused
//    with "class" and the kit stays worn.
// 3. Raiders in the Fields: the board offers the Farmstead Gloves and
//    Hedgerow Boots carrying Agility (Intellect); the gloves carried off the
//    board with the right fist into bag slot 4 hand the quest in.
// 4. What Lies Below: the board offers Hale's Old Hunting Bow (the
//    Crypt-Warded Staff) beside the Warden's Mantle, never the longsword.
//    Carried into the bag and worn at level 5 (a few kills past the quests), the hand draws Hale's own look
//    (the staff, its bolt 0.75 m out), and Hale's sword stays at their hip.
// 5. No page errors.
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

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};

const KIT = {
  ranger: { main: 'short-bow', off: 'quiver', attribute: 'Agility', pick: 'hale-hunting-bow', look: 'hunting-bow', other: 'birch-wand-1' },
  mage: { main: 'apprentice-wand', off: 'glass-focus', attribute: 'Intellect', pick: 'crypt-warded-staff', look: 'crypt-staff', other: 'ash-longbow-1' },
};

for (const klass of ['ranger', 'mage']) {
  console.log(`\n— the ${klass} —`);
  const kit = KIT[klass];
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/WebGL|GPU stall/.test(m.text()) && errors.push(m.text()));
  await page.addInitScript(() => {
    const P = CanvasRenderingContext2D.prototype;
    const fill = P.fillText;
    const clear = P.clearRect;
    P.fillText = function (text, ...rest) {
      (this.__texts ??= []).push({ text: String(text), color: String(this.fillStyle) });
      return fill.call(this, text, ...rest);
    };
    P.clearRect = function (...args) {
      this.__texts = [];
      return clear.apply(this, args);
    };
  });
  const shot = async (name) => shots && page.screenshot({ path: `${shots}/${klass}-${name}.png` });
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
  /** Events straight into the Adventure, at `at` or Hale. */
  const apply = (events, at = null) =>
    page.evaluate(
      ([events, at]) => {
        const { adventure } = window.__descent;
        const where = at ? adventure.hale.position.clone().set(at.x, at.y, at.z) : adventure.hale.position;
        for (const e of events) adventure.apply(e, where);
      },
      [events, at],
    );
  /** Move items as the bag would, and show what it did. */
  const move = (from, to) =>
    page.evaluate(
      ([from, to]) => {
        const { adventure, state } = window.__descent;
        const effects = state.inventory.move(from, to);
        adventure.applyThings(effects, adventure.player.rig.position);
        return effects.filter((e) => e.kind === 'refused').map((e) => e.reason);
      },
      [from, to],
    );
  /** What a player would notice of their hands and things. */
  const seen = () =>
    page.evaluate(() => {
      const { adventure, state } = window.__descent;
      const bow = adventure.combat.ranger?.bow;
      const mage = adventure.mage;
      return {
        class: state.class,
        level: state.level,
        gear: { ...state.inventory.gear },
        belt: state.inventory.belt.map((s) => (s ? `${s.id}×${s.count}` : null)),
        bag: state.inventory.bag.map((s) => s?.id ?? null),
        bow: bow ? { shown: bow.root.visible, limb: bow.topTip.distanceTo(bow.grip), model: Object.entries(window.__looks.BOW_LOOKS).find(([, l]) => JSON.stringify(l) === JSON.stringify(bow.look))?.[0] ?? null } : null,
        wand: mage ? { model: mage.wandLook, tip: -mage.tip.z, shown: !!mage.wand?.parent } : null,
        stages: Object.fromEntries(Object.entries(state.snapshot().quests).map(([k, q]) => [k, q.stage])),
        swordAtHip: adventure.hale.swordAtHip,
      };
    });

  async function enterVR() {
    await page.click('#VRButton');
    await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
    await xrFrames(3);
    await page.evaluate(async () => {
      const d = window.__descent;
      d.paused = true;
      d.device.controllers.left.position.set(-0.4, 0.3, 0.2);
      d.device.controllers.right.position.set(0.4, 0.3, 0.2);
      window.__looks = await import('/src/player/bow.ts');
      window.__loot = await import('/src/loot.ts');
      window.__items = await import('/src/items.ts');
    });
    await xrFrames(2);
    await step(0.1);
  }
  async function standBy(d) {
    await page.evaluate((d) => {
      const w = window.__descent;
      const h = w.adventure.hale.position;
      const start = w.world.zoneAt(0, 0).spawn;
      const k = d / Math.hypot(start.x - h.x, start.z - h.z);
      const [x, z] = [h.x + (start.x - h.x) * k, h.z + (start.z - h.z) * k];
      w.teleport(x, z, Math.atan2(-(h.x - x), -(h.z - z)));
    }, d);
    await xrFrames(2);
    await step(0.6);
  }
  async function walkOff() {
    await standBy(6);
    await step(0.3);
  }
  async function fistAt(hand, w) {
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
    await step(1 / 72);
  }
  async function grip(hand, value) {
    await page.evaluate(([hand, v]) => window.__descent.device.controllers[hand].updateButtonValue('squeeze', v), [hand, value]);
    await xrFrames(2);
    await step(1 / 72);
  }
  async function handsDown() {
    await page.evaluate(() => {
      const d = window.__descent;
      d.device.controllers.left.position.set(-0.4, 0.3, 0.2);
      d.device.controllers.right.position.set(0.4, 0.3, 0.2);
    });
    await xrFrames(2);
    await step(1 / 72);
  }
  const pickAt = (i, off = 0.02) =>
    page.evaluate(
      ([i, off]) => {
        const { board } = window.__descent.adventure;
        board.root.updateMatrixWorld(true);
        const p = board.pickSlots[i].frame.localToWorld(board.root.position.clone().set(0, 0, 0.01 + off));
        return { x: p.x, y: p.y, z: p.z };
      },
      [i, off],
    );
  const slotAt = (i) =>
    page.evaluate((i) => {
      const { bag, camera } = window.__descent;
      const p = bag.panel.slotWorld({ in: 'grid', i }, camera.position.clone(), 0.015);
      return { x: p.x, y: p.y, z: p.z };
    }, i);
  /** Carry pick `i` off Hale's board into bag slot `slot` with the right fist. */
  async function carryPick(i, slot) {
    await fistAt('right', await pickAt(i, 0.1));
    await fistAt('right', await pickAt(i));
    await grip('right', 1);
    await fistAt('right', await slotAt(slot));
    await step(0.1);
    await grip('right', 0);
    await step(0.3);
    await handsDown();
    await page.evaluate(() => window.__descent.bag.close('check'));
  }
  const board = () =>
    page.evaluate(() => {
      const { board } = window.__descent.adventure;
      return board.pickSlots.map((p) => ({ id: p.id, card: (p.card.ctx.__texts ?? []).map((t) => t.text) }));
    });

  // 1. A first visit: make the character on the page.
  await page.goto(`${base}/?emulate&nodevui`);
  await page.waitForSelector('#first-character', { timeout: 180000 });
  await page.check(`#first-character input[value=${klass}]`);
  await page.fill('#first-character input[name=name]', klass === 'ranger' ? 'Wren' : 'Ember');
  await Promise.all([page.waitForEvent('load', { timeout: 60000 }), page.click('#first-character button[value=make]')]);
  await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 180000 });
  await enterVR();
  {
    const s = await seen();
    check(s.class === klass && s.level === 1, `"Make" plays a level ${s.level} ${s.class}`);
    check(s.gear.mainHand === kit.main && s.gear.offHand === kit.off, `in their kit: ${s.gear.mainHand} and ${s.gear.offHand}`);
    check(s.gear.chest === 'worn-tunic' && s.gear.feet === 'worn-boots' && s.belt[1] === 'minor-healing-potion×3', `with the worn tunic and boots, and three potions on the right hip (${s.belt.join()})`);
    if (klass === 'ranger') check(s.bow?.shown && s.bow.model === 'short-bow', `the left hand holds the short bow (${JSON.stringify(s.bow)})`);
    else check(s.wand?.model === 'wand' && Math.abs(s.wand.tip - 0.32) < 1e-6, `the right hand holds the wand, its bolt 0.32 m out (${JSON.stringify(s.wand)})`);
    await shot('01-kit');
  }

  // 2. A dropped weapon of theirs, taken and worn.
  await apply([{ kind: 'accept' }]);
  const at = await page.evaluate(() => {
    const { player } = window.__descent.adventure;
    const p = player.rig.position;
    return { x: p.x + 1.5, y: p.y, z: p.z - 1.5 };
  });
  const found = await page.evaluate((klass) => {
    const { rollLoot, seeded } = window.__loot;
    const { itemOf } = window.__items;
    for (let seed = 1; seed < 20000; seed++) {
      const loot = rollLoot({ role: 'ordinary', level: 1, family: 'bandit' }, klass, seeded(seed));
      const weapon = loot.items.map(itemOf).find((i) => i.kind === 'gear' && i.slot === 'mainHand' && i.rarity === 'white');
      if (weapon) return { seed, id: weapon.id, name: weapon.name, class: weapon.class };
    }
    return null;
  }, klass);
  check(found?.class === klass, `a farm bandit's roll for a ${klass} can drop their weapon: ${found?.name} (seed ${found?.seed})`);
  await apply([{ kind: 'kill', camp: 'farm', level: 1, role: 'ordinary', family: 'bandit', seed: found.seed }], at);
  {
    const lying = await page.evaluate(() => window.__descent.adventure.drops.pieces.map((p) => ({ item: p.item, at: { x: p.at.x, z: p.at.z } })));
    const piece = lying.find((p) => p.item === found.id);
    check(!!piece, `it falls with the bandit (${lying.map((p) => p.item ?? 'pouch').join(', ')})`);
    await page.evaluate(([x, z]) => window.__descent.teleport(x, z, 0), [piece.at.x, piece.at.z]);
    await xrFrames(2);
    await step(0.2);
    let s = await seen();
    const slot = s.bag.indexOf(found.id);
    check(slot >= 0, `walking over it takes it into the bag (slot ${slot + 1})`);
    const refused = await move({ in: 'bag', slot }, { in: 'gear', slot: 'mainHand' });
    await step(0.1);
    s = await seen();
    check(refused.length === 0 && s.gear.mainHand === found.id && s.bag[slot] === kit.main, `worn from the bag, the kit's weapon goes back where it lay`);
    if (klass === 'ranger') {
      check(s.bow?.shown && s.bow.model === 'ash-bow' && s.bow.limb > 0.66 * 1.05, `the left hand draws the Ash Longbow, its limbs longer (${JSON.stringify(s.bow)})`);
    } else {
      check(s.wand?.model === 'birch-wand' && s.wand.tip < 0.5, `the right hand draws the Birch Wand (${JSON.stringify(s.wand)})`);
    }
    await shot('02-worn');
    // Another class's weapon, from the smith, is refused.
    await page.evaluate((id) => {
      const { adventure, state } = window.__descent;
      adventure.applyThings(state.inventory.take([{ id, count: 1 }]), adventure.player.rig.position);
    }, kit.other);
    s = await seen();
    const other = s.bag.indexOf(kit.other);
    const no = await move({ in: 'bag', slot: other }, { in: 'gear', slot: 'mainHand' });
    s = await seen();
    check(no.join() === 'class' && s.gear.mainHand === found.id, `another class's ${kit.other} is refused with "${no.join()}", and theirs stays worn`);
    // Put the kit back, and clear the bag for the picks.
    await move({ in: 'bag', slot }, { in: 'gear', slot: 'mainHand' });
    await page.evaluate(() => {
      const { adventure, state } = window.__descent;
      state.inventory.bag.forEach((s, i) => s && adventure.applyThings(state.inventory.move({ in: 'bag', slot: i }, { in: 'ground' }), adventure.player.rig.position));
      adventure.drops.clear();
    });
    s = await seen();
    check(s.gear.mainHand === kit.main && s.bag.every((x) => x === null), `the kit's weapon back in hand, and the bag empty`);
  }

  // 3. Raiders in the Fields.
  await apply(Array(2).fill({ kind: 'kill', camp: 'farm', level: 1, role: 'ordinary', family: 'bandit', seed: 1 }));
  await page.evaluate(() => window.__descent.adventure.drops.clear());
  await standBy(1.3);
  {
    const b = await board();
    const main = klass === 'ranger' ? 'agility' : 'intellect';
    check(b.map((p) => p.id).join() === `farmstead-gloves-${main},hedgerow-boots-${main}`, `the board offers the Farmstead Gloves or Hedgerow Boots for a ${klass} (${b.map((p) => p.id).join(', ')})`);
    check(b[0].card.join(' ').includes(kit.attribute), `the gloves' card says ${kit.attribute} (${b[0].card.join(' | ')})`);
    await shot('03-raiders');
    await carryPick(0, 3);
    const s = await seen();
    check(s.stages.raiders === 'handedIn' && s.bag[3] === `farmstead-gloves-${main}`, `carried into bag slot 4, the gloves hand in Raiders in the Fields (level ${s.level})`);
  }

  // 4. What Lies Below.
  await apply([{ kind: 'accept' }]);
  await page.evaluate(() => {
    const { adventure } = window.__descent;
    for (let i = 0; i < 5; i++) adventure.apply({ kind: 'kill', camp: 'lumberCamp', level: 2, role: i === 4 ? 'leader' : 'ordinary', family: 'bandit', seed: i }, adventure.hale.position);
    adventure.apply({ kind: 'pickup', item: 'orders' }, adventure.hale.position);
  });
  await walkOff();
  await standBy(1.3);
  await carryPick(0, 4);
  await apply([{ kind: 'accept' }, { kind: 'kill', camp: null, level: 5, role: 'warden', family: 'undead', seed: 1 }]);
  await page.evaluate(() => window.__descent.adventure.drops.clear());
  await walkOff();
  await standBy(1.3);
  {
    const b = await board();
    check(b.map((p) => p.id).join() === `${kit.pick},wardens-mantle-${klass === 'ranger' ? 'agility' : 'intellect'}`, `What Lies Below offers ${b.map((p) => p.id).join(' or ')}`);
    await shot('04-below');
    await carryPick(0, 5);
    let s = await seen();
    check(s.stages.below === 'handedIn' && s.bag[5] === kit.pick, `${kit.pick} is carried into the bag (level ${s.level})`);
    check(s.swordAtHip, `and Hale's sword stays at their hip`);
    // The quests alone leave you short of level 5; a few more kills in the mine get you there.
    const level = await page.evaluate(() => {
      const { adventure, state } = window.__descent;
      for (let i = 0; i < 200 && state.level < 5; i++) adventure.apply({ kind: 'kill', camp: null, level: 5, role: 'ordinary', family: 'undead', seed: i }, adventure.hale.position);
      adventure.drops.clear();
      return state.level;
    });
    check(level === 5, `a few more kills and they're level ${level}`);
    const no = await move({ in: 'bag', slot: 5 }, { in: 'gear', slot: 'mainHand' });
    await step(0.1);
    s = await seen();
    check(no.length === 0 && s.gear.mainHand === kit.pick, `worn at level ${s.level} (${no.join() || 'not refused'})`);
    if (klass === 'ranger') check(s.bow?.shown && s.bow.model === 'hunting-bow' && s.bow.limb > 0.66 * 1.1, `the left hand draws Hale's Old Hunting Bow (${JSON.stringify(s.bow)})`);
    else check(s.wand?.model === 'crypt-staff' && Math.abs(s.wand.tip - 0.75) < 1e-6, `the right hand draws the Crypt-Warded Staff, its bolt 0.75 m out (${JSON.stringify(s.wand)})`);
    await page.evaluate(() => window.__descent.device.controllers.left.position.set(-0.25, 1.2, -0.35));
    await page.evaluate(() => window.__descent.device.controllers.right.position.set(0.2, 1.2, -0.4));
    await xrFrames(3);
    await step(1 / 72);
    await shot('05-hales');
  }

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  await context.close();
}

await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
