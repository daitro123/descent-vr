import { CONFIG } from '../../config';
import type { Inventory } from '../../inventory';
import { itemOf } from '../../items';
import { type Professions, type ProfessionsEffects, type Recipe, type RecipeId, recipeOf } from '../professions';

// The make under way at the smith's anvil, with no DOM, three.js or XR in it:
// what's on the station and where (in the crucible, on the mould, in the
// fire, on the anvil, or in the tongs), how hot it is, how far each mark is
// worked, and whether it's made. The board starts a make through the
// professions module, which takes its materials; smelting finishes by
// itself, the whetstone when its last mark is worked, and the gauntlets when
// quenched. What's made goes to the bag, or waits here with the bag full.
// The view (anvil.ts) moves and draws it and feeds it strikes
// (.scratch/professions/spec.md, "Stations"; promoted from ?proto=anvil variant A).

/** How a recipe is made at the anvil: smelted in the crucible, hammered cold, or heated, hammered and quenched. */
export type Form = 'bar' | 'whetstone' | 'gauntlets';

/** Each anvil recipe's form. A later grade's recipes add rows. */
export const FORMS: Readonly<Record<RecipeId, Form>> = {
  'copper-bar': 'bar',
  whetstone: 'whetstone',
  'copper-gauntlets-of-strength': 'gauntlets',
  'copper-gauntlets-of-agility': 'gauntlets',
  'copper-gauntlets-of-intellect': 'gauntlets',
};

/** Where the glowing marks are on each hammered form, in metres from the work's middle (x along the anvil, z across). */
export const MARKS: Readonly<Record<Exclude<Form, 'bar'>, readonly (readonly [number, number])[]>> = {
  whetstone: [[-0.065, 0.014], [0, -0.014], [0.065, 0.014]],
  gauntlets: [[-0.1, 0.03], [-0.05, -0.03], [0, 0.03], [0.05, -0.03], [0.1, 0.03]],
};

/** Where a piece rests at the station, or in the tongs. */
export type Place = 'crucible' | 'mould' | 'fire' | 'anvil' | 'held';

/** Somewhere a piece can be let go of: a spot, or anywhere else. */
export type Drop = Exclude<Place, 'held'> | 'away';

/** A spot on the work to strike, and how far it's worked (0 to 1). */
export interface Mark {
  readonly x: number;
  readonly z: number;
  value: number;
}

/** The piece being worked. */
export interface Piece {
  readonly recipe: Recipe;
  readonly form: Form;
  place: Place;
  /** The spot it goes back to if let go of where it can't be. */
  home: Exclude<Place, 'held'>;
  /** 0 cold to 1 fresh from the fire. */
  heat: number;
  /** Seconds of smelting left (the bar's). */
  smelting: number;
  readonly marks: Mark[];
  quenched: boolean;
  /** Made, but the bag was full: it waits here. */
  waiting: boolean;
}

/** How a strike came down: a tap, or a good or great strike. */
export type Grade = 'tap' | 'good' | 'great';

/** What a strike did: worked a mark, landed on metal gone cold, off every mark, or on nothing to work. */
export type Struck = 'worked' | 'cold' | 'miss' | 'idle';

/** A strike's grade by how fast the face came down (m/s) and how far (m). */
export function gradeOf(speed: number, travel: number): Grade {
  const A = CONFIG.professions.anvil;
  if (travel < A.minTravel || speed < A.tapSpeed) return 'tap';
  return speed >= A.greatSpeed ? 'great' : 'good';
}

/** What happened this frame or on this act, for the view to show. */
export interface WorkEffects {
  /** The professions and inventory's own effects: to save and show. */
  readonly effects: ProfessionsEffects;
  /** Something made this time: it's in the bag, or `left` waiting on the station. */
  readonly made: { readonly piece: Piece; readonly left: boolean } | null;
  /** A waiting thing that has gone into the bag at last. */
  readonly bagged: Piece | null;
}

const nothing: WorkEffects = { effects: [], made: null, bagged: null };

/** Something the station refuses, and why, in words. */
export interface Refused {
  readonly refused: string;
}

export class AnvilWork {
  /** The piece at the station, or null with nothing under way. */
  piece: Piece | null = null;

