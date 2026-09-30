// Checks for abilities by gesture and the warrior's new abilities
// (issues/19-gestures-and-the-warriors-new-abilities.md) in headless Chromium
// with the IWER emulator. Start `npx vite --port 5173` first, then:
//
//   node .scratch/abilities/checks/warrior-gestures.mjs [http://localhost:5173]
//
// The arena at `?arena&class=warrior`, paused and stepped in the page, with
// the waves held back so the check places its own enemies. Strokes come from
// the stroke maker the unit test uses (tests/support/gestureStrokes.ts, seeded):
// each shape drawn sloppily, and the warrior's moves of normal play. Each is
// played through the real input: the right grip squeezed, the right hand moved
// frame by frame along the stroke, the grip let go. What it checks:
//
// 1. The warrior has every base ability: the ring holds Heroic Throw, the Z
//    Shield Wall, the V Sweeping Strikes; the belt shows a pip for each of the
//    five; the ring hangs in the air, not yet drawn.
// 2. A ring with no rage is read and says "not enough rage": nothing spent,
//    nothing thrown; and once drawn, the ring no longer hangs (the Z does).
// 3. Heroic Throw: a ring with rage throws an axe at the grunt ahead, which
//    lands for 20 and staggers it, for 15 rage; drawn again at once, it isn't
//    ready.
// 4. Shield Wall: a Z raises it for 25 rage, the shield glows, and a brute's
//    heavy blow on the shield takes nothing off and doesn't numb the arm; once
//    it lapses, the same blow breaks the guard as before.
// 5. Sweeping Strikes: a V for 30 rage, and a swing at one of two brutes side
//    by side hurts the other too.
// 6. A sword swing with the grip held fires nothing (and still cuts), and nor
//    do slashes, chops, thrusts and blocks made with it held.
// 7. A grip at a shoulder, a hip or the tool loop never arms.
// 8. `?arena&class=ranger&gestures` and `&class=mage&gestures` still run the
//    prototype, with the game's own gestures standing aside; `?arena` alone is
//    the warrior with gestures.
// 9. No page errors.

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
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
/** Run the game `s` seconds, your health kept full and the waves held back. */
const step = (s) =>
  page.evaluate((s) => {
    const { game, classKit } = window.__descent;
    for (let t = 0; t < s - 1e-9; t += 1 / 72) {
      if (game.player.alive) game.player.hp = game.player.maxHp;
      game.phaseTime = -1e6;
      game.update(1 / 72);
      classKit?.update(1 / 72);
    }
  }, s);

async function enter(query) {
  await page.goto(`${base}/?emulate&nodevui&${query}`);
  await page.waitForFunction(() => window.__descent?.game, null, { timeout: 120000 });
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  await page.evaluate(async () => {
    window.__descent.paused = true;
    window.__strokes = await import('/tests/support/gestureStrokes.ts');
  });
  await step(1 / 72);
}

/**
 * Play a stroke with the right hand: the grip squeezed at its first point,
 * the hand moved along it frame by frame, the grip let go at its last.
 * `how` is `shape:<id>`, `play:<move>` or `still` (a grip held at `at`, body
 * frame). Returns the gestures' last outcome.
 */
async function play(how, { at = null, seed = 1 } = {}) {
  const n = await page.evaluate(
    ([how, at, seed]) => {
      const { game } = window.__descent;
      const S = window.__strokes;
      const r = S.rng(seed);
      const stroke = how.startsWith('shape:')
        ? S.performShape(how.slice(6), r)
        : how.startsWith('play:')
          ? S.performPlay(how.slice(5), r)
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
      return window.__stroke.length;
    },
    [how, at, seed],
  );
  await xrFrames(2);
  await page.evaluate(() => window.__descent.device.controllers.right.updateButtonValue('squeeze', 1));
  await xrFrames(2);
  await page.evaluate((n) => {
    const { game } = window.__descent;
    const grip = game.player.input.hands.right.grip;
    for (let i = 0; i < n; i++) {
      grip.position.fromArray(window.__stroke[i]);
      grip.updateMatrix();
      game.player.hp = game.player.maxHp;
      game.phaseTime = -1e6;
      game.update(1 / 72);
    }
  }, n);
  await page.evaluate(() => {
    const p = window.__stroke[window.__stroke.length - 1];
    window.__descent.device.controllers.right.position.set(p[0], p[1], p[2]);
    window.__descent.device.controllers.right.updateButtonValue('squeeze', 0);
  });
  await xrFrames(2);
  await page.evaluate(() => {
    const grip = window.__descent.game.player.input.hands.right.grip;
    grip.position.fromArray(window.__stroke[window.__stroke.length - 1]);
    grip.updateMatrix();
  });
  await step(1 / 72);
  return page.evaluate(() => {
    const l = window.__descent.game.gestures.last;
    return { event: l?.event, id: l?.verdict?.id ?? null, miss: l?.verdict?.miss ?? null, ability: l?.ability ?? null, use: l?.use ?? null, reason: l?.reason ?? null };
  });
}

