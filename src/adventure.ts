import { Euler, type PerspectiveCamera, Quaternion, type Scene, Vector3, type WebGLRenderer } from 'three';
import { type Ability, type AdventureEvent, AdventureState, type Effect } from './adventureState';
import { Combat } from './combat/combat';
import { CONFIG } from './config';
import { type Camp, Camps, type Member, type You } from './enemies/camps';
import { FloatingText } from './fx/floatingText';
import { Particles } from './fx/particles';
import { sfx, updateListener } from './fx/sfx';
import { Shockwaves } from './fx/shockwave';
import { SwordTrail } from './fx/trail';
import type { Respawn, Zone } from './maps/types';
import { Hale } from './people/hale';
import { Player } from './player/player';
import { SaveController } from './save/controller';
import { type Interior, saveRecord } from './save/record';
import type { Save } from './save/store';
import { BeltHud } from './ui/beltHud';
import { Fade } from './ui/fade';
import { QuestTracker } from './ui/questTracker';
import { type Probe, TalkBoard } from './ui/talkBoard';
import { Orbs } from './world/orbs';
import { Pickups } from './world/pickups';
import { BlobShadows } from './world/shadows';
import { World } from './world/world';

const _a = new Vector3();
const _b = new Vector3();
const _gaze = new Vector3();
const _haleHead = new Vector3();
const _float = new Vector3();
const _look = new Quaternion();
const _turn = new Euler();

type FloatStyle = Parameters<FloatingText['spawn']>[2];
/** "+N XP" where an enemy fell. */
const KILL_XP_FLOAT: FloatStyle = { color: '#ffd23a', scale: 0.24, life: CONFIG.levels.xpFloat.time, rise: 0.5 };
/** A hand-in's reward over Hale. */
const HAND_IN_FLOAT: FloatStyle = { scale: 0.2, life: CONFIG.handIn.time, rise: 0.3 };

/** What a level-up says about each ability it brings. */
const UNLOCKED: Record<Ability, string> = {
  warCry: 'War Cry: press A or X',
  earthshaker: "Earthshaker: drive your sword's tip into the ground",
};

/**
 * The game at the plain URL: Oakvale, loaded into the World, with the
 * warrior's sword, shield, walk, snap turn and dash on its hills, and its
 * camps waiting to be pulled. It owns and steps everything in it, one
 * `update(dt)` per XR frame, as the arena's `Game` does for the waves.
 * Marshal Hale stands at the crossroads with the quest chain: walk up and
 * their board unfolds, and the tracker shows the quest you're on. Kills and
 * the board's buttons go into the adventure state, whose levels set your
 * health, damage and abilities. What a quest has you find (the leader's
 * orders) lies where it's found while the state says so, taken with a touch.
 * Out of a fight your health comes back; a death fades to black and wakes you
 * by the inn's hearth, inside with the door shut. Doors open as you walk up,
 * and the World swaps the light once one shuts behind you. It saves itself as you go, and loads where you stood with
 * your level, XP, sword and quests, at full health with every camp full
 * (.scratch/oakvale-starting-zone/).
 */
export class Adventure {
  readonly world = new World();
  /** Your progress: level, XP, the sword and the quests. */
  readonly state: AdventureState;
  /** When your progress and where you stand are written to the save. */
  readonly saves: SaveController;
  readonly player: Player;
  readonly camps: Camps;
  readonly combat: Combat;
  /** Marshal Hale, the quest giver, at the crossroads. */
  readonly hale: Hale;
  /** Hale's board, which unfolds as you walk up to them. */
  readonly board = new TalkBoard();
  /** The quest you're on, top left of your view. */
  readonly tracker = new QuestTracker();
  /** What lies about for a quest, to pick up by hand: the leader's orders. */
  readonly pickups: Pickups;
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
  private readonly respawn: Respawn;
  /** What can press the board's buttons: your left fist, your right fist and your sword's tip, in that order. */
  private readonly probes: (Probe | null)[] = [null, null, null];
  private readonly probePoints = [new Vector3(), new Vector3(), new Vector3()];
  /** A level a hand-in landed, floating over Hale a moment after its XP. */
  private handInLevel: { level: number; unlocks: readonly Ability[]; in: number } | null = null;
  /** Where the save puts you: over the ground in world metres, facing as you look, and the building you're in. */
  private readonly standing: { x: number; z: number; yaw: number; interior: Interior | null } = { x: 0, z: 0, yaw: 0, interior: null };

