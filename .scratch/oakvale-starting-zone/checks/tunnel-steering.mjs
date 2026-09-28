// Does the camp prototype's stride-ahead steering get an enemy round a mine's
// bends? Walkable space is a union of capsules (tunnels round a centre line)
// and discs (chambers). The steer copies zoneGround.ts at 1135338.
//
// Written for The mine inside (issues/09-the-mine-inside.md). Run it with
// `node .scratch/oakvale-starting-zone/checks/tunnel-steering.mjs`. Each case
// chases a target round a bend, once with the steer alone and once following
// the tunnel's centre line whenever the target is out of sight.

const R = 0.4; // enemy body radius
const SPEED = 2.2;
const DT = 1 / 30;

function nearestOnSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return [ax + dx * t, az + dz * t, t];
}

function makeMine(line, w, rooms = []) {
  const segs = [];
  for (let i = 0; i + 1 < line.length; i++) segs.push([...line[i], ...line[i + 1]]);
  // Returns [penetration depth past the edge (<=0 inside), push x, push z]
  function worst(px, pz, r) {
    let best = null;
    for (const [ax, az, bx, bz] of segs) {
      const [nx, nz] = nearestOnSeg(px, pz, ax, az, bx, bz);
      const d = Math.hypot(px - nx, pz - nz);
      const over = d - (w - r);
      if (!best || over < best.over) best = { over, cx: nx, cz: nz, lim: w - r, d };
    }
    for (const [cx, cz, rr] of rooms) {
      const d = Math.hypot(px - cx, pz - cz);
      const over = d - (rr - r);
      if (!best || over < best.over) best = { over, cx, cz, lim: rr - r, d };
    }
    return best;
  }
  return {
    blocked: (x, z, r) => worst(x, z, r).over > 0,
    resolve(p, r) {
      const b = worst(p.x, p.z, r);
      if (b.over <= 0) return false;
      const k = b.lim / b.d;
      p.x = b.cx + (p.x - b.cx) * k;
      p.z = b.cz + (p.z - b.cz) * k;
      return true;
    },
    // Centre-line follow: aim at a point a little further along the line towards the target.
    along(p, target) {
      const proj = (x, z) => {
        let best = null, acc = 0;
        for (const [ax, az, bx, bz] of segs) {
          const L = Math.hypot(bx - ax, bz - az);
          const [nx, nz, t] = nearestOnSeg(x, z, ax, az, bx, bz);
          const d = Math.hypot(x - nx, z - nz);
          if (!best || d < best.d) best = { d, s: acc + t * L };
          acc += L;
        }
        return best.s;
      };
      const at = (s) => {
        let acc = 0;
        for (const [ax, az, bx, bz] of segs) {
          const L = Math.hypot(bx - ax, bz - az);
          if (s <= acc + L) { const t = (s - acc) / L; return [ax + (bx - ax) * t, az + (bz - az) * t]; }
          acc += L;
        }
        const l = segs[segs.length - 1];
        return [l[2], l[3]];
      };
      const s0 = proj(p.x, p.z), s1 = proj(target.x, target.z);
      const s = s1 > s0 ? Math.min(s1, s0 + 2) : Math.max(s1, s0 - 2);
      return at(s);
    },
  };
}

function steer(mine, from, dir, radius) {
  const look = 1 + radius;
  const ax = from.x + dir.x * look, az = from.z + dir.z * look;
  const probe = { x: ax, z: az };
  if (!mine.resolve(probe, radius)) return;
  const pushX = probe.x - ax, pushZ = probe.z - az;
  const first = dir.z * pushX - dir.x * pushZ >= 0 ? 1 : -1;
  const x0 = dir.x, z0 = dir.z;
  for (const a of [0.4, 0.8, 1.2, 1.6, 2.0]) {
    for (const side of [first, -first]) {
      const c = Math.cos(a * side), s = Math.sin(a * side);
      const x = x0 * c + z0 * s, z = -x0 * s + z0 * c;
      if (!mine.blocked(from.x + x * look, from.z + z * look, radius)) { dir.x = x; dir.z = z; return; }
    }
  }
}

// Line of sight: sample the segment and check every sample is walkable.
function sees(mine, a, b) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (mine.blocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0.05)) return false;
  }
  return true;
}

function chase(mine, start, target, mode) {
  const p = { ...start };
  for (let step = 0; step < 30 / DT; step++) {
    let goal = target;
    if (mode === 'centre line' && !sees(mine, p, target)) {
      const [gx, gz] = mine.along(p, target);
      goal = { x: gx, z: gz };
    }
    let dx = goal.x - p.x, dz = goal.z - p.z;
    const d = Math.hypot(dx, dz);
    if (Math.hypot(target.x - p.x, target.z - p.z) < 1.5) return (step * DT).toFixed(1) + ' s';
    const dir = { x: dx / d, z: dz / d };
    steer(mine, p, dir, R);
    p.x += dir.x * SPEED * DT;
    p.z += dir.z * SPEED * DT;
    mine.resolve(p, R);
  }
  return `STUCK at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`;
}

const W = 1.75; // tunnel half-width (3.5 m wide)
const cases = [
  {
    name: 'right-angle bend',
    mine: makeMine([[0, 0], [0, -15], [15, -15]], W),
    start: { x: 0, z: -2 }, target: { x: 12, z: -15 },
  },
  {
    name: 'gentle bend (two 45s)',
    mine: makeMine([[0, 0], [0, -10], [5, -15], [15, -15]], W),
    start: { x: 0, z: -2 }, target: { x: 12, z: -15 },
  },
  {
    name: 'hairpin (U-turn, 2.5 m rock between)',
    mine: makeMine([[0, 0], [0, -15], [6, -15], [6, 0]], W),
    start: { x: 0, z: -2 }, target: { x: 6, z: -2 },
  },
  {
    name: 'chamber, exit off to the side',
    mine: makeMine([[0, 0], [0, -8], [8, -8], [8, 6]], W, [[0, 0, 6]]),
    start: { x: -3, z: 3 }, target: { x: 8, z: 4 },
  },
  {
    name: 'switchback (two U-turns, 6 m apart)',
    mine: makeMine([[0, 0], [12, 0], [12, -6], [0, -6], [0, -12], [12, -12]], W),
    start: { x: 1, z: 0 }, target: { x: 11, z: -12 },
  },
];

for (const c of cases) {
  console.log(c.name.padEnd(40), 'steer only:', chase(c.mine, c.start, c.target, 'steer').padEnd(22), 'centre line when unseen:', chase(c.mine, c.start, c.target, 'centre line'));
}
