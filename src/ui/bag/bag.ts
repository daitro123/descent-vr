import { type Camera, Group, Mesh, type Object3D, type Scene, Vector3, type WebGLRenderer } from 'three';
import { CONFIG } from '../../config';
import { sfx } from '../../fx/sfx';
import type { Inventory, InventoryEffect, Refusal, Stack, Where } from '../../inventory';
import { itemOf } from '../../items';
import { sharedModelMaterial } from '../../models/materials';
import type { Handedness } from '../../player/input';
import { type Page, sameSpot, type Spot } from './layout';
import { type IconAtlas, modelOf } from './looks';
import { BagPanel, nothingShown, type PanelShows } from './panel';
import { ShoulderReach } from './reach';

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
}

/** What the bag does beyond the panel. */
export interface BagWorld {
  readonly inventory: Inventory;
  buzz(hand: Handedness, intensity: number, ms: number): void;
  /** What an operation on your things did, at `at`: shown and saved. */
  apply(effects: readonly InventoryEffect[], at: Vector3): void;
  /** Let go of away from the panel: it lies on the ground, falling from `at`. */
  drop(stack: Stack, at: Vector3, velocity: Vector3): void;
}

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
  private carry: { from: Where; page: Page; spot: Spot; stack: Stack; probe: number; hand: Handedness } | null = null;
  private lastHover: Spot | null = null;
  /** The tab each probe rested on last frame: it must leave before it can press again. */
  private readonly onTab: (Page | null)[] = [];
  private tabArming = 0;

  constructor(
    private readonly world: BagWorld,
    atlas: IconAtlas,
  ) {
    this.panel = new BagPanel(world.inventory, atlas);
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

  /** Your things changed: the panel fills its slots again. */
  changed(): void {
    this.panel.changed();
  }

  /** Put back whatever's carried, and shut the bag. */
  close(why: string): void {
    if (!this.isOpen) return;
    this.cancel();
    this.panel.close();
    this.log(`closed: ${why}`);
  }

  private log(line: string): void {
    this.lines.push(line);
    if (this.lines.length > 60) this.lines.shift();
  }

  private cancel(): void {
    this.carry = null;
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

    if (!input.alive) {
      this.close('you fell');
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

    if (this.isOpen && this.panel.follow(head, gaze) === 'walkedAway') {
      this.cancel();
      this.log('closed: walked away');
    }
    if (!this.isOpen) return;
    const shows = this.carry ? this.carrying(input) : this.touching(input);
    this.pressTabs(input, shows);
    this.panel.update(dt, shows);
  }

  private open(hand: Handedness, speed: number, input: BagInput): void {
    const R = CONFIG.bag.reach;
    this.panel.place(input.head, input.gaze);
    this.lastHover = null;
    // A fist or tip already resting on a tab as it opens must leave it first.
    input.probes.forEach((p, i) => (this.onTab[i] = p && this.panel.tabAt(p.at, CONFIG.bag.touch)));
    this.tabArming = CONFIG.bag.tabs.arming;
    this.world.buzz(hand, R.openPulse.intensity, R.openPulse.ms);
    sfx.parchment();
    this.log(`opened: ${hand} hand at ${speed.toFixed(2)} m/s`);
  }

  /** Nothing carried: a fist or the tip on an item shows its card, and the grip picks it up. */
  private touching(input: BagInput): PanelShows {
    const { panel, world } = this;
    const B = CONFIG.bag.buzz;
    const shows = nothingShown();
    for (let i = 0; i < input.probes.length; i++) {
      const probe = input.probes[i];
      const spot = probe && panel.spotAt(probe.at, CONFIG.bag.touch);
      const stack = spot && panel.stackAt(spot);
      if (!probe || !spot || !stack) continue;
      if (this.track[probe.hand].gripDown) {
        const from = panel.where(spot)!;
        if (from.in === 'quest') {
          world.buzz(probe.hand, B.refused.intensity, B.refused.ms);
          this.log(`refused (${REFUSED.quest}): ${itemOf(stack.id)?.name}`);
        } else {
          this.carry = { from, page: panel.page, spot, stack, probe: i, hand: probe.hand };
          world.buzz(probe.hand, B.pick.intensity, B.pick.ms);
          this.log(`picked up: ${itemOf(stack.id)?.name} from ${label(from)}`);
          return this.carrying(input);
        }
      }
      if (!shows.hover) {
        shows.hover = spot;
        if (!sameSpot(spot, this.lastHover)) world.buzz(probe.hand, B.touch.intensity, B.touch.ms);
      }
    }
    this.lastHover = shows.hover;
    const card = shows.hover && panel.stackAt(shows.hover);
    shows.card = card;
    shows.cardOver = card ? shows.hover : null;
    return shows;
  }

  /** Something carried: it sticks to what touched it, and letting the grip go puts it where it's over. */
  private carrying(input: BagInput): PanelShows {
    const carry = this.carry!;
    const { panel, world } = this;
    const { inventory } = world;
    const B = CONFIG.bag.buzz;
    const shows = nothingShown();
    const probe = input.probes[carry.probe];
    const hand = this.track[carry.hand];
    if (!probe || !input.hands[carry.hand].tracked) {
      this.cancel();
      return shows;
    }
    this.held.geometry = modelOf(itemOf(carry.stack.id)!);
    this.held.position.copy(probe.at);
    this.held.scale.setScalar(0.12);
    this.held.visible = true;
    const target = panel.targetAt(probe.at, carry.stack.id, CONFIG.bag.release);
    const to = target && panel.where(target);
    const lifted = carry.spot.in === 'gear' || carry.page === panel.page ? carry.spot : null;
    shows.lifted = lifted;
    shows.card = carry.stack;
    shows.cardOver = target ?? lifted;
    shows.target = target && { spot: target, fits: !!to && inventory.check(carry.from, to) === null };
    if (hand.held) return shows;

    // Let go.
    this.cancel();
    shows.lifted = null;
    shows.target = null;
    const name = itemOf(carry.stack.id)?.name;
    if (to) {
      if (same(to, carry.from)) return shows;
      const effects = inventory.move(carry.from, to);
      const refused = effects.find((e) => e.kind === 'refused');
      if (refused) {
        world.buzz(carry.hand, B.refused.intensity, B.refused.ms);
        this.log(`refused (${REFUSED[refused.reason]}): ${name} to ${label(to)}`);
      } else {
        world.buzz(carry.hand, B.place.intensity, B.place.ms);
        this.log(`${to.in === 'gear' ? 'wore' : 'moved'}: ${name} to ${label(to)}`);
      }
      world.apply(effects, probe.at);
    } else if (panel.over(probe.at, CONFIG.bag.release)) {
      this.log(`back: ${name} to ${label(carry.from)}`);
    } else {
      const effects = inventory.move(carry.from, { in: 'ground' });
      const dropped = effects.find((e) => e.kind === 'dropped');
      if (dropped) {
        world.drop(dropped.stack, probe.at, hand.velocity);
        world.buzz(carry.hand, B.place.intensity, B.place.ms);
        this.log(`dropped: ${name}`);
      } else {
        world.buzz(carry.hand, B.refused.intensity, B.refused.ms);
        this.log(`refused: ${name} can't be dropped`);
      }
      world.apply(effects, probe.at);
    }
    return shows;
  }

  /** A fist or the tip arriving on a tab switches the page. */
  private pressTabs(input: BagInput, shows: PanelShows): void {
    this.tabArming = Math.max(0, this.tabArming - input.dt);
    let press: { page: Page; hand: Handedness } | null = null;
    input.probes.forEach((probe, i) => {
      const tab = probe && this.panel.tabAt(probe.at, CONFIG.bag.touch);
      const was = this.onTab[i] ?? null;
      this.onTab[i] = tab;
      if (!probe || !tab) return;
      shows.tab ??= tab;
      if (tab !== was && this.tabArming <= 0 && !press) press = { page: tab, hand: probe.hand };
    });
    if (!press) return;
    const { page, hand } = press as { page: Page; hand: Handedness };
    this.tabArming = CONFIG.bag.tabs.rearm;
    const B = CONFIG.bag.buzz.tab;
    this.world.buzz(hand, B.intensity, B.ms);
    if (page === this.panel.page) return;
    this.panel.setPage(page);
    this.lastHover = null;
    this.log(`page: ${page}`);
  }
}

const same = (a: Where, b: Where) => a.in === b.in && (a.in === 'ground' || (b.in !== 'ground' && a.slot === b.slot));

/** A place in your things, for the log. */
function label(where: Where): string {
  if (where.in === 'ground') return 'the ground';
  if (where.in === 'gear') return where.slot;
  return `${where.in} ${where.slot + 1}`;
}
