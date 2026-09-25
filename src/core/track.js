// Stadium-shaped right-handed (clockwise from above) turf course, modelled on 跑馬地.
// Coordinates: y up, grandstand on +z side. Home straight runs along z = +R toward -x.
//
// Path parameter p = metres along the inner rail, measured in racing direction from the
// east end of the home straight. Lane w = metres outward from the inner rail.
export const TRACK = {
  L: 500, // straight length
  R: 90, // inner-rail turn radius
  WIDTH: 26, // rail-to-rail
  FINISH: 460, // p of the winning post (40 m before the pull-up turn)
};
TRACK.TURN = Math.PI * TRACK.R;
TRACK.P = 2 * TRACK.L + 2 * TRACK.TURN;

const { L, R, TURN, P } = TRACK;

export const wrap = (p) => ((p % P) + P) % P;

// Start point for a race distance: the gate is `dist` metres of rail before the post.
export const startP = (dist) => wrap(TRACK.FINISH - dist);

export function segmentOf(p) {
  p = wrap(p);
  if (p < L) return 0; // home straight
  if (p < L + TURN) return 1; // west turn
  if (p < 2 * L + TURN) return 2; // back straight
  return 3; // east turn
}

// Returns rail point, unit tangent (racing direction) and unit outward normal.
export function railFrame(p) {
  p = wrap(p);
  const seg = segmentOf(p);
  if (seg === 0) {
    const s = p;
    return { x: L / 2 - s, z: R, tx: -1, tz: 0, nx: 0, nz: 1, turn: false };
  }
  if (seg === 1) {
    // centre (-L/2, 0); angle from +z (pi/2) sweeping through -x (pi) to -z (3pi/2)
    const a = Math.PI / 2 + (p - L) / R;
    const nx = Math.cos(a), nz = Math.sin(a);
    return { x: -L / 2 + R * nx, z: R * nz, tx: -nz, tz: nx, nx, nz, turn: true };
  }
  if (seg === 2) {
    const s = p - L - TURN;
    return { x: -L / 2 + s, z: -R, tx: 1, tz: 0, nx: 0, nz: -1, turn: false };
  }
  // east turn: centre (L/2, 0); angle from -pi/2 through 0 to +pi/2
  const a = -Math.PI / 2 + (p - 2 * L - TURN) / R;
  const nx = Math.cos(a), nz = Math.sin(a);
  return { x: L / 2 + R * nx, z: R * nz, tx: -nz, tz: nx, nx, nz, turn: true };
}

// World position for (p, lane). heading = yaw so that +z model forward faces the tangent.
export function trackPos(p, w, out = {}) {
  const f = railFrame(p);
  out.x = f.x + f.nx * w;
  out.z = f.z + f.nz * w;
  out.heading = Math.atan2(f.tx, f.tz);
  out.turn = f.turn;
  return out;
}

// Ground covered in lane w per metre of rail: wider on the turns.
export const laneFactor = (p, w) => (segmentOf(p) % 2 === 1 ? (R + w) / R : 1);
