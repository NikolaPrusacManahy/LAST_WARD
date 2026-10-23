// First-person body: mouse look, WASD movement with collision, head bob,
// footsteps and the flashlight rig that lags slightly behind the view.
import * as THREE from 'three';
import { Level, Vec2, cellCenter, dist, itemPos } from '../world/level';
import { moveWithCollision } from '../world/collision';
import { Gait, PLAYER, PlayerStatus, chooseGait, flickerAmount, gaitNoise, gaitSpeed, tickStatus, nextCrouch } from '../state/playerRules';
import { Input } from './input';
import { flashlightCookie } from './textures';
import { LIGHT } from '../state/lightLevels';
import { BOB, BobAmp, blendAmp, bobOffset } from '../state/cameraBob';
import { DEFAULT_SETTINGS } from '../state/settings';
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
  /** Update 0.5.3 — for the body's strafe clips. */
  get velocity(): Vec2 {
    return this.vel;
  }
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
  private bobAmp: BobAmp = { ...BOB.idle };
  /** Update 0.4.1 — from the FOV setting. */
  baseFov = DEFAULT_SETTINGS.fov;
  /** Update 0.5.4 — extra camera yaw while looking back over your shoulder (0..π). */
  lookBackYaw = 0;
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();

  private blockers: Vec2[] = [];
  /** Update 0.7 — how high up a flight of stairs you are (the camera rises with it). */
  rise = 0;

  constructor(level: Level, private camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    this.pos = cellCenter(level.playerStart);
    this.reset(level);
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
    // Faint glow so walls right in front of you are never pitch black (Update 0.4.4: brighter, wider).
    this.spill = new THREE.PointLight(0xdfe4f0, 0, 6.5, 2);
    camera.add(this.spill);
    scene.add(camera);
  }

  /** Update 0.7 — start of a level: its start cell and facing, its item cabinets to walk round. */
  reset(level: Level) {
    this.pos = cellCenter(level.playerStart);
    this.yaw = level.startYaw;
    this.pitch = 0;
    this.vel = { x: 0, z: 0 };
    this.crouching = false;
    this.rise = 0;
    this.blockers = level.items.map((i) => itemPos(level, i.cell));
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
    // Update 0.5 — rebindable (Settings.bindings); arrow keys only move if bound.
    const mx = (input.action('right') ? 1 : 0) - (input.action('left') ? 1 : 0);
    const mz = (input.action('forward') ? 1 : 0) - (input.action('back') ? 1 : 0);
    let wx = f.x * mz + right.x * mx;
    let wz = f.z * mz + right.z * mx;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx /= len;
      wz /= len;
    }
    const sprintHeld = input.action('sprint');
    this.crouching = nextCrouch(this.crouching, input.actionPressed('crouch'), sprintHeld, len > 0);
    const gait = chooseGait(len > 0, sprintHeld, this.crouching, status);
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
    // Update 0.3.1 — walk bob, heavy Outlast-style sprint bob (state/cameraBob.ts).
    this.bobAmp = blendAmp(this.bobAmp, BOB[gait], 1 - Math.exp(-dt * 6));
    const b = bobOffset(this.bobAmp, this.bobPhase, t);
    const jx = (Math.random() - 0.5) * shake * 0.08;
    const jy = (Math.random() - 0.5) * shake * 0.08;
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    this.camera.position.set(this.pos.x + rx * b.side, this.rise + this.eye + b.y + jy, this.pos.z + rz * b.side);
    this.camera.rotation.set(this.pitch - b.nod + jy * 0.5, this.yaw + this.lookBackYaw + jx, -b.roll + jx * 0.5, 'YXZ');
    const fov = this.baseFov + this.bobAmp.fov;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
    this.updateLight(dt, status, shake, lightMul);
  }

  /** Flashlight follows wherever the camera is (Update 0.6 — also when a cinematic moves the camera). */
  updateLight(dt: number, status: PlayerStatus, shake = 0, lightMul = 1) {
    // Flashlight sits at the right hand and catches up with the view.
    // Aims at a point ahead of the crosshair so the beam converges on what you look at.
    const q = this.camera.quaternion;
    this.rig.position.copy(this.camera.position).add(this.tmpV.set(0.22, -0.22, -0.1).applyQuaternion(q));
    const aim = this.tmpAim.copy(this.camera.position).add(this.tmpV.set(0, 0, -6).applyQuaternion(q));
    this.tmpM.lookAt(this.rig.position, aim, this.camera.up);
    this.tmpQ.setFromRotationMatrix(this.tmpM);
    this.rig.quaternion.slerp(this.tmpQ, 1 - Math.exp(-dt * 16));

    const flick = flickerAmount(status.battery);
    let on = status.flashlightOn ? 1 : 0;
    if (on && flick > 0 && Math.random() < flick * 0.25) on = Math.random() * 0.3;
    if (shake > 0.5) on *= Math.random() < 0.5 ? 0.1 : 1;
    const strength = on * (0.55 + 0.45 * Math.min(1, status.battery / 40));
    this.flashlight.intensity = LIGHT.flashlight * strength * lightMul;
    this.spill.intensity = (LIGHT.eyeGlow + LIGHT.eyeGlowFlashlight * strength) * lightMul;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.rig);
    this.flashlight.dispose();
    this.cookie.dispose();
    this.spill.dispose();
  }
}
