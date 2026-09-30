import { CircleGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, type Object3D, type Scene, Vector3 } from 'three';
import type { Effect } from '../../adventureState';
import { CONFIG } from '../../config';
import type { FloatingText } from '../../fx/floatingText';
import type { Particles } from '../../fx/particles';
import { sfx } from '../../fx/sfx';
import type { Inventory } from '../../inventory';
import { itemOf } from '../../items';
import { SMITHY } from '../../maps/forest/smithy';
import type { VillagerSpot } from '../../maps/types';
import type { Handedness } from '../../player/input';
import { Card, FONT, parchment } from '../../ui/card';
import { capOf, type Professions, RECIPES, type RecipeId } from '../professions';
import { atStation, stationHands } from '../stationHands';
import { type BoardRow, RecipeBoard } from './board';
import { PieceView } from './pieces';
import * as sound from './sounds';
import { buildHammer, HAMMER_FACE, Tongs, TONGS_JAW } from './tools';
import { AnvilWork, type Drop, FORMS, type Piece, type WorkEffects } from './work';

// Smithing at the smithy, promoted from ?proto=anvil variant A, "Board and
// marks" (.scratch/professions/issues/06-…, 15-the-smiths-anvil.md). Step up
// to the anvil, facing it and out of a fight, with Smithing learned, and your
// sword and shield become the smith's hammer and tongs while the smith steps
// aside; step back past 2 m and they're yours again. Press a recipe on the
// board beside the anvil and its materials leave your bag onto the station
// (through the professions module): two ore smelt in the crucible, a rough
// stone lies on the anvil, four bars go into the fire as a blank. Strike the
// glowing marks with the hammer; heat the blank in the fire and carry it to
// the anvil with the tongs; quench the shaped gauntlets in the bucket beside
// the anvil. What's made flies to your bag with a chime and "+1 Smithing",
// or waits on the anvil while the bag is full. Walking off leaves the work
// where it stands, cooling. The make itself is work.ts's; this is its place
// in the world, its looks and your hands on it.

/** Where things are, in the smithy's frame (smithy.ts: its floor's centre, the open front +Z). */
const AT = {
  anvil: { x: SMITHY.anvil.x, y: 0.745, z: SMITHY.anvil.z, hw: 0.25, hd: 0.1 },
  fire: { x: -2.0, y: 1.0, z: -1.45, r: 0.4 },
  crucible: { x: -1.62, y: 1.0, z: -1.3, r: 0.2 },
  mould: { x: -1.42, y: 1.0, z: -1.18 },
  bucket: SMITHY.bucket,
  barrel: { ...SMITHY.barrel, water: 0.83 },
  board: { x: 0.5, y: 1.25, z: -0.1 },
  line: { x: SMITHY.anvil.x, y: 1.32, z: SMITHY.anvil.z },
} as const;

/** How each form is made, on its board key. */
const HOW = { bar: 'smelted', whetstone: 'hammered cold', gauntlets: 'heated, hammered, quenched' } as const;

/** A thing made, resting a moment where it was made, then flying to your hip. */
interface Flight {
  readonly view: PieceView;
  wait: number;
  t: number;
  readonly from: Vector3;
}

/** What the anvil needs from the Adventure. */
export interface AnvilHooks {
  readonly professions: Professions;
  readonly inventory: Inventory;
  /** Put the station's tools in your hands, or your weapons back (null). */
  hands(tools: { readonly right: Object3D; readonly left: Object3D } | null): void;
  buzz(hand: Handedness, intensity: number, ms: number): void;
  /** Save and show what a make did (the materials taken, the thing made, "+1 Smithing") at `at`. */
  apply(effects: readonly Effect[], at: Vector3): void;
  /** The smith steps aside to (x, z), facing `yaw`, or goes back to the anvil (null). */
  smithAside(to: { readonly x: number; readonly z: number; readonly yaw: number } | null): void;
}

