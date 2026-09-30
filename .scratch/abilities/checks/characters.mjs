// Checks for characters (issues/18-characters-the-roster-and-the-page-before-vr.md)
// in headless Chromium with the IWER emulator, against a running dev server:
//
//   npx vite --port 5173
//   node .scratch/abilities/checks/characters.mjs [http://localhost:5173] [shots/]
//
// The page before VR is pressed as a player would press it; in VR, "Accept"
// on Hale's board goes straight into the Adventure as the board would send
// it. The roster and each character are read back from IndexedDB itself.
//
// 1. Nothing saved: three slots, the first a new warrior with a suggested
//    name (picked, not saved yet), the others "New character". Nothing is
//    written before VR; taking a quest writes the character under today's key
//    and the roster listing it.
// 2. "New character" in an empty slot opens the form: one class card (the
//    warrior, the only class built) and a suggested name. "Make" with a name
//    typed makes the character, and the page plays it: level 1 at the start,
//    Hale offering his first quest.
// 3. The second warrior takes a quest and walks; the first one's record is
//    unchanged.
// 4. A reload picks the one played last; pressing the first slot plays the
//    first again, with its quest under way.
// 5. Rename: the record and the slot take the new name.
// 6. Delete asks first, naming the character: "Keep" keeps it, "Delete"
//    deletes it from the store and the roster.
// 7. `?newgame` opens the form, and the flag leaves the address; with three
//    characters it says so instead.
// 8. A record from before the roster (version 3) becomes the first character:
//    a warrior named "Warrior", with their level and things.
// 9. No errors on the page.
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
let context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
let page = await context.newPage();
const errors = [];
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
};
watch(page);

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

/** What IndexedDB holds under `key`, or null; never creates the database. */
const idb = (key) =>
  page.evaluate(async (key) => {
    if (!(await indexedDB.databases()).some((d) => d.name === 'descent-vr')) return null;
    return new Promise((resolve, reject) => {
      const open = indexedDB.open('descent-vr');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('save')) return db.close(), resolve(null);
        const get = db.transaction('save').objectStore('save').get(key);
        get.onsuccess = () => (db.close(), resolve(get.result ?? null));
        get.onerror = () => reject(get.error);
      };
    });
  }, key);
/** Put `value` under `key`, as another build would. */
const put = (key, value) =>
  page.evaluate(
    ([key, value]) =>
      new Promise((done) => {
        const open = indexedDB.open('descent-vr');
        open.onsuccess = () => {
          const tx = open.result.transaction('save', 'readwrite');
          tx.objectStore('save').put(value, key);
          tx.oncomplete = () => (open.result.close(), done());
        };
      }),
    [key, value],
  );
const saved = async (key) => {
  await page.evaluate(() => window.__descent.saved());
  return idb(key);
};

/** The slots as the page shows them. */
const slots = () =>
  page.$$eval('#characters .slot', (rows) =>
    rows.map((r) => ({
      key: r.dataset.key ?? null,
      picked: 'picked' in r.dataset,
      text: r.querySelector('.card, .make')?.innerText.replace(/\s+/g, ' ').trim(),
      buttons: [...r.querySelectorAll('button:not(.card)')].map((b) => b.textContent),
    })),
  );
const you = () =>
  page.evaluate(() => {
    const { state, characters } = window.__descent;
    const played = characters.play();
    return { key: played.key, name: played.who.name, class: state.class, level: state.level, marker: state.hale.marker, coins: state.inventory.coins };
  });

/** Open `query`, and wait for the Adventure and the page's slots. */
async function open(query = '') {
  await page.goto(`${base}/?emulate&nodevui${query}`);
  await ready();
}
async function ready() {
  await page.waitForFunction(() => window.__descent?.adventure && document.querySelector('#characters'), null, { timeout: 120000 });
}
async function enterVR() {
  await page.click('#VRButton');
  await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
  await xrFrames(3);
  await page.evaluate(() => (window.__descent.paused = true));
}
const accept = () => page.evaluate(() => window.__descent.adventure.apply({ kind: 'accept' }, window.__descent.adventure.hale.position));
/** Press something on the page that loads it again, and wait for the Adventure. */
async function pressAndReload(press) {
  await Promise.all([page.waitForEvent('load', { timeout: 60000 }), press()]);
  await ready();
}

