// Checks for sound that follows the light
// (issues/31-sound-that-follows-the-light.md) in headless Chromium with the
// IWER emulator. Start `npx vite --port 5173` first, then:
//
//   node .scratch/oakvale-starting-zone/checks/sound-mix.mjs [http://localhost:5173]
//
// The Adventure at the plain URL, paused, stepped frame by frame in the page
// (with `teleport`), kept at full health throughout so nothing on the way
// (the mine's undead) fells you. The mix is read two ways: as world/mix.ts has it each
// frame, and as the audio graph's own gains are once they've settled. What it
// checks:
//
// 1. Out on the road before the inn: the outdoors as it is, and the inn's
//    hearth faint and muffled through its walls.
// 2. At the open door: the hearth comes through it, the outdoors unchanged.
// 3. Walking in: once the door shuts behind you the outdoors goes quiet and
//    muffled and the hearth comes up, frame by frame with the switch's light,
//    so over the same half-second; the graph's gains end there. And back out.
// 4. Into the mine by its mouth and down its route: in the adit the outdoors
//    is as it is; past the bend it fades out as the mine's air and timbers come
//    in, with the light, and no outdoor sound plays; in the dig there's no
//    drone; across the breach the drone rises and the timbers fall away; down
//    the carved passage the drone is up. Out again, the mine's ambience stops.
// 5. With the farm's camp fighting you, the whole ambience dips, and comes
//    back once you've left them behind.
// 6. The mine's hollow air comes out about as loud as the arena's drone.
//
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};
const near = (a, b, tol = 0.03) => Math.abs(a - b) <= tol;
const f2 = (v) => (v === null || v === undefined ? String(v) : v.toFixed(2));
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

await page.goto(`${base}/?emulate&nodevui`);
await page.waitForFunction(() => window.__descent?.adventure, null, { timeout: 120000 });
await page.click('#VRButton');
await page.waitForFunction(() => window.__descent.renderer.xr.isPresenting, null, { timeout: 60000 });
await xrFrames(3);
const { mix, sound } = await page.evaluate(() => {
  const d = window.__descent;
  d.paused = true;
  d.step(0.1);
  return { mix: d.CONFIG.sound.mix, sound: d.CONFIG.sound };
});

/**
 * Walk through `pts` (world x, z) at `speed` m/s, a frame at a time, then
 * stand `stay` s, recording each frame's cues and mix and how many ambient
 * sounds play.
 */
const walk = (pts, speed = 1.4, stay = 0) =>
  page.evaluate(
    ([pts, speed, stay]) => {
      const d = window.__descent;
      const amb = d.adventure.ambience;
      const dt = 1 / 72;
      const out = [];
      let time = 0;
      const frame = (x, z, yaw) => {
        // Whatever comes at you on the way (the mine's undead), you don't fall.
        d.player.hp = d.player.maxHp;
        d.teleport(x, z, yaw);
        d.adventure.update(dt);
        time += dt;
        const c = d.world.cues;
        const m = amb.mixed;
        const inn = c.rooms.findIndex((r) => r.id === 'inn');
        out.push({
          time,
          x,
          z,
          door: c.rooms[inn].door,
          light: c.rooms[inn].light,
          mine: c.mine,
          crypt: c.crypt,
          outdoors: m.outdoors,
          cutoff: m.outdoorsCutoff,
          room: m.rooms[inn].level,
          air: m.air,
          timbers: m.timbers,
          drone: m.drone,
          all: m.all,
          playing: amb.playing,
          fighting: d.camps.fighting,
        });
      };
      let yaw = 0;
      for (let k = 1; k < pts.length; k++) {
        const [ax, az] = pts[k - 1];
        const [bx, bz] = pts[k];
        const len = Math.hypot(bx - ax, bz - az);
        yaw = Math.atan2(-(bx - ax), -(bz - az));
        const n = Math.max(1, Math.ceil(len / speed / dt));
        for (let i = 1; i <= n; i++) frame(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, yaw);
      }
      const [lx, lz] = pts[pts.length - 1];
      for (let t = 0; t < stay; t += dt) frame(lx, lz, yaw);
      return out;
    },
    [pts, speed, stay],
  );

