// The barrow dead, the vault dead and the Keyward where they'll stand, at
// walking height, in headless Chromium with the IWER emulator. Start
// `npx vite --port 5173` first, then:
//
//   node .scratch/barrow-dead/checks/zone.mjs [http://localhost:5173] [shots/]
//
// No zone places them yet (Brackenmoor's and Aldhaven's placement threads
// do), so this adds their camps for the check, left neutral so they stand at
// their posts rather than fight: at Hollowhill's mouth and the open barrow,
// at the posts Brackenmoor's inhabitant spec gives; and the vault dead with
// the Keyward in Aldhaven's Cathedral Close, above the Sealed Vault (the
// Undercroft isn't built). Then a line-up of every look at each, standing
// still in their idle, an undead grunt and a Watchman beside them for scale.
// Each must stand on the ground.
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
const standLooking = async (x, z, tx, tz, settle = 0.5) => {
  await page.evaluate(([x, z, yaw]) => window.__descent.teleport(x, z, yaw), [x, z, Math.atan2(-(tx - x), -(tz - z))]);
  await step(settle);
  for (let i = 0; i < 900; i++) {
    const pending = await page.evaluate(() => window.__descent.world.chunksPending + window.__descent.world.neighboursPending);
    if (pending === 0) break;
    await step(1 / 72);
    await xrFrames(1);
  }
  await xrFrames(3);
};

/** Neutral until a quest moment a new game hasn't reached: they stand and watch. */
const NEUTRAL = { quest: 'letters', stage: 'active' };
const post = (behaviour, family, x, z, extra = {}) => ({ behaviour, family, x, z, yaw: 0, ...extra });
const camp = (id, level, posts) => {
  const x = posts.reduce((s, p) => s + p.x, 0) / posts.length;
  const z = posts.reduce((s, p) => s + p.z, 0) / posts.length;
  return { id, place: { x, z, r: 12 }, level, posts, neutralUntil: NEUTRAL };
};
const CAMPS = {
  // Brackenmoor's spec: barrow dead come out of Hollowhill's open door.
  mouth: camp('check-hollowhill-mouth', 11, [post('grunt', 'barrow', 186.5, 218.5), post('grunt', 'barrow', 193.5, 218.5), post('brute', 'barrow', 190, 222)]),
  // And the broken barrow whose dead got out.
  barrow: camp('check-open-barrow', 10, [post('grunt', 'barrow', 162, 186), post('grunt', 'barrow', 157, 184), post('archer', 'barrow', 168, 187)]),
  // Aldhaven: the Sealed Vault's six (3 grunts, 2 archers, a brute) and the Keyward, in the close over it.
  vault: camp('check-sealed-vault', 17, [
    post('grunt', 'vault', 449, 369),
    post('grunt', 'vault', 452.5, 371),
    post('grunt', 'vault', 446, 371.5),
    post('archer', 'vault', 456, 373),
    post('archer', 'vault', 442, 373.5),
    post('brute', 'vault', 444.5, 368.5),
    post('brute', 'vault', 462, 369, { named: 'keyward', level: 18 }),
  ]),
};

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

const members = (id) =>
  page.evaluate((id) => {
    const d = window.__descent;
    const c = d.camps.camps.find((c) => c.plan.id === id);
    return (c?.members ?? []).map((m) => {
      const e = m.enemy;
      const p = e.position;
      return { family: e.family, kind: e.kind, named: m.plan.named ?? null, y: p.y, ground: d.world.heightAt(p.x, p.z), lift: e.visual.position.y, state: e.state, mind: m.mind, triangles: e.rig.triangles, boss: e.boss?.name ?? null };
    });
  }, id);
const visit = async (plan, from, at, name, more = []) => {
  // Everyone turned to the spot you first see them from (an enemy at yaw 0 faces +Z).
  plan = { ...plan, posts: plan.posts.map((p) => ({ ...p, yaw: Math.atan2(from[0] - p.x, from[1] - p.z) })) };
  await standLooking(from[0], from[1], at[0], at[1], 0.2);
  await page.evaluate((plan) => window.__descent.camps.add([plan], window.__descent.world, true), plan);
  // Long enough for the dead to rise out of the ground, the Keyward slowest.
  await standLooking(from[0], from[1], at[0], at[1], 4);
  const ms = await members(plan.id);
  check(ms.length === plan.posts.length, `${plan.id}: all ${plan.posts.length} raised (${ms.length})`);
  for (const m of ms) {
    const who = `${plan.id}: ${m.family} ${m.named ?? m.kind}`;
    check(m.state === 'move' && Math.abs(m.lift) < 0.01, `${who} has risen (${m.state}), ${m.triangles} triangles${m.boss ? `, ${m.boss}` : ''}`);
    check(Math.abs(m.y - m.ground) < 0.05, `${who} stands on the ground (${(m.y - m.ground).toFixed(2)} m)`);
  }
  await shot(name);
  for (const [i, [fx, fz, tx, tz]] of more.entries()) {
    await standLooking(fx, fz, tx, tz, 0.3);
    await shot(`${name}-${i + 1}`);
  }
};

