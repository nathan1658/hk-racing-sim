import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TRACK, trackPos, segmentOf } from '../core/track.js';

const { WIDTH, FINISH } = TRACK;
export const SHOTS = {
  auto: '自動導播',
  broadcast: '轉播鏡頭',
  follow: '跟馬鏡頭',
  aerial: '航拍',
  finish: '終點鏡頭',
  free: '自由視角',
};

// Computes a camera placement {pos, look, fov} for a named shot from the race state.
function shotPose(name, ctx) {
  const { lead, pack, focus, gateP } = ctx;
  const P = (p, w, y) => { const q = trackPos(p, w); return new THREE.Vector3(q.x, y, q.z); };
  switch (name) {
    case 'gate':
      // Front quarter from the infield: stall doors and heads, grandstand behind.
      return { pos: P(gateP + 26, -16, 5), look: P(gateP - 1, 9, 1.3), fov: 36 };
    case 'broadcast': {
      const p = pack.p;
      return { pos: P(p + 4, WIDTH + 44, 13), look: P(p + 3, 4 + pack.spread * 0.3, 1.3), fov: 13 + Math.min(14, pack.len * 0.4) };
    }
    case 'headon': {
      // Long lens down the straight from just past the post (p is unwrapped, so work from rem).
      const p = lead.p;
      return { pos: P(p + Math.min(110, lead.rem + 50), WIDTH - 2, 4.5), look: P(p - 6, 6, 1.4), fov: 13 };
    }
    case 'finish':
      // Infield side looking out across the line, grandstand and crowd behind.
      return { pos: P(FINISH + 12, -24, 7), look: P(FINISH - 24, 10, 1.0), fov: 34 };
    case 'follow': {
      const q = trackPos(focus.p - 11, focus.w + 2);
      const r = trackPos(focus.p + 6, focus.w);
      return { pos: new THREE.Vector3(q.x, 3.8, q.z), look: new THREE.Vector3(r.x, 1.6, r.z), fov: 50 };
    }
    case 'aerial':
      // From the infield side so the camera never backs into the towers outside the course.
      return { pos: P(pack.p - 70, -45, 75), look: P(pack.p + 25, 8, 0), fov: 38 };
  }
  return null;
}

// Idle hero shot: from the infield across the home straight to the stands and skyline.
const HERO = { target: new THREE.Vector3(-60, 10, 100), radius: 165, height: 40, sweep: 0.75 };

export function createDirector(camera, dom) {
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 15;
  controls.maxDistance = 420; // stay inside the ring of towers
  controls.target.copy(HERO.target);
  let idleT = 0;
  let userOrbit = false; // once the viewer drags, the idle sweep stops
  controls.addEventListener('start', () => { userOrbit = true; });

  const cur = { pos: camera.position.clone(), look: controls.target.clone() };
  const dir = {
    mode: 'auto',
    shot: 'free',
    cutAt: 0,
    controls,
    setMode(m) {
      dir.mode = m;
      controls.enabled = m === 'free';
      dir.cutAt = -1; // force a cut
    },
    // Screen camera shows the TV feed on the infield big screen.
    screenShot(ctx) { return shotPose(ctx.phase === 'running' ? 'broadcast' : 'gate', ctx); },
    choose(ctx) {
      if (dir.mode !== 'auto') return dir.mode;
      if (ctx.phase === 'gate') return 'gate';
      if (ctx.phase === 'finished') return ctx.sinceFinish < 4 ? 'finish' : 'aerial';
      const rem = ctx.lead.rem;
      if (ctx.t < 5) return 'gate';
      if (rem < 90) return 'finish';
      // Head-on down the home straight, like the classic HK broadcast angle.
      if (rem < 360 && segmentOf(ctx.lead.p) === 0) return 'headon';
      return 'broadcast';
    },
    update(ctx, dt) {
      if (ctx.phase === 'idle' || dir.mode === 'free') {
        controls.enabled = true;
        if (ctx.phase === 'idle' && !userOrbit) {
          idleT += dt;
          const a = Math.PI + HERO.sweep * Math.sin(idleT * 0.05);
          camera.position.set(HERO.target.x + Math.sin(a) * HERO.radius, HERO.height, HERO.target.z + Math.cos(a) * HERO.radius);
          controls.target.copy(HERO.target);
        }
        controls.update(dt);
        cur.pos.copy(camera.position);
        cur.look.copy(controls.target);
        return;
      }
      controls.enabled = false;
      const shot = dir.choose(ctx);
      const pose = shotPose(shot, ctx);
      const cut = shot !== dir.shot || dir.cutAt < 0;
      dir.shot = shot;
      dir.cutAt = ctx.t;
      const k = cut ? 1 : 1 - Math.exp(-dt * (shot === 'follow' ? 6 : 3));
      cur.pos.lerp(pose.pos, k);
      cur.look.lerp(pose.look, k);
      camera.position.copy(cur.pos);
      camera.lookAt(cur.look);
      // Shots are framed for 16:9; on portrait screens keep the same horizontal coverage.
      const fov = camera.aspect < 1.4 ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(pose.fov) / 2) * (1.4 / camera.aspect))) : pose.fov;
      camera.fov += (Math.min(fov, 75) - camera.fov) * (cut ? 1 : k);
      camera.updateProjectionMatrix();
    },
    placeScreenCamera(cam, ctx) {
      const pose = dir.screenShot(ctx);
      if (!pose) return;
      cam.position.copy(pose.pos);
      cam.lookAt(pose.look);
      cam.fov = pose.fov;
      cam.updateProjectionMatrix();
    },
    toOverview() {
      userOrbit = false;
      idleT = 0;
      controls.target.copy(HERO.target);
      camera.position.set(HERO.target.x, HERO.height, HERO.target.z - HERO.radius);
      camera.fov = 45;
      camera.updateProjectionMatrix();
    },
  };
  return dir;
}
