import * as THREE from 'three';
import { makeRace } from './core/data.js';
import { createRaceSim } from './core/sim.js';
import { createBook, tickBook, winOdds, fmtOdds, POOLS, expand, placeBet, dividends, settle, UNIT } from './core/betting.js';
import { createCaller } from './core/commentary.js';
import { makeRng } from './core/rng.js';
import { startP, trackPos } from './core/track.js';
import { createRenderer, createComposer, createSky, createHills, createCity } from './scene/world.js';
import { createCourse, createGate } from './scene/course.js';
import { loadHorseModel, createRunner } from './scene/horses.js';
import { createDirector, SHOTS } from './scene/director.js';
import { canvas, tex } from './scene/textures.js';
import * as ui from './ui.js';

const params = new URLSearchParams(location.search);
const QUALITY = {
  high: { pixelRatio: 2, shadows: true, bloom: true, msaa: 4, spotLights: 8, beams: 0.07, crowd: 1 },
  low: { pixelRatio: 1, shadows: false, bloom: true, msaa: 0, spotLights: 3, beams: 0.05, crowd: 0.35 },
};
const quality = QUALITY[params.get('q')] || QUALITY.high;
const SPEEDS = [1, 2, 4];
const RACES_PER_MEETING = 9;
const START_BALANCE = 10000;

