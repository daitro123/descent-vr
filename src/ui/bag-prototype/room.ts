import {
  CanvasTexture,
  CircleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NearestFilter,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { closestSegmentSegment } from '../../combat/geometry';
import { sfx } from '../../fx/sfx';
import { ModelBuilder } from '../../models/kit';
import { createModelMaterial, sharedModelMaterial } from '../../models/materials';
import type { Player } from '../../player/player';
import type { Ground } from '../../world/ground';
import { type Item, RARITY_COLOUR } from './items';
import { modelOf } from './looks';

// PROTOTYPE (The bag and the gear panel): a small, flat, quiet yard with a
// training dummy to swing at, so reaching over the shoulder can be tried
// against real swings; and the items you drop, lying on the ground. Throwaway.

/** The yard is a circle this wide (m) round the middle. */
const RADIUS = 4;
/** The dummy stands this far ahead of where you start (−Z). */
export const DUMMY = { x: 0, z: -1.7, radius: 0.2, low: 0.7, high: 1.75 };

const _p = new Vector3();

/** Flat ground you can't walk off, with the dummy's post in the way. */
export class Yard implements Ground {
  readonly root = new Group();

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const c = canvas.getContext('2d')!;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const k = 0.85 + ((x * 7 + y * 13) % 5) * 0.04 + ((x + y) % 2) * 0.05;
        c.fillStyle = new Color(0x5a4a38).multiplyScalar(k).getStyle();
        c.fillRect(x * 8, y * 8, 8, 8);
      }
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.magFilter = NearestFilter;
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.set(RADIUS * 2, RADIUS * 2);
    const floor = new Mesh(new PlaneGeometry(RADIUS * 4, RADIUS * 4), new MeshLambertMaterial({ map: texture }));
    floor.rotation.x = -Math.PI / 2;
    this.root.add(floor);
    const fence = new ModelBuilder(5);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      fence.box(0.1, 0.9, 0.1, { at: [Math.sin(a) * (RADIUS + 0.3), 0.45, Math.cos(a) * (RADIUS + 0.3)], color: 0x6a4a2a });
    }
    this.root.add(new Mesh(fence.build(), sharedModelMaterial()));
    this.root.add(new HemisphereLight(0xb8c0d8, 0x3a2c1c, 1.4));
    const sun = new DirectionalLight(0xfff0d8, 1.4);
    sun.position.set(2, 5, 3);
    this.root.add(sun);
  }

  heightAt(): number {
    return 0;
  }

  resolve(p: Vector3, radius: number): boolean {
    let moved = false;
    const r = Math.hypot(p.x, p.z);
    if (r > RADIUS - radius) {
      const k = (RADIUS - radius) / r;
      p.x *= k;
      p.z *= k;
      moved = true;
    }
    const dx = p.x - DUMMY.x;
    const dz = p.z - DUMMY.z;
    const d = Math.hypot(dx, dz);
    const min = DUMMY.radius + radius;
    if (d < min && d > 1e-6) {
      p.x = DUMMY.x + (dx / d) * min;
      p.z = DUMMY.z + (dz / d) * min;
      moved = true;
    }
    return moved;
  }

  lineOfSight(): boolean {
    return true;
  }

  steer(): void {}

  arrowStops(p: Vector3): boolean {
    return p.y <= 0;
  }
}

/** A straw man on a post that rocks when a swing lands, so there's something to hit. */
export class Dummy {
  readonly root = new Group();
  hits = 0;
  private readonly body = new Group();
  private readonly material = createModelMaterial();
  private lean = 0;
  private leanVel = 0;
  private flash = 0;
  private lastSwing = -1;
  private readonly hit = { distance: 0, pointA: new Vector3(), pointB: new Vector3() };
  private readonly axisLow = new Vector3(DUMMY.x, DUMMY.low, DUMMY.z);
  private readonly axisHigh = new Vector3(DUMMY.x, DUMMY.high, DUMMY.z);
  private readonly base = new Vector3();
  private readonly tip = new Vector3();

