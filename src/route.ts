import { CONFIG } from './config';

// What the page runs, read from its query string alone, so it's tested without
// a browser. The plain URL is the Adventure; the tools and the arena each have
// a flag, checked in the order they were added.

export type Route =
  /** `?inspect`: the model inspector. */
  | { kind: 'inspect' }
  /** `?fly` (every map) or `?fly=<id>`: the map viewer. */
  | { kind: 'fly'; map: string }
  /** `?map=<id>`: walk a map with no enemies and no save. */
  | { kind: 'walk'; map: string }
  /**
   * `?arena`: the wave game. `?duel`, `?wave=N` and `?showcase` alone open it too.
   * `&class=<name>` swaps the warrior for a class prototype (`src/prototype/`), when one exists.
   */
  | { kind: 'arena'; firstWave: number; duel: boolean; showcase: boolean; playerClass?: string }
  /** Anything else: Oakvale, with the save. `?newgame` asks to start over. */
  | { kind: 'adventure'; newGame: boolean };

export interface Page {
  route: Route;
  /** `?perf`: frame rate, draw calls, triangles and shader programs over whichever game runs. */
  perf: boolean;
  /** `?emulate` forces the IWER emulator and `?noemulate` rules it out; otherwise the browser is asked for a headset. */
  emulate: 'yes' | 'no' | 'ask';
  /** `?nodevui`: the emulator without its DevUI, so only code drives the poses. */
  devUI: boolean;
}

const ARENA_FLAGS = ['arena', 'duel', 'wave', 'showcase'];

/** The query string without `?newgame`, for the address once it's been answered. */
export function forgetNewGame(search: string): string {
  const rest = search.replace(/^\?/, '').split('&').filter((p) => p && p.split('=')[0] !== 'newgame');
  return rest.length ? `?${rest.join('&')}` : '';
}

export function readPage(search: string): Page {
  const params = new URLSearchParams(search);
  return {
    route: chooseRoute(params),
    perf: params.has('perf'),
    emulate: params.has('emulate') ? 'yes' : params.has('noemulate') ? 'no' : 'ask',
    devUI: !params.has('nodevui'),
  };
}

function chooseRoute(params: URLSearchParams): Route {
  if (params.has('inspect')) return { kind: 'inspect' };
  if (params.has('fly')) return { kind: 'fly', map: params.get('fly') ?? '' };
  if (params.has('map')) return { kind: 'walk', map: params.get('map') || 'forest' };
  if (ARENA_FLAGS.some((f) => params.has(f))) {
    const waves = CONFIG.waves.list.length;
    return {
      kind: 'arena',
      // ?wave=7 is the Warden.
      firstWave: Math.max(1, Math.min(waves, Math.floor(Number(params.get('wave'))) || 1)),
      duel: params.has('duel'),
      showcase: params.has('showcase'),
      playerClass: params.get('class') || undefined,
    };
  }
  return { kind: 'adventure', newGame: params.has('newgame') };
}
