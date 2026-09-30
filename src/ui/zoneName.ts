import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { CONFIG } from '../config';
import { Card } from './card';
import { HeadFollow } from './follow';

/** The name's pixels per metre: its letters are about 12 cm high. */
const PPM = 1000;
const SERIF = 'Georgia, "Times New Roman", serif';

/**
 * The zone's name, floating up a little above your eye line as you cross
 * into a zone and when you load in, as in WoW: gold letters edged in dark,
 * no panel. It comes up, holds a few seconds and fades, lagging your head
 * like the tracker. A card like the tracker's, so drawn with its shader.
 */
export class ZoneName {
  private readonly card = new Card(CONFIG.zoneName.size[0], CONFIG.zoneName.size[1], { ppm: PPM, overlay: true });
  private readonly follow = new HeadFollow(CONFIG.zoneName);
  /** Seconds since it came up; Infinity once it's gone. */
  private age = Infinity;
  private name: string | null = null;

  constructor() {
    this.card.mesh.name = 'zone-name';
    this.card.mesh.visible = false;
  }

  /** Add it to the scene. */
  get mesh() {
    return this.card.mesh;
  }

  /** The name floating now, if any: for checks. */
  get shown(): string | null {
    return this.card.mesh.visible ? this.name : null;
  }

  /** Float `name` up now, in place of whatever was there. */
  show(name: string): void {
    this.name = name;
    this.age = 0;
    this.follow.reset();
    this.card.paint(name, (c, w, h) => {
      c.font = `bold ${Math.round(h * 0.56)}px ${SERIF}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      c.lineWidth = h * 0.08;
      c.strokeStyle = 'rgba(20, 12, 4, 0.9)';
      c.strokeText(name, w / 2, h / 2, w * 0.96);
      c.fillStyle = '#ffd98a';
      c.fillText(name, w / 2, h / 2, w * 0.96);
    });
  }

  /** Compile its shader now, rather than in the frame it first comes up. */
  warm(renderer: WebGLRenderer, camera: PerspectiveCamera, scene: Scene): void {
    const { mesh } = this.card;
    mesh.visible = true;
    renderer.compile(mesh, camera, scene);
    mesh.visible = false;
  }

  /** Come up, hold and fade, following your head. */
  update(dt: number, camera: PerspectiveCamera): void {
    const { fadeIn, hold, fadeOut } = CONFIG.zoneName;
    const { mesh } = this.card;
    this.age += dt;
    mesh.visible = this.age < fadeIn + hold + fadeOut;
    if (!mesh.visible) return;
    const t = this.age;
    mesh.material.opacity = t < fadeIn ? t / fadeIn : 1 - Math.max(0, (t - fadeIn - hold) / fadeOut);
    this.follow.place(mesh, camera, dt);
  }
}
