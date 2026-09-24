import {
  CanvasTexture,
  LinearMipmapLinearFilter,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';

// Placeholder pixel-art textures, drawn procedurally so the white box needs no
// asset pipeline. The trick for "pixel art in VR": magnify with NearestFilter
// (crisp texels up close) but minify with mipmaps (no shimmer at distance).
// Rendering the whole frame at low resolution does not work in a headset —
// the compositor upsamples linearly and it just looks blurry.

type Rng = () => number;

function mulberry32(seed: number): Rng {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(base: [number, number, number], amount: number): string {
  const [r, g, b] = base.map((c) => Math.max(0, Math.min(255, Math.round(c * amount))));
  return `rgb(${r},${g},${b})`;
}

function toTexture(canvas: HTMLCanvasElement, repeatX: number, repeatY: number): Texture {
  const tex = new CanvasTexture(canvas);
  tex.magFilter = NearestFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** 32×32 flagstone tile (four 16px stones). */
export function stoneFloorTexture(repeat: number): Texture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = mulberry32(7);
  const base: [number, number, number] = [92, 84, 78];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grout = x % 16 === 0 || y % 16 === 0;
      ctx.fillStyle = grout ? shade(base, 0.45) : shade(base, 0.85 + rng() * 0.3);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return toTexture(canvas, repeat, repeat);
}

/** 32×32 brick wall (bricks 16×8, offset rows). */
export function brickWallTexture(repeatX: number, repeatY: number): Texture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = mulberry32(13);
  const base: [number, number, number] = [110, 70, 58];

  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / 8);
    const offset = row % 2 === 0 ? 0 : 8;
    for (let x = 0; x < size; x++) {
      const mortar = y % 8 === 0 || (x + offset) % 16 === 0;
      ctx.fillStyle = mortar ? shade([60, 55, 50], 0.9) : shade(base, 0.8 + rng() * 0.35);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return toTexture(canvas, repeatX, repeatY);
}
