// Checks for the city's people (models/cityCast.ts) and their work loops
// (people/trades.ts) in the model inspector, in headless Chromium against a
// running dev server:
//
//   npx vite --port 5173
//   node .scratch/aldhaven-townsfolk/checks/looks.mjs [http://localhost:5173] [shots/]
//
// 1. The inspector lists every one of the city's cast, and each plays every
//    one of its clips (standing, standing about, each work, sitting, carrying,
//    walking) with every bone in place, one body under 900 triangles, its
//    laden body too.
// 2. Rows of the looks standing, front and back, beside a skeleton grunt for
//    scale; rows of them at their work; sitting on a bench; carrying.
//
// Playwright is the global install; Chromium is the pre-installed one.

import { mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const shots = process.argv[3];
const only = process.argv[4];
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};
const errors = [];
const frames = (page, n) =>
  page.evaluate(
    (n) =>
      new Promise((done) => {
        let k = 0;
        const next = () => (++k >= n ? done() : requestAnimationFrame(next));
        requestAnimationFrame(next);
      }),
    n,
  );

const page = await browser.newPage({ viewport: { width: 1800, height: 800 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}/?inspect&noemulate`);
await page.waitForFunction(() => window.__descent?.inspector, null, { timeout: 120000 });

const CITY = await page.evaluate(async () => Object.keys((await import('/src/models/cityCast.ts')).CITY_CAST));

// ---------------------------------------------------------------- 1. every clip
if (!only) {
  const labels = await page.evaluate(async () => (await import('/src/inspector/inspector.ts')).ENTRIES.filter((e) => 'cast' in e).map((e) => e.cast));
  check(
    CITY.every((id) => labels.includes(id)),
    `the inspector lists all ${CITY.length} of the city's cast`,
  );
  for (const id of CITY) {
    const r = await page.evaluate(async (id) => {
      const { ENTRIES } = await import('/src/inspector/inspector.ts');
      const { inspector } = window.__descent;
      inspector.show(ENTRIES.findIndex((e) => e.cast === id));
      const b = inspector.current;
      let placed = true;
      let laden = 0;
      for (let c = 0; c < b.clips.length; c++) {
        inspector.playClip(c);
        inspector.playing = true;
        for (let t = 0; t < b.clips[c].duration; t += 1 / 10) {
          inspector.update(1 / 10);
          for (const bone of Object.values(b.rig.bones)) if (!bone.matrixWorld.elements.every(Number.isFinite)) placed = false;
          if (b.laden && b.rig.mesh.geometry === b.laden.load) laden = Math.max(laden, b.rig.triangles);
        }
      }
      inspector.playClip(0);
      inspector.update(0);
      return { clips: b.clips.map((c) => c.name), triangles: b.rig.triangles, laden, placed };
    }, id);
    check(r.placed && r.clips.includes('walk') && r.clips.includes('sit'), `${id} plays all ${r.clips.length} clips, every bone in place (${r.clips.join(', ')})`);
    check(r.triangles < 900 && r.laden < 900, `${id} is one body of ${r.triangles} triangles${r.laden ? `, ${r.laden} laden` : ''}`);
  }
}

// ---------------------------------------------------------------- 2. rows
await page.evaluate(() => {
  const { inspector } = window.__descent;
  inspector.turntable.parent.parent.visible = false;
  inspector.panel.mesh.visible = false;
  inspector.showGuides = false;
});

/**
 * A row of the cast, each at a moment of one of their clips: `cells` are
 * { id, clip, at (0 to 1 of it), yaw?, bench? (a seat under them, m) }.
 */
