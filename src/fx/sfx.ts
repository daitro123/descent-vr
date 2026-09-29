import { type Object3D, Quaternion, Vector3 } from 'three';

// Synthesised placeholder sounds — no assets, but audio feedback matters a
// lot for how melee feels, so the white box should have *something*.
//
// Sounds with a position are spatialised (HRTF), which in a headset is how you
// notice the archer drawing behind you. Player-centric sounds are left dry.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let drone: { stop(): void } | null = null;

export function unlockAudio(): void {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

const _p = new Vector3();
const _f = new Vector3();
const _u = new Vector3();
const _q = new Quaternion();

/** Keep the listener on the player's head. Call once per frame. */
export function updateListener(head: Object3D): void {
  if (!ctx) return;
  const l = ctx.listener;
  head.getWorldPosition(_p);
  head.getWorldDirection(_f).negate(); // cameras look down -Z
  _u.set(0, 1, 0).applyQuaternion(head.getWorldQuaternion(_q));
  if (l.positionX) {
    const t = ctx.currentTime;
    l.positionX.setValueAtTime(_p.x, t);
    l.positionY.setValueAtTime(_p.y, t);
    l.positionZ.setValueAtTime(_p.z, t);
    l.forwardX.setValueAtTime(_f.x, t);
    l.forwardY.setValueAtTime(_f.y, t);
    l.forwardZ.setValueAtTime(_f.z, t);
    l.upX.setValueAtTime(_u.x, t);
    l.upY.setValueAtTime(_u.y, t);
    l.upZ.setValueAtTime(_u.z, t);
  } else {
    l.setPosition(_p.x, _p.y, _p.z);
    l.setOrientation(_f.x, _f.y, _f.z, _u.x, _u.y, _u.z);
  }
}

/** Where a sound goes: through an HRTF panner at `at`, or straight out. */
function output(at?: Vector3): AudioNode {
  if (!at) return master!;
  const p = ctx!.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = 1.2;
  p.rolloffFactor = 1.1;
  p.positionX.value = at.x;
  p.positionY.value = at.y;
  p.positionZ.value = at.z;
  p.connect(master!);
  return p;
}

function tone(freq: number, endFreq: number, dur: number, type: OscillatorType, gain: number, at?: Vector3, delay = 0): void {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(output(at));
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, gain: number, freq: number, at?: Vector3, type: BiquadFilterType = 'lowpass', delay = 0, q = 1): void {
  if (!ctx || !noiseBuf) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(output(at));
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

/** A dry skeletal clatter: a handful of short clicks. */
function rattle(at: Vector3 | undefined, count: number, spread: number, gain: number): void {
  for (let i = 0; i < count; i++) {
    noise(0.03, gain, 2200 + Math.random() * 1800, at, 'bandpass', Math.random() * spread, 6);
  }
}

export const sfx = {
  hit(crit: boolean, at?: Vector3) {
    noise(0.12, 0.5, 1800, at);
    tone(crit ? 220 : 160, 60, 0.15, 'square', 0.15, at);
    rattle(at, 3, 0.08, 0.25);
  },
  block(at?: Vector3) {
    tone(900, 700, 0.25, 'triangle', 0.2, at);
    noise(0.08, 0.3, 5000, at);
    tone(180, 120, 0.12, 'sine', 0.3); // the thud through the arm
  },
  parry() {
    tone(1400, 1100, 0.45, 'triangle', 0.25);
    tone(700, 690, 0.45, 'sine', 0.15);
    tone(2100, 1900, 0.3, 'sine', 0.08);
  },
  /** Blade meets blade. */
  clash(at?: Vector3) {
    tone(1800, 1500, 0.3, 'triangle', 0.18, at);
    tone(2600, 2400, 0.2, 'sine', 0.08, at);
    noise(0.05, 0.3, 6000, at, 'highpass');
  },
  guardBreak() {
    tone(160, 60, 0.35, 'sawtooth', 0.25);
    noise(0.25, 0.5, 900);
  },
  hurt() {
    tone(200, 80, 0.3, 'sawtooth', 0.2);
  },
  /** An enemy falls: bones clatter apart, or a body (`bones` false) thuds to the ground. */
  death(at?: Vector3, { big = false, bones = true } = {}) {
    tone(big ? 120 : 300, 40, big ? 1.2 : 0.5, 'square', 0.12, at);
    if (bones) rattle(at, big ? 18 : 10, big ? 0.9 : 0.45, 0.35);
    else noise(0.3, 0.45, 220, at, 'lowpass', big ? 0.75 : 0.6);
  },
  /** Enemy wind-up cue: rising for blockable, a low growl for unblockable. */
  windup(at: Vector3, blockable: boolean) {
    if (blockable) tone(220, 330, 0.25, 'triangle', 0.08, at);
    else {
      tone(70, 55, 0.7, 'sawtooth', 0.18, at);
      noise(0.6, 0.15, 400, at);
    }
  },
  whoosh(at?: Vector3) {
    noise(0.18, 0.25, 900, at, 'bandpass', 0, 0.7);
  },
  arrowLoose(at: Vector3) {
    tone(140, 90, 0.12, 'triangle', 0.2, at);
    noise(0.15, 0.2, 2500, at, 'bandpass', 0.02, 2);
  },
  arrowThunk(at?: Vector3) {
    noise(0.06, 0.4, 700, at);
    tone(300, 150, 0.08, 'square', 0.1, at);
  },
  bash(at?: Vector3) {
    tone(110, 50, 0.2, 'square', 0.25, at);
    noise(0.12, 0.5, 700, at);
  },
  slam(at: Vector3) {
    tone(60, 30, 0.8, 'sine', 0.5, at);
    noise(0.7, 0.6, 350, at);
  },
  groundSlam(at: Vector3) {
    tone(80, 30, 0.7, 'sine', 0.55, at);
    noise(0.5, 0.6, 500, at);
    tone(400, 100, 0.3, 'square', 0.1, at);
  },
  warCry() {
    tone(90, 40, 0.6, 'sawtooth', 0.3);
    noise(0.5, 0.4, 600);
  },
  dash() {
    noise(0.16, 0.2, 1200, undefined, 'bandpass', 0, 0.6);
  },
  summon(at: Vector3) {
    tone(80, 160, 1.2, 'sawtooth', 0.12, at);
    tone(120, 240, 1.2, 'sine', 0.12, at);
    noise(1.0, 0.2, 300, at);
  },
  rise(at: Vector3) {
    noise(0.5, 0.25, 250, at);
    rattle(at, 5, 0.6, 0.18);
  },
  roar(at: Vector3) {
    tone(70, 45, 1.6, 'sawtooth', 0.35, at);
    tone(105, 70, 1.6, 'square', 0.15, at);
    noise(1.4, 0.35, 500, at);
  },
  pickup() {
    tone(500, 1000, 0.15, 'sine', 0.2);
  },
  /** A quest item taken by hand: a crisp rustle of parchment and a soft chime. */
  parchment(at?: Vector3) {
    noise(0.09, 0.35, 3200, at, 'bandpass', 0, 1.5);
    noise(0.12, 0.25, 2400, at, 'bandpass', 0.07, 1.5);
    tone(880, 880, 0.35, 'sine', 0.08, undefined, 0.05);
  },
  wave() {
    tone(110, 110, 0.8, 'triangle', 0.2);
    tone(165, 165, 0.8, 'triangle', 0.1, undefined, 0.15);
  },
  /** You reached a level: a bright call rising over a held chime. */
  levelUp() {
    [392, 494, 587, 784].forEach((f, i) => tone(f, f, 0.6, 'triangle', 0.16, undefined, i * 0.09));
    tone(1568, 1560, 1.4, 'sine', 0.06, undefined, 0.36);
  },
  /** A quest handed in: three quick pickups and a held major chord, brassy. */
  fanfare() {
    [0, 0.11, 0.22].forEach((t) => tone(392, 392, 0.1, 'square', 0.06, undefined, t));
    for (const f of [523, 659, 784]) {
      tone(f, f, 1.1, 'square', 0.045, undefined, 0.34);
      tone(f, f, 1.2, 'triangle', 0.1, undefined, 0.34);
    }
    tone(1047, 1047, 0.9, 'triangle', 0.08, undefined, 0.62);
  },
  victory() {
    [262, 330, 392, 523].forEach((f, i) => tone(f, f, 0.9, 'triangle', 0.15, undefined, i * 0.18));
  },
};

/** A low, slowly beating drone under everything: the cheapest atmosphere there is. */
export function startAmbience(): void {
  if (!ctx || drone) return;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 4);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 220;
  filter.connect(g).connect(master!);
  const oscs = [55, 55.4, 82.6].map((f) => {
    const o = ctx!.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.connect(filter);
    o.start();
    return o;
  });
  drone = {
    stop() {
      for (const o of oscs) o.stop();
    },
  };
}

export function stopAmbience(): void {
  drone?.stop();
  drone = null;
}
