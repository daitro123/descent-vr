// Aldhaven's colours (the zone spec's palette, /zones/aldhaven.md): pale
// limestone and cream plaster under blue-grey slate, the Deepkings' black
// basalt underneath, harbour teal, a pale sea-blue sky, and the crown's royal
// blue and gold. Pale, bright and man-made, so it reads apart from every
// neighbour; the basalt is the one dark note.

export const CITY_GROUND = {
  setts: 0xcfc3a6,
  settsDark: 0xb8ab8c,
  settsLight: 0xddd3b8,
  basalt: 0x625e68,
  basaltDark: 0x524e58,
  grass: 0x7a9a4e,
  grassLight: 0x8eac58,
  grassDry: 0xa3a85e,
  field: 0x9aa04e,
  fieldGold: 0xc8b25a,
  soil: 0x6e5236,
  sand: 0xc2b48a,
  mud: 0x6e604a,
  granite: 0x7c7e84,
  graniteDark: 0x5e6066,
  gorse: 0x8a8a3a,
  /** The back yards' packed earth, worn grass at its edges. */
  yard: 0x8a7656,
  yardDark: 0x75634a,
} as const;

export const CITY_BUILD = {
  limestone: 0xe2d6ba,
  limestoneShade: 0xcbbd9c,
  limestoneDark: 0xb0a281,
  basalt: 0x4a4651,
  basaltLight: 0x5d5964,
  plaster: 0xe8dcc0,
  plasterWarm: 0xe6cfa4,
  plasterRose: 0xdcc0ac,
  plasterSea: 0xc8d4c0,
  timber: 0x4a321e,
  slate: 0x56657e,
  slateDark: 0x434f66,
  slateLight: 0x66748c,
  lead: 0x7a8088,
  window: 0x2a3142,
  warmWindow: 0xffc870,
  glass: 0x8fb4c8,
  door: 0x5a3a22,
  plank: 0x7a5634,
  tar: 0x3a2e24,
  rope: 0xb09a6a,
  canvas: 0xe0d6bc,
  sail: 0xe8e0c8,
  straw: 0xd8b85a,
  iron: 0x4a4b52,
  granite: 0x8a8780,
  graniteDark: 0x6e6b66,
  soil: 0x5a4430,
} as const;

/** The crown's and the great houses' colours, for doors, banners and awnings. */
export const HERALDRY = {
  royalBlue: 0x2c4a8c,
  gold: 0xd9a93b,
  corvane: 0x9e2b2b,
  corvaneKey: 0x1e1a1e,
  harrowgate: 0x8a8c90,
  harrowgateTower: 0xf0ece0,
  ashby: 0x3f8a76,
  ashbyShip: 0xc8ccd0,
} as const;

/** Door and shutter colours, by district: the colour carries the district. */
export const DISTRICT_DOORS: Readonly<Record<District, readonly number[]>> = {
  market: [0x2c4a8c, 0x8a3a26, 0x3f6a3a, 0x6a4a8a],
  crown: [0x2c4a8c, 0x1e2a44, 0x9e2b2b, 0x3f8a76],
  close: [0x5a3a22, 0x6a5a3a],
  oldTown: [0x3a2e24, 0x4a3a46, 0x2e3a3a],
  guild: [0x7a5634, 0x8a6a2a, 0x5a6a3a],
  harbour: [0x3f8a76, 0x2e5a6e, 0x7a5634],
  fields: [0x6a4a2a],
};

/** Shop awnings and stall cloths. */
export const AWNINGS = [0x2c4a8c, 0xd9a93b, 0x9e3a2b, 0x3f8a76, 0xe0d6bc, 0x6a4a8a] as const;

/** Trees: plane trees and ivy in sea-washed green, the King's Garden's old oaks, the gorge's pines, orchard apples. */
export const CITY_TREES = {
  plane: [0x6f8f57, 0x7a9a5e, 0x62804c] as const,
  oak: [0x4f7a3a, 0x5a8640, 0x46703a] as const,
  pine: [0x2f4a3a, 0x37543f, 0x2a4434] as const,
  orchard: [0x6a9a48, 0x78a650] as const,
  hedge: [0x4f7236, 0x587c3a] as const,
} as const;

export const CITY_WATER = { deep: 0x2e6470, harbour: 0x3e7f8c, shallow: 0x5a96a0, flats: 0x7a9a96 } as const;

export const CITY_SKY = {
  zenith: 0x6f9fd0,
  horizon: 0xd2e2ea,
  haze: 0xbfd6e2,
  sun: 0xfff0cc,
} as const;

/** Morning gold off the sea; a clean sky light; the pale stone bounces a warm light up. */
export const CITY_LIGHT = { sun: 0xfff0d0, sky: 0xe4eef4, ground: 0x9a8e70 } as const;

/** Aldhaven's districts (the spec's seven, and the fields outside the walls). */
export type District = 'market' | 'crown' | 'close' | 'oldTown' | 'guild' | 'harbour' | 'fields';
