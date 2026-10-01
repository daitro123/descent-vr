import { type BufferGeometry, type Camera, Group, type Object3D, type Scene, Vector3, type WebGLRenderer } from 'three';
import type { AdventureState } from '../adventureState';
import { CONFIG } from '../config';
import { type FileSpot, PatrolWalk } from '../enemies/patrol';
import type { VillagerSpot } from '../maps/types';
import { BUILDS, type Build } from '../models/human';
import { createModelMaterial } from '../models/materials';
import { buildPerson, PEOPLE } from '../models/people';
import { blendPoses, type Pose, type Rig } from '../models/rig';
import { GIVERS, type GiverId, type VillagerId } from '../quests';
import { Card, FONT, parchment, wrap } from '../ui/card';
import { QuestMarker } from '../ui/questMarker';
import type { Ground } from '../world/ground';
import { BarkRule } from './barks';
import { ease, eventsBetween } from './loop';
import { friendlyPose } from './poses';
import { crouched, type Folded } from './sit';
import { cyclesOver, type MutablePose, type WalkFrame, walkFrame, walkOver } from './walk';
import { strikesBetween, type WorkLoop, workLoop } from './work';

// The village's people at work: the innkeeper behind the inn's bar, the smith
// at the anvil, the farmer by the well and the herbalist at the alchemy bench
// in the house by the well (.scratch/oakvale-starting-zone/spec.md, "Friendly
// characters"; .scratch/professions/spec.md, "Trainers and quests"). Each
// plays their working loop (people/work.ts), turns their head to follow you
// when you come near, stopping work while you're there, and barks a line for
// where the chain stands and what you've learned on a small panel over their
// head. The two trainers give quests too, with Hale's marker over their head.
// Each is one draw call, and their bark one more while it shows.

const _hand = new Vector3();
const _at = new Vector3();
const _file: FileSpot = { x: 0, z: 0, yaw: 0 };
const _walk: WalkFrame = { pose: {}, hip: [0, 0, 0] };
const _hip: [number, number, number] = [0, 0, 0];

