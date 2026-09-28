import {
  type Camera,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  type PerspectiveCamera,
  PointLight,
  type Scene,
  Vector3,
} from 'three';
import { CONFIG } from '../config';
import type { Zone } from '../maps/types';
import type { Atmosphere } from './atmosphere';
import type { Ground } from './ground';
import { buildSky, type Sky } from './sky';

const _probe = new Vector3();

/**
 * Everything the zones share: one light rig (a hemisphere light, one sun and
 * a pool of point lights), one sky, one fog and the camera's far plane. Zones
 * are loaded into it and bring only meshes and an atmosphere, which the World
 * applies by changing values. So loading a zone never adds a light, a sky or
 * a shader.
 *
 * It is also the `Ground` for wherever you stand, answering from the zone
 * underfoot, so enemies, arrows and the player never learn which zone they're in.
 */
export class World implements Ground {
  /** The light rig, the sky and every loaded zone. */
  readonly root = new Group();
  readonly fog = new Fog(0xffffff, 1, 2);
  readonly background = new Color();
  readonly hemisphere = new HemisphereLight();
  readonly sun = new DirectionalLight();
  /** Always CONFIG.world.pool.size lights, dark unless the atmosphere has flames for them. */
  readonly pool: readonly PointLight[];
  private readonly sky: Sky;
  private readonly zones: Zone[] = [];
  private camera: PerspectiveCamera | null = null;
  private atmosphere: Atmosphere | null = null;
  /** While the fog is lifted, how far you see; null under the atmosphere's own fog. */
  private liftedTo: number | null = null;

  constructor() {
    this.root.name = 'world';
    const toSun = new Vector3(...CONFIG.world.sunDirection).normalize();
    // A directional light shines from its position towards its target (the origin).
    this.sun.position.copy(toSun);
    const { size, color, distance, decay } = CONFIG.world.pool;
    this.pool = Array.from({ length: size }, () => new PointLight(color, 0, distance, decay));
    this.sky = buildSky(toSun);
    this.root.add(this.hemisphere, this.sun, ...this.pool, this.sky.root);
  }

  /** Light and fog `scene` with the World, seen through `camera` (whose far plane it sets). */
  attach(scene: Scene, camera: PerspectiveCamera): void {
    scene.fog = this.fog;
    scene.background = this.background;
    scene.add(this.root);
    this.camera = camera;
    this.applyView();
  }

  /** Take the World off `scene`, for a whole-build map with its own lights. */
  detach(scene: Scene): void {
    scene.remove(this.root);
    if (scene.fog === this.fog) scene.fog = null;
    if (scene.background === this.background) scene.background = null;
    this.camera = null;
  }

  /** Add a zone (once) and make its atmosphere the World's. */
  load(zone: Zone): void {
    if (!this.zones.includes(zone)) {
      this.zones.push(zone);
      this.root.add(zone.root);
    }
    this.apply(zone.atmosphere);
  }

  /** Take on an atmosphere: colours, intensities, distances and the pool's places. Values only. */
  apply(atmosphere: Atmosphere): void {
    this.atmosphere = atmosphere;
    this.fog.color.setHex(atmosphere.fog.color);
    this.background.setHex(atmosphere.background);
    this.sky.apply(atmosphere);
    this.hemisphere.color.setHex(atmosphere.hemisphere.sky);
    this.hemisphere.groundColor.setHex(atmosphere.hemisphere.ground);
    this.hemisphere.intensity = atmosphere.hemisphere.intensity;
    this.sun.color.setHex(atmosphere.sun.color);
    this.sun.intensity = atmosphere.sun.intensity;
    this.pool.forEach((light, i) => {
      const flame = atmosphere.flames[i];
      light.intensity = flame ? CONFIG.world.pool.intensity : 0;
      if (flame) light.position.set(flame.x, flame.y, flame.z);
    });
    this.applyView();
  }

  /**
   * See everything out to `far` metres with no fog (the map viewer's
   * overview). The fog stays on, pushed past the far plane, so no program
   * changes.
   */
  liftFog(far: number): void {
    this.liftedTo = far;
    this.applyView();
  }

  /** Back to the atmosphere's own fog and far plane. */
  restoreFog(): void {
    this.liftedTo = null;
    this.applyView();
  }

