import { type Light, type Material, type Mesh, MeshBasicMaterial, type Object3D } from 'three';

// The renderer uploads a mesh's vertices the first time it draws it, and that
// upload lands in the frame the mesh is first seen. Staging moves it earlier:
// for one render a hidden mesh is shown, uncullable, with a material that
// never draws, so the renderer uploads it and draws nothing; a shown one is
// made uncullable, so it uploads even out of view. The World asks for it,
// and it happens round the next render alone (the scene's `onBeforeRender`
// and `onAfterRender`), whatever changes what's shown in between.

/** What a staged mesh was before it was staged. */
interface Was {
  readonly material: Material | Material[];
  readonly frustumCulled: boolean;
}

export class Stager {
  /** Never drawn: the renderer still uploads what wears it. */
  private readonly hidden = new MeshBasicMaterial({ visible: false });
  /** What the next render stages, and whether every mesh under it is new (drawn nothing). */
  private readonly queued: { readonly root: Object3D; readonly all: boolean }[] = [];
  /** Each mesh staged this render, as it was before (the first time: two roots may hold it). */
  private readonly meshes = new Map<Mesh, Was>();
  private readonly shown: Object3D[] = [];

  /** Is anything waiting for the next render? */
  get busy(): boolean {
    return this.queued.length > 0;
  }

  /**
   * At the next render, upload the meshes under `root` without drawing any
   * that aren't showing: those hidden (by themselves or anything between
   * them and `root`) wear a material that never draws, or all of them if
   * `all` (a mesh new to the scene); those showing draw as they would, but
   * even out of view. `root`'s own parents must be showing.
   */
  stage(root: Object3D, all = false): void {
    this.queued.push({ root, all });
  }

  /** Just before a render: stage what's queued. */
  apply(): void {
    for (const { root, all } of this.queued) this.visit(root, false, all);
    this.queued.length = 0;
  }

  /** Just after it: put everything back. */
  restore(): void {
    for (const [mesh, { material, frustumCulled }] of this.meshes) {
      mesh.material = material;
      mesh.frustumCulled = frustumCulled;
    }
    for (const object of this.shown) object.visible = false;
    this.meshes.clear();
    this.shown.length = 0;
  }

  private visit(o: Object3D, hidden: boolean, all: boolean): void {
    // A light shown for a frame would change the lit programs: leave it, and what's under it, hidden.
    if ((o as Light).isLight && !o.visible) return;
    if (!o.visible) {
      hidden = true;
      this.shown.push(o);
      o.visible = true;
    }
    // Meshes, and sprites, points and lines too: whatever draws with a material.
    if ('material' in o) {
      const mesh = o as Mesh;
      if (!this.meshes.has(mesh)) this.meshes.set(mesh, { material: mesh.material, frustumCulled: mesh.frustumCulled });
      if (all || hidden) mesh.material = this.hidden;
      mesh.frustumCulled = false;
    }
    for (const child of o.children) this.visit(child, hidden, all);
  }
}
