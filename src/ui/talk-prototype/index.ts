import { Color, Fog, Object3D, type PerspectiveCamera, type Scene, Timer, Vector3, type WebGLRenderer } from 'three';
import { FloatingText } from '../../fx/floatingText';
import { unlockAudio, updateListener, sfx } from '../../fx/sfx';
import { findMap } from '../../maps/registry';
import { Walker } from '../../maps/walk';
import { FarmStandIns, Hale } from './actors';
import { Card, FONT, roundRect, wrap } from './card';
import { QuestBook } from './quest';
import type { Variant, VariantContext } from './variant';
import { HandsVariant } from './variantA';
import { PointVariant } from './variantB';
import { TalkVariant } from './variantC';

// PROTOTYPE: `?talk` answers the Oakvale map's "Talking to NPCs and tracking
// quests" ticket (.scratch/oakvale-starting-zone/issues/06-…). Three ways to
// talk to Marshal Hale, take Raiders in the Fields, track it and hand it in,
// switchable in the headset with a left-stick click (`?talk=A|B|C` to start on
// one). Throwaway: the winner gets rebuilt properly and this folder goes.

const VARIANTS: { key: string; make: (ctx: VariantContext) => Variant }[] = [
  { key: 'A', make: (ctx) => new HandsVariant(ctx) },
  { key: 'B', make: (ctx) => new PointVariant(ctx) },
  { key: 'C', make: (ctx) => new TalkVariant(ctx) },
];

/** Marshal Hale, outdoors at the crossroads by the signpost. */
const HALE = { x: 1.5, z: 4.8 };
/** A new character starts a few steps away, facing them. */
const START = { x: 0.2, z: 1.5 };
/** The farm's bandits, in the farmyard, facing the road in. */
const FARM: [number, number][] = [
  [52.5, 26.5],
  [55.5, 30.5],
  [51.5, 30],
];
const FARM_FACES: [number, number] = [47, 20];

const _v = new Vector3();

