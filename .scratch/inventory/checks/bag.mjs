// Checks for the bag and the gear panel prototype (issues/03-the-bag-and-the-gear-panel.md)
// in headless Chromium with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/inventory/checks/bag.mjs [http://localhost:5173] [shots/]
//
// `?bag=a|b|c`, paused and stepped by `__descent.step`; the hands moved and the
// grips squeezed through the emulated controllers. Every buzz is recorded.
//
// 1. An overhead swing at the training dummy lands, and doesn't open the bag:
//    not with the grip held all the way through, nor with the grip squeezed
//    as the hand flies through the shoulder's zone.
// 2. For each way to move items (A touch and carry, B press then press,
//    C grab it):
//    - a slow reach over the right shoulder and a squeeze opens the bag, with
//      a light buzz in the zone and a pulse as it opens, ~45 cm in front;
//    - touching an item shows its card: its name in its rarity's colour, its
//      numbers and + or − against what's worn;
//    - the helm goes on the head, the charm moves to another bag slot, and
//      the chain vest let go over the figure is worn, the tunic coming back;
//    - the rope let go (or dropped) off the panel falls to the ground.
// 3. Turning 90° brings the panel round; the same reach shuts it (A only).
// 4. Draw calls with the panel open: icons from one atlas against a 3D model
//    per item.
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

// Every canvas remembers what was written on it (and in which colour) since it was last cleared.
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
const step = (s, dt = 1 / 72) => page.evaluate(([s, dt]) => window.__descent.step(s, dt), [s, dt]);

