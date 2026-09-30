import { Group, type Object3D, type PerspectiveCamera, Vector3, type WebGLRenderer } from 'three';
import { type Ability, type Stats, statsAt } from '../adventureState';
import { abilitiesOf, type ClassId } from '../classes';
import { AbilityClock } from '../combat/abilities';
import { CONFIG } from '../config';
import { sfx } from '../fx/sfx';
import type { Ground } from '../world/ground';
import { Fist } from './fists';
import { type Handedness, XRInput } from './input';
import type { Run } from './run';
import { Shield, Sword } from './weapons';

const UP = new Vector3(0, 1, 0);
const _head = new Vector3();
const _fwd = new Vector3();
const _right = new Vector3();
const _resolved = new Vector3();

/** The arena's numbers: level 1 of `klass`, with every base ability of the class. */
const arenaStats = (klass: ClassId): Stats => ({ ...statsAt(1, undefined, klass), abilities: abilitiesOf(klass) });

/**
 * You: XR rig (camera + controllers), locomotion, collision and your class's
 * bar. The warrior holds the sword (right hand) and shield (left hand); the
 * ranger's hands are empty here, for the bow is Combat's (combat/ranger.ts).
 */
export class Player {
  readonly rig = new Group();
  readonly input: XRInput;
  readonly sword = new Sword();
  readonly shield = new Shield();
  /** Your hands, closed on what they hold: the Adventure's (see `showFists`); the arena shows only the weapons. */
  fists: Readonly<Record<Handedness, Fist>> | null = null;
  /** A station's tools in your hands in place of the sword and shield (the smith's hammer and tongs), or null. */
  private tools: { readonly right: Object3D; readonly left: Object3D } | null = null;
  /** What kind of fighter you are: it decides what's in your hands and which bar you fill. */
  readonly class: ClassId;
  /** Your level's health, damage and abilities: the arena's, unless the Adventure sets them from your level. */
  stats: Stats;
  hp: number;
  /** What your class's bar holds: rage, focus or mana (`stats.resource` says which, and its size). */
  resource: number;
  /** Seconds of War Cry frenzy left (bonus damage, burning blade). */
  frenzy = 0;
  /** Each gesture ability's cooldown, and how long Shield Wall and Sweeping Strikes have left. */
  readonly abilities = new AbilityClock();
  dashCooldown = 0;
  /** B / Y dash; a class prototype (src/prototype/) may take the buttons for its own move. */
  dashes = true;
  private dashTime = 0;
  private dodgeTime = 0;
  private readonly dashVel = new Vector3();
  private snapLatched = false;
  /** Called when a dash starts (the HUD dims the edges for comfort). */
  onDash?: () => void;
  /** The left stick's click to run: the Adventure's; the arena, always in a fight, has none. */
  run: Run | null = null;
  /** Is anything fighting you? Set by the game before each update; a fight stops the run. */
  fighting = false;
  /** Running this frame (the run's vignette shows). */
  running = false;

  constructor(
    readonly camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    /** What you stand on and bump into: the arena, or a zone. */
    readonly ground: Ground,
    klass: ClassId = 'warrior',
  ) {
    this.class = klass;
    this.stats = arenaStats(klass);
    this.hp = this.maxHp;
    this.resource = this.stats.resource.start;
    this.rig.name = 'player-rig';
    this.rig.add(camera);
    this.input = new XRInput(renderer, this.rig);
    this.input.onRemap = () => this.attachWeapons();
    this.attachWeapons();
  }

  private attachWeapons(): void {
    const { left, right } = this.input.hands;
    // A station's tools replace the weapons: with no sword or shield in a grip, neither hits nor blocks.
    if (this.tools) {
      this.sword.model.removeFromParent();
      this.shield.model.removeFromParent();
      right.grip.add(this.tools.right);
      left.grip.add(this.tools.left);
    } else if (this.class === 'warrior') {
      right.grip.add(this.sword.model);
      left.grip.add(this.shield.model);
    }
    if (this.fists) {
      this.input.hands.right.grip.add(this.fists.right.mesh);
      this.input.hands.left.grip.add(this.fists.left.mesh);
    }
  }

