import { type Camera, Group, Mesh, type Object3D, type Scene, Vector3, type WebGLRenderer } from 'three';
import { CONFIG } from '../../config';
import { sfx } from '../../fx/sfx';
import type { Inventory, InventoryEffect, Refusal, Stack, Where } from '../../inventory';
import { itemOf } from '../../items';
import { sharedModelMaterial } from '../../models/materials';
import type { Handedness } from '../../player/input';
import { Sip } from '../../player/sip';
import { Sharpen } from '../../professions/sharpen';
import { type Page, type Reach, sameSpot, type Spot } from './layout';
import { type IconAtlas, modelOf } from './looks';
import { BagPanel, nothingShown, type PanelShows } from './panel';
import { ShoulderReach } from './reach';
import { sameButton, type TalentActs, type TalentButton } from './talentPage';
import { TALENT, type TalentRefusal } from '../../talents';

// The bag in the Adventure: reach over either shoulder and squeeze the grip to
// bring the panel round, then touch an item with a fist or the weapon's tip to
// read its card, and hold the grip to carry it on what touched it. Let go over
// a slot to put it there (a gear slot wears it, and what you wore goes where
// it came from), over the figure to wear it, off the panel to drop it on the
// ground, or anywhere else over the panel to put it back. A slot it can't go
// in turns red under it, and letting go there refuses it with a strong buzz.
// The tabs along the top switch the page, pressed as the talk board's buttons
// are. Every move goes through the inventory, whose effects the Adventure
// shows and saves. Promoted from the bag prototype's variant A
// (ui/bag-prototype/, .scratch/inventory/issues/09-the-bag-in-the-adventure.md).
// A panel can open beside the bag's (the stash's, by touching its chest's
// lid): the bag's opens with it, with no reach, and things are carried
// between the two as within the bag's; both close together
// (.scratch/inventory/issues/15-the-stash.md). A vendor's wares board opens
// the same way, placed beside the vendor, but its slots are wares rather
// than places in your things: carried off it into a bag slot a ware is
// bought, and something of yours let go over it is sold
// (.scratch/inventory/issues/14-vendors.md).
// Items offered beside it (a hand-in's pick on Hale's board) are carried the
// same way, into a bag slot to take one: grip one with the bag shut and it
// swings round with the item already in hand (12-quest-items-and-hand-in-picks.md).
// What professions make is used from it: a potion or the elixir carried to
// your mouth and held there is drunk, as a flask off the belt is; the
// whetstone carried in one hand and rubbed along the blade in the other (the
// ranger's bow, for the arrowheads) sharpens it
// (.scratch/professions/issues/17-using-what-professions-make.md).
// The Talents tab's page presses its buttons as the tabs are pressed: a
// talent spends a point, Reset gives them all back, and two shapes one after
// the other swap their slots (talentPage.ts;
// .scratch/abilities/issues/25-talents-and-the-warriors-trees.md).

/** A fist or the weapon's tip, where it is in the world, and whose hand. */
export interface BagProbe {
  readonly at: Vector3;
  readonly hand: Handedness;
}

/** A hand's controller this frame: its grip space (a child of the rig), whether it's tracked, and how far its grip is squeezed. */
export interface BagHand {
  readonly grip: Object3D;
  readonly tracked: boolean;
  readonly squeeze: number;
}

export interface BagInput {
  readonly dt: number;
  /** Your eyes, and which way you look. */
  readonly head: Vector3;
  readonly gaze: Vector3;
  /** The rig the hands move in, so walking and turning don't count as the hand moving. */
  readonly rig: Object3D;
  readonly hands: Readonly<Record<Handedness, BagHand>>;
  /** Left fist, right fist, the weapon's tip: null for one not tracked (or no weapon). */
  readonly probes: readonly (BagProbe | null)[];
  /** Down, you can't reach for anything: the bag shuts. */
  readonly alive: boolean;
  /** Items offered beside the bag this frame, if any. */
  readonly shelf?: Shelf | null;
}

/** Items offered beside the bag, as Hale's board offers a hand-in's pick: carried from there into a bag slot to take one. */
export interface Shelf {
  /** The offered item `at` (world) touches, by its index, if any. */
  itemAt(at: Vector3): number | null;
  /** The item offered at `index`. */
  stackAt(index: number): Stack | null;
  /** Why taking it into `to` would be refused, or null if it would go. */
  check(index: number, to: Where): Refusal | null;
  /** Take it into `to`: null once it's gone in, or why it was refused. */
  take(index: number, to: Where): Refusal | null;
  /** Light the one a fist or the tip touches, and empty the place of the one carried off. */
  show(hover: number | null, lifted: number | null): void;
}

/** Where a carried item came from: a place in your things, a shelf beside the bag, or a vendor's wares. */
type From = Where | { readonly in: 'shelf'; readonly index: number } | Ware;
/** A ware carried off a vendor's board, by its slot there. */
type Ware = { readonly in: 'ware'; readonly index: number };

