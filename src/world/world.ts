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
import type { Interior as InteriorId } from '../save/record';
import { type Atmosphere, blendAtmospheres } from './atmosphere';
import { type Ground, steerRound } from './ground';
import { type Flame, type Interior, InteriorSwitch, toFrame } from './interiors';
import { type Mine, type MineStanding, MineSwitch } from './mine';
import { MineGround } from './mineGround';
import type { Cues, RoomCue } from './mix';
import { buildSky, type Sky } from './sky';

const _probe = new Vector3();
const _eye = new Vector3();
/** Where you stand in the interior being stepped, reused each frame. */
const _standing = { x: 0, z: 0, within: false };
/** Where you stand with respect to the mine, reused each frame. */
const _underground: MineStanding = { ahead: 0, inMouth: false, past: 0, crypt: 0, fromMouth: 0 };

/** One of the pool's point lights: the flame it sits on, if any, and how far it has faded up on it. */
interface PoolLight {
  readonly light: PointLight;
  flame: Flame | null;
  weight: number;
  readonly seed: number;
}

/** An interior the World holds, with its switch. */
interface Held {
  readonly interior: Interior;
  readonly switch: InteriorSwitch;
  /** Its switch's door and light, for the sound's mix. */
  readonly cue: { -readonly [K in keyof RoomCue]: RoomCue[K] };
}

/** The mine the World holds, with its switch. */
interface HeldMine {
  readonly mine: Mine;
  readonly switch: MineSwitch;
  /** Its own ground, for its undead. */
  readonly ground: MineGround;
}

/**
 * Everything the zones share: one light rig (a hemisphere light, one sun and
 * a pool of point lights), one sky, one fog and the camera's far plane. Zones
 * are loaded into it and bring only meshes and an atmosphere, which the World
 * applies by changing values. So loading a zone never adds a light, a sky or
 * a shader.
 *
 * A zone's interiors come with it, each with its Interiors switch, stepped
 * from where the camera stands: a door opens as you walk up, the pool of
 * point lights moves onto the room's flames, and once the door is shut
 * behind you the light blends over to the room's and the outdoors is hidden.
 *
 * The old mine comes with its zone too. Walk in through its mouth and its
 * ground and walls are yours until you walk out through it again; past its
 * adit's bend the same switch runs as at a door, and only the part of the
 * mine you're in and its neighbours are drawn.
 *
 * It is also the `Ground` for wherever you stand, answering from the zone
 * underfoot, from an interior inside its footprint, or from the mine once
 * you've come in by its mouth, so enemies, arrows and the player never learn
 * which zone or building they're in.
 */
export class World implements Ground {
  /** The light rig, the sky and every loaded zone. */
  readonly root = new Group();
  readonly fog = new Fog(0xffffff, 1, 2);
  readonly background = new Color();
  readonly hemisphere = new HemisphereLight();
  readonly sun = new DirectionalLight();
  /** Always CONFIG.world.pool.size lights, dark unless there are flames near for them. */
  readonly pool: readonly PointLight[];
  private readonly lights: readonly PoolLight[];
  private readonly sky: Sky;
  private readonly zones: Zone[] = [];
  private readonly interiors: Held[] = [];
  private underground: HeldMine | null = null;
  private readonly heard: { rooms: RoomCue[]; mine: number; crypt: number } = { rooms: [], mine: 0, crypt: -Infinity };
  /** People standing about, whom nothing walks through: circles on the floor plane. */
  private readonly bodies: { readonly x: number; readonly z: number; readonly r: number }[] = [];
  private readonly resolveFn = (p: Vector3, radius: number) => this.resolve(p, radius);
  private camera: PerspectiveCamera | null = null;
  /** The zone's own atmosphere, which an interior's blends from. */
  private atmosphere: Atmosphere | null = null;
  /** The atmosphere as shown: the zone's, or blended towards an interior's. */
  private shown: Atmosphere | null = null;
  /** How far the light shown has gone over to an interior's or the mine's, and whose. */
  private blend: { atmosphere: Atmosphere | null; t: number } = { atmosphere: null, t: 0 };
  private time = 0;
  /** The flames the pool may sit on this frame, nearest first (kept to spare the garbage collector). */
  private readonly flames: Flame[] = [];
  private outdoors = true;
  /** Put the pool straight onto its flames next frame, with no fade (after `settle`). */
  private snapPool = false;
  /** While the fog is lifted, how far you see; null under the atmosphere's own fog. */
  private liftedTo: number | null = null;

