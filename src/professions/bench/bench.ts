import { Color, CylinderGeometry, Euler, Group, Mesh, type Object3D, Quaternion, Vector3 } from 'three';
import type { Effect } from '../../adventureState';
import { CONFIG } from '../../config';
import type { Particles } from '../../fx/particles';
import type { Inventory } from '../../inventory';
import { type ItemId, itemOf } from '../../items';
import { SKIN } from '../../player/fists';
import type { Handedness } from '../../player/input';
import type { Player } from '../../player/player';
import { Sip } from '../../player/sip';
import { lookOf } from '../../ui/bag/looks';
import { type Professions, type ProfessionsEffects, RECIPES, type RecipeId } from '../professions';
import { HERBS, MORTAR_HOLDS, recipeFor, Turns } from './brew';
import { atStation, stationHands } from '../stationHands';
import { Note } from './note';
import {
  bench,
  COLOURS,
  duskcap,
  FLASK,
  flask,
  hearthleaf,
  MORTAR,
  mortar,
  openHand,
  PESTLE,
  pestle,
  POT,
  pot,
  SPOON,
  SPOTS,
  spoon,
  STAND_GAP,
  stands,
  tint,
  TOP,
  tray,
  trayPlace,
  trivet,
} from './props';
import { sfx } from '../../fx/sfx';
import { brewSfx } from './sound';

// The alchemy bench in the house by the well, promoted from `?proto=brew`
// variant B, "grind and stir" (.scratch/professions/spec.md, "Stations"). Step
// up to it out of a fight and your sword and shield give way to open hands.
// The herbs on the tray are what your bag holds. Drop some in the mortar and
// they choose the recipe among those you know as the pestle goes in: the
// professions module starts it, taking them from the bag, or they glide back
// to the tray and nothing is taken. Grind (3 turns, pounding counts), the bench
// tips the mortar into the pot, stir (3 turns) while the brew changes colour,
// and the bench pours it into the next empty flask and corks it: the make is
// finished, into the bag. The flask waits on its stand: let it go at a hip to
// put it on the belt, hold it at your mouth to drink it (it's the bag's), or
// step away and it flies to the bag. Whatever you let go
// of glides back to its place. A brew you walk away from waits where it stands.

type Kind = 'herb' | 'pestle' | 'spoon' | 'flask';

/** Where a thing rests: its parent, and where and how it sits there. */
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
  /** The glide home after it's let go: seconds left, of `backFor`, and where it started from. */
  back: number;
  backFor: number;
  readonly from: { at: Vector3; turn: Quaternion };
  /** Can it be taken now? */
  can: () => boolean;
}

interface Herb extends Item {
  readonly herb: ItemId;
  /** Its place on the tray. */
  readonly tray: Place;
  /** Lying in the mortar. */
  inMortar: boolean;
  /** Its make has started: it's out of the bag, and being ground. */
  spent: boolean;
}

/** A flask on its stand: empty, filling, or corked and waiting with what's in it. */
interface Flask extends Item {
  readonly stand: number;
  readonly parts: ReturnType<typeof flask>;
  /** What it holds once corked, or null while it's empty. */
  potion: ItemId | null;
  /** Corked with the bag full: it isn't in the bag yet. */
  left: boolean;
  /** Seconds left of its flight to the bag, once it goes. */
  flying: number;
}

/** What the bench is doing: waiting for herbs, or one of the acts. */
export type BenchStep = 'load' | 'grind' | 'tip' | 'stir' | 'pour';

/** What the bench works with, from the Adventure. */
export interface BenchContext {
  readonly player: Player;
  readonly professions: Professions;
  readonly inventory: Inventory;
  readonly particles: Particles;
  /** What an operation on your professions and things did: saved, counted for quests and shown at `at`. */
  apply(effects: ProfessionsEffects | readonly Effect[], at: Vector3): void;
  /** Your hands dressed as your gear says again: the sword and shield back as you step away. */
  dress(): void;
  /** Your mouth now, where a corked flask held off its stand is drunk. */
  mouth?(out: Vector3): Vector3;
}

const B = CONFIG.alchemyBench;
const q = (x: number, y: number, z: number) => new Quaternion().setFromEuler(new Euler(x, y, z));
/** Tools held like a knife pointed down into the bowl: 40° below the fist's forward. */
const TOOL_HOLD = q(0.7, 0, 0);
const LEVEL = new Quaternion();
/** Where the bench stands you, a step back from its front, for the check of how near you are. */
const FRONT = new Vector3(0, 0, 0.3);

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _q = new Quaternion();
const _up = new Vector3();
const _colour = new Color();

const ease = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/** What each act says on the note while it's under way. */
const DOING: Record<BenchStep, string | null> = {
  load: null,
  grind: 'Grind the herbs with the pestle',
  tip: 'The mortar tips into the pot…',
  stir: 'Stir the pot with the spoon',
  pour: 'The pot pours into the flask…',
};

export class AlchemyBench {
  /** The bench in its frame (x along it, +z out from the wall): hang it where it stands, in the house's room. */
  readonly root = new Group();
  step: BenchStep = 'load';
  /** 0 to 1 through the act under way. */
  progress = 0;
  /** The recipe being brewed, once its make has started. */
  recipe: RecipeId | null = null;
  /** Are your hands bare at the bench? */
  bare = false;