/** What the bag does beyond the panel. */
export interface BagWorld {
  readonly inventory: Inventory;
  buzz(hand: Handedness, intensity: number, ms: number): void;
  /** What an operation on your things did, at `at`: shown and saved. */
  apply(effects: readonly InventoryEffect[], at: Vector3): void;
  /** Let go of away from the panel: it lies on the ground, falling from `at`. */
  drop(stack: Stack, at: Vector3, velocity: Vector3): void;
  /** Your talents and gesture slots, for the Talents tab's page; without them it says there are none. */
  readonly talents?: TalentActs;
  /** The hip slot of the belt at `at`, if any: a potion let go there goes onto the belt. */
  beltAt?(at: Vector3): number | null;
  /** Your mouth now, where a carried potion is drunk. */
  mouth?(out: Vector3): Vector3;
  /** The edge a whetstone carried in `hand` is rubbed along: the blade (or bow) in your other hand, if one's there. */
  edge?(hand: Handedness): { readonly base: Vector3; readonly tip: Vector3 } | null;
}

/**
 * A panel open beside the bag's, whose page of slots is touched and carried
 * to and from as the bag's are: the stash's. Its slots are places in your
 * things, so every move is the inventory's.
 */
export interface BesidePanel {
  readonly root: Object3D;
  readonly isOpen: boolean;
  /** The page showing, and how many there are (its tabs). */
  readonly page: number;
  readonly pages: number;
  setPage(page: number): void;
  /** Open on its first page, and close. */
  show(): void;
  close(): void;
  /** Your things changed: fill its slots again. */
  changed(): void;
  /** The place in your things its slot `i` on the page showing is: none for a vendor's ware, which is traded. */
  where(i: number): Where | null;
  /** Its slot `world` touches, if any. */
  spotAt(world: Vector3, reach: Reach): number | null;
  /** Where letting a carried item go at `world` puts it, if on this panel. */
  targetAt(world: Vector3, reach: Reach & { near: number }): number | null;
  /** Its page tab `world` touches, if any. */
  tabAt(world: Vector3, reach: Reach): number | null;
  /** Is `world` over it? */
  over(world: Vector3, reach: Reach): boolean;
  update(dt: number, shows: BesideShows): void;
  /** A vendor's wares: its slots are traded rather than places in your things. */
  readonly trade?: Trade;
}

/**
 * Buying and selling on a vendor's wares board beside the bag's panel. A
 * ware carried off it goes only into a bag slot (let go anywhere else, it
 * goes back), and something of yours let go over it is sold. Its target,
 * while something of yours is over it, is the slot it's over, or −1 for
 * anywhere else on it.
 */
export interface Trade {
  /** What it is, for the log: "the smith's wares". */
  readonly name: string;
  stackAt(i: number): Stack | null;
  /** Why the grip can't take what's in slot `i` (too few coins), or null. */
  canLift(i: number): Refusal | null;
  /** Why what's in slot `i` can't go to `to`, or null. */
  checkTake(i: number, to: Where): Refusal | null;
  /** Carry what's in slot `i` to `to`: buy it. */
  take(i: number, to: Where): InventoryEffect[];
  /** What taking from slot `i` is called, for the log: "bought". */
  takes(i: number): string;
  /** Why `from` can't be given to it, or null. */
  checkGive(from: Where): Refusal | null;
  /** Give it what's at `from`: sell it. */
  give(from: Where): InventoryEffect[];
  /** What giving is called, for the log: "sold". */
  readonly gives: string;
}

/** What a panel beside the bag's shows this frame, as `PanelShows` does for the bag's, by its slots on the page showing. */
export interface BesideShows {
  hover: number | null;
  lifted: number | null;
  target: { i: number; fits: boolean } | null;
  card: Stack | null;
  cardOver: number | null;
  tab: number | null;
}

/** Something pressed as a tab is: one of the bag panel's tabs, a page's of the panel beside it, or a button of the talent page. */
type Tab = { readonly on: 'bag'; readonly page: Page } | { readonly on: 'beside'; readonly page: number } | { readonly on: 'talents'; readonly button: TalentButton };
function sameTab(a: Tab | null, b: Tab | null): boolean {
  if (!a || !b) return a === b;
  if (a.on === 'talents') return b.on === 'talents' && sameButton(a.button, b.button);
  return a.on === b.on && a.page === (b as { page: unknown }).page;
}

/** What a talent page refusal says, in the log the checks read. */
const UNSPENT: Readonly<Record<TalentRefusal, string>> = {
  fighting: 'in a fight',
  points: 'no points left',
  max: 'full',
  tier: 'tier not open',
  class: 'not your class',
};

/** What the refusals say, in the log the checks read. */
const REFUSED: Readonly<Record<Refusal, string>> = {
  class: 'not your class',
  level: 'above your level',
  slot: "doesn't go there",
  full: 'no room',
  coins: 'too few coins',
  quest: 'quest items stay on their page',
  empty: 'nothing there',
  cooldown: 'cooling down',
};

