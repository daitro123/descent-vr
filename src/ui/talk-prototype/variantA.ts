import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import type { Handedness } from '../../player/input';
import { Card, FONT, Marker, parchment, wrap } from './card';
import type { Choice, QuestEvent, Talk } from './quest';
import { distToHale, gazeAngle, gazeAtHale, type Variant, type VariantContext } from './variant';

// PROTOTYPE, variant A "Hands": walk up to Hale and a board unfolds beside
// them; touch a button with your hand or your sword. Your quest log lives on
// your left wrist: look at it like a watch. Gold "!" and "?" over Hale.

const OPEN_DIST = 2.3;
const CLOSE_DIST = 3.6;
const BTN = { w: 0.24, h: 0.09, d: 0.04 };

interface Button {
  mesh: Mesh<BoxGeometry, MeshBasicMaterial>;
  choice: Choice;
  pushed: number;
  /** Probes resting on it, which must leave before they can press it. */
  blocked: Set<number>;
}

const _p = new Vector3();
const _q = new Vector3();
const _right = new Vector3();
const UP = new Vector3(0, 1, 0);

export class HandsVariant implements Variant {
  readonly key = 'A';
  readonly name = 'Hands';
  readonly how = 'Walk up to Hale and touch a button with your hand or sword. Your quest log is on your left wrist.';
  readonly root = new Group();
  private readonly marker = new Marker();
  private readonly board = new Group();
  private readonly text = new Card(0.62, 0.36);
  private readonly buttons: Button[] = [];
  private readonly wrist = new Card(0.22, 0.16, { ppm: 2000 });
  private talk: Talk | null = null;
  /** Seconds before buttons take a press, so a hand already there doesn't fire one. */
  private arming = 0;
  /** A board with no buttons closes itself after this long. */
  private linger = 0;
  private needLeave = false;
  private wristFlash = 0;

  constructor(private readonly ctx: VariantContext) {
    this.root.add(this.marker.sprite, this.board, this.wrist.mesh);
    this.board.add(this.text.mesh);
    this.text.mesh.position.y = 0.1;
    this.board.visible = false;
    this.wrist.opacity = 0;
  }

  update(dt: number): void {
    const { ctx } = this;
    const hale = ctx.hale;
    this.marker.update(dt, ctx.book.mood(), hale.position.x, hale.position.y + hale.headY + 0.5, hale.position.z);

    const dist = distToHale(ctx);
    if (dist > CLOSE_DIST) {
      this.needLeave = false;
      if (this.talk) this.close();
    }
    const near = dist < OPEN_DIST && gazeAtHale(ctx) < 50;
    if (!this.talk && !this.needLeave && (near || (ctx.keys.talk && dist < 5))) this.open(ctx.book.talk());

    if (this.talk) {
      this.arming = Math.max(0, this.arming - dt);
      if (!this.talk.choices.length && (this.linger -= dt) <= 0) this.close();
      this.pressButtons(dt);
    }
    this.updateWrist(dt);
  }

  onQuest(e: QuestEvent): void {
    // The log is on your wrist; a buzz on that hand says it changed.
    if (e.kind === 'progress' || e.kind === 'ready' || e.kind === 'accepted') {
      this.wristFlash = 1.2;
      this.ctx.input.pulse('left', 0.5, e.kind === 'ready' ? 180 : 60);
    }
  }

  private open(talk: Talk): void {
    const { ctx } = this;
    this.talk = talk;
    this.arming = 0.4;
    this.linger = 3;
    // Stand the board beside Hale, on your right as you face them, turned to you.
    const hale = ctx.hale.position;
    _p.set(ctx.head.x - hale.x, 0, ctx.head.z - hale.z).normalize(); // Hale → you
    _right.crossVectors(UP, _p); // your right, facing Hale
    this.board.position.copy(hale).addScaledVector(_p, 0.6).addScaledVector(_right, 0.55);
    this.board.position.y = hale.y + 1.2;
    this.board.lookAt(ctx.head);
    this.board.visible = true;
    this.drawBoard(talk);
    this.layoutButtons(talk.choices);
  }

  private close(): void {
    this.talk = null;
    this.board.visible = false;
    this.needLeave = true;
  }

  private drawBoard(talk: Talk): void {
    this.text.paint(talk.lines.join('|'), (c, w, h) => {
      parchment(c, w, h);
      c.fillStyle = '#5a3212';
      c.font = `bold 44px ${FONT}`;
      c.textBaseline = 'top';
      c.fillText('Marshal Hale', 34, 28);
      c.fillStyle = '#2a1c10';
      c.font = `37px ${FONT}`;
      let y = 90;
      for (const para of talk.lines) {
        for (const line of wrap(c, para, w - 68)) {
          c.fillText(line, 34, y);
          y += 44;
        }
        y += 10;
      }
    });
  }

