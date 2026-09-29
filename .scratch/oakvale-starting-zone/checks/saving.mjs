// Checks for saving (issues/19-saving.md) in headless Chromium with the IWER
// emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/oakvale-starting-zone/checks/saving.mjs [http://localhost:5173] [shots/]
//
// Game time is stepped through the debug handle (`paused`, `step`,
// `teleport`), not XR frames. The board's buttons are the Hale check's
// business: here "Accept" and "Hand in" go straight into the Adventure as the
// board would send them, and the farm's bandits are felled with a blow big
// enough to kill. The save is read back from IndexedDB itself.
//
// 1. A new character, with nothing saved: level 1 at the start, no note on the
//    page, and nothing written before VR, even when the page is hidden.
// 2. In VR: taking Raiders in the Fields, each of three kills and the hand-in
//    write at once; the record has level 2, the quests, the sword and the
//    Warden, and `navigator.storage.persist()`'s answer is logged.
// 3. Taking The Lumber Camp, then standing somewhere else for 30 s of play:
//    the record has where you stand and the way you face.
// 4. A reload: before VR the page shows Oakvale from the save; you're level 2
//    at full health (120) with no rage, on The Lumber Camp at 0/5, every camp
//    full; in VR you stand where you stood, facing the same way.
// 5. Hiding the page, and ending VR, each write where you stand.
// 6. `?newgame`: a dialog on the page before VR; "Carry on" keeps the save,
//    "Start over" deletes it and starts a new character at the start. The
//    flag leaves the address either way.
// 7. The arena and `?map=forest` never read or write the save.
// 8. Where IndexedDB won't open, the game plays and the page says progress
//    won't be kept. A newer build's record is left alone, and the page says so.
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
const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const page = await context.newPage();
const errors = [];
const logs = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' ? errors.push(m.text()) : logs.push(m.text())));

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};
const shot = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });
const near = (a, b, within = 0.05) => Math.abs(a - b) <= within;
/** The difference between two headings, in radians, the short way round. */
const turnBetween = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
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

/** The record IndexedDB holds, or null; never creates the database. */
const record = () =>
  page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((d) => d.name === 'descent-vr')) return null;
    return new Promise((resolve, reject) => {
      const open = indexedDB.open('descent-vr');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('save')) return db.close(), resolve(null);
        const get = db.transaction('save').objectStore('save').get('character');
        get.onsuccess = () => (db.close(), resolve(get.result ?? null));
        get.onerror = () => reject(get.error);
      };
    });
  });
/** The record once every write in flight has landed. */
const saved = async () => {
  await page.evaluate(() => window.__descent.saved());
  return record();
};

/** Where you are and what you have: the head's ground position and heading, and the state's answers. */
const you = () =>
  page.evaluate(() => {
    const { camera, player, state, camps } = window.__descent;
    const head = camera.getWorldPosition(camera.position.clone());
    const q = camera.getWorldQuaternion(camera.quaternion.clone());
    return {
      x: head.x,
      z: head.z,
      // The heading as the save keeps it (a 'YXZ' Euler's y): 0 looks down −Z.
      facing: Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y)),
      level: state.level,
      xp: state.xp,
      marker: state.hale.marker,
      tracker: state.tracker,
      hp: player.hp,
      maxHp: player.maxHp,
      rage: player.rage,
      standing: camps.camps.map((c) => c.members.filter((m) => m.enemy.alive).length),
      full: camps.camps.map((c) => c.members.length),
    };
  });

/** Open `query`, and wait for the Adventure. */
async function open(query) {
  await page.goto(`${base}/${query}`);
  await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
}
async function enterVR() {
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  await page.evaluate(() => (window.__descent.paused = true));
}
/** As the board's buttons send them: "Accept" and "Hand in". */
const board = (kind) => page.evaluate((kind) => window.__descent.adventure.apply({ kind }, window.__descent.adventure.hale.position), kind);
/** Stand at (x, z) facing `yaw`, and let a frame of play bring the head there. */
async function standAt(x, z, yaw) {
  await page.evaluate(([x, z, yaw]) => window.__descent.teleport(x, z, yaw), [x, z, yaw]);
  await xrFrames(2);
  await step(1 / 72);
}
/** The page goes out of view (another tab, the browser minimised). */
const hidePage = () =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
  });

// 1. A new character.
await open('?emulate&nodevui');
{
  const y = await you();
  const start = await page.evaluate(() => window.__descent.world.zoneAt(0, 0).spawn);
  check(y.level === 1 && y.xp === 0 && y.marker === 'offered', `a new character: level ${y.level}, ${y.xp} XP, Hale offering (${y.marker})`);
  check(near(y.x, start.x) && near(y.z, start.z), `before VR the page looks out from the start (${y.x.toFixed(2)}, ${y.z.toFixed(2)})`);
  check((await page.locator('.save-note').count()) === 0, 'no note about saving on the page');
  await hidePage();
  check((await record()) === null, 'nothing is written before VR, even when the page is hidden');
}

