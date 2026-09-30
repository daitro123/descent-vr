import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Sip } from '../src/player/sip';
import { Sharpen } from '../src/professions/sharpen';

// Using a whetstone and drinking held at the mouth, at their seams: points and
// distances in, what the rub or the sip did out
// (.scratch/professions/issues/17-using-what-professions-make.md).

const blade = { base: new Vector3(0, 1, 0), tip: new Vector3(0, 1, -0.8) };
const at = (z: number, off = 0.02) => new Vector3(off, 1, z);

describe('rubbing a whetstone along the blade', () => {
  it('sharpens it after half a metre along the edge, back and forth, with a scrape about every 12 cm', () => {
    const s = new Sharpen();
    const seen: string[] = [];
    // Strokes of 30 cm, down the blade and back, 1 cm a frame.
    for (let i = 0; i <= 60 && !seen.includes('done'); i++) seen.push(s.update(at(-0.1 - (i <= 30 ? i : 60 - i) * 0.01), blade));
    expect(seen.at(-1)).toBe('done');
    expect(s.travel).toBeCloseTo(0.5, 6);
    expect(seen.filter((r) => r === 'stroke').length).toBeGreaterThanOrEqual(3);
  });

  it('does nothing off the edge, or with no blade in the other hand', () => {
    const s = new Sharpen();
    for (let i = 0; i < 80; i++) expect(s.update(at(-0.1 - i * 0.01, 0.1), blade)).toBe('off');
    for (let i = 0; i < 80; i++) expect(s.update(at(-0.1 - i * 0.01), null)).toBe('off');
    expect(s.travel).toBe(0);
  });

  it("doesn't count a jump onto the edge, only rubbing along it", () => {
    const s = new Sharpen();
    s.update(at(-0.1), blade);
    s.update(at(-0.1, 0.2), blade);
    expect(s.update(at(-0.7), blade)).toBe('on');
    expect(s.travel).toBe(0);
  });

  it('starts again once reset', () => {
    const s = new Sharpen();
    for (let i = 0; i < 20; i++) s.update(at(-0.1 - i * 0.01), blade);
    s.reset();
    expect(s.travel).toBe(0);
  });
});

describe('drinking held at the mouth', () => {
  const frame = 1 / 72;

  it('drinks after 0.7 s at the mouth, buzzing steadily', () => {
    const sip = new Sip();
    let buzzes = 0;
    let n = 0;
    let got = 'away';
    while (got !== 'drunk' && n < 100) {
      got = sip.update(frame, 0.05, 0.2);
      if (sip.buzz) buzzes++;
      n++;
    }
    expect(got).toBe('drunk');
    expect(n * frame).toBeCloseTo(0.7, 1);
    expect(buzzes).toBeGreaterThanOrEqual(7);
  });

  it('cancels when pulled away early, and waits while the hand moves fast', () => {
    const sip = new Sip();
    expect(sip.update(frame, 0.3, 0)).toBe('away');
    for (let i = 0; i < 20; i++) sip.update(frame, 0.05, 0);
    for (let i = 0; i < 200; i++) expect(sip.update(frame, 0.05, 2)).toBe('sipping');
    expect(sip.update(frame, 0.3, 0)).toBe('cancelled');
    expect(sip.time).toBe(0);
  });
});
