import { Euler, Group, type Object3D, Quaternion, Vector3 } from 'three';
import { CONFIG } from '../../config';
import { createModelMaterial } from '../../models/materials';
import { buildPerson, PEOPLE } from '../../models/people';
import { blendPoses, type Pose, type Rig } from '../../models/rig';
import { friendlyPose } from '../../people/poses';
import { type WorkLoop, workLoop } from '../../people/work';

// The herbalist: a new friendly character in the human body, at the alchemy
// bench's end in the house by the well. Like the villagers they work (tying
// Hearthleaf into bundles), and stop to look at you while you're near. They
// hang from the house's room, so they're drawn only while the house is, in one
// draw call. No quests or barks yet: they become a trainer later
// (.scratch/professions/issues/18-trainers-and-intro-quests.md).

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Is `o` drawn: it and everything it hangs from visible? */
function drawn(o: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
const towards = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export class Herbalist {
  /** Their feet on the floor, facing along +Z: the bench hangs it where they stand. */
  readonly root = new Group();
  readonly rig: Rig;
  private readonly work: WorkLoop = workLoop('herbalist');
  private clock = 0;
  private breath = 0;
  /** 0 at work to 1 stopped and looking at you. */
  private attend = 0;
  private look = 0;

  constructor() {
    this.root.name = 'herbalist';
    this.rig = buildPerson('herbalist', createModelMaterial());
    this.root.add(this.rig.mesh);
    this.pose(Infinity, 0);
  }

  /** One frame, with your head at `you` (world). */
  update(dt: number, you: Vector3): void {
    const V = CONFIG.villagers;
    const at = this.root.getWorldPosition(_at);
    const far = Math.hypot(you.x - at.x, you.z - at.z);
    const near = drawn(this.root) && far < V.notice;
    this.attend = clamp(this.attend + (near ? 1 : -1) * V.attend * dt, 0, 1);
    this.clock += dt * (1 - this.attend);
    this.breath += dt;
    // Where you are, round from the way they face.
    const yaw = _turn.setFromQuaternion(this.root.getWorldQuaternion(_q), 'YXZ').y;
    const want = near ? clamp(towards(yaw, Math.atan2(you.x - at.x, you.z - at.z)), -V.look.head - V.look.chest, V.look.head + V.look.chest) : 0;
    this.look += (want - this.look) * Math.min(1, dt * V.look.rate);
    this.pose(far, you.y - at.y);
  }

  /** Their work, blended to standing easy as they attend to you, the head (and chest) turned your way. */
  private pose(far: number, up: number): void {
    const V = CONFIG.villagers;
    const working = this.work.at(this.clock);
    const a = this.attend;
    const pose = friendlyPose(blendPoses(working.pose, PEOPLE.herbalist.stand, a, {}), this.breath) as Record<string, [number, number, number]>;
    const turned = clamp(this.look, -V.look.head, V.look.head);
    const spine = (pose.spine ??= [0, 0, 0]);
    spine[1] += this.look - turned;
    const h = (pose.head ??= [0, 0, 0]);
    h[1] += turned;
    const headY = this.rig.proportions.hipY + 0.06 + this.rig.proportions.neck + 0.12;
    if (Number.isFinite(far) && far > 0.1) h[0] = h[0] * (1 - a) + a * clamp(-Math.atan2(up - headY, far), -0.3, 0.3);
    this.rig.apply(pose as Pose);
  }
}

const _at = new Vector3();
const _q = new Quaternion();
const _turn = new Euler();