  private readonly items: Item[] = [];
  private readonly herbs: Herb[] = [];
  private readonly flasks: (Flask | null)[] = [];
  private readonly mortar = mortar();
  private readonly pot = pot();
  private readonly pestle: Item;
  private readonly spoon: Item;
  private readonly note = new Note();
  private readonly stream = new Mesh(new CylinderGeometry(1, 1, 1, 6), tint(COLOURS.powder, 0.5));
  private readonly hands: Record<Handedness, ReturnType<typeof openHand>> = { left: openHand(), right: openHand() };
  private readonly held: Record<Handedness, Item | null> = { left: null, right: null };
  private readonly squeezing: Record<Handedness, boolean> = { left: false, right: false };
  /** A corked flask held at your mouth, in each hand, and where each hand was last frame (in the rig) for its speed. */
  private readonly sips: Record<Handedness, Sip> = { left: new Sip(), right: new Sip() };
  private readonly handWas: Record<Handedness, Vector3 | null> = { left: null, right: null };
  /** A drink refused in that hand: it isn't tried again until the flask leaves your mouth. */
  private readonly spurned: Record<Handedness, boolean> = { left: false, right: false };
  private readonly turns = new Turns();
  private readonly spoonInPot: Place;
  private readonly spoonOnBench: Place;
  private readonly mortarHome: Place;
  private readonly potHome: Place;
  /** Seconds into the bench's own act (tipping, pouring). */
  private autoT = 0;
  /** Seconds before the bench is ready for the next brew, after a cork; negative while it isn't waiting. */
  private resetIn = -1;
  private trickleT = 0;
  private poundLatched = false;
  private readonly tipWas = new Vector3();
  private readonly brewColour = new Color(COLOURS.water);
  /** The flask the pot pours into. */
  private target: Flask | null = null;

  constructor(private readonly ctx: BenchContext) {
    this.root.name = 'alchemy-bench';
    this.root.add(bench());
    const trayMesh = tray();
    trayMesh.position.copy(SPOTS.tray);
    const trivetMesh = trivet();
    trivetMesh.position.copy(SPOTS.pot).setY(TOP);
    const standsMesh = stands(B.stands);
    standsMesh.position.copy(SPOTS.stand);
    this.root.add(trayMesh, trivetMesh, standsMesh);
    this.note.mesh.position.copy(SPOTS.note);
    this.note.mesh.rotation.x = -0.12;
    this.root.add(this.note.mesh);
    this.stream.visible = false;
    this.root.add(this.stream);

    HERBS.forEach((id, row) => {
      for (let i = 0; i < B.herbs; i++) {
        const at = trayPlace(row, i);
        const home = this.place(this.root, at.x, at.y + i * 0.002, at.z, 0, 0.3 * (i - 1), 0);
        const herb: Herb = {
          ...this.base('herb', id === 'duskcap' ? duskcap() : hearthleaf(), new Vector3(0, 0.006, 0), 0.05, q(0, 0.4, 0), false, home),
          herb: id,
          tray: home,
          inMortar: false,
          spent: false,
          can: () => herb.obj.visible && !herb.spent && this.step === 'load',
        };
        herb.obj.name = `herb-${id}`;
        this.items.push(herb);
        this.herbs.push(herb);
      }
    });

    this.mortarHome = this.place(this.root, SPOTS.mortar.x, SPOTS.mortar.y, SPOTS.mortar.z);
    this.settleObj(this.mortar.root, this.mortarHome);
    this.potHome = this.place(this.root, SPOTS.pot.x, SPOTS.pot.y, SPOTS.pot.z);
    this.settleObj(this.pot.root, this.potHome);

    this.pestle = this.add({
      ...this.base('pestle', pestle(), new Vector3(0, -0.03, 0), 0.06, TOOL_HOLD, true, this.place(this.root, SPOTS.pestle.x, SPOTS.pestle.y, SPOTS.pestle.z, 0, 0, Math.PI / 2)),
      can: () => true,
    });
    this.spoonInPot = this.place(this.pot.root, 0.035, 0.33, -0.02, 0.12, 0, -0.12);
    this.spoonOnBench = this.place(this.root, SPOTS.spoon.x, SPOTS.spoon.y, SPOTS.spoon.z, 0, 0, Math.PI / 2);
    this.spoon = this.add({
      ...this.base('spoon', spoon(), new Vector3(0, -0.04, 0), 0.06, TOOL_HOLD, true, this.spoonInPot),
      can: () => this.step !== 'pour',
    });

    for (let i = 0; i < B.stands; i++) this.flasks.push(this.newFlask(i));
    for (const item of this.items) this.settle(item);
  }

  // --- Building ------------------------------------------------------------

