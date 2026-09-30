import type { Vector3 } from 'three';
import { audio } from '../../../fx/sfx';

// PROTOTYPE (?proto=pick): the gathering sounds, synthesised like fx/sfx.ts's.
// Throwaway: the winner's sounds become entries in `sfx`.

function out(at?: Vector3): AudioNode | null {
  const kit = audio();
  if (!kit) return null;
  if (!at) return kit.master;
  const p = (kit.ctx as AudioContext).createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = 1.2;
  p.positionX.value = at.x;
  p.positionY.value = at.y;
  p.positionZ.value = at.z;
  p.connect(kit.master);
  return p;
}

function tone(f: number, end: number, dur: number, type: OscillatorType, gain: number, at?: Vector3, delay = 0): void {
  const kit = audio();
  const dest = out(at);
  if (!kit || !dest) return;
  const t = kit.ctx.currentTime + delay;
  const osc = kit.ctx.createOscillator();
  const g = kit.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, gain: number, freq: number, at?: Vector3, type: BiquadFilterType = 'lowpass', delay = 0, q = 1): void {
  const kit = audio();
  const dest = out(at);
  if (!kit || !dest) return;
  const t = kit.ctx.currentTime + delay;
  const src = kit.ctx.createBufferSource();
  src.buffer = kit.noise;
  src.loop = true;
  const filter = kit.ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = kit.ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(dest);
  src.start(t, Math.random() * 3);
  src.stop(t + dur + 0.02);
}

export const gatherSfx = {
  /** The pick too slow to count: a dull little clink. */
  tap(at: Vector3) {
    tone(1300, 1200, 0.05, 'triangle', 0.05, at);
    noise(0.03, 0.12, 2500, at, 'bandpass', 0, 2);
  },
  /** A good strike on the ore: a clank whose ring grows with the swing's power (0 to 1). */
  strike(at: Vector3, power: number) {
    const p = 0.97 + Math.random() * 0.06;
    noise(0.07, 0.35 + 0.3 * power, 2200, at, 'bandpass', 0, 1.2);
    tone(170, 90, 0.12, 'square', 0.1 + 0.1 * power, at);
    for (const [f, g, d] of [[980, 0.08, 0.35], [1470, 0.05, 0.25], [2210, 0.03, 0.18]] as const) {
      tone(f * p, f * p * 0.99, d * (0.6 + 0.6 * power), 'sine', g * (0.5 + power), at);
    }
  },
  /** A strike in the glint: a bright, long ring over the clank. */
  glint(at: Vector3) {
    noise(0.08, 0.6, 2400, at, 'bandpass', 0, 1.2);
    tone(180, 90, 0.14, 'square', 0.2, at);
    for (const [f, g, d] of [[1180, 0.14, 0.9], [1770, 0.09, 0.7], [2650, 0.06, 0.5], [3540, 0.04, 0.4]] as const) {
      tone(f, f * 0.995, d, 'sine', g, at);
    }
    tone(1760, 1760, 0.5, 'sine', 0.06, undefined, 0.05);
  },
  /** Hot, but on bare stone: a thunk and grit, no ring. */
  stone(at: Vector3) {
    noise(0.12, 0.4, 600, at);
    tone(160, 80, 0.1, 'square', 0.08, at);
  },
  /** The vein gives: a crunch and stones tumbling. */
  crack(at: Vector3) {
    noise(0.35, 0.7, 700, at);
    tone(90, 40, 0.4, 'sine', 0.4, at);
    for (let i = 0; i < 7; i++) noise(0.05, 0.3, 1200 + Math.random() * 1500, at, 'bandpass', 0.08 + Math.random() * 0.45, 4);
  },
  /** Leaves brushed by a slow knife or hand. */
  rustle(at: Vector3) {
    noise(0.18, 0.12, 3800, at, 'bandpass', 0, 0.8);
  },
  /** A knife through leaves or stems: a quick, bright snick. */
  slice(at: Vector3, stems: boolean) {
    noise(0.07, 0.35, stems ? 4200 : 5600, at, 'highpass');
    if (stems) tone(700, 300, 0.06, 'triangle', 0.08, at);
  },
  /** A root holding on while you pull. */
  strain(at: Vector3, k: number) {
    noise(0.1, 0.08 + 0.12 * k, 500 + 500 * k, at, 'bandpass', 0, 3);
  },
  /** The root comes free. */
  pop(at: Vector3) {
    noise(0.15, 0.5, 900, at);
    tone(320, 120, 0.1, 'sine', 0.3, at);
    noise(0.25, 0.2, 400, at, 'lowpass', 0.05);
  },
  /** Into the bag. */
  bag() {
    noise(0.08, 0.2, 1600, undefined, 'bandpass', 0, 1.5);
    tone(520, 1040, 0.14, 'sine', 0.12, undefined, 0.03);
  },
  /** A tool drawn from or hung on the loop. */
  draw(on: boolean) {
    noise(0.06, 0.2, 3000, undefined, 'bandpass', 0, 2);
    tone(on ? 600 : 800, on ? 900 : 500, 0.08, 'triangle', 0.06);
  },
  /** The loop has nothing to give here. */
  nothing() {
    tone(220, 200, 0.12, 'square', 0.05);
  },
  /** The vein or the clump grows back. */
  refill(at: Vector3) {
    noise(0.4, 0.12, 500, at);
  },
};