/**
 * Swing the sword level, right to left across the front of you, through an
 * XR frame per step so the grip's pose changes between steps (the grip held
 * throughout if `grip`). Then bring the hand back slowly.
 */
async function swing(grip = false) {
  const q = [-0.5, 0, 0, 0.866]; // the blade level, pointing ahead
  if (grip) {
    await page.evaluate(() => window.__descent.device.controllers.right.updateButtonValue('squeeze', 1));
  }
  for (let i = 0; i <= 14; i++) {
    const x = 0.45 - i * 0.065;
    await page.evaluate(
      ([x, q]) => {
        const r = window.__descent.device.controllers.right;
        r.position.set(x, 1.3, -0.25);
        r.quaternion.set(...q);
      },
      [x, q],
    );
    await xrFrames(1);
    await step(1 / 72);
  }
  if (grip) await page.evaluate(() => window.__descent.device.controllers.right.updateButtonValue('squeeze', 0));
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    await page.evaluate(([x, y, z]) => window.__descent.device.controllers.right.position.set(x, y, z), [-0.46 + 0.66 * t, 1.3 - 0.3 * t, -0.25]);
    await xrFrames(1);
    await step(0.1);
  }
}

/** Put `kind` up ahead of you: `ahead` m along your gaze and `side` m to its right. Stepped until it has risen. */
async function spawn(kind, ahead, side = 0) {
  await page.evaluate(
    ([kind, ahead, side]) => {
      const { game } = window.__descent;
      const V = game.player.rig.position.constructor;
      const head = game.player.headPosition(new V());
      const f = game.player.camera.getWorldDirection(new V()).setY(0).normalize();
      const p = head.clone().addScaledVector(f, ahead).add(new V(-f.z, 0, f.x).multiplyScalar(side)).setY(0);
      game.addEnemy(kind, p);
    },
    [kind, ahead, side],
  );
  await step(3);
}
/** Hold every enemy where it's put: `ahead` and `side` as in `spawn`, in the order they came. */
const place = (spots) =>
  page.evaluate((spots) => {
    const { game } = window.__descent;
    const V = game.player.rig.position.constructor;
    const head = game.player.headPosition(new V());
    const f = game.player.camera.getWorldDirection(new V()).setY(0).normalize();
    game.enemies.forEach((e, i) => {
      const [ahead, side] = spots[i];
      e.position.copy(head.clone().addScaledVector(f, ahead).add(new V(-f.z, 0, f.x).multiplyScalar(side)).setY(0));
      e.knockback?.set(0, 0, 0);
    });
  }, spots);
const clearEnemies = () =>
  page.evaluate(() => {
    const { game } = window.__descent;
    for (const e of game.enemies) game.scene.remove(e.root);
    game.enemies.length = 0;
  });
const foes = () => page.evaluate(() => window.__descent.game.enemies.map((e) => ({ kind: e.kind, hp: e.hp, state: e.state, hittable: e.hittable })));
const stats = () => page.evaluate(() => ({ ...window.__descent.combatStats }));
const rage = (value) => page.evaluate((v) => (v === undefined ? window.__descent.game.player.rage : (window.__descent.game.player.rage = v)), value);

// ---------------------------------------------------------------- 1.
await enter('arena&class=warrior');
const start = await page.evaluate(() => {
  const { game } = window.__descent;
  return {
    enabled: game.gestures.enabled,
    abilities: game.player.stats.abilities,
    hinted: game.gestures.hinted,
    classKit: window.__descent.classKit,
  };
});
check(start.enabled && start.classKit === null, `?arena&class=warrior plays the warrior with the game's gestures on (${JSON.stringify({ enabled: start.enabled })})`);
check(
  JSON.stringify(start.abilities) === JSON.stringify(['warCry', 'earthshaker', 'heroicThrow', 'shieldWall', 'sweepingStrikes']),
  `with every base ability (${start.abilities.join(', ')})`,
);
check(start.hinted === 'ring', `the ring, not yet drawn, hangs in the air ahead (${start.hinted})`);