/** A hand's grip, and its speed and velocity in the rig. */
interface HandTrack {
  held: boolean;
  gripDown: boolean;
  speed: number;
  readonly prev: Vector3;
  valid: boolean;
  readonly at: Vector3;
  readonly velocity: Vector3;
}

const newTrack = (): HandTrack => ({ held: false, gripDown: false, speed: 0, prev: new Vector3(), valid: false, at: new Vector3(), velocity: new Vector3() });

const _v = new Vector3();
const _mouth = new Vector3();

export class Bag {
  /** The panel and the item you carry, both in world space. */
  readonly root = new Group();
  readonly panel: BagPanel;
  readonly reach = new ShoulderReach();
  /** The item you've picked up, drawn as its model wherever it's carried. */
  readonly held = new Mesh(undefined, sharedModelMaterial());
  /** What happened, newest last, for the checks. */
  readonly lines: string[] = [];
  private readonly track: Record<Handedness, HandTrack> = { left: newTrack(), right: newTrack() };
  /** What's carried, from where: `page` is the page it was on, of the panel it was on. */
  private carry: { from: From; page: Page | number; spot: Spot | null; stack: Stack; probe: number; hand: Handedness } | null = null;
  /** The hip slot a carried item is over, off the panels, and whether it may go there: for the belt to light. */
  beltTarget: { slot: number; fits: boolean } | null = null;
  private lastHover: Spot | null = null;
  /** The shelf's item touched last frame, to buzz only as a probe arrives on one. */
  private lastShelfHover: number | null = null;
  /** The tab each probe rested on last frame: it must leave before it can press again. */
  private readonly onTab: (Tab | null)[] = [];
  /** The panel open beside the bag's, if any. */
  private beside: BesidePanel | null = null;
  /** Placed where it was put (beside a vendor's wares) rather than in front of you: it stays there. */
  private pinned = false;
  private tabArming = 0;
  /** A carried potion at your mouth, and a carried whetstone on an edge. */
  private readonly sip = new Sip();
  private readonly sharpen = new Sharpen();

  constructor(
    private readonly world: BagWorld,
    atlas: IconAtlas,
  ) {
    this.panel = new BagPanel(world.inventory, atlas, world.talents ?? null);
    this.held.visible = false;
    this.held.name = 'carried-item';
    this.root.add(this.panel.root, this.held);
  }

  get isOpen(): boolean {
    return this.panel.isOpen;
  }

  /** What you're carrying off its slot, if anything. */
  get holding(): Stack | null {
    return this.carry?.stack ?? null;
  }

  /** Compile its shaders now: its first opening shouldn't stall a frame. */
  warm(renderer: WebGLRenderer, camera: Camera, scene: Scene): void {
    this.panel.warm(renderer, camera, scene);
    const potion = itemOf('minor-healing-potion');
    if (potion) this.held.geometry = modelOf(potion);
    this.held.visible = true;
    renderer.compile(this.held, camera, scene);
    this.held.visible = false;
  }

  /** The panel open beside the bag's, if any. */
  get besideOpen(): BesidePanel | null {
    return this.beside;
  }

  /** Your things changed: the panels fill their slots again. */
  changed(): void {
    this.panel.changed();
    this.beside?.changed();
  }

  /** Is it open where it was put, beside a vendor's wares, rather than where you reached for it? */
  get isPinned(): boolean {
    return this.isOpen && this.pinned;
  }

  /**
   * Open `beside` next to the bag's panel, which comes round in front of a
   * head at `head` looking along `gaze`, with no reach: the stash's, when its
   * chest's lid is touched. With `at`, the bag's panel stands there instead,
   * turned to the head, and stays put: a vendor's wares, by the vendor.
   */
  openBeside(beside: BesidePanel, head: Vector3, gaze: Vector3, probes: readonly (BagProbe | null)[], why: string, at?: Vector3): void {
    this.cancel();
    if (this.beside !== beside) this.beside?.close();
    this.beside = beside;
    if (beside.root.parent !== this.panel.root) this.panel.root.add(beside.root);
    if (at) this.panel.placeAt(at, head);
    else this.panel.place(head, gaze);
    this.pinned = !!at;
    this.panel.setPage('bag');
    beside.show();
    this.armTabs(probes);
    sfx.parchment();
    this.log(`opened: ${why}`);
  }

  /** Put back whatever's carried, and shut the bag and what's open beside it. */
  close(why: string): void {
    if (!this.isOpen) return;
    this.cancel();
    this.panel.close();
    this.shutBeside();
    this.log(`closed: ${why}`);
  }

  private shutBeside(): void {
    this.beside?.close();
    this.beside = null;
    this.pinned = false;
  }

  private log(line: string): void {
    this.lines.push(line);
    if (this.lines.length > 60) this.lines.shift();
  }