  constructor(
    private readonly professions: Professions,
    private readonly inventory: Inventory,
  ) {}

  /** Work under way, or a made thing waiting for room in the bag. */
  get busy(): boolean {
    return this.piece !== null;
  }

  /** Every mark worked. */
  get shaped(): boolean {
    const p = this.piece;
    return !!p && p.form !== 'bar' && p.marks.every((m) => m.value >= 1 - 1e-6);
  }

  /** Hot enough to work: always, for work hammered cold. */
  get workable(): boolean {
    const p = this.piece;
    return !!p && (p.form !== 'gauntlets' || p.heat >= CONFIG.professions.anvil.workingHeat);
  }

  /** How far the work is along, in marks worked (halves count). */
  get worked(): number {
    return this.piece?.marks.reduce((n, m) => n + m.value, 0) ?? 0;
  }

  /**
   * The board: start `id` through the professions module, which takes its
   * materials out of the bag, and set them on the station: two ore in the
   * crucible, a stone on the anvil, four bars in the fire. Refused, it takes nothing.
   */
  choose(id: RecipeId): ProfessionsEffects | Refused {
    const recipe = recipeOf(id);
    const form = FORMS[id];
    if (!recipe || !form) return { refused: "That isn't made at the anvil." };
    if (this.piece) return { refused: this.piece.waiting ? 'Make room in your bag for what you made first.' : 'Finish what you started first.' };
    const effects = this.professions.start(id);
    const no = effects.find((e) => e.kind === 'refused');
    if (no?.kind === 'refused') return { refused: refusedWords(no.reason, recipe, this.inventory) };
    const home = form === 'bar' ? 'crucible' : form === 'whetstone' ? 'anvil' : 'fire';
    this.piece = {
      recipe,
      form,
      place: home,
      home,
      heat: 0,
      smelting: form === 'bar' ? CONFIG.professions.anvil.smelt : 0,
      marks: form === 'bar' ? [] : MARKS[form].map(([x, z]) => ({ x, z, value: 0 })),
      quenched: false,
      waiting: false,
    };
    return effects;
  }

  /** Time passes: the ore smelts into a bar (made), and the blank heats in the fire and cools out of it. */
  update(dt: number): WorkEffects {
    const p = this.piece;
    if (!p) return nothing;
    const A = CONFIG.professions.anvil;
    if (p.form === 'gauntlets' && !p.quenched) {
      p.heat = p.place === 'fire' ? Math.min(1, p.heat + dt / A.heatUp) : Math.max(0, p.heat - dt / A.coolDown);
    }
    if (p.form !== 'bar' || p.smelting <= 0) return nothing;
    p.smelting = Math.max(0, p.smelting - dt);
    if (p.smelting > 0) return nothing;
    // Two ore become a bar, hot, on the mould beside the crucible.
    p.place = p.home = 'mould';
    p.heat = 1;
    return this.finish();
  }

  /**
   * A strike on the anvil, `speed` m/s downward after coming down `travel` m,
   * landing (x, z) m from the anvil's middle. A tap only clinks; a good
   * strike works the nearest unworked mark within reach halfway, a great one
   * all the way. The last mark worked makes the whetstone; the gauntlets are
   * then shaped, to quench.
   */
  strike(speed: number, travel: number, x: number, z: number): { grade: Grade; struck: Struck } & WorkEffects {
    const grade = gradeOf(speed, travel);
    const p = this.piece;
    if (!p || p.place !== 'anvil' || p.form === 'bar' || grade === 'tap' || this.shaped || p.waiting) return { grade, struck: 'idle', ...nothing };
    if (!this.workable) return { grade, struck: 'cold', ...nothing };
    let mark: Mark | null = null;
    let best: number = CONFIG.professions.anvil.markReach;
    for (const m of p.marks) {
      const d = Math.hypot(x - m.x, z - m.z);
      if (m.value < 1 && d <= best) {
        mark = m;
        best = d;
      }
    }
    if (!mark) return { grade, struck: 'miss', ...nothing };
    mark.value = Math.min(1, mark.value + (grade === 'great' ? 1 : 0.5));
    const done = this.shaped && p.form === 'whetstone' ? this.finish() : nothing;
    return { grade, struck: 'worked', ...done };
  }

