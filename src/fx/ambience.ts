import type { Vector3 } from 'three';
import { CONFIG } from '../config';
import type { Interior } from '../save/record';
import { type AmbientSource, type Birdcall, BirdSong, chooseAmbient, type PlaceId, type PlaceSound, type TreeCover, type Voicing } from '../world/ambience';
import { blankMix, type Cues, type Mix, mix } from '../world/mix';
import { type Loop, type LoopName, startLoop } from './loops';
import { audio, type AudioKit, sfx } from './sfx';

// Oakvale's ambience, played (spec, "Sound"): a light wind that isn't placed
// anywhere, birds calling now and then from the trees round you, each
// place's sound where it is, and the mine's own air past its bend. Which
// ambient sounds play, and which are placed by HRTF, is world/ambience.ts's
// pure rule, and how loud and muffled each part is follows the light's cues
// by world/mix.ts's; this keeps the Web Audio graph in step with both. No
// music.

/** The one-shots a place makes now and then, or when its work strikes. */
type PlaceShot = 'creak' | 'drip' | 'crackle' | 'hammer';

/** What each place plays, by name: a loop, one-shots now and then, and what its work strikes. */
const PLACES: Record<PlaceId, { readonly loop?: LoopName; readonly now?: PlaceShot; readonly struck?: PlaceShot }> = {
  stream: { loop: 'stream' },
  dock: { loop: 'lapping' },
  windmill: { now: 'creak' },
  forge: { loop: 'forge' },
  anvil: { struck: 'hammer' },
  hearth: { loop: 'hearth', now: 'crackle' },
  campfire: { loop: 'campfire', now: 'crackle' },
  mineMouth: { loop: 'draught', now: 'drip' },
};

/** A part of the mix: its level, then muffled by a lowpass, into the ambience's bus. */
interface Part {
  readonly gain: GainNode;
  readonly filter: BiquadFilterNode;
}

/**
 * The mine's own ambience, while you're past its bend: its hollow air and
 * drips, its creaking timbers, and the drone in the crypt, each a gain the
 * mix sets. Drips and creaks come from one of a few fixed sides.
 */
interface Underground {
  readonly air: GainNode;
  readonly timbers: GainNode;
  readonly drone: GainNode;
  readonly loops: readonly Loop[];
  readonly drips: readonly StereoPannerNode[];
  readonly creaks: readonly StereoPannerNode[];
  nextDrip: number;
  nextCreak: number;
  /** s since the mine's light went out, to stop it once it's silent. */
  dark: number;
}

/** One ambient sound playing: into `input`, through its panner, to its part of the mix. */
interface Voice {
  readonly input: GainNode;
  readonly panner: PannerNode;
  readonly loop: Loop | null;
  readonly x: number;
  readonly z: number;
  readonly level: number;
  /** s to its next one-shot, if it makes them. */
  next: number;
  /** s left fading out once dropped, or null while it plays. */
  dying: number | null;
}

/** A bird's call and the voice it plays in, for as long as it holds its slot. */
interface Bird {
  readonly source: AmbientSource;
  readonly voice: Voice;
  left: number;
}

const between = ([lo, hi]: readonly [number, number]) => lo + (hi - lo) * Math.random();

/** Move `param` to `v`, eased over a frame or two (the mix's levels already move smoothly). */
const ease = (param: AudioParam, v: number, kit: AudioKit) => param.setTargetAtTime(v, kit.ctx.currentTime, CONFIG.sound.mix.ease);

/**
 * Oakvale's ambience, stepped once a frame with your head, the light's cues
 * and whether anything fights you. Silent until audio is unlocked. At most
 * `CONFIG.sound.ambient.most` places' sounds and bird calls play at once,
 * counting those still fading out.
 */
export class Ambience {
  private kit: AudioKit | null = null;
  /** Everything the ambience plays goes through here, dipped in a fight. */
  private bus: GainNode | null = null;
  /** The outdoors: the wind, the birds and the places outside. */
  private outdoors: Part | null = null;
  /** Each building's own sounds (the inn's hearth), by building. */
  private readonly rooms = new Map<Interior, Part>();
  private under: Underground | null = null;
  /** This frame's mix. */
  private readonly mixed = blankMix();
  /** How far the fight's dip has come: 1 none. */
  private dip = 1;
  private readonly song: BirdSong;
  /** Each place's voice while it plays, by its index in `places`. */
  private readonly voices: (Voice | null)[];
  private readonly birds: Bird[] = [];
  /** The places, as candidates to play. */
  private readonly placed: readonly AmbientSource[];
  /** This frame's candidates: the places, the birds calling, and one about to. */
  private readonly list: AmbientSource[] = [];
  private readonly voicings: Voicing[] = [];
  private readonly starts: number[] = [];

