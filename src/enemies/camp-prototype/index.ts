import {
  CanvasTexture,
  Color,
  Fog,
  type PerspectiveCamera,
  type Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Timer,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { unlockAudio } from '../../fx/sfx';
import { findMap } from '../../maps/registry';
import type { EnemyKind } from '../../models/characters';
import { TextPanel } from '../../ui/panel';
import type { Enemy, EnemyPost } from '../enemy';
import { Camp, type CampSpec, type Mind, REFILL_AWAY, RULES, type Rules, type Senses } from './camps';
import { ZoneFight } from './fight';
import { zoneGround } from './zoneGround';

// PROTOTYPE: `?camp` answers the Oakvale map's "Enemies in the open" ticket
// (.scratch/oakvale-starting-zone/issues/07-…). The lumber camp's bandits
// (skeletons stand in for them) wait round their fire, and two more walk the
// camp road as a patrol. Three ways for them to notice you, call the others
// and give up the chase, switchable in the headset with a left-stick click
// (`?camp=A|B|C` to start on one). Throwaway: the winner gets rebuilt
// properly and this folder goes.

/** You start (and wake after dying) on the main road where the camp road leaves it. */
const START = { x: -4.5, z: -41.5, face: [-20, -47] as [number, number] };
const FIRE: [number, number] = [-48, -41];

/** The lumber camp as Oakvale's enemies ticket counts it: 4 thugs, 2 archers, the leader. */
const LUMBER_CAMP: CampSpec = {
  name: 'Lumber camp',
  centre: { x: -48, z: -42 },
  ring: 12,
  posts: [
    { kind: 'grunt', x: -46.2, z: -39.6, face: FIRE },
    { kind: 'grunt', x: -50.2, z: -39.2, face: FIRE },
    { kind: 'grunt', x: -45.4, z: -42.8, face: FIRE },
    { kind: 'grunt', x: -53.2, z: -40.6, face: [-55, -38] },
    { kind: 'archer', x: -41.8, z: -43.6, face: [-30, -45.5] },
    { kind: 'archer', x: -43.2, z: -47.4, face: [-32, -47] },
    { kind: 'brute', x: -49.6, z: -43.6, face: [-44, -41] },
  ],
};

/** The same camp twice over, the second lot on a ring facing out: for the performance budget. */
const DOUBLED: CampSpec = {
  ...LUMBER_CAMP,
  posts: [
    ...LUMBER_CAMP.posts,
    ...(['grunt', 'archer', 'grunt', 'brute', 'grunt', 'archer', 'grunt'] as EnemyKind[]).map((kind, i) => {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const x = -48 + Math.cos(a) * 7.5;
      const z = -42 + Math.sin(a) * 7.5;
      return { kind, x, z, face: [x + Math.cos(a), z + Math.sin(a)] as [number, number] };
    }),
  ],
};

/** Two thugs walking the camp road between the camp's edge and the main road. */
const PATROL: CampSpec = {
  name: 'Road patrol',
  centre: { x: -24, z: -46 },
  ring: 0,
  posts: [
    { kind: 'grunt', x: 0, z: 0, face: [0, 1] },
    { kind: 'grunt', x: 0, z: 0, face: [0, 1] },
  ],
  route: [
    [-34.5, -43.6],
    [-28, -45.1],
    [-20, -47],
    [-12.5, -48.8],
  ],
};

const MARK: Partial<Record<Mind, { glyph: string; color: string }>> = {
  alert: { glyph: '?', color: '#ffd23a' },
  fight: { glyph: '!', color: '#ff4a3a' },
  home: { glyph: 'home', color: '#9fd8ff' },
};

const HELP = [
  'Left stick click: next way (starts over)',
  'Right stick click: double the camp (7 or 14)',
  'Hold left grip: this readout',
];

const _v = new Vector3();
const _w = new Vector3();

export async function startCampPrototype(
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

  const ground = zoneGround(map);
  const fight = new ZoneFight(scene, camera, renderer, ground);
  const startYaw = Math.atan2(-(START.face[0] - START.x), -(START.face[1] - START.z));
  fight.respawn(START.x, START.z, startYaw);

  const markers = new Markers();
  const spawn = (kind: EnemyKind, post: EnemyPost): Enemy => {
    // Posts sit clear of trunks and tents.
    _v.set(post.x, 0, post.z);
    ground.resolve(_v, 0.6);
    post.x = _v.x;
    post.z = _v.z;
    return fight.add(kind, post.x, post.z, post);
  };
  let doubled = params.has('double');
  const lumber = new Camp(doubled ? DOUBLED : LUMBER_CAMP, spawn);
  const patrol = new Camp(PATROL, spawn);
  const camps = [lumber, patrol];

  const senses: Senses = {
    player: fight.ctx.playerFeet,
    playerAlive: true,
    clearLine: (from) => ground.lineOfSight(from, fight.ctx.playerFeet),
  };

  let rules: Rules = RULES.find((r) => r.key === (params.get('camp') || 'A').toUpperCase()) ?? RULES[0];

  /** Everyone back at their posts and you back at the start. */
  function restart(): void {
    for (const c of camps) {
      for (const m of c.members) if (m.enemy) fight.remove(m.enemy);
    }
    lumber.fill(doubled ? DOUBLED : LUMBER_CAMP);
    patrol.fill();
    fight.respawn(START.x, START.z, startYaw);
    const query = new URLSearchParams(location.search);
    query.set('camp', rules.key);
    if (doubled) query.set('double', '');
    else query.delete('double');
    history.replaceState(null, '', `?${query.toString().replace(/=(?=&|$)/g, '')}${location.hash}`);
    bar.label.textContent = `${rules.key} · ${rules.name}${doubled ? ' · 14' : ''}`;
    showCard();
  }
  function nextRules(step: number): void {
    rules = RULES[(RULES.indexOf(rules) + step + RULES.length) % RULES.length];
    restart();
  }
  function toggleDouble(): void {
    doubled = !doubled;
    restart();
  }

  // The switch-over card, floating ahead for a few seconds.
  const card = new TextPanel(1.1);
  scene.add(card.mesh);
  let cardTime = 0;
  function showCard(): void {
    const i = RULES.indexOf(rules);
    card.draw([`${rules.key} · ${rules.name}   (${i + 1} of ${RULES.length})`, ...wrap(rules.how, 46), '', ...HELP]);
    cardTime = renderer.xr.isPresenting ? 8 : 0;
    camera.localToWorld(card.mesh.position.set(0, 0.15, -1.8));
    card.mesh.lookAt(camera.getWorldPosition(_v));
  }

  // The readout: over the left hand while you hold its grip, and on the page.
  const wrist = new TextPanel(0.36);
  scene.add(wrist.mesh);
  const page = document.createElement('pre');
  page.style.cssText =
    'position:fixed;left:16px;bottom:16px;z-index:10;margin:0;padding:10px 14px;border-radius:10px;' +
    'background:#111d;color:#e0d6c0;font:13px/1.45 ui-monospace,Menlo,monospace;pointer-events:none';
  document.body.appendChild(page);
  const bar = switcherBar(() => nextRules(1), () => nextRules(-1), toggleDouble);
  bar.label.textContent = `${rules.key} · ${rules.name}${doubled ? ' · 14' : ''}`;

  const perf = { frames: 0, time: 0, fps: 0, calls: 0, triangles: 0 };
  function readout(): string[] {
    const i = RULES.indexOf(rules);
    const lines = [`${rules.key} · ${rules.name}   (${i + 1} of ${RULES.length})`];
    for (const c of camps) {
      const parts: string[] = [];
      const fighting = c.count('fight') + c.count('alert');
      if (fighting) parts.push(`${fighting} after you`);
      if (c.count('home')) parts.push(`${c.count('home')} home`);
      if (c.count('idle')) parts.push(`${c.count('idle')} ${c.route ? 'walking' : 'waiting'}`);
      if (c.count('dead')) parts.push(`${c.count('dead')} down`);
      lines.push(`${c.name}: ${parts.join(', ')}`);
      if (c.refillIn !== null) {
        const s = Math.ceil(c.refillIn);
        lines.push(s > 0 ? `  refills in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `  refills once you're ${REFILL_AWAY} m off`);
      }
    }
    const d = Math.round(Math.hypot(senses.player.x - lumber.centre.x, senses.player.z - lumber.centre.z));
    lines.push(`You: ${d} m from the camp`, `Leash: ${rules.leash}`);
    lines.push(`${perf.fps} fps · ${perf.calls} draw calls · ${Math.round(perf.triangles / 1000)}k triangles`);
    return lines;
  }

  if (intro) {
    intro.innerHTML =
      '<h1>Oakvale: the lumber camp</h1>' +
      "A throwaway prototype: enemies living in the open instead of arriving in waves. The lumber camp's bandits wait round their fire " +
      '(skeletons stand in for them) and two more walk the camp road. You start on the main road where the camp road leaves it, heading west.<br>' +
      RULES.map((r) => `<b>${r.key} · ${r.name}</b>: ${r.how}`).join('<br>') +
      '<br>Over their heads: <b>?</b> noticed you, <b>!</b> after you, <b>home</b> giving up (untouchable). ' +
      'A cleared camp refills after a minute once you are 30 m off. Your health refills after 5 s out of the fight; die and you wake back at the start.<br>' +
      'In the headset: click the left stick for the next way, click the right stick to double the camp (7 or 14, for the frame rate), hold the left grip for the readout.';
  }
  renderer.xr.addEventListener('sessionstart', () => {
    intro?.style.setProperty('display', 'none');
    unlockAudio();
    const session = renderer.xr.getSession();
    if (session?.supportedFrameRates?.includes(72)) void session.updateTargetFrameRate?.(72).catch(() => {});
    fight.respawn(START.x, START.z, startYaw);
    showCard();
  });
  renderer.xr.addEventListener('sessionend', () => intro?.style.removeProperty('display'));
  addEventListener('pointerdown', unlockAudio, { once: true });
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyV') nextRules(1);
    if (e.code === 'KeyC') toggleDouble();
  });

  // Handle for poking from the console and for scripted checks.
  Object.assign(window, {
    __descent: {
      map,
      fight,
      camps,
      renderer,
      camera,
      device,
      perf,
      readout,
      restart,
      simulate,
      nextRules,
      toggleDouble,
      get rules() {
        return rules;
      },
      /** Stand at (x, z) without healing. */
      teleport: (x: number, z: number) => {
        fight.player.rig.position.set(x, ground.heightAt(x, z), z);
      },
    },
  });

  /** One step of the fight and the camps. */
  function simulate(dt: number): void {
    fight.update(dt);
    senses.playerAlive = fight.player.alive;
    for (const c of camps) c.update(dt, rules, senses);
    if (fight.deadFor !== null && fight.deadFor > 5) fight.respawn(START.x, START.z, startYaw);
    fight.hud.status.wave = 1;
    fight.hud.status.enemiesLeft = camps.reduce((n, c) => n + c.count('fight'), 0);
  }

  const clicks = { left: false, right: false };
  let pageTime = 0;
  const timer = new Timer();
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const raw = timer.getDelta();
    const dt = Math.min(raw, 1 / 30);
    const xr = renderer.xr.isPresenting;
    if (xr) {
      renderer.xr.updateCamera(camera);
      simulate(dt);

      const { left, right } = fight.player.input.hands;
      const l = !!left.source?.gamepad?.buttons[3]?.pressed;
      const r = !!right.source?.gamepad?.buttons[3]?.pressed;
      if (l && !clicks.left) nextRules(1);
      if (r && !clicks.right) toggleDouble();
      clicks.left = l;
      clicks.right = r;

      const grip = left.grip;
      wrist.mesh.visible = left.squeeze > 0.5 && grip.visible;
      if (wrist.mesh.visible) {
        grip.getWorldPosition(wrist.mesh.position).y += 0.3;
        wrist.mesh.lookAt(camera.getWorldPosition(_w));
      }
    } else wrist.mesh.visible = false;
    markers.update(camps);

    cardTime = Math.max(0, cardTime - dt);
    card.mesh.visible = cardTime > 0;

    perf.frames++;
    perf.time += raw;
    if (perf.time >= 1) {
      perf.fps = Math.round(perf.frames / perf.time);
      perf.frames = perf.time = 0;
    }
    pageTime -= dt;
    if (pageTime <= 0 || wrist.mesh.visible) {
      pageTime = 0.25;
      const lines = readout();
      page.textContent = lines.join('\n');
      if (wrist.mesh.visible) wrist.draw(lines);
    }

    map.update(dt, camera);
    renderer.render(scene, camera);
    perf.calls = renderer.info.render.calls;
    perf.triangles = renderer.info.render.triangles;
  });
}

