import { CLASS_CARD, type ClassId, PLAYABLE } from '../classes';
import { CONFIG } from '../config';
import { isName, type SaveRecord } from '../save/record';
import type { Characters, Slot } from '../save/store';

// Your characters on the page before VR (.scratch/abilities/issues/03-…,
// "Characters and choosing a class"): three slots, each with the character's
// name, class, level and zone, the picked one marked. Pressing another slot
// picks it, an empty one opens the new-character form, and each character has
// Rename and Delete (which asks first, naming them). On a first visit the form
// is open under the new character (ticket 23's call). Plain HTML over the page,
// so the browser's own keyboard types names on the headset and the desktop.

/** What the roster needs from the page. */
export interface RosterHooks {
  /** The zone a record stands in, as the page names it. */
  zoneOf(record: SaveRecord): string;
  /** The picked character changed (picked, made or deleted): play it, by loading the page again. */
  replay(): void;
}

/**
 * Show `characters` in `host`, and keep it up to date as they change. The
 * character being played (`characters.play()`) is the picked slot; with none
 * saved yet it's the new one Enter VR will make.
 */
export function showRoster(host: HTMLElement, characters: Characters, hooks: RosterHooks): void {
  const root = document.createElement('div');
  root.id = 'characters';
  host.append(root);
  const draw = () => root.replaceChildren(...rows(characters, hooks, draw));
  draw();
}

function rows(characters: Characters, hooks: RosterHooks, redraw: () => void): HTMLElement[] {
  const played = characters.play();
  const out: HTMLElement[] = [heading('Your characters')];
  const slots: (Slot | 'new' | null)[] = [...characters.slots];
  // A new character, played until its first write saves it: in the next slot, marked as not saved yet.
  if (!played.record && !characters.full) slots.push('new');
  while (slots.length < CONFIG.save.characters) slots.push(null);

  for (const slot of slots) {
    const row = document.createElement('div');
    row.className = 'slot';
    out.push(row);
    if (slot === null) {
      row.append(button('New character', 'make', async () => {
        if (await askNewCharacter(characters)) hooks.replay();
      }));
      continue;
    }
    if (slot === 'new') {
      row.dataset.picked = '';
      row.dataset.key = played.key;
      const pending = card(played.who.name, `Level 1 ${CLASS_CARD[played.who.class].name.toLowerCase()}, new: saved once you play`);
      row.append(pending);
      out.push(firstCharacter(characters, played.who, pending, hooks));
      continue;
    }
    row.dataset.key = slot.key;
    if (slot.kind !== 'saved') {
      row.dataset.kind = slot.kind;
      row.append(
        card(slot.kind === 'newer' ? 'From a newer version' : "Can't be read", 'Left alone: this page never plays or writes over it.'),
        button('Delete', 'delete', async () => {
          if (!(await confirmDelete(null))) return;
          await characters.remove(slot.key);
          redraw();
        }),
      );
      continue;
    }
    const { record } = slot;
    const picked = slot.key === played.key;
    if (picked) row.dataset.picked = '';
    const pick = card(record.name, `Level ${record.level} ${CLASS_CARD[record.class].name.toLowerCase()}, ${hooks.zoneOf(record)}`);
    pick.classList.add('pick');
    if (!picked) {
      pick.addEventListener('click', async () => {
        await characters.pick(slot.key);
        hooks.replay();
      });
    }
    row.append(
      pick,
      button('Rename', 'rename', async () => {
        const name = await askName(record.name);
        if (name) await characters.rename(slot.key, name);
        redraw();
      }),
      button('Delete', 'delete', async () => {
        if (!(await confirmDelete(record))) return;
        await characters.remove(slot.key);
        if (picked) hooks.replay();
        else redraw();
      }),
    );
  }
  return out;
}

const heading = (text: string) => Object.assign(document.createElement('h2'), { textContent: text });

function button(label: string, act: string, onPress: () => void): HTMLButtonElement {
  const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label, className: act });
  b.addEventListener('click', onPress);
  return b;
}

/** A slot's main button: the name, and a line under it. */
function card(name: string, line: string): HTMLButtonElement {
  const b = Object.assign(document.createElement('button'), { type: 'button', className: 'card' });
  b.append(Object.assign(document.createElement('b'), { textContent: name }), Object.assign(document.createElement('span'), { textContent: line }));
  return b;
}

/**
 * The new-character form: a card for each class that's built, and a name
 * with a suggestion filled in. Makes the character on "Make" and picks it;
 * resolves true if one was made. With every slot taken it says so instead,
 * pointing at Delete. `?newgame` opens it too.
 */
