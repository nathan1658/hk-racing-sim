import * as THREE from 'three';
import { makeRng } from '../core/rng.js';
import { TRACK, railFrame, trackPos } from '../core/track.js';
import { grassTexture, asphaltTexture, labelTexture, glowTexture, canvas, tex } from './textures.js';

const { P, WIDTH, FINISH, L, R } = TRACK;

// Ribbon following the course between two lanes.
function stripGeometry(w0, w1, y = 0, step = 2, uvScale = 8) {
  const n = Math.ceil(P / step);
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const p = (i / n) * P;
    const f = railFrame(p);
    for (const w of [w0, w1]) {
      pos.push(f.x + f.nx * w, y, f.z + f.nz * w);
      uv.push(p / uvScale, w / uvScale);
    }
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Adds a world-space mowing checkerboard to a standard material.
function mowPattern(mat, cell = 14, strength = 0.14) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec2 q = vec2(vWPos.x + vWPos.z, vWPos.x - vWPos.z) / ${cell.toFixed(1)};
        float chk = mod(floor(q.x) + floor(q.y), 2.0);
        diffuseColor.rgb *= 1.0 - ${strength.toFixed(3)} + chk * ${(strength * 2).toFixed(3)};`,
      );
  };
}

export function createCourse(scene, quality) {
  const group = new THREE.Group();
  scene.add(group);
  const rng = makeRng(5);

  // Surroundings
  const asph = asphaltTexture();
  asph.repeat.set(300, 300);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ map: asph, roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  ground.receiveShadow = true;
  group.add(ground);

  // Racing surface
  const grass = grassTexture();
  const turfMat = new THREE.MeshStandardMaterial({ map: grass, roughness: 0.92, color: 0xd8f0c8 });
  mowPattern(turfMat);
  const turf = new THREE.Mesh(stripGeometry(-1, WIDTH + 1.5, 0, 2, 6), turfMat);
  turf.receiveShadow = true;
  group.add(turf);
  // A slightly worn, sandy verge outside the outer rail
  const verge = new THREE.Mesh(stripGeometry(WIDTH + 1.5, WIDTH + 9, -0.02, 4, 4), new THREE.MeshStandardMaterial({ color: 0x5b5a46, roughness: 1 }));
  verge.receiveShadow = true;
  group.add(verge);

  // Infield grass with lit sports pitches (跑馬地's infield is full of football pitches)
  const shape = new THREE.Shape();
  for (let i = 0; i <= 400; i++) {
    const f = railFrame((i / 400) * P);
    const x = f.x - f.nx * 1, z = f.z - f.nz * 1;
    i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z);
  }
  const infieldGrass = grassTexture([46, 96, 40]);
  infieldGrass.repeat.set(0.12, 0.12);
  const infieldMat = new THREE.MeshStandardMaterial({ map: infieldGrass, roughness: 0.95, color: 0xb8d0b0 });
  mowPattern(infieldMat, 20, 0.08);
  const infield = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), infieldMat);
  infield.rotation.x = -Math.PI / 2;
  infield.position.y = -0.01;
  infield.receiveShadow = true;
  group.add(infield);
  const pitchTex = pitchTexture();
  for (const [x, z] of [[-150, 20], [0, 25], [150, 20]]) {
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(100, 64), new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.85 }));
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.set(x, 0.01, z);
    pitch.receiveShadow = true;
    group.add(pitch);
  }

  addRails(group);
  addMarkers(group);
  addWinningPost(group);
  const stand = addGrandstand(group, rng, quality);
  const screen = addBigScreen(group);
  const lights = addFloodlights(scene, group, quality);

  return { group, stand, screen, lights };
}

function pitchTexture() {
  const [c, g] = canvas(1000, 640);
  g.fillStyle = '#2f6f33';
  g.fillRect(0, 0, 1000, 640);
  for (let x = 0; x < 1000; x += 100) {
    g.fillStyle = (x / 100) % 2 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.04)';
    g.fillRect(x, 0, 100, 640);
  }
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 5;
  g.strokeRect(20, 20, 960, 600);
  g.beginPath(); g.moveTo(500, 20); g.lineTo(500, 620); g.stroke();
  g.beginPath(); g.arc(500, 320, 90, 0, 7); g.stroke();
  g.strokeRect(20, 170, 160, 300);
  g.strokeRect(820, 170, 160, 300);
  g.strokeRect(20, 250, 55, 140);
  g.strokeRect(925, 250, 55, 140);
  return tex(c);
}

function addRails(group) {
  const railMat = new THREE.MeshStandardMaterial({ color: 0xcfd3d6, roughness: 0.55, metalness: 0.05 });
  for (const w of [-0.2, WIDTH + 0.4]) {
    const pts = [];
    for (let i = 0; i < 600; i++) {
      const f = railFrame((i / 600) * P);
      pts.push(new THREE.Vector3(f.x + f.nx * w, 1.05, f.z + f.nz * w));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const top = new THREE.Mesh(new THREE.TubeGeometry(curve, 1200, 0.09, 8, true), railMat);
    top.castShadow = true;
    group.add(top);
    const n = Math.floor(P / 3);
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.05, 0.08), railMat, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const f = railFrame(i * 3);
      m.makeTranslation(f.x + f.nx * (w + (w < 0 ? -0.15 : 0.15)), 0.52, f.z + f.nz * (w + (w < 0 ? -0.15 : 0.15)));
      posts.setMatrixAt(i, m);
    }
    posts.castShadow = true;
    group.add(posts);
  }
}

// Distance-to-go poles along the inner rail; red at every 400 m like the "400 m" pole.
function addMarkers(group) {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  for (let d = 100; d <= 1800; d += 100) {
    const f = railFrame(FINISH - d);
    const red = d % 400 === 0;
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.8),
      new THREE.MeshStandardMaterial({
        map: labelTexture(String(d), { bg: red ? '#d0102a' : '#ffffff', fg: red ? '#fff' : '#111', w: 192, h: 128, font: 70 }),
        emissive: 0xffffff, emissiveIntensity: 0.25, side: THREE.DoubleSide,
      }),
    );
    emissiveFromMap(plate.material);
    const x = f.x - f.nx * 1.2, z = f.z - f.nz * 1.2;
    plate.position.set(x, 2.3, z);
    plate.rotation.y = Math.atan2(f.nx, f.nz);
    group.add(plate);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2), poleMat);
    pole.position.set(x, 1, z);
    group.add(pole);
  }
}

function emissiveFromMap(mat) {
  mat.emissiveMap = mat.map;
}

function addWinningPost(group) {
  const f = railFrame(FINISH);
  const heading = Math.atan2(f.nx, f.nz);
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  // Disc sign on the outer (grandstand) side, facing the stands and cameras.
  const [c, g] = canvas(256, 256);
  // White disc, red rim, black sighting line aligned with the finish.
  g.fillStyle = '#d0102a'; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(128, 128, 106, 0, 7); g.fill();
  g.fillStyle = '#111'; g.fillRect(123, 22, 10, 212);
  const discTex = tex(c);
  for (const w of [WIDTH + 1.6, -1.6]) {
    const x = f.x + f.nx * w, z = f.z + f.nz * w;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.5), white);
    pole.position.set(x, 2.25, z);
    pole.castShadow = true;
    group.add(pole);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 40),
      new THREE.MeshStandardMaterial({ map: discTex, emissiveMap: discTex, emissive: 0xffffff, emissiveIntensity: 0.35, side: THREE.DoubleSide }),
    );
    disc.position.set(x, 5.2, z);
    disc.rotation.y = heading;
    group.add(disc);
  }
  // Painted line across the course so viewers can see the finish.
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.22, WIDTH + 2), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3 }));
  line.rotation.x = -Math.PI / 2;
  line.rotation.z = 0;
  line.position.set(f.x, 0.02, f.z + (WIDTH / 2));
  group.add(line);
  // Judge's box on the outer side just past the post.
  const box = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshStandardMaterial({ color: 0x0b3d2e, roughness: 0.6 }));
  box.position.set(f.x - 4, 7, f.z + f.nz * (WIDTH + 5));
  group.add(box);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.8, 1.2), toneMapped: false }));
  win.position.set(box.position.x, 7.5, box.position.z - 1.51);
  win.rotation.y = Math.PI;
  group.add(win);
  const stilts = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.5, 0.4), white);
  stilts.position.set(box.position.x, 2.75, box.position.z);
  group.add(stilts);
}

// Multi-tier grandstand along the home straight with an animated crowd.
function addGrandstand(group, rng, quality) {
  const z0 = R + WIDTH + 12; // front of stand
  const x0 = -300, x1 = 230, len = x1 - x0, cx = (x0 + x1) / 2;
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8f9499, roughness: 0.85 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x1f5e45, roughness: 0.7 });
  const tiers = [
    { y: 0.8, z: z0 + 2, rows: 12, rise: 0.55, depth: 0.85 },
    { y: 14, z: z0 + 12, rows: 12, rise: 0.6, depth: 0.85 },
    { y: 28, z: z0 + 22, rows: 11, rise: 0.65, depth: 0.85 },
  ];
  const seatsPos = [];
  for (const t of tiers) {
    for (let r = 0; r < t.rows; r++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(len, t.rise, t.depth), r % 2 ? seatMat : concrete);
      step.position.set(cx, t.y + r * t.rise, t.z + r * t.depth);
      step.receiveShadow = true;
      group.add(step);
      seatsPos.push([t.y + r * t.rise + t.rise / 2, t.z + r * t.depth]);
    }
    // fascia below each tier with a warm light strip
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(len, 2.2, 0.6), concrete);
    fascia.position.set(cx, t.y - 1.1, t.z - 0.5);
    group.add(fascia);
    if (t.y > 1) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.25, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1.6), toneMapped: false }));
      strip.position.set(cx, t.y - 1.9, t.z - 0.85);
      group.add(strip);
    }
  }
  // Rear building with glazed hospitality boxes
  const back = new THREE.Mesh(new THREE.BoxGeometry(len, 46, 10), concrete);
  back.position.set(cx, 23, z0 + 38);
  group.add(back);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(len - 10, 5),
    new THREE.MeshStandardMaterial({ color: 0x223040, emissive: 0xffd9a8, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.6 }),
  );
  for (const y of [11, 25, 39]) {
    const gl = glass.clone();
    gl.position.set(cx, y + 2.5, z0 + 32.9);
    gl.rotation.y = Math.PI;
    group.add(gl);
  }
  // Cantilever roof and columns
  const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 6, 1.2, 40), new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.6 }));
  roof.position.set(cx, 47, z0 + 16);
  roof.castShadow = false;
  group.add(roof);
  const under = new THREE.Mesh(new THREE.PlaneGeometry(len, 38), new THREE.MeshStandardMaterial({ color: 0x404650, emissive: 0xfff0d8, emissiveIntensity: 0.25 }));
  under.rotation.x = Math.PI / 2;
  under.position.set(cx, 46.3, z0 + 16);
  group.add(under);
  for (let x = x0 + 10; x < x1; x += 40) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(1, 47, 1), concrete);
    col.position.set(x, 23.5, z0 + 34);
    group.add(col);
  }

  // Crowd: instanced people on the tiers and along the rail on the apron.
  const people = [];
  for (const [y, z] of seatsPos) {
    for (let x = x0 + 2; x < x1 - 2; x += 1.1) if (rng.next() < 0.8 * quality.crowd) people.push([x + rng.range(-0.2, 0.2), y, z + 0.1]);
  }
  for (let x = -200; x < 150; x += 0.8) {
    if (rng.next() < 0.8 * quality.crowd) people.push([x, 0, R + WIDTH + 2.5 + rng.range(0, 3)]);
  }
  const bodyGeo = new THREE.CapsuleGeometry(0.2, 0.7, 3, 6);
  bodyGeo.translate(0, 0.6, 0);
  const crowdMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  const uniforms = { uTime: { value: 0 }, uExcite: { value: 0 } };
  crowdMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uExcite = uniforms.uExcite;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uExcite;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 3.1;
        float jump = max(0.0, sin(uTime * (6.0 + fract(ph) * 4.0) + ph)) * 0.35 * uExcite;
        transformed.y += jump + sin(uTime * 1.3 + ph) * 0.02;`,
      );
  };
  const crowd = new THREE.InstancedMesh(bodyGeo, crowdMat, people.length);
  const headGeo = new THREE.SphereGeometry(0.15, 8, 6);
  headGeo.translate(0, 1.42, 0);
  const heads = new THREE.InstancedMesh(headGeo, crowdMat, people.length);
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  const shirts = ['#e8e8e8', '#1b1b1b', '#2d4f8a', '#b03030', '#e0c070', '#3a7a4a', '#8a5a9a', '#f0a040', '#607080', '#ffffff'];
  const hair = ['#1a1410', '#2a2018', '#3a3530', '#c9a27a', '#d8b894'];
  people.forEach((p, i) => {
    m.makeTranslation(p[0], p[1], p[2]);
    crowd.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
    col.set(shirts[i % shirts.length]).multiplyScalar(rng.range(0.6, 1));
    crowd.setColorAt(i, col);
    heads.setColorAt(i, col.set(rng.pick(hair)));
  });
  group.add(crowd, heads);

  return {
    uniforms,
    update(t, excite) {
      uniforms.uTime.value = t;
      uniforms.uExcite.value += (excite - uniforms.uExcite.value) * 0.05;
    },
  };
}