async function load(variant) {
  await page.goto(`${base}/?bag=${variant}&emulate&nodevui`);
  await page.waitForFunction(() => window.__descent?.proto, null, { timeout: 120000 });
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
  await xrFrames(2);
  await step(0.2);
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
/** Move a fist there and let a frame of the game see it. */
async function fistAt(hand, w) {
  await fistTo(hand, w);
  await step(1 / 72);
}
/** Squeeze the grip (1) or let it go (0), and let a frame of the game see it. */
async function grip(hand, value) {
  await page.evaluate(([hand, v]) => window.__descent.device.controllers[hand].updateButtonValue('squeeze', v), [hand, value]);
  await xrFrames(2);
  await step(1 / 72);
}
const vec = (v) => ({ x: v.x, y: v.y, z: v.z });
/** The world point just off a slot's face. `ref` is a bag index or a gear slot's name. */
const slotAt = (ref, off = 0.02) =>
  page.evaluate(
    ([ref, off]) => {
      const { panel } = window.__descent.proto;
      const r = typeof ref === 'number' ? { kind: 'bag', i: ref } : { kind: 'gear', slot: ref };
      const p = panel.slotWorld(r, window.__descent.camera.position.clone(), off);
      return { x: p.x, y: p.y, z: p.z };
    },
    [ref, off],
  );
const figureAt = () =>
  page.evaluate(() => {
    const p = window.__descent.proto.panel.figureWorld(window.__descent.camera.position.clone());
    return { x: p.x, y: p.y, z: p.z };
  });
const dropKeyAt = () =>
  page.evaluate(() => {
    const p = window.__descent.proto.panel.dropKeyWorld(window.__descent.camera.position.clone());
    return { x: p.x, y: p.y, z: p.z };
  });
/** A point `d` metres straight out from the panel's face at `w` (towards you). */
const outFrom = (w, d) =>
  page.evaluate(
    ([w, d]) => {
      const { panel } = window.__descent.proto;
      const n = panel.root.localToWorld(panel.root.position.clone().set(0, 0, 1)).sub(panel.root.getWorldPosition(panel.root.position.clone()));
      return { x: w.x + n.x * d, y: w.y + n.y * d, z: w.z + n.z * d };
    },
    [w, d],
  );
/** What the prototype shows. */
const state = () =>
  page.evaluate(() => {
    const d = window.__descent;
    const { bag, panel, drops, lines, mover, dummy } = d.proto;
    const card = panel.card.mesh.visible ? (panel.card.ctx.__texts ?? []) : null;
    return {
      open: panel.isOpen,
      card,
      gear: Object.fromEntries(Object.entries(bag.gear).map(([k, v]) => [k, v?.id ?? null])),
      slots: bag.slots.map((s) => s?.id ?? null),
      dropped: drops.items.map((i) => ({ id: i.item.id, y: i.group.position.y, landed: i.landed })),
      holding: mover.holding?.id ?? null,
      last: lines.at(-1) ?? '',
      lines: [...lines],
      buzzes: [...d.buzzes],
      hits: dummy.hits,
      swordShown: d.player.sword.model.visible,
      panelFrom: (() => {
        const head = d.camera.getWorldPosition(d.camera.position.clone());
        const p = panel.root.position;
        return { out: Math.hypot(p.x - head.x, p.z - head.z), down: head.y - p.y };
      })(),
    };
  });
/** The reach's zone for a hand, in the world. */
const zone = (hand) => page.evaluate((hand) => {
  const c = window.__descent.proto.reach.centre[hand];
  return { x: c.x, y: c.y, z: c.z };
}, hand);

/** A slow reach over the right shoulder: in, a moment still, squeeze, back down. */
async function reachBack(hand = 'right') {
  const z = await zone(hand);
  await fistTo(hand, z);
  await step(0.3); // still, in the zone: the light buzz
  await grip(hand, 1);
  await step(0.1);
  await fistAt(hand, { x: hand === 'right' ? 0.25 : -0.25, y: 1.0, z: -0.15 });
  await grip(hand, 0);
  await step(0.1);
}

// 1. Overhead swings at the dummy don't open the bag.
await load('a');
{
  const REACH = await page.evaluate(() => window.__descent.REACH);
  await page.evaluate(() => window.__descent.teleport(0, -0.9, 0));
  await xrFrames(2);
  await step(0.3);
  const z = await zone('right');
  // Wind up over the right shoulder, grip held the whole way, then chop down at the dummy.
  const path = (t) => ({ x: z.x - 0.05 * t, y: z.y + 0.1 - 0.75 * t, z: z.z - 0.7 * t });
  await fistAt('right', path(0));
  await grip('right', 1);
  let fastest = 0;
  let prev = path(0);
  for (let i = 1; i <= 10; i++) {
    const p = path(i / 10);
    await fistTo('right', p);
    await step(1 / 72);
    fastest = Math.max(fastest, Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) * 72);
    prev = p;
  }
  await grip('right', 0);
  await step(0.3);
  let s = await state();
  check(!s.open, `an overhead chop starting in the shoulder's zone, grip held throughout, leaves the bag shut (hand at up to ${fastest.toFixed(1)} m/s)`);
  check(s.hits >= 1, `and the chop lands on the dummy (${s.hits} hit)`);

  // Again, squeezing the grip as the hand flies back up through the zone.
  const up = (t) => ({ x: z.x, y: z.y - 0.6 + 0.6 * t, z: z.z - 0.5 + 0.5 * t });
  await fistAt('right', up(0));
  for (let i = 1; i <= 6; i++) {
    await fistTo('right', up(i / 6));
    if (i === 6) await page.evaluate(() => window.__descent.device.controllers.right.updateButtonValue('squeeze', 1));
    if (i === 6) await xrFrames(2);
    await step(1 / 72);
  }
  s = await state();
  check(!s.open && /too fast/.test(s.last), `a grip squeezed as the hand swings up into the zone at speed doesn't open it ("${s.last}", gate ${REACH.speedGate} m/s)`);
  await grip('right', 0);
  await fistAt('right', { x: 0.3, y: 1.0, z: -1.0 });
  await step(0.5);
}

