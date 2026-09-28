import { type PerspectiveCamera, type Scene, Vector3, type WebGLRenderer } from 'three';
import { Combat } from '../../combat/combat';
import { CONFIG, type EnemyConfig } from '../../config';
import { FloatingText } from '../../fx/floatingText';
import { Particles } from '../../fx/particles';
import { sfx, updateListener } from '../../fx/sfx';
import { Shockwaves } from '../../fx/shockwave';
import { SwordTrail } from '../../fx/trail';
import type { EnemyKind } from '../../models/characters';
import { Player } from '../../player/player';
import { BeltHud } from '../../ui/beltHud';
import type { Ground } from '../../world/ground';
import { Orbs } from '../../world/orbs';
import { BlobShadows } from '../../world/shadows';
import type { Enemy, EnemyContext, EnemyPost, PlayerSword } from '../enemy';
import { createEnemy } from '../kinds';
import { AttackTokens } from '../tokens';

// PROTOTYPE (Enemies in the open): Game's fight loop without the waves, on a
// zone's ground. Enemies are added and removed by whoever owns the camps.
// Health comes back after 5 s without taking or dealing damage (Progression,
// death and saving). Throwaway: the real one comes with the Oakvale build.

/** Seconds without taking or dealing damage before your health refills. */
const CALM_BEFORE_REGEN = 5;
/** Health per second while it refills. */
const REGEN = 40;

const _sep = new Vector3();
const _head = new Vector3();
const _a = new Vector3();
const _b = new Vector3();

/** A kind's config with health and every attack's damage scaled by `k`. */
function stronger(def: EnemyConfig, k: number): EnemyConfig {
  if (k === 1) return def;
  return { ...def, hp: Math.round(def.hp * k), attacks: def.attacks.map((a) => ({ ...a, damage: Math.round(a.damage * k) })) };
}

export class ZoneFight {
  readonly player: Player;
  readonly enemies: Enemy[] = [];
  readonly combat: Combat;
  readonly text: FloatingText;
  readonly particles: Particles;
  private readonly shockwaves: Shockwaves;
  private readonly trail: SwordTrail;
  private readonly shadows = new BlobShadows();
  private readonly orbs = new Orbs();
  readonly hud: BeltHud;
  meleeTokens = new AttackTokens(CONFIG.tokens.melee, CONFIG.tokens.meleeGap);
  readonly rangedTokens = new AttackTokens(CONFIG.tokens.ranged, CONFIG.tokens.rangedGap);
  readonly ctx: EnemyContext;
  private readonly sword: PlayerSword = { base: new Vector3(), tip: new Vector3(), speed: 0, swing: 0 };
  private hitStop = 0;
  /** Seconds since you last took or dealt damage. */
  calm = 0;
  /** Seconds since you died; null while alive. */
  deadFor: number | null = null;

  constructor(
    private readonly scene: Scene,
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    readonly ground: Ground,
  ) {
    scene.add(this.orbs.root, this.shadows.mesh);
    this.player = new Player(camera, renderer, ground);
    scene.add(this.player.rig);
    this.text = new FloatingText(scene);
    this.particles = new Particles(scene);
    this.shockwaves = new Shockwaves(scene);
    this.trail = new SwordTrail(scene);
    this.hud = new BeltHud(this.player, camera);
    scene.add(this.hud.root);

    this.combat = new Combat(
      this.player,
      { text: this.text, particles: this.particles, shockwaves: this.shockwaves },
      {
        onEnemyHit: (enemy, killed) => {
          this.calm = 0;
          if (killed && Math.random() < enemy.def.orbChance) this.orbs.drop(enemy.position);
        },
        onPlayerHurt: () => {
          this.calm = 0;
          this.hud.flashHurt();
        },
        hitStop: (s) => (this.hitStop = Math.max(this.hitStop, s)),
      },
      scene,
    );

    this.ctx = {
      playerFeet: new Vector3(),
      playerHead: new Vector3(),
      playerSword: null,
      ground,
      meleeTokens: this.meleeTokens,
      rangedTokens: this.rangedTokens,
      sweep: (e, a, pb, pt, b, t) => this.combat.sweep(e, a, pb, pt, b, t),
      slam: (e, a, at) => this.combat.slam(e, a, at),
      shoot: (e, from, damage) => this.combat.shoot(e, from, damage),
      nock: (e, from, to) => this.combat.projectiles.nock(e, from, to),
      summon: () => {},
      telegraph: (e, a) => {
        e.weaponSegment(_a, _b);
        sfx.windup(_b, a.blockable);
      },
    };
  }

  /** How many enemies may swing at you at once (2 in the arena). */
  setMeleeAttackers(n: number): void {
    this.meleeTokens = this.ctx.meleeTokens = new AttackTokens(n, CONFIG.tokens.meleeGap);
  }

