import { type Object3D, type PerspectiveCamera, type Scene, Timer, Vector3, type WebGLRenderer } from 'three';
import { FloatingText } from '../../../fx/floatingText';
import { Particles } from '../../../fx/particles';
import { unlockAudio, updateListener } from '../../../fx/sfx';
import { findMap } from '../../../maps/registry';
import type { Handedness } from '../../../player/input';
import { Card, FONT, roundRect, wrap } from '../../../ui/card';
import { World } from '../../../world/world';
import { Bag, NAMES } from './bag';
import { Herb } from './herb';
import { Rig } from './rig';
import { gatherSfx } from './sound';
import { Knife, Pick, type ToolKind, ToolLoop } from './tools';
import { type Fx, type HandNow, type Variant, VARIANTS } from './variants';
import { VEIN, Vein } from './vein';

// PROTOTYPE: `?proto=pick` answers the professions map's "Swinging the pick
// and cutting herbs" ticket (.scratch/professions/issues/05-…). Outside the
// old mine's mouth in Oakvale, with no enemies: a copper vein on a boulder and
// a clump of Hearthleaf on a bank. The pick and the knife hang on the tool
// loop behind your right hip: squeeze the grip there near the vein or the
// herbs to draw the right one (and again to put it back). Three variants of
// how a strike counts, what the vein drops and how an herb is taken, switched
// in the headset by clicking the left stick (`&variant=A|B|C` to start on
// one). Throwaway: the winner gets rebuilt properly and this folder goes.

/** Where you start, facing the mine; the vein on your left, the herbs on your right. */
const START = { x: -14, z: -69, yaw: 0 };
const VEIN_AT = { x: -15, z: -70.9 };
const HERB_AT = { x: -12.6, z: -70.3 };
/** The readout: up between the two, facing where you start. */
const READOUT_AT = { x: -13.8, z: -71.3, y: 1.95 };
/** The loop gives a tool within this of a spot, and takes it back beyond `putAway` from every spot. */
const REACH = { draw: 3, putAway: 5 };

const _v = new Vector3();
const _w = new Vector3();

interface HandTrack {
  prev: Vector3;
  valid: boolean;
  squeeze: number;
}