  /** Hold a station's tools in place of your sword and shield, or your weapons again (null). */
  holdTools(tools: { readonly right: Object3D; readonly left: Object3D } | null): void {
    if (tools === this.tools) return;
    this.tools?.right.removeFromParent();
    this.tools?.left.removeFromParent();
    this.tools = tools;
    this.attachWeapons();
  }

  /** Are a station's tools in your hands? */
  get holdingTools(): boolean {
    return this.tools !== null;
  }

  /** Show your hands, closed on what they hold. */
  showFists(): Readonly<Record<Handedness, Fist>> {
    this.fists ??= { left: new Fist(), right: new Fist() };
    this.attachWeapons();
    return this.fists;
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  /** Full health. */
  get maxHp(): number {
    return this.stats.maxHp;
  }

  /** The warrior's name for the bar: its rage, and nothing for a class whose bar is focus or mana. */
  get rage(): number {
    return this.stats.resource.kind === 'rage' ? this.resource : 0;
  }

  set rage(amount: number) {
    if (this.stats.resource.kind === 'rage') this.resource = amount;
  }

  /** Has your level brought it? */
  can(ability: Ability): boolean {
    return this.stats.abilities.includes(ability);
  }

  /** Head position in world space. */
  headPosition(out: Vector3): Vector3 {
    return this.camera.getWorldPosition(out);
  }

  /** Head position projected to the ground. */
  feetPosition(out: Vector3): Vector3 {
    this.headPosition(out);
    out.y = this.ground.heightAt(out.x, out.z);
    return out;
  }

  /** What enemy weapons can hit: the head sphere's centre and the torso capsule's axis. */
  body(outHead: Vector3, outTop: Vector3, outBottom: Vector3): void {
    const B = CONFIG.player.body;
    this.headPosition(outHead);
    outTop.copy(outHead);
    outTop.y -= B.torsoTop;
    outBottom.copy(outHead);
    outBottom.y = Math.max(this.ground.heightAt(outHead.x, outHead.z) + 0.2, outHead.y - B.torsoBottom);
    outHead.y -= B.headDrop;
  }

  /** In a dash's dodge frames: blows and arrows pass through. */
  get invulnerable(): boolean {
    return this.dodgeTime > 0;
  }

  update(dt: number): void {
    this.input.update();
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.dodgeTime = Math.max(0, this.dodgeTime - dt);
    if (this.alive) {
      this.locomote(dt);
      this.snapTurn();
      this.dash(dt);
    } else this.stopRunning();
    this.collide(dt);
    this.rig.updateMatrixWorld(true);
    this.sword.update(this.rig, dt);
    this.shield.update(this.rig, dt);
    this.fill(dt);
    this.frenzy = Math.max(0, this.frenzy - dt);
    this.sword.frenzy = this.frenzy > 0;
    this.abilities.tick(dt);
    this.shield.walled = this.abilities.left('shieldWall');
  }

  /** B / Y: a quick step in the stick's direction, backwards if the stick is neutral. */
  private dash(dt: number): void {
    const D = CONFIG.dash;
    const { left, right } = this.input.hands;
    if (this.dashes && (left.secondaryPressed || right.secondaryPressed) && this.dashCooldown <= 0) {
      this.camera.getWorldDirection(_fwd);
      _fwd.y = 0;
      if (_fwd.lengthSq() > 1e-6) {
        _fwd.normalize();
        _right.crossVectors(_fwd, UP);
        const { stickX, stickY } = left;
        const moving = Math.hypot(stickX, stickY) >= CONFIG.player.stickDeadzone;
        this.dashVel.set(0, 0, 0);
        if (moving) this.dashVel.addScaledVector(_fwd, -stickY).addScaledVector(_right, stickX);
        else this.dashVel.copy(_fwd).negate();
        this.dashVel.normalize().multiplyScalar(D.distance / D.time);
        this.dashTime = D.time;
        this.dodgeTime = D.invulnerable;
        this.dashCooldown = D.cooldown;
        sfx.dash();
        this.onDash?.();
      }
    }
    if (this.dashTime > 0) {
      const step = Math.min(dt, this.dashTime);
      this.rig.position.addScaledVector(this.dashVel, step);
      this.dashTime -= step;
    }
  }

  private locomote(dt: number): void {
    const { stickX, stickY, stickPressed } = this.input.hands.left;
    const speed = this.runSpeed(stickPressed, stickX, stickY);
    if (Math.hypot(stickX, stickY) < CONFIG.player.stickDeadzone) return;

    // Head-relative: forward is where you look, flattened to the floor.
    this.camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) return;
    _fwd.normalize();
    _right.crossVectors(_fwd, UP);
    this.rig.position
      .addScaledVector(_fwd, -stickY * speed * dt)
      .addScaledVector(_right, stickX * speed * dt);
  }

