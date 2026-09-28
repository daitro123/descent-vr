import { Group, Vector3 } from 'three';
import { Card, FONT, roundRect, wrap } from './card';
import type { Act, QuestEvent, Talk } from './quest';
import { distToHale, gazeAtHale, type Variant, type VariantContext } from './variant';

// PROTOTYPE, variant C "Talk": no markers and no windows. Hale waves and calls
// out when they have something for you; walk up and look at them and they
// speak, a line at a time, in a bubble over their head. Nod to say yes, shake
// your head for no (A and B work too). Handing in happens as you talk. Your
// quest floats in the top left of your view, trailing your head, WoW-style.

const TALK_DIST = 2.6;
const LEAVE_DIST = 3.6;
const BARK_DIST = 12;

type State = 'idle' | 'talking' | 'asking';

/** Turning points of a signal with some hysteresis: the building block of nods and shakes. */
class ZigZag {
  private dir = 0;
  private ext = 0;
  private extT = 0;
  private readonly marks: { v: number; t: number; hi: boolean }[] = [];
  value = 0;

  constructor(private readonly h: number) {}

  reset(v: number, t: number): void {
    this.dir = 0;
    this.ext = this.value = v;
    this.extT = t;
    this.marks.length = 0;
  }

  push(v: number, t: number): void {
    this.value = v;
    if (this.dir >= 0 && v < this.ext - this.h) this.turn(true, -1, v, t);
    else if (this.dir <= 0 && v > this.ext + this.h) this.turn(false, 1, v, t);
    else if ((this.dir > 0 && v > this.ext) || (this.dir < 0 && v < this.ext)) {
      this.ext = v;
      this.extT = t;
    }
  }

  /** The running extreme was a peak (`hi`) or a trough; now heading the other way. */
  private turn(hi: boolean, dir: number, v: number, t: number): void {
    this.marks.push({ v: this.ext, t: this.extT, hi });
    if (this.marks.length > 6) this.marks.shift();
    this.dir = dir;
    this.ext = v;
    this.extT = t;
  }

  /** Down by `amp` and back up by `back` (a nod), bottoming out within the last `window` seconds. */
  dipped(amp: number, back: number, now: number, window: number): boolean {
    const n = this.marks.length;
    if (n < 2 || this.dir <= 0) return false;
    const [a, b] = [this.marks[n - 2], this.marks[n - 1]];
    return a.hi && !b.hi && now - b.t <= window && a.v - b.v >= amp && this.ext - b.v >= back;
  }

  /** How many back-and-forth legs of at least `amp` ended in the last `window` seconds, the current one included. */
  swings(amp: number, now: number, window: number): number {
    const pts = [...this.marks, { v: this.ext, t: now }];
    let n = 0;
    for (let i = 1; i < pts.length; i++) if (now - pts[i].t <= window && Math.abs(pts[i].v - pts[i - 1].v) >= amp) n++;
    return n;
  }

  range(now: number, window: number): number {
    const pts = this.marks.filter((m) => now - m.t <= window).map((m) => m.v);
    pts.push(this.value, this.ext);
    return Math.max(...pts) - Math.min(...pts);
  }
}

const _f = new Vector3();
const _t = new Vector3();

export class TalkVariant implements Variant {
  readonly key = 'C';
  readonly name = 'Talk';
  readonly how = 'Walk up and look at Hale to talk. Nod for yes, shake your head for no. Your quest floats top left.';
  readonly root = new Group();
  private readonly bubble = new Card(1.1, 0.5, { ppm: 1200 });
  private readonly hud = new Card(0.36, 0.17, { ppm: 1600, overlay: true });
  private readonly hudDir = new Vector3(0, 0, -1);
  private state: State = 'idle';
  private talk: Talk | null = null;
  private line = 0;
  private lineTime = 0;
  private gazeTime = 0;
  private needLeave = false;
  private bark = '';
  private barkTime = 0;
  private barkCooldown = 2;
  private hudFlash = 0;
  private time = 0;
  private readonly pitch = new ZigZag(3);
  private readonly yaw = new ZigZag(3);
  private lastYaw = 0;
  private readonly lastTrigger = { left: 0, right: 0 };

  constructor(private readonly ctx: VariantContext) {
    this.root.add(this.bubble.mesh, this.hud.mesh);
    this.bubble.opacity = 0;
  }

