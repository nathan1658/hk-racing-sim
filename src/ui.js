import { POOLS, fmtOdds, winOdds, estDividend, expand, UNIT } from './core/betting.js';
import { COATS, styleName } from './core/data.js';
import { fmtTime, marginText } from './core/sim.js';

const $ = (id) => document.getElementById(id);
const money = (v) => `HK$${v.toLocaleString('en-HK', { minimumFractionDigits: v % 1 ? 1 : 0, maximumFractionDigits: 1 })}`;
export { money };

export function silkCss(s) {
  const { body: a, trim: b } = s;
  switch (s.pattern) {
    case 'hoops': return `repeating-linear-gradient(0deg, ${a} 0 4px, ${b} 4px 7px)`;
    case 'stripes': return `repeating-linear-gradient(90deg, ${a} 0 4px, ${b} 4px 7px)`;
    case 'halves': return `linear-gradient(90deg, ${a} 50%, ${b} 50%)`;
    case 'sash': return `linear-gradient(135deg, ${a} 38%, ${b} 38% 62%, ${a} 62%)`;
    case 'diamond': return `radial-gradient(circle, ${b} 0 30%, transparent 31%), ${a}`;
    case 'spots': return `radial-gradient(circle at 30% 30%, ${b} 0 14%, transparent 15%), radial-gradient(circle at 70% 70%, ${b} 0 14%, transparent 15%), ${a}`;
    case 'cross': return `linear-gradient(90deg, transparent 42%, ${b} 42% 58%, transparent 58%), linear-gradient(0deg, transparent 42%, ${b} 42% 58%, transparent 58%), ${a}`;
    default: return a;
  }
}

export function renderMeeting(race, meetingNo) {
  $('meeting').innerHTML = `<b>第 ${race.raceNo} 場</b>${race.name} · ${race.className} · ${race.distance}米 · ${race.course} · ${race.going} <span class="muted">· 跑馬地夜賽 #${meetingNo}</span>`;
}

let prevOdds = {};
export function renderCard(race, book, picks, onPick) {
  const tb = $('raceCard').querySelector('tbody');
  const fav = Math.min(...race.horses.map((h) => winOdds(book, h.no)));
  tb.innerHTML = race.horses
    .map((h) => {
      const o = winOdds(book, h.no);
      const pl = estDividend(book, 'PLA', [h.no]) / UNIT;
      return `<tr data-no="${h.no}" class="${picks.includes(h.no) ? 'sel' : ''}">
        <td><span class="no">${h.no}</span></td>
        <td><span class="silk" style="background:${silkCss(h.silks)}"></span></td>
        <td class="l"><span class="horse-name">${h.name}</span><span class="horse-sub">${h.age}歲 ${COATS[h.coat].name}色 · ${styleName(h.style)} · 練馬師 ${h.trainer}</span></td>
        <td class="l">${h.jockey}</td>
        <td>${h.draw}</td>
        <td>${h.weight}</td>
        <td>${h.rating}</td>
        <td class="form">${h.form}</td>
        <td><span class="odds ${o === fav ? 'hot' : ''}" data-odds="${h.no}">${fmtOdds(o)}</span></td>
        <td><span class="odds" data-place="${h.no}">${fmtOdds(pl)}</span></td>
      </tr>`;
    })
    .join('');
  prevOdds = Object.fromEntries(race.horses.map((h) => [h.no, winOdds(book, h.no)]));
  tb.onclick = (e) => {
    const tr = e.target.closest('tr[data-no]');
    if (tr) onPick(Number(tr.dataset.no));
  };
}

export function markPicks(picks) {
  for (const tr of $('raceCard').querySelectorAll('tbody tr')) tr.classList.toggle('sel', picks.includes(Number(tr.dataset.no)));
}