  constructor(
    private readonly places: readonly PlaceSound[],
    trees: TreeCover,
  ) {
    this.song = new BirdSong(trees);
    this.voices = places.map(() => null);
    this.placed = places.map(({ x, z }) => ({ x, z, place: true }));
  }

  /** How many ambient sounds are playing (or fading out): never more than `CONFIG.sound.ambient.most`. */
  get playing(): number {
    let n = this.birds.length;
    for (const v of this.voices) if (v) n++;
    return n;
  }

  /** Which places are sounding, and how each is placed: for checks. */
  get sounding(): { id: PlaceId; hrtf: boolean }[] {
    const out: { id: PlaceId; hrtf: boolean }[] = [];
    this.voices.forEach((v, i) => v && v.dying === null && out.push({ id: this.places[i].id, hrtf: v.panner.panningModel === 'HRTF' }));
    return out;
  }

  /** How many birds are calling. */
  get calling(): number {
    return this.birds.length;
  }

  /**
   * The graph's gains and cutoffs as they are now, for checks: the whole
   * ambience's, the outdoors', each room's, and the mine's air, timbers and
   * drone (null while the mine's ambience isn't playing).
   */
  get gains() {
    if (!this.bus || !this.outdoors) return null;
    const part = (p: Part) => ({ level: p.gain.gain.value, cutoff: p.filter.frequency.value });
    const u = this.under;
    return {
      all: this.bus.gain.value,
      outdoors: part(this.outdoors),
      rooms: Object.fromEntries([...this.rooms].map(([id, p]) => [id, part(p)])),
      mine: u && { air: u.air.gain.value, timbers: u.timbers.gain.value, drone: u.drone.gain.value },
    };
  }

  /** `id`'s work strikes (the smith's hammer on the anvil): heard if its place is sounding. */
  strike(id: PlaceId): void {
    const shot = PLACES[id].struck;
    const v = this.voices[this.places.findIndex((p) => p.id === id)];
    if (shot && v && v.dying === null) sfx[shot](v.input);
  }

  /** One frame with your head at `head`, the light's `cues` and whether anything's `fighting` you. */
  update(dt: number, head: Vector3, cues: Cues, fighting: boolean): void {
    const call = this.song.update(dt, head.x, head.z);
    if (!this.ready()) return;
    const m = mix(cues, fighting, this.mixed);
    this.follow(dt, cues, m);
    const { places, birds, list, voices } = this;
    list.length = 0;
    for (const p of this.placed) list.push(p);
    for (const b of birds) list.push(b.source);
    // Deep in the mine nothing outside can be heard: none of it plays.
    const fresh = call && m.outdoors > 0 ? { x: call.x, z: call.z, place: false } : null;
    if (fresh) list.push(fresh);
    const want = chooseAmbient(head.x, head.z, list, this.voicings);
    if (m.outdoors === 0 && m.rooms.every((r) => r.level === 0)) want.fill('off');

    // Drop what's no longer chosen, first; bring back what's fading but chosen again.
    places.forEach((_, i) => this.keep(voices[i], want[i]));
    birds.forEach((b, j) => this.keep(b.voice, b.left > 0 ? want[places.length + j] : 'off'));

    // Then start what's chosen and silent, nearest first, while there's a slot.
    const { starts } = this;
    starts.length = 0;
    places.forEach((_, i) => want[i] !== 'off' && !voices[i] && starts.push(i));
    if (fresh && want[list.length - 1] !== 'off') starts.push(list.length - 1);
    const d = (i: number) => Math.hypot(list[i].x - head.x, list[i].z - head.z);
    starts.sort((a, b) => d(a) - d(b));
    const { most } = CONFIG.sound.ambient;
    let playing = this.playing;
    for (const i of starts) {
      if (playing >= most) break;
      playing++;
      if (i < places.length) voices[i] = this.startPlace(places[i], want[i]);
      else this.startBird(call!, fresh!);
    }

    this.tick(dt, head);
  }

