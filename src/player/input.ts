import type { Group, WebGLRenderer } from 'three';

export type Handedness = 'left' | 'right';

// xr-standard gamepad mapping indices.
const BTN_TRIGGER = 0;
const BTN_SQUEEZE = 1;
const BTN_PRIMARY = 4; // A / X
const BTN_SECONDARY = 5; // B / Y
const AXIS_STICK_X = 2;
const AXIS_STICK_Y = 3;

export interface HandState {
  grip: Group;
  source: XRInputSource | null;
  stickX: number;
  stickY: number;
  trigger: number;
  squeeze: number;
  primary: boolean;
  primaryPressed: boolean; // edge: went down this frame
  secondary: boolean;
  secondaryPressed: boolean;
}

/**
 * Maps WebXR input sources to left/right by handedness (index order is not
 * guaranteed) and exposes per-frame button/stick state with edge detection.
 */
export class XRInput {
  readonly hands: Record<Handedness, HandState>;
  private readonly grips: Group[] = [];
  private readonly sourceByIndex: (XRInputSource | null)[] = [null, null];

  constructor(renderer: WebGLRenderer, parent: Group) {
    const make = (grip: Group): HandState => ({
      grip,
      source: null,
      stickX: 0,
      stickY: 0,
      trigger: 0,
      squeeze: 0,
      primary: false,
      primaryPressed: false,
      secondary: false,
      secondaryPressed: false,
    });

    for (let i = 0; i < 2; i++) {
      const grip = renderer.xr.getControllerGrip(i);
      parent.add(grip);
      this.grips.push(grip);
      grip.addEventListener('connected', (e) => {
        this.sourceByIndex[i] = (e as unknown as { data: XRInputSource }).data;
        this.remap();
      });
      grip.addEventListener('disconnected', () => {
        this.sourceByIndex[i] = null;
        this.remap();
      });
    }

    // Placeholder until the first `connected` event tells us handedness.
    this.hands = { left: make(this.grips[0]), right: make(this.grips[1]) };
  }

  private remap(): void {
    for (let i = 0; i < 2; i++) {
      const source = this.sourceByIndex[i];
      if (!source || (source.handedness !== 'left' && source.handedness !== 'right')) continue;
      const hand = this.hands[source.handedness];
      hand.source = source;
      if (hand.grip !== this.grips[i]) {
        // Swap grips so each hand's weapon follows the right controller.
        const other = this.hands[source.handedness === 'left' ? 'right' : 'left'];
        other.grip = hand.grip;
        hand.grip = this.grips[i];
        this.onRemap?.();
      }
    }
  }

  /** Called when hands swap grip objects so weapons can re-parent. */
  onRemap?: () => void;

  update(): void {
    for (const hand of Object.values(this.hands)) {
      const gp = hand.source?.gamepad;
      const wasPrimary = hand.primary;
      const wasSecondary = hand.secondary;
      if (!gp) {
        hand.stickX = hand.stickY = hand.trigger = hand.squeeze = 0;
        hand.primary = hand.secondary = false;
      } else {
        hand.stickX = gp.axes[AXIS_STICK_X] ?? 0;
        hand.stickY = gp.axes[AXIS_STICK_Y] ?? 0;
        hand.trigger = gp.buttons[BTN_TRIGGER]?.value ?? 0;
        hand.squeeze = gp.buttons[BTN_SQUEEZE]?.value ?? 0;
        hand.primary = gp.buttons[BTN_PRIMARY]?.pressed ?? false;
        hand.secondary = gp.buttons[BTN_SECONDARY]?.pressed ?? false;
      }
      hand.primaryPressed = hand.primary && !wasPrimary;
      hand.secondaryPressed = hand.secondary && !wasSecondary;
    }
  }

  pulse(hand: Handedness, intensity: number, ms: number): void {
    // `hapticActuators` is what the Quest browser implements for XR gamepads;
    // it is not in lib.dom, hence the cast.
    const gp = this.hands[hand].source?.gamepad as
      | { hapticActuators?: { pulse?: (i: number, ms: number) => Promise<boolean> }[] }
      | undefined;
    gp?.hapticActuators?.[0]?.pulse?.(intensity, ms)?.catch(() => {});
  }
}
