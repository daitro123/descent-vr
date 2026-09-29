import { Color, Fog, PerspectiveCamera, Scene, Timer, WebGLRenderer } from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { Adventure } from './adventure';
import { combatStats } from './combat/combat';
import { CONFIG } from './config';
import { startAmbience, unlockAudio } from './fx/sfx';
import { Game } from './game';
import { findMap } from './maps/registry';
import { forgetNewGame, readPage, type Route } from './route';
import { openSave, type Save } from './save/store';
import { buildShowcase, pinShowcaseCamera } from './showcase';
import './style.css';
import { askNewGame } from './ui/newGameDialog';
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
    case 'arena':
      return startArena(renderer, scene, camera, device, perf, r);
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

/** The plain URL: Oakvale, loaded from the save (`?newgame` asks to start over). */
async function startAdventure(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  device: unknown,
  perf: PerfReadout | null,
  { newGame }: Extract<Route, { kind: 'adventure' }>,
): Promise<void> {
  const save = await openCharacter(newGame);
  // Let the intro paint before the (synchronous) build.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const oakvale = await findMap('forest')!.load();
  if (oakvale.kind !== 'zone') throw new Error('Oakvale should be a zone');
  const adventure = new Adventure(scene, camera, renderer, oakvale, save);
  document.querySelector('#intro .loading')?.remove();
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
    state: adventure.state,
    world: adventure.world,
    player: adventure.player,
    camps: adventure.camps,
    /** Resolves once no save write is in flight. */
    saved: () => adventure.saves.settled(),
    device,
    renderer,
    camera,
    CONFIG,
    paused: false,
    /** Stand at (x, z) facing `yaw` (0 looks down −Z), keeping health and rage. */
    teleport: (x: number, z: number, yaw = 0) => adventure.player.place(x, z, yaw),
    /** Run the game for `seconds`, `dt` at a time, without waiting for frames. */
    step: (seconds: number, dt = 1 / 72) => {
      for (let left = seconds; left > 1e-9; left -= dt) adventure.update(Math.min(dt, left));
    },
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
 * The character to load: the save's, with a note on the page if it can't be
 * kept. At `?newgame`, a saved character is deleted once you say yes, and the
 * flag leaves the address, so a reload carries on rather than asking again.
 */
async function openCharacter(newGame: boolean): Promise<Save> {
  let save = await openSave();
  if (newGame) {
    if (save.held && (await askNewGame(save.record))) save = await save.startOver();
    history.replaceState(null, '', `${location.pathname}${forgetNewGame(location.search)}${location.hash}`);
  }
  if (save.note) {
    const note = Object.assign(document.createElement('p'), { className: 'save-note', textContent: save.note });
    document.querySelector('#intro .loading')?.before(note);
  }
  return save;
}

/** `?arena`: the wave game in the crypt hall, as the plain URL played before Oakvale. */
function startArena(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  device: unknown,
  perf: PerfReadout | null,
  { firstWave, duel, showcase: pinned }: Extract<Route, { kind: 'arena' }>,
): void {
  scene.background = new Color(0x0c0a0e);
  scene.fog = new Fog(0x0c0a0e, 6, CONFIG.arena.halfSize * 2.2);

  // ?wave=N starts the run at wave N (7 is the Warden) for testing.
  // ?duel fights one practice duelist after another (CONFIG.duelist) instead.
  const game = new Game(scene, camera, renderer, firstWave, duel);
  const showcase = buildShowcase();
  scene.add(showcase.root);
  if (pinned) pinShowcaseCamera(camera);
  onEnterVR(renderer, () => {
    startAmbience();
    scene.remove(showcase.root);
  });

  // Handle for poking at the game from the console / automated smoke tests.
  // `paused` freezes gameplay (rendering continues) to inspect a moment.
  const debug = { game, device, renderer, combatStats, CONFIG, showcase, paused: false };
  Object.assign(window, { __descent: debug });

  const timer = new Timer();
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = timer.getDelta();
    if (renderer.xr.isPresenting) {
      // Pull this frame's head pose in before gameplay reads it.
      renderer.xr.updateCamera(camera);
      if (!debug.paused) game.update(dt);
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

void start();
