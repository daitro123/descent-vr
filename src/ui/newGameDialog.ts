import { AdventureState } from '../adventureState';
import type { SaveRecord } from '../save/record';

/**
 * `?newgame`, before VR: a plain dialog on the page asking whether to delete
 * the saved character (`saved`, or null for one this page can't read) and
 * start a new one. Resolves true for yes; "Carry on" or Escape is no.
 */
export function askNewGame(saved: SaveRecord | null): Promise<boolean> {
  const who = saved ? `Your level ${saved.level} character${underWay(saved)}` : "Your saved character, which this page can't read,";
  const dialog = document.createElement('dialog');
  dialog.id = 'new-game';
  dialog.innerHTML = `
    <h2>Start a new character?</h2>
    <p>${who} will be deleted, and you'll start again at level 1 facing Marshal Hale.</p>
    <form method="dialog">
      <button value="yes">Start over</button>
      <button value="no" autofocus>Carry on</button>
    </form>`;
  document.body.append(dialog);
  dialog.showModal();
  return new Promise((resolve) =>
    dialog.addEventListener(
      'close',
      () => {
        dialog.remove();
        resolve(dialog.returnValue === 'yes');
      },
      { once: true },
    ),
  );
}

/** ", on <the quest you took last>," or nothing while you have none. */
function underWay(saved: SaveRecord): string {
  const quest = new AdventureState(saved).tracker.at(-1)?.title;
  return quest ? `, on ${quest},` : '';
}
