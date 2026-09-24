import { Color, Fog, PerspectiveCamera, Scene, Timer, WebGLRenderer } from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { combatStats } from './combat/combat';
import { CONFIG } from './config';
import { unlockAudio } from './fx/sfx';
import { Game } from './game';
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
  document.body.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color(0x0c0a0e);
  scene.fog = new Fog(0x0c0a0e, 6, CONFIG.arena.halfSize * 2.2);

  const camera = new PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 60);
  camera.position.set(0, 1.6, 0); // desktop preview; XR drives it once presenting

  const game = new Game(scene, camera, renderer);

  document.body.appendChild(VRButton.createButton(renderer));
  const intro = document.getElementById('intro');
  renderer.xr.addEventListener('sessionstart', () => {
    unlockAudio();
    intro?.style.setProperty('display', 'none');
  });
  renderer.xr.addEventListener('sessionend', () => intro?.style.removeProperty('display'));
  addEventListener('pointerdown', unlockAudio, { once: true });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  const timer = new Timer();
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = timer.getDelta();
    if (renderer.xr.isPresenting) {
      // Pull this frame's head pose in before gameplay reads it.
      renderer.xr.updateCamera(camera);
      game.update(dt);
    } else {
      camera.rotation.y += dt * 0.1; // idle orbit on the title screen
    }
    renderer.render(scene, camera);
  });

  // Handle for poking at the game from the console / automated smoke tests.
  Object.assign(window, { __descent: { game, device, renderer, combatStats, CONFIG } });
}

void start();