for (const variant of ['a', 'b', 'c']) {
  const V = variant.toUpperCase();
  await load(variant);
  const name = await page.evaluate(() => window.__descent.proto.mover.name);
  console.log(`-- ${V}: ${name}`);

  // Open.
  await reachBack('right');
  let s = await state();
  const zoneBuzz = s.buzzes.filter((b) => b.intensity < 0.3).length;
  const openPulse = s.buzzes.find((b) => b.intensity >= 0.9);
  check(s.open && /opened: right/.test(s.lines.join('\n')), `${V}: a slow reach over the right shoulder and a squeeze opens the bag (${s.lines.find((l) => l.startsWith('opened'))})`);
  check(zoneBuzz >= 1 && !!openPulse, `${V}: a light buzz in the zone (${zoneBuzz}) and a pulse as it opens`);
  check(Math.abs(s.panelFrom.out - 0.45) < 0.03 && s.panelFrom.down > 0.15, `${V}: it opens ${(s.panelFrom.out * 100).toFixed(0)} cm out and ${(s.panelFrom.down * 100).toFixed(0)} cm below the eyes`);
  await step(0.5); // B arms
  if (variant === 'a') await shot('a-01-open');

  // Card: touch the helm (bag slot 2).
  const helm = await slotAt(1, variant === 'c' ? 0.02 : 0.015);
  await fistAt('right', await outFrom(helm, 0.1));
  await fistAt('right', helm);
  s = await state();
  const cardText = s.card?.map((t) => t.text) ?? [];
  const title = s.card?.[0];
  check(title?.text === 'Militia Helm' && /#1eff00/i.test(title?.color), `${V}: touching the helm shows its card, its name in green (${JSON.stringify(title)})`);
  check(cardText.some((t) => t === '+9') && cardText.some((t) => t === '+2'), `${V}: its numbers against the bare head (${cardText.join(' | ')})`);
  if (variant === 'a') await shot('a-02-card');

  // Equip the helm.
  const head = await slotAt('head', variant === 'c' ? 0.02 : 0.015);
  if (variant === 'b') {
    await fistAt('right', await outFrom(head, 0.1));
    await step(0.35);
    await fistAt('right', head);
  } else {
    await grip('right', 1);
    s = await state();
    check(s.holding === 'militia-helm', `${V}: squeezing the grip picks the helm up (${s.last})`);
    if (variant === 'c') check(!s.swordShown, `${V}: the sword goes while the hand holds it`);
    await fistAt('right', head);
    if (variant === 'a') await shot('a-03-carrying-to-head');
    await grip('right', 0);
  }
  s = await state();
  check(s.gear.head === 'militia-helm' && s.slots[1] === null, `${V}: the helm is worn on the head (${s.last})`);
  if (variant === 'c') check(s.swordShown, `${V}: and the sword is back in the hand`);
  await step(0.35);

  // Worn slot card: the tunic compares with itself; touch the chest slot to see "worn".
  // Move the charm (bag 5) to bag 12.
  const charm = await slotAt(4, variant === 'c' ? 0.02 : 0.015);
  const twelve = await slotAt(11, variant === 'c' ? 0.02 : 0.015);
  await fistAt('right', await outFrom(charm, 0.1));
  await step(0.35);
  await fistAt('right', charm);
  if (variant === 'b') {
    await fistAt('right', await outFrom(twelve, 0.1));
    await step(0.35);
    await fistAt('right', twelve);
  } else {
    await grip('right', 1);
    await fistAt('right', twelve);
    await grip('right', 0);
  }
  s = await state();
  check(s.slots[11] === 'bone-charm' && s.slots[4] === null, `${V}: the charm moves to bag slot 12 (${s.last})`);
  await step(0.35);

  // The chain vest (bag 8) let go over the figure: worn, the tunic back in its slot.
  const vest = await slotAt(7, variant === 'c' ? 0.02 : 0.015);
  const figure = await figureAt();
  await fistAt('right', await outFrom(vest, 0.1));
  await step(0.35);
  await fistAt('right', vest);
  s = await state();
  const vestCard = s.card?.map((t) => t.text) ?? [];
  check(vestCard[0] === 'Chain Vest' && vestCard.includes('+8'), `${V}: the vest's card shows armour +8 against the tunic (${vestCard.join(' | ')})`);
  if (variant === 'b') {
    await fistAt('right', await outFrom(figure, 0.1));
    await step(0.35);
    await fistAt('right', figure);
  } else {
    await grip('right', 1);
    await fistAt('right', figure);
    await grip('right', 0);
  }
  s = await state();
  check(s.gear.chest === 'chain-vest' && s.slots[7] === 'padded-tunic', `${V}: over the figure it's worn, the tunic back in its slot (${s.last})`);
  await step(0.35);

  // Drop the rope (bag 7).
  const rope = await slotAt(6, variant === 'c' ? 0.02 : 0.015);
  await fistAt('right', await outFrom(rope, 0.1));
  await step(0.35);
  await fistAt('right', rope);
  if (variant === 'b') {
    const key = await dropKeyAt();
    await fistAt('right', await outFrom(key, 0.1));
    await step(0.35);
    await fistAt('right', key);
  } else {
    await grip('right', 1);
    await fistAt('right', { x: rope.x + 0.45, y: rope.y - 0.3, z: rope.z + 0.1 });
    await grip('right', 0);
  }
  s = await state();
  check(s.slots[6] === null && s.dropped.some((d) => d.id === 'frayed-rope'), `${V}: the rope let go off the panel is dropped (${s.last})`);
  await step(1);
  s = await state();
  const rp = s.dropped.find((d) => d.id === 'frayed-rope');
  check(rp?.landed && rp.y < 0.1, `${V}: and lies on the ground (y ${rp?.y.toFixed(2)})`);
  if (variant === 'a') await shot('a-04-after-moves');

  if (variant === 'a') {
    // The sword's tip reads a card too.
    const steel = await slotAt(0, 0.01);
    await page.evaluate(() => window.__descent.device.controllers.right.quaternion.set(0, 0.7071, 0, 0.7071)); // blade points left
    for (let i = 0; i < 4; i++) {
      await step(0.3);
      await page.evaluate((t) => {
        const { player, device } = window.__descent;
        const tip = player.sword.tip.worldNow(player.rig, player.rig.position.clone());
        const want = player.rig.worldToLocal(tip.clone().set(t.x, t.y, t.z));
        const now = player.rig.worldToLocal(tip);
        const c = device.controllers.right.position;
        c.set(c.x + want.x - now.x, c.y + want.y - now.y, c.z + want.z - now.z);
      }, steel);
      await xrFrames(2);
    }
    await step(0.3);
    s = await state();
    check(s.card?.[0]?.text === 'Steel Longsword', `A: the sword's tip on the steel longsword shows its card (${s.card?.[0]?.text})`);
    await page.evaluate(() => window.__descent.device.controllers.right.quaternion.set(0, 0, 0, 1));
    await fistAt('right', { x: 0.3, y: 1.0, z: -0.1 });

    // Turning away 90°: the panel comes round in front.
    const before = await page.evaluate(() => window.__descent.proto.panel.root.position.clone());
    await page.evaluate(() => window.__descent.device.quaternion.set(0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4))); // 90° left
    await xrFrames(2);
    await step(0.1);
    const after = await page.evaluate(() => window.__descent.proto.panel.root.position.clone());
    check(Math.hypot(after.x - before.x, after.z - before.z) > 0.3, `A: turned 90° left, the panel comes round in front`);
    await page.evaluate(() => window.__descent.device.quaternion.set(0, 0, 0, 1));
    await xrFrames(2);
    await step(0.1);

    // 4. Draw calls with the panel open: icons, then 3D models.
    const calls = await page.evaluate(async () => {
      const { proto, renderer } = window.__descent;
      const session = renderer.xr.getSession();
      const frame = () => new Promise((r) => session.requestAnimationFrame(() => session.requestAnimationFrame(r)));
      const measure = async () => {
        await frame();
        const open = renderer.info.render.calls;
        proto.panel.root.visible = false;
        await frame();
        const shut = renderer.info.render.calls;
        proto.panel.root.visible = true;
        return { open, shut, panel: open - shut };
      };
      proto.setMode('icons');
      const icons = await measure();
      proto.setMode('models');
      const models = await measure();
      proto.setMode('icons');
      return { icons, models, views: renderer.xr.getCamera().cameras.length };
    });
    console.log(`     draw calls (both eyes): icons ${JSON.stringify(calls.icons)}, models ${JSON.stringify(calls.models)}`);
    check(calls.models.panel > calls.icons.panel, `the panel costs ${calls.icons.panel / calls.views} draws an eye with icons, ${calls.models.panel / calls.views} with a model per item`);
    if (shots) {
      await page.evaluate(() => window.__descent.proto.setMode('models'));
      await xrFrames(2);
      await shot('a-05-models');
      await page.evaluate(() => window.__descent.proto.setMode('icons'));
    }

    // 3. The same reach shuts it.
    await reachBack('right');
    s = await state();
    check(!s.open && /closed: right hand reached back/.test(s.lines.join('\n')), 'A: the same reach over the shoulder shuts the bag');
  }
}

check(errors.length === 0, `no page errors (${errors.join('; ')})`);
await browser.close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
