import { type Camera, Group, HemisphereLight, Mesh, PointLight, Vector3 } from 'three';
import { pushOutOfCircle } from '../combat/geometry';
import { CONFIG } from '../config';
import { ModelBuilder } from '../models/kit';
import { sharedModelMaterial } from '../models/materials';
import type { Ground } from './ground';
import { Glows } from './glows';
import { buildHall, hallMaterials, torchLight } from './hall';

const _p = new Vector3();

/**
 * The crypt hall (hall.ts) on its own, its three gates running back into the
 * dark: the arena. Owns the static collision shapes and the hall's lights.
 *
 * Budget (see the Quest 3 performance research): static geometry is merged
 * per material into four meshes (floor, walls, props, glows), and the light
 * count is fixed at four point lights plus the hemisphere. Braziers and the
 * rune circle fake their light with glow sprites.
 */
export class Arena implements Ground {
  readonly root = new Group();
  private readonly lights: { light: PointLight; base: number; seed: number }[] = [];
  private readonly glows: Glows;
  private time = 0;

  constructor() {
    const floor = new ModelBuilder(20);
    const walls = new ModelBuilder(22);
    const props = new ModelBuilder(21);
    this.glows = new Glows();
    const glows = this.glows;
    buildHall({ floor, walls, props, glow: (x, y, z, size, color) => glows.add(x, y, z, size, color) }, { south: 'dark', east: 'dark', west: 'dark' });
    const materials = hallMaterials();
    this.root.add(new Mesh(floor.build(), materials.floor), new Mesh(walls.build(), materials.walls));
    this.root.add(new Mesh(props.build({ ao: { from: 0, to: 1.2, min: 0.6 } }), sharedModelMaterial()));
    this.root.add(this.glows.mesh);

    // Four real lights, one per pillar torch. Never add or remove lights at
    // runtime: that recompiles every lit shader.
    for (const p of CONFIG.arena.pillars) {
      const { color, intensity, distance, decay } = CONFIG.world.pool;
      const light = new PointLight(color, intensity, distance, decay);
      light.position.copy(torchLight(p));
      this.root.add(light);
      this.lights.push({ light, base: intensity, seed: Math.random() * 100 });
    }
    this.root.add(new HemisphereLight(0x6a78a8, 0x2a1c14, 0.9));
  }

  /** Torch flicker and glow billboards. */
  update(dt: number, camera: Camera): void {
    this.time += dt;
    for (const l of this.lights) {
      const t = this.time * 9 + l.seed;
      l.light.intensity = l.base * (0.85 + 0.1 * Math.sin(t) + 0.06 * Math.sin(t * 2.7 + 1.3));
    }
    this.glows.update(this.time, camera);
  }

  /** The room's floor is flat, at 0. */
  heightAt(): number {
    return 0;
  }

  /**
   * Push a point on the floor plane out of walls, pillars and props.
   * `radius` is the body radius of whatever is being resolved.
   */
  resolve(p: Vector3, radius: number): boolean {
    return resolveFloor(p, radius);
  }

  /** Is the straight line a→b on the floor clear of pillars? (Archers want a clear shot.) */
  lineOfSight(a: Vector3, b: Vector3): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    for (const c of CONFIG.arena.pillars) {
      const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.z - a.z) * dz) / len2));
      const px = a.x + dx * t - c.x;
      const pz = a.z + dz * t - c.z;
      if (px * px + pz * pz < (c.r + 0.1) ** 2) return false;
    }
    return true;
  }

  /** Slide round pillars and props: bend towards the side already favoured. */
  steer(from: Vector3, dir: Vector3, radius: number): void {
    for (const o of [...CONFIG.arena.pillars, ...CONFIG.arena.obstacles]) {
      const dx = from.x - o.x;
      const dz = from.z - o.z;
      const d = Math.hypot(dx, dz);
      const clear = o.r + radius + 0.5;
      if (d > clear || d < 1e-4) continue;
      // Heading into it? Slide round the side we're already favouring.
      const towards = -(dx * dir.x + dz * dir.z) / d;
      if (towards <= 0) continue;
      const side = dx * dir.z - dz * dir.x >= 0 ? 1 : -1;
      const w = towards * (1 - (d - o.r - radius) / 0.5);
      dir.x += (-dz / d) * side * w * 1.5;
      dir.z += (dx / d) * side * w * 1.5;
    }
    dir.setY(0).normalize();
  }

  /** The floor, the walls and the pillars catch arrows. */
  arrowStops(p: Vector3): boolean {
    const half = CONFIG.arena.halfSize;
    if (p.y <= 0.02 || Math.abs(p.x) >= half - 0.02 || Math.abs(p.z) >= half - 0.02) return true;
    if (p.y >= CONFIG.arena.wallHeight) return false;
    _p.copy(p);
    return CONFIG.arena.pillars.some((c) => pushOutOfCircle(_p, c.x, c.z, c.r));
  }
}

/** The room's collision, as a pure function (see Arena.resolve). */
export function resolveFloor(p: Vector3, radius: number): boolean {
  let moved = false;
  const limit = CONFIG.arena.halfSize - radius;
  if (p.x > limit) (p.x = limit), (moved = true);
  if (p.x < -limit) (p.x = -limit), (moved = true);
  if (p.z > limit) (p.z = limit), (moved = true);
  if (p.z < -limit) (p.z = -limit), (moved = true);
  for (const c of CONFIG.arena.pillars) {
    if (pushOutOfCircle(p, c.x, c.z, c.r + radius)) moved = true;
  }
  for (const c of CONFIG.arena.obstacles) {
    if (pushOutOfCircle(p, c.x, c.z, c.r + radius)) moved = true;
  }
  return moved;
}
