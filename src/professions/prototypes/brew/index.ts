import { Group, Quaternion, type PerspectiveCamera, type Scene, Timer, Vector3, type WebGLRenderer } from 'three';
import { FloatingText } from '../../../fx/floatingText';
import { Particles } from '../../../fx/particles';
import { unlockAudio, updateListener } from '../../../fx/sfx';
import { findMap, loadNeighbours } from '../../../maps/registry';
import { World } from '../../../world/world';
import { BrewRig } from './rig';
import { Station } from './station';
import { VARIANTS } from './variants';

// PROTOTYPE: `?proto=brew` answers the professions map's "Brewing at the
// alchemy table" ticket (.scratch/professions/issues/07-…). An alchemy bench
// stands against the right-hand wall of the house by the well, where the
// herbalist will live, and you start in front of it with today's sword and
// shield. Three ways to brew a minor healing potion from 2 Hearthleaf, which
// differ in how many acts your hands do, switched in the headset with a
// left-stick click (`?proto=brew&variant=A|B|C` to start on one). No enemies,
// no save. Throwaway: the winner gets rebuilt properly and this folder goes.

/** The bench in the house's frame (+Z out of its door, x across its front): against the right wall, the hearth to its left. */
const BENCH = { x: 2.6, z: -0.1, yaw: -Math.PI / 2 };
/** Where you start: a step back from the bench, facing it. */
const START = { x: 2.05, z: -0.1 };

const _v = new Vector3();

export async function startBrewPrototype(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  device: unknown,
): Promise<void> {
  const params = new URLSearchParams(location.search);
  const intro = document.getElementById('intro');
  if (intro) intro.innerHTML = '<h1>The alchemy table</h1>Loading Oakvale…';
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const map = await findMap('forest')!.load();
  if (map.kind !== 'zone') throw new Error('Oakvale should be a zone');
  const world = new World(findMap);
  world.attach(scene, camera, renderer);
  for (const n of await loadNeighbours(map)) world.add(n);
  world.load(map);
  const house = map.interiors.find((i) => i.id === 'house');
  if (!house) throw new Error('Oakvale should have the house by the well');

  // The bench rides with the house's room, so it shows when the room does.
  const anchor = new Group();
  anchor.name = 'alchemy-bench';
  anchor.position.set(house.frame.x, house.floor, house.frame.z);
  anchor.rotation.y = house.frame.yaw;
  house.room.add(anchor);
  const benchAt = new Group();
  benchAt.position.set(BENCH.x, 0, BENCH.z);
  benchAt.rotation.y = BENCH.yaw;
  anchor.add(benchAt);

  const rig = new BrewRig(renderer, camera, world);
  scene.add(rig.rig);
  const particles = new Particles(scene);
  const floats = new FloatingText(scene);

  const start = anchor.localToWorld(new Vector3(START.x, 0, START.z));
  const facing = anchor.localToWorld(new Vector3(BENCH.x, 0, BENCH.z)).sub(start);
  const placeYou = () => {
    rig.teleport(start.x, start.z, Math.atan2(-facing.x, -facing.z));
    world.settle('house');
  };

  let station!: Station;
  const index = () => VARIANTS.indexOf(station.variant);
  const bar = switcherBar(
    () => setVariant(VARIANTS[(index() + 1) % VARIANTS.length].key),
    () => setVariant(VARIANTS[(index() + VARIANTS.length - 1) % VARIANTS.length].key),
  );

  function setVariant(key: string): void {
    station?.dispose();
    const v = VARIANTS.find((x) => x.key === key) ?? VARIANTS[1];
    station = new Station(v, { rig, camera, particles, floats });
    benchAt.add(station.root);
    world.stageWith('house', station.root);
    scene.add(station.belt);
    const query = new URLSearchParams(location.search);
    query.set('variant', v.key);
    history.replaceState(null, '', `?${query.toString()}${location.hash}`);
    bar.label.textContent = `${v.key} · ${v.name}`;
    if (renderer.xr.isPresenting) floats.banner(camera, `${v.key} · ${v.name}`, '#ffd23a', 0.1, 0.25, 3);
  }
  setVariant((params.get('variant') || 'A').toUpperCase());
  placeYou();

  addEventListener('keydown', (e) => {
    if (e.code === 'KeyV') setVariant(VARIANTS[(index() + 1) % VARIANTS.length].key);
    if (e.code === 'KeyE') station.cheat = true;
    if (e.code === 'KeyR') placeYou();
  });

  if (intro) {
    intro.innerHTML =
      '<h1>The alchemy table</h1>' +
      'A throwaway prototype for the professions map: three ways to brew a minor healing potion from 2 Hearthleaf, at a bench in the house by the well. ' +
      'Squeeze the grip to take something; let go and it goes back to its place. The note on the bench shows each act and who does it.<br>' +
      VARIANTS.map((v) => `<b>${v.key} · ${v.name}</b>: ${v.how}`).join('<br>') +
      '<br>The potion ends on its stand: put it at your hip to belt it, or lift it to your mouth to drink it.<br>' +
      'In the headset, <b>click the left stick</b> for the next variant (it starts over). ' +
      'Desktop: WASD to walk, drag to look, E does the next act for you, V switches variant, R puts you back at the bench.';
  }
  renderer.xr.addEventListener('sessionstart', () => {
    intro?.style.setProperty('display', 'none');
    unlockAudio();
    const session = renderer.xr.getSession();
    if (session?.supportedFrameRates?.includes(72)) void session.updateTargetFrameRate?.(72).catch(() => {});
    placeYou();
    floats.banner(camera, `${station.variant.key} · ${station.variant.name}`, '#ffd23a', 0.1, 0.25, 3);
  });
  renderer.xr.addEventListener('sessionend', () => intro?.style.removeProperty('display'));
  addEventListener('pointerdown', unlockAudio, { once: true });

  // Handle for poking from the console and for scripted checks: `puppet`
  // moves a hand to a world point off the headset, squeezing or not.
  Object.assign(window, {
    __descent: {
      map,
      world,
      rig,
      renderer,
      camera,
      device,
      setVariant,
      get station() {
        return station;
      },
      /** Move a hand to world (x, y, z), turned by `turn` in the rig (a quaternion's x, y, z, w), squeezing or not. */
      puppet(hand: 'left' | 'right', x: number, y: number, z: number, squeeze: boolean, turn: [number, number, number, number] = [0, 0, 0, 1]) {
        rig.rig.updateMatrixWorld(true);
        const at = rig.rig.worldToLocal(_v.set(x, y, z)).clone();
        rig.hands[hand].puppet = { at, turn: new Quaternion(...turn), squeeze };
      },
      /** Where a point in the bench's frame is in the world. */
      benchPoint(x: number, y: number, z: number) {
        return station.root.localToWorld(new Vector3(x, y, z)).toArray();
      },
      placeYou,
    },
  });

  let stickWas = false;
  const timer = new Timer();
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 1 / 30);
    if (renderer.xr.isPresenting) renderer.xr.updateCamera(camera);
    rig.update(dt);
    const stick = rig.input.hands.left.stick;
    if (stick && !stickWas) setVariant(VARIANTS[(index() + 1) % VARIANTS.length].key);
    stickWas = stick;
    station.update(dt);
    particles.update(dt);
    floats.update(dt);
    world.update(dt, camera);
    updateListener(camera);
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
