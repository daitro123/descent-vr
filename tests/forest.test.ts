import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { buildLayout, FOREST, type ForestLayout, localToWorld } from '../src/maps/forest/layout';
import { MAPS } from '../src/maps/registry';

let layout: ForestLayout;
beforeAll(() => {
  layout = buildLayout();
});

describe('map registry', () => {
  it('finds every map folder', () => {
    expect(MAPS.map((m) => m.id)).toEqual(['crypt', 'forest']);
  });
});

describe('forest layout', () => {
  it('starts you on the road, on dry ground, clear of everything', () => {
    const { spawn } = layout;
    expect(layout.roadDistance.at(spawn.x, spawn.z)).toBeLessThan(0);
    expect(layout.heightAt(spawn.x, spawn.z)).toBeGreaterThan(FOREST.water + 0.3);
    expect(layout.colliders.blocked(spawn.x, spawn.z, CONFIG.player.bodyRadius)).toBe(false);
  });

  it('keeps buildings off the roads', () => {
    const onRoad: string[] = [];
    for (const s of layout.structures) {
      if (!s.solid) continue;
      for (let u = -1; u <= 1; u += 0.25) {
        for (let v = -1; v <= 1; v += 0.25) {
          const [x, z] = localToWorld(s, u * s.hw, v * s.hd);
          if (layout.roadDistance.at(x, z) < 0.2) onRoad.push(`${s.kind} at (${s.x}, ${s.z})`);
        }
      }
    }
    expect([...new Set(onRoad)]).toEqual([]);
  });

  it('sets the watchtower and the mine on the ground, not hanging over it', () => {
    const gaps: string[] = [];
    const check = (what: string, x: number, z: number, y: number) => {
      const gap = y - layout.heightAt(x, z);
      if (Math.abs(gap) > 0.05) gaps.push(`${what} at (${x.toFixed(1)}, ${z.toFixed(1)}): ${gap.toFixed(2)} m`);
    };
    // All round the tower's base, out past its door step.
    const tower = layout.structures.find((s) => s.kind === 'tower')!;
    for (let a = 0; a < 2 * Math.PI; a += Math.PI / 16) {
      for (const r of [3.8, 4.2]) check('tower', tower.x + Math.sin(a) * r, tower.z + Math.cos(a) * r, tower.y);
    }
    // Along the mine's rails, from its mouth to where they end.
    const mine = layout.structures.find((s) => s.kind === 'mine')!;
    for (let lz = mine.hd; lz <= mine.hd + 6.6; lz += 0.5) {
      for (const lx of [-0.65, 0, 0.65]) check('mine rails', ...localToWorld(mine, lx, lz), mine.y);
    }
    expect(gaps).toEqual([]);
  });

  it('keeps every road above the water, except where the bridge carries it', () => {
    const wet: string[] = [];
    for (const path of layout.paths) {
      for (const [x, z] of path.line) {
        if (Math.abs(x) > FOREST.play || Math.abs(z) > FOREST.play) continue;
        if (layout.heightAt(x, z) < FOREST.water + 0.3) wet.push(`${path.id} (${x.toFixed(0)}, ${z.toFixed(0)})`);
      }
    }
    expect(wet.slice(0, 5)).toEqual([]);
  });

  it('lets you walk over the bridge without dropping into the stream', () => {
    const { bridge } = layout;
    for (let t = -1; t <= 1; t += 0.1) {
      const [x, z] = localToWorld(bridge, 0, t * bridge.hd);
      expect(layout.heightAt(x, z)).toBeGreaterThan(FOREST.water + 0.3);
    }
  });

  // Walk the floor plane from the spawn: every landmark must be reachable, so
  // no tree line, fence or building walls one off.
  it('can reach every landmark on foot from the spawn', () => {
    const step = 0.5;
    const half = FOREST.play;
    const n = Math.round((2 * half) / step) + 1;
    const r = CONFIG.player.bodyRadius;
    const p = new Vector3();
    const free = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        p.set(-half + i * step, 0, -half + j * step);
        free[j * n + i] = layout.colliders.resolve(p, r) ? 0 : 1;
      }
    }
    const cell = (x: number, z: number) => [Math.round((x + half) / step), Math.round((z + half) / step)];
    const seen = new Uint8Array(n * n);
    const [si, sj] = cell(layout.spawn.x, layout.spawn.z);
    const stack = [sj * n + si];
    seen[stack[0]] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      const i = k % n;
      const j = Math.floor(k / n);
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const a = i + di;
        const b = j + dj;
        if (a < 0 || b < 0 || a >= n || b >= n) continue;
        const kk = b * n + a;
        if (free[kk] && !seen[kk]) {
          seen[kk] = 1;
          stack.push(kk);
        }
      }
    }
    // A landmark inside a building counts if you can walk up to within a few metres of it.
    const unreachable = layout.landmarks.filter(({ x, z }) => {
      const [ci, cj] = cell(x, z);
      for (let dj = -12; dj <= 12; dj++) {
        for (let di = -12; di <= 12; di++) {
          const i = ci + di;
          const j = cj + dj;
          if (i >= 0 && j >= 0 && i < n && j < n && seen[j * n + i]) return false;
        }
      }
      return true;
    });
    expect(unreachable.map((l) => l.label)).toEqual([]);
  });

  it('puts every landmark inside the walkable bounds', () => {
    for (const l of layout.landmarks) {
      expect(Math.abs(l.x)).toBeLessThan(FOREST.play);
      expect(Math.abs(l.z)).toBeLessThan(FOREST.play);
    }
  });
});
