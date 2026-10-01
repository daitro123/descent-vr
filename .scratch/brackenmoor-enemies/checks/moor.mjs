// Brackenmoor's enemies at walking height, where the inhabitants spec puts
// them (/zones/brackenmoor-inhabitants.md in the project's files), in
// headless Chromium with the IWER emulator. Start `npx vite --port 5173`
// first, then:
//
//   node .scratch/brackenmoor-enemies/checks/moor.mjs [http://localhost:5173] [shots/]
//
// No zone places them yet (Brackenmoor's placement thread does that), so this
// adds the camps and the fallen for the check, then for each place:
// 1. everyone is raised there, standing with their soles on the ground (the
//    bog dead once they've risen out of the peat);
// 2. a view of each place a few metres off: every camp here leaves you be
//    until you hurt one of it (the zone's own camps will fight from 8 m), so
//    you can walk up to them;
// 3. in a fight (each hurt with a scratch first): Red Annis, a digger and a
//    bog dead brute each come at you and swing.
import { mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const shots = process.argv[3];
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
const step = (s, dt = 1 / 72) => page.evaluate(([s, dt]) => window.__descent.step(s, dt), [s, dt]);
const shot = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });
const settle = async () => {
  for (let i = 0; i < 600; i++) {
    const pending = await page.evaluate(() => window.__descent.world.chunksPending + window.__descent.world.neighboursPending);
    if (pending === 0) break;
    await step(1 / 72);
    await xrFrames(1);
  }
  await xrFrames(3);
};
const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
/** Stand at (x, z) looking at (tx, tz), tipping the head `pitch` (rad, down negative). */
const standLooking = async (x, z, tx, tz, wait = 0.5, pitch = 0) => {
  await page.evaluate(([x, z, yaw]) => window.__descent.teleport(x, z, yaw), [x, z, yawTo(x, z, tx, tz)]);
  await page.evaluate((pitch) => {
    const q = window.__descent.device.quaternion;
    const half = pitch / 2;
    Object.assign(q, { x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) });
  }, pitch);
  await step(wait);
  await settle();
};

/** Every enemy of ours: its post's camp, family, kind and where its soles are against the ground. */
const ours = () =>
  page.evaluate(() => {
    const d = window.__descent;
    return d.camps.enemies
      .filter((e) => e.campId?.startsWith?.('check-') ?? true)
      .map((e) => {
        const p = e.root.position;
        let sole = Infinity;
        e.root.traverse((o) => {
          if (!o.isSkinnedMesh) return;
          o.updateMatrixWorld(true);
          const skin = o.geometry.getAttribute('skinIndex');
          const feet = ['footL', 'footR'].map((n) => o.skeleton.bones.findIndex((b) => b.name === n));
          const v = new p.constructor();
          for (let i = 0; i < skin.count; i++) {
            if (!feet.includes(skin.getX(i))) continue;
            o.getVertexPosition(i, v);
            o.localToWorld(v);
            sole = Math.min(sole, v.y);
          }
        });
        return { kind: e.kind, family: e.family, x: p.x, z: p.z, ground: d.world.heightAt(p.x, p.z), sole, state: e.state, hittable: e.hittable, alive: e.alive };
      });
  });

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 180000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
await page.evaluate(() => {
  const d = window.__descent;
  d.paused = true;
  Object.assign(d.device.controllers.left.position, { x: -0.3, y: -1, z: 0.2 });
  Object.assign(d.device.controllers.right.position, { x: 0.3, y: -1, z: 0.2 });
});

