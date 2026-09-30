// The abilities' effects against the budget (issues/16-effects-within-the-budget.md,
// issues/27-every-class-through-oakvale.md): `?arena&class=<class>&perf` for
// each class in headless Chromium with the IWER emulator, both eyes drawn,
// with the class's biggest effects up at once. Start `npx vite --port 5173`, then:
//
//   node .scratch/abilities/checks/effects-budget.mjs [http://localhost:5173] [out/]
//
// With `out/`, it writes a screenshot per class and `effects-budget.json`.
//
// How it measures. The arena is paused and stepped from inside the page, the
// waves held back and five grunts stood in an arc 7 m in front of you. Each
// class's abilities are fired through Combat as the game fires them (cooldowns
// cleared and the bar refilled between them, so everything is up at once, and
// the talents' tier-3 abilities added: the arena has no talents), and a few
// frames later the frame is drawn twice: as it is, and with every ability
// effect hidden (thrown axes, arrows, bolts, traps, the mark, the Blizzard,
// the Ice Barrier's ring, the vines, shockwaves and the shared particles). The difference in the renderer's draw calls and triangles
// is what the abilities cost at that moment, over both eyes; the budget of 10
// draw calls and 5,000 triangles is per frame drawn, so it is checked per eye.
// The floating words (each blow's number, an ability's name) are the game's
// text, drawn for every sword hit too, so they're counted beside the budget,
// not in it.
// It also counts the point lights alight (at most the pool's four).
//
// The worst moments:
// - warrior: the War Cry and Earthshaker's shockwaves and sparks, three Heroic
//   Throws in the air, Shield Wall and Sweeping Strikes up, Mortal Strike and
//   Shield Slam armed.
// - ranger: three traps lying (two snares and an explosive), a rooted grunt's
//   vines, Hunter's Mark on another, Trueshot on, a Volley's fan and four more
//   arrows in the air, and Scatter's gust.
// - mage: sixteen bolts in the air (a Pyroblast's among them), a Blizzard
//   falling on the grunts, the Ice Barrier's ring, Frost Nova's shockwave and a
//   Chain Lightning bolt arcing through the pack.
//
// Playwright is the global install; Chromium is the pre-installed one.

import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3];
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1600, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};
const note = (what) => console.log(`     ${what}`);
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

const BUDGET = { calls: 10, triangles: 5000, lights: 4 };