/** The audio graph's gains, once they've had a moment of real time to settle on their targets. */
const gains = async () => {
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
  return page.evaluate(() => window.__descent.adventure.ambience.gains);
};

const unlocked = await page.evaluate(() => !!window.__descent.adventure.ambience.gains);
check(unlocked, 'entering VR unlocks audio, and the mix is in the graph');

// ------------------------------------------------------------------ the inn
const inn = await page.evaluate(() => {
  const { frame, footprint, door } = window.__descent.world.interiors.find((h) => h.interior.id === 'inn').interior;
  return { frame, hd: footprint.hd, door: door.x };
});
/** A point (lx, lz) in the inn's frame, in the world. */
const innAt = (lx, lz) => {
  const c = Math.cos(inn.frame.yaw);
  const s = Math.sin(inn.frame.yaw);
  return [inn.frame.x + lx * c + lz * s, inn.frame.z - lx * s + lz * c];
};
const dx = inn.door;

// 1. Out on the road before the inn.
{
  const f = await walk([innAt(dx, inn.hd + 9), innAt(dx, inn.hd + 8)], 1.4, 1);
  const g = await gains();
  const last = f[f.length - 1];
  check(last.door === 0 && last.light === 0, `8 m out from the inn's door it's shut (door ${last.door}, light ${last.light})`);
  check(near(g.outdoors.level, 1) && g.outdoors.cutoff > 15000, `the outdoors as it is (gain ${f2(g.outdoors.level)}, lowpass ${g.outdoors.cutoff.toFixed(0)} Hz)`);
  check(
    near(g.rooms.inn.level, mix.walls.level) && near(g.rooms.inn.cutoff, mix.walls.cutoff, 20),
    `the inn's hearth faint and muffled through its walls (gain ${f2(g.rooms.inn.level)}, lowpass ${g.rooms.inn.cutoff.toFixed(0)} Hz)`,
  );
  check(g.mine === null, 'no mine ambience playing');
}

// 2. At the open door.
{
  const f = await walk([innAt(dx, inn.hd + 8), innAt(dx, inn.hd + 1)], 1.4, 1);
  const g = await gains();
  const last = f[f.length - 1];
  const want = mix.walls.level + (1 - mix.walls.level) * mix.door;
  check(last.door === 1 && last.light === 0, `1 m out, the door is open and the light still the outdoors' (door ${last.door}, light ${last.light})`);
  check(near(g.rooms.inn.level, want) && g.rooms.inn.cutoff > mix.walls.cutoff * 2, `the hearth comes through the open door (gain ${f2(g.rooms.inn.level)} of ${f2(want)}, lowpass ${g.rooms.inn.cutoff.toFixed(0)} Hz)`);
  check(near(g.outdoors.level, 1) && g.outdoors.cutoff > 15000, `the outdoors unchanged (gain ${f2(g.outdoors.level)})`);
}

