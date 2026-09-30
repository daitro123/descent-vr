import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  RingGeometry,
  type Scene,
  Vector3,
} from 'three';
import { FloatingText } from '../../../fx/floatingText';
import { Particles } from '../../../fx/particles';
import { sfx } from '../../../fx/sfx';
import type { VillagerSpot } from '../../../maps/types';
import { SMITHY } from '../../../maps/forest/smithy';
import { Card, FONT, parchment, wrap } from '../../../ui/card';
import type { World } from '../../../world/world';
import { RecipeBoard } from './board';
import { type Bag, NAMES, Piece, type Recipe, RECIPES, STARTING_BAG } from './pieces';
import { type Smith, TONGS_JAW } from './rig';
import * as sound from './sounds';

// PROTOTYPE (Hammering at the anvil): the smithy as a station. Everything the
// three variants share: the forge's crucible and fire, the anvil, a quench
// bucket, a tray standing in for the bag, the tongs to move things and the
// hammer to strike them. A variant only picks how you choose what to make (a
// board, or laying materials down) and how a strike counts (marked spots, or
// a beat). Throwaway.

export interface Setup {
  readonly key: string;
  readonly name: string;
  /** One line on how it works, shown when you switch to it. */
  readonly how: string;
  /** Pick the recipe on a board (materials come out of the bag), or lay the materials on the station by hand. */
  readonly choose: 'board' | 'lay';
  /** A strike counts on a glowing mark, or on the beat. */
  readonly hammering: 'marks' | 'beat';
}

/** Every number to tune on the headset. */
export const TUNE = {
  /** Downward speed of the hammer's face (m/s) under which a strike is only a tap. */
  tapSpeed: 1.2,
  /** …and over which it's a great strike (a good one between). */
  greatSpeed: 2.2,
  /** How far the face must come down onto the work (m) for a strike to count at all. */
  minTravel: 0.08,
  /** How far it must lift off again (m) before the next strike. */
  rearm: 0.04,
  /** How close to a mark (m) a strike must land to work it. */
  markReach: 0.04,
  /** The beat's period (s), and how far off it (s) a strike still counts. */
  beat: 0.8,
  beatWindow: 0.13,
  /**
   * Seconds in the fire from cold to full heat, and out of it from full heat
   * to cold: fresh from the fire it stays workable (over WORKING_HEAT) for
   * about 10 s, enough for the gauntlets' ten good strikes at a steady pace.
   */
  heatUp: 1.5,
  coolDown: 14,
  /** Seconds two ore take to become a bar. */
  smelt: 3,
  /** The hammer and tongs come from the loop within this of the anvil (m), and go back past `walkOff`. */
  drawNear: 3,
  walkOff: 5,
};

/** Where things are, in the smithy's frame (smithy.ts: its floor's centre, the open front +Z). */
const AT = {
  /** Where the smith stands, facing the anvil and the open front. */
  stand: SMITHY.smith,
  anvil: { x: SMITHY.anvil.x, y: 0.745, z: SMITHY.anvil.z, hw: 0.25, hd: 0.1 },
  fire: { x: -2.0, y: 1.0, z: -1.45, r: 0.4 },
  crucible: { x: -1.62, y: 1.0, z: -1.3, r: 0.2 },
  mould: { x: -1.42, y: 1.0, z: -1.18 },
  /** A bucket beside the anvil (the prototype's): the smithy's barrel is across the room. */
  bucket: { x: 0.45, z: -0.5, r: 0.17, water: 0.56 },
  barrel: { x: SMITHY.barrel.x, z: SMITHY.barrel.z, r: SMITHY.barrel.r, water: 0.83 },
  tray: { x: 0.62, y: 0.86, z: -1.15 },
  board: { x: 0.5, y: 1.2, z: -0.1 },
  status: { x: -0.35, y: 1.45, z: 0.4 },
} as const;
const STACKS: Record<'ore' | 'stone' | 'bar', number> = { ore: -0.11, stone: 0, bar: 0.11 };

const _w = new Vector3();
const _v = new Vector3();
const _j = new Vector3();
const _h = new Vector3();

type Spot = 'crucible' | 'fire' | 'anvil';
type Drop = Spot | 'tray' | 'air';