  private cancel(): void {
    this.sip.reset();
    this.sharpen.reset();
    this.carry = null;
    this.beltTarget = null;
    this.held.visible = false;
  }

  update(input: BagInput): void {
    const { dt, head, gaze } = input;
    const R = CONFIG.bag.reach;
    const G = CONFIG.bag.grip;
    const now: Record<Handedness, { at: Vector3; speed: number; gripDown: boolean } | null> = { left: null, right: null };
    for (const side of ['left', 'right'] as const) {
      const hand = input.hands[side];
      const t = this.track[side];
      const was = t.held;
      t.held = hand.squeeze > (was ? G.off : G.on);
      t.gripDown = t.held && !was;
      if (!hand.tracked) {
        t.valid = false;
        continue;
      }
      // Speed in the rig, eased a little so one jittery frame doesn't decide.
      const rigPos = hand.grip.position;
      if (t.valid && dt > 0) {
        _v.subVectors(rigPos, t.prev).divideScalar(dt);
        t.speed += (_v.length() - t.speed) * (1 - Math.exp(-dt / R.speedLag));
        t.velocity.copy(_v).applyQuaternion(input.rig.quaternion);
      } else {
        t.speed = 0;
        t.velocity.set(0, 0, 0);
      }
      t.prev.copy(rigPos);
      t.valid = true;
      hand.grip.getWorldPosition(t.at);
      now[side] = { at: t.at, speed: t.speed, gripDown: t.gripDown };
    }

    const { shelf } = input;
    if (!input.alive) {
      this.close('you fell');
      shelf?.show(null, null);
      return;
    }

    // The reach over a shoulder opens the bag, and shuts it.
    this.reach.place(head, gaze);
    const reached = this.reach.update(dt, now, (hand, intensity, ms) => this.world.buzz(hand, intensity, ms));
    if (reached?.kind === 'grab') {
      if (this.isOpen) {
        this.world.buzz(reached.hand, R.closePulse.intensity, R.closePulse.ms);
        this.close(`${reached.hand} hand reached back`);
      } else this.open(reached.hand, reached.speed, input);
    } else if (reached) this.log(`not opened: ${reached.hand} hand too fast (${reached.speed.toFixed(1)} m/s)`);

    // Put beside a vendor's wares, it stays put, and shuts with them.
    if (this.isOpen && !this.pinned && this.panel.follow(head, gaze) === 'walkedAway') {
      this.cancel();
      this.shutBeside();
      this.log('closed: walked away');
    }
    // What's offered beside the bag: touched, and gripped to carry it (opening the bag for it).
    const shelfHover = shelf && !this.carry ? this.touchShelf(input, shelf) : null;
    if (this.isOpen) {
      const shows = this.carry ? this.carrying(input) : this.touching(input);
      const tab = this.pressTabs(input);
      this.show(dt, shows, tab);
    }
    const from = this.carry?.from;
    shelf?.show(shelfHover, from?.in === 'shelf' ? from.index : null);
  }

  /**
   * A fist or the tip on an item of the shelf lights it; the grip carries it
   * off towards the bag, which swings round in front of you if it's shut.
   * Returns the one touched.
   */
  private touchShelf(input: BagInput, shelf: Shelf): number | null {
    const B = CONFIG.bag.buzz;
    let hover: number | null = null;
    for (let i = 0; i < input.probes.length && !this.carry; i++) {
      const probe = input.probes[i];
      const index = probe && shelf.itemAt(probe.at);
      const stack = index !== null && index !== undefined ? shelf.stackAt(index) : null;
      if (!probe || index === null || index === undefined || !stack) continue;
      if (this.track[probe.hand].gripDown) {
        if (!this.isOpen) this.place(input, 'for an item offered');
        this.panel.setPage('bag');
        this.carry = { from: { in: 'shelf', index }, page: 'bag', spot: null, stack, probe: i, hand: probe.hand };
        this.world.buzz(probe.hand, B.pick.intensity, B.pick.ms);
        this.log(`picked up: ${itemOf(stack.id)?.name} from the board`);
        hover = null;
        break;
      }
      if (hover === null) {
        hover = index;
        if (index !== this.lastShelfHover) this.world.buzz(probe.hand, B.touch.intensity, B.touch.ms);
      }
    }
    this.lastShelfHover = hover;
    return hover;
  }

  /** Each panel draws what it's shown: the card on the panel whose slot it's over. */
  private show(dt: number, shows: PanelShows, tab: Tab | null): void {
    const { beside } = this;
    const onBeside = (spot: Spot | null) => (spot?.in === 'beside' ? spot.i : null);
    const cardBeside = shows.cardOver?.in === 'beside';
    if (beside) {
      beside.update(dt, {
        hover: onBeside(shows.hover),
        lifted: onBeside(shows.lifted),
        target: shows.target?.spot.in === 'beside' ? { i: shows.target.spot.i, fits: shows.target.fits } : null,
        card: cardBeside ? shows.card : null,
        cardOver: onBeside(shows.cardOver),
        tab: tab?.on === 'beside' ? tab.page : null,
      });
    }
    if (cardBeside) {
      shows.card = null;
      shows.cardOver = null;
    }
    shows.tab = tab?.on === 'bag' ? tab.page : null;
    shows.button = tab?.on === 'talents' ? tab.button : null;
    this.panel.update(dt, shows);
  }