// Refresh odds in place, flashing moves (red = shortening / 落飛).
export function updateOdds(race, book) {
  const fav = Math.min(...race.horses.map((h) => winOdds(book, h.no)));
  for (const h of race.horses) {
    const o = winOdds(book, h.no);
    const el = document.querySelector(`[data-odds="${h.no}"]`);
    if (!el) continue;
    const txt = fmtOdds(o);
    if (txt !== el.textContent) {
      el.classList.remove('flash-down', 'flash-up');
      void el.offsetWidth;
      el.classList.add(o < prevOdds[h.no] ? 'flash-down' : 'flash-up');
      el.textContent = txt;
    }
    el.classList.toggle('hot', o === fav);
    const pl = document.querySelector(`[data-place="${h.no}"]`);
    if (pl) pl.textContent = fmtOdds(estDividend(book, 'PLA', [h.no]) / UNIT);
    prevOdds[h.no] = o;
  }
  const d = new Date();
  $('oddsTime').textContent = `賠率更新 ${d.toLocaleTimeString('zh-HK', { hour12: false })}`;
}

export function renderPoolTabs(pool, onPool) {
  const el = $('poolTabs');
  el.innerHTML = Object.entries(POOLS)
    .map(([k, p]) => `<button role="tab" data-pool="${k}" aria-selected="${k === pool}">${p.name}</button>`)
    .join('');
  el.onclick = (e) => {
    const b = e.target.closest('button[data-pool]');
    if (b) onPool(b.dataset.pool);
  };
  $('poolHint').textContent = POOLS[pool].hint;
}

export function renderSlip({ race, book, pool, picks, stake, balance, bets }) {
  const sel = $('selection');
  const byNo = (n) => race.horses.find((h) => h.no === n);
  if (!picks.length) sel.innerHTML = '<span class="muted">請在排位表點選馬匹</span>';
  else {
    const ord = ['頭馬', '二馬', '三馬'];
    sel.innerHTML = picks
      .map((n, i) => `<span class="chip"><span class="no">${n}</span>${byNo(n).name}${pool === 'TCE' ? `<em>${ord[i]}</em>` : ''}</span>`)
      .join('');
  }
  const combos = expand(pool, picks);
  const total = combos.length * stake;
  $('comboInfo').textContent = `${combos.length} 注`;
  $('slipTotal').textContent = money(total);
  const need = POOLS[pool].pick;
  let est = '';
  if (combos.length === 1) est = `預計派彩（每$10）：${money(Math.floor(estDividend(book, pool, combos[0]) * 10) / 10)}`;
  else if (picks.length < need) est = `${POOLS[pool].name} 需選 ${need} 匹${pool === 'TCE' ? '（按名次順序）' : '或以上（複式）'}`;
  if (total > balance) est = '結餘不足';
  $('estDiv').textContent = est;
  const ok = combos.length > 0 && stake >= UNIT && stake % UNIT === 0 && total <= balance;
  $('placeBtn').disabled = !ok;

  const list = $('betList');
  list.innerHTML = bets.length
    ? bets.map((b) => `<li><span>${POOLS[b.pool].name} ${b.sel.join(b.pool === 'TCE' ? '>' : '-')}</span><span>${money(b.stake)}</span></li>`).join('')
    : '<li class="muted">未有注項</li>';
}

export function renderQuick(onQuick) {
  const q = $('quick');
  q.innerHTML = [10, 50, 100, 500, 1000].map((v) => `<button data-v="${v}">$${v}</button>`).join('');
  q.onclick = (e) => {
    const b = e.target.closest('button[data-v]');
    if (b) onQuick(Number(b.dataset.v));
  };
}

export function setBalance(v, bump = false) {
  const el = $('balance');
  el.textContent = money(v);
  el.dataset.value = String(v);
  if (bump) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
}

export function showBetting(show) {
  $('cardPanel').classList.toggle('away-left', !show);
  $('slipPanel').classList.toggle('away-right', !show);
  $('live').hidden = show;
}

