import type { Vector3 } from 'three';
import { audio } from '../../../fx/sfx';

// PROTOTYPE (Brewing at the alchemy table): the table's few sounds, synthesised
// like src/fx/sfx.ts's, each at a point in the room. Throwaway.

function out(at?: Vector3): AudioNode | null {
  const kit = audio();
  if (!kit) return null;
  if (!at) return kit.master;
  const p = kit.ctx.createPanner();
  p.panningModel = 'HRTF';
  p.refDistance = 0.8;
  p.positionX.value = at.x;
  p.positionY.value = at.y;
  p.positionZ.value = at.z;
  p.connect(kit.master);
  return p;
}

function tone(from: number, to: number, dur: number, type: OscillatorType, gain: number, at?: Vector3, delay = 0): void {
  const kit = audio();
  const dest = out(at);
  if (!kit || !dest) return;
  const t = kit.ctx.currentTime + delay;
  const osc = kit.ctx.createOscillator();
  const g = kit.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function hiss(dur: number, gain: number, freq: number, at?: Vector3, type: BiquadFilterType = 'lowpass', q = 1, delay = 0): void {
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

export const brewSfx = {
  /** A leaf let go into the mortar or the pot. */
  leaf(at: Vector3) {
    hiss(0.12, 0.18, 1400, at, 'bandpass', 1.5);
  },
  /** Stone on leaf, each half turn of the pestle. */
  crunch(at: Vector3) {
    hiss(0.07, 0.4, 1500 + Math.random() * 600, at, 'bandpass', 2.5);
    hiss(0.05, 0.25, 3200, at, 'bandpass', 4, 0.03);
  },
  /** The pestle brought down hard. */
  pound(at: Vector3) {
    tone(170, 80, 0.1, 'triangle', 0.25, at);
    hiss(0.06, 0.35, 1200, at, 'bandpass', 2);
  },
  /** Ground powder pouring out. */
  powder(at: Vector3) {
    hiss(0.35, 0.18, 900, at, 'lowpass');
  },
  /** The spoon through the brew, each half turn. */
  slosh(at: Vector3) {
    hiss(0.28, 0.22, 520, at, 'bandpass', 1.4);
    tone(240, 180, 0.12, 'sine', 0.05, at);
  },
  bubble(at: Vector3) {
    tone(380 + Math.random() * 200, 900, 0.06, 'sine', 0.05, at);
  },
  /** A little of the brew running into the flask. */
  trickle(at: Vector3) {
    hiss(0.14, 0.12, 1700 + Math.random() * 500, at, 'bandpass', 3);
  },
  /** The brew turns: a soft puff and a rising chime. */
  turn(at: Vector3) {
    hiss(0.5, 0.25, 700, at);
    tone(660, 990, 0.35, 'sine', 0.12, at);
    tone(990, 1320, 0.4, 'sine', 0.08, at, 0.12);
  },
  /** The flask full: the cork goes in. */
  cork(at: Vector3) {
    tone(720, 300, 0.06, 'square', 0.1, at);
    tone(880, 1760, 0.5, 'sine', 0.1, at, 0.08);
  },
  /** An auto step moving a tool through the air. */
  swish(at: Vector3) {
    hiss(0.25, 0.12, 900, at, 'bandpass', 0.8);
  },
  /** A flask slotted into the belt. */
  belt() {
    tone(300, 220, 0.08, 'triangle', 0.15);
    hiss(0.08, 0.15, 800);
  },
  gulp() {
    for (let i = 0; i < 3; i++) tone(190, 120, 0.13, 'sine', 0.3, undefined, i * 0.2);
    tone(520, 1040, 0.5, 'sine', 0.08, undefined, 0.65);
  },
  nope() {
    tone(210, 160, 0.16, 'triangle', 0.14);
  },
};
