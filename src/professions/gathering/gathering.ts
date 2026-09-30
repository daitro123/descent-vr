import { Mesh, type Object3D, type PerspectiveCamera, type Scene, Vector3, type WebGLRenderer } from 'three';
import { CONFIG } from '../../config';
import type { Particles } from '../../fx/particles';
import type { SpotPlan } from '../../maps/types';
import { ModelBuilder } from '../../models/kit';
import { sharedModelMaterial } from '../../models/materials';
import { PAL } from '../../models/palette';
import type { BeltFrame } from '../../player/beltZones';
import type { Handedness } from '../../player/input';
import type { Player } from '../../player/player';
import type { Interior } from '../../save/record';
import { type Professions, type ProfessionsEffects, SPOT_KINDS } from '../professions';
import { inLoop, loopGrip, loopOpen, type LoopNow, putBack } from './loop';
import { Pick } from './pick';
import { gatherSfx } from './sound';
import { scoreStrike, SpotStates } from './spots';
import { ToolLoopView } from './toolLoop';
import { Veins } from './veins';

// Gathering in the Adventure (.scratch/professions/spec.md, "Gathering spots
// and the tool loop"; issues/13-the-tool-loop-and-mining.md). The tool loop
// hangs behind your sword hip once you've learned Mining. Squeeze the grip
// there within 3 m of a copper vein and the pick comes into your sword hand,
// the sword put away and the off hand left as it is; squeeze there again, or
// walk 5 m from every vein, and the sword is back. Far from a vein, or while
// anything fights you, the loop does nothing, and a pull puts the pick away at
// once with one buzz. With the pick drawn, the vein you work shows a glint
// that moves after every strike: a committed swing on it counts 2.25, one on
// the ore 1, and the vein breaks at 4.5 in copper rubble. What it gives flies
// to your bag through the professions module ("+1 Mining"), and it stays dark
// until it refills, 180 s on and once you're 30 m off. Promoted from ?proto=pick
// variant C, which keeps its own copies.

/** What gathering needs from the Adventure. */
export interface GatheringWorld {
  readonly player: Player;
  readonly professions: Professions;
  /** The belt's frame, which the loop hangs from as the potion slots do. */
  readonly frame: BeltFrame;
  readonly particles: Particles;
  buzz(hand: Handedness, intensity: number, ms: number): void;
  /** What emptying a spot did, where it broke: saved and shown ("+1 Mining"), and counted for your quests. */
  apply(effects: ProfessionsEffects, at: Vector3): void;
  /** The main hand holds something of the belt's (a flask): the loop leaves it alone. */
  handBusy(): boolean;
}

/** How things stand this frame, from the Adventure. */
export interface GatheringNow {
  readonly dt: number;
  /** Anything is fighting you. */
  readonly fighting: boolean;
  /** A station has your hands (the anvil's tools, the bench's bare hands): the tool goes back. */
  readonly station: boolean;
  /** The building or mine you're in (null out of doors): only its spots are near. */
  readonly interior: Interior | null;
  /** Are the veins out of doors drawn now (no door shut behind you)? */
  readonly outdoors: boolean;
  /** Is the mine drawn round (x, z)? */
  readonly mineDrawn: (x: number, z: number) => boolean;
}

/** What the loop hands you: the pick today, the herb knife with Herbalism (ticket 14). */
export type ToolKind = 'pick';

/** What happened, for the checks. */
export interface GatheringLog {
  drawn: number;
  putAway: number;
  pulled: number;
  nothing: number;
  taps: number;
  stone: number;
  strikes: number;
  glints: number;
  broken: number;
  refilled: number;
}

/** Ore and stone coming loose from a broken vein and flying to your bag. */
interface Flight {
  readonly mesh: Mesh;
  readonly from: Vector3;
  wait: number;
  t: number;
}

/** Where the bag hangs, from the head in its heading's frame: over the left shoulder (right, down, back). */
const SHOULDER = new Vector3(-0.22, -0.18, 0.12);
const FLIGHT = 0.45;
/** Slower pick contact than a strike sounds at most this often (s). */
const TAP_EVERY = 0.12;
const Y = new Vector3(0, 1, 0);
const _head = new Vector3();
const _hand = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _hit = new Vector3();
const _g = new Vector3();
const _to = new Vector3();
const _dir = new Vector3();

