import type { Scene } from 'three';
import type { Game } from '../game';

// PROTOTYPE: `?arena&class=<name>` loads a class's throwaway kit over the
// warrior's arena (abilities map, `.scratch/abilities/`). Each is loaded only
// when asked for; an unknown class leaves the warrior as it is.

export interface ClassPrototype {
  /** Once a frame, after the game's own update. */
  update(dt: number): void;
}

const PROTOTYPES: Record<string, () => Promise<(game: Game, scene: Scene) => ClassPrototype>> = {
  ranger: async () => (await import('./ranger/rangerPrototype')).startRangerPrototype,
};

export async function loadClassPrototype(name: string, game: Game, scene: Scene): Promise<ClassPrototype | null> {
  const load = PROTOTYPES[name];
  return load ? (await load())(game, scene) : null;
}