  constructor() {
    this.root.name = 'world';
    const toSun = new Vector3(...CONFIG.world.sunDirection).normalize();
    // A directional light shines from its position towards its target (the origin).
    this.sun.position.copy(toSun);
    const { size, color, distance, decay } = CONFIG.world.pool;
    this.pool = Array.from({ length: size }, () => new PointLight(color, 0, distance, decay));
    this.lights = this.pool.map((light, i) => ({ light, flame: null, weight: 0, seed: i * CONFIG.world.pool.flicker.stagger }));
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

  /** Stand someone at (x, z) whom nothing walks through, `r` metres round (a friendly character). */
  addBody(body: { readonly x: number; readonly z: number; readonly r: number }): void {
    this.bodies.push(body);
  }

  /** Add a zone (once), with its interiors, and make its atmosphere the World's. */
  load(zone: Zone): void {
    if (!this.zones.includes(zone)) {
      this.zones.push(zone);
      this.root.add(zone.root);
      for (const interior of zone.interiors) {
        const cue = { id: interior.id, door: 0, light: 0 };
        this.interiors.push({ interior, switch: new InteriorSwitch(interior.footprint.hd), cue });
        this.heard.rooms.push(cue);
        this.root.add(interior.root);
      }
      if (zone.mine && !this.underground) {
        this.underground = { mine: zone.mine, switch: new MineSwitch(), ground: new MineGround(zone.mine, this) };
        this.root.add(zone.mine.root);
      }
    }
    this.apply(zone.atmosphere);
  }

  /**
   * Take on an atmosphere: colours, intensities, distances, and the flames the
   * pool may move onto. Values only. An interior you're in blends from it.
   */
  apply(atmosphere: Atmosphere): void {
    this.atmosphere = atmosphere;
    this.show(this.blend.atmosphere ? blendAtmospheres(atmosphere, this.blend.atmosphere, this.blend.t) : atmosphere);
  }

  /** Is the outdoors drawn? Not while a door is shut behind you, or you're past the mine's bend: whoever adds to it outside the zones (camps, people) hides theirs too. */
  get outdoorsShown(): boolean {
    return this.outdoors;
  }

  /** The interior you're in (inside, or walking back to its door), or the mine once you've come in by its mouth, if any. */
  get interior(): InteriorId | null {
    return this.interiors.find((h) => h.switch.occupied)?.interior.id ?? (this.underground?.switch.occupied ? 'mine' : null);
  }

  /**
   * The light's cues, which the sound's mix follows (world/mix.ts): every
   * building's door and light, the mine's light, and how far on past the
   * breach into the crypt you are, as of the last update or settle.
   */
  get cues(): Cues {
    return this.heard;
  }

  /** The mine, for its route's centre line and its sight test through rock, if a loaded zone has one. */
  get mine(): Mine | null {
    return this.underground?.mine ?? null;
  }

  /**
   * The mine's own ground, for those who live in it (its undead): theirs
   * whether or not you've come in, where the World answers for wherever you
   * stand. Out past its mouth it answers as the World does.
   */
  get mineGround(): Ground | null {
    return this.underground?.ground ?? null;
  }

  /**
   * Arrive in `id` at once, door shut and its light already on (waking by its
   * hearth, or loading a save made inside it), or outdoors (null). In the
   * mine, its ground is yours at once, and where you stand says on the next
   * update whether you're past its bend.
   */
  settle(id: InteriorId | null): void {
    for (const h of this.interiors) {
      h.switch.settle(h.interior.id === id);
      this.showSwitch(h);
    }
    this.underground?.switch.settle(id === 'mine');
    this.blendLight();
    this.hear();
    this.snapPool = true;
  }

  private show(atmosphere: Atmosphere): void {
    this.shown = atmosphere;
    this.fog.color.setHex(atmosphere.fog.color);
    this.background.setHex(atmosphere.background);
    this.sky.apply(atmosphere);
    this.hemisphere.color.setHex(atmosphere.hemisphere.sky);
    this.hemisphere.groundColor.setHex(atmosphere.hemisphere.ground);
    this.hemisphere.intensity = atmosphere.hemisphere.intensity;
    this.sun.color.setHex(atmosphere.sun.color);
    this.sun.intensity = atmosphere.sun.intensity;
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
    const atmosphere = this.shown;
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
    this.time += dt;
    camera.getWorldPosition(_eye);
    for (const h of this.interiors) {
      const { frame, footprint, floor, height, door } = h.interior;
      toFrame(frame, _eye.x, _eye.z, _standing);
      const { x, z } = _standing;
      // A camera flying over a building is nowhere near its door.
      const over = _eye.y > floor + height;
      _standing.x = over ? Infinity : x - door.x;
      _standing.within = !over && Math.abs(x) <= footprint.hw && Math.abs(z) <= footprint.hd;
      h.switch.update(dt, _standing);
      this.showSwitch(h);
      if (h.interior.room.visible) h.interior.update(dt, camera);
    }
    const u = this.underground;
    if (u) u.switch.update(dt, u.mine.stand(_eye.x, _eye.y, _eye.z, _underground));
    this.showOutdoors();
    if (u) {
      u.mine.show(u.switch.entered, this.outdoors, _eye.x, _eye.z);
      u.mine.update(dt, camera);
    }
    this.blendLight();
    this.hear();
    this.updatePool(dt, _eye);
    this.sky.update(dt, camera);
    for (const zone of this.zones) if (zone.root.visible) zone.update(dt, camera);
  }

  /** The switches' doors and light, and the crypt, for the sound's mix. */
  private hear(): void {
    for (const h of this.interiors) {
      h.cue.door = h.switch.door;
      h.cue.light = h.switch.light;
    }
    const u = this.underground;
    this.heard.mine = u?.switch.light ?? 0;
    this.heard.crypt = u?.switch.entered ? _underground.crypt : -Infinity;
  }

  /** An interior's switch, drawn: its door and its room. */
  private showSwitch(h: Held): void {
    h.interior.swing(h.switch.door);
    h.interior.room.visible = h.switch.roomShown;
  }

  /** The outdoors, hidden while a door is shut behind you. */
  private showOutdoors(): void {
    let outdoors = true;
    for (const h of this.interiors) if (h.switch.outdoorsHidden) outdoors = false;
    if (this.underground?.switch.outdoorsHidden) outdoors = false;
    this.outdoors = outdoors;
    for (const zone of this.zones) zone.root.visible = outdoors;
    this.sky.root.visible = outdoors;
  }

  /** The light shown: the zone's, blended towards the interior's or the mine's whose light is up. */
  private blendLight(): void {
    let atmosphere: Atmosphere | null = null;
    let t = 0;
    for (const h of this.interiors) if (h.switch.light > t) [atmosphere, t] = [h.interior.atmosphere, h.switch.light];
    const u = this.underground;
    if (u && u.switch.light > t) [atmosphere, t] = [u.mine.atmosphere, u.switch.light];
    if (atmosphere === this.blend.atmosphere && t === this.blend.t) return;
    this.blend = { atmosphere, t };
    if (this.atmosphere) this.apply(this.atmosphere);
  }

  /**
   * The pool onto the flames nearest `eye`, from the atmosphere shown and any
   * room showing. A light leaving a flame fades out before it moves, and in
   * again on its new one, and every lit one flickers by intensity.
   */
  private updatePool(dt: number, eye: Vector3): void {
    const { intensity, fade, flicker } = CONFIG.world.pool;
    const flames = this.flames;
    flames.length = 0;
    if (this.shown) for (const f of this.shown.flames) nearest(flames, f, eye, this.lights.length);
    for (const h of this.interiors) if (h.switch.flamesLit) for (const f of h.interior.flames) nearest(flames, f, eye, this.lights.length);
    const u = this.underground;
    if (u?.switch.flamesLit) for (const f of u.mine.flames) nearest(flames, f, eye, this.lights.length);
    const wanted = flames;
    // After `settle`, as if every light had long since faded where it's going.
    const snap = this.snapPool;
    this.snapPool = false;
    for (const l of this.lights) {
      if (!l.flame || wanted.includes(l.flame)) continue;
      l.weight = snap ? 0 : Math.max(0, l.weight - dt / fade);
      if (l.weight === 0) l.flame = null;
    }
    for (const f of wanted) {
      let free: PoolLight | null = null;
      let held = false;
      for (const l of this.lights) {
        if (l.flame === f) held = true;
        else if (!free && l.flame === null) free = l;
      }
      if (held) continue;
      if (!free) break;
      free.flame = f;
      free.light.position.set(f.x, f.y, f.z);
    }
    const [a, b] = flicker.depth;
    const [ra, rb] = flicker.rate;
    for (const l of this.lights) {
      if (l.flame && wanted.includes(l.flame)) l.weight = snap ? 1 : Math.min(1, l.weight + dt / fade);
      const t = this.time + l.seed;
      l.light.intensity = intensity * l.weight * (flicker.base + a * Math.sin(t * ra) + b * Math.sin(t * rb + flicker.phase));
    }
  }

  // ------------------------------------------------------------------ Ground

  heightAt(x: number, z: number): number {
    for (const { interior } of this.interiors) {
      const floor = interior.groundAt(x, z);
      if (floor !== null) return floor;
    }
    return this.mineFloor(x, z) ?? this.zoneAt(x, z)?.heightAt(x, z) ?? 0;
  }

  /** The mine's floor at (x, z), once you've come in by its mouth and while it reaches there; else null. */
  private mineFloor(x: number, z: number): number | null {
    const u = this.underground;
    return u?.switch.entered ? u.mine.groundAt(x, z) : null;
  }

  resolve(p: Vector3, radius: number): boolean {
    // In the mine its walls are all there is: the hillside's aren't.
    let moved =
      this.mineFloor(p.x, p.z) !== null ? this.underground!.mine.resolve(p, radius) : (this.zoneAt(p.x, p.z)?.resolve(p, radius) ?? false);
    for (const { interior } of this.interiors) if (interior.resolve(p, radius)) moved = true;
    for (const b of this.bodies) {
      const dx = p.x - b.x;
      const dz = p.z - b.z;
      const min = b.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 1e-6;
      p.x = b.x + (dx / d) * min;
      p.z = b.z + (dz / d) * min;
      moved = true;
    }
    return moved;
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

  /** Local steering, no navmesh: see `steerRound`. */
  steer(from: Vector3, dir: Vector3, radius: number): void {
    steerRound(this.resolveFn, from, dir, radius);
  }

  /** The ground catches arrows, and so do trunks and walls up to about their height. */
  arrowStops(p: Vector3): boolean {
    // In the mine its rock stops them: floor, walls and ceiling.
    const underground = this.mineFloor(p.x, p.z) !== null ? this.underground!.mine.arrowStops(p) : null;
    if (underground !== null) return underground;
    const { propHeight, arrowWidth } = CONFIG.world.ground;
    const floor = this.heightAt(p.x, p.z);
    if (p.y <= floor + arrowWidth) return true;
    return p.y < floor + propHeight && this.blocked(p.x, p.z, arrowWidth);
  }
}

/**
 * Put `f` into `list`, kept nearest `eye` first and at most `max` long, unless
 * it's there already (an atmosphere and its room may share flames).
 */
function nearest(list: Flame[], f: Flame, eye: Vector3, max: number): void {
  if (list.includes(f)) return;
  const d = distance2(f, eye);
  let i = list.length;
  while (i > 0 && distance2(list[i - 1], eye) > d) i--;
  if (i >= max) return;
  list.splice(i, 0, f);
  if (list.length > max) list.length = max;
}

function distance2(f: Flame, eye: Vector3): number {
  return (f.x - eye.x) ** 2 + (f.y - eye.y) ** 2 + (f.z - eye.z) ** 2;
}
