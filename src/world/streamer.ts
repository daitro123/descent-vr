import { type Material, Mesh, type Object3D, type Vector3 } from 'three';
import { CONFIG } from '../config';
import { type ChunkData, type ChunkKey, chunkDistance, chunkGeometry, type ChunkSource, type Detail } from './chunks';
import { ChunkWorker } from './chunkWorker';
import type { Stager } from './staging';
import { beyondFog, decide, type Reach } from './streaming';

// Keeps each loaded zone's chunks as world/streaming.ts decides from where
// you stand: full detail near you, stand-ins farther out, nothing past the
// fog. While you walk, each zone's worker builds the nearest chunks wanted, a
// few asked for at a time (CONFIG.streaming.inFlight), and the streamer
// uploads at most CONFIG.streaming.perFrame of what's come back a frame, each
// staged (uploaded unseen) for a frame before it takes over from what was
// there; dropping a chunk is free. A zone without a worker, or whose worker
// failed, has its chunks built here, as many a frame as are uploaded. Chunks
// past the fog's far edge are culled.

/** A zone whose chunks are streamed, the group they go in, and its worker, if it has one. */
interface Streamed {
  readonly source: ChunkSource;
  readonly root: Object3D;
  readonly worker: ChunkWorker | null;
}

/** How the arrays back from a worker are filed: by chunk and detail. */
const readyId = (key: ChunkKey, detail: Detail) => `${key} ${detail}`;

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
  /** Back from a worker, not yet uploaded. */
  private readonly ready = new Map<string, ChunkData>();
  /** What the last decision wanted, and where it stood. */
  private wanted = new Map<ChunkKey, Detail>();
  private at = { x: 0, z: 0 };

  constructor(
    private readonly stager: Stager,
    private readonly material: Material,
  ) {}

  /** Stream `source`'s chunks into `root`, built in its worker if it has one and workers run here. */
  add(source: ChunkSource, root: Object3D): void {
    const worker = ChunkWorker.open(source.worker?.bind(source), (data) => this.ready.set(readyId(data.key, data.detail), data));
    const zone = { source, root, worker };
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

  /** Is every zone's chunks built in a worker? */
  get offThread(): boolean {
    return [...new Set(this.owners.values())].every((z) => z.worker && !z.worker.failed);
  }

  /** Chunks still to build or change standing where the last update stood (being built in a worker, too), or staged and not yet shown. */
  get pending(): number {
    return this.changes(this.wanted).length + this.incoming.length;
  }

  /**
   * One frame, `eye` where you look from and `reach` the radii: show what was
   * staged last frame, drop what's no longer wanted, ask the workers for the
   * nearest that are, stage at most CONFIG.streaming.perFrame chunks (the
   * nearest of those back from a worker, or built here where there's none),
   * and cull what's past the fog's far edge. Unless `building` is false (the
   * outdoors hidden), when only the culling runs.
   */
  update(eye: Vector3, reach: Reach, building = true): void {
    this.takeIncoming();
    if (building) {
      this.plan(eye.x, eye.z, reach);
      let room = CONFIG.streaming.perFrame;
      for (const { key, detail } of this.changes(this.wanted)) {
        const zone = this.owners.get(key)!;
        const data = this.ready.get(readyId(key, detail));
        const { worker } = zone;
        if (data) {
          if (room > 0) {
            room--;
            this.upload(data, zone);
          }
        } else if (worker && !worker.failed) {
          worker.offer(key, detail);
        } else if (room > 0) {
          room--;
          this.upload(zone.source.build(key, detail), zone);
        }
      }
    }
    this.cull(eye, reach.far);
  }

  /**
   * Build everything wanted standing at (x, z) now, at once, rather than a
   * few a frame: on loading in, or waking somewhere else. Built here, but for
   * what's already back from a worker.
   */
  fill(x: number, z: number, reach: Reach): void {
    this.takeIncoming();
    this.plan(x, z, reach);
    for (const { key, detail } of this.changes(this.wanted)) {
      const zone = this.owners.get(key)!;
      this.show(this.mesh(this.ready.get(readyId(key, detail)) ?? zone.source.build(key, detail), zone));
    }
    this.ready.clear();
  }

  /** Decide what's wanted at (x, z), and drop what isn't, loaded or back from a worker. */
  private plan(x: number, z: number, reach: Reach): void {
    this.wanted = decide(x, z, this.keys, this.details, reach);
    this.at = { x, z };
    for (const [key, chunk] of this.loaded) if (!this.wanted.has(key)) this.drop(chunk);
    for (const [id, { key, detail }] of this.ready) {
      if (this.wanted.get(key) !== detail || this.details.get(key) === detail) this.ready.delete(id);
    }
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

  /** A chunk's mesh, in its zone's group: its arrays as they are, not copied. */
  private mesh(data: ChunkData, zone: Streamed): Chunk {
    const { key, detail } = data;
    const mesh = new Mesh(chunkGeometry(data), this.material);
    mesh.name = `chunk-${key}-${detail}`;
    mesh.matrixAutoUpdate = false;
    zone.root.add(mesh);
    return { key, detail, mesh, zone };
  }

  /** Stage a chunk to upload unseen at the next render, and show it the frame after. */
  private upload(data: ChunkData, zone: Streamed): void {
    this.ready.delete(readyId(data.key, data.detail));
    const chunk = this.mesh(data, zone);
    this.stager.stage(chunk.mesh, true);
    this.incoming.push(chunk);
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
