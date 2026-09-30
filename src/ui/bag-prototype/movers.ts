import { Mesh, type Object3D, Quaternion, Vector3 } from 'three';
import { sharedModelMaterial } from '../../models/materials';
import type { Handedness } from '../../player/input';
import { type Bag, type Item, sameSlot, slotLabel, type SlotRef } from './items';
import { modelOf } from './looks';
import { ALL_SLOTS, type GearPanel, type PanelShows, RELEASE, TOUCH } from './panel';

// PROTOTYPE (The bag and the gear panel): the three ways to move an item,
// switchable in the headset. Each takes this frame's fists, tip and hands and
// says what the panel should show. Throwaway.
//
// A: touch an item with a fist or the sword's tip and hold the grip: it
//    sticks to what touched it. Let go over a slot to put it there, over the
//    figure to wear it, or away from the panel to drop it. The research's pick.
// B: the talk board's way. Press an item to pick it, then press where it goes.
//    The drop key under the bag drops the picked item. No grip at all.
// C: grab it bodily. Close your hand on it (the weapon in that hand goes while
//    you hold it), carry it and let go.

/** A fist or the sword's tip, where it is, and whose hand. */
export interface Probe {
  readonly at: Vector3;
  readonly hand: Handedness;
  readonly kind: 'fist' | 'tip';
}

/** A hand this frame: where it is, its grip, and its velocity in the world. */
export interface HandFrame {
  readonly at: Vector3;
  readonly grip: Object3D;
  readonly gripDown: boolean;
  readonly gripHeld: boolean;
  readonly velocity: Vector3;
}

export interface MoverInput {
  readonly dt: number;
  /** Left fist, right fist, sword tip: null when untracked. */
  readonly probes: readonly (Probe | null)[];
  readonly hands: Record<Handedness, HandFrame | null>;
}

/** What a variant can do beyond the panel. */
export interface MoverWorld {
  readonly bag: Bag;
  readonly panel: GearPanel;
  /** Put an item on the ground: it falls from `at`. */
  drop(item: Item, at: Vector3, velocity?: Vector3): void;
  buzz(hand: Handedness, intensity: number, ms: number): void;
  /** Note what happened, for the readout and the checks. */
  log(line: string): void;
  /** Show or hide the weapon in a hand (C hides it while the hand holds an item). */
  weapon(hand: Handedness, shown: boolean): void;
}

export interface Mover {
  readonly key: 'a' | 'b' | 'c';
  readonly name: string;
  /** One line on how it works, shown when you switch to it. */
  readonly how: string;
  /** The item carried or picked, for the readout. */
  readonly holding: Item | null;
  /** The bag just opened. */
  opened(): void;
  /** The bag is closing, or the variant is switching: put back whatever's carried. */
  cancel(): void;
  update(input: MoverInput): PanelShows;
}

const BUZZ = {
  touch: { intensity: 0.25, ms: 20 },
  pick: { intensity: 0.6, ms: 40 },
  place: { intensity: 0.8, ms: 50 },
  refused: { intensity: 1, ms: 120 },
};

const nothing = (): PanelShows => ({ hover: null, selected: null, lifted: null, target: null, card: null, dropKey: false, dropLit: false });

/** The item you've picked up, drawn as its model wherever it's carried. */
export class HeldModel {
  readonly mesh = new Mesh(undefined, sharedModelMaterial());
  constructor() {
    this.mesh.visible = false;
    this.mesh.name = 'held-item';
  }
  show(it: Item, at: Vector3, size: number, turn?: Quaternion): void {
    this.mesh.geometry = modelOf(it);
    this.mesh.position.copy(at);
    this.mesh.scale.setScalar(size);
    if (turn) this.mesh.quaternion.copy(turn);
    this.mesh.visible = true;
  }
  hide(): void {
    this.mesh.visible = false;
  }
}