export class Station {
  /** The smithy's frame: everything here is placed in it. */
  readonly frame = new Group();
  bag: Bag = { ...STARTING_BAG };
  pieces: Piece[] = [];
  held: Piece | null = null;
  setup!: Setup;
  /** What happened, newest last: for the console and scripted checks. */
  readonly events: string[] = [];
  private readonly particles: Particles;
  private readonly floats: FloatingText;
  private readonly board = new RecipeBoard();
  private readonly status = new Card(0.5, 0.21);
  private readonly bagCard = new Card(0.36, 0.1);
  private readonly stacks: Record<'ore' | 'stone' | 'bar', Group> = { ore: new Group(), stone: new Group(), bar: new Group() };
  private readonly beatRing: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly beatTarget: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly crucibleGlow: Mesh<CircleGeometry, MeshBasicMaterial>;
  private smelting = 0;
  private beatPhase = 0;
  private note = { text: '', t: 0 };
  private squeezeWas = false;
  private inWater = false;
  private sparkTimer = 0;
  private readonly flying: { piece: Piece; t: number; from: Vector3 }[] = [];
  private toBagLater: { piece: Piece; t: number }[] = [];
  // The hammer's face, tracked in the frame.
  private readonly face = new Vector3();
  private readonly facePrev = new Vector3();
  private readonly faceVel = new Vector3();
  private faceValid = false;
  private strokeTop = 0;
  private armed = true;

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    private readonly smith: Smith,
    spot: VillagerSpot,
  ) {
    // The smithy's origin, from where the smith stands in it.
    const c = Math.cos(spot.yaw);
    const s = Math.sin(spot.yaw);
    const ox = spot.x - (AT.stand.x * c + AT.stand.z * s);
    const oz = spot.z - (-AT.stand.x * s + AT.stand.z * c);
    this.frame.position.set(ox, 0, oz);
    this.frame.rotation.y = spot.yaw;
    this.frame.updateMatrixWorld(true);
    this.frame.position.y = world.heightAt(...this.worldXZ(AT.anvil.x, AT.anvil.z));
    this.frame.name = 'anvil-prototype';
    scene.add(this.frame);
    this.frame.updateMatrixWorld(true);
    this.particles = new Particles(scene);
    this.floats = new FloatingText(scene);
    this.buildProps();

    this.beatRing = new Mesh(new RingGeometry(0.92, 1, 40), new MeshBasicMaterial({ color: 0xffd23a, fog: false, transparent: true }));
    this.beatTarget = new Mesh(new RingGeometry(0.9, 1, 40), new MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.35 }));
    for (const r of [this.beatRing, this.beatTarget]) {
      r.rotation.x = -Math.PI / 2;
      r.position.set(AT.anvil.x, AT.anvil.y, AT.anvil.z);
      this.frame.add(r);
    }
    this.beatTarget.scale.setScalar(0.07);
    this.crucibleGlow = this.frame.getObjectByName('crucible-glow') as Mesh<CircleGeometry, MeshBasicMaterial>;

    this.status.mesh.position.set(AT.status.x, AT.status.y, AT.status.z);
    this.status.mesh.rotation.y = Math.PI;
    this.frame.add(this.status.mesh);
    this.bagCard.mesh.position.set(AT.tray.x + 0.2, AT.tray.y + 0.16, AT.tray.z);
    this.bagCard.mesh.rotation.y = -Math.PI / 2;
    this.frame.add(this.bagCard.mesh);
    this.board.root.position.set(AT.board.x, AT.board.y, AT.board.z);
    this.frame.add(this.board.root);
    this.frame.updateMatrixWorld(true);
    this.board.root.lookAt(this.toWorld(AT.stand.x, 1.45, AT.stand.z, new Vector3()));
  }

  /** Where the smith stands in the world, and which way they face (the rig's yaw: 0 looks down −Z). */
  get stand(): { x: number; z: number; yaw: number } {
    const [x, z] = this.worldXZ(AT.stand.x, AT.stand.z);
    return { x, z, yaw: this.frame.rotation.y + Math.PI };
  }

  /** Start over for a variant: a full bag, nothing on the station. */
  reset(setup: Setup): void {
    this.setup = setup;
    for (const p of this.pieces) p.root.removeFromParent();
    for (const f of this.flying) f.piece.root.removeFromParent();
    this.pieces = [];
    this.flying.length = 0;
    this.toBagLater = [];
    this.held = null;
    this.bag = { ...STARTING_BAG };
    this.smelting = 0;
    this.beatPhase = 0;
    this.note = { text: '', t: 0 };
    this.board.root.visible = setup.choose === 'board';
    this.smith.setTools(false);
    this.particles.clear();
    this.events.length = 0;
  }

  // ─── The frame ───

  private worldXZ(lx: number, lz: number): [number, number] {
    this.toWorld(lx, 0, lz, _w);
    return [_w.x, _w.z];
  }

  private toWorld(lx: number, y: number, lz: number, out: Vector3): Vector3 {
    return this.frame.localToWorld(out.set(lx, y, lz));
  }

  private headDistance(): number {
    this.smith.head(_h);
    this.frame.worldToLocal(_h);
    return Math.hypot(_h.x - AT.stand.x, _h.z - AT.stand.z);
  }

  // ─── Each frame ───

  /** One frame. `loopGrip`: the right hand gripped in the tool loop. */
  update(dt: number, loopGrip: boolean, xr: boolean): void {
    const away = this.headDistance();
    if (loopGrip) {
      if (away < TUNE.drawNear) {
        this.smith.setTools(!this.smith.tools);
        this.events.push(this.smith.tools ? 'tools:out' : 'tools:away');
        if (!this.smith.tools && this.held) this.returnHome(this.held);
      } else this.say('Nothing to use a hammer on here.');
    }
    if (this.smith.tools && away > TUNE.walkOff) {
      // Walked off mid-work: the tools go back, and what was in the tongs back where it lay.
      if (this.held) this.returnHome(this.held);
      this.smith.setTools(false);
      this.events.push('tools:walkedOff');
    }

    if (this.smith.tools && xr) this.tongsFrame();
    if (this.setup.choose === 'board') this.boardFrame(dt, xr);
    if (this.smith.tools && xr) this.hammerFrame(dt);
    else this.faceValid = false;

    this.heatAndSmelt(dt);
    this.beatFrame(dt);
    for (const p of this.pieces) {
      p.update(dt);
      p.shape(this.setup.hammering === 'marks' && p.place === 'anvil');
    }
    this.flyFrame(dt);
    this.note.t = Math.max(0, this.note.t - dt);
    this.paintCards();
    this.particles.update(dt);
    this.floats.update(dt);
  }

  /** Grip with the tongs to pick up; let go to put down. */
  private tongsFrame(): void {
    const squeeze = this.smith.squeeze;
    const down = squeeze > 0.6;
    this.smith.jaw(_j);
    this.frame.worldToLocal(_j);
    if (down && !this.squeezeWas && !this.held) this.grabAt(_j);
    if (this.held && squeeze < 0.35) this.letGo(this.dropAt(_j));
    this.squeezeWas = down;
    // Dipped in the bucket (or the barrel).
    const wet = !!this.held && [AT.bucket, AT.barrel].some((b) => Math.hypot(_j.x - b.x, _j.z - b.z) < b.r && _j.y < b.water);
    if (wet && !this.inWater) this.dunk();
    this.inWater = wet;
  }

  /** What's at the jaws: a piece on a spot, or (laying things by hand) a stack on the tray. */
  private grabAt(j: Vector3): void {
    let best: Piece | null = null;
    let bestD = 0.15;
    for (const p of this.pieces) {
      if (p.place === 'held' || p.place === 'toBag' || (p.place === 'crucible' && this.smelting > 0)) continue;
      p.root.getWorldPosition(_v);
      this.frame.worldToLocal(_v);
      const d = Math.hypot(j.x - _v.x, j.z - _v.z);
      if (d < bestD && Math.abs(j.y - (_v.y + p.top / 2)) < 0.1) {
        best = p;
        bestD = d;
      }
    }
    if (best) {
      this.pickUp(best);
      return;
    }
    for (const mat of ['ore', 'stone', 'bar'] as const) {
      if (Math.hypot(j.x - AT.tray.x, j.z - (AT.tray.z + STACKS[mat])) < 0.07 && Math.abs(j.y - AT.tray.y - 0.03) < 0.1) {
        this.takeFromBag(mat);
        return;
      }
    }
  }

  private dropAt(j: Vector3): Drop {
    const { crucible, fire, anvil, tray } = AT;
    if (Math.hypot(j.x - crucible.x, j.z - crucible.z) < crucible.r && j.y < crucible.y + 0.35) return 'crucible';
    if (Math.hypot(j.x - fire.x, j.z - fire.z) < fire.r && j.y < fire.y + 0.45) return 'fire';
    if (Math.abs(j.x - anvil.x) < anvil.hw + 0.08 && Math.abs(j.z - anvil.z) < anvil.hd + 0.12 && j.y < anvil.y + 0.3) return 'anvil';
    if (Math.hypot(j.x - tray.x, j.z - tray.z) < 0.25 && Math.abs(j.y - tray.y) < 0.3) return 'tray';
    return 'air';
  }

  // ─── Moving things (the tongs, the board, and the console all come through here) ───

  /** Pick up a piece in the tongs. */
  pickUp(piece: Piece): void {
    if (piece.place !== 'toBag' && piece.place !== 'held') piece.home = piece.place;
    piece.place = 'held';
    this.held = piece;
    this.smith.tongs.model.add(piece.root);
    piece.root.position.copy(TONGS_JAW).add(_v.set(0, -piece.top / 2, -0.05));
    piece.root.rotation.set(0, Math.PI / 2, 0);
    this.smith.input.pulse('left', 0.3, 20);
    this.events.push(`grab:${piece.kind}`);
  }

  /** Laying by hand: take from the bag what the recipe that uses it needs (two ore, a stone, four bars). */
  takeFromBag(mat: 'ore' | 'stone' | 'bar'): Piece | null {
    if (this.setup.choose === 'board') {
      this.say('Choose what to make on the board.');
      return null;
    }
    const want = { ore: 2, stone: 1, bar: 4 }[mat];
    const n = Math.min(want, this.bag[mat]);
    if (n <= 0) {
      this.say(`No ${NAMES[mat][1]} left in your bag.`);
      sound.nope();
      return null;
    }
    this.bag[mat] -= n;
    const piece = new Piece(mat === 'bar' ? 'bars' : mat, n);
    piece.home = 'bag';
    this.pieces.push(piece);
    this.pickUp(piece);
    return piece;
  }

  /** Let go of what's in the tongs, over `where`. */
  letGo(where: Drop): void {
    const piece = this.held;
    if (!piece) return;
    this.held = null;
    this.events.push(`drop:${piece.kind}:${where}`);
    if (where === 'tray' || where === 'air') {
      if (piece.asMaterial) this.toBag(piece);
      else {
        this.say(piece.workDone ? 'Quench it first, in the bucket by the anvil.' : 'Lay it on the anvil or in the fire.');
        this.returnHome(piece);
      }
      return;
    }
    if (!this.put(piece, where)) this.returnHome(piece);
  }

  /** Put a piece on a spot, if it goes there. False if it doesn't (and why is said). */
  put(piece: Piece, spot: Spot): boolean {
    if (this.pieces.some((p) => p !== piece && p.place === spot)) {
      this.say(`Something is already ${spot === 'anvil' ? 'on the anvil' : `in the ${spot}`}.`);
      return false;
    }
    const k = piece.kind;
    if (spot === 'crucible') {
      if (k !== 'ore') return this.refuse('Only ore goes in the crucible.');
      if (piece.count < 2) return this.refuse('Two copper ore make a bar.');
      this.smelting = TUNE.smelt;
    } else if (spot === 'fire') {
      if (k === 'ore') return this.refuse('Ore goes in the crucible, at the front of the forge.');
      if (k === 'stone' || k === 'whetstone') return this.refuse("Stone isn't heated: lay it on the anvil.");
      if (k === 'gauntlets' && piece.made) return this.refuse("It's done: let go of it and it goes in your bag.");
      if (k === 'bars') {
        if (piece.count < 4) return this.refuse('Four copper bars make a pair of gauntlets.');
        piece.startWork('gauntlets');
      }
    } else {
      if (k === 'ore') return this.refuse('Ore goes in the crucible, at the front of the forge.');
      if (k === 'stone' && !piece.work) piece.startWork('whetstone');
      if (k === 'bars') {
        if (piece.count < 4) return this.refuse('Four copper bars make a pair of gauntlets.');
        piece.startWork('gauntlets');
      }
    }
    const at = spot === 'crucible' ? { x: AT.crucible.x, y: AT.crucible.y + 0.03, z: AT.crucible.z } : AT[spot];
    piece.place = spot;
    piece.home = spot;
    this.frame.add(piece.root);
    piece.root.position.set(at.x, at.y, at.z);
    piece.root.rotation.set(0, spot === 'fire' ? 0.5 : 0, 0);
    this.smith.input.pulse('left', 0.35, 25);
    this.events.push(`put:${piece.kind}:${spot}`);
    return true;
  }

  private refuse(why: string): false {
    this.say(why);
    sound.nope();
    return false;
  }

  /** Back where it lay; or, if that's taken or it came from the bag, into the bag (work in hand stays at the station). */
  private returnHome(piece: Piece): void {
    if (this.held === piece) this.held = null;
    const home = piece.home;
    if (home === 'crucible' || home === 'fire' || home === 'anvil') {
      const quiet = this.note;
      if (this.put(piece, home)) return;
      this.note = quiet;
    }
    if (piece.asMaterial) return this.toBag(piece);
    for (const spot of ['anvil', 'fire'] as const) if (this.put(piece, spot)) return;
  }

  /** Into the bag: it flies to your hip and is counted. */
  private toBag(piece: Piece): void {
    const got = piece.asMaterial;
    if (!got) return;
    const [mat, n] = got;
    this.bag[mat] += n;
    if (this.held === piece) this.held = null;
    piece.place = 'toBag';
    const from = piece.root.getWorldPosition(new Vector3());
    this.scene.attach(piece.root);
    this.flying.push({ piece, t: 0, from });
    sfx.pickup();
    this.floats.spawn(`+${n} ${n === 1 ? NAMES[mat][0] : NAMES[mat][1]}`, from.clone().setY(from.y + 0.12), { color: '#e8e0c8', scale: 0.045, life: 1.4, rise: 0.25 });
    this.events.push(`bag:${mat}:${n}`);
  }

  private flyFrame(dt: number): void {
    for (let i = this.toBagLater.length - 1; i >= 0; i--) {
      const later = this.toBagLater[i];
      later.t -= dt;
      if (later.t > 0) continue;
      this.toBagLater.splice(i, 1);
      if (later.piece.place !== 'toBag') this.toBag(later.piece);
    }
    this.smith.loop.getWorldPosition(_h);
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt / 0.35;
      const t = Math.min(1, f.t);
      f.piece.root.position.lerpVectors(f.from, _h, t * t);
      f.piece.root.scale.setScalar(1 - 0.7 * t);
      if (t >= 1) {
        f.piece.root.removeFromParent();
        this.pieces = this.pieces.filter((p) => p !== f.piece);
        this.flying.splice(i, 1);
      }
    }
  }

  // ─── Choosing on the board (variant A) ───

  private boardFrame(dt: number, xr: boolean): void {
    this.board.paint(this.bag);
    const probes: (Vector3 | null)[] = [];
    if (xr) {
      if (this.smith.tools) probes.push(this.smith.hammerFace(new Vector3()), this.smith.jaw(new Vector3()));
      else probes.push(this.smith.sword.tip.valid ? this.smith.sword.tip.worldNow(this.smith.rig, new Vector3()) : null, null);
      for (const hand of ['left', 'right'] as const) probes.push(this.smith.input.hands[hand].grip.getWorldPosition(new Vector3()));
    }
    const pick = this.board.update(dt, probes);
    if (pick) this.choose(pick);
  }

  /** The board: take the recipe's materials out of the bag and set them on the station. */
  choose(recipe: Recipe): boolean {
    const r = RECIPES[recipe];
    this.events.push(`choose:${recipe}`);
    if (this.bag[r.takes] < r.n) return this.refuse(`${r.label} takes ${r.n} ${NAMES[r.takes][1]}; you have ${this.bag[r.takes]}.`);
    const spot: Spot = recipe === 'bar' ? 'crucible' : recipe === 'whetstone' ? 'anvil' : 'fire';
    if (spot === 'crucible' && this.smelting > 0) return this.refuse('The crucible is still smelting.');
    const piece = new Piece(recipe === 'bar' ? 'ore' : recipe === 'whetstone' ? 'stone' : 'bars', r.n);
    if (!this.put(piece, spot)) return false;
    this.bag[r.takes] -= r.n;
    this.pieces.push(piece);
    this.say(recipe === 'gauntlets' ? 'The bars are in the fire. When they glow, take them to the anvil with the tongs.' : '');
    return true;
  }

  // ─── The hammer ───

  private hammerFrame(dt: number): void {
    this.smith.hammerFace(this.face);
    this.frame.worldToLocal(this.face);
    if (!this.faceValid || dt <= 0) {
      this.facePrev.copy(this.face);
      this.faceVel.set(0, 0, 0);
      this.faceValid = true;
      this.strokeTop = this.face.y;
      return;
    }
    _v.subVectors(this.face, this.facePrev).divideScalar(dt);
    this.faceVel.lerp(_v, 0.6);
    const { anvil } = AT;
    const piece = this.onAnvil();
    const surface = anvil.y + (piece ? piece.top : 0);
    if (!this.armed) {
      if (this.face.y > surface + TUNE.rearm) {
        this.armed = true;
        this.strokeTop = this.face.y;
      }
    } else {
      this.strokeTop = Math.max(this.strokeTop, this.face.y);
      const over = Math.abs(this.face.x - anvil.x) < anvil.hw + 0.04 && Math.abs(this.face.z - anvil.z) < anvil.hd + 0.05;
      if (over && this.facePrev.y > surface && this.face.y <= surface) {
        const speed = Math.max(-this.faceVel.y, -_v.y);
        this.strike(speed, this.strokeTop - surface, this.face.x - anvil.x, this.face.z - anvil.z);
        this.armed = false;
      }
    }
    this.facePrev.copy(this.face);
  }

  private onAnvil(): Piece | null {
    return this.pieces.find((p) => p.place === 'anvil') ?? null;
  }

  /**
   * A strike on the anvil, `speed` m/s downward after coming down `travel` m,
   * landing (x, z) from the anvil's middle. A tap only clinks; a good strike
   * works a mark halfway (or counts half on the beat); a great one all the way.
   */
  strike(speed: number, travel: number, x: number, z: number): string {
    const piece = this.onAnvil();
    const at = this.toWorld(AT.anvil.x + x, AT.anvil.y + (piece?.top ?? 0), AT.anvil.z + z, new Vector3());
    const grade = travel < TUNE.minTravel || speed < TUNE.tapSpeed ? 'tap' : speed >= TUNE.greatSpeed ? 'great' : 'good';
    const result = this.judge(piece, grade, x, z);
    this.events.push(`strike:${grade}:${result}`);
    const stone = piece?.work?.recipe === 'whetstone';
    const q = grade === 'great' ? 1 : 0.55;
    if (grade === 'tap') {
      sound.clink(at);
      this.smith.input.pulse('right', 0.15, 20);
    } else if (result === 'worked') {
      if (stone) {
        sound.crack(at, q);
        this.particles.burst('dust', at, grade === 'great' ? 10 : 5, undefined, 0x8a8880);
        this.particles.burst('sparks', at, grade === 'great' ? 8 : 3, undefined, 0xfff0c0);
      } else {
        sound.ring(at, q);
        this.particles.burst('sparks', at, grade === 'great' ? 34 : 14);
      }
      if (grade === 'great') piece?.flashNow();
      this.smith.input.pulse('right', grade === 'great' ? 1 : 0.6, grade === 'great' ? 70 : 40);
      this.floats.spawn(grade === 'great' ? 'GREAT' : 'GOOD', at.clone().setY(at.y + 0.1), { color: grade === 'great' ? '#ffd23a' : '#e8e0c8', scale: 0.04, life: 0.7, rise: 0.15 });
      if (piece?.workDone) this.finishWork(piece);
    } else {
      // Cold, off the mark, off the beat, or nothing to work: small sparks and a thinner sound.
      if (result === 'cold') sound.clink(at);
      else sound.ring(at, 0.15);
      this.particles.burst('sparks', at, result === 'cold' ? 2 : 4, undefined, result === 'cold' ? 0xb08050 : undefined);
      this.smith.input.pulse('right', 0.35, 30);
      const word = { cold: 'COLD', miss: 'MISS', offbeat: 'OFF BEAT', idle: '' }[result];
      if (word) this.floats.spawn(word, at.clone().setY(at.y + 0.1), { color: '#a0a0a0', scale: 0.035, life: 0.6, rise: 0.12 });
      if (result === 'cold') this.say('Too cold to work. Put it back in the fire until it glows.');
    }
    return `${grade}:${result}`;
  }

  private judge(piece: Piece | null, grade: string, x: number, z: number): 'worked' | 'cold' | 'miss' | 'offbeat' | 'idle' {
    const w = piece?.work;
    if (!piece || !w || piece.workDone || grade === 'tap') return 'idle';
    if (piece.needsHeat && !piece.hot) return 'cold';
    const great = grade === 'great';
    if (this.setup.hammering === 'marks') {
      let mark = null;
      let best = TUNE.markReach;
      for (const m of w.marks) {
        const d = Math.hypot(x - m.x, z - m.z);
        if (m.value < 1 && d <= best) {
          mark = m;
          best = d;
        }
      }
      if (!mark) return 'miss';
      const gain = Math.min(1 - mark.value, great ? 1 : 0.5);
      mark.value += gain;
      w.units += gain;
      return 'worked';
    }
    const off = Math.min(this.beatPhase, TUNE.beat - this.beatPhase);
    if (off > TUNE.beatWindow) return 'offbeat';
    const gain = Math.min(w.need - w.units, great ? 1 : 0.5);
    w.units += gain;
    piece.dentInOrder(gain);
    return 'worked';
  }

  /** Every mark worked (or every beat struck): the whetstone is made; the gauntlets want quenching. */
  private finishWork(piece: Piece): void {
    piece.finish();
    this.events.push(`worked:${piece.kind}`);
    if (piece.kind === 'whetstone') this.made(piece);
    else this.say('Shaped. Quench it: take it with the tongs and dip it in the bucket.');
  }

  /** Dip what's in the tongs: it hisses and cools; worked gauntlets are made. */
  dunk(): void {
    const piece = this.held;
    if (!piece) return;
    this.smith.jaw(_j);
    if (piece.heat > 0.05) {
      sound.hiss(_j);
      this.particles.burst('dust', _j, 16, undefined, 0xe8e8e8);
      this.smith.input.pulse('left', 0.3, 300);
    }
    piece.heat = 0;
    this.events.push(`dunk:${piece.kind}`);
    if (piece.kind === 'gauntlets' && piece.workDone && !piece.made) {
      piece.quench();
      this.made(piece);
    }
  }

  /** Something made: +1 Smithing, and it goes to the bag (board) or waits to be taken (by hand). */
  private made(piece: Piece): void {
    sound.made();
    piece.root.getWorldPosition(_v);
    this.floats.spawn('+1 Smithing', _v.clone().setY(_v.y + 0.2), { color: '#9ad8ff', scale: 0.05, life: 1.8, rise: 0.3 });
    this.events.push(`made:${piece.kind}`);
    if (this.setup.choose === 'board') this.toBagLater.push({ piece, t: piece.place === 'held' ? 0.5 : 0.9 });
    else this.say(piece.place === 'held' ? 'Made. Let go of it and it goes in your bag.' : 'Made. Take it with the tongs; let go and it goes in your bag.');
  }

  // ─── Heat, smelting and the beat ───

  private heatAndSmelt(dt: number): void {
    for (const p of this.pieces) {
      const takesHeat = p.kind === 'bars' || p.kind === 'bar' || p.kind === 'blank' || (p.kind === 'gauntlets' && !p.made);
      if (!takesHeat) continue;
      if (p.place === 'fire') p.heat = Math.min(1, p.heat + dt / TUNE.heatUp);
      else p.heat = Math.max(0, p.heat - dt / TUNE.coolDown);
    }
    const glow = this.smelting > 0 ? 0.6 + 0.4 * Math.sin(performance.now() / 90) : 0;
    this.crucibleGlow.material.color.setRGB(0.2 + glow * 0.8, 0.1 + glow * 0.45, 0.05 + glow * 0.05);
    if (this.smelting <= 0) return;
    this.smelting -= dt;
    this.sparkTimer -= dt;
    this.toWorld(AT.crucible.x, AT.crucible.y + 0.12, AT.crucible.z, _v);
    if (this.sparkTimer <= 0) {
      this.sparkTimer = 0.3;
      this.particles.burst('embers', _v, 3);
      sound.bubble(_v);
    }
    if (this.smelting > 0) return;
    // Two ore become a bar, hot, on the mould beside the crucible.
    const ore = this.pieces.find((p) => p.place === 'crucible');
    if (ore) {
      ore.root.removeFromParent();
      this.pieces = this.pieces.filter((p) => p !== ore);
    }
    const bar = new Piece('bar');
    bar.heat = 1;
    this.pieces.push(bar);
    this.frame.add(bar.root);
    bar.root.position.set(AT.mould.x, AT.mould.y + 0.02, AT.mould.z);
    bar.place = bar.home = 'mould';
    this.events.push('smelted:bar');
    this.made(bar);
  }

  private beatFrame(dt: number): void {
    const piece = this.onAnvil();
    const on = this.setup.hammering === 'beat' && !!piece?.work && !piece.workDone && (!piece.needsHeat || piece.hot);
    this.beatRing.visible = this.beatTarget.visible = on;
    if (!on) {
      this.beatPhase = 0;
      return;
    }
    const was = this.beatPhase;
    this.beatPhase = (this.beatPhase + dt) % TUNE.beat;
    if (this.beatPhase < was) sound.tick(true);
    const y = AT.anvil.y + piece.top + 0.004;
    this.beatRing.position.y = this.beatTarget.position.y = y;
    const t = this.beatPhase / TUNE.beat;
    this.beatRing.scale.setScalar(0.07 + 0.2 * (1 - t));
    const near = Math.min(this.beatPhase, TUNE.beat - this.beatPhase) <= TUNE.beatWindow;
    this.beatRing.material.color.setHex(near ? 0xffffff : 0xffd23a);
    this.beatRing.material.opacity = 0.5 + 0.5 * t;
  }

  // ─── Cards and props ───

  private say(text: string): void {
    this.note = { text, t: text ? 3 : 0 };
  }

  private statusLines(): { title: string; line: string; heat: number | null } {
    const piece = this.onAnvil() ?? (this.held?.work ? this.held : null) ?? this.pieces.find((p) => p.place === 'fire') ?? null;
    let title = this.setup.choose === 'board' ? 'Choose what to make on the board' : 'Lay out what you want to make';
    let line =
      this.setup.choose === 'board'
        ? 'Press a recipe with the hammer, the tongs or your sword.'
        : 'From the tray (your bag): ore in the crucible, a stone on the anvil, bars in the fire.';
    let heat: number | null = null;
    if (piece?.work) {
      const w = piece.work;
      const name = w.recipe === 'whetstone' ? 'Whetstone' : 'Copper gauntlets';
      title = `${name}: ${Math.floor(w.units * 2) / 2} of ${w.need}`;
      if (piece.needsHeat) heat = piece.heat;
      if (piece.made) line = this.setup.choose === 'board' ? 'Made. Into your bag.' : 'Made. Take it: let go of it anywhere and it goes in your bag.';
      else if (piece.workDone) line = 'Shaped. Quench it in the bucket by the anvil.';
      else if (piece.place === 'fire') line = piece.hot ? 'Glowing. Take it to the anvil with the tongs.' : 'Heating in the fire…';
      else if (piece.needsHeat && !piece.hot) line = 'Too cold. Back in the fire until it glows.';
      else if (piece.place === 'held') line = 'Lay it on the anvil.';
      else line = this.setup.hammering === 'marks' ? 'Strike the glowing marks. A hard strike works a mark at once.' : 'Strike as the ring closes on the beat. A hard strike counts double.';
    } else if (this.smelting > 0) {
      title = `Smelting: ${this.smelting.toFixed(1)} s`;
      line = 'Two copper ore melting into a bar.';
    } else if (this.pieces.some((p) => p.kind === 'bar' && p.place === 'mould')) {
      title = 'A copper bar, on the mould';
      line = 'Take it with the tongs; let go and it goes in your bag.';
    }
    if (!this.smith.tools) line = 'Grip behind your right hip for the hammer and tongs.';
    if (this.note.t > 0 && this.note.text) line = this.note.text;
    return { title, line, heat };
  }

  private paintCards(): void {
    const { title, line, heat } = this.statusLines();
    const key = `${this.setup.key}|${title}|${line}|${heat === null ? '' : Math.round(heat * 20)}`;
    this.status.paint(key, (c, w, h) => {
      parchment(c, w, h, 8);
      c.textBaseline = 'top';
      c.fillStyle = '#5a3212';
      c.font = `bold 40px ${FONT}`;
      c.fillText(title, 26, 22);
      c.fillStyle = '#2a1c10';
      c.font = `30px ${FONT}`;
      wrap(c, line, w - 52).slice(0, 3).forEach((l, i) => c.fillText(l, 26, 80 + i * 36));
      if (heat !== null) {
        c.fillStyle = '#3a2716';
        c.fillRect(26, h - 36, w - 52, 16);
        c.fillStyle = heat >= 0.3 ? '#ff7a20' : '#6a5a50';
        c.fillRect(26, h - 36, (w - 52) * heat, 16);
        c.fillStyle = '#fff';
        c.fillRect(26 + (w - 52) * 0.3, h - 40, 3, 24);
      }
    });
    const bag = this.bag;
    this.bagCard.paint(JSON.stringify(bag), (c, w, h) => {
      parchment(c, w, h, 6);
      c.textBaseline = 'top';
      c.fillStyle = '#5a3212';
      c.font = `bold 30px ${FONT}`;
      c.fillText('Your bag (stand-in)', 18, 14);
      c.fillStyle = '#2a1c10';
      c.font = `24px ${FONT}`;
      c.fillText(`${bag.ore} ore · ${bag.stone} stone · ${bag.bar} bars`, 18, 56);
      c.fillText(`${bag.whetstone} whetstones · ${bag.gauntlets} gauntlets`, 18, 86);
    });
    // The tray shows what's in the bag, a few of each.
    for (const mat of ['ore', 'stone', 'bar'] as const) {
      const g = this.stacks[mat];
      const shown = Math.min(4, this.bag[mat]);
      if (g.children.length === shown) continue;
      g.clear();
      for (let i = 0; i < shown; i++) {
        const p = new Piece(mat === 'bar' ? 'bar' : mat);
        p.root.position.set((i - 1.5) * (mat === 'stone' ? 0.0 : 0.02), i * (mat === 'ore' ? 0.01 : 0.03), 0);
        p.root.rotation.y = Math.PI / 2 + i * 0.1;
        if (mat === 'stone') p.root.scale.setScalar(0.7);
        g.add(p.root);
      }
    }
  }

  private buildProps(): void {
    const wood = new MeshLambertMaterial({ color: 0x6a4a2a, flatShading: true });
    const dark = new MeshLambertMaterial({ color: 0x3a3c40, flatShading: true });
    const add = (mesh: Mesh, x: number, y: number, z: number) => {
      mesh.position.set(x, y, z);
      this.frame.add(mesh);
      return mesh;
    };
    // The quench bucket, beside the anvil on your left.
    const { bucket, tray, crucible, mould } = AT;
    add(new Mesh(new CylinderGeometry(bucket.r, bucket.r * 0.85, bucket.water + 0.04, 10, 1, true), wood), bucket.x, (bucket.water + 0.04) / 2, bucket.z);
    add(new Mesh(new CircleGeometry(bucket.r - 0.01, 12), new MeshLambertMaterial({ color: 0x2a4a5a })), bucket.x, bucket.water, bucket.z).rotation.x = -Math.PI / 2;
    // The tray: a stool with the bag's materials on it.
    add(new Mesh(new BoxGeometry(0.3, 0.03, 0.42), wood), tray.x, tray.y - 0.015, tray.z);
    for (const [dx, dz] of [[-0.12, -0.18], [0.12, -0.18], [-0.12, 0.18], [0.12, 0.18]]) {
      add(new Mesh(new BoxGeometry(0.03, tray.y - 0.03, 0.03), wood), tray.x + dx, (tray.y - 0.03) / 2, tray.z + dz);
    }
    for (const mat of ['ore', 'stone', 'bar'] as const) {
      this.stacks[mat].position.set(tray.x, tray.y, tray.z + STACKS[mat]);
      this.frame.add(this.stacks[mat]);
    }
    // The crucible at the front of the forge, and the mould its bars come out on.
    add(new Mesh(new CylinderGeometry(0.1, 0.075, 0.12, 10), new MeshLambertMaterial({ color: 0x6a4030, flatShading: true })), crucible.x, crucible.y + 0.06, crucible.z);
    const glow = add(new Mesh(new CircleGeometry(0.085, 12), new MeshBasicMaterial({ color: 0x331a0a })), crucible.x, crucible.y + 0.121, crucible.z);
    glow.rotation.x = -Math.PI / 2;
    glow.name = 'crucible-glow';
    add(new Mesh(new BoxGeometry(0.2, 0.02, 0.07), dark), mould.x, mould.y + 0.01, mould.z);
    // You bump into the bucket and the stool.
    for (const [x, z, r] of [[bucket.x, bucket.z, bucket.r], [tray.x, tray.z, 0.2]]) {
      const [wx, wz] = this.worldXZ(x, z);
      this.world.addBody({ x: wx, z: wz, r });
    }
  }
}
