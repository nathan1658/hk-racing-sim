import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeRng } from '../core/rng.js';
import { TRACK } from '../core/track.js';
import { windowTexture, neonTexture } from './textures.js';

export function createRenderer(container, quality) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);
  return renderer;
}

export function createComposer(renderer, scene, camera, quality) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality.msaa });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.5, 0.5, 1.25);
  bloom.enabled = quality.bloom;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return { composer, renderPass, bloom };
}

// Night sky: deep navy zenith, sodium-orange city glow on the horizon, stars.
export function createSky(scene) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {},
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 zen = vec3(0.004, 0.007, 0.02);
        vec3 mid = vec3(0.02, 0.03, 0.065);
        vec3 glow = vec3(0.22, 0.12, 0.07);
        vec3 c = mix(mid, zen, smoothstep(0.05, 0.6, h));
        c += glow * exp(-max(h, 0.0) * 18.0) * 0.9;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2600, 32, 16), mat);
  scene.add(sky);

  const rng = makeRng(9);
  const n = 1400;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const th = rng.next() * Math.PI * 2;
    const y = rng.range(0.12, 1);
    const r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(th) * r * 2400, y * 2400, Math.sin(th) * r * 2400], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfd0ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }));
  scene.add(stars);
}

// Ring of dark hills with residential lights (Jardine's Lookout / Mount Cameron feel).
export function createHills(scene) {
  const rng = makeRng(21);
  const seg = 180;
  const pos = [], idx = [];
  const ridge = (a) =>
    120 + 110 * Math.max(0, Math.sin(a - 0.4)) + 60 * Math.sin(a * 3 + 1) + 35 * Math.sin(a * 7 + 2) + 18 * Math.sin(a * 13);
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const h = Math.max(40, ridge(a));
    const c = Math.cos(a), s = Math.sin(a);
    pos.push(c * 900, -5, s * 900 * 0.8, c * 1300, h, s * 1300 * 0.8, c * 1700, h * 0.6, s * 1700 * 0.8);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 3, b = (i + 1) * 3;
    idx.push(a, a + 1, b, b, a + 1, b + 1, a + 1, a + 2, b + 1, b + 1, a + 2, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x06090a, roughness: 1 })));

  // Scattered apartment lights on the slopes.
  const n = 900, lp = new Float32Array(n * 3), lc = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rng.next() * Math.PI * 2;
    const t = rng.range(0.05, 0.7);
    const h = Math.max(40, ridge(a)) * t;
    const r = 900 + 400 * t;
    lp.set([Math.cos(a) * r, h + 2, Math.sin(a) * r * 0.8], i * 3);
    const warm = rng.next() < 0.7;
    lc.set(warm ? [1, 0.75, 0.45] : [0.7, 0.85, 1], i * 3);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
  scene.add(new THREE.Points(lg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false })));
}

const NEON = [
  ['茶餐廳', '#ff3b6b'], ['金行', '#ffd24a'], ['大藥房', '#3bffb0'], ['海鮮酒家', '#ff4a3b'], ['跑馬地', '#4ad8ff'],
  ['當舖', '#ff9b2e'], ['冰室', '#b36bff'], ['珠寶', '#ffd24a'], ['麻雀', '#39ff6a'], ['燒臘', '#ff5a36'],
  ['夜總會', '#ff4ad2'], ['找換', '#4ad8ff'], ['涼茶', '#9cff3b'], ['雲吞麵', '#ffb13b'], ['按摩', '#ff3b8d'],
];