/** Would letting `from`'s item go at `to` work? */
function fits(bag: Bag, from: SlotRef, to: SlotRef): boolean {
  const a = bag.at(from);
  const b = bag.at(to);
  return !!a && bag.fits(a, to) && (!b || sameSlot(from, to) || bag.fits(b, from));
}

/** Let `from`'s item go at `to`, or refuse, with a buzz either way. */
function place(w: MoverWorld, hand: Handedness, from: SlotRef, to: SlotRef): void {
  const it = w.bag.at(from)!;
  const r = w.bag.move(from, to);
  if (r === 'same') return;
  if (r === 'refused') {
    w.buzz(hand, BUZZ.refused.intensity, BUZZ.refused.ms);
    w.log(`refused: ${it.name} can't go in ${slotLabel(to)}`);
    return;
  }
  w.buzz(hand, BUZZ.place.intensity, BUZZ.place.ms);
  w.log(`${r}: ${it.name} to ${slotLabel(to)}`);
}

/** A: touch with a fist or the tip, hold the grip to carry. */
export class TouchCarry implements Mover {
  readonly key = 'a';
  readonly name = 'Touch and carry';
  readonly how = 'Touch an item with a fist or the sword tip to read it. Hold the grip to carry it on what touched it; let go over a slot, over the figure to wear it, or off the panel to drop it.';
  private carry: { from: SlotRef; item: Item; probe: number; hand: Handedness } | null = null;
  private lastHover: SlotRef | null = null;

  constructor(
    private readonly w: MoverWorld,
    private readonly held: HeldModel,
  ) {}

  get holding(): Item | null {
    return this.carry?.item ?? null;
  }

  opened(): void {
    this.lastHover = null;
  }

  cancel(): void {
    this.carry = null;
    this.held.hide();
  }

  update(input: MoverInput): PanelShows {
    const { bag, panel } = this.w;
    const shows = nothing();
    const carry = this.carry;
    if (carry) {
      const probe = input.probes[carry.probe];
      const hand = input.hands[carry.hand];
      if (!probe || !hand) {
        this.cancel();
        return shows;
      }
      this.held.show(carry.item, probe.at, 0.12);
      const target = panel.targetAt(probe.at, carry.item, RELEASE);
      shows.lifted = carry.from;
      shows.card = carry.item;
      shows.target = target && { ref: target, fits: fits(bag, carry.from, target) };
      if (!hand.gripHeld) {
        this.cancel();
        shows.lifted = null;
        if (target) place(this.w, carry.hand, carry.from, target);
        else if (panel.over(probe.at, RELEASE)) this.w.log(`back: ${carry.item.name} to ${slotLabel(carry.from)}`);
        else {
          bag.take(carry.from);
          this.w.drop(carry.item, probe.at, hand.velocity);
          this.w.buzz(carry.hand, BUZZ.place.intensity, BUZZ.place.ms);
          this.w.log(`dropped: ${carry.item.name}`);
        }
      }
      return shows;
    }
    for (let i = 0; i < input.probes.length; i++) {
      const probe = input.probes[i];
      const ref = probe && panel.slotAt(probe.at, TOUCH);
      if (!probe || !ref || !bag.at(ref)) continue;
      if (input.hands[probe.hand]?.gripDown) {
        this.carry = { from: ref, item: bag.at(ref)!, probe: i, hand: probe.hand };
        this.w.buzz(probe.hand, BUZZ.pick.intensity, BUZZ.pick.ms);
        this.w.log(`picked up: ${bag.at(ref)!.name} from ${slotLabel(ref)}`);
        return this.update(input);
      }
      if (!shows.hover) {
        shows.hover = ref;
        if (!sameSlot(ref, this.lastHover)) this.w.buzz(probe.hand, BUZZ.touch.intensity, BUZZ.touch.ms);
      }
    }
    this.lastHover = shows.hover;
    shows.card = shows.hover && bag.at(shows.hover);
    return shows;
  }
}

