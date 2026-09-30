import { AdditiveBlending, Color, Group, Mesh, MeshBasicMaterial, SphereGeometry, TorusGeometry } from 'three';
import { CONFIG } from '../../config';
import { ModelBuilder } from '../../models/kit';
import { sharedModelMaterial } from '../../models/materials';
import { PAL } from '../../models/palette';
import { type BeltFrame, TOOL_LOOP } from '../../player/beltZones';
import type { ToolKind } from './loop';

// The tool loop, drawn: a leather ring behind your sword hip with the pick's
// handle and the knife's hilt hanging in it, butts up, so a glance down finds
// them (issues/02-tools-on-the-belt.md): each once its profession's learned.
// It hangs from the belt's frame, as the potion slots do, and glows while
// your hand is in it and it would give or take.

export class ToolLoopView {
  readonly root = new Group();
  private readonly ring: Mesh;
  /** The pick's handle and the knife's hilt, each hanging while its tool isn't in your hand. */
  private readonly handles: Record<ToolKind, Mesh>;
  private readonly glow: Mesh<SphereGeometry, MeshBasicMaterial>;

  constructor() {
    this.root.name = 'tool loop';
    const material = sharedModelMaterial();
    const ring = new ModelBuilder(31).shape(new TorusGeometry(0.06, 0.009, 5, 12), { color: PAL.leather, rot: [Math.PI / 2, 0, 0] });
    this.ring = new Mesh(ring.build(), material);
    const pick = new ModelBuilder(37)
      .cyl(0.015, 0.017, 0.22, 6, { color: PAL.wood, at: [0.025, 0.02, 0] })
      .box(0.03, 0.03, 0.05, { color: PAL.iron, at: [0.025, -0.1, 0] });
    const knife = new ModelBuilder(39)
      .cyl(0.014, 0.014, 0.1, 6, { color: PAL.leather, at: [-0.03, 0.03, 0] })
      .box(0.028, 0.01, 0.018, { color: PAL.iron, at: [-0.03, -0.025, 0] });
    this.handles = { pick: new Mesh(pick.build(), material), knife: new Mesh(knife.build(), material) };
    this.glow = new Mesh(
      new SphereGeometry(CONFIG.professions.toolLoop.radius * 0.6, 12, 8),
      new MeshBasicMaterial({ color: new Color(0xffc070), transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false }),
    );
    this.glow.visible = false;
    this.root.add(this.ring, this.handles.pick, this.handles.knife, this.glow);
    this.root.visible = false;
  }

  /** Hang it where the belt's frame puts the loop now: shown with a tool on it (`hangs`), each tool there unless it's `drawn`. */
  update(frame: BeltFrame, hangs: Readonly<Record<ToolKind, boolean>>, drawn: ToolKind | null): void {
    this.root.visible = hangs.pick || hangs.knife;
    if (!this.root.visible) return;
    frame.place(TOOL_LOOP, this.root.position);
    this.root.rotation.set(0, frame.yaw + Math.PI, 0);
    this.root.updateMatrixWorld(true);
    for (const tool of ['pick', 'knife'] as const) this.handles[tool].visible = hangs[tool] && drawn !== tool;
  }

  /** Glowing: your hand is in it and it would give or take. */
  set glows(on: boolean) {
    this.glow.visible = on;
  }
}
