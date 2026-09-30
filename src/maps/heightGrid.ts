// Heights on a regular grid over a rectangle of the floor plane, read back
// exactly as a zone's ground mesh draws them. Oakvale's is a square round the
// origin (forest/layout.ts HeightField); Brackenmoor's is its own rectangle
// south of the crest. Free of three.js, so plans run in tests and workers.

export class HeightGrid {
  readonly data: Float32Array;

  /** `cols` by `rows` heights, `cell` m apart, the first at (x0, z0). */
  constructor(
    readonly x0: number,
    readonly z0: number,
    readonly cols: number,
    readonly rows: number,
    readonly cell: number,
  ) {
    this.data = new Float32Array(cols * rows);
  }

  get(i: number, j: number): number {
    return this.data[j * this.cols + i];
  }

  /** The column holding world x `x`, or its row for z, rounded to the nearest and kept on the grid. */
  col(x: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.round((x - this.x0) / this.cell)));
  }

  row(z: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.round((z - this.z0) / this.cell)));
  }

  /** Vertex (i, j) in world metres. */
  x(i: number): number {
    return this.x0 + i * this.cell;
  }

  z(j: number): number {
    return this.z0 + j * this.cell;
  }

  /**
   * Height on the grid's triangles, held at the edge past it. Each cell
   * splits along the diagonal from (i+1, j) to (i, j+1), the same as the mesh.
   */
  at(x: number, z: number): number {
    const gx = Math.min(this.cols - 1, Math.max(0, (x - this.x0) / this.cell));
    const gz = Math.min(this.rows - 1, Math.max(0, (z - this.z0) / this.cell));
    // On the far edge, the last cell's far side: so the edge reads its own heights exactly, where a neighbour's land meets it.
    const i = Math.min(this.cols - 2, Math.floor(gx));
    const j = Math.min(this.rows - 2, Math.floor(gz));
    const fx = gx - i;
    const fz = gz - j;
    const a = this.get(i, j);
    const b = this.get(i + 1, j);
    const c = this.get(i, j + 1);
    const d = this.get(i + 1, j + 1);
    if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
    return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }

  /** Visit every vertex with its world position. */
  each(fn: (x: number, z: number, k: number) => void): void {
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) fn(this.x0 + i * this.cell, this.z0 + j * this.cell, j * this.cols + i);
    }
  }
}