// ---------------------------------------------------------------- 2.
await spawn('grunt', 7);
await rage(0);
{
  const res = await play('shape:ring', { seed: 11 });
  const after = await page.evaluate(() => ({ rage: window.__descent.game.player.rage, flying: window.__descent.game.combat.axes.flying, hinted: window.__descent.game.gestures.hinted }));
  check(res.id === 'ring' && res.ability === 'heroicThrow' && res.use === 'poor' && after.rage === 0 && after.flying === 0, `a ring with no rage is read, and says not enough rage: nothing spent or thrown (${JSON.stringify(res)})`);
  check(after.hinted === 'z', `drawn once, the ring no longer hangs; the Z does (${after.hinted})`);
}

// ---------------------------------------------------------------- 3.
{
  await place([[6, 0]]);
  const before = (await foes())[0];
  await rage(100);
  const res = await play('shape:ring', { seed: 12 });
  const thrown = await page.evaluate(() => ({ rage: window.__descent.game.player.rage, flying: window.__descent.game.combat.axes.flying }));
  check(res.use === 'cast' && thrown.flying === 1 && Math.abs(100 - thrown.rage - 15) <= 2, `a ring with rage throws an axe for 15 rage (${JSON.stringify(res)}, rage ${thrown.rage.toFixed(1)})`);
  let landed = null;
  for (let i = 0; i < 12 && !landed; i++) {
    await step(0.05);
    const s = await stats();
    if (s.throws) landed = { ...(await foes())[0] };
  }
  check(landed && before.hp - landed.hp === 20 && landed.state === 'stagger', `it lands on the grunt for 20 and staggers it (${before.hp} → ${landed?.hp}, ${landed?.state})`);
  const again = await play('shape:ring', { seed: 13 });
  check(again.use === 'cooling', `drawn again at once, Heroic Throw isn't ready (${again.use})`);
}

// ---------------------------------------------------------------- 4.
await clearEnemies();
await spawn('brute', 4);
{
  await place([[4, 0]]);
  await rage(100);
  const res = await play('shape:z', { seed: 21 });
  const up = await page.evaluate(() => {
    const { player } = window.__descent.game;
    player.shield.update(player.rig, 1 / 72);
    let material = null;
    player.shield.model.traverse((o) => (material ??= o.isMesh ? o.material : null));
    return { rage: player.rage, left: player.abilities.left('shieldWall'), glow: material.emissive.getHex() };
  });
  check(res.id === 'z' && res.use === 'cast' && Math.abs(100 - up.rage - 25) <= 2 && up.left > 5.5, `a Z raises Shield Wall for 25 rage, for 6 s (${JSON.stringify(res)}, ${up.left.toFixed(2)} s)`);
  check(up.glow !== 0, `the shield glows (${up.glow.toString(16)})`);
  /** A brute's heavy blow swept straight through the shield's board, from in front of it. */
  const heavy = () =>
    page.evaluate(() => {
      const { game, combatStats } = window.__descent;
      const { player, combat } = game;
      const brute = game.enemies.find((e) => e.kind === 'brute');
      const attack = brute.def.attacks.find((a) => a.guardBreak);
      player.hp = player.maxHp;
      player.shield.numb = 0;
      game.update(1 / 72); // the shield's pose for this frame
      const V = player.rig.position.constructor;
      const c = player.shield.board.getWorldPosition(new V());
      const n = brute.position.clone().sub(c).setY(0).normalize();
      const up = new V(0, 0.3, 0);
      const walled = combatStats.walled;
      const result = combat.sweep(brute, attack, c.clone().addScaledVector(n, 0.3).sub(up), c.clone().addScaledVector(n, 0.3).add(up), c.clone().addScaledVector(n, -0.05).sub(up), c.clone().addScaledVector(n, -0.05).add(up));
      return { result, lost: player.maxHp - player.hp, numb: player.shield.numb, walled: combatStats.walled - walled };
    });
  const held = await heavy();
  check(held.result === 'blocked' && held.lost === 0 && held.numb === 0 && held.walled === 1, `behind Shield Wall a brute's heavy blow on the shield takes nothing and doesn't numb the arm (${JSON.stringify(held)})`);
  await step(6.2);
  const broke = await heavy();
  check(broke.result === 'hit' && broke.lost > 0 && broke.numb > 0, `once it lapses, the same blow breaks the guard as before (${JSON.stringify(broke)})`);
}

