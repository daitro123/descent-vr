import {
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  RingGeometry,
} from 'three';

// PROTOTYPE (Hammering at the anvil): what lies on the anvil, in the forge and
// in the tongs. Oakvale's first tier (ticket 03): 2 copper ore smelt to a
// copper bar; 1 rough stone is hammered into a whetstone; 4 copper bars are
// heated, hammered and quenched into copper gauntlets. Throwaway.

/** What the bag holds (the prototype's stand-in for Inventory's bag). */
export type Material = 'ore' | 'stone' | 'bar' | 'whetstone' | 'gauntlets';
export type Bag = Record<Material, number>;
export const STARTING_BAG: Readonly<Bag> = { ore: 6, stone: 3, bar: 3, whetstone: 0, gauntlets: 0 };
export const NAMES: Record<Material, [string, string]> = {
  ore: ['Copper ore', 'copper ore'],
  stone: ['Rough stone', 'rough stone'],
  bar: ['Copper bar', 'copper bars'],
  whetstone: ['Whetstone', 'whetstones'],
  gauntlets: ['Copper gauntlets', 'copper gauntlets'],
};

export type Recipe = 'bar' | 'whetstone' | 'gauntlets';
export const RECIPES: Record<Recipe, { label: string; takes: Material; n: number; where: string }> = {
  bar: { label: 'Copper bar', takes: 'ore', n: 2, where: 'smelted in the crucible' },
  whetstone: { label: 'Whetstone', takes: 'stone', n: 1, where: 'hammered cold' },
  gauntlets: { label: 'Copper gauntlets', takes: 'bar', n: 4, where: 'heated, hammered, quenched' },
};

/**
 * What a piece is: a handful of ore, a rough stone, some bars (`count`), one
 * smelted bar, the gauntlets' blank, or a finished whetstone or gauntlets.
 */
export type Kind = 'ore' | 'stone' | 'bars' | 'bar' | 'blank' | 'whetstone' | 'gauntlets';

/** Where a piece is: on a station's spot, in the tongs, or flying off to the bag. */
export type Place = 'crucible' | 'mould' | 'fire' | 'anvil' | 'held' | 'toBag';

/** Hot enough to work (heat runs 0 cold to 1 fresh from the fire). */
export const WORKING_HEAT = 0.3;

/** A spot on the work to strike, in the piece's frame, and how far it's worked (0 to 1). */
export interface Mark {
  readonly x: number;
  readonly z: number;
  value: number;
  readonly ring: Mesh<RingGeometry, MeshBasicMaterial>;
  readonly dent: Mesh<CircleGeometry, MeshBasicMaterial>;
}

const COPPER = 0xb8703c;
const COPPER_DONE = 0x8a4e2c;
const STONE = 0x7c7a74;
const ORE = 0x7a5a3a;
const HOT = new Color(0xff4a08);
const WHITE_HOT = new Color(0xffb040);
const _c = new Color();

/** Where the marks go on each work: the whetstone's three, the gauntlets' five, zigzagged. */
const MARKS: Record<'whetstone' | 'gauntlets', [number, number][]> = {
  whetstone: [[-0.065, 0.014], [0, -0.014], [0.065, 0.014]],
  gauntlets: [[-0.1, 0.03], [-0.05, -0.03], [0, 0.03], [0.05, -0.03], [0.1, 0.03]],
};

export class Piece {
  readonly root = new Group();
  private body = new Group();
  private readonly mats: MeshLambertMaterial[] = [];
  heat = 0;
  place: Place = 'held';
  /** Where it goes back to if let go of somewhere it can't be (a spot, or the bag). */
  home: Place | 'bag' = 'bag';
  /** Being worked: which recipe, how far, and its marks. */
  work: { recipe: 'whetstone' | 'gauntlets'; units: number; need: number; marks: Mark[]; quenched: boolean } | null = null;
  /** The top of the piece above where it rests. */
  top = 0;
  private baseTop = 0;
  private flash = 0;