  update(dt: number): void {
    const { ctx } = this;
    this.time += dt;
    const dist = distToHale(ctx);
    if (dist > LEAVE_DIST) this.needLeave = false;
    const skip = this.triggerPulled() || ctx.keys.talk;
    this.trackHead();

    switch (this.state) {
      case 'idle': {
        this.barkCooldown -= dt;
        this.barkTime -= dt;
        const mood = ctx.book.mood();
        if (mood !== 'waiting' && dist < BARK_DIST && dist > TALK_DIST + 0.5 && this.barkCooldown <= 0) {
          ctx.hale.wave();
          this.bark = mood === 'ready' ? 'Back already? Come here!' : 'You there! A word?';
          this.barkTime = 3;
          this.barkCooldown = 15;
        }
        this.gazeTime = dist < TALK_DIST && gazeAtHale(ctx) < 15 ? this.gazeTime + dt : 0;
        if (!this.needLeave && (this.gazeTime > 0.35 || (ctx.keys.talk && dist < 6))) this.start();
        break;
      }
      case 'talking':
        if (dist > LEAVE_DIST + 1) this.end();
        else if ((this.lineTime -= dt) <= 0 || skip) this.nextLine();
        break;
      case 'asking': {
        if (dist > LEAVE_DIST + 1) {
          this.end();
          break;
        }
        const { left, right } = ctx.input.hands;
        // A nod: down and back up. A shake: left, right and back (three legs).
        const nod = this.pitch.dipped(7, 5, this.time, 1.2) && this.yaw.range(this.time, 1.2) < 12;
        const shake = this.yaw.swings(9, this.time, 1.6) >= 3 && this.pitch.range(this.time, 1.6) < 12;
        if (nod || left.primaryPressed || right.primaryPressed || ctx.keys.choice === 0) this.answer('accept');
        else if (shake || left.secondaryPressed || right.secondaryPressed || ctx.keys.choice === 1) this.answer('decline');
        break;
      }
    }
    this.drawBubble(dt);
    this.updateHud(dt);
  }

  onQuest(e: QuestEvent): void {
    if (e.kind === 'progress' || e.kind === 'ready' || e.kind === 'accepted') this.hudFlash = 1.5;
  }

  private start(): void {
    const { book } = this.ctx;
    this.barkTime = 0;
    if (book.mood() === 'ready') {
      // Handing in is part of talking: no button for it.
      const hello = book.talk().lines;
      const next = book.answer('handIn');
      this.talk = next ? { ...next, lines: [...hello, ...next.lines] } : { lines: hello, choices: [] };
    } else this.talk = book.talk();
    this.state = 'talking';
    this.line = -1;
    this.nextLine();
  }

  private nextLine(): void {
    const talk = this.talk!;
    this.line++;
    if (this.line < talk.lines.length) {
      this.lineTime = 1.4 + talk.lines[this.line].length * 0.05;
      return;
    }
    this.line = talk.lines.length - 1;
    if (talk.choices.some((c) => c.act === 'accept')) {
      this.state = 'asking';
      this.pitch.reset(this.pitch.value, this.time);
      this.yaw.reset(this.yaw.value, this.time);
    } else this.end();
  }

  private answer(act: Act): void {
    this.ctx.input.pulse('right', 0.5, 40);
    const next = this.ctx.book.answer(act);
    if (!next) return this.end();
    this.talk = next;
    this.state = 'talking';
    this.line = -1;
    this.nextLine();
  }

  private end(): void {
    this.state = 'idle';
    this.talk = null;
    this.needLeave = true;
    this.gazeTime = 0;
  }

  private triggerPulled(): boolean {
    let pulled = false;
    for (const hand of ['left', 'right'] as const) {
      const v = this.ctx.input.hands[hand].trigger;
      if (v > 0.7 && this.lastTrigger[hand] <= 0.7) pulled = true;
      this.lastTrigger[hand] = v;
    }
    return pulled;
  }

  /** Head pitch and yaw in the rig's space, in degrees, fed to the nod and shake detectors. */
  private trackHead(): void {
    _f.set(0, 0, -1).applyQuaternion(this.ctx.camera.quaternion);
    const pitch = (Math.asin(Math.max(-1, Math.min(1, _f.y))) * 180) / Math.PI;
    let yaw = (Math.atan2(-_f.x, -_f.z) * 180) / Math.PI;
    // Unwrap so a turn through ±180° doesn't look like a shake.
    while (yaw - this.lastYaw > 180) yaw -= 360;
    while (yaw - this.lastYaw < -180) yaw += 360;
    this.lastYaw = yaw;
    this.pitch.push(pitch, this.time);
    this.yaw.push(yaw, this.time);
  }

