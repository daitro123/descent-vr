// Checks for the ranger's abilities at 6, 8 and 10 (issues/22-the-rangers-abilities-at-6-8-and-10.md)
// in headless Chromium with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/abilities/checks/ranger-abilities.mjs [http://localhost:5173] [shots/]
//
// The harness (stepping game time in the page, posing the bow and the draw
// hand, nocking, drawing and loosing, drawing a shape with the right grip) is
// ranger-class.mjs's. In the arena, `?arena&class=ranger`, the waves held back:
// 1. The arena's ranger holds Volley on the Z, Scatter on the V and Hunter's
//    Mark on the S.
// 2. A Z drawn is Volley, for 35 focus; the next arrow loosed at the middle
//    of five grunts standing in an arc 10 m off splits into five, and each
//    grunt takes one arrow at 60% (18). A second Z while it waits says so and
//    spends nothing (it's cooling); A while a Volley's arrow is drawn says
//    "Power Shot: Volley is waiting" and spends nothing.
// 3. A V drawn is Scatter, for 25 focus: the two grunts close in front of you
//    are staggered and slide over a metre away from you, unhurt; the one
//    behind you isn't touched.
// 4. An S drawn facing a grunt is Hunter's Mark, for 20 focus: it's marked,
//    its outline drawn over walls (2 meshes, under 500 triangles); a
//    full-draw arrow deals it 15% more (35 of 30) than the grunt beside it.
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
const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
// Remember each floating text's words, so the check can read them back.
await page.addInitScript(() => {
  const fill = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) {
    this.__text = text;
    return fill.call(this, text, ...rest);
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


const rangerKit = () =>
  page.evaluate(() => {
    const k = window.__R.combat.ranger;
    return { focus: window.__R.player.resource, volleyed: k.volleyed, powered: k.powered, flying: k.shots.flying.length, ...k.stats, marked: k.mark.target };
  });
/** Every enemy gone, focus full, nothing cooling or waiting; you `z` m back from the arena's middle, facing its far wall. */
const fresh = (z = 0) =>
  page.evaluate((z) => {
    const { player, combat } = window.__R;
    player.place(0, z, 0);
    player.rig.updateMatrixWorld(true);
    for (const e of window.__R.enemies()) if (e.alive) e.takeHit(9999, e.position.clone().set(0, 0, 0));
    window.__hold = [];
    player.resource = player.bar.size;
    player.abilities.clear();
    combat.ranger.clear();
  }, z);
/** Put a grunt `ahead` m along your gaze, `side` m to its right, and keep it there; returns it (as `window.__last`). */
async function place(ahead, side = 0, kept = true) {
  await spawn('grunt', ahead, side);
  await page.evaluate(
    ([ahead, side, kept]) => {
      const { player } = window.__R;
      const V = player.rig.position.constructor;
      const head = player.headPosition(new V());
      const f = player.camera.getWorldDirection(new V()).setY(0).normalize();
      const e = window.__last;
      const x = head.x + f.x * ahead - f.z * side;
      const z = head.z + f.z * ahead + f.x * side;
      e.position.set(x, e.position.y, z);
      e.hp = e.maxHp;
      if (kept) window.__hold.push([e, x, z]);
    },
    [ahead, side, kept],
  );
}

await enter('arena&class=ranger');
await page.evaluate(() => (window.__holdWaves = true));
await step(0.5);

// 1.
{
  const s = await page.evaluate(async () => {
    const { slotsOf } = await import('/src/classes.ts');
    const slots = slotsOf(window.__R.player.stats.abilities);
    return { z: slots.z, v: slots.v, s: slots.s };
  });
  check(s.z === 'volley' && s.v === 'scatter' && s.s === 'huntersMark', `the arena's ranger holds Volley on the Z, Scatter on the V, Hunter's Mark on the S (${JSON.stringify(s)})`);
}

// 2. Volley on a camp of five, 10 m off (the fan's arrows 87 cm apart there): you by the near wall.
{
  await fresh(5.5);
  await step(0.3);
  await page.evaluate(() => (window.__camp = []));
  for (const deg of [-10, -5, 0, 5, 10]) {
    const a = (deg * Math.PI) / 180;
    await place(10 * Math.cos(a), 10 * Math.sin(a));
    await page.evaluate(() => window.__camp.push(window.__last));
  }
  await step(0.2);
  await page.evaluate(() => window.__camp.forEach((e) => (e.hp = e.maxHp)));
  const z = await play('shape:z', 5);
  const ready = await rangerKit();
  check(z.id === 'z' && z.ability === 'volley' && z.use === 'cast' && ready.volleyed, `a Z is read as Volley and waits on the next arrow (${JSON.stringify(z)})`);
  check(Math.abs(ready.focus - 65) < 1, `for 35 focus (${ready.focus.toFixed(1)} left)`);
  const again = await play('shape:z', 6);
  const after = await rangerKit();
  check(again.use === 'cooling' && after.volleyed && after.focus >= ready.focus - 0.01, `a second Z while it waits is refused (still cooling) and spends nothing (${JSON.stringify(again)}, ${after.focus.toFixed(1)})`);
  // Nock at the middle one, draw, and A says Power Shot can't go on a Volley's arrow.
  await aim('window.__camp[2]');
  await button('right', 'trigger', 1);
  await drawHand(0.75);
  await aim('same', false, 0.75);
  await press('right', 'a-button');
  const drawn = await rangerKit();
  const said = await page.evaluate(() => (window.__descent.game.text.active ?? []).map((f) => f.sprite.material.map.image.getContext('2d').__text ?? ''));
  check(!drawn.powered && said.includes('Power Shot: Volley is waiting'), `A on a Volley's arrow says "Power Shot: Volley is waiting" (${JSON.stringify(said.filter((w) => w.startsWith('Power')))})`);
  const before = await page.evaluate(() => window.__camp.map((e) => e.hp));
  await button('right', 'trigger', 0);
  const loosed = await rangerKit();
  await step(0.5);
  const hp = await page.evaluate(() => window.__camp.map((e) => e.hp));
  const lost = before.map((h, i) => h - hp[i]);
  check(loosed.volleys === 1 && loosed.flying >= 5 && !loosed.volleyed, `the arrow splits into five as it leaves the bow (${loosed.flying} flying)`);
  check(lost.every((l) => l === 18), `each of the five grunts takes one arrow, at 60% (${JSON.stringify(lost)})`);
  await shot('volley');
}

// 3. Scatter: two close in front, one behind.
{
  await fresh();
  await step(0.3);
  await place(1.6, -0.5, false);
  await page.evaluate(() => (window.__front = [window.__last]));
  await place(1.6, 0.5, false);
  await page.evaluate(() => window.__front.push(window.__last));
  await place(-1.6, 0, false);
  await page.evaluate(() => {
    window.__behind = window.__last;
    const k = window.__R.combat.ranger;
    const scatter = k.scatter.bind(k);
    k.scatter = (enemies, facing) => {
      window.__at = [...window.__front, window.__behind].map((e) => ({ x: e.position.x, z: e.position.z, hp: e.hp }));
      const used = scatter(enemies, facing);
      window.__kicked = [...window.__front, window.__behind].map((e) => +e.knockback.length().toFixed(2));
      return used;
    };
  });
  const v = await play('shape:v', 7);
  const cast = await rangerKit();
  const states = await page.evaluate(() => [...window.__front, window.__behind].map((e) => e.state));
  check(v.id === 'v' && v.ability === 'scatter' && v.use === 'cast' && cast.scattered === 2, `a V is read as Scatter and reaches the two in front (${JSON.stringify(v)}, ${cast.scattered})`);
  check(Math.abs(cast.focus - 75) < 1, `for 25 focus (${cast.focus.toFixed(1)} left)`);
  check(states[0] === 'stagger' && states[1] === 'stagger' && states[2] !== 'stagger', `the two in front stagger, the one behind doesn't (${JSON.stringify(states)})`);
  await step(0.8);
  const moved = await page.evaluate(() => {
    const { player } = window.__R;
    const V = player.rig.position.constructor;
    const feet = player.feetPosition(new V());
    const off = (p) => Math.hypot(p.x - feet.x, p.z - feet.z);
    return [...window.__front, window.__behind].map((e, i) => ({ was: +off(window.__at[i]).toFixed(2), now: +off(e.position).toFixed(2), lost: window.__at[i].hp - e.hp }));
  });
  check(moved[0].now - moved[0].was > 1 && moved[1].now - moved[1].was > 1, `and slide over a metre away from you (${JSON.stringify(moved.slice(0, 2))})`);
  check(moved.every((m) => m.lost === 0), `unhurt (${JSON.stringify(moved.map((m) => m.lost))})`);
  const kicked = await page.evaluate(() => window.__kicked);
  check(kicked[0] > 5 && kicked[1] > 5 && kicked[2] < 0.01, `the gust pushes the two in front and not the one behind (${JSON.stringify(kicked)} m/s)`);
  await shot('scatter');
}

// 4. Hunter's Mark on the grunt you face.
{
  await fresh(5);
  await step(0.3);
  await place(9, 0);
  await page.evaluate(() => (window.__quarry = window.__last));
  await place(9, 2);
  await page.evaluate(() => (window.__other = window.__last));
  await step(0.2);
  const s = await play('shape:s', 8);
  await step(1 / 72);
  const m = await page.evaluate(() => {
    const k = window.__R.combat.ranger;
    const { mark } = k;
    return {
      focus: window.__R.player.resource,
      on: mark.target === window.__quarry,
      left: mark.remaining,
      shown: mark.outline.visible && mark.chevron.visible,
      overWalls: !mark.outline.material.depthTest && !mark.chevron.material.depthTest,
      meshes: [mark.outline, mark.chevron].filter((o) => o.parent).length,
      tris: mark.triangles,
    };
  });
  check(s.id === 's' && s.ability === 'huntersMark' && s.use === 'cast' && m.on, `an S is read as Hunter's Mark and marks the grunt you face (${JSON.stringify({ ...s, ...m })})`);
  check(Math.abs(m.focus - 80) < 1, `for 20 focus (${m.focus.toFixed(1)} left)`);
  check(m.shown && m.overWalls && m.meshes === 2 && m.tris < 500 && m.left > 19, `its outline and chevron show over walls: 2 meshes, ${m.tris} triangles, ${m.left.toFixed(1)} s left`);
  await shot('marked');
  await page.evaluate(() => (window.__quarry.hp = window.__other.hp = 999));
  await shoot('window.__quarry');
  await shoot('window.__other');
  const hit = await page.evaluate(() => [999 - window.__quarry.hp, 999 - window.__other.hp]);
  check(hit[0] === Math.round(30 * 1.15) && hit[1] === 30, `a full-draw arrow deals the marked grunt 15% more (${hit[0]} against ${hit[1]})`);
  // Behind a pillar from where you stand, its outline still shows (for the screenshot).
  await page.evaluate(() => {
    const { player } = window.__R;
    const V = player.rig.position.constructor;
    const feet = player.feetPosition(new V());
    const pillar = new V(3, 0, -3);
    const behind = pillar.clone().add(pillar.clone().sub(feet).setY(0).normalize().multiplyScalar(1.2));
    window.__hold = [[window.__quarry, behind.x, behind.z]];
    window.__other.takeHit(9999, new V());
    const { device } = window.__descent;
    device.controllers.left.position.set(-0.4, 0.3, 0.2);
    device.controllers.right.position.set(0.4, 0.3, 0.2);
    player.place(feet.x, feet.z, Math.atan2(-(pillar.x - feet.x), -(pillar.z - feet.z)));
  });
  await xrFrames(2);
  await step(0.6);
  const hidden = await page.evaluate(() => {
    const { player } = window.__R;
    const V = player.rig.position.constructor;
    const q = window.__quarry;
    return { behindPillar: !window.__descent.game.arena.lineOfSight(player.headPosition(new V()), q.position.clone().setY(1.2)), shown: window.__R.combat.ranger.mark.outline.visible };
  });
  check(hidden.shown, `behind a pillar, still marked and outlined (${JSON.stringify(hidden)})`);
  await xrFrames(2);
  await shot('marked-behind-pillar');
}

// 5.
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
