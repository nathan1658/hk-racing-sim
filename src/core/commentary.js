import { HORSE_LEN } from './sim.js';
import { TRACK, segmentOf, startP } from './track.js';

// Emits race-call lines as the sim progresses. Call next(sim) each frame; returns a line or null.
export function createCaller(race) {
  const name = (h) => `${h.no}號「${race.horses[h.idx].name}」`;
  const said = new Set();
  let lastLeader = null;
  let lastLineT = -99;
  const once = (k, text) => (said.has(k) ? null : (said.add(k), text));
  const p0 = startP(race.distance);

  return function next(sim) {
    const order = sim.order();
    const [a, b, c] = order;
    const rem = race.distance - a.dist;
    const t = sim.t;
    let line = null;

    if (t > 0.05) line ||= once('jump', '閘門打開！十二匹馬一齊衝出！');
    if (t > 1.5) {
      const slow = sim.horses.filter((h) => h.slowJump);
      if (slow.length) line ||= once('slow', `${slow.map(name).join('、')} 出閘稍慢，落後少少。`);
    }
    if (t > 7) line ||= once('early', `${name(a)} 搶先放頭，${name(b)} 緊隨其後，${name(c)} 守第三位。`);

    for (const cp of [1200, 800, 600, 400]) {
      if (cp < race.distance - 150 && rem <= cp) {
        line ||= once(`cp${cp}`, `剩返${cp}米，${name(a)} 仍然領放，${name(b)} 第二，${name(c)} 第三。`);
      }
    }
    const inStraight = segmentOf(p0 + a.dist) === 0 && rem < TRACK.FINISH;
    if (inStraight && rem < 420 && rem > 150) line ||= once('straight', '轉入直路！各駒開始發力衝刺！');

    // Late closers making ground out wide.
    if (rem < 500 && rem > 80) {
      for (const h of order.slice(3, 8)) {
        if (h.v > a.v + 0.6 && h.w > 5 && t - lastLineT > 3) {
          line ||= once(`close${h.no}`, `${name(h)} 外疊急追，後勁凌厲！`);
        }
      }
    }
    if (rem < 200 && rem > 60) {
      const gap = (a.dist - b.dist) / HORSE_LEN;
      line ||= once('200', gap < 0.8 ? `最後二百米！${name(a)} 同 ${name(b)} 鬥得難分難解！` : `最後二百米，${name(a)} 拋離對手，${gap.toFixed(0)}個馬位！`);
    }
    if (lastLeader && a !== lastLeader && t > 8 && rem > 30 && t - lastLineT > 2) {
      line ||= `${name(a)} 搶到領先！`;
    }
    lastLeader = a;

    if (sim.finishOrder.length >= 1) {
      const [w, s] = sim.finishOrder;
      const close = s && (s.finishTime - w.finishTime) * (race.distance / w.finishTime) < HORSE_LEN * 0.3;
      if (s || sim.finishOrder.length === sim.horses.length) {
        line ||= once('win', close ? `衝線！${name(w)} 同 ${name(s)} 幾乎同時過終點，要睇攝影結果！` : `${name(w)} 勝出！${race.horses[w.idx].jockey} 策騎有功！`);
      }
    }
    if (line) lastLineT = t;
    return line;
  };
}
