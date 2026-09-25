import { makeRng } from './rng.js';
import { abilities, PERF_SD } from './sim.js';

export const UNIT = 10; // dividends are quoted per $10
export const POOLS = {
  WIN: { name: '獨贏', pick: 1, deduct: 0.175, hint: '選中第一名' },
  PLA: { name: '位置', pick: 1, deduct: 0.175, hint: '選中前三名之一' },
  QIN: { name: '連贏', pick: 2, deduct: 0.175, hint: '選中頭兩名，不論次序' },
  QPL: { name: '位置Q', pick: 2, deduct: 0.175, hint: '選中前三名其中兩匹' },
  TCE: { name: '三重彩', pick: 3, deduct: 0.25, hint: '順序選中頭三名' },
};

const key = (sel) => sel.join('-');
const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

// Monte-Carlo win probabilities from abilities; sd widened for in-race luck (fitted against the sim).
export function winProbs(ab, rng, sd = PERF_SD * 1.8, n = 4000) {
  const wins = new Array(ab.length).fill(0);
  for (let k = 0; k < n; k++) {
    let best = -1, bi = 0;
    for (let i = 0; i < ab.length; i++) {
      const v = ab[i] + rng.normal() * sd;
      if (v > best || i === 0) { best = v; bi = i; }
    }
    wins[bi]++;
  }
  return wins.map((w) => (w + 1) / (n + ab.length));
}

// Harville: P(i 1st, j 2nd, k 3rd) from win probabilities (indexed by horse number).
function harville(p) {
  const ids = Object.keys(p).map(Number);
  const tri = {};
  for (const i of ids) for (const j of ids) for (const k of ids) {
    if (i === j || j === k || i === k) continue;
    tri[`${i}-${j}-${k}`] = p[i] * (p[j] / (1 - p[i])) * (p[k] / (1 - p[i] - p[j]));
  }
  return tri;
}

// Build a book of simulated public money for a race. Public opinion = true ability plus
// a per-race error, with the usual favourite–longshot bias.
export function createBook(race) {
  const rng = makeRng(race.seed * 97 + race.raceNo * 1009);
  const ab = abilities(race);
  const publicAb = ab.map((a) => a + rng.normal() * 2.5);
  const raw = winProbs(publicAb, rng);
  const biased = raw.map((q) => Math.pow(q, 0.88));
  const sum = biased.reduce((a, b) => a + b, 0);
  const pub = {};
  race.horses.forEach((h, i) => (pub[h.no] = biased[i] / sum));

  const book = { race, pub, pools: {}, userStake: {}, history: [] };
  const scale = rng.range(0.8, 1.3);
  const sizes = { WIN: 9e6, PLA: 6e6, QIN: 14e6, QPL: 9e6, TCE: 12e6 };
  for (const pool of Object.keys(POOLS)) book.pools[pool] = { total: 0, stakes: {} };
  seedMoney(book, sizes, scale);
  return book;
}

function combosFor(pub) {
  const tri = harville(pub);
  const place = {}, qin = {}, qpl = {};
  for (const [k, pr] of Object.entries(tri)) {
    const [a, b, c] = k.split('-').map(Number);
    for (const x of [a, b, c]) place[x] = (place[x] || 0) + pr;
    qin[pairKey(a, b)] = (qin[pairKey(a, b)] || 0) + pr;
    for (const [x, y] of [[a, b], [a, c], [b, c]]) qpl[pairKey(x, y)] = (qpl[pairKey(x, y)] || 0) + pr;
  }
  return { WIN: pub, PLA: place, QIN: qin, QPL: qpl, TCE: tri };
}

function addMoney(book, pool, sel, amount) {
  const P = book.pools[pool];
  P.stakes[sel] = (P.stakes[sel] || 0) + amount;
  P.total += amount;
}

function seedMoney(book, sizes, scale) {
  const probs = combosFor(book.pub);
  for (const [pool, dist] of Object.entries(probs)) {
    const norm = Object.values(dist).reduce((a, b) => a + b, 0);
    for (const [sel, pr] of Object.entries(dist)) addMoney(book, pool, String(sel), (sizes[pool] * scale * pr) / norm);
  }
}