  /** Audio is unlocked: the bus and the wind are made the first time. */
  private ready(): boolean {
    if (this.kit) return true;
    const kit = audio();
    if (!kit) return false;
    const { ambient, wind } = CONFIG.sound;
    this.kit = kit;
    this.bus = kit.ctx.createGain();
    this.bus.gain.value = ambient.level;
    this.bus.connect(kit.master);
    this.outdoors = this.part();
    for (const p of this.places) if (p.interior && !this.rooms.has(p.interior)) this.rooms.set(p.interior, this.part());
    const w = kit.ctx.createGain();
    w.gain.value = wind.level;
    w.connect(this.outdoors.gain);
    startLoop('wind', kit, w);
    return true;
  }

  /** A part of the mix, into the bus. */
  private part(): Part {
    const { ctx } = this.kit!;
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = CONFIG.sound.mix.open;
    filter.Q.value = 0.5;
    gain.connect(filter).connect(this.bus!);
    return { gain, filter };
  }

  /**
   * Set the graph to the mix. Its levels already move as smoothly as the
   * light does, so each is only eased over a frame or two; the fight's dip
   * comes in over its `attack` and goes over its `release`.
   */
  private follow(dt: number, cues: Cues, m: Mix): void {
    const kit = this.kit!;
    const set = (p: AudioParam, v: number) => ease(p, v, kit);
    const { attack, release } = CONFIG.sound.mix.fight;
    // Exponentially, most of the way (95%) over `attack` or `release`.
    this.dip += (m.all - this.dip) * (1 - Math.exp((-3 * dt) / (m.all < this.dip ? attack : release)));
    set(this.bus!.gain, CONFIG.sound.ambient.level * this.dip);
    set(this.outdoors!.gain.gain, m.outdoors);
    set(this.outdoors!.filter.frequency, m.outdoorsCutoff);
    cues.rooms.forEach((r, i) => {
      const p = this.rooms.get(r.id);
      if (!p) return;
      set(p.gain.gain, m.rooms[i].level);
      set(p.filter.frequency, m.rooms[i].cutoff);
    });
    this.underground(dt, cues, m);
  }

  /**
   * The mine's ambience: started as its light comes up past the bend, and
   * stopped once it has gone and stayed out a moment (out of the mine, its
   * loops cost nothing). Drips and creaks come now and then from a side.
   */
  private underground(dt: number, cues: Cues, m: Mix): void {
    let u = this.under;
    if (!u) {
      if (cues.mine <= 0) return;
      u = this.under = this.startUnder();
    }
    const { drips, timbers, drone, linger } = CONFIG.sound.mine;
    ease(u.air.gain, m.air, this.kit!);
    ease(u.timbers.gain, m.timbers, this.kit!);
    ease(u.drone.gain, m.drone * drone, this.kit!);
    u.dark = cues.mine > 0 ? 0 : u.dark + dt;
    if (u.dark > linger) {
      for (const l of u.loops) l.stop();
      for (const n of [u.air, u.timbers, u.drone]) n.disconnect();
      this.under = null;
      return;
    }
    const side = (list: readonly StereoPannerNode[]) => list[Math.floor(Math.random() * list.length)];
    if ((u.nextDrip -= dt) <= 0 && m.air > 0) {
      sfx.drip(side(u.drips));
      u.nextDrip = between(drips.every);
    }
    if ((u.nextCreak -= dt) <= 0 && m.timbers > 0) {
      sfx.timber(side(u.creaks));
      u.nextCreak = between(timbers.every);
    }
  }

  private startUnder(): Underground {
    const kit = this.kit!;
    const { ctx } = kit;
    const { air, drips, timbers, sides: spread } = CONFIG.sound.mine;
    const gain = (v: number, into: AudioNode) => {
      const g = ctx.createGain();
      g.gain.value = v;
      g.connect(into);
      return g;
    };
    const u = { air: gain(0, this.bus!), timbers: gain(0, this.bus!), drone: gain(0, this.bus!) };
    // A few fixed sides, each drip or creak from one of them.
    const sides = (level: number, into: GainNode) => {
      const g = gain(level, into);
      return spread.map((pan) => {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        p.connect(g);
        return p;
      });
    };
    return {
      ...u,
      loops: [startLoop('hollow', kit, gain(air, u.air)), startLoop('drone', kit, u.drone)],
      drips: sides(drips.level, u.air),
      creaks: sides(timbers.level, u.timbers),
      nextDrip: between(drips.every),
      nextCreak: between(timbers.every),
      dark: 0,
    };
  }

