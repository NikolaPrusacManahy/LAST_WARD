// Update 0.9.9 — a teammate in the ward: their whole body (the same model as yours, head and all),
// walking, running, crouching and limping like they are; their name over their head (a mark beside it
// while they talk); their flashlight beam. Hit: sent flying. Down: crawling on the floor, with a revive
// marker over them that shows through walls (who, and the seconds they have left). Taken: their body
// stays where they fell. Escaped: gone.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLAYER_URL } from './playerBody';
import { PlayerClip, choosePlayerClip, injuredClip, localVelocity, playerClipTimeScale, strafeSide } from './playerAnim';
import { THROWN_CLIP } from '../state/caughtSequence';
import { DOWN } from '../state/coopRun';
import { LIGHT, FLASHLIGHT_BEAM } from '../state/lightLevels';
import { PLAYER } from '../state/playerRules';
import type { LiveState } from '../state/coopRun';
import { flashlightCookie } from './textures';

const FADE = 0.2;
const TAG_W = 256;
const TAG_H = 64;
const MARK_W = 256;
const MARK_H = 128;

/** The revive marker: a red cross in a ring, their name, the seconds they have left. */
function drawMark(ctx: CanvasRenderingContext2D, name: string, secs: number) {
  ctx.clearRect(0, 0, MARK_W, MARK_H);
  const cx = MARK_W / 2;
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = '#e0524c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, 34, 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#e0524c';
  ctx.fillRect(cx - 5, 18, 10, 32);
  ctx.fillRect(cx - 16, 29, 32, 10);
  ctx.font = '26px "Special Elite", "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f0e8d0';
  ctx.fillText(`${name}  ${secs}s`, cx, 92);
}

export interface TeammateView {
  root: THREE.Group;
  /** Draw them as `s` says (already smoothed). `talking`: the mark by their name. */
  update(s: LiveState, dt: number, talking: boolean): void;
  /** Where their head is (voice and grunts come from there). */
  head(out: THREE.Vector3): THREE.Vector3;
  dispose(): void;
}

/**
 * Their flashlight. One per possible teammate, made when the run starts and kept: three.js rebuilds every
 * shader when the number of lights changes, so they're never added or removed mid-run, only turned off.
 */
export function createTeamLight(scene: THREE.Scene): THREE.SpotLight {
  const l = new THREE.SpotLight(0xfff1d6, 0, FLASHLIGHT_BEAM.distance * 0.9, 0.6, 0.35, FLASHLIGHT_BEAM.decay);
  l.map = flashlightCookie();
  l.castShadow = false;
  scene.add(l, l.target);
  return l;
}

