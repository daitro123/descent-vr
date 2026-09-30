import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type PerspectiveCamera,
  type Scene,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { CONFIG } from '../config';
import { type ItemId, itemOf, RARITY_COLOUR, type Rarity } from '../items';
import type { Loot } from '../loot';
import { itemGeometry, pouchGeometry } from '../models/itemModels';
import { createModelMaterial, type ModelMaterial } from '../models/materials';
import type { Handedness } from '../player/input';
import type { Interior } from '../save/record';
import type { Probe } from '../ui/talkBoard';

// Loot lying where an enemy fell (.scratch/inventory/spec.md, "Loot on the
// ground"): a pouch with the coins, and each item as its own small model
// turning beside it. Each glows round its edge in its rarity's colour, an
// emissive term with no light; greens and blues raise a thin, unlit, additive
// beam. A touch takes it as it takes an orb, with a fist, the sword's tip or
// your feet; a full bag leaves an item flashing red. A drop lies for five
// minutes, through your death, and at most twelve lie at once.

/** What was touched: a pouch's coins or an item, by which hand (none, for your feet) and where it lies. */
export interface Touch {
  readonly coins: number;
  readonly item: ItemId | null;
  readonly hand: Handedness | null;
  readonly at: Vector3;
}

/** What can touch loot this frame: the fists and the sword's tip, and your feet. */
export interface Touching {
  readonly probes: readonly (Probe | null)[];
  readonly feet: Vector3 | null;
}

/** One thing lying in a drop: the pouch, or an item. */
interface Piece {
  readonly mesh: Mesh;
  readonly coins: number;
  readonly item: ItemId | null;
  readonly rarity: Rarity;
  readonly beam: Mesh | null;
  /** Seconds it still flashes red for, after a full bag left it. */
  flash: number;
  /** Was something touching it last frame? It's taken on a new touch only. */
  touched: boolean;
}

interface Drop {
  readonly root: Group;
  readonly pieces: Piece[];
  readonly interior: Interior | null;
  age: number;
}

/** The best rarity of `items`, for the pouch's glow: grey for coins alone. */
const RANK: readonly Rarity[] = ['grey', 'white', 'green', 'blue'];
const best = (items: readonly ItemId[]): Rarity =>
  items.reduce<Rarity>((top, id) => {
    const r = itemOf(id)?.rarity ?? 'grey';
    return RANK.indexOf(r) > RANK.indexOf(top) ? r : top;
  }, 'grey');

/** The model material with a rim of `color` round its edge, seen from wherever you look. One shader for them all. */
function rimMaterial(color: number): ModelMaterial {
  const mat = createModelMaterial();
  const rim = { value: new Color(color).multiplyScalar(CONFIG.loot.rim) };
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    base.call(mat, shader, renderer);
    shader.uniforms.uRim = rim;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\nfloat rimEdge = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));\ntotalEmissiveRadiance += uRim * rimEdge * rimEdge;',
      );
  };
  mat.customProgramCacheKey = () => 'descent-model-rim';
  return mat;
}

let rims: Record<Rarity | 'full', ModelMaterial> | null = null;
/** The rim materials: one per rarity, and the red of a full bag. */
const rimsOf = () =>
  (rims ??= {
    grey: rimMaterial(RARITY_COLOUR.grey),
    white: rimMaterial(RARITY_COLOUR.white),
    green: rimMaterial(RARITY_COLOUR.green),
    blue: rimMaterial(RARITY_COLOUR.blue),
    full: rimMaterial(0xff2020),
  });

let beamGeo: CylinderGeometry | null = null;
/** A thin open tube standing on the ground, bright at its foot and fading to nothing at its top. */
function beamGeometry(): CylinderGeometry {
  if (beamGeo) return beamGeo;
  const { height, radius } = CONFIG.loot.beam;
  const g = new CylinderGeometry(radius * 0.6, radius, height, 6, 1, true);
  g.translate(0, height / 2, 0);
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) colors.fill(1 - pos.getY(i) / height, i * 3, i * 3 + 3);
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return (beamGeo = g);
}

