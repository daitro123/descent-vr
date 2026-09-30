import {
  type BufferGeometry,
  type InstancedMesh,
  Mesh,
  type Object3D,
  OctahedronGeometry,
  type PerspectiveCamera,
  type Scene,
  Vector3,
  type WebGLRenderer,
} from 'three';
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
import { type Professions, type ProfessionsEffects, SPOT_KINDS, type SpotKind } from '../professions';
import { Clumps, LEAVES } from './clumps';
import { Knife } from './knife';
import { inLoop, loopGrip, loopOpen, type LoopNow, putBack, TOOL_OF, toolFor, type ToolKind } from './loop';
import { Pick } from './pick';
import { gatherSfx } from './sound';
import { bandAt, type CutKind, scoreCut, scoreStrike, SpotStates } from './spots';
import { ToolLoopView } from './toolLoop';
import { Veins } from './veins';

export type { ToolKind } from './loop';

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
// until it refills, 180 s on and once you're 30 m off.
//
// Once you've learned Herbalism (issues/14-herbalism.md), the knife hangs
// there too, and a grip draws whichever tool's nearest spot is closer: the
// knife within 3 m of a clump of Hearthleaf or Duskcap. One committed slice
// through its stems takes the clump, and 2 herbs fly to your bag ("+1
// Herbalism"); one through its leaves only trims a leaf and says "cut lower";
// a slow one brushes it. A taken clump stands in short stems until it grows
// back, as a vein refills. Promoted from ?proto=pick variant C, which keeps
// its own copies.

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
  /** A short word over `at`: "Cut lower". */
  say(words: string, at: Vector3): void;
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
  /** Slow passes of the knife through a clump. */
  brushed: number;
  /** Hot cuts through a clump's leaves. */
  trimmed: number;
  /** Clumps taken with a cut through their stems. */
  cut: number;
  refilled: number;
}

/** A spot kind's instanced mesh, and where it's staged and shown: out of doors (null) or in the mine. */
export interface SpotMesh {
  readonly mesh: InstancedMesh;
  readonly interior: Interior | null;
  /** The spots it draws. */
  readonly spots: readonly SpotPlan[];
}

/** Ore, stone or herbs coming loose from a spot and flying to your bag. */
interface Flight {
  readonly mesh: Mesh;
  readonly from: Vector3;
  wait: number;
  t: number;
}

/** Where the bag hangs, from the head in its heading's frame: over the left shoulder (right, down, back). */
const SHOULDER = new Vector3(-0.22, -0.18, 0.12);
const FLIGHT = 0.45;
/** Slower pick contact than a strike sounds at most this often (s)… */
const TAP_EVERY = 0.12;
/** …and a slow knife rustles the leaves at most this often. */
const RUSTLE_EVERY = 0.3;
/** Each tool's profession: the loop hangs it once that's learned. */
const PROFESSION_OF = { pick: 'mining', knife: 'herbalism' } as const satisfies Record<ToolKind, string>;
const Y = new Vector3(0, 1, 0);
const _head = new Vector3();
const _hand = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _hit = new Vector3();
const _g = new Vector3();
const _to = new Vector3();
const _dir = new Vector3();
const _l = new Vector3();

export class Gathering {
  readonly root: Object3D;
  readonly veins: Veins;
  readonly clumps: Clumps;
  /** Every spot's state, by its index in `spots`. */
  readonly states: SpotStates;
  readonly pick = new Pick();
  readonly knife = new Knife();
  readonly loop = new ToolLoopView();
  readonly log: GatheringLog = {
    drawn: 0,
    putAway: 0,
    pulled: 0,
    nothing: 0,
    taps: 0,
    stone: 0,
    strikes: 0,
    glints: 0,
    broken: 0,
    brushed: 0,
    trimmed: 0,
    cut: 0,
    refilled: 0,
  };
  /** What happened, newest last, for the checks. */
  readonly lines: string[] = [];
  /** The tool in your main hand, or null. */
  drawn: ToolKind | null = null;
  /** Is your main hand in the loop now? */
  inLoop = false;
  /** The spot the drawn tool works now (the nearest full one of its kind in reach), or −1. */
  worked = -1;
  /** Every mesh of the spots, each to be staged and shown where its spots are (the Adventure's to do): the veins', then the clumps'. */
  readonly meshes: readonly SpotMesh[];
  /** The zone's gathering spots: veins first, then clumps, as the plan lists them. */
  readonly spots: readonly SpotPlan[];
  /** Each spot's index among the veins, or among the clumps (−1: not one). */
  private readonly veinOf: readonly number[];
  private readonly clumpOf: readonly number[];
  private gripHeld = false;
  private readonly prev = new Vector3();
  private prevValid = false;
  private speed = 0;
  /** The loop would give or take, and the hand was in it, last frame: each arrival ticks once. */
  private wasOpenIn = false;
  private time = 0;
  private lastTap = -1;
  private lastStoneSwing = -1;
  private lastRustle = -1;
  private readonly flights: Flight[] = [];
  /** What each kind of spot gives, as meshes ready to fly: one per thing. */
  private readonly flightPool: Partial<Record<SpotKind, Mesh[]>> = {};