const row = (cells, view = {}) =>
  page.evaluate(
    async ([cells, view]) => {
      const { CAST, Wardrobe } = await import('/src/people/cast.ts');
      const { castClips } = await import('/src/inspector/clips.ts');
      const { buildCharacter } = await import('/src/models/characters.ts');
      const { createModelMaterial } = await import('/src/models/materials.ts');
      const { IDLE } = await import('/src/enemies/poses.ts');
      const THREE = await import('/node_modules/.vite/deps/three.js');
      const { inspector, camera } = window.__descent;
      let group = inspector.root.getObjectByName('row');
      if (!group) {
        group = new THREE.Group();
        group.name = 'row';
        inspector.root.add(group);
      }
      group.clear();
      const dx = view.dx ?? 0.85;
      const z = view.z ?? -4.5;
      const n = cells.length + (view.grunt ? 1 : 0);
      const said = [];
      cells.forEach((c, i) => {
        const w = new Wardrobe();
        const rig = w.dress(c.id, createModelMaterial());
        const clips = castClips(c.id);
        const clip = clips.find((k) => k.name === c.clip) ?? clips.find((k) => k.name.startsWith(c.clip)) ?? clips[0];
        const f = clip.sample((c.at ?? 0) * clip.duration, {});
        rig.apply(f.pose);
        const hip = f.hip ?? [0, f.hipY, 0];
        rig.setHipOffset(hip[0], hip[1], hip[2]);
        if (f.laden) rig.mesh.geometry = w.burden(c.id);
        rig.mesh.rotation.y = (c.yaw ?? view.yaw ?? 0) + (f.turn ?? 0);
        const x = (i - (n - 1) / 2) * dx;
        rig.mesh.position.set(x, 0, z);
        group.add(rig.mesh);
        if (c.bench !== undefined) {
          const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, c.bench, 0.4), new THREE.MeshLambertMaterial({ color: 0x8a6a48 }));
          const s = c.yaw ?? view.yaw ?? 0;
          seat.position.set(x - Math.sin(s) * 0.02, c.bench / 2, z - Math.cos(s) * 0.02);
          seat.rotation.y = s;
          group.add(seat);
        }
        said.push(`${c.id}:${clip.name}`);
      });
      if (view.grunt) {
        const grunt = buildCharacter('grunt', { material: createModelMaterial() }).rig;
        grunt.apply(IDLE.grunt);
        grunt.mesh.position.set(((n - 1) / 2) * dx, 0, z);
        grunt.mesh.rotation.y = view.yaw ?? 0;
        group.add(grunt.mesh);
      }
      const width = n * dx;
      camera.fov = view.fov ?? 30;
      camera.updateProjectionMatrix();
      const half = Math.tan(((camera.fov / 2) * Math.PI) / 180);
      const dist = Math.max((width / 2 / half / camera.aspect) * 1.08, ((view.h ?? 2.0) / 2 / half) * 1.05);
      const y = view.y ?? 0.95;
      camera.position.set(0, y + (view.up ?? 0.1), z + dist);
      camera.lookAt(0, y, z);
      return said;
    },
    [cells, view],
  );

const shoot = async (name, cells, view) => {
  if (only && !name.includes(only)) return;
  const said = await row(cells, view);
  await frames(page, 3);
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
  console.log(`     ${name}: ${said.join(', ')}`);
};

const stand = (ids, more = {}) => ids.map((id) => ({ id, clip: 'stand', at: 0, ...more }));
const CROWD = ['townsman', 'burgher', 'journeyman', 'youth', 'townswoman', 'matron', 'lass', 'wife', 'oldTownsman', 'oldTownswoman', 'cityBoy', 'cityGirl'];
const STALLS = ['baker', 'fruiterer', 'butcher', 'clothier', 'leatherworker', 'chandler', 'curioSeller', 'flowerSeller', 'fishwife', 'fishwife2', 'fishwife3'];
const HARBOUR = ['docker', 'docker2', 'porter', 'porter2', 'sailor', 'deckhand', 'fisher', 'fisher2', 'customsOfficer', 'lighthouseKeeper', 'boatman', 'bargeman', 'angler', 'angler2'];
const GUILD = ['smithApprentice', 'forgeHand', 'apothecary', 'tanner', 'tanner2', 'dyer', 'dyer2', 'joiner', 'groom', 'gardener', 'gardenWife', 'archer', 'archer2'];
const FIELDS = ['miller', 'farmhand', 'picker', 'traveller', 'waterCarrier', 'beggar', 'nurse', 'mourner', 'mournerMan'];
const HOUSES = ['clerk', 'secretary', 'corvaneServant', 'corvaneMaid', 'harrowgateServant', 'ashbyServant'];
const NAMED = ['hesterGale', 'oldNan', 'dobbs', 'wren', 'bramTolliver', 'garranHolt', 'ilsaMarrow'];

await shoot('01-crowd', stand(CROWD), { grunt: true });
await shoot('02-crowd-behind', stand(CROWD, { yaw: Math.PI }), { grunt: true });
await shoot('03-market', stand(STALLS), { grunt: true });
await shoot('04-harbour', stand(HARBOUR.slice(0, 7)), { grunt: true });
await shoot('05-harbour', stand(HARBOUR.slice(7)), { grunt: true });
await shoot('06-guild-row', stand(GUILD), { grunt: true });
await shoot('07-about-town', stand([...FIELDS, ...HOUSES]), { grunt: true });
await shoot('08-named', stand(NAMED), { grunt: true });
await shoot('09-liveries-behind', stand([...HOUSES, ...NAMED], { yaw: Math.PI }));
// Close-ups: four at a time, a little turned.
const close = (ids, yaw = 0.35) => stand(ids, { yaw });
const closeView = { dx: 0.9, y: 1.1, fov: 22 };
for (const [k, ids] of [
  ['crowd-a', CROWD.slice(0, 4)],
  ['crowd-b', CROWD.slice(4, 8)],
  ['crowd-c', CROWD.slice(8)],
  ['market-a', STALLS.slice(0, 4)],
  ['market-b', STALLS.slice(4, 8)],
  ['harbour-a', HARBOUR.slice(4, 8)],
  ['harbour-b', HARBOUR.slice(8, 12)],
  ['guild-a', GUILD.slice(0, 4)],
  ['guild-b', GUILD.slice(4, 8)],
  ['guild-c', GUILD.slice(8, 12)],
  ['houses', HOUSES.slice(0, 4)],
  ['houses-b', [...HOUSES.slice(4), 'nurse', 'beggar']],
  ['named-a', NAMED.slice(0, 4)],
  ['named-b', NAMED.slice(4)],
]) {
  await shoot(`10-close-${k}`, close(ids), closeView);
}

