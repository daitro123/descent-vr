import { Color, Fog, type PerspectiveCamera, type Scene, Timer, Vector3, type WebGLRenderer } from 'three';
import { CONFIG } from '../../config';
import { sfx, updateListener } from '../../fx/sfx';
import type { Handedness } from '../../player/input';
import { Player } from '../../player/player';
import { Card, FONT, roundRect, wrap } from '../card';
import { TextPanel } from '../panel';
import type { PerfReadout } from '../perfReadout';
import { Bag, slotLabel } from './items';
import { type HandFrame, Grab, HeldModel, type Mover, type MoverInput, type MoverWorld, type Probe, PressPress, TouchCarry } from './movers';
import { GearPanel, type Mode } from './panel';
import { type HandNow, REACH, ShoulderReach } from './reach';
import { Drops, Dummy, Yard } from './room';

// PROTOTYPE: `?bag` answers the inventory map's "The bag and the gear panel"
// ticket (.scratch/inventory/issues/03-the-bag-and-the-gear-panel.md). A
// quiet yard with a training dummy; you hold the warrior's sword and shield.
// Reach over either shoulder and squeeze the grip to bring the bag round.
// Three ways to move items, `?bag=a|b|c` (a click of the left stick switches
// in the headset), and icons from one atlas or small 3D models in the slots
// (`&models`, or a click of the right stick). Kept on main so Tom can try it
// on the headset; it touches neither the Adventure nor the save.

type VariantKey = 'a' | 'b' | 'c';
const ORDER: readonly VariantKey[] = ['a', 'b', 'c'];

/** The grip counts as squeezed past this, and let go under the lower value. */
const GRIP_ON = 0.6;
const GRIP_OFF = 0.4;

const _head = new Vector3();
const _gaze = new Vector3();
const _v = new Vector3();

