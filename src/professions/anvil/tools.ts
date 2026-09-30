import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial, Vector3 } from 'three';

// The smith's hammer and tongs, held in grip space as the weapons are
// (models/gear.ts): the handle runs along the grip's −Z. Stepping up to the
// anvil puts them in your hands in place of the sword and shield. Promoted
// from ?proto=anvil (prototypes/anvil/rig.ts).

/** Where the hammer's face is in the right grip (it looks down, the grip's −Y), and where the tongs' jaws are in the left. */
export const HAMMER_FACE = new Vector3(0, -0.045, -0.3);
export const TONGS_JAW = new Vector3(0, 0, -0.34);

const IRON = 0x3a3c40;
const WOOD = 0x6a4a2a;

/** The smith's hammer: a handle along the grip's −Z and a head whose face looks down (−Y). */
export function buildHammer(): Group {
  const g = new Group();
  g.name = 'smiths-hammer';
  const wood = new MeshLambertMaterial({ color: WOOD });
  const iron = new MeshLambertMaterial({ color: IRON });
  const handle = new Mesh(new CylinderGeometry(0.014, 0.017, 0.34, 6), wood);
  handle.rotation.x = Math.PI / 2;
  handle.position.z = -0.14;
  const head = new Mesh(new BoxGeometry(0.05, 0.1, 0.05), iron);
  head.position.set(0, -0.005, -0.3);
  const peen = new Mesh(new BoxGeometry(0.035, 0.04, 0.035), iron);
  peen.position.set(0, 0.06, -0.3);
  g.add(handle, head, peen);
  return g;
}

/** The smith's tongs: two long arms from the fist to the jaws, which close as you squeeze. */
export class Tongs {
  readonly model = new Group();
  private readonly arms: Mesh[] = [];

  constructor() {
    this.model.name = 'smiths-tongs';
    const iron = new MeshLambertMaterial({ color: IRON });
    for (const side of [-1, 1]) {
      const arm = new Mesh(new BoxGeometry(0.012, 0.012, 0.36), iron);
      arm.position.set(side * 0.02, 0, -0.17);
      const jaw = new Mesh(new BoxGeometry(0.03, 0.014, 0.05), iron);
      jaw.position.set(0, 0, -0.18);
      arm.add(jaw);
      this.arms.push(arm);
      this.model.add(arm);
    }
  }

  /** 0 open to 1 shut. */
  set grip(t: number) {
    this.arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1;
      arm.position.x = side * (0.028 - 0.02 * t);
      arm.rotation.y = side * -0.08 * (1 - t);
    });
  }
}
