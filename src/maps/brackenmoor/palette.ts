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
