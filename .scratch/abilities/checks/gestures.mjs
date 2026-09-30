// Checks for the gesture prototype (issues/07-using-abilities-by-gesture.md) in
// headless Chromium with the IWER emulator. Start `npx vite --port 5173` first, then:
//
//   node .scratch/abilities/checks/gestures.mjs [http://localhost:5173] [recorded.json]
//
// The arena at `?arena&class=<class>&gestures`, paused and stepped in the page.
// The strokes are made by the prototype's stroke maker
// (src/prototype/gestures/gestureBench.prototype.ts, seeded): each gesture
// drawn sloppily, and the moves of normal play made with the grip held. They
// stand in for headset recordings; a JSON of strokes recorded on the headset
// ({ "<gesture id>": [stroke, …] }, as RECORD mode logs them) can be passed
// as the second argument, and each is played and must read as its gesture.
// Each stroke is played through the real input: the right grip squeezed, the
// right hand moved frame by frame along the stroke, the grip let go.
// What it checks, for the warrior, the ranger and the mage:
//
// 1. `&gestures` lays the gesture kit over the class (the ranger's bow and the
//    mage's hands still there), on vocabulary C, in FIGHT.
// 2. Every gesture of the class, drawn with the right grip held, is read as
//    itself, casts its ability and spends its cost in rage, focus or mana.
// 3. Sword swings, thrusts and blocks (warrior), bow draws (ranger) and bolt
//    throws (mage), made with the grip held, read as nothing.
// 4. A grip squeezed at the shoulder (the bag) or at the hip (a potion) never arms.
// 5. DRILL counts a gesture read right, and RECORD keeps a drawn stroke as a template.
// 6. The bench's numbers: each vocabulary over 200 strokes a gesture and 200 of
//    each move of normal play, per class; and how the shapes hold up from 3 to 8.
// 7. Without `&gestures`, the arena and the class prototypes are as before.
//
import { readFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const recordedFile = process.argv[3];
const recorded = recordedFile ? JSON.parse(readFileSync(recordedFile, 'utf8')) : null;
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 640, height: 400 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
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
/** Run the game and the kit `s` seconds, your health kept full. */
const step = (s) =>
  page.evaluate((s) => {
    const { game, classKit } = window.__descent;
    for (let t = 0; t < s - 1e-9; t += 1 / 72) {
      if (game.player.alive) game.player.hp = game.player.maxHp;
      game.update(1 / 72);
      classKit?.update(1 / 72);
    }
  }, s);
const button = async (hand, name, value) => {
  await page.evaluate(([hand, name, value]) => window.__descent.device.controllers[hand].updateButtonValue(name, value), [hand, name, value]);
  await xrFrames(2);
  await step(1 / 72);
};

async function enter(query) {
  await page.goto(`${base}/?emulate&nodevui&${query}`);
  await page.waitForFunction(() => window.__descent?.game, null, { timeout: 120000 });
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  await page.evaluate(() => (window.__descent.paused = true));
  if (query.includes('gestures')) {
    await page.waitForFunction(() => window.__descent.classKit?.recorder, null, { timeout: 30000 });
    // The stroke maker, from the dev server.
    await page.evaluate(async () => {
      window.__bench = await import('/src/prototype/gestures/gestureBench.prototype.ts');
      window.__vocab = await import('/src/prototype/gestures/gestureVocab.prototype.ts');
    });
  }
}

/**
 * Play a stroke (body-frame points, 72 a second) with the right hand: the
 * grip squeezed at its first point, the hand moved along it frame by frame,
 * the grip let go at its last. `how` is 'gesture:<id>', 'junk:<id>' or a
 * stroke object. Returns the kit's verdict on it.
 */
async function play(how, { at = null, seed = 1 } = {}) {
  // Turn the stroke into rig-space points for this head, and put the controller at its start.
  const n = await page.evaluate(
    ([how, at, seed]) => {
      const { game, classKit } = window.__descent;
      const { bench, vocab } = { bench: window.__bench, vocab: window.__vocab };
      const r = bench.rng(seed);
      const stroke =
        typeof how === 'object'
          ? how
          : how.startsWith('gesture:')
            ? bench.performGesture(vocab.GESTURES[how.slice(8)], r)
            : how.startsWith('junk:')
              ? bench.performJunk(bench.JUNK[how.slice(5)], r)
              : { points: [at, at, at, at, at, at], times: [0, 1, 2, 3, 4, 5].map((i) => i / 72) };
      const { player } = game;
      const V = player.rig.position.constructor;
      const head = player.rig.worldToLocal(player.headPosition(new V()));
      const gaze = player.camera.getWorldDirection(new V()).applyQuaternion(player.rig.quaternion.clone().invert());
      const f = new V(gaze.x, 0, gaze.z).normalize();
      const right = new V(-f.z, 0, f.x);
      window.__stroke = stroke.points.map(([x, y, z]) => head.clone().addScaledVector(right, x).add(new V(0, y, 0)).addScaledVector(f, z).toArray());
      const p = window.__stroke[0];
      window.__descent.device.controllers.right.position.set(p[0], p[1], p[2]);
      void classKit;
      return window.__stroke.length;
    },
    [how, at, seed],
  );
  const setGrip = (i) =>
    page.evaluate((i) => {
      const grip = window.__descent.game.player.input.hands.right.grip;
      grip.position.fromArray(window.__stroke[i]);
      grip.updateMatrix();
    }, i);
  await xrFrames(2);
  await page.evaluate(() => window.__descent.device.controllers.right.updateButtonValue('squeeze', 1));
  await xrFrames(2);
  // Frame by frame, as the headset would: the grip placed, then one step of the game.
  await page.evaluate((n) => {
    const { game, classKit } = window.__descent;
    const grip = game.player.input.hands.right.grip;
    for (let i = 0; i < n; i++) {
      grip.position.fromArray(window.__stroke[i]);
      grip.updateMatrix();
      game.player.hp = game.player.maxHp;
      game.update(1 / 72);
      classKit.update(1 / 72);
    }
  }, n);
  await page.evaluate(() => {
    const p = window.__stroke[window.__stroke.length - 1];
    window.__descent.device.controllers.right.position.set(p[0], p[1], p[2]);
    window.__descent.device.controllers.right.updateButtonValue('squeeze', 0);
  });
  await xrFrames(2);
  await setGrip(n - 1);
  await step(1 / 72);
  return page.evaluate(() => {
    const { classKit } = window.__descent;
    const l = classKit.last;
    return { event: l?.event, id: l?.verdict?.id ?? null, miss: l?.verdict?.miss, score: l?.verdict?.score, cast: l?.cast ?? null, reason: l?.reason };
  });
}

const FILL = {
  warrior: () => (window.__descent.game.player.rage = 100),
  ranger: () => (window.__descent.classKit.focus = 100),
  mage: () => (window.__descent.classKit.inner.mana = 100),
};

const tables = [];
for (const cls of ['warrior', 'ranger', 'mage']) {
  console.log(`\n== ${cls}`);
  // The ranger's gestures lie over its prototype, kept at ranger-prototype since the class was built (ticket 21).
  await enter(`arena&class=${cls === 'ranger' ? 'ranger-prototype' : cls}&gestures`);
  await step(1 / 72);
  const kit = await page.evaluate(() => {
    const { classKit, game } = window.__descent;
    return {
      mode: classKit.mode,
      vocab: classKit.vocab.id,
      cls: classKit.cls,
      bound: classKit.bound.map((b) => b.gesture.id),
      costs: classKit.bound.map((b) => b.ability.cost),
      inner: classKit.inner ? Object.keys(classKit.inner).includes('bow') ? 'bow' : 'mana' in classKit.inner ? 'mage' : 'other' : null,
      sword: game.player.sword.model.parent !== null,
    };
  });
  const innerOk = cls === 'warrior' ? kit.inner === null && kit.sword : cls === 'ranger' ? kit.inner === 'bow' : kit.inner === 'mage';
  check(kit.mode === 'fight' && kit.vocab === 'C' && kit.cls === cls && innerOk, `the gesture kit lies over the ${cls} (${JSON.stringify(kit)})`);

  // 2. Every gesture reads as itself and casts, paying its cost.
  let seed = 100;
  for (let i = 0; i < kit.bound.length; i++) {
    const id = kit.bound[i];
    await page.evaluate(FILL[cls]);
    const before = await page.evaluate(() => window.__descent.classKit.resource);
    const res = await play(`gesture:${id}`, { seed: seed++ });
    const after = await page.evaluate(() => window.__descent.classKit.resource);
    const paid = Math.round(before - after);
    // Rage drains 2 a second over the stroke, so the drop is the cost and a little more.
    check(res.id === id && res.cast === id && Math.abs(paid - kit.costs[i]) <= 4, `${id} reads as ${id} and casts for ${kit.costs[i]} (${JSON.stringify(res)}, paid ${paid})`);
  }
  if (recorded) {
    for (const [id, strokes] of Object.entries(recorded)) {
      if (!kit.bound.includes(id)) continue;
      for (const s of strokes) {
        const res = await play(s);
        check(res.id === id, `a recorded ${id} reads as ${id} (${JSON.stringify(res)})`);
      }
    }
  }

  // 3. Normal play, grip held, reads as nothing.
  const junk = await page.evaluate((cls) => window.__bench.CLASS_JUNK[cls], cls);
  for (const id of junk) {
    for (let k = 0; k < 3; k++) {
      const res = await play(`junk:${id}`, { seed: seed++ });
      check(res.id === null && res.cast === null, `${id} with the grip held reads as nothing (${JSON.stringify(res)})`);
    }
  }

  // 4. The bag and the potions keep their grips.
  for (const [place, at] of [
    ['the right shoulder', [0.2, -0.12, -0.1]],
    ['the right hip', [0.19, -0.7, 0.05]],
    ['the tool loop', [0.19, -0.66, -0.16]],
  ]) {
    const res = await play('still', { at });
    check(res.event === 'taken', `a grip at ${place} never arms (${JSON.stringify(res)})`);
  }

  // 6. The bench, every vocabulary, 200 of each.
  const numbers = await page.evaluate(() => {
    const kit = window.__descent.classKit;
    return window.__vocab.VOCABULARIES.map((v) => {
      const b = kit.bench(200, v);
      const falses = Object.fromEntries(Object.entries(b.junk).filter(([, j]) => j.fired).map(([id, j]) => [id, j.fired]));
      return { vocab: v.id, right: b.readRight, wrong: b.readWrong, falseReads: b.falseReads, falses };
    });
  });
  for (const n of numbers) {
    tables.push({ cls, ...n });
  }
  const pick = numbers.find((n) => n.vocab === 'C');
  check(pick.right >= 0.9 && pick.falseReads <= 0.02, `vocabulary C reads ${(pick.right * 100).toFixed(1)}% of the ${cls}'s gestures right, and ${(pick.falseReads * 100).toFixed(1)}% of normal play as a gesture`);
}

// How many shapes one class could hold: the recogniser over 3 to 8, against every move of normal play.
const growth = await page.evaluate(() => {
  const { bench, CLASS_JUNK } = window.__bench;
  const junk = [...CLASS_JUNK.warrior, ...CLASS_JUNK.ranger, ...CLASS_JUNK.mage];
  return [3, 4, 5, 6, 7, 8].map((k) => {
    const b = bench(window.__vocab.ALL_SHAPES.slice(0, k), junk, 200, 11);
    return { k, right: b.readRight, wrong: b.readWrong, falseReads: b.falseReads };
  });
});

// 5. DRILL and RECORD, on the mage.
await page.evaluate(() => window.__descent.classKit.setMode('drill'));
const want = await page.evaluate(() => window.__descent.classKit.bound[0].gesture.id);
await play(`gesture:${want}`, { seed: 7 });
const drill = await page.evaluate(() => window.__descent.classKit.stats.drill);
check(drill.tries === 1 && drill.right === 1, `DRILL counts ${want} drawn when asked for (${JSON.stringify(drill)})`);
await button('right', 'thumbstick', 1);
await button('right', 'thumbstick', 0);
await button('right', 'thumbstick', 1);
await button('right', 'thumbstick', 0);
const mode = await page.evaluate(() => window.__descent.classKit.mode);
await page.evaluate(() => localStorage.removeItem('descent-PROTOTYPE-gesture-recordings'));
await page.evaluate(() => (window.__descent.classKit.recordings = {}));
const toRecord = await page.evaluate(() => window.__descent.classKit.bound[0].gesture.id);
await play(`gesture:${toRecord}`, { seed: 8 });
const kept = await page.evaluate((id) => ({ n: window.__descent.classKit.recordings[id]?.length ?? 0, stored: !!localStorage.getItem('descent-PROTOTYPE-gesture-recordings') }), toRecord);
check(mode === 'record' && kept.n === 1 && kept.stored, `two clicks of the right stick reach RECORD, and a drawn ${toRecord} is kept (${mode}, ${JSON.stringify(kept)})`);
await page.evaluate(() => localStorage.removeItem('descent-PROTOTYPE-gesture-recordings'));

// 7. Without the flag.
await enter('arena&class=ranger-prototype');
const ranger = await page.evaluate(() => ({ recorder: !!window.__descent.classKit?.recorder, bow: !!window.__descent.classKit?.bow }));
check(ranger.bow && !ranger.recorder, `?arena&class=ranger-prototype alone is the ranger prototype, with no gestures (${JSON.stringify(ranger)})`);
await enter('arena&class=ranger');
const built = await page.evaluate(() => ({ kit: window.__descent.classKit, bow: !!window.__descent.game.combat.ranger }));
check(built.kit === null && built.bow, `?arena&class=ranger alone is the built ranger (${JSON.stringify(built)})`);
await enter('arena');
const warrior = await page.evaluate(() => ({ kit: window.__descent.classKit, sword: window.__descent.game.player.sword.model.parent !== null }));
check(warrior.kit === null && warrior.sword, `?arena alone is the warrior's (${JSON.stringify(warrior)})`);

console.log('\nThe bench (share of 200 strokes each; false = normal play read as a gesture):');
console.log('class    vocab  right   wrong   false   what fired');
for (const t of tables) {
  const pc = (x) => `${(x * 100).toFixed(1)}%`.padEnd(8);
  console.log(`${t.cls.padEnd(9)}${t.vocab.padEnd(7)}${pc(t.right)}${pc(t.wrong)}${pc(t.falseReads)}${JSON.stringify(t.falses)}`);
}

console.log('\nShapes held at once (ring, zed, vee, triangle, ess, hook, wave, box, in that order):');
for (const g of growth) console.log(`${g.k}: right ${(g.right * 100).toFixed(1)}%, wrong ${(g.wrong * 100).toFixed(1)}%, false ${(g.falseReads * 100).toFixed(1)}%`);

check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
