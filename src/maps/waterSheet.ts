import { type BufferAttribute, Color, Mesh, MeshLambertMaterial } from 'three';
import { ripples } from './forest/water';
import { smoothstep } from './forest/noise';
import { MeshBuffer } from './forest/terrain';
import type { HeightGrid } from './heightGrid';

// A zone's water as one sheet over its height grid, built with its extras on
// the main thread, as Oakvale's is (forest/water.ts): a cell of the grid is
// wet where its ground dips below the water's level there. The level can
// change from place to place (a beck running downhill, a bog's pools, the
// fens' one sea level); where it's NaN there's no water. Runs of wet cells at
// one level and depth band along a row are merged into one quad, so a fen's
// open water costs a few thousand triangles, not a hundred thousand.

/** How a sheet looks: its deepest and shallowest colours, and how deep is deep (m). */
export interface WaterLook {
  readonly deep: number;
  readonly shallow: number;
  /** Depth (m) at which the water is all `deep`. */
  readonly depth: number;
  /** A dim glow of its own, so it never goes black in the shade. */
  readonly emissive: number;
}

/** Depth bands the colour steps through: few, so runs merge. */
const BANDS = 4;

/** The wet cells of `ground` under `level`, as triangles: [x, y, z] corners and a colour each. */
export function waterCells(
  ground: HeightGrid,
  level: (x: number, z: number) => number,
  look: WaterLook,
  raw: MeshBuffer = new MeshBuffer(),
): MeshBuffer {
  const { cols, rows, cell } = ground;
  const levels = new Float32Array(cols * rows);
  ground.each((x, z, k) => (levels[k] = level(x, z)));
  const deep = new Color(look.deep);
  const shallow = new Color(look.shallow);
  const col = new Color();
  for (let j = 0; j < rows - 1; j++) {
    // A run of cells along this row at one flat level and one band: [first column, level, band].
    let run: [number, number, number] | null = null;
    const close = (end: number) => {
      if (!run) return;
      const [i0, y, band] = run;
      const [x0, x1, z0, z1] = [ground.x(i0), ground.x(end), ground.z(j), ground.z(j + 1)];
      col.copy(shallow).lerp(deep, band / (BANDS - 1));
      raw.tri([x0, y, z0], [x1, y, z0], [x0, y, z1], col);
      raw.tri([x1, y, z0], [x1, y, z1], [x0, y, z1], col);
      run = null;
    };
    for (let i = 0; i < cols - 1; i++) {
      const ks = [j * cols + i, j * cols + i + 1, (j + 1) * cols + i, (j + 1) * cols + i + 1];
      const ls = ks.map((k) => levels[k]);
      const hs = ks.map((k) => ground.data[k]);
      if (ls.some(Number.isNaN) || Math.min(...hs) >= Math.max(...ls)) {
        close(i);
        continue;
      }
      const depth = (ls[0] + ls[1] + ls[2] + ls[3] - hs[0] - hs[1] - hs[2] - hs[3]) / 4;
      const band = Math.round(smoothstep(0.05, look.depth, depth) * (BANDS - 1));
      const flat = ls[0] === ls[1] && ls[0] === ls[2] && ls[0] === ls[3];
      if (flat && run && run[1] === ls[0] && run[2] === band) continue;
      close(i);
      if (flat) {
        run = [i, ls[0], band];
        continue;
      }
      // Sloping water (a beck running downhill): this cell alone, each corner at its own level.
      const x0 = ground.x(i);
      const z0 = ground.z(j);
      const v = (di: number, dj: number, l: number): [number, number, number] => [x0 + di * cell, l, z0 + dj * cell];
      col.copy(shallow).lerp(deep, band / (BANDS - 1));
      raw.tri(v(0, 0, ls[0]), v(1, 0, ls[1]), v(0, 1, ls[2]), col);
      raw.tri(v(1, 0, ls[1]), v(1, 1, ls[3]), v(0, 1, ls[2]), col);
    }
    close(cols - 1);
  }
  return raw;
}

/** The water of `ground` under `level` as one rippling sheet, named `name`, and how it moves. */
export function buildWaterSheet(
  ground: HeightGrid,
  level: (x: number, z: number) => number,
  look: WaterLook,
  name: string,
): { mesh: Mesh; update(dt: number): void } {
  const geometry = waterCells(ground, level, look).geometry();
  const uv = geometry.getAttribute('uv') as BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3);
  const map = typeof document === 'undefined' ? null : ripples();
  const material = new MeshLambertMaterial({ vertexColors: true, map, emissive: look.emissive });
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  let t = 0;
  return {
    mesh,
    update(dt) {
      t += dt;
      if (map) map.offset.set(t * 0.02, Math.sin(t * 0.3) * 0.05);
    },
  };
}
