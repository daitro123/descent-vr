import { type PerspectiveCamera, type Scene, Timer, Vector3, type WebGLRenderer } from 'three';
import { unlockAudio, updateListener } from '../../../fx/sfx';
import { findMap, loadNeighbours } from '../../../maps/registry';
import { Card, FONT, roundRect, wrap } from '../../../ui/card';
import { World } from '../../../world/world';
import { Smith } from './rig';
import { type Setup, Station, TUNE } from './station';

// PROTOTYPE: `?proto=anvil` answers the professions map's "Hammering at the
// anvil" ticket (.scratch/professions/issues/06-…). In Oakvale's smithy, with
// no enemies: choose what to make, smelt ore into a bar, then hammer a
// whetstone or a pair of copper gauntlets on the anvil. Three variants,
// switched in the headset with a left-stick click (`&v=A|B|C` to start on
// one); each starts over with a full bag. Throwaway: the winner gets rebuilt
// properly and this folder goes.

const VARIANTS: readonly Setup[] = [
  {
    key: 'A',
    name: 'Board and marks',
    how: 'Press a recipe on the board beside the anvil; its materials come out of your bag. Strike the glowing marks: a hard strike works a mark at once, a softer one takes two. What you make goes straight to your bag.',
    choose: 'board',
    hammering: 'marks',
  },
  {
    key: 'B',
    name: 'Lay it out, marks',
    how: 'No board: take materials off the tray (your bag) with the tongs. Ore in the crucible, a stone on the anvil, four bars in the fire. Strike the glowing marks. Take what you make and let go of it to bag it.',
    choose: 'lay',
    hammering: 'marks',
  },
  {
    key: 'C',
    name: 'Lay it out, on the beat',
    how: 'Lay materials out as in B, but hammer to a beat: strike anywhere on the work as the ring closes. A hard strike on the beat counts double.',
    choose: 'lay',
    hammering: 'beat',
  },
];

const _v = new Vector3();