export function renderControls(shots, speeds, cur, onShot, onSpeed) {
  $('camButtons').innerHTML = Object.entries(shots).map(([k, v]) => `<button data-shot="${k}" class="${k === cur.shot ? 'on' : ''}">${v}</button>`).join('');
  $('speedButtons').innerHTML = speeds.map((s) => `<button data-speed="${s}" class="${s === cur.speed ? 'on' : ''}">${s}×</button>`).join('');
  $('camButtons').onclick = (e) => { const b = e.target.closest('button'); if (b) onShot(b.dataset.shot); };
  $('speedButtons').onclick = (e) => { const b = e.target.closest('button'); if (b) onSpeed(Number(b.dataset.speed)); };
}

export function renderLive(sim, race, mine) {
  const order = sim.order();
  const lead = order[0];
  $('clock').textContent = fmtTime(sim.t);
  const rem = Math.max(0, race.distance - lead.dist);
  $('remaining').textContent = sim.done ? '全部完成' : rem > 0 ? `距離終點 ${Math.ceil(rem)} 米` : '頭馬已過終點';
  $('order').innerHTML = order
    .map((h, i) => {
      const hr = race.horses[h.idx];
      const gap = i === 0 ? '' : ((lead.dist - h.dist) / 2.4).toFixed(1);
      return `<div class="pos"><span class="no ${mine.has(h.no) ? 'mine' : ''}" style="box-shadow: inset 0 -5px 0 ${hr.silks.body}">${h.no}</span><small>${i === 0 ? '領放' : h.finished ? '' : gap}</small></div>`;
    })
    .join('');
}

export function commentary(text) {
  const el = $('commentary');
  el.textContent = text;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

export function showResults({ race, results, divs, bets, payouts, book, winOddsAtOff }) {
  const byNo = (n) => race.horses.find((h) => h.no === n);
  $('resTitle').textContent = `第 ${race.raceNo} 場賽果`;
  $('resSub').textContent = `${race.name} · ${race.className} · ${race.distance}米 · ${race.going}`;
  $('resTable').querySelector('tbody').innerHTML = results
    .map((r) => {
      const h = byNo(r.no);
      return `<tr><td>${r.pos}</td><td><span class="no">${r.no}</span></td><td class="l">${h.name}</td><td class="l">${h.jockey}</td><td>${h.draw}</td><td>${r.pos === 1 ? '-' : marginText(r.behind)}</td><td>${r.running}</td><td>${fmtTime(r.time)}</td><td>${fmtOdds(winOddsAtOff[r.no])}</td></tr>`;
    })
    .join('');
  const rows = [];
  for (const [pool, m] of Object.entries(divs)) {
    for (const [k, v] of Object.entries(m)) rows.push(`<tr><td>${POOLS[pool].name}</td><td>${k.replaceAll('-', ',')}</td><td>${money(v)}</td></tr>`);
  }
  $('divTable').querySelector('tbody').innerHTML = rows.join('');
  const total = bets.reduce((s, b) => s + b.stake, 0);
  const back = payouts.reduce((s, p) => s + p, 0);
  $('resBets').innerHTML = bets.length
    ? bets.map((b, i) => `<li><span>${POOLS[b.pool].name} ${b.sel.join(b.pool === 'TCE' ? '>' : '-')} · ${money(b.stake)}</span>${payouts[i] > 0 ? `<span class="win">派 ${money(payouts[i])}</span>` : '<span class="lose">落空</span>'}</li>`).join('')
    : '<li class="muted">本場沒有投注</li>';
  const net = back - total;
  const el = $('resNet');
  el.textContent = bets.length ? `本場${net >= 0 ? '贏' : '輸'} ${money(Math.abs(net))}` : '';
  el.className = `net ${net >= 0 ? 'pos' : 'neg'}`;
  $('results').hidden = false;
}

export function hideResults() { $('results').hidden = true; }

let toastT;
export function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 1800);
}

let bannerT;
export function banner(msg, ms = 1800) {
  const el = $('banner');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(bannerT);
  bannerT = setTimeout(() => el.classList.remove('show'), ms);
}

export { $ };
