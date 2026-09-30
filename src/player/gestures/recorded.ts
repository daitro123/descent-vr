import type { Shape } from '../../classes';
import type { Stroke } from './matcher';

// Strokes recorded on the headset, each an extra template for its shape
// (.scratch/abilities/spec.md, "Gestures": the prototype's templates until Tom
// records his own). To add some: `?arena&gestures`, click the right stick to
// RECORD, and draw each shape as the panel asks; every stroke is logged to the
// console as `[gestures] recorded <id> {…}` and kept in the browser under
// `descent-PROTOTYPE-gesture-recordings`. Paste them in here under this game's
// ids (the prototype's `zed`, `vee` and `ess` are `z`, `v` and `s`).
// None yet: every template is the clean one.

export const RECORDED: Readonly<Partial<Record<Shape, readonly Stroke[]>>> = {};
