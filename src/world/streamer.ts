import { type Material, Mesh, type Object3D, type Vector3 } from 'three';
import { CONFIG } from '../config';
import { type ChunkKey, chunkDistance, chunkGeometry, type ChunkSource, type Detail } from './chunks';
import type { Stager } from './staging';
import { beyondFog, decide, type Reach } from './streaming';

// Keeps each loaded zone's chunks as world/streaming.ts decides from where
// you stand: full detail near you, stand-ins farther out, nothing past the
// fog. While you walk it builds at most CONFIG.streaming.perFrame chunks a
// frame, nearest first, each staged (uploaded unseen) for a frame before it
// takes over from what was there; dropping a chunk is free. Chunks past the
// fog's far edge are culled.

/** A zone whose chunks are streamed, and the group they go in. */
interface Streamed {
  readonly source: ChunkSource;
  readonly root: Object3D;
}

/** A chunk built, and the zone it's in. */
interface Chunk {
  readonly key: ChunkKey;
  readonly detail: Detail;
  readonly mesh: Mesh;
  readonly zone: Streamed;
}

/** How many chunks are loaded, by detail. */
export interface ChunkCounts {
  full: number;
  standIn: number;
}

export class Streamer {
  /** Every zone's chunks, by key, and whose they are. */
  private readonly owners = new Map<ChunkKey, Streamed>();
  private keys: ChunkKey[] = [];
  private readonly loaded = new Map<ChunkKey, Chunk>();
  /** The detail each loaded chunk is at, for the decisions' hysteresis. */
  private readonly details = new Map<ChunkKey, Detail>();
  /** Built and staged this frame; shown in place of what was there next frame. */
  private readonly incoming: Chunk[] = [];
  /** What the last decision wanted, and where it stood. */
  private wanted = new Map<ChunkKey, Detail>();
  private at = { x: 0, z: 0 };

  constructor(
    private readonly stager: Stager,
    private readonly material: Material,
  ) {}

  /** Stream `source`'s chunks into `root`. */
  add(source: ChunkSource, root: Object3D): void {
    const zone = { source, root };
    for (const key of source.keys) {
      if (this.owners.has(key)) throw new Error(`Two zones claim chunk ${key}`);
      this.owners.set(key, zone);
    }
    this.keys = [...this.owners.keys()];
  }

  /** Loaded chunks by detail. */
  get counts(): ChunkCounts {
    const counts = { full: 0, standIn: 0 };
    for (const c of this.loaded.values()) counts[c.detail]++;
    return counts;
  }

  /** Chunks still to build or change standing where the last update stood, or staged and not yet shown. */
  get pending(): number {
    return this.changes(this.wanted).length + this.incoming.length;
  }

  /**
   * One frame, `eye` where you look from and `reach` the radii: show what was
   * staged last frame, drop what's no longer wanted, build and stage the
   * nearest few that are, and cull what's past the fog's far edge. Unless
   * `building` is false (the outdoors hidden), when only the culling runs.
   */
  update(eye: Vector3, reach: Reach, building = true): void {
    this.takeIncoming();
    if (building) {
      this.plan(eye.x, eye.z, reach);
      for (const { key, detail } of this.changes(this.wanted).slice(0, CONFIG.streaming.perFrame)) {
        const chunk = this.build(key, detail);
        this.stager.stage(chunk.mesh, true);
        this.incoming.push(chunk);
      }
    }
    this.cull(eye, reach.far);
  }

  /** Build everything wanted standing at (x, z) now, at once: on loading in, or waking somewhere else. */
  fill(x: number, z: number, reach: Reach): void {
    this.takeIncoming();
    this.plan(x, z, reach);
    for (const { key, detail } of this.changes(this.wanted)) this.show(this.build(key, detail));
  }

  /** Decide what's wanted at (x, z), and drop what isn't. */
  private plan(x: number, z: number, reach: Reach): void {
    this.wanted = decide(x, z, this.keys, this.details, reach);
    this.at = { x, z };
    for (const [key, chunk] of this.loaded) if (!this.wanted.has(key)) this.drop(chunk);
  }

  /** What's wanted and not loaded as wanted, nearest first. */
  private changes(wanted: ReadonlyMap<ChunkKey, Detail>): { key: ChunkKey; detail: Detail }[] {
    const out: { key: ChunkKey; detail: Detail; d: number }[] = [];
    for (const [key, detail] of wanted) {
      if (this.details.get(key) === detail) continue;
      if (this.incoming.some((c) => c.key === key && c.detail === detail)) continue;
      out.push({ key, detail, d: chunkDistance(key, this.at.x, this.at.z) });
    }
    return out.sort((a, b) => a.d - b.d);
  }

  private build(key: ChunkKey, detail: Detail): Chunk {
    const zone = this.owners.get(key)!;
    const data = zone.source.build(key, detail);
    const mesh = new Mesh(chunkGeometry(data), this.material);
    mesh.name = `chunk-${key}-${detail}`;
    mesh.matrixAutoUpdate = false;
    zone.root.add(mesh);
    return { key, detail, mesh, zone };
  }

  /** Show what was staged last frame, in place of what it replaces. */
  private takeIncoming(): void {
    for (const chunk of this.incoming) this.show(chunk);
    this.incoming.length = 0;
  }

  private show(chunk: Chunk): void {
    const old = this.loaded.get(chunk.key);
    if (old) this.drop(old);
    this.loaded.set(chunk.key, chunk);
    this.details.set(chunk.key, chunk.detail);
  }

  private drop(chunk: Chunk): void {
    chunk.zone.root.remove(chunk.mesh);
    chunk.mesh.geometry.dispose();
    this.loaded.delete(chunk.key);
    this.details.delete(chunk.key);
  }

  private cull(eye: Vector3, far: number): void {
    for (const { mesh } of this.loaded.values()) {
      const s = mesh.geometry.boundingSphere!;
      mesh.visible = !beyondFog(Math.hypot(s.center.x - eye.x, s.center.y - eye.y, s.center.z - eye.z), s.radius, far);
    }
  }
}