/** You, this frame. */
export interface AnvilInput {
  readonly dt: number;
  /** Your eyes, and which way you look. */
  readonly head: Vector3;
  readonly gaze: Vector3;
  readonly fighting: boolean;
  readonly alive: boolean;
  /** How far the left grip is squeezed: it closes the tongs. */
  readonly squeeze: number;
  /** Your left and right fists, null while untracked. */
  readonly fists: readonly [Vector3 | null, Vector3 | null];
  /** The sword's tip, null without one. */
  readonly tip: Vector3 | null;
}

const _w = new Vector3();
const _v = new Vector3();
const _j = new Vector3();
const _hip = new Vector3();

export class Anvil {
  /** The smithy's frame: everything here is placed in it. */
  readonly frame = new Group();
  /** The make under way. */
  readonly work: AnvilWork;
  readonly board = new RecipeBoard();
  readonly hammer = buildHammer();
  readonly tongs = new Tongs();
  /** The hammer and tongs are in your hands. */
  tools = false;
  /** What happened, newest last, for the console and scripted checks. */
  readonly lines: string[] = [];
  private readonly line = new Card(0.62, 0.065, { ppm: 1000 });
  private readonly crucibleGlow: Mesh<CircleGeometry, MeshBasicMaterial>;
  private view: PieceView | null = null;
  private readonly flights: Flight[] = [];
  private note = { text: '', t: 0 };
  private squeezeWas = false;
  private inWater = false;
  private sparkTimer = 0;
  private retryIn = 0;
  // The hammer's face, tracked in the frame.
  private readonly face = new Vector3();
  private readonly facePrev = new Vector3();
  private readonly faceVel = new Vector3();
  private faceValid = false;
  private strokeTop = 0;
  private armed = true;

  constructor(
    private readonly scene: Scene,
    ground: { heightAt(x: number, z: number): number; addBody(body: { x: number; z: number; r: number }): void },
    /** The smith at the anvil: the smithy's frame is found from where they stand in it. */
    smith: VillagerSpot,
    private readonly hooks: AnvilHooks,
    private readonly fx: { readonly particles: Particles; readonly text: FloatingText },
  ) {
    this.work = new AnvilWork(hooks.professions, hooks.inventory);
    const c = Math.cos(smith.yaw);
    const s = Math.sin(smith.yaw);
    this.frame.position.set(smith.x - (SMITHY.smith.x * c + SMITHY.smith.z * s), 0, smith.z - (-SMITHY.smith.x * s + SMITHY.smith.z * c));
    this.frame.rotation.y = smith.yaw;
    this.frame.updateMatrixWorld(true);
    this.frame.position.y = ground.heightAt(...this.worldXZ(AT.anvil.x, AT.anvil.z));
    this.frame.name = 'anvil-station';
    scene.add(this.frame);
    this.frame.updateMatrixWorld(true);
    this.crucibleGlow = this.buildProps(ground);
    this.board.root.position.set(AT.board.x, AT.board.y, AT.board.z);
    this.line.mesh.position.set(AT.line.x, AT.line.y, AT.line.z);
    this.line.mesh.visible = false;
    this.frame.add(this.board.root, this.line.mesh);
  }

  /** The anvil's middle over the ground, in the world. */
  get at(): { x: number; z: number } {
    const [x, z] = this.worldXZ(AT.anvil.x, AT.anvil.z);
    return { x, z };
  }

  /** Where the smith works (and you stand to work), in the world, and which way it faces (0 looks down −Z). */
  get stand(): { x: number; z: number; yaw: number } {
    const [x, z] = this.worldXZ(SMITHY.smith.x, SMITHY.smith.z);
    return { x, z, yaw: this.frame.rotation.y + Math.PI };
  }

  /** A point in the smithy's frame, in the world: for scripted checks. */
  toWorld(lx: number, y: number, lz: number, out = new Vector3()): Vector3 {
    return this.frame.localToWorld(out.set(lx, y, lz));
  }

  /** The hammer's face, in the world. */
  hammerFace(out: Vector3): Vector3 {
    return this.hammer.localToWorld(out.copy(HAMMER_FACE));
  }