  private drawBubble(dt: number): void {
    const { ctx } = this;
    const hale = ctx.hale;
    const text = this.talk ? this.talk.lines[Math.max(0, this.line)] : this.barkTime > 0 ? this.bark : '';
    const asking = this.state === 'asking';
    const want = text ? 1 : 0;
    this.bubble.opacity += Math.sign(want - this.bubble.opacity) * Math.min(Math.abs(want - this.bubble.opacity), dt * 5);
    if (!this.bubble.mesh.visible) return;
    // Grow with distance so a bark reads from down the road; the tail stays on Hale's head.
    const scale = Math.max(1, Math.min(4, distToHale(ctx) / 2.5));
    this.bubble.mesh.scale.setScalar(scale);
    this.bubble.mesh.position.set(hale.position.x, hale.position.y + hale.headY + 0.2 + 0.25 * scale, hale.position.z);
    this.bubble.mesh.lookAt(ctx.head);
    if (!text) return;
    this.bubble.paint(`${text}${asking}${this.talk ? this.line : 'bark'}`, (c, w, h) => {
      c.font = `bold 44px ${FONT}`;
      const lines = wrap(c, text, w - 110);
      const extra = asking ? 2 : 0;
      const bh = Math.min(h - 40, 44 + (lines.length + extra) * 52);
      const top = h - 40 - bh;
      c.fillStyle = 'rgba(250, 246, 236, 0.96)';
      roundRect(c, 20, top, w - 40, bh, 36);
      c.fill();
      c.beginPath();
      c.moveTo(w / 2 - 26, h - 42);
      c.lineTo(w / 2, h - 4);
      c.lineTo(w / 2 + 26, h - 42);
      c.fill();
      c.fillStyle = '#231a10';
      c.textAlign = 'center';
      c.textBaseline = 'top';
      lines.forEach((line, i) => c.fillText(line, w / 2, top + 24 + i * 52));
      if (asking) {
        const y = top + 24 + lines.length * 52 + 6;
        c.fillStyle = '#2f6a2a';
        c.font = `bold 42px ${FONT}`;
        c.fillText('Nod: yes     Shake your head: not now', w / 2, y);
        c.fillStyle = '#8a7a60';
        c.font = `32px ${FONT}`;
        c.fillText('(or press A / B)', w / 2, y + 52);
      }
    });
  }

  /** Top left of the view, lagging the head a little so it floats rather than sticks. */
  private updateHud(dt: number): void {
    const { ctx } = this;
    const q = ctx.book.tracked;
    this.hud.mesh.visible = !!q;
    if (!q) return;
    ctx.camera.getWorldQuaternion(this.hud.mesh.quaternion);
    _t.set(-0.4, 0.24, -1).normalize().applyQuaternion(this.hud.mesh.quaternion);
    this.hudDir.lerp(_t, Math.min(1, dt * 3)).normalize();
    this.hud.mesh.position.copy(ctx.head).addScaledVector(this.hudDir, 1.1);
    this.hud.mesh.lookAt(ctx.head);
    this.hudFlash = Math.max(0, this.hudFlash - dt);
    const flash = this.hudFlash > 0 && Math.floor(this.hudFlash * 5) % 2 === 0;
    this.hud.paint(`${q.title}${q.state}${q.objectives.map((o) => o.have).join()}${flash}`, (c, w, h) => {
      c.fillStyle = flash ? 'rgba(90, 70, 20, 0.6)' : 'rgba(10, 10, 14, 0.45)';
      roundRect(c, 0, 0, w, h, 20);
      c.fill();
      c.shadowColor = 'rgba(0, 0, 0, 0.9)';
      c.shadowBlur = 8;
      c.textBaseline = 'top';
      c.fillStyle = '#ffd23a';
      c.font = `bold 40px ${FONT}`;
      c.fillText(q.title, 22, 16, w - 44);
      c.font = `34px ${FONT}`;
      c.fillStyle = '#ffffff';
      const lines =
        q.state === 'ready' ? ['Return to Marshal Hale'] : q.objectives.map((o) => `- ${o.text}: ${o.have}/${o.need}`);
      lines.forEach((line, i) => c.fillText(line, 22, 70 + i * 42, w - 44));
      c.shadowBlur = 0;
    });
  }
}
