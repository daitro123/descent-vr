import { type PerspectiveCamera, type Scene, Vector3, type WebGLRenderer } from 'three';
import { type ClassId, type Shape, SHAPES, slotsOf } from './classes';
import { Combat, combatStats, resetCombatStats } from './combat/combat';
import { CONFIG } from './config';
import { type Enemy, type EnemyContext, keepApart, type PlayerSword } from './enemies/enemy';
import { createEnemy, DUELIST } from './enemies/kinds';
import { AttackTokens } from './enemies/tokens';
import { FloatingText } from './fx/floatingText';
import { Particles } from './fx/particles';
import { sfx, updateListener } from './fx/sfx';
import { Shockwaves } from './fx/shockwave';
import { SwordTrail } from './fx/trail';
import { Vines } from './fx/vines';
import type { EnemyKind } from './models/characters';
import { Gestures } from './player/gestures/gestures';
import { MageHands } from './player/mage';
import { Player } from './player/player';
import { BeltHud } from './ui/beltHud';
import { Arena } from './world/arena';
import { Orbs } from './world/orbs';
import { BlobShadows } from './world/shadows';

type Phase = 'intermission' | 'fighting' | 'dead' | 'victory';

const _fwd = new Vector3();
const _a = new Vector3();
const _b = new Vector3();

/** Spawn directions relative to where the player looks: the first few arrive in view. */
const SPAWN_ANGLES = [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4, Math.PI];

/** Build a wave's spawn order: melee first so there's something to fight, then the rest interleaved. */
export function waveRoster(wave: Partial<Record<EnemyKind, number>>): EnemyKind[] {
  const order: EnemyKind[] = ['warden', 'grunt', 'brute', 'archer'];
  const counts = order.map((k) => ({ kind: k, left: wave[k] ?? 0 }));
  const out: EnemyKind[] = [];
  while (counts.some((c) => c.left > 0)) {
    for (const c of counts) {
      if (c.left > 0) {
        out.push(c.kind);
        c.left--;
      }
    }
  }
  return out;
}

/** Owns every system and the wave loop. One `update(dt)` per XR frame. */
export class Game {
  readonly arena = new Arena();
  readonly player: Player;
  readonly enemies: Enemy[] = [];
  readonly combat: Combat;
  readonly text: FloatingText;
  readonly particles: Particles;
  /** Abilities by gesture: every base ability's shape, from the start. */
  readonly gestures: Gestures;
  /** The mage's hands (bolts, the ward and the blink), when you play the mage. */
  readonly mage: MageHands | null;
  /** The shapes drawn since the page loaded: the arena keeps no save, so each hangs in the air once a visit. */
  private readonly learned = new Set<Shape>();
  private readonly shockwaves: Shockwaves;
  private readonly trail: SwordTrail;
  private readonly shadows = new BlobShadows();
  private readonly vines = new Vines();
  private readonly orbs = new Orbs();
  private readonly hud: BeltHud;
  private readonly meleeTokens = new AttackTokens(CONFIG.tokens.melee, CONFIG.tokens.meleeGap);
  private readonly rangedTokens = new AttackTokens(CONFIG.tokens.ranged, CONFIG.tokens.rangedGap);
  wave = 0;
  private phase: Phase = 'intermission';
  private phaseTime = 0;
  private hitStop = 0;
  private queue: EnemyKind[] = [];
  private spawnTimer = 0;
  private spawnIndex = 0;
  private readonly ctx: EnemyContext;
  private readonly sword: PlayerSword = { base: new Vector3(), tip: new Vector3(), speed: 0, swing: 0 };

  constructor(
    private readonly scene: Scene,
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    private readonly firstWave = 1,
    /** ?duel: endless duelists, one at a time, instead of the waves. */
    private readonly duel = false,
    /** `&class=`: the class you fight as, at level 1 with every base ability. */
    klass: ClassId = 'warrior',
  ) {
    this.wave = firstWave - 1;
    scene.add(this.arena.root, this.orbs.root, this.shadows.mesh, this.vines.mesh);
    this.player = new Player(camera, renderer, this.arena, klass);
    scene.add(this.player.rig);
    this.text = new FloatingText(scene);
    this.particles = new Particles(scene);
    this.shockwaves = new Shockwaves(scene);
    this.trail = new SwordTrail(scene);
    this.hud = new BeltHud(this.player, camera);
    scene.add(this.hud.root);
    this.hud.warm(renderer, scene);

    this.combat = new Combat(
      this.player,
      { text: this.text, particles: this.particles, shockwaves: this.shockwaves },
      {
        onEnemyHit: (enemy, killed) => {
          if (killed && Math.random() < enemy.def.orbChance) this.orbs.drop(enemy.position);
        },
        onPlayerHurt: () => this.hud.flashHurt(),
        hitStop: (s) => (this.hitStop = Math.max(this.hitStop, s)),
      },
      scene,
    );
    this.mage = klass === 'mage' ? new MageHands(this.player, this.combat, this.particles) : null;

    const slots = () => slotsOf(this.player.stats.abilities);
    this.gestures = new Gestures({
      player: this.player,
      text: this.text,
      particles: this.particles,
      slots,
      unlearned: () => {
        const held = slots();
        return SHAPES.filter((s) => held[s] !== null && !this.learned.has(s));
      },
      drawn: (shape) => this.learned.add(shape),
      use: (ability, aim) => this.combat.use(ability, aim),
      busy: () => this.combat.busy || (this.mage?.charging('right') ?? false),
    });

    this.ctx = {
      playerFeet: new Vector3(),
      playerHead: new Vector3(),
      playerSword: null,
      ground: this.arena,
      meleeTokens: this.meleeTokens,
      rangedTokens: this.rangedTokens,
      sweep: (e, a, pb, pt, b, t) => this.combat.sweep(e, a, pb, pt, b, t),
      slam: (e, a, at) => this.combat.slam(e, a, at),
      shoot: (e, from, damage) => this.combat.shoot(e, from, damage),
      nock: (e, from, to) => this.combat.projectiles.nock(e, from, to),
      summon: (e, n) => this.summon(e, n),
      telegraph: (e, a) => {
        e.weaponSegment(_a, _b);
        sfx.windup(_b, a.blockable);
      },
    };
  }