/** B: press an item, then press where it goes. */
export class PressPress implements Mover {
  readonly key = 'b';
  readonly name = 'Press, then press';
  readonly how = "Hale's board's way: press an item with a fist or the sword tip to pick it and read it, then press the slot it goes to, or the figure to wear it. Drop drops it. Press it again to put it down.";
  /** What each probe touched last frame: it must arrive somewhere new to press it. */
  private readonly was: (SlotRef | 'drop' | 'figure' | null)[] = [];
  private selected: SlotRef | null = null;
  private arming = 0;
  private settle = true;
  static readonly ARMING = 0.4;
  static readonly REARM = 0.3;

  constructor(private readonly w: MoverWorld) {}

  get holding(): Item | null {
    return this.selected && this.w.bag.at(this.selected);
  }

  opened(): void {
    this.settle = true;
    this.arming = PressPress.ARMING;
  }

  cancel(): void {
    this.selected = null;
  }

  private touched(at: Vector3): SlotRef | 'drop' | 'figure' | null {
    const { panel } = this.w;
    return panel.slotAt(at, TOUCH) ?? (panel.dropKeyAt(at, TOUCH) ? 'drop' : panel.figureAt(at, TOUCH) ? 'figure' : null);
  }

  update(input: MoverInput): PanelShows {
    const { bag } = this.w;
    const shows = nothing();
    shows.dropKey = true;
    this.arming = Math.max(0, this.arming - input.dt);
    let press: { what: SlotRef | 'drop' | 'figure'; hand: Handedness } | null = null;
    input.probes.forEach((probe, i) => {
      const now = probe && this.touched(probe.at);
      const before = this.was[i] ?? null;
      const same = typeof now === 'string' || typeof before === 'string' ? now === before : sameSlot(now, before);
      this.was[i] = now;
      if (!probe || !now) return;
      if (now === 'drop') shows.dropLit = true;
      else if (now !== 'figure' && !shows.hover) shows.hover = now;
      if (!same && !this.settle && this.arming <= 0 && !press) press = { what: now, hand: probe.hand };
    });
    this.settle = false;
    if (press) this.press(press);
    const sel = this.selected;
    shows.selected = sel;
    const hover = shows.hover;
    if (sel && hover && !sameSlot(sel, hover)) shows.target = { ref: hover, fits: fits(bag, sel, hover) };
    shows.card = (sel && bag.at(sel)) ?? (hover && bag.at(hover));
    return shows;
  }

  private press({ what, hand }: { what: SlotRef | 'drop' | 'figure'; hand: Handedness }): void {
    const { bag, panel } = this.w;
    this.arming = PressPress.REARM;
    const sel = this.selected;
    if (what === 'drop') {
      if (!sel) return;
      const it = bag.take(sel)!;
      this.selected = null;
      this.w.drop(it, panel.dropKeyWorld(new Vector3(), 0.05));
      this.w.buzz(hand, BUZZ.place.intensity, BUZZ.place.ms);
      this.w.log(`dropped: ${it.name}`);
      return;
    }
    if (what === 'figure') {
      const it = sel && bag.at(sel);
      if (!sel || !it?.slot) return;
      this.selected = null;
      place(this.w, hand, sel, { kind: 'gear', slot: it.slot });
      return;
    }
    if (!sel) {
      const it = bag.at(what);
      if (!it) return;
      this.selected = what;
      this.w.buzz(hand, BUZZ.pick.intensity, BUZZ.pick.ms);
      this.w.log(`picked: ${it.name} in ${slotLabel(what)}`);
      return;
    }
    if (sameSlot(sel, what)) {
      this.selected = null;
      this.w.buzz(hand, BUZZ.touch.intensity, BUZZ.touch.ms);
      this.w.log('put down');
      return;
    }
    if (fits(bag, sel, what)) this.selected = null;
    place(this.w, hand, sel, what);
  }
}

