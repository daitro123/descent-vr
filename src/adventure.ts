import { Euler, Object3D, type PerspectiveCamera, Quaternion, type Scene, Vector3, type WebGLRenderer } from 'three';
import { type Ability, type AdventureEvent, AdventureState, type Effect } from './adventureState';
import { Birds, surroundingsOf } from './birds/birds';
import { type Shape, unlockLine } from './classes';
import { CHAINS } from './quests';
import { Combat } from './combat/combat';
import { CONFIG } from './config';
import { type Camp, type CampHooks, Camps, type Member, type You } from './enemies/camps';
import type { Emergence, Enemy } from './enemies/enemy';
import { Throne } from './enemies/throne';
import { Ambience } from './fx/ambience';
import { FloatingText } from './fx/floatingText';
import { Particles } from './fx/particles';
import { sfx, updateListener } from './fx/sfx';
import { Shockwaves } from './fx/shockwave';
import { SwordTrail } from './fx/trail';
import { Vines } from './fx/vines';
import type { Refusal, Where } from './inventory';
import { itemOf, type ItemId } from './items';
import { lootSeed } from './loot';
import { findMap } from './maps/registry';
import type { Crowd, Respawn, StartingZone, Zone } from './maps/types';
import { Hale } from './people/hale';
import { type Population, worldPopulation } from './people/population';
import { type Herds, worldHerds } from './animals/herds';
import { Villagers } from './people/villagers';
import { type AlchemyBench, standInHouse } from './professions/bench';
import { PROFESSION_NAMES, type Profession, type ProfessionsEffects } from './professions/professions';
import { lessonsFor, studies, type TrainerId } from './professions/trainers';
import { Gathering } from './professions/gathering/gathering';
import { Belt } from './player/belt';
import { Gestures } from './player/gestures/gestures';
import type { Handedness } from './player/input';
import { MageHands } from './player/mage';
import { Player } from './player/player';
import { Run } from './player/run';
import { Anvil } from './professions/anvil/anvil';
import { SaveController } from './save/controller';
import { type Interior, saveRecord } from './save/record';
import type { Played } from './save/store';
import { BeltHud } from './ui/beltHud';
import { Fade } from './ui/fade';
import { arrowHides, arrowPoint, arrowTurn, type ArrowSpots } from './ui/questArrow';
import { type ArrowShown, QuestTracker } from './ui/questTracker';
import { ZoneName } from './ui/zoneName';
import { RunVignette } from './ui/runVignette';
import { Bag, type BagHand, type Shelf } from './ui/bag/bag';
import { cardText } from './ui/bag/cardLines';
import { IconAtlas, lookOf } from './ui/bag/looks';
import { StashPanel } from './ui/bag/stashPanel';
import { coinsText } from './ui/bag/pieces';
import { placeBeside, type Press, type Probe, TalkBoard, type TrainRow } from './ui/talkBoard';
import { type VendorAt, WaresBoard } from './ui/wares/board';
import { waresPlacement } from './ui/wares/layout';
import { giverOf, isVendor, opensWith, trainerTalk, type VendorId, vendorTalk } from './vendors';
import { PEOPLE } from './models/people';
import type { GiverId } from './quests';
import { Drops, type Touch } from './world/drops';
import { Orbs } from './world/orbs';
import { Chests } from './world/chests';
import { Pickups } from './world/pickups';
import { BlobShadows } from './world/shadows';
import { Dropped } from './world/dropped';
import { StashChest } from './world/stashChest';
import type { Mine } from './world/mine';
import { World } from './world/world';
import { Critters } from './world/critters';
import { pointsAt, type Talent, TALENT_POINT_LINE, type TalentRefusal } from './talents';

const _a = new Vector3();
const _b = new Vector3();
/** What's thrown up round one that rises: earth, fen water, wet peat. */
const EMERGE: Record<Emergence, number> = { ground: 0x6a5e52, water: 0x8a9a8a, mud: 0x3a3022 };
const _gaze = new Vector3();
const _haleHead = new Vector3();
const _herbalist = { feet: new Vector3(), head: new Vector3() };
/** Where the wares board would stand beside a vendor. */
const _spot = new Object3D();
const _vendor: { -readonly [K in keyof VendorAt]: VendorAt[K] } = { id: 'smith', feet: new Vector3(), head: new Vector3() };
const _float = new Vector3();
const _look = new Quaternion();
const _crowd: { -readonly [K in keyof Crowd]: Crowd[K] } = { near: 0, most: 0 };
const _turn = new Euler();

type FloatStyle = Parameters<FloatingText['spawn']>[2];
/** "+N XP" where an enemy fell. */
const KILL_XP_FLOAT: FloatStyle = { color: '#ffd23a', scale: 0.24, life: CONFIG.levels.xpFloat.time, rise: 0.5 };
/** A hand-in's reward over Hale. */
const HAND_IN_FLOAT: FloatStyle = { scale: 0.2, life: CONFIG.handIn.time, rise: 0.3 };
/** The coins a pouch held, over it as it's taken. */
const COINS_FLOAT: FloatStyle = { color: '#ffd23a', scale: 0.1, life: 1, rise: 0.3 };
/** A lesson bought off a trainer's Train list, over their board. */
const LEARNED_FLOAT: FloatStyle = { color: '#ffffff', scale: 0.1, life: 1.6, rise: 0.25 };
/** A short word from what you're doing: "Cut lower" over a clump whose leaves you trimmed. */
const HINT_FLOAT: FloatStyle = { color: '#ffffff', scale: 0.09, life: 1.2, rise: 0.2 };
/** "Bag full" over an item a full bag leaves on the ground. */
const FULL_FLOAT: FloatStyle = { color: '#ff4a3a', scale: 0.12, life: CONFIG.loot.full.float, rise: 0.25 };

