import { AdditiveBlending, Color, Group, Mesh, MeshBasicMaterial, SphereGeometry, TorusGeometry } from 'three';
import { CONFIG } from '../../config';
import { ModelBuilder } from '../../models/kit';
import { sharedModelMaterial } from '../../models/materials';
import { PAL } from '../../models/palette';
import { type BeltFrame, TOOL_LOOP } from '../../player/beltZones';

// The tool loop, drawn: a leather ring behind your sword hip with the pick's
// handle hanging in it, butt up, so a glance down finds it (issues/02-tools-
// on-the-belt.md). It hangs from the belt's frame, as the potion slots do,
// and glows while your hand is in it and it would give or take.

export class ToolLoopView {
  readonly root = new Group();
  private readonly ring: Mesh;
  /** The pick's handle, hanging while the pick isn't in your hand. */
  private readonly pickHandle: Mesh;
  private readonly glow: Mesh<SphereGeometry, MeshBasicMaterial>;

  constructor() {
    this.root.name = 'tool loop';
    const material = sharedModelMaterial();
    const ring = new ModelBuilder(31).shape(new TorusGeometry(0.06, 0.009, 5, 12), { color: PAL.leather, rot: [Math.PI / 2, 0, 0] });
    this.ring = new Mesh(ring.build(), material);
    const pick = new ModelBuilder(37)
      .cyl(0.015, 0.017, 0.22, 6, { color: PAL.wood, at: [0.025, 0.02, 0] })
      .box(0.03, 0.03, 0.05, { color: PAL.iron, at: [0.025, -0.1, 0] });
    this.pickHandle = new Mesh(pick.build(), material);
    this.glow = new Mesh(
      new SphereGeometry(CONFIG.professions.toolLoop.radius * 0.6, 12, 8),
      new MeshBasicMaterial({ color: new Color(0xffc070), transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false }),
    );
    this.glow.visible = false;
    this.root.add(this.ring, this.pickHandle, this.glow);
    this.root.visible = false;
  }

  /** Hang it where the belt's frame puts the loop now: shown with a tool on it (`hangs`), the pick's handle there unless it's `drawn`. */
  update(frame: BeltFrame, hangs: boolean, drawn: boolean): void {
    this.root.visible = hangs;
    if (!hangs) return;
    frame.place(TOOL_LOOP, this.root.position);
    this.root.rotation.set(0, frame.yaw + Math.PI, 0);
    this.root.updateMatrixWorld(true);
    this.pickHandle.visible = !drawn;
  }

  /** Glowing: your hand is in it and it would give or take. */
  set glows(on: boolean) {
    this.glow.visible = on;
  }
}