  constructor(
    scene: Scene,
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    /** Where a new character starts: Oakvale. */
    zone: Zone,
    /** The character to load, if any, and where to keep it. */
    save: Pick<Save, 'store' | 'record'>,
  ) {
    const { record } = save;
    this.state = new AdventureState(record ?? undefined);
    this.saves = new SaveController(save.store, () => saveRecord(this.state.snapshot(), this.standing));
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
    this.camps = new Camps(
      zone.camps,
      this.world,
      {
        sweep: (e, a, pb, pt, b, t) => this.combat.sweep(e, a, pb, pt, b, t),
        slam: (e, a, at) => this.combat.slam(e, a, at),
        shoot: (e, from, damage) => this.combat.shoot(e, from, damage),
        nock: (e, from, to) => this.combat.projectiles.nock(e, from, to),
        telegraph: (e, a) => {
          e.weaponSegment(_a, _b);
          sfx.windup(_b, a.blockable);
        },
      },
      { onKill: (camp, member) => this.onKill(camp, member) },
    );
    scene.add(this.camps.root);

    this.pickups = new Pickups(zone.pickups);
    scene.add(this.pickups.root);

    this.hale = new Hale(zone.hale, this.world, this.state.hale.marker);
    this.world.addBody(this.hale.body);
    scene.add(this.hale.root, this.board.root, this.tracker.mesh);

    // A new character at the zone's start, facing Hale; or where the save stood,
    // facing the same way, at full health and with no rage. A save made inside
    // the inn loads inside it, with the door shut and the room lit.
    Object.assign(this.standing, record ? { ...record.position, yaw: record.facing, interior: record.interior } : { ...zone.spawn, interior: null });
    const { x, z, yaw, interior } = this.standing;
    this.player.stats = this.state.stats;
    this.player.reset(x, z, yaw);
    this.world.settle(interior);
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
    this.talk(dt);
    this.pickUp();
    this.updateHandIn(dt);
    this.tracker.update(dt, player.camera, this.state.tracker);
    this.text.update(dt);
    this.particles.update(dt);
    this.shockwaves.update(dt);
    this.hud.status.level = this.state.level;
    this.hud.status.progress = this.state.progress;
    this.hud.update(dt);
    this.updateStanding();
    this.saves.update(dt);
  }

  /** Where the save puts you: where your head is and the way you look, or where you'll wake while you're down. */
  private updateStanding(): void {
    const { player, standing } = this;
    if (!player.alive) {
      Object.assign(standing, this.respawn);
      return;
    }
    standing.x = this.you.head.x;
    standing.z = this.you.head.z;
    standing.interior = this.world.interior;
    standing.yaw = _turn.setFromQuaternion(player.camera.getWorldQuaternion(_look), 'YXZ').y;
  }

  /** A camp's member fell: it pays XP into the adventure state, and may count for your quest. */
  private onKill(camp: Camp, member: Member): void {
    const { enemy, plan } = member;
    this.apply({ kind: 'kill', camp: camp.plan.id, level: enemy.level, role: plan.role ?? 'ordinary' }, enemy.position);
  }

  /**
   * Hale turns to you and waves as you walk up, showing what they have for
   * you; their board unfolds, and a press on it goes to the adventure state.
   */
  private talk(dt: number): void {
    const { player, hale, you, state } = this;
    player.camera.getWorldDirection(_gaze);
    hale.update(dt, you.head, state.hale.marker);
    hale.head(_haleHead);
    const press = this.board.update(dt, { head: you.head, gaze: _gaze }, { feet: hale.position, head: _haleHead }, this.touching(), state.hale);
    if (!press) return;
    const { intensity, ms } = CONFIG.talk.buzz;
    player.input.pulse(press.hand, intensity, ms);
    switch (press.button) {
      case 'accept':
        this.board.fold();
        this.apply({ kind: 'accept' }, hale.position);
        break;
      case 'handIn':
        // The talk goes on: Hale offers the next quest, or sees you off after the last.
        this.apply({ kind: 'handIn' }, _haleHead);
        this.board.show(state.hale);
        break;
      case 'notNow':
      case 'goodbye':
        this.board.fold();
    }
  }

  /** A fist touches what lies there for your quest: it's yours, with a buzz in that hand. */
  private pickUp(): void {
    const [left, right] = this.touching();
    const taken = this.pickups.update((item) => this.state.lies(item), left, right);
    if (!taken) return;
    const { intensity, ms } = CONFIG.pickups.buzz;
    this.player.input.pulse(taken.hand, intensity, ms);
    sfx.parchment(taken.at);
    this.apply({ kind: 'pickup', item: taken.item }, taken.at);
  }