  /** The tongs' jaws, in the world. */
  jaw(out: Vector3): Vector3 {
    return this.tongs.model.localToWorld(out.copy(TONGS_JAW));
  }

  private worldXZ(lx: number, lz: number): [number, number] {
    this.toWorld(lx, 0, lz, _w);
    return [_w.x, _w.z];
  }

  private log(line: string): void {
    this.lines.push(line);
    if (this.lines.length > 120) this.lines.shift();
  }

  // ─── Each frame ───

  update(input: AnvilInput): void {
    const { dt } = input;
    const { professions } = this.hooks;
    const learned = professions.has('smithing');
    const anvil = this.at;
    const here = atStation(anvil.x, anvil.z, input.head.x, input.head.z, input.gaze.x, input.gaze.z, input.fighting);
    const want = learned && input.alive && stationHands(this.tools, here);
    if (want !== this.tools) this.setTools(want, input.fighting);

    // The board, turned to you, while you know Smithing.
    this.board.root.visible = learned;
    if (learned) {
      this.faceYou(this.board.root, input.head, dt);
      this.board.paint(this.title(), this.rows());
      const probes: (Vector3 | null)[] = [...input.fists];
      if (this.tools) probes.push(this.hammerFace(new Vector3()), this.jaw(new Vector3()));
      else probes.push(input.tip);
      const pick = this.board.update(dt, probes);
      if (pick) this.choose(pick);
    }

    if (this.tools) {
      this.tongs.grip = Math.min(1, input.squeeze * 1.4);
      this.tongsFrame(input.squeeze);
      this.hammerFrame(dt);
    } else this.faceValid = false;

    this.show(this.work.update(dt));
    this.smelting(dt);
    this.retryIn -= dt;
    if (this.work.piece?.waiting && this.retryIn <= 0) {
      this.retryIn = CONFIG.professions.anvil.retry;
      this.show(this.work.retry());
    }
    this.syncView();
    this.view?.update(dt);
    this.fly(dt, input.head);
    this.note.t = Math.max(0, this.note.t - dt);
    this.paintLine(input.head, dt);
  }

  /** Your hands become the hammer and tongs (the smith steps aside), or your own again (a fight: at once, with a buzz). */
  private setTools(on: boolean, fighting: boolean): void {
    this.tools = on;
    const { hooks } = this;
    if (on) {
      hooks.hands({ right: this.hammer, left: this.tongs.model });
      const [x, z] = this.worldXZ(SMITHY.aside.x, SMITHY.aside.z);
      hooks.smithAside({ x, z, yaw: this.frame.rotation.y + Math.atan2(AT.anvil.x - SMITHY.aside.x, AT.anvil.z - SMITHY.aside.z) });
      hooks.buzz('right', 0.6, 40);
      this.log('tools:out');
    } else {
      this.work.walkOff();
      this.squeezeWas = false;
      this.faceValid = false;
      hooks.hands(null);
      hooks.smithAside(null);
      if (fighting) {
        hooks.buzz('left', 1, 120);
        hooks.buzz('right', 1, 120);
      } else hooks.buzz('right', 0.4, 30);
      this.log(fighting ? 'tools:fight' : 'tools:away');
    }
  }

  /** The smithing title over the board: your grade and proficiency. */
  private title(): string {
    const { professions } = this.hooks;
    const grade = professions.grade('smithing');
    if (!grade) return 'Smithing';
    return `Smithing · ${grade[0].toUpperCase()}${grade.slice(1)} ${professions.proficiency('smithing')}/${capOf(grade)}`;
  }