  /** The slot `at` touches: the bag panel's, or the one's beside it. */
  private spotAt(at: Vector3, reach: Reach): Spot | null {
    const spot = this.panel.spotAt(at, reach);
    if (spot) return spot;
    const i = this.beside?.spotAt(at, reach) ?? null;
    return i === null ? null : { in: 'beside', i };
  }

  /** Where letting a carried `id` go at `at` puts it. */
  private targetAt(at: Vector3, id: string): Spot | null {
    const R = CONFIG.bag.release;
    const spot = this.panel.targetAt(at, id, R);
    if (spot) return spot;
    const i = this.beside?.targetAt(at, R) ?? null;
    return i === null ? null : { in: 'beside', i };
  }

  /** The place in your things a slot is. */
  private where(spot: Spot): Where | null {
    if (spot.in !== 'beside') return this.panel.where(spot);
    return this.beside?.where(spot.i) ?? null;
  }

  private stackAt(spot: Spot): Stack | null {
    const trade = this.beside?.trade;
    if (spot.in === 'beside' && trade) return trade.stackAt(spot.i);
    const where = this.where(spot);
    return where ? this.world.inventory.at(where) : null;
  }

  /** The page showing on the panel `spot` is on. */
  private pageOf(spot: Spot): Page | number {
    return spot.in === 'beside' ? (this.beside?.page ?? -1) : this.panel.page;
  }

  private open(hand: Handedness, speed: number, input: BagInput): void {
    const R = CONFIG.bag.reach;
    this.world.buzz(hand, R.openPulse.intensity, R.openPulse.ms);
    this.place(input, `${hand} hand at ${speed.toFixed(2)} m/s`);
  }

  /** Bring the panel round in front of you. */
  private place(input: BagInput, why: string): void {
    this.panel.place(input.head, input.gaze);
    this.pinned = false;
    this.armTabs(input.probes);
    sfx.parchment();
    this.log(`opened: ${why}`);
  }

  /** A fist or tip already resting on a tab as the panels open must leave it first. */
  private armTabs(probes: readonly (BagProbe | null)[]): void {
    this.lastHover = null;
    probes.forEach((p, i) => (this.onTab[i] = p && this.tabAt(p.at)));
    this.tabArming = CONFIG.bag.tabs.arming;
  }

  /** Nothing carried: a fist or the tip on an item shows its card, and the grip picks it up. */
  private touching(input: BagInput): PanelShows {
    const { world } = this;
    const B = CONFIG.bag.buzz;
    const shows = nothingShown();
    for (let i = 0; i < input.probes.length; i++) {
      const probe = input.probes[i];
      const spot = probe && this.spotAt(probe.at, CONFIG.bag.touch);
      const stack = spot && this.stackAt(spot);
      if (!probe || !spot || !stack) continue;
      if (this.track[probe.hand].gripDown) {
        const trade = spot.in === 'beside' ? this.beside?.trade : undefined;
        const from: From = trade && spot.in === 'beside' ? { in: 'ware', index: spot.i } : this.where(spot)!;
        const no = trade && from.in === 'ware' ? trade.canLift(from.index) : from.in === 'quest' ? 'quest' : null;
        if (no) {
          world.buzz(probe.hand, B.refused.intensity, B.refused.ms);
          this.log(`refused (${REFUSED[no]}): ${itemOf(stack.id)?.name}`);
        } else {
          this.carry = { from, page: this.pageOf(spot), spot, stack, probe: i, hand: probe.hand };
          world.buzz(probe.hand, B.pick.intensity, B.pick.ms);
          this.log(`picked up: ${itemOf(stack.id)?.name} from ${from.in === 'ware' ? trade!.name : label(from as Where)}`);
          return this.carrying(input);
        }
      }
      if (!shows.hover) {
        shows.hover = spot;
        if (!sameSpot(spot, this.lastHover)) world.buzz(probe.hand, B.touch.intensity, B.touch.ms);
      }
    }
    this.lastHover = shows.hover;
    const card = shows.hover && this.stackAt(shows.hover);
    shows.card = card;
    shows.cardOver = card ? shows.hover : null;
    return shows;
  }

