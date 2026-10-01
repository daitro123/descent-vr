// The Sallows' colours (its spec's palette): wet peat and silt, reed straw and
// sedge green, the Deepkings' green-black stone and the crown's limestone,
// murky jade water, and a pale green-grey mist lit soft gold. Woad blue is
// Reedholm's own: its pennants and its boats.

export const FEN_GROUND = {
  peat: 0x4e4632,
  peatDark: 0x3e3828,
  silt: 0x6a6048,
  sedge: 0x6b7a44,
  sedgeDry: 0x7e8048,
  straw: 0xa89d62,
  shell: 0xc8c2a8,
  mud: 0x564c38,
  rust: 0x8a4e2a,
  chalk: 0xd8d4c0,
  chalkGrass: 0x9a9a62,
  heath: 0x6e5a5e,
} as const;

/** What Oakvale's plant shapes turn to in the fens. */
export const FEN_PLANTS = {
  reed: [0xa89d62, 0x9a9058, 0xb4a86c, 0x8c8a50] as const,
  reedHead: 0x5a4430,
  sedge: [0x6b7a44, 0x748048, 0x5e6c3c] as const,
  willow: [0x7a8a5a, 0x8a9a66, 0x6e7e52] as const,
  alder: [0x4a5e36, 0x55683c, 0x405232] as const,
  juniper: [0x34503e, 0x3c5844, 0x2e4838] as const,
  samphire: [0x6a7a3a, 0x7a6a3e] as const,
  lavender: 0x8a78a8,
  cotton: 0xeeeadc,
  lily: 0x4e6a3a,
  lichen: 0x7a8068,
} as const;

/** Buildings: the fen folk's timber, reed and wattle, the crown's limestone and the Deepkings' green-black blocks. */
export const FEN_BUILD = {
  timber: 0x4a3a28,
  timberDark: 0x352a1e,
  plank: 0x6e5a40,
  plankGrey: 0x7a7262,
  wattle: 0x8a7a58,
  daub: 0xa89a7a,
  thatch: 0x9a8a50,
  thatchDark: 0x7a6c3e,
  woad: 0x3c6a85,
  woadDark: 0x2c5068,
  lime: 0x9a9888,
  limeDark: 0x7a786a,
  deep: 0x3e4a43,
  deepDark: 0x2c3632,
  deepLight: 0x56645a,
  weed: 0x4e5a34,
  rope: 0x9a8a62,
  net: 0x5a5444,
  window: 0x2a2e2a,
  warmWindow: 0xe3a046,
  foam: 0xc8d4c4,
  falling: 0x8aa89a,
} as const;

export const FEN_WATER = { deep: 0x2f4540, shallow: 0x4c665a } as const;

export const FEN_SKY = {
  zenith: 0x9aa898,
  horizon: 0xc4ccb8,
  haze: 0xb7c1ae,
  sun: 0xf0dc9a,
} as const;

/** A soft gold sun through the mist, a green-grey sky light, and the peat's brown bounced up. */
export const FEN_LIGHT = { sun: 0xd9c27e, sky: 0xc4ccb8, ground: 0x5a5440 } as const;