  constructor(
    public kind: Kind,
    public count = 1,
  ) {
    this.root.add(this.body);
    this.build();
  }

  /** Something to take off the anvil or out of the tongs and keep. */
  get made(): boolean {
    const w = this.work;
    if (this.kind === 'whetstone') return !!w && w.units >= w.need;
    if (this.kind === 'gauntlets') return !!w && w.quenched;
    return this.kind === 'bar';
  }

  get workDone(): boolean {
    return !!this.work && this.work.units >= this.work.need - 1e-6;
  }

  /** Needs heat to work: the gauntlets' blank. The whetstone is hammered cold. */
  get needsHeat(): boolean {
    return this.work?.recipe === 'gauntlets';
  }

  get hot(): boolean {
    return this.heat >= WORKING_HEAT;
  }

  /** What it goes into the bag as, and how many. */
  get asMaterial(): [Material, number] | null {
    switch (this.kind) {
      case 'ore': return ['ore', this.count];
      case 'stone': return this.work ? null : ['stone', 1];
      case 'bars': return ['bar', this.count];
      case 'bar': return ['bar', 1];
      case 'whetstone': return this.made ? ['whetstone', 1] : null;
      case 'gauntlets': return this.made ? ['gauntlets', 1] : null;
      case 'blank': return null;
    }
  }