  constructor() {
    const m = new ModelBuilder(9);
    m.cyl(0.05, 0.06, 0.8, 6, { at: [0, 0.4, 0], color: 0x5a3a20 });
    m.cyl(0.19, 0.2, 0.75, 8, { at: [0, 1.15, 0], color: 0xc8a860 });
    m.box(0.9, 0.08, 0.08, { at: [0, 1.35, 0], color: 0x6a4a2a });
    m.ball(0.14, { at: [0, 1.65, 0], color: 0xd8b870 }, 1);
    m.box(0.3, 0.06, 0.24, { at: [0, 1.0, 0], color: 0x7a2a1a });
    this.body.add(new Mesh(m.build(), this.material));
    this.root.add(this.body);
    this.root.position.set(DUMMY.x, 0, DUMMY.z);
  }

  /** Rock and flash when your sword lands a real swing (one hit a swing). */
  update(dt: number, player: Player): void {
    const { sword } = player;
    if (sword.hot && sword.swing.count !== this.lastSwing) {
      sword.segment(player.rig, this.base, this.tip);
      if (closestSegmentSegment(this.base, this.tip, this.axisLow, this.axisHigh, this.hit).distance < DUMMY.radius) {
        this.lastSwing = sword.swing.count;
        this.hits++;
        this.leanVel += Math.min(4, sword.tipSpeed * 0.5);
        this.flash = 0.15;
        sfx.hit(false, this.hit.pointB);
        player.input.pulse('right', 0.7, 40);
      }
    }
    // A stiff spring back upright.
    this.leanVel += (-this.lean * 120 - this.leanVel * 8) * dt;
    this.lean += this.leanVel * dt;
    this.body.rotation.x = -this.lean * 0.3;
    this.flash = Math.max(0, this.flash - dt);
    this.material.emissive.setRGB(1, 0.8, 0.5).multiplyScalar(this.flash * 3);
  }
}

interface Dropped {
  readonly item: Item;
  readonly group: Group;
  readonly velocity: Vector3;
  age: number;
  landed: boolean;
}

/** How near a hand must come to take a dropped item back (m). */
const TAKE = 0.25;

/** Items let go of off the panel: they fall, lie glowing in their rarity's colour, and a touch takes them back. */
export class Drops {
  readonly root = new Group();
  readonly items: Dropped[] = [];

  drop(item: Item, at: Vector3, velocity?: Vector3): void {
    const group = new Group();
    const model = new Mesh(modelOf(item), sharedModelMaterial());
    model.scale.setScalar(0.22);
    model.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI * 2);
    group.add(model);
    const glow = new Mesh(
      new CircleGeometry(0.16, 16),
      new MeshBasicMaterial({ color: RARITY_COLOUR[item.rarity], transparent: true, opacity: 0.45, depthWrite: false }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.03;
    group.add(glow);
    group.position.copy(at);
    this.root.add(group);
    this.items.push({ item, group, velocity: (velocity?.clone() ?? new Vector3()).clampLength(0, 3), age: 0, landed: false });
  }

  /** Fall and settle; a hand touching one that has landed takes it, if `room` (returns it, for the bag). */
  update(dt: number, hands: readonly (Vector3 | null)[], room: boolean): Item | null {
    let taken: Item | null = null;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const d = this.items[i];
      d.age += dt;
      if (!d.landed) {
        d.velocity.y -= 9.8 * dt;
        d.group.position.addScaledVector(d.velocity, dt);
        if (d.group.position.y <= 0.04) {
          d.group.position.y = 0.04;
          d.landed = true;
        }
        continue;
      }
      if (taken || !room || d.age < 0.6) continue;
      if (hands.some((h) => h && h.distanceTo(_p.copy(d.group.position)) < TAKE)) {
        taken = d.item;
        this.root.remove(d.group);
        this.items.splice(i, 1);
      }
    }
    return taken;
  }
}