  /** Where each fist and the sword's tip are, while tracked and you're standing. */
  private touching(): readonly (Probe | null)[] {
    const { player, probes, probePoints: p } = this;
    const { left, right } = player.input.hands;
    const up = player.alive;
    probes[0] = up && left.grip.visible ? { at: left.grip.getWorldPosition(p[0]), hand: 'left' } : null;
    probes[1] = up && right.grip.visible ? { at: right.grip.getWorldPosition(p[1]), hand: 'right' } : null;
    probes[2] = up && player.sword.tip.valid ? { at: player.sword.tip.worldNow(player.rig, p[2]), hand: 'right' } : null;
    return probes;
  }

  /** Something happened: into the adventure state, into the save if it earned anything, and show what it did at `at`. */
  private apply(event: AdventureEvent, at: Vector3): void {
    const effects = this.state.apply(event);
    this.saves.onEffects(effects);
    this.show(effects, at, event.kind === 'handIn');
  }

  /**
   * What the adventure state did. A kill's XP floats where it was earned, and
   * a level reached is a moment. A hand-in's reward floats over Hale (`at`)
   * with a fanfare: the XP, then the level a moment later. Taking a quest,
   * progress and finishing flash the tracker. A kill that passes two levels
   * at once shows the higher, with every ability both brought.
   */
  private show(effects: readonly Effect[], at: Vector3, handIn: boolean): void {
    const unlocks: Ability[] = [];
    let reached = 0;
    for (const e of effects) {
      switch (e.kind) {
        case 'xp':
          if (handIn) this.floatOver(at, CONFIG.handIn.height, `+${e.amount} XP`, { color: '#ffd23a', ...HAND_IN_FLOAT });
          else this.floatOver(at, CONFIG.levels.xpFloat.height, `+${e.amount} XP`, KILL_XP_FLOAT);
          break;
        case 'level':
          reached = e.level;
          unlocks.push(...e.unlocks);
          break;
        case 'progress':
          this.tracker.flash();
          break;
        case 'quest':
          if (e.stage === 'active' || e.stage === 'ready') this.tracker.flash();
          if (e.stage === 'handedIn') sfx.fanfare();
          break;
        case 'sword':
          // Hale's old longsword comes into your hand with What Lies Below (ticket 28).
          break;
      }
    }
    if (!reached) return;
    this.gainLevel();
    if (handIn) this.handInLevel = { level: reached, unlocks, in: CONFIG.handIn.levelAfter };
    else this.announceLevel(reached, unlocks);
  }

  /** Your new level's numbers, and full health. */
  private gainLevel(): void {
    const { player } = this;
    player.stats = this.state.stats;
    if (player.alive) player.hp = player.maxHp;
  }

  /**
   * "LEVEL N", and a line per ability it brings: in view with a sound after a
   * kill, or over Hale after a hand-in (whose fanfare is its sound).
   */
  private announceLevel(level: number, unlocks: readonly Ability[], overHale = false): void {
    const { player, text } = this;
    const { banner, lines } = CONFIG.levels.levelUp;
    if (overHale) {
      const { height, levelHeight } = CONFIG.handIn;
      this.floatOver(this.hale.head(_haleHead), height + levelHeight, `LEVEL ${level}`, { color: '#ffffff', ...HAND_IN_FLOAT });
    }
    else {
      sfx.levelUp();
      text.banner(player.camera, `LEVEL ${level}`, '#ffd23a', 0.34, 0.3, banner);
    }
    unlocks.forEach((a, i) => text.banner(player.camera, UNLOCKED[a], '#f0e0b0', 0.09, 0.08 - i * 0.12, lines));
  }

  /** Words floating up from `height` metres over `at`. */
  private floatOver(at: Vector3, height: number, words: string, style: FloatStyle): void {
    this.text.spawn(words, _float.copy(at).setY(at.y + height), style);
  }

  /** The level a hand-in landed floats over Hale a moment after its XP. */
  private updateHandIn(dt: number): void {
    const pending = this.handInLevel;
    if (!pending || (pending.in -= dt) > 0) return;
    this.handInLevel = null;
    this.announceLevel(pending.level, pending.unlocks, true);
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

  /** At the village respawn point, by the inn's hearth with the door shut, with full health and no rage. Nothing else changes. */
  private wake(): void {
    const { x, z, yaw, interior } = this.respawn;
    this.player.reset(x, z, yaw);
    this.world.settle(interior);
    this.lastHp = this.player.hp;
    this.combat.projectiles.clear();
    this.deadFor = null;
    this.wakingFor = 0;
  }
}
