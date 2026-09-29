// Checks for the mine's undead (issues/27-the-mines-undead.md) in headless
// Chromium with the IWER emulator. Start `npx vite --port 5173` first, then:
//
//   node .scratch/oakvale-starting-zone/checks/mine-undead.mjs [http://localhost:5173] [shots/]
//
// The Adventure at the plain URL, paused, stepped in the page (you walk by
// being put a step on each frame, your health kept full). What it checks:
//
// 1. The mine's one camp: two grunts and an archer in the cart hall, a grunt
//    and an archer in the gallery (level 3), a brute in the dig and another
//    in the antechamber (level 4), all idle; from the rail bed none is drawn.
// 2. In through the mouth to the cart hall's doorway: the cart hall's three
//    come for you, and the gallery's two (behind the rock, 20 m on) stay put
//    all through the fight, as do the brutes.
// 3. Back out through the mouth: they follow you up the adit, turn for home
//    the moment you're out, and none sets foot past the mouth. Home again,
//    they stand at their posts.
//
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
/** A screenshot of what you see, with your hands (the sword and the shield) lowered out of view. */
const shot = async (name) => {
  if (!shots) return;
  const held = await page.evaluate(() => {
    const { left, right } = window.__descent.device.controllers;
    const was = [left, right].map(({ position: p }) => [p.x, p.y, p.z]);
    Object.assign(left.position, { x: -0.3, y: -1, z: 0.2 });
    Object.assign(right.position, { x: 0.3, y: -1, z: 0.2 });
    return was;
  });
  await xrFrames(3);
  await page.screenshot({ path: `${shots}/${name}.png` });
  await page.evaluate((was) => {
    const { left, right } = window.__descent.device.controllers;
    [left, right].forEach(({ position: p }, i) => Object.assign(p, { x: was[i][0], y: was[i][1], z: was[i][2] }));
  }, held);
  await xrFrames(2);
};

/** The mine's camp: each member's mind, where it is (its part, and in the mouth's frame), its level and whether it's drawn; and where you are. */
const undead = () =>
  page.evaluate(() => {
    const { camps, world, adventure } = window.__descent;
    const m = world.mine;
    const camp = camps.camps.find((c) => c.plan.id === 'mine');
    const { x, z, yaw } = m.mouth;
    const local = (p) => {
      const dx = p.x - x;
      const dz = p.z - z;
      return [dx * Math.cos(yaw) - dz * Math.sin(yaw), dx * Math.sin(yaw) + dz * Math.cos(yaw)];
    };
    return {
      members: camp.members.map((mem) => ({
        mind: mem.mind,
        part: m.parts[m.partAt(mem.enemy.position.x, mem.enemy.position.z)],
        kind: mem.enemy.kind,
        level: mem.enemy.level,
        at: local(mem.enemy.position),
        home: Math.hypot(mem.enemy.position.x - mem.post.x, mem.enemy.position.z - mem.post.z),
        drawn: mem.enemy.root.visible && camp.root.visible,
      })),
      interior: world.interior,
      alive: adventure.player.alive,
    };
  });

/**
 * Walk from point to point in the mouth's frame at a walk, facing `face`,
 * the game stepped each frame; `watch` sees the camp after each frame.
 * Returns what `watch` gathered.
 */
const walk = (pts, face) =>
  page.evaluate(
    ([pts, face]) => {
      const { adventure, world, camps, teleport, CONFIG } = window.__descent;
      const m = world.mine;
      const camp = camps.camps.find((c) => c.plan.id === 'mine');
      const { x: fx, z: fz, yaw } = m.mouth;
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const toWorld = (a, b) => [fx + a * c + b * s, fz - a * s + b * c];
      const dt = 1 / 72;
      const log = { galleryStirred: false, furthest: -Infinity, fought: 0, outAt: null, homeWhenOut: null };
      for (let k = 1; k < pts.length; k++) {
        const [ax, az] = pts[k - 1];
        const [bx, bz] = pts[k];
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (CONFIG.player.moveSpeed * dt)));
        for (let i = 1; i <= n; i++) {
          const [lx, lz] = [ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n];
          const [x, z] = toWorld(lx, lz);
          const [X, Z] = toWorld(...face);
          teleport(x, z, Math.atan2(-(X - x), -(Z - z)));
          adventure.player.hp = adventure.player.maxHp;
          adventure.update(dt);
          for (const mem of camp.members) {
            const dz = mem.enemy.position.x - fx;
            const ez = mem.enemy.position.z - fz;
            log.furthest = Math.max(log.furthest, dz * s + ez * c);
          }
          const minds = camp.members.map((mem) => mem.mind);
          if (minds.slice(3).some((mm) => mm !== 'idle')) log.galleryStirred = true;
          log.fought = Math.max(log.fought, minds.filter((mm) => mm === 'fight').length);
          if (log.outAt === null && world.interior === null && lz > 0) {
            log.outAt = lz;
            log.homeWhenOut = minds.slice(0, 3);
          }
        }
      }
      return log;
    },
    [pts, face],
  );
