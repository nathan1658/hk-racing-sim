import * as THREE from 'three';
import { makeRng } from '../core/rng.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { srgb = true, repeat = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

// Fine grass detail, tileable. Large-scale mowing pattern is added in the turf shader.
export function grassTexture(base = [58, 112, 46]) {
  const [c, g] = canvas(512, 512);
  const rng = makeRng(42);
  g.fillStyle = `rgb(${base})`;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26000; i++) {
    const x = rng.next() * 512, y = rng.next() * 512;
    const l = rng.range(-28, 28);
    g.fillStyle = `rgba(${base[0] + l},${base[1] + l * 1.2},${base[2] + l * 0.6},0.55)`;
    g.fillRect(x, y, 1.2, rng.range(2, 6));
  }
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(40,30,10,${rng.range(0.03, 0.08)})`;
    g.beginPath();
    g.arc(rng.next() * 512, rng.next() * 512, rng.range(4, 20), 0, 7);
    g.fill();
  }
  return tex(c, { repeat: true });
}

export function asphaltTexture() {
  const [c, g] = canvas(256, 256);
  const rng = makeRng(7);
  g.fillStyle = '#2b2d31';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const l = rng.int(20, 70);
    g.fillStyle = `rgba(${l},${l},${l + 4},0.5)`;
    g.fillRect(rng.next() * 256, rng.next() * 256, 1, 1);
  }
  return tex(c, { repeat: true });
}

// Tower facade: grid of windows, some lit warm/cool. Pixel (0,0) is unlit wall (used for roofs).
export function windowTexture(seed = 3) {
  const [c, g] = canvas(512, 1024);
  const [ec, eg] = canvas(512, 1024);
  const rng = makeRng(seed);
  g.fillStyle = '#16181d';
  g.fillRect(0, 0, 512, 1024);
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, 512, 1024);
  const cols = 16, rows = 64;
  const cw = 512 / cols, rh = 1024 / rows;
  const palettes = ['255,214,150', '255,236,200', '200,225,255', '255,190,120', '240,248,255'];
  for (let y = 0; y < rows; y++) {
    const floorLit = rng.next() < 0.5 ? 0.55 : 0.25;
    for (let x = 0; x < cols; x++) {
      const px = x * cw + 3, py = y * rh + 3, w = cw - 6, h = rh - 5;
      g.fillStyle = '#262b33';
      g.fillRect(px, py, w, h);
      if (rng.next() < floorLit) {
        const col = rng.pick(palettes);
        const a = rng.range(0.35, 1);
        g.fillStyle = `rgba(${col},${0.5 + a * 0.5})`;
        g.fillRect(px, py, w, h);
        eg.fillStyle = `rgba(${col},${a})`;
        eg.fillRect(px, py, w, h);
        if (rng.next() < 0.3) {
          // curtains / partial occupancy
          eg.fillStyle = 'rgba(0,0,0,0.6)';
          eg.fillRect(px + rng.next() * w * 0.6, py, w * 0.4, h);
        }
      }
    }
  }
  return { map: tex(c, { repeat: true }), emissiveMap: tex(ec, { repeat: true }) };
}

// Glowing Chinese neon sign on a transparent background.
export function neonTexture(text, color, vertical = false) {
  const n = text.length;
  const [c, g] = vertical ? canvas(160, 140 * n + 40) : canvas(140 * n + 60, 180);
  g.fillStyle = 'rgba(8,6,10,0.85)';
  g.fillRect(0, 0, c.width, c.height);
  g.font = '900 120px "Noto Sans TC", "PingFang TC", "Heiti TC", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.shadowColor = color;
  g.shadowBlur = 24;
  g.strokeRect(10, 10, c.width - 20, c.height - 20);
  g.fillStyle = '#fff';
  for (let pass = 0; pass < 3; pass++) {
    g.shadowBlur = 30 - pass * 10;
    g.fillStyle = pass === 2 ? '#fff8f0' : color;
    if (vertical) [...text].forEach((ch, i) => g.fillText(ch, 80, 90 + i * 140));
    else g.fillText(text, c.width / 2, 95);
  }
  return tex(c);
}

// Racing silks: body pattern texture for the jockey torso (u wraps around the body).
export function silksTexture(s) {
  const [c, g] = canvas(256, 128);
  g.fillStyle = s.body;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = s.trim;
  switch (s.pattern) {
    case 'hoops':
      for (let y = 10; y < 128; y += 36) g.fillRect(0, y, 256, 16);
      break;
    case 'stripes':
      for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 14, 128);
      break;
    case 'halves':
      g.fillRect(128, 0, 128, 128);
      break;
    case 'sash':
      g.save();
      g.translate(64, 64);
      g.rotate(0.7);
      g.fillRect(-120, -14, 240, 28);
      g.restore();
      g.save();
      g.translate(192, 64);
      g.rotate(-0.7);
      g.fillRect(-120, -14, 240, 28);
      g.restore();
      break;
    case 'diamond':
      for (const cx of [64, 192]) {
        g.beginPath();
        g.moveTo(cx, 20); g.lineTo(cx + 36, 64); g.lineTo(cx, 108); g.lineTo(cx - 36, 64);
        g.fill();
      }
      break;
    case 'spots':
      for (let y = 20; y < 128; y += 40) for (let x = 16; x < 256; x += 40) {
        g.beginPath(); g.arc(x + (y % 80 ? 20 : 0), y, 9, 0, 7); g.fill();
      }
      break;
    case 'cross':
      for (const cx of [64, 192]) { g.fillRect(cx - 10, 0, 20, 128); g.fillRect(cx - 50, 50, 100, 20); }
      break;
  }
  return tex(c);
}

// White saddle cloth with a big black number.
export function saddleClothTexture(no) {
  const [c, g] = canvas(256, 192);
  g.fillStyle = '#f4f4f0';
  g.fillRect(0, 0, 256, 192);
  g.fillStyle = '#0b3d2e';
  g.fillRect(0, 0, 256, 18);
  g.fillRect(0, 174, 256, 18);
  g.fillStyle = '#111';
  g.font = '900 130px "Helvetica Neue", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(no), 128, 102);
  return tex(c);
}

// Numbered plate for starting stalls / distance markers.
export function labelTexture(text, { bg = '#fff', fg = '#111', w = 128, h = 128, font = 90 } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `900 ${font}px "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  return tex(c);
}

// Soft radial sprite used for lamp glows and lens flare.
export function glowTexture() {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.15, 'rgba(255,250,235,0.85)');
  grd.addColorStop(0.4, 'rgba(255,235,200,0.25)');
  grd.addColorStop(1, 'rgba(255,230,200,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return tex(c);
}

export { canvas, tex };