/** How close a hand must be to an item to close on it (m). */
const GRAB = 0.075;
/** Where a held item sits from the grip, in the grip's space. */
const IN_HAND = new Vector3(0, -0.01, -0.04);
const _slot = new Vector3();
const _at = new Vector3();
const _q = new Quaternion();

/** C: grab it bodily with the hand; the weapon in that hand goes while you hold it. */
export class Grab implements Mover {
  readonly key = 'c';
  readonly name = 'Grab it';
  readonly how = 'Put your hand on an item to read it. Squeeze the grip to take it in your hand (your weapon goes meanwhile), and let go over a slot, over the figure to wear it, or off the panel to drop it.';
  private hold: { from: SlotRef; item: Item; hand: Handedness } | null = null;
  private lastHover: SlotRef | null = null;

  constructor(
    private readonly w: MoverWorld,
    private readonly held: HeldModel,
  ) {}

  get holding(): Item | null {
    return this.hold?.item ?? null;
  }

  opened(): void {
    this.lastHover = null;
  }

  cancel(): void {
    if (this.hold) this.w.weapon(this.hold.hand, true);
    this.hold = null;
    this.held.hide();
  }

  /** The item slot nearest `at`, within reach of a hand. */
  private nearest(at: Vector3): SlotRef | null {
    let best: SlotRef | null = null;
    let bestD = GRAB;
    for (const ref of ALL_SLOTS) {
      if (!this.w.bag.at(ref)) continue;
      const d = this.w.panel.slotWorld(ref, _slot, 0.02).distanceTo(at);
      if (d < bestD) {
        best = ref;
        bestD = d;
      }
    }
    return best;
  }

  update(input: MoverInput): PanelShows {
    const { bag, panel } = this.w;
    const shows = nothing();
    const hold = this.hold;
    if (hold) {
      const hand = input.hands[hold.hand];
      if (!hand) {
        this.cancel();
        return shows;
      }
      hand.grip.getWorldQuaternion(_q);
      this.held.show(hold.item, hand.grip.localToWorld(_at.copy(IN_HAND)), 0.16, _q);
      // Aimed by the hand, as it was taken: the slot the hand is over.
      _at.copy(hand.at);
      const target = panel.targetAt(_at, hold.item, RELEASE);
      shows.lifted = hold.from;
      shows.card = hold.item;
      shows.target = target && { ref: target, fits: fits(bag, hold.from, target) };
      if (!hand.gripHeld) {
        this.cancel();
        shows.lifted = null;
        if (target) place(this.w, hold.hand, hold.from, target);
        else if (panel.over(_at, RELEASE)) this.w.log(`back: ${hold.item.name} to ${slotLabel(hold.from)}`);
        else {
          bag.take(hold.from);
          this.w.drop(hold.item, _at, hand.velocity);
          this.w.buzz(hold.hand, BUZZ.place.intensity, BUZZ.place.ms);
          this.w.log(`dropped: ${hold.item.name}`);
        }
      }
      return shows;
    }
    for (const side of ['left', 'right'] as const) {
      const hand = input.hands[side];
      const ref = hand && this.nearest(hand.at);
      if (!hand || !ref) continue;
      if (hand.gripDown) {
        this.hold = { from: ref, item: bag.at(ref)!, hand: side };
        this.w.weapon(side, false);
        this.w.buzz(side, BUZZ.pick.intensity, BUZZ.pick.ms);
        this.w.log(`picked up: ${bag.at(ref)!.name} from ${slotLabel(ref)}`);
        return this.update(input);
      }
      if (!shows.hover) {
        shows.hover = ref;
        if (!sameSlot(ref, this.lastHover)) this.w.buzz(side, BUZZ.touch.intensity, BUZZ.touch.ms);
      }
    }
    this.lastHover = shows.hover;
    shows.card = shows.hover && bag.at(shows.hover);
    return shows;
  }
}
