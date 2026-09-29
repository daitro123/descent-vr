import { CHAIN } from '../quests';
import type { SaveRecord } from '../save/record';

/**
 * `?newgame`, before VR: a plain dialog on the page asking whether to delete
 * the saved character and start a new one. Resolves true for yes; "Carry on"
 * or Escape is no.
 */
export function askNewGame(saved: SaveRecord): Promise<boolean> {
  const on = CHAIN.find((q) => saved.quests[q.id]?.stage === 'active' || saved.quests[q.id]?.stage === 'ready');
  const dialog = document.createElement('dialog');
  dialog.id = 'new-game';
  dialog.innerHTML = `
    <h2>Start a new character?</h2>
    <p>Your level ${saved.level} character${on ? `, on ${on.title},` : ''} will be deleted, and you'll start again at level 1 facing Marshal Hale.</p>
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