// 1. Nothing saved.
await open();
let first;
{
  const s = await slots();
  const y = await you();
  check(s.length === 3, `three slots (${s.length})`);
  check(s[0].picked && s[0].text.startsWith(y.name) && /Level 1 warrior, new: saved once you play/.test(s[0].text), `the first: a new warrior, picked ("${s[0].text}")`);
  check(s[1].text === 'New character' && s[2].text === 'New character', `the others: "${s[1].text}", "${s[2].text}"`);
  check((await idb('roster')) === null && (await idb('character')) === null, 'nothing written before VR');
  await shot('01-nothing-saved');
  await enterVR();
  await accept();
  first = await saved('character');
  const roster = await idb('roster');
  check(first?.version === 5 && first.class === 'warrior' && first.name === y.name && first.quests.raiders.stage === 'active', `taking a quest writes ${first?.name}, a ${first?.class}, version ${first?.version}`);
  check(JSON.stringify(roster) === JSON.stringify({ version: 1, characters: ['character'], last: 'character' }), `and the roster listing them (${JSON.stringify(roster)})`);
}

// 2. A second warrior.
await open();
{
  const s = await slots();
  check(s[0].picked && s[0].text === `${first.name} Level 1 warrior, Oakvale` && s[0].buttons.join() === 'Rename,Delete', `the first slot: "${s[0].text}" with ${s[0].buttons.join(' and ')}`);
  await page.click('#characters .slot:nth-of-type(2) .make');
  await page.waitForSelector('#new-character[open]');
  const form = await page.evaluate(() => ({
    cards: [...document.querySelectorAll('#new-character .class-card')].map((c) => c.innerText.replace(/\s+/g, ' ').trim()),
    name: document.querySelector('#new-character input[name=name]').value,
  }));
  check(form.cards.length === 1 && form.cards[0].startsWith('Warrior Sword and shield'), `the form's class cards: ${form.cards.join(' | ')}`);
  check(form.name.length > 0 && form.name !== first.name, `a suggested name, not the first's ("${form.name}")`);
  await shot('02-new-character-form');
  await page.fill('#new-character input[name=name]', 'Second');
  await pressAndReload(() => page.click('#new-character button[value=make]'));
  const y = await you();
  const t = await slots();
  check(y.key === 'character-2' && y.name === 'Second' && y.class === 'warrior' && y.level === 1 && y.marker === 'offered', `the page plays it: ${y.name}, level ${y.level}, Hale ${y.marker}`);
  check(t[1].picked && !t[0].picked && t[1].text === 'Second Level 1 warrior, Oakvale', `picked in the second slot ("${t[1].text}")`);
  await shot('03-second-picked');
}

// 3. The second plays; the first is untouched.
{
  await enterVR();
  await accept();
  await page.evaluate(() => window.__descent.teleport(20, 10, 1));
  await xrFrames(2);
  await page.evaluate(() => (window.__descent.step(1 / 72), window.__descent.adventure.saves.onLeaving()));
  const second = await saved('character-2');
  check(second?.name === 'Second' && second.quests.raiders.stage === 'active' && Math.abs(second.position.x - 20) < 0.5, `the second's record: ${second?.name}, Raiders ${second?.quests.raiders.stage}, at x ${second?.position?.x.toFixed(1)}`);
  check(JSON.stringify(await idb('character')) === JSON.stringify(first), "the first's record is unchanged");
  check((await idb('roster'))?.last === 'character-2', 'the roster has the second as the one played last');
}

// 4. Last played, and picking.
await open();
{
  check((await you()).key === 'character-2', 'a reload picks the one played last');
  await pressAndReload(() => page.click('#characters .slot:nth-of-type(1) .card'));
  const y = await you();
  check(y.key === 'character' && y.name === first.name && y.marker === 'active', `pressing the first slot plays ${y.name}, with Raiders under way (Hale ${y.marker})`);
  check(JSON.stringify(await idb('character')) === JSON.stringify(first), 'and picking writes nothing to the character');
}

// 5. Rename.
{
  await page.click('#characters .slot:nth-of-type(2) .rename');
  await page.waitForSelector('#rename-character[open]');
  await page.fill('#rename-character input[name=name]', 'Third');
  await page.click('#rename-character button[value=rename]');
  await page.waitForFunction(() => document.querySelector('#characters .slot:nth-of-type(2) .card')?.innerText.includes('Third'));
  const r = await idb('character-2');
  check(r?.name === 'Third' && r.quests.raiders.stage === 'active', `renamed: the record says ${r?.name}, and kept its quest`);
  await shot('04-renamed');
}

