import { Color, Fog, PerspectiveCamera, Scene, Timer, WebGLRenderer } from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { Adventure } from './adventure';
import { playable } from './classes';
import { combatStats } from './combat/combat';
import { CONFIG } from './config';
import { enemiesDebug } from './enemies/debug';
import { startAmbience, unlockAudio } from './fx/sfx';
import { Game } from './game';
import { findMap, loadNeighbours } from './maps/registry';
import { isStartingZone } from './maps/types';
import { professionsDebug } from './professions/debug';
import { type ClassPrototype, loadClassPrototype } from './prototype/classPrototypes';
import { forgetNewGame, readPage, type Route } from './route';
import { type Characters, openCharacters } from './save/store';
import { buildShowcase, pinShowcaseCamera } from './showcase';
import './style.css';
import { askNewCharacter, showRoster } from './ui/characterPage';
import { PerfReadout } from './ui/perfReadout';
import { useRadialFog } from './world/radialFog';

const page = readPage(location.search);

/** Emulate when asked to (?emulate), or when there's no real headset. */
async function wantsEmulator(): Promise<boolean> {
  if (page.emulate !== 'ask') return page.emulate === 'yes';
  // On a phone the map viewer has touch controls; the emulator's DevUI is for mouse and keyboard.
  if (page.route.kind === 'fly' && matchMedia('(pointer: coarse)').matches) return false;
  try {
    return !(await navigator.xr?.isSessionSupported('immersive-vr'));
  } catch {
    return true;
  }
}

async function start(): Promise<void> {
  useRadialFog(); // before anything compiles
  const intro = document.getElementById('intro');
  if (intro) intro.dataset.game = page.route.kind;
  const device = (await wantsEmulator())
    ? await (await import('./emulator')).installEmulator(page.devUI)
    : null;

  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  // Quest budget (see docs/quest-3-browser-performance-budget.md): foveation explicit,
  // framebuffer at the browser's recommended size (lower to ~0.85 if GPU-bound).
  renderer.xr.setFoveation(1);
  renderer.xr.setFramebufferScaleFactor(1);
  // Reading back every program's compile log stalls the first frames; keep it for development.
  renderer.debug.checkShaderErrors = import.meta.env.DEV;
  document.body.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 60);
  camera.position.set(0, 1.6, 0); // desktop preview; XR drives it once presenting

  document.body.appendChild(VRButton.createButton(renderer));
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  const perf = page.perf ? new PerfReadout(renderer, camera) : null;
  const r = page.route;
  switch (r.kind) {
    case 'inspect':
      return startInspector(renderer, scene, camera);
    case 'fly':
      return startMapViewer(renderer, scene, camera, device, r.map);
    case 'walk':
      return (await import('./maps/walk')).startWalk(renderer, scene, camera, r.map);
    case 'proto':
      return startPrototype(renderer, scene, camera, device, r.name);
    case 'arena':
      return startArena(renderer, scene, camera, device, perf, r);
    case 'belt': // PROTOTYPE: inventory ticket 04
      return (await import('./player/beltPrototype')).startBelt(renderer, scene, camera, device, perf, r, (then) => onEnterVR(renderer, then));
    case 'bag':
      onEnterVR(renderer);
      return (await import('./ui/bag-prototype')).startBagPrototype(renderer, scene, camera, device, perf, r.variant);
    case 'adventure':
      return startAdventure(renderer, scene, camera, device, perf, r);
  }
}

/** On entering VR, whichever game: sound on, the intro away, and 72 fps. */
function onEnterVR(renderer: WebGLRenderer, then?: () => void): void {
  const intro = document.getElementById('intro');
  renderer.xr.addEventListener('sessionstart', () => {
    unlockAudio();
    // 72 fps is Meta's minimum and our target; the browser may default higher.
    const session = renderer.xr.getSession();
    if (session?.supportedFrameRates?.includes(72)) void session.updateTargetFrameRate?.(72).catch(() => {});
    intro?.style.setProperty('display', 'none');
    then?.();
  });
  renderer.xr.addEventListener('sessionend', () => intro?.style.removeProperty('display'));
  addEventListener('pointerdown', unlockAudio, { once: true });
}

