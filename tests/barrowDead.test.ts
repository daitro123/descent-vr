import { Color, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { numbersOf } from '../src/enemies/enemy';
import { createEnemy } from '../src/enemies/kinds';
import { clipsFor } from '../src/inspector/clips';
import { BARROW_LIGHT } from '../src/models/barrow';
import { buildCharacter, FAMILIES, type Family, type FamilyDef, fighterOf, type HumanoidKind } from '../src/models/characters';
import { GIANT, GIANT_TRIANGLES } from '../src/models/giant';
import { BONES, type Rig } from '../src/models/rig';
import { GLYPH } from '../src/models/vault';

// The dead of Brackenmoor's barrows and of Aldhaven's Sealed Vault
// (models/barrow.ts, models/vault.ts), the Barrow Thane, and the Keyward on
// the giant build (models/keyward.ts, models/giant.ts). What a player would
// notice of them: they stand on the floor at their height, the bosses carry
// a named bar and the Keyward is a 5 m giant of stone, and each fits the
// triangle budget the zones are planned with.

const DEAD: Family[] = ['barrow', 'vault'];

/** Every fighter of the two families: each look of each kind, then the named. */
const FIGHTERS: [string, Family, HumanoidKind, number, string?][] = DEAD.flatMap((family) => {
  const def = FAMILIES[family] as FamilyDef;
  return [
    ...(Object.entries(def.fights) as [HumanoidKind, { label: string; looks: number }][]).flatMap(([kind, f]) =>
      Array.from({ length: f.looks }, (_, v): [string, Family, HumanoidKind, number] => [f.looks > 1 ? `${f.label} v${v}` : f.label, family, kind, v]),
    ),
    ...Object.entries(def.named ?? {}).map(([named, f]): [string, Family, HumanoidKind, number, string] => [f.label, family, f.kind, 0, named]),
  ];
});

/**
 * The most triangles each may cost: the rank and file (many to a camp) as
 * the undead's dearest look, the Bone Warden's 1,300; a brute (one to a camp)
 * 1,500; a boss on the Warden's body 1,700; and a giant about twice a man.
 */
function cap(kind: HumanoidKind, named?: string): number {
  if (named === 'keyward') return GIANT_TRIANGLES;
  return { grunt: 1300, archer: 1300, brute: 1500, warden: 1700 }[kind];
}

const build = (kind: HumanoidKind, family: Family, variant: number, named?: string): Rig => buildCharacter(kind, { family, variant, named }).rig;

/** The legs, which stand it on the floor: in bind pose its weapon hangs straight down past them. */
const LEGS = ['thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'].map((b) => BONES.indexOf(b as (typeof BONES)[number]));

/** The body's lowest point on its legs, and its highest anywhere, at bind. */
function extent(rig: Rig): { low: number; high: number } {
  rig.mesh.updateMatrixWorld(true);
  const pos = rig.mesh.geometry.getAttribute('position');
  const skin = rig.mesh.geometry.getAttribute('skinIndex');
  const v = new Vector3();
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    rig.mesh.getVertexPosition(i, v);
    if (LEGS.includes(skin.getX(i))) low = Math.min(low, v.y);
    high = Math.max(high, v.y);
  }
  return { low, high };
}

/** Whether any part of `rig` glows in about `colour`. */
function glowsIn(rig: Rig, colour: number): boolean {
  const geo = rig.mesh.geometry;
  const colors = geo.getAttribute('color');
  const fx = geo.getAttribute('fx');
  const want = new Color(colour);
  const c = new Color();
  for (let i = 0; i < colors.count; i++) {
    if (fx.getX(i) < 0.5) continue;
    c.fromBufferAttribute(colors, i);
    if (Math.abs(c.r - want.r) + Math.abs(c.g - want.g) + Math.abs(c.b - want.b) < 0.12) return true;
  }
  return false;
}

describe.each(FIGHTERS)('%s', (_name, family, kind, variant, named) => {
  it('is one body, under its triangle cap', () => {
    const rig = build(kind, family, variant, named);
    expect(Array.isArray(rig.mesh.material)).toBe(false);
    expect(rig.triangles).toBeLessThan(cap(kind, named));
  });

  it('stands on the floor', () => {
    const { low } = extent(build(kind, family, variant, named));
    expect(Math.abs(low)).toBeLessThan(0.06);
  });

  it('plays every animation of its behaviour with every bone in place', () => {
    const rig = build(kind, family, variant, named);
    for (const clip of clipsFor(kind, family, named)) {
      for (let t = 0; t < clip.duration; t += 0.1) {
        rig.apply(clip.sample(t, {}).pose);
        rig.mesh.updateMatrixWorld(true);
        for (const b of BONES) expect(rig.bones[b].matrixWorld.elements.every(Number.isFinite), `${clip.name} ${b}`).toBe(true);
      }
    }
  });

  it('has its family’s light in its eyes', () => {
    expect(glowsIn(build(kind, family, variant, named), family === 'barrow' ? BARROW_LIGHT : GLYPH)).toBe(true);
  });
});

