import { makeRng } from './rng.js';
import { startP, laneFactor } from './track.js';

export const HORSE_LEN = 2.4; // metres, one 馬位
const STALL_W = 1.35;
const LANE_STEP = 1.5;

// Par times (s) for a class-4 horse on good turf at 跑馬地.
const PAR = { 1000: 57.2, 1200: 69.9, 1650: 100.2, 1800: 110.3 };
const parTime = (d) => PAR[d] ?? d * 0.061;

// Pace shape by running style: speed multiplier at race fraction x.
const SHAPES = [
  [[0, 1.03], [0.5, 1.012], [0.75, 0.995], [1, 0.955]], // 領放
  [[0, 1.012], [0.5, 1.002], [0.75, 0.998], [1, 0.985]], // 跟前
  [[0, 0.992], [0.5, 0.996], [0.75, 1.002], [1, 1.012]], // 居中
  [[0, 0.975], [0.5, 0.987], [0.75, 1.008], [1, 1.035]], // 後上
];
function shapeAt(style, x) {
  const s = SHAPES[style];
  for (let i = 1; i < s.length; i++) {
    if (x <= s[i][0]) {
      const [x0, y0] = s[i - 1], [x1, y1] = s[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return s[s.length - 1][1];
}

// True ability: rating adjusted for weight, draw and trip suitability. The race card shows
// rating/weight/draw/form, but `hidden` (current well-being) is only hinted by recent form.
export function abilities(race) {
  const rng = makeRng(race.seed * 31 + race.raceNo * 131 + 7);
  return race.horses.map((h) => {
    const hidden = rng.normal() * 5;
    const tripNeed = (race.distance - 1000) / 800; // 0..1
    const tripFit = -Math.abs(h.stamina - (0.85 + 0.35 * tripNeed)) * 12;
    const drawBias = -(h.draw - 1) * 0.35; // inside draws help around 跑馬地's tight turns
    return h.rating + hidden - 0.8 * (h.weight - 113) + tripFit + drawBias;
  });
}

export const PERF_SD = 5.5;

export function createRaceSim(race, seed) {
  const rng = makeRng(seed);
  const D = race.distance;
  const ab = abilities(race);
  const mean = ab.reduce((a, b) => a + b, 0) / ab.length;
  const classAdj = { 第五班: 0.6, 第四班: 0, 第三班: -0.6, 第二班: -1.2 }[race.className] ?? 0;
  const T = parTime(D) + classAdj;
  const p0 = startP(D);

  const horses = race.horses.map((h, i) => {
    const perf = ab[i] + rng.normal() * PERF_SD;
    // Each ability point ≈ 0.08% of speed; standing start costs about 1.4 s vs flying pace.
    const V = (D / (T - 1.4)) * (1 + 0.0008 * (perf - mean));
    const slow = rng.next() < 0.06;
    return {
      no: h.no,
      idx: i,
      style: h.style,
      V,
      jump: Math.max(0, 0.08 + rng.normal() * 0.07) + (slow ? 0.35 + rng.next() * 0.3 : 0),
      slowJump: slow,
      wobA: rng.range(0.004, 0.009),
      wobF: rng.range(0.05, 0.12),
      wobP: rng.range(0, Math.PI * 2),
      dist: -0.5, // metres of rail covered (race distance); nose starts just behind line
      w: 1.2 + (h.draw - 1) * STALL_W,
      v: 0,
      latV: 0, // lateral speed, m/s (+ = outward)
      blocked: false,
      finished: false,
      finishTime: null,
      checkpoints: {},
      stride: rng.next(), // gallop phase offset for rendering
    };
  });

  const checkpoints = [1200, 800, 400].filter((c) => c < D);
  const sim = {
    race,
    D,
    t: 0,
    started: false,
    horses,
    finishOrder: [],
    done: false,
    p: (h) => p0 + h.dist,

    step(dt) {
      if (!sim.started) return;
      sim.t += dt;
      const active = horses;
      for (const h of active) stepHorse(h, dt);
      resolveLanes(dt);
      if (!sim.done && sim.finishOrder.length === horses.length) sim.done = true;
    },

    // Running order by distance covered (finished horses in finish order first).
    order() {
      const fin = sim.finishOrder.slice();
      const run = horses.filter((h) => !h.finished).sort((a, b) => b.dist - a.dist);
      return fin.concat(run);
    },

    results() {
      const win = sim.finishOrder[0];
      return sim.finishOrder.map((h, i) => ({
        pos: i + 1,
        no: h.no,
        time: h.finishTime,
        behind: i === 0 ? 0 : ((h.finishTime - win.finishTime) * (D / win.finishTime)) / HORSE_LEN,
        running: [...checkpoints.map((c) => h.checkpoints[c]), i + 1].join('-'),
      }));
    },
  };

  function stepHorse(h, dt) {
    const x = Math.min(1, Math.max(0, h.dist / D));
    let target;
    if (h.finished) {
      target = Math.max(4, h.v - 3 * dt * 10); // pull up
    } else {
      const wob = 1 + h.wobA * Math.sin(sim.t * h.wobF * 2 * Math.PI + h.wobP);
      target = h.V * shapeAt(h.style, x) * wob;
    }
    if (sim.t < h.jump) target = 0;
    if (h.blocked) target = Math.min(target, h.blockedSpeed);
    const dv = target - h.v;
    const maxAcc = h.v < 10 ? 7 : 2.5;
    h.v += Math.max(-4 * dt, Math.min(maxAcc * dt, dv * Math.min(1, dt * 1.6)));
    const prev = h.dist;
    h.dist += (h.v * dt) / laneFactor(p0 + h.dist, h.w);

    const remPrev = D - prev, rem = D - h.dist;
    for (const c of checkpoints) {
      if (remPrev > c && rem <= c) h.checkpoints[c] = 1 + horses.filter((o) => o !== h && o.dist > h.dist).length;
    }
    if (!h.finished && h.dist >= D) {
      h.finished = true;
      h.finishTime = sim.t - dt + (dt * (D - prev)) / (h.dist - prev);
      sim.finishOrder.push(h);
      sim.finishOrder.sort((a, b) => a.finishTime - b.finishTime);
    }
  }

  // Horses drift toward the rail when there is room and look for a gap when blocked.
  function resolveLanes(dt) {
    const sorted = horses.slice().sort((a, b) => b.dist - a.dist);
    for (const h of sorted) {
      const ahead = (lane) =>
        sorted.find((o) => o !== h && o.dist > h.dist - 0.3 && o.dist - h.dist < HORSE_LEN * 1.25 && Math.abs(o.w - lane) < 1.2);
      const beside = (lane) =>
        sorted.some((o) => o !== h && Math.abs(o.dist - h.dist) < HORSE_LEN * 1.1 && Math.abs(o.w - lane) < 1.25);
      const blocker = ahead(h.w);
      h.blocked = !!blocker && blocker.v < h.v + 0.3 && !h.finished;
      h.blockedSpeed = blocker ? blocker.v : 0;

      let desired = h.w;
      if (sim.t > 2) {
        const inward = h.w - LANE_STEP;
        const outward = h.w + LANE_STEP;
        if (h.blocked && !beside(outward) && outward < 18) desired = outward;
        else if (inward >= 1.0 && !beside(inward) && !ahead(inward)) desired = Math.max(1.0, inward);
        else if (h.w > 1.0 && !beside(Math.max(1, h.w - 0.4))) desired = Math.max(1.0, h.w - 0.4);
      }
      const maxLat = 0.9 * dt;
      const move = Math.max(-maxLat, Math.min(maxLat, desired - h.w));
      h.w += move;
      h.latV = move / dt;
    }
  }

  return sim;
}

// HK-style margin description (馬位).
export function marginText(lengths) {
  if (lengths <= 0) return '';
  if (lengths < 0.1) return '短頭位';
  if (lengths < 0.2) return '頭位';
  if (lengths < 0.35) return '頸位';
  if (lengths < 0.6) return '1/2';
  if (lengths < 0.85) return '3/4';
  const whole = Math.floor(lengths);
  const frac = lengths - whole;
  const f = frac < 0.125 ? '' : frac < 0.375 ? '-1/4' : frac < 0.625 ? '-1/2' : frac < 0.875 ? '-3/4' : '';
  return `${frac >= 0.875 ? whole + 1 : whole}${f}`;
}

export function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