// At their work: each at a moment of their first work.
const firstWork = async (ids, at) =>
  page.evaluate(
    async ([ids, at]) => {
      const { CAST } = await import('/src/people/cast.ts');
      const { SAT_AT } = await import('/src/people/trades.ts');
      return ids.map((id) => {
        const w = CAST[id].works?.[0] ?? 'stand';
        const seat = SAT_AT[w];
        return { id, clip: w === 'stand' ? 'stand about' : seat ? `${w} (sitting)` : w, at, ...(seat && seat.height > 0 ? { bench: seat.height } : {}) };
      });
    },
    [ids, at],
  );
for (const [k, ids] of [
  ['market', STALLS],
  ['harbour', HARBOUR],
  ['guild', GUILD],
  ['about', [...FIELDS, ...HOUSES]],
  ['named', NAMED],
]) {
  for (const at of [0.12, 0.45, 0.8]) await shoot(`20-work-${k}-${Math.round(at * 100)}`, await firstWork(ids, at), { yaw: 0.5 });
}

// Talking in turn, haggling, browsing.
for (const at of [0.2, 0.7]) {
  await shoot(`30-talk-${Math.round(at * 100)}`, ['townsman', 'townswoman', 'oldTownsman', 'wife', 'sailor', 'nurse'].map((id) => ({ id, clip: 'talk', at })), { yaw: 0.5, dx: 1.0 });
}
for (const at of [0.15, 0.4, 0.75]) {
  await shoot(`31-shop-${Math.round(at * 100)}`, ['townsman', 'matron', 'burgher', 'wife'].flatMap((id) => [{ id, clip: 'browse', at }, { id, clip: 'haggle', at }]), { yaw: 0.5 });
}
// Crying wares: the moments they call.
await shoot('32-cry', STALLS.map((id) => ({ id, clip: id.startsWith('fishwife') ? 'cry' : 'cry', at: 0.15 })), { yaw: 0.3 });
// Sitting on a bench, a kerb, the ground.
await shoot('40-sit', [...CROWD, 'beggar', 'lighthouseKeeper'].map((id) => ({ id, clip: 'sit', at: 0.1, bench: 0.5 })), { yaw: 0.6 });
await shoot('41-sit-side', ['townsman', 'townswoman', 'oldTownswoman', 'cityGirl', 'burgher', 'wren'].map((id) => ({ id, clip: 'sit', at: 0.1, bench: 0.5 })), { yaw: Math.PI / 2, dx: 1.1 });
await shoot('42-sit-work', [
  { id: 'fisher', clip: 'mend (sitting)', at: 0.3, bench: 0.45 },
  { id: 'fisher2', clip: 'mend (sitting)', at: 0.6, bench: 0.45 },
  { id: 'angler', clip: 'fish (sitting)', at: 0.2 },
  { id: 'lighthouseKeeper', clip: 'pipe (sitting)', at: 0.4, bench: 0.45 },
  { id: 'beggar', clip: 'beg (sitting)', at: 0.1 },
  { id: 'wren', clip: 'read', at: 0.2 },
  { id: 'journeyman', clip: 'eat', at: 0.05 },
], { yaw: 0.7, dx: 1.0 });
// Carrying, and taking up and setting down.
await shoot('50-carry', ['docker', 'docker2', 'porter', 'porter2', 'miller', 'bargeman', 'sailor'].map((id) => ({ id, clip: 'carry', at: 0.2 })), { yaw: Math.PI / 2 - 0.3 });
for (const at of [0.25, 0.42, 0.55, 0.68, 0.8]) {
  await shoot(`51-unload-${Math.round(at * 100)}`, ['docker', 'porter', 'miller', 'bargeman', 'sailor'].flatMap((id) => [{ id, clip: 'unload', at }, { id, clip: 'take', at }]), { yaw: 0.4 });
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