// High-rise ring hugging the course, like the towers that wall in 跑馬地.
export function createCity(scene) {
  const rng = makeRng(77);
  const { L, R, WIDTH } = TRACK;
  const xIn = L / 2 + R + WIDTH + 60, zIn = R + WIDTH + 70;
  const boxes = [];
  const tries = 1400;
  for (let i = 0; i < tries && boxes.length < 320; i++) {
    const x = rng.range(-900, 900), z = rng.range(-620, 620);
    const inCourse = Math.abs(x) < xIn && Math.abs(z) < zIn;
    const inStands = z > 100 && z < 230 && Math.abs(x) < 360;
    // leave the far side open so the hills read as a silhouette behind the back straight
    if (inCourse || inStands) continue;
    const d = Math.hypot(x / 1.3, z);
    if (d > 760) continue;
    const w = rng.range(16, 34), dz = rng.range(16, 34);
    if (boxes.some((b) => Math.abs(b.x - x) < (b.w + w) / 2 + 4 && Math.abs(b.z - z) < (b.d + dz) / 2 + 4)) continue;
    const near = 1 - Math.min(1, (d - 250) / 500);
    const h = rng.range(35, 70) + rng.next() ** 2 * 150 * (0.4 + near);
    boxes.push({ x, z, w, d: dz, h, u: rng.next(), v: rng.next() });
  }

  const pos = [], nrm = [], uv = [], idx = [];
  const WIN = 3.2; // metres per window column / floor in texture space
  const face = (o, a, b, n, uw, vh, u0, v0) => {
    const base = pos.length / 3;
    const verts = [o, [o[0] + a[0], o[1] + a[1], o[2] + a[2]], [o[0] + a[0] + b[0], o[1] + a[1] + b[1], o[2] + a[2] + b[2]], [o[0] + b[0], o[1] + b[1], o[2] + b[2]]];
    for (const v of verts) { pos.push(...v); nrm.push(...n); }
    uv.push(u0, v0, u0 + uw, v0, u0 + uw, v0 + vh, u0, v0 + vh);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (const b of boxes) {
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
    const uW = b.w / (WIN * 16), uD = b.d / (WIN * 16), vH = b.h / (WIN * 64);
    face([x0, 0, z1], [b.w, 0, 0], [0, b.h, 0], [0, 0, 1], uW, vH, b.u, b.v);
    face([x1, 0, z0], [-b.w, 0, 0], [0, b.h, 0], [0, 0, -1], uW, vH, b.u + 0.3, b.v);
    face([x1, 0, z1], [0, 0, -b.d], [0, b.h, 0], [1, 0, 0], uD, vH, b.u + 0.5, b.v);
    face([x0, 0, z0], [0, 0, b.d], [0, b.h, 0], [-1, 0, 0], uD, vH, b.u + 0.7, b.v);
    face([x0, b.h, z1], [b.w, 0, 0], [0, 0, -b.d], [0, 1, 0], 0.001, 0.001, 0.001, 0.001);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const { map, emissiveMap } = windowTexture();
  const mat = new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.6, metalness: 0.2 });
  const city = new THREE.Mesh(g, mat);
  scene.add(city);

  // Rooftop aircraft-warning lights on the tallest towers.
  const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.2, 0.15), toneMapped: false });
  const beacons = [];
  for (const b of boxes.filter((b) => b.h > 130)) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), red);
    m.position.set(b.x, b.h + 1.5, b.z);
    scene.add(m);
    beacons.push(m);
  }

  // Neon signs on facades that face the course.
  const signs = [];
  const facing = boxes.filter((b) => Math.hypot(b.x / 1.4, b.z) < 520).slice(0, 40);
  facing.forEach((b, i) => {
    const [text, color] = NEON[i % NEON.length];
    const vertical = i % 3 !== 0;
    const t = neonTexture(text, color, vertical);
    const aspect = t.image.width / t.image.height;
    const hgt = vertical ? rng.range(12, 22) : rng.range(5, 8);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(hgt * aspect, hgt),
      new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.6, 1.6, 1.6), toneMapped: false, transparent: true, fog: true }),
    );
    // Choose the facade whose normal points most toward the course centre.
    const toC = new THREE.Vector2(-b.x, -b.z).normalize();
    const faces = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    const [nx, nz] = faces.reduce((best, f) => (f[0] * toC.x + f[1] * toC.y > best[0] * toC.x + best[1] * toC.y ? f : best));
    const off = nx !== 0 ? b.w / 2 : b.d / 2;
    m.position.set(b.x + nx * (off + 0.6), rng.range(14, Math.max(16, b.h * 0.5)), b.z + nz * (off + 0.6));
    m.lookAt(m.position.x + nx, m.position.y, m.position.z + nz);
    scene.add(m);
    signs.push({ m, phase: rng.next() * 10, flicker: rng.next() < 0.25 });
  });

  return {
    update(t) {
      for (const s of signs) {
        if (!s.flicker) continue;
        const on = Math.sin(t * 7 + s.phase) + Math.sin(t * 23 + s.phase * 3) > -1.4;
        s.m.material.opacity = on ? 1 : 0.25;
      }
      const blink = Math.sin(t * 2.2) > 0.2;
      for (const b of beacons) b.visible = blink;
    },
  };
}