  /** The walk's speed, or the run's while it's latched and the stick points ahead; a pull ends it with a buzz. */
  private runSpeed(click: boolean, stickX: number, stickY: number): number {
    if (!this.run) return CONFIG.player.moveSpeed;
    const step = this.run.step({ click, stickX, stickY, fighting: this.fighting });
    this.running = step.running;
    if (step.caught) this.input.pulse('left', CONFIG.run.buzz.intensity, CONFIG.run.buzz.ms);
    return step.speed;
  }

  private snapTurn(): void {
    const x = this.input.hands.right.stickX;
    if (Math.abs(x) < 0.7) {
      this.snapLatched = false;
      return;
    }
    if (this.snapLatched) return;
    this.snapLatched = true;

    // Rotate the rig about the head, not the rig origin, so the player
    // turns in place rather than orbiting their play-space centre.
    const angle = (-Math.sign(x) * CONFIG.player.snapTurnDeg * Math.PI) / 180;
    this.headPosition(_head);
    this.rig.position.sub(_head).applyAxisAngle(UP, angle).add(_head);
    this.rig.rotation.y += angle;
  }

  /**
   * Keep the head's floor projection out of walls and pillars (covers
   * room-scale walking too), and the feet on the ground, eased for comfort.
   */
  private collide(dt: number): void {
    this.rig.updateMatrixWorld(true);
    this.feetPosition(_head);
    _resolved.copy(_head);
    if (this.ground.resolve(_resolved, CONFIG.player.bodyRadius)) {
      this.rig.position.x += _resolved.x - _head.x;
      this.rig.position.z += _resolved.z - _head.z;
    }
    const floor = this.ground.heightAt(_resolved.x, _resolved.z);
    this.rig.position.y += (floor - this.rig.position.y) * Math.min(1, dt * 10);
  }

  damage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
    this.input.pulse('left', CONFIG.feel.hapticHurt.intensity, CONFIG.feel.hapticHurt.ms);
    this.input.pulse('right', CONFIG.feel.hapticHurt.intensity, CONFIG.feel.hapticHurt.ms);
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  /** Your bar fills (focus, mana) or drains (rage) by the second, as your class's does, within its size. */
  private fill(dt: number): void {
    const { size, refill } = this.stats.resource;
    const rate = this.fighting ? refill.fighting : refill.calm;
    this.resource = Math.max(0, Math.min(size, this.resource + rate * dt));
  }

  /** Rage builds only once the War Cry has come, which spends it. */
  addRage(amount: number): void {
    if (!this.can('warCry') || this.stats.resource.kind !== 'rage') return;
    this.resource = Math.min(this.stats.resource.size, this.resource + amount);
  }

  /** Back to full health, your bar as it starts (no rage, full focus or mana) and nothing charged, standing at (x, z) facing `yaw`. */
  reset(x = 0, z = 0, yaw = 0): void {
    this.hp = this.maxHp;
    this.resource = this.stats.resource.start;
    this.frenzy = 0;
    this.abilities.clear();
    this.shield.walled = 0;
    this.dashCooldown = this.dashTime = this.dodgeTime = 0;
    this.shield.numb = 0;
    this.place(x, z, yaw);
  }

  /** Back to walking. */
  private stopRunning(): void {
    this.run?.stop();
    this.running = false;
  }

  /** Stand with your head over (x, z), facing `yaw` (0 looks down −Z), and stop any dash or run. */
  place(x: number, z: number, yaw: number): void {
    this.dashTime = 0;
    this.stopRunning();
    this.rig.rotation.set(0, yaw, 0);
    // In the headset you may stand off the play space's centre; put the head, not the centre, there.
    _head.copy(this.camera.position).setY(0).applyAxisAngle(UP, yaw);
    this.rig.position.set(x - _head.x, this.ground.heightAt(x, z), z - _head.z);
  }
}