// A quest moment that never comes: a camp neutral until it leaves you be until you hurt it.
const NEVER = { quest: 'check-never', stage: 'never' };
const post = (behaviour, family, x, z, yaw, extra = {}) => ({ behaviour, family, x, z, yaw, ...extra });
const CAMPS = [
  // Raven Scar's pit floor, as the spec places it: thugs by the tents, an archer by the crates, a digger at the tin seam, a thug at the ladder.
  {
    id: 'check-scar-pit',
    neutralUntil: NEVER,
    place: { x: -157, z: 214, r: 10 },
    level: 9,
    posts: [
      post('grunt', 'moorBandit', -164, 218, 0.4),
      post('grunt', 'moorBandit', -148.5, 216.5, -0.6),
      post('archer', 'moorBandit', -149.6, 223.6, -0.3),
      post('brute', 'moorBandit', -170.4, 210.4, -2.2),
      post('grunt', 'moorBandit', -154, 205, 0.2),
    ],
  },
  // Red Annis on the lip, looking down into the pit.
  { id: 'check-scar-top',
    neutralUntil: NEVER, place: { x: -151.4, z: 197.2, r: 4 }, level: 10, posts: [post('brute', 'moorBandit', -151.4, 197.2, 0, { named: 'annis', role: 'leader' })] },
  // Turfmoss's cuttings: two bog dead at the opened banks.
  { id: 'check-turfmoss',
    neutralUntil: NEVER, place: { x: -112, z: 377, r: 6 }, level: 8, posts: [post('grunt', 'bogDead', -108.5, 381, 0.8), post('grunt', 'bogDead', -116, 373, 1.2)] },
  // The Blackmire's pools: two grunts and a brute in the water by the boardwalk.
  {
    id: 'check-blackmire',
    neutralUntil: NEVER,
    place: { x: -131, z: 409, r: 6 },
    level: 9,
    posts: [post('grunt', 'bogDead', -130, 404, 1.6), post('grunt', 'bogDead', -136, 410, 1.4), post('brute', 'bogDead', -128, 412, 1.8)],
  },
  // The Kerchiefs' hide on the Blackmire: thugs, an archer, a digger at the crates.
  {
    id: 'check-hide',
    neutralUntil: NEVER,
    place: { x: -153, z: 431, r: 8 },
    level: 9,
    posts: [
      post('grunt', 'moorBandit', -150.4, 427, 1.2),
      post('grunt', 'moorBandit', -155.6, 433, 0.9),
      post('archer', 'moorBandit', -157, 425, 1.0),
      post('brute', 'moorBandit', -151, 437.6, 1.5),
    ],
  },
  // Corvane's lamp crew at the east dig in the barrow field (the spec's dig, the House's men in it).
  {
    id: 'check-lamp-dig',
    neutralUntil: NEVER,
    place: { x: 216, z: 235, r: 8 },
    level: 10,
    posts: [
      post('grunt', 'lampCrew', 215, 238.5, Math.PI),
      post('grunt', 'lampCrew', 222, 236, -2.2),
      post('archer', 'lampCrew', 220, 230, -2.6),
      post('brute', 'lampCrew', 211, 233, 2.6),
    ],
  },
  // Line-ups that leave you be: every look side by side on Turfmoss green, to walk up to.
  {
    id: 'check-lineup-moor',
    place: { x: -92, z: 346, r: 6 },
    level: 8,
    neutralUntil: NEVER,
    posts: [
      ...[0, 1, 2, 3, 4, 5].map((v, i) => post('grunt', 'moorBandit', -97 + i * 1.3, 346, 0)),
      post('archer', 'moorBandit', -97 + 6 * 1.3, 346, 0),
      post('brute', 'moorBandit', -97 + 7 * 1.4, 346, 0, { named: 'annis' }),
    ],
  },
  {
    id: 'check-lineup-dig',
    place: { x: -92, z: 353, r: 6 },
    level: 8,
    neutralUntil: NEVER,
    posts: [
      post('brute', 'moorBandit', -97, 353, 0),
      ...[0, 1, 2].map((v, i) => post('grunt', 'lampCrew', -95.4 + i * 1.3, 353, 0)),
      post('archer', 'lampCrew', -95.4 + 3 * 1.3, 353, 0),
      post('brute', 'lampCrew', -95.4 + 4 * 1.3 + 0.2, 353, 0),
      post('grunt', 'bogDead', -95.4 + 5 * 1.3 + 0.6, 353, 0),
      post('brute', 'bogDead', -95.4 + 6 * 1.3 + 1.2, 353, 0),
    ],
  },
];
await page.evaluate((camps) => {
  const d = window.__descent;
  d.camps.add(camps, d.world, true);
}, CAMPS);
// The diggers who opened the barrow, dead by its mouth.
await page.evaluate(() => {
  window.__descent.people.add([
    { id: 'check-fallen-1', cast: 'fallenDigger', x: 162.6, z: 180.2, yaw: 2.6, fallen: true },
    { id: 'check-fallen-2', cast: 'fallenLampman', x: 165.6, z: 181.4, yaw: -0.5, fallen: true },
    { id: 'check-fallen-3', cast: 'fallenDigger', x: 160.4, z: 183.2, yaw: 1.2, fallen: true },
    { id: 'check-fallen-4', cast: 'bogBody', x: -110.5, z: 376.5, yaw: 0.9, fallen: true },
  ]);
});