/** A mark over each enemy's head that isn't simply waiting: ? noticed you, ! after you, home giving up. */
class Markers {
  private readonly materials = new Map<Mind, SpriteMaterial>();
  private readonly sprites = new Map<Enemy, Sprite>();

  constructor() {
    for (const [mind, m] of Object.entries(MARK) as [Mind, { glyph: string; color: string }][]) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 64;
      const c = canvas.getContext('2d')!;
      c.font = `bold ${m.glyph.length > 1 ? 34 : 56}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 8;
      c.strokeStyle = '#000';
      c.strokeText(m.glyph, 64, 34);
      c.fillStyle = m.color;
      c.fillText(m.glyph, 64, 34);
      const map = new CanvasTexture(canvas);
      map.colorSpace = SRGBColorSpace;
      this.materials.set(mind, new SpriteMaterial({ map, transparent: true, depthWrite: false }));
    }
  }

  update(camps: Camp[]): void {
    const seen = new Set<Enemy>();
    for (const c of camps) {
      for (const m of c.members) {
        const e = m.enemy;
        if (!e) continue;
        const mat = this.materials.get(m.mind);
        let sprite = this.sprites.get(e);
        if (!mat) {
          if (sprite) sprite.visible = false;
          continue;
        }
        if (!sprite) {
          sprite = new Sprite(mat);
          sprite.scale.set(0.56, 0.28, 1);
          sprite.position.y = e.healthBar.root.position.y + 0.32;
          e.root.add(sprite);
          this.sprites.set(e, sprite);
        }
        sprite.material = mat;
        sprite.visible = true;
        seen.add(e);
      }
    }
    for (const [e, s] of this.sprites) {
      if (seen.has(e)) continue;
      if (!e.alive || !e.root.parent) {
        e.root.remove(s);
        this.sprites.delete(e);
      } else s.visible = false;
    }
  }
}

/** Break a line into lines of at most `width` characters, at spaces. */
function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > width) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

/** The prototype's switcher on the page (the headset uses stick clicks). */
function switcherBar(next: () => void, prev: () => void, double: () => void): { label: HTMLElement } {
  const bar = document.createElement('div');
  bar.style.cssText =
    'position:fixed;top:16px;right:16px;z-index:10;display:flex;gap:12px;align-items:center;' +
    'padding:8px 14px;border-radius:999px;background:#111;color:#fff;font:600 14px system-ui,sans-serif;box-shadow:0 2px 12px #0008';
  const button = (text: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = 'background:#333;color:#fff;border:0;border-radius:999px;min-width:28px;height:28px;cursor:pointer;padding:0 8px';
    b.addEventListener('click', fn);
    return b;
  };
  const label = document.createElement('span');
  bar.append(button('◀', prev), label, button('▶', next), button('×2', double));
  document.body.appendChild(bar);
  return { label };
}