  /** Something carried: it sticks to what touched it, and letting the grip go puts it where it's over. */
  private carrying(input: BagInput): PanelShows {
    const carry = this.carry!;
    const { world } = this;
    const { inventory } = world;
    const B = CONFIG.bag.buzz;
    const shows = nothingShown();
    const probe = input.probes[carry.probe];
    const hand = this.track[carry.hand];
    const shelf = input.shelf ?? null;
    // Carried off a shelf that's gone (the board folded), it goes back there.
    if (!probe || !input.hands[carry.hand].tracked || (carry.from.in === 'shelf' && !shelf)) {
      this.cancel();
      return shows;
    }
    this.held.geometry = modelOf(itemOf(carry.stack.id)!);
    this.held.position.copy(probe.at);
    this.held.scale.setScalar(0.12);
    this.held.visible = true;
    const target = this.targetAt(probe.at, carry.stack.id);
    const { from, spot } = carry;
    const lifted = spot && (spot.in === 'gear' || spot.in === 'belt' || carry.page === this.pageOf(spot)) ? spot : null;
    shows.lifted = lifted;
    shows.card = carry.stack;
    this.beltTarget = null;
    const trade = this.beside?.trade;
    if (trade && from.in !== 'shelf') return this.trading(input, trade, from, target, lifted, shows);
    // A ware whose board has gone goes back there.
    if (from.in === 'ware') {
      this.cancel();
      return shows;
    }
    // At your mouth, or on the edge in your other hand: drunk, or rubbed along it.
    if (from.in !== 'shelf') {
      const used = this.using(input, from, probe.at);
      if (used === 'used') return nothingShown();
      if (used === 'using') {
        shows.cardOver = lifted;
        if (hand.held) return shows;
        this.cancel();
        this.log(`back: ${itemOf(carry.stack.id)?.name} to ${label(from)}`);
        return nothingShown();
      }
    }
    // Off the panels, over a hip: onto the belt (a pick on Hale's board goes only into the bag).
    const R = CONFIG.bag.release;
    const hip =
      from.in !== 'shelf' && !target && !this.panel.over(probe.at, R) && !this.beside?.over(probe.at, R) ? (world.beltAt?.(probe.at) ?? null) : null;
    const to: Where | null = target ? this.where(target) : hip !== null ? { in: 'belt', slot: hip } : null;
    this.beltTarget = hip !== null && from.in !== 'shelf' ? { slot: hip, fits: inventory.check(from, { in: 'belt', slot: hip }) === null } : null;
    shows.cardOver = target ?? lifted;
    const refusal = (to: Where) => (from.in === 'shelf' ? shelf!.check(from.index, to) : inventory.check(from, to));
    shows.target = target && { spot: target, fits: !!to && refusal(to) === null };
    if (hand.held) return shows;

    // Let go.
    this.cancel();
    shows.lifted = null;
    shows.target = null;
    const name = itemOf(carry.stack.id)?.name;
    if (from.in === 'shelf') {
      // Into a bag slot it's taken; anywhere else it goes back where it was offered.
      const no = to ? shelf!.take(from.index, to) : null;
      if (!to) this.log(`back: ${name} to the board`);
      else if (no) {
        world.buzz(carry.hand, B.refused.intensity, B.refused.ms);
        this.log(`refused (${REFUSED[no]}): ${name} to ${label(to)}`);
      } else {
        world.buzz(carry.hand, B.place.intensity, B.place.ms);
        this.log(`took: ${name} to ${label(to)}`);
      }
      return shows;
    }
    if (to) {
      if (same(to, from)) return shows;
      const effects = inventory.move(from, to);
      const refused = effects.find((e) => e.kind === 'refused');
      if (refused) {
        world.buzz(carry.hand, B.refused.intensity, B.refused.ms);
        this.log(`refused (${REFUSED[refused.reason]}): ${name} to ${label(to)}`);
      } else {
        world.buzz(carry.hand, B.place.intensity, B.place.ms);
        this.log(`${to.in === 'gear' ? 'wore' : 'moved'}: ${name} to ${label(to)}`);
      }
      world.apply(effects, probe.at);
    } else if (this.panel.over(probe.at, CONFIG.bag.release) || this.beside?.over(probe.at, CONFIG.bag.release)) {
      this.log(`back: ${name} to ${label(from)}`);
    } else this.dropOff(from, name, probe.at, carry.hand);
    return shows;
  }