/** The plain URL: Oakvale, with the picked character from the save (`?newgame` opens the new-character form first). */
async function startAdventure(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  device: unknown,
  perf: PerfReadout | null,
  { newGame, cap }: Extract<Route, { kind: 'adventure' }>,
): Promise<void> {
  const characters = await openCharacter(newGame);
  const played = characters.play();
  if (characters.note) {
    const note = Object.assign(document.createElement('p'), { className: 'save-note', textContent: characters.note });
    document.querySelector('#intro .loading')?.before(note);
  }
  // Let the intro paint before the (synchronous) build.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const oakvale = await findMap('forest')!.load();
  if (oakvale.kind !== 'zone' || !isStartingZone(oakvale)) throw new Error('Oakvale should be a zone a character can start in');
  const adventure = new Adventure(scene, camera, renderer, oakvale, played, await loadNeighbours(oakvale), cap);
  if (perf) perf.chunks = () => adventure.world.chunkCounts;
  document.querySelector('#intro .loading')?.remove();
  // The page before VR: your characters, the one Enter VR plays picked.
  const host = document.querySelector<HTMLElement>('#intro section[data-game=adventure]');
  if (host) {
    showRoster(host, characters, {
      zoneOf: (r) => (r.position ? adventure.world.zoneAt(r.position.x, r.position.z)?.label : null) ?? oakvale.label,
      replay: () => location.reload(),
    });
  }
  // Keep where you stand when you go: the page hidden, VR ended, or the headset
  // put down or its menu opened (the session no longer visible).
  const { saves } = adventure;
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saves.onLeaving());
  renderer.xr.addEventListener('sessionend', () => saves.onLeaving());
  onEnterVR(renderer, () => {
    const session = renderer.xr.getSession();
    session?.addEventListener('visibilitychange', () => session.visibilityState !== 'visible' && saves.onLeaving());
  });

  // Handle for poking at the game from the console and for scripted checks.
  // `paused` stops XR frames stepping the game, so `step` alone moves it on.
  const debug = {
    adventure,
    /** Your characters: the roster and the page's acts on it (`characters.slots`, `.picked`, `.play()`). */
    characters,
    state: adventure.state,
    bag: adventure.bag,
    wares: adventure.wares,
    world: adventure.world,
    player: adventure.player,
    camps: adventure.camps,
    /** Every zone's villagers placed by data: `people.built` are those near you. */
    people: adventure.people,
    /** Every zone's animals placed by data: `herds.built` are those near you. */
    herds: adventure.herds,
    /** What the fighting has come to: hits, kills, blocks, bolts, freezes. */
    combatStats,
    /** Resolves once no save write is in flight. */
    saved: () => adventure.saves.settled(),
    device,
    renderer,
    camera,
    CONFIG,
    perf,
    paused: false,
    /** Stand at (x, z) facing `yaw` (0 looks down −Z), keeping health and rage. */
    teleport: (x: number, z: number, yaw = 0) => adventure.player.place(x, z, yaw),
    /** Run the game for `seconds`, `dt` at a time, without waiting for frames. */
    step: (seconds: number, dt = 1 / 72) => {
      for (let left = seconds; left > 1e-9; left -= dt) adventure.update(Math.min(dt, left));
    },
    /** Teach a profession, set proficiency and fill the bag: `professions.learn('mining')`, `professions.fill()`. */
    professions: professionsDebug(adventure.state, (effects) => adventure.saves.onEffects(effects)),
    /** Root, freeze or slow the enemy nearest you: `enemies.root(4)`, `enemies.slow(4, 0.5)`. */
    enemies: enemiesDebug(
      () => [...adventure.camps.enemies, ...(adventure.throne?.enemies ?? [])],
      (out) => adventure.player.feetPosition(out),
    ),
  };
  Object.assign(window, { __descent: debug });

  const timer = new Timer();
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = timer.getDelta();
    const xr = renderer.xr.isPresenting;
    // Pull this frame's head pose in before gameplay reads it.
    if (xr) renderer.xr.updateCamera(camera);
    else camera.rotation.y += dt * 0.1; // Oakvale from the start, slowly turning behind the intro
    if (xr && !debug.paused) adventure.update(dt);
    else adventure.world.update(dt, camera); // the sky and water move on the page too
    renderer.render(scene, camera);
    perf?.update(dt);
  });
}

/**
 * Your characters, from the save. At `?newgame`, the new-character form opens
 * first (with every slot taken, it says so), and the flag leaves the address,
 * so a reload carries on rather than asking again.
 */
async function openCharacter(newGame: boolean): Promise<Characters> {
  const characters = await openCharacters();
  if (newGame) {
    await askNewCharacter(characters);
    history.replaceState(null, '', `${location.pathname}${forgetNewGame(location.search)}${location.hash}`);
  }
  return characters;
}