// Giant infield video screen facing the stands (live feed / odds board).
function addBigScreen(group) {
  const W = 46, H = 13;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 2, H + 2, 1.2), new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.5, metalness: 0.4 }));
  const pos = new THREE.Vector3(-30, 14, -38);
  frame.position.copy(pos);
  group.add(frame);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.92, 0.92, 0.92), toneMapped: false });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  panel.position.set(pos.x, pos.y, pos.z + 0.62);
  group.add(panel);
  for (const dx of [-W / 3, W / 3]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, pos.y - H / 2, 1.2), frame.material);
    leg.position.set(pos.x + dx, (pos.y - H / 2) / 2, pos.z);
    group.add(leg);
  }
  return { mat, panel, aspect: W / H };
}

// Floodlight towers with real spot lights, glowing lamp heads and faint beams in the haze.
function addFloodlights(scene, group, quality) {
  const { R: r } = TRACK;
  const out = r + WIDTH + 14;
  const spots = [
    [-170, out], [0, out], [170, out],
    [-170, -out], [0, -out], [170, -out],
    [-(L / 2 + out), 0], [L / 2 + out, 0],
    [-(L / 2 + out * 0.72), out * 0.72], [L / 2 + out * 0.72, -out * 0.72],
  ];
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.6, metalness: 0.5 });
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8.2, 7), toneMapped: false });
  const glowTex = glowTexture();
  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uOpacity: { value: quality.beams } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uOpacity; varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(abs(dot(vN, vV)), 2.0); float a = pow(clamp(vY, 0.0, 1.0), 2.2) * edge * uOpacity; gl_FragColor = vec4(1.0, 0.95, 0.85, a); }`,
  });
  const lights = [];
  const heads = [];
  spots.forEach(([x, z], i) => {
    const h = 42;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.8, h, 10), poleMat);
    pole.position.set(x, h / 2, z);
    group.add(pole);
    // Aim at the nearest point on the track centre-line.
    const aim = nearestTrackPoint(x, z);
    const head = new THREE.Group();
    head.position.set(x, h + 2, z);
    head.lookAt(aim.x, 0, aim.z);
    group.add(head);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 0.6), poleMat);
    head.add(frame);
    const lamps = new THREE.InstancedMesh(new THREE.CircleGeometry(0.42, 12), lampMat, 18);
    const mm = new THREE.Matrix4();
    for (let k = 0; k < 18; k++) {
      mm.makeTranslation(-3.6 + (k % 6) * 1.45, -1.4 + Math.floor(k / 6) * 1.4, 0.32);
      lamps.setMatrixAt(k, mm);
    }
    head.add(lamps);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1d8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
    glow.scale.set(26, 26, 1);
    glow.position.set(0, 0, 1.2);
    head.add(glow);
    heads.push(head);

    if (quality.beams > 0) {
      const d = new THREE.Vector3(aim.x - x, -h, aim.z - z);
      const len = d.length() * 1.05;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 26, len, 24, 1, true), beamMat);
      beam.geometry.translate(0, -len / 2, 0);
      beam.position.copy(head.position);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), d.normalize());
      group.add(beam);
    }
    if (i < quality.spotLights) {
      const s = new THREE.SpotLight(0xfff0dc, 3600, 0, 0.66, 0.8, 1.6);
      // Sit the light a few metres in front of the lamp head: a light inside its own
      // fixture blows past half-float range and bloom smears the Inf across the frame.
      s.position.copy(head.position).lerp(new THREE.Vector3(aim.x, 0, aim.z), 4 / head.position.distanceTo(new THREE.Vector3(aim.x, 0, aim.z)));
      s.target.position.set(aim.x, 0, aim.z);
      scene.add(s, s.target);
      lights.push(s);
    }
  });
  return { lights, heads };
}

function nearestTrackPoint(x, z) {
  let best = null, bd = Infinity;
  for (let p = 0; p < P; p += 10) {
    const q = trackPos(p, WIDTH / 2);
    const d = (q.x - x) ** 2 + (q.z - z) ** 2;
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

// Starting stalls across the course at rail distance p. Doors spring open; later the
// tractor tows the whole unit off the track.
export function createGate(scene, p, runners) {
  const STALL = 1.35;
  const g = new THREE.Group();
  const place = (w) => {
    const f = trackPos(p, w);
    g.position.set(f.x, 0, f.z);
    g.rotation.y = f.heading;
  };
  place(0);
  scene.add(g);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2d6b4f, roughness: 0.5, metalness: 0.4 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5, metalness: 0.3 });
  // Local frame: +z = racing direction, +x = outward from the rail. Stall i is centred on
  // the lane the sim gives draw i+1 (1.2 m + i × STALL); doors sit just past the start line.
  const lane = (i) => 1.2 + i * STALL;
  const x0 = lane(0) - STALL / 2, x1 = lane(runners - 1) + STALL / 2;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.4, 0.4, 3.6), frameMat);
  beam.position.set((x0 + x1) / 2, 3.4, -1.4);
  g.add(beam);
  for (let i = 0; i <= runners; i++) {
    const div = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, 3.6), frameMat);
    div.position.set(x0 + i * STALL, 1.25, -1.4);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.4, 0.1), frameMat);
    post.position.set(x0 + i * STALL, 1.7, 0.4);
    g.add(post);
    div.castShadow = true;
    g.add(div);
  }
  const doors = [];
  for (let i = 0; i < runners; i++) {
    const cx = lane(i);
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(cx + (s * STALL) / 2, 0, 0.4);
      const door = new THREE.Mesh(new THREE.BoxGeometry(STALL / 2 - 0.04, 1.2, 0.06), doorMat);
      door.position.set((-s * STALL) / 4, 1.05, 0);
      door.castShadow = true;
      hinge.add(door);
      g.add(hinge);
      doors.push({ hinge, s });
    }
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), new THREE.MeshBasicMaterial({ map: labelTexture(String(i + 1), { bg: '#fff', fg: '#0b3d2e' }) }));
    plate.position.set(cx, 3.4, 0.42);
    g.add(plate);
  }
  let openT = -1, towT = -1;
  return {
    group: g,
    open() { openT = 0; },
    tow() { if (towT < 0) towT = 0; },
    update(dt) {
      if (openT >= 0 && openT < 1) {
        openT = Math.min(1, openT + dt * 5);
        const a = (1 - (1 - openT) ** 3) * 1.45;
        for (const d of doors) d.hinge.rotation.y = d.s * a;
      }
      if (towT >= 0 && g.visible) {
        towT += dt;
        const k = Math.min(1, towT / 6);
        place(WIDTH * 1.2 * k * k);
        if (k >= 1) g.visible = false;
      }
    },
    dispose() { scene.remove(g); },
  };
}
