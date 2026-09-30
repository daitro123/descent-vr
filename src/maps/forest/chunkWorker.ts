import { type ChunkServerScope, serveChunks } from '../../world/chunkWorker';
import { oakvaleBuilder } from './chunks';

// Oakvale's chunk worker: plans Oakvale as soon as it starts, then builds
// whichever chunk the streamer asks for, as the main thread would.

serveChunks(self as unknown as ChunkServerScope, oakvaleBuilder());
