import {
  CanvasTexture,
  Color,
  LinearMipmapLinearFilter,
  MeshLambertMaterial,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';

// One material family for every model. Vertex colours carry the palette; a
// shared 32×32 grain texture (magnified with NearestFilter) gives the pixel-art
// texture; the `fx` attribute from kit.ts adds per-vertex self-glow and marks
// weapon vertices so a telegraph can light just the weapon.

let grain: Texture | null = null;

/**
 * Greyscale noise with a few darker pits, tiled at TEXELS_PER_METRE.
 * Null outside a browser (unit tests build real enemies in Node).
 */
export function grainTexture(): Texture | null {
  if (grain) return grain;
  if (typeof document === 'undefined') return null;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  let seed = 99;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pit = rand() < 0.04;
      const v = Math.round(255 * (pit ? 0.62 : 0.84 + rand() * 0.16));
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.magFilter = NearestFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  grain = tex;
  return tex;
}

export interface ModelMaterial extends MeshLambertMaterial {
  /** Emissive added to weapon (masked) vertices only: the attack telegraph. */
  readonly telegraph: Color;
}

/**
 * Lambert, flat-shaded, vertex-coloured, grain-textured. Each enemy gets its
 * own instance so its hit flash (`emissive`) and telegraph don't bleed across,
 * but they all share one compiled shader program.
 */
export function createModelMaterial(): ModelMaterial {
  const telegraph = new Color(0, 0, 0);
  const mat = new MeshLambertMaterial({
    vertexColors: true,
    map: grainTexture(),
    flatShading: true,
  }) as ModelMaterial;
  Object.defineProperty(mat, 'telegraph', { value: telegraph });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTelegraph = { value: telegraph };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 fx;\nvarying vec2 vFx;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFx = fx;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTelegraph;\nvarying vec2 vFx;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vFx.x * 1.6 + uTelegraph * vFx.y;',
      );
  };
  mat.customProgramCacheKey = () => 'descent-model';
  return mat;
}

let shared: ModelMaterial | null = null;

/** For static props and weapons that never flash: one instance, fewer state changes. */
export function sharedModelMaterial(): ModelMaterial {
  return (shared ??= createModelMaterial());
}