export class Gathering {
  readonly root: Object3D;
  readonly veins: Veins;
  readonly states: SpotStates;
  readonly pick = new Pick();
  readonly loop = new ToolLoopView();
  readonly log: GatheringLog = { drawn: 0, putAway: 0, pulled: 0, nothing: 0, taps: 0, stone: 0, strikes: 0, glints: 0, broken: 0, refilled: 0 };
  /** What happened, newest last, for the checks. */
  readonly lines: string[] = [];
  /** The tool in your main hand, or null. */
  drawn: ToolKind | null = null;
  /** Is your main hand in the loop now? */
  inLoop = false;
  /** The vein the pick works now (the nearest full one in reach), or −1. */
  worked = -1;
  private readonly spots: readonly SpotPlan[];
  private gripHeld = false;
  private readonly prev = new Vector3();
  private prevValid = false;
  private speed = 0;
  /** The loop would give or take, and the hand was in it, last frame: each arrival ticks once. */
  private wasOpenIn = false;
  private time = 0;
  private lastTap = -1;
  private lastStoneSwing = -1;
  private readonly flights: Flight[] = [];
  private readonly flightPool: Mesh[];

  constructor(
    spots: readonly SpotPlan[],
    private readonly world: GatheringWorld,
  ) {
    this.spots = spots.filter((s) => s.kind === 'copperVein');
    this.veins = new Veins(this.spots);
    this.states = new SpotStates(this.spots);
    this.root = this.loop.root;
    const material = sharedModelMaterial();
    const ore = new ModelBuilder(43).ball(0.045, { color: 0xc27238, glow: 0.2 }).build();
    const stone = new ModelBuilder(47).ball(0.05, { color: PAL.stoneLight }).build();
    const { gives } = SPOT_KINDS.copperVein;
    this.flightPool = Object.entries(gives).flatMap(([id, n]) => Array.from({ length: n }, () => new Mesh(id === 'copper-ore' ? ore : stone, material)));
    for (const m of this.flightPool) m.visible = false;
  }

  /** Add what gathering draws to `scene`: the loop, the flights, the worked vein's glint and cracks (the veins themselves are the Adventure's to stage). */
  addTo(scene: Scene): void {
    scene.add(this.loop.root, this.veins.overlay, ...this.flightPool);
  }

  /** Compile the pick's, the overlay's and the loop's shaders now, not when first drawn. */
  warm(renderer: WebGLRenderer, camera: PerspectiveCamera, scene: Scene): void {
    const hidden: Object3D[] = [this.loop.root, this.veins.overlay, this.pick.model, ...this.flightPool];
    const was = hidden.map((o) => o.visible);
    for (const o of hidden) o.visible = true;
    this.loop.root.add(this.pick.model);
    renderer.compile(this.loop.root, camera, scene);
    renderer.compile(this.veins.overlay, camera, scene);
    this.pick.model.removeFromParent();
    hidden.forEach((o, i) => (o.visible = was[i]));
  }

  /** Is a gathering profession learned, so a tool hangs in the loop? */
  private get hangs(): boolean {
    return this.world.professions.learned.includes('mining');
  }

  /** Where the loop is: its middle, in the world. */
  loopAt(out: Vector3): Vector3 {
    return this.loop.root.getWorldPosition(out);
  }

  update(now: GatheringNow): void {
    const { player } = this.world;
    const { dt } = now;
    this.time += dt;
    player.headPosition(_head);
    const near = this.nearest(now);
    const loop: LoopNow = { drawn: this.drawn !== null, fighting: now.fighting, nearestFull: near.full, nearestAny: near.any };

    // The main hand: where it is, how fast it moves in the rig, and its grip.
    const input = player.input.hands.right;
    const tracked = input.grip.visible && player.alive;
    input.grip.getWorldPosition(_hand);
    if (tracked && this.prevValid && dt > 0) this.speed = input.grip.position.distanceTo(this.prev) / dt;
    else this.speed = 0;
    this.prev.copy(input.grip.position);
    this.prevValid = tracked;
    const G = CONFIG.bag.grip;
    const was = this.gripHeld;
    this.gripHeld = input.squeeze > (was ? G.off : G.on);
    const gripDown = this.gripHeld && !was;
    this.loop.update(this.world.frame, this.hangs, this.drawn !== null);
    this.inLoop = tracked && inLoop(this.world.frame, _hand);

    // The tool goes back at once when you fall or a station takes your hands; a pull, or walking off, sends it back too.
    if (this.drawn && (!player.alive || now.station)) this.putAway('now');
    const back = putBack(loop);
    if (back === 'pulled') this.putAway('pulled');
    else if (back === 'walkedOff') this.putAway('walkedOff');

    // A grip in the loop: draw, put back, or nothing.
    const busy = this.world.handBusy() || now.station || !player.alive;
    const act = busy || !this.hangs ? null : loopGrip({ gripDown, inLoop: this.inLoop, speed: this.speed }, { ...loop, drawn: this.drawn !== null });
    if (act === 'draw') this.draw(near.spot);
    else if (act === 'putAway') this.putAway('loop');
    else if (act === 'nothing') this.nothing(now.fighting ? 'something is fighting you' : 'no vein within reach');

    // It glows and ticks as the hand comes in, if it would give or take.
    const open = this.inLoop && !busy && loopOpen({ ...loop, drawn: this.drawn !== null });
    if (open && !this.wasOpenIn) this.buzz(CONFIG.professions.toolLoop.buzz.tick);
    this.wasOpenIn = open;
    this.loop.glows = open;

    // The pick at work on the vein in reach.
    this.worked = this.drawn === 'pick' ? this.workable(now) : -1;
    if (this.drawn === 'pick') {
      this.pick.update(player.rig, dt);
      if (this.worked >= 0) this.strikes(this.worked);
    }
    for (const i of this.states.update(dt, _head)) this.refilled(i);
    this.veins.update(dt, this.worked, this.worked >= 0 ? this.states.stage(this.worked) : 0, this.time);
    this.fly(dt);
  }

