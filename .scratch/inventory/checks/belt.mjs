// Checks for the belt prototype (issues/04-the-belt-and-drinking-a-potion.md)
// in headless Chromium with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/inventory/checks/belt.mjs [http://localhost:5173] [shots/]
//
// `?belt=a&calm`, paused and stepped by `__descent.step`, the drain off so
// health moves only by drinking; the controllers moved and squeezed through
// the emulator. Every buzz the prototype asks for is recorded. For each way to
// take a potion (a: the weapon fades, b: the weapon to the hip, c: no hand-off):
//
// 1. A hand near a slot makes it glow, with one tick.
// 2. Taking a potion: by the grip (a, b), the weapon leaving that hand so it
//    can't hit or block, faded out (a) or hung at the hip (b); by a touch (c),
//    the weapon staying in the hand. The slot's count drops by the one taken.
// 3. At the mouth and pulled away early: the drink is cancelled, health is
//    unchanged and the potion stays in the hand.
// 4. Held at the mouth for 0.7 s: a steady light buzz, then a strong one,
//    and health rises by 40% of your maximum. The flask is gone, the weapon
//    comes back and the slot refills from its stack.
// 5. Let go (a, b), or left waiting (c), the potion goes back to its slot.
//
// Then: the drain eats health down to its floor, and `?belt` fights duelists.
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
const step = (s, dt = 1 / 72) => page.evaluate(([s, dt]) => window.__descent.step(s, dt), [s, dt]);

/** Where a controller must be for its grip to land on `at` (world, the rig at the origin facing −Z). */
const gripOffset = {};
async function handTo(hand, at) {
  await page.evaluate(
    ([hand, at, off]) => window.__descent.device.controllers[hand].position.set(at[0] - off[0], at[1] - off[1], at[2] - off[2]),
    [hand, at, gripOffset[hand]],
  );
  await xrFrames(2);
  await step(1 / 72);
}
async function squeeze(hand, value) {
  await page.evaluate(([hand, value]) => window.__descent.device.controllers[hand].updateButtonValue('squeeze', value), [hand, value]);
  await xrFrames(2);
  await step(1 / 72);
}
/** Pitch the head `deg` below level: down at the hips to reach for a slot, near level to drink. */
async function look(deg) {
  await page.evaluate((a) => window.__descent.device.quaternion.set(Math.sin(a / 2), 0, 0, Math.cos(a / 2)), (-deg * Math.PI) / 180);
  await xrFrames(2);
  await step(1 / 72);
}
/** A hand's rest, down at your side and out of the way. */
const rest = (hand) => [hand === 'left' ? -0.42 : 0.42, 1.05, 0.15];

/** The belt, the hand and the weapon, as the check reads them. */
const state = (hand, slotIndex) =>
  page.evaluate(
    ([hand, i]) => {
      const { belt, player } = window.__descent;
      const V = player.rig.position.constructor;
      const slot = belt.slots[i];
      const h = belt.hands[hand];
      const grip = player.input.hands[hand].grip;
      const weapon = hand === 'right' ? player.sword.model : player.shield.model;
      const v = (p) => [p.x, p.y, p.z];
      return {
        slot: v(slot.root.position),
        mouth: v(belt.mouth(new V())),
        count: slot.count,
        shown: belt.shown(slot),
        onShow: slot.flask.visible,
        glow: slot.glow.visible,
        hand: h.state,
        flaskInHand: h.flask.visible && h.flask.parent === grip,
        weaponOnHand: weapon.parent === grip,
        weaponLive: hand === 'right' ? player.sword.tip.valid : player.shield.tracked,
        weaphase: h.weapon,
        ghost: h.ghost.visible,
        ghostOpacity: h.ghostMat.opacity,
        ghostAt: v(h.ghost.position),
        hp: player.hp,
        maxHp: player.maxHp,
        log: { ...belt.log },
      };
    },
    [hand, slotIndex],
  );
const buzzes = () => page.evaluate(() => window.__buzzes.splice(0));