  /**
   * A consumable carried from `from`, held at `at`: at your mouth, a potion
   * or the elixir is drunk once it's been there long enough; rubbed along the
   * edge in your other hand, the whetstone sharpens it. 'using' while it's at
   * the mouth or on the edge (let go there, it goes back), 'used' once it has
   * been, and null otherwise.
   */
  private using(input: BagInput, from: Where, at: Vector3): 'using' | 'used' | null {
    const carry = this.carry!;
    const { world } = this;
    const item = itemOf(carry.stack.id);
    if (item?.kind !== 'consumable') return null;
    const whetstone = item.buff?.kind === 'whetstone';
    let done: boolean;
    let where: Vector3 = at;
    if (whetstone) {
      const rubbed = this.sharpen.update(at, world.edge?.(carry.hand) ?? null);
      if (rubbed === 'off') return null;
      const S = CONFIG.professions.sharpen.buzz;
      if (rubbed === 'stroke') {
        world.buzz(carry.hand, S.scrape.intensity, S.scrape.ms);
        world.buzz(other(carry.hand), S.scrape.intensity, S.scrape.ms);
        sfx.scrape(at);
      }
      done = rubbed === 'done';
    } else {
      if (!world.mouth) return null;
      where = world.mouth(_mouth);
      const sipped = this.sip.update(input.dt, at.distanceTo(where), this.track[carry.hand].speed);
      if (sipped === 'cancelled') this.log(`cancelled: ${item.name} pulled away`);
      if (sipped === 'away' || sipped === 'cancelled') return null;
      const D = CONFIG.belt.buzz.drink;
      if (this.sip.buzz) world.buzz(carry.hand, D.intensity, D.ms);
      done = sipped === 'drunk';
    }
    if (!done) return 'using';
    const effects = world.inventory.use(from);
    const refused = effects.find((e) => e.kind === 'refused');
    this.cancel();
    if (refused) {
      const B = CONFIG.bag.buzz.refused;
      world.buzz(carry.hand, B.intensity, B.ms);
      this.log(`refused (${REFUSED[refused.reason]}): ${item.name}`);
      return 'used';
    }
    if (whetstone) {
      const S = CONFIG.professions.sharpen.buzz.done;
      world.buzz(carry.hand, S.intensity, S.ms);
      world.buzz(other(carry.hand), S.intensity, S.ms);
      sfx.sharpened(at);
      this.log(`sharpened: ${item.name} from ${label(from)}`);
    } else {
      const G = CONFIG.belt.buzz.gulp;
      world.buzz(carry.hand, G.intensity, G.ms);
      sfx.gulp(where);
      this.log(`drank: ${item.name} from ${label(from)}`);
    }
    world.apply(effects, where);
    return 'used';
  }

  /**
   * Carrying beside a vendor's wares: a ware goes only into a bag slot, and
   * something of yours let go over their board is sold, moved within your
   * things, or dropped off both.
   */
  private trading(input: BagInput, trade: Trade, from: Where | Ware, target: Spot | null, lifted: Spot | null, shows: PanelShows): PanelShows {
    const carry = this.carry!;
    const { world } = this;
    const { inventory } = world;
    const B = CONFIG.bag.buzz;
    const probe = input.probes[carry.probe]!;
    const onBoard = target?.in === 'beside' || (!target && !!this.beside?.over(probe.at, CONFIG.bag.release));
    // Your slot it's over, if not the board's.
    const mine = target?.in === 'beside' ? null : target;
    const to = mine && this.where(mine);
    const ware = from.in === 'ware' ? from.index : null;
    const mineFrom = from.in === 'ware' ? null : from;
    // A ware's card stays on the board, saying what it costs.
    shows.cardOver = ware !== null ? lifted : (mine ?? (onBoard ? null : lifted));
    if (ware === null && onBoard) shows.card = null;
    if (ware !== null) shows.target = mine && { spot: mine, fits: !!to && trade.checkTake(ware, to) === null };
    else if (onBoard) shows.target = { spot: { in: 'beside', i: target?.in === 'beside' ? target.i : -1 }, fits: trade.checkGive(mineFrom!) === null };
    else shows.target = mine && { spot: mine, fits: !!to && inventory.check(mineFrom!, to) === null };
    if (this.track[carry.hand].held) return shows;

    // Let go.
    this.cancel();
    shows.lifted = null;
    shows.target = null;
    const name = itemOf(carry.stack.id)?.name;
    const done = (effects: InventoryEffect[], what: string, where: string) => {
      const refused = effects.find((e) => e.kind === 'refused');
      world.buzz(carry.hand, refused ? B.refused.intensity : B.place.intensity, refused ? B.refused.ms : B.place.ms);
      this.log(refused ? `refused (${REFUSED[refused.reason]}): ${name} to ${where}` : `${what}: ${name} to ${where}`);
      world.apply(effects, probe.at);
    };
    if (ware !== null) {
      if (to) done(trade.take(ware, to), trade.takes(ware), label(to));
      else this.log(`back: ${name} to ${trade.name}`);
    } else if (onBoard) done(trade.give(mineFrom!), trade.gives, trade.name);
    else if (to) {
      if (!same(to, mineFrom!)) done(inventory.move(mineFrom!, to), to.in === 'gear' ? 'wore' : 'moved', label(to));
    } else if (this.panel.over(probe.at, CONFIG.bag.release)) this.log(`back: ${name} to ${label(mineFrom!)}`);
    else this.dropOff(mineFrom!, name, probe.at, carry.hand);
    return shows;
  }