  update(dt: number): void {
    // Clamp: a dropped frame (or tab switch) shouldn't teleport anything.
    dt = Math.min(dt, 1 / 30);
    this.phaseTime += dt;

    // The arena is a fight while anything of the wave stands: mana refills slowly till it's down.
    this.player.fighting = this.enemies.some((e) => e.alive);
    this.player.update(dt);
    this.mage?.update(dt);
    updateListener(this.player.camera);
    const { hands } = this.player.input;
    if (hands.left.primaryPressed || hands.right.primaryPressed) this.combat.press(this.enemies);

    // Hit-stop freezes enemies (not the player) for a few frames on impact.
    const enemyDt = this.hitStop > 0 ? 0 : dt;
    this.hitStop = Math.max(0, this.hitStop - dt);
    this.player.feetPosition(this.ctx.playerFeet);
    this.player.headPosition(this.ctx.playerHead);
    const { sword, rig } = this.player;
    if (sword.tip.valid && this.player.alive) {
      sword.segment(rig, this.sword.base, this.sword.tip);
      this.sword.speed = sword.tipSpeed;
      this.sword.swing = sword.swing.count;
      this.ctx.playerSword = this.sword;
    } else this.ctx.playerSword = null;

    this.combat.update(dt, this.enemies);
    this.gestures.update(dt);
    this.meleeTokens.update(enemyDt);
    this.rangedTokens.update(enemyDt);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (!enemy.update(enemyDt, this.ctx)) {
        this.scene.remove(enemy.root);
        this.enemies.splice(i, 1);
      }
    }
    keepApart(this.enemies, this.ctx.playerFeet, this.arena);
    this.combat.projectiles.render();

