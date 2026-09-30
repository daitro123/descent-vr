import { Color, CylinderGeometry, Euler, Group, Mesh, type Object3D, type PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { FloatingText } from '../../../fx/floatingText';
import type { Particles } from '../../../fx/particles';
import type { Handedness } from '../../../player/input';
import { Board } from './board';
import {
  bench,
  beltLoop,
  COLOURS,
  FLASK,
  flask,
  leaf,
  MORTAR,
  mortar,
  PESTLE,
  pestle,
  POT,
  pot,
  SPOON,
  SPOTS,
  spoon,
  stand,
  tint,
  TOP,
  tray,
  trivet,
} from './props';
import type { BrewRig } from './rig';
import { brewSfx } from './sound';
import { type BrewVariant, LEAVES, type Mode, modeOf, type Step, stepsOf, TURNS } from './variants';

// PROTOTYPE (Brewing at the alchemy table): the bench and the brewing, for one
// variant. You take things with the grip (squeeze), and whatever you let go
// glides back to its place: nothing falls, spills or gets knocked off, as the
// research says (snap, clamp and forgive). Each act is either yours (the
// hands' motion drives it) or the table's (a short animation). Throwaway.

type Kind = 'leaf' | 'pestle' | 'spoon' | 'mortar' | 'pot' | 'flask';

interface Place {
  parent: Object3D;
  at: Vector3;
  turn: Quaternion;
}

interface Item {
  readonly kind: Kind;
  readonly obj: Object3D;
  /** Where the hand takes it, in its own frame. */
  readonly grab: Vector3;
  readonly radius: number;
  /** How it sits in the fist, in the grip's frame. */
  readonly holdTurn: Quaternion;
  /** Held tools replace the hand (Owlchemy's "tomato presence"). */
  readonly hidesHand: boolean;
  home: Place;
  heldBy: Handedness | null;
  /** The glide home after it's let go: seconds left, and where it started from. */
  back: number;
  from: { at: Vector3; turn: Quaternion };
  /** Can it be taken now? */
  can: () => boolean;
  /** A leaf: dropped in. A flask: its brew, and whether it's the table's (not yet taken). */
  inside?: boolean;
  flask?: ReturnType<typeof flask> & { onTable: boolean };
}

export interface StationContext {
  rig: BrewRig;
  camera: PerspectiveCamera;
  particles: Particles;
  floats: FloatingText;
}

const BACK_SECONDS = 0.25;
/** How near a hand must be to what it takes, beyond the thing's own radius. */
const REACH = 0.02;
/** Within this of the bench's front (floor distance from your head), the weapons go away. */
const AT_TABLE = 1.3;
/** The shared potion cooldown (Oakvale's first tier). */
const COOLDOWN = 60;

const q = (x: number, y: number, z: number) => new Quaternion().setFromEuler(new Euler(x, y, z));
/** Tools held like a knife pointed down into the bowl: 50° below the fist's forward. */
const TOOL_HOLD = q(0.7, 0, 0);
const LEVEL = new Quaternion();

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _q = new Quaternion();
const _up = new Vector3();

/** Turns of a point round a centre, however the hand goes round, for grinding and stirring. */
class Turns {
  acc = 0;
  private prev: number | null = null;
  private halves = 0;

  /** Feed the point's offset from the centre; returns how many half turns it just completed. */
  feed(dx: number, dz: number): number {
    if (Math.hypot(dx, dz) < 0.008) return 0; // at the very centre the angle is noise
    const a = Math.atan2(dz, dx);
    if (this.prev !== null) {
      let d = a - this.prev;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      this.acc += Math.min(0.6, Math.abs(d));
    }
    this.prev = a;
    return this.count();
  }

  add(radians: number): number {
    this.acc += radians;
    return this.count();
  }

  lift(): void {
    this.prev = null;
  }

  private count(): number {
    const h = Math.floor(this.acc / Math.PI);
    const n = h - this.halves;
    this.halves = h;
    return n;
  }
}

export class Station {
  /** The bench, in its frame (x along it, +z towards you): the scaffold places it. */
  readonly root = new Group();
  /** The two flask loops at your hips, body-locked: the scaffold adds it to the scene. */
  readonly belt = new Group();
  readonly steps: Step[];
  step: Step = 'load';
  /** 0 to 1 through the current act. */
  progress = 0;
  leavesIn = 0;
  /** Seconds the last brew took, from the first leaf in to the cork. */
  last: number | null = null;
  cooldown = 0;
  /** Every brew's time, for the verdict. */
  readonly times: number[] = [];
  /** Desktop: the next act does itself (E). */
  cheat = false;

  private readonly items: Item[] = [];
  private readonly leaves: Item[] = [];
  private readonly mortar = mortar();
  private readonly pestle: Item;
  private readonly spoon: Item;
  private readonly mortarItem: Item;
  private readonly potItem: Item;
  private readonly pot = pot();
  private flaskItem!: Item;
  private readonly slots: Group[] = [];
  private readonly board = new Board();
  private readonly stream = new Mesh(new CylinderGeometry(1, 1, 1, 6), tint(COLOURS.brew, 0.5));
  private readonly held: Record<Handedness, Item | null> = { left: null, right: null };
  private readonly turns = new Turns();
  private readonly spoonInPot: Place;
  private readonly spoonOnBench: Place;
  private clock = 0;
  private startedAt = 0;
  /** Seconds into the current act's animation, when the table does it. */
  private autoT = 0;
  private resetIn = -1;
  private drinkT = 0;
  private trickleT = 0;
  private poundLatched = false;
  private readonly tipWas = new Vector3();
  private readonly brewColour = new Color(COLOURS.water);

  constructor(
    readonly variant: BrewVariant,
    private readonly ctx: StationContext,
  ) {
    this.root.name = `brew-station-${variant.key}`;
    this.steps = stepsOf(variant);
    this.root.add(bench());
    const trayMesh = tray();
    trayMesh.position.copy(SPOTS.tray);
    const trivetMesh = trivet();
    trivetMesh.position.copy(SPOTS.pot).setY(TOP);
    const standMesh = stand();
    standMesh.position.copy(SPOTS.flask);
    this.root.add(trayMesh, trivetMesh, standMesh);

    this.board.mesh.position.copy(SPOTS.board);
    this.board.mesh.rotation.x = -0.18;
    this.root.add(this.board.mesh);
    this.stream.visible = false;
    this.root.add(this.stream);

    const grinds = variant.grind !== 'skip';
    const tips = variant.tip !== 'skip';

    for (let i = 0; i < 3; i++) {
      const m = leaf();
      const item = this.add({
        kind: 'leaf',
        obj: m,
        grab: new Vector3(0, 0.004, 0),
        radius: 0.06,
        holdTurn: q(0, 0.4, 0),
        hidesHand: false,
        home: this.place(this.root, SPOTS.tray.x - 0.06 + i * 0.06, SPOTS.tray.y + 0.014 + i * 0.004, SPOTS.tray.z + (i - 1) * 0.035, 0, 0.3 * (i - 1), 0),
        can: () => !item.inside && this.step === 'load' && this.mode() === 'hand',
      });
      this.leaves.push(item);
    }

    this.mortar.root.visible = grinds || tips;
    this.mortarItem = this.add({
      kind: 'mortar',
      obj: this.mortar.root,
      grab: new Vector3(0, 0.06, 0.07),
      radius: 0.07,
      holdTurn: LEVEL,
      hidesHand: false,
      home: this.place(this.root, SPOTS.mortar.x, SPOTS.mortar.y, SPOTS.mortar.z),
      can: () => this.step === 'tip' && this.mode() === 'hand',
    });

    const p = pestle();
    p.visible = grinds;
    this.pestle = this.add({
      kind: 'pestle',
      obj: p,
      grab: new Vector3(0, -0.03, 0),
      radius: 0.06,
      holdTurn: TOOL_HOLD,
      hidesHand: true,
      home: this.place(this.root, SPOTS.pestle.x, SPOTS.pestle.y, SPOTS.pestle.z, 0, 0, Math.PI / 2),
      can: () => variant.grind === 'hand',
    });

    this.potItem = this.add({
      kind: 'pot',
      obj: this.pot.root,
      grab: POT.handle.clone(),
      radius: 0.07,
      holdTurn: LEVEL,
      hidesHand: true,
      home: this.place(this.root, SPOTS.pot.x, SPOTS.pot.y, SPOTS.pot.z),
      can: () => this.step === 'pour' && this.mode() === 'hand',
    });

    const s = spoon();
    this.spoonInPot = this.place(this.pot.root, 0.035, 0.33, -0.02, 0.12, 0, -0.12);
    this.spoonOnBench = this.place(this.root, SPOTS.pot.x - 0.16, TOP + 0.012, SPOTS.pot.z + 0.2, 0, 0, Math.PI / 2);
    this.spoon = this.add({
      kind: 'spoon',
      obj: s,
      grab: new Vector3(0, -0.04, 0),
      radius: 0.06,
      holdTurn: TOOL_HOLD,
      hidesHand: true,
      home: this.spoonInPot,
      can: () => variant.stir === 'hand' && this.step !== 'pour',
    });

    for (const side of [-1, 1]) {
      const slot = new Group();
      slot.userData.side = side;
      slot.add(beltLoop());
      this.belt.add(slot);
      this.slots.push(slot);
    }
    this.newFlask();
    for (const item of this.items) this.settle(item);
  }

  /** The act you're on, and who does it. */
  mode(step: Step = this.step): Mode {
    return this.cheat ? 'auto' : modeOf(this.variant, step);
  }

  get onBelt(): number {
    return this.slots.filter((s) => this.inSlot(s)).length;
  }

  private place(parent: Object3D, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Place {
    return { parent, at: new Vector3(x, y, z), turn: q(rx, ry, rz) };
  }

  private add(spec: Omit<Item, 'heldBy' | 'back' | 'from'>): Item {
    const item: Item = { ...spec, heldBy: null, back: 0, from: { at: new Vector3(), turn: new Quaternion() } };
    this.items.push(item);
    return item;
  }

  /** Put it straight at its place. */
  private settle(item: Item): void {
    item.home.parent.add(item.obj);
    item.obj.position.copy(item.home.at);
    item.obj.quaternion.copy(item.home.turn);
    item.back = 0;
  }

  /** Let it glide to its place from wherever it is. */
  private sendHome(item: Item, seconds = BACK_SECONDS): void {
    item.home.parent.attach(item.obj);
    item.from.at.copy(item.obj.position);
    item.from.turn.copy(item.obj.quaternion);
    item.back = seconds;
    item.obj.userData.backFor = seconds;
  }

  private newFlask(): void {
    const f = flask();
    const item = this.add({
      kind: 'flask',
      obj: f.root,
      grab: FLASK.grab.clone(),
      radius: 0.07,
      holdTurn: LEVEL,
      hidesHand: false,
      home: this.place(this.root, SPOTS.flask.x, SPOTS.flask.y, SPOTS.flask.z),
      can: () => !item.flask!.onTable || this.step === 'take',
      flask: { ...f, onTable: true },
    });
    this.flaskItem = item;
    this.settle(item);
  }

  private inSlot(slot: Group): boolean {
    return this.items.some((i) => i.kind === 'flask' && i.home.parent === slot);
  }

  // --- The frame ----------------------------------------------------------

  update(dt: number): void {
    this.clock += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const { rig, camera } = this.ctx;
    const head = camera.getWorldPosition(_a);
    const front = this.root.localToWorld(_b.set(0, 0, 0.3));
    rig.bare = Math.hypot(head.x - front.x, head.z - front.z) < AT_TABLE;
    this.followBelt(head);

    for (const side of ['left', 'right'] as const) {
      const h = rig.hands[side];
      if (h.grabbed && !this.held[side]) this.take(side);
      else if (h.released && this.held[side]) this.release(side);
    }
    for (const item of this.items) this.glide(item, dt);
    for (const side of ['left', 'right'] as const) {
      const held = this.held[side];
      rig.hands[side].model.visible = rig.bare && !held?.hidesHand;
    }

    if (this.resetIn >= 0) {
      this.resetIn -= dt;
      if (this.resetIn < 0) this.reset();
    }
    this.act(dt);
    this.drink(dt);
    this.levelBrew();
    this.dimBelt();
    this.board.show({
      variant: this.variant,
      step: this.step,
      progress: this.progress,
      leaves: this.leavesIn,
      last: this.last,
      onBelt: this.onBelt,
      cooldown: this.cooldown,
    });
  }

  private followBelt(head: Vector3): void {
    this.ctx.camera.getWorldDirection(_c);
    _c.y = 0;
    if (_c.lengthSq() < 1e-6) _c.set(0, 0, -1);
    _c.normalize();
    this.belt.position.set(head.x, head.y - 0.7, head.z).addScaledVector(_c, 0.02);
    this.belt.rotation.set(0, Math.atan2(-_c.x, -_c.z), 0);
    for (const slot of this.slots) slot.position.set(0.2 * slot.userData.side, 0, 0);
    this.belt.updateMatrixWorld(true);
  }

  private handAt(side: Handedness, out: Vector3): Vector3 {
    return this.ctx.rig.grip(side).getWorldPosition(out);
  }

  private take(side: Handedness): void {
    const hand = this.handAt(side, _a);
    let best: Item | null = null;
    let bestD = Infinity;
    for (const item of this.items) {
      if (item.heldBy || !item.obj.visible || !item.can()) continue;
      // Away from the table only what's on your belt.
      if (!this.ctx.rig.bare && !this.slots.includes(item.home.parent as Group)) continue;
      const d = item.obj.localToWorld(_b.copy(item.grab)).distanceTo(hand);
      if (d < item.radius + REACH && d < bestD) {
        best = item;
        bestD = d;
      }
    }
    if (!best) return;
    const item = best;
    item.heldBy = side;
    item.back = 0;
    this.held[side] = item;
    const grip = this.ctx.rig.grip(side);
    grip.add(item.obj);
    item.obj.quaternion.copy(item.holdTurn);
    item.obj.position.copy(item.grab).applyQuaternion(item.holdTurn).negate();
    this.ctx.rig.input.pulse(side, 0.5, 30);
    if (item.kind === 'flask' && item.flask!.onTable) item.flask!.onTable = false;
    this.poundLatched = false;
    this.turns.lift();
    if (item.kind === 'pestle') this.tipWas.copy(item.obj.localToWorld(_b.copy(PESTLE.tip)));
  }

  private release(side: Handedness): void {
    const item = this.held[side]!;
    this.held[side] = null;
    item.heldBy = null;
    this.turns.lift();
    this.stream.visible = false;
    if (item.kind === 'leaf' && this.step === 'load' && this.overTarget(item)) return this.dropIn(item);
    if (item.kind === 'flask') {
      const slot = this.freeSlotNear(item);
      const wasTable = item.home.parent === this.root;
      if (slot) {
        item.home = this.place(slot, 0, 0.02, 0);
        brewSfx.belt();
        this.ctx.rig.input.pulse(side, 0.6, 50);
        if (wasTable) this.resetIn = 0.8;
      }
    }
    this.sendHome(item);
  }

  private glide(item: Item, dt: number): void {
    if (item.back <= 0 || item.heldBy) return;
    item.back = Math.max(0, item.back - dt);
    const total = item.obj.userData.backFor ?? BACK_SECONDS;
    const t = 1 - item.back / total;
    const e = t * t * (3 - 2 * t);
    item.obj.position.lerpVectors(item.from.at, item.home.at, e);
    item.obj.quaternion.slerpQuaternions(item.from.turn, item.home.turn, e);
  }

  // --- Loading ------------------------------------------------------------

  /** The mortar's mouth or the pot's, whichever this variant loads, in the world. */
  private target(out: Vector3): Vector3 {
    return this.variant.load === 'mortar'
      ? this.mortar.root.localToWorld(out.copy(MORTAR.mouth))
      : this.pot.root.localToWorld(out.set(0, POT.height, 0));
  }

  private overTarget(item: Item): boolean {
    const at = item.obj.getWorldPosition(_b);
    const mouth = this.target(_c);
    const r = this.variant.load === 'mortar' ? 0.1 : 0.13;
    return Math.hypot(at.x - mouth.x, at.z - mouth.z) < r && at.y > mouth.y - 0.04 && at.y < mouth.y + 0.35;
  }

  private dropIn(item: Item): void {
    item.inside = true;
    const k = this.leavesIn;
    if (this.variant.load === 'mortar')
      item.home = this.place(this.mortar.root, -0.018 + k * 0.03, 0.035 + k * 0.006, 0.01 - k * 0.02, 0, 1.2 * k, 0);
    else item.home = this.place(this.pot.root, -0.03 + k * 0.05, POT.liquid + 0.004, -0.01 + k * 0.03, 0, 1.3 * k + 0.4, 0);
    this.sendHome(item, 0.15);
    brewSfx.leaf(this.target(_a));
    if (this.leavesIn === 0) this.startedAt = this.clock;
    this.leavesIn++;
    if (this.leavesIn >= LEAVES) this.advance();
  }

  // --- The acts -----------------------------------------------------------

  private advance(): void {
    const i = this.steps.indexOf(this.step);
    this.step = this.steps[Math.min(this.steps.length - 1, i + 1)];
    this.progress = 0;
    this.autoT = 0;
    this.turns.acc = 0;
    this.turns.lift();
    this.stream.visible = false;
    this.cheat = false;
  }

  private act(dt: number): void {
    const auto = this.mode() === 'auto';
    switch (this.step) {
      case 'load':
        if (auto) this.autoLoad();
        break;
      case 'grind':
        if (auto) this.autoGrind(dt);
        else this.handGrind();
        break;
      case 'tip':
        if (auto) this.autoTip(dt);
        else this.handTip(dt);
        break;
      case 'stir':
        if (auto) this.autoStir(dt);
        else this.handStir();
        break;
      case 'pour':
        if (auto) this.autoPour(dt);
        else this.handPour(dt);
        break;
      case 'take':
        if (this.cheat) this.autoTake();
        break;
    }
  }

  private autoLoad(): void {
    for (const leaf of this.leaves) {
      if (this.step !== 'load') break;
      if (leaf.inside) continue;
      if (leaf.heldBy) this.release(leaf.heldBy);
      if (!leaf.inside) this.dropIn(leaf);
    }
  }

  /** The mortar's centre, where it rests, in the world. */
  private mortarCentre(out: Vector3): Vector3 {
    return this.mortar.root.localToWorld(out.set(0, 0, 0));
  }

  private handGrind(): void {
    const side = this.pestle.heldBy;
    if (!side) return;
    const tip = this.pestle.obj.localToWorld(_a.copy(PESTLE.tip));
    const c = this.mortarCentre(_b);
    const d = Math.hypot(tip.x - c.x, tip.z - c.z);
    const inside = d < MORTAR.inner + 0.02 && tip.y < c.y + MORTAR.height + 0.03 && tip.y > c.y - 0.03;
    let halves = 0;
    if (inside) {
      halves += this.turns.feed(tip.x - c.x, tip.z - c.z);
      // Pounding counts too: a quick blow to the bottom is a third of a turn.
      const fall = (this.tipWas.y - tip.y) * 72;
      if (!this.poundLatched && fall > 0.6 && tip.y < c.y + 0.045) {
        this.poundLatched = true;
        halves += this.turns.add((Math.PI * 2) / 3);
        brewSfx.pound(c);
        this.ctx.rig.input.pulse(side, 0.8, 40);
      }
    } else this.turns.lift();
    if (tip.y > c.y + MORTAR.height + 0.01) this.poundLatched = false;
    this.tipWas.copy(tip);
    for (let i = 0; i < halves; i++) {
      brewSfx.crunch(c);
      this.ctx.rig.input.pulse(side, 0.4, 25);
    }
    this.setGrind(this.turns.acc / (TURNS.grind * Math.PI * 2));
  }

  private autoGrind(dt: number): void {
    if (this.pestle.heldBy) this.release(this.pestle.heldBy);
    const T = 1.4;
    const before = this.autoT;
    this.autoT += dt;
    if (this.autoT >= T) {
      this.sendHome(this.pestle);
      return this.setGrind(1);
    }
    const halves = (t: number) => Math.floor((t / T) * TURNS.grind * 2);
    const a = (this.autoT / T) * TURNS.grind * Math.PI * 2;
    this.pestle.back = 0;
    this.mortar.root.add(this.pestle.obj);
    this.pestle.obj.position.set(Math.cos(a) * 0.02, 0.2, Math.sin(a) * 0.02);
    this.pestle.obj.quaternion.copy(LEVEL);
    if (halves(this.autoT) > halves(before)) brewSfx.crunch(this.mortarCentre(_a));
    this.setGrind(this.autoT / T);
  }

  private setGrind(p: number): void {
    this.progress = Math.min(1, p);
    const { powder } = this.mortar;
    powder.visible = this.progress > 0;
    const h = 0.004 + this.progress * 0.024;
    powder.scale.set(1, h, 1);
    powder.position.y = 0.012 + h / 2;
    for (const leaf of this.leaves) if (leaf.inside) leaf.obj.scale.setScalar(Math.max(0.05, 1 - this.progress));
    if (this.progress >= 1) {
      for (const leaf of this.leaves) if (leaf.inside) leaf.obj.visible = false;
      this.advance();
      if (this.variant.tip === 'skip') this.intoPot();
    }
  }

  /** The powder's gone into the pot: the water greens. */
  private intoPot(): void {
    this.mortar.powder.visible = false;
    this.brewColour.setHex(COLOURS.green);
    this.paintBrew(0.1);
  }

  private handTip(dt: number): void {
    const side = this.mortarItem.heldBy;
    if (!side) return;
    this.mortar.root.getWorldQuaternion(_q);
    _up.set(0, 1, 0).applyQuaternion(_q);
    const mouth = this.mortar.root.localToWorld(_a.copy(MORTAR.mouth));
    const top = this.pot.root.localToWorld(_b.set(0, POT.height, 0));
    const over = Math.hypot(mouth.x - top.x, mouth.z - top.z) < 0.15 && mouth.y > top.y - 0.03 && mouth.y < top.y + 0.35;
    const pouring = over && _up.y < 0.45;
    this.showStream(pouring, mouth, top, COLOURS.powder, 0.012);
    if (!pouring) return;
    this.pourPowder(dt / 0.6, top, side);
  }

  private pourPowder(step: number, top: Vector3, side: Handedness | null): void {
    const before = this.progress;
    this.progress = Math.min(1, this.progress + step);
    this.mortar.powder.scale.y = Math.max(0.001, 0.028 * (1 - this.progress));
    if (Math.floor(before * 4) !== Math.floor(this.progress * 4)) {
      brewSfx.powder(top);
      if (side) this.ctx.rig.input.pulse(side, 0.2, 40);
    }
    if (this.progress >= 1) {
      this.intoPot();
      this.stream.visible = false;
      this.advance();
    }
  }

  /** Where the mortar leans to pour into the pot, in the bench's frame. */
  private mortarOverPot(): Place {
    const turn = q(0, -Math.PI / 2, 0).multiply(q(-1.6, 0, 0));
    const lip = new Vector3(0, MORTAR.height, -MORTAR.r).applyQuaternion(turn);
    const at = SPOTS.pot.clone().add(new Vector3(0, POT.height + 0.08, 0)).sub(lip);
    return { parent: this.root, at, turn };
  }

  private autoTip(dt: number): void {
    const item = this.mortarItem;
    if (item.heldBy) this.release(item.heldBy);
    const t0 = this.autoT;
    this.autoT += dt;
    const home = item.home;
    const over = this.mortarOverPot();
    const lifted = over.at.clone().setY(over.at.y + 0.05);
    const o = item.obj;
    item.back = 0;
    if (t0 === 0) brewSfx.swish(this.mortarCentre(_a));
    if (this.autoT < 0.45) {
      const e = ease(this.autoT / 0.45);
      o.position.lerpVectors(home.at, lifted, e);
      o.quaternion.slerpQuaternions(home.turn, LEVEL, e);
    } else {
      const e = ease(Math.min(1, (this.autoT - 0.45) / 0.3));
      o.position.lerpVectors(lifted, over.at, e);
      o.quaternion.slerpQuaternions(LEVEL, over.turn, e);
      if (e >= 1) {
        const top = this.pot.root.localToWorld(_b.set(0, POT.height, 0));
        const lip = this.mortar.root.localToWorld(_a.set(0, MORTAR.height, -MORTAR.r));
        this.showStream(true, lip, top, COLOURS.powder, 0.012);
        this.pourPowder(dt / 0.45, top, null);
        if (this.step !== 'tip') {
          // Done pouring: fly home.
          item.from.at.copy(o.position);
          item.from.turn.copy(o.quaternion);
          item.obj.userData.backFor = 0.4;
          item.back = 0.4;
        }
      }
    }
  }

  private handStir(): void {
    const side = this.spoon.heldBy;
    if (!side) return;
    const tip = this.spoon.obj.localToWorld(_a.copy(SPOON.tip));
    const c = this.pot.root.localToWorld(_b.set(0, 0, 0));
    const d = Math.hypot(tip.x - c.x, tip.z - c.z);
    const inside = d < POT.r && tip.y < c.y + POT.liquid + 0.04 && tip.y > c.y - 0.02;
    if (!inside) {
      this.turns.lift();
      return;
    }
    const halves = this.turns.feed(tip.x - c.x, tip.z - c.z);
    for (let i = 0; i < halves; i++) this.stirBeat(side);
    this.setStir(this.turns.acc / (TURNS.stir * Math.PI * 2));
  }

  private stirBeat(side: Handedness | null): void {
    const top = this.pot.root.localToWorld(_c.set(0, POT.liquid, 0));
    brewSfx.slosh(top);
    brewSfx.bubble(top);
    this.ctx.particles.burst('embers', top, 3, undefined, this.brewColour.getHex());
    if (side) this.ctx.rig.input.pulse(side, 0.25, 30);
  }

  private autoStir(dt: number): void {
    const item = this.spoon;
    if (item.heldBy) this.release(item.heldBy);
    const T = 1.8;
    const before = this.autoT;
    this.autoT += dt;
    const a = (this.autoT / T) * TURNS.stir * Math.PI * 2;
    item.back = 0;
    this.pot.root.add(item.obj);
    item.obj.position.set(Math.cos(a) * 0.04, 0.33, Math.sin(a) * 0.04);
    item.obj.quaternion.copy(q(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12));
    const halves = Math.floor((this.autoT / T) * TURNS.stir * 2) - Math.floor((before / T) * TURNS.stir * 2);
    for (let i = 0; i < halves; i++) this.stirBeat(null);
    this.setStir(this.autoT / T);
  }

  private setStir(p: number): void {
    this.progress = Math.min(1, p);
    // Dropped straight in (C), the leaves melt away as it stirs, and the water greens on the way.
    for (const leaf of this.leaves)
      if (leaf.inside && this.variant.load === 'pot') leaf.obj.scale.setScalar(Math.max(0.05, 1 - this.progress * 1.4));
    const from = this.variant.load === 'pot' ? COLOURS.water : COLOURS.green;
    this.brewColour.setHex(from).lerp(_colour.setHex(COLOURS.brew), this.progress);
    this.paintBrew(0.1 + this.progress * 0.5);
    if (this.progress >= 1) {
      for (const leaf of this.leaves) if (leaf.inside) leaf.obj.visible = false;
      const top = this.pot.root.localToWorld(_c.set(0, POT.liquid + 0.03, 0));
      brewSfx.turn(top);
      this.ctx.particles.burst('magic', top, 24, undefined, COLOURS.brew);
      this.spoon.home = this.spoonOnBench;
      this.sendHome(this.spoon, 0.35);
      this.advance();
    }
  }

  private paintBrew(glow: number): void {
    const m = this.pot.brew.material as ReturnType<typeof tint>;
    m.color.copy(this.brewColour);
    m.emissive.copy(this.brewColour);
    m.emissiveIntensity = glow;
  }

  private handPour(dt: number): void {
    const side = this.potItem.heldBy;
    if (!side) return;
    this.pot.root.getWorldQuaternion(_q);
    _up.set(0, 1, 0).applyQuaternion(_q);
    const spout = this.pot.root.localToWorld(_a.copy(POT.spout));
    const mouth = this.flaskItem.obj.localToWorld(_b.copy(FLASK.mouth));
    const over = Math.hypot(spout.x - mouth.x, spout.z - mouth.z) < 0.07 && spout.y > mouth.y - 0.01 && spout.y < mouth.y + 0.35;
    const pouring = over && _up.y < 0.8;
    this.showStream(pouring, spout, mouth, COLOURS.brew, 0.007);
    if (pouring) this.fill(dt / 1.1, mouth, side);
  }

  /** Where the pot leans to pour into the flask, in the bench's frame. */
  private potOverFlask(): Place {
    const turn = q(0, -Math.PI / 2, 0).multiply(q(-1.1, 0, 0));
    const spout = POT.spout.clone().applyQuaternion(turn);
    const at = SPOTS.flask.clone().add(FLASK.mouth).add(new Vector3(0, 0.05, 0)).sub(spout);
    return { parent: this.root, at, turn };
  }

  private autoPour(dt: number): void {
    const item = this.potItem;
    if (item.heldBy) this.release(item.heldBy);
    const t0 = this.autoT;
    this.autoT += dt;
    const home = item.home;
    const over = this.potOverFlask();
    const lifted = over.at.clone().setY(over.at.y + 0.04);
    const o = item.obj;
    item.back = 0;
    if (t0 === 0) brewSfx.swish(this.pot.root.getWorldPosition(_a));
    if (this.autoT < 0.5) {
      const e = ease(this.autoT / 0.5);
      o.position.lerpVectors(home.at, lifted, e);
    } else {
      const e = ease(Math.min(1, (this.autoT - 0.5) / 0.3));
      o.position.lerpVectors(lifted, over.at, e);
      o.quaternion.slerpQuaternions(home.turn, over.turn, e);
      if (e >= 1) {
        const spout = this.pot.root.localToWorld(_a.copy(POT.spout));
        const mouth = this.flaskItem.obj.localToWorld(_b.copy(FLASK.mouth));
        this.showStream(true, spout, mouth, COLOURS.brew, 0.007);
        this.fill(dt / 1.0, mouth, null);
        if (this.step !== 'pour') {
          item.from.at.copy(o.position);
          item.from.turn.copy(o.quaternion);
          item.obj.userData.backFor = 0.5;
          item.back = 0.5;
        }
      }
    }
  }

  private fill(step: number, mouth: Vector3, side: Handedness | null): void {
    this.progress = Math.min(1, this.progress + step);
    const f = this.flaskItem.flask!;
    f.brew.scale.setScalar(Math.max(0.001, Math.cbrt(this.progress)));
    f.brew.position.y = 0.038 - 0.03 * (1 - this.progress);
    this.pot.brew.position.y = POT.liquid - this.progress * 0.07;
    this.pot.brew.scale.setScalar(1 - this.progress * 0.3);
    this.trickleT -= 1 / 72;
    if (this.trickleT <= 0) {
      this.trickleT = 0.12;
      brewSfx.trickle(mouth);
      if (side) this.ctx.rig.input.pulse(side, 0.15, 30);
    }
    if (this.progress >= 1) this.corked(mouth);
  }

  private corked(mouth: Vector3): void {
    const f = this.flaskItem.flask!;
    f.cork.visible = true;
    (f.brew.material as ReturnType<typeof tint>).emissiveIntensity = 0.8;
    this.pot.brew.visible = false;
    this.stream.visible = false;
    brewSfx.cork(mouth);
    this.ctx.particles.burst('embers', mouth, 10, undefined, 0xff5a40);
    this.last = this.clock - this.startedAt;
    this.times.push(this.last);
    this.ctx.floats.spawn(`${this.last.toFixed(1)} s`, mouth.clone().setY(mouth.y + 0.12), {
      color: '#ffd23a',
      scale: 0.05,
      life: 2.5,
      rise: 0.15,
    });
    this.advance();
  }

  private autoTake(): void {
    const slot = this.slots.find((s) => !this.inSlot(s));
    const item = this.flaskItem;
    if (item.heldBy) return;
    this.cheat = false;
    item.flask!.onTable = false;
    if (slot) {
      item.home = this.place(slot, 0, 0.02, 0);
      brewSfx.belt();
      this.sendHome(item, 0.4);
    } else this.remove(item);
    this.resetIn = 0.8;
  }

  private showStream(on: boolean, from: Vector3, to: Vector3, colour: number, r: number): void {
    this.stream.visible = on;
    if (!on) return;
    const a = this.root.worldToLocal(_c.copy(from));
    const b = this.root.worldToLocal(new Vector3().copy(to));
    const len = a.distanceTo(b);
    this.stream.position.addVectors(a, b).multiplyScalar(0.5);
    this.stream.quaternion.setFromUnitVectors(_up.set(0, 1, 0), b.sub(a).normalize());
    this.stream.scale.set(r, Math.max(0.001, len), r);
    const m = this.stream.material as ReturnType<typeof tint>;
    m.color.setHex(colour);
    m.emissive.setHex(colour);
  }

  // --- Taking the potion --------------------------------------------------

  private freeSlotNear(item: Item): Group | null {
    const at = item.obj.getWorldPosition(_a);
    for (const slot of this.slots) {
      if (this.inSlot(slot) && item.home.parent !== slot) continue;
      if (slot.getWorldPosition(_b).distanceTo(at) < 0.18) return slot;
    }
    return null;
  }

  /** Held to your mouth for a moment, a potion is drunk: unless they're all cooling down. */
  private drink(dt: number): void {
    const { camera, floats, rig } = this.ctx;
    for (const side of ['left', 'right'] as const) {
      const item = this.held[side];
      if (item?.kind !== 'flask' || !item.flask!.cork.visible) continue;
      const head = camera.getWorldPosition(_a);
      camera.getWorldDirection(_c);
      // Inventory's mouth point (?belt): 13 cm below and 10 cm in front of the eyes.
      const mouth = head.addScaledVector(_c.setY(0).normalize(), 0.1).setY(head.y - 0.13);
      const near = item.obj.localToWorld(_b.copy(FLASK.mouth)).distanceTo(mouth) < 0.15;
      if (!near) {
        this.drinkT = 0;
        continue;
      }
      if (this.drinkT < 0) continue;
      this.drinkT += dt;
      if (this.drinkT < 0.7) continue;
      this.drinkT = -1;
      if (this.cooldown > 0) {
        brewSfx.nope();
        floats.banner(camera, `Not yet: ${Math.ceil(this.cooldown)} s`, '#c8c0b0', 0.08, -0.25, 1.4);
        continue;
      }
      brewSfx.gulp();
      rig.input.pulse(side, 0.5, 300);
      floats.banner(camera, 'Healed', '#6ef070', 0.12, -0.2, 2);
      this.cooldown = COOLDOWN;
      const wasTable = item.home.parent === this.root;
      this.held[side] = null;
      this.remove(item);
      if (wasTable) this.resetIn = 0.6;
    }
  }

  private remove(item: Item): void {
    item.obj.removeFromParent();
    this.items.splice(this.items.indexOf(item), 1);
  }

  private dimBelt(): void {
    for (const item of this.items) {
      if (item.kind !== 'flask' || item.home.parent === this.root) continue;
      const m = item.flask!.brew.material as ReturnType<typeof tint>;
      m.emissiveIntensity = this.cooldown > 0 ? 0.05 : 0.8;
      item.flask!.glass.opacity = this.cooldown > 0 ? 0.25 : 0.4;
    }
  }

  /** Keep the pot's brew level however the pot is held. */
  private levelBrew(): void {
    this.pot.root.getWorldQuaternion(_q);
    this.pot.brew.quaternion.copy(_q).invert();
  }

  /** Ready for the next brew: leaves on the tray, water in the pot, an empty flask on the stand. */
  private reset(): void {
    this.step = 'load';
    this.progress = 0;
    this.leavesIn = 0;
    this.autoT = 0;
    this.turns.acc = 0;
    this.cheat = false;
    for (const [i, item] of this.leaves.entries()) {
      if (item.heldBy) continue;
      item.inside = false;
      item.obj.visible = true;
      item.obj.scale.setScalar(1);
      item.home = this.place(this.root, SPOTS.tray.x - 0.06 + i * 0.06, SPOTS.tray.y + 0.014 + i * 0.004, SPOTS.tray.z + (i - 1) * 0.035, 0, 0.3 * (i - 1), 0);
      this.settle(item);
    }
    this.mortar.powder.visible = false;
    this.pot.brew.visible = true;
    this.pot.brew.position.y = POT.liquid;
    this.pot.brew.scale.setScalar(1);
    this.brewColour.setHex(COLOURS.water);
    this.paintBrew(0.05);
    this.spoon.home = this.spoonInPot;
    if (!this.spoon.heldBy) this.settle(this.spoon);
    this.newFlask();
  }

  /** Put down whatever's held: the scaffold calls it before throwing the station away. */
  dispose(): void {
    for (const side of ['left', 'right'] as const) if (this.held[side]) this.held[side]!.obj.removeFromParent();
    this.root.removeFromParent();
    this.belt.removeFromParent();
  }
}

const _colour = new Color();

function ease(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}
