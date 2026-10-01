import { type ChunkServerScope, serveChunks } from '../../world/chunkWorker';
import { sallowsBuilder } from './chunks';

// The Sallows' chunk worker: plans the fens as soon as it starts, then
// builds whichever chunk the streamer asks for, as the main thread would.

serveChunks(self as unknown as ChunkServerScope, sallowsBuilder());