    this.shadows.cast(this.ctx.playerFeet, this.enemies);
    this.vines.place(this.enemies);
    if (sword.tip.valid) {
      sword.segment(rig, _a, _b);
      this.trail.update(dt, _a, _b, sword.hot, this.player.frenzy > 0);
    }
    this.orbs.update(dt, this.player);
    this.text.update(dt);
    this.particles.update(dt);
    this.shockwaves.update(dt);
    this.updatePhase(dt);
    const hud = this.hud.status;
    hud.wave = this.wave;
    hud.enemiesLeft = this.queue.length;
    hud.boss = false;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      hud.enemiesLeft++;
      if (e.kind === 'warden') hud.boss = true;
    }
    this.hud.update(dt);
  }

  // ---------------------------------------------------------------- waves

  private updatePhase(dt: number): void {
    if ((this.phase === 'fighting' || this.phase === 'intermission') && !this.player.alive) {
      this.setPhase('dead');
      this.banner('YOU DIED', '#c81e1e');
      this.summary(`fell on wave ${this.wave}`);
      return;
    }
    switch (this.phase) {
      case 'intermission':
        if (this.phaseTime >= CONFIG.waves.delay) this.startWave();
        break;
      case 'fighting':
        this.spawnTimer -= dt;
        if (this.queue.length && this.spawnTimer <= 0 && this.enemies.length < CONFIG.waves.maxAlive) {
          this.spawn(this.queue.shift()!);
          this.spawnTimer = CONFIG.waves.spawnInterval;
        }
        if (this.queue.length === 0 && this.enemies.length === 0) {
          if (this.duel) {
            this.setPhase('intermission');
            const s = combatStats;
            this.banner(`blocked ${s.guarded} of ${s.guarded + s.hits} hits`, '#c0c0c0', 0.16);
          } else if (this.wave >= CONFIG.waves.list.length) {
            this.setPhase('victory');
            this.banner('VICTORY', '#ffd060', 0.4);
            this.summary('the Warden is dust');
            sfx.victory();
          } else {
            this.setPhase('intermission');
            this.banner(`WAVE ${this.wave} CLEAR`, '#e0d090');
          }
        }
        break;
      case 'dead':
        if (this.phaseTime >= 6) this.restart();
        break;
      case 'victory':
        if (this.phaseTime >= 12) this.restart();
        break;
    }
  }

  private startWave(): void {
    this.wave++;
    if (this.duel) {
      this.queue = ['grunt'];
      this.spawnIndex = this.spawnTimer = 0;
      sfx.wave();
      this.banner(`DUELIST ${this.wave}`, '#9fd8ff');
      this.setPhase('fighting');
      return;
    }
    const roster = CONFIG.waves.list[Math.min(this.wave, CONFIG.waves.list.length) - 1];
    this.queue = waveRoster(roster);
    this.spawnIndex = 0;
    this.spawnTimer = 0;
    sfx.wave();
    if (roster.warden) this.banner('THE BONE WARDEN', '#6ad0ff', 0.28);
    else this.banner(`WAVE ${this.wave}`, '#e0d090');
    this.setPhase('fighting');
  }

  private spawn(kind: EnemyKind): void {
    const p = this.spawnPoint(kind, this.spawnIndex++);
    this.addEnemy(kind, p);
  }

  private addEnemy(kind: EnemyKind, p: Vector3): Enemy {
    const enemy = createEnemy(kind, p.x, p.z, { variant: Math.floor(Math.random() * 6), def: this.duel ? DUELIST : undefined });
    // Face the player from the first frame.
    enemy.root.rotation.y = Math.atan2(this.ctx.playerFeet.x - p.x, this.ctx.playerFeet.z - p.z);
    this.enemies.push(enemy);
    this.scene.add(enemy.root);
    this.particles.burst('dust', p, kind === 'warden' ? 30 : 12);
    sfx.rise(p);
    if (kind === 'warden') {
      this.particles.burst('magic', p.clone().setY(0.2), 40);
      sfx.roar(p);
    }
    return enemy;
  }

  /** Around the player, starting in front of them, clear of props; the Warden rises before its throne. */
  private spawnPoint(kind: EnemyKind, index: number): Vector3 {
    if (kind === 'warden') return new Vector3(0, 0, -4.6);
    const feet = this.ctx.playerFeet;
    this.player.camera.getWorldDirection(_fwd);
    const yaw = Math.atan2(_fwd.x, _fwd.z);
    const [near, far] = CONFIG.waves.spawnDistance;
    const r = kind === 'archer' ? far + 0.5 : near + Math.random() * (far - near);
    const p = new Vector3();
    for (let attempt = 0; attempt < 6; attempt++) {
      const a = yaw + SPAWN_ANGLES[(index + attempt) % SPAWN_ANGLES.length] + (Math.random() - 0.5) * 0.4;
      p.set(feet.x + Math.sin(a) * r, 0, feet.z + Math.cos(a) * r);
      this.arena.resolve(p, CONFIG.enemies[kind].radius + 0.3);
      // Walls may have pushed it right next to the player; try another direction.
      if (p.distanceTo(feet) > 2.5 && !this.enemies.some((e) => e.position.distanceTo(p) < 1)) break;
    }
    return p;
  }

  /** The Warden calls up grunts around the player. */
  private summon(from: Enemy, count: number): void {
    from.weaponSegment(_a, _b);
    this.particles.burst('magic', _b, 30);
    sfx.summon(_b);
    const feet = this.ctx.playerFeet;
    for (let i = 0; i < count; i++) {
      if (this.enemies.length >= CONFIG.waves.maxAlive) break;
      const a = Math.random() * Math.PI * 2;
      const r = CONFIG.warden.summonRing;
      const p = new Vector3(feet.x + Math.sin(a) * r, 0, feet.z + Math.cos(a) * r);
      this.arena.resolve(p, CONFIG.enemies.grunt.radius + 0.3);
      this.particles.burst('magic', p.clone().setY(0.1), 16);
      this.addEnemy('grunt', p);
    }
  }

  private restart(): void {
    for (const e of this.enemies) this.scene.remove(e.root);
    this.enemies.length = 0;
    this.queue.length = 0;
    this.meleeTokens.clear();
    this.rangedTokens.clear();
    this.orbs.clear();
    this.text.clear();
    this.particles.clear();
    this.combat.clear();
    this.mage?.clear();
    this.player.reset();
    this.wave = this.firstWave - 1;
    resetCombatStats();
    this.setPhase('intermission');
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseTime = 0;
  }

  /** Big text floating in front of the player. */
  private banner(text: string, color: string, scale?: number, lift?: number, life?: number): void {
    this.text.banner(this.player.camera, text, color, scale, lift, life);
  }

  /** The run in numbers, under the banner. */
  private summary(line: string): void {
    const s = combatStats;
    const lines = [line, `kills ${s.kills}  parries ${s.parries}  blocks ${s.blocks}`, `crits ${s.crits}  bashes ${s.bashes}  hits taken ${s.hurts}`];
    lines.forEach((l, i) => this.banner(l, '#d8d0c0', 0.1, -0.1 - i * 0.12, 5.5));
  }
}