// ---------------------------------------------------------------- 5.
await clearEnemies();
await spawn('brute', 1.3, -0.35);
await spawn('brute', 1.3, 0.55);
{
  await rage(100);
  const res = await play('shape:v', { seed: 31 });
  const on = await page.evaluate(() => ({ rage: window.__descent.game.player.rage, left: window.__descent.game.player.abilities.left('sweepingStrikes') }));
  check(res.id === 'v' && res.use === 'cast' && Math.abs(100 - on.rage - 30) <= 2 && on.left > 7.5, `a V starts Sweeping Strikes for 30 rage, for 8 s (${JSON.stringify(res)}, ${on.left.toFixed(2)} s)`);
  let hurt = false;
  let s0 = await stats();
  let s1 = s0;
  for (let tries = 0; tries < 4 && !hurt; tries++) {
    await place([[1.1, -0.45], [1.1, 0.45]]);
    const b = await foes();
    s0 = await stats();
    await swing();
    s1 = await stats();
    const a = await foes();
    hurt = s1.swept > s0.swept && a.every((f, i) => f.hp < b[i].hp);
  }
  check(hurt, `a swing at one of two brutes side by side hurts both (hits ${s1.hits - s0.hits}, swept ${s1.swept - s0.swept})`);
}

// ---------------------------------------------------------------- 6.
{
  const before = await page.evaluate(() => ({ ...window.__descent.game.gestures.stats, casts: { ...window.__descent.game.gestures.stats.casts } }));
  await place([[1.1, -0.45], [1.1, 0.45]]);
  const s0 = await stats();
  await rage(100);
  await swing(true);
  const s1 = await stats();
  const after = await page.evaluate(() => ({ last: window.__descent.game.gestures.last, casts: { ...window.__descent.game.gestures.stats.casts } }));
  check(
    JSON.stringify(after.casts) === JSON.stringify(before.casts) && (after.last.verdict?.id ?? null) === null,
    `a sword swing with the grip held fires nothing (${after.last.event}${after.last.verdict ? `, ${after.last.verdict.miss}` : ''})`,
  );
  check(s1.hits > s0.hits, `and the sword still cuts (${s1.hits - s0.hits} hits)`);
  await clearEnemies();
  let seed = 100;
  const fired = [];
  for (const move of ['slash', 'backhand', 'chop', 'diagonal', 'diagonalBack', 'uppercut', 'thrust', 'blockHigh', 'blockSide']) {
    for (let k = 0; k < 2; k++) {
      const res = await play(`play:${move}`, { seed: seed++ });
      if (res.id !== null || res.use !== null) fired.push(`${move}: ${res.id}`);
    }
  }
  check(fired.length === 0, `slashes, chops, thrusts and blocks with the grip held read as nothing (${fired.join(', ') || 'none fired'})`);
}

// ---------------------------------------------------------------- 7.
for (const [place, at] of [
  ['the right shoulder', [0.2, -0.12, -0.1]],
  ['the left shoulder', [-0.2, -0.12, -0.1]],
  ['the right hip', [0.19, -0.7, 0.05]],
  ['the tool loop', [0.19, -0.66, -0.16]],
]) {
  const res = await play('still', { at });
  check(res.event === 'taken', `a grip at ${place} never arms (${JSON.stringify(res)})`);
}

// ---------------------------------------------------------------- 8.
for (const cls of ['ranger', 'mage']) {
  await enter(`arena&class=${cls}&gestures`);
  await page.waitForFunction(() => window.__descent.classKit?.recorder, null, { timeout: 30000 });
  const proto = await page.evaluate(() => ({ cls: window.__descent.classKit.cls, mode: window.__descent.classKit.mode, ours: window.__descent.game.gestures.enabled }));
  check(proto.cls === cls && proto.mode === 'fight' && !proto.ours, `?arena&class=${cls}&gestures runs the prototype, the game's gestures standing aside (${JSON.stringify(proto)})`);
}
await enter('arena');
const plain = await page.evaluate(() => ({ kit: window.__descent.classKit, ours: window.__descent.game.gestures.enabled, ring: window.__descent.game.gestures.hinted }));
check(plain.kit === null && plain.ours && plain.ring === 'ring', `?arena alone is the warrior, with gestures (${JSON.stringify(plain)})`);

check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
