import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { forgetNewGame, readPage } from '../src/route';

describe('reading the page from its URL', () => {
  it('starts the Adventure at the plain URL, and for any flag it does not know', () => {
    expect(readPage('').route).toEqual({ kind: 'adventure', newGame: false });
    expect(readPage('?').route).toEqual({ kind: 'adventure', newGame: false });
    expect(readPage('?utm_source=quest').route).toEqual({ kind: 'adventure', newGame: false });
    expect(readPage('?talk').route).toEqual({ kind: 'adventure', newGame: false });
  });

  it('asks to start the Adventure over at ?newgame, and nowhere else', () => {
    expect(readPage('?newgame').route).toEqual({ kind: 'adventure', newGame: true });
    expect(readPage('?newgame&perf').route).toEqual({ kind: 'adventure', newGame: true });
    // The arena and walking a map never touch the save.
    expect(readPage('?arena&newgame').route).toMatchObject({ kind: 'arena' });
    expect(readPage('?map=forest&newgame').route).toEqual({ kind: 'walk', map: 'forest' });
  });

  it('opens the arena at ?arena, as the plain URL did before', () => {
    expect(readPage('?arena').route).toEqual({ kind: 'arena', firstWave: 1, duel: false, showcase: false });
    expect(readPage('?arena&duel').route).toEqual({ kind: 'arena', firstWave: 1, duel: true, showcase: false });
    expect(readPage('?arena&wave=3&showcase').route).toEqual({ kind: 'arena', firstWave: 3, duel: false, showcase: true });
  });

  it("opens the arena for its own flags alone, so old links keep working", () => {
    expect(readPage('?duel').route).toMatchObject({ kind: 'arena', duel: true });
    expect(readPage('?wave=7').route).toMatchObject({ kind: 'arena', firstWave: 7 });
    expect(readPage('?showcase').route).toMatchObject({ kind: 'arena', showcase: true });
  });

  it('keeps the first wave within the waves there are', () => {
    const last = CONFIG.waves.list.length;
    expect(readPage('?wave=0').route).toMatchObject({ firstWave: 1 });
    expect(readPage('?wave=-4').route).toMatchObject({ firstWave: 1 });
    expect(readPage('?wave=banana').route).toMatchObject({ firstWave: 1 });
    expect(readPage(`?wave=${last + 5}`).route).toMatchObject({ firstWave: last });
  });

  it('opens the tools as before, ahead of any game', () => {
    expect(readPage('?inspect').route).toEqual({ kind: 'inspect' });
    expect(readPage('?inspect&arena').route).toEqual({ kind: 'inspect' });
    expect(readPage('?fly').route).toEqual({ kind: 'fly', map: '' });
    expect(readPage('?fly=crypt').route).toEqual({ kind: 'fly', map: 'crypt' });
    expect(readPage('?fly&map=forest').route).toEqual({ kind: 'fly', map: '' });
    expect(readPage('?map=crypt').route).toEqual({ kind: 'walk', map: 'crypt' });
    expect(readPage('?map').route).toEqual({ kind: 'walk', map: 'forest' });
    expect(readPage('?map=forest&arena').route).toEqual({ kind: 'walk', map: 'forest' });
  });

  it('forgets ?newgame once answered, keeping every other flag as it was written', () => {
    expect(forgetNewGame('?newgame')).toBe('');
    expect(forgetNewGame('?newgame&emulate&nodevui')).toBe('?emulate&nodevui');
    expect(forgetNewGame('?perf&newgame=1')).toBe('?perf');
    expect(forgetNewGame('')).toBe('');
  });

  it('reads ?perf over whichever game runs', () => {
    expect(readPage('').perf).toBe(false);
    expect(readPage('?perf')).toMatchObject({ route: { kind: 'adventure' }, perf: true });
    expect(readPage('?arena&perf')).toMatchObject({ route: { kind: 'arena' }, perf: true });
    expect(readPage('?wave=7&perf')).toMatchObject({ route: { kind: 'arena', firstWave: 7 }, perf: true });
  });

  it('reads the emulator flags as before', () => {
    expect(readPage('')).toMatchObject({ emulate: 'ask', devUI: true });
    expect(readPage('?emulate')).toMatchObject({ emulate: 'yes', devUI: true });
    expect(readPage('?noemulate')).toMatchObject({ emulate: 'no' });
    expect(readPage('?arena&emulate&nodevui')).toMatchObject({ route: { kind: 'arena' }, emulate: 'yes', devUI: false });
  });

  it('accepts a query string with or without its question mark', () => {
    expect(readPage('arena&duel')).toEqual(readPage('?arena&duel'));
  });
});
