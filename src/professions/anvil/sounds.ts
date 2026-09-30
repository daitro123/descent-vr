import type { Vector3 } from 'three';
import { audio } from '../../fx/sfx';

// The anvil's sounds, synthesised like fx/sfx.ts's: the ring of a strike by
// how good it was, a tap's clink, stone cracking, the quench's hiss, the
// crucible's bubble and the chime of something made. Promoted from
// ?proto=anvil (prototypes/anvil/sounds.ts, which keeps its own copy).

function out(at?: Vector3): AudioNode | null {
  const kit = audio();
  if (!kit) return null;
  if (!at) return kit.master;
  const p = kit.ctx.createPanner();
  p.panningModel = 'HRTF';
  p.refDistance = 1.2;
  p.positionX.value = at.x;
  p.positionY.value = at.y;
  p.positionZ.value = at.z;
  p.connect(kit.master);
  return p;
}

function tone(f: number, f2: number, dur: number, type: OscillatorType, gain: number, at?: Vector3, delay = 0): void {
  const kit = audio();
  const dest = out(at);
  if (!kit || !dest) return;
  const t = kit.ctx.currentTime + delay;
  const osc = kit.ctx.createOscillator();
  const g = kit.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, gain: number, freq: number, type: BiquadFilterType, at?: Vector3, delay = 0, q = 1, fade = true): void {
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
  g.gain.setValueAtTime(fade ? gain : 0.0001, t);
  if (!fade) g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(dest);
  src.start(t, Math.random() * 3);
  src.stop(t + dur + 0.02);
}

/** Hammer on hot metal, by how good the strike was (0 a weak one to 1 a great one): brighter and longer the better. */
export function ring(at: Vector3, quality: number): void {
  const p = 0.96 + Math.random() * 0.06 + quality * 0.12;
  noise(0.05, 0.35 + quality * 0.3, 2600, 'bandpass', at, 0, 1.2);
  const g = 0.35 + quality * 0.65;
  for (const [f, gain, d] of [[1180, 0.12, 0.9], [1745, 0.07, 0.7], [2630, 0.05, 0.5], [3540, 0.03, 0.35]] as const) {
    tone(f * p, f * p * 0.995, d * (0.5 + quality * 0.6), 'sine', gain * g, at);
  }
  if (quality >= 1) tone(4700 * p, 4650 * p, 0.3, 'sine', 0.04, at, 0.01);
}

/** A tap, or a strike on cold metal: a dull clink, no ring. */
export function clink(at: Vector3): void {
  noise(0.04, 0.3, 1400, 'bandpass', at, 0, 2);
  tone(620, 480, 0.08, 'triangle', 0.08, at);
}

/** Stone under the hammer: a dry crack and grit. */
export function crack(at: Vector3, quality: number): void {
  noise(0.07, 0.4 + quality * 0.3, 900 + quality * 700, 'bandpass', at, 0, 1.4);
  noise(0.18, 0.15, 3000, 'highpass', at, 0.03);
  tone(260 + quality * 90, 140, 0.1, 'triangle', 0.12, at);
}

/** Red-hot metal into water: a long hiss that swells then fades. */
export function hiss(at: Vector3): void {
  noise(1.3, 0.45, 5200, 'highpass', at, 0, 0.8, false);
  noise(0.5, 0.25, 700, 'lowpass', at, 0);
}

/** Something made: a rising two-note chime. */
export function made(): void {
  tone(660, 660, 0.35, 'triangle', 0.12);
  tone(990, 990, 0.6, 'triangle', 0.12, undefined, 0.12);
}

/** Ore melting in the crucible: a slow bubble. */
export function bubble(at: Vector3): void {
  const f = 180 + Math.random() * 120;
  tone(f, f * 1.8, 0.09, 'sine', 0.12, at);
}

/** Not that: a low buzz. */
export function nope(): void {
  tone(150, 120, 0.14, 'square', 0.05);
}