/** Into the arena as `cls` with the readout, paused, both eyes drawn, the helpers on `window.__fx`. */
async function enter(cls) {
  await page.goto(`${base}/?emulate&nodevui&perf&arena&class=${cls}`);
  await page.waitForFunction(() => window.__descent?.game, null, { timeout: 120000 });
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  await page.evaluate(() => {
    const d = window.__descent;
    d.paused = true;
    d.device.stereoEnabled = true;
    d.device.fovy = (96 * Math.PI) / 180;
    const { game } = d;
    const { player, combat } = game;
    const V = player.rig.position.constructor;
    const { hands } = player.input;
    /** A grip where the controller would put it (rig space), and the emulated controller with it. */
    const hold = (hand, p, q = [0, 0, 0, 1]) => {
      const g = hands[hand].grip;
      g.position.set(...p);
      g.quaternion.set(...q);
      g.updateMatrix();
      const c = d.device.controllers[hand];
      c.position.set(...p);
      c.quaternion.set(...q);
    };
    const kept = [];
    /** One frame: the waves held back, your health full, the grunts kept where they were stood. */
    const tick = (dt = 1 / 72) => {
      game.phaseTime = -1e6;
      player.hp = player.maxHp;
      for (const k of kept) if (k.e.alive) k.e.position.set(k.x, k.e.position.y, k.z);
      player.rig.updateMatrixWorld(true);
      game.update(dt);
    };
    const steps = (s) => {
      for (let t = 0; t < s - 1e-9; t += 1 / 72) tick();
    };
    const head = () => player.headPosition(new V());
    /** Five grunts in an arc `ahead` m in front of you, held there. */
    const stand = (ahead = 7) => {
      player.place(0, 4, 0);
      player.rig.updateMatrixWorld(true);
      const h = head();
      for (let i = 0; i < 5; i++) {
        const a = ((i - 2) * 12 * Math.PI) / 180;
        game.addEnemy('grunt', new V(h.x + Math.sin(a) * ahead, 0, h.z - Math.cos(a) * ahead));
      }
      steps(3);
      for (const e of game.enemies) kept.push({ e, x: e.position.x, z: e.position.z });
    };
    /** Where the right hand points and you look, straight at `e` (or ahead). */
    const aimAt = (e) => {
      const from = head();
      const at = e ? e.position.clone().setY(e.position.y + 1.2) : from.clone().add(new V(0, 0, -5));
      const dir = at.sub(from).normalize();
      return { from, hand: dir.clone(), gaze: dir.clone() };
    };
    /** Use `ability` through Combat as a gesture would, its cooldown cleared and the bar full first. */
    const use = (ability, aim) => {
      player.abilities.clear();
      player.resource = player.bar.size;
      return combat.use(ability, aim);
    };
    /** Every Object3D an effect owner draws with: its own fields, and one level down (pools, rings). */
    const objectsOf = (owner, into = new Set(), depth = 2) => {
      if (!owner || depth < 0) return into;
      for (const v of Object.values(owner)) {
        if (!v || typeof v !== 'object') continue;
        // An effect's target (an axe's, the mark's) is an enemy: not the effect's to draw.
        if ('hp' in v || 'def' in v || v.isSkinnedMesh) continue;
        if (v.isObject3D) into.add(v);
        else if (Array.isArray(v)) for (const x of v) x?.isObject3D ? into.add(x) : x && typeof x === 'object' && objectsOf(x, into, depth - 1);
        else if (!v.isVector3 && !v.isQuaternion && !v.isMatrix4 && !v.isMaterial && !v.isBufferGeometry && v !== player && v !== game) objectsOf(v, into, depth - 1);
      }
      return into;
    };
    /**
     * Every ability effect in the scene: what's hidden to see what they cost.
     * The floating words (a blow's number, an ability's name) are the game's
     * text, drawn for every sword hit as for an ability: with `words`, only they.
     */
    const effects = (words = false) => {
      const set = new Set();
      if (words) for (const f of game.text.active ?? []) set.add(f.sprite);
      else for (const owner of [combat.axes, combat.bolts, combat.blizzard, combat.barrier, combat.ranger?.shots, combat.ranger?.traps, combat.ranger?.mark, game.vines, game.shockwaves, game.particles]) objectsOf(owner, set);
      // Only what is in the scene (not a pool's spare, never added).
      return [...set].filter((o) => {
        let p = o;
        while (p.parent) p = p.parent;
        return p.isScene;
      });
    };
    /** What each effect object draws, as the renderer would count it: visible, its instances, its triangles for one eye. */
    const breakdown = () =>
      effects()
        .filter((o) => o.visible && (o.isMesh || o.isPoints || o.isSprite || o.isLineSegments || o.isLine))
        .map((o) => {
          const g = o.geometry;
          const per = g ? (g.index ? g.index.count : g.attributes.position.count) / 3 : 0;
          const n = o.isInstancedMesh ? o.count : 1;
          const range = g && Number.isFinite(g.drawRange.count) ? Math.min(g.drawRange.count / 3, per) : per;
          return { name: o.name || o.constructor.name, instances: n, triangles: Math.round((o.isPoints ? 0 : range) * n), points: o.isPoints ? Math.min(g.drawRange.count, g.attributes.position.count) : 0 };
        })
        .filter((o) => o.instances > 0);
    const lights = () => {
      let n = 0;
      game.scene?.traverse?.((o) => o.isPointLight && o.visible && o.intensity > 0 && n++);
      if (!game.scene) player.rig.parent.traverse((o) => o.isPointLight && o.visible && o.intensity > 0 && n++);
      return n;
    };
    window.__fx = { d, game, player, combat, V, hold, tick, steps, head, stand, aimAt, use, effects, breakdown, lights };
  });
}

/** What hiding the effects (or the floating `words`) takes off the frame: draw calls and triangles, both eyes. */
async function without(words) {
  await xrFrames(1);
  const all = await page.evaluate(() => ({ ...window.__descent.renderer.info.render }));
  await page.evaluate((words) => {
    const list = window.__fx.effects(words).filter((o) => o.visible);
    for (const o of list) o.visible = false;
    window.__hidden = list;
  }, words);
  await xrFrames(1);
  const less = await page.evaluate(() => ({ ...window.__descent.renderer.info.render }));
  await page.evaluate(() => {
    for (const o of window.__hidden) o.visible = true;
  });
  return { calls: all.calls - less.calls, triangles: all.triangles - less.triangles };
}
/** The frame as drawn, the abilities' effects' share of it, and the floating words' share. */
async function measure() {
  await xrFrames(1);
  const frame = await page.evaluate(() => ({ ...window.__descent.renderer.info.render, programs: window.__descent.renderer.info.programs.length }));
  const abilities = await without(false);
  const words = await without(true);
  await xrFrames(1);
  const parts = await page.evaluate(() => window.__fx.breakdown());
  const lights = await page.evaluate(() => window.__fx.lights());
  return {
    frame: { calls: frame.calls, triangles: frame.triangles, programs: frame.programs },
    abilities,
    perEye: { calls: abilities.calls / 2, triangles: abilities.triangles / 2 },
    words: { calls: words.calls / 2, triangles: words.triangles / 2 },
    parts,
    lights,
  };
}

