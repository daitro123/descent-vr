import { BufferGeometry, Float32BufferAttribute, Group, Line, LineBasicMaterial, Matrix4, Mesh, type Object3D, Vector3 } from 'three';
import { ModelBuilder } from '../../models/kit';
import { sharedModelMaterial } from '../../models/materials';
import { PAL } from '../../models/palette';

// PROTOTYPE (abilities ticket 05, "How the ranger fights"): throwaway code
// behind `?arena&class=ranger`. The ranger's bow in the left hand, drawn with
// the right: touch the string and hold the trigger to nock, pull back, let go.

/** The bow's numbers, in metres. */
export const BOW = {
  /** From the grip to each limb's tip, along the fist. */
  limb: 0.66,
  /** How far behind the grip the string sits at rest (brace height). */
  brace: 0.16,
  /** Pull from the arrow rest to the nock at full draw. */
  fullDraw: 0.62,
  /** The arrow rest sits this far above the fist. */
  rest: 0.05,
  /** The draw hand nocks within this of the string. */
  nockReach: 0.13,
  /** Least draw that looses an arrow; less puts it away. */
  minDraw: 0.15,
};

const _m = new Matrix4();
const _v = new Vector3();
const _w = new Vector3();

/** Along +Z with the tip at the origin, as the enemies' arrows (combat/projectiles.ts). */
export function arrowGeometry(): BufferGeometry {
  const b = new ModelBuilder(3);
  b.box(0.012, 0.012, 0.62, { at: [0, 0, -0.31], color: PAL.wood })
    .cone(0.018, 0.06, 4, { at: [0, 0, 0.02], rot: [Math.PI / 2, 0, 0], color: PAL.iron })
    .box(0.002, 0.04, 0.09, { at: [0, 0.012, -0.57], color: 0x2f6a3a })
    .box(0.04, 0.002, 0.09, { at: [0, 0, -0.57], color: 0x2f6a3a });
  return b.build();
}

/** A recurve in its own frame: +Y up the limb, −Z the way the arrow flies, the string at +Z. */
function bowGeometry(): BufferGeometry {
  const L = BOW.limb;
  const B = BOW.brace;
  const b = new ModelBuilder(5);
  // The limbs bow forward of the grip and sweep back to the tips, where the string ties on.
  const pts: [number, number][] = [
    [0, -0.03],
    [0.18, -0.045],
    [0.38, -0.02],
    [0.56, 0.06],
    [L, B],
  ];
  for (const s of [1, -1]) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [y0, z0] = pts[i];
      const [y1, z1] = pts[i + 1];
      const w = 0.034 - i * 0.005;
      b.bar([0, s * y0, z0], [0, s * y1, z1], w, 0.02, { color: i % 2 ? PAL.woodDark : PAL.wood });
    }
  }
  b.box(0.04, 0.12, 0.045, { at: [0, 0, -0.03], color: PAL.leather });
  return b.build();
}

/**
 * The bow and its string, placed each frame from the bow hand: the limb runs
 * along the fist (grip −Z), and the belly faces away from your head, so the
 * string always comes back towards you whichever way the hand is turned.
 */
export class RangerBow {
  readonly root = new Group();
  private readonly body: Mesh;
  private readonly string: Line;
  private readonly stringPos: Float32BufferAttribute;
  private readonly nockedArrow: Mesh;
  /** World frame this frame. */
  readonly grip = new Vector3();
  readonly up = new Vector3(0, 1, 0);
  readonly forward = new Vector3(0, 0, -1);
  /** Where the arrow sits on the bow, and the string's middle at rest. */
  readonly rest = new Vector3();
  readonly stringRest = new Vector3();
  readonly topTip = new Vector3();
  readonly bottomTip = new Vector3();
  /** Where the string is pulled to (the nock), world. */
  readonly nock = new Vector3();
  /** 0 at rest to 1 at full draw. */
  draw = 0;
  nocked = false;
  tracked = false;

