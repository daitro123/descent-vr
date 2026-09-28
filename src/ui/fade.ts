import { BackSide, Mesh, MeshBasicMaterial, type PerspectiveCamera, SphereGeometry } from 'three';

/** The whole view fading to black and back (a death), drawn over everything round the head. */
export class Fade {
  private readonly material = new MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0,
    side: BackSide,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  private readonly mesh = new Mesh(new SphereGeometry(0.2, 12, 8), this.material);

  constructor(camera: PerspectiveCamera) {
    this.mesh.name = 'fade';
    // Over the belt, the vignette and any floating text.
    this.mesh.renderOrder = 30;
    this.mesh.visible = false;
    camera.add(this.mesh);
  }

  /** 0: the view is clear; 1: black. */
  get level(): number {
    return this.material.opacity;
  }

  set level(v: number) {
    this.material.opacity = Math.min(1, Math.max(0, v));
    this.mesh.visible = this.material.opacity > 0.001;
  }
}