const store = {
  get(k, d) { try { const v = localStorage.getItem(`hkrs.${k}`); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`hkrs.${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};

const urlSeed = params.has('seed') ? Number(params.get('seed')) : null;
const G = {
  seed: urlSeed ?? store.get('seed', Math.floor(Math.random() * 1e6)),
  raceNo: urlSeed ? 1 : store.get('raceNo', 1),
  balance: urlSeed ? START_BALANCE : store.get('balance', START_BALANCE),
  speed: Number(params.get('speed')) || 1,
  phase: 'idle',
  pool: 'WIN',
  picks: [],
  stake: UNIT,
  bets: [],
  runners: [],
  lastResult: null,
};
if (G.balance < UNIT) G.balance = START_BALANCE; // broke? the club tops you up

// ---------- Scene ----------
const stage = document.getElementById('stage');
const renderer = createRenderer(stage, quality);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0b1120, 0.00055);
const camera = new THREE.PerspectiveCamera(45, stage.clientWidth / stage.clientHeight, 0.3, 6000);
const { composer } = createComposer(renderer, scene, camera, quality);

createSky(scene);
createHills(scene);
const city = createCity(scene);
const course = createCourse(scene, quality);

scene.add(new THREE.HemisphereLight(0x6a7ca0, 0x1a2414, 0.9));
const key = new THREE.DirectionalLight(0xfff1e0, 2.2);
key.castShadow = quality.shadows;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 10, far: 260 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.03;
scene.add(key, key.target);

// Infield big screen: live TV feed during the race, tote board otherwise.
const screenRT = new THREE.WebGLRenderTarget(768, 217, { type: THREE.HalfFloatType });
const screenCam = new THREE.PerspectiveCamera(24, course.screen.aspect, 0.5, 4000);
const [boardCanvas, boardCtx] = canvas(1024, 290);
const boardTex = tex(boardCanvas);
course.screen.mat.map = boardTex;

const director = createDirector(camera, renderer.domElement);

function drawBoard(title, rows) {
  const g = boardCtx;
  g.fillStyle = '#041a10';
  g.fillRect(0, 0, 1024, 290);
  g.fillStyle = '#0b4a33';
  g.fillRect(0, 0, 1024, 54);
  g.fillStyle = '#f0d48a';
  g.font = '900 34px "Noto Sans TC", "PingFang TC", sans-serif';
  g.textBaseline = 'middle';
  g.fillText(title, 20, 28);
  const cols = 6;
  rows.forEach((r, i) => {
    const x = 16 + (i % cols) * 168, y = 70 + Math.floor(i / cols) * 108;
    g.fillStyle = '#f4f4f0';
    g.fillRect(x, y, 52, 52);
    g.fillStyle = '#111';
    g.font = '900 38px Arial';
    g.textAlign = 'center';
    g.fillText(r.no, x + 26, y + 28);
    g.textAlign = 'left';
    g.fillStyle = r.hot ? '#ff6a5a' : '#ffffff';
    g.font = '900 44px Arial';
    g.fillText(r.val, x + 62, y + 28);
    g.fillStyle = '#a9b8b0';
    g.font = '500 20px "Noto Sans TC", "PingFang TC", sans-serif';
    g.fillText(r.sub, x, y + 76);
  });
  boardTex.needsUpdate = true;
}

function drawOddsBoard() {
  const odds = G.race.horses.map((h) => winOdds(G.book, h.no));
  const fav = Math.min(...odds);
  drawBoard(`第${G.race.raceNo}場 ${G.race.name} ${G.race.distance}米 · 獨贏賠率`, G.race.horses.map((h, i) => ({ no: h.no, val: fmtOdds(odds[i]), hot: odds[i] === fav, sub: h.name })));
}

// ---------- Race lifecycle ----------
function newRace() {
  for (const r of G.runners) r.dispose();
  G.gate?.dispose();
  G.race = makeRace(G.seed, G.raceNo);
  G.book = createBook(G.race);
  G.oddsRng = makeRng(G.seed + G.raceNo * 13 + 1);
  const simSeed = urlSeed ? G.seed * 1000 + G.raceNo : Math.floor(Math.random() * 1e9);
  G.sim = createRaceSim(G.race, simSeed);
  G.caller = createCaller(G.race);
  G.bets = [];
  G.picks = [];
  G.phase = 'idle';
  G.finishedAt = null;
  G.lastResult = null;
  G.gateP = startP(G.race.distance);
  G.gate = createGate(scene, G.gateP, G.race.horses.length);
  G.runners = G.race.horses.map((h) => createRunner(scene, h));
  G.runners.forEach((r, i) => r.update(G.sim.horses[i], G.sim.p(G.sim.horses[i]), 0));
  store.set('seed', G.seed);
  store.set('raceNo', G.raceNo);

  ui.renderMeeting(G.race, G.seed % 1000);
  ui.renderCard(G.race, G.book, G.picks, togglePick);
  ui.renderPoolTabs(G.pool, setPool);
  refreshSlip();
  ui.showBetting(true);
  viewBtn.setAttribute('aria-pressed', 'false');
  viewBtn.textContent = '睇馬場';
  viewBtn.hidden = false;
  ui.hideResults();
  drawOddsBoard();
  course.screen.mat.map = boardTex;
  director.toOverview();
}

function togglePick(no) {
  if (G.phase !== 'idle') return;
  const i = G.picks.indexOf(no);
  if (i >= 0) G.picks.splice(i, 1);
  else {
    if (POOLS[G.pool].pick === 3 && G.picks.length >= 3) G.picks.shift();
    G.picks.push(no);
  }
  ui.markPicks(G.picks);
  refreshSlip();
}

function setPool(pool) {
  G.pool = pool;
  if (pool === 'TCE') G.picks = G.picks.slice(0, 3);
  ui.renderPoolTabs(pool, setPool);
  ui.markPicks(G.picks);
  refreshSlip();
}

function refreshSlip() {
  ui.renderSlip({ race: G.race, book: G.book, pool: G.pool, picks: G.picks, stake: G.stake, balance: G.balance, bets: G.bets });
}

function placeCurrent() {
  const combos = expand(G.pool, G.picks);
  const total = combos.length * G.stake;
  if (!combos.length || total > G.balance || G.phase !== 'idle') return;
  for (const sel of combos) G.bets.push(placeBet(G.book, G.pool, sel, G.stake));
  setBalance(G.balance - total);
  ui.toast(`已落注 ${POOLS[G.pool].name} ${combos.length} 注 · ${ui.money(total)}`);
  G.picks = [];
  ui.markPicks(G.picks);
  ui.updateOdds(G.race, G.book);
  refreshSlip();
  drawOddsBoard();
}

function setBalance(v, bump) {
  G.balance = Math.round(v * 10) / 10;
  store.set('balance', G.balance);
  ui.setBalance(G.balance, bump);
}

function startRace() {
  if (G.phase !== 'idle') return;
  G.phase = 'gate';
  G.phaseT = 0;
  G.winOddsAtOff = Object.fromEntries(G.race.horses.map((h) => [h.no, winOdds(G.book, h.no)]));
  G.mine = new Set(G.bets.flatMap((b) => b.sel));
  ui.showBetting(false);
  viewBtn.hidden = true;
  ui.banner('各駒入閘完畢', 1800);
  ui.commentary(`${G.race.name}，${G.race.distance}米，十二匹馬已經入閘……`);
  ui.renderControls(SHOTS, SPEEDS, { shot: director.mode, speed: G.speed }, setShot, setSpeed);
}

function setShot(s) {
  director.setMode(s);
  ui.renderControls(SHOTS, SPEEDS, { shot: s, speed: G.speed }, setShot, setSpeed);
}
function setSpeed(s) {
  G.speed = s;
  ui.renderControls(SHOTS, SPEEDS, { shot: director.mode, speed: s }, setShot, setSpeed);
}

function finishRace() {
  const results = G.sim.results();
  const order = results.map((r) => r.no);
  const divs = dividends(G.book, order);
  const payouts = G.bets.map((b) => settle(b, divs));
  const back = payouts.reduce((a, b) => a + b, 0);
  setBalance(G.balance + back, back > 0);
  G.lastResult = { order, divs, payouts, bets: G.bets.map((b) => ({ ...b })), balance: G.balance };
  ui.showResults({ race: G.race, results, divs, bets: G.bets, payouts, book: G.book, winOddsAtOff: G.winOddsAtOff });
  const top = results.slice(0, 3).map((r) => ({ no: r.no, val: `第${r.pos}`, hot: r.pos === 1, sub: G.race.horses.find((h) => h.no === r.no).name }));
  drawBoard(`第${G.race.raceNo}場 賽果 · 獨贏 $${divs.WIN[order[0]]}`, top);
  course.screen.mat.map = boardTex;
  G.phase = 'result';
}

function nextRace() {
  G.raceNo++;
  if (G.raceNo > RACES_PER_MEETING) {
    G.raceNo = 1;
    G.seed = Math.floor(Math.random() * 1e6);
    ui.toast('新一個賽馬日開始！');
  }
  newRace();
}

// ---------- Wire DOM ----------
ui.renderQuick((v) => { G.stake = v; document.getElementById('stake').value = v; refreshSlip(); });
document.getElementById('stake').addEventListener('input', (e) => {
  G.stake = Math.max(0, Math.floor(Number(e.target.value) || 0));
  refreshSlip();
});
document.getElementById('placeBtn').addEventListener('click', placeCurrent);
const viewBtn = document.getElementById('viewBtn');
function togglePanels() {
  if (G.phase !== 'idle') return;
  const hide = viewBtn.getAttribute('aria-pressed') !== 'true';
  viewBtn.setAttribute('aria-pressed', String(hide));
  viewBtn.textContent = hide ? '返回投注' : '睇馬場';
  ui.showBetting(!hide);
  document.getElementById('live').hidden = true;
}
viewBtn.addEventListener('click', togglePanels);
window.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'h' && e.target.tagName !== 'INPUT') togglePanels(); });
document.getElementById('startBtn').addEventListener('click', startRace);
document.getElementById('nextBtn').addEventListener('click', nextRace);
window.addEventListener('resize', () => {
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  composer.setSize(stage.clientWidth, stage.clientHeight);
  camera.aspect = stage.clientWidth / stage.clientHeight;
  camera.updateProjectionMatrix();
});

// ---------- Frame loop ----------
const labels = document.getElementById('labels');
const tags = new Map();
const v3 = new THREE.Vector3();
function updateLabels(show) {
  if (!show) { labels.style.display = 'none'; return; }
  labels.style.display = '';
  const w = stage.clientWidth, h = stage.clientHeight;
  for (const r of G.runners) {
    let el = tags.get(r.no);
    if (!el) {
      el = document.createElement('div');
      el.className = 'tag';
      el.textContent = r.no;
      labels.appendChild(el);
      tags.set(r.no, el);
    }
    el.classList.toggle('mine', G.mine?.has(r.no) ?? false);
    v3.copy(r.anchor).project(camera);
    const dist = camera.position.distanceTo(r.anchor);
    const vis = v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1 && dist < 260;
    el.style.display = vis ? '' : 'none';
    if (vis) el.style.transform = `translate(${((v3.x + 1) / 2) * w}px, ${((1 - v3.y) / 2) * h}px) translate(-50%, -100%)`;
  }
  for (const [no, el] of tags) if (!G.runners.some((r) => r.no === no)) { el.remove(); tags.delete(no); }
}

function raceCtx() {
  const sim = G.sim;
  const order = sim.order();
  const lead = order[0];
  const top = order.slice(0, 6);
  const avgP = top.reduce((s, h) => s + sim.p(h), 0) / top.length;
  const ws = top.map((h) => h.w);
  const focusNo = [...(G.mine ?? [])][0];
  const focus = sim.horses.find((h) => h.no === focusNo) ?? lead;
  const phase = G.phase === 'result' ? 'finished' : G.phase;
  return {
    phase,
    t: sim.t,
    lead: { p: sim.p(lead), w: lead.w, rem: G.race.distance - lead.dist },
    pack: { p: avgP, w: ws.reduce((a, b) => a + b, 0) / ws.length, spread: Math.max(...ws) - Math.min(...ws), len: lead.dist - order[order.length - 1].dist },
    focus: { p: sim.p(focus), w: focus.w },
    gateP: G.gateP,
    sinceFinish: G.finishedAt ? (performance.now() - G.finishedAt) / 1000 : 0,
  };
}

const timer = new THREE.Timer();
timer.connect(document);
let frame = 0, oddsTimer = 0, liveTimer = 0, fpsAcc = 0, fpsN = 0;
G.fps = 0;
function loop() {
  requestAnimationFrame(loop);
  timer.update();
  const dt = Math.min(0.1, timer.getDelta());
  const t = timer.getElapsed();
  frame++;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 1) { G.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }

  const sim = G.sim;
  if (G.phase === 'idle') {
    oddsTimer += dt;
    if (oddsTimer > 3) {
      oddsTimer = 0;
      tickBook(G.book, G.oddsRng, 0.012);
      ui.updateOdds(G.race, G.book);
      drawOddsBoard();
    }
  } else if (G.phase === 'gate') {
    G.phaseT += dt;
    if (G.phaseT > 2.4 / Math.sqrt(G.speed)) {
      G.phase = 'running';
      G.gate.open();
      sim.started = true;
      ui.banner('開跑！', 1200);
    }
  }
  let simDt = 0;
  if (G.phase === 'running' || G.phase === 'finishing' || G.phase === 'result') {
    simDt = dt * G.speed;
    const n = Math.ceil(simDt / (1 / 60));
    for (let i = 0; i < n; i++) sim.step(simDt / n);
    if (sim.t > 9) G.gate.tow();
    const line = G.caller(sim);
    if (line) ui.commentary(line);
    if (sim.finishOrder.length && !G.finishedAt) {
      G.finishedAt = performance.now();
      const [w, s] = sim.finishOrder;
      ui.banner(s && s.finishTime - w.finishTime < 0.04 ? '影相！' : `${w.no}號 勝出！`, 2200);
    }
    if (G.phase === 'running' && sim.done) { G.phase = 'finishing'; G.doneAt = performance.now(); }
    if (G.phase === 'finishing' && performance.now() - G.doneAt > 2500 / Math.sqrt(G.speed)) finishRace();
  }
  G.gate.update(dt * G.speed);
  G.runners.forEach((r, i) => r.update(sim.horses[i], sim.p(sim.horses[i]), simDt || dt * 0.02));

  const racing = G.phase !== 'idle';
  const ctx = raceCtx();
  director.update(racing ? ctx : { ...ctx, phase: 'idle' }, dt);

  // Key light rides with the pack so shadows stay crisp.
  const focus = racing ? trackPos(ctx.pack.p, ctx.pack.w) : trackPos(G.gateP, 8);
  key.target.position.set(focus.x, 0, focus.z);
  key.position.set(focus.x + 45, 110, focus.z + 70);

  const rem = ctx.lead.rem;
  course.stand.update(t, racing ? (rem < 450 ? 1 : 0.15) : 0.05);
  city.update(t);

  if (racing && G.phase !== 'result' && frame % 2 === 0) {
    director.placeScreenCamera(screenCam, ctx);
    course.screen.panel.visible = false;
    renderer.setRenderTarget(screenRT);
    renderer.render(scene, screenCam);
    renderer.setRenderTarget(null);
    course.screen.panel.visible = true;
    course.screen.mat.map = screenRT.texture;
  }

  composer.render(dt);
  updateLabels(racing && G.phase !== 'result' && director.shot !== 'free');

  liveTimer += dt;
  if (racing && liveTimer > 0.1) { liveTimer = 0; ui.renderLive(sim, G.race, G.mine); }
}

// ---------- Boot ----------
window.__hkrs = {
  get phase() { return G.phase; },
  get balance() { return G.balance; },
  get lastResult() { return G.lastResult; },
  get fps() { return G.fps; },
  get race() { return G.race; },
  get simT() { return G.sim?.t; },
};

(async () => {
  await loadHorseModel(`${import.meta.env.BASE_URL}models/Horse.glb`);
  ui.setBalance(G.balance);
  newRace();
  loop();
  document.getElementById('loading').classList.add('done');
})();