export async function startTalkPrototype(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  device: unknown,
): Promise<void> {
  const params = new URLSearchParams(location.search);
  const intro = document.getElementById('intro');
  if (intro) intro.innerHTML = '<h1>Oakvale</h1>Loading…';
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const map = await findMap('forest')!.load();
  scene.add(map.root);
  scene.background = new Color(map.sky.background);
  scene.fog = new Fog(map.sky.fog.color, map.sky.fog.near, map.sky.fog.far);
  camera.far = map.viewDistance;
  camera.updateProjectionMatrix();

  const walker = new Walker(renderer, camera, map);
  scene.add(walker.rig);
  const hale = new Hale(map, HALE.x, HALE.z);
  scene.add(hale.root);
  const farm = new FarmStandIns(map, FARM, FARM_FACES);
  scene.add(farm.root);
  const floats = new FloatingText(scene);

  // Where each controller points (target-ray space), for variant B's rays.
  const aim: VariantContext['aim'] = { left: null, right: null };
  for (let i = 0; i < 2; i++) {
    const space = renderer.xr.getController(i);
    walker.rig.add(space);
    space.addEventListener('connected', (e) => {
      const hand = (e as unknown as { data: XRInputSource }).data.handedness;
      if (hand === 'left' || hand === 'right') aim[hand] = space;
    });
  }
  // The sword's tip can press variant A's buttons.
  const swordPoints = [0.95].map((d) => {
    const p = new Object3D();
    p.position.set(0, 0, -d);
    walker.sword.model.add(p);
    return p;
  });

  const keys = { talk: false, choice: -1 };
  const ctx: VariantContext = {
    camera,
    rig: walker.rig,
    input: walker.input,
    aim,
    swordPoints,
    hale,
    book: new QuestBook(),
    head: new Vector3(),
    gaze: new Vector3(0, 0, -1),
    xr: false,
    keys,
  };

  const announce = new Card(0.72, 0.19, { overlay: true, ppm: 1750 });
  scene.add(announce.mesh);
  let announceTime = 0;
  const showAnnounce = (v: Variant) => {
    const i = VARIANTS.findIndex((x) => x.key === v.key);
    announce.paint(v.key, (c, w, h) => {
      c.fillStyle = 'rgba(14, 16, 22, 0.9)';
      roundRect(c, 0, 0, w, h, 30);
      c.fill();
      c.textBaseline = 'top';
      c.fillStyle = '#ffd23a';
      c.font = `bold 50px ${FONT}`;
      c.fillText(`${v.key} · ${v.name}   (${i + 1} of ${VARIANTS.length})`, 34, 24);
      c.fillStyle = '#ece6d6';
      c.font = `32px ${FONT}`;
      wrap(c, v.how, w - 68).forEach((line, j) => c.fillText(line, 34, 94 + j * 40));
      c.fillStyle = '#a89c80';
      c.font = `28px ${FONT}`;
      c.fillText('Click the left stick for the next variant (it starts over).', 34, h - 50);
    });
    announceTime = 6;
    camera.localToWorld(announce.mesh.position.set(0, 0.42, -1.6));
    announce.mesh.lookAt(camera.getWorldPosition(_v));
  };

  let variant!: Variant;
  const bar = switcherBar(() => setVariant(VARIANTS[(index() + 1) % VARIANTS.length].key), () =>
    setVariant(VARIANTS[(index() + VARIANTS.length - 1) % VARIANTS.length].key),
  );
  const index = () => VARIANTS.findIndex((x) => x.key === variant.key);

  function setVariant(key: string): void {
    if (variant) scene.remove(variant.root);
    ctx.book = new QuestBook();
    const entry = VARIANTS.find((x) => x.key === key) ?? VARIANTS[0];
    variant = entry.make(ctx);
    ctx.book.on((e) => {
      variant.onQuest(e);
      if (e.kind === 'handedIn') {
        hale.head(_v).y += 0.3;
        floats.spawn(`+${e.xp} XP`, _v, { color: '#ffd23a', scale: 0.12, life: 2.2, rise: 0.5 });
        sfx.victory();
        if (e.level) {
          _v.y += 0.25;
          floats.spawn(`LEVEL ${e.level}`, _v, { color: '#ffffff', scale: 0.16, life: 3, rise: 0.4 });
        }
      }
    });
    scene.add(variant.root);
    farm.reset();
    hale.highlighted = false;
    walker.teleport(START.x, START.z, Math.atan2(-(HALE.x - START.x), -(HALE.z - START.z)));
    const query = new URLSearchParams(location.search);
    query.set('talk', entry.key);
    history.replaceState(null, '', `?${query.toString().replace(/=(?=&|$)/g, '')}${location.hash}`);
    bar.label.textContent = `${entry.key} · ${variant.name}`;
    if (renderer.xr.isPresenting) showAnnounce(variant);
  }
  setVariant((params.get('talk') || 'A').toUpperCase());

  farm.onKill = (at) => {
    const xp = ctx.book.farmKill();
    floats.spawn(`+${xp} XP`, at, { color: '#ffd23a', scale: 0.1, life: 1.6, rise: 0.4 });
  };

  addEventListener('keydown', (e) => {
    if (e.code === 'KeyE') keys.talk = true;
    if (e.code === 'Digit1') keys.choice = 0;
    if (e.code === 'Digit2') keys.choice = 1;
    if (e.code === 'KeyV') setVariant(VARIANTS[(index() + 1) % VARIANTS.length].key);
    if (e.code === 'KeyK') farm.strikeNearest(camera.getWorldPosition(_v), 5);
  });

  if (intro) {
    intro.innerHTML =
      '<h1>Oakvale: talking to Marshal Hale</h1>' +
      'A throwaway prototype: three ways to take a quest, track it and hand it in. Marshal Hale stands at the crossroads; ' +
      'three skeletons stand in for the bandits at the farm, down the east road. Swing your sword through them.<br>' +
      '<b>A · Hands</b>: touch buttons on a board beside Hale; the quest log is on your left wrist. ' +
      '<b>B · Point</b>: point and pull the trigger; the quest sits on your belt. ' +
      '<b>C · Talk</b>: look at Hale to talk, nod or shake your head; the quest floats top left.<br>' +
      'In the headset, <b>click the left stick</b> for the next variant. Desktop: WASD to walk, drag to look, E talks, 1 and 2 choose, K strikes the nearest bandit, V switches variant.';
  }
  renderer.xr.addEventListener('sessionstart', () => {
    intro?.style.setProperty('display', 'none');
    unlockAudio();
    showAnnounce(variant);
  });
  renderer.xr.addEventListener('sessionend', () => intro?.style.removeProperty('display'));
  addEventListener('pointerdown', unlockAudio, { once: true });

  // Handle for poking from the console and for scripted checks.
  Object.assign(window, {
    __descent: {
      map,
      walker,
      hale,
      farm,
      renderer,
      camera,
      device,
      setVariant,
      get book() {
        return ctx.book;
      },
      get variant() {
        return variant;
      },
      teleport: (x: number, z: number, yaw = 0) => walker.teleport(x, z, yaw),
    },
  });

  let stickWas = false;
  const timer = new Timer();
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 1 / 30);
    const xr = renderer.xr.isPresenting;
    if (xr) renderer.xr.updateCamera(camera);
    walker.update(dt);
    walker.rig.updateMatrixWorld(true);
    walker.sword.update(walker.rig, dt);

    ctx.xr = xr;
    camera.getWorldPosition(ctx.head);
    camera.getWorldDirection(ctx.gaze);
    const stick = !!walker.input.hands.left.source?.gamepad?.buttons[3]?.pressed;
    if (stick && !stickWas) setVariant(VARIANTS[(index() + 1) % VARIANTS.length].key);
    stickWas = stick;

    hale.update(dt, ctx.head);
    farm.update(dt, walker.sword, walker.rig);
    variant.update(dt);
    keys.talk = false;
    keys.choice = -1;

    announceTime = Math.max(0, announceTime - dt);
    announce.opacity = Math.min(1, announceTime * 2);
    floats.update(dt);
    map.update(dt, camera);
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

