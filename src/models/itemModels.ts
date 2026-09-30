import { type BufferGeometry, TorusGeometry } from 'three';
import { type GearSlot, type ItemDef, type Rarity } from '../items';
import { ModelBuilder } from './kit';

// Each item's small model, as it lies on the ground as loot (and, later, as
// it's carried from the bag): a handful of primitives merged into one geometry,
// about a metre across and centred, to scale to fit. Drawn from its slot or
// its model name alone, tinted by its rarity's material, so every item in the
// catalogue has one without a line of its own. Ported from the bag prototype's
// looks (src/ui/bag-prototype/looks.ts), which keeps its own copy.

/** How an item is drawn. */
type Look = 'sword' | 'shield' | 'helm' | 'chest' | 'gloves' | 'legs' | 'boots' | 'charm' | 'trinket' | 'cloth' | 'dust' | 'flask' | 'scroll' | 'bow' | 'wand';

const BY_SLOT: Readonly<Record<GearSlot, Look>> = {
  mainHand: 'sword',
  offHand: 'shield',
  head: 'helm',
  chest: 'chest',
  hands: 'gloves',
  legs: 'legs',
  feet: 'boots',
};

/** What a model name looks like, where the slot doesn't say. */
const BY_MODEL: Readonly<Record<string, Look>> = {
  'short-bow': 'bow',
  quiver: 'dust',
  wand: 'wand',
  focus: 'charm',
  trinket: 'trinket',
  cloth: 'cloth',
  charm: 'charm',
  dust: 'dust',
  'flask-red': 'flask',
  scroll: 'scroll',
};

/** Gear's main colour by rarity: worn leather, studded leather, steel. */
const TINT: Readonly<Record<Rarity, number>> = { grey: 0x8a8070, white: 0x7a5a3a, green: 0x5e6448, blue: 0x8a96aa };
const STEEL = 0xc8d0d8;
const LEATHER = 0x4a3020;
const BONE = 0xd8d0b8;

const lookOf = (item: ItemDef): Look => BY_MODEL[item.model] ?? (item.kind === 'gear' ? BY_SLOT[item.slot] : 'trinket');

const cache = new Map<string, BufferGeometry>();

/** `item`'s model, about a metre across and centred on its middle. One geometry per look and tint, shared. */
export function itemGeometry(item: ItemDef): BufferGeometry {
  const look = lookOf(item);
  const tint = item.id.startsWith('hale-') ? 0x3a3a4a : TINT[item.rarity];
  const key = `${look}/${tint}`;
  let g = cache.get(key);
  if (!g) cache.set(key, (g = build(look, tint)));
  return g;
}

/** The pouch a kill's coins lie in: a small tied sack. */
export function pouchGeometry(): BufferGeometry {
  let g = cache.get('pouch');
  if (!g) {
    const m = new ModelBuilder(11);
    m.ball(0.32, { at: [0, -0.1, 0], color: 0x6a4a2a, jitter: 0.12 }, 1);
    m.cyl(0.1, 0.16, 0.16, 7, { at: [0, 0.24, 0], color: 0x5a3c22, jitter: 0.1 });
    m.cyl(0.12, 0.12, 0.05, 7, { at: [0, 0.2, 0], color: 0x8a1810 });
    m.cyl(0.13, 0.09, 0.12, 7, { at: [0, 0.36, 0], color: 0x6a4a2a, jitter: 0.1 });
    cache.set('pouch', (g = m.build()));
  }
  return g;
}

