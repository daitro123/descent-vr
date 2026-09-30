// The whole zone in one sitting (issues/38-the-whole-zone-in-one-sitting.md):
// a new character played from `?newgame` through Hale's three quests to level
// 5 and the longsword, then over the pass to Brackenmoor's rockfall, in
// headless Chromium with the IWER emulator. Start `npx vite --port 5173`, then:
//
//   node .scratch/oakvale-starting-zone/checks/play-through.mjs [http://localhost:5173] [shots/]
//
// How it plays. The game is paused and stepped from inside the page, 1/72 s
// at a time (`adventure.update`), with teleports between places. Every fight
// is fought through the real combat: the script holds the controllers' grips
// where a player's hands would be and the Player, the sword's swing detector,
// Combat and the camps do the rest. The sword is swung forehand and backhand
// across the nearest enemy from about arm's reach; the shield is held between
// you and whatever blow is coming (the weapon of the nearest enemy mid-attack,
// facing it, or towards an archer drawing on you), and you step back out of a
// slam's reach as it winds up. Enemies block, strike back and can kill you;
// nobody is healed by the script, and a death is played through (you wake,
// walk back and carry on). Hale's board is pressed and the leader's orders
// taken by moving a fist onto them. The walks into the mine and over the pass
// are the left stick, running where nothing fights you.
//
// What it checks, in order:
//  1. A new character at `?newgame` stands 3.5 m from Hale facing them, with a
//     gold "!" over Hale and "Oakvale" floating up.
//  2. Raiders in the Fields: with your back to Hale the board stays folded;
//     looking at them it unfolds; "Not now" folds it and leaves the "!";
//     walking off and back reopens it, and 4 m off folds it; "Accept"; the
//     farm's bandits fought until 3/3; health comes back; handed in for
//     level 2, "+80 XP" and "LEVEL 2" floating over Hale.
//  3. The Lumber Camp: taken; two of its bandits down; a reload resumes it
//     (level, XP, 2/5, where you stood, full health, the camp full again);
//     the rest fought, the leader too; the orders taken by hand; handed in
//     for level 3.
//  4. A death outside the mine (standing guard down at the watchtower): "YOU
//     DIED", the fade to black, and you wake by the inn's hearth, inside with
//     the door shut, at full health and no rage, with nothing lost; the
//     bandits go home.
//  5. What Lies Below: in through the mouth, and a run in the adit; the cart
//     hall fought; a death in the gallery wakes you on the rail bed outside
//     the mouth, facing it, with the undead you cut down still dead; back in,
//     the rest of the mine fought (level 4 at the dig's brute); the Warden
//     seated from the gate, rising as you step through it, fought until it
//     falls; "Return to Marshal Hale", its arrow hidden in the mine.
//  6. A reload: the Warden stays beaten (an empty throne in its hall).
//  7. The hand-in: level 5 at 1,000 XP, the longsword picked and worn, gone from
//     Hale's hip, Hale pointing south to Brackenmoor, the tracker gone.
//  8. The run south over the crest: the zone changes 2 m past it,
//     "Brackenmoor" floats up and a save is written there; the road ends at
//     the rockfall, with Oakvale mostly stand-ins and unloaded behind you.
//  9. Along the way, the frame's draw calls, triangles and shader programs,
//     both eyes (IWER in stereo, 96° square per eye), the worst of several
//     headings, from the village, inside the inn, the Warden's hall from its
//     gate and the crest looking north with both zones loaded: draw calls and
//     point lights against the budget, triangles reported against the rule of
//     thumb. And the healing orbs the fights dropped: each one picked up
//     healed a quarter of your health.
//
// Playwright is the global install; Chromium is the pre-installed one.

