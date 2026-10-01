// Animals (and people) stood side by side in the model viewer, posed at one
// moment of a clip, for comparing sizes and checking a pose. Start
// `npx vite --port 5173` first, then:
//
//   node .scratch/quadruped/checks/lineup.mjs <file.png> <ids> [clip] [side|front|three] [at] [high]
//
// <ids> is a comma list of `ANIMALS` ids (models/animals.ts), `wolf0`..`wolf2`
// and `PEOPLE` ids (models/people.ts) for scale: `farmer,moorEwe,sheepdog,cartHorse`.
// [clip] is one of the inspector's clips (stand, walk, run, graze, look up, lie),
// [at] how far into it (0 to 1). ZOOM and FOV in the environment frame it.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [file, ids, clip = 'stand', view = 'three', at = '0.3', extra = ''] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 700 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
await page.goto(`${process.env.BASE ?? 'http://localhost:5173'}/?inspect&noemulate`);
await page.evaluate(([z, f]) => ((window.__zoom = z), (window.__fov = f)), [Number(process.env.ZOOM ?? 1), Number(process.env.FOV ?? 30)]);
await page.waitForFunction(() => window.__descent?.inspector, null, { timeout: 120000 });
const r = await page.evaluate(async ({ ids, clip, view, at, extra }) => {
  const mod = await import('/src/models/animals.ts');
  const ANIMALS = { ...mod.ANIMALS };
  for (let i = 0; i < 3; i++) ANIMALS['wolf' + i] = { label: 'Wolf', species: 'dog', proportions: mod.WOLF_BUILD, dress: mod.dressWolf(i), seed: 7 + i, clipsOf: 'hound' };
  const { QuadRig } = await import('/src/models/quadruped.ts');
  const { animalClips } = await import('/src/inspector/clips.ts');
  const { createModelMaterial } = await import('/src/models/materials.ts');
  const { inspector, camera } = window.__descent;
  for (const c of inspector.root.children) if (!c.isLight && !c.children.includes(inspector.scaled)) c.visible = false;
  inspector.turntable.visible = false;
  const [, plinth, ruler] = inspector.scaled.children;
  ruler.visible = false;
  for (const m of plinth.children) m.visible = false;
  plinth.children[0].visible = true;
  plinth.children[0].material.color.setHex(0x52602e);
  inspector.scaled.scale.setScalar(6);
  inspector.update = () => {};
  const list = ids.split(',');
  const made = [];
  let x = 0;
  const out = {};
  const { buildPerson, PEOPLE } = await import('/src/models/people.ts');
  const { personClips } = await import('/src/inspector/clips.ts');
  const widths = list.map((id) => (id in PEOPLE ? 0.8 : ANIMALS[id].proportions.body + 0.6));
  const total = widths.reduce((a, b) => a + b, 0);
  x = -total / 2;
  for (let i = 0; i < list.length; i++) {
    const id = list[i];
    const person = id in PEOPLE;
    const a = ANIMALS[id];
    const rig = person ? buildPerson(id, createModelMaterial()) : new QuadRig(a.proportions, a.dress, createModelMaterial(), a.seed);
    const clips = person ? personClips(id) : animalClips(a.clipsOf ?? id);
    const c = clips.find((k) => k.name === clip) ?? clips[0];
    const f = c.sample(c.duration * at, out);
    rig.apply(f.pose);
    if (!person) rig.setHipOffset(0, f.hipY, 0);
    x += widths[i] / 2;
    rig.mesh.position.set(x, 0, -2);
    if (person) rig.mesh.rotation.y = view === 'side' ? Math.PI / 2 : 0.5;
    else if (view === 'side') rig.mesh.rotation.y = Math.PI / 2;
    else if (view === 'front') rig.mesh.rotation.y = 0;
    else rig.mesh.rotation.y = 0.9;
    x += widths[i] / 2;
    inspector.root.add(rig.mesh);
    made.push([id, rig.triangles]);
  }
  const h = Math.max(...list.map((id) => (id in PEOPLE ? 1.2 : ANIMALS[id].proportions.shoulderY))) * 1.4;
  const fov = Number(window.__fov ?? 30);
  const k = Math.tan((75 / 2) * Math.PI / 180) / Math.tan((fov / 2) * Math.PI / 180);
  camera.fov = fov;
  camera.updateProjectionMatrix();
  const dist = Math.max(1.4, total * 0.42) * Number(window.__zoom ?? 1) * k;
  camera.position.set(0, h * 0.9 + (extra === 'high' ? 1.2 : 0), -2 + dist);
  camera.lookAt(0, h * 0.45, -2);
  camera.updateMatrixWorld();
  return made;
}, { ids, clip, view, at: Number(at), extra });
await page.waitForTimeout(300);
await page.screenshot({ path: file });
console.log(JSON.stringify(r));
await browser.close();
