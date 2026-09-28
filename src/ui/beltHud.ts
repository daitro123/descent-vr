import {
  BackSide,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  type PerspectiveCamera,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { CONFIG } from '../config';
import type { Player } from '../player/player';

const W = 64;
const H = 24;
const _head = new Vector3();
const _fwd = new Vector3();

// A 5-row pixel font for the few glyphs the HUD needs: crisp at any distance,
// unlike a canvas font at this size. Most glyphs are 3 wide; W needs 5.
const GLYPHS: Record<string, string> = {
  '0': '111101101101111',
  '1': '010110010010111',
  '2': '111001111100111',
  '3': '111001111001111',
  '4': '101101111001001',
  '5': '111100111001111',
  '6': '111100111101111',
  '7': '111001001010010',
  '8': '111101111101111',
  '9': '111101111001111',
  W: '1000110001101011010101010',
  B: '110101110101110',
  O: '111101101101111',
  S: '111100111001111',
};

/** Hud status the game provides each frame. */
export interface HudStatus {
  wave: number;
  enemiesLeft: number;
  boss: boolean;
}

/**
 * Diablo's health and resource orbs, body-locked at belt height: glance down
 * to read them. Follows head yaw only, so it does not swim when you look around.
 * Between the orbs: the dash cooldown and frenzy, and in the arena the wave
 * and the enemies left.
 *
 * Also owns the head-locked vignette: red when hurt (and pulsing at low HP),
 * dark during a dash to cut peripheral motion.
 */
export class BeltHud {
  readonly root = new Group();
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private readonly vignette: ShaderMaterial;
  private readonly vignetteMesh: Mesh;
  private lastKey = '';
  private hurtTimer = 0;
  private dashTimer = 0;
  private time = 0;
  private yaw = 0;
  readonly status: HudStatus = { wave: 0, enemiesLeft: 0, boss: false };
  private readonly waves: boolean;

  constructor(
    private readonly player: Player,
    camera: PerspectiveCamera,
    /** `waves`: the arena's wave and enemies left; the Adventure has neither. */
    { waves = true } = {},
  ) {
    this.waves = waves;
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.magFilter = this.texture.minFilter = NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = SRGBColorSpace;

    const panel = new Mesh(
      new PlaneGeometry(0.42, 0.1575),
      new MeshBasicMaterial({ map: this.texture, transparent: true }),
    );
    panel.rotation.x = -0.9; // tilt up toward the eyes
    this.root.add(panel);

    this.vignette = new ShaderMaterial({
      uniforms: { uColor: { value: new Color() }, uStrength: { value: 0 }, uInner: { value: 0.3 } },
      vertexShader: /* glsl */ `
        varying vec3 vView;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      // Transparent in the middle of the view, strongest at the edges.
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uStrength;
        uniform float uInner;
        varying vec3 vView;
        void main() {
          float off = 1.0 + normalize(vView).z; // 0 straight ahead, 1 at 90 degrees
          gl_FragColor = vec4(uColor, smoothstep(uInner, uInner + 0.45, off) * uStrength);
        }`,
      side: BackSide,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.vignetteMesh = new Mesh(new SphereGeometry(0.3, 12, 8), this.vignette);
    this.vignetteMesh.renderOrder = 20;
    this.vignetteMesh.visible = false;
    camera.add(this.vignetteMesh);
    player.onDash = () => (this.dashTimer = CONFIG.dash.time + 0.08);
  }

  flashHurt(): void {
    this.hurtTimer = 0.4;
  }

  update(dt: number): void {
    this.time += dt;
    const cam = this.player.camera;
    cam.getWorldPosition(_head);
    cam.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() > 1e-6) {
      const target = Math.atan2(_fwd.x, _fwd.z);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      // Lazy follow: only swing round when you turn well away.
      if (Math.abs(d) > 0.6) this.yaw += d * Math.min(1, dt * 4);
    }
    this.root.position.set(
      _head.x + Math.sin(this.yaw) * 0.38,
      Math.max(0.4, _head.y - 0.62),
      _head.z + Math.cos(this.yaw) * 0.38,
    );
    this.root.rotation.set(0, this.yaw + Math.PI, 0);

    this.updateVignette(dt);
    this.redraw();
  }

  private updateVignette(dt: number): void {
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    const hp = this.player.hp / this.player.maxHp;
    const low = this.player.alive && hp < 0.3 ? 0.25 + 0.15 * Math.sin(this.time * 5) : 0;
    const hurt = Math.max(this.hurtTimer * 2, low);
    const u = this.vignette.uniforms;
    if (this.dashTimer > 0) {
      u.uColor.value.setRGB(0, 0, 0);
      u.uStrength.value = 0.85;
      u.uInner.value = 0.15;
    } else {
      u.uColor.value.setRGB(0.7, 0, 0);
      u.uStrength.value = Math.min(0.8, hurt);
      u.uInner.value = 0.3 - Math.min(0.2, this.hurtTimer * 0.4);
    }
    this.vignetteMesh.visible = u.uStrength.value > 0.01;
  }

  private redraw(): void {
    const p = this.player;
    const hp = p.hp / p.maxHp;
    const rage = p.rage / CONFIG.player.maxRage;
    const dash = 1 - p.dashCooldown / CONFIG.dash.cooldown;
    const s = this.status;
    const frenzyBlink = p.frenzy > 0 && (p.frenzy > 2 || Math.sin(this.time * 12) > 0);
    const key = [
      Math.round(hp * 18),
      Math.round(rage * 18),
      Math.round(dash * 12),
      frenzyBlink,
      s.wave,
      s.enemiesLeft,
      s.boss,
    ].join(':');
    if (key === this.lastKey) return;
    this.lastKey = key;

    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(10,8,8,0.55)';
    if (this.waves) c.fillRect(20, 2, 24, 20);
    else c.fillRect(20, 15, 24, 7);
    this.orb(10, hp, '#c81e1e', '#3a0c0c');
    const warCry = rage >= CONFIG.warCry.cost / CONFIG.player.maxRage;
    const slam = rage >= CONFIG.groundSlam.cost / CONFIG.player.maxRage;
    this.orb(W - 11, rage, p.frenzy > 0 ? '#ff5a10' : warCry ? '#ffb020' : '#b86a10', '#2e1a06');

    if (this.waves) {
      // Wave (or BOSS), then a skull and the enemies left.
      const top = s.boss ? 'BOSS' : `W${s.wave}`;
      this.text(top, Math.round(32 - (this.textWidth(top) - 1) / 2), 4, '#e0c080');
      this.skull(24, 11);
      this.text(String(Math.min(99, s.enemiesLeft)), 31, 11, '#d0c8b8');
    }
    // Dash cooldown bar.
    c.fillStyle = '#2a2622';
    c.fillRect(22, 18, 20, 2);
    c.fillStyle = dash >= 1 ? '#9fd8ff' : '#4a6a80';
    c.fillRect(22, 18, Math.round(20 * Math.min(1, dash)), 2);
    // Ability pips under the rage orb: slam (35) and War Cry (50).
    c.fillStyle = slam ? '#ffd060' : '#3a3228';
    c.fillRect(W - 15, 21, 3, 2);
    c.fillStyle = warCry ? '#ffd060' : '#3a3228';
    c.fillRect(W - 10, 21, 3, 2);
    if (frenzyBlink) {
      c.fillStyle = '#ff7a20';
      c.fillRect(W - 12, 0, 2, 2);
    }
    this.texture.needsUpdate = true;
  }

  private textWidth(str: string): number {
    return [...str].reduce((w, ch) => w + (GLYPHS[ch] ?? '000').length / 5 + 1, 0);
  }

  private text(str: string, x: number, y: number, color: string): void {
    const c = this.ctx;
    c.fillStyle = color;
    for (const ch of str) {
      const g = GLYPHS[ch] ?? '000000000000000';
      const w = g.length / 5;
      for (let i = 0; i < g.length; i++) if (g[i] === '1') c.fillRect(x + (i % w), y + Math.floor(i / w), 1, 1);
      x += w + 1;
    }
  }

  private skull(x: number, y: number): void {
    const rows = ['01110', '11111', '10101', '11111', '01010'];
    const c = this.ctx;
    c.fillStyle = '#d9cfb0';
    rows.forEach((row, j) => [...row].forEach((b, i) => b === '1' && c.fillRect(x + i, y + j, 1, 1)));
  }

  private orb(cx: number, fill: number, full: string, empty: string): void {
    const r = 9;
    const c = this.ctx;
    const cy = H / 2;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = x * x + y * y;
        if (d > r * r) continue;
        const level = (r - y) / (2 * r); // 0 bottom … 1 top
        const rim = d > (r - 1) * (r - 1);
        const shine = x === -4 && (y === -5 || y === -4);
        c.fillStyle = rim ? '#8a7a5a' : shine && level <= fill ? '#ffffff' : level <= fill ? full : empty;
        c.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  }
}