  /** Let go of away from the panels: it's dropped on the ground, falling from `at`. */
  private dropOff(from: Where, name: string | undefined, at: Vector3, hand: Handedness): void {
    const { world } = this;
    const B = CONFIG.bag.buzz;
    const effects = world.inventory.move(from, { in: 'ground' });
    const dropped = effects.find((e) => e.kind === 'dropped');
    if (dropped) {
      world.drop(dropped.stack, at, this.track[hand].velocity);
      world.buzz(hand, B.place.intensity, B.place.ms);
      this.log(`dropped: ${name}`);
    } else {
      world.buzz(hand, B.refused.intensity, B.refused.ms);
      this.log(`refused: ${name} can't be dropped`);
    }
    world.apply(effects, at);
  }

  /** The tab `at` touches: the bag panel's, a page's of the panel beside it, or a talent page button. */
  private tabAt(at: Vector3): Tab | null {
    const page = this.panel.tabAt(at, CONFIG.bag.touch);
    if (page) return { on: 'bag', page };
    const button = this.panel.buttonAt(at, CONFIG.bag.touch);
    if (button) return { on: 'talents', button };
    const other = this.beside?.tabAt(at, CONFIG.bag.touch) ?? null;
    return other === null ? null : { on: 'beside', page: other };
  }

  /** A fist or the tip arriving on a tab switches the page. Returns the tab one rests on, to light. */
  private pressTabs(input: BagInput): Tab | null {
    this.tabArming = Math.max(0, this.tabArming - input.dt);
    let press: { tab: Tab; hand: Handedness } | null = null;
    let lit: Tab | null = null;
    input.probes.forEach((probe, i) => {
      const tab = probe && this.tabAt(probe.at);
      const was = this.onTab[i] ?? null;
      this.onTab[i] = tab;
      if (!probe || !tab) return;
      lit ??= tab;
      if (!sameTab(tab, was) && this.tabArming <= 0 && !press) press = { tab, hand: probe.hand };
    });
    if (!press) return lit;
    const { tab, hand } = press as { tab: Tab; hand: Handedness };
    this.tabArming = CONFIG.bag.tabs.rearm;
    const B = CONFIG.bag.buzz.tab;
    this.world.buzz(hand, B.intensity, B.ms);
    if (tab.on === 'talents') this.press(tab.button, hand);
    else if (tab.on === 'bag') {
      if (tab.page === this.panel.page) return lit;
      this.panel.setPage(tab.page);
      this.log(`page: ${tab.page}`);
    } else if (this.beside) {
      if (tab.page === this.beside.page) return lit;
      this.beside.setPage(tab.page);
      this.log(`beside page: ${tab.page + 1}`);
    }
    this.lastHover = null;
    return lit;
  }

  /**
   * A talent page button pressed with `hand`: a talent spends a point, Reset
   * gives them all back, a shape is picked, and a second shape swaps with
   * it (the same one again puts it down). Refused, a strong buzz.
   */
  private press(button: TalentButton, hand: Handedness): void {
    const talents = this.world.talents;
    if (!talents) return;
    const B = CONFIG.bag.buzz;
    let refused: TalentRefusal | null = null;
    let did = '';
    switch (button.kind) {
      case 'talent': {
        refused = talents.spend(button.talent);
        const def = TALENT[button.talent];
        did = refused ? `refused (${UNSPENT[refused]}): ${def.name}` : `spent: ${def.name} ${talents.state.spentOn(button.talent)}/${def.max}`;
        break;
      }
      case 'reset': {
        const points = talents.state.pointsSpent;
        refused = talents.reset();
        did = refused ? `refused (${UNSPENT[refused]}): reset` : `reset: ${points} ${points === 1 ? 'point' : 'points'} back`;
        break;
      }
      case 'slot': {
        const { picked } = this.panel;
        if (picked === null) {
          this.panel.picked = button.shape;
          did = `picked: ${button.shape}`;
        } else if (picked === button.shape) {
          this.panel.picked = null;
          did = `put down: ${button.shape}`;
        } else {
          refused = talents.swap(picked, button.shape);
          this.panel.picked = null;
          did = refused ? `refused (${UNSPENT[refused]}): swap` : `swapped: ${picked} and ${button.shape}`;
        }
        break;
      }
    }
    if (refused) this.world.buzz(hand, B.refused.intensity, B.refused.ms);
    else this.world.buzz(hand, B.place.intensity, B.place.ms);
    this.log(did);
  }
}

const other = (hand: Handedness): Handedness => (hand === 'left' ? 'right' : 'left');

const same = (a: Where, b: Where) => a.in === b.in && (a.in === 'ground' || (b.in !== 'ground' && a.slot === b.slot));

/** A place in your things, for the log. */
function label(where: Where): string {
  if (where.in === 'ground') return 'the ground';
  if (where.in === 'gear') return where.slot;
  if (where.in === 'belt') return where.slot === 0 ? 'the left hip' : 'the right hip';
  return `${where.in} ${where.slot + 1}`;
}
