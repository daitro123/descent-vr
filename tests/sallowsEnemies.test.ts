import { Color, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Camps } from '../src/enemies/camps';
import { createEnemy } from '../src/enemies/kinds';
import type { CampPlan } from '../src/maps/types';
import { buildCharacter, FAMILIES, type Family, type FamilyDef, fighterOf, type HumanoidKind } from '../src/models/characters';
import { LIVERY } from '../src/models/guards';
import { HUE } from '../src/models/human';
import { LANTERN_LIGHT } from '../src/models/lantern';
import { PAL } from '../src/models/palette';
import type { Rig } from '../src/models/rig';
import { SMUGGLERS, WOAD } from '../src/models/smugglers';
import { Wardrobe } from '../src/people/cast';

// The Sallows' enemies (models/smugglers.ts, models/raiders.ts): the Lantern
// Men and their captain, the Undergate's cellar thieves, the fen raiders and
// their headman. What a player would notice of them: a Lantern Man's lantern
// burns, by night and in a fight; a camp's leader or boss is the one it names;
// and their colours say who they are and who they aren't.

const SALLOWS: Family[] = ['smuggler', 'undergate', 'raider'];

/** Every fighter of the Sallows' families: each look of each kind, then the named. */
const FIGHTERS: [string, Family, () => Rig][] = SALLOWS.flatMap((family) => {
  const def = FAMILIES[family] as FamilyDef;
  return [
    ...(Object.entries(def.fights) as [HumanoidKind, { label: string; looks: number }][]).flatMap(([kind, f]) =>
      Array.from({ length: f.looks }, (_, variant): [string, Family, () => Rig] => [`${f.label} ${variant}`, family, () => buildCharacter(kind, { family, variant }).rig]),
    ),
    ...Object.entries(def.named ?? {}).map(([named, f]): [string, Family, () => Rig] => [f.label, family, () => buildCharacter(f.kind, { family, named }).rig]),
  ];
});
const LANTERN_MEN = FIGHTERS.filter(([, family]) => family === 'smuggler');

/** Every shade `rig` wears (hue in degrees, saturation), and whether it glows there. */
function shades(rig: Rig): { h: number; s: number; glow: boolean }[] {
  const geo = rig.mesh.geometry;
  const colors = geo.getAttribute('color');
  const fx = geo.getAttribute('fx');
  const c = new Color();
  const hsl = { h: 0, s: 0, l: 0 };
  return Array.from({ length: colors.count }, (_, i) => {
    c.setRGB(colors.getX(i), colors.getY(i), colors.getZ(i)).getHSL(hsl);
    return { h: hsl.h * 360, s: hsl.s, glow: fx.getX(i) > 0 };
  });
}

const dh = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const hsl = (hex: number) => {
  const out = { h: 0, s: 0, l: 0 };
  new Color(hex).getHSL(out);
  return { h: out.h * 360, s: out.s };
};

/** Does `rig` wear `hex` anywhere (any shade of it)? */
function wears(rig: Rig, hex: number): boolean {
  const want = hsl(hex);
  return shades(rig).some(({ h, s }) => dh(h, want.h) < 1.5 && Math.abs(s - want.s) < 0.02);
}

/** Does something on `rig` shine in `hex`'s hue? (A light is shaded by its faces, but keeps its hue.) */
function shines(rig: Rig, hex: number): boolean {
  const want = hsl(hex);
  return shades(rig).some(({ h, s, glow }) => glow && dh(h, want.h) < 1.5 && s > 0.8);
}

describe('a Lantern Man’s lantern', () => {
  it.each(LANTERN_MEN)('%s carries one, lit', (_name, _family, build) => {
    expect(shines(build(), LANTERN_LIGHT)).toBe(true);
  });

  it('is dark on Gil Tarr, by day in Reedholm', () => {
    const gil = new Wardrobe().dress('lanternManAtEase');
    expect(shades(gil).some((s) => s.glow)).toBe(false);
  });
});