function drawTag(ctx: CanvasRenderingContext2D, name: string, talking: boolean) {
  ctx.clearRect(0, 0, TAG_W, TAG_H);
  ctx.font = '30px "Special Elite", "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = talking ? '#9fd4ae' : '#d8d2bc';
  ctx.fillText(name, TAG_W / 2, TAG_H / 2);
  if (talking) {
    const w = ctx.measureText(name).width;
    ctx.beginPath();
    ctx.arc(TAG_W / 2 - w / 2 - 16, TAG_H / 2, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

export async function loadTeammate(name: string, light: THREE.SpotLight | null): Promise<TeammateView> {
  const gltf = await new GLTFLoader().loadAsync(PLAYER_URL);
  const model = gltf.scene;
  const root = new THREE.Group();
  root.add(model);
  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    m.castShadow = true; // your flashlight throws their shadow on the wall
    m.receiveShadow = true;
    m.frustumCulled = false;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats as THREE.MeshStandardMaterial[]) {
      mat.metalness = 0;
      if (mat.transparent) {
        mat.transparent = false;
        mat.alphaTest = 0.5;
      }
    }
  });

  const headBone = (() => {
    let hit: THREE.Object3D | undefined;
    model.traverse((o) => {
      if (!hit && /Head$/.test(o.name)) hit = o;
    });
    return hit ?? model;
  })();

  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map<PlayerClip, THREE.AnimationAction>();
  for (const clip of gltf.animations) {
    const a = mixer.clipAction(clip);
    if (clip.name === 'thrown' || clip.name === 'getUp' || clip.name === 'hitFly' || clip.name === 'proneDeath') {
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
    }
    actions.set(clip.name as PlayerClip, a);
  }
  // Same height as you: eyes at eye height.
  actions.get('idle')?.play();
  mixer.update(0);
  model.updateWorldMatrix(true, true);
  const headY = headBone.getWorldPosition(new THREE.Vector3()).y;
  const scale = PLAYER.eyeHeight / (headY + 0.1);
  model.scale.setScalar(scale);

  let current: PlayerClip | null = 'idle';
  let lastLife = 'up';
  const play = (clip: PlayerClip, timeScale: number, startAt?: number) => {
    const next = actions.get(clip) ?? actions.get('idle');
    if (!next) return;
    next.timeScale = timeScale;
    if (current === clip) return;
    const prev = current ? actions.get(current) : undefined;
    next.reset();
    if (startAt !== undefined) next.time = startAt;
    next.play();
    if (prev) next.crossFadeFrom(prev, FADE, false);
    current = clip;
  };

  // Name tag: a small sprite over their head. Not lost in the fog; hidden by walls.
  const canvas = document.createElement('canvas');
  canvas.width = TAG_W;
  canvas.height = TAG_H;
  const ctx = canvas.getContext('2d')!;
  drawTag(ctx, name, false);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, transparent: true, depthWrite: false }));
  tag.scale.set(0.6, 0.15, 1);
  tag.renderOrder = 5;
  root.add(tag);
  let talkingWas = false;

  // Revive marker (down only): seen from anywhere, through walls, always the same size on screen.
  const markCanvas = document.createElement('canvas');
  markCanvas.width = MARK_W;
  markCanvas.height = MARK_H;
  const markCtx = markCanvas.getContext('2d')!;
  const markTex = new THREE.CanvasTexture(markCanvas);
  markTex.colorSpace = THREE.SRGBColorSpace;
  const markMat = new THREE.SpriteMaterial({ map: markTex, fog: false, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
  const mark = new THREE.Sprite(markMat);
  mark.scale.set(0.16, 0.08, 1);
  mark.renderOrder = 20;
  mark.visible = false;
  root.add(mark);
  let markSecs = -1;

  const prevPos = { x: 0, z: 0 };
  let havePrev = false;
  const vel = { x: 0, z: 0 };
  const tmp = new THREE.Vector3();
  const aim = new THREE.Vector3();

  return {
    root,
    update(s, dt, talking) {
      const gone = s.life === 'escaped' || (s.hidden && s.locker >= 0);
      root.visible = !gone;
      if (light) light.intensity = 0;
      mark.visible = s.life === 'down';
      tag.visible = s.life !== 'down' && s.life !== 'out';
      if (s.life === 'down') {
        const secs = Math.max(0, Math.ceil(s.bleed));
        if (secs !== markSecs) {
          markSecs = secs;
          drawMark(markCtx, name, secs);
          markTex.needsUpdate = true;
        }
        markMat.opacity = 0.75 + 0.25 * Math.sin(performance.now() / 160);
        mark.position.set(0, 1.0, 0);
      }
      if (gone) {
        havePrev = false;
        lastLife = s.life;
        return;
      }
      // How fast and which way they move (from the smoothed positions), for strafing and playback speed.
      if (havePrev && dt > 0) {
        const k = Math.min(1, dt * 8);
        vel.x += ((s.pos.x - prevPos.x) / dt - vel.x) * k;
        vel.z += ((s.pos.z - prevPos.z) / dt - vel.z) * k;
      }
      prevPos.x = s.pos.x;
      prevPos.z = s.pos.z;
      havePrev = true;
      const speed = Math.hypot(vel.x, vel.z);

      if (s.life === 'out') {
        // Taken: down when the minute ran out (the slump), or sent flying (lying where they landed).
        if (lastLife === 'down' || current === 'crawl') play('proneDeath', 1, 0);
        else if (current !== 'hitFly' && current !== 'proneDeath') play('hitFly', 1, 2.9);
        mixer.update(dt);
      } else if (s.life === 'down') {
        // Crawling at their pace; still, the crawl held where it is.
        play('crawl', s.gait !== 'idle' ? Math.max(0.6, Math.min(1.7, speed / DOWN.crawlSpeed)) : 0);
        mixer.update(dt);
      } else if (s.life === 'caught') {
        // Its blow sends them flying; its grab lifts and throws them.
        if (s.hit) play('hitFly', 1, 0);
        else play('thrown', 1, THROWN_CLIP.flipStart);
        mixer.update(dt);
      } else {
        const local = localVelocity(vel, s.yaw);
        const clip = injuredClip(choosePlayerClip(speed < 0.15 ? 'idle' : s.gait, s.crouching, strafeSide(local.side, local.ahead)), s.injured);
        play(clip, playerClipTimeScale(clip, speed));
        mixer.update(dt);
      }
      root.position.set(s.pos.x, s.rise, s.pos.z);
      root.rotation.y = s.yaw + Math.PI; // Mixamo faces +Z
      lastLife = s.life;

      root.updateWorldMatrix(true, true);
      headBone.getWorldPosition(tmp);
      tag.position.set(0, tmp.y - s.rise + 0.32, 0);
      if (talking !== talkingWas) {
        talkingWas = talking;
        drawTag(ctx, name, talking);
        tex.needsUpdate = true;
      }

      // Their beam: from their right hand, where they look.
      if (light && s.light && s.life === 'up' && !gone) {
        const f = { x: -Math.sin(s.yaw) * Math.cos(s.pitch), y: Math.sin(s.pitch), z: -Math.cos(s.yaw) * Math.cos(s.pitch) };
        const right = { x: Math.cos(s.yaw), z: -Math.sin(s.yaw) };
        const eyeY = s.rise + (s.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight);
        light.position.set(s.pos.x + right.x * 0.22 + f.x * 0.2, eyeY - 0.22, s.pos.z + right.z * 0.22 + f.z * 0.2);
        aim.set(light.position.x + f.x * 6, light.position.y + f.y * 6, light.position.z + f.z * 6);
        light.target.position.copy(aim);
        light.target.updateMatrixWorld();
        light.intensity = LIGHT.flashlight * FLASHLIGHT_BEAM.intensityMul * 0.85;
      }
    },
    head(o) {
      return headBone.getWorldPosition(o);
    },
    dispose() {
      mixer.stopAllAction();
      tex.dispose();
      (tag.material as THREE.SpriteMaterial).dispose();
      markTex.dispose();
      markMat.dispose();
      if (light) light.intensity = 0;
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats as THREE.MeshStandardMaterial[]) {
          mat.map?.dispose();
          mat.normalMap?.dispose();
          mat.roughnessMap?.dispose();
          mat.dispose();
        }
      });
    },
  };
}