  private applyView(): void {
    const atmosphere = this.atmosphere;
    if (!atmosphere) return;
    const far = this.liftedTo ?? atmosphere.farPlane;
    this.fog.near = this.liftedTo === null ? atmosphere.fog.near : far;
    this.fog.far = this.liftedTo === null ? atmosphere.fog.far : far * 2;
    // The sky dome must sit inside the far plane or it's clipped away.
    const { radius, farShare } = CONFIG.world.sky;
    this.sky.root.scale.setScalar(Math.min(1, (farShare * far) / radius));
    if (this.camera) {
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
  }

  /** The loaded zone underfoot at (x, z): the one whose walkable area holds it, else the nearest. */
  zoneAt(x: number, z: number): Zone | undefined {
    let best: Zone | undefined;
    let bestGap = Infinity;
    for (const zone of this.zones) {
      const b = zone.bounds;
      const gap = Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));
      if (gap < bestGap) [best, bestGap] = [zone, gap];
    }
    return best;
  }

  update(dt: number, camera: Camera): void {
    this.sky.update(dt, camera);
    for (const zone of this.zones) zone.update(dt, camera);
  }

  // ------------------------------------------------------------------ Ground

  heightAt(x: number, z: number): number {
    return this.zoneAt(x, z)?.heightAt(x, z) ?? 0;
  }

  resolve(p: Vector3, radius: number): boolean {
    return this.zoneAt(p.x, p.z)?.resolve(p, radius) ?? false;
  }

  /** Would a body of `radius` at (x, z) be pushed out of something? */
  private blocked(x: number, z: number, radius: number): boolean {
    return this.resolve(_probe.set(x, 0, z), radius);
  }

  /** Eye to eye: trunks, walls and the lie of the land in between all block it. */
  lineOfSight(a: Vector3, b: Vector3): boolean {
    const { eyeHeight, sightStep, bodyClearance, sightWidth } = CONFIG.world.ground;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const n = Math.ceil(len / sightStep);
    const ya = this.heightAt(a.x, a.z) + eyeHeight;
    const yb = this.heightAt(b.x, b.z) + eyeHeight;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = a.x + dx * t;
      const z = a.z + dz * t;
      if (this.heightAt(x, z) > ya + (yb - ya) * t) return false;
      // The two bodies stand at the ends; only what's between them counts.
      if (t * len < bodyClearance || (1 - t) * len < bodyClearance) continue;
      if (this.blocked(x, z, sightWidth)) return false;
    }
    return true;
  }

  /**
   * Local steering, no navmesh: look a stride ahead, and if something's
   * there, turn towards the side it would push you, then the other, a little
   * more each time.
   */
  steer(from: Vector3, dir: Vector3, radius: number): void {
    const { lookAhead, turns } = CONFIG.world.ground;
    const look = lookAhead + radius;
    const ax = from.x + dir.x * look;
    const az = from.z + dir.z * look;
    _probe.set(ax, 0, az);
    if (!this.resolve(_probe, radius)) return;
    // Turning by +a swings dir towards (dir.z, -dir.x): start on the side the probe was pushed to.
    const pushX = _probe.x - ax;
    const pushZ = _probe.z - az;
    const first = dir.z * pushX - dir.x * pushZ >= 0 ? 1 : -1;
    const x0 = dir.x;
    const z0 = dir.z;
    for (const a of turns) {
      for (const side of [first, -first]) {
        const c = Math.cos(a * side);
        const s = Math.sin(a * side);
        const x = x0 * c + z0 * s;
        const z = -x0 * s + z0 * c;
        if (!this.blocked(from.x + x * look, from.z + z * look, radius)) {
          dir.set(x, 0, z);
          return;
        }
      }
    }
  }

  /** The ground catches arrows, and so do trunks and walls up to about their height. */
  arrowStops(p: Vector3): boolean {
    const { propHeight, arrowWidth } = CONFIG.world.ground;
    const floor = this.heightAt(p.x, p.z);
    if (p.y <= floor + arrowWidth) return true;
    return p.y < floor + propHeight && this.blocked(p.x, p.z, arrowWidth);
  }
}
