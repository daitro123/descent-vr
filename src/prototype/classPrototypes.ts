import type { Scene } from 'three';
import type { Game } from '../game';

// PROTOTYPE: `?arena&class=<name>` loads a class's throwaway kit over the
// warrior's arena (abilities map, `.scratch/abilities/`). Each is loaded only
// when asked for; an unknown class leaves the warrior as it is. `&gestures`
// adds the gesture prototype over whichever class it is. Once a class is
// built, `&class=<it>` plays it and its prototype moves aside: the ranger's is
// `&class=ranger-prototype` (abilities ticket 21), kept for Tom to compare.

export interface ClassPrototype {
  /** Once a frame, after the game's own update. */
  update(dt: number): void;
}

const PROTOTYPES: Record<string, () => Promise<(game: Game, scene: Scene) => ClassPrototype>> = {
  'ranger-prototype': async () => (await import('./ranger/rangerPrototype')).startRangerPrototype,
  mage: async () => (await import('./mage/mageKit.prototype')).startMagePrototype,
};

/**
 * `&gestures` (abilities ticket 07) lays gesture abilities over the class's
 * kit, or over the warrior's arena when the class has no prototype. It was
 * built over the class prototypes, so it keeps them under it: `&class=ranger&gestures`
 * is the gesture prototype over the ranger's prototype, as it always was.
 */
export async function loadClassPrototype(name: string | undefined, game: Game, scene: Scene, gestures = false): Promise<ClassPrototype | null> {
  const load = name ? (PROTOTYPES[name] ?? (gestures ? PROTOTYPES[`${name}-prototype`] : undefined)) : undefined;
  const kit = load ? (await load())(game, scene) : null;
  if (!gestures) return kit;
  const { startGesturePrototype } = await import('./gestures/gestureKit.prototype');
  return startGesturePrototype(game, scene, name ?? 'warrior', kit);
}