// 2. Earning things writes at once.
await enterVR();
{
  await board('accept');
  let r = await saved();
  check(r?.version === 1 && r.quests.raiders.stage === 'active', `taking Raiders in the Fields writes it (${r?.quests.raiders.stage})`);
  await step(4); // the camps finish rising out of the ground
  await standAt(54.5, 26, Math.atan2(-(60 - 54.5), -(33 - 26)));
  const counts = [];
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const camp = window.__descent.camps.camps.find((c) => c.plan.id === 'farm');
      const m = camp.members.find((m) => m.enemy.alive);
      m.enemy.takeHit(999, m.enemy.position.clone().set(0, 0, 0));
    });
    await step(0.2);
    r = await saved();
    counts.push(`${r.quests.raiders.counts[0]} ${r.quests.raiders.stage}`);
  }
  check(counts.join(', ') === '1 active, 2 active, 3 ready', `each kill writes its count, the third the quest ready (${counts.join(', ')})`);
  await standAt(0.2, 1.5, 0);
  await board('handIn');
  r = await saved();
  check(
    r.level === 2 && r.xp === 110 && r.quests.raiders.stage === 'handedIn' && r.quests.lumber.stage === 'offered',
    `the hand-in writes level ${r.level}, ${r.xp} XP, Raiders ${r.quests.raiders.stage}, The Lumber Camp ${r.quests.lumber.stage}`,
  );
  check(r.sword === 'plain' && r.wardenBeaten === false && r.interior === null, `the sword (${r.sword}), the Warden (beaten: ${r.wardenBeaten}), no interior (${r.interior})`);
  check(logs.some((l) => l.startsWith('Storage persisted:')), `persist()'s answer is logged (${logs.find((l) => l.startsWith('Storage persisted:'))})`);
}

// 3. Where you stand, every 30 s.
const STOOD = { x: 24, z: 12, facing: -1.2 };
{
  await board('accept');
  let r = await saved();
  check(r.quests.lumber.stage === 'active', `taking The Lumber Camp writes it (${r.quests.lumber.stage})`);
  await standAt(STOOD.x, STOOD.z, STOOD.facing);
  const at = await you();
  Object.assign(STOOD, { x: at.x, z: at.z, facing: at.facing });
  const before = r.savedAt;
  await step(29);
  r = await saved();
  check(r.savedAt === before, 'nothing new after 29 s of play');
  await step(1.2);
  r = await saved();
  check(
    r.savedAt > before && near(r.position.x, STOOD.x) && near(r.position.z, STOOD.z) && turnBetween(r.facing, STOOD.facing) < 0.02,
    `after 30 s, where you stand: (${r.position.x.toFixed(2)}, ${r.position.z.toFixed(2)}) facing ${r.facing.toFixed(2)}`,
  );
}

// 4. A reload.
await open('?emulate&nodevui');
{
  const y = await you();
  check(near(y.x, STOOD.x) && near(y.z, STOOD.z), `before VR the page looks out from the save (${y.x.toFixed(2)}, ${y.z.toFixed(2)})`);
  await shot('01-page-before-vr-from-the-save');
  check(y.level === 2 && y.xp === 110, `level ${y.level}, ${y.xp} XP`);
  check(y.hp === 120 && y.maxHp === 120 && y.rage === 0, `full health (${y.hp}/${y.maxHp}) and no rage (${y.rage})`);
  check(
    y.marker === 'active' && y.tracker?.title === 'The Lumber Camp' && y.tracker.lines[0] === 'Bandits defeated at the lumber camp: 0/5',
    `on The Lumber Camp (${y.tracker?.title}: ${y.tracker?.lines.join(' / ')})`,
  );
  check(y.standing.join() === y.full.join(), `every camp full (${y.standing.join()} of ${y.full.join()})`);
  await enterVR();
  const v = await you();
  check(near(v.x, STOOD.x) && near(v.z, STOOD.z), `in VR you stand where you stood (${v.x.toFixed(2)}, ${v.z.toFixed(2)})`);
  check(turnBetween(v.facing, STOOD.facing) < 0.02, `facing the way you faced (${v.facing.toFixed(2)}, saved ${STOOD.facing.toFixed(2)})`);
  await shot('02-in-vr-where-you-stood');
}