  constructor(
    spots: readonly SpotPlan[],
    private readonly world: GatheringWorld,
  ) {
    this.spots = spots.filter((s) => s.kind in SPOT_KINDS);
    const veins = this.spots.filter((s) => TOOL_OF[s.kind] === 'pick');
    const clumps = this.spots.filter((s) => TOOL_OF[s.kind] === 'knife');
    this.veins = new Veins(veins);
    this.clumps = new Clumps(clumps);
    this.veinOf = this.spots.map((s) => veins.indexOf(s));
    this.clumpOf = this.spots.map((s) => clumps.indexOf(s));
    this.states = new SpotStates(this.spots);
    this.root = this.loop.root;
    const meshes: SpotMesh[] = [];
    const of = (interior: Interior | null) => veins.filter((v) => v.interior === interior);
    if (this.veins.outdoors) meshes.push({ mesh: this.veins.outdoors, interior: null, spots: of(null) });
    if (this.veins.mine) meshes.push({ mesh: this.veins.mine, interior: 'mine', spots: of('mine') });
    for (const m of this.clumps.meshes) meshes.push({ ...m, spots: clumps.filter((c) => c.kind === m.kind && c.interior === m.interior) });
    this.meshes = meshes;
    const material = sharedModelMaterial();
    const looks: Record<string, BufferGeometry> = {
      'copper-ore': new ModelBuilder(43).ball(0.045, { color: 0xc27238, glow: 0.2 }).build(),
      'rough-stone': new ModelBuilder(47).ball(0.05, { color: PAL.stoneLight }).build(),
      hearthleaf: new ModelBuilder(71)
        .shape(new OctahedronGeometry(0.05, 0).scale(1, 0.3, 0.55), { color: 0x7ea83a })
        .ball(0.014, { color: PAL.gold, at: [0, 0.02, 0], glow: 0.3 })
        .build(),
      duskcap: new ModelBuilder(73)
        .cone(0.04, 0.035, 6, { color: 0x5b3280, at: [0, 0.02, 0], glow: 0.4 })
        .cyl(0.009, 0.011, 0.05, 4, { color: 0xb8ab94, at: [0, -0.015, 0] })
        .build(),
    };
    for (const kind of new Set(this.spots.map((s) => s.kind))) {
      const pool = Object.entries(SPOT_KINDS[kind].gives).flatMap(([id, n]) => Array.from({ length: n }, () => new Mesh(looks[id], material)));
      for (const m of pool) m.visible = false;
      this.flightPool[kind] = pool;
    }
  }


  /** The index of the spot called `id` (for the checks), or −1. */
  spot(id: string): number {
    return this.spots.findIndex((s) => s.id === id);
  }

  private get pool(): Mesh[] {
    return Object.values(this.flightPool).flat();
  }

  /** Add what gathering draws to `scene`: the loop, the flights, the worked vein's glint and cracks (the veins themselves are the Adventure's to stage). */
  addTo(scene: Scene): void {
    scene.add(this.loop.root, this.veins.overlay, ...this.pool);
  }

