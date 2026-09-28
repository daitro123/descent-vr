import { BoxGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three';
import { closestSegmentSegment } from '../../combat/geometry';
import type { Handedness } from '../../player/input';
import { Card, FONT, Marker, roundRect, wrap } from './card';
import type { QuestEvent, Talk } from './quest';
import { type Variant, type VariantContext } from './variant';

// PROTOTYPE, variant B "Point": point a controller at Hale and pull the
// trigger; a quest window opens in front of you, and you pick with the ray.
// Your quest sits on your belt (glance down), and toasts float up in view as
// it changes. Gold "!" and "?" over Hale.

const REACH = 15;
const PANEL = { w: 0.9, h: 0.62, ppm: 1300 };
const BTN = { w: 300, h: 84 };

interface Hit {
  t: number;
  /** Button index under the ray, or -1. */
  button: number;
  target: 'panel' | 'hale';
}

const _o = new Vector3();
const _d = new Vector3();
const _end = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _inv = new Matrix4();
const _seg = { distance: 0, pointA: new Vector3(), pointB: new Vector3() };

export class PointVariant implements Variant {
  readonly key = 'B';
  readonly name = 'Point';
  readonly how = 'Point at Hale and pull the trigger; pick with the ray. Your quest is on your belt: glance down.';
  readonly root = new Group();
  private readonly marker = new Marker();
  private readonly panel = new Card(PANEL.w, PANEL.h, { ppm: PANEL.ppm });
  private readonly belt = new Card(0.36, 0.15, { ppm: 1800 });
  private readonly toast = new Card(0.8, 0.12, { overlay: true });
  private readonly rays: Record<Handedness, Mesh> = { left: this.makeRay(), right: this.makeRay() };
  private readonly dot = new Mesh(new SphereGeometry(0.012, 8, 6), new MeshBasicMaterial({ color: 0xffe6a0 }));
  private readonly lastTrigger: Record<Handedness, number> = { left: 0, right: 0 };
  private talk: Talk | null = null;
  private buttons: { x: number; y: number; label: string }[] = [];
  private hover = -1;
  private linger = 0;
  private beltYaw = 0;
  private readonly toasts: string[] = [];
  private toastTime = 0;

  constructor(private readonly ctx: VariantContext) {
    this.root.add(this.marker.sprite, this.panel.mesh, this.belt.mesh, this.toast.mesh, this.rays.left, this.rays.right, this.dot);
    this.panel.mesh.visible = false;
    this.toast.opacity = 0;
  }

  private makeRay(): Mesh {
    const geo = new BoxGeometry(0.004, 0.004, 1).translate(0, 0, -0.5);
    const ray = new Mesh(geo, new MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.7, fog: false }));
    ray.visible = false;
    return ray;
  }

  update(dt: number): void {
    const { ctx } = this;
    const hale = ctx.hale;
    this.marker.update(dt, ctx.book.mood(), hale.position.x, hale.position.y + hale.headY + 0.5, hale.position.z);

    if (this.talk && this.panel.mesh.position.distanceTo(ctx.head) > 3.5) this.close();
    if (this.talk && !this.talk.choices.length && (this.linger -= dt) <= 0) this.close();

    let hoverHale = false;
    let hoverButton = -1;
    this.dot.visible = false;
    for (const hand of ['left', 'right'] as const) {
      const aim = ctx.aim[hand];
      const ray = this.rays[hand];
      const trigger = ctx.input.hands[hand].trigger;
      const pulled = trigger > 0.7 && this.lastTrigger[hand] <= 0.7;
      this.lastTrigger[hand] = trigger;
      ray.visible = false;
      if (!aim || !ctx.xr) continue;
      aim.getWorldPosition(_o);
      aim.getWorldDirection(_d).negate(); // target-ray space points down -Z
      const hit = this.cast(_o, _d);
      if (hit || trigger > 0.2) {
        ray.visible = true;
        ray.position.copy(_o);
        aim.getWorldQuaternion(ray.quaternion);
        ray.scale.set(1, 1, hit ? hit.t : 2);
      }
      if (!hit) continue;
      this.dot.visible = true;
      this.dot.position.copy(_o).addScaledVector(_d, hit.t);
      if (hit.target === 'hale') hoverHale = true;
      else hoverButton = hit.button;
      if (!pulled) continue;
      if (hit.target === 'hale' && !this.talk) {
        ctx.input.pulse(hand, 0.5, 40);
        this.open(ctx.book.talk());
      } else if (hit.target === 'panel' && hit.button >= 0) {
        ctx.input.pulse(hand, 0.8, 50);
        this.choose(hit.button);
      }
    }
    if (ctx.keys.talk && !this.talk && Math.hypot(ctx.head.x - hale.position.x, ctx.head.z - hale.position.z) < 6) {
      this.open(ctx.book.talk());
    }
    if (ctx.keys.choice >= 0 && this.talk) this.choose(ctx.keys.choice);
    hale.highlighted = hoverHale && !this.talk;
    if (hoverButton !== this.hover) {
      this.hover = hoverButton;
      if (this.talk) this.drawPanel(this.talk);
    }
    this.updateBelt(dt);
    this.updateToast(dt);
  }

  onQuest(e: QuestEvent): void {
    const o = e.kind === 'progress' ? e.objective : null;
    switch (e.kind) {
      case 'accepted':
        this.toasts.push(`Quest accepted: ${e.quest.title}`);
        break;
      case 'progress':
        if (o && o.have < o.need) this.toasts.push(`${o.text}: ${o.have}/${o.need}`);
        break;
      case 'ready':
        this.toasts.push(`${e.quest.title}: done. Return to Marshal Hale.`);
        break;
      case 'handedIn':
        this.toasts.push(`Quest complete: ${e.quest.title}`);
        break;
    }
  }

  /** What a ray from `o` along `d` lands on first: the quest window, or Hale. */
  private cast(o: Vector3, d: Vector3): Hit | null {
    if (this.talk) {
      const m = this.panel.mesh;
      m.updateMatrixWorld();
      _inv.copy(m.matrixWorld).invert();
      _a.copy(o).applyMatrix4(_inv);
      _b.copy(d).transformDirection(_inv);
      if (Math.abs(_b.z) > 1e-4) {
        const t = -_a.z / _b.z;
        const x = _a.x + _b.x * t;
        const y = _a.y + _b.y * t;
        if (t > 0 && Math.abs(x) <= PANEL.w / 2 && Math.abs(y) <= PANEL.h / 2) {
          const px = (x / PANEL.w + 0.5) * this.panel.pw;
          const py = (0.5 - y / PANEL.h) * this.panel.ph;
          const button = this.buttons.findIndex((r) => Math.abs(px - r.x) < BTN.w / 2 && Math.abs(py - r.y) < BTN.h / 2);
          return { t, button, target: 'panel' };
        }
      }
    }
    const hale = this.ctx.hale.position;
    _end.copy(o).addScaledVector(d, REACH);
    _a.set(hale.x, hale.y + 0.2, hale.z);
    _b.set(hale.x, hale.y + this.ctx.hale.headY + 0.1, hale.z);
    if (closestSegmentSegment(o, _end, _a, _b, _seg).distance < 0.32) {
      return { t: _seg.pointA.distanceTo(o), button: -1, target: 'hale' };
    }
    return null;
  }

  private open(talk: Talk): void {
    const { ctx } = this;
    // In front of you, a little below eye height, and it stays where it opened.
    _d.set(ctx.gaze.x, 0, ctx.gaze.z).normalize();
    this.panel.mesh.position.copy(ctx.head).addScaledVector(_d, 1.1);
    this.panel.mesh.position.y -= 0.12;
    this.panel.mesh.lookAt(ctx.head);
    this.panel.mesh.visible = true;
    this.show(talk);
  }

  private show(talk: Talk): void {
    this.talk = talk;
    this.linger = 3.5;
    this.hover = -1;
    const n = talk.choices.length;
    this.buttons = talk.choices.map((c, i) => ({
      x: this.panel.pw / 2 + (n === 1 ? 0 : (i === 0 ? -1 : 1) * (BTN.w / 2 + 24)),
      y: this.panel.ph - 80,
      label: c.label,
    }));
    this.drawPanel(talk);
  }

  private choose(i: number): void {
    const choice = this.talk?.choices[i];
    if (!choice) return;
    const next = this.ctx.book.answer(choice.act);
    if (next) this.show(next);
    else this.close();
  }

  private close(): void {
    this.talk = null;
    this.buttons = [];
    this.panel.mesh.visible = false;
  }

  /** A WoW-style quest window: who, the quest, what it asks, what it pays. */
  private drawPanel(talk: Talk): void {
    const q = talk.quest;
    this.panel.paint(`${talk.lines.join('|')}${this.hover}`, (c, w, h) => {
      c.fillStyle = 'rgba(14, 16, 22, 0.94)';
      roundRect(c, 0, 0, w, h, 28);
      c.fill();
      c.strokeStyle = '#8a7240';
      c.lineWidth = 6;
      roundRect(c, 3, 3, w - 6, h - 6, 26);
      c.stroke();
      c.textBaseline = 'top';
      c.fillStyle = '#d8c89a';
      c.font = `bold 40px ${FONT}`;
      c.fillText('Marshal Hale', 40, 30);
      let y = 84;
      const offering = talk.choices.some((ch) => ch.act === 'accept');
      if (q && offering) {
        c.fillStyle = '#ffd23a';
        c.font = `bold 52px ${FONT}`;
        c.fillText(q.title, 40, y);
        y += 70;
      }
      c.fillStyle = '#ece6d6';
      c.font = `37px ${FONT}`;
      for (const para of talk.lines) {
        for (const line of wrap(c, para, w - 80)) {
          c.fillText(line, 40, y);
          y += 46;
        }
        y += 12;
      }
      if (q && offering) {
        c.fillStyle = '#ffd23a';
        c.font = `bold 33px ${FONT}`;
        q.objectives.forEach((o, i) => c.fillText(`${o.text}: 0/${o.need}`, 40, y + 4 + i * 42, w - 80));
        c.fillStyle = '#a8d890';
        c.fillText(`Reward: ${q.xp} XP`, 40, y + 8 + q.objectives.length * 42);
      }
      this.buttons.forEach((b, i) => {
        c.fillStyle = i === this.hover ? '#f0c060' : '#3a3222';
        roundRect(c, b.x - BTN.w / 2, b.y - BTN.h / 2, BTN.w, BTN.h, 16);
        c.fill();
        c.strokeStyle = '#8a7240';
        c.lineWidth = 3;
        c.stroke();
        c.fillStyle = i === this.hover ? '#1a1408' : '#f4ead0';
        c.font = `bold 38px ${FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(b.label, b.x, b.y + 2);
        c.textAlign = 'left';
        c.textBaseline = 'top';
      });
    });
  }

  /** Body-locked at the belt, following head yaw only: glance down to read it. */
  private updateBelt(dt: number): void {
    const { ctx } = this;
    const q = ctx.book.tracked;
    this.belt.mesh.visible = !!q;
    if (!q) return;
    const yaw = Math.atan2(ctx.gaze.x, ctx.gaze.z);
    let d = yaw - this.beltYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.beltYaw += d * Math.min(1, dt * 3);
    const m = this.belt.mesh;
    if (ctx.xr) {
      m.position.set(ctx.head.x + Math.sin(this.beltYaw) * 0.36, ctx.head.y - 0.58, ctx.head.z + Math.cos(this.beltYaw) * 0.36);
      m.lookAt(ctx.head);
    } else {
      ctx.camera.localToWorld(m.position.set(0, -0.22, -0.6));
      ctx.camera.getWorldQuaternion(m.quaternion);
    }
    this.belt.paint(`${q.title}${q.state}${q.objectives.map((o) => o.have).join()}`, (c, w, h) => {
      c.fillStyle = 'rgba(14, 16, 22, 0.88)';
      roundRect(c, 0, 0, w, h, 22);
      c.fill();
      c.textBaseline = 'top';
      c.fillStyle = '#ffd23a';
      c.font = `bold 38px ${FONT}`;
      c.fillText(q.title, 26, 18, w - 52);
      c.font = `32px ${FONT}`;
      c.fillStyle = '#ece6d6';
      const lines =
        q.state === 'ready' ? ['Return to Marshal Hale'] : q.objectives.map((o) => `${o.have}/${o.need}  ${o.text}`);
      lines.forEach((line, i) => c.fillText(line, 26, 72 + i * 40, w - 52));
      if (q.state !== 'ready' && lines.length < 2) {
        c.fillStyle = '#a89c80';
        c.font = `28px ${FONT}`;
        c.fillText(q.where, 26, 72 + lines.length * 40 + 4, w - 52);
      }
    });
  }

  /** One line at a time, floating a little above the middle of your view and trailing your head. */
  private updateToast(dt: number): void {
    const { ctx } = this;
    this.toastTime = Math.max(0, this.toastTime - dt);
    if (this.toastTime <= 0 && this.toasts.length) {
      const text = this.toasts.shift()!;
      this.toastTime = 2.8;
      this.toast.paint(text, (c, w, h) => {
        c.font = `bold 44px ${FONT}`;
        const tw = Math.min(w - 20, c.measureText(text).width + 60);
        c.fillStyle = 'rgba(14, 16, 22, 0.8)';
        roundRect(c, (w - tw) / 2, 8, tw, h - 16, (h - 16) / 2);
        c.fill();
        c.fillStyle = '#ffd23a';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(text, w / 2, h / 2 + 2, w - 60);
      });
      // Start where you're looking.
      ctx.camera.localToWorld(this.toast.mesh.position.set(0, 0.28, -1.5));
    }
    this.toast.opacity = Math.min(1, this.toastTime * 3, (2.8 - this.toastTime) * 6);
    if (!this.toast.mesh.visible) return;
    ctx.camera.localToWorld(_end.set(0, 0.28, -1.5));
    this.toast.mesh.position.lerp(_end, Math.min(1, dt * 4));
    this.toast.mesh.lookAt(ctx.head);
  }
}
