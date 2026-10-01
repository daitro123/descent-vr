import {
  CanvasTexture,
  Color,
  LinearMipmapLinearFilter,
  Mesh,
  MeshLambertMaterial,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type BufferAttribute,
  type Texture,
} from 'three';
import { FOREST, type ForestLayout } from './layout';
import { mulberry32, smoothstep } from './noise';
import { WATER } from './palette';
import { MeshBuffer } from './terrain';

// The stream's and the pond's water: one sheet for the whole zone, built with
// its extras on the main thread (it draws a canvas texture).

let rippleTexture: Texture | null = null;

/** 32×32 ripples: a mid tone with scattered light dashes, magnified crisp like every other texture. */
export function ripples(): Texture {
  if (rippleTexture) return rippleTexture;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(3);
  ctx.fillStyle = 'rgb(214,214,214)';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 70; i++) {
    const v = rand() < 0.5 ? 255 : 190;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 2 + Math.floor(rand() * 3), 1);
  }
  const tex = new CanvasTexture(canvas);
  tex.magFilter = NearestFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  rippleTexture = tex;
  return tex;
}

/**
 * One flat sheet at the water line, only over cells where the ground dips
 * below it. Shallows are lighter than the deeps.
 */
export function buildWater(layout: ForestLayout): { mesh: Mesh; update(dt: number): void } {
  const { ground } = layout;
  const { n, cell, half } = ground;
  const { water } = FOREST;
  const raw = new MeshBuffer();
  const deep = new Color(WATER.deep);
  const shallow = new Color(WATER.shallow);
  const col = new Color();
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const hs = [ground.get(i, j), ground.get(i + 1, j), ground.get(i, j + 1), ground.get(i + 1, j + 1)];
      if (Math.min(...hs) >= water) continue;
      const x = -half + i * cell;
      const z = -half + j * cell;
      const depth = water - (hs[0] + hs[1] + hs[2] + hs[3]) / 4;
      col.copy(shallow).lerp(deep, smoothstep(0.1, 1.1, depth));
      raw.tri([x, water, z], [x + cell, water, z], [x, water, z + cell], col);
      raw.tri([x + cell, water, z], [x + cell, water, z + cell], [x, water, z + cell], col);
    }
  }
  const geometry = raw.geometry();
  const uv = geometry.getAttribute('uv') as BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3);
  const map = typeof document === 'undefined' ? null : ripples();
  const material = new MeshLambertMaterial({ vertexColors: true, map, emissive: 0x0c1c24 });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'forest-water';
  let t = 0;
  return {
    mesh,
    update(dt) {
      t += dt;
      if (map) map.offset.set(t * 0.02, Math.sin(t * 0.3) * 0.05);
    },
  };
}
