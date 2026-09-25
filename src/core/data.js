import { makeRng } from './rng.js';

// All names are fictional.
const HORSE_NAMES = [
  '金鑽快車', '飛躍精英', '好運連連', '閃電神駒', '快樂精靈', '龍騰四海', '星河璀璨', '喜聚滿堂',
  '至尊寶駒', '猛龍過江', '風之驕子', '紅運當頭', '常勝將軍', '醒目勇士', '如意吉祥', '旺角之星',
  '爭分奪秒', '銀河戰艦', '開心精彩', '皇者風範', '魅力四射', '天天向上', '勁風威龍', '步步高陞',
  '翡翠明珠', '雷霆萬鈞', '萬眾矚目', '福星高照', '疾風迅雷', '鴻運騰飛', '東方之珠', '赤兔再臨',
  '維港煙花', '太平山頂', '金紫荊花', '獅子山下', '青馬大橋', '添福添壽', '一馬當先', '馬到功成',
];
const JOCKEYS = [
  '艾勵高', '施保羅', '韋禮信', '陳家駿', '黃子晴', '馬浩然', '周偉倫', '何俊賢',
  '麥卓霖', '羅家寶', '葉志強', '潘德明', '賀文迪', '柏嘉樂', '巫鵬飛', '田泰安',
];
const TRAINERS = [
  '蘇國強', '方嘉朗', '丁冠文', '呂志健', '姚本仁', '沈家豪', '文嘉輝', '賀賢達', '羅富全', '黎昭昇',
];
// 跑馬地 races are traditionally named after Hong Kong streets.
const RACE_NAMES = [
  '禮頓道讓賽', '黃泥涌道讓賽', '摩理臣山道讓賽', '成和道讓賽', '藍塘道讓賽', '樂活道讓賽',
  '司徒拔道讓賽', '雲地利道讓賽', '景光街讓賽', '奕蔭街讓賽', '山村道讓賽', '毓秀街讓賽',
];
const CLASSES = [
  { name: '第五班', rating: [20, 40] },
  { name: '第四班', rating: [35, 60] },
  { name: '第三班', rating: [55, 80] },
  { name: '第二班', rating: [75, 100] },
];
export const DISTANCES = [1000, 1200, 1650, 1800];
const SILK_COLORS = [
  '#c8102e', '#003da5', '#ffd100', '#00843d', '#ffffff', '#111111', '#ff6a13',
  '#7a1fa2', '#00a3e0', '#f7a8b8', '#6d2c19', '#9aa0a6', '#004225', '#ff2d8a',
];
const PATTERNS = ['solid', 'hoops', 'sash', 'halves', 'diamond', 'stripes', 'spots', 'cross'];
export const COATS = [
  { name: '棗', body: [0.2, 0.07, 0.025], dark: [0.02, 0.012, 0.01], light: [0.5, 0.45, 0.4] },
  { name: '栗', body: [0.38, 0.12, 0.04], dark: [0.18, 0.05, 0.02], light: [0.6, 0.45, 0.35] },
  { name: '深棕', body: [0.08, 0.035, 0.016], dark: [0.02, 0.012, 0.01], light: [0.35, 0.3, 0.28] },
  { name: '灰', body: [0.42, 0.42, 0.42], dark: [0.12, 0.12, 0.13], light: [0.7, 0.7, 0.7] },
  { name: '黑', body: [0.025, 0.022, 0.02], dark: [0.01, 0.01, 0.01], light: [0.3, 0.28, 0.26] },
];
const STYLES = ['領放', '跟前', '居中', '後上'];

export function makeSilks(rng) {
  const [a, b] = rng.shuffle(SILK_COLORS);
  return { body: a, trim: b, cap: rng.next() < 0.5 ? a : b, pattern: rng.pick(PATTERNS) };
}

// A race meeting card. Deterministic for a given (seed, raceNo).
export function makeRace(seed, raceNo) {
  const rng = makeRng(seed * 7919 + raceNo * 104729);
  const cls = rng.pick(CLASSES);
  const distance = rng.pick(DISTANCES);
  const runners = 12;
  const names = rng.shuffle(HORSE_NAMES).slice(0, runners);
  const jockeys = rng.shuffle(JOCKEYS).slice(0, runners);
  const draws = rng.shuffle([...Array(runners)].map((_, i) => i + 1));
  const horses = names.map((name, i) => {
    const rating = rng.int(cls.rating[0], cls.rating[1]);
    return {
      name,
      rating,
      jockey: jockeys[i],
      trainer: rng.pick(TRAINERS),
      draw: draws[i],
      age: rng.int(3, 8),
      coat: rng.int(0, COATS.length - 1),
      style: rng.int(0, STYLES.length - 1),
      stamina: rng.range(0.8, 1.2), // >1 prefers further
      silks: makeSilks(rng),
      form: [...Array(6)].map(() => rng.int(1, 12)).join('/'),
    };
  });
  // Handicap: top-rated carries 133 lb, then 1 lb per rating point, floor 113.
  horses.sort((a, b) => b.rating - a.rating);
  const top = horses[0].rating;
  horses.forEach((h, i) => {
    h.no = i + 1;
    h.weight = Math.max(113, 133 - (top - h.rating));
  });
  return {
    raceNo,
    seed,
    name: rng.pick(RACE_NAMES),
    className: cls.name,
    distance,
    going: rng.pick(['好地', '好地', '好地至快地', '好地至黏地']),
    course: '草地 "C" 賽道',
    horses,
  };
}

export const styleName = (s) => STYLES[s];
