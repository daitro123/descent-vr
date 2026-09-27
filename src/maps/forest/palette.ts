// The forest's colours, on top of the game's shared palette (models/palette.ts).
// Warm, slightly golden greens: a late-afternoon woodland, not a dungeon.
export const GREEN = {
  grass: 0x6f9a3e,
  grassLight: 0x8aae4c,
  grassDry: 0x9aa552,
  grassDark: 0x587f34,
  forestFloor: 0x4f6a2e,
  moss: 0x6a7a44,
  leaf: [0x3f6d2a, 0x4b7a2f, 0x578a34, 0x66963a] as const,
  leafGold: [0xb08a2e, 0xc49c36, 0x9a7a2a, 0xa8642a] as const,
  pine: [0x2d5230, 0x355c36, 0x3e663a] as const,
  young: [0x6aa040, 0x7aaa46] as const,
  reed: 0x7a8a3e,
  lily: 0x4f8a3a,
} as const;

export const EARTH = {
  dirt: 0x8a6a45,
  dirtDark: 0x6e5236,
  dirtLight: 0xa08058,
  mud: 0x5e4a34,
  sand: 0x9a8a5e,
  soil: 0x5a3e28,
  rock: 0x7f7a72,
  rockDark: 0x66625c,
  cliff: 0x6e6860,
  bark: 0x5a4430,
  barkDark: 0x45331f,
  cutWood: 0xc8a26a,
} as const;

export const BUILD = {
  plaster: 0xd8ccb0,
  plasterShade: 0xc2b594,
  timber: 0x4a321e,
  slate: 0x4a5a78,
  slateDark: 0x3c4a64,
  thatch: 0xb89a52,
  thatchDark: 0x9a7e40,
  plank: 0x7a5634,
  redWood: 0x8a3a26,
  window: 0x2a3142,
  warmWindow: 0xffc870,
  blue: 0x2c4a8a,
  canvas: 0xcbbd98,
} as const;

export const CROP = {
  wheat: 0xd8b85a,
  wheatDark: 0xb89a44,
  pumpkin: 0xd8782a,
  cabbage: 0x7aac5a,
  stem: 0x4f7a2a,
} as const;

export const FLOWERS = [0xf0d040, 0xf2f0e0, 0x9a6ad0, 0xd84a3a, 0x6a9ae8, 0xf0a0c0] as const;

export const SKY = {
  zenith: 0x4f86c8,
  horizon: 0xbcd6e8,
  haze: 0xc8d8dc,
  ground: 0x8aa06a,
  sun: 0xfff2c8,
  cloud: 0xf6f4ee,
  cloudShade: 0xd8dce4,
} as const;

export const WATER = { deep: 0x2e5a6e, shallow: 0x4a8090, foam: 0x9ac4c8 } as const;
