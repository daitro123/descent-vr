import { type Camera, Quaternion, Vector3 } from 'three';
import type { Tracker } from '../adventureState';
import { CONFIG } from '../config';
import { Card, FONT, roundRect } from './card';

const _head = new Vector3();
const _want = new Vector3();
const _q = new Quaternion();

/**
 * The quest you're on, at the top left of your view: the talk prototype's
 * variant C (in history at merge 19ce545). It lags your head a little so it
 * drifts rather than sticks, shows the title in gold and a line per objective
 * with its count (or "Return to Marshal Hale"), flashes when you take a
 * quest, make progress or finish, and is gone while you have no quest.
 */
export class QuestTracker {
  private readonly card = new Card(0.46, 0.17, { ppm: 1600, overlay: true });
  /** Where it floats from your eyes, lagging where it wants to be. */
  private readonly dir = new Vector3();
  private placed = false;
  private flashFor = 0;

  constructor() {
    this.card.mesh.name = 'quest-tracker';
    this.card.mesh.visible = false;
  }

  /** Add it to the scene. */
  get mesh() {
    return this.card.mesh;
  }

  /** Something changed: flash for a moment. */
  flash(): void {
    this.flashFor = CONFIG.tracker.flash;
  }

  update(dt: number, camera: Camera, tracker: Tracker | null): void {
    const T = CONFIG.tracker;
    const { mesh } = this.card;
    mesh.visible = tracker !== null;
    this.flashFor = Math.max(0, this.flashFor - dt);
    if (!tracker) {
      this.placed = false;
      return;
    }
    camera.getWorldPosition(_head);
    _want.set(...T.direction).normalize().applyQuaternion(camera.getWorldQuaternion(_q));
    if (this.placed) this.dir.lerp(_want, Math.min(1, dt * T.lag)).normalize();
    else this.dir.copy(_want);
    this.placed = true;
    mesh.position.copy(_head).addScaledVector(this.dir, T.distance);
    mesh.lookAt(_head);

    const flash = this.flashFor > 0 && Math.floor(this.flashFor * 5) % 2 === 0;
    this.card.paint(`${tracker.title}|${tracker.lines.join('|')}|${flash}`, (c, w, h) => {
      c.fillStyle = flash ? 'rgba(90, 70, 20, 0.6)' : 'rgba(10, 10, 14, 0.45)';
      roundRect(c, 0, 0, w, h, 20);
      c.fill();
      c.shadowColor = 'rgba(0, 0, 0, 0.9)';
      c.shadowBlur = 8;
      c.textBaseline = 'top';
      c.fillStyle = '#ffd23a';
      c.font = `bold 40px ${FONT}`;
      c.fillText(tracker.title, 22, 16, w - 44);
      c.font = `34px ${FONT}`;
      c.fillStyle = '#ffffff';
      tracker.lines.forEach((line, i) => c.fillText(line, 36, 70 + i * 42, w - 58));
      c.shadowBlur = 0;
    });
  }
}
