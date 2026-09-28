import { type PerspectiveCamera, type Scene, Vector3, type WebGLRenderer } from 'three';
import { updateListener } from './fx/sfx';
import { SwordTrail } from './fx/trail';
import type { Zone } from './maps/types';
import { Player } from './player/player';
import { BeltHud } from './ui/beltHud';
import { World } from './world/world';

const _a = new Vector3();
const _b = new Vector3();

/**
 * The game at the plain URL: Oakvale, loaded into the World, with the
 * warrior's sword, shield, walk, snap turn and dash on its hills. It owns and
 * steps everything in it, one `update(dt)` per XR frame, as the arena's
 * `Game` does for the waves. Nothing fights you yet: camps, quests, levels and
 * saving join it ticket by ticket (.scratch/oakvale-starting-zone/).
 */
export class Adventure {
  readonly world = new World();
  readonly player: Player;
  private readonly hud: BeltHud;
  private readonly trail: SwordTrail;

  constructor(
    scene: Scene,
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    /** Where a new character starts: Oakvale. */
    private readonly zone: Zone,
  ) {
    this.world.attach(scene, camera);
    this.world.load(zone);
    this.player = new Player(camera, renderer, this.world);
    scene.add(this.player.rig);
    this.trail = new SwordTrail(scene);
    this.hud = new BeltHud(this.player, camera, false);
    scene.add(this.hud.root);
    this.start();
  }

  /** A new character: full health, at the zone's start, facing Hale. */
  start(): void {
    const { x, z, yaw } = this.zone.spawn;
    this.player.reset(x, z, yaw);
  }

  /** Stand at (x, z) facing `yaw` (0 looks down −Z), keeping health and rage. */
  teleport(x: number, z: number, yaw = 0): void {
    this.player.place(x, z, yaw);
  }

  update(dt: number): void {
    // Clamp: a dropped frame (or tab switch) shouldn't teleport anything.
    dt = Math.min(dt, 1 / 30);
    this.player.update(dt);
    updateListener(this.player.camera);
    const { sword, rig } = this.player;
    if (sword.tip.valid) {
      sword.segment(rig, _a, _b);
      this.trail.update(dt, _a, _b, sword.hot, this.player.frenzy > 0);
    }
    this.hud.update(dt);
  }
}
