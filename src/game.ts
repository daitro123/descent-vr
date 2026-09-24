import { type PerspectiveCamera, type Scene, Vector3, type WebGLRenderer } from 'three';
import { Combat, combatStats } from './combat/combat';
import { CONFIG } from './config';
import { Enemy, type EnemyContext } from './enemies/enemy';
import { FloatingText } from './fx/floatingText';
import { sfx } from './fx/sfx';
import { Shockwave } from './fx/shockwave';
import { Player } from './player/player';
import { BeltHud } from './ui/beltHud';
import { Arena } from './world/arena';
import { Orbs } from './world/orbs';

type Phase = 'intermission' | 'fighting' | 'dead';

const _feet = new Vector3();
const _head = new Vector3();
const _sep = new Vector3();

/** Owns every system and the wave loop. One `update(dt)` per XR frame. */
export class Game {
  readonly arena = new Arena();
  readonly player: Player;
  readonly enemies: Enemy[] = [];
  readonly combat: Combat;
  private readonly text: FloatingText;
  private readonly orbs = new Orbs();
  private readonly hud: BeltHud;
  private readonly shockwave: Shockwave;
  wave = 0;
  private phase: Phase = 'intermission';
  private phaseTime = 0;
  private hitStop = 0;
  private readonly enemyCtx: EnemyContext;

  constructor(
    private readonly scene: Scene,
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
  ) {
    scene.add(this.arena.root, this.orbs.root);
    this.player = new Player(camera, renderer, this.arena);
    scene.add(this.player.rig);
    this.text = new FloatingText(scene);
    this.hud = new BeltHud(this.player, camera);
    scene.add(this.hud.root);
    this.shockwave = new Shockwave(scene, CONFIG.ability.radius);

    this.combat = new Combat(this.player, this.text, {
      onEnemyHit: (enemy, killed) => {
        if (!killed) return;
        sfx.death();
        if (Math.random() < CONFIG.enemy.orbDropChance) this.orbs.drop(enemy.position);
      },
      onPlayerHurt: () => this.hud.flashHurt(),
      hitStop: (s) => (this.hitStop = Math.max(this.hitStop, s)),
    });

    this.enemyCtx = {
      playerFeet: new Vector3(),
      resolveStrike: (enemy) => this.combat.resolveStrike(enemy),
    };
  }

  update(dt: number): void {
    // Clamp: a dropped frame (or tab switch) shouldn't teleport anything.
    dt = Math.min(dt, 1 / 30);
    this.phaseTime += dt;

    this.player.update(dt);
    const { hands } = this.player.input;
    if (hands.left.primaryPressed || hands.right.primaryPressed) {
      if (this.combat.warCry(this.enemies)) this.shockwave.trigger(this.player.feetPosition(_feet));
    }

    this.combat.updateSword(this.enemies);

    // Hit-stop freezes enemies (not the player) for a few frames on impact.
    const enemyDt = this.hitStop > 0 ? 0 : dt;
    this.hitStop = Math.max(0, this.hitStop - dt);
    this.player.feetPosition(this.enemyCtx.playerFeet);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (!enemy.update(enemyDt, this.enemyCtx)) {
        this.scene.remove(enemy.root);
        this.enemies.splice(i, 1);
      }
    }
    this.separate();

    this.orbs.update(dt, this.player);
    this.text.update(dt);
    this.shockwave.update(dt);
    this.hud.update(dt);
    this.updatePhase();
  }

  /** Keep enemies apart, out of walls, and out of the player's face. */
  private separate(): void {
    const E = CONFIG.enemy;
    const feet = this.enemyCtx.playerFeet;
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (!b.alive) continue;
        _sep.subVectors(a.position, b.position).setY(0);
        const d = _sep.length();
        if (d >= E.separation || d < 1e-6) continue;
        _sep.multiplyScalar((E.separation - d) / d / 2);
        a.position.add(_sep);
        b.position.sub(_sep);
      }
      _sep.subVectors(a.position, feet).setY(0);
      const d = _sep.length();
      const minD = E.radius + CONFIG.player.bodyRadius;
      if (d < minD && d > 1e-6) a.position.addScaledVector(_sep, (minD - d) / d);
      this.arena.resolve(a.position, E.radius);
    }
  }

  private updatePhase(): void {
    if (this.phase !== 'dead' && !this.player.alive) {
      this.setPhase('dead');
      this.banner('YOU DIED', '#c81e1e');
      return;
    }
    switch (this.phase) {
      case 'intermission':
        if (this.phaseTime >= CONFIG.waves.delay) this.startWave();
        break;
      case 'fighting':
        if (this.enemies.length === 0) {
          this.setPhase('intermission');
          this.banner(`WAVE ${this.wave} CLEAR`, '#e0d090');
        }
        break;
      case 'dead':
        if (this.phaseTime >= 4) this.restart();
        break;
    }
  }

  private startWave(): void {
    this.wave++;
    const count = CONFIG.waves.first + (this.wave - 1) * CONFIG.waves.growth;
    this.player.feetPosition(_feet);
    for (let i = 0; i < count; i++) {
      // Spread around the player, pushed out of pillars/walls.
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.8;
      const p = new Vector3(
        _feet.x + Math.sin(angle) * CONFIG.waves.spawnDistance,
        0,
        _feet.z + Math.cos(angle) * CONFIG.waves.spawnDistance,
      );
      this.arena.resolve(p, CONFIG.enemy.radius + 0.3);
      const enemy = new Enemy(p.x, p.z);
      this.enemies.push(enemy);
      this.scene.add(enemy.root);
    }
    sfx.wave();
    this.banner(`WAVE ${this.wave}`, '#e0d090');
    this.setPhase('fighting');
  }

  private restart(): void {
    for (const e of this.enemies) this.scene.remove(e.root);
    this.enemies.length = 0;
    this.orbs.clear();
    this.text.clear();
    this.player.reset();
    this.wave = 0;
    Object.assign(combatStats, { swings: 0, hits: 0, crits: 0, blocks: 0, parries: 0, hurts: 0 });
    this.setPhase('intermission');
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseTime = 0;
  }

  /** Big text floating in front of the player. */
  private banner(text: string, color: string): void {
    const cam = this.player.camera;
    cam.getWorldPosition(_head);
    const fwd = cam.getWorldDirection(new Vector3()).setY(0).normalize();
    this.text.spawn(text, _head.clone().addScaledVector(fwd, 2).setY(_head.y + 0.2), {
      color,
      scale: 0.3,
      life: 2,
      rise: 0.2,
    });
  }
}
