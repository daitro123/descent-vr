import { type Camera, Group, type Material, type Object3D, type Scene, Vector3, type WebGLRenderer } from 'three';
import type { AdventureState } from '../adventureState';
import { CONFIG } from '../config';
import type { VillagerSpot } from '../maps/types';
import { createModelMaterial } from '../models/materials';
import { buildPerson, PEOPLE } from '../models/people';
import { blendPoses, type Pose, type Rig } from '../models/rig';
import type { VillagerId } from '../quests';
import { Card, FONT, parchment, wrap } from '../ui/card';
import type { Ground } from '../world/ground';
import { BarkRule } from './barks';
import { friendlyPose } from './poses';
import { strikesBetween, type WorkLoop, workLoop } from './work';

// The village's people at work: the innkeeper behind the inn's bar, the smith
// at the anvil and the farmer by the well (.scratch/oakvale-starting-zone/spec.md,
// "Friendly characters"). Each plays their working loop (people/work.ts), turns
// their head to follow you when you come near, stopping work while you're
// there, and barks a line for where the chain stands on a small panel over
// their head. Each is one draw call, and their bark one more while it shows.

const _hand = new Vector3();
const _at = new Vector3();

/** Is `o` drawn: it and everything it hangs from visible? */
function drawn(o: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** The shorter way from `from` to `to`, in radians. */
const towards = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** Card size, metres, and how finely it's drawn. */
const BARK = { w: 1.1, h: 0.33, ppm: 850 };

/** One villager at their spot. */
export class Villager {
  readonly root = new Group();
  /** The circle nothing walks through: stand it in the World. */
  readonly body: { readonly x: number; readonly z: number; readonly r: number };
  /** Head centre above their feet. */
  readonly headY: number;
  /** Their line, on a panel over their head while it shows. */
  readonly bark = new Card(BARK.w, BARK.h, { ppm: BARK.ppm });
  readonly rig: Rig;
  readonly work: WorkLoop;
  /** Seconds into their work: it stands still while they attend to you. */
  clock = 0;
  /** 0 at work to 1 stopped and looking at you. */
  attend = 0;
  /** How far round they look (rad, + to their left), eased. */
  look = 0;
  private breath = 0;

  constructor(
    readonly spot: VillagerSpot,
    ground: Ground,
    material: Material,
  ) {
    const { id } = spot;
    this.rig = buildPerson(id, material);
    const p = this.rig.proportions;
    this.headY = p.hipY + 0.06 + p.neck + 0.12;
    this.work = workLoop(id, spot.turn);
    this.root.name = id;
    this.root.position.set(spot.x, ground.heightAt(spot.x, spot.z), spot.z);
    this.root.rotation.y = spot.yaw;
    this.root.add(this.rig.mesh, this.bark.mesh);
    this.bark.mesh.name = `${id}-bark`;
    this.bark.mesh.visible = false;
    this.body = { x: spot.x, z: spot.z, r: CONFIG.villagers.radius };
    // Villagers each start at their own point in their loop, so the village doesn't move in step.
    this.clock = (this.work.duration * (PEOPLE[id].seed % 7)) / 7;
    this.pose(0);
  }

  get id(): VillagerId {
    return this.spot.id;
  }

  /** Is the villager drawn? One indoors only while its room is. */
  get shown(): boolean {
    return drawn(this.root);
  }

  /** How far your head is from them, on the floor plane. */
  far(you: Vector3): number {
    return Math.hypot(you.x - this.root.position.x, you.z - this.root.position.z);
  }

  /**
   * One frame: at work, or stopped and looking at you while you're within
   * `notice` m. Returns how many of the smith's blows landed this frame.
   */
  update(dt: number, you: Vector3): number {
    const V = CONFIG.villagers;
    const far = this.shown ? this.far(you) : Infinity;
    const near = far < V.notice;
    this.attend = clamp(this.attend + (near ? 1 : -1) * V.attend * dt, 0, 1);
    const was = this.clock;
    this.clock += dt * (1 - this.attend);
    // A blow half-stopped by your coming doesn't ring.
    const blows = this.attend < 0.3 ? strikesBetween(this.work, was, this.clock) : 0;
    this.breath += dt;

    // Where you are, round from where they face at their work.
    const dx = you.x - this.root.position.x;
    const dz = you.z - this.root.position.z;
    const want = near ? clamp(towards(this.spot.yaw, Math.atan2(dx, dz)), -V.look.head - V.look.chest, V.look.head + V.look.chest) : 0;
    this.look += (want - this.look) * Math.min(1, dt * V.look.rate);
    this.pose(far, you.y - this.root.position.y - this.headY);
    this.faceBark(you);
    return blows;
  }

  /** Their pose: their work, blended to standing easy as they attend to you, with the head (and chest) turned your way. */
  private pose(far: number, up = 0): void {
    const V = CONFIG.villagers;
    const working = this.work.at(this.clock);
    const a = this.attend;
    // Breathing, at work or standing easy.
    const pose = friendlyPose(blendPoses(working.pose, PEOPLE[this.id].stand, a, {}), this.breath) as Record<string, [number, number, number]>;
    const head = V.look.head;
    const turned = clamp(this.look, -head, head);
    const chest = this.look - turned;
    const spine = (pose.spine ??= [0, 0, 0]);
    spine[1] += chest;
    const h = (pose.head ??= [0, 0, 0]);
    h[1] += turned;
    // And a little up or down to your eyes, while they look at you.
    if (Number.isFinite(far) && far > 0.1) h[0] = h[0] * (1 - a) + a * clamp(-Math.atan2(up, far), -0.3, 0.3);
    this.rig.apply(pose as Pose);
    this.rig.setHipOffset(working.hip[0] * (1 - a), working.hip[1] * (1 - a), working.hip[2] * (1 - a));
    this.root.rotation.y = this.spot.yaw + working.turn * (1 - a);
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
    const label = PEOPLE[this.id].label;
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
    this.all = spots.map((spot) => new Villager(spot, ground, createModelMaterial()));
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

  /** One frame, with your head at `you` and the chain where `state` says. */
  update(dt: number, you: Vector3, state: Pick<AdventureState, 'bark'>): void {
    this.all.forEach((v, i) => {
      const blows = v.update(dt, you);
      if (blows && this.onStrike) this.onStrike(v.rig.bones.handR.getWorldPosition(_hand));
      this.far[i] = v.shown ? v.far(you) : Infinity;
    });
    for (const i of this.rule.update(dt, this.far)) this.all[i].say(state.bark(this.all[i].id));
    this.all.forEach((v, i) => {
      if (!this.rule.showing(i) && v.bark.mesh.visible) v.say(null);
    });
  }
}