// 5. Leaving.
{
  await standAt(4, -8, 1);
  await hidePage();
  let r = await saved();
  check(near(r.position.x, 4, 0.1) && near(r.position.z, -8, 0.1), `hiding the page writes where you stand (${r.position.x.toFixed(2)}, ${r.position.z.toFixed(2)})`);
  await standAt(6, -5, -0.5);
  await page.evaluate(() => window.__descent.renderer.xr.getSession().end());
  await page.waitForFunction(() => !window.__descent.renderer.xr.isPresenting);
  r = await saved();
  check(near(r.position.x, 6, 0.1) && near(r.position.z, -5, 0.1), `ending VR writes where you stand (${r.position.x.toFixed(2)}, ${r.position.z.toFixed(2)})`);
}

// 6. ?newgame.
{
  const kept = await record();
  await page.goto(`${base}/?newgame&emulate&nodevui`);
  await page.waitForSelector('#new-game[open]', { timeout: 60000 });
  const asks = await page.locator('#new-game').innerText();
  check(/level 2 character, on The Lumber Camp,/.test(asks), `a dialog asks first: "${asks.replace(/\s+/g, ' ').trim()}"`);
  await shot('03-newgame-asks');
  await page.click('#new-game button[value=no]');
  await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
  let y = await you();
  check(y.level === 2 && JSON.stringify(await record()) === JSON.stringify(kept), `"Carry on" keeps the save (level ${y.level})`);
  check(!page.url().includes('newgame'), `and the flag leaves the address (${page.url()})`);

  await page.goto(`${base}/?newgame&emulate&nodevui`);
  await page.waitForSelector('#new-game[open]', { timeout: 60000 });
  await page.click('#new-game button[value=yes]');
  await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
  y = await you();
  const start = await page.evaluate(() => window.__descent.world.zoneAt(0, 0).spawn);
  check((await record()) === null, '"Start over" deletes the save');
  check(
    y.level === 1 && y.xp === 0 && y.marker === 'offered' && y.tracker === null && near(y.x, start.x) && near(y.z, start.z),
    `and starts a new character at the start (level ${y.level}, Hale ${y.marker}, at ${y.x.toFixed(2)}, ${y.z.toFixed(2)})`,
  );
  check(!page.url().includes('newgame'), 'and the flag leaves the address');
  await enterVR();
  await board('accept');
  const r = await saved();
  check(r.level === 1 && r.quests.raiders.stage === 'active', 'the new character saves from there');
}

// 7. The arena and walking the map leave the save alone.
{
  const kept = JSON.stringify(await record());
  await page.goto(`${base}/?arena&emulate&nodevui`);
  await page.waitForFunction(() => window.__descent?.game, null, { timeout: 120000 });
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(10);
  await page.evaluate(() => window.__descent.renderer.xr.getSession().end());
  await hidePage();
  check(JSON.stringify(await record()) === kept, 'the arena leaves the save alone');
  await page.goto(`${base}/?map=forest&noemulate`);
  await page.waitForFunction(() => window.__descent, null, { timeout: 120000 });
  await page.waitForTimeout(1000);
  await hidePage();
  check(JSON.stringify(await record()) === kept, '?map=forest leaves the save alone');
}

// 8. Where the save can't be kept.
{
  const newer = { ...(await record()), version: 99 };
  await open('?emulate&nodevui');
  await page.evaluate(
    (r) =>
      new Promise((done) => {
        const open = indexedDB.open('descent-vr');
        open.onsuccess = () => {
          const tx = open.result.transaction('save', 'readwrite');
          tx.objectStore('save').put(r, 'character');
          tx.oncomplete = () => (open.result.close(), done());
        };
      }),
    newer,
  );
  await open('?emulate&nodevui');
  const note = await page.locator('.save-note').innerText();
  const y = await you();
  check(/newer version/.test(note) && y.level === 1, `a newer build's record: a new character, and the page says "${note}"`);
  await shot('04-newer-save-note');
  await enterVR();
  await board('accept');
  await page.evaluate(() => window.__descent.saved());
  check((await record())?.version === 99, 'and the newer record is left as it was');

  const locked = await context.browser().newContext({ viewport: { width: 1200, height: 800 } });
  const other = await locked.newPage();
  await other.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
  });
  other.on('pageerror', (e) => errors.push(e.message));
  await other.goto(`${base}/?emulate&nodevui`);
  await other.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
  const said = await other.locator('.save-note').innerText();
  const level = await other.evaluate(() => window.__descent.state.level);
  check(/won't be kept/.test(said) && level === 1, `where IndexedDB won't open, the game plays (level ${level}) and the page says "${said}"`);
  if (shots) await other.screenshot({ path: `${shots}/05-unsaved-note.png` });
  await locked.close();
}

const pageErrors = errors.filter((e) => !/WebGL|GPU stall/.test(e));
check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
