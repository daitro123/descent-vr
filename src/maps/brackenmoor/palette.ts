// Brackenmoor's colours: an open moor late in the year, rust bracken, olive
// grass and purple heather under a paler, cooler sky than Oakvale's.

export const MOOR_GROUND = {
  grass: 0x7f7c42,
  grassDry: 0x9e9256,
  bracken: 0x9a5a2c,
  brackenDark: 0x7c4524,
  heather: 0x75496e,
  heatherLight: 0x8e5c84,
  peat: 0x5a4430,
  rock: 0x86827a,
  cliff: 0x6c655c,
  hilltop: 0x8a8454,
} as const;

/** What the moor's plants turn to, from Oakvale's greens. */
export const MOOR_PLANTS = {
  bracken: [0xa0602e, 0x8c4f26, 0xa87a38, 0x7e7a3c] as const,
  heather: [0x7a4a72, 0x8e5a86, 0x6a4262] as const,
  bush: [0x5e6a34, 0x6a6e38, 0x55602e] as const,
  pine: [0x324a30, 0x3a5234, 0x42563a] as const,
  lichen: 0x8a8a6a,
} as const;

export const MOOR_SKY = {
  zenith: 0x7fa4cc,
  horizon: 0xd6e2ea,
  haze: 0xd0dce8,
  sun: 0xfff2d8,
} as const;

/** The same sun; a whiter sky light, and a rust-brown light bounced up off the bracken. */
export const MOOR_LIGHT = { sun: 0xfff0d4, sky: 0xe2eaf2, ground: 0x7a5a3c } as const;

/** More of the moor's plants: gorse, hawthorn, rowan, the bog's cotton grass and the reeds toward the fens. */
export const MOOR_TREES = {
  gorse: [0x5a6a2a, 0x66702e] as const,
  hawthorn: [0x3e5a2c, 0x4a6232] as const,
  rowan: [0x5a7a34, 0x66803a] as const,
  cotton: [0x9a9a6a, 0xb2ae80] as const,
  reed: [0x9a9a52, 0x8a8a46] as const,
  cypress: [0x3a4a24, 0x44502a] as const,
  gorseFlower: 0xd8b830,
  cottonHead: 0xf0ece0,
  rowanBerry: 0xc0382a,
} as const;

/** The moor's ground beyond its grass and plants: the bog, the town, the landlord's fields, the dry south. */
export const MOOR_LAND = {
  bog: 0x4a3a2a,
  bogWet: 0x3a2e22,
  cotton: 0x8a845a,
  cobble: 0x7c776c,
  cobbleDark: 0x67625a,
  improved: 0x6f9440,
  improvedLight: 0x82a44a,
  straw: 0xb0a060,
  sedge: 0x7a7a44,
} as const;

/** Brackenmoor's buildings: gritstone, slate and heather thatch, and the landlord's dressed stone. */
export const MOOR_BUILD = {
  grit: 0x8a857a,
  gritDark: 0x6e6a60,
  gritLight: 0x9c968a,
  dressed: 0xb3ab98,
  dressedDark: 0x9a927e,
  slate: 0x4e5560,
  slateDark: 0x3e444e,
  thatch: 0x5e4636,
  thatchDark: 0x4a3628,
  turf: 0x6a6a3a,
  timber: 0x4a321e,
  door: 0x4a3524,
  window: 0x252a33,
  crimson: 0x7a1c2c,
  black: 0x1c1c20,
  kerchief: 0xa8322a,
  wool: 0xd8ccb0,
  deep: 0x2b2d31,
  deepLine: 0x4a8a9a,
  peat: 0x3e2e20,
  peatCut: 0x5a4430,
  charred: 0x2a2420,
  water: { deep: 0x3e3a2e, shallow: 0x5e5a48 },
} as const;
