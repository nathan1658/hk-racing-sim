import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, trackPos, startP, segmentOf } from '../../src/core/track.js';
import { makeRace, DISTANCES } from '../../src/core/data.js';
import { createRaceSim, marginText } from '../../src/core/sim.js';
import { createBook, placeBet, dividends, settle, expand, winOdds, UNIT } from '../../src/core/betting.js';

const runRace = (race, seed) => {
  const sim = createRaceSim(race, seed);
  sim.started = true;
  while (!sim.done) sim.step(1 / 60);
  return sim;
};

test('course is a closed, continuous loop', () => {
  let prev = trackPos(0, 0);
  for (let p = 0.5; p <= TRACK.P; p += 0.5) {
    const q = trackPos(p, 0);
    assert.ok(Math.hypot(q.x - prev.x, q.z - prev.z) < 0.51, `gap at p=${p}`);
    prev = q;
  }
});

test('every race distance starts on a straight, not a bend', () => {
  for (const d of DISTANCES) assert.ok(segmentOf(startP(d)) % 2 === 0, `${d}m starts on a turn`);
});

test('race card: 12 runners, unique numbers and draws, handicap weights', () => {
  const race = makeRace(123, 4);
  assert.equal(race.horses.length, 12);
  assert.deepEqual(race.horses.map((h) => h.no).sort((a, b) => a - b), [...Array(12)].map((_, i) => i + 1));
  assert.equal(new Set(race.horses.map((h) => h.draw)).size, 12);
  assert.equal(race.horses[0].weight, 133);
  for (const h of race.horses) assert.ok(h.weight >= 113 && h.weight <= 133);
});

test('sim: everyone finishes, order is by time, times near 跑馬地 pars', () => {
  const par = { 1000: 57, 1200: 69.5, 1650: 99.5, 1800: 109.5 };
  for (let s = 1; s <= 40; s++) {
    const race = makeRace(s, 1);
    const sim = runRace(race, s);
    const res = sim.results();
    assert.equal(res.length, 12);
    for (let i = 1; i < res.length; i++) assert.ok(res[i].time >= res[i - 1].time);
    assert.ok(Math.abs(res[0].time - par[race.distance]) < 4, `${race.distance}m in ${res[0].time}`);
  }
});

test('sim is deterministic for a fixed seed and step', () => {
  const race = makeRace(9, 2);
  assert.deepEqual(runRace(race, 55).results().map((r) => r.no), runRace(race, 55).results().map((r) => r.no));
});

test('win dividend = net pool / winning stake, per $10', () => {
  const race = makeRace(5, 1);
  const book = createBook(race);
  const order = race.horses.map((h) => h.no);
  const P = book.pools.WIN;
  const expected = Math.floor(((UNIT * P.total * 0.825) / P.stakes[order[0]]) * 10) / 10;
  assert.equal(dividends(book, order).WIN[order[0]], Math.max(UNIT, expected));
});

test('place pool: three dividends, each at least $10, profit split three ways', () => {
  const race = makeRace(6, 3);
  const book = createBook(race);
  const order = race.horses.map((h) => h.no).reverse();
  const d = dividends(book, order).PLA;
  assert.equal(Object.keys(d).length, 3);
  const P = book.pools.PLA;
  const net = P.total * 0.825;
  const winStake = order.slice(0, 3).reduce((s, n) => s + P.stakes[n], 0);
  let paid = 0;
  for (const n of order.slice(0, 3)) {
    assert.ok(d[n] >= UNIT);
    paid += (P.stakes[n] / UNIT) * d[n];
  }
  assert.ok(paid <= net + 1e-6 && paid > net - winStake * 0.02, 'pays out the net pool (less rounding)');
});

test('backing a horse shortens its odds; settle pays stake/10 × dividend', () => {
  const race = makeRace(8, 1);
  const book = createBook(race);
  const before = winOdds(book, 3);
  const bet = placeBet(book, 'WIN', [3], 50000);
  assert.ok(winOdds(book, 3) < before);
  const divs = dividends(book, [3, 1, 2, ...race.horses.map((h) => h.no).filter((n) => n > 3)]);
  assert.equal(settle(bet, divs), (50000 / UNIT) * divs.WIN['3']);
  assert.equal(settle(placeBet(book, 'WIN', [4], 10), divs), 0);
});

test('quinella is order-free, tierce is order-exact', () => {
  const race = makeRace(2, 2);
  const book = createBook(race);
  const q = placeBet(book, 'QIN', [5, 2], 10);
  const t = placeBet(book, 'TCE', [2, 5, 7], 10);
  const t2 = placeBet(book, 'TCE', [5, 2, 7], 10);
  const divs = dividends(book, [2, 5, 7, 1, 3, 4, 6, 8, 9, 10, 11, 12]);
  assert.ok(settle(q, divs) > 0);
  assert.ok(settle(t, divs) > 0);
  assert.equal(settle(t2, divs), 0);
});

test('複式 expansion counts', () => {
  assert.equal(expand('QIN', [1, 2, 3, 4]).length, 6);
  assert.equal(expand('WIN', [1, 2]).length, 2);
  assert.equal(expand('TCE', [1, 2]).length, 0);
  assert.deepEqual(expand('TCE', [3, 1, 2]), [[3, 1, 2]]);
});

test('HK margin wording', () => {
  assert.equal(marginText(0.05), '短頭位');
  assert.equal(marginText(0.15), '頭位');
  assert.equal(marginText(0.3), '頸位');
  assert.equal(marginText(1.5), '1-1/2');
  assert.equal(marginText(2.9), '3');
});
