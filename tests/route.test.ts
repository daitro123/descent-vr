import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { route } from '../src/route';

describe('the page route', () => {
  it('starts the Adventure at the plain URL, and for any flag it does not know', () => {
    expect(route('').route).toEqual({ kind: 'adventure' });
    expect(route('?').route).toEqual({ kind: 'adventure' });
    expect(route('?utm_source=quest').route).toEqual({ kind: 'adventure' });
    expect(route('?talk').route).toEqual({ kind: 'adventure' });
  });

  it('opens the arena at ?arena, as the plain URL did before', () => {
    expect(route('?arena').route).toEqual({ kind: 'arena', firstWave: 1, duel: false, showcase: false });
    expect(route('?arena&duel').route).toEqual({ kind: 'arena', firstWave: 1, duel: true, showcase: false });
    expect(route('?arena&wave=3&showcase').route).toEqual({ kind: 'arena', firstWave: 3, duel: false, showcase: true });
  });

  it("opens the arena for its own flags alone, so old links keep working", () => {
    expect(route('?duel').route).toMatchObject({ kind: 'arena', duel: true });
    expect(route('?wave=7').route).toMatchObject({ kind: 'arena', firstWave: 7 });
    expect(route('?showcase').route).toMatchObject({ kind: 'arena', showcase: true });
  });

  it('keeps the first wave within the waves there are', () => {
    const last = CONFIG.waves.list.length;
    expect(route('?wave=0').route).toMatchObject({ firstWave: 1 });
    expect(route('?wave=-4').route).toMatchObject({ firstWave: 1 });
    expect(route('?wave=banana').route).toMatchObject({ firstWave: 1 });
    expect(route(`?wave=${last + 5}`).route).toMatchObject({ firstWave: last });
  });

  it('opens the tools as before, ahead of any game', () => {
    expect(route('?inspect').route).toEqual({ kind: 'inspect' });
    expect(route('?inspect&arena').route).toEqual({ kind: 'inspect' });
    expect(route('?fly').route).toEqual({ kind: 'fly', map: '' });
    expect(route('?fly=crypt').route).toEqual({ kind: 'fly', map: 'crypt' });
    expect(route('?fly&map=forest').route).toEqual({ kind: 'fly', map: '' });
    expect(route('?map=crypt').route).toEqual({ kind: 'walk', map: 'crypt' });
    expect(route('?map').route).toEqual({ kind: 'walk', map: 'forest' });
    expect(route('?map=forest&arena').route).toEqual({ kind: 'walk', map: 'forest' });
  });

  it('reads ?perf over whichever game runs', () => {
    expect(route('').perf).toBe(false);
    expect(route('?perf')).toMatchObject({ route: { kind: 'adventure' }, perf: true });
    expect(route('?arena&perf')).toMatchObject({ route: { kind: 'arena' }, perf: true });
    expect(route('?wave=7&perf')).toMatchObject({ route: { kind: 'arena', firstWave: 7 }, perf: true });
  });

  it('reads the emulator flags as before', () => {
    expect(route('')).toMatchObject({ emulate: 'ask', devUI: true });
    expect(route('?emulate')).toMatchObject({ emulate: 'yes', devUI: true });
    expect(route('?noemulate')).toMatchObject({ emulate: 'no' });
    expect(route('?arena&emulate&nodevui')).toMatchObject({ route: { kind: 'arena' }, emulate: 'yes', devUI: false });
  });

  it('accepts a query string with or without its question mark', () => {
    expect(route('arena&duel')).toEqual(route('?arena&duel'));
  });
});
