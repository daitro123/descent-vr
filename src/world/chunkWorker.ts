import type { ChunkData, ChunkKey, Detail } from './chunks';

// Building a zone's chunks off the main thread. A zone's worker module runs
// `serveChunks` with its own chunk builder (and its own plan, made afresh:
// plans are pure, so its chunks come out byte for byte the main thread's).
// The streamer talks to it through a `ChunkWorker`, asking for a chunk at a
// time; each comes back with its arrays transferred, not copied.

/** Build chunk `key` at `detail`; `id` comes back with it. */
export interface ChunkRequest {
  readonly id: number;
  readonly key: ChunkKey;
  readonly detail: Detail;
}

/** A chunk built, or why it couldn't be. */
export type ChunkReply = { readonly id: number; readonly data: ChunkData } | { readonly id: number; readonly error: string };

/** A worker's side of the conversation: `self` inside the worker. */
export interface ChunkServerScope {
  onmessage: ((e: { data: ChunkRequest }) => void) | null;
  postMessage(reply: ChunkReply, transfer: Transferable[]): void;
}

/** The buffers behind a chunk's arrays, handed over whole with it. */
export function transferables(data: ChunkData): ArrayBuffer[] {
  return [data.position, data.normal, data.color, data.fx, data.uv].map((a) => a.buffer as ArrayBuffer);
}

/** Answer each request `scope` gets with `build`'s chunk, its arrays transferred. */
export function serveChunks(scope: ChunkServerScope, build: (key: ChunkKey, detail: Detail) => ChunkData): void {
  scope.onmessage = ({ data: { id, key, detail } }) => {
    let data: ChunkData;
    try {
      data = build(key, detail);
    } catch (e) {
      scope.postMessage({ id, error: String(e) }, []);
      return;
    }
    scope.postMessage({ id, data }, transferables(data));
  };
}

/** What the streamer needs of a Worker: a stand-in in tests. */
export type ChunkPort = Pick<Worker, 'postMessage' | 'terminate'> & {
  onmessage: ((e: MessageEvent<ChunkReply>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
};

/**
 * The streamer's side: asks one zone's worker for chunks and hands each to
 * `arrive` as it comes back. If the worker fails it's shut, `failed` says so,
 * and what was asked of it is forgotten, for the main thread to build.
 */
export class ChunkWorker {
  private readonly asked = new Map<number, { readonly key: ChunkKey; readonly detail: Detail }>();
  private next = 0;
  private broken = false;

  constructor(
    private readonly port: ChunkPort,
    private readonly arrive: (data: ChunkData) => void,
  ) {
    port.onmessage = ({ data: reply }) => {
      if (!this.asked.delete(reply.id)) return;
      if ('error' in reply) this.fail(reply.error);
      else this.arrive(reply.data);
    };
    port.onerror = (e) => this.fail(e.message);
  }

  /** A worker from `open`, or null where there's none to be had (the zone has none, or there are no workers here). */
  static open(open: (() => ChunkPort) | undefined, arrive: (data: ChunkData) => void): ChunkWorker | null {
    if (!open) return null;
    try {
      return new ChunkWorker(open(), arrive);
    } catch (e) {
      // Where there's no Worker at all (the tests), quietly.
      if (typeof Worker !== 'undefined') console.warn('Building chunks on the main thread: no worker', e);
      return null;
    }
  }

  /** Has it failed, so the main thread must build? */
  get failed(): boolean {
    return this.broken;
  }

  /** How many chunks it's building, or has been asked for. */
  get inFlight(): number {
    return this.asked.size;
  }

  /** Has it been asked for `key` at `detail`, and not answered yet? */
  has(key: ChunkKey, detail: Detail): boolean {
    for (const a of this.asked.values()) if (a.key === key && a.detail === detail) return true;
    return false;
  }

  request(key: ChunkKey, detail: Detail): void {
    const id = this.next++;
    this.asked.set(id, { key, detail });
    this.port.postMessage({ id, key, detail } satisfies ChunkRequest);
  }

  private fail(why: string): void {
    if (this.broken) return;
    console.warn('Building chunks on the main thread: the worker failed', why);
    this.broken = true;
    this.asked.clear();
    this.port.terminate();
  }
}