const results = {};
function report(cls, m, what) {
  results[cls] = { ...m, what };
  note(`${cls}: ${what}`);
  note(`the frame (both eyes): ${m.frame.calls} draw calls, ${(m.frame.triangles / 1000).toFixed(1)}k triangles, ${m.frame.programs} programs, ${m.lights} point lights`);
  note(`the abilities' share: ${m.abilities.calls} draw calls and ${m.abilities.triangles} triangles over both eyes; ${m.perEye.calls} and ${m.perEye.triangles} an eye`);
  note(`the floating words besides (numbers and names, the game's text for every blow): ${m.words.calls} draw calls and ${m.words.triangles} triangles an eye`);
  note(`drawn: ${m.parts.map((p) => `${p.name} ×${p.instances} (${p.points ? `${p.points} points` : `${p.triangles} tris`})`).join(', ')}`);
  check(m.perEye.calls < BUDGET.calls && m.perEye.triangles < BUDGET.triangles, `${cls}'s worst moment is within the abilities' budget: ${m.perEye.calls} draw calls (under ${BUDGET.calls}) and ${m.perEye.triangles} triangles (under ${BUDGET.triangles}) an eye`);
  check(m.lights <= BUDGET.lights, `and ${m.lights} point lights alight (the pool's ${BUDGET.lights} at most)`);
}
const shot = async (name) => out && page.screenshot({ path: `${out}/${name}.png` });

// ================================================================ the warrior
await enter('warrior');
{
  const fired = await page.evaluate(() => {
    const { game, player, combat, hold, tick, steps, stand, aimAt, use } = window.__fx;
    stand(5);
    player.stats = { ...player.stats, abilities: [...player.stats.abilities, 'mortalStrike', 'shieldSlam'] };
    const got = {};
    // Earthshaker: the sword's tip driven down into the floor, fast.
    player.rage = 100;
    const DOWN = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
    const slams = window.__descent.combatStats.slams;
    for (let i = 0; i <= 6; i++) {
      hold('right', [0.3, 1.5 - i * 0.14, -0.45], DOWN);
      tick();
    }
    got.earthshaker = window.__descent.combatStats.slams > slams;
    hold('right', [0.35, 0.8, 0.1]);
    player.rage = 100;
    got.warCry = combat.warCry(game.enemies);
    for (let i = 0; i < 3; i++) got[`heroicThrow${i + 1}`] = use('heroicThrow', aimAt(game.enemies[i + 1]));
    for (const a of ['shieldWall', 'sweepingStrikes', 'mortalStrike', 'shieldSlam']) got[a] = use(a);
    steps(3 / 72);
    return got;
  });
  check(fired.earthshaker && fired.warCry && Object.entries(fired).filter(([k]) => k !== 'earthshaker' && k !== 'warCry').every(([, v]) => v === 'cast'), `the warrior's all up at once: ${JSON.stringify(fired)}`);
  const axes = await page.evaluate(() => window.__fx.combat.axes.mesh.count);
  const m = await measure();
  await shot('warrior');
  report('warrior', m, `Earthshaker and the War Cry, ${axes} Heroic Throws in the air, Shield Wall, Sweeping Strikes, Mortal Strike and Shield Slam`);
}

