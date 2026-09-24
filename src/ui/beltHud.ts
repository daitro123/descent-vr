import {
  BackSide,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  type PerspectiveCamera,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { CONFIG } from '../config';
import type { Player } from '../player/player';

const W = 48;
const H = 20;
const _head = new Vector3();
const _fwd = new Vector3();

/**
 * Diablo's health and resource orbs, body-locked at belt height: glance down
 * to read them. Follows head yaw only, so it does not swim when you look around.
 * Also owns the red "you got hit" flash around the head.
 */
export class BeltHud {
  readonly root = new Group();
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private readonly hurtMat = new MeshBasicMaterial({
    color: 0xff0000,
    side: BackSide,
    transparent: true,
    opacity: 0,
    depthTest: false,
  });
  private lastKey = '';
  private hurtTimer = 0;
  private yaw = 0;

  constructor(
    private readonly player: Player,
    camera: PerspectiveCamera,
  ) {
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.magFilter = this.texture.minFilter = NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = SRGBColorSpace;

    const panel = new Mesh(
      new PlaneGeometry(0.36, 0.15),
      new MeshBasicMaterial({ map: this.texture, transparent: true }),
    );
    panel.rotation.x = -0.9; // tilt up toward the eyes
    this.root.add(panel);

    const hurt = new Mesh(new SphereGeometry(0.3, 8, 6), this.hurtMat);
    hurt.renderOrder = 20;
    camera.add(hurt);
  }

  flashHurt(): void {
    this.hurtTimer = 0.35;
  }

  update(dt: number): void {
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

    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.hurtMat.opacity = this.hurtTimer * 1.2;

    this.redraw();
  }

  private redraw(): void {
    const hp = this.player.hp / CONFIG.player.maxHp;
    const rage = this.player.rage / CONFIG.player.maxRage;
    const key = `${Math.round(hp * 16)}:${Math.round(rage * 16)}:${rage >= CONFIG.ability.cost / CONFIG.player.maxRage}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    this.orb(10, hp, '#c81e1e', '#3a0c0c');
    const ready = rage >= CONFIG.ability.cost / CONFIG.player.maxRage;
    this.orb(W - 10, rage, ready ? '#ffb020' : '#b86a10', '#2e1a06');
    // Ability-ready pip between the orbs.
    c.fillStyle = ready ? '#ffe070' : '#333';
    c.fillRect(W / 2 - 2, H / 2 - 2, 4, 4);
    this.texture.needsUpdate = true;
  }

  private orb(cx: number, fill: number, full: string, empty: string): void {
    const r = 8;
    const c = this.ctx;
    const cy = H / 2;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = x * x + y * y;
        if (d > r * r) continue;
        const level = (r - y) / (2 * r); // 0 bottom … 1 top
        c.fillStyle = d > (r - 1) * (r - 1) ? '#8a7a5a' : level <= fill ? full : empty;
        c.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  }
}