// 3. In, the door shutting behind you, and the mix with the light.
{
  const f = await walk([innAt(dx, inn.hd + 1), innAt(dx, inn.hd - 3)], 1.4, 1.2);
  const g = await gains();
  // Frame by frame, the outdoors' level is the light's.
  const off = f.map((r) => Math.abs(r.outdoors - (1 - (1 - mix.inside.level) * r.light)));
  check(Math.max(...off) < 1e-9, `frame by frame, the outdoors' level follows the switch's light (worst ${Math.max(...off).toExponential(1)})`);
  const start = f.find((r) => r.light > 0);
  const end = f.find((r) => r.light === 1);
  const took = end && start ? end.time - start.time : NaN;
  check(near(took, 0.5, 0.03), `the outdoors goes quiet over the light's half-second (${took.toFixed(2)} s, from the door shut: ${f.find((r) => r.door === 0 && r.light === 0 && r.time > 0.1) ? 'yes' : '?'})`);
  const first = f.findIndex((r) => r.outdoors < 1);
  check(first >= 0 && f[first].door === 0, `…starting only once the door is shut behind you (door ${first >= 0 ? f[first].door : '?'})`);
  check(
    near(g.outdoors.level, mix.inside.level) && near(g.outdoors.cutoff, mix.inside.cutoff, 25),
    `inside, the graph's outdoors is quiet and muffled (gain ${f2(g.outdoors.level)}, lowpass ${g.outdoors.cutoff.toFixed(0)} Hz)`,
  );
  check(near(g.rooms.inn.level, 1) && g.rooms.inn.cutoff > 15000, `…and the room's fires are up (gain ${f2(g.rooms.inn.level)}, lowpass ${g.rooms.inn.cutoff.toFixed(0)} Hz)`);
  const hearth = await page.evaluate(() => window.__descent.adventure.ambience.sounding);
  check(hearth.some((s) => s.id === 'hearth'), `the hearth is sounding (${JSON.stringify(hearth.map((s) => s.id))})`);

  const back = await walk([innAt(dx, inn.hd - 3), innAt(dx, inn.hd + 8)], 1.4, 1);
  const g2 = await gains();
  const cameUp = back.find((r) => r.outdoors === 1);
  check(!!cameUp && cameUp.door === 0, `walking out, the outdoors is back up before the door opens (door ${cameUp?.door})`);
  check(near(g2.outdoors.level, 1) && near(g2.rooms.inn.level, mix.walls.level), `back on the road, the outdoors as it was and the hearth behind the walls (${f2(g2.outdoors.level)}, ${f2(g2.rooms.inn.level)})`);
}

// ------------------------------------------------------------------ the mine
const mine = await page.evaluate(() => {
  const m = window.__descent.world.mine;
  return { mouth: m.mouth, route: m.route };
});
const front = [mine.mouth.x + Math.sin(mine.mouth.yaw) * 6, mine.mouth.z + Math.cos(mine.mouth.yaw) * 6];
const route = mine.route.map((p) => [p.x, p.z]);
// Route points: 1 the bend, 3 the turntable in the cart hall, 9 the dig's near side, 10 the breach, 12 the carved passage's foot.
{
  const f = await walk([front, ...route.slice(0, 4)], 1.4, 1);
  const g = await gains();
  const adit = f.filter((r) => r.crypt > -Infinity && r.mine === 0);
  check(adit.length > 0 && adit.every((r) => r.outdoors === 1 && r.air === 0), `in the adit, short of the bend, the outdoors as it is and none of the mine's air (${adit.length} frames)`);
  const off = f.map((r) => Math.abs(r.outdoors - (1 - r.mine)) + Math.abs(r.air - r.mine));
  check(Math.max(...off) < 1e-9, `past the bend, frame by frame the outdoors fades out and the mine's air comes in with the mine's light`);
  const start = f.find((r) => r.mine > 0);
  const end = f.find((r) => r.mine === 1);
  check(!!start && !!end && near(end.time - start.time, 0.5, 0.03), `…over the light's half-second (${start && end ? (end.time - start.time).toFixed(2) : '?'} s)`);
  check(
    near(g.outdoors.level, 0) && g.mine && near(g.mine.air, 1) && near(g.mine.timbers, 1) && near(g.mine.drone, 0),
    `in the cart hall the graph has the mine's air and timbers, no outdoors and no drone (${f2(g.outdoors.level)}, ${JSON.stringify(g.mine)})`,
  );
  const last = f[f.length - 1];
  check(last.playing === 0, `…and no outdoor sound plays (${last.playing} playing)`);
}
{
  const f = await walk(route.slice(3, 10), 1.4, 1);
  const g = await gains();
  check(f.every((r) => r.drone === 0), `down the gallery, the ramp and into the dig, no drone (crypt ${f2(f[f.length - 1].crypt)} m)`);
  check(g.mine && near(g.mine.drone, 0) && near(g.mine.timbers, 1), `…the graph agrees (${JSON.stringify(g.mine)})`);
}
{
  const f = await walk(route.slice(9, 13), 1.4, 1);
  const g = await gains();
  const crossing = f.filter((r) => r.crypt > mix.crypt.from && r.crypt < mix.crypt.to);
  const rising = crossing.every((r, i) => i === 0 || r.drone >= crossing[i - 1].drone);
  const atBreach = f.reduce((a, b) => (Math.abs(b.crypt) < Math.abs(a.crypt) ? b : a));
  check(crossing.length > 3 && rising, `across the breach the drone rises (${crossing.length} frames, ${f2(crossing[0]?.drone)} → ${f2(crossing[crossing.length - 1]?.drone)})`);
  check(atBreach.drone > 0 && atBreach.drone < 1 && atBreach.timbers < 1, `at the breach it's on its way up and the timbers falling away (drone ${f2(atBreach.drone)}, timbers ${f2(atBreach.timbers)})`);
  check(
    g.mine && near(g.mine.drone, sound.mine.drone) && near(g.mine.timbers, 0) && near(g.mine.air, mix.crypt.air),
    `down the carved passage the drone is up, the timbers gone and the air lower (${JSON.stringify(g.mine)})`,
  );
}
{
  // Back up and out, at a jog.
  const out = [...route.slice(0, 13)].reverse();
  await walk([...out, front], 4, 2);
  const g = await gains();
  check(g.mine === null, 'out of the mine, its ambience has stopped');
  check(near(g.outdoors.level, 1), `and the outdoors is back (${f2(g.outdoors.level)})`);
}

