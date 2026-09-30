// Every class through Oakvale (issues/27-every-class-through-oakvale.md): the
// Inventory map's whole-zone run (.scratch/inventory/checks/whole-zone.mjs),
// once for each class, one after another: a new warrior, a new ranger and a
// new mage, each from `?newgame` through every camp, the chests and Hale's
// three hand-ins to What Lies Below's reward, the smith, the innkeeper and the
// stash. Start `npx vite --port 5173`, then:
//
//   node .scratch/abilities/checks/whole-zone.mjs [http://localhost:5173] [out/] [warrior ranger mage]
//
// Name classes to run only those. With `out/`, each class's screenshots and
// `whole-zone.json` go in `out/<class>/`. What each run checks is in the
// Inventory map's script; this one passes when every class's does. Each run
// takes several minutes (the smith's boards are slow to draw in software), and
// they share the machine badly, so they run one at a time.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLASSES = ['warrior', 'ranger', 'mage'];
const args = process.argv.slice(2);
const asked = args.filter((a) => CLASSES.includes(a));
const [base = 'http://localhost:5173', out] = args.filter((a) => !CLASSES.includes(a));
const run = join(dirname(fileURLToPath(import.meta.url)), '../../inventory/checks/whole-zone.mjs');

const results = [];
for (const klass of asked.length ? asked : CLASSES) {
  const began = Date.now();
  const r = spawnSync(process.execPath, [run, base, ...(out ? [join(out, klass)] : []), klass], { stdio: 'inherit' });
  results.push({ klass, ok: r.status === 0, minutes: (Date.now() - began) / 60000 });
}
console.log('');
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} the ${r.klass} through Oakvale (${r.minutes.toFixed(1)} min)`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