  private place(parent: Object3D, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Place {
    return { parent, at: new Vector3(x, y, z), turn: q(rx, ry, rz) };
  }

  private base(kind: Kind, obj: Object3D, grab: Vector3, radius: number, holdTurn: Quaternion, hidesHand: boolean, home: Place): Item {
    return { kind, obj, grab, radius, holdTurn, hidesHand, home, heldBy: null, back: 0, backFor: B.back, from: { at: new Vector3(), turn: new Quaternion() }, can: () => false };
  }

  private add<T extends Item>(item: T): T {
    this.items.push(item);
    return item;
  }

  private newFlask(stand: number): Flask {
    const parts = flask();
    const at = SPOTS.stand.clone().add(_a.set(stand * STAND_GAP, 0, 0));
    const f: Flask = {
      ...this.base('flask', parts.root, FLASK.grab.clone(), 0.06, LEVEL, false, this.place(this.root, at.x, at.y, at.z)),
      stand,
      parts,
      potion: null,
      left: false,
      flying: 0,
      can: () => f.potion !== null && f.flying <= 0,
    };
    parts.root.name = `flask-${stand}`;
    this.items.push(f);
    this.settle(f);
    return f;
  }

  /** Put it straight at its place. */
  private settle(item: Item): void {
    this.settleObj(item.obj, item.home);
    item.back = 0;
  }

  private settleObj(obj: Object3D, place: Place): void {
    place.parent.add(obj);
    obj.position.copy(place.at);
    obj.quaternion.copy(place.turn);
  }

  /** Let it glide to its place from wherever it is. */
  private sendHome(item: Item, seconds: number = B.back): void {
    item.home.parent.attach(item.obj);
    item.from.at.copy(item.obj.position);
    item.from.turn.copy(item.obj.quaternion);
    item.back = item.backFor = seconds;
  }

  // --- Reading it, for the view and scripted checks --------------------------

  /** Where a point in the bench's frame is in the world. */
  point(x: number, y: number, z: number, out = new Vector3()): Vector3 {
    this.root.updateMatrixWorld(true);
    return this.root.localToWorld(out.set(x, y, z));
  }

  /** What stands on the bench now: the herbs on the tray and in the mortar, and each stand's flask. */
  get shown(): {
    tray: Record<ItemId, number>;
    mortar: Record<ItemId, number>;
    stands: ({ potion: ItemId | null; left: boolean } | null)[];
  } {
    const tray: Record<ItemId, number> = {};
    const inMortar: Record<ItemId, number> = {};
    for (const h of this.herbs) {
      if (h.inMortar) inMortar[h.herb] = (inMortar[h.herb] ?? 0) + 1;
      else if (h.obj.visible && !h.heldBy) tray[h.herb] = (tray[h.herb] ?? 0) + 1;
    }
    return { tray, mortar: inMortar, stands: this.flasks.map((f) => (f ? { potion: f.potion, left: f.left } : null)) };
  }

  /** Where a thing on the bench is, in the world, for a hand to take it: a herb of `id` on the tray, a tool, or a stand's flask. */
  grabPoint(what: ItemId | 'pestle' | 'spoon' | number, out = new Vector3()): Vector3 | null {
    const item =
      typeof what === 'number'
        ? this.flasks[what]
        : what === 'pestle'
          ? this.pestle
          : what === 'spoon'
            ? this.spoon
            : this.herbs.find((h) => h.herb === what && h.can() && !h.inMortar && !h.heldBy);
    if (!item) return null;
    item.obj.updateMatrixWorld(true);
    return item.obj.localToWorld(out.copy(item.grab));
  }

  /** The mortar's mouth, the pot's middle at its brew and the hips' slots, in the world. */
  get spots(): { mortar: Vector3; mortarFloor: Vector3; pot: Vector3; hips: [Vector3, Vector3] } {
    this.root.updateMatrixWorld(true);
    return {
      mortar: this.mortar.root.localToWorld(new Vector3().copy(MORTAR.mouth)),
      mortarFloor: this.mortar.root.localToWorld(new Vector3(0, 0.012, 0)),
      pot: this.pot.root.localToWorld(new Vector3(0, POT.liquid - 0.02, 0)),
      hips: [this.hip(0, new Vector3()), this.hip(1, new Vector3())],
    };
  }

  /** Where the tip of the held pestle or spoon is, in the world. */
  tipOf(tool: 'pestle' | 'spoon', out = new Vector3()): Vector3 {
    const item = tool === 'pestle' ? this.pestle : this.spoon;
    item.obj.updateMatrixWorld(true);
    return item.obj.localToWorld(out.copy(tool === 'pestle' ? PESTLE.tip : SPOON.tip));
  }

  // --- The frame -------------------------------------------------------------

  /**
   * One frame. Nothing here while `fighting`: your weapons stay yours. While
   * you're `talking` to the herbalist beside it, it doesn't take your hands.
   */
  update(dt: number, fighting: boolean, talking = false): void {
    const { player } = this.ctx;
    const head = player.camera.getWorldPosition(_a);
    const front = this.root.localToWorld(_b.copy(FRONT));
    player.camera.getWorldDirection(_c);
    // The stations' one rule for hands, measured from its front, while the house is drawn and you stand.
    const want =
      this.drawn() && player.alive && !(talking && !this.bare) && stationHands(this.bare, atStation(front.x, front.z, head.x, head.z, _c.x, _c.z, fighting));
    if (want && !this.bare) this.stepUp();
    else if (!want && this.bare) this.stepAway();

    if (this.bare) this.dressBare();
    for (const side of ['left', 'right'] as const) {
      const hand = player.input.hands[side];
      const was = this.squeezing[side];
      this.squeezing[side] = hand.grip.visible && (was ? hand.squeeze > 0.35 : hand.squeeze > 0.6);
      const grabbed = this.squeezing[side] && !was;
      const released = !this.squeezing[side] && was;
      this.hands[side].fingers.rotation.x = this.squeezing[side] ? -1.2 : -0.25;
      if (this.bare && grabbed && !this.held[side]) this.take(side);
      else if (released && this.held[side]) this.release(side);
      this.hands[side].root.visible = this.bare && !this.held[side]?.hidesHand;
    }
    for (const side of ['left', 'right'] as const) this.sipping(side, dt);
    for (const item of this.items) this.glide(item, dt);
    this.fly(dt);
    this.trayShows();
    this.keepHonest();

    if (this.resetIn >= 0) {
      this.resetIn -= dt;
      if (this.resetIn < 0) this.reset();
    }
    this.act(dt);
    this.levelBrew();
    this.note.show({
      known: this.ctx.professions.recipes.filter((id) => RECIPES[id]?.station === 'bench'),
      has: (id) => this.ctx.inventory.count(id),
      doing: this.step === 'load' && !this.freeFlask() ? 'Take a flask off its stand' : DOING[this.step],
    });
  }

  /** Is the bench drawn: the house's room showing? */
  private drawn(): boolean {
    for (let p: Object3D | null = this.root; p; p = p.parent) if (!p.visible) return false;
    return true;
  }

  /** Step up: your sword, shield and fists give way to open hands. */
  private stepUp(): void {
    this.bare = true;
    const colour = this.ctx.player.fists?.left.colour ?? SKIN;
    for (const side of ['left', 'right'] as const) this.hands[side].tint(colour);
  }

  /** Every frame at the bench: the weapons and fists hidden, the open hands on your grips. */
  private dressBare(): void {
    const { player } = this.ctx;
    player.sword.model.visible = player.shield.model.visible = false;
    for (const side of ['left', 'right'] as const) {
      const grip = player.input.hands[side].grip;
      if (this.hands[side].root.parent !== grip) grip.add(this.hands[side].root);
      if (player.fists) player.fists[side].mesh.visible = false;
    }
  }

  /**
   * Step away: what you hold goes back to its place, your weapons come back,
   * and every corked flask flies to the bag (one that found the bag full
   * tries again, and waits on its stand if it's still full).
   */
  private stepAway(): void {
    this.bare = false;
    const { player } = this.ctx;
    for (const side of ['left', 'right'] as const) {
      if (this.held[side]) this.release(side, false);
      this.hands[side].root.visible = false;
      if (player.fists) player.fists[side].mesh.visible = true;
    }
    this.ctx.dress();
    for (const f of this.flasks) {
      if (!f?.potion || f.flying > 0) continue;
      if (f.left) {
        const took = this.ctx.inventory.take([{ id: f.potion, count: 1 }]);
        const kept = took.filter((e) => e.kind !== 'left');
        if (kept.length) this.ctx.apply(kept, this.mouthOf(f, _a));
        if (took.some((e) => e.kind === 'left')) continue;
        f.left = false;
      }
      this.sendAway(f);
    }
  }

  private handAt(side: Handedness, out: Vector3): Vector3 {
    return this.ctx.player.input.hands[side].grip.getWorldPosition(out);
  }

  private take(side: Handedness): void {
    const hand = this.handAt(side, _a);
    let best: Item | null = null;
    let bestD = Infinity;
    for (const item of this.items) {
      if (item.heldBy || !item.obj.visible || !item.can()) continue;
      const d = item.obj.localToWorld(_b.copy(item.grab)).distanceTo(hand);
      if (d < item.radius + B.reach && d < bestD) {
        best = item;
        bestD = d;
      }
    }
    if (!best) return;
    const item = best;
    item.heldBy = side;
    item.back = 0;
    this.held[side] = item;
    const grip = this.ctx.player.input.hands[side].grip;
    grip.add(item.obj);
    item.obj.quaternion.copy(item.holdTurn);
    item.obj.position.copy(item.grab).applyQuaternion(item.holdTurn).negate();
    this.buzz(side, B.buzz.take);
    this.poundLatched = false;
    this.turns.lift();
    if (item === this.pestle) this.tipWas.copy(this.tipOf('pestle', _b));
    if (item.kind === 'herb') (item as Herb).inMortar = false;
  }

  /** Let go of what `side` holds: into the mortar, onto the belt, or back to its place. */
  private release(side: Handedness, placing = true): void {
    const item = this.held[side]!;
    this.held[side] = null;
    item.heldBy = null;
    this.turns.lift();
    if (placing && item.kind === 'herb' && this.step === 'load' && this.overMortar(item) && this.inMortar() < MORTAR_HOLDS) return this.dropIn(item as Herb);
    if (item.kind === 'herb') (item as Herb).home = (item as Herb).tray;
    if (placing && item.kind === 'flask' && this.belt(item as Flask, side)) return;
    this.sendHome(item);
  }

  private glide(item: Item, dt: number): void {
    if (item.back <= 0 || item.heldBy) return;
    item.back = Math.max(0, item.back - dt);
    const e = ease(1 - item.back / item.backFor);
    item.obj.position.lerpVectors(item.from.at, item.home.at, e);
    item.obj.quaternion.slerpQuaternions(item.from.turn, item.home.turn, e);
  }

  private buzz(side: Handedness, b: { intensity: number; ms: number }): void {
    this.ctx.player.input.pulse(side, b.intensity, b.ms);
  }

  // --- The herbs -------------------------------------------------------------

  private inMortar(): number {
    return this.herbs.filter((h) => h.inMortar).length;
  }

  private overMortar(item: Item): boolean {
    const at = item.obj.getWorldPosition(_b);
    const mouth = this.mortar.root.localToWorld(_c.copy(MORTAR.mouth));
    return Math.hypot(at.x - mouth.x, at.z - mouth.z) < B.drop && at.y > mouth.y - 0.04 && at.y < mouth.y + 0.35;
  }

  private dropIn(herb: Herb): void {
    const k = this.inMortar();
    herb.inMortar = true;
    herb.home = this.place(this.mortar.root, -0.018 + k * 0.024, 0.035 + k * 0.006, 0.012 - k * 0.016, 0, 1.2 * k, 0);
    this.sendHome(herb, 0.15);
    brewSfx.leaf(this.mortar.root.localToWorld(_a.copy(MORTAR.mouth)));
  }

  /**
   * The tray shows the herbs your bag holds, up to its rows: those not yet
   * taken from the bag (in the mortar before the grind, or in a hand) count.
   */
  private trayShows(): void {
    for (const id of HERBS) {
      const mine = this.herbs.filter((h) => h.herb === id);
      const using = mine.filter((h) => !h.spent && (h.inMortar || h.heldBy)).length;
      let room = Math.min(B.herbs, this.ctx.inventory.count(id)) - using;
      for (const h of mine) {
        if (h.spent || h.inMortar || h.heldBy) continue;
        h.obj.visible = room-- > 0;
      }
    }
  }

  /** The pestle's gone in on herbs: they choose the recipe, and its make starts, or they go back to the tray. */
  private commit(side: Handedness): boolean {
    const herbs: Record<ItemId, number> = {};
    const loaded = this.herbs.filter((h) => h.inMortar);
    for (const h of loaded) herbs[h.herb] = (herbs[h.herb] ?? 0) + 1;
    const { professions } = this.ctx;
    const id = recipeFor(herbs, (r) => professions.knows(r));
    const at = this.mortar.root.localToWorld(_a.copy(MORTAR.mouth));
    const effects = id && this.freeFlask() ? professions.start(id) : null;
    if (!id || !effects || effects.some((e) => e.kind === 'refused')) {
      // Nothing you know, or can make now: the herbs glide back and nothing is taken.
      for (const h of loaded) {
        h.inMortar = false;
        h.home = h.tray;
        this.sendHome(h, 0.4);
      }
      brewSfx.nope();
      this.buzz(side, B.buzz.nope);
      return false;
    }
    for (const h of loaded) h.spent = true;
    this.recipe = id;
    this.ctx.apply(effects, at);
    this.advance('grind');
    return true;
  }

  /** A corked flask for each potion the bag no longer holds (sold, drunk, moved to the belt) is gone from its stand. */
  private keepHonest(): void {
    const shown = new Map<ItemId, Flask[]>();
    for (const f of this.flasks) if (f?.potion && !f.left && f.flying <= 0) shown.set(f.potion, [...(shown.get(f.potion) ?? []), f]);
    for (const [id, list] of shown) {
      for (let extra = list.length - this.ctx.inventory.count(id); extra > 0; extra--) {
        const f = list.shift()!;
        if (f.heldBy) this.held[f.heldBy] = null;
        this.replaceFlask(f);
      }
    }
  }

  // --- The acts --------------------------------------------------------------

  private advance(step: BenchStep): void {
    this.step = step;
    this.progress = 0;
    this.autoT = 0;
    this.turns.reset();
    this.stream.visible = false;
  }

  private act(dt: number): void {
    switch (this.step) {
      case 'load':
      case 'grind':
        return this.grind(dt);
      case 'tip':
        return this.tip(dt);
      case 'stir':
        return this.stir();
      case 'pour':
        return this.pour(dt);
    }
  }

  /** Grinding: the pestle round the mortar, or pounded into it. The first touch on loaded herbs starts the make. */
  private grind(dt: number): void {
    const side = this.pestle.heldBy;
    if (!side) return;
    const tip = this.tipOf('pestle', _a);
    const c = this.mortar.root.localToWorld(_b.set(0, 0, 0));
    const inside =
      Math.hypot(tip.x - c.x, tip.z - c.z) < MORTAR.inner + 0.02 && tip.y < c.y + MORTAR.height + 0.03 && tip.y > c.y - 0.03;
    const fall = dt > 0 ? (this.tipWas.y - tip.y) / dt : 0;
    this.tipWas.copy(tip);
    if (tip.y > c.y + MORTAR.height + 0.01) this.poundLatched = false;
    if (!inside) {
      this.turns.lift();
      return;
    }
    if (this.step === 'load') {
      if (this.resetIn >= 0 || !this.inMortar() || !this.commit(side)) return;
      this.tipWas.copy(tip);
    }
    let halves = this.turns.feed(tip.x - c.x, tip.z - c.z);
    // Pounding counts too: a quick blow to the bottom is a share of a turn.
    if (!this.poundLatched && fall > B.pound.fall && tip.y < c.y + 0.045) {
      this.poundLatched = true;
      halves += this.turns.add(Math.PI * 2 * B.pound.share);
      brewSfx.pound(c);
      this.buzz(side, B.buzz.pound);
    }
    for (let i = 0; i < halves; i++) {
      brewSfx.crunch(c);
      this.buzz(side, B.buzz.crunch);
    }
    this.progress = Math.min(1, this.turns.acc / (B.turns.grind * Math.PI * 2));
    const { powder } = this.mortar;
    powder.visible = this.progress > 0;
    const h = 0.004 + this.progress * 0.024;
    powder.scale.set(1, h, 1);
    powder.position.y = 0.012 + h / 2;
    for (const herb of this.herbs) if (herb.spent) herb.obj.scale.setScalar(Math.max(0.05, 1 - this.progress));
    if (this.progress < 1) return;
    for (const herb of this.herbs) if (herb.spent) herb.obj.visible = false;
    if (this.pestle.heldBy) this.release(this.pestle.heldBy, false);
    this.advance('tip');
  }

  /** Where the mortar leans to pour into the pot, in the bench's frame. */
  private mortarOverPot(): Place {
    const turn = q(0, -Math.PI / 2, 0).multiply(q(-1.6, 0, 0));
    const lip = new Vector3(0, MORTAR.height, -MORTAR.r).applyQuaternion(turn);
    const at = SPOTS.pot.clone().add(new Vector3(0, POT.height + 0.08, 0)).sub(lip);
    return { parent: this.root, at, turn };
  }

  /** The bench tips the mortar's powder into the pot, and the water greens. */
  private tip(dt: number): void {
    const t0 = this.autoT;
    this.autoT += dt;
    const T = B.tip;
    const home = this.mortarHome;
    const over = this.mortarOverPot();
    const lifted = over.at.clone().setY(over.at.y + 0.05);
    const o = this.mortar.root;
    if (t0 === 0) brewSfx.swish(o.getWorldPosition(_a));
    const lift = T * 0.37;
    const lean = T * 0.25;
    const empty = T - lift - lean;
    if (this.autoT < lift) {
      const e = ease(this.autoT / lift);
      o.position.lerpVectors(home.at, lifted, e);
    } else if (this.autoT < lift + lean) {
      const e = ease((this.autoT - lift) / lean);
      o.position.lerpVectors(lifted, over.at, e);
      o.quaternion.slerpQuaternions(LEVEL, over.turn, e);
    } else {
      o.position.copy(over.at);
      o.quaternion.copy(over.turn);
      const top = this.pot.root.localToWorld(_b.set(0, POT.height, 0));
      const lip = o.localToWorld(_a.set(0, MORTAR.height, -MORTAR.r));
      this.showStream(true, lip, top, COLOURS.powder, 0.012);
      const before = this.progress;
      this.progress = Math.min(1, (this.autoT - lift - lean) / empty);
      this.mortar.powder.scale.y = Math.max(0.001, 0.028 * (1 - this.progress));
      if (Math.floor(before * 4) !== Math.floor(this.progress * 4)) brewSfx.powder(top);
      if (this.progress >= 1) {
        this.mortar.powder.visible = false;
        this.settleObj(o, home);
        this.brewColour.setHex(COLOURS.green);
        this.paintBrew(0.1);
        this.advance('stir');
      }
    }
  }

  /** Stirring: the spoon's bowl round the pot while the brew turns from green to the potion's colour. */
  private stir(): void {
    const side = this.spoon.heldBy;
    if (!side) return;
    const tip = this.tipOf('spoon', _a);
    const c = this.pot.root.localToWorld(_b.set(0, 0, 0));
    const inside = Math.hypot(tip.x - c.x, tip.z - c.z) < POT.r && tip.y < c.y + POT.liquid + 0.04 && tip.y > c.y - 0.02;
    if (!inside) {
      this.turns.lift();
      return;
    }
    const halves = this.turns.feed(tip.x - c.x, tip.z - c.z);
    const top = this.pot.root.localToWorld(_c.set(0, POT.liquid, 0));
    for (let i = 0; i < halves; i++) {
      brewSfx.slosh(top);
      brewSfx.bubble(top);
      this.ctx.particles.burst('embers', top, 3, undefined, this.brewColour.getHex());
      this.buzz(side, B.buzz.stir);
    }
    this.progress = Math.min(1, this.turns.acc / (B.turns.stir * Math.PI * 2));
    this.brewColour.setHex(COLOURS.green).lerp(_colour.setHex(this.colourOf(this.recipe)), this.progress);
    this.paintBrew(0.1 + this.progress * 0.5);
    if (this.progress < 1) return;
    brewSfx.turn(top);
    this.ctx.particles.burst('magic', top, 24, undefined, this.brewColour.getHex());
    if (this.spoon.heldBy) this.release(this.spoon.heldBy, false);
    this.spoon.home = this.spoonOnBench;
    this.sendHome(this.spoon, 0.35);
    this.target = this.freeFlask();
    this.advance('pour');
  }

  /** The potion's own colour: its flask's in the bag. */
  private colourOf(recipe: RecipeId | null): number {
    const item = recipe ? itemOf(RECIPES[recipe].makes) : undefined;
    return item ? lookOf(item).tint : 0xc02020;
  }

  private paintBrew(glow: number): void {
    const m = this.pot.brew.material as ReturnType<typeof tint>;
    m.color.copy(this.brewColour);
    m.emissive.copy(this.brewColour);
    m.emissiveIntensity = glow;
  }

  /** Where the pot leans to pour into `f`, in the bench's frame. */
  private potOver(f: Flask): Place {
    const turn = q(0, -Math.PI / 2, 0).multiply(q(-1.1, 0, 0));
    const spout = POT.spout.clone().applyQuaternion(turn);
    const at = f.home.at.clone().add(FLASK.mouth).add(new Vector3(0, 0.05, 0)).sub(spout);
    return { parent: this.root, at, turn };
  }

  /** The bench pours the pot into the flask and corks it: the make is finished. */
  private pour(dt: number): void {
    const f = (this.target ??= this.freeFlask());
    if (!f) return; // every stand full: it waits, stirred, until one's free
    const t0 = this.autoT;
    this.autoT += dt;
    const T = B.pour;
    const home = this.potHome;
    const over = this.potOver(f);
    const lifted = over.at.clone().setY(over.at.y + 0.04);
    const o = this.pot.root;
    if (t0 === 0) brewSfx.swish(o.getWorldPosition(_a));
    const lift = T * 0.25;
    const lean = T * 0.15;
    const fill = T * 0.5;
    if (this.autoT < lift) {
      o.position.lerpVectors(home.at, lifted, ease(this.autoT / lift));
    } else if (this.autoT < lift + lean) {
      const e = ease((this.autoT - lift) / lean);
      o.position.lerpVectors(lifted, over.at, e);
      o.quaternion.slerpQuaternions(home.turn, over.turn, e);
    } else if (this.progress < 1) {
      o.position.copy(over.at);
      o.quaternion.copy(over.turn);
      const spout = o.localToWorld(_a.copy(POT.spout));
      const mouth = this.mouthOf(f, _b);
      this.showStream(true, spout, mouth, this.brewColour.getHex(), 0.007);
      this.progress = Math.min(1, (this.autoT - lift - lean) / fill);
      const brew = f.parts.brew;
      (brew.material as ReturnType<typeof tint>).color.copy(this.brewColour);
      (brew.material as ReturnType<typeof tint>).emissive.copy(this.brewColour);
      brew.scale.setScalar(Math.max(0.001, Math.cbrt(this.progress)));
      brew.position.y = 0.038 - 0.03 * (1 - this.progress);
      this.pot.brew.position.y = POT.liquid - this.progress * 0.07;
      this.pot.brew.scale.setScalar(1 - this.progress * 0.3);
      this.trickleT -= dt;
      if (this.trickleT <= 0) {
        this.trickleT = 0.12;
        brewSfx.trickle(mouth);
      }
      if (this.progress >= 1) this.cork(f);
    } else {
      // Corked: the pot goes back to its trivet.
      const e = ease((this.autoT - lift - lean - fill) / (T - lift - lean - fill));
      o.position.lerpVectors(over.at, home.at, e);
      o.quaternion.slerpQuaternions(over.turn, home.turn, e);
      if (e >= 1) {
        this.settleObj(o, home);
        this.advance('load');
        this.resetIn = 0.3;
      }
    }
  }

  /** The flask full: corked and glowing, the make finished into the bag (or waiting on the stand, the bag full). */
  private cork(f: Flask): void {
    const recipe = this.recipe!;
    f.parts.cork.visible = true;
    (f.parts.brew.material as ReturnType<typeof tint>).emissiveIntensity = 0.8;
    this.pot.brew.visible = false;
    this.stream.visible = false;
    const mouth = this.mouthOf(f, _b);
    brewSfx.cork(mouth);
    this.ctx.particles.burst('embers', mouth, 10, undefined, this.brewColour.getHex());
    const effects = this.ctx.professions.finish('bench');
    const made = effects.find((e) => e.kind === 'made');
    f.potion = RECIPES[recipe].makes;
    f.left = made?.kind === 'made' && made.left;
    this.ctx.apply(effects, mouth.setY(mouth.y + 0.1));
    this.recipe = null;
    this.target = null;
  }

  private mouthOf(f: Flask, out: Vector3): Vector3 {
    f.obj.updateMatrixWorld(true);
    return f.obj.localToWorld(out.copy(FLASK.mouth));
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

  /** Keep the pot's brew level however the pot leans. */
  private levelBrew(): void {
    this.pot.root.getWorldQuaternion(_q);
    this.pot.brew.quaternion.copy(_q).invert();
  }

  /** Ready for the next brew: the herbs back on the tray, water in the pot, the spoon in it. */
  private reset(): void {
    for (const h of this.herbs) {
      if (!h.spent) continue;
      h.spent = h.inMortar = false;
      h.obj.visible = true;
      h.obj.scale.setScalar(1);
      h.home = h.tray;
      this.settle(h);
    }
    this.mortar.powder.visible = false;
    this.pot.brew.visible = true;
    this.pot.brew.position.y = POT.liquid;
    this.pot.brew.scale.setScalar(1);
    this.brewColour.setHex(COLOURS.water);
    this.paintBrew(0.05);
    this.spoon.home = this.spoonInPot;
    if (!this.spoon.heldBy) this.sendHome(this.spoon, 0.3);
  }

  // --- The flasks ------------------------------------------------------------

  /** The first stand whose flask is empty, or null. */
  private freeFlask(): Flask | null {
    return this.flasks.find((f) => f?.potion === null) ?? null;
  }

  /**
   * A corked flask held at your mouth for as long as a belt flask takes is
   * drunk, as one off the belt: its potion is the bag's, so the bag's is the
   * one drunk, on the shared cooldown. Refused (cooling down), it stays in
   * the hand with the strong buzz, and waits to be taken from your mouth and
   * brought back before it's tried again.
   */
  private sipping(side: Handedness, dt: number): void {
    const grip = this.ctx.player.input.hands[side].grip;
    const was = this.handWas[side];
    const speed = was && dt > 0 ? grip.position.distanceTo(was) / dt : 0;
    this.handWas[side] = grip.visible ? (was ?? new Vector3()).copy(grip.position) : null;
    const f = this.held[side];
    const sip = this.sips[side];
    if (!this.ctx.mouth || f?.kind !== 'flask' || !(f as Flask).potion) return sip.reset();
    const flask = f as Flask;
    const mouth = this.ctx.mouth(_c);
    const distance = this.mouthOf(flask, _a).distanceTo(mouth);
    if (this.spurned[side]) {
      if (distance < CONFIG.belt.mouthRadius) return;
      this.spurned[side] = false;
    }
    const sipped = sip.update(dt, distance, speed);
    const D = CONFIG.belt.buzz;
    if (sip.buzz) this.buzz(side, D.drink);
    if (sipped !== 'drunk') return;
    const { inventory } = this.ctx;
    let from = -1;
    inventory.bag.forEach((s, i) => s?.id === flask.potion && (from = i));
    const effects = !flask.left && from >= 0 ? inventory.use({ in: 'bag', slot: from }) : null;
    if (!effects || effects.some((e) => e.kind === 'refused')) {
      brewSfx.nope();
      this.buzz(side, B.buzz.nope);
      this.spurned[side] = true;
      return;
    }
    this.buzz(side, D.gulp);
    sfx.gulp(mouth);
    this.held[side] = null;
    this.replaceFlask(flask);
    this.ctx.apply(effects, mouth.clone());
  }

  /** Where the `slot`th hip's belt slot is (0 the left, 1 the right): under your head, aside by the way you face. */
  private hip(slot: number, out: Vector3): Vector3 {
    const { camera } = this.ctx.player;
    const head = camera.getWorldPosition(out);
    camera.getWorldDirection(_up).setY(0);
    if (_up.lengthSq() < 1e-6) _up.set(0, 0, -1);
    _up.normalize();
    // Your right, over the floor, is the gaze turned a quarter to the right.
    const side = slot === 0 ? -1 : 1;
    return head.set(head.x - _up.z * B.hip.aside * side, head.y - B.hip.down, head.z + _up.x * B.hip.aside * side);
  }

  /** A corked flask let go at a hip: onto the belt there, from the bag. True if it went. */
  private belt(f: Flask, side: Handedness): boolean {
    const at = f.obj.getWorldPosition(_a);
    const slot = [0, 1].find((s) => this.hip(s, _b).distanceTo(at) < B.hip.within);
    if (slot === undefined || !f.potion) return false;
    const { inventory } = this.ctx;
    let from = -1;
    inventory.bag.forEach((s, i) => s?.id === f.potion && (from = i));
    const effects = !f.left && from >= 0 ? inventory.move({ in: 'bag', slot: from }, { in: 'belt', slot }, 1) : null;
    if (!effects || effects.some((e) => e.kind === 'refused')) {
      brewSfx.nope();
      this.buzz(side, B.buzz.nope);
      return false;
    }
    this.ctx.apply(effects, at);
    brewSfx.belt();
    this.buzz(side, B.buzz.belt);
    this.replaceFlask(f);
    return true;
  }

  /** Off to the bag: the flask flies up past your shoulder and is gone, and an empty one takes its stand. */
  private sendAway(f: Flask): void {
    brewSfx.away(this.mouthOf(f, _a));
    this.root.attach(f.obj);
    f.back = 0;
    f.from.at.copy(f.obj.position);
    f.flying = 0.45;
  }

  private fly(dt: number): void {
    const { camera } = this.ctx.player;
    for (const f of this.flasks) {
      if (!f || f.flying <= 0) continue;
      f.flying -= dt;
      const to = this.root.worldToLocal(camera.getWorldPosition(_a).add(_b.set(0, -0.15, 0)));
      const e = ease(1 - f.flying / 0.45);
      f.obj.position.lerpVectors(f.from.at, to, e);
      f.obj.scale.setScalar(1 - 0.8 * e);
      if (f.flying <= 0) this.replaceFlask(f);
    }
  }

  private replaceFlask(f: Flask): void {
    f.obj.removeFromParent();
    this.items.splice(this.items.indexOf(f), 1);
    this.flasks[f.stand] = this.newFlask(f.stand);
  }
}