// ------------------------------------------------------------------ a fight
{
  const post = await page.evaluate(() => {
    const camp = window.__descent.camps.camps.find((c) => c.plan.id === 'farm');
    const p = camp.members[0].post;
    return [p.x, p.z];
  });
  const stand = [post[0] - 3, post[1]];
  const f = await walk([stand, stand], 1.4, 3);
  const g = await gains();
  const fought = f.filter((r) => r.fighting);
  check(fought.length > 0 && fought.every((r) => r.all === mix.fight.level), `with the farm's camp fighting you the mix dips (${fought.length} frames at ${f2(fought[0]?.all)})`);
  check(near(g.all, mix.fight.level * sound.ambient.level), `…and the graph's whole ambience with it (${f2(g.all)})`);
  // Away up the road at a run they can't match, until they give up and go home.
  const far = [post[0] - 60, post[1]];
  await walk([stand, far], 8, 20);
  const g2 = await gains();
  const calm = await page.evaluate(() => window.__descent.camps.fighting);
  check(!calm && near(g2.all, sound.ambient.level), `left behind, nothing fights you and it's back (${f2(g2.all)})`);
}

// ------------------------------------------------------------------ loudness
{
  const rms = await page.evaluate(async () => {
    const { startLoop } = await import('/src/fx/loops.ts');
    const kit = window.__descent.adventure.ambience.kit;
    const measure = async (name) => {
      const ctx = new OfflineAudioContext(2, 44100 * 8, 44100);
      startLoop(name, { ctx, master: ctx.destination, noise: kit.noise }, ctx.destination);
      const buf = await ctx.startRendering();
      // Past the drone's 4 s fade-in.
      const d = buf.getChannelData(0).subarray(44100 * 5);
      let s = 0;
      for (const v of d) s += v * v;
      return Math.sqrt(s / d.length);
    };
    return { drone: await measure('drone'), hollow: await measure('hollow') };
  });
  const r = rms.hollow / rms.drone;
  check(r > 0.6 && r < 1.6, `the mine's hollow air is about as loud as the drone (RMS ${rms.hollow.toFixed(3)} vs ${rms.drone.toFixed(3)})`);
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
if (failed) {
  console.log(`${failed} FAILED`);
  process.exit(1);
}
console.log('all passed');