import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const shots = process.argv[3];
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
// Wide enough that each eye is square in stereo (the emulator's framebuffer keeps the page's first size).
const context = await browser.newContext({ viewport: { width: 1600, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
// Remember what each canvas last said, so the floats can be read back.
await page.addInitScript(() => {
  const P = CanvasRenderingContext2D.prototype;
  const fill = P.fillText;
  const clear = P.clearRect;
  P.fillText = function (text, ...rest) {
    (this.__texts ??= []).push(String(text));
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
/** XR frames until the World has built every chunk it wants (the page's frames keep the World going while paused). */
async function settled(max = 400) {
  for (let i = 0; i < max; i++) {
    if ((await page.evaluate(() => window.__descent.world.chunksPending)) === 0) return;
    await xrFrames(1);
  }
}
const shot = async (name) => {
  if (!shots) return;
  await xrFrames(3);
  await page.screenshot({ path: `${shots}/${name}.png` });
};

// The script's hands, installed in the page after each load: grips held where
// a player's hands would be, and the game stepped a frame at a time.
function install() {
  const d = window.__descent;
  const { adventure, player } = d;
  const { hands } = player.input;
  const V = player.rig.position.constructor;
  const BLADE = [-0.5, 0, 0, 0.866]; // the blade level, pointing ahead
  const GUARD = [-0.22, 1.3, -0.35]; // the shield up in front of your chest
  // The shield's board faces along its fist's -Z pitched down 45° (CONFIG.shield.pitchDeg): tip the fist up 45° to stand it upright.
  const UPRIGHT = [Math.sin(Math.PI / 8), 0, 0, Math.cos(Math.PI / 8)];
  const Q = player.rig.quaternion.constructor;
  const M = new player.rig.matrix.constructor();
  const tilt = new Q(...UPRIGHT);
  const _a = new V();
  const _b = new V();
  const DOWN = { left: [-0.35, 0.8, 0.1], right: [0.35, 0.8, 0.1] };
  /** A grip where the controller would put it (rig space), and the emulated controller with it, so an XR frame doesn't move it. */
  const hold = (hand, p, q = [0, 0, 0, 1]) => {
    const g = hands[hand].grip;
    g.position.set(...p);
    g.quaternion.set(...q);
    g.updateMatrix();
    const c = d.device.controllers[hand];
    c.position.set(...p);
    c.quaternion.set(...q);
  };
  const tick = (dt = 1 / 72) => {
    player.rig.updateMatrixWorld(true);
    adventure.update(dt);
  };
  const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const head = () => d.camera.getWorldPosition(new V());
  const down = () => {
    hold('left', DOWN.left);
    hold('right', DOWN.right);
  };
  /**
   * What a player does with the shield: put it between you and the blow that's
   * coming (the nearest enemy's weapon mid-attack, or an archer drawing on you),
   * facing it, and step back out of a slam's reach as it winds up. Otherwise it's
   * held up in front of your chest.
   */
  const dodged = new WeakMap();
  const defend = () => {
    const me = head();
    let threat = null;
    let best = Infinity;
    for (const e of adventure.gatherFoes()) {
      if (!e.alive || !e.attacking || !e.attack || e.attack.kind === 'summon') continue;
      const dist = flat(e.position, me);
      const reach = e.attack.kind === 'shot' ? 40 : 4;
      if (dist < reach && dist < best) {
        best = dist;
        threat = e;
      }
    }
    if (!threat) return hold('left', GUARD, UPRIGHT);
    const { attack } = threat;
    if (!attack.blockable && attack.kind === 'slam') {
      // Out of its reach, once a slam, while it winds up.
      if (threat.phase === 'windup' && dodged.get(threat) !== attack && best < (attack.radius ?? 1.5) + 1.2) {
        dodged.set(threat, attack);
        const k = ((attack.radius ?? 1.5) + 1.4) / Math.max(best, 0.1);
        const x = threat.position.x + (me.x - threat.position.x) * k;
        const z = threat.position.z + (me.z - threat.position.z) * k;
        d.teleport(x, z, Math.atan2(-(threat.position.x - x), -(threat.position.z - z)));
      }
      return hold('left', GUARD, UPRIGHT);
    }
    // Where the blow will come from: along its weapon towards the tip, or an arrow at your chest.
    if (attack.kind === 'shot') _a.copy(threat.position).setY(threat.position.y + 1.3);
    else {
      threat.weaponSegment(_a, _b);
      _a.lerp(_b, 0.7);
    }
    const chest = me.clone().setY(me.y - 0.3);
    const dir = _a.sub(chest).normalize();
    const at = chest.addScaledVector(dir, 0.42);
    player.rig.updateMatrixWorld(true);
    const local = player.rig.worldToLocal(at);
    local.y = Math.max(0.9, Math.min(local.y, 2.0));
    const face = dir.applyQuaternion(player.rig.quaternion.clone().invert());
    const look = new Q().setFromRotationMatrix(M.lookAt(new V(), face, new V(0, 1, 0))).multiply(tilt);
    hold('left', local.toArray(), look.toArray());
  };
  /** Stand `seconds`, hands down (or the shield up), stopping if you fall (not while you're already down). */
  const wait = (seconds, { guard = false } = {}) => {
    const up = player.alive;
    for (let t = 0; t < seconds; t += 1 / 72) {
      if (guard) defend();
      else hold('left', DOWN.left);
      hold('right', DOWN.right);
      tick();
      if (up && !player.alive) return { dead: true, t };
    }
    return { t: seconds };
  };
  /** Face (x, z) where you stand. */
  const face = (x, z) => {
    const h = head();
    d.teleport(h.x, h.z, Math.atan2(-(x - h.x), -(z - h.z)));
  };
  let side = 1;
  const tally = { swings: 0, landed: 0 };
  /**
   * Fight for up to `seconds` of game time: face the nearest enemy that's up
   * (within `near` m, and `pick`ed), step to about arm's reach, and swing
   * across it, forehand then backhand, the shield up. Stops when `done()`,
   * or when you fall.
   */
  const fight = ({ seconds = 5, near = 30, reach = 0.95, pick = () => true, done = () => false } = {}) => {
    for (let t = 0; t < seconds; ) {
      if (!player.alive) return { dead: true };
      if (done()) return { done: true };
      const me = head();
      // Hurt, with a healing orb lying near: step onto it, as a player would.
      const orb = adventure.orbs.root.children.find((o) => flat(o.position, me) < 10);
      if (orb && player.hp < player.maxHp * 0.8) {
        d.teleport(orb.position.x, orb.position.z, player.rig.rotation.y);
        tick();
        t += 1 / 72;
        continue;
      }
      const foes = adventure.gatherFoes().filter((e) => e.alive && e.hittable && pick(e) && flat(e.position, me) < near);
      if (!foes.length) {
        down();
        tick(0.1);
        t += 0.1;
        continue;
      }
      foes.sort((a, b) => flat(a.position, me) - flat(b.position, me));
      const e = foes[0];
      const dist = flat(e.position, me);
      // Never step in under a slam that's coming down.
      if (e.attacking && e.attack?.kind === 'slam' && e.phase !== 'recover') {
        defend();
        tick();
        t += 1 / 72;
        continue;
      }
      let { x, z } = me;
      if (dist > reach + 0.15 || dist < reach - 0.4) {
        const k = reach / Math.max(dist, 1e-3);
        x = e.position.x + (me.x - e.position.x) * k;
        z = e.position.z + (me.z - e.position.z) * k;
      }
      d.teleport(x, z, Math.atan2(-(e.position.x - x), -(e.position.z - z)));
      const was = e.hp;
      const from = 0.45 * side;
      for (let i = 0; i <= 15; i++) {
        defend();
        hold('right', [from - (from * 2 * i) / 15, 1.25, -0.28], BLADE);
        tick();
      }
      for (let i = 0; i < 8; i++) {
        defend();
        tick();
      }
      t += 24 / 72;
      side = -side;
      tally.swings++;
      if (e.hp < was) tally.landed++;
    }
    return {};
  };
  /** A fist onto a button of Hale's board: in front of it, then onto its face, then back down. */
  const press = (button, hand = 'right') => {
    const key = adventure.board.keys.find((k) => k.button === button);
    if (!adventure.board.isOpen || !key) return false;
    const at = (out) => {
      adventure.board.root.updateMatrixWorld(true);
      return player.rig.worldToLocal(key.mesh.localToWorld(new V(0, 0, 0.02 + out))).toArray();
    };
    for (let i = 0; i < 8; i++) {
      hold(hand, at(0.15));
      tick();
    }
    const was = `${adventure.board.isOpen} ${JSON.stringify(adventure.state.hale)}`;
    for (let i = 0; i < 8; i++) {
      hold(hand, at(0));
      tick();
    }
    down();
    // Pressed if it did something: the board folded, or Hale moved the chain on.
    return `${adventure.board.isOpen} ${JSON.stringify(adventure.state.hale)}` !== was;
  };
  /**
   * A hand-in's pick `i` taken off Hale's board into the bag's first empty
   * slot, as a carry lets it go there (the fist's carry itself is
   * .scratch/inventory/checks/hand-in-picks.mjs's).
   */
  const pick = (i) => {
    const { board } = adventure;
    if (!board.isOpen || !board.picks[i]) return false;
    const slot = adventure.state.inventory.bag.findIndex((b) => !b);
    return adventure.picks.take(i, { in: 'bag', slot }) === null;
  };
  /** A fist onto a point in the world. */
  const touch = (p, hand = 'left') => {
    for (let i = 0; i < 8; i++) {
      player.rig.updateMatrixWorld(true);
      hold(hand, player.rig.worldToLocal(new V(p.x, p.y, p.z)).toArray());
      tick();
    }
    down();
  };
  /** Turn on the spot to `yaw`, without stopping a run. */
  const turn = (yaw) => {
    const h = head();
    player.rig.rotation.y = yaw;
    player.rig.updateMatrixWorld(true);
    const now = head();
    player.rig.position.x += h.x - now.x;
    player.rig.position.z += h.z - now.z;
  };
  // What the enemies drop and what each orb picked up heals; and each save written, with where it put you.
  const drops = { orbs: 0, heals: [] };
  const drop = adventure.orbs.drop.bind(adventure.orbs);
  adventure.orbs.drop = (at) => {
    drops.orbs++;
    drop(at);
  };
  const orbsUpdate = adventure.orbs.update.bind(adventure.orbs);
  adventure.orbs.update = (dt, p) => {
    const before = { hp: p.hp, n: adventure.orbs.root.children.length };
    orbsUpdate(dt, p);
    if (adventure.orbs.root.children.length < before.n && p.hp > before.hp) drops.heals.push({ healed: p.hp - before.hp, missing: p.maxHp - before.hp, maxHp: p.maxHp });
  };
  const writes = [];
  const store = adventure.saves.store;
  const write = store.write.bind(store);
  store.write = (record) => {
    writes.push({ z: record.position.z, interior: record.interior });
    return write(record);
  };
  window.__play = { hold, tick, wait, face, fight, press, pick, touch, turn, down, head, tally, drops, writes };
}

/** Load the Adventure (`query` added), enter VR and pause it, with the script's hands on. */
async function enter(query = '') {
  await page.goto(`${base}/?emulate&nodevui${query}`);
  await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  await page.evaluate(() => (window.__descent.paused = true));
  await page.evaluate(install);
  await page.evaluate(() => window.__play.down());
  await xrFrames(2);
}
/** Keep what's been played: the save written, as when the headset comes off. */
const orbLog = { orbs: 0, heals: [] };
async function reload() {
  const { orbs, heals } = await page.evaluate(() => window.__play.drops);
  orbLog.orbs += orbs;
  orbLog.heals.push(...heals);
  await page.evaluate(async () => {
    window.__descent.adventure.saves.onLeaving();
    await window.__descent.saved();
  });
  await enter();
}

/** What a player would notice about themselves and the chain. */
const look = () =>
  page.evaluate(() => {
    const { adventure, state, world, player, camera } = window.__descent;
    const h = camera.getWorldPosition(camera.position.clone());
    return {
      x: h.x,
      z: h.z,
      hp: player.hp,
      maxHp: player.maxHp,
      rage: player.rage,
      alive: player.alive,
      level: state.level,
      xp: state.xp,
      sword: state.sword,
      inHand: player.sword.sword,
      damage: player.stats.damage,
      marker: state.hale.marker,
      line: state.hale.line,
      board: adventure.board.isOpen,
      // The tracker lists every quest you're on; Hale's chain has one at a time, the last.
      tracker: state.tracker.length ? [state.tracker.at(-1).title, ...state.tracker.at(-1).lines] : null,
      arrow: state.arrow?.target ?? null,
      beaten: state.wardenBeaten,
      atHip: adventure.hale.swordAtHip,
      interior: world.interior,
      outdoors: world.outdoorsShown,
      zone: world.zone.id,
      name: adventure.zoneName.shown,
      fade: adventure.fade.level,
      throne: adventure.throne?.state ?? null,
      arrowShown: adventure.questArrow() !== null,
      running: player.running,
    };
  });
/** Floating words alive now. */
const floats = () => page.evaluate(() => window.__descent.adventure.text.active.map((f) => f.sprite.material.map.image.getContext('2d').__texts?.at(-1) ?? ''));
/** A camp's members: alive and minds. */
const camp = (id) =>
  page.evaluate((id) => window.__descent.camps.camps.find((c) => c.plan.id === id).members.map((m) => ({ alive: m.enemy.alive, mind: m.mind, hp: m.enemy.hp, maxHp: m.enemy.maxHp })), id);

const ZONE = await (async () => {
  await enter('&newgame');
  return page.evaluate(() => {
    const z = window.__descent.world.zoneAt(0, 0);
    return { spawn: z.spawn, hale: z.hale, respawns: z.respawns, places: z.places, orders: z.pickups.find((p) => p.item === 'orders'), mouth: window.__descent.world.mine.mouth };
  });
})();
const HALE = ZONE.hale;
/** Stand `d` m from Hale on the line to the start, facing them. */
async function byHale(d) {
  const dx = ZONE.spawn.x - HALE.x;
  const dz = ZONE.spawn.z - HALE.z;
  const k = d / Math.hypot(dx, dz);
  await page.evaluate(([x, z, h]) => window.__descent.teleport(x, z, Math.atan2(-(h.x - x), -(h.z - z))), [HALE.x + dx * k, HALE.z + dz * k, HALE]);
  await page.evaluate(() => window.__play.wait(0.8));
}
/** Walk up to Hale and press `button` on the board with `hand`. */
async function talk(button, hand = 'right') {
  await byHale(5);
  await byHale(1.9);
  const pressed = await page.evaluate(([b, h]) => window.__play.press(b, h), [button, hand]);
  await page.evaluate(() => window.__play.wait(0.3));
  return pressed;
}
/** Walk up to Hale and carry pick `i` of the hand-in off their board into the bag. */
async function handIn(i = 0) {
  await byHale(5);
  await byHale(1.9);
  const taken = await page.evaluate((i) => window.__play.pick(i), i);
  await page.evaluate(() => window.__play.wait(0.3));
  return taken;
}
/** Stand at (lx, lz) in the mine mouth's frame (x across, z out of the hill), facing (tx, tz) in it. */
async function inMine(lx, lz, tx, tz) {
  await page.evaluate(
    ([m, lx, lz, tx, tz]) => {
      const c = Math.cos(m.yaw);
      const s = Math.sin(m.yaw);
      const w = (a, b) => [m.x + a * c + b * s, m.z - a * s + b * c];
      const [x, z] = w(lx, lz);
      const [X, Z] = w(tx, tz);
      window.__descent.teleport(x, z, Math.atan2(-(X - x), -(Z - z)));
      window.__play.tick();
    },
    [ZONE.mouth, lx, lz, tx, tz],
  );
}
/** Push the left stick (x, y) and let the emulator pass it on. */
async function stick(x, y) {
  await page.evaluate(([x, y]) => window.__descent.device.controllers.left.updateAxes('thumbstick', x, y), [x, y]);
  await xrFrames(2);
}
/** Fight in rounds until `done` (a function body run in the page), or a death, or `rounds` run out. */
async function fightUntil(opts, rounds = 40) {
  for (let i = 0; i < rounds; i++) {
    const r = await page.evaluate((o) => {
      const done = o.done ? new Function(`return (${o.done})`)() : undefined;
      const pick = o.pick ? new Function(`return (${o.pick})`)() : undefined;
      return window.__play.fight({ seconds: 5, near: o.near ?? 30, done, pick });
    }, opts);
    if (r.dead) return 'dead';
    if (r.done) return 'done';
  }
  return 'timeout';
}
/**
 * Fight until `done`, and if you fall, wake, go `back` and carry on: what a
 * player would do. Returns the outcome and how many times you fell.
 */
async function battle(opts, back, rounds = 40, lives = 4) {
  let deaths = 0;
  for (;;) {
    const r = await fightUntil(opts, rounds);
    if (r !== 'dead') return { r, deaths };
    if (++deaths > lives) return { r, deaths };
    await throughDeath();
    await page.evaluate(() => window.__play.wait(12));
    await back();
  }
}
/** After a death: the fade, the dark, the wake. Returns what you saw as you fell and as you woke. */
async function throughDeath() {
  const fell = await look();
  const banner = await page.evaluate(() => window.__descent.adventure.text.active.some((f) => f.sprite.material.map.image.getContext('2d').__texts?.includes('YOU DIED')));
  // It lingers 1.5 s, darkens over 1 s, stays black for 0.5 s, then you wake.
  await page.evaluate(() => window.__play.wait(2.7));
  const dark = (await look()).fade;
  await page.evaluate(() => window.__play.wait(2));
  await settled();
  return { fell, banner, dark, woke: await look() };
}

// ---------------------------------------------------------------- the budget
const BUDGET = { calls: 300, triangles: 300_000, lights: 4 };
const measured = [];
/**
 * The frame's draw calls, triangles and shader programs, both eyes, looking
 * each way in `yaws` from where you stand: the worst of them, with the
 * World's point lights and loaded chunks.
 */
async function measure(label, yaws) {
  await page.evaluate(() => {
    const dev = window.__descent.device;
    dev.stereoEnabled = true;
    dev.fovy = (96 * Math.PI) / 180;
    window.__play.down();
  });
  const views = [];
  for (const yaw of yaws) {
    await page.evaluate((yaw) => {
      window.__play.turn(yaw);
      window.__play.tick(1 / 72);
    }, yaw);
    await settled();
    await xrFrames(4);
    views.push(
      await page.evaluate((yaw) => {
        const { renderer, world } = window.__descent;
        let lights = 0;
        window.__descent.player.rig.parent.traverse((o) => o.isPointLight && lights++);
        const { calls, triangles } = renderer.info.render;
        return { yaw, calls, triangles, programs: renderer.info.programs.length, lights, chunks: { ...world.chunkCounts } };
      }, yaw),
    );
  }
  await page.evaluate(() => {
    const dev = window.__descent.device;
    dev.stereoEnabled = false;
    dev.fovy = Math.PI / 2;
  });
  await xrFrames(2);
  const worst = views.reduce((a, b) => (b.triangles > a.triangles ? b : a));
  const most = Math.max(...views.map((v) => v.calls));
  measured.push({ label, worst, calls: most, views });
  note(
    `${label}: ${most} draw calls, ${(worst.triangles / 1000).toFixed(1)}k triangles (the worst of ${views.length} headings), ${worst.programs} programs, ${worst.lights} point lights, chunks ${worst.chunks.full} full ${worst.chunks.standIn} far`,
  );
  return { worst, calls: most };
}
const around = (from = 0, n = 8) => Array.from({ length: n }, (_, i) => from + (i * 2 * Math.PI) / n);

// ================================================================ 1. a new character
let s = await look();
{
  const toHale = Math.hypot(s.x - HALE.x, s.z - HALE.z);
  const facing = await page.evaluate((h) => {
    const { camera } = window.__descent;
    const dir = camera.getWorldDirection(camera.position.clone());
    const p = camera.getWorldPosition(camera.position.clone());
    const to = { x: h.x - p.x, z: h.z - p.z };
    return (dir.x * to.x + dir.z * to.z) / Math.hypot(dir.x, dir.z) / Math.hypot(to.x, to.z);
  }, HALE);
  check(s.level === 1 && s.xp === 0 && Math.abs(toHale - 3.5) < 0.3 && facing > 0.95, `a new character: level 1, ${toHale.toFixed(2)} m from Hale, facing them (cos ${facing.toFixed(3)})`);
  check(s.marker === 'offered' && s.tracker === null, `a gold "!" over Hale and no tracker (${s.marker})`);
  check(s.name === 'Oakvale' && s.zone === 'forest', `"Oakvale" floats up as you load in (${s.name})`);
  await shot('01-a-new-character');
  await measure('the village (the crossroads)', around(ZONE.spawn.yaw));
}

// ================================================================ 2. Raiders in the Fields
{
  // Close by with your back to Hale, the board stays folded.
  await byHale(5);
  await page.evaluate(([x, z]) => {
    // Straight back to 1.9 m, still facing away.
    const h = window.__play.head();
    const k = 1.9 / Math.hypot(h.x - x, h.z - z);
    window.__descent.teleport(x + (h.x - x) * k, z + (h.z - z) * k, Math.atan2(-(h.x - x), -(h.z - z)));
    window.__play.wait(0.8);
  }, [HALE.x, HALE.z]);
  check(!(await look()).board, 'with your back to Hale 1.9 m off, the board stays folded');
  check(await talk('notNow', 'left'), 'Hale\'s board unfolds as you walk up looking at them; "Not now" with the left fist');
  s = await look();
  check(!s.board && s.marker === 'offered', `"Not now" folds the board and leaves the "!" (${s.board}, ${s.marker})`);
  await page.evaluate(() => window.__play.wait(1));
  check(!(await look()).board, 'and it stays shut while you stand there');
  await byHale(5);
  await byHale(1.9);
  check((await look()).board, 'walked off and back, it unfolds again');
  await byHale(4);
  check(!(await look()).board, 'and folds as you walk 4 m off');
  check(await talk('accept'), 'back again: "Accept"');
  s = await look();
  check(s.marker === 'active' && s.tracker?.join(' | ') === 'Raiders in the Fields | Bandits defeated at the farm: 0/3' && s.arrow === 'farm', `taken: a grey "?", the tracker, the arrow to the farm (${s.tracker?.join(' | ')}, ${s.arrow})`);

  // The farm, from the end of its road.
  await page.evaluate(() => window.__descent.teleport(46, 30, -Math.PI / 2 - 0.3));
  await page.evaluate(() => window.__play.wait(0.5));
  await shot('02-the-farm');
  const r = await fightUntil({ done: '() => window.__descent.state.tracker.at(-1)?.lines[0] === "Return to Marshal Hale"', pick: '(e) => true' });
  s = await look();
  const tally = await page.evaluate(() => ({ ...window.__play.tally }));
  check(r === 'done' && s.marker === 'ready' && s.arrow === 'hale', `the farm fought through the real combat: 3/3, "Return to Marshal Hale", a gold "?" (${r}; ${tally.landed} of ${tally.swings} swings landed; ${Math.round(s.hp)}/${s.maxHp} health)`);
  // Whoever is still fighting, fought off too; then health comes back, as you walk back.
  await fightUntil({ done: '() => !window.__descent.camps.fighting' }, 10);
  s = await look();
  note(`the farm: ${(await camp('farm')).map((m) => (m.alive ? m.mind : 'dead')).join(' ')}; level ${s.level}, ${s.xp} XP`);
  await page.evaluate(() => window.__descent.teleport(30, 20, 0));
  await page.evaluate(() => window.__play.wait(16));
  s = await look();
  check(s.hp === s.maxHp, `out of the fight, your health comes back (${Math.round(s.hp)}/${s.maxHp})`);

  const xpBefore = s.xp;
  check(await handIn(), 'a pick carried off Hale\'s board hands it in');
  s = await look();
  const words = await floats();
  check(s.level === 2 && s.xp === xpBefore + 80, `handed in: +80 XP, level 2 at ${s.xp} XP`);
  await page.evaluate(() => window.__play.wait(0.8));
  const later = await floats();
  check([...words, ...later].includes('+80 XP') && later.includes('LEVEL 2') && later.includes('War Cry: press A or X'), `"+80 XP" and "LEVEL 2" float over Hale, with the War Cry's line (${[...new Set([...words, ...later])].join(', ')})`);
  check(s.marker === 'offered' && s.board, 'and Hale offers The Lumber Camp');
}

// ================================================================ 3. The Lumber Camp, with a reload
{
  await page.evaluate(() => window.__play.wait(1)); // the board takes a press 0.4 s after it changes
  check(await page.evaluate(() => window.__play.press('accept')), '"Accept" The Lumber Camp');
  await page.evaluate(() => window.__play.wait(0.3));
  s = await look();
  check(s.tracker?.join(' | ') === "The Lumber Camp | Bandits defeated at the lumber camp: 0/5 | Leader's orders taken: 0/1" && s.arrow === 'lumberCamp', `the tracker (${s.tracker?.join(' | ')})`);
  // Two of the camp: stand where the camp road comes in, and fight until two are down.
  await page.evaluate(() => window.__descent.teleport(-33, -44, Math.PI / 2));
  await page.evaluate(() => window.__play.wait(0.3));
  await shot('03-the-lumber-camp');
  const toCamp = () => page.evaluate(() => window.__descent.teleport(-33, -44, Math.PI / 2));
  let { r, deaths } = await battle({ done: '() => window.__descent.state.tracker.at(-1)?.lines[0].endsWith("2/5")' }, toCamp);
  check(r === 'done', `two of the lumber camp down (${r}, ${deaths} deaths)`);
  // Walk off, let them go home, and keep what's done.
  await page.evaluate(() => window.__descent.teleport(-20, -10, 0));
  await page.evaluate(() => window.__play.wait(20));
  const before = await look();
  await reload();
  s = await look();
  const members = await camp('lumberCamp');
  check(
    s.level === before.level && s.xp === before.xp && s.tracker?.[1] === 'Bandits defeated at the lumber camp: 2/5' && Math.hypot(s.x - before.x, s.z - before.z) < 0.3,
    `a reload mid-chain resumes it: level ${s.level}, ${s.xp} XP, "${s.tracker?.[1]}", ${Math.hypot(s.x - before.x, s.z - before.z).toFixed(2)} m from where you stood`,
  );
  check(s.hp === s.maxHp && s.rage === 0 && members.every((m) => m.alive && m.hp === m.maxHp), `at full health, no rage, and the camp full again (${members.filter((m) => m.alive).length}/5 up)`);

  await toCamp();
  ({ r, deaths } = await battle({ done: '() => window.__descent.state.tracker.at(-1)?.lines[0].endsWith("5/5")' }, toCamp));
  s = await look();
  check(r === 'done' && s.tracker?.[1] === 'Bandits defeated at the lumber camp: 5/5', `the rest of the camp fought, the leader too: 5/5 (${r}, ${deaths} deaths, ${Math.round(s.hp)}/${s.maxHp} health)`);
  // Anyone still up (the patrol, come in to help) fought off too, then the orders from the tent.
  await battle({ done: '() => !window.__descent.camps.fighting', near: 25 }, toCamp, 10);
  await page.evaluate(() => window.__play.wait(3));
  await page.evaluate(async (o) => {
    const { TENT } = await import('/src/maps/forest/layout.ts');
    // Just outside the tent's door, facing in (the door faces the tent's +z).
    const out = TENT.hd + 0.35 - TENT.orders.z;
    window.__descent.teleport(o.x + out * Math.sin(o.yaw), o.z + out * Math.cos(o.yaw), o.yaw + Math.PI);
    window.__play.wait(0.2);
    window.__play.touch({ x: o.x, y: o.y + 0.035, z: o.z }, 'left');
    window.__play.wait(0.2);
  }, ZONE.orders);
  s = await look();
  check(s.tracker?.join(' | ') === 'The Lumber Camp | Return to Marshal Hale' && s.marker === 'ready', `the orders taken with the left fist: "Return to Marshal Hale" (${s.tracker?.join(' | ')})`);
  await page.evaluate(() => window.__play.wait(16));
  check(await handIn(), 'a pick carried off Hale\'s board hands it in');
  s = await look();
  check(s.level === 3, `handed in: level 3 at ${s.xp} XP`);
  await page.evaluate(() => window.__play.wait(1)); // the board takes a press 0.4 s after it changes
  check(await page.evaluate(() => window.__play.press('accept')), '"Accept" What Lies Below');
  await page.evaluate(() => window.__play.wait(0.3));
  s = await look();
  check(s.tracker?.join(' | ') === 'What Lies Below | What woke the dead defeated: 0/1' && s.arrow === 'mine', `the tracker, and the arrow to the mine (${s.tracker?.join(' | ')}, ${s.arrow})`);
}

// ================================================================ 4. a death outside the mine
{
  const before = await look();
  await page.evaluate(() => window.__descent.teleport(38, -57, 0));
  const r = await page.evaluate(() => window.__play.wait(90));
  check(r.dead, `standing guard down among the watchtower's bandits, you fall (after ${r.t?.toFixed(1)} s)`);
  const { banner, dark, woke } = await throughDeath();
  check(banner && dark >= 0.99, `"YOU DIED", and the view fades to black (${dark.toFixed(2)})`);
  const v = ZONE.respawns.village;
  check(woke.alive && woke.interior === 'inn' && !woke.outdoors && Math.hypot(woke.x - v.x, woke.z - v.z) < 0.3, `you wake by the inn's hearth, inside with the door shut (${woke.interior}, outdoors ${woke.outdoors ? 'shown' : 'hidden'})`);
  check(woke.hp === woke.maxHp && woke.rage === 0 && woke.fade < 1, `at full health with no rage, the view fading back in (${woke.hp}/${woke.maxHp}, fade ${woke.fade.toFixed(2)})`);
  check(woke.level === before.level && woke.xp === before.xp && woke.tracker?.join() === before.tracker?.join(), `nothing lost (level ${woke.level}, ${woke.xp} XP, ${woke.tracker?.[1]})`);
  await page.evaluate(() => window.__play.wait(10));
  const tower = await camp('watchtower');
  check(tower.every((m) => m.mind === 'idle' || m.mind === 'home'), `and the watchtower's bandits go home (${tower.map((m) => m.mind).join(' ')})`);
  await shot('04-waking-by-the-hearth');
  await measure('inside the inn', around(ZONE.respawns.village.yaw));
}

// ================================================================ 5. What Lies Below
{
  // In through the mouth with the left stick.
  await inMine(0, 9, 0, 0);
  await page.evaluate(() => window.__play.wait(0.5));
  await inMine(0, 3, 0, -5);
  await stick(0, -1);
  await page.evaluate(() => window.__play.wait(2.5));
  await stick(0, 0);
  s = await look();
  check(s.interior === 'mine', `walked in through the mouth: in the mine (${s.interior})`);
  // A run in the adit: click the stick and hold it forward.
  await stick(0, -1);
  await page.evaluate(() => window.__descent.device.controllers.left.updateButtonValue('thumbstick', 1));
  await xrFrames(2);
  await page.evaluate(() => window.__play.tick());
  await page.evaluate(() => window.__descent.device.controllers.left.updateButtonValue('thumbstick', 0));
  await xrFrames(2);
  await page.evaluate(() => window.__play.wait(0.5));
  s = await look();
  await stick(0, 0);
  check(s.running && s.interior === 'mine', `you can run in the mine (running ${s.running})`);
  const mine = '(e) => window.__descent.camps.camps.find((c) => c.plan.id === "mine").members.some((m) => m.enemy === e)';
  const down = (n) => `() => window.__descent.camps.camps.find((c) => c.plan.id === "mine").members.filter((m) => !m.enemy.alive).length >= ${n}`;
  // The cart hall: two grunts and an archer.
  const walkIn = async () => {
    if ((await look()).interior === 'mine') return;
    await inMine(0, 9, 0, 0);
    await page.evaluate(() => window.__play.wait(0.5));
    await inMine(0, 3, 0, -5);
    await stick(0, -1);
    await page.evaluate(() => window.__play.wait(2.5));
    await stick(0, 0);
  };
  await inMine(-6, -8, -12, -11.5);
  let { r, deaths } = await battle({ done: down(3), pick: mine, near: 12 }, async () => {
    await walkIn();
    await inMine(-6, -8, -12, -11.5);
  });
  s = await look();
  check(r === 'done', `the cart hall fought (${r}, ${deaths} deaths; level ${s.level}, ${s.xp} XP, ${Math.round(s.hp)}/${s.maxHp} health)`);

  // A death in the gallery: stand guard down before its grunt and archer.
  await page.evaluate(() => window.__play.wait(16));
  await inMine(-15, -27, -15, -31);
  const fall = await page.evaluate(() => window.__play.wait(90));
  check(fall.dead, `standing guard down in the gallery, you fall (after ${fall.t?.toFixed(1)} s)`);
  const { woke } = await throughDeath();
  const m = ZONE.respawns.mine;
  const facing = await page.evaluate((mouth) => {
    const { camera } = window.__descent;
    const dir = camera.getWorldDirection(camera.position.clone());
    const p = camera.getWorldPosition(camera.position.clone());
    return (dir.x * (mouth.x - p.x) + dir.z * (mouth.z - p.z)) / Math.hypot(dir.x, dir.z) / Math.hypot(mouth.x - p.x, mouth.z - p.z);
  }, ZONE.mouth);
  check(woke.alive && woke.interior === null && Math.hypot(woke.x - m.x, woke.z - m.z) < 0.3 && facing > 0.95, `you wake on the rail bed outside the mouth, facing it (${woke.interior}, cos ${facing.toFixed(3)})`);
  const deadStay = (await camp('mine')).filter((x) => !x.alive).length;
  check(deadStay >= 3, `the undead you cut down stay dead (${deadStay} down)`);

  // Back in, and the rest of the mine: the gallery, the dig's brute, the antechamber's brute.
  await page.evaluate(() => window.__play.wait(12));
  await walkIn();
  let fell = 0;
  const spots = [
    [-15, -26, -15, -31, 5],
    [2, -48, 4, -53, 6],
    [22, -30, 22, -34, 7],
  ];
  for (const [lx, lz, tx, tz, n] of spots) {
    await page.evaluate(() => window.__play.wait(12));
    await inMine(lx, lz, tx, tz);
    ({ r, deaths } = await battle({ done: down(n), pick: mine, near: 14 }, async () => {
      await walkIn();
      await inMine(lx, lz, tx, tz);
    }));
    fell += deaths;
    s = await look();
    note(`to ${n} of the mine's 7 down: ${r} (level ${s.level}, ${s.xp} XP, ${Math.round(s.hp)}/${s.maxHp} health)`);
    if (n === 6) check(s.level === 4, `level 4 once the dig's brute falls (level ${s.level}, ${s.xp} XP)`);
  }
  check(r === 'done', `the mine's undead fought through, all 7 (${fell} more deaths on the way)`);

  // The Warden: from the gate, seated; through it, it rises; fight it until it falls.
  await page.evaluate(() => window.__play.wait(16));
  await inMine(22, -37.7, 22, -52);
  await page.evaluate(() => window.__play.wait(1));
  s = await look();
  check(s.throne === 'seated', `from the gate, the Warden sits slumped on its throne (${s.throne})`);
  await shot('05-the-warden-on-its-throne');
  await measure("the Warden's hall (from its gate)", around(0));
  let wardenDeaths = 0;
  for (let tries = 0; tries < 6 && !(await look()).beaten; tries++) {
    await page.evaluate(() => window.__play.wait(12));
    await walkIn();
    await inMine(22, -40, 22, -52);
    s = await look();
    if (tries === 0) check(s.throne === 'fighting', `step through the gate and it rises (${s.throne})`);
    r = await fightUntil({ done: '() => window.__descent.state.wardenBeaten', near: 16 }, 60);
    if (r === 'dead') {
      wardenDeaths++;
      await throughDeath();
    }
  }
  s = await look();
  check(s.beaten && s.throne === 'absent', `the Warden fought through the real combat and beaten (${wardenDeaths} deaths to it)`);
  check(s.tracker?.join(' | ') === 'What Lies Below | Return to Marshal Hale' && s.arrow === 'hale' && !s.arrowShown, `"Return to Marshal Hale", its arrow hidden in the mine (${s.tracker?.join(' | ')}, ${s.arrow}, shown ${s.arrowShown})`);
  const tally = await page.evaluate(() => ({ ...window.__play.tally }));
  note(`all fights so far: ${tally.landed} of ${tally.swings} swings landed`);
}

// ================================================================ 6. a reload: the Warden stays beaten
{
  await page.evaluate(() => window.__play.wait(3));
  await reload();
  await inMine(22, -41, 22, -52);
  // While paused the page's frames still step the World, so settle in the same breath as a step.
  await page.evaluate(() => {
    window.__descent.world.settle('mine');
    window.__play.wait(1);
  });
  s = await look();
  check(s.beaten && s.throne === 'absent' && s.interior === 'mine', `reloaded, the Warden stays beaten: its throne empty (${s.throne})`);
  await shot('06-the-empty-throne');
}

// ================================================================ 7. the longsword
{
  await page.evaluate(() => window.__descent.world.settle(null));
  await byHale(4);
  check((await look()).atHip, "Hale's sword at their hip before the hand-in");
  check(await handIn(0), "Hale's longsword carried off their board hands in What Lies Below");
  // Worn from the bag.
  await page.evaluate(() => {
    const { adventure, state } = window.__descent;
    const slot = state.inventory.bag.findIndex((b) => b?.id === 'hale-longsword');
    adventure.applyThings(state.inventory.move({ in: 'bag', slot }, { in: 'gear', slot: 'mainHand' }), adventure.hale.position);
    window.__play.wait(0.2);
  });
  s = await look();
  check(s.level === 5 && s.xp === 1000 && s.sword === 'hale' && s.inHand === 'hale' && Math.abs(s.damage - 2) < 1e-9, `level 5 at 1,000 XP, Hale's longsword in your hand (${s.inHand}, ${s.damage.toFixed(2)} damage)`);
  check(!s.atHip && s.marker === null && s.line.includes('Brackenmoor') && s.line.includes('south'), `gone from Hale's hip; no marker; Hale points south to Brackenmoor`);
  check(s.tracker === null && s.arrow === null, 'the tracker gone');
  await shot('07-the-longsword');
}

// ================================================================ 8. over the pass to the rockfall
{
  const lines = await page.evaluate(async () => {
    const { planOakvale } = await import('/src/maps/forest/layout.ts');
    const { planMoor } = await import('/src/maps/brackenmoor/chunks.ts');
    return { oak: planOakvale().paths[0].line, moor: planMoor().road.line };
  });
  const road = [...lines.oak.filter((p) => p[1] > 8 && p[1] <= 140), ...lines.moor.filter((p) => p[1] > 140)].sort((a, b) => a[1] - b[1]);
  await page.evaluate(() => window.__descent.teleport(1, 8, Math.PI));
  await page.evaluate(() => window.__play.wait(0.2));
  // Run: click the stick, and hold it forward.
  await stick(0, -1);
  await page.evaluate(() => window.__descent.device.controllers.left.updateButtonValue('thumbstick', 1));
  await xrFrames(2);
  await page.evaluate(() => window.__play.tick());
  await page.evaluate(() => window.__descent.device.controllers.left.updateButtonValue('thumbstick', 0));
  await xrFrames(2);
  // A few frames at a time, so the page's own tasks (the save's writes) run between them as they would between frames.
  await page.evaluate((road) => {
    const d = window.__descent;
    window.__walk = { road, t: 0, seen: [], crossedAt: null, last: d.world.zone.id, crest: null, named: null, done: false };
  }, road);
  for (let i = 0; i < 20000; i++) {
    const done = await page.evaluate(() => {
      const d = window.__descent;
      const w = window.__walk;
      for (let k = 0; k < 4 && !w.done; k++, w.t += 1 / 72) {
        const h = window.__play.head();
        // Steer for the road a few metres on.
        const next = w.road.find((p) => p[1] > h.z + 5) ?? w.road.at(-1);
        window.__play.turn(Math.atan2(-(next[0] - h.x), -(next[1] - h.z)));
        const writes = window.__play.writes.length;
        window.__play.tick();
        if (d.world.zone.id !== w.last) {
          w.last = d.world.zone.id;
          w.crossedAt = { z: window.__play.head().z, zone: w.last, writes };
        }
        if (w.crossedAt && w.named === null && d.adventure.zoneName.shown) w.named = d.adventure.zoneName.shown;
        if (w.crest === null && h.z > 140) w.crest = { running: d.player.running, t: w.t };
        if (Math.round(w.t * 72) % 72 === 0) w.seen.push({ t: Math.round(w.t), z: +h.z.toFixed(1), running: d.player.running });
        if ((w.seen.length > 3 && Math.abs(w.seen.at(-1).z - w.seen.at(-4).z) < 0.3) || w.t > 200) w.done = true;
      }
      return w.done;
    });
    if (done) break;
  }
  const walk = await page.evaluate(() => {
    const w = window.__walk;
    return { ...w, end: window.__play.head(), writes: window.__play.writes.slice(w.crossedAt?.writes ?? 0) };
  });
  await stick(0, 0);
  const end = walk.end;
  note(`walked from z 8 to ${end.z.toFixed(1)} in ${walk.seen.at(-1).t} s: ${walk.seen.filter((_, i) => i % 10 === 0).map((p) => `${p.z}${p.running ? 'r' : ''}`).join(' ')}`);
  check(walk.crest?.running, 'running on the road over the pass, nothing fighting you');
  check(walk.crossedAt?.zone === 'brackenmoor' && walk.crossedAt.z > 142 && walk.crossedAt.z < 143, `the current zone becomes Brackenmoor 2 m past the crest (at z ${walk.crossedAt?.z.toFixed(2)})`);
  check(walk.named === 'Brackenmoor', `"Brackenmoor" floats up (${walk.named})`);
  const over = walk.writes.find((w) => w.z > 142);
  check(over && over.z < 144, `and the game saves there, over the line (a save at z ${over?.z.toFixed(2)})`);
  await page.evaluate(async () => await window.__descent.saved());
  check(end.z > 250 && end.z < 261, `the road ends at the rockfall, where the moor stops you (z ${end.z.toFixed(1)})`);
  s = await look();
  check(s.zone === 'brackenmoor', `in Brackenmoor (${s.zone})`);
  await settled();
  const oak = await page.evaluate(() => {
    const d = window.__descent;
    const zone = d.world.zoneAt(0, 0);
    const n = { full: 0, standIn: 0 };
    for (const m of d.world.chunksOf(zone).children) n[m.name.endsWith('-full') ? 'full' : 'standIn']++;
    return { ...n, none: 49 - n.full - n.standIn };
  });
  check(oak.none > 15 && oak.full < 12, `at the rockfall Oakvale is mostly stand-ins and unloaded behind you (${oak.full} full, ${oak.standIn} stand-ins, ${oak.none} unloaded)`);
  await page.evaluate(() => {
    window.__play.turn(Math.PI);
    window.__play.tick();
  });
  await shot('09-the-rockfall');
  // Back up to the crest, looking north over Oakvale with both zones loaded.
  await page.evaluate((x) => window.__descent.teleport(x, 140, 0), road.find((p) => p[1] >= 140)[0]);
  await page.evaluate(() => window.__play.wait(0.5));
  await settled();
  await shot('08-the-crest-looking-north');
  await measure('the crest, looking north with both zones loaded', [0, -0.5, 0.5, -1, 1]);
}

// ================================================================ 9. the budget
// Draw calls and point lights are checked; triangles are a rule of thumb, reported (ticket 38 records them and what was cut).
for (const m of measured) {
  const { worst, calls } = m;
  check(calls <= BUDGET.calls && worst.lights <= BUDGET.lights, `${m.label}: ${calls} draw calls (about ${BUDGET.calls}), ${worst.lights} point lights (at most ${BUDGET.lights}), ${worst.programs} programs`);
  note(`${(worst.triangles / 1000).toFixed(1)}k triangles, ${worst.triangles <= BUDGET.triangles ? 'within' : 'over'} the rule of thumb of 250k to 300k`);
}
{
  const now = await page.evaluate(() => window.__play.drops);
  const orbs = orbLog.orbs + now.orbs;
  const heals = [...orbLog.heals, ...now.heals];
  const quarter = heals.every((h) => Math.abs(h.healed - Math.min(h.maxHp / 4, h.missing)) < 1e-6);
  check(orbs > 0 && heals.length > 0 && quarter, `enemies dropped ${orbs} healing orbs, and each of the ${heals.length} picked up healed a quarter of your health (or what was missing): ${heals.map((h) => Math.round(h.healed)).join(', ')}`);
}
if (shots) writeFileSync(`${shots}/budget.json`, JSON.stringify(measured, null, 1));

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