function build(look: Look, tint: number): BufferGeometry {
  const m = new ModelBuilder(7);
  switch (look) {
    case 'sword':
      m.taper(0.1, 0.025, 0.02, 0.01, 0.62, { at: [0, -0.2, 0], color: STEEL, jitter: 0.03 });
      m.box(0.34, 0.06, 0.07, { at: [0, -0.22, 0], color: tint });
      m.cyl(0.03, 0.03, 0.2, 6, { at: [0, -0.35, 0], color: LEATHER });
      m.ball(0.05, { at: [0, -0.46, 0], color: tint });
      break;
    case 'shield':
      m.taper(0.36, 0.06, 0.72, 0.06, 0.4, { at: [0, -0.15, 0], color: tint });
      m.box(0.72, 0.28, 0.06, { at: [0, 0.39, 0], color: tint });
      m.box(0.08, 0.76, 0.07, { at: [0, 0.14, 0], color: tint, jitter: 0.2 });
      m.ball(0.1, { at: [0, 0.2, 0.05], color: STEEL });
      break;
    case 'helm':
      m.cyl(0.24, 0.3, 0.32, 8, { at: [0, -0.06, 0], color: tint });
      m.ball(0.25, { at: [0, 0.12, 0], color: tint }, 1);
      m.box(0.66, 0.05, 0.66, { at: [0, -0.22, 0], color: tint, jitter: 0.15 });
      m.box(0.05, 0.26, 0.05, { at: [0, -0.12, 0.3], color: STEEL });
      break;
    case 'chest':
      m.taper(0.44, 0.24, 0.56, 0.28, 0.62, { at: [0, -0.34, 0], color: tint });
      m.box(0.24, 0.14, 0.3, { at: [-0.34, 0.2, 0], color: tint, jitter: 0.15 });
      m.box(0.24, 0.14, 0.3, { at: [0.34, 0.2, 0], color: tint, jitter: 0.15 });
      m.box(0.5, 0.06, 0.3, { at: [0, -0.18, 0], color: LEATHER });
      break;
    case 'gloves':
      for (const x of [-0.2, 0.2]) {
        m.box(0.22, 0.34, 0.12, { at: [x, 0, 0], color: tint });
        m.box(0.26, 0.12, 0.16, { at: [x, -0.2, 0], color: tint, jitter: 0.15 });
        m.box(0.07, 0.14, 0.08, { at: [x + Math.sign(x) * 0.14, 0.02, 0], color: tint });
      }
      break;
    case 'legs':
      m.box(0.5, 0.1, 0.24, { at: [0, 0.38, 0], color: LEATHER });
      m.taper(0.2, 0.2, 0.22, 0.22, 0.72, { at: [-0.13, -0.4, 0], color: tint });
      m.taper(0.2, 0.2, 0.22, 0.22, 0.72, { at: [0.13, -0.4, 0], color: tint });
      break;
    case 'boots':
      for (const x of [-0.16, 0.16]) {
        m.box(0.2, 0.5, 0.22, { at: [x, 0.05, 0], color: tint });
        m.box(0.2, 0.14, 0.44, { at: [x, -0.18, 0.1], color: tint, jitter: 0.15 });
      }
      break;
    case 'charm':
      m.shape(new TorusGeometry(0.2, 0.02, 4, 12), { at: [0, 0.22, 0], color: LEATHER });
      m.taper(0.3, 0.08, 0.02, 0.02, 0.5, { at: [0, -0.4, 0], color: BONE });
      m.box(0.16, 0.1, 0.1, { at: [0, -0.02, 0], color: BONE, jitter: 0.2 });
      break;
    case 'trinket':
      m.shape(new TorusGeometry(0.22, 0.05, 4, 10), { at: [0, 0.05, 0], color: 0xa08a4a, jitter: 0.15 });
      m.ball(0.1, { at: [0, -0.2, 0], color: 0x5a7a8a });
      break;
    case 'cloth':
      m.box(0.6, 0.12, 0.44, { at: [0, -0.1, 0], color: 0x8a6a4a, jitter: 0.25 });
      m.box(0.5, 0.1, 0.36, { at: [0.04, 0.02, 0.02], rot: [0, 0.3, 0], color: 0x7a5a3a, jitter: 0.25 });
      break;
    case 'dust':
      m.cyl(0.18, 0.24, 0.4, 7, { at: [0, -0.1, 0], color: 0x9a9080, jitter: 0.12 });
      m.cyl(0.1, 0.1, 0.12, 7, { at: [0, 0.16, 0], color: LEATHER });
      break;
    case 'flask':
      m.ball(0.24, { at: [0, -0.12, 0], color: 0xb02020, glow: 0.3 });
      m.cyl(0.06, 0.08, 0.24, 6, { at: [0, 0.2, 0], color: 0xa0b8c0 });
      m.cyl(0.07, 0.07, 0.06, 6, { at: [0, 0.34, 0], color: LEATHER });
      break;
    case 'scroll':
      m.cyl(0.1, 0.1, 0.8, 8, { rot: [0, 0, Math.PI / 2], color: 0xe6d8ae, glow: 0.2 });
      m.cyl(0.11, 0.11, 0.06, 8, { at: [0.08, 0, 0], rot: [0, 0, Math.PI / 2], color: 0x8a1810 });
      break;
    case 'bow':
      m.shape(new TorusGeometry(0.45, 0.03, 4, 12, Math.PI * 0.9), { rot: [0, 0, Math.PI * 0.55], color: tint });
      m.box(0.01, 0.84, 0.01, { at: [-0.06, 0, 0], color: 0xe0d8c0 });
      break;
    case 'wand':
      m.taper(0.05, 0.05, 0.02, 0.02, 0.8, { at: [0, -0.4, 0], color: tint });
      m.ball(0.07, { at: [0, 0.42, 0], color: 0x80c0ff, glow: 0.6 });
      break;
  }
  return m.build();
}