/** Our enemies within `r` m of (x, z), each standing on the ground once raised and risen. */
async function standing(where, x, z, r) {
  const near = (await ours()).filter((e) => Math.hypot(e.x - x, e.z - z) < r);
  check(near.length > 0, `${where}: ${near.length} raised (${[...new Set(near.map((e) => `${e.family} ${e.kind}`))].join(', ')})`);
  for (const e of near) check(Math.abs(e.sole - e.ground) < 0.04, `${where}: the ${e.family} ${e.kind} at (${e.x.toFixed(1)}, ${e.z.toFixed(1)}) stands on the ground (${(e.sole - e.ground).toFixed(3)} m)`);
}

/**
 * Stand where you see the enemies within `r` m of (x, z) best from about
 * `dist` m off: on ground near their height, with a clear sight of as many of
 * them as can be had, out of their notice unless `close`; then look at them.
 */
async function frame(x, z, r, dist, close = false) {
  await near(x, z, r);
  const spot = await page.evaluate(
    ([x, z, r, dist, close, notice]) => {
      const d = window.__descent;
      const them = d.camps.enemies.filter((e) => Math.hypot(e.root.position.x - x, e.root.position.z - z) < r).map((e) => e.root.position.clone());
      if (!them.length) return null;
      const c = them.reduce((a, p) => a.add(p), them[0].clone().multiplyScalar(0)).multiplyScalar(1 / them.length);
      const hc = d.world.heightAt(c.x, c.z);
      let best = null;
      for (let i = 0; i < 24; i++) {
        const b = (i / 24) * Math.PI * 2;
        for (let k = dist; k < dist + 6; k += 0.5) {
          const at = c.clone().set(c.x + Math.sin(b) * k, 0, c.z + Math.cos(b) * k);
          const nearest = Math.min(...them.map((p) => Math.hypot(p.x - at.x, p.z - at.z)));
          if (!close && nearest < notice + 0.6) continue;
          const pushed = at.clone();
          if (d.world.resolve(pushed, 0.3) && pushed.distanceTo(at) > 0.05) break;
          const unseen = them.filter((p) => !d.world.lineOfSight(at, p)).length;
          const score = unseen * 3 + Math.abs(d.world.heightAt(at.x, at.z) - hc) * 0.6 + (k - dist) * 0.2;
          if (!best || score < best.score) best = { x: at.x, z: at.z, score, unseen };
          break;
        }
      }
      if (!best) return null;
      const h = d.world.heightAt(best.x, best.z);
      return { ...best, tx: c.x, tz: c.z, pitch: Math.atan2(hc + 1.0 - (h + 1.6), Math.hypot(c.x - best.x, c.z - best.z)), count: them.length };
    },
    [x, z, r, dist, close, 8],
  );
  if (!spot) return null;
  await standLooking(spot.x, spot.z, spot.tx, spot.tz, 0.2, spot.pitch);
  return spot;
}

/** The `family`'s `kind` nearest (x, z), in the page. */
const PICK = `(d, family, kind, x, z) => d.camps.enemies
  .filter((e) => e.family === family && e.kind === kind && e.alive)
  .sort((a, b) => Math.hypot(a.root.position.x - x, a.root.position.z - z) - Math.hypot(b.root.position.x - x, b.root.position.z - z))[0]`;