/** `?arena`: the wave game in the crypt hall, as the plain URL played before Oakvale. */
function startArena(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  device: unknown,
  perf: PerfReadout | null,
  { firstWave, duel, showcase: pinned, playerClass, gestures }: Extract<Route, { kind: 'arena' }>,
): void {
  scene.background = new Color(0x0c0a0e);
  scene.fog = new Fog(0x0c0a0e, 6, CONFIG.arena.halfSize * 2.2);

  // ?wave=N starts the run at wave N (7 is the Warden) for testing.
  // ?duel fights one practice duelist after another (CONFIG.duelist) instead.
  // &class= plays a built class; one that isn't built yet is its prototype over the warrior
  // (the ranger's is kept at &class=ranger-prototype).
  const built = playable(playerClass);
  const game = new Game(scene, camera, renderer, firstWave, duel, built ? playerClass : 'warrior');
  const showcase = buildShowcase();
  scene.add(showcase.root);
  if (pinned) pinShowcaseCamera(camera);
  onEnterVR(renderer, () => {
    startAmbience();
    scene.remove(showcase.root);
  });

  // Handle for poking at the game from the console / automated smoke tests.
  // `paused` freezes gameplay (rendering continues) to inspect a moment.
  // `classKit`: a class prototype's (`&class=`), once it has loaded.
  // `enemies`: root, freeze or slow the enemy nearest you.
  const enemies = enemiesDebug(
    () => game.enemies,
    (out) => game.player.feetPosition(out),
  );
  const debug = { game, device, renderer, combatStats, CONFIG, showcase, enemies, paused: false, classKit: null as ClassPrototype | null };
  Object.assign(window, { __descent: debug });
  // The gesture prototype takes the right grip for its own modes: the game's gestures stand aside.
  if (gestures) game.gestures.enabled = false;
  const prototype = built ? undefined : playerClass;
  if (prototype || gestures) void loadClassPrototype(prototype, game, scene, gestures, playerClass?.replace(/-prototype$/, '')).then((kit) => (debug.classKit = kit));

  const timer = new Timer();
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = timer.getDelta();
    if (renderer.xr.isPresenting) {
      // Pull this frame's head pose in before gameplay reads it.
      renderer.xr.updateCamera(camera);
      if (!debug.paused) {
        game.update(dt);
        debug.classKit?.update(dt);
      }
    } else if (!pinned) {
      camera.rotation.y += dt * 0.1; // idle orbit on the title screen
    }
    game.arena.update(dt, camera); // torch flicker; glows face this frame's head
    renderer.render(scene, camera);
    perf?.update(dt);
  });
}

async function startInspector(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera): Promise<void> {
  const { Inspector } = await import('./inspector/inspector');
  const inspector = new Inspector(renderer);
  scene.add(inspector.root);
  scene.fog = null;
  scene.background = new Color(0x16131a);
  document.getElementById('intro')?.style.setProperty('display', 'none');
  // Desktop view: stepped back far enough to see the Warden and the readout.
  camera.position.set(0, 1.5, 1.2);
  camera.lookAt(-0.2, 1.2, -1.8);
  Object.assign(window, { __descent: { inspector, renderer, camera } });

  const timer = new Timer();
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    if (renderer.xr.isPresenting) renderer.xr.updateCamera(camera);
    inspector.update(timer.getDelta());
    renderer.render(scene, camera);
  });
}

async function startMapViewer(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  device: unknown,
  map: string,
): Promise<void> {
  const { MapViewer } = await import('./viewer/mapViewer');
  const viewer = new MapViewer(scene, camera, renderer, map);
  document.getElementById('intro')?.style.setProperty('display', 'none');
  Object.assign(window, { __descent: { viewer, device, renderer } });

  const timer = new Timer();
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    if (renderer.xr.isPresenting) renderer.xr.updateCamera(camera);
    viewer.update(timer.getDelta());
    renderer.render(scene, camera);
  });
}

/** `?proto=<name>`: a throwaway professions prototype, or the Adventure's page for a name it doesn't know. */
async function startPrototype(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, device: unknown, name: string): Promise<void> {
  // ?proto=brew: PROTOTYPE of brewing at the alchemy table (.scratch/professions/issues/07-…).
  if (name === 'brew') return (await import('./professions/prototypes/brew')).startBrewPrototype(renderer, scene, camera, device);
  // ?proto=pick: PROTOTYPE of swinging the pick and cutting herbs (.scratch/professions/issues/05-…).
  if (name === 'pick') return (await import('./professions/prototypes/pick')).startPickPrototype(renderer, scene, camera, device);
  // ?proto=anvil: PROTOTYPE of hammering at the anvil (.scratch/professions/issues/06-…).
  if (name === 'anvil') return (await import('./professions/prototypes/anvil')).startAnvilPrototype(renderer, scene, camera, device);
  const intro = document.getElementById('intro');
  if (intro) intro.textContent = `No prototype called "${name}".`;
}

void start();