const beamMats = new Map<Rarity, MeshBasicMaterial>();
const beamMaterial = (rarity: Rarity) => {
  let m = beamMats.get(rarity);
  if (!m) {
    m = new MeshBasicMaterial({
      color: RARITY_COLOUR[rarity],
      vertexColors: true,
      transparent: true,
      opacity: CONFIG.loot.beam.opacity,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    beamMats.set(rarity, m);
  }
  return m;
};

const _p = new Vector3();

export class Drops {
  /** Every drop lying about: add it to the scene. */
  readonly root = new Group();
  private readonly drops: Drop[] = [];

  constructor() {
    this.root.name = 'drops';
  }

  /** How many drops lie in the world. */
  get lying(): number {
    return this.drops.length;
  }

  /** Every piece lying, for checks: what it is, where, and whether it's flashing red. */
  get pieces(): readonly { coins: number; item: ItemId | null; at: Vector3; beam: boolean; flashing: boolean }[] {
    return this.drops.flatMap((d) =>
      d.pieces.map((p) => ({ coins: p.coins, item: p.item, at: this.whereIs(d, p, new Vector3()), beam: !!p.beam, flashing: p.flash > 0 })),
    );
  }

  /** What a kill dropped, lying where it fell (`at`, on the ground) in `interior` (null out of doors). The oldest goes past the most. */
  drop(at: Vector3, loot: Loot, interior: Interior | null): void {
    if (loot.coins <= 0 && !loot.items.length) return;
    const L = CONFIG.loot;
    while (this.drops.length >= L.most) this.remove(0);
    const root = new Group();
    root.position.copy(at);
    const pieces: Piece[] = [];
    const materials = rimsOf();
    if (loot.coins > 0) {
      const rarity = best(loot.items);
      const mesh = new Mesh(pouchGeometry(), materials[rarity]);
      mesh.scale.setScalar(L.size * 0.6);
      mesh.position.y = L.size * 0.28;
      mesh.rotation.y = Math.random() * Math.PI * 2;
      root.add(mesh);
      pieces.push({ mesh, coins: loot.coins, item: null, rarity, beam: null, flash: 0, touched: false });
    }
    const turn = Math.random() * Math.PI * 2;
    loot.items.forEach((id, i) => {
      const item = itemOf(id);
      if (!item) return;
      const a = turn + (i / loot.items.length) * Math.PI * 2;
      const mesh = new Mesh(itemGeometry(item), materials[item.rarity]);
      mesh.scale.setScalar(L.size);
      mesh.position.set(Math.sin(a) * L.ring, L.hover, Math.cos(a) * L.ring);
      mesh.rotation.y = a;
      root.add(mesh);
      let beam: Mesh | null = null;
      if (item.rarity === 'green' || item.rarity === 'blue') {
        beam = new Mesh(beamGeometry(), beamMaterial(item.rarity));
        beam.position.set(mesh.position.x, 0, mesh.position.z);
        beam.renderOrder = 5;
        root.add(beam);
      }
      pieces.push({ mesh, coins: 0, item: id, rarity: item.rarity, beam, flash: 0, touched: false });
    });
    this.root.add(root);
    this.drops.push({ root, pieces, interior, age: 0 });
  }

  /**
   * Time passing, and touching: drops age and go after their lifetime, items
   * turn, a flashing item flashes, and a new touch of a piece shown (`shown`
   * says whether a drop's place is drawn) asks `take`. A piece taken is gone;
   * one `take` refuses flashes red and waits for a new touch.
   */
  update(dt: number, touching: Touching, shown: (interior: Interior | null) => boolean, take: (touch: Touch) => boolean): void {
    const L = CONFIG.loot;
    const materials = rimsOf();
    for (let d = this.drops.length - 1; d >= 0; d--) {
      const drop = this.drops[d];
      drop.age += dt;
      if (drop.age > L.lifetime) {
        this.remove(d);
        continue;
      }
      drop.root.visible = shown(drop.interior);
      for (let i = drop.pieces.length - 1; i >= 0; i--) {
        const piece = drop.pieces[i];
        if (piece.item) piece.mesh.rotation.y += L.spin * dt;
        piece.flash = Math.max(0, piece.flash - dt);
        const red = piece.flash > 0 && Math.floor(piece.flash * L.full.rate * 2) % 2 === 0;
        piece.mesh.material = red ? materials.full : materials[piece.rarity];
        if (!drop.root.visible) {
          piece.touched = false;
          continue;
        }
        const at = this.whereIs(drop, piece, _p);
        const hand = this.touchedBy(at, touching);
        const now = hand !== undefined;
        const fresh = now && !piece.touched;
        piece.touched = now;
        if (!fresh) continue;
        if (take({ coins: piece.coins, item: piece.item, hand, at: at.clone() })) this.takeAway(drop, i);
        else piece.flash = L.full.flash;
      }
      if (!drop.pieces.length) this.remove(d);
    }
  }

  /** Compile the rim and beam shaders now, rather than at the first kill. */
  warm(renderer: WebGLRenderer, camera: PerspectiveCamera, scene: Scene): void {
    const warm = new Group();
    for (const m of Object.values(rimsOf())) warm.add(new Mesh(pouchGeometry(), m));
    warm.add(new Mesh(beamGeometry(), beamMaterial('green')), new Mesh(beamGeometry(), beamMaterial('blue')));
    scene.add(warm);
    renderer.compile(warm, camera, scene);
    scene.remove(warm);
  }

  /** Every drop gone. */
  clear(): void {
    while (this.drops.length) this.remove(0);
  }

  /** Where `piece` of `drop` is in the world, into `out`. */
  private whereIs(drop: Drop, piece: Piece, out: Vector3): Vector3 {
    return out.copy(drop.root.position).add(piece.mesh.position);
  }

  /** What's touching `at`: a fist or the sword's tip (by its hand), your feet (null), or nothing (undefined). */
  private touchedBy(at: Vector3, { probes, feet }: Touching): Handedness | null | undefined {
    const { pickupRadius, walkRadius } = CONFIG.orb;
    for (const p of probes) if (p && p.at.distanceTo(at) < pickupRadius) return p.hand;
    if (feet && Math.abs(feet.y - at.y) < 1 && Math.hypot(feet.x - at.x, feet.z - at.z) < walkRadius) return null;
    return undefined;
  }

  private takeAway(drop: Drop, i: number): void {
    const [piece] = drop.pieces.splice(i, 1);
    drop.root.remove(piece.mesh);
    if (piece.beam) drop.root.remove(piece.beam);
  }

  private remove(d: number): void {
    const [drop] = this.drops.splice(d, 1);
    this.root.remove(drop.root);
  }
}
