import { CONFIG } from '../config';
import type { AudioKit } from './sfx';

// The sounds that go on: the arena's drone, Oakvale's wind, and its places'
// water, fires and draught. Each is played by its name (as the one-shots in
// sfx.ts are), made of filtered noise and slow wobbles, no audio files. Each
// comes out about as loud as the arena's drone (RMS about 0.05); whoever
// plays it sets how loud it is where it plays.

/** Something playing that can be stopped. */
export interface Loop {
  stop(): void;
}

type Maker = (kit: AudioKit, into: AudioNode) => AudioScheduledSourceNode[];

/** The shared noise, looping from a random point. */
function noise(kit: AudioKit): AudioBufferSourceNode {
  const src = kit.ctx.createBufferSource();
  src.buffer = kit.noise;
  src.loop = true;
  return src;
}

function filter(kit: AudioKit, type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode {
  const f = kit.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function gain(kit: AudioKit, value: number): GainNode {
  const g = kit.ctx.createGain();
  g.gain.value = value;
  return g;
}

/** A slow sine that swings `param` by ±`depth` about where it's set. */
function wobble(kit: AudioKit, rate: number, depth: number, param: AudioParam): OscillatorNode {
  const o = kit.ctx.createOscillator();
  o.frequency.value = rate;
  o.connect(gain(kit, depth)).connect(param);
  return o;
}

/** Noise through `type` at `freq`, at `level`, into `into`; its level wobbling at `rate` by `depth` if given. */
function band(kit: AudioKit, into: AudioNode, type: BiquadFilterType, freq: number, q: number, level: number, rate = 0, depth = 0): AudioScheduledSourceNode[] {
  const src = noise(kit);
  const g = gain(kit, level);
  src.connect(filter(kit, type, freq, q)).connect(g).connect(into);
  return rate ? [src, wobble(kit, rate, depth, g.gain)] : [src];
}

const LOOPS = {
  /** The arena's drone: three low saws beating slowly, faded in over 4 s. */
  drone(kit, into) {
    const { ctx } = kit;
    const g = gain(kit, 0);
    g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 4);
    const lp = filter(kit, 'lowpass', 220);
    lp.connect(g).connect(into);
    return [55, 55.4, 82.6].map((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      return o;
    });
  },
  /** A light wind in the trees: a band of noise to each side, gusting slowly and out of step. */
  wind(kit, into) {
    const { band: mids, gust, depth } = CONFIG.sound.wind;
    const out: AudioScheduledSourceNode[] = [];
    [-0.6, 0.6].forEach((pan, i) => {
      const side = kit.ctx.createStereoPanner();
      side.pan.value = pan;
      side.connect(into);
      const f = filter(kit, 'bandpass', mids[i], 0.7);
      const g = gain(kit, 0.32);
      const src = noise(kit);
      src.connect(f).connect(g).connect(side);
      out.push(src, wobble(kit, gust[i], 0.32 * depth, g.gain), wobble(kit, gust[i] * 0.63, mids[i] * 0.35, f.frequency));
    });
    return out;
  },
  /** The stream running under the bridge: a broad rush, a low burble and a glinting top. */
  stream(kit, into) {
    return [
      ...band(kit, into, 'bandpass', 900, 0.5, 0.16),
      ...band(kit, into, 'lowpass', 260, 0.8, 0.35, 0.7, 0.14),
      ...band(kit, into, 'highpass', 3200, 0.7, 0.045, 1.3, 0.03),
    ];
  },
  /** The pond lapping at the dock's posts: low water rising and falling. */
  lapping(kit, into) {
    return [...band(kit, into, 'lowpass', 480, 1, 0.38, 0.33, 0.34), ...band(kit, into, 'bandpass', 1400, 1.5, 0.05, 0.41, 0.045)];
  },
  /** The forge's fire under the bellows: a deep roar, breathing. */
  forge(kit, into) {
    return [...band(kit, into, 'lowpass', 200, 1, 0.68, 0.22, 0.26), ...band(kit, into, 'bandpass', 700, 0.7, 0.05)];
  },
  /** The inn's hearth: a soft flame under its crackle (the crackle is `sfx.crackle`). */
  hearth(kit, into) {
    return [...band(kit, into, 'lowpass', 340, 0.8, 0.5, 0.5, 0.12), ...band(kit, into, 'bandpass', 1100, 0.6, 0.05, 2.3, 0.02)];
  },
  /** The lumber camp's open fire: as the hearth's, a little brighter in the air. */
  campfire(kit, into) {
    return [...band(kit, into, 'lowpass', 420, 0.8, 0.45, 0.6, 0.12), ...band(kit, into, 'bandpass', 1400, 0.6, 0.07, 2.9, 0.03)];
  },
  /** The cold draught out of the mine's mouth: a hollow moan over a low rumble. */
  draught(kit, into) {
    const src = noise(kit);
    const f = filter(kit, 'bandpass', 420, 5);
    src.connect(f).connect(gain(kit, 1.1)).connect(into);
    return [src, wobble(kit, 0.13, 110, f.frequency), ...band(kit, into, 'lowpass', 140, 0.8, 0.5, 0.09, 0.2)];
  },
} satisfies Record<string, Maker>;

/** The looping sounds, by name. */
export type LoopName = keyof typeof LOOPS;

/** Start the loop called `name` into `into` (which sets how loud it is), with the audio `kit`. */
export function startLoop(name: LoopName, kit: AudioKit, into: AudioNode): Loop {
  const sources = LOOPS[name](kit, into);
  const len = kit.noise.duration;
  for (const s of sources) {
    if (s instanceof AudioBufferSourceNode) s.start(0, Math.random() * len);
    else s.start();
  }
  return {
    stop() {
      for (const s of sources) s.stop();
    },
  };
}
