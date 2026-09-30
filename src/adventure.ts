import { Euler, type Object3D, type PerspectiveCamera, Quaternion, type Scene, Vector3, type WebGLRenderer } from 'three';
import { type Ability, type AdventureEvent, AdventureState, type Effect } from './adventureState';
import { Combat } from './combat/combat';
import { CONFIG } from './config';
import { type Camp, type CampHooks, Camps, type Member, type You } from './enemies/camps';
import type { Enemy } from './enemies/enemy';
import { Throne } from './enemies/throne';
import { Ambience } from './fx/ambience';
import { FloatingText } from './fx/floatingText';
import { Particles } from './fx/particles';
import { sfx, updateListener } from './fx/sfx';
import { Shockwaves } from './fx/shockwave';
import { SwordTrail } from './fx/trail';
import { itemOf } from './items';
import { lootSeed } from './loot';
import { findMap } from './maps/registry';
import type { Respawn, StartingZone, Zone } from './maps/types';
import { Hale } from './people/hale';
import { Villagers } from './people/villagers';
import { Player } from './player/player';
import { Run } from './player/run';
import { SaveController } from './save/controller';
import { type Interior, saveRecord } from './save/record';
import type { Save } from './save/store';
import { BeltHud } from './ui/beltHud';
import { Fade } from './ui/fade';
import { arrowHides, arrowPoint, arrowTurn, type ArrowSpots } from './ui/questArrow';
import { type ArrowShown, QuestTracker } from './ui/questTracker';
import { ZoneName } from './ui/zoneName';
import { RunVignette } from './ui/runVignette';
import { Bag, type BagHand } from './ui/bag/bag';
import { IconAtlas, lookOf } from './ui/bag/looks';
import { type Probe, TalkBoard } from './ui/talkBoard';
import { Drops, type Touch } from './world/drops';
import { Orbs } from './world/orbs';
import { Pickups } from './world/pickups';
import { BlobShadows } from './world/shadows';
import { Dropped } from './world/dropped';
import type { Mine } from './world/mine';
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
/** The coins a pouch held, over it as it's taken. */
const COINS_FLOAT: FloatStyle = { color: '#ffd23a', scale: 0.1, life: 1, rise: 0.3 };
/** "Bag full" over an item a full bag leaves on the ground. */
const FULL_FLOAT: FloatStyle = { color: '#ff4a3a', scale: 0.12, life: CONFIG.loot.full.float, rise: 0.25 };

/** Each body under `root` drawn only in a part of the mine that's drawn. */
function showInMine(mine: Mine, root: Object3D): void {
  for (const body of root.children) body.visible = mine.drawn[mine.partAt(body.position.x, body.position.z)];
}

/** What a level-up says about each ability it brings. */
const UNLOCKED: Record<Ability, string> = {
  warCry: 'War Cry: press A or X',
  earthshaker: "Earthshaker: drive your sword's tip into the ground",
};

/**
 * The game at the plain URL: Oakvale, loaded into the World, with the
 * warrior's sword, shield, walk, snap turn and dash on its hills, and its
 * camps waiting to be pulled. Out of a fight a click of the left stick runs,
 * the edges of your view darkening a little, until you let the stick go or
 * a pull catches you. It owns and steps everything in it, one
 * `update(dt)` per XR frame, as the arena's `Game` does for the waves.
 * Marshal Hale stands at the crossroads with the quest chain: walk up and
 * their board unfolds, and the tracker shows the quest you're on. The
 * innkeeper, the smith and the farmer are at work, and bark as you pass; the
 * wind blows, birds call from the trees and each place sounds where it is,
 * muffled behind a shut door, giving way to the mine's own air past its bend
 * and dipping while anything fights you. Kills and
 * the board's buttons go into the adventure state, whose levels set your
 * health, damage and abilities. Each kill drops its loot where it fell (a
 * pouch of coins and each item beside it), taken into your things with a
 * touch, as an orb is. What a quest has you find (the leader's
 * orders) lies where it's found while the state says so, taken with a touch.
 * At the old mine's foot the Warden waits on its throne while you're on What
 * Lies Below, and Hale's old longsword comes into your hand when you hand it in.
 * Out of a fight your health comes back; a death fades to black and wakes you
 * by the inn's hearth, inside with the door shut; which building you're in is
 * the World's to say. South over the pass lies Brackenmoor: walk over the
 * crest and the light and the sound blend into the moor's, its name floats
 * up and the game saves, all without a loading screen. It saves itself as
 * you go, and loads where you stood (in either zone) with your level, XP,
 * sword and quests, at full health with every camp full
 * (.scratch/oakvale-starting-zone/).
 */
