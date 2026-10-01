import { type ChunkServerScope, serveChunks } from '../../world/chunkWorker';
import { aldhavenBuilder } from './chunks';

// Aldhaven's chunk worker: plans the city as soon as it starts, then builds
// whichever chunk the streamer asks for, as the main thread would.

serveChunks(self as unknown as ChunkServerScope, aldhavenBuilder());