// Late money keeps flowing while betting is open; the public mood drifts a little.
export function tickBook(book, rng, fraction = 0.02) {
  const drift = {};
  let sum = 0;
  for (const [no, p] of Object.entries(book.pub)) {
    drift[no] = p * Math.exp(rng.normal() * 0.12);
    sum += drift[no];
  }
  for (const no of Object.keys(drift)) drift[no] /= sum;
  const probs = combosFor(drift);
  for (const [pool, dist] of Object.entries(probs)) {
    const amt = book.pools[pool].total * fraction;
    const norm = Object.values(dist).reduce((a, b) => a + b, 0);
    for (const [sel, pr] of Object.entries(dist)) addMoney(book, pool, String(sel), (amt * pr) / norm);
  }
}

// Current approximate win odds (dividend per $1), HK display style.
export function winOdds(book, no) {
  const P = book.pools.WIN;
  return (P.total * (1 - POOLS.WIN.deduct)) / (P.stakes[no] || 1);
}

export function fmtOdds(o) {
  if (o >= 99) return '99';
  return o < 10 ? (Math.floor(o * 10) / 10).toFixed(1) : String(Math.floor(o));
}

// Estimated dividend (per $10) for a single-selection combo if it wins now.
export function estDividend(book, pool, sel) {
  const P = book.pools[pool];
  const k = pool === 'QIN' || pool === 'QPL' ? pairKey(sel[0], sel[1]) : key(sel);
  const net = P.total * (1 - POOLS[pool].deduct);
  const share = pool === 'PLA' || pool === 'QPL' ? 3 : 1;
  const stake = P.stakes[k] || 1;
  if (share === 1) return Math.max(UNIT, (UNIT * net) / stake);
  // Place-type: profit is split 3 ways; assume the other two winners carry median stakes.
  const sorted = Object.values(P.stakes).sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  const profit = Math.max(0, net - stake - 2 * median);
  return Math.max(UNIT, UNIT + (UNIT * profit) / 3 / stake);
}

// Expand a slip selection into unit combinations (複式).
export function expand(pool, picks) {
  if (pool === 'WIN' || pool === 'PLA') return picks.map((n) => [n]);
  if (pool === 'TCE') return picks.length === 3 ? [picks.slice()] : [];
  const out = [];
  for (let i = 0; i < picks.length; i++) for (let j = i + 1; j < picks.length; j++) out.push([picks[i], picks[j]]);
  return out;
}

export function placeBet(book, pool, sel, stake) {
  const k = pool === 'QIN' || pool === 'QPL' ? pairKey(sel[0], sel[1]) : key(sel);
  addMoney(book, pool, k, stake);
  book.userStake[`${pool}:${k}`] = (book.userStake[`${pool}:${k}`] || 0) + stake;
  return { pool, sel: sel.slice(), key: k, stake };
}

const floor1 = (x) => Math.floor(x * 10) / 10;

// Final dividends per $10 for every winning combination, given finishing order of numbers.
export function dividends(book, order) {
  const [a, b, c] = order;
  const out = {};
  const win = book.pools.WIN;
  out.WIN = { [String(a)]: floor1(Math.max(UNIT, (UNIT * win.total * (1 - POOLS.WIN.deduct)) / win.stakes[a])) };

  const split3 = (pool, keys) => {
    const P = book.pools[pool];
    const net = P.total * (1 - POOLS[pool].deduct);
    const winStake = keys.reduce((s, k) => s + (P.stakes[k] || 0), 0);
    const profit = Math.max(0, net - winStake);
    const res = {};
    for (const k of keys) {
      const st = P.stakes[k] || 0;
      res[k] = st > 0 ? floor1(Math.max(UNIT, UNIT + (UNIT * (profit / keys.length)) / st)) : 0;
    }
    return res;
  };
  out.PLA = split3('PLA', [a, b, c].map(String));
  out.QPL = split3('QPL', [pairKey(a, b), pairKey(a, c), pairKey(b, c)]);

  const single = (pool, k) => {
    const P = book.pools[pool];
    const st = P.stakes[k] || 0;
    return { [k]: st > 0 ? floor1(Math.max(UNIT, (UNIT * P.total * (1 - POOLS[pool].deduct)) / st)) : 0 };
  };
  out.QIN = single('QIN', pairKey(a, b));
  out.TCE = single('TCE', key([a, b, c]));
  return out;
}

// Payout for a user bet: stake/UNIT × dividend when it hits.
export function settle(bet, divs) {
  const d = divs[bet.pool]?.[bet.key];
  return d ? (bet.stake / UNIT) * d : 0;
}
