import { type ChunkServerScope, serveChunks } from '../../world/chunkWorker';
import { moorBuilder } from './chunks';

// Brackenmoor's chunk worker: plans the moor as soon as it starts (against
// Oakvale's crest, which it plans too), then builds whichever chunk the
// streamer asks for, as the main thread would.

serveChunks(self as unknown as ChunkServerScope, moorBuilder());