export function startBagPrototype(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  device: unknown,
  perf: PerfReadout | null,
  first: VariantKey,
): void {
  const params = new URLSearchParams(location.search);
  scene.background = new Color(0x1a1820);
  scene.fog = new Fog(0x1a1820, 5, 14);

  const yard = new Yard();
  scene.add(yard.root);
  const player = new Player(camera, renderer, yard);
  scene.add(player.rig);
  const dummy = new Dummy();
  scene.add(dummy.root);
  const drops = new Drops();
  scene.add(drops.root);
  const bag = new Bag();
  const panel = new GearPanel(bag);
  scene.add(panel.root);
  const held = new HeldModel();
  scene.add(held.mesh);
  const reach = new ShoulderReach();

  const lines: string[] = [];
  const buzz = (hand: Handedness, intensity: number, ms: number) => player.input.pulse(hand, intensity, ms);
  const world: MoverWorld = {
    bag,
    panel,
    drop: (item, at, velocity) => drops.drop(item, at, velocity),
    buzz,
    log: (line) => {
      lines.push(line);
      if (lines.length > 60) lines.shift();
    },
    weapon: (hand, shown) => {
      (hand === 'right' ? player.sword.model : player.shield.model).visible = shown;
    },
  };
  const movers: Record<VariantKey, Mover> = { a: new TouchCarry(world, held), b: new PressPress(world), c: new Grab(world, held) };
  let mover = movers[first];
  panel.setMode(params.has('models') ? 'models' : 'icons');

  // The readout: everything the prototype knows, on a board by the dummy.
  const status = new TextPanel(1.0);
  status.mesh.position.set(-1.4, 1.5, -1.2);
  status.mesh.lookAt(0, 1.5, 0);
  scene.add(status.mesh);
  // The variant's name and how it works, in front of you for a few seconds after switching.
  const announce = new Card(0.72, 0.2, { overlay: true, ppm: 1750 });
  announce.mesh.visible = false;
  scene.add(announce.mesh);
  let announceTime = 0;

  function openBag(hand: Handedness, speed: number): void {
    panel.place(_head, _gaze);
    mover.opened();
    buzz(hand, REACH.openPulse.intensity, REACH.openPulse.ms);
    sfx.parchment();
    world.log(`opened: ${hand} hand at ${speed.toFixed(2)} m/s`);
  }
  function closeBag(why: string): void {
    mover.cancel();
    panel.close();
    held.hide();
    world.log(`closed: ${why}`);
  }

  function setVariant(key: VariantKey): void {
    mover.cancel();
    held.hide();
    mover = movers[key];
    if (panel.isOpen) mover.opened();
    world.log(`variant ${key.toUpperCase()}: ${mover.name}`);
    const url = new URL(location.href);
    url.searchParams.set('bag', key);
    history.replaceState(null, '', url);
    showAnnounce();
    pageBar.update();
  }
  function setMode(mode: Mode): void {
    panel.setMode(mode);
    world.log(`slots show ${mode === 'icons' ? 'icons (one atlas)' : '3D models'}`);
    pageBar.update();
  }

  function showAnnounce(): void {
    const i = ORDER.indexOf(mover.key);
    announce.paint(mover.key, (c, w, h) => {
      c.fillStyle = 'rgba(14, 16, 22, 0.9)';
      roundRect(c, 0, 0, w, h, 30);
      c.fill();
      c.textBaseline = 'top';
      c.fillStyle = '#ffd23a';
      c.font = `bold 50px ${FONT}`;
      c.fillText(`${mover.key.toUpperCase()} · ${mover.name}   (${i + 1} of ${ORDER.length})`, 34, 22);
      c.fillStyle = '#ece6d6';
      c.font = `30px ${FONT}`;
      wrap(c, mover.how, w - 68).forEach((line, j) => c.fillText(line, 34, 88 + j * 38));
      c.fillStyle = '#a89c80';
      c.font = `26px ${FONT}`;
      c.fillText('Click the left stick for the next way; the right stick swaps icons and 3D models.', 34, h - 42, w - 68);
    });
    announceTime = 6;
    camera.getWorldPosition(_head);
    camera.localToWorld(announce.mesh.position.set(0, 0.35, -1.5));
    announce.mesh.lookAt(_head);
    announce.mesh.visible = true;
  }

  // Each hand's grip, speed (relative to the rig, so walking doesn't count) and velocity.
  const hands = {
    left: { held: false, speed: 0, prev: new Vector3(), valid: false, at: new Vector3(), velocity: new Vector3() },
    right: { held: false, speed: 0, prev: new Vector3(), valid: false, at: new Vector3(), velocity: new Vector3() },
  };
  const probePoints = [new Vector3(), new Vector3(), new Vector3()];

  function update(dt: number): void {
    dt = Math.min(dt, 1 / 30);
    player.update(dt);
    updateListener(camera);
    camera.getWorldPosition(_head);
    camera.getWorldDirection(_gaze);
    const { input, rig, sword } = player;

    const frames: Record<Handedness, HandFrame | null> = { left: null, right: null };
    const now: Record<Handedness, HandNow | null> = { left: null, right: null };
    for (const side of ['left', 'right'] as const) {
      const state = input.hands[side];
      const h = hands[side];
      const tracked = state.grip.visible;
      const wasHeld = h.held;
      h.held = state.squeeze > (wasHeld ? GRIP_OFF : GRIP_ON);
      if (!tracked) {
        h.valid = false;
        continue;
      }
      // Speed in rig space, eased a little so one jittery frame doesn't decide.
      const rigPos = state.grip.position;
      if (h.valid && dt > 0) {
        _v.subVectors(rigPos, h.prev).divideScalar(dt);
        h.speed += (_v.length() - h.speed) * (1 - Math.exp(-dt / REACH.speedLag));
        h.velocity.copy(_v).applyQuaternion(rig.quaternion);
      } else {
        h.speed = 0;
        h.velocity.set(0, 0, 0);
      }
      h.prev.copy(rigPos);
      h.valid = true;
      state.grip.getWorldPosition(h.at);
      const gripDown = h.held && !wasHeld;
      frames[side] = { at: h.at, grip: state.grip, gripDown, gripHeld: h.held, velocity: h.velocity };
      now[side] = { at: h.at, speed: h.speed, gripDown };
    }

    if (input.hands.left.stickPressed) setVariant(ORDER[(ORDER.indexOf(mover.key) + 1) % ORDER.length]);
    if (input.hands.right.stickPressed) setMode(panel.mode === 'icons' ? 'models' : 'icons');

    // The reach over the shoulder opens the bag, and shuts it.
    reach.place(_head, _gaze);
    const reached = reach.update(dt, now, buzz);
    if (reached?.kind === 'grab') {
      if (panel.isOpen) {
        buzz(reached.hand, REACH.closePulse.intensity, REACH.closePulse.ms);
        closeBag(`${reached.hand} hand reached back`);
      } else openBag(reached.hand, reached.speed);
    } else if (reached) world.log(`not opened: ${reached.hand} hand too fast (${reached.speed.toFixed(1)} m/s)`);

    if (panel.isOpen && panel.follow(_head, _gaze) === 'walkedAway') closeBag('walked away');
    if (panel.isOpen) {
      const probes: (Probe | null)[] = [
        frames.left ? { at: probePoints[0].copy(frames.left.at), hand: 'left', kind: 'fist' } : null,
        frames.right ? { at: probePoints[1].copy(frames.right.at), hand: 'right', kind: 'fist' } : null,
        sword.tip.valid && sword.model.visible ? { at: sword.tip.worldNow(rig, probePoints[2]), hand: 'right', kind: 'tip' } : null,
      ];
      const moverInput: MoverInput = { dt, probes, hands: frames };
      panel.update(dt, mover.update(moverInput));
    }

    const taken = drops.update(dt, [frames.left?.at ?? null, frames.right?.at ?? null], bag.slots.includes(null));
    if (taken) {
      bag.add(taken);
      sfx.pickup();
      world.log(`took back: ${taken.name} to ${slotLabel({ kind: 'bag', i: bag.slots.indexOf(taken) })}`);
    }
    dummy.update(dt, player);

    announceTime = Math.max(0, announceTime - dt);
    announce.mesh.visible = announceTime > 0;
  }

  function drawStatus(): void {
    const h = (side: Handedness) => `${reach.inZone[side] ? 'IN ' : 'out'} ${hands[side].speed.toFixed(1)}m/s${hands[side].held ? ' grip' : ''}`;
    status.draw([
      `BAG PROTOTYPE  ${mover.key.toUpperCase()} · ${mover.name}`,
      `bag ${panel.isOpen ? 'OPEN' : 'shut'} · slots show ${panel.mode === 'icons' ? 'icons (1 atlas)' : '3D models'}`,
      `L ${h('left')}   R ${h('right')}`,
      `holding ${mover.holding?.name ?? '-'}`,
      `last: ${lines.at(-1) ?? '-'}`,
      `dummy hits ${dummy.hits} · on the ground ${drops.items.length}`,
      '',
      'Reach over a shoulder and squeeze the grip: bag.',
      'L stick click: next way. R stick click: icons/3D.',
    ]);
  }

  const pageBar = buildPageBar(
    () => mover.key,
    () => panel.mode,
    (d) => setVariant(ORDER[(ORDER.indexOf(mover.key) + d + ORDER.length) % ORDER.length]),
    () => setMode(panel.mode === 'icons' ? 'models' : 'icons'),
  );
  const intro = document.getElementById('intro');
  intro?.insertAdjacentHTML(
    'afterbegin',
    `<section style="display:block;margin-bottom:8px"><h1>PROTOTYPE — the bag and the gear panel</h1>
    A quiet yard with a training dummy. Reach over either shoulder and squeeze the grip to bring the bag round.
    Three ways to move items: <b>?bag=a</b> touch and carry, <b>?bag=b</b> press then press, <b>?bag=c</b> grab it.
    In the headset a click of the left stick switches the way, the right stick swaps icons and 3D models.</section>`,
  );

  // Handle for poking at the prototype from the console and for scripted checks.
  // `paused` stops XR frames stepping it, so `step` alone moves it on.
  const debug = {
    proto: {
      bag,
      panel,
      reach,
      drops,
      dummy,
      held,
      movers,
      lines,
      get mover() {
        return mover;
      },
      setVariant,
      setMode,
    },
    player,
    device,
    renderer,
    camera,
    CONFIG,
    REACH,
    perf,
    paused: false,
    /** Stand at (x, z) facing `yaw` (0 looks down −Z). */
    teleport: (x: number, z: number, yaw = 0) => player.place(x, z, yaw),
    /** Run the prototype for `seconds`, `dt` at a time, without waiting for frames. */
    step: (seconds: number, dt = 1 / 72) => {
      for (let left = seconds; left > 1e-9; left -= dt) update(Math.min(dt, left));
    },
  };
  Object.assign(window, { __descent: debug });

  camera.position.set(0, 1.6, 0);
  const timer = new Timer();
  let statusIn = 0;
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = timer.getDelta();
    if (renderer.xr.isPresenting) {
      renderer.xr.updateCamera(camera);
      if (!debug.paused) update(dt);
    }
    statusIn -= dt;
    if (statusIn <= 0) {
      drawStatus();
      statusIn = 0.1;
    }
    renderer.render(scene, camera);
    perf?.update(dt);
  });
}

/** On the page (the emulator or a desktop): switch the way and the slots' look without the sticks. */
function buildPageBar(key: () => VariantKey, mode: () => Mode, step: (d: number) => void, toggle: () => void): { update(): void } {
  const bar = document.createElement('div');
  bar.style.cssText =
    'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;padding:6px 10px;' +
    'background:#111;color:#ffd23a;border:1px solid #ffd23a;border-radius:999px;font:13px ui-monospace,monospace;z-index:10;box-shadow:0 2px 10px #0008';
  const button = (text: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = 'background:none;border:0;color:inherit;font:inherit;cursor:pointer;padding:2px 6px';
    b.addEventListener('click', onClick);
    return b;
  };
  const label = document.createElement('span');
  const look = button('', toggle);
  bar.append(button('◀', () => step(-1)), label, button('▶', () => step(1)), look);
  document.body.append(bar);
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
  const update = () => {
    label.textContent = `bag=${key()}`;
    look.textContent = mode() === 'icons' ? '[icons]' : '[3D models]';
  };
  update();
  return { update };
}