/** Is `o` drawn: it and everything it hangs from visible? */
function drawn(o: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** The shorter way from `from` to `to`, in radians. */
const towards = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** Where a villager stands on the ground, and which way they face (rad, as `rotation.y`). */
export interface Standing {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

/** Card size, metres, and how finely it's drawn. */
const BARK = { w: 1.1, h: 0.33, ppm: 850 };

const isGiver = (id: string): id is VillagerId & GiverId => (GIVERS as readonly string[]).includes(id);

/**
 * Where a villager works, and the building they're in, if any: one of
 * Oakvale's own (`VillagerSpot`), or one a zone places by data, maybe on a
 * prop's floor (`y`, world metres: a ship's deck) rather than the ground.
 */
export type VillagerPlace<Id extends string> = Omit<VillagerSpot, 'id'> & { readonly id: Id; readonly y?: number };

/** A carrier's load: their body with it on (people/cast.ts `Wardrobe.burden`), and the pose they hold it in. */
export interface Burden {
  readonly geometry: BufferGeometry;
  readonly carry: Pose;
}

const ARMS = ['upperArmL', 'forearmL', 'handL', 'upperArmR', 'forearmR', 'handR'] as const;

/** Who a villager is: their body, their name over a bark, the pose they stand easy in, and their work. */
export interface Who {
  readonly rig: Rig;
  /** The build they're in: how they walk (people/walk.ts). */
  readonly build: Build;
  readonly label: string;
  readonly stand: Pose;
  /** How they hold what they carry as they walk, if they don't let it swing (people/walk.ts `walkOver`): a guard's polearm. */
  readonly carry?: Pose;
  readonly work: WorkLoop;
  /** How far round their work they start, 0 to 1: villagers each start at their own point, so a village doesn't move in step. */
  readonly start: number;
  /** Do they give quests, with a "!" or "?" over their head (the smith, the herbalist)? */
  readonly gives: boolean;
  /** Seated: their legs folded under them, whatever they're at (people/sit.ts). */
  readonly sit?: Folded;
  /** What they carry, if they do: on their walk out along their route and set down at its end, or as their work takes it up and sets it down. */
  readonly burden?: Burden;
}

/** One of Oakvale's own villagers: their body built afresh, their trade's work, and a marker if they give quests. */
function oakvaler(spot: VillagerSpot): Who {
  const p = PEOPLE[spot.id];
  return {
    rig: buildPerson(spot.id, createModelMaterial()),
    build: BUILDS[p.look.build],
    label: p.label,
    stand: p.stand,
    work: workLoop(spot.id, spot.turn),
    start: (p.seed % 7) / 7,
    gives: isGiver(spot.id),
  };
}

/**
 * One villager at their spot, or strolling their route: a walk there and
 * back, standing a while at each end at their work.
 */
export class Villager<Id extends string = VillagerId> {
  readonly root = new Group();
  /** The circle nothing walks through: stand it in the World. It goes where they go. */
  readonly body: { readonly x: number; readonly z: number; readonly r: number };
  private readonly solid: { x: number; z: number; r: number };
  /** Where they stand now: their spot, or on the way to or from where they stepped aside. */
  private readonly at: { x: number; z: number; yaw: number };
  /** Where they've stepped aside to, while you work at their place; null at their spot. */
  private aside: Standing | null = null;
  /** Seconds until they go back to their spot, once you've left it. */
  private backIn = 0;
  /** Head centre above their feet. */
  readonly headY: number;
  /** Their line, on a panel over their head while it shows. */
  readonly bark = new Card(BARK.w, BARK.h, { ppm: BARK.ppm });
  /** A quest giver's "!" or "?" over their head (the smith's, the herbalist's); null for the others. */
  readonly marker: QuestMarker | null;
  readonly rig: Rig;
  readonly work: WorkLoop;
  /** Seconds into their work: it stands still while they attend to you. */
  clock = 0;
  /** 0 at work to 1 stopped and looking at you. */
  attend = 0;
  /** How far round they look (rad, + to their left), eased. */
  look = 0;
  private breath = 0;
  /** 0 standing to 1 walking, eased, and how many cycles of the walk (two steps each) their legs have been round. */
  private walking = 0;
  private stride = 0;
  /** How many times their work called for a cry this frame (a stallholder's), while they weren't attending to you. */
  cried = 0;
  /** Their body without their load, and whether the load's in their hands. */
  private readonly bare: BufferGeometry;
  private laden = false;
  /** 0 standing to 1 bent to set their load down or pick it up, at a carrier's route's ends. */
  private bend = 0;
  /** The arm bones their carry sets (the sack's hand up on it): those don't swing as they walk. */
  private readonly held: readonly (typeof ARMS)[number][];
  /** Bent to set a load down: their legs, and the hips with them. */
  private readonly crouch: Folded;
  constructor(
    readonly spot: VillagerPlace<Id>,
    readonly who: Who,
    private readonly ground: Ground,
    /** Their stroll along a route, if they walk one: it goes on while they're dropped, so it's shared. */
    readonly stroll: PatrolWalk | null = null,
  ) {
    const { id } = spot;
    this.rig = who.rig;
    this.bare = this.rig.mesh.geometry;
    const carry = who.burden?.carry;
    this.held = carry ? ARMS.filter((b) => [0, 1, 2].some((i) => Math.abs((carry[b]?.[i] ?? 0) - (who.stand[b]?.[i] ?? 0)) > 0.05)) : [];
    this.crouch = crouched(who.build, 0.65, 1.0);
    const p = this.rig.proportions;
    this.headY = p.hipY + 0.06 + p.neck + 0.12;
    this.work = who.work;
    this.root.name = id;
    this.root.position.set(spot.x, this.floorAt(spot.x, spot.z), spot.z);
    this.root.rotation.y = spot.yaw;
    this.root.add(this.rig.mesh, this.bark.mesh);
    this.bark.mesh.name = `${id}-bark`;
    this.bark.mesh.visible = false;
    this.marker = who.gives ? new QuestMarker() : null;
    if (this.marker) {
      this.marker.sprite.name = `${id}-marker`;
      this.root.add(this.marker.sprite);
      this.marker.update(0, null, this.headY + CONFIG.hale.marker);
    }
    this.body = this.solid = { x: spot.x, z: spot.z, r: CONFIG.villagers.radius };
    this.at = { x: spot.x, z: spot.z, yaw: spot.yaw };
    if (stroll) this.strollOn(0);
    // Villagers each start at their own point in their loop, so the village doesn't move in step.
    this.clock = this.work.duration * who.start;
    this.pose(0);
  }

  get id(): Id {
    return this.spot.id;
  }

  /** The floor under (x, z): the prop's they stand on, or the ground. */
  private floorAt(x: number, z: number): number {
    return this.spot.y ?? this.ground.heightAt(x, z);
  }

  /** The quest giver they are, if they give quests: the smith and the herbalist. */
  get giver(): GiverId | null {
    const { id } = this;
    return this.who.gives && isGiver(id) ? id : null;
  }

  /**
   * Show `marker` over their head, bobbing: over the bark's panel while it
   * shows, so the two don't overlap.
   */
  showMarker(dt: number, marker: Parameters<QuestMarker['update']>[1]): void {
    const over = this.bark.mesh.visible ? CONFIG.villagers.bark.over + BARK.h / 2 + CONFIG.hale.marker / 2 : CONFIG.hale.marker;
    this.marker?.update(dt, marker, this.headY + over);
  }

  /** Is the villager drawn? One indoors only while its room is. */
  get shown(): boolean {
    return drawn(this.root);
  }

  /** Away from their spot: stepped aside, or on the way. (A stroller's spot is wherever their walk has got to.) */
  get away(): boolean {
    return !this.stroll && (this.aside !== null || this.at.x !== this.spot.x || this.at.z !== this.spot.z);
  }

  /**
   * Step aside to `to` while you work at their place (the smith, from the
   * anvil), or go back to it (null) a moment after you've left. They stop
   * work and watch while they're away.
   */
  stepAside(to: Standing | null): void {
    if (to) {
      this.aside = to;
      this.backIn = 0;
    } else if (this.aside && this.backIn <= 0) this.backIn = CONFIG.villagers.smith.aside.back;
  }

  /**
   * On along their route, slowing to a stop as they attend to you and walking
   * on as you go, facing the way they walk (and on past an end while they
   * stand there).
   */
  private strollOn(dt: number): void {
    const walk = this.stroll!;
    walk.step(dt * (1 - this.attend));
    walk.spot(0, _file);
    const moved = Math.hypot(_file.x - this.at.x, _file.z - this.at.z);
    // Easing into the walk as they set off, and out of it as they stop.
    const going = !walk.pausing && this.attend < 0.5 && dt > 0 ? 1 : 0;
    this.walking += (going - this.walking) * Math.min(1, dt * 5);
    this.stride += cyclesOver(moved, this.who.build);
    this.at.x = this.solid.x = _file.x;
    this.at.z = this.solid.z = _file.z;
    this.at.yaw = dt > 0 ? this.at.yaw + towards(this.at.yaw, _file.yaw) * Math.min(1, dt * 6) : _file.yaw;
    this.root.position.set(this.at.x, this.floorAt(this.at.x, this.at.z), this.at.z);
  }

  /** Walk towards where they should stand, facing the way they go and then the way it faces. */
  private walk(dt: number): void {
    if (this.stroll) return this.strollOn(dt);
    if (this.backIn > 0 && (this.backIn -= dt) <= 0) this.aside = null;
    const to = this.aside ?? this.spot;
    const dx = to.x - this.at.x;
    const dz = to.z - this.at.z;
    const d = Math.hypot(dx, dz);
    // Walking there, a step at a time, and easing back to standing once there.
    const step = CONFIG.villagers.smith.aside.speed * dt;
    this.walking += ((d > step ? 1 : 0) - this.walking) * Math.min(1, dt * 5);
    if (d === 0 && this.at.yaw === to.yaw) return;
    let yaw = to.yaw;
    if (d > step) {
      this.at.x += (dx / d) * step;
      this.at.z += (dz / d) * step;
      this.stride += cyclesOver(step, this.who.build);
      yaw = Math.atan2(dx, dz);
    } else {
      this.at.x = to.x;
      this.at.z = to.z;
    }
    const turn = towards(this.at.yaw, yaw);
    this.at.yaw = d <= step && Math.abs(turn) < 1e-3 ? to.yaw : this.at.yaw + turn * Math.min(1, dt * 6);
    this.solid.x = this.at.x;
    this.solid.z = this.at.z;
    this.root.position.set(this.at.x, this.floorAt(this.at.x, this.at.z), this.at.z);
  }

  /**
   * Whether their load is in their hands, and how far they're bent: a carrier
   * on their route has it on the way out, bends to set it down at the far
   * end and to take up another at the start; one whose work takes it up and
   * sets it down has it as their work says.
   */
  private carrying(): void {
    const { burden } = this.who;
    if (!burden) return;
    const walk = this.stroll;
    let laden: boolean;
    if (walk) {
      const { bend } = CONFIG.villagers.carry;
      const into = walk.pausing ? CONFIG.population.walk.pause - walk.restLeft : -1;
      // Down, the load changing hands at the bottom, and back up, a moment after they stop.
      const u = (into - 0.3) / bend;
      this.bend = u <= 0 || u >= 2 ? 0 : u < 1 ? ease(u) : ease(2 - u);
      laden = walk.outbound === (!walk.pausing || u < 1);
    } else laden = this.work.laden?.(this.clock) ?? false;
    if (laden === this.laden) return;
    this.laden = laden;
    this.rig.mesh.geometry = laden ? burden.geometry : this.bare;
  }

  /** How far your head is from them, on the floor plane. */
  far(you: Vector3): number {
    return Math.hypot(you.x - this.root.position.x, you.z - this.root.position.z);
  }

  /**
   * One frame: at work, or stopped and looking at you while you're within
   * `notice` m. A work everyone keeps time at together (the drill) runs on
   * `together`, the seconds everyone placed has been at it, when it's given.
   * Returns how many of the smith's blows landed this frame.
   */
  update(dt: number, you: Vector3, together?: number): number {
    const V = CONFIG.villagers;
    this.walk(dt);
    const far = this.shown ? this.far(you) : Infinity;
    // Stepped aside, they stand and watch you work.
    const near = far < V.notice || this.away;
    this.attend = clamp(this.attend + (near ? 1 : -1) * V.attend * dt, 0, 1);
    const was = this.clock;
    if (this.work.together && together !== undefined) this.clock = together;
    else this.clock += dt * (1 - this.attend);
    // A blow half-stopped by your coming doesn't ring, nor a cry called.
    const blows = this.attend < 0.3 ? strikesBetween(this.work, was, this.clock) : 0;
    this.cried = this.attend < 0.3 && this.work.cries ? eventsBetween(this.work.cries, this.work.duration, was, this.clock) : 0;
    this.carrying();
    this.breath += dt;

    // Where you are, round from where they face at their work.
    const dx = you.x - this.root.position.x;
    const dz = you.z - this.root.position.z;
    const want = near ? clamp(towards(this.at.yaw, Math.atan2(dx, dz)), -V.look.head - V.look.chest, V.look.head + V.look.chest) : 0;
    this.look += (want - this.look) * Math.min(1, dt * V.look.rate);
    this.pose(far, you.y - this.root.position.y - this.headY);
    this.faceBark(you);
    return blows;
  }

  /**
   * Their pose: their work, blended to standing easy as they attend to you,
   * with the head (and chest) turned your way; on folded legs if they sit,
   * and holding their load as they hold it while it's in their hands.
   */
  private pose(far: number, up = 0): void {
    const V = CONFIG.villagers;
    const { burden, sit } = this.who;
    // A carrier walking with their load: their work loop is their walk, the load held as they hold it.
    const loaded = this.laden && burden && this.stroll;
    const working = this.work.at(this.clock);
    const stand = this.laden && burden ? burden.carry : this.who.stand;
    // Walking, they stand easy (holding what they hold) on the walk's legs, with its swing.
    const w = this.walking;
    const a = loaded ? 1 : Math.max(this.attend, w);
    // Breathing, at work or standing easy.
    const pose = friendlyPose(blendPoses(working.pose, stand, a, {}), this.breath) as MutablePose;
    _hip.fill(0);
    if (w > 0.01) walkOver(pose, walkFrame(this.stride, this.who.build, _walk), w, _hip, this.who.carry);
    // The load held steady, not swung.
    if (this.laden && burden) for (const b of this.held) pose[b] = [...(burden.carry[b] ?? [0, 0, 0])] as [number, number, number];
    if (this.bend > 0) this.bent(pose, this.bend);
    const head = V.look.head;
    const turned = clamp(this.look, -head, head);
    const chest = this.look - turned;
    const spine = (pose.spine ??= [0, 0, 0]);
    spine[1] += chest;
    const h = (pose.head ??= [0, 0, 0]);
    h[1] += turned;
    // And a little up or down to your eyes, while they look at you.
    if (Number.isFinite(far) && far > 0.1) h[0] = h[0] * (1 - a) + a * clamp(-Math.atan2(up, far), -0.3, 0.3);
    if (sit) Object.assign(pose, sit.legs);
    this.rig.apply(pose as Pose);
    if (sit) this.rig.setHipOffset(sit.hip[0], sit.hip[1], sit.hip[2]);
    else this.rig.setHipOffset(working.hip[0] * (1 - a) + _hip[0], working.hip[1] * (1 - a) + _hip[1], working.hip[2] * (1 - a) + _hip[2]);
    this.root.rotation.y = this.at.yaw + working.turn * (1 - a);
  }

  /** `pose` bent `k` of the way down to set a load on the ground, or take one up: the knees bent, the back bent over, the arms down to it. */
  private bent(pose: MutablePose, k: number): void {
    const c = this.crouch;
    for (const [bone, r] of Object.entries(c.legs)) pose[bone] = r.map((v, i) => (pose[bone]?.[i] ?? 0) * (1 - k) + v * k) as [number, number, number];
    const lean = (pose.spine ??= [0, 0, 0]);
    lean[0] += 0.7 * k;
    for (const b of ['upperArmL', 'upperArmR'] as const) {
      const r = (pose[b] ??= [0, 0, 0]);
      r[0] = r[0] * (1 - k) - 0.7 * k;
    }
    for (const b of ['forearmL', 'forearmR'] as const) {
      const r = (pose[b] ??= [0, 0, 0]);
      r[0] = r[0] * (1 - k) - 0.3 * k;
    }
    for (let i = 0; i < 3; i++) _hip[i] += c.hip[i] * k;
  }

  /** The bark's panel over their head, turned to you. */
  private faceBark(you: Vector3): void {
    const card = this.bark.mesh;
    if (!card.visible) return;
    card.position.set(0, this.headY + CONFIG.villagers.bark.over, 0);
    card.getWorldPosition(_at);
    card.rotation.y = Math.atan2(you.x - _at.x, you.z - _at.z) - this.root.rotation.y;
  }

  /** Show `line` over their head, or hide it (null). */
  say(line: string | null): void {
    this.bark.mesh.visible = line !== null;
    if (line === null) return;
    const { label } = this.who;
    this.bark.paint(line, (c, w, h) => {
      parchment(c, w, h, 8);
      c.fillStyle = '#6a4a22';
      c.font = `bold 34px ${FONT}`;
      c.textBaseline = 'top';
      c.fillText(label, 28, 20);
      c.fillStyle = '#2a1c10';
      c.font = `42px ${FONT}`;
      wrap(c, line, w - 56)
        .slice(0, 3)
        .forEach((l, i) => c.fillText(l, 28, 66 + i * 52));
    });
  }

  /** Take them out of the world, with their bark's panel and marker (their body is whoever built it's to dispose). */
  dispose(): void {
    this.root.removeFromParent();
    this.bark.dispose();
    this.marker?.sprite.material.map?.dispose();
    this.marker?.sprite.material.dispose();
  }
}

/** A villager's stroll along `route` from where they start, at `speed` (m/s: their build's pace, human.ts `Gait`). */
export function strollFrom(
  x: number,
  z: number,
  route: readonly { readonly x: number; readonly z: number }[],
  speed: number = CONFIG.population.walk.speed,
): PatrolWalk {
  const { pause } = CONFIG.population.walk;
  return new PatrolWalk([{ x, z }, ...route], 1, { speed, pause, gap: 0 });
}

/**
 * The villagers, each hung where they're drawn: indoors from their room, which
 * shows only while its door is open or you're inside; outdoors from `root`,
 * which the Adventure hides with the outdoors. They bark by the bark rule.
 */
export class Villagers {
  /** The outdoor villagers: hide it with the outdoors. */
  readonly root = new Group();
  readonly all: readonly Villager[];
  private readonly rule: BarkRule;
  private readonly far: number[];
  /** Each blow of the smith's hammer on the anvil, where it lands: for its sound. */
  onStrike: ((at: Vector3) => void) | null = null;

  /** At `spots` on `ground`; `room(id)` is the room an indoor villager hangs from. */
  constructor(spots: readonly VillagerSpot[], ground: Ground, room: (id: NonNullable<VillagerSpot['interior']>) => Object3D) {
    this.root.name = 'villagers';
    this.all = spots.map((spot) => new Villager(spot, oakvaler(spot), ground));
    for (const v of this.all) (v.spot.interior ? room(v.spot.interior) : this.root).add(v.root);
    this.rule = new BarkRule(this.all.length);
    this.far = this.all.map(() => Infinity);
  }

  /**
   * Compile the barks' shader now (Hale's board's, both its sides): they're
   * hidden until the first shows, and a first bark shouldn't stall a frame.
   */
  warm(renderer: WebGLRenderer, camera: Camera, scene: Scene): void {
    for (const v of this.all) renderer.compile(v.bark.mesh, camera, scene);
  }

  /** Each villager by id. */
  get(id: VillagerId): Villager | undefined {
    return this.all.find((v) => v.id === id);
  }

  /** Is `id`'s bark showing? */
  barking(id: VillagerId): boolean {
    const i = this.all.findIndex((v) => v.id === id);
    return i >= 0 && this.rule.showing(i);
  }

  /** One frame, with your head at `you`, the chain where `state` says, and the givers' markers from it. */
  update(dt: number, you: Vector3, state: Pick<AdventureState, 'bark' | 'giver'>): void {
    this.all.forEach((v, i) => {
      const blows = v.update(dt, you);
      if (blows && this.onStrike) this.onStrike(v.rig.bones.handR.getWorldPosition(_hand));
      this.far[i] = v.shown ? v.far(you) : Infinity;
    });
    for (const i of this.rule.update(dt, this.far)) this.all[i].say(state.bark(this.all[i].id));
    this.all.forEach((v, i) => {
      if (!this.rule.showing(i) && v.bark.mesh.visible) v.say(null);
      const giver = v.giver;
      if (giver) v.showMarker(dt, state.giver(giver).marker);
    });
  }
}