export class Adventure {
  /** Oakvale and the zones over its seams, fetching each zone's neighbours as it becomes current. */
  readonly world = new World(findMap);
  /** Your progress: level, XP, the sword and the quests. */
  readonly state: AdventureState;
  /** When your progress and where you stand are written to the save. */
  readonly saves: SaveController;
  readonly player: Player;
  readonly camps: Camps;
  /** The Warden on its throne at the mine's foot, and what it raises; null in a zone without the mine. */
  readonly throne: Throne | null;
  readonly combat: Combat;
  /** Marshal Hale, the quest giver, at the crossroads. */
  readonly hale: Hale;
  /** The innkeeper, the smith and the farmer, at work. */
  readonly villagers: Villagers;
  /** The wind, the birds in the trees and each place's sound where it is. */
  readonly ambience: Ambience;
  /** Hale's board, which unfolds as you walk up to them. */
  readonly board = new TalkBoard();
  /** The quest you're on, top left of your view. */
  readonly tracker = new QuestTracker();
  /** The zone's name, floating up as you cross into it and when you load in. */
  readonly zoneName = new ZoneName();
  /** Has the zone's name floated up since you loaded in? */
  private named = false;
  /** What lies about for a quest, to pick up by hand: the leader's orders. */
  readonly pickups: Pickups;
  /** The bag: reach over a shoulder for it, and move your things about on its panel. */
  readonly bag: Bag;
  /** What you've let go of off the bag's panel, lying on the ground. */
  readonly dropped: Dropped;
  /** Each hand's controller, for the bag. */
  private readonly bagHands: Record<'left' | 'right', { -readonly [K in keyof BagHand]: BagHand[K] }>;
  /** Where the quest arrow's targets are: each quest's place, and Hale. */
  private readonly arrowSpots: ArrowSpots;
  private readonly hud: BeltHud;
  private readonly trail: SwordTrail;
  private readonly text: FloatingText;
  private readonly particles: Particles;
  private readonly shockwaves: Shockwaves;
  private readonly shadows = new BlobShadows();
  private readonly orbs = new Orbs();
  /** What kills drop, lying where they fell until touched. */
  readonly drops = new Drops();
  /** Seconds played since loading, for loot's seeds. */
  private clock = 0;
  private readonly fade: Fade;
  /** The edges of your view darkening while you run. */
  private readonly runVignette: RunVignette;
  private readonly you: You = { feet: new Vector3(), head: new Vector3(), sword: null, alive: true, interior: null };
  private readonly sword = { base: new Vector3(), tip: new Vector3(), speed: 0, swing: 0 };
  /** Every enemy there is to fight this frame: the camps', the Warden and what it raised. */
  private readonly foes: Enemy[] = [];
  private hitStop = 0;
  /** Seconds since you last took or dealt damage. */
  private calm = 0;
  private lastHp: number;
  /** Seconds since you fell, while you're down; null while you stand. */
  private deadFor: number | null = null;
  /** Seconds since you woke, while the view fades back in; null otherwise. */
  private wakingFor: number | null = null;
  /** Where you wake after a death: the village's, or the mine's if you died in it. */
  private readonly respawns: { readonly village: Respawn; readonly mine: Respawn };
  private respawn: Respawn;
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
    zone: StartingZone,
    /** The character to load, if any, and where to keep it. */
    save: Pick<Save, 'store' | 'record'>,
    /** The zones over its seams (Brackenmoor), walked into with nothing in them. */
    neighbours: readonly Zone[] = [],
  ) {
    const { record } = save;
    this.state = new AdventureState(record ?? undefined);
    this.saves = new SaveController(save.store, () => saveRecord(this.state.snapshot(), this.standing));
    this.world.attach(scene, camera, renderer);
    for (const n of neighbours) this.world.add(n);
    this.world.load(zone);
    this.respawns = zone.respawns;
    this.respawn = zone.respawns.village;
    this.player = new Player(camera, renderer, this.world);
    this.player.run = new Run();
    scene.add(this.player.rig, this.orbs.root, this.drops.root, this.shadows.mesh);
    this.drops.warm(renderer, camera, scene);
    this.trail = new SwordTrail(scene);
    this.text = new FloatingText(scene);
    this.particles = new Particles(scene);
    this.shockwaves = new Shockwaves(scene);
    this.hud = new BeltHud(this.player, camera, { waves: false });
    scene.add(this.hud.root);
    this.hud.warm(renderer, scene);
    this.fade = new Fade(camera);
    this.runVignette = new RunVignette(camera);
    this.runVignette.warm(renderer, camera, scene);
    scene.add(this.zoneName.mesh);
    this.zoneName.warm(renderer, camera, scene);
    // Your hands, closed on what they hold, and the bag over your shoulder.
    this.player.showFists();
    this.dropped = new Dropped(this.world);
    this.bag = new Bag(
      {
        inventory: this.state.inventory,
        buzz: (hand, intensity, ms) => this.player.input.pulse(hand, intensity, ms),
        apply: (effects, at) => this.applyThings(effects, at),
        drop: (stack, at, velocity) => this.dropped.drop(stack, at, velocity),
      },
      new IconAtlas(),
    );
    const { left, right } = this.player.input.hands;
    this.bagHands = { left: { grip: left.grip, tracked: false, squeeze: 0 }, right: { grip: right.grip, tracked: false, squeeze: 0 } };
    scene.add(this.bag.root, this.dropped.root);
    this.bag.warm(renderer, camera, scene);
    this.dropped.warm(renderer, camera, scene);

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
    // The mine's undead stand on the mine's own ground, whether or not you've come in.
    const below = this.world.mineGround;
    const hooks: CampHooks = {
      sweep: (e, a, pb, pt, b, t) => this.combat.sweep(e, a, pb, pt, b, t),
      slam: (e, a, at) => this.combat.slam(e, a, at),
      shoot: (e, from, damage) => this.combat.shoot(e, from, damage),
      nock: (e, from, to) => this.combat.projectiles.nock(e, from, to),
      telegraph: (e, a) => {
        e.weaponSegment(_a, _b);
        sfx.windup(_b, a.blockable);
      },
    };
    this.camps = new Camps(zone.camps, (plan) => (plan.interior === 'mine' && below ? below : this.world), hooks, {
      onKill: (camp, member) => this.onKill(camp, member),
    });
    scene.add(this.camps.root);
    // The Warden stands on the mine's ground too, and shares the camps' attack pools.
    this.throne =
      zone.mine && below
        ? new Throne(zone.mine.throne, below, hooks, { melee: this.camps.meleeTokens, ranged: this.camps.rangedTokens }, {
            onRise: (w) => this.wardenRises(w),
            onSummon: (w, at) => this.wardenSummons(w, at),
            onKill: (e, role) =>
              this.apply({ kind: 'kill', camp: null, level: e.level, role, family: e.family, seed: this.seed('hall', e.position.x, e.position.z) }, e.position),
            onCrumble: (e) => {
              this.particles.burst('bone', _a.copy(e.position).setY(e.position.y + 0.9), 14);
              sfx.death(_a, { big: false, bones: true });
            },
          })
        : null;
    if (this.throne) scene.add(this.throne.root);
    // The mine's undead and the Warden are uploaded with the mine's meshes, as you come near its mouth.
    for (const camp of this.camps.camps) if (camp.plan.interior === 'mine') this.world.stageWith('mine', camp.root);
    if (this.throne) this.world.stageWith('mine', this.throne.root);

    this.pickups = new Pickups(zone.pickups);
    scene.add(this.pickups.root);

    this.hale = new Hale(zone.hale, this.world, this.state.hale.marker, this.state.haleSwordAtHip);
    this.arrowSpots = { places: zone.places, givers: { hale: zone.hale } };
    this.world.addBody(this.hale.body);
    scene.add(this.hale.root, this.board.root, this.tracker.mesh);
    // The innkeeper hangs from the inn's room, drawn while it is; the others are drawn with the outdoors.
    this.villagers = new Villagers(zone.villagers, this.world, (id) => {
      const room = zone.interiors.find((i) => i.id === id)?.room;
      if (!room) throw new Error(`No room for a villager in the ${id}`);
      return room;
    });
    for (const v of this.villagers.all) this.world.addBody(v.body);
    scene.add(this.villagers.root);
    // The outdoors' villagers with the chunks round you; the innkeeper is the inn's (its room's).
    this.world.stageWith(null, this.villagers.root);
    this.villagers.warm(renderer, camera, scene);
    // The smith's hammer rings on the anvil with each blow of their work.
    this.ambience = new Ambience([zone, ...neighbours]);
    this.villagers.onStrike = () => this.ambience.strike('anvil');

    // A new character at the zone's start, facing Hale; or where the save stood,
    // facing the same way, at full health and with no rage. A save made inside
    // the inn loads inside it, with the door shut and the room lit; one made in
    // the mine loads in it, standing on its floor (so it settles first).
    Object.assign(this.standing, record ? { ...record.position, yaw: record.facing, interior: record.interior } : { ...zone.spawn, interior: null });
    const { x, z, yaw, interior } = this.standing;
    this.dressHands();
    this.world.settle(interior);
    this.player.reset(x, z, yaw);
    this.lastHp = this.player.hp;
    // Oakvale round where you stand, all at once behind the page, and compiled now rather than when
    // it first comes into view (the World does that with the first fill). A save made over the pass
    // loads there, in Brackenmoor's air, with Oakvale streaming in behind you.
    this.world.fill(x, z);
    // From here on, crossing a seam is a moment: the zone's name floats up (and the game saves, in
    // `update`, once it knows where you stand); its sound follows the World's cues.
    this.world.onZone = (zone) => this.zoneName.show(zone.label);
    this.world.onAdd = (zone) => this.ambience.add(zone);
  }

  update(dt: number): void {
    // Clamp: a dropped frame (or tab switch) shouldn't teleport anything.
    dt = Math.min(dt, 1 / 30);
    this.clock += dt;
    const { player, you } = this;
    this.world.update(dt, player.camera);
    // With a door shut behind you, what stands outside isn't drawn either.
    const outdoors = this.world.outdoorsShown;
    this.pickups.root.visible = this.hale.root.visible = this.villagers.root.visible = outdoors;
    this.showCamps(outdoors);
    player.fighting = this.fighting;
    player.update(dt);
    this.runVignette.update(dt, player.running);
    updateListener(player.camera);
    const { hands } = player.input;
    const foes = this.gatherFoes();
    if (hands.left.primaryPressed || hands.right.primaryPressed) this.combat.warCry(foes);

    // Hit-stop freezes enemies (not you) for a few frames on impact.
    const enemyDt = this.hitStop > 0 ? 0 : dt;
    this.hitStop = Math.max(0, this.hitStop - dt);
    player.feetPosition(you.feet);
    player.headPosition(you.head);
    you.alive = player.alive;
    you.interior = this.world.interior;
    const { sword, rig } = player;
    if (sword.tip.valid && player.alive) {
      sword.segment(rig, this.sword.base, this.sword.tip);
      this.sword.speed = sword.tipSpeed;
      this.sword.swing = sword.swing.count;
      you.sword = this.sword;
    } else you.sword = null;

    this.combat.update(dt, foes);
    this.camps.update(enemyDt, you);
    this.throne?.update(enemyDt, you, this.state.wardenSeated);
    // The ambience's mix follows the light's cues, and dips while anything fights you.
    this.ambience.update(dt, you.head, this.world.cues, this.fighting);
    this.combat.projectiles.render();
    this.heal(dt);
    this.updateDeath(dt);

    this.shadows.cast(you.feet, this.gatherFoes());
    if (sword.tip.valid) {
      sword.segment(rig, _a, _b);
      this.trail.update(dt, _a, _b, sword.hot, player.frenzy > 0);
    }
    this.orbs.update(dt, player);
    this.loot(dt, outdoors);
    this.talk(dt);
    this.updateBag(dt);
    this.villagers.update(dt, you.head, this.state);
    this.pickUp();
    this.updateHandIn(dt);
    this.tracker.update(dt, player.camera, this.state.tracker, this.questArrow());
    // The zone you're in floats up as you load in.
    if (!this.named) {
      this.named = true;
      this.zoneName.show(this.world.zone!.label);
    }
    this.zoneName.update(dt, player.camera);
    this.text.update(dt);
    this.particles.update(dt);
    this.shockwaves.update(dt);
    this.hud.status.level = this.state.level;
    this.hud.status.progress = this.state.progress;
    this.hud.update(dt);
    this.updateStanding();
    // A change of current zone writes where you stand now, over the line.
    this.saves.onZone(this.world.zone!.id);
    this.saves.update(dt);
  }

  /**
   * The quest arrow, if it shows: beside the line you're working on, turned
   * towards its place (or its giver) from where you stand and look.
   */
  private questArrow(): ArrowShown | null {
    const arrow = this.state.arrow;
    const to = arrow && arrowPoint(arrow.target, this.arrowSpots);
    const { head } = this.you;
    if (!arrow || !to || arrowHides(arrow.target, { x: head.x, z: head.z, interior: this.world.interior }, this.arrowSpots)) return null;
    const yaw = _turn.setFromQuaternion(this.player.camera.getWorldQuaternion(_look), 'YXZ').y;
    return { line: arrow.line, turn: arrowTurn({ x: head.x, z: head.z, yaw }, to) };
  }

  /** Is anything fighting you: a camp's (not walking home), or the Warden and what it raised? */
  private get fighting(): boolean {
    return this.camps.fighting || this.throne?.state === 'fighting';
  }

  /** Every enemy there is to fight: the camps', then the Warden's hall's. */
  private gatherFoes(): Enemy[] {
    const { foes } = this;
    foes.length = 0;
    for (const e of this.camps.enemies) foes.push(e);
    if (this.throne) for (const e of this.throne.enemies) foes.push(e);
    return foes;
  }

  /**
   * The camps outside are drawn with the outdoors. The mine's undead, and the
   * Warden with what it raises, are drawn where the mine is: each only in a
   * part of it that's drawn.
   */
  private showCamps(outdoors: boolean): void {
    const mine = this.world.mine;
    for (const camp of this.camps.camps) {
      if (camp.plan.interior !== 'mine' || !mine) camp.root.visible = outdoors;
      else showInMine(mine, camp.root);
    }
    if (this.throne && mine) showInMine(mine, this.throne.root);
  }

  /** The Warden stands up off its throne as you come through the gate, with a roar. */
  private wardenRises(w: Enemy): void {
    this.particles.burst('magic', _a.copy(w.position).setY(w.position.y + 0.2), 40);
    this.particles.burst('dust', w.position, 30);
    sfx.roar(w.position);
    this.text.banner(this.player.camera, 'THE BONE WARDEN', '#6ad0ff', 0.28);
  }

  /** It calls up the dead round you, as in the arena: a flash on its blade, and each clawing up out of the floor. */
  private wardenSummons(w: Enemy, at: readonly Vector3[]): void {
    w.weaponSegment(_a, _b);
    this.particles.burst('magic', _b, 30);
    sfx.summon(_b);
    for (const p of at) {
      this.particles.burst('magic', _a.copy(p).setY(p.y + 0.1), 16);
      this.particles.burst('dust', p, 12);
      sfx.rise(p);
    }
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
    const seed = this.seed(camp.plan.id, camp.members.indexOf(member));
    this.apply({ kind: 'kill', camp: camp.plan.id, level: enemy.level, role: plan.role ?? 'ordinary', family: enemy.family, seed }, enemy.position);
  }

  /** A kill's loot seed: from its camp, the enemy and the time. */
  private seed(...enemy: readonly (string | number)[]): number {
    return lootSeed(...enemy, Math.floor(this.clock * 1000));
  }

  /**
   * A fist, the sword's tip or your feet touches loot lying shown: a pouch's
   * coins are always taken, and an item goes into the bag with a buzz and the
   * pickup sound, or, with the bag full, stays flashing red under "Bag full".
   */
  private loot(dt: number, outdoors: boolean): void {
    const touching = { probes: this.touching(), feet: this.player.alive ? this.you.feet : null };
    const shown = (interior: Interior | null) => (interior === null ? outdoors : this.world.interior === interior);
    this.drops.update(dt, touching, shown, (touch) => this.take(touch));
  }

  /** Take what was touched into your things: false if it has to stay where it lies. */
  private take(touch: Touch): boolean {
    const effects = touch.item ? this.state.inventory.take([{ id: touch.item, count: 1 }]) : this.state.inventory.take([], touch.coins);
    const { take, full } = CONFIG.loot.buzz;
    const buzz = ({ intensity, ms }: { intensity: number; ms: number }) => {
      for (const hand of touch.hand ? [touch.hand] : (['left', 'right'] as const)) this.player.input.pulse(hand, intensity, ms);
    };
    if (effects.some((e) => e.kind === 'left')) {
      buzz(full);
      this.floatOver(touch.at, 0.3, 'Bag full', FULL_FLOAT);
      return false;
    }
    buzz(take);
    sfx.pickup();
    if (!touch.item) this.floatOver(touch.at, 0.2, `+${touch.coins} coins`, COINS_FLOAT);
    this.applyThings(effects, touch.at);
    return true;
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

  /**
   * The bag: the reach over a shoulder, and the panel's slots and tabs under
   * your fists and the sword's tip. What you dropped lies on the ground, and
   * a fist touching it takes it back into the bag.
   */
  private updateBag(dt: number): void {
    const { player, bag, bagHands, you } = this;
    for (const side of ['left', 'right'] as const) {
      const hand = player.input.hands[side];
      Object.assign(bagHands[side], { grip: hand.grip, tracked: hand.grip.visible, squeeze: hand.squeeze });
    }
    player.camera.getWorldDirection(_gaze);
    bag.update({ dt, head: you.head, gaze: _gaze, rig: player.rig, hands: bagHands, probes: this.touching(), alive: player.alive });
    const [left, right] = this.touching();
    const taken = this.dropped.update(dt, [left?.at ?? null, right?.at ?? null], (stack) => {
      const effects = this.state.inventory.take([stack]);
      const kept = effects.filter((e) => e.kind !== 'left');
      if (kept.length) this.applyThings(kept, you.head);
      const left = effects.find((e) => e.kind === 'left');
      return left?.kind === 'left' ? left.stack : null;
    });
    if (!taken) return;
    const { intensity, ms } = CONFIG.bag.buzz.takeBack;
    player.input.pulse(taken.hand === 0 ? 'left' : 'right', intensity, ms);
    sfx.pickup();
  }

  /** What an operation on your things did: saved, and shown at `at`. */
  private applyThings(effects: readonly Effect[], at: Vector3): void {
    this.saves.onEffects(effects);
    this.show(effects, at, false);
  }

  /**
   * Your hands show what you wear: the main hand's item is the sword you hold
   * (none, with it empty), the off hand's the shield on your arm, and gloves
   * tint your fists. Your numbers read what you wear.
   */
  private dressHands(): void {
    const { player, state } = this;
    const { gear } = state.inventory;
    player.sword.sword = state.sword ?? 'plain';
    player.sword.model.visible = gear.mainHand !== null;
    player.shield.model.visible = gear.offHand !== null;
    const gloves = itemOf(gear.hands ?? '');
    const tint = gloves ? lookOf(gloves).tint : null;
    for (const fist of Object.values(player.fists ?? {})) fist.tint(tint);
    player.stats = state.stats;
    player.hp = Math.min(player.hp, player.maxHp);
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
        case 'loot':
          // What a kill dropped, lying where it fell.
          this.drops.drop(at, e, this.world.interior);
          break;
        case 'slot':
          this.bag.changed();
          // Something worn or taken off (Hale's old longsword, straight into your hand, off their hip):
          // your hands show what you wear, and your numbers read it.
          if (e.where.in !== 'gear') break;
          this.dressHands();
          this.hale.swordAtHip = this.state.haleSwordAtHip;
          break;
        case 'coins':
          this.bag.changed();
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
      this.respawn = this.world.interior === 'mine' ? this.respawns.mine : this.respawns.village;
      this.text.banner(this.player.camera, 'YOU DIED', '#c81e1e');
    } else this.deadFor += dt;
    this.fade.level = (this.deadFor - D.linger) / D.fadeOut;
    if (this.deadFor >= D.linger + D.fadeOut + D.dark) this.wake();
  }

  /**
   * At the respawn point, with full health and no rage: by the inn's hearth
   * with the door shut, or on the rail bed outside the mine if you died in it.
   * Nothing else changes.
   */
  private wake(): void {
    const { x, z, yaw, interior } = this.respawn;
    this.world.settle(interior);
    this.player.reset(x, z, yaw);
    // Behind the fade, the chunks round where you wake, at once.
    this.world.fill(x, z);
    this.lastHp = this.player.hp;
    this.combat.projectiles.clear();
    this.deadFor = null;
    this.wakingFor = 0;
  }
}