describe('the barrow dead', () => {
  it('have their own looks, not the undead’s', () => {
    for (const kind of ['grunt', 'archer', 'brute', 'warden'] as const) {
      expect(build(kind, 'barrow', 0).triangles, kind).not.toBe(buildCharacter(kind).rig.triangles);
    }
  });

  it('shatter as bone does, the champion too', () => {
    for (const kind of ['grunt', 'archer', 'brute', 'warden'] as const) {
      const e = createEnemy(kind, 0, 0, { family: 'barrow' });
      expect(e.def.death, kind).toBe('shatter');
      expect(e.made, kind).toBe('bone');
    }
    // The undead's brute is stitched flesh, and topples.
    expect(createEnemy('brute', 0, 0).made).toBe('flesh');
    expect(createEnemy('brute', 0, 0).def.death).toBe('topple');
  });

  it('are led by the Barrow Thane, a boss with its name over a bar in its own light', () => {
    const thane = createEnemy('warden', 0, 0, { family: 'barrow' });
    expect(fighterOf('warden', 'barrow').title).toBe('The Barrow Thane');
    expect(thane.boss).toEqual({ colour: BARROW_LIGHT });
    // The other Wardens keep the Bone Warden's blue.
    expect(createEnemy('warden', 0, 0).boss).toEqual({ colour: 0x6ad0ff });
    expect(createEnemy('warden', 0, 0, { family: 'drowned' }).boss).toEqual({ colour: 0x6ad0ff });
    expect(createEnemy('brute', 0, 0, { family: 'barrow' }).boss).toBeUndefined();
  });

  it('stand the Thane at the Bone Warden’s height', () => {
    expect(extent(build('warden', 'barrow', 0)).high).toBeCloseTo(extent(buildCharacter('warden').rig).high, 0);
  });
});

describe('the vault dead', () => {
  it('field grunts, an archer and a brute, and the Keyward by name', () => {
    expect(Object.keys(FAMILIES.vault.fights).sort()).toEqual(['archer', 'brute', 'grunt']);
    expect(() => fighterOf('warden', 'vault')).toThrow();
    expect(fighterOf('brute', 'vault', 'keyward').label).toBe('The Keyward');
  });

  it('fight with the behaviours’ own numbers, bar how they die', () => {
    for (const kind of ['grunt', 'archer'] as const) expect(numbersOf(kind, 'vault')).toBe(CONFIG.enemies[kind]);
    expect(numbersOf('brute', 'vault')).toEqual({ ...CONFIG.enemies.brute, death: 'shatter' });
  });
});

describe('the Keyward', () => {
  const keyward = () => createEnemy('brute', 0, 0, { family: 'vault', named: 'keyward' });

  it('stands about 5 m to its crown, on the giant build', () => {
    const rig = build('brute', 'vault', 0, 'keyward');
    expect(rig.proportions).toEqual(GIANT);
    const { low, high } = extent(rig);
    expect(Math.abs(low)).toBeLessThan(0.06);
    expect(high).toBeGreaterThan(4.6);
    expect(high).toBeLessThan(5.2);
  });

  it('is made of stone, shatters, and is a boss with its name over its bar', () => {
    const k = keyward();
    expect(k.made).toBe('stone');
    expect(k.def.death).toBe('shatter');
    expect(fighterOf('brute', 'vault', 'keyward').title).toBe('The Keyward');
    expect(k.boss).toEqual({ colour: GLYPH });
    expect(k.healthBar.root.position.y).toBeGreaterThan(4.6);
  });

  it('fights as the brute does, with a giant’s reach and weight', () => {
    const own = keyward().def;
    const brute = CONFIG.enemies.brute;
    expect(own.attacks.map((a) => a.pose)).toEqual(brute.attacks.map((a) => a.pose));
    expect(own.hp).toBeGreaterThan(CONFIG.enemies.warden.hp);
    expect(own.radius).toBeGreaterThan(brute.radius * 1.8);
    expect(own.attackRange).toBeGreaterThan(brute.attackRange * 1.8);
    const slam = (c: typeof own) => c.attacks.find((a) => a.kind === 'slam')!.radius!;
    expect(slam(own)).toBeGreaterThan(slam(brute) * 1.5);
    expect(own.knockback).toBeLessThan(0.2);
    expect(own.takes?.hold).toBe(0);
  });

  it('is not a look a vault brute can come in', () => {
    const k = build('brute', 'vault', 0, 'keyward').triangles;
    for (let variant = 0; variant < 6; variant++) expect(build('brute', 'vault', variant).triangles).not.toBe(k);
  });
});
