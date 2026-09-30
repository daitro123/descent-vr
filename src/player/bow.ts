import { BufferGeometry, Color, Float32BufferAttribute, Group, Line, LineBasicMaterial, Matrix4, Mesh, type Object3D, Vector3 } from 'three';
import { CONFIG } from '../config';
import { ModelBuilder } from '../models/kit';
import { createModelMaterial, sharedModelMaterial } from '../models/materials';
import { PAL } from '../models/palette';

// The ranger's bow (.scratch/abilities/spec.md, "The ranger"; promoted from
// the ranger prototype's kept variant, issues/05): in the left hand, drawn
// with the right. Touch the string's middle half with the draw hand and hold
// the trigger to nock; the string follows the hand back, no further than full
// draw. The arrow flies from the nock through the rest, so both hands aim.

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
  const { limb: L, brace: B } = CONFIG.ranger.bow;
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
 * Its parts are in world space, under the scene.
 */
export class Bow {
  readonly root = new Group();
  private readonly string: Line;
  private readonly stringPos: Float32BufferAttribute;
  private readonly nockedArrow: Mesh;
  /** The nocked arrow's own material, to glow while it's powered. */
  private readonly arrowMaterial = createModelMaterial();
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
  /** An arrow is on the string. */
  nocked = false;
  /** The bow is in the hand and the hand is tracked. */
  tracked = false;

  constructor(parent: Object3D, arrow: BufferGeometry) {
    this.root.add(new Mesh(bowGeometry(), sharedModelMaterial()));
    const g = new BufferGeometry();
    this.stringPos = new Float32BufferAttribute(new Float32Array(9), 3);
    g.setAttribute('position', this.stringPos);
    this.string = new Line(g, new LineBasicMaterial({ color: 0xd8d0b8 }));
    this.string.frustumCulled = false;
    this.nockedArrow = new Mesh(arrow, this.arrowMaterial);
    this.nockedArrow.visible = false;
    parent.add(this.root, this.string, this.nockedArrow);
  }

  /** The nocked arrow glows in `colour` (Power Shot), or not (null). */
  glow(colour: number | null): void {
    const e = this.arrowMaterial.emissive as Color;
    if (colour === null) e.setRGB(0, 0, 0);
    else e.setHex(colour).multiplyScalar(0.9);
  }

  /**
   * Place the bow on the bow hand's grip, facing away from `head`; `hand` is
   * the draw hand. `shown` false (no bow worn, tools in hand) puts it away.
   */
  update(bowGrip: Object3D, head: Vector3, hand: Vector3, shown = true): void {
    const B = CONFIG.ranger.bow;
    this.tracked = shown && bowGrip.visible;
    this.root.visible = this.string.visible = this.tracked;
    if (!this.tracked) {
      this.nocked = false;
      this.draw = 0;
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

    this.rest.copy(this.grip).addScaledVector(this.up, B.rest);
    this.stringRest.copy(this.rest).addScaledVector(this.forward, -B.brace);
    this.topTip.copy(this.grip).addScaledVector(this.up, B.limb).addScaledVector(this.forward, -B.brace);
    this.bottomTip.copy(this.grip).addScaledVector(this.up, -B.limb).addScaledVector(this.forward, -B.brace);

    if (this.nocked) {
      // The string follows the hand back, no further than full draw.
      _v.subVectors(hand, this.rest);
      const pull = Math.min(_v.length(), B.fullDraw);
      if (_v.lengthSq() < 1e-6) _v.copy(this.forward).negate();
      this.nock.copy(this.rest).addScaledVector(_v.normalize(), pull);
      this.draw = drawOf(pull);
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

  /** Is the draw hand close enough to the string's middle half to nock? */
  canNock(hand: Vector3): boolean {
    if (!this.tracked) return false;
    _v.subVectors(this.bottomTip, this.topTip);
    const t = Math.max(0.25, Math.min(0.75, _w.subVectors(hand, this.topTip).dot(_v) / _v.lengthSq()));
    _w.copy(this.topTip).addScaledVector(_v, t);
    return _w.distanceTo(hand) <= CONFIG.ranger.bow.nockReach;
  }

  /** Which way a loosed arrow flies: from the nock through the rest. */
  aim(out: Vector3): Vector3 {
    return out.subVectors(this.rest, this.nock).normalize();
  }
}

/** How far drawn a string pulled `pull` m back from the rest is: 0 at the brace, 1 at full draw. */
export function drawOf(pull: number): number {
  const { brace, fullDraw } = CONFIG.ranger.bow;
  return Math.max(0, Math.min(1, (pull - brace) / (fullDraw - brace)));
}
