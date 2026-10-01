import { BufferAttribute, type BufferGeometry, Color } from 'three';

// Oakvale's plant shapes in another zone's colours: a tree, a tuft or a rock
// modelled once in the forest (forest/nature.ts) and turned rust for the moor
// or reed-straw for the fens. The same shared material, so no new shader.

const _c = new Color();
const _to = new Color();

/**
 * A copy of `g` with its greens (leaves, needles, blades, moss), or with
 * `all` its colours, turned to `hex`, each as much lighter or darker than the
 * rest as it was; bark, stone and berries otherwise as they were.
 */
export function recolour(g: BufferGeometry, hex: number, all = false): BufferGeometry {
  const out = g.clone();
  const col = out.getAttribute('color');
  const green = (i: number) => all || col.getY(i) >= col.getX(i);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < col.count; i++) if (green(i)) [sum, n] = [sum + col.getY(i), n + 1];
  const mean = n ? sum / n : 1;
  _to.setHex(hex);
  const colors = new Float32Array(col.count * 3);
  for (let i = 0; i < col.count; i++) {
    _c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
    if (green(i)) _c.copy(_to).multiplyScalar(col.getY(i) / mean);
    colors.set([_c.r, _c.g, _c.b], i * 3);
  }
  out.setAttribute('color', new BufferAttribute(colors, 3));
  return out;
}

/** Each of `from`'s shapes in each of `palette`'s colours, by turns. */
export function recolourEach(from: readonly BufferGeometry[], palette: readonly number[], all = false): BufferGeometry[] {
  return from.map((g, v) => recolour(g, palette[v % palette.length], all));
}
