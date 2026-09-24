// Synthesised placeholder sounds — no assets, but audio feedback matters a
// lot for how melee feels, so the white box should have *something*.

let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, endFreq: number, dur: number, type: OscillatorType, gain: number): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur);
}

function noise(dur: number, gain: number, lowpass: number): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpass;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(t);
}

export const sfx = {
  hit(crit: boolean) {
    noise(0.12, 0.5, 1800);
    tone(crit ? 220 : 160, 60, 0.15, 'square', 0.15);
  },
  block() {
    tone(900, 700, 0.25, 'triangle', 0.2);
    noise(0.08, 0.3, 5000);
  },
  parry() {
    tone(1400, 1100, 0.4, 'triangle', 0.25);
    tone(700, 690, 0.4, 'sine', 0.15);
  },
  hurt() {
    tone(200, 80, 0.3, 'sawtooth', 0.2);
  },
  death() {
    tone(300, 40, 0.5, 'square', 0.12);
  },
  warCry() {
    tone(90, 40, 0.6, 'sawtooth', 0.3);
    noise(0.5, 0.4, 600);
  },
  pickup() {
    tone(500, 1000, 0.15, 'sine', 0.2);
  },
  wave() {
    tone(110, 110, 0.8, 'triangle', 0.2);
  },
};