  /** Take the piece in the tongs, if it's somewhere they can: not while it smelts. */
  grab(): boolean {
    const p = this.piece;
    if (!p || p.place === 'held' || p.place === 'crucible') return false;
    p.place = 'held';
    return true;
  }

  /**
   * Let go of the piece in the tongs over `where`. Where it can't go, it goes
   * back where it lay; the words say why. A thing made and waiting goes to
   * the bag if there's room now.
   */
  letGo(where: Drop): WorkEffects & { refused: string | null } {
    const p = this.piece;
    if (!p || p.place !== 'held') return { ...nothing, refused: null };
    if (p.waiting) {
      const bagged = this.retry();
      if (bagged.bagged) return { ...bagged, refused: null };
    }
    const refused = this.canPut(p, where);
    p.place = refused || where === 'away' ? p.home : where;
    if (!refused && where !== 'away') p.home = where as Piece['home'];
    return { ...nothing, refused: where === 'away' && !p.waiting && this.shaped && !p.quenched ? 'Quench it first, in the bucket by the anvil.' : refused };
  }

  /** You walked off: what's in the tongs goes back where it lay. The work waits, cooling. */
  walkOff(): void {
    const p = this.piece;
    if (p?.place === 'held') p.place = p.home;
  }

  /** Dip what's in the tongs in the bucket: it cools, and shaped gauntlets are made. `hissed` if it was hot. */
  dunk(): WorkEffects & { hissed: boolean } {
    const p = this.piece;
    if (!p || p.place !== 'held') return { ...nothing, hissed: false };
    const hissed = p.heat > 0.05;
    p.heat = 0;
    if (p.form !== 'gauntlets' || !this.shaped || p.quenched) return { ...nothing, hissed };
    p.quenched = true;
    return { ...this.finish(), hissed };
  }

  /** A thing left waiting with the bag full: into the bag if there's room now. */
  retry(): WorkEffects {
    const p = this.piece;
    if (!p?.waiting) return nothing;
    const effects = this.inventory.take([{ id: p.recipe.makes, count: 1 }]);
    if (effects.some((e) => e.kind === 'left')) return nothing;
    this.piece = null;
    return { effects, made: null, bagged: p };
  }

  /** The make is done: through the professions module into the bag (or left here), paying proficiency. */
  private finish(): WorkEffects {
    const p = this.piece!;
    const effects = this.professions.finish('anvil');
    const made = effects.find((e) => e.kind === 'made');
    const left = made?.kind === 'made' && made.left;
    if (left) p.waiting = true;
    else this.piece = null;
    return { effects, made: { piece: p, left }, bagged: null };
  }

  /** Why `p` can't go `where`, or null if it can. */
  private canPut(p: Piece, where: Drop): string | null {
    switch (where) {
      case 'away':
        return null;
      case 'crucible':
        return 'Only ore goes in the crucible, from the board.';
      case 'mould':
        return 'The mould is for the crucible’s bars.';
      case 'fire':
        if (p.form !== 'gauntlets') return p.form === 'whetstone' ? "Stone isn't heated: lay it on the anvil." : 'It needs no more heat.';
        if (p.quenched || p.waiting) return "It's done.";
        return null;
      case 'anvil':
        if (p.form === 'bar') return 'The bar is done: it goes to your bag.';
        return null;
    }
  }
}

/** A refusal from the professions module, in words. */
function refusedWords(reason: string, recipe: Recipe, inventory: Pick<Inventory, 'count'>): string {
  switch (reason) {
    case 'materials': {
      const short = Object.entries(recipe.takes).find(([id, n]) => inventory.count(id) < n);
      return short ? `It takes ${short[1]} ${itemOf(short[0])?.name ?? short[0]}; you have ${inventory.count(short[0])}.` : 'Not enough in your bag.';
    }
    case 'proficiency':
      return `It needs Smithing ${recipe.needs}.`;
    case 'unlearned':
      return 'Learn Smithing from the smith first.';
    case 'busy':
      return 'Finish what you started first.';
    default:
      return "You don't know how to make that.";
  }
}

