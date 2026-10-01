import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { FONT } from '../../ui/card';
import { type ForestLayout, localToWorld, MAP_BOARD, POND, pondRadius, SIGNPOSTS, type SignpostPlan, type Structure, standingStones } from './layout';
import { BUILD, CROP, EARTH, GREEN, WATER } from './palette';

// The zone's ways of showing you where things are, painted once from its plan:
// the names on the signposts' boards and the map of Oakvale on its board at
// the crossroads. Each is one texture on one mesh, lit like the world. Nothing
// on them follows the quest: that's the tracker's arrow.

/** Pixels per metre of a board's face, and how far the names stand off the wood. */
const SIGN_PPM = 1000;
const OFF_WOOD = 0.002;
/** The names keep this far from the post's end of a board, and from its edges. */
const SIGN_INSET = { post: 0.09, tip: 0.0, edge: 0.02 };
/** The map's pixels across its face's width. */
const MAP_PX = 1024;

/** A canvas to paint on, or null outside a browser (unit tests build zones in Node). */
function canvas(w: number, h: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c.getContext('2d');
}

/** A painted texture's material: lit, fogged and opaque, as the wood it's painted on. */
function paintedMaterial(ctx: CanvasRenderingContext2D | null): MeshLambertMaterial {
  if (!ctx) return new MeshLambertMaterial();
  const map = new CanvasTexture(ctx.canvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  return new MeshLambertMaterial({ map });
}

const hex = (c: number, k = 1) => {
  const r = Math.round(((c >> 16) & 255) * k);
  const g = Math.round(((c >> 8) & 255) * k);
  const b = Math.round((c & 255) * k);
  return `rgb(${r}, ${g}, ${b})`;
};

/**
 * The names on one signpost's boards: a quad on each face of each board,
 * reading left to right from either side, all from one texture with a row per
 * board. One draw call.
 */
export function buildSignNames(post: Structure): Mesh {
  const plan: SignpostPlan = SIGNPOSTS[post.variant];
  const { length, height, boards } = plan;
  const x0 = SIGN_INSET.post;
  const x1 = length - SIGN_INSET.tip;
  const h = height - 2 * SIGN_INSET.edge;
  const rowW = Math.round((x1 - x0) * SIGN_PPM);
  const rowH = Math.round(h * SIGN_PPM);
  const ctx = canvas(rowW, rowH * boards.length);
  if (ctx) {
    ctx.fillStyle = hex(plan.faded ? BUILD.weatheredPlank : BUILD.plank, 0.92);
    ctx.fillRect(0, 0, rowW, rowH * boards.length);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // A weathered board's letters are worn almost to the wood.
    ctx.fillStyle = plan.faded ? 'rgba(232, 226, 210, 0.42)' : '#f2e6c8';
    ctx.font = `bold ${Math.round(rowH * 0.78)}px ${FONT}`;
    boards.forEach((b, i) => ctx.fillText(b.name, rowW / 2, rowH * (i + 0.54), rowW * 0.96));
  }

  const position: number[] = [];
  const normal: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const p = new Vector3();
  const n = new Vector3();
  boards.forEach(({ a, y }, i) => {
    const turn = new Matrix4().makeRotationY(a - Math.PI / 2).setPosition(post.x, post.y + y, post.z);
    const v0 = 1 - (i + 1) / boards.length;
    const v1 = 1 - i / boards.length;
    // Along the board, its +x points out from the post. From its +z face you read
    // from the post outwards, from its −z face from the tip back.
    for (const side of [1, -1]) {
      const first = position.length / 3;
      const corners: [number, number, number, number][] = [
        [x0, -h / 2, side > 0 ? 0 : 1, v0],
        [x1, -h / 2, side > 0 ? 1 : 0, v0],
        [x1, h / 2, side > 0 ? 1 : 0, v1],
        [x0, h / 2, side > 0 ? 0 : 1, v1],
      ];
      for (const [cx, cy, u, v] of corners) {
        p.set(cx, cy, side * (0.025 + OFF_WOOD)).applyMatrix4(turn);
        position.push(p.x, p.y, p.z);
        n.set(0, 0, side).transformDirection(turn);
        normal.push(n.x, n.y, n.z);
        uv.push(u, v);
      }
      if (side > 0) index.push(first, first + 1, first + 2, first, first + 2, first + 3);
      else index.push(first, first + 2, first + 1, first, first + 3, first + 2);
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  const mesh = new Mesh(geometry, paintedMaterial(ctx));
  mesh.name = 'sign-names';
  return mesh;
}

/**
 * The painted map on the map board's face, facing the way the board does.
 * One quad, one texture, one draw call.
 */
export function buildMapFace(board: Structure, layout: ForestLayout): Mesh {
  const { w, h, top, lean } = MAP_BOARD;
  const ctx = canvas(MAP_PX, Math.round((MAP_PX * h) / w));
  if (ctx) paintMap(ctx, layout, board);
  const mesh = new Mesh(new PlaneGeometry(w, h), paintedMaterial(ctx));
  mesh.name = 'map-board';
  // On the backing board's face, leaning back about its middle as the frame does (buildings.ts).
  const mid = top - (h / 2) * Math.cos(lean);
  mesh.matrixAutoUpdate = false;
  mesh.matrix
    .makeRotationY(board.yaw)
    .setPosition(board.x, board.y, board.z)
    .multiply(new Matrix4().makeTranslation(0, mid, -0.03))
    .multiply(new Matrix4().makeRotationX(-lean))
    .multiply(new Matrix4().makeTranslation(0, 0, 0.02 + OFF_WOOD));
  return mesh;
}

/**
 * Oakvale as a painted map, heads-up: facing the board you face east, so east
 * is at the top and north at the left, as the zone lies before you. Its hills,
 * woods, fields, the stream and the pond, the roads, every building, each
 * place named, the way south to Brackenmoor, and "You are here" where the
 * board stands.
 */
function paintMap(c: CanvasRenderingContext2D, layout: ForestLayout, board: Structure): void {
  const W = c.canvas.width;
  const H = c.canvas.height;
  const { minX, maxX, minZ, maxZ } = MAP_BOARD.shows;
  const margin = W * 0.035;
  const k = Math.min((W - 2 * margin) / (maxZ - minZ), (H - 2 * margin) / (maxX - minX));
  const cu = W / 2;
  const cv = H / 2;
  const mx = (minX + maxX) / 2;
  const mz = (minZ + maxZ) / 2;
  /** Canvas pixels for a point on the floor plane. */
  const at = (x: number, z: number): [number, number] => [cu + (z - mz) * k, cv - (x - mx) * k];
  const line = (pts: readonly (readonly [number, number])[]) => {
    c.beginPath();
    pts.forEach(([x, z], i) => (i ? c.lineTo(...at(x, z)) : c.moveTo(...at(x, z))));
  };
  const box = (s: { x: number; z: number; yaw: number }, hw: number, hd: number) => {
    line([localToWorld(s, -hw, -hd), localToWorld(s, hw, -hd), localToWorld(s, hw, hd), localToWorld(s, -hw, hd)]);
    c.closePath();
  };

  // Parchment in a dark frame, then the land by its height: meadows low, hills tan, the mountains brown.
  c.fillStyle = '#3a2716';
  c.fillRect(0, 0, W, H);
  const inner = margin * 0.45;
  c.fillStyle = '#e8d8b0';
  c.fillRect(inner, inner, W - 2 * inner, H - 2 * inner);
  c.save();
  c.beginPath();
  c.rect(inner, inner, W - 2 * inner, H - 2 * inner);
  c.clip();
  const cell = 2;
  for (let x = minX - 10; x < maxX + 10; x += cell) {
    for (let z = minZ - 10; z < maxZ + 10; z += cell) {
      const g = layout.ground.at(x, z);
      const t = Math.max(0, Math.min(1, (g - 2) / 18));
      const r = Math.round(214 - 70 * t);
      const gr = Math.round(210 - 90 * t);
      const b = Math.round(160 - 70 * t);
      c.fillStyle = `rgb(${r}, ${gr}, ${b})`;
      const [u, v] = at(x + cell, z);
      c.fillRect(u, v, cell * k + 1, cell * k + 1);
    }
  }

  // The woods, a dab per tree.
  c.fillStyle = hex(GREEN.pine[1], 1.25);
  for (const t of layout.trees) {
    const [u, v] = at(t.x, t.z);
    c.beginPath();
    c.arc(u, v, Math.max(2.5, 1.5 * k), 0, Math.PI * 2);
    c.fill();
  }

  // The fields, the stream, the pond.
  const crops = { wheat: CROP.wheat, pumpkin: CROP.pumpkin, cabbage: CROP.cabbage };
  for (const f of layout.fields) {
    box(f, f.hw, f.hd);
    c.fillStyle = hex(crops[f.crop], 0.95);
    c.fill();
  }
  c.lineCap = c.lineJoin = 'round';
  c.strokeStyle = hex(WATER.shallow, 1.15);
  c.lineWidth = layout.stream.half * 2 * k;
  line(layout.stream.line);
  c.stroke();
  const pond: [number, number][] = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r = pondRadius(POND.x + Math.cos(a), POND.z + Math.sin(a));
    pond.push([POND.x + Math.cos(a) * r, POND.z + Math.sin(a) * r]);
  }
  line(pond);
  c.closePath();
  c.fillStyle = hex(WATER.shallow, 1.15);
  c.fill();

  // The roads, the bridge over the stream and the dock.
  c.strokeStyle = hex(EARTH.dirtLight, 0.95);
  for (const p of layout.paths) {
    c.lineWidth = Math.max(3, p.width * 0.8 * k);
    line(p.line);
    c.stroke();
  }
  for (const deck of [layout.bridge, layout.dock]) {
    box(deck, deck.hw, deck.hd);
    c.fillStyle = hex(EARTH.bark, 1.1);
    c.fill();
  }

  // Every building: roofs, the tower's round top, the tent, the stones, the mine's mouth in the rock.
  const at_ = (kind: Structure['kind']) => layout.structures.filter((s) => s.kind === kind);
  c.lineWidth = 2;
  c.strokeStyle = '#3a2716';
  for (const s of layout.structures) {
    if (!['inn', 'house', 'smithy', 'farmhouse', 'barn', 'tent', 'windmill'].includes(s.kind)) continue;
    box(s, s.hw, s.hd);
    c.fillStyle = hex(s.kind === 'farmhouse' || s.kind === 'barn' || (s.kind === 'house' && s.variant === 1) ? BUILD.thatchDark : s.kind === 'tent' ? BUILD.canvas : BUILD.redWood);
    c.fill();
    c.stroke();
  }
  for (const s of at_('tower')) {
    const [u, v] = at(s.x, s.z);
    c.beginPath();
    c.arc(u, v, 3.2 * k, 0, Math.PI * 2);
    c.fillStyle = hex(0x8a8478);
    c.fill();
    c.stroke();
  }
  c.fillStyle = hex(0x8a8478);
  for (const s of at_('stones')) {
    for (const [x, z] of standingStones(s)) {
      const [u, v] = at(x, z);
      c.beginPath();
      c.arc(u, v, Math.max(3, 0.9 * k), 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
  }
  for (const s of at_('mine')) {
    const [u, v] = at(s.x, s.z + s.hd);
    c.beginPath();
    c.arc(u, v, 2.4 * k, 0, Math.PI * 2);
    c.fillStyle = '#1e1812';
    c.fill();
  }
  c.restore();

  // The names, in ink with a pale halo so they read over the woods.
  const name = (text: string, x: number, z: number, size: number, dv = 0) => {
    const [u, v] = at(x, z);
    c.font = `bold ${size}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = size * 0.28;
    c.strokeStyle = 'rgba(240, 228, 196, 0.9)';
    c.strokeText(text, u, v + dv);
    c.fillStyle = '#2a1c10';
    c.fillText(text, u, v + dv);
  };
  const place = (kind: Structure['kind']) => at_(kind)[0];
  const inn = place('inn');
  const smithy = place('smithy');
  const farm = place('farmhouse');
  const barn = place('barn');
  const tower = place('tower');
  const stones = place('stones');
  const mine = place('mine');
  const tent = place('tent');
  const big = Math.round(H * 0.042);
  const small = Math.round(H * 0.032);
  name('Inn', inn.x, inn.z, small, -small);
  name('Smithy', smithy.x, smithy.z, small, -small);
  name('Farm', (farm.x + barn.x) / 2, (farm.z + barn.z) / 2, big);
  name('Lumber Camp', tent.x, tent.z, big, big * 1.2);
  name('Watchtower', tower.x, tower.z, big, big * 1.2);
  name('Standing Stones', stones.x, stones.z, small, small * 1.3);
  name('Old Mine', mine.x, mine.z + mine.hd, big, big * 1.1);
  name('Pond', POND.x, POND.z, small);
  // The way out south, through the pass: an arrow off the map's right edge.
  const south = layout.paths[0].line.filter(([, z]) => z < MAP_BOARD.shows.maxZ - 8).reduce((a, b) => (b[1] > a[1] ? b : a));
  const [su, sv] = at(south[0], south[1]);
  c.fillStyle = '#2a1c10';
  c.beginPath();
  c.moveTo(su + 0.045 * H, sv);
  c.lineTo(su + 0.01 * H, sv - 0.022 * H);
  c.lineTo(su + 0.01 * H, sv + 0.022 * H);
  c.closePath();
  c.fill();
  c.font = `bold ${small}px ${FONT}`;
  c.textAlign = 'right';
  c.textBaseline = 'bottom';
  c.lineWidth = small * 0.28;
  c.strokeStyle = 'rgba(240, 228, 196, 0.9)';
  c.strokeText('To Brackenmoor', su + 0.045 * H, sv - 0.03 * H);
  c.fillText('To Brackenmoor', su + 0.045 * H, sv - 0.03 * H);

  // The zone's name, top left, with which way is north under it: an arrow to the left.
  const title = Math.round(H * 0.06);
  c.font = `bold ${title}px ${FONT}`;
  c.textAlign = 'left';
  c.textBaseline = 'top';
  c.lineWidth = title * 0.25;
  c.strokeStyle = 'rgba(240, 228, 196, 0.9)';
  c.strokeText('Oakvale', W * 0.05, H * 0.05);
  c.fillStyle = '#2a1c10';
  c.fillText('Oakvale', W * 0.05, H * 0.05);
  const nu = W * 0.05 + 0.05 * H;
  const nv = H * 0.05 + title * 1.45;
  c.strokeStyle = '#2a1c10';
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(nu + 0.05 * H, nv);
  c.lineTo(nu - 0.02 * H, nv);
  c.stroke();
  c.beginPath();
  c.moveTo(nu - 0.05 * H, nv);
  c.lineTo(nu - 0.015 * H, nv - 0.02 * H);
  c.lineTo(nu - 0.015 * H, nv + 0.02 * H);
  c.closePath();
  c.fill();
  c.font = `bold ${small}px ${FONT}`;
  c.textBaseline = 'middle';
  c.fillText('N', nu + 0.065 * H, nv);

  // You are here: where the board stands.
  const [yu, yv] = at(board.x, board.z);
  c.beginPath();
  c.arc(yu, yv, H * 0.014, 0, Math.PI * 2);
  c.fillStyle = '#d01818';
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = '#fff4e0';
  c.stroke();
  c.font = `bold ${big}px ${FONT}`;
  c.textAlign = 'center';
  c.lineWidth = big * 0.28;
  c.strokeStyle = 'rgba(255, 244, 224, 0.95)';
  c.strokeText('You are here', yu, yv + big * 1.1);
  c.fillStyle = '#c01010';
  c.fillText('You are here', yu, yv + big * 1.1);
}