export async function startAnvilPrototype(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, device: unknown): Promise<void> {
  const params = new URLSearchParams(location.search);
  const intro = document.getElementById('intro');
  if (intro) intro.innerHTML = '<h1>Oakvale: the anvil</h1>Loading…';
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const map = await findMap('forest')!.load();
  if (map.kind !== 'zone') throw new Error('Oakvale should be a zone');
  const world = new World(findMap);
  world.attach(scene, camera, renderer);
  for (const n of await loadNeighbours(map)) world.add(n);
  world.load(map);

  const smith = new Smith(renderer, camera, world);
  scene.add(smith.rig, smith.loop);
  const spot = map.villagers.find((v) => v.id === 'smith');
  if (!spot) throw new Error('Oakvale should have a smith at the anvil');
  const station = new Station(scene, world, smith, spot);

  const announce = new Card(0.72, 0.22, { overlay: true, ppm: 1750 });
  scene.add(announce.mesh);
  let announceTime = 0;
  const showAnnounce = (v: Setup) => {
    const i = VARIANTS.indexOf(v);
    announce.paint(v.key, (c, w, h) => {
      c.fillStyle = 'rgba(14, 16, 22, 0.9)';
      roundRect(c, 0, 0, w, h, 30);
      c.fill();
      c.textBaseline = 'top';
      c.fillStyle = '#ffd23a';
      c.font = `bold 50px ${FONT}`;
      c.fillText(`${v.key} · ${v.name}   (${i + 1} of ${VARIANTS.length})`, 34, 24);
      c.fillStyle = '#ece6d6';
      c.font = `30px ${FONT}`;
      wrap(c, v.how, w - 68).forEach((line, j) => c.fillText(line, 34, 92 + j * 38));
      c.fillStyle = '#a89c80';
      c.font = `28px ${FONT}`;
      c.fillText('Click the left stick for the next variant (it starts over).', 34, h - 48);
    });
    announceTime = 7;
    camera.localToWorld(announce.mesh.position.set(0, 0.35, -1.6));
    announce.mesh.lookAt(camera.getWorldPosition(_v));
  };

  let variant = VARIANTS[0];
  const bar = switcherBar(
    () => setVariant(VARIANTS[(VARIANTS.indexOf(variant) + 1) % VARIANTS.length].key),
    () => setVariant(VARIANTS[(VARIANTS.indexOf(variant) + VARIANTS.length - 1) % VARIANTS.length].key),
  );

  function setVariant(key: string): void {
    variant = VARIANTS.find((v) => v.key === key.toUpperCase()) ?? VARIANTS[0];
    station.reset(variant);
    const { x, z, yaw } = station.stand;
    smith.teleport(x, z, yaw);
    const query = new URLSearchParams(location.search);
    query.set('v', variant.key);
    history.replaceState(null, '', `?${query.toString().replace(/=(?=&|$)/g, '')}${location.hash}`);
    bar.label.textContent = `${variant.key} · ${variant.name}`;
    if (renderer.xr.isPresenting) showAnnounce(variant);
  }
  setVariant(params.get('v') || 'A');

  addEventListener('keydown', (e) => {
    if (e.code === 'KeyV') setVariant(VARIANTS[(VARIANTS.indexOf(variant) + 1) % VARIANTS.length].key);
  });

  if (intro) {
    intro.innerHTML =
      '<h1>Oakvale: the anvil</h1>' +
      'A throwaway prototype of smithing, in the smithy with no enemies. You start where the smith stands, at the anvil. ' +
      'Grip behind your right hip for the hammer and tongs (again to put them back). Squeeze the left grip to pick things up with the tongs, let go to put them down. ' +
      'Smelt two ore into a bar in the crucible at the front of the forge; hammer a rough stone into a whetstone cold; heat four bars in the fire, hammer them into gauntlets and quench them in the bucket.<br>' +
      VARIANTS.map((v) => `<b>${v.key} · ${v.name}</b>: ${v.how}`).join('<br>') +
      '<br>In the headset, <b>click the left stick</b> for the next variant. Desktop: WASD to walk, drag to look, V switches variant; the console has <code>__descent.station</code>.';
  }
  renderer.xr.addEventListener('sessionstart', () => {
    intro?.style.setProperty('display', 'none');
    unlockAudio();
    const { x, z, yaw } = station.stand;
    smith.teleport(x, z, yaw);
    showAnnounce(variant);
  });
  renderer.xr.addEventListener('sessionend', () => intro?.style.removeProperty('display'));
  addEventListener('pointerdown', unlockAudio, { once: true });

  const update = (dt: number) => {
    const xr = renderer.xr.isPresenting;
    if (xr) renderer.xr.updateCamera(camera);
    const loopGrip = smith.update(dt);
    if (smith.input.hands.left.stickPressed) setVariant(VARIANTS[(VARIANTS.indexOf(variant) + 1) % VARIANTS.length].key);
    station.update(dt, loopGrip, xr);
    announceTime = Math.max(0, announceTime - dt);
    announce.mesh.material.opacity = Math.min(1, announceTime * 2);
    announce.mesh.visible = announceTime > 0;
    world.update(dt, camera);
    updateListener(camera);
  };

  // Handle for poking from the console and for scripted checks.
  const debug = {
    map,
    world,
    smith,
    station,
    renderer,
    camera,
    device,
    TUNE,
    setVariant,
    get variant() {
      return variant;
    },
    /** Seconds of game time each frame, if set: scripted checks move the controllers a frame at a time. */
    fixedDt: 0,
    /** Run the prototype for `seconds` without waiting for frames. */
    step: (seconds: number, dt = 1 / 72) => {
      for (let left = seconds; left > 1e-9; left -= dt) update(Math.min(dt, left));
    },
  };
  Object.assign(window, { __descent: debug });

  const timer = new Timer();
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    update(debug.fixedDt || Math.min(timer.getDelta(), 1 / 30));
    renderer.render(scene, camera);
  });
}

/** The prototype's variant switcher on the page (the headset uses a left-stick click). */
function switcherBar(next: () => void, prev: () => void): { label: HTMLElement } {
  const bar = document.createElement('div');
  bar.style.cssText =
    'position:fixed;top:16px;right:16px;z-index:10;display:flex;gap:12px;align-items:center;' +
    'padding:8px 14px;border-radius:999px;background:#111;color:#fff;font:600 14px system-ui,sans-serif;box-shadow:0 2px 12px #0008';
  const button = (text: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = 'background:#333;color:#fff;border:0;border-radius:999px;width:28px;height:28px;cursor:pointer';
    b.addEventListener('click', fn);
    return b;
  };
  const label = document.createElement('span');
  bar.append(button('◀', prev), label, button('▶', next));
  document.body.appendChild(bar);
  return { label };
}