/** Walk up to the `family`'s `kind` nearest (x, z) and catch it mid-swing, facing it as it comes. */
async function swing(family, kind, name, x, z) {
  await near(x, z, 3);
  await page.evaluate(
    ([family, kind, x, z, pick]) => {
      const d = window.__descent;
      const e = eval(pick)(d, family, kind, x, z);
      const p = e.root.position;
      d.teleport(p.x, p.z - 4.5, Math.atan2(0, 4.5));
      // A scratch: the camps here leave you be until you hurt one.
      e.hp -= 1;
    },
    [family, kind, x, z, PICK],
  );
  let swung = false;
  for (let i = 0; i < 72 * 8 && !swung; i++) {
    await step(1 / 72);
    swung = await page.evaluate(
      ([family, kind, x, z, pick]) => {
        const d = window.__descent;
        const e = eval(pick)(d, family, kind, x, z);
        if (!e) return false;
        const p = e.root.position;
        const you = d.player.feetPosition(p.clone());
        // Keep facing it as it comes, and stay whole for the picture.
        d.teleport(you.x, you.z, Math.atan2(-(p.x - you.x), -(p.z - you.z)));
        return e.state === 'attack' && e.phase === 'active';
      },
      [family, kind, x, z, PICK],
    );
  }
  check(swung, `${name} comes at you and swings`);
  // A moment into the blow, looking up a little to take in the whole swing.
  await step(0.06);
  await page.evaluate(() => Object.assign(window.__descent.device.quaternion, { x: Math.sin(0.12), y: 0, z: 0, w: Math.cos(0.12) }));
  await xrFrames(2);
  await shot(name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
}

/** Come within raising distance of (x, z), out of notice, if nobody is raised within `r` m of it yet, and wait for them to be. */
async function near(x, z, r) {
  const raised = () =>
    page.evaluate(([x, z, r]) => window.__descent.camps.enemies.filter((e) => Math.hypot(e.root.position.x - x, e.root.position.z - z) < r).length, [x, z, r]);
  if ((await raised()) > 0) return;
  await page.evaluate(([x, z]) => window.__descent.teleport(x, z + 30, 0), [x, z]);
  await step(1.5);
}

/** Go far enough off that the camps sleep, so the next place raises them afresh as you arrive. */
async function away() {
  await page.evaluate(() => window.__descent.teleport(30, 700, 0));
  await step(1);
}

// 1. The line-ups on Turfmoss green, close enough to see faces: they leave you be.
await standLooking(-92, 352, -92, 346, 4);
await standing('Turfmoss green, the Kerchiefs', -92, 346, 6);
await shot('01-lineup-kerchiefs');
await standLooking(-95, 349.5, -95, 346, 0.3, -0.12);
await shot('02-lineup-thugs-close');
await standLooking(-88, 349.5, -88, 346, 0.3, -0.12);
await shot('03-lineup-archer-annis-close');
await standLooking(-91, 359, -91, 353, 1, -0.05);
await standing('Turfmoss green, the diggers and the dead', -91, 353, 6);
await shot('04-lineup-diggers-dead');
await standLooking(-95, 356.5, -95, 353, 0.3, -0.12);
await shot('05-lineup-diggers-close');
await standLooking(-87.5, 356.5, -87.5, 353, 0.3, -0.12);
await shot('06-lineup-sledge-bogdead-close');
await standLooking(-91, 349.5, -91, 353, 0.3, -0.05);
await shot('07-lineup-diggers-behind');

// 2. Raven Scar: the pit's camp, out of their notice, and Red Annis on the lip.
await away();
await frame(-157, 214, 16, 9, true);
await step(3);
await standing('Raven Scar pit', -157, 214, 16);
await frame(-157, 214, 16, 9, true);
await shot('08-scar-pit');
await frame(-151.4, 197.2, 3, 4.5, true);
await standing('Raven Scar lip', -151.4, 197.2, 3);
await shot('09-scar-annis');

// 3. Turfmoss's cuttings and the Blackmire: the bog dead rising out of the peat as you come, then standing.
await away();
await page.evaluate(() => window.__descent.teleport(-104, 372, Math.atan2(-(-112 + 104), -(377 - 372))));
await step(0.9);
await shot('10-turfmoss-rising');
await step(3);
await standing('Turfmoss cuttings', -112, 377, 8);
await frame(-112, 377, 8, 6, true);
await shot('11-turfmoss-bogdead');
await frame(-131, 409, 8, 6, true);
await standing('the Blackmire', -131, 409, 8);
await shot('12-blackmire-bogdead');
await frame(-153, 431, 9, 7, true);
await standing('the hide', -153, 431, 9);
await shot('13-hide');

// 4. The barrow field: the lamp crew at the dig, and the fallen by the open barrow.
await frame(216, 235, 9, 7, true);
await standing('the east dig', 216, 235, 9);
await shot('14-lamp-dig');
await standLooking(159, 187, 163.5, 181, 1, -0.35);
await shot('15-fallen-at-the-barrow');
await standLooking(164, 185, 163.5, 181, 0.2, -0.6);
await shot('16-fallen-close');

// 5. In a fight: walk up to each and catch it mid-swing.
await swing('moorBandit', 'brute', '17 Red Annis swings', -151.4, 197.2);
await swing('moorBandit', 'brute', '18 Kerchief digger swings', -151, 437.6);
await swing('bogDead', 'brute', '19 Bog dead brute swings', -128, 412);

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
