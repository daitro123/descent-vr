import type { Scene } from 'three';
import type { Game } from '../game';

// PROTOTYPE: `?arena&class=<name>-prototype` loads a class's throwaway kit
// over the warrior's arena (abilities map, `.scratch/abilities/`). Both
// classes are built now; their prototypes are kept for Tom to compare
// (abilities ticket 27): the ranger's at `&class=ranger-prototype`
// (`&variant=ward|knife|kite`), the mage's at `&class=mage-prototype`
// (`&kit=A|B|C`). Each is loaded only when asked for, and takes the warrior's
// sword, shield and abilities away, so nothing of the game's own kit (the
// War Cry, the gestures) fires under it. `&gestures` adds the gesture
// prototype over whichever class it is, and the game's gestures stand aside.

export interface ClassPrototype {
  /** Once a frame, after the game's own update. */
  update(dt: number): void;
}

const PROTOTYPES: Record<string, () => Promise<(game: Game, scene: Scene) => ClassPrototype>> = {
  'ranger-prototype': async () => (await import('./ranger/rangerPrototype')).startRangerPrototype,
  'mage-prototype': async () => (await import('./mage/mageKit.prototype')).startMagePrototype,
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
