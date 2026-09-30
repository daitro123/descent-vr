import type { Camera } from 'three';
import type { Tracked } from '../adventureState';
import { CONFIG } from '../config';
import { Card, FONT, roundRect } from './card';
import { HeadFollow } from './follow';

/**
 * The quests you're on, at the top left of your view: the talk prototype's
 * variant C (in history at merge 19ce545). It lags your head a little so it
 * drifts rather than sticks, shows each quest's title in gold and a line per
 * objective with its count (or "Return to Marshal Hale"), the newest at the
 * bottom, flashes when you take a quest, make progress or finish, and is gone
 * while you have no quest. The quest arrow sits at the left of the line
 * you're working on in the newest quest, pointing its way: up is straight ahead.
 */
/** The tracker's pixels per metre, and where its lines sit (px): the first title's top, each objective's top below its title, the gap between them and how far in they start, and the gap before the next quest's title. */
const PPM = 1600;
const TITLE = { x: 22, y: 16 };
const LINES = { x: 62, y: 70, gap: 42, font: 34 };
const QUEST_GAP = 18;
/** The card's size (m): its backing is as tall as one quest's, and grows down for more, up to three quests of two objectives. */
const SIZE = { w: 0.46, h: 0.17, most: 0.32 };
/** The quest arrow's middle, across from the tracker's left edge (px), in the room the lines leave for it. */
const ARROW_X = 36;

/** Where the quest arrow is on the tracker: beside which line, and how far round from pointing up (rad, positive to the left). */
export interface ArrowShown {
  readonly line: number;
  readonly turn: number;
}

export class QuestTracker {
  private readonly card = new Card(SIZE.w, SIZE.most, { ppm: PPM, overlay: true });
  /** The quest arrow: a small gold arrow drawn once, turned on the tracker as you turn; a card like the tracker, so drawn with its shader. */
  private readonly arrow = new Card(CONFIG.tracker.arrow.size, CONFIG.tracker.arrow.size, { ppm: 3000, overlay: true });
  /** Where it floats in your view, lagging your head. */
  private readonly follow = new HeadFollow(CONFIG.tracker);
  private flashFor = 0;

  constructor() {
    this.card.mesh.name = 'quest-tracker';
    // Its top where one quest's card had it, so more quests grow it down.
    this.card.mesh.geometry.translate(0, (SIZE.h - SIZE.most) / 2, 0);
    this.card.mesh.visible = false;
    const { mesh } = this.arrow;
    mesh.name = 'quest-arrow';
    mesh.renderOrder = this.card.mesh.renderOrder + 1;
    mesh.visible = false;
    this.card.mesh.add(mesh);
    this.arrow.paint('arrow', (c, w, h) => {
      // Pointing up: a head and a short stem, gold edged in dark so it reads over the sky and the grass.
      c.beginPath();
      c.moveTo(w * 0.5, h * 0.08);
      c.lineTo(w * 0.88, h * 0.52);
      c.lineTo(w * 0.64, h * 0.52);
      c.lineTo(w * 0.64, h * 0.92);
      c.lineTo(w * 0.36, h * 0.92);
      c.lineTo(w * 0.36, h * 0.52);
      c.lineTo(w * 0.12, h * 0.52);
      c.closePath();
      c.lineJoin = 'round';
      c.lineWidth = w * 0.1;
      c.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      c.stroke();
      c.fillStyle = '#ffd23a';
      c.fill();
    });
  }


  /** Add it to the scene. */
  get mesh() {
    return this.card.mesh;
  }

  /** Something changed: flash for a moment. */
  flash(): void {
    this.flashFor = CONFIG.tracker.flash;
  }

  /** Follow your head, show the quests you're on (oldest first), and the arrow beside the newest's line if it's shown. */
  update(dt: number, camera: Camera, tracker: readonly Tracked[], arrow: ArrowShown | null = null): void {
    const { mesh } = this.card;
    mesh.visible = tracker.length > 0;
    const tops = titleTops(tracker);
    this.placeArrow(arrow, tops.at(-1));
    this.flashFor = Math.max(0, this.flashFor - dt);
    if (!tracker.length) {
      this.follow.reset();
      return;
    }
    this.follow.place(mesh, camera, dt);

    const flash = this.flashFor > 0 && Math.floor(this.flashFor * 5) % 2 === 0;
    const key = tracker.map((q) => `${q.title}|${q.lines.join('|')}`).join('||');
    this.card.paint(`${key}|${flash}`, (c, w) => {
      // As tall as one quest's card, or down past the last line.
      const last = tops.at(-1)! + LINES.y - TITLE.y + (tracker.at(-1)!.lines.length - 1) * LINES.gap + LINES.font;
      c.fillStyle = flash ? 'rgba(90, 70, 20, 0.6)' : 'rgba(10, 10, 14, 0.45)';
      roundRect(c, 0, 0, w, Math.max(SIZE.h * PPM, last + TITLE.y + QUEST_GAP), 20);
      c.fill();
      c.shadowColor = 'rgba(0, 0, 0, 0.9)';
      c.shadowBlur = 8;
      c.textBaseline = 'top';
      tracker.forEach((quest, k) => {
        c.fillStyle = '#ffd23a';
        c.font = `bold 40px ${FONT}`;
        c.fillText(quest.title, TITLE.x, tops[k], w - 2 * TITLE.x);
        c.font = `${LINES.font}px ${FONT}`;
        c.fillStyle = '#ffffff';
        const first = tops[k] + LINES.y - TITLE.y;
        quest.lines.forEach((line, i) => c.fillText(line, LINES.x, first + i * LINES.gap, w - LINES.x - TITLE.x));
      });
      c.shadowBlur = 0;
    });
  }

  /** The arrow at the left of its line in the quest whose title's top is `top` (px), turned its way; hidden when it isn't shown. */
  private placeArrow(arrow: ArrowShown | null, top: number | undefined): void {
    const { mesh } = this.arrow;
    mesh.visible = arrow !== null && top !== undefined;
    if (!arrow || top === undefined) return;
    const y = top + LINES.y - TITLE.y + arrow.line * LINES.gap + LINES.font / 2;
    mesh.position.set(-SIZE.w / 2 + ARROW_X / PPM, SIZE.h / 2 - y / PPM, 0);
    mesh.rotation.z = arrow.turn;
  }
}

/** Where each quest's title's top sits on the tracker (px): one under another, a line's gap apart plus a little. */
function titleTops(tracker: readonly Tracked[]): number[] {
  const tops: number[] = [];
  let top = TITLE.y;
  for (const quest of tracker) {
    tops.push(top);
    top += LINES.y - TITLE.y + (quest.lines.length - 1) * LINES.gap + LINES.font + QUEST_GAP;
  }
  return tops;
}