describe('named fighters', () => {
  it('are the leaders and bosses the Sallows names', () => {
    const named = (family: Family) => Object.entries((FAMILIES[family] as FamilyDef).named ?? {}).map(([id, f]) => `${id}: ${f.label}, ${f.kind}`);
    expect(named('smuggler')).toEqual(['leader: Lantern Men leader, brute', 'crake: Captain Silas Crake, brute']);
    expect(named('raider')).toEqual(['headman: Abel Thatch, the Cockle End headman, brute']);
  });

  it('are asked for by family, and fight as their own behaviour', () => {
    expect(fighterOf('brute', 'smuggler', 'crake').label).toBe('Captain Silas Crake');
    expect(() => fighterOf('brute', 'smuggler', 'bosun')).toThrow(/No bosun among the smuggler family/);
    expect(() => fighterOf('grunt', 'smuggler', 'crake')).toThrow(/fights as a brute, not a grunt/);
    expect(() => fighterOf('brute', 'raider', 'crake')).toThrow();
  });

  it('are never a random look of their family', () => {
    const crake = buildCharacter('brute', { family: 'smuggler', named: 'crake' }).rig.triangles;
    for (let variant = 0; variant < 6; variant++) {
      expect(createEnemy('brute', 0, 0, { family: 'smuggler', variant }).rig.triangles).not.toBe(crake);
    }
  });

  it('stand where a camp names them', () => {
    const plan: CampPlan = {
      id: 'sluice-house',
      place: { x: 0, z: 0, r: 8 },
      level: 16,
      posts: [
        { behaviour: 'grunt', family: 'smuggler', x: -3, z: 0, yaw: 0 },
        { behaviour: 'brute', family: 'smuggler', x: 0, z: 0, yaw: 0, role: 'leader', named: 'crake' },
        { behaviour: 'brute', family: 'smuggler', x: 3, z: 0, yaw: 0, named: 'leader' },
      ],
    };
    const ground = { heightAt: () => 0, resolve: () => false, lineOfSight: () => true, steer: () => {}, arrowStops: () => false };
    const camps = new Camps([plan], ground, { sweep: () => null, slam: () => {}, shoot: () => {}, nock: () => {}, telegraph: () => {} });
    camps.update(1 / 72, { feet: new Vector3(0, 0, 60), head: new Vector3(0, 1.6, 60), sword: null, alive: true, interior: null });
    const tris = camps.camps[0].members.map((m) => m.enemy.rig.triangles);
    expect(tris[1]).toBe(buildCharacter('brute', { family: 'smuggler', named: 'crake' }).rig.triangles);
    expect(tris[2]).toBe(buildCharacter('brute', { family: 'smuggler', named: 'leader' }).rig.triangles);
  });
});

describe('whose they are, by their colours', () => {
  it.each(FIGHTERS)('%s wears none of the bandits’ red', (_name, _family, build) => {
    const rig = build();
    expect(wears(rig, HUE.banditRed)).toBe(false);
    expect(wears(rig, HUE.banditRedDark)).toBe(false);
  });

  it.each(Object.keys(SMUGGLERS) as (keyof typeof SMUGGLERS)[])('%s, at ease, wears none of it either', (id) => {
    const rig = new Wardrobe().dress(id);
    expect(wears(rig, HUE.banditRed)).toBe(false);
    expect(wears(rig, HUE.banditRedDark)).toBe(false);
  });

  it('the Lantern Men’s crossbowman and the raiders’ fowler wear the green hood of every archer', () => {
    expect(wears(buildCharacter('archer', { family: 'smuggler' }).rig, PAL.hood)).toBe(true);
    expect(wears(buildCharacter('archer', { family: 'raider' }).rig, PAL.hood)).toBe(true);
  });

  it('the Lantern Men’s leaders wear Reedholm’s woad, never with gold', () => {
    const leader = buildCharacter('brute', { family: 'smuggler', named: 'leader' }).rig;
    expect(wears(leader, WOAD)).toBe(true);
    for (const [name, , build] of FIGHTERS) {
      const rig = build();
      if (wears(rig, WOAD)) expect(wears(rig, PAL.gold), name).toBe(false);
    }
  });

  it.each(FIGHTERS.filter(([, family]) => family === 'undergate'))('%s wears no colours: no archer’s green, no woad, no house’s livery', (_name, _family, build) => {
    const rig = build();
    for (const hex of [PAL.hood, WOAD, LIVERY.crown.field, LIVERY.crown.badge, LIVERY.corvane.field]) expect(wears(rig, hex), hex.toString(16)).toBe(false);
  });
});
