import { Color, Fog, PerspectiveCamera, Scene, Timer, WebGLRenderer } from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { combatStats } from './combat/combat';
import { CONFIG } from './config';
import { startAmbience, unlockAudio } from './fx/sfx';
import { Game } from './game';
import { buildShowcase, pinShowcaseCamera } from './showcase';
import './style.css';

const params = new URLSearchParams(location.search);

/** Emulate when asked to (?emulate), or when there's no real headset. */
async function wantsEmulator(): Promise<boolean> {
  if (params.has('emulate')) return true;
  if (params.has('noemulate')) return false;
  try {
    return !(await navigator.xr?.isSessionSupported('immersive-vr'));
  } catch {
    return true;
  }
}

async function start(): Promise<void> {
  const device = (await wantsEmulator())
    ? await (await import('./emulator')).installEmulator(!params.has('nodevui'))
    : null;

  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  // Quest budget (see .scratch/vertical-slice/research): foveation explicit,
  // framebuffer at the browser's recommended size (lower to ~0.85 if GPU-bound).
  renderer.xr.setFoveation(1);
  renderer.xr.setFramebufferScaleFactor(1);
  document.body.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color(0x0c0a0e);
  scene.fog = new Fog(0x0c0a0e, 6, CONFIG.arena.halfSize * 2.2);

  const camera = new PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 60);
  camera.position.set(0, 1.6, 0); // desktop preview; XR drives it once presenting

  document.body.appendChild(VRButton.createButton(renderer));
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // ?inspect opens the model inspector instead of the game.
  if (params.has('inspect')) return startInspector(renderer, scene, camera);
  // ?fly opens the map viewer (?fly=<id> for one map) instead of the game.
  if (params.has('fly')) return startMapViewer(renderer, scene, camera, device);

  // ?wave=N starts the run at wave N (7 is the Warden) for testing.
  const firstWave = Math.max(1, Math.min(CONFIG.waves.list.length, Number(params.get('wave')) || 1));
  const game = new Game(scene, camera, renderer, firstWave);
  const showcase = buildShowcase();
  scene.add(showcase.root);
  const pinned = params.has('showcase');
  if (pinned) pinShowcaseCamera(camera);

  const intro = document.getElementById('intro');
  renderer.xr.addEventListener('sessionstart', () => {
    unlockAudio();
    startAmbience();
    // 72 fps is Meta's minimum and our target; the browser may default higher.
    const session = renderer.xr.getSession();
    if (session?.supportedFrameRates?.includes(72)) void session.updateTargetFrameRate?.(72).catch(() => {});
    scene.remove(showcase.root);
    intro?.style.setProperty('display', 'none');
  });
  renderer.xr.addEventListener('sessionend', () => intro?.style.removeProperty('display'));
  addEventListener('pointerdown', unlockAudio, { once: true });

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
  Object.assign(window, { __descent: { inspector, renderer } });

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
): Promise<void> {
  const { MapViewer } = await import('./viewer/mapViewer');
  const viewer = new MapViewer(scene, camera, renderer, params.get('fly'));
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