await page.goto(`${base}/?belt=a&calm&emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.belt, null, { timeout: 120000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => {
  const d = window.__descent;
  d.paused = true;
  d.belt.drain = 0;
  window.__buzzes = [];
  const pulse = d.player.input.pulse.bind(d.player.input);
  d.player.input.pulse = (hand, intensity, ms) => {
    window.__buzzes.push({ hand, intensity, ms });
    pulse(hand, intensity, ms);
  };
});
await xrFrames(2);
await step(0.1);
for (const hand of ['left', 'right']) {
  gripOffset[hand] = await page.evaluate((hand) => {
    const { player, device } = window.__descent;
    const g = player.input.hands[hand].grip.getWorldPosition(player.rig.position.clone());
    const c = device.controllers[hand].position;
    return [g.x - c.x, g.y - c.y, g.z - c.z];
  }, hand);
}
const { BELT } = await page.evaluate(() => ({ BELT: window.__descent.BELT }));
await handTo('left', rest('left'));
await handTo('right', rest('right'));
await look(65);
await step(0.3);
await buzzes();
await shot('00-the-belt-at-your-hips');

const VARIANTS = [
  { v: 'a', hand: 'right', slot: 1, name: 'the weapon fades' },
  { v: 'b', hand: 'left', slot: 0, name: 'the weapon to the hip' },
  { v: 'c', hand: 'right', slot: 1, name: 'no hand-off' },
];

for (const { v, hand, slot, name } of VARIANTS) {
  console.log(`\n-- variant ${v}: ${name} (${hand} hand, ${slot ? 'right' : 'left'} hip)`);
  await page.evaluate((v) => {
    const d = window.__descent;
    d.choose(v);
    d.belt.slots.forEach((s, i) => (s.count = d.BELT.stacks[i]));
    d.player.hp = 30;
  }, v);
  await handTo(hand, rest(hand));
  await look(65);
  await step(0.3);
  await buzzes();
  let s = await state(hand, slot);
  const before = s.count;

  // 1. Near the slot: it glows, one tick.
  const hover = [s.slot[0] + (hand === 'right' ? 0.06 : -0.06), s.slot[1] + 0.07, s.slot[2]];
  await handTo(hand, hover);
  await step(0.2);
  s = await state(hand, slot);
  let got = await buzzes();
  const ticks = got.filter((b) => b.hand === hand && b.intensity === BELT.buzz.tick.intensity);
  check(s.glow && ticks.length === 1, `a hand 9 cm from the slot: it glows (${s.glow}), one tick (${ticks.length})`);
  if (v === 'c') check(s.hand === 'free', '9 cm is near, not a touch: nothing taken yet');
  else check(s.hand === 'free', 'near without the grip takes nothing');

  // 2. Taking it.
  if (v === 'c') await handTo(hand, [s.slot[0], s.slot[1] + 0.04, s.slot[2]]);
  else await squeeze(hand, 1);
  await step(0.02);
  s = await state(hand, slot);
  check(s.hand === (v === 'c' ? 'primed' : 'holding') && s.flaskInHand, `${v === 'c' ? 'a touch' : 'the grip'} takes a potion (${s.hand}), a flask in the hand`);
  check(s.shown === before - 1 && !s.onShow, `the slot shows ${s.shown} left and no flask (was ${before})`);
  await step(Math.max(BELT.fade, BELT.stow) + 0.05);
  s = await state(hand, slot);
  if (v !== 'c') check(!s.weaponOnHand && !s.weaponLive, `the ${hand === 'right' ? 'sword' : 'shield'} is off the hand and can't ${hand === 'right' ? 'hit' : 'block'}`);
  if (v === 'a') {
    check(!s.ghost || s.ghostOpacity < 0.02, `after ${BELT.fade} s it has faded out (opacity ${s.ghostOpacity.toFixed(2)})`);
  } else if (v === 'b') {
    const d = Math.hypot(s.ghostAt[0] - s.slot[0], s.ghostAt[1] - s.slot[1], s.ghostAt[2] - s.slot[2]);
    check(s.ghost && s.weaphase === 'away' && d < 0.25, `after ${BELT.stow} s it hangs at the hip, ${(d * 100).toFixed(0)} cm from the slot`);
  } else {
    check(s.weaponOnHand && s.weaponLive, 'the sword stays in the hand, still live');
  }
  await shot(`${v}-1-a-potion-taken`);

  // 3. To the mouth and away early: cancelled, nothing drunk, the potion kept.
  await look(10);
  s = await state(hand, slot);
  await handTo(hand, s.mouth);
  await step(0.3);
  s = await state(hand, slot);
  const hpBefore = s.hp;
  await handTo(hand, rest(hand));
  await step(0.1);
  s = await state(hand, slot);
  check(s.log.cancelled === 1 && s.hp === hpBefore && s.log.drunk === 0, `0.3 s at the mouth, pulled away: cancelled (${s.log.cancelled}), health still ${s.hp.toFixed(0)}`);
  check(s.hand !== 'free' && s.flaskInHand, 'the potion stays in the hand');
  await buzzes();

  // 4. The whole drink.
  const mouth = (await state(hand, slot)).mouth;
  await handTo(hand, mouth);
  await step(0.35);
  s = await state(hand, slot);
  check(s.hp === hpBefore && s.hand !== 'free', `halfway (0.35 s): not yet healed (${s.hp.toFixed(0)})`);
  await step(0.4);
  s = await state(hand, slot);
  got = await buzzes();
  const light = got.filter((b) => b.intensity === BELT.buzz.drink.intensity);
  const strong = got.filter((b) => b.intensity === BELT.buzz.gulp.intensity);
  const heal = s.maxHp * 0.4;
  check(near(s.hp, hpBefore + heal, 0.01), `after ${BELT.drinkTime} s at the mouth: health ${hpBefore.toFixed(0)} → ${s.hp.toFixed(0)} (+${heal})`);
  check(light.length >= 6 && strong.length === 1, `a steady light buzz (${light.length} pulses) then one strong one (${strong.length})`);
  check(s.hand === 'free' && !s.flaskInHand && s.log.drunk === 1, 'the empty flask is gone from the hand');
  check(s.count === before - 1 && s.shown === before - 1 && s.onShow, `the slot refills from its stack: a flask on show, ${s.shown} left`);
  await handTo(hand, rest(hand));
  await look(65);
  await step(Math.max(BELT.fade, BELT.stow) + 0.05);
  await shot(`${v}-2-drunk-and-refilled`);
  s = await state(hand, slot);
  check(s.weaponOnHand && s.weaponLive && !s.ghost, `the ${hand === 'right' ? 'sword' : 'shield'} is back in the hand and live`);

  // 5. Taken, then let go (a, b) or left waiting (c): back to the slot.
  await handTo(hand, [s.slot[0], s.slot[1] + 0.04, s.slot[2]]);
  if (v !== 'c') {
    await squeeze(hand, 0);
    await squeeze(hand, 1);
  }
  await step(0.05);
  const taken = await state(hand, slot);
  await handTo(hand, rest(hand));
  if (v === 'c') await step(BELT.primed + 0.1);
  else await squeeze(hand, 0);
  await step(Math.max(BELT.fade, BELT.stow) + 0.05);
  s = await state(hand, slot);
  check(
    taken.hand !== 'free' && s.hand === 'free' && s.shown === taken.shown + 1 && s.onShow && s.log.returned === 1,
    `${v === 'c' ? `left waiting ${BELT.primed} s` : 'let go'}, the potion goes back to its slot (${taken.shown} → ${s.shown} on show)`,
  );
  check(s.weaponOnHand && s.weaponLive, 'and the weapon is back in the hand');
  await page.evaluate(() => Object.assign(window.__descent.belt.log, { taken: 0, drunk: 0, cancelled: 0, returned: 0, refilled: 0 }));
}

