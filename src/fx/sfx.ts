import { type Object3D, Quaternion, Vector3 } from 'three';
import { startLoop } from './loops';

// Synthesised placeholder sounds — no assets, but audio feedback matters a
// lot for how melee feels, so the white box should have *something*.
//
// Sounds with a position are spatialised (HRTF), which in a headset is how you
// notice the archer drawing behind you. Player-centric sounds are left dry.
//
// Every sound is played by one name: a one-shot here as `sfx.<name>`, a
// loop in fx/loops.ts as `startLoop('<name>', …)`. Where it plays never
// says how it's made, so any one can later become a recording by changing
// only its entry.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let drone: { stop(): void } | null = null;

/** Seconds of white noise every sound shares: long enough that a loop of it doesn't audibly repeat. */
const NOISE_SECONDS = 4;

export function unlockAudio(): void {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

/** What every sound is made with, once audio is unlocked: the context, the master bus and the shared noise. */
export interface AudioKit {
  readonly ctx: BaseAudioContext;
  readonly master: AudioNode;
  readonly noise: AudioBuffer;
}

/** The audio kit, or null until the first gesture unlocks audio. */
export function audio(): AudioKit | null {
  return ctx && master && noiseBuf ? { ctx, master, noise: noiseBuf } : null;
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

/** Where a sound goes: through its own HRTF panner at a point, into a node (an ambient sound's voice), or straight out. */
export type Where = Vector3 | AudioNode | undefined;

function output(at: Where): AudioNode {
  if (!at) return master!;
  if (!('isVector3' in at)) return at;
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

function tone(freq: number, endFreq: number, dur: number, type: OscillatorType, gain: number, at?: Where, delay = 0): void {
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

function noise(dur: number, gain: number, freq: number, at?: Where, type: BiquadFilterType = 'lowpass', delay = 0, q = 1): void {
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
  src.start(t, Math.random() * (NOISE_SECONDS - 0.5));
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
  /** Heroic Throw leaves the hand: a spectral shimmer rising over a whoosh. */
  heroicThrow(at?: Vector3) {
    noise(0.22, 0.3, 1400, at, 'bandpass', 0, 0.8);
    tone(520, 1250, 0.3, 'sine', 0.14, at);
    tone(780, 1600, 0.25, 'triangle', 0.05, at, 0.04);
  },
  /** Shield Wall goes up: a deep ring of steel, held. */
  shieldWall() {
    tone(260, 330, 0.7, 'triangle', 0.18);
    tone(130, 130, 1.0, 'sine', 0.2);
    noise(0.1, 0.25, 4000, undefined, 'highpass');
  },
  /** Sweeping Strikes: a low snarl rising into a wide swish. */
  sweepingStrikes() {
    tone(140, 300, 0.45, 'sawtooth', 0.12);
    noise(0.4, 0.3, 800, undefined, 'bandpass', 0.05, 0.5);
  },
  /** Power Shot: the nocked arrow takes its glow, a bright rising ring over the string's creak. */
  powerShot(at?: Vector3) {
    tone(660, 1320, 0.25, 'triangle', 0.12, at);
    tone(990, 1980, 0.2, 'sine', 0.06, at, 0.05);
    noise(0.12, 0.15, 3000, at, 'bandpass', 0, 2);
  },
  /** Snare Trap: iron jaws set down and cocked, a clank and a ratchet. */
  snareTrap(at?: Vector3) {
    tone(220, 180, 0.12, 'square', 0.12, at);
    noise(0.08, 0.3, 1800, at, 'bandpass', 0.05, 3);
    noise(0.06, 0.25, 2400, at, 'bandpass', 0.12, 3);
  },
  /** A trap snaps shut on an enemy: a hard iron clap. */
  trapSnap(at?: Vector3) {
    noise(0.07, 0.6, 2200, at, 'bandpass', 0, 1.5);
    tone(320, 120, 0.15, 'square', 0.18, at);
  },
  /** Volley is on your next arrow: a quick rattle of shafts and a rising whistle. */
  volleyReady(at?: Vector3) {
    for (let i = 0; i < 3; i++) noise(0.05, 0.18, 2600, at, 'bandpass', i * 0.04, 4);
    tone(700, 1100, 0.22, 'triangle', 0.07, at, 0.06);
  },
  /** A Volley leaves the bow: five strings' worth of thrum, staggered by a hair. */
  volley(at: Vector3) {
    for (let i = 0; i < 5; i++) noise(0.09, 0.14, 1400 + i * 250, at, 'bandpass', i * 0.018, 3);
    tone(520, 260, 0.2, 'triangle', 0.06, at);
  },
  /** Scatter: a gust from the hand, a rush of wind sweeping past. */
  scatter(at?: Vector3) {
    noise(0.45, 0.35, 900, at, 'bandpass', 0, 0.7);
    noise(0.3, 0.18, 2400, at, 'highpass', 0.04);
    tone(180, 90, 0.3, 'sine', 0.1, at);
  },
  /** Hunter's Mark: a bright, narrow ping as the mark takes, like a bead drawn on the quarry. */
  huntersMark(at?: Vector3) {
    tone(1600, 1600, 0.12, 'sine', 0.09, at);
    tone(2400, 2400, 0.2, 'sine', 0.06, at, 0.08);
    noise(0.05, 0.1, 5000, at, 'highpass');
  },
  /** Frost Nova: a glassy crack, then a cold hiss spreading out. */
  frostNova() {
    tone(1800, 900, 0.25, 'triangle', 0.12);
    tone(2600, 1400, 0.18, 'sine', 0.06, undefined, 0.03);
    noise(0.6, 0.3, 5000, undefined, 'highpass');
  },
  /** Fireball is on your next bolt: a low flare catching. */
  fireballReady() {
    noise(0.35, 0.25, 700, undefined, 'bandpass', 0, 0.8);
    tone(110, 220, 0.35, 'sawtooth', 0.08);
  },
  /** A burning bolt leaves the hand: a roar over the throw. */
  fireball(at: Vector3) {
    noise(0.3, 0.35, 500, at, 'bandpass', 0, 0.7);
    tone(90, 60, 0.3, 'sawtooth', 0.1, at);
  },
  /** A Fireball bursts: a deep thump and a crackle. */
  fireballBurst(at: Vector3) {
    tone(70, 30, 0.5, 'sine', 0.45, at);
    noise(0.45, 0.5, 900, at);
    noise(0.3, 0.2, 3000, at, 'bandpass', 0.05, 2);
  },
  /** Frostbolt is on your next bolt: a thin glassy chime, falling. */
  frostboltReady() {
    tone(2200, 1600, 0.3, 'sine', 0.08);
    tone(3300, 2400, 0.22, 'triangle', 0.04, undefined, 0.04);
    noise(0.25, 0.12, 6000, undefined, 'highpass');
  },
  /** A frost bolt leaves the hand: a cold hiss over the throw. */
  frostbolt(at: Vector3) {
    noise(0.28, 0.25, 5000, at, 'highpass');
    tone(1400, 900, 0.2, 'triangle', 0.06, at);
  },
  /** A Frostbolt lands: ice cracking over the blow. */
  frostboltHit(at: Vector3) {
    tone(1900, 700, 0.18, 'triangle', 0.1, at);
    noise(0.2, 0.2, 4200, at, 'bandpass', 0.02, 3);
  },
  /** Chain Lightning is on your next bolt: a rising electric buzz. */
  chainLightningReady() {
    tone(220, 880, 0.3, 'sawtooth', 0.06);
    noise(0.3, 0.15, 3500, undefined, 'bandpass', 0, 4);
  },
  /** A lightning bolt leaves the hand: a sharp crackle. */
  chainLightningLoose(at: Vector3) {
    noise(0.15, 0.35, 3000, at, 'bandpass', 0, 2);
    tone(1200, 300, 0.12, 'square', 0.06, at);
  },
  /** An arc leaps to the next enemy: a snap. */
  chainLightning(at: Vector3) {
    noise(0.08, 0.5, 2600, at, 'bandpass', 0, 1.5);
    tone(900, 180, 0.1, 'square', 0.08, at);
  },
  /** Blizzard starts where you point: a rising wind that blows for the storm's length. */
  blizzard(at: Vector3) {
    noise(5, 0.18, 700, at, 'bandpass', 0, 0.6);
    noise(4.8, 0.08, 2200, at, 'bandpass', 0.2, 1.2);
    tone(1600, 1200, 0.4, 'sine', 0.05, at);
  },
  /** Blizzard's ice bites whoever stands in it: a patter of ice. */
  blizzardTick(at: Vector3) {
    for (let i = 0; i < 3; i++) noise(0.04, 0.15, 4500 + Math.random() * 1500, at, 'bandpass', Math.random() * 0.12, 5);
  },
  /** The mage's blink: a soft rush in and a chime out. */
  blink() {
    noise(0.14, 0.2, 2200, undefined, 'bandpass', 0, 0.8);
    tone(880, 1320, 0.2, 'sine', 0.08, undefined, 0.04);
  },
  /** A gesture read but not cast (not enough rage, not ready, nothing to throw at): a dull, short hum. */
  gestureDull() {
    tone(150, 120, 0.18, 'sine', 0.12);
  },
  /** A gesture not read: a soft, grey puff. */
  gestureMiss(at?: Vector3) {
    noise(0.14, 0.12, 700, at, 'lowpass');
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
  /** A chest's lid lifted: its hinges creak as it swings back, and it thuds against its stop. */
  chest(at?: Vector3) {
    const f = 170 + Math.random() * 40;
    for (let i = 0; i < 7; i++) tone(f * (1 + i * 0.04), f * (1 + i * 0.04) * 0.97, 0.07, 'sawtooth', 0.05, at, i * 0.055);
    noise(0.4, 0.1, 800, at, 'bandpass', 0, 4);
    noise(0.14, 0.45, 280, at, 'lowpass', 0.45);
    tone(120, 60, 0.18, 'sine', 0.22, at, 0.45);
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

  // Oakvale's places and birds (fx/ambience.ts plays these into each one's voice).

  /** The smith's hammer on the anvil: a clank and a bright, inharmonic ring. */
  hammer(at?: Where) {
    const pitch = 0.97 + Math.random() * 0.06;
    noise(0.05, 0.5, 2600, at, 'bandpass', 0, 1.2);
    for (const [f, g, d] of [[1180, 0.12, 0.9], [1745, 0.07, 0.7], [2630, 0.05, 0.5], [3540, 0.03, 0.35]] as const) {
      tone(f * pitch, f * pitch * 0.995, d, 'sine', g, at);
    }
  },
  /** The windmill's timbers under the sails: a slow, grinding groan. */
  creak(at?: Where) {
    const f = 95 + Math.random() * 50;
    const dur = 0.5 + Math.random() * 0.5;
    const steps = 6 + Math.floor(Math.random() * 6);
    // A stutter of rubs, each a little higher, as wood drags on wood.
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * dur;
      tone(f * (1 + i * 0.03), f * (1 + i * 0.03) * 0.97, dur / steps + 0.03, 'sawtooth', 0.05, at, t);
    }
    noise(dur, 0.12, 600, at, 'bandpass', 0, 4);
  },
  /** A timber prop in the mine taking the rock's weight: a short, dry creak, higher and quicker than the windmill's. */
  timber(at?: Where) {
    const f = 150 + Math.random() * 110;
    const dur = 0.25 + Math.random() * 0.35;
    const steps = 4 + Math.floor(Math.random() * 5);
    // A few rubs, each a little lower, as the prop settles.
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * dur;
      tone(f * (1 - i * 0.025), f * (1 - i * 0.025) * 0.96, dur / steps + 0.02, 'sawtooth', 0.045, at, t);
    }
    noise(dur, 0.08, 900, at, 'bandpass', 0, 5);
  },
  /** A drop of water into a puddle. */
  drip(at?: Where) {
    const f = 1300 + Math.random() * 900;
    tone(f, f * 0.55, 0.07, 'sine', 0.22, at);
    tone(f * 1.5, f * 1.1, 0.04, 'sine', 0.06, at, 0.02);
  },
  /** A fire's spit and pop. */
  crackle(at?: Where) {
    noise(0.012 + Math.random() * 0.02, 0.35 + Math.random() * 0.4, 1800 + Math.random() * 2600, at, 'bandpass', 0, 2);
  },
  /** A finch's trill: a quick run of bright notes. */
  trill(at?: Where) {
    const f = 3600 + Math.random() * 900;
    const n = 7 + Math.floor(Math.random() * 7);
    for (let i = 0; i < n; i++) tone(f, f * 0.8, 0.045, 'sine', 0.07, at, i * 0.06);
  },
  /** A blackbird's whistle: two or three fluted notes, gliding. */
  whistle(at?: Where) {
    const notes = 2 + Math.floor(Math.random() * 2);
    let t = 0;
    for (let i = 0; i < notes; i++) {
      const f = 1700 + Math.random() * 900;
      const d = 0.16 + Math.random() * 0.14;
      tone(f, f * (0.8 + Math.random() * 0.45), d, 'sine', 0.08, at, t);
      t += d + 0.05;
    }
  },
  /** A sparrow's chirps: a few quick falling blips. */
  chirps(at?: Where) {
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const f = 4200 + Math.random() * 1200;
      tone(f, f * 0.62, 0.05, 'triangle', 0.05, at, i * (0.11 + Math.random() * 0.05));
    }
  },
  /** The moor's curlew, alone: two long whistles sliding up, cour-lee, cour-lee, then a bubbling run. */
  curlew(at?: Where) {
    const f = 1350 + Math.random() * 200;
    tone(f, f * 1.45, 0.5, 'sine', 0.08, at);
    tone(f * 1.02, f * 1.5, 0.5, 'sine', 0.08, at, 0.7);
    const n = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) tone(f * 1.55, f * 1.35, 0.09, 'sine', 0.06 * (1 - i / (n + 2)), at, 1.35 + i * 0.1);
  },
  /** A wood pigeon: coo, COO-coo, coo-coo. */
  coo(at?: Where) {
    const f = 430 + Math.random() * 60;
    [[0, 0.25, 0.7], [0.38, 0.32, 1], [0.78, 0.22, 0.8], [1.12, 0.22, 0.7], [1.4, 0.3, 0.6]].forEach(([t, d, g]) => {
      tone(f * 1.05, f * 0.93, d, 'sine', 0.1 * g, at, t);
    });
  },
};

/** The one-shot sounds, by name. */
export type ShotName = keyof typeof sfx;

/** The arena's low, slowly beating drone under everything: the cheapest atmosphere there is. */
export function startAmbience(): void {
  const kit = audio();
  if (!kit || drone) return;
  drone = startLoop('drone', kit, kit.master);
}

export function stopAmbience(): void {
  drone?.stop();
  drone = null;
}