export async function startPickPrototype(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, device: unknown): Promise<void> {
  const intro = document.getElementById('intro');
  if (intro) intro.innerHTML = '<h1>Pick and herbs</h1>Loading Oakvale…';
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const oakvale = await findMap('forest')!.load();
  if (oakvale.kind !== 'zone') throw new Error('Oakvale should be a zone');
  const world = new World(findMap);
  world.attach(scene, camera, renderer);
  world.load(oakvale);

  const rig = new Rig(renderer, camera, world);
  scene.add(rig.rig);
  rig.place(START.x, START.z, START.yaw);
  const particles = new Particles(scene);
  const floats = new FloatingText(scene);
  const bag = new Bag(camera);
  const clock = new Timer();
  let seconds = 0;

  // A line in front of you for a moment.
  const hintCard = new Card(0.8, 0.1, { overlay: true, ppm: 1400 });
  hintCard.mesh.visible = false;
  scene.add(hintCard.mesh);
  let hintTime = 0;
  const hint = (text: string) => {
    hintCard.paint(text, (c, w, h) => {
      c.fillStyle = 'rgba(14, 16, 22, 0.85)';
      roundRect(c, 0, 0, w, h, 24);
      c.fill();
      c.fillStyle = '#ece6d6';
      c.font = `34px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, w / 2, h / 2);
    });
    placeInView(hintCard.mesh, 1.1, -0.28);
    hintCard.mesh.visible = true;
    hintTime = 2.2;
  };
  const placeInView = (o: Object3D, ahead: number, lift: number) => {
    camera.getWorldPosition(_v);
    camera.getWorldDirection(_w).setY(0).normalize();
    o.position.copy(_v).addScaledVector(_w, ahead);
    o.position.y += lift;
    o.lookAt(_v);
  };

  const fx: Fx = {
    scene,
    particles,
    floats,
    bag,
    pulse: (hand, intensity, ms) => rig.input.pulse(hand, intensity, ms),
    hint,
    heightAt: (x, z) => world.heightAt(x, z),
    now: () => seconds,
  };
  const vein = new Vein(fx, VEIN_AT.x, VEIN_AT.z, Math.atan2(START.x - VEIN_AT.x, START.z - VEIN_AT.z));
  const herb = new Herb(fx, HERB_AT.x, HERB_AT.z);
  scene.add(vein.root, herb.root);
  rig.blocks.push(vein.footprint, herb.footprint);
  bag.onLand = (kind, count) => {
    camera.getWorldPosition(_v);
    camera.getWorldDirection(_w).setY(0).normalize();
    floats.spawn(`+${count} ${NAMES[kind]}`, _v.addScaledVector(_w, 0.9).setY(_v.y - 0.15), {
      color: kind === 'ore' ? '#ffb070' : '#a8e070',
      scale: 0.07,
      life: 1.4,
      rise: 0.15,
    });
  };

  // The tools and the loop they hang on.
  const loop = new ToolLoop();
  scene.add(loop.root);
  const pick = new Pick();
  const knife = new Knife();
  let drawn: ToolKind | null = null;
  let variant: Variant = VARIANTS[0];

  const spotDistance = () => {
    camera.getWorldPosition(_v);
    return {
      vein: Math.hypot(_v.x - VEIN_AT.x, _v.z - VEIN_AT.z),
      herb: Math.hypot(_v.x - HERB_AT.x, _v.z - HERB_AT.z),
    };
  };
  const draw = (kind: ToolKind) => {
    drawn = kind;
    const tool = kind === 'pick' ? pick : knife;
    tool.reset();
    rig.hold(tool.model);
    loop.showHanging(kind);
    gatherSfx.draw(true);
    rig.input.pulse('right', 0.5, 30);
  };
  const putAway = () => {
    if (!drawn) return;
    drawn = null;
    rig.hold(null);
    loop.showHanging(null);
    gatherSfx.draw(false);
    rig.input.pulse('right', 0.3, 30);
  };
  /** A squeeze in the loop: put the tool back, or draw the one for the nearest spot. */
  const useLoop = () => {
    if (drawn) return putAway();
    const d = spotDistance();
    const kind: ToolKind | null =
      Math.min(d.vein, d.herb) > REACH.draw ? null : d.vein <= d.herb ? 'pick' : 'knife';
    if (kind === 'knife' && variant.rules.herb === 'pull') {
      gatherSfx.nothing();
      hint('No knife in this variant: grab the Hearthleaf and pull');
      return;
    }
    if (!kind) {
      gatherSfx.nothing();
      hint('Nothing to gather near here');
      return;
    }
    draw(kind);
  };

  // Variants: a card says which, and everything starts over.
  const announce = new Card(1.05, 0.34, { overlay: true, ppm: 1500 });
  announce.mesh.visible = false;
  scene.add(announce.mesh);
  let announceTime = 0;
  const setVariant = (key: string) => {
    variant = VARIANTS.find((v) => v.key === key) ?? VARIANTS[0];
    putAway();
    bag.clear();
    vein.setRules(variant.rules);
    herb.setRules(variant.rules);
    const i = VARIANTS.indexOf(variant);
    announce.paint(variant.key, (c, w, h) => {
      c.fillStyle = 'rgba(14, 16, 22, 0.9)';
      roundRect(c, 0, 0, w, h, 30);
      c.fill();
      c.textBaseline = 'top';
      c.fillStyle = '#ffd23a';
      c.font = `bold 50px ${FONT}`;
      c.fillText(`${variant.key} · ${variant.name}   (${i + 1} of ${VARIANTS.length})`, 34, 24);
      c.fillStyle = '#ece6d6';
      c.font = `30px ${FONT}`;
      wrap(c, variant.how, w - 68).forEach((line, j) => c.fillText(line, 34, 94 + j * 38));
      c.fillStyle = '#a89c80';
      c.font = `26px ${FONT}`;
      c.fillText('Click the left stick for the next variant (it starts over).', 34, h - 46);
    });
    placeInView(announce.mesh, 1.6, 0.3);
    announce.mesh.visible = true;
    announceTime = 7;
    const query = new URLSearchParams(location.search);
    query.set('variant', variant.key);
    history.replaceState(null, '', `${location.pathname}?${query}${location.hash}`);
  };
  const nextVariant = () => setVariant(VARIANTS[(VARIANTS.indexOf(variant) + 1) % VARIANTS.length].key);

  // The readout: the whole state, every frame, so what happened is never a guess.
  const readout = new Card(1.2, 0.63, { ppm: 1030 });
  readout.mesh.position.set(READOUT_AT.x, world.heightAt(READOUT_AT.x, READOUT_AT.z) + READOUT_AT.y, READOUT_AT.z);
  readout.mesh.lookAt(START.x, readout.mesh.position.y - 0.3, START.z);
  scene.add(readout.mesh);
  const paintReadout = () => {
    const v = vein.last;
    const lines = [
      `${variant.key} · ${variant.name}`,
      vein.broken
        ? `Vein broken${vein.lastBreak ? ` in ${vein.lastBreak.strikes} strikes, ${vein.lastBreak.seconds.toFixed(1)} s` : ''}${vein.lying ? ` · ${vein.lying} chunks to pick up` : ''}`
        : `Vein ${vein.progress.toFixed(1)} of ${VEIN.need} · ${vein.strikes} strikes`,
      v ? `Last strike: ${v.kind} · ${v.speed.toFixed(1)} m/s · +${v.value.toFixed(1)}` : 'Last strike: none yet',
      `Herb: ${herb.taken ? 'taken, growing back' : 'ready'}${herb.last ? ` · ${herb.last}` : ''}${herb.lastTaken ? ` (${herb.lastTaken.seconds.toFixed(1)} s)` : ''}`,
      `Bag: ${bag.counts.ore} ${NAMES.ore} · ${bag.counts.herb} ${NAMES.herb}`,
      `In your right hand: ${drawn ?? 'sword'}`,
    ];
    readout.paint(lines.join('|'), (c, w, h) => {
      c.fillStyle = 'rgba(14, 16, 22, 0.82)';
      roundRect(c, 0, 0, w, h, 26);
      c.fill();
      c.textBaseline = 'top';
      lines.forEach((line, i) => {
        c.fillStyle = i === 0 ? '#ffd23a' : '#ece6d6';
        c.font = i === 0 ? `bold 44px ${FONT}` : `34px ${FONT}`;
        c.fillText(line, 30, 26 + i * 52 + (i ? 10 : 0));
      });
      const p = vein.broken ? 1 : vein.progress / VEIN.need;
      c.fillStyle = '#3a3226';
      c.fillRect(30, h - 44, w - 60, 16);
      c.fillStyle = '#e08a40';
      c.fillRect(30, h - 44, (w - 60) * Math.min(1, p), 16);
    });
  };

  // The hands, as the spots see them.
  const tracks: Record<Handedness, HandTrack> = {
    left: { prev: new Vector3(), valid: false, squeeze: 0 },
    right: { prev: new Vector3(), valid: false, squeeze: 0 },
  };
  const hands: Record<Handedness, HandNow> = {
    left: { hand: 'left', at: new Vector3(), speed: 0, squeeze: 0, squeezed: false },
    right: { hand: 'right', at: new Vector3(), speed: 0, squeeze: 0, squeezed: false },
  };
  const readHands = (dt: number, xr: boolean): HandNow[] => {
    const out: HandNow[] = [];
    for (const side of ['left', 'right'] as const) {
      const state = rig.input.hands[side];
      const h = hands[side];
      const t = tracks[side];
      state.grip.getWorldPosition(h.at);
      rig.rig.worldToLocal(_v.copy(h.at));
      h.speed = t.valid && dt > 0 ? _v.distanceTo(t.prev) / dt : 0;
      t.prev.copy(_v);
      t.valid = xr && !!state.source;
      h.squeeze = state.squeeze;
      h.squeezed = state.squeeze > 0.5 && t.squeeze <= 0.5;
      t.squeeze = state.squeeze;
      if (xr && state.source) out.push(h);
    }
    return out;
  };

  // Desktop keys, for trying the rules without a headset: N next variant, G the loop,
  // 1 a full strike on the ore, 2 one in the glint, 3 a slow tap, 4 a cut low, 5 a cut high, 6 a pull.
  let swings = 1000;
  const strikeAt = (where: 'ore' | 'glint', speed: number) => {
    const at = where === 'glint' ? vein.glint(new Vector3()) : vein.ore.clone();
    if (where === 'ore' && variant.rules.strike === 'glint' && at.distanceTo(vein.glint(_w)) < 0.12) {
      // Not in the glint, even by chance: the far side of the ore.
      at.add(_v.subVectors(at, _w).setLength(0.12));
    }
    return vein.hit(at, speed, speed > 1, ++swings);
  };
  const debug = {
    vein,
    herb,
    pickTool: pick,
    knifeTool: knife,
    bag,
    loop,
    get variant() {
      return variant.key;
    },
    get drawn() {
      return drawn;
    },
    setVariant,
    useLoop,
    strike: strikeAt,
    cut: (low: boolean) => (low ? herb.slice() : herb.trim()),
    pull: () => herb.pop('left'),
    /** Run the prototype for `s` seconds without frames. */
    step: (s: number, dt = 1 / 72) => {
      for (let left = s; left > 1e-9; left -= dt) tick(Math.min(dt, left), false);
    },
  };
  Object.assign(window, { __descent: { proto: debug, world, rig, renderer, camera, device } });
  addEventListener('keydown', (e) => {
    const k = e.code;
    if (k === 'KeyN') nextVariant();
    else if (k === 'KeyG') useLoop();
    else if (k === 'Digit1') strikeAt('ore', 4.5);
    else if (k === 'Digit2') strikeAt('glint', 3);
    else if (k === 'Digit3') strikeAt('ore', 1);
    else if (k === 'Digit4') herb.slice();
    else if (k === 'Digit5') herb.trim();
    else if (k === 'Digit6') herb.pop('left');
  });

  if (intro) {
    intro.innerHTML =
      '<h1>Pick and herbs</h1>' +
      '<b>Prototype</b> for gathering: a copper vein and a clump of Hearthleaf outside the old mine, no enemies. ' +
      'Press <b>Enter VR</b>. The pick and the knife hang on a loop behind your right hip: squeeze the grip there near the vein or the herbs. ' +
      'Click the left stick for the next variant (A, B, C).<br>' +
      'Desktop: WASD walks, drag looks; N next variant, G the loop, 1 strike, 2 strike the glint, 3 tap, 4 cut low, 5 cut high, 6 pull.';
  }
  renderer.xr.addEventListener('sessionstart', () => {
    unlockAudio();
    intro?.style.setProperty('display', 'none');
    rig.place(START.x, START.z, START.yaw);
    setVariant(variant.key);
  });
  renderer.xr.addEventListener('sessionend', () => intro?.style.removeProperty('display'));
  addEventListener('pointerdown', unlockAudio, { once: true });

  function tick(dt: number, render: boolean): void {
    seconds += dt;
    const xr = renderer.xr.isPresenting;
    rig.update(dt);
    const now = readHands(dt, xr);
    const right = now.find((h) => h.hand === 'right') ?? null;

    loop.update(camera, dt);
    const touch = loop.touch(right?.at ?? null);
    if (touch.entered) rig.input.pulse('right', 0.25, 15);
    if (touch.inside && right?.squeezed && right.speed < 1.5) useLoop();
    if (drawn) {
      const d = spotDistance();
      if (Math.min(d.vein, d.herb) > REACH.putAway) putAway();
    }
    if (rig.input.hands.left.stickPressed) nextVariant();

    if (drawn === 'pick') pick.update(rig.rig, dt);
    if (drawn === 'knife') knife.update(rig.rig, dt);
    vein.update(dt, drawn === 'pick' ? pick : null, rig.rig, now);
    herb.update(dt, drawn === 'knife' ? knife : null, rig.rig, now);
    bag.update(dt);
    particles.update(dt);
    floats.update(dt);
    hintTime -= dt;
    hintCard.mesh.visible = hintTime > 0;
    announceTime -= dt;
    announce.mesh.visible = announceTime > 0;
    paintReadout();
    if (render) {
      world.update(dt, camera);
      updateListener(camera);
    }
  }

  const query = new URLSearchParams(location.search).get('variant')?.toUpperCase();
  setVariant(VARIANTS.some((v) => v.key === query) ? query! : 'A');
  renderer.setAnimationLoop(() => {
    // The page's own clock, not the frame's time: under the emulator that can run backwards.
    clock.update();
    const dt = Math.max(0, Math.min(clock.getDelta(), 1 / 30));
    if (renderer.xr.isPresenting) renderer.xr.updateCamera(camera);
    tick(dt, true);
    renderer.render(scene, camera);
  });
}