  /** A key for each recipe you know that's made at the anvil. */
  private rows(): BoardRow[] {
    const { professions, inventory } = this.hooks;
    const rows: BoardRow[] = [];
    for (const recipe of Object.values(RECIPES)) {
      const form = FORMS[recipe.id];
      if (!form || recipe.station !== 'anvil' || !professions.knows(recipe.id)) continue;
      const takes = Object.entries(recipe.takes).map(([id, n]) => `${n} ${itemOf(id)?.name ?? id} (you have ${inventory.count(id)})`);
      const short = Object.entries(recipe.takes).some(([id, n]) => inventory.count(id) < n);
      const skilled = professions.proficiency(recipe.profession) >= recipe.needs;
      const line = skilled ? `${takes.join(', ')} · ${HOW[form]}` : `Needs Smithing ${recipe.needs} · ${takes.join(', ')}`;
      rows.push({ id: recipe.id, name: itemOf(recipe.makes)?.name ?? recipe.id, line, ready: skilled && !short });
    }
    return rows;
  }

  /**
   * The board: start `id`, its materials leaving the bag onto the station.
   * Refused (short of materials, of proficiency, or the station busy), it
   * takes nothing and says why, with a low buzz.
   */
  choose(id: RecipeId): boolean {
    const effects = this.work.choose(id);
    if ('refused' in effects) {
      this.log(`refused:${id}`);
      this.refuse(effects.refused);
      return false;
    }
    this.log(`choose:${id}`);
    this.syncView();
    this.hooks.apply(effects, this.pieceAt(_v));
    const form = FORMS[id];
    this.say(form === 'gauntlets' ? 'The bars are in the fire. When they glow, take them to the anvil with the tongs.' : '');
    return true;
  }

  private refuse(why: string): void {
    this.say(why);
    sound.nope();
    this.hooks.buzz('right', 0.2, 60);
  }

  private say(text: string): void {
    this.note = { text, t: text ? 3 : 0 };
  }

  /** Where the piece is in the world (the anvil if there's none). */
  private pieceAt(out: Vector3): Vector3 {
    if (this.view) return this.view.root.getWorldPosition(out);
    return this.toWorld(AT.anvil.x, AT.anvil.y, AT.anvil.z, out);
  }

  /** What a step of the work did: saved and shown, and what was made flies to your bag. */
  private show(w: WorkEffects): void {
    if (w.effects.length) this.hooks.apply(w.effects, this.pieceAt(_v).setY(_v.y + 0.1));
    if (w.made) {
      const { piece, left } = w.made;
      sound.made();
      this.log(`made:${piece.recipe.id}${left ? ':left' : ''}`);
      if (left) this.say('Your bag is full: it waits here until there’s room.');
      else this.launch(piece, piece.form === 'bar' ? CONFIG.professions.anvil.settle.smelted : CONFIG.professions.anvil.settle.made);
    }
    if (w.bagged) {
      this.log(`bagged:${w.bagged.recipe.id}`);
      sfx.pickup();
      this.launch(w.bagged, 0);
    }
  }

  /** The view of `piece` (made, off the station) rests `wait` s where it is, then flies to your hip. */
  private launch(piece: Piece, wait: number): void {
    const view = this.view?.piece === piece ? this.view : null;
    if (!view) return;
    this.view = null;
    this.place(view);
    this.flights.push({ view, wait, t: 0, from: new Vector3() });
  }

