import { type Light, type Material, type Mesh, MeshBasicMaterial, type Object3D } from 'three';

// The renderer uploads a mesh's vertices the first time it draws it, and that
// upload lands in the frame the mesh is first seen. Staging moves it earlier:
// for one render the mesh is shown, uncullable, with a material that never
// draws, so the renderer uploads it and draws nothing. The next frame puts
// everything back.

/** What a staged mesh was before it was staged. */
interface Was {
  readonly mesh: Mesh;
  readonly material: Material | Material[];
  readonly frustumCulled: boolean;
}

export class Stager {
  /** Never drawn: the renderer still uploads what wears it. */
  private readonly hidden = new MeshBasicMaterial({ visible: false });
  private readonly meshes: Was[] = [];
  private readonly shown: { readonly object: Object3D; readonly visible: boolean }[] = [];

  /** Is anything staged for the next render? */
  get busy(): boolean {
    return this.meshes.length > 0;
  }

  /**
   * Upload the meshes under `root` at the next render without drawing them:
   * those hidden (by themselves or anything between them and `root`), or
   * every one if `all` (a mesh new to the scene). What's shown is left to
   * draw as it is. `root`'s own parents must be showing.
   */
  stage(root: Object3D, all = false): void {
    const visit = (o: Object3D, hidden: boolean) => {
      // A light shown for a frame would change the lit programs: leave it, and what's under it, hidden.
      if ((o as Light).isLight && !o.visible) return;
      hidden ||= !o.visible;
      if (!o.visible) this.show(o);
      // Meshes, and sprites, points and lines too: whatever draws with a material.
      if ('material' in o && (all || hidden)) {
        const mesh = o as Mesh;
        this.meshes.push({ mesh, material: mesh.material, frustumCulled: mesh.frustumCulled });
        mesh.material = this.hidden;
        mesh.frustumCulled = false;
      }
      for (const child of o.children) visit(child, hidden);
    };
    visit(root, false);
  }

  /** Put back everything the last render staged. Call before anything else reads or sets what's shown. */
  restore(): void {
    for (const { mesh, material, frustumCulled } of this.meshes) {
      mesh.material = material;
      mesh.frustumCulled = frustumCulled;
    }
    for (const { object, visible } of this.shown) object.visible = visible;
    this.meshes.length = 0;
    this.shown.length = 0;
  }

  private show(object: Object3D): void {
    this.shown.push({ object, visible: object.visible });
    object.visible = true;
  }
}