// 6. Delete.
{
  await page.click('#characters .slot:nth-of-type(2) .delete');
  await page.waitForSelector('#delete-character[open]');
  const asks = (await page.locator('#delete-character').innerText()).replace(/\s+/g, ' ').trim();
  check(/^Delete Third\? Third, the level 1 warrior, will be deleted for good\./.test(asks), `it asks first: "${asks}"`);
  await shot('05-delete-asks');
  await page.click('#delete-character button[value=no]');
  check((await idb('character-2'))?.name === 'Third' && (await slots())[1].key === 'character-2', '"Keep" keeps it');
  await page.click('#characters .slot:nth-of-type(2) .delete');
  await page.waitForSelector('#delete-character[open]');
  await page.click('#delete-character button[value=yes]');
  await page.waitForFunction(() => document.querySelectorAll('#characters .make').length === 2);
  const roster = await idb('roster');
  check((await idb('character-2')) === null && roster.characters.join() === 'character', `"Delete" deletes it (roster: ${roster.characters.join()})`);
  check((await you()).key === 'character', 'and the first is still the one picked');
}

// 7. ?newgame.
{
  await page.goto(`${base}/?newgame&emulate&nodevui`);
  await page.waitForSelector('#new-character[open] .class-card', { timeout: 60000 });
  check(true, '?newgame opens the new-character form');
  await page.click('#new-character button[value=cancel]');
  await ready();
  check(!page.url().includes('newgame') && (await you()).key === 'character', `"Cancel" carries on with the picked one, and the flag leaves the address (${page.url()})`);
  for (const name of ['Fourth', 'Fifth']) {
    await page.goto(`${base}/?newgame&emulate&nodevui`);
    await page.waitForSelector('#new-character[open] .class-card', { timeout: 60000 });
    await page.fill('#new-character input[name=name]', name);
    await page.click('#new-character button[value=make]');
    await ready();
  }
  const y = await you();
  check(y.name === 'Fifth' && (await slots()).every((s) => s.key), `making from ?newgame plays the new one (${y.name}), and all three slots are full`);
  await page.goto(`${base}/?newgame&emulate&nodevui`);
  await page.waitForSelector('#new-character[open]', { timeout: 60000 });
  const says = (await page.locator('#new-character').innerText()).replace(/\s+/g, ' ').trim();
  check(/Three characters already/.test(says) && /Delete one/.test(says), `with three it says so: "${says}"`);
  await shot('06-three-already');
  await page.click('#new-character button[value=ok]');
  await ready();
  await shot('07-three-slots');
}

// 8. A record from before the roster.
await context.close();
context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
page = await context.newPage();
watch(page);
{
  await open(); // makes the database
  const quests = { raiders: { stage: 'handedIn', counts: [3] }, lumber: { stage: 'active', counts: [1, 0], taken: 1 }, below: { stage: 'locked', counts: [0] } };
  const kit = await page.evaluate(() => window.__descent.state.inventory.snapshot());
  const v3 = { version: 3, savedAt: 1, level: 3, xp: 400, quests, wardenBeaten: false, inventory: { ...kit, coins: 23 }, professions: { learned: {}, recipes: [] }, position: { x: 4, z: -8 }, facing: 0, interior: null };
  await put('character', v3);
  await open();
  const s = await slots();
  const y = await you();
  check(s[0].picked && s[0].text === 'Warrior Level 3 warrior, Oakvale', `it becomes the first character: "${s[0].text}"`);
  check(y.key === 'character' && y.class === 'warrior' && y.level === 3 && y.coins === 23 && y.marker === 'active', `a warrior at level ${y.level} with ${y.coins} coins, on The Lumber Camp`);
  check((await idb('roster')) === null && (await idb('character')).version === 3, 'nothing is written before VR');
  await enterVR();
  await page.evaluate(() => (window.__descent.step(1 / 72), window.__descent.adventure.saves.onLeaving()));
  const r = await saved('character');
  check(r?.version === 5 && r.name === 'Warrior' && r.inventory.coins === 23, `the first write is version ${r?.version}, ${r?.name}, ${r?.inventory.coins} coins`);
  check(JSON.stringify(await idb('roster')) === JSON.stringify({ version: 1, characters: ['character'], last: 'character' }), 'with the roster listing them');
}

const pageErrors = errors.filter((e) => !/WebGL|GPU stall/.test(e));
check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