// ================================================================ the ranger
await enter('ranger');
{
  const fired = await page.evaluate(() => {
    const { game, player, combat, hold, tick, steps, stand, aimAt, use, head, V } = window.__fx;
    stand(7);
    player.stats = { ...player.stats, abilities: [...player.stats.abilities, 'trueshot', 'explosiveTrap'] };
    const kit = combat.ranger;
    // The bow held out ahead, at the grunts.
    const s = Math.SQRT1_2;
    hold('left', [-0.05, 1.45, -0.5], [s, 0, 0, s]);
    hold('right', [0.35, 0.8, 0.1]);
    tick();
    const got = {};
    // Three traps at your feet, a step apart (a fourth would end the oldest).
    const at = head();
    for (const [i, a] of [[0, 'snareTrap'], [1, 'snareTrap'], [2, 'explosiveTrap']]) {
      player.place(at.x + (i - 1) * 1.2, at.z, 0);
      player.rig.updateMatrixWorld(true);
      tick();
      got[`${a}${i}`] = use(a);
    }
    player.place(at.x, at.z + 1.5, 0);
    player.rig.updateMatrixWorld(true);
    tick();
    // One grunt rooted, as a snare holds it; another marked.
    got.rooted = game.enemies[0].afflict('rooted', 10) > 0;
    got.huntersMark = use('huntersMark', aimAt(game.enemies[2]));
    got.trueshot = use('trueshot');
    // A Volley's fan, then four more arrows, loosed at full draw along the bow.
    got.volley = use('volley');
    kit.loose(1);
    for (let i = 0; i < 4; i++) {
      tick();
      kit.loose(1);
    }
    got.scatter = use('scatter');
    steps(2 / 72);
    return { got, flying: kit.shots.flying.length, traps: kit.traps.laid.length };
  });
  check(Object.entries(fired.got).every(([, v]) => v === 'cast' || v === true) && fired.traps === 3 && fired.flying >= 9, `the ranger's all up at once: ${JSON.stringify(fired)}`);
  const m = await measure();
  await shot('ranger');
  report('ranger', m, `three traps lying, a rooted grunt's vines, Hunter's Mark, Trueshot, ${fired.flying} arrows in the air (a Volley's among them) and Scatter's gust`);
}

// ================================================================ the mage
await enter('mage');
{
  const fired = await page.evaluate(() => {
    const { game, player, combat, hold, tick, steps, stand, aimAt, use, head, V } = window.__fx;
    stand(7);
    player.stats = { ...player.stats, abilities: [...player.stats.abilities, 'pyroblast', 'iceBarrier'] };
    hold('left', [-0.35, 0.8, 0.1]);
    hold('right', [0.35, 0.8, 0.1]);
    tick();
    const got = {};
    const from = () => head().add(new V(0.25, -0.2, -0.3));
    const shape = { speed: 20, radius: 0.08 };
    // A Chain Lightning bolt into the pack; it lands and arcs.
    got.chainLightning = use('chainLightning');
    const e = game.enemies[2];
    const dir = e.position.clone().setY(e.position.y + 1.2).sub(from()).normalize();
    combat.castBolt('right', from(), dir, shape, 1, 0x6ab8ff);
    for (let i = 0; i < 30 && window.__descent.combatStats.arcs === 0; i++) tick();
    got.arcs = window.__descent.combatStats.arcs;
    // The Blizzard on the grunts, the Ice Barrier, Frost Nova.
    got.blizzard = use('blizzard', aimAt(e));
    got.iceBarrier = use('iceBarrier');
    got.frostNova = use('frostNova');
    // A Pyroblast, then bolts over the grunts' heads until sixteen are in the air.
    got.pyroblast = use('pyroblast');
    const up = new V(0, 0.35, -1).normalize();
    combat.castBolt('right', from(), up, { speed: 6, radius: 0.3 }, 1, 0x6ab8ff);
    for (let i = 0; combat.bolts.bolts.length < 16 && i < 40; i++) {
      const way = up.clone().add(new V((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.2, 0)).normalize();
      combat.castBolt(i % 2 ? 'left' : 'right', from(), way, shape, 1, i % 2 ? 0xb87aff : 0x6ab8ff);
    }
    steps(2 / 72);
    return { got, bolts: combat.bolts.bolts.length, pyro: combat.bolts.bolts.some((b) => b.charge === 'pyroblast'), falling: combat.blizzard.active ?? null };
  });
  check(Object.entries(fired.got).every(([k, v]) => v === 'cast' || (k === 'arcs' && v > 0)) && fired.bolts >= 16 && fired.pyro, `the mage's all up at once: ${JSON.stringify(fired)}`);
  const m = await measure();
  await shot('mage');
  report('mage', m, `${fired.bolts} bolts in the air (a Pyroblast's among them), the Blizzard, the Ice Barrier's ring, Frost Nova's shockwave and Chain Lightning's arcs`);
}

if (out) writeFileSync(`${out}/effects-budget.json`, JSON.stringify(results, null, 1));
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