  private fly(dt: number, head: Vector3): void {
    _hip.copy(head).setY(head.y - 0.65);
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      f.view.update(dt);
      if (f.wait > 0) {
        f.wait -= dt;
        if (f.wait > 0) continue;
        f.view.root.getWorldPosition(f.from);
        this.scene.attach(f.view.root);
      }
      f.t += dt / CONFIG.professions.anvil.flight;
      const t = Math.min(1, f.t);
      f.view.root.position.lerpVectors(f.from, _hip, t * t);
      f.view.root.scale.setScalar(1 - 0.7 * t);
      if (t < 1) continue;
      f.view.root.removeFromParent();
      f.view.dispose();
      this.flights.splice(i, 1);
    }
  }

  /** The piece's view follows the work: made when a make starts, placed where the piece is. */
  private syncView(): void {
    const piece = this.work.piece;
    if (this.view && this.view.piece !== piece) {
      this.view.root.removeFromParent();
      this.view.dispose();
      this.view = null;
    }
    if (piece) this.place((this.view ??= new PieceView(piece)));
  }

  /** Put a piece's view where its piece is: on its spot at the station, or in the tongs. */
  private place(view: PieceView): void {
    const { piece } = view;
    if (piece.place === 'held') {
      if (view.root.parent !== this.tongs.model) {
        this.tongs.model.add(view.root);
        view.root.position.copy(TONGS_JAW).add(_v.set(0, -view.top / 2, -0.05));
        view.root.rotation.set(0, Math.PI / 2, 0);
      }
      return;
    }
    const at = piece.place === 'crucible' ? { ...AT.crucible, y: AT.crucible.y + 0.03 } : piece.place === 'mould' ? { ...AT.mould, y: AT.mould.y + 0.02 } : AT[piece.place];
    if (view.root.parent !== this.frame) this.frame.add(view.root);
    view.root.position.set(at.x, at.y, at.z);
    view.root.rotation.set(0, piece.place === 'fire' ? 0.5 : 0, 0);
  }

  // ─── The tongs ───

  /** Squeeze to take the piece at the jaws; let go to put it down where they are. A dip in the bucket quenches. */
  private tongsFrame(squeeze: number): void {
    const T = CONFIG.professions.anvil.tongs;
    const down = squeeze > T.grab;
    this.jaw(_j);
    this.frame.worldToLocal(_j);
    const piece = this.work.piece;
    if (down && !this.squeezeWas && piece && piece.place !== 'held' && this.view) {
      this.view.root.getWorldPosition(_v);
      this.frame.worldToLocal(_v);
      if (Math.hypot(_j.x - _v.x, _j.z - _v.z) < T.reach && Math.abs(_j.y - (_v.y + this.view.top / 2)) < 0.1 && this.work.grab()) {
        this.log(`grab:${piece.recipe.id}:${piece.home}`);
        this.hooks.buzz('left', 0.3, 20);
        this.syncView();
      }
    }
    if (piece?.place === 'held' && squeeze < T.release) {
      const where = this.dropAt(_j);
      const w = this.work.letGo(where);
      this.log(`drop:${piece.recipe.id}:${where}${w.refused ? ':back' : ''}`);
      if (w.refused) this.refuse(w.refused);
      else this.hooks.buzz('left', 0.35, 25);
      this.show(w);
      this.syncView();
    }
    this.squeezeWas = down;
    // Dipped in the bucket (or the barrel).
    const held = this.work.piece?.place === 'held';
    const wet = held && [AT.bucket, AT.barrel].some((b) => Math.hypot(_j.x - b.x, _j.z - b.z) < b.r && _j.y < b.water);
    if (wet && !this.inWater) this.dunk();
    this.inWater = wet;
  }

  private dropAt(j: Vector3): Drop {
    const { crucible, fire, anvil, mould } = AT;
    if (Math.hypot(j.x - crucible.x, j.z - crucible.z) < crucible.r && j.y < crucible.y + 0.35) return 'crucible';
    if (Math.hypot(j.x - mould.x, j.z - mould.z) < 0.12 && j.y < mould.y + 0.3) return 'mould';
    if (Math.hypot(j.x - fire.x, j.z - fire.z) < fire.r && j.y < fire.y + 0.45) return 'fire';
    if (Math.abs(j.x - anvil.x) < anvil.hw + 0.08 && Math.abs(j.z - anvil.z) < anvil.hd + 0.12 && j.y < anvil.y + 0.3) return 'anvil';
    return 'away';
  }

  /** Dip what's in the tongs: it hisses and cools; shaped gauntlets are made. */
  private dunk(): void {
    this.jaw(_j);
    const w = this.work.dunk();
    if (w.hissed) {
      sound.hiss(_j);
      this.fx.particles.burst('dust', _j, 16, undefined, 0xe8e8e8);
      this.hooks.buzz('left', 0.3, 300);
    }
    this.log(`dunk${w.made ? ':quenched' : ''}`);
    this.show(w);
  }

  // ─── The hammer ───

  private hammerFrame(dt: number): void {
    this.hammerFace(this.face);
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
    const piece = this.work.piece;
    const top = piece?.place === 'anvil' && this.view ? this.view.top : 0;
    const surface = anvil.y + top;
    if (!this.armed) {
      if (this.face.y > surface + CONFIG.professions.anvil.rearm) {
        this.armed = true;
        this.strokeTop = this.face.y;
      }
    } else {
      this.strokeTop = Math.max(this.strokeTop, this.face.y);
      const over = Math.abs(this.face.x - anvil.x) < anvil.hw + 0.04 && Math.abs(this.face.z - anvil.z) < anvil.hd + 0.05;
      if (over && this.facePrev.y > surface && this.face.y <= surface) {
        this.strike(Math.max(-this.faceVel.y, -_v.y), this.strokeTop - surface, this.face.x - anvil.x, this.face.z - anvil.z);
        this.armed = false;
      }
    }
    this.facePrev.copy(this.face);
  }

  /**
   * A strike on the anvil, `speed` m/s downward after coming down `travel` m,
   * landing (x, z) from the anvil's middle: a clink for a tap, sparks, a ring
   * and a pulse sized to a good or great strike that works a mark, and small
   * sparks for one on cold metal or off the marks.
   */
  strike(speed: number, travel: number, x: number, z: number): void {
    const view = this.work.piece?.place === 'anvil' ? this.view : null;
    const at = this.toWorld(AT.anvil.x + x, AT.anvil.y + (view?.top ?? 0), AT.anvil.z + z, new Vector3());
    const stone = this.work.piece?.form === 'whetstone';
    const s = this.work.strike(speed, travel, x, z);
    const { grade, struck } = s;
    this.log(`strike:${grade}:${struck}`);
    const { particles, text } = this.fx;
    const q = grade === 'great' ? 1 : 0.55;
    if (grade === 'tap') {
      sound.clink(at);
      this.hooks.buzz('right', 0.15, 20);
    } else if (struck === 'worked') {
      if (stone) {
        sound.crack(at, q);
        particles.burst('dust', at, grade === 'great' ? 10 : 5, undefined, 0x8a8880);
        particles.burst('sparks', at, grade === 'great' ? 8 : 3, undefined, 0xfff0c0);
      } else {
        sound.ring(at, q);
        particles.burst('sparks', at, grade === 'great' ? 34 : 14);
      }
      if (grade === 'great') view?.flashNow();
      this.hooks.buzz('right', grade === 'great' ? 1 : 0.6, grade === 'great' ? 70 : 40);
      text.spawn(grade === 'great' ? 'GREAT' : 'GOOD', at.clone().setY(at.y + 0.1), { color: grade === 'great' ? '#ffd23a' : '#e8e0c8', scale: 0.04, life: 0.7, rise: 0.15 });
      if (this.work.shaped && this.work.piece?.form === 'gauntlets') this.say('Shaped. Quench it: take it with the tongs and dip it in the bucket.');
    } else {
      if (struck === 'cold') sound.clink(at);
      else sound.ring(at, 0.15);
      particles.burst('sparks', at, struck === 'cold' ? 2 : 4, undefined, struck === 'cold' ? 0xb08050 : undefined);
      this.hooks.buzz('right', 0.35, 30);
      if (struck === 'cold') this.say('Too cold to work. Back in the fire until it glows.');
    }
    this.show(s);
  }

  // ─── Smelting, the line and the props ───

  /** The crucible glows and bubbles while ore melts in it. */
  private smelting(dt: number): void {
    const piece = this.work.piece;
    const on = piece?.place === 'crucible' && piece.smelting > 0;
    const glow = on ? 0.6 + 0.4 * Math.sin(performance.now() / 90) : 0;
    this.crucibleGlow.material.color.setRGB(0.2 + glow * 0.8, 0.1 + glow * 0.45, 0.05 + glow * 0.05);
    if (!on) return;
    this.sparkTimer -= dt;
    if (this.sparkTimer > 0) return;
    this.sparkTimer = 0.3;
    this.toWorld(AT.crucible.x, AT.crucible.y + 0.12, AT.crucible.z, _v);
    this.fx.particles.burst('embers', _v, 3);
    sound.bubble(_v);
  }

  /** What to do next, in one line over the anvil while the tools are in your hands. */
  private next(): string {
    if (this.note.t > 0 && this.note.text) return this.note.text;
    const piece = this.work.piece;
    if (!piece) return 'Choose what to make on the board.';
    if (piece.waiting) return 'Your bag is full: it waits here until there’s room.';
    if (piece.place === 'crucible') return 'Smelting…';
    if (piece.place === 'held') return this.work.shaped && !piece.quenched ? 'Dip it in the bucket to quench it.' : 'Lay it on the anvil.';
    if (piece.place === 'fire') return this.work.workable ? 'Glowing. Take it to the anvil with the tongs.' : 'Heating in the fire…';
    if (this.work.shaped) return 'Shaped. Quench it in the bucket by the anvil.';
    if (!this.work.workable) return 'Too cold. Back in the fire until it glows.';
    return 'Strike the glowing marks.';
  }

  private paintLine(head: Vector3, dt: number): void {
    this.line.mesh.visible = this.tools;
    if (!this.tools) return;
    this.faceYou(this.line.mesh, head, dt);
    const text = this.next();
    this.line.paint(text, (c, w, h) => {
      parchment(c, w, h, 5);
      c.fillStyle = '#2a1c10';
      c.font = `30px ${FONT}`;
      c.textBaseline = 'middle';
      c.fillText(text, 20, h / 2 + 1, w - 40);
    });
  }

  /** Turn `o` (a child of the frame) about the vertical to face your head, eased. */
  private faceYou(o: Object3D, head: Vector3, dt: number): void {
    o.getWorldPosition(_v);
    const want = Math.atan2(head.x - _v.x, head.z - _v.z) - this.frame.rotation.y;
    const d = Math.atan2(Math.sin(want - o.rotation.y), Math.cos(want - o.rotation.y));
    o.rotation.set(0, o.rotation.y + d * Math.min(1, dt * 6), 0);
  }

  /** The quench bucket beside the anvil, and the crucible at the forge's front with its mould. Returns the crucible's glow. */
  private buildProps(ground: { addBody(body: { x: number; z: number; r: number }): void }): Mesh<CircleGeometry, MeshBasicMaterial> {
    const wood = new MeshLambertMaterial({ color: 0x6a4a2a, flatShading: true });
    const dark = new MeshLambertMaterial({ color: 0x3a3c40, flatShading: true });
    const add = <M extends Mesh>(mesh: M, x: number, y: number, z: number): M => {
      mesh.position.set(x, y, z);
      this.frame.add(mesh);
      return mesh;
    };
    const { bucket, crucible, mould } = AT;
    add(new Mesh(new CylinderGeometry(bucket.r, bucket.r * 0.85, bucket.water + 0.04, 10, 1, true), wood), bucket.x, (bucket.water + 0.04) / 2, bucket.z);
    add(new Mesh(new CircleGeometry(bucket.r - 0.01, 12), new MeshLambertMaterial({ color: 0x2a4a5a })), bucket.x, bucket.water, bucket.z).rotation.x = -Math.PI / 2;
    add(new Mesh(new CylinderGeometry(0.1, 0.075, 0.12, 10), new MeshLambertMaterial({ color: 0x6a4030, flatShading: true })), crucible.x, crucible.y + 0.06, crucible.z);
    const glow = add(new Mesh(new CircleGeometry(0.085, 12), new MeshBasicMaterial({ color: 0x331a0a })), crucible.x, crucible.y + 0.121, crucible.z);
    glow.rotation.x = -Math.PI / 2;
    add(new Mesh(new CylinderGeometry(0.1, 0.1, 0.02, 4), dark), mould.x, mould.y + 0.01, mould.z).rotation.y = Math.PI / 4;
    // You bump into the bucket.
    const [x, z] = this.worldXZ(bucket.x, bucket.z);
    ground.addBody({ x, z, r: bucket.r });
    return glow;
  }
}

