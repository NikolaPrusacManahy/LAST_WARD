// First-person body: mouse look, WASD movement with collision, head bob,
// footsteps and the flashlight rig that lags slightly behind the view.
import * as THREE from 'three';
import { Level, Vec2, cellCenter, dist, itemPos } from '../world/level';
import { moveWithCollision } from '../world/collision';
import { Gait, PLAYER, PlayerStatus, chooseGait, flickerAmount, gaitNoise, gaitSpeed, tickStatus } from '../state/playerRules';
import { Input } from './input';
import { flashlightCookie } from './textures';
import type { Settings } from '../state/settings';

export interface StepResult {
  gait: Gait;
  moved: number;
  /** Set on the frame a footstep lands. */
  footstep: { gait: Exclude<Gait, 'idle'>; noise: number } | null;
}

export class PlayerController {
  pos: Vec2;
  yaw = Math.PI; // facing +z (down the map)
  pitch = 0;
  private vel = { x: 0, z: 0 };
  private eye = PLAYER.eyeHeight;
  private bobPhase = 0;
  private stepAccum = 0;
  crouching = false;

  readonly flashlight: THREE.SpotLight;
  private readonly spill: THREE.PointLight;
  private readonly rig = new THREE.Object3D();
  private readonly cookie: THREE.Texture;
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpAim = new THREE.Vector3();
  /** Update 0.3 — set by the first-person body: the beam starts at the torch in your hand. */
  lightOrigin: THREE.Vector3 | null = null;
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();

  private blockers: Vec2[];

  constructor(level: Level, private camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    this.pos = cellCenter(level.playerStart);
    this.blockers = level.items.map((i) => itemPos(level, i.cell));
    this.flashlight = new THREE.SpotLight(0xfff1d6, 0, 32, 0.6, 0.35, 1.5);
    this.cookie = flashlightCookie();
    this.flashlight.map = this.cookie;
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.bias = -0.0004;
    this.flashlight.shadow.camera.near = 0.2;
    this.flashlight.position.set(0, 0, 0);
    this.flashlight.target.position.set(0, 0, -1);
    this.rig.add(this.flashlight, this.flashlight.target);
    scene.add(this.rig);
    // Faint bounce light so walls right in front of you are never pitch black.
    this.spill = new THREE.PointLight(0xffe8c8, 0, 5, 2);
    camera.add(this.spill);
    scene.add(camera);
  }

  get forward(): Vec2 {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  look(input: Input, s: Settings) {
    const k = 0.0022 * s.sensitivity;
    this.yaw -= input.mouseDX * k;
    this.pitch -= input.mouseDY * k * (s.invertY ? -1 : 1);
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  }

  step(level: Level, input: Input, status: PlayerStatus, dt: number): StepResult {
    const f = this.forward;
    const right = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
    const mx = (input.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (input.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
    const mz = (input.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (input.isDown('KeyS', 'ArrowDown') ? 1 : 0);
    let wx = f.x * mz + right.x * mx;
    let wz = f.z * mz + right.z * mx;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx /= len;
      wz /= len;
    }
    this.crouching = input.isDown('KeyC') // not Ctrl: Ctrl+W would close the tab;
    const gait = chooseGait(len > 0, input.isDown('ShiftLeft', 'ShiftRight'), this.crouching, status);
    const speed = gaitSpeed(gait);
    const a = 1 - Math.exp(-dt * 12);
    this.vel.x += (wx * speed - this.vel.x) * a;
    this.vel.z += (wz * speed - this.vel.z) * a;
    const before = this.pos;
    this.pos = moveWithCollision(level, this.pos, this.vel.x * dt, this.vel.z * dt, PLAYER.radius, this.blockers);
    const moved = dist(before, this.pos);
    tickStatus(status, gait, dt);

    let footstep: StepResult['footstep'] = null;
    if (gait !== 'idle') {
      this.stepAccum += moved;
      this.bobPhase += (moved / PLAYER.stepLength[gait]) * Math.PI;
      if (this.stepAccum >= PLAYER.stepLength[gait]) {
        this.stepAccum = 0;
        footstep = { gait, noise: gaitNoise(gait) };
      }
    }
    return { gait, moved, footstep };
  }

  /** Places the camera + flashlight. `shake` adds camera jitter (0..1). */
  updateView(dt: number, gait: Gait, status: PlayerStatus, t: number, shake = 0, lightMul = 1) {
    const targetEye = this.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight;
    this.eye += (targetEye - this.eye) * (1 - Math.exp(-dt * 10));
    const bobAmp = gait === 'sprint' ? 0.075 : gait === 'walk' ? 0.045 : 0.02;
    const bob = Math.sin(this.bobPhase) * bobAmp;
    const sway = Math.cos(this.bobPhase * 0.5) * bobAmp * 0.6;
    const jx = (Math.random() - 0.5) * shake * 0.08;
    const jy = (Math.random() - 0.5) * shake * 0.08;
    this.camera.position.set(this.pos.x, this.eye + bob + jy, this.pos.z);
    this.camera.rotation.set(this.pitch + jy * 0.5, this.yaw + jx, sway * 0.15 + jx * 0.5, 'YXZ');
    this.camera.updateMatrixWorld();

    // Flashlight sits at the right hand and catches up with the view.
    // Aims at a point ahead of the crosshair so the beam converges on what you look at.
    const q = this.camera.quaternion;
    if (this.lightOrigin) this.rig.position.copy(this.lightOrigin);
    else this.rig.position.copy(this.camera.position).add(this.tmpV.set(0.22, -0.22, -0.1).applyQuaternion(q));
    const aim = this.tmpAim.copy(this.camera.position).add(this.tmpV.set(0, 0, -6).applyQuaternion(q));
    this.tmpM.lookAt(this.rig.position, aim, this.camera.up);
    this.tmpQ.setFromRotationMatrix(this.tmpM);
    this.rig.quaternion.slerp(this.tmpQ, 1 - Math.exp(-dt * 16));

    const flick = flickerAmount(status.battery);
    let on = status.flashlightOn ? 1 : 0;
    if (on && flick > 0 && Math.random() < flick * 0.25) on = Math.random() * 0.3;
    if (shake > 0.5) on *= Math.random() < 0.5 ? 0.1 : 1;
    const strength = on * (0.55 + 0.45 * Math.min(1, status.battery / 40));
    this.flashlight.intensity = 34 * strength * lightMul;
    this.spill.intensity = 0.35 + 0.9 * strength;
    void t;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.rig);
    this.flashlight.dispose();
    this.cookie.dispose();
    this.spill.dispose();
  }
}
