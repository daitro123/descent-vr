import { type PerspectiveCamera, type Scene, Vector3, type WebGLRenderer } from 'three';
import { Combat } from './combat/combat';
import { CONFIG } from './config';
import { Camps, type You } from './enemies/camps';
import { FloatingText } from './fx/floatingText';
import { Particles } from './fx/particles';
import { sfx, updateListener } from './fx/sfx';
import { Shockwaves } from './fx/shockwave';
import { SwordTrail } from './fx/trail';
import type { Spot, Zone } from './maps/types';
import { Player } from './player/player';
import { BeltHud } from './ui/beltHud';
import { Fade } from './ui/fade';
import { Orbs } from './world/orbs';
import { BlobShadows } from './world/shadows';
import { World } from './world/world';

const _a = new Vector3();
const _b = new Vector3();

/**
 * The game at the plain URL: Oakvale, loaded into the World, with the
 * warrior's sword, shield, walk, snap turn and dash on its hills, and its
 * camps waiting to be pulled. It owns and steps everything in it, one
 * `update(dt)` per XR frame, as the arena's `Game` does for the waves. Out of
 * a fight your health comes back; a death fades to black and wakes you in the
 * village. Quests, levels and saving join it ticket by ticket
 * (.scratch/oakvale-starting-zone/).
 */
export class Adventure {
  readonly world = new World();
  readonly player: Player;
  readonly camps: Camps;
  readonly combat: Combat;
  private readonly hud: BeltHud;
  private readonly trail: SwordTrail;
  private readonly text: FloatingText;
  private readonly particles: Particles;
  private readonly shockwaves: Shockwaves;
  private readonly shadows = new BlobShadows();
  private readonly orbs = new Orbs();
  private readonly fade: Fade;
  private readonly you: You = { feet: new Vector3(), head: new Vector3(), sword: null, alive: true };
  private readonly sword = { base: new Vector3(), tip: new Vector3(), speed: 0, swing: 0 };
  private hitStop = 0;
  /** Seconds since you last took or dealt damage. */
  private calm = 0;
  private lastHp: number;
  /** Seconds since you fell, while you're down; null while you stand. */
  private deadFor: number | null = null;
  /** Seconds since you woke, while the view fades back in; null otherwise. */
  private wakingFor: number | null = null;
  private readonly respawn: Spot;

  constructor(
    scene: Scene,
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    /** Where a new character starts: Oakvale. */
    zone: Zone,
  ) {
    this.world.attach(scene, camera);
    this.world.load(zone);
    this.respawn = zone.respawns.village;
    this.player = new Player(camera, renderer, this.world);
    scene.add(this.player.rig, this.orbs.root, this.shadows.mesh);
    this.trail = new SwordTrail(scene);
    this.text = new FloatingText(scene);
    this.particles = new Particles(scene);
    this.shockwaves = new Shockwaves(scene);
    this.hud = new BeltHud(this.player, camera, { waves: false });
    scene.add(this.hud.root);
    this.fade = new Fade(camera);

    this.combat = new Combat(
      this.player,
      { text: this.text, particles: this.particles, shockwaves: this.shockwaves },
      {
        onEnemyHit: (enemy, killed) => {
          this.calm = 0;
          if (killed && Math.random() < enemy.def.orbChance) this.orbs.drop(enemy.position);
        },
        onPlayerHurt: () => this.hud.flashHurt(),
        hitStop: (s) => (this.hitStop = Math.max(this.hitStop, s)),
      },
      scene,
    );
    this.camps = new Camps(zone.camps, this.world, {
      sweep: (e, a, pb, pt, b, t) => this.combat.sweep(e, a, pb, pt, b, t),
      slam: (e, a, at) => this.combat.slam(e, a, at),
      shoot: (e, from, damage) => this.combat.shoot(e, from, damage),
      nock: (e, from, to) => this.combat.projectiles.nock(e, from, to),
      telegraph: (e, a) => {
        e.weaponSegment(_a, _b);
        sfx.windup(_b, a.blockable);
      },
    });
    scene.add(this.camps.root);

    // A new character, at the zone's start and facing Hale.
    const { x, z, yaw } = zone.spawn;
    this.player.reset(x, z, yaw);
    this.lastHp = this.player.hp;
  }

  update(dt: number): void {
    // Clamp: a dropped frame (or tab switch) shouldn't teleport anything.
    dt = Math.min(dt, 1 / 30);
    const { player, you } = this;
    this.world.update(dt, player.camera);
    player.update(dt);
    updateListener(player.camera);
    const { hands } = player.input;
    if (hands.left.primaryPressed || hands.right.primaryPressed) this.combat.warCry(this.camps.enemies);

    // Hit-stop freezes enemies (not you) for a few frames on impact.
    const enemyDt = this.hitStop > 0 ? 0 : dt;
    this.hitStop = Math.max(0, this.hitStop - dt);
    player.feetPosition(you.feet);
    player.headPosition(you.head);
    you.alive = player.alive;
    const { sword, rig } = player;
    if (sword.tip.valid && player.alive) {
      sword.segment(rig, this.sword.base, this.sword.tip);
      this.sword.speed = sword.tipSpeed;
      this.sword.swing = sword.swing.count;
      you.sword = this.sword;
    } else you.sword = null;

    this.combat.update(dt, this.camps.enemies);
    this.camps.update(enemyDt, you);
    this.combat.projectiles.render();
    this.heal(dt);
    this.updateDeath(dt);

    this.shadows.cast(you.feet, this.camps.enemies);
    if (sword.tip.valid) {
      sword.segment(rig, _a, _b);
      this.trail.update(dt, _a, _b, sword.hot, player.frenzy > 0);
    }
    this.orbs.update(dt, player);
    this.text.update(dt);
    this.particles.update(dt);
    this.shockwaves.update(dt);
    this.hud.update(dt);
  }

  /** Out of a fight for a while, your health comes back. */
  private heal(dt: number): void {
    const { player } = this;
    this.calm = player.hp < this.lastHp ? 0 : this.calm + dt;
    const { calm, refill } = CONFIG.healing;
    if (player.alive && this.calm > calm) player.heal((player.maxHp / refill) * dt);
    this.lastHp = player.hp;
  }

  /** Fall, see where for a moment, fade to black, wake in the village, fade back in. */
  private updateDeath(dt: number): void {
    const D = CONFIG.death;
    if (this.wakingFor !== null) {
      this.wakingFor += dt;
      this.fade.level = 1 - this.wakingFor / D.fadeIn;
      if (this.wakingFor >= D.fadeIn) this.wakingFor = null;
    }
    if (this.player.alive) return;
    if (this.deadFor === null) {
      this.deadFor = 0;
      this.text.banner(this.player.camera, 'YOU DIED', '#c81e1e');
    } else this.deadFor += dt;
    this.fade.level = (this.deadFor - D.linger) / D.fadeOut;
    if (this.deadFor >= D.linger + D.fadeOut + D.dark) this.wake();
  }

  /** At the village respawn point with full health and no rage. Nothing else changes. */
  private wake(): void {
    const { x, z, yaw } = this.respawn;
    this.player.reset(x, z, yaw);
    this.lastHp = this.player.hp;
    this.combat.projectiles.clear();
    this.deadFor = null;
    this.wakingFor = 0;
  }
}