/** Every look in a row from (x, z) eastward, `gap` apart, facing +Z, standing still at idle. */
const lineUp = (looks, x, z, gap) =>
  page.evaluate(
    async ([looks, x, z, gap]) => {
      const { createEnemy } = await import('/src/enemies/kinds.ts');
      const { IDLE } = await import('/src/enemies/poses.ts');
      const d = window.__descent;
      let scene = d.camera;
      while (scene.parent) scene = scene.parent;
      let at = x;
      const out = [];
      for (const [kind, family, variant, named, width] of looks) {
        at += width / 2;
        const e = createEnemy(kind, at, z, { family, variant, named, level: 10 });
        e.visual.position.y = 0;
        e.position.y = d.world.heightAt(at, z);
        e.rig.apply(IDLE[kind]);
        e.root.updateMatrixWorld(true);
        scene.add(e.root);
        out.push({ who: `${family} ${named ?? kind} v${variant}`, x: at, triangles: e.rig.triangles });
        at += width / 2 + gap;
      }
      return out;
    },
    [looks, x, z, gap],
  );

// Hollowhill: from the end of the Fells path, looking up at the door, then in close.
await visit(CAMPS.mouth, [190, 233], [190, 218], '01-hollowhill-mouth', [
  [187.5, 226.5, 190, 220],
  [195.5, 224, 193.5, 218.5],
]);
// The open barrow, its dead stood by its mouth.
await visit(CAMPS.barrow, [163, 196], [162, 185], '02-open-barrow', [[160, 190.5, 157, 184]]);
// Every barrow look in a row at Hollowhill's foot, an undead grunt first for scale.
const BARROW = [
  ['grunt', 'undead', 0, undefined, 0.8],
  ['grunt', 'barrow', 0, undefined, 0.8],
  ['grunt', 'barrow', 1, undefined, 0.8],
  ['grunt', 'barrow', 2, undefined, 0.8],
  ['grunt', 'barrow', 3, undefined, 0.8],
  ['archer', 'barrow', 0, undefined, 0.8],
  ['brute', 'barrow', 0, undefined, 1.2],
  ['warden', 'barrow', 0, undefined, 1.4],
];
const row = await lineUp(BARROW, 199, 229, 0.5);
check(row.length === BARROW.length, `barrow line-up: ${row.map((r) => `${r.who} ${r.triangles}`).join(', ')}`);
const mid = (row[0].x + row.at(-1).x) / 2;
await standLooking(mid, 236.5, mid, 229, 0.2);
await shot('03-barrow-lineup');
await standLooking(row.at(-1).x - 1.2, 231.6, row.at(-1).x - 0.8, 229, 0.2);
await shot('03-barrow-lineup-thane');

// Aldhaven's Cathedral Close: the vault dead and the Keyward under the cathedral's south wall.
await page.evaluate(() => window.__descent.people.add([{ id: 'check-watchman', cast: 'watchman', x: 468, z: 373, yaw: -0.6 }]));
await visit(CAMPS.vault, [451, 375], [455, 368], '04-cathedral-close', [
  [457, 375.5, 462, 369],
  [449.5, 374.5, 449, 369],
  [441, 376, 444.5, 368.5],
]);
// Every vault look in a row, the Keyward last, a Watchman at the end for scale.
const VAULT = [
  ['grunt', 'undead', 0, undefined, 0.8],
  ['grunt', 'vault', 0, undefined, 0.8],
  ['grunt', 'vault', 1, undefined, 0.8],
  ['grunt', 'vault', 2, undefined, 0.8],
  ['archer', 'vault', 0, undefined, 0.8],
  ['brute', 'vault', 0, undefined, 1.2],
  ['brute', 'vault', 0, 'keyward', 2.6],
];
const vrow = await lineUp(VAULT, 430, 366, 0.5);
check(vrow.length === VAULT.length, `vault line-up: ${vrow.map((r) => `${r.who} ${r.triangles}`).join(', ')}`);
await page.evaluate(([x, z]) => window.__descent.people.add([{ id: 'check-watchman-2', cast: 'watchman', x, z, yaw: 0 }]), [vrow.at(-1).x + 2.2, 366]);
const vmid = (vrow[0].x + vrow.at(-1).x) / 2 + 1;
await standLooking(vmid, 376, vmid, 366, 0.4);
await shot('05-vault-lineup');
await standLooking(vrow.at(-1).x - 1, 370.5, vrow.at(-1).x, 366, 0.2);
await shot('05-vault-lineup-keyward');

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