  constructor(parent: Object3D, arrow: BufferGeometry) {
    this.body = new Mesh(bowGeometry(), sharedModelMaterial());
    this.root.add(this.body);
    const g = new BufferGeometry();
    this.stringPos = new Float32BufferAttribute(new Float32Array(9), 3);
    g.setAttribute('position', this.stringPos);
    this.string = new Line(g, new LineBasicMaterial({ color: 0xd8d0b8 }));
    this.string.frustumCulled = false;
    this.nockedArrow = new Mesh(arrow, sharedModelMaterial());
    this.nockedArrow.visible = false;
    parent.add(this.root, this.string, this.nockedArrow);
  }

  /** Place the bow on the bow hand's grip, facing away from `head`; `hand` is the draw hand. */
  update(bowGrip: Object3D, head: Vector3, hand: Vector3): void {
    this.tracked = bowGrip.visible;
    this.root.visible = this.string.visible = this.tracked;
    if (!this.tracked) {
      this.nockedArrow.visible = false;
      return;
    }
    bowGrip.updateWorldMatrix(true, false);
    bowGrip.getWorldPosition(this.grip);
    // Up the limb: the fist's line, pinky to thumb.
    this.up.set(0, 0, -1).transformDirection(bowGrip.matrixWorld);
    // Belly away from you: head → hand, with the limb's own direction taken out.
    this.forward.subVectors(this.grip, head);
    this.forward.addScaledVector(this.up, -this.forward.dot(this.up));
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();
    _v.crossVectors(this.up, _w.copy(this.forward).negate()); // side = up × back
    _m.makeBasis(_v, this.up, _w);
    this.root.position.copy(this.grip);
    this.root.quaternion.setFromRotationMatrix(_m);

    this.rest.copy(this.grip).addScaledVector(this.up, BOW.rest);
    this.stringRest.copy(this.rest).addScaledVector(this.forward, -BOW.brace);
    this.topTip.copy(this.grip).addScaledVector(this.up, BOW.limb).addScaledVector(this.forward, -BOW.brace);
    this.bottomTip.copy(this.grip).addScaledVector(this.up, -BOW.limb).addScaledVector(this.forward, -BOW.brace);

    if (this.nocked) {
      // The string follows the hand back, no further than full draw.
      _v.subVectors(hand, this.rest);
      const pull = Math.min(_v.length(), BOW.fullDraw);
      if (_v.lengthSq() < 1e-6) _v.copy(this.forward).negate();
      this.nock.copy(this.rest).addScaledVector(_v.normalize(), pull);
      this.draw = Math.max(0, Math.min(1, (pull - BOW.brace) / (BOW.fullDraw - BOW.brace)));
    } else {
      this.nock.copy(this.stringRest);
      this.draw = 0;
    }
    const p = this.stringPos;
    p.setXYZ(0, this.topTip.x, this.topTip.y, this.topTip.z);
    p.setXYZ(1, this.nock.x, this.nock.y, this.nock.z);
    p.setXYZ(2, this.bottomTip.x, this.bottomTip.y, this.bottomTip.z);
    p.needsUpdate = true;

    this.nockedArrow.visible = this.nocked;
    if (this.nocked) {
      // Tip just past the rest, nock on the string.
      _v.subVectors(this.rest, this.nock).normalize();
      this.nockedArrow.position.copy(this.nock).addScaledVector(_v, 0.62);
      this.nockedArrow.quaternion.setFromUnitVectors(_w.set(0, 0, 1), _v);
    }
  }

  /** Is the draw hand close enough to the string to nock? */
  canNock(hand: Vector3): boolean {
    if (!this.tracked) return false;
    // Anywhere along the string's middle half counts.
    _v.subVectors(this.bottomTip, this.topTip);
    const t = Math.max(0.25, Math.min(0.75, _w.subVectors(hand, this.topTip).dot(_v) / _v.lengthSq()));
    _w.copy(this.topTip).addScaledVector(_v, t);
    return _w.distanceTo(hand) <= BOW.nockReach;
  }

  /** Which way a loosed arrow flies: from the nock through the rest. */
  aim(out: Vector3): Vector3 {
    return out.subVectors(this.rest, this.nock).normalize();
  }
}
