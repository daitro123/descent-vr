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
import { CONFIG } from '../../config';
import type { Piece } from './work';

// What lies in the crucible, on the mould, in the fire, on the anvil or in
// the tongs, drawn from the make under way (work.ts): two ore melting, the
// bar they become, the rough stone and the whetstone it's hammered into, the
// gauntlets' blank glowing with heat and the gauntlets it's shaped into. The
// marks glow on the work, and dent as they're struck. Promoted from
// ?proto=anvil (prototypes/anvil/pieces.ts).

const COPPER = 0xb8703c;
const COPPER_DONE = 0x8a4e2c;
const STONE = 0x7c7a74;
const ORE = 0x7a5a3a;
const HOT = new Color(0xff4a08);
const WHITE_HOT = new Color(0xffb040);
const _c = new Color();

/** How a piece looks now. */
type Look = 'ore' | 'bar' | 'stone' | 'whetstone' | 'blank' | 'gauntlets' | 'quenched';

function lookOf(piece: Piece, shaped: boolean): Look {
  switch (piece.form) {
    case 'bar':
      return piece.place === 'crucible' ? 'ore' : 'bar';
    case 'whetstone':
      return shaped ? 'whetstone' : 'stone';
    case 'gauntlets':
      return piece.quenched ? 'quenched' : shaped ? 'gauntlets' : 'blank';
  }
}

export class PieceView {
  readonly root = new Group();
  /** The top of the piece over where it rests. */
  top = 0;
  private body = new Group();
  private look: Look | null = null;
  private baseTop = 0;
  private flash = 0;
  private readonly mats: MeshLambertMaterial[] = [];
  private readonly rings: Mesh<RingGeometry, MeshBasicMaterial>[] = [];
  private readonly dents: Mesh<CircleGeometry, MeshBasicMaterial>[] = [];

  constructor(readonly piece: Piece) {
    this.root.name = `anvil-${piece.recipe.id}`;
    this.root.add(this.body);
    for (const m of piece.marks) {
      const ring = new Mesh(new RingGeometry(0.016, 0.024, 16), new MeshBasicMaterial({ color: 0xffe070, fog: false }));
      const dent = new Mesh(new CircleGeometry(0.02, 12), new MeshBasicMaterial({ color: 0x2a1a10, transparent: true, opacity: 0 }));
      for (const mesh of [ring, dent]) {
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(m.x, 0, m.z);
        this.root.add(mesh);
      }
      this.rings.push(ring);
      this.dents.push(dent);
    }
  }

  /** A great strike lights it up for a moment. */
  flashNow(): void {
    this.flash = 1;
  }

  /**
   * Draw it as it is now: its look, flattened as it's worked, glowing with
   * its heat, and the marks pulsing while there's something to strike (dim
   * while it's too cold).
   */
  update(dt: number): void {
    const p = this.piece;
    const shaped = p.form !== 'bar' && p.marks.every((m) => m.value >= 1 - 1e-6);
    const workable = p.form !== 'gauntlets' || p.heat >= CONFIG.professions.anvil.workingHeat;
    const look = lookOf(p, shaped);
    if (look !== this.look) this.build(look);
    const worked = p.marks.length ? p.marks.reduce((n, m) => n + m.value, 0) / p.marks.length : 0;
    if (look === 'blank' || look === 'stone') {
      this.body.scale.set(1 + 0.14 * worked, 1 - 0.4 * worked, 1 + 0.06 * worked);
      this.top = this.baseTop * this.body.scale.y;
    }
    const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 120);
    const striking = p.place === 'anvil' && !shaped && !p.waiting;
    p.marks.forEach((m, i) => {
      const ring = this.rings[i];
      const dent = this.dents[i];
      ring.position.y = dent.position.y = this.top + 0.002;
      ring.visible = striking && m.value < 1;
      ring.material.color.setHex(m.value > 0 ? 0xff9a30 : 0xffe070).multiplyScalar(workable ? pulse : 0.25);
      dent.material.opacity = Math.min(0.55, m.value * 0.55);
      dent.visible = !shaped;
    });
    this.flash = Math.max(0, this.flash - dt * 5);
    const glows = look === 'bar' || look === 'blank' || look === 'gauntlets';
    for (const mat of this.mats) {
      if (glows && p.heat > 0) {
        _c.copy(HOT).lerp(WHITE_HOT, Math.max(0, p.heat - 0.6) / 0.4).multiplyScalar(Math.min(1, p.heat * 1.4));
        mat.emissive.copy(_c);
      } else mat.emissive.setRGB(0, 0, 0);
      if (this.flash > 0) mat.emissive.addScalar(this.flash * 0.35);
    }
  }

  /** Let go of its meshes. */
  dispose(): void {
    this.root.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      o.geometry.dispose();
      (o.material as MeshBasicMaterial).dispose();
    });
  }

  /** (Re)build the body for how it looks now. */
  private build(look: Look): void {
    this.look = look;
    this.root.remove(this.body);
    this.body.traverse((o) => o instanceof Mesh && o.geometry.dispose());
    for (const m of this.mats) m.dispose();
    this.body = new Group();
    this.root.add(this.body);
    this.mats.length = 0;
    const add = (geo: BoxGeometry | DodecahedronGeometry | CylinderGeometry, color: number, x: number, y: number, z: number) => {
      const mat = new MeshLambertMaterial({ color, flatShading: true });
      this.mats.push(mat);
      const mesh = new Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.body.add(mesh);
      return mesh;
    };
    switch (look) {
      case 'ore':
        for (let i = 0; i < 2; i++) add(new DodecahedronGeometry(0.034), ORE, (i - 0.5) * 0.07, 0.03, 0).rotation.set(i, i * 2, 0);
        this.top = 0.065;
        break;
      case 'bar':
        add(new BoxGeometry(0.16, 0.028, 0.04), COPPER, 0, 0.014, 0);
        this.top = 0.028;
        break;
      case 'stone':
        add(new BoxGeometry(0.2, 0.07, 0.08), STONE, 0, 0.035, 0).rotation.y = 0.04;
        this.top = 0.07;
        break;
      case 'whetstone':
        add(new BoxGeometry(0.17, 0.03, 0.05), 0xa8a49a, 0, 0.015, 0);
        add(new BoxGeometry(0.15, 0.004, 0.04), 0xc8c4b8, 0, 0.032, 0);
        this.top = 0.034;
        break;
      case 'blank':
        add(new BoxGeometry(0.26, 0.036, 0.12), COPPER, 0, 0.018, 0);
        this.top = 0.036;
        break;
      case 'gauntlets':
      case 'quenched': {
        const color = look === 'quenched' ? COPPER_DONE : COPPER;
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