  /** Compile the tools', the overlay's and the loop's shaders now, not when first drawn. */
  warm(renderer: WebGLRenderer, camera: PerspectiveCamera, scene: Scene): void {
    const hidden: Object3D[] = [this.loop.root, this.veins.overlay, this.pick.model, this.knife.model, ...this.pool];
    const was = hidden.map((o) => o.visible);
    for (const o of hidden) o.visible = true;
    this.loop.root.add(this.pick.model, this.knife.model);
    renderer.compile(this.loop.root, camera, scene);
    renderer.compile(this.veins.overlay, camera, scene);
    this.pick.model.removeFromParent();
    this.knife.model.removeFromParent();
    hidden.forEach((o, i) => (o.visible = was[i]));
  }

  /** Which tools hang in the loop: each once its gathering profession is learned. */
  private hanging(): Record<ToolKind, boolean> {
    const { learned } = this.world.professions;
    return { pick: learned.includes(PROFESSION_OF.pick), knife: learned.includes(PROFESSION_OF.knife) };
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
    const hangs = this.hanging();
    const near = this.nearest(now, hangs);
    const nearestFull = Math.min(near.full.pick, near.full.knife);
    const nearestAny = this.drawn ? near.any[this.drawn] : Math.min(near.any.pick, near.any.knife);
    const loop: LoopNow = { drawn: this.drawn !== null, fighting: now.fighting, nearestFull, nearestAny };

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
    this.loop.update(this.world.frame, hangs, this.drawn);
    this.inLoop = tracked && inLoop(this.world.frame, _hand);

    // The tool goes back at once when you fall or a station takes your hands; a pull, or walking off, sends it back too.
    if (this.drawn && (!player.alive || now.station)) this.putAway('now');
    const back = putBack(loop);
    if (back === 'pulled') this.putAway('pulled');
    else if (back === 'walkedOff') this.putAway('walkedOff');

    // A grip in the loop: draw, put back, or nothing.
    const busy = this.world.handBusy() || now.station || !player.alive;
    const act = busy || !(hangs.pick || hangs.knife) ? null : loopGrip({ gripDown, inLoop: this.inLoop, speed: this.speed }, { ...loop, drawn: this.drawn !== null });
    const tool = act === 'draw' ? toolFor(near.full) : null;
    if (tool) this.draw(tool, near.spot[tool]);
    else if (act === 'putAway') this.putAway('loop');
    else if (act === 'nothing') this.nothing(now.fighting ? 'something is fighting you' : 'nothing to gather within reach');

    // It glows and ticks as the hand comes in, if it would give or take.
    const open = this.inLoop && !busy && loopOpen({ ...loop, drawn: this.drawn !== null });
    if (open && !this.wasOpenIn) this.buzz(CONFIG.professions.toolLoop.buzz.tick);
    this.wasOpenIn = open;
    this.loop.glows = open;

    // The tool at work on the spot in reach: the pick on a vein, the knife through a clump.
    this.worked = this.drawn ? this.workable(now, this.drawn) : -1;
    if (this.drawn === 'pick') {
      this.pick.update(player.rig, dt);
      if (this.worked >= 0) this.strikes(this.worked);
    } else if (this.drawn === 'knife') {
      this.knife.update(player.rig, dt);
      if (this.worked >= 0) this.cuts(this.worked);
    }
    for (const i of this.states.update(dt, _head)) this.refilled(i);
    const vein = this.drawn === 'pick' && this.worked >= 0 ? this.veinOf[this.worked] : -1;
    this.veins.update(dt, vein, vein >= 0 ? this.states.stage(this.worked) : 0, this.time);
    this.clumps.update(dt, this.time);
    this.fly(dt);
  }

  /**
   * For each tool hanging in the loop, from your head: how far the nearest
   * spot it could gather is (full) and which, and the nearest in any state.
   * Infinity (and −1) for a tool not hanging, or with no spot of its here.
   */
  private nearest(now: GatheringNow, hangs: Readonly<Record<ToolKind, boolean>>): { full: Record<ToolKind, number>; any: Record<ToolKind, number>; spot: Record<ToolKind, number> } {
    const full = { pick: Infinity, knife: Infinity };
    const any = { pick: Infinity, knife: Infinity };
    const spot = { pick: -1, knife: -1 };
    this.spots.forEach((s, i) => {
      const tool = TOOL_OF[s.kind];
      if (!hangs[tool] || s.interior !== now.interior) return;
      const d = Math.hypot(_head.x - s.x, _head.z - s.z);
      any[tool] = Math.min(any[tool], d);
      if (this.states.phase(i) !== 'taken' && d < full[tool]) {
        full[tool] = d;
        spot[tool] = i;
      }
    });
    return { full, any, spot };
  }