  /** Raise an enemy at (x, z), waiting at `post`, with `strength` times today's health and damage. */
  add(kind: EnemyKind, x: number, z: number, post: EnemyPost, strength = 1): Enemy {
    const enemy = createEnemy(kind, x, z, Math.floor(Math.random() * 6), stronger(CONFIG.enemies[kind], strength));
    enemy.post = post;
    enemy.position.y = this.ground.heightAt(x, z);
    enemy.root.rotation.y = post.yaw;
    this.enemies.push(enemy);
    this.scene.add(enemy.root);
    const at = enemy.position.clone();
    this.particles.burst('dust', at, 12);
    sfx.rise(at);
    return enemy;
  }

  /** Take an enemy out of the world at once, dead or alive. */
  remove(enemy: Enemy): void {
    const i = this.enemies.indexOf(enemy);
    if (i < 0) return;
    enemy.standDown(enemy.post ?? { x: 0, z: 0, yaw: 0, evading: false });
    this.scene.remove(enemy.root);
    this.enemies.splice(i, 1);
  }

  /** Stand at (x, z) facing `yaw`, at full health. */
  respawn(x: number, z: number, yaw: number): void {
    this.player.reset(x, z, yaw);
    this.deadFor = null;
    this.calm = CALM_BEFORE_REGEN;
    this.orbs.clear();
    this.combat.projectiles.clear();
  }

  update(dt: number): void {
    dt = Math.min(dt, 1 / 30);
    this.calm += dt;
    const player = this.player;
    player.update(dt);
    updateListener(player.camera);
    const { hands } = player.input;
    if (hands.left.primaryPressed || hands.right.primaryPressed) this.combat.warCry(this.enemies);

    const enemyDt = this.hitStop > 0 ? 0 : dt;
    this.hitStop = Math.max(0, this.hitStop - dt);
    player.feetPosition(this.ctx.playerFeet);
    player.headPosition(this.ctx.playerHead);
    const { sword, rig } = player;
    if (sword.tip.valid && player.alive) {
      sword.segment(rig, this.sword.base, this.sword.tip);
      this.sword.speed = sword.tipSpeed;
      this.sword.swing = sword.swing.count;
      this.ctx.playerSword = this.sword;
    } else this.ctx.playerSword = null;

    this.combat.update(dt, this.enemies);
    this.meleeTokens.update(enemyDt);
    this.rangedTokens.update(enemyDt);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (!enemy.update(enemyDt, this.ctx)) {
        this.scene.remove(enemy.root);
        this.enemies.splice(i, 1);
      }
    }
    this.separate();
    this.combat.projectiles.render();

    // Out of the fight for a while: health comes back.
    if (player.alive && this.calm > CALM_BEFORE_REGEN) player.heal(REGEN * dt);
    if (!player.alive) {
      if (this.deadFor === null) {
        this.deadFor = 0;
        this.banner('YOU DIED', '#c81e1e');
      } else this.deadFor += dt;
    }

    this.updateShadows();
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

  /** Keep enemies apart, out of trunks and tents, and out of the player's face. */
  private separate(): void {
    const feet = this.ctx.playerFeet;
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (!b.alive) continue;
        _sep.subVectors(a.position, b.position).setY(0);
        const d = _sep.length();
        const min = a.def.radius + b.def.radius + 0.15;
        if (d >= min || d < 1e-6) continue;
        _sep.multiplyScalar((min - d) / d / 2);
        a.position.add(_sep);
        b.position.sub(_sep);
      }
      _sep.subVectors(a.position, feet).setY(0);
      const d = _sep.length();
      const minD = a.def.radius + CONFIG.player.bodyRadius;
      if (d < minD && d > 1e-6) a.position.addScaledVector(_sep, (minD - d) / d);
      this.ground.resolve(a.position, a.def.radius);
    }
  }

  private updateShadows(): void {
    this.shadows.begin();
    const feet = this.ctx.playerFeet;
    this.shadows.add(feet.x, feet.y, feet.z, 0.26);
    for (const e of this.enemies) {
      if (e.state === 'dead' && e.stateTime > 1) continue;
      const scale = e.state === 'rising' ? Math.min(1, e.stateTime * 1.5) : 1;
      this.shadows.add(e.position.x, e.position.y, e.position.z, e.def.radius * 1.1 * scale);
    }
    this.shadows.end();
  }

  /** Big text floating in front of the player. */
  banner(text: string, color: string, scale = 0.3, lift = 0.2, life = 2.2): void {
    const cam = this.player.camera;
    cam.getWorldPosition(_head);
    const fwd = cam.getWorldDirection(new Vector3()).setY(0).normalize();
    this.text.spawn(text, _head.clone().addScaledVector(fwd, 2).setY(_head.y + lift), { color, scale, life, rise: 0.2 });
  }
}