  /** Start working it: a stone becomes the whetstone to be, four bars the gauntlets' blank. */
  startWork(recipe: 'whetstone' | 'gauntlets'): void {
    this.kind = recipe === 'whetstone' ? 'whetstone' : 'blank';
    this.count = 1;
    this.build();
    const marks = MARKS[recipe].map(([x, z]) => {
      const ring = new Mesh(new RingGeometry(0.016, 0.024, 16), new MeshBasicMaterial({ color: 0xffe070, fog: false }));
      const dent = new Mesh(new CircleGeometry(0.02, 12), new MeshBasicMaterial({ color: 0x2a1a10, transparent: true, opacity: 0 }));
      for (const m of [ring, dent]) {
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, this.top + 0.002, z);
        this.root.add(m);
      }
      return { x, z, value: 0, ring, dent };
    });
    this.work = { recipe, units: 0, need: marks.length, marks, quenched: false };
  }

  /** Show how far it's worked: it flattens and spreads, dents where it's been struck. */
  shape(showMarks: boolean): void {
    const w = this.work;
    if (!w) return;
    const f = Math.min(1, w.units / w.need);
    if (this.kind === 'blank' || (this.kind === 'whetstone' && !this.made)) {
      this.body.scale.set(1 + 0.14 * f, 1 - 0.4 * f, 1 + 0.06 * f);
      this.top = this.baseTop * this.body.scale.y;
    }
    const workable = !this.needsHeat || this.hot;
    const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 120);
    for (const m of w.marks) {
      m.ring.position.y = m.dent.position.y = this.top + 0.002;
      m.ring.visible = showMarks && m.value < 1 && !this.workDone;
      m.ring.material.color.setHex(m.value > 0 ? 0xff9a30 : 0xffe070).multiplyScalar(workable ? pulse : 0.25);
      m.dent.material.opacity = Math.min(0.55, m.value * 0.55);
      m.dent.visible = !this.workDone;
    }
  }

  /** In beat mode the marks aren't aimed at; dents still show where the work has got to, in order. */
  dentInOrder(amount: number): void {
    const w = this.work;
    if (!w) return;
    let left = amount;
    for (const m of w.marks) {
      if (left <= 0) break;
      const take = Math.min(1 - m.value, left);
      m.value += take;
      left -= take;
    }
  }

  /** The work is done: the whetstone takes its shape, the blank becomes gauntlets (still hot, to quench). */
  finish(): void {
    if (this.kind === 'blank') this.kind = 'gauntlets';
    this.build();
    this.shape(false);
  }

  quench(): void {
    if (this.work) this.work.quenched = true;
    this.heat = 0;
    this.build();
  }

  /** A great strike lights it up for a moment. */
  flashNow(): void {
    this.flash = 1;
  }

  update(dt: number): void {
    this.flash = Math.max(0, this.flash - dt * 5);
    const glowing = this.kind === 'bars' || this.kind === 'bar' || this.kind === 'blank' || this.kind === 'gauntlets';
    for (const m of this.mats) {
      if (glowing && this.heat > 0) {
        _c.copy(HOT).lerp(WHITE_HOT, Math.max(0, this.heat - 0.6) / 0.4).multiplyScalar(Math.min(1, this.heat * 1.4));
        m.emissive.copy(_c);
      } else m.emissive.setRGB(0, 0, 0);
      if (this.flash > 0) m.emissive.addScalar(this.flash * 0.35);
    }
  }

  private material(color: number): MeshLambertMaterial {
    const m = new MeshLambertMaterial({ color, flatShading: true });
    this.mats.push(m);
    return m;
  }

  /** (Re)build the body for what it is now. */
  private build(): void {
    this.root.remove(this.body);
    this.body = new Group();
    this.root.add(this.body);
    this.mats.length = 0;
    const add = (geo: BoxGeometry | DodecahedronGeometry | CylinderGeometry, color: number, x: number, y: number, z: number) => {
      const mesh = new Mesh(geo, this.material(color));
      mesh.position.set(x, y, z);
      this.body.add(mesh);
      return mesh;
    };
    switch (this.kind) {
      case 'ore':
        for (let i = 0; i < this.count; i++) add(new DodecahedronGeometry(0.034), ORE, (i - (this.count - 1) / 2) * 0.07, 0.03, 0).rotation.set(i, i * 2, 0);
        this.top = 0.065;
        break;
      case 'stone':
        add(new BoxGeometry(0.2, 0.07, 0.08), STONE, 0, 0.035, 0).rotation.y = 0.04;
        this.top = 0.07;
        break;
      case 'whetstone':
        if (this.work && this.work.units >= this.work.need) {
          add(new BoxGeometry(0.17, 0.03, 0.05), 0xa8a49a, 0, 0.015, 0);
          add(new BoxGeometry(0.15, 0.004, 0.04), 0xc8c4b8, 0, 0.032, 0);
          this.top = 0.034;
        } else {
          add(new BoxGeometry(0.2, 0.07, 0.08), STONE, 0, 0.035, 0).rotation.y = 0.04;
          this.top = 0.07;
        }
        break;
      case 'bars':
        for (let i = 0; i < this.count; i++) {
          add(new BoxGeometry(0.16, 0.028, 0.04), COPPER, 0, 0.014 + Math.floor(i / 2) * 0.03, (i % 2 ? 1 : -1) * 0.022);
        }
        this.top = 0.03 * Math.ceil(this.count / 2);
        break;
      case 'bar':
        add(new BoxGeometry(0.16, 0.028, 0.04), COPPER, 0, 0.014, 0);
        this.top = 0.028;
        break;
      case 'blank':
        add(new BoxGeometry(0.26, 0.036, 0.12), COPPER, 0, 0.018, 0);
        this.top = 0.036;
        break;
      case 'gauntlets': {
        const color = this.work?.quenched ? COPPER_DONE : COPPER;
        for (const side of [-1, 1]) {
          const x = side * 0.065;
          add(new BoxGeometry(0.08, 0.035, 0.1), color, x, 0.018, 0.01);
          for (let f = 0; f < 4; f++) add(new BoxGeometry(0.016, 0.02, 0.05), color, x - 0.027 + f * 0.018, 0.012, -0.062);
          add(new CylinderGeometry(0.042, 0.048, 0.05, 8), color, x, 0.03, 0.08).rotation.x = Math.PI / 2;
        }
        this.top = 0.05;
        break;
      }
    }
    this.baseTop = this.top;
  }
}
