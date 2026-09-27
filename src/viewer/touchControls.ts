// On-screen controls for the map viewer on phones and tablets: a stick
// (bottom left) to move, ▲ ▼ (bottom right) to go up and down, dragging
// anywhere else to look, and a row of buttons for the rest. They appear on
// the first touch, or straight away on a touch-first device.

export interface TouchActions {
  map(): void;
  walk(): void;
  fog(): void;
  spot(): void;
}

const STICK_RADIUS = 45; // px the knob can travel from the centre
const LOOK = 0.006; // rad per px dragged

export class TouchControls {
  /** Stick deflection, −1..1: x to the right, y towards you (like a gamepad stick). */
  moveX = 0;
  moveY = 0;
  /** +1 while ▲ is held, −1 while ▼ is held. */
  rise = 0;
  fast = false;
  active = false;
  /** The action buttons; the viewer puts them under its readout. */
  readonly buttons = document.createElement('div');
  private readonly pad = document.createElement('div');
  private readonly toggles: Record<'walk' | 'fog' | 'fast', HTMLButtonElement>;

  constructor(canvas: HTMLCanvasElement, actions: TouchActions, look: (yaw: number, pitch: number) => void) {
    this.buttons.className = 'touch-buttons';
    const button = (label: string, onPress: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', onPress);
      this.buttons.appendChild(b);
      return b;
    };
    button('Map ▸', actions.map);
    this.toggles = {
      walk: button('Walk', actions.walk),
      fog: button('Fog', actions.fog),
      fast: button('Fast', () => (this.fast = !this.fast)),
    };
    button('Spot ▸', actions.spot);

    this.pad.className = 'touch-pad';
    this.pad.append(this.buildStick(), this.buildRise());
    document.body.appendChild(this.pad);

    // Drag on the scene to look; each finger is tracked on its own.
    const drags = new Map<number, { x: number; y: number }>();
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      this.show();
      drags.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    canvas.addEventListener('pointermove', (e) => {
      const last = drags.get(e.pointerId);
      if (!last) return;
      look((e.clientX - last.x) * LOOK, (e.clientY - last.y) * LOOK);
      last.x = e.clientX;
      last.y = e.clientY;
    });
    const end = (e: PointerEvent) => drags.delete(e.pointerId);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    if (matchMedia('(pointer: coarse)').matches) this.show();
  }

  show(): void {
    if (this.active) return;
    this.active = true;
    document.body.classList.add('touch');
  }

  /** Light up the toggles that are on. */
  sync(walking: boolean, fog: boolean): void {
    const set = (b: HTMLButtonElement, on: boolean) => {
      if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
    };
    set(this.toggles.walk, walking);
    set(this.toggles.fog, fog);
    set(this.toggles.fast, this.fast);
  }

  private buildStick(): HTMLElement {
    const base = document.createElement('div');
    base.className = 'touch-stick';
    const knob = document.createElement('div');
    base.appendChild(knob);
    let finger: number | null = null;
    const move = (e: PointerEvent) => {
      const r = base.getBoundingClientRect();
      let x = e.clientX - (r.left + r.width / 2);
      let y = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(x, y);
      if (len > STICK_RADIUS) {
        x *= STICK_RADIUS / len;
        y *= STICK_RADIUS / len;
      }
      this.moveX = x / STICK_RADIUS;
      this.moveY = y / STICK_RADIUS;
      knob.style.transform = `translate(${x}px, ${y}px)`;
    };
    base.addEventListener('pointerdown', (e) => {
      finger = e.pointerId;
      base.setPointerCapture(e.pointerId);
      move(e);
    });
    base.addEventListener('pointermove', (e) => {
      if (e.pointerId === finger) move(e);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== finger) return;
      finger = null;
      this.moveX = this.moveY = 0;
      knob.style.transform = '';
    };
    base.addEventListener('pointerup', release);
    base.addEventListener('pointercancel', release);
    return base;
  }

  /** ▲ and ▼: held down to rise and sink. */
  private buildRise(): HTMLElement {
    const column = document.createElement('div');
    column.className = 'touch-rise';
    for (const [label, dir] of [
      ['▲', 1],
      ['▼', -1],
    ] as const) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.setAttribute('aria-label', dir > 0 ? 'Up' : 'Down');
      b.addEventListener('pointerdown', (e) => {
        b.setPointerCapture(e.pointerId);
        this.rise = dir;
      });
      const release = () => {
        if (this.rise === dir) this.rise = 0;
      };
      b.addEventListener('pointerup', release);
      b.addEventListener('pointercancel', release);
      column.appendChild(b);
    }
    return column;
  }
}
