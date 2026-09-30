import type { Scene } from 'three';
import type { Game } from '../game';

// PROTOTYPE: `?arena&class=<name>` loads a class's throwaway kit over the
// warrior's arena (abilities map, `.scratch/abilities/`) until that class is
// built. Each is loaded only when asked for; an unknown class leaves the
// warrior as it is. `&gestures` adds the gesture prototype over whichever
// class it is. Built classes' prototypes are kept in the code for Tom to
// compare: the ranger's at `&class=ranger-prototype` (abilities ticket 21),
// the mage's (`src/prototype/mage/`, ticket 23) no longer loaded by any flag.

export interface ClassPrototype {
  /** Once a frame, after the game's own update. */
  update(dt: number): void;
}

const PROTOTYPES: Record<string, () => Promise<(game: Game, scene: Scene) => ClassPrototype>> = {
  'ranger-prototype': async () => (await import('./ranger/rangerPrototype')).startRangerPrototype,
};

/**
 * `&gestures` (abilities ticket 07) lays gesture abilities over the class's
 * kit (`name`, a prototype's), or over the built class you play (`played`).
 */
export async function loadClassPrototype(name: string | undefined, game: Game, scene: Scene, gestures = false, played = name): Promise<ClassPrototype | null> {
  const load = name ? PROTOTYPES[name] : undefined;
  const kit = load ? (await load())(game, scene) : null;
  if (!gestures) return kit;
  const { startGesturePrototype } = await import('./gestures/gestureKit.prototype');
  return startGesturePrototype(game, scene, played ?? 'warrior', kit);
}