export async function askNewCharacter(characters: Characters): Promise<boolean> {
  if (characters.full) {
    await dialog(
      'new-character',
      `<h2>Three characters already</h2>
      <p>You have ${CONFIG.save.characters} characters, as many as you can keep. Delete one on this page to make another.</p>
      <form method="dialog"><button value="ok" autofocus>OK</button></form>`,
    );
    return false;
  }
  const suggested = characters.suggestName();
  const shown = await dialog(
    'new-character',
    `<h2>A new character</h2>
    <form method="dialog">
      <fieldset class="classes"><legend>Class</legend>${classCards(PLAYABLE[0])}</fieldset>
      <label class="name">Name <input name="name" value="${suggested}" maxlength="${CONFIG.save.name}" autocomplete="off" /></label>
      <div class="buttons"><button value="make">Make</button><button value="cancel" formnovalidate>Cancel</button></div>
    </form>`,
  );
  if (shown.answer !== 'make') return false;
  const klass = chosen(shown.form);
  const name = String(shown.form.get('name') ?? '').trim();
  return (await characters.make(klass, isName(name) ? name : suggested)) !== null;
}

/**
 * The first visit's new-character form, open on the page under the new
 * character rather than in a dialog: the class cards and the name, filled in
 * with the suggested warrior. "Make" makes the one chosen and plays it; a
 * name typed here is the new character's even without it; and Enter VR
 * without "Make" plays the suggested warrior, as a first visit always did.
 */
function firstCharacter(characters: Characters, who: { class: ClassId; name: string }, pending: HTMLButtonElement, hooks: RosterHooks): HTMLElement {
  const form = document.createElement('form');
  form.id = 'first-character';
  form.innerHTML = `<fieldset class="classes"><legend>Choose a class</legend>${classCards(who.class)}</fieldset>
    <label class="name">Name <input name="name" value="${escape(who.name)}" maxlength="${CONFIG.save.name}" autocomplete="off" /></label>
    <div class="buttons"><button value="make">Make</button></div>`;
  const input = form.querySelector<HTMLInputElement>('input[name=name]')!;
  const line = pending.querySelector('span')!;
  const show = () => {
    const klass = chosen(new FormData(form));
    pending.querySelector('b')!.textContent = who.name;
    line.textContent = klass === who.class
      ? `Level 1 ${CLASS_CARD[klass].name.toLowerCase()}, new: saved once you play`
      : `Level 1 ${CLASS_CARD[klass].name.toLowerCase()}, new: press Make to play`;
  };
  form.addEventListener('change', async (e) => {
    const name = input.value.trim();
    if (e.target === input && isName(name)) await characters.rename(characters.play().key, name);
    show();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if ((await characters.make(chosen(new FormData(form)), isName(name) ? name : who.name)) !== null) hooks.replay();
  });
  return form;
}

/** A card for each class that's built, `picked` checked. */
const classCards = (picked: ClassId) =>
  PLAYABLE.map(
    (c) => `<label class="class-card"><input type="radio" name="class" value="${c}"${c === picked ? ' checked' : ''} />
      <b>${CLASS_CARD[c].name}</b><span>${CLASS_CARD[c].line}</span></label>`,
  ).join('');

/** The class a form's cards have checked. */
const chosen = (form: FormData): ClassId => PLAYABLE.find((c) => c === form.get('class')) ?? PLAYABLE[0];

/** Ask for a new name for a character called `name`: the name, or null to keep it. */
async function askName(name: string): Promise<string | null> {
  const shown = await dialog(
    'rename-character',
    `<h2>Rename ${escape(name)}</h2>
    <form method="dialog">
      <label class="name">Name <input name="name" value="${escape(name)}" maxlength="${CONFIG.save.name}" autocomplete="off" /></label>
      <div class="buttons"><button value="rename">Rename</button><button value="cancel" formnovalidate>Cancel</button></div>
    </form>`,
  );
  const next = String(shown.form.get('name') ?? '').trim();
  return shown.answer === 'rename' && isName(next) && next !== name ? next : null;
}

/** Ask before deleting `record`'s character (null for one this page can't read). True for yes. */
async function confirmDelete(record: SaveRecord | null): Promise<boolean> {
  const who = record ? `${escape(record.name)}, the level ${record.level} ${CLASS_CARD[record.class].name.toLowerCase()},` : "This character, which this page can't read,";
  const title = record ? `Delete ${escape(record.name)}?` : 'Delete this character?';
  const shown = await dialog(
    'delete-character',
    `<h2>${title}</h2>
    <p>${who} will be deleted for good.</p>
    <form method="dialog"><div class="buttons"><button value="yes">Delete</button><button value="no" autofocus>Keep</button></div></form>`,
  );
  return shown.answer === 'yes';
}

/** A modal dialog on the page: the button that closed it (empty for Escape), and its form's fields as they were. */
function dialog(id: string, html: string): Promise<{ answer: string; form: FormData }> {
  const d = document.createElement('dialog');
  d.id = id;
  d.className = 'page-dialog';
  d.innerHTML = html;
  document.body.append(d);
  d.showModal();
  return new Promise((resolve) =>
    d.addEventListener(
      'close',
      () => {
        const form = d.querySelector('form');
        const fields = form ? new FormData(form) : new FormData();
        d.remove();
        resolve({ answer: d.returnValue, form: fields });
      },
      { once: true },
    ),
  );
}

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
