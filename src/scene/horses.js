import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { COATS } from '../core/data.js';
import { trackPos } from '../core/track.js';
import { silksTexture, saddleClothTexture } from './textures.js';

const SCALE = 0.0125;
const NOSE = 135 * SCALE; // model origin → nose, metres
const STRIDE = 7.2; // metres per gallop cycle at racing pace

let template = null;

export async function loadHorseModel(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const mesh = gltf.scene.getObjectByProperty('type', 'Mesh');
  mesh.geometry.computeVertexNormals();
  template = { geometry: mesh.geometry, clip: gltf.animations[0], name: mesh.name };
  return template;
}

function coatGeometry(coat) {
  const g = template.geometry.clone();
  const src = template.geometry.getAttribute('color');
  const dst = new Float32Array(src.count * 3);
  for (let i = 0; i < src.count; i++) {
    const r = src.getX(i);
    const c = r > 0.45 ? coat.light : r > 0.25 ? coat.body : coat.dark;
    dst.set(c, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(dst, 3));
  return g;
}

const horseMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.45, sheen: 0.4, sheenColor: 0x886655 });
const skin = { white: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.7 }), boot: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.35 }) };

// Capsule limb between two points.
function limb(a, b, r, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 4, 8), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  m.castShadow = true;
  return m;
}

function makeJockey(silks) {
  const j = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ map: silksTexture(silks), roughness: 0.35, metalness: 0.05 });
  const sleeve = new THREE.MeshStandardMaterial({ color: silks.trim, roughness: 0.35 });
  const cap = new THREE.MeshStandardMaterial({ color: silks.cap, roughness: 0.25 });
  // Crouched racing position: standing in short stirrups, torso almost flat, head up.
  j.add(limb([0, 1.83, -0.42], [0, 1.95, 0.12], 0.17, body));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), cap);
  head.position.set(0, 2.1, 0.3);
  head.castShadow = true;
  j.add(head);
  const peak = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.1), cap);
  peak.position.set(0, 2.08, 0.43);
  j.add(peak);
  for (const s of [-1, 1]) {
    j.add(limb([s * 0.17, 1.93, 0.08], [s * 0.15, 1.8, 0.35], 0.055, sleeve));
    j.add(limb([s * 0.15, 1.8, 0.35], [s * 0.1, 1.68, 0.62], 0.05, sleeve));
    j.add(limb([s * 0.14, 1.78, -0.36], [s * 0.3, 1.62, 0.0], 0.075, skin.white));
    j.add(limb([s * 0.3, 1.62, 0.0], [s * 0.33, 1.3, -0.2], 0.06, skin.boot));
  }
  return j;
}

export function createRunner(scene, horse) {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(coatGeometry(COATS[horse.coat]), horseMat);
  mesh.name = template.name; // the gallop clip binds by node name
  mesh.scale.setScalar(SCALE);
  mesh.castShadow = true;
  root.add(mesh);

  const rider = makeJockey(horse.silks);
  rider.position.z = -0.1;
  root.add(rider);

  const clothTex = saddleClothTexture(horse.no);
  for (const s of [-1, 1]) {
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.44), new THREE.MeshStandardMaterial({ map: clothTex, roughness: 0.8, side: THREE.DoubleSide }));
    cloth.position.set(s * 0.43, 1.28, -0.32);
    cloth.rotation.y = (s * Math.PI) / 2;
    cloth.rotation.x = 0.05;
    root.add(cloth);
  }
  scene.add(root);

  const mixer = new THREE.AnimationMixer(mesh);
  const action = mixer.clipAction(template.clip);
  action.play();
  const duration = template.clip.duration;
  action.time = Math.random() * duration;
  mixer.update(0);

  const tmp = {};
  let heading = null;
  return {
    no: horse.no,
    root,
    anchor: new THREE.Vector3(),
    update(simHorse, p, dt) {
      const pos = trackPos(p - NOSE, simHorse.w, tmp);
      // Lean the heading into lane changes.
      const drift = simHorse.v > 1 ? Math.atan2(simHorse.latV, simHorse.v) : 0;
      const target = pos.heading + THREE.MathUtils.clamp(drift, -0.25, 0.25);
      if (heading === null) heading = target;
      let d = target - heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      heading += d * Math.min(1, dt * 8);
      root.position.set(pos.x, 0, pos.z);
      root.rotation.y = heading;

      const cyclesPerSec = simHorse.v / STRIDE;
      mixer.update(dt * cyclesPerSec * duration);
      const phase = (action.time / duration) * Math.PI * 2;
      const pace = Math.min(1, simHorse.v / 12);
      rider.position.y = Math.sin(phase * 2 + 0.6) * 0.035 * pace;
      rider.rotation.x = Math.sin(phase * 2) * 0.03 * pace;
      this.anchor.set(pos.x, 2.6, pos.z);
    },
    dispose() {
      scene.remove(root);
      mesh.geometry.dispose();
    },
  };
}

export { NOSE };