  /** The full spot `tool` works nearest you within the loop's reach and drawn, or −1. */
  private workable(now: GatheringNow, tool: ToolKind): number {
    let best = -1;
    let bestD: number = CONFIG.professions.toolLoop.draw;
    this.spots.forEach((s, i) => {
      if (TOOL_OF[s.kind] !== tool || s.interior !== now.interior || this.states.phase(i) === 'taken') return;
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

  private draw(tool: ToolKind, spot: number): void {
    const { player } = this.world;
    const held = tool === 'pick' ? this.pick : this.knife;
    this.drawn = tool;
    held.reset();
    player.input.hands.right.grip.add(held.model);
    player.sword.away = true;
    gatherSfx.draw(true);
    this.buzz(CONFIG.professions.toolLoop.buzz.draw);
    this.log.drawn++;
    this.note(`drew the ${tool} at ${this.spots[spot]?.id ?? 'a spot'}`);
  }

  /** The tool goes back on the loop and the sword comes back: a grip in the loop, a pull, walking off, or at once (a fall, a station). */
  private putAway(why: 'loop' | 'pulled' | 'walkedOff' | 'now'): void {
    if (!this.drawn) return;
    const B = CONFIG.professions.toolLoop.buzz;
    const tool = this.drawn;
    this.drawn = null;
    (tool === 'pick' ? this.pick : this.knife).model.removeFromParent();
    this.world.player.sword.away = false;
    if (why === 'pulled') {
      this.buzz(B.pulled);
      this.log.pulled++;
    } else if (why !== 'now') this.buzz(B.putAway);
    if (why !== 'now') gatherSfx.draw(false);
    this.log.putAway++;
    this.note(`put the ${tool} away: ${why === 'loop' ? 'in the loop' : why === 'pulled' ? 'pulled into a fight' : why === 'walkedOff' ? 'walked off' : 'hands taken'}`);
  }

  private nothing(why: string): void {
    gatherSfx.nothing();
    this.buzz(CONFIG.professions.toolLoop.buzz.nothing);
    this.log.nothing++;
    this.note(`the loop did nothing: ${why}`);
  }

  /** Each of the pick's points going into the rock of vein spot `i` this frame strikes it. */
  private strikes(i: number): void {
    const { rig } = this.world.player;
    for (const p of this.pick.points) {
      if (!p.valid) continue;
      const hit = this.veins.enters(this.veinOf[i], p.prev(rig, _a), p.now(rig, _b), _hit);
      if (hit) this.strike(i, hit, p.speed);
    }
  }

  /** Score a strike on vein spot `i` at `at` and give its feedback: sparks, a ring and a pulse sized to it, and the break. */
  strike(i: number, at: Vector3, speed: number): void {
    const V = CONFIG.professions.vein;
    const v = this.veinOf[i];
    const vein = this.veins.veins[v];
    const { gate } = this.pick;
    const { particles } = this.world;
    const inGlint = at.distanceTo(this.veins.glint(v, _g)) < V.glintRadius;
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
      this.veins.flash(v, 0xffffff, 1);
    } else {
      gatherSfx.strike(at, s.power);
      particles.burst('sparks', at, Math.round(6 + 14 * s.power), _dir);
      this.world.buzz('right', 0.45 + 0.45 * s.power, 45);
      this.veins.flash(v, 0xff9040, 0.4 + 0.6 * s.power);
    }
    this.veins.moveGlint(v);
    this.note(`${s.kind === 'glint' ? 'a strike in the glint' : 'a strike on the ore'} at ${this.spots[i].id}: ${this.states.progress(i).toFixed(2)} of ${V.need}`);
    if (struck.broke) this.shatter(i);
  }

  /** Vein spot `i` bursts in copper rubble, goes dark, and what it gives flies to your bag. */
  private shatter(i: number): void {
    const vein = this.veins.veins[this.veinOf[i]];
    const { particles } = this.world;
    this.veins.setTaken(this.veinOf[i], true);
    gatherSfx.crack(vein.ore);
    this.world.buzz('right', 1, 150);
    particles.burst('bone', vein.ore, 14, vein.normal, 0xb0643a);
    particles.burst('dust', vein.ore, 10, undefined, 0x8a857c);
    this.log.broken++;
    this.note(`broke ${this.spots[i].id} in ${this.states.strikes(i)} strikes`);
    this.loose(i, _a.copy(vein.ore).addScaledVector(vein.normal, 0.08), CONFIG.professions.vein.flight);
    this.world.apply(this.world.professions.gather(this.spots[i].kind), vein.ore);
  }

  /** What spot `i` gives comes loose round `at`, and after a beat of `wait` s flies off to the bag. */
  private loose(i: number, at: Vector3, wait: number): void {
    (this.flightPool[this.spots[i].kind] ?? []).forEach((mesh, k) => {
      if (this.flights.some((f) => f.mesh === mesh)) return;
      mesh.position.copy(at);
      mesh.position.x += (k - 1.5) * 0.06;
      mesh.position.y += 0.04 * k;
      mesh.scale.setScalar(1);
      mesh.visible = true;
      this.flights.push({ mesh, from: mesh.position.clone(), wait: wait + k * 0.08, t: 0 });
    });
  }

  /** Each point along the knife's edge passing through the clump at spot `i` this frame cuts it: through the stems, the leaves, or only a brush. */
  private cuts(i: number): void {
    const { rig } = this.world.player;
    const { foot } = this.clumps.clumps[this.clumpOf[i]];
    let stems = false;
    let leaves = false;
    for (const p of this.knife.points) {
      if (!p.valid) continue;
      p.prev(rig, _a);
      p.now(rig, _b);
      for (let k = 0; k <= 4; k++) {
        _l.lerpVectors(_a, _b, k / 4).sub(foot);
        const band = bandAt(_l.x, _l.y, _l.z);
        if (band === 'stems') stems = true;
        else if (band === 'leaves') leaves = true;
      }
    }
    const { gate } = this.knife;
    const kind = scoreCut({ committed: gate.committed, speed: this.knife.tip.speed, stems, leaves });
    if (kind) this.cut(i, kind, gate.count);
  }

  /** A pass of the knife through the clump at spot `i` during swing `swing`, and its feedback: it takes it, trims a leaf, or brushes it. */
  cut(i: number, kind: CutKind, swing: number): void {
    const c = this.clumpOf[i];
    const clump = this.clumps.clumps[c];
    const { particles } = this.world;
    if (kind === 'brush') {
      this.clumps.brush(c);
      if (this.time - this.lastRustle < RUSTLE_EVERY) return;
      this.lastRustle = this.time;
      gatherSfx.rustle(clump.heart);
      this.log.brushed++;
      return;
    }
    const cut = this.states.cut(i, kind, swing);
    if (!cut.counted) return;
    const green = clump.plan.kind === 'hearthleaf' ? 0x7ea83a : 0x5b3280;
    if (!cut.took) {
      gatherSfx.slice(clump.heart, false);
      this.world.buzz('right', 0.3, 25);
      particles.burst('bone', clump.heart, 5, undefined, green);
      this.clumps.trim(c, Math.min(this.states.trims(i), LEAVES[clump.plan.kind] - CONFIG.professions.clump.leavesLeft));
      this.world.say('Cut lower', clump.heart);
      this.log.trimmed++;
      this.note(`trimmed a leaf at ${clump.plan.id}: cut too high`);
      return;
    }
    gatherSfx.slice(clump.foot, true);
    this.world.buzz('right', 0.6, 40);
    particles.burst('bone', _a.copy(clump.foot).setY(clump.foot.y + 0.05), 6, undefined, green);
    this.clumps.setTaken(c, true);
    this.log.cut++;
    this.note(`cut ${clump.plan.id} through the stems`);
    this.loose(i, clump.heart, CONFIG.professions.clump.flight);
    this.world.apply(this.world.professions.gather(clump.plan.kind), clump.heart);
  }

  private refilled(i: number): void {
    const vein = this.veinOf[i];
    const at = vein >= 0 ? this.veins.veins[vein].ore : this.clumps.clumps[this.clumpOf[i]].foot;
    if (vein >= 0) this.veins.setTaken(vein, false);
    else this.clumps.setTaken(this.clumpOf[i], false);
    gatherSfx.refill(at);
    this.world.particles.burst('dust', at, 8, undefined, 0x8a857c);
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
