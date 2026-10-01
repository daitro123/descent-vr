import type { Role } from './adventureState';
import { CONFIG } from './config';
import { CATALOGUE, CLASS_MAIN, type ClassId, type GearItem, type ItemId, JUNK, levelled, type Rarity } from './items';
import type { EnemyFamily } from './models/characters';

// What a kill drops, rolled from a seed, with no three.js in it: coins, maybe
// junk of the enemy's family, and maybe a piece of gear for your class, all at
// the enemy's level, by the role table in CONFIG.loot
// (.scratch/inventory/issues/05-loot.md; spec, "The inventory state"). A
// chest's contents come from the same pool of gear (spec, "Chests").

/** What fell with an enemy, for the loot it drops. */
export interface Fallen {
  readonly role: Role;
  /** The enemy's own level: its loot's item level. */
  readonly level: number;
  /** Each family drops its own junk: bandits bandits', the undead the undead's, leeches leeches'. */
  readonly family: EnemyFamily;
}

/** What a kill dropped: coins for the pouch, and each item beside it. */
export interface Loot {
  readonly coins: number;
  readonly items: readonly ItemId[];
}

/** A random number in [0, 1) from a seed, the same run for the same seed (mulberry32). */
export function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed from the camp, the enemy and the time: a string hash (FNV-1a) of them all. */
export function lootSeed(...parts: readonly (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return h >>> 0;
}

/** The loot gear by item level and rarity, built once from the catalogue. */
const POOL = new Map<string, GearItem[]>();
for (const item of Object.values(CATALOGUE)) {
  if (item.kind !== 'gear' || !item.loot) continue;
  const key = `${item.level}/${item.rarity}`;
  POOL.set(key, [...(POOL.get(key) ?? []), item]);
}

/** Can `klass` use `item` as it drops: a weapon or off hand of theirs, or armour carrying their main attribute (or none, a white's). */
const fits = (item: GearItem, klass: ClassId) => (item.class ? item.class === klass : !item.main || item.main === CLASS_MAIN[klass]);

/** One of the loot gear of `rarity` at `level` that `klass` can use, or null if there's none. */
function gearFor(rarity: Rarity, level: number, klass: ClassId, rand: () => number): ItemId | null {
  const pool = (POOL.get(`${level}/${rarity}`) ?? []).filter((item) => fits(item, klass));
  return pool.length ? pool[Math.floor(rand() * pool.length)].id : null;
}

/** Which rarity a kill's one piece of gear is, from its role's chances, or null for none. */
function rollRarity(chances: Partial<Record<Rarity, number>>, rand: () => number): Rarity | null {
  let r = rand();
  for (const [rarity, chance] of Object.entries(chances) as [Rarity, number][]) {
    if (r < chance) return rarity;
    r -= chance;
  }
  return null;
}

/**
 * Roll what `fallen` drops for a character of `klass`, from `rand`: coins
 * always (bar what the Warden raises), junk of its family at its role's
 * chance, and at most one piece of gear (a boss drops each of its rarities).
 * Everything is at the enemy's level, within the loot levels.
 */
export function rollLoot(fallen: Fallen, klass: ClassId, rand: () => number): Loot {
  const L = CONFIG.loot;
  const role = L.roles[fallen.role];
  const level = Math.min(Math.max(1, Math.round(fallen.level)), L.levels);
  const [low, high] = L.coins;
  const per = role.coins * fallen.level;
  const coins = per > 0 ? per * low + Math.floor(rand() * (per * (high - low) + 1)) : 0;
  const items: ItemId[] = [];
  if (role.junk > 0 && rand() < role.junk) {
    const kinds = JUNK[fallen.family];
    items.push(levelled(kinds[Math.floor(rand() * kinds.length)][0], level));
  }
  const rarities: Rarity[] = role.every.length ? [...role.every] : [];
  if (!role.every.length) {
    const rarity = rollRarity(role.gear, rand);
    if (rarity) rarities.push(rarity);
  }
  for (const rarity of rarities) {
    const id = gearFor(rarity, level, klass, rand);
    if (id) items.push(id);
  }
  return { coins, items };
}

/**
 * What a chest at `level` holds for a character of `klass`, from `rand`:
 * `CONFIG.loot.chest.coins` × its level in coins, and one piece of gear your
 * class can use at its level (within the loot levels), green or, now and
 * then, blue.
 */
export function rollChest(level: number, klass: ClassId, rand: () => number): Loot {
  const { coins, gear } = CONFIG.loot.chest;
  const rarity = rollRarity(gear, rand);
  const id = rarity && gearFor(rarity, Math.min(Math.max(1, Math.round(level)), CONFIG.loot.levels), klass, rand);
  return { coins: coins * level, items: id ? [id] : [] };
}

/** A chest's seed: the chest and the character opening it, so its roll is the same however often it's asked. */
export const chestSeed = (chest: string, character: string): number => lootSeed('chest', chest, character);