  /** Fade `v` out if it's not wanted; bring it back if it is, and place it as wanted. */
  private keep(v: Voice | null, want: Voicing): void {
    if (!v) return;
    if (want === 'off') {
      if (v.dying === null) this.fadeOut(v);
      return;
    }
    v.dying = null;
    const model = want === 'hrtf' ? 'HRTF' : 'equalpower';
    if (v.panner.panningModel !== model) v.panner.panningModel = model;
  }

  private startPlace(p: PlaceSound, voicing: Voicing): Voice {
    const { level, ref, ...rest } = CONFIG.sound.places[p.id];
    const every = 'every' in rest ? rest.every : null;
    const loop = PLACES[p.id].loop;
    const part = p.interior ? this.rooms.get(p.interior)! : this.outdoors!;
    const v = this.voice(p.x, p.y, p.z, voicing, level, ref, loop ?? null, part.gain);
    if (every) v.next = between(every) * Math.random();
    return v;
  }

  private startBird(call: Birdcall, source: AmbientSource): void {
    const { level, ref, last } = CONFIG.sound.birds;
    const voice = this.voice(call.x, call.y, call.z, 'cheap', level, ref, null, this.outdoors!.gain);
    sfx[call.call](voice.input);
    this.birds.push({ source, voice, left: last });
  }

  private voice(x: number, y: number, z: number, voicing: Voicing, level: number, ref: number, loop: LoopName | null, into: AudioNode): Voice {
    const { ctx } = this.kit!;
    const input = ctx.createGain();
    input.gain.value = 0;
    const panner = ctx.createPanner();
    panner.panningModel = voicing === 'hrtf' ? 'HRTF' : 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = ref;
    panner.rolloffFactor = 1;
    panner.positionX.value = x;
    panner.positionY.value = y;
    panner.positionZ.value = z;
    input.connect(panner).connect(into);
    return { input, panner, loop: loop && startLoop(loop, this.kit!, input), x, z, level, next: Infinity, dying: null };
  }

  private fadeOut(v: Voice): void {
    const { fade } = CONFIG.sound.ambient;
    v.dying = fade;
    v.input.gain.setTargetAtTime(0, this.kit!.ctx.currentTime, fade / 5);
  }

  private dispose(v: Voice): void {
    v.loop?.stop();
    v.input.disconnect();
    v.panner.disconnect();
  }

  /**
   * Each voice's loudness eases towards its level, fading out over the last
   * `edge` m before `reach` so nothing cuts off; one fading out goes once
   * it's silent, a bird once its call is done; places make their one-shots.
   */
  private tick(dt: number, head: Vector3): void {
    const { reach, edge } = CONFIG.sound.ambient;
    const now = this.kit!.ctx.currentTime;
    const ease = (v: Voice) => {
      const t = Math.min(1, Math.max(0, (reach - Math.hypot(v.x - head.x, v.z - head.z)) / edge));
      v.input.gain.setTargetAtTime(v.level * t * t * (3 - 2 * t), now, 0.15);
    };
    const gone = (v: Voice) => {
      if (v.dying === null) return false;
      v.dying -= dt;
      if (v.dying > 0) return false;
      this.dispose(v);
      return true;
    };
    this.voices.forEach((v, i) => {
      if (!v) return;
      if (gone(v)) {
        this.voices[i] = null;
        return;
      }
      if (v.dying !== null) return;
      ease(v);
      const shot = PLACES[this.places[i].id].now;
      if (shot && (v.next -= dt) <= 0) {
        sfx[shot](v.input);
        const p = CONFIG.sound.places[this.places[i].id];
        v.next = 'every' in p ? between(p.every) : Infinity;
      }
    });
    for (let j = this.birds.length - 1; j >= 0; j--) {
      const b = this.birds[j];
      if ((b.left -= dt) <= 0 && b.voice.dying === null) this.fadeOut(b.voice);
      if (gone(b.voice)) this.birds.splice(j, 1);
      else if (b.voice.dying === null) ease(b.voice);
    }
  }
}