// The drain: it eats health, and stops at its floor.
{
  await page.evaluate(() => {
    const d = window.__descent;
    d.belt.drain = d.BELT.drain;
    d.player.hp = d.player.maxHp;
  });
  await step(2);
  const hp = await page.evaluate(() => window.__descent.player.hp);
  check(near(hp, 100 - 2 * BELT.drain, 0.1), `the drain: ${BELT.drain}/s takes health to ${hp.toFixed(1)} in 2 s`);
  await page.evaluate(() => (window.__descent.player.hp = 21));
  await step(2);
  const low = await page.evaluate(() => window.__descent.player.hp);
  check(near(low, 100 * BELT.drainFloor, 0.01), `and stops at ${BELT.drainFloor * 100}% (${low.toFixed(1)})`);
}

// A stick click cycles the way to take a potion, and the address follows.
{
  await page.evaluate(() => window.__descent.choose('a'));
  await page.evaluate(() => window.__descent.device.controllers.left.updateButtonValue('thumbstick', 1));
  await xrFrames(2);
  await step(1 / 72);
  await page.evaluate(() => window.__descent.device.controllers.left.updateButtonValue('thumbstick', 0));
  await xrFrames(2);
  await step(1 / 72);
  const { variant, search } = await page.evaluate(() => ({ variant: window.__descent.belt.variant, search: location.search }));
  check(variant === 'b' && search.includes('belt=b'), `a click of the left stick: a → ${variant} (${search})`);
}

check(errors.length === 0, `no page errors (${errors.join('; ')})`);

// `?belt` fights duelists: one comes, and health falls.
{
  await page.goto(`${base}/?belt=b&emulate&nodevui`);
  await page.waitForFunction(() => window.__descent?.belt, null, { timeout: 120000 });
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(2);
  await page.evaluate(() => (window.__descent.paused = true));
  await step(12);
  const { enemies, hp, variant } = await page.evaluate(() => {
    const d = window.__descent;
    return { enemies: d.game.enemies.length, hp: d.player.hp, variant: d.belt.variant };
  });
  check(variant === 'b' && enemies >= 1 && hp < 100, `?belt=b fights a duelist (${enemies}) and you're hurt (${hp.toFixed(0)} health)`);
  check(errors.length === 0, `no page errors (${errors.join('; ')})`);
}

await browser.close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