  private layoutButtons(choices: Choice[]): void {
    for (const b of this.buttons) this.board.remove(b.mesh);
    this.buttons.length = 0;
    choices.forEach((choice, i) => {
      const card = new Card(BTN.w, BTN.h, { ppm: 1400 });
      card.paint(choice.label, (c, w, h) => {
        c.fillStyle = choice.act === 'decline' || choice.act === 'bye' ? '#5a4632' : '#2f6a2a';
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#f4ead0';
        c.font = `bold 40px ${FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(choice.label, w / 2, h / 2 + 2);
      });
      const mesh = new Mesh(new BoxGeometry(BTN.w, BTN.h, BTN.d), new MeshBasicMaterial({ color: 0x3a2716 }));
      card.mesh.position.z = BTN.d / 2 + 0.001;
      mesh.add(card.mesh);
      const x = choices.length === 1 ? 0 : (i === 0 ? -1 : 1) * 0.15;
      mesh.position.set(x, -0.15, BTN.d / 2);
      this.board.add(mesh);
      this.buttons.push({ mesh, choice, pushed: 0, blocked: new Set() });
    });
  }

  /** Touch with either fist or the sword's tip. */
  private pressButtons(dt: number): void {
    const { ctx } = this;
    // Probes: each fist, then the sword's tip (on the right hand).
    const probes: ([Vector3, Handedness] | null)[] = (['left', 'right'] as const).map((hand) => {
      const grip = ctx.input.hands[hand].grip;
      return grip.visible ? [grip.getWorldPosition(new Vector3()), hand] : null;
    });
    for (const point of ctx.swordPoints) {
      probes.push(ctx.input.hands.right.grip.visible ? [point.getWorldPosition(new Vector3()), 'right'] : null);
    }

    for (const b of this.buttons) {
      b.pushed = Math.max(0, b.pushed - dt);
      b.mesh.position.z = BTN.d / 2 - 0.025 * Math.min(1, b.pushed * 4);
      b.mesh.material.color.setHex(b.pushed > 0 ? 0xf0c060 : 0x3a2716);
    }
    let pick = ctx.keys.choice >= 0 ? this.buttons[ctx.keys.choice] : undefined;
    let hand: Handedness = 'right';
    for (const b of this.buttons) {
      probes.forEach((probe, i) => {
        let inside = false;
        if (probe) {
          b.mesh.worldToLocal(_q.copy(probe[0]));
          inside = Math.abs(_q.x) < BTN.w / 2 + 0.025 && Math.abs(_q.y) < BTN.h / 2 + 0.025 && _q.z < BTN.d / 2 + 0.03 && _q.z > -0.08;
        }
        // A press is a probe arriving at a button: one already resting there
        // (as the board opens, or after a press) must leave it first.
        if (!inside) b.blocked.delete(i);
        else if (!b.blocked.has(i)) {
          if (this.arming <= 0 && !pick) [pick, hand] = [b, probe![1]];
          b.blocked.add(i);
        }
      });
    }
    if (!pick) return;
    pick.pushed = 0.35;
    ctx.input.pulse(hand, 0.8, 50);
    this.arming = 0.6;
    const next = ctx.book.answer(pick.choice.act);
    if (!next) {
      this.close();
      return;
    }
    this.talk = next;
    this.linger = 3;
    this.drawBoard(next);
    this.layoutButtons(next.choices);
  }

  /** The quest log over the left wrist, shown while you look at it. */
  private updateWrist(dt: number): void {
    const { ctx } = this;
    const grip = ctx.input.hands.left.grip;
    // Grip space runs the forearm along +Y: sit just above the wrist, facing you.
    grip.localToWorld(this.wrist.mesh.position.set(0, 0.12, 0));
    this.wrist.mesh.lookAt(ctx.head);
    const looking =
      grip.visible && ctx.xr && this.wrist.mesh.position.distanceTo(ctx.head) < 0.8 && gazeAngle(ctx, this.wrist.mesh.position) < 30;
    const want = looking || !ctx.xr ? 1 : 0;
    const o = this.wrist.opacity + Math.sign(want - this.wrist.opacity) * Math.min(Math.abs(want - this.wrist.opacity), dt * 6);
    this.wrist.opacity = o;
    if (!ctx.xr) {
      // Desktop: pin the log to the lower left of the view instead.
      ctx.camera.localToWorld(this.wrist.mesh.position.set(-0.28, -0.2, -0.6));
      this.wrist.mesh.quaternion.copy(ctx.camera.getWorldQuaternion(this.wrist.mesh.quaternion));
    }
    this.wristFlash = Math.max(0, this.wristFlash - dt);
    const q = ctx.book.tracked;
    const flash = this.wristFlash > 0 && Math.floor(this.wristFlash * 6) % 2 === 0;
    const key = q ? `${q.title}${q.state}${q.objectives.map((o) => o.have).join()}${flash}` : 'none';
    this.wrist.paint(key, (c, w, h) => {
      parchment(c, w, h, 8);
      if (flash) {
        c.fillStyle = 'rgba(255, 210, 90, 0.35)';
        c.fillRect(8, 8, w - 16, h - 16);
      }
      c.textBaseline = 'top';
      c.fillStyle = '#5a3212';
      c.font = `bold 30px ${FONT}`;
      c.fillText(q ? q.title : 'No quest', 22, 20, w - 44);
      c.font = `25px ${FONT}`;
      c.fillStyle = '#2a1c10';
      let y = 64;
      const lines = !q
        ? ['Marshal Hale waits at', 'the crossroads.']
        : q.state === 'ready'
          ? ['Done! Return to', 'Marshal Hale.']
          : [...q.objectives.map((o) => `${o.text}: ${o.have}/${o.need}`), q.where];
      for (const text of lines) {
        for (const line of wrap(c, text, w - 44)) {
          c.fillText(line, 22, y);
          y += 30;
        }
      }
    });
  }
}