const hold = (seconds) =>
  page.evaluate((seconds) => {
    const { adventure } = window.__descent;
    for (let t = 0; t < seconds; t += 1 / 72) {
      adventure.player.hp = adventure.player.maxHp;
      adventure.update(1 / 72);
    }
  }, seconds);

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => (window.__descent.paused = true));

// 1. On the rail bed, looking in.
await walk([[0, 9], [0, 8]], [0, 0]);
await hold(3);
let u = await undead();
check(
  u.members.map((m) => `${m.kind} ${m.part} ${m.level}`).join(', ') ===
    'grunt cart hall 3, grunt cart hall 3, archer cart hall 3, grunt gallery 3, archer gallery 3, brute dig 4, brute antechamber 4',
  `the mine's camp: ${u.members.map((m) => `${m.kind} in the ${m.part} (${m.level})`).join(', ')}`,
);
check(u.members.every((m) => m.mind === 'idle'), 'all idle while you stand outside');
check(u.members.every((m) => !m.drawn), 'none drawn from the rail bed');
await shot('21-the-mouth-before');

// 2. In through the mouth, round the bend, to the cart hall's doorway.
let log = await walk([[0, 8], [0, -10], [-5.5, -10]], [-12, -10]);
check(!log.galleryStirred, 'the gallery and the deep brutes stay put as you walk in');
await hold(0.4);
u = await undead();
check(u.interior === 'mine', `you're in the mine (${u.interior})`);
check(u.members.slice(0, 3).every((m) => m.mind === 'fight'), `the cart hall's three come for you (${u.members.slice(0, 3).map((m) => m.mind)})`);
check(u.members.slice(3).every((m) => m.mind === 'idle'), `the gallery's pair and the brutes don't (${u.members.slice(3).map((m) => m.mind)})`);
// From the doorway (still the adit) the adit and the cart hall are drawn: the gallery's pair isn't, nor the brutes.
check(u.members.slice(0, 3).every((m) => m.drawn) && u.members.slice(3).every((m) => !m.drawn), `the cart hall's drawn, nobody deeper (${u.members.map((m) => m.drawn)})`);
await shot('22-the-cart-hall-wakes');

// 3. Back the way you came, looking back at them, and out down the rail bed.
log = await walk([[-5.5, -10], [0, -10], [0, 0.5]], [0, -12]);
check(!log.galleryStirred, 'the gallery and the deep brutes stay put all through the fight');
check(log.fought === 3, `all three chased you (${log.fought} at once)`);
u = await undead();
check(u.interior === null, 'out through the mouth');
check(log.homeWhenOut?.every((m) => m === 'home'), `they turn for home the moment you're out (${log.homeWhenOut})`);
await shot('23-they-turn-at-the-mouth');
log = await walk([[0, 0.5], [0, 8]], [0, -5]);
await hold(20);
u = await undead();
check(log.furthest < 1 && u.members.every((m) => m.at[1] < 1), `none set foot past the mouth (nearest ${log.furthest.toFixed(2)} m out)`);
check(u.members.every((m) => m.mind === 'idle' && m.home < 0.5), `all home at their posts (${u.members.map((m) => `${m.mind} ${m.home.toFixed(2)} m`).join(', ')})`);
check(u.alive, 'you stood through it (health kept full)');

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