  /** How far the nearest spot you could gather is (full), and the nearest of any state, from your head; and the nearest full one. */
  private nearest(now: GatheringNow): { full: number; any: number; spot: number } {
    let full = Infinity;
    let any = Infinity;
    let spot = -1;
    if (!this.hangs) return { full, any, spot };
    this.spots.forEach((s, i) => {
      if (s.interior !== now.interior) return;
      const d = Math.hypot(_head.x - s.x, _head.z - s.z);
      any = Math.min(any, d);
      if (this.states.phase(i) !== 'taken' && d < full) {
        full = d;
        spot = i;
      }
    });
    return { full, any, spot };
  }

  /** The full vein nearest you within the loop's reach and drawn, or −1. */
  private workable(now: GatheringNow): number {
    let best = -1;
    let bestD: number = CONFIG.professions.toolLoop.draw;
    this.spots.forEach((s, i) => {
      if (s.interior !== now.interior || this.states.phase(i) === 'taken') return;
      const shown = s.interior === null ? now.outdoors : now.mineDrawn(s.x, s.z);
      if (!shown) return;
      const d = Math.hypot(_head.x - s.x, _head.z - s.z);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }

  private draw(spot: number): void {
    const { player } = this.world;
    this.drawn = 'pick';
    this.pick.reset();
    player.input.hands.right.grip.add(this.pick.model);
    player.sword.away = true;
    gatherSfx.draw(true);
    this.buzz(CONFIG.professions.toolLoop.buzz.draw);
    this.log.drawn++;
    this.note(`drew the pick at ${this.spots[spot]?.id ?? 'a vein'}`);
  }

  /** The tool goes back on the loop and the sword comes back: a grip in the loop, a pull, walking off, or at once (a fall, a station). */
  private putAway(why: 'loop' | 'pulled' | 'walkedOff' | 'now'): void {
    if (!this.drawn) return;
    const B = CONFIG.professions.toolLoop.buzz;
    this.drawn = null;
    this.pick.model.removeFromParent();
    this.world.player.sword.away = false;
    if (why === 'pulled') {
      this.buzz(B.pulled);
      this.log.pulled++;
    } else if (why !== 'now') this.buzz(B.putAway);
    if (why !== 'now') gatherSfx.draw(false);
    this.log.putAway++;
    this.note(`put the pick away: ${why === 'loop' ? 'in the loop' : why === 'pulled' ? 'pulled into a fight' : why === 'walkedOff' ? 'walked off' : 'hands taken'}`);
  }

  private nothing(why: string): void {
    gatherSfx.nothing();
    this.buzz(CONFIG.professions.toolLoop.buzz.nothing);
    this.log.nothing++;
    this.note(`the loop did nothing: ${why}`);
  }

  /** Each of the pick's points going into vein `i`'s rock this frame strikes it. */
  private strikes(i: number): void {
    const { rig } = this.world.player;
    for (const p of this.pick.points) {
      if (!p.valid) continue;
      const hit = this.veins.enters(i, p.prev(rig, _a), p.now(rig, _b), _hit);
      if (hit) this.strike(i, hit, p.speed);
    }
  }

  /** Score a strike on vein `i` at `at` and give its feedback: sparks, a ring and a pulse sized to it, and the break. */
  strike(i: number, at: Vector3, speed: number): void {
    const V = CONFIG.professions.vein;
    const vein = this.veins.veins[i];
    const { gate } = this.pick;
    const { particles } = this.world;
    const inGlint = at.distanceTo(this.veins.glint(i, _g)) < V.glintRadius;
    const onOre = at.distanceTo(vein.ore) <= V.oreRadius;
    const s = scoreStrike({ committed: gate.committed, speed, onOre, inGlint });
    _dir.subVectors(at, vein.centre).normalize();
    if (s.kind === 'tap') {
      if (this.time - this.lastTap < TAP_EVERY) return;
      this.lastTap = this.time;
      gatherSfx.tap(at);
      this.world.buzz('right', 0.2, 20);
      particles.burst('dust', at, 2, undefined, 0x8a857c);
      this.log.taps++;
      return;
    }
    if (s.kind === 'stone') {
      if (gate.count === this.lastStoneSwing) return;
      this.lastStoneSwing = gate.count;
      gatherSfx.stone(at);
      this.world.buzz('right', 0.35, 30);
      particles.burst('dust', at, 6, _dir, 0x8a857c);
      this.log.stone++;
      this.note(`a strike off the ore at ${this.spots[i].id}`);
      return;
    }
    const struck = this.states.strike(i, s, gate.count);
    if (!struck.counted) return;
    this.log.strikes++;
    if (s.kind === 'glint') {
      this.log.glints++;
      gatherSfx.glint(at);
      particles.burst('sparks', at, 30, _dir, 0xffe890);
      particles.burst('embers', at, 8, undefined, 0xffc060);
      this.world.buzz('right', 1, 60);
      setTimeout(() => this.world.buzz('right', 0.8, 40), 90);
      this.veins.flash(i, 0xffffff, 1);
    } else {
      gatherSfx.strike(at, s.power);
      particles.burst('sparks', at, Math.round(6 + 14 * s.power), _dir);
      this.world.buzz('right', 0.45 + 0.45 * s.power, 45);
      this.veins.flash(i, 0xff9040, 0.4 + 0.6 * s.power);
    }
    this.veins.moveGlint(i);
    this.note(`${s.kind === 'glint' ? 'a strike in the glint' : 'a strike on the ore'} at ${this.spots[i].id}: ${this.states.progress(i).toFixed(2)} of ${V.need}`);
    if (struck.broke) this.shatter(i);
  }

  /** The vein bursts in copper rubble, goes dark, and what it gives flies to your bag. */
  private shatter(i: number): void {
    const vein = this.veins.veins[i];
    const { particles } = this.world;
    this.veins.setTaken(i, true);
    gatherSfx.crack(vein.ore);
    this.world.buzz('right', 1, 150);
    particles.burst('bone', vein.ore, 14, vein.normal, 0xb0643a);
    particles.burst('dust', vein.ore, 10, undefined, 0x8a857c);
    this.log.broken++;
    this.note(`broke ${this.spots[i].id} in ${this.states.strikes(i)} strikes`);
    // A beat to see them come loose, then off to the bag.
    this.flightPool.forEach((mesh, k) => {
      if (this.flights.some((f) => f.mesh === mesh)) return;
      mesh.position.copy(vein.ore).addScaledVector(vein.normal, 0.08);
      mesh.position.x += (k - 1.5) * 0.06;
      mesh.position.y += 0.04 * k;
      mesh.scale.setScalar(1);
      mesh.visible = true;
      this.flights.push({ mesh, from: mesh.position.clone(), wait: CONFIG.professions.vein.flight + k * 0.08, t: 0 });
    });
    this.world.apply(this.world.professions.gather(this.spots[i].kind), vein.ore);
  }

  private refilled(i: number): void {
    const vein = this.veins.veins[i];
    this.veins.setTaken(i, false);
    gatherSfx.refill(vein.ore);
    this.world.particles.burst('dust', vein.ore, 8, undefined, 0x8a857c);
    this.log.refilled++;
    this.note(`${this.spots[i].id} refilled`);
  }

  /** What came loose flies in an arc over your left shoulder into the bag. */
  private fly(dt: number): void {
    if (!this.flights.length) return;
    const { camera } = this.world.player;
    camera.getWorldPosition(_to);
    camera.getWorldDirection(_dir);
    _to.add(_a.copy(SHOULDER).applyAxisAngle(Y, Math.atan2(-_dir.x, -_dir.z)));
    for (let k = this.flights.length - 1; k >= 0; k--) {
      const f = this.flights[k];
      if (f.wait > 0) {
        f.wait -= dt;
        continue;
      }
      f.t = Math.min(1, f.t + dt / FLIGHT);
      const e = f.t * f.t * (3 - 2 * f.t);
      f.mesh.position.lerpVectors(f.from, _to, e);
      f.mesh.position.y += Math.sin(f.t * Math.PI) * 0.35;
      f.mesh.scale.setScalar(1 - 0.6 * e);
      if (f.t < 1) continue;
      f.mesh.visible = false;
      this.flights.splice(k, 1);
      if (!this.flights.length) gatherSfx.bag();
    }
  }

  private buzz({ intensity, ms }: { readonly intensity: number; readonly ms: number }): void {
    this.world.buzz('right', intensity, ms);
  }

  private note(line: string): void {
    this.lines.push(line);
    if (this.lines.length > 60) this.lines.shift();
  }
}