/** Each body under `root` drawn only in a part of the mine that's drawn. */
function showInMine(mine: Mine, root: Object3D): void {
  for (const body of root.children) body.visible = mine.drawn[mine.partAt(body.position.x, body.position.z)];
}

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
 * Lies Below. Each hand-in lays a pick of two items for your class on Hale's
 * board, and carrying one into the bag hands the quest in; Hale's old
 * longsword leaves their hip only if a warrior picks it.
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
  /** Abilities by gesture: the shapes your slots hold, once your level brings one. */
  readonly gestures: Gestures;
  /** The mage's hands (bolts, the ward and the blink), when you play a mage. */
  readonly mage: MageHands | null;
  /** Marshal Hale, the quest giver, at the crossroads. */
  readonly hale: Hale;
  /** The innkeeper, the smith and the farmer, at work. */
  readonly villagers: Villagers;
  /** Every zone's other villagers, built as you come near them and dropped as you walk on. */
  readonly people: Population;
  /** What they hang from: hidden with the outdoors. */
  private readonly peopleRoot: Object3D;
  /** Every zone's birds, flock by flock, built as you come near them (their root hidden with the outdoors). */
  readonly birds = new Birds((call, x, y, z) => sfx[call](new Vector3(x, y, z)));
  /** Every zone's sheep, dogs and horses placed by data, built as you come near them. */
  readonly herds: Herds;
  private readonly herdsRoot: Object3D;
  /** Every zone's critters (hares, frogs, rats), living and drawn only near you. */
  readonly critters: Critters;
  /** The alchemy bench in the house by the well; null in a zone without the house. The herbalist at its end is a villager. */
  readonly bench: AlchemyBench | null = null;
  /** The wind, the birds in the trees and each place's sound where it is. */
  readonly ambience: Ambience;
  /** Hale's board, which unfolds as you walk up to them. */
  readonly board = new TalkBoard();
  /** A vendor's talk board, while they have a quest to offer or take back or are your trainer: "Trade" sits beside its buttons. */
  readonly vendorBoard = new TalkBoard('');
  /** The herbalist's talk board, which unfolds as you walk up to them in the house by the well: their quest, and "Train". */
  readonly herbalistBoard = new TalkBoard(PEOPLE.herbalist.label);
  /** The smith's or the innkeeper's wares, unfolding beside them with the bag panel beside it. */
  readonly wares: WaresBoard;
  /** The quest you're on, top left of your view. */
  readonly tracker = new QuestTracker();
  /** The zone's name, floating up as you cross into it and when you load in. */
  readonly zoneName = new ZoneName();
  /** Has the zone's name floated up since you loaded in? */
  private named = false;
  /** What lies about for a quest, to pick up by hand: the leader's orders. */
  readonly pickups: Pickups;
  /** The zone's chests, shut until you touch a lid, and open for good after. */
  readonly chests: Chests;
  /** The bag: reach over a shoulder for it, and move your things about on its panel. */
  readonly bag: Bag;
  /** What you've let go of off the bag's panel, lying on the ground. */
  readonly dropped: Dropped;
  /** The potions at your hips: reach down for one and drink it at your mouth. */
  readonly belt: Belt;
  /** A hand-in's pick on Hale's board, carried into the bag to hand the quest in. */
  private readonly picks: Shelf = {
    itemAt: (at) => this.board.pickAt(at, CONFIG.bag.touch),
    stackAt: (i) => {
      const id = this.board.picks[i];
      return id ? { id, count: 1 } : null;
    },
    check: (i, to) => this.state.pickRefusal(this.board.picks[i] ?? '', to),
    take: (i, to) => this.handInPick(this.board.picks[i] ?? '', to),
    show: (hover, lifted) => this.board.highlight(hover, lifted),
  };
  /** The smith's anvil: step up to it with Smithing learned, and make things with the hammer and tongs. Null in a zone without a smith. */
  readonly anvil: Anvil | null;
  /** The tool loop behind your sword hip, the pick it gives near a copper vein, and the zone's veins. */
  readonly gathering: Gathering;
  /** The stash's chest by the inn's hearth: touch its lid and the stash panel opens beside the bag's. */
  readonly stashChest: StashChest;
  readonly stash: StashPanel;
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
  private readonly vines = new Vines();
  private readonly orbs = new Orbs();
  /** What kills drop, lying where they fell until touched. */
  readonly drops = new Drops();
  /** Seconds played since loading, for loot's seeds. */
  private clock = 0;
  private readonly fade: Fade;
  /** The edges of your view darkening while you run. */
  private readonly runVignette: RunVignette;
  private readonly you: You = { feet: new Vector3(), head: new Vector3(), sword: null, alive: true, interior: null };
  /** The starting zone's id: its own people and camps are drawn all over it, as they always were. */
  private readonly home: string;
  private readonly sword = { base: new Vector3(), tip: new Vector3(), speed: 0, swing: 0 };
  /** The edge a whetstone is rubbed along this frame: the blade, or the ranger's bow. */
  private readonly edge = { base: new Vector3(), tip: new Vector3() };
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
  /** A level a hand-in landed, floating over its giver (`over`) a moment after its XP. */
  private handInLevel: { level: number; unlocks: readonly Ability[]; in: number; over: Vector3 } | null = null;
  /** Where the save puts you: over the ground in world metres, facing as you look, and the building you're in. */
  private readonly standing: { x: number; z: number; yaw: number; interior: Interior | null } = { x: 0, z: 0, yaw: 0, interior: null };

  constructor(
    scene: Scene,
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    /** Where a new character starts: Oakvale. */
    zone: StartingZone,
    /** The character to play (their record, or none for a new one), who they are, and where their progress goes. */
    played: Pick<Played, 'key' | 'record' | 'who' | 'write'>,
    /** The zones over its seams (Brackenmoor), with their own villagers and camps, raised as you come near. */
    neighbours: readonly Zone[] = [],
    /** The top level, when a test raises it past the content's (`&cap=`). */
    cap?: number,
  ) {
    const { key, record, who } = played;
    this.home = zone.id;
    this.state = new AdventureState(record ?? undefined, CHAINS, { class: who.class, character: key, cap });
    const { inventory } = this.state;
    this.board.describe = (id) => cardText(id, 1, inventory.wearing, inventory.gear);
    this.saves = new SaveController(played, () => saveRecord(this.state.snapshot(), this.standing, Date.now(), who));
    this.world.attach(scene, camera, renderer);
    for (const n of neighbours) this.world.add(n);
    this.world.load(zone);
    this.respawns = zone.respawns;
    this.respawn = zone.respawns.village;
    this.player = new Player(camera, renderer, this.world, who.class);
    this.player.run = new Run();
    scene.add(this.player.rig, this.orbs.root, this.drops.root, this.shadows.mesh, this.vines.mesh);
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
    // Your hands, closed on what they hold, the bag over your shoulder and the potions at your hips.
    this.player.showFists();
    this.dropped = new Dropped(this.world);
    const atlas = new IconAtlas();
    this.bag = new Bag(
      {
        inventory: this.state.inventory,
        professions: this.state.professions,
        buzz: (hand, intensity, ms) => this.player.input.pulse(hand, intensity, ms),
        apply: (effects, at) => this.applyThings(effects, at),
        drop: (stack, at, velocity) => this.dropped.drop(stack, at, velocity),
        // The Talents tab: every press goes through the adventure state, out of a fight, and is shown and saved.
        talents: {
          state: this.state,
          fighting: () => this.fighting,
          spend: (talent: Talent) => this.onTalents({ kind: 'spend', talent, fighting: this.fighting }),
          reset: () => this.onTalents({ kind: 'resetTalents', fighting: this.fighting }),
          swap: (a: Shape, b: Shape) => this.onTalents({ kind: 'swap', shapes: [a, b], fighting: this.fighting }),
        },
        beltAt: (at) => this.belt.slotNear(at),
        mouth: (out) => this.belt.mouth(out),
        edge: (hand) => this.edgeFor(hand),
      },
      atlas,
    );
    this.belt = new Belt(this.player, {
      inventory: this.state.inventory,
      buzz: (hand, intensity, ms) => this.player.input.pulse(hand, intensity, ms),
      apply: (effects, at) => this.applyThings(effects, at),
      // A hand holding a tool from the loop takes no flask.
      busy: (hand) => hand === 'right' && this.gathering.drawn !== null,
    });
    // The tool loop hangs from the belt's frame; the veins out of doors load with the chunks round you, the mine's with the mine.
    this.gathering = new Gathering(zone.spots, {
      player: this.player,
      professions: this.state.professions,
      frame: this.belt.frame,
      particles: this.particles,
      buzz: (hand, intensity, ms) => this.player.input.pulse(hand, intensity, ms),
      apply: (effects, at) => this.applyGathered(effects, at),
      say: (words, at) => this.floatOver(at, 0.12, words, HINT_FLOAT),
      handBusy: () => this.belt.holding('right') >= 0,
    });
    this.gathering.addTo(scene);
    for (const { mesh, interior } of this.gathering.meshes) {
      scene.add(mesh);
      this.world.stageWith(interior, mesh);
    }
    this.gathering.warm(renderer, camera, scene);
    // The wares open beside the bag's panel, hung from it as the stash's is.
    this.wares = new WaresBoard(this.state.inventory, atlas);
    this.bag.panel.root.add(this.wares.root);
    scene.add(this.vendorBoard.root);
    this.wares.warm(renderer, camera, scene);
    scene.add(this.herbalistBoard.root);
    const { left, right } = this.player.input.hands;
    this.bagHands = { left: { grip: left.grip, tracked: false, squeeze: 0 }, right: { grip: right.grip, tracked: false, squeeze: 0 } };
    scene.add(this.bag.root, this.dropped.root, this.belt.root);
    this.bag.warm(renderer, camera, scene);
    this.belt.warm(renderer, camera, scene);
    this.dropped.warm(renderer, camera, scene);
    // The stash's chest stands in the inn's room, drawn while it is; its panel opens beside the bag's.
    this.stash = new StashPanel(this.state.inventory, atlas);
    this.stashChest = new StashChest(zone.stash);
    const stashRoom = zone.interiors.find((i) => i.id === zone.stash.interior)?.room;
    if (!stashRoom) throw new Error(`No room for the stash in the ${zone.stash.interior}`);
    stashRoom.add(this.stashChest.root);
    this.bag.panel.root.add(this.stash.root);
    this.stash.warm(renderer, camera, scene);

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
    this.mage = who.class === 'mage' ? new MageHands(this.player, this.combat, this.particles) : null;
    this.gestures = new Gestures({
      player: this.player,
      text: this.text,
      particles: this.particles,
      slots: () => this.state.slots,
      unlearned: () => this.state.unlearned,
      drawn: (shape) => this.apply({ kind: 'drawn', shape }, this.you.head),
      use: (ability, aim) => this.combat.use(ability, aim),
      // Your hands are the bag's while it's open, the bench's while you work at it, and a flask's or the pick's while you hold one.
      held: () => this.handsHeld,
      // A grip in the tool loop is the loop's, wherever the belt's frame has it hanging.
      taken: () => (this.gathering.inLoop ? 'the tool loop' : null),
      busy: () => this.combat.busy || (this.mage?.charging('right') ?? false),
    });
    if (this.combat.ranger) this.combat.ranger.held = () => this.handsHeld;
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
      // One lying in wait comes up: earth, a splash of fen water or wet peat thrown up round it.
      emerge: (e, from) => {
        sfx.rise(e.position, from);
        const big = e.kind === 'brute' || e.kind === 'warden';
        _a.copy(e.position);
        if (from === 'water') _a.y = this.world.waterAt(_a.x, _a.z) ?? _a.y;
        this.particles.burst(from === 'mud' ? 'blood' : 'dust', _a, big ? 18 : 10, undefined, EMERGE[from]);
      },
    };
    this.camps = new Camps(
      zone.camps,
      (plan) => (plan.interior === 'mine' && below ? below : this.world),
      hooks,
      { onKill: (camp, member) => this.onKill(camp, member) },
      this.state,
    );
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
    // The chests out of doors with the chunks round you; the mine's strongbox with the mine's meshes.
    this.chests = new Chests(zone.chests, (id) => this.state.inventory.isOpened(id));
    scene.add(this.chests.outdoors, this.chests.mine);
    this.world.stageWith(null, this.chests.outdoors);
    if (zone.mine) this.world.stageWith('mine', this.chests.mine);

    this.hale = new Hale(zone.hale, this.world, this.state.hale.marker, this.state.haleSwordAtHip);
    // The arrow's givers: Hale at the crossroads, and the two trainers where they work.
    const at = (id: GiverId) => {
      const v = zone.villagers.find((s) => s.id === id);
      return v ? { x: v.x, z: v.z } : undefined;
    };
    this.arrowSpots = { places: zone.places, givers: { hale: zone.hale, smith: at('smith'), herbalist: at('herbalist') } };
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
    // Every zone's own villagers, and every other zone's camps, are built as you come near them;
    // a zone loaded later (fetched over a seam) brings its own as it comes.
    const people = worldPopulation(this.world, this.state);
    this.people = people.population;
    this.peopleRoot = people.root;
    scene.add(this.peopleRoot, this.birds.root);
    this.world.stageWith(null, this.peopleRoot);
    this.world.stageWith(null, this.birds.root);
    // And their animals.
    const herds = worldHerds(this.world);
    this.herds = herds.herds;
    this.herdsRoot = herds.root;
    scene.add(this.herdsRoot);
    this.world.stageWith(null, this.herdsRoot);
    this.critters = new Critters(this.world, new BlobShadows(CONFIG.critters.most));
    scene.add(this.critters.root);
    this.world.stageWith(null, this.critters.root);
    this.populate(zone, false);
    for (const n of neighbours) this.populate(n, true);
    // The smith's hammer rings on the anvil with each blow of their work.
    this.ambience = new Ambience([zone, ...neighbours]);
    this.villagers.onStrike = () => this.ambience.strike('anvil');
    // The smith's anvil, drawn with the outdoors.
    const smith = zone.villagers.find((v) => v.id === 'smith');
    this.anvil = smith
      ? new Anvil(
          scene,
          this.world,
          smith,
          {
            professions: this.state.professions,
            inventory: this.state.inventory,
            hands: (tools) => this.player.holdTools(tools),
            buzz: (hand, intensity, ms) => this.player.input.pulse(hand, intensity, ms),
            apply: (effects, at) => this.applyMade(effects, at),
            smithAside: (to) => this.villagers.get('smith')?.stepAside(to),
          },
          { particles: this.particles, text: this.text },
        )
      : null;
    if (this.anvil) this.world.stageWith(null, this.anvil.frame);

    // The alchemy bench hangs from the house's room, drawn while it is; its herbalist is one of the villagers.
    const house = zone.interiors.find((i) => i.id === 'house');
    if (house) {
      this.bench = standInHouse(house, {
        player: this.player,
        professions: this.state.professions,
        inventory: this.state.inventory,
        particles: this.particles,
        apply: (effects, at) => this.applyMade(effects, at),
        dress: () => this.dressHands(),
        mouth: (out) => this.belt.mouth(out),
      });
      this.world.stageWith('house', this.bench.root);
    }

    // A new character (or one made on the page who hasn't played) at the zone's start, facing Hale; or where the save stood,
    // facing the same way, at full health and with no rage. A save made inside
    // the inn loads inside it, with the door shut and the room lit; one made in
    // the mine loads in it, standing on its floor (so it settles first).
    Object.assign(this.standing, record?.position ? { ...record.position, yaw: record.facing, interior: record.interior } : { ...zone.spawn, interior: null });
    const { x, z, yaw, interior } = this.standing;
    this.dressHands();
    this.world.settle(interior);
    this.player.reset(x, z, yaw);
    this.lastHp = this.player.hp;
    // Whoever lives round where you stand, there before the first frame (and uploaded with the chunks).
    this.camps.fill(_a.set(x, 0, z));
    this.people.fill(_a, this.crowdAt(_a));
    this.birds.fill(_a, this.birdsNear);
    this.herds.fill(_a, this.crowdAt(_a));
    // Oakvale round where you stand, all at once behind the page, and compiled now rather than when
    // it first comes into view (the World does that with the first fill). A save made over the pass
    // loads there, in Brackenmoor's air, with Oakvale streaming in behind you.
    this.world.fill(x, z);
    // From here on, crossing a seam is a moment: the zone's name floats up (and the game saves, in
    // `update`, once it knows where you stand); its sound follows the World's cues.
    // Leaving a zone, what you sold there can't be bought back.
    this.world.onZone = (zone) => {
      this.zoneName.show(zone.label);
      this.applyThings(this.state.inventory.leaveZone(), this.you.head);
    };
    this.world.onAdd = (zone) => {
      this.ambience.add(zone);
      this.populate(zone, true);
    };
  }

  /** How many villagers are built round `at`, and how near: the crowd of the zone it's in, no farther than you can see through the fog (in a fen). */
  private crowdAt(at: Vector3): Crowd {
    const { near, most } = this.world.zoneAt(at.x, at.z)?.crowd ?? CONFIG.population;
    _crowd.near = Math.min(near, this.world.outdoorsSeen);
    _crowd.most = most;
    return _crowd;
  }

  /** How near flocks are built: CONFIG.birds.near, or only as far as you can see through the fog. */
  private get birdsNear(): number {
    return Math.min(CONFIG.birds.near, this.world.outdoorsSeen);
  }

  /**
   * Take in a zone's villagers and camps as it's loaded. The starting zone's
   * camps stand from the start, as they always have (they're made with the
   * Adventure); another zone's (`lazy`) sleep until you come near.
   */
  private populate(zone: Zone, lazy: boolean): void {
    this.people.add(zone.people);
    this.birds.add(zone.birds, surroundingsOf(zone));
    this.herds.add(zone.animals);
    this.critters.add(zone.critters ?? []);
    if (lazy) this.camps.add(zone.camps, this.world, true);
  }

  update(dt: number): void {
    // Clamp: a dropped frame (or tab switch) shouldn't teleport anything.
    dt = Math.min(dt, 1 / 30);
    this.clock += dt;
    const { player, you } = this;
    this.world.update(dt, player.camera);
    // With a door shut behind you, what stands outside isn't drawn either.
    const outdoors = this.world.outdoorsShown;
    this.pickups.root.visible = this.villagers.root.visible = this.peopleRoot.visible = this.herdsRoot.visible = this.birds.root.visible = this.critters.root.visible = this.chests.outdoors.visible = outdoors;
    // The starting zone's own people, out of doors, are drawn from another zone only near, as anyone's are.
    this.hale.root.visible = outdoors && this.drawn(this.distance(this.hale.root.position));
    for (const v of this.villagers.all) if (!v.spot.interior) v.root.visible = this.drawn(this.distance(v.root.position));
    for (const { mesh, interior } of this.gathering.meshes) if (interior === null) mesh.visible = outdoors;
    if (this.anvil) this.anvil.frame.visible = outdoors;
    this.showCamps(outdoors);
    player.fighting = this.fighting;
    player.update(dt);
    // The belt's cooldown runs down, as do your buffs, and a hand at a hip may take a flask (and its weapon fades).
    const ended = this.state.inventory.tick(dt);
    if (ended.length) this.show(ended, you.head, false);
    this.belt.update(dt, this.bag.beltTarget);
    // The tool loop, and the pick at a vein: after the belt, so the sword's away before anything swings it.
    this.gathering.update({
      dt,
      fighting: this.fighting,
      station: player.holdingTools || this.bench?.bare === true,
      interior: this.world.interior,
      outdoors,
      mineDrawn: (x, z) => {
        const mine = this.world.mine;
        return !!mine && mine.drawn[mine.partAt(x, z)];
      },
    });
    this.mage?.update(dt, this.handsHeld);
    this.runVignette.update(dt, player.running);
    updateListener(player.camera);
    const { hands } = player.input;
    const foes = this.gatherFoes();
    if (hands.left.primaryPressed || hands.right.primaryPressed) this.combat.press(foes);

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
    this.gestures.update(dt);
    this.camps.update(enemyDt, you);
    this.throne?.update(enemyDt, you, this.state.wardenSeated);
    // The ambience's mix follows the light's cues, and dips while anything fights you.
    this.ambience.update(dt, you.head, this.world.cues, this.fighting);
    this.combat.projectiles.render();
    this.heal(dt);
    this.updateDeath(dt);

    this.shadows.cast(you.feet, this.gatherFoes());
    this.vines.place(this.foes); // as just gathered
    if (sword.tip.valid) {
      sword.segment(rig, _a, _b);
      this.trail.update(dt, _a, _b, sword.hot, player.frenzy > 0);
    }
    this.orbs.update(dt, player);
    this.loot(dt, outdoors);
    this.talk(dt);
    this.trade(dt);
    this.teach(dt);
    this.updateAnvil(dt);
    this.updateBag(dt);
    this.villagers.update(dt, you.head, this.state);
    this.people.update(dt, you.head, this.crowdAt(you.head));
    this.birds.update(dt, you.head, this.birdsNear);
    this.herds.update(dt, you.head, this.crowdAt(you.head));
    if (outdoors) this.critters.update(dt, you.head);
    // Talking to the herbalist holds the bench off: it takes your hands once the talk ends.
    this.bench?.update(dt, this.fighting, this.herbalistBoard.isOpen);
    this.pickUp();
    this.openChests(dt);
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
    this.hud.status.buffs = this.state.inventory.buffs;
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

  /** Are your hands the bag's (it's open), the bench's (you work at it), a flask's (off the belt) or the pick's now, not your weapons'? */
  private get handsHeld(): boolean {
    return (
      this.bag.isOpen ||
      this.bench?.bare === true ||
      this.belt.holding('left') >= 0 ||
      this.belt.holding('right') >= 0 ||
      this.gathering.drawn !== null
    );
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
    if (mine) showInMine(mine, this.chests.mine);
    for (const { mesh, interior, spots } of this.gathering.meshes) {
      if (interior === 'mine') mesh.visible = !!mine && spots.some((s) => mine.drawn[mine.partAt(s.x, s.z)]);
    }
    for (const camp of this.camps.camps) {
      if (camp.plan.interior !== 'mine' || !mine) camp.root.visible = outdoors && (camp.lazy || this.drawn(camp.away(this.you.feet)));
      else showInMine(mine, camp.root);
    }
    if (this.throne && mine) showInMine(mine, this.throne.root);
  }

  /**
   * Is the starting zone's own character (Hale, its villagers, its camps)
   * `away` m off drawn? All over the starting zone, as they always were; from
   * another, only as near as anyone's built there (CONFIG.population).
   */
  private drawn(away: number): boolean {
    const { near, hysteresis } = CONFIG.population;
    return this.world.zone?.id === this.home || away < near + hysteresis;
  }

  /** How far `at` is from your feet, on the floor plane. */
  private distance(at: { readonly x: number; readonly z: number }): number {
    return Math.hypot(at.x - this.you.feet.x, at.z - this.you.feet.z);
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
   * The smith and the innkeeper trade. Walk up to one looking their way and
   * their wares board unfolds beside them, with the bag panel opening beside
   * it; walk off and both fold. A vendor who has a quest to offer or take back
   * talks first, with "Trade" beside the quest's buttons.
   */
  private trade(dt: number): void {
    const { player, you, state, wares, vendorBoard, bag } = this;
    const T = CONFIG.talk;
    player.camera.getWorldDirection(_gaze);
    const vendor = this.vendorNear();
    const giver = giverOf(vendor.id);
    const shows = giver ? state.giver(giver) : null;
    // A trainer you've learned from talks first, with "Train" beside "Trade".
    const trains = vendor.id === 'smith' && studies('smith', state.professions);
    const eyes = { head: you.head, gaze: _gaze };
    const probes = this.touching();
    const d = Math.hypot(you.head.x - vendor.feet.x, you.head.z - vendor.feet.z);
    // Walked off (or another vendor's nearer): the wares close, and the bag's panel with them.
    if (wares.isOpen && (d > T.close || wares.vendor !== vendor.id)) bag.close(`walked away from ${wares.name}`);
    if (d > T.close) wares.walkedAway();
    // The anvil has your hands: the smith's wares shut, and stay shut until you've walked away and back.
    const smithing = this.anvil?.tools ?? false;
    if (smithing) {
      if (wares.isOpen) bag.close('your hands went to the anvil');
      wares.hold();
      if (vendorBoard.isOpen) vendorBoard.fold();
    }
    const talkFirst = !smithing && !wares.isOpen && opensWith(shows, trains) === 'talk';
    if (talkFirst && !vendorBoard.isOpen) vendorBoard.name = PEOPLE[vendor.id].label;
    const talk = shows ? vendorTalk(shows, trains) : { line: '', buttons: ['trade'] as const, picks: [] };
    const press = vendorBoard.update(dt, eyes, vendor, probes, talk, talkFirst);
    if (press) this.vendorPress(press, vendor, giver, trains);
    else if (!wares.isOpen && !wares.held && !talkFirst && !vendorBoard.isOpen && d < T.open) {
      const angle = (_gaze.angleTo(_b.subVectors(vendor.head, you.head)) * 180) / Math.PI;
      if (angle < T.facing) this.openWares(vendor, `walked up to ${PEOPLE[vendor.id].label.toLowerCase()}`);
    }
    const hand = wares.press(dt, probes);
    if (hand) this.sellJunk(hand);
  }

  /** The vendor nearest you that's drawn (the innkeeper only with the inn), where they stand. */
  private vendorNear(): VendorAt {
    let best = null;
    let bestD = Infinity;
    for (const v of this.villagers.all) {
      if (!isVendor(v.id)) continue;
      const d = v.far(this.you.head) + (v.shown ? 0 : 1e6);
      if (d < bestD) {
        best = v;
        bestD = d;
      }
    }
    const v = best!;
    _vendor.id = v.id as VendorId;
    v.root.getWorldPosition(_vendor.feet);
    _vendor.head.copy(_vendor.feet).setY(_vendor.feet.y + v.headY);
    return _vendor;
  }

  /**
   * A press on a vendor's talk board: the quest's buttons go to the adventure
   * state, "Trade" unfolds the wares, and a trainer's "Train" shows their
   * Train list, whose rows buy.
   */
  private vendorPress(press: Press, vendor: VendorAt, giver: GiverId | null, trains: boolean): void {
    const { intensity, ms } = CONFIG.talk.buzz;
    this.player.input.pulse(press.hand, intensity, ms);
    const { vendorBoard, wares } = this;
    const trainer = vendor.id === 'smith' ? 'smith' : null;
    switch (press.button) {
      case 'trade':
        vendorBoard.fold();
        this.openWares(vendor, 'traded');
        break;
      case 'accept':
        vendorBoard.fold();
        wares.hold();
        if (giver) this.apply({ kind: 'accept', giver }, vendor.head);
        break;
      case 'handIn':
        // The talk goes on: they offer their next quest, or trade and train.
        if (giver) this.apply({ kind: 'handIn', giver }, vendor.head);
        if (giver) vendorBoard.show(vendorTalk(this.state.giver(giver), trainer !== null && studies(trainer, this.state.professions)));
        break;
      case 'train':
        if (trainer) vendorBoard.showTrain(this.trainRows(trainer));
        break;
      case 'back':
        if (giver) vendorBoard.show(vendorTalk(this.state.giver(giver), trains));
        break;
      case 'lesson':
        if (trainer) this.buyLesson(vendorBoard, trainer, press.recipe, press.hand);
        break;
      case 'notNow':
      case 'goodbye':
        vendorBoard.fold();
        wares.hold();
    }
  }

  /**
   * The herbalist in the house by the well: walk up to them, inside, looking
   * their way, and their board unfolds with their quest (a gold "!" once
   * Raiders in the Fields is handed in) and, once you've learned from them,
   * "Train". It doesn't unfold while your hands are the bench's; while it's
   * open, the bench waits for the talk to end.
   */
  private teach(dt: number): void {
    const herbalist = this.villagers.get('herbalist');
    const board = this.herbalistBoard;
    if (!herbalist) return;
    const { player, you, state } = this;
    player.camera.getWorldDirection(_gaze);
    herbalist.root.getWorldPosition(_herbalist.feet);
    _herbalist.head.copy(_herbalist.feet).setY(_herbalist.feet.y + herbalist.headY);
    const atBench = this.bench?.bare === true;
    const trains = studies('herbalist', state.professions);
    const talk = trainerTalk(state.giver('herbalist'), trains);
    const approach = !atBench && herbalist.shown && this.world.interior === 'house';
    const press = board.update(dt, { head: you.head, gaze: _gaze }, _herbalist, this.touching(), talk, approach);
    if (!press) return;
    const { intensity, ms } = CONFIG.talk.buzz;
    player.input.pulse(press.hand, intensity, ms);
    switch (press.button) {
      case 'accept':
        board.fold();
        this.apply({ kind: 'accept', giver: 'herbalist' }, _herbalist.head);
        break;
      case 'handIn':
        // The talk goes on: they see you off, with "Train".
        this.apply({ kind: 'handIn', giver: 'herbalist' }, _herbalist.head);
        board.show(trainerTalk(state.giver('herbalist'), studies('herbalist', state.professions)));
        break;
      case 'train':
        board.showTrain(this.trainRows('herbalist'));
        break;
      case 'back':
        board.show(talk);
        break;
      case 'lesson':
        this.buyLesson(board, 'herbalist', press.recipe, press.hand);
        break;
      default:
        board.fold();
    }
  }

  /** `trainer`'s Train list as their board shows it: a row per lesson, with its price and the proficiency it needs, grey unless buying would go. */
  private trainRows(trainer: TrainerId): TrainRow[] {
    return lessonsFor(trainer, this.state.professions).map((l) => ({
      recipe: l.recipe,
      name: l.name,
      lit: l.refused === null,
      detail: l.refused === 'known' ? 'Known' : `${coinsText(l.price)}, ${PROFESSION_NAMES[l.profession]} ${l.needs}`,
    }));
  }

  /**
   * A row of `trainer`'s Train list pressed: bought through the professions
   * module (coins out, the recipes known, saved) with "Learned: …" over the
   * board and the list shown again; a grey one buys nothing and buzzes hard.
   */
  private buyLesson(board: TalkBoard, trainer: TrainerId, recipe: string, hand: 'left' | 'right'): void {
    const T = CONFIG.talk.train;
    const effects = this.state.professions.buy(recipe);
    if (effects.some((e) => e.kind === 'refused')) {
      this.player.input.pulse(hand, T.refused.intensity, T.refused.ms);
      return;
    }
    this.player.input.pulse(hand, T.bought.intensity, T.bought.ms);
    sfx.pickup();
    this.applyThings(effects, board.root.position);
    const name = lessonsFor(trainer, this.state.professions).find((l) => l.recipe === recipe)?.name ?? recipe;
    this.floatOver(board.root.position, 0.32, `Learned: ${name}`, LEARNED_FLOAT);
    board.showTrain(this.trainRows(trainer));
  }

  /**
   * The vendor's wares open as a panel beside the bag's, which stands where
   * Hale's board would, turned to you, with the wares on its left: no reach needed.
   */
  private openWares(vendor: VendorAt, why: string): void {
    const { you, wares } = this;
    const { out, side, height } = CONFIG.vendors.board;
    wares.stock(vendor.id);
    placeBeside(_spot, you.head, vendor.feet, out, side, height);
    _spot.updateMatrixWorld(true);
    const beside = waresPlacement();
    const at = _spot.localToWorld(_a.set(-beside.x, 0, -beside.z));
    this.bag.openBeside(wares, you.head, _gaze, this.touching(), `${wares.name}, ${why}`, at);
  }

  /** "Sell junk": every grey in the bag sold at once, with a buzz and the coins' sound; a light buzz with none. */
  private sellJunk(hand: 'left' | 'right'): void {
    const effects = this.state.inventory.sellJunk();
    const B = CONFIG.vendors.buzz;
    const { intensity, ms } = effects.length ? B.trade : B.nothing;
    this.player.input.pulse(hand, intensity, ms);
    if (!effects.length) return;
    sfx.pickup();
    this.applyThings(effects, this.wares.root.position);
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
    // Touching the stash chest's lid opens the stash beside the bag.
    const lid = this.stashChest.update(dt, this.stash.isOpen, this.touching());
    if (lid) {
      const { intensity, ms } = CONFIG.bag.stashChest.buzz;
      player.input.pulse(lid.hand, intensity, ms);
      sfx.chest(lid.at);
      bag.openBeside(this.stash, you.head, _gaze, this.touching(), `the stash, ${lid.hand} hand on its lid`);
    }
    const shelf = this.board.picks.length ? this.picks : null;
    bag.update({ dt, head: you.head, gaze: _gaze, rig: player.rig, hands: bagHands, probes: this.touching(), alive: player.alive, shelf });
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

  /**
   * A pick carried from Hale's board into bag slot `to`: the quest is handed
   * in, with its fanfare over Hale, and the talk goes on. Refused (a full
   * bag), the pick and the quest wait on the board.
   */
  private handInPick(pick: ItemId, to: Where): Refusal | null {
    const effects = this.state.apply({ kind: 'handIn', pick, to });
    this.saves.onEffects(effects);
    this.show(effects, this.hale.head(_haleHead), true);
    const refused = effects.find((e) => e.kind === 'refused');
    if (refused) return refused.reason as Refusal;
    this.board.show(this.state.hale);
    return null;
  }

  /** The anvil: your hands on it while you stand at it, and the work under way. */
  private updateAnvil(dt: number): void {
    const { anvil, player, you } = this;
    if (!anvil) return;
    const [left, right, tip] = this.touching();
    player.camera.getWorldDirection(_gaze);
    anvil.update({
      dt,
      head: you.head,
      gaze: _gaze,
      fighting: this.fighting,
      alive: player.alive,
      squeeze: player.input.hands.left.squeeze,
      fists: [left?.at ?? null, right?.at ?? null],
      tip: tip?.at ?? null,
    });
  }

  /** What an operation on your things did: saved, and shown at `at`. */
  private applyThings(effects: readonly Effect[], at: Vector3): void {
    this.saves.onEffects(effects);
    this.show(effects, at, false);
  }

  /**
   * What emptying a gathering spot did: saved and shown at `at` ("+1 Mining"),
   * and the spot counted for your quests. What a full bag can't take lies on
   * the ground there, to take back as anything dropped is.
   */
  private applyGathered(effects: ProfessionsEffects, at: Vector3): void {
    for (const e of effects) if (e.kind === 'left') this.dropped.drop(e.stack, _a.copy(at).setY(at.y + 0.1));
    this.applyThings(effects, at);
    for (const e of effects) if (e.kind === 'gathered') this.apply({ kind: 'gathered', spot: e.spot }, at);
  }

  /** What a make at a station did: saved and shown at `at`, and what it made counted for your quests. */
  private applyMade(effects: readonly Effect[], at: Vector3): void {
    this.applyThings(effects, at);
    for (const e of effects) if (e.kind === 'made') this.apply({ kind: 'made', recipe: e.recipe }, at);
  }

  /**
   * Your hands show what you wear: the main hand's item is the sword you hold
   * (none, with it empty), or the ranger's bow in the other hand; the off
   * hand's the shield on your arm, and gloves tint your fists. Your numbers
   * read what you wear.
   */
  private dressHands(): void {
    const { player, state } = this;
    const { gear } = state.inventory;
    player.sword.sword = state.sword ?? 'plain';
    player.sword.model.visible = gear.mainHand !== null;
    player.shield.model.visible = gear.offHand !== null;
    this.combat.ranger?.wear(itemOf(gear.mainHand ?? ''));
    this.mage?.wear(itemOf(gear.mainHand ?? ''), itemOf(gear.offHand ?? ''));
    const gloves = itemOf(gear.hands ?? '');
    const tint = gloves ? lookOf(gloves).tint : null;
    for (const fist of Object.values(player.fists ?? {})) fist.tint(tint);
    player.stats = state.stats;
    player.hp = Math.min(player.hp, player.maxHp);
  }

  /**
   * The edge a whetstone carried in `hand` is rubbed along: the sword's blade
   * in your other hand, or the ranger's bow (for its arrowheads). None while
   * that hand holds nothing that takes an edge.
   */
  private edgeFor(hand: Handedness): { readonly base: Vector3; readonly tip: Vector3 } | null {
    const { player, edge } = this;
    const bow = this.combat.ranger?.bow;
    if (bow) {
      if (hand === 'left' || !bow.tracked) return null;
      edge.base.copy(bow.topTip);
      edge.tip.copy(bow.bottomTip);
      return edge;
    }
    const { sword } = player;
    if (hand === 'right' || this.state.inventory.gear.mainHand === null || sword.away || !sword.tip.valid || !sword.model.visible) return null;
    sword.segment(player.rig, edge.base, edge.tip);
    return edge;
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

  /**
   * A fist or the sword's tip touches a shut chest's lid: it swings open for
   * good with a creak and a buzz in that hand, and what's inside comes out on
   * the ground beside it, to take as a kill's loot is taken.
   */
  private openChests(dt: number): void {
    const lifted = this.chests.update(dt, this.touching(), (id) => this.state.inventory.isOpened(id));
    if (!lifted) return;
    const { chest, hand } = lifted;
    const { intensity, ms } = CONFIG.chests.buzz;
    this.player.input.pulse(hand, intensity, ms);
    sfx.chest(_a.set(chest.x, chest.y + CONFIG.chests.looks[chest.look].h, chest.z));
    this.apply({ kind: 'chest', chest: chest.id, level: chest.level }, _a.set(chest.drop.x, chest.drop.y, chest.drop.z));
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

  /** Something pressed on the Talents tab: into the adventure state at your head, and why nothing happened, if it didn't. */
  private onTalents(event: AdventureEvent): TalentRefusal | null {
    const effects = this.state.apply(event);
    this.saves.onEffects(effects);
    this.show(effects, this.you.head, false);
    const refused = effects.find((e) => e.kind === 'talentRefused');
    return refused?.kind === 'talentRefused' ? refused.reason : null;
  }

  /**
   * Something happened: into the adventure state, into the save if it earned
   * anything, and show what it did at `at`. A hand-in's coins float under its XP.
   */
  private apply(event: AdventureEvent, at: Vector3): void {
    const coins = this.state.inventory.coins;
    const effects = this.state.apply(event);
    this.saves.onEffects(effects);
    this.show(effects, at, event.kind === 'handIn');
    const gained = this.state.inventory.coins - coins;
    if (event.kind === 'handIn' && gained > 0) this.floatOver(at, CONFIG.handIn.height - 0.15, `+${coinsText(gained)}`, { ...COINS_FLOAT, life: CONFIG.handIn.time });
  }

  /**
   * What the adventure state did. A kill's XP floats where it was earned, and
   * a level reached is a moment. A hand-in's reward floats over its giver
   * (`at`) with a fanfare: the XP, then the level a moment later. Taking a
   * quest, progress and finishing flash the tracker. A kill that passes two
   * levels at once shows the higher, with every ability both brought. A pair
   * of professions learned (taking an intro quest) is said in view.
   */
  private show(effects: readonly Effect[], at: Vector3, handIn: boolean): void {
    const unlocks: Ability[] = [];
    const learned: Profession[] = [];
    let reached = 0;
    for (const e of effects) {
      switch (e.kind) {
        case 'learned':
          if ('profession' in e) learned.push(e.profession);
          break;
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
          if (e.stage !== 'handedIn') break;
          sfx.fanfare();
          // A pick of Hale's old longsword takes it off their hip.
          this.hale.swordAtHip = this.state.haleSwordAtHip;
          break;
        case 'loot':
          // What a kill dropped, lying where it fell.
          this.drops.drop(at, e, this.world.interior);
          break;
        case 'slot':
          this.bag.changed();
          this.wares.changed();
          // Something worn or taken off: your hands show what you wear, your numbers read it,
          // and a pick's card on Hale's board compares against it.
          if (e.where.in !== 'gear') break;
          this.dressHands();
          this.board.repaintPicks();
          break;
        case 'coins':
          this.bag.changed();
          this.wares.changed();
          break;
        case 'sold':
          this.wares.changed();
          break;
        case 'talent':
        case 'talentsReset':
          // Your talents' numbers and abilities: Toughness's health, a talent ability's pip and shape.
          this.dressHands();
          break;
        case 'drank': {
          // Health, rage (the warrior's, once the War Cry has brought it) or a share of the mage's mana.
          const { player } = this;
          player.heal(player.maxHp * e.heal);
          if (e.rage && player.bar.kind === 'rage') player.addRage(e.rage);
          if (e.mana && player.bar.kind === 'mana') player.resource = Math.min(player.bar.size, player.resource + player.bar.size * e.mana);
          break;
        }
        case 'buff':
          // The whetstone's or the elixir's more damage, from now: its icon shows beside the belt HUD.
          this.player.stats = this.state.stats;
          sfx.buff();
          this.floatOver(at, 0.1, `+${Math.round(e.damage * 100)}% damage`, { ...KILL_XP_FLOAT, color: '#9fe08a', scale: 0.08, rise: 0.25 });
          break;
        case 'buffEnded':
          this.player.stats = this.state.stats;
          break;
        case 'proficiency':
          // "+1 Alchemy", small and white where it was made, in the XP float's style.
          this.floatOver(at, 0, `+${e.gained} ${PROFESSION_NAMES[e.profession]}`, { ...KILL_XP_FLOAT, color: '#ffffff', scale: 0.08, rise: 0.25 });
          break;
      }
    }
    if (learned.length) {
      sfx.levelUp();
      this.text.banner(this.player.camera, `${learned.map((p) => PROFESSION_NAMES[p]).join(' and ')} learned`, '#f0e0b0', 0.1, 0.08, CONFIG.levels.levelUp.lines);
    }
    if (!reached) return;
    this.gainLevel();
    if (handIn) this.handInLevel = { level: reached, unlocks, in: CONFIG.handIn.levelAfter, over: at.clone() };
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
   * kill, or over the giver's head (`over`) after a hand-in (whose fanfare is its sound).
   */
  private announceLevel(level: number, unlocks: readonly Ability[], over: Vector3 | null = null): void {
    const { player, text } = this;
    const { banner, lines } = CONFIG.levels.levelUp;
    if (over) {
      const { height, levelHeight } = CONFIG.handIn;
      this.floatOver(over, height + levelHeight, `LEVEL ${level}`, { color: '#ffffff', ...HAND_IN_FLOAT });
    }
    else {
      sfx.levelUp();
      text.banner(player.camera, `LEVEL ${level}`, '#ffd23a', 0.34, 0.3, banner);
    }
    const said = unlocks.map(unlockLine);
    // Every level from 2 brings a talent point.
    if (pointsAt(level) > pointsAt(level - 1)) said.push(TALENT_POINT_LINE);
    said.forEach((line, i) => text.banner(player.camera, line, '#f0e0b0', 0.09, 0.08 - i * 0.12, lines));
  }

  /** Words floating up from `height` metres over `at`. */
  private floatOver(at: Vector3, height: number, words: string, style: FloatStyle): void {
    this.text.spawn(words, _float.copy(at).setY(at.y + height), style);
  }

  /** The level a hand-in landed floats over its giver a moment after its XP. */
  private updateHandIn(dt: number): void {
    const pending = this.handInLevel;
    if (!pending || (pending.in -= dt) > 0) return;
    this.handInLevel = null;
    this.announceLevel(pending.level, pending.unlocks, pending.over);
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
      this.respawn = this.world.interior === 'mine' ? this.respawns.mine : this.respawnNear(this.you.feet);
      this.text.banner(this.player.camera, 'YOU DIED', '#c81e1e');
    } else this.deadFor += dt;
    this.fade.level = (this.deadFor - D.linger) / D.fadeOut;
    if (this.deadFor >= D.linger + D.fadeOut + D.dark) this.wake();
  }

  /** Where you wake after falling at `at`, out of doors: the zone you're in's respawn point nearest it, or the village's if it has none. */
  private respawnNear(at: Vector3): Respawn {
    let best = this.respawns.village;
    let bestD = Infinity;
    for (const r of this.world.zone?.respawnPoints ?? []) {
      const d = Math.hypot(r.x - at.x, r.z - at.z);
      if (d < bestD) [best, bestD] = [r, d];
    }
    return best;
  }

  /**
   * At the respawn point, with full health and no rage: by the inn's hearth
   * with the door shut, or on the rail bed outside the mine if you died in it,
   * or at the zone's own nearest where you fell. Nothing else changes.
   */
  private wake(): void {
    const { x, z, yaw, interior } = this.respawn;
    this.world.settle(interior);
    this.player.reset(x, z, yaw);
    // Behind the fade, who lives round where you wake and the chunks round it, at once.
    this.camps.fill(_a.set(x, 0, z));
    this.people.fill(_a, this.crowdAt(_a));
    this.birds.fill(_a, this.birdsNear);
    this.herds.fill(_a, this.crowdAt(_a));
    this.world.fill(x, z);
    this.lastHp = this.player.hp;
    this.combat.clear();
    this.mage?.clear();
    this.deadFor = null;
    this.wakingFor = 0;
  }
}
