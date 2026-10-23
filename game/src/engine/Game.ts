// Game façade: owns the renderer and frame loop, wires world rules → visuals → audio → HUD.
// Keep it a façade: new mechanics go in their own module (CLAUDE.md §4).
import * as THREE from 'three';
import { LEVEL_01 } from '../world/content/level01';
import { Level, cellCenter, dist, itemPos, parseLevel, worldToCell } from '../world/level';
import { ENEMY, EnemyState, Noise, spawnAtCorner, stepEnemy, visibility } from '../world/enemyAI';
import { shuffleItems } from '../world/itemShuffle';
import { LookBack, createLookBack, hideBodyWhileLookingBack, lookBackTimeScale, lookBackYaw, stepLookBack } from '../state/lookBack';
import { createRng } from '../world/rng';
import { findTarget, Target } from '../world/interact';
import { CONTROLS_CARD_SECONDS, Prompt, promptFor, samePrompt, tickControlsCard } from '../state/prompts';
import { LIGHT, atmosphereFor } from '../state/lightLevels';
import { Gait, PLAYER, PlayerStatus, addBattery, createPlayerStatus, fearLevel, toggleFlashlight } from '../state/playerRules';
import { debugLines } from '../state/debugInfo';
import { RunPhase, guardLeave } from '../state/session';
import { FUSES_NEEDED, Progress, activateGenerator, createProgress, objectiveText, tryExit } from '../state/objectives';
import type { Settings } from '../state/settings';
import { AudioEngine } from '../audio/audio';
import { enemyMix } from '../audio/spatial';
import { lineOfSight } from '../world/lineOfSight';
import { freeBehind } from '../world/collision';
import { BODY_RADIUS } from './playerAnim';
import { buildLevel, LevelView } from './buildLevel';
import { createEnemyView, EnemyView } from './enemyView';
import { loadEnemyModel } from './enemyModel';
import { createLighting, Lighting } from './lighting';
import { createPostFx, PostFx } from './postfx';
import { Input } from './input';
import { PlayerController } from './playerController';
import { HudStore } from './hudStore';
import { loadPlayerBody, PlayerBody } from './playerBody';
import { createDebugView, DebugView } from './debugView';

type Phase = RunPhase;

export interface GameCallbacks {
  onEnd(result: 'dead' | 'escaped', seconds: number): void;
  onPause(): void;
}

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private ambient: THREE.HemisphereLight;
  private fx: PostFx;
  private input: Input;
  private level: Level;
  private view: LevelView;
  private lights: Lighting;
  private player: PlayerController;
  private status: PlayerStatus = createPlayerStatus();
  private progress: Progress = createProgress();
  private enemy: EnemyState;
  private enemyView: EnemyView;
  private rng = createRng((Date.now() & 0xffff) + 1);
  private audio: AudioEngine;
  private phase: Phase = 'intro';
  private raf = 0;
  private last = 0;
  private t = 0;
  private playTime = 0;
  private phaseTime = 0;
  private hudTimer = 0;
  private fear = 0;
  private noise: Noise | null = null;
  private target: Target | null = null;
  private toast: { text: string; until: number } | null = null;
  private note: { text: string; until: number } | null = null;
  private lastPrompt: Prompt | null = null;
  /** Update 0.5.4 — look over your shoulder on the run + slow-motion burst. */
  private lookBack: LookBack = createLookBack();
  /** World clock: runs slower during the look-back slow motion (this.t stays real time). */
  private worldT = 0;
  private realDt = 0;
  private controlsLeft = 0;
  private enemyStepAccum = 0;
  private resizeObs: ResizeObserver;
  /** ?debug in the URL: runs without pointer lock (for automated screenshots). */
  private debug = new URLSearchParams(location.search).has('debug');
  private enemyFrozen = false;
  private stingerTimer = 0;
  private disposed = false;
  private tmpV = new THREE.Vector3();
  private body: PlayerBody | null = null;
  private gait: Gait = 'idle';
  private speed = 0;
  private debugView: DebugView;
  private fps = 60;

  constructor(
    private container: HTMLElement,
    private settings: Settings,
    private hud: HudStore,
    private cb: GameCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = 'lw-canvas';

    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 80);
    this.scene.background = new THREE.Color(0x020203);
    const atmo = atmosphereFor(false, false);
    this.scene.fog = new THREE.FogExp2(0x020203, atmo.fog);
    this.ambient = new THREE.HemisphereLight(LIGHT.skyColor, LIGHT.groundColor, atmo.ambient);
    this.scene.add(this.ambient);

    // Update 0.5.4 — fuses, batteries and notes land on different tables every run.
    this.level = shuffleItems(parseLevel(LEVEL_01), this.rng);
    this.view = buildLevel(this.level);
    this.scene.add(this.view.root);
    this.lights = createLighting(this.view);
    this.player = new PlayerController(this.level, this.camera, this.scene);
    this.player.baseFov = settings.fov;
    // Update 0.5.4 — starts in one of the four corners, never the one by you.
    this.enemy = spawnAtCorner(this.level, this.rng, cellCenter(this.level.playerStart));
    this.enemyView = createEnemyView();
    this.scene.add(this.enemyView.root);
    this.swapInRiggedEnemy();
    this.loadBody();
    this.debugView = createDebugView(this.level);
    this.scene.add(this.debugView.root);
    this.fx = createPostFx(this.renderer, this.scene, this.camera);
    this.fx.set({ grain: settings.grain ? 1 : 0 });
    this.input = new Input(this.renderer.domElement, this.debug);
    this.input.bindings = settings.bindings;
    this.audio = new AudioEngine(settings.volume);

    document.addEventListener('pointerlockchange', this.onLockChange);
    window.addEventListener('beforeunload', this.onBeforeUnload);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.pushHud(true);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    if (this.debug) (window as unknown as { __lastWard: Game }).__lastWard = this;
  }

  /** Must be called from a click (user gesture) — starts audio and grabs the mouse. */
  begin() {
    void this.audio.resume();
    this.audio.startAmbience();
    this.audio.startEnemyBreath(this.enemy3D());
    this.phase = 'playing';
    this.toastMsg('Find a way out.', 4);
    this.controlsLeft = CONTROLS_CARD_SECONDS; // Update 0.5 — controls card, Enter closes it
    void this.lockPointer();
  }

  /** Resume after pause (also needs a click). */
  async resume(): Promise<boolean> {
    if (this.debug) {
      this.phase = 'playing';
      return true;
    }
    return this.lockPointer();
  }

  private async lockPointer(): Promise<boolean> {
    if (this.debug) return true;
    try {
      await this.renderer.domElement.requestPointerLock();
      return true;
    } catch {
      return false; // browsers refuse re-lock for ~1 s after Esc; the pause menu stays up
    }
  }

  setSettings(s: Settings) {
    this.settings = s;
    this.audio.setVolume(s.volume);
    this.fx.set({ grain: s.grain ? 1 : 0 });
    this.player.baseFov = s.fov;
    this.input.bindings = s.bindings;
  }

  /** Ctrl+W (or closing the tab) mid-run asks before leaving. */
  private onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (!guardLeave(this.phase)) return;
    e.preventDefault();
    e.returnValue = '';
  };

  private onLockChange = () => {
    const locked = document.pointerLockElement === this.renderer.domElement;
    if (locked && (this.phase === 'paused' || this.phase === 'playing')) {
      this.phase = 'playing';
    } else if (!locked && this.phase === 'playing') {
      this.phase = 'paused';
      this.input.clear();
      this.cb.onPause();
    }
  };

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.fx.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private enemy3D() {
    return { x: this.enemy.pos.x, y: 1.6, z: this.enemy.pos.z };
  }

  private toastMsg(text: string, seconds = 3) {
    this.toast = { text, until: this.t + seconds };
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    // Update 0.5 — a frame stamped before the game was built gave a negative dt and froze the HUD.
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    this.t += dt;
    this.phaseTime += dt;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    if (this.phase !== 'playing') {
      this.gait = 'idle';
      this.speed = 0;
    }

    // Update 0.5.4 — Q while running: camera swings round, time slows for a moment.
    let wdt = dt;
    if (this.phase === 'playing') {
      this.lookBack = stepLookBack(this.lookBack, dt, this.input.action('lookBack'), this.gait === 'sprint');
      wdt = dt * lookBackTimeScale(this.lookBack);
    } else if (this.lookBack.amount > 0 || this.lookBack.active) {
      this.lookBack = createLookBack();
    }
    this.player.lookBackYaw = lookBackYaw(this.lookBack);
    this.body?.setVisible(!hideBodyWhileLookingBack(this.lookBack));
    this.worldT += wdt;
    this.realDt = dt;

    if (this.phase === 'playing') this.updatePlaying(wdt);
    else if (this.phase === 'dying') this.updateDying(dt);
    else if (this.phase === 'escaping') this.updateEscaping(dt);
    else {
      this.player.updateView(dt, 'idle', this.status, this.t);
      this.enemyView.update(this.enemy.pos, this.enemy.dir, this.enemy.mode, 0, this.worldT, this.enemy.windup > 0);
    }

    this.body?.update({
      pos: this.player.pos,
      yaw: this.player.yaw,
      pitch: this.player.pitch,
      gait: this.gait,
      crouching: this.player.crouching,
      speed: this.speed,
      velocity: this.phase === 'playing' ? this.player.velocity : undefined,
      camera: this.camera,
      dt: this.phase === 'paused' ? 0 : wdt,
      flashlightOn: this.status.flashlightOn,
      // Update 0.5.2 — keep the body out of the wall behind you.
      roomBehind: freeBehind(this.level, this.player.pos, this.player.forward, 1.2, BODY_RADIUS),
    });
    this.debugView.update(this.enemy, this.t);
    this.lights.update(this.t);
    this.fx.set({ time: this.t, fear: this.debugView.enabled ? 0 : this.fear });
    this.fx.render();
    this.input.endFrame();

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.pushHud();
    }
  };

  private updatePlaying(dt: number) {
    this.playTime += dt;
    const { input, player, status } = this;
    player.look(input, this.settings);
    const step = player.step(this.level, input, status, dt);
    this.gait = step.gait;
    this.speed = dt > 0 ? step.moved / dt : 0;
    if (input.wasPressed('F2')) this.setDebugView(!this.debugView.enabled);
    if (input.wasPressed('F3') && this.debugView.enabled) this.enemyFrozen = !this.enemyFrozen;
    if (step.footstep) {
      this.audio.footstep(step.footstep.gait);
      if (step.footstep.noise > 0) this.noise = { pos: { ...player.pos }, radius: step.footstep.noise };
    }

    // Update 0.5 — rebindable: right click flashlight, left click collect / interact by default.
    if (input.actionPressed('flashlight') && toggleFlashlight(status)) this.audio.click();
    this.controlsLeft = tickControlsCard(this.controlsLeft, dt, input.wasPressed('Enter') || input.wasPressed('NumpadEnter'));
    if (this.note && (input.actionPressed('interact') || input.wasPressed('Escape') || this.t > this.note.until)) {
      this.note = null;
    } else if (input.actionPressed('interact')) {
      this.interact();
    }
    this.target = findTarget(this.level, player.pos, player.forward, this.progress.collected);

    // Enemy.
    const before = this.enemy.pos;
    const events = this.enemyFrozen ? [] : stepEnemy(
      this.level,
      this.enemy,
      { dt, player: { pos: player.pos, flashlightOn: status.flashlightOn, crouching: player.crouching }, noise: this.noise, fuses: this.progress.fuses },
      this.rng,
    );
    this.noise = null;
    const moved = dist(before, this.enemy.pos);
    this.enemyView.update(this.enemy.pos, this.enemy.dir, this.enemy.mode, moved, this.worldT, this.enemy.windup > 0);
    this.enemyStepAccum += moved;
    const chasing = this.enemy.mode === 'chase';
    // Update 0.4.1 — enemy sounds get darker with distance and muffled behind walls.
    const mix = enemyMix(dist(this.enemy.pos, player.pos), !lineOfSight(this.level, this.enemy.pos, player.pos));
    if (this.enemyStepAccum > (chasing ? 1.4 : 1.0)) {
      this.enemyStepAccum = 0;
      this.audio.enemyStep(this.enemy3D(), chasing, mix);
    }
    if (events.includes('spotted')) {
      this.audio.enemyScream(this.enemy3D());
      this.audio.stinger();
    }
    if (events.includes('caught')) {
      this.startDying();
      return;
    }

    const targetFear = fearLevel(dist(this.enemy.pos, player.pos), chasing);
    this.fear += (targetFear - this.fear) * (1 - Math.exp(-dt * 3));
    // Camera + flashlight follow in real time, so the look-back swing isn't slowed by its own slow motion.
    player.updateView(this.realDt, step.gait, status, this.t, 0);
    this.audio.setListener(this.camera.position, this.camForward());
    this.audio.updateEnemy(this.enemy3D(), chasing, mix);
    this.audio.tickFear(dt, this.fear, chasing);
    this.audio.tickAmbient(dt, this.camera.position);
  }

  private camForward() {
    const v = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    return { x: v.x, y: v.y, z: v.z };
  }

  private interact() {
    const t = this.target;
    if (!t) return;
    const p = this.progress;
    if (t.type === 'item') {
      p.collected.push(t.item.id);
      this.view.items.get(t.item.id)!.visible = false;
      if (t.item.kind === 'fuse') {
        p.fuses++;
        this.audio.pickup();
        this.toastMsg(p.fuses >= FUSES_NEEDED ? 'All fuses. Get to the generator.' : `Fuse ${p.fuses}/${FUSES_NEEDED}`);
      } else if (t.item.kind === 'battery') {
        addBattery(this.status);
        this.audio.pickup();
        this.toastMsg('Battery +45%');
      } else {
        this.audio.paper();
        p.notesRead.push(t.item.noteIndex!);
        this.note = { text: this.level.notes[t.item.noteIndex!], until: this.t + 14 };
      }
    } else if (t.type === 'generator') {
      const r = activateGenerator(p);
      if (r === 'powered') {
        const g = this.view.generatorPos;
        this.audio.generatorStart({ x: g.x, y: g.y, z: g.z });
        this.lights.setPowered(this.t);
        this.applyAtmosphere(); // with the lights back you can see further down the halls
        this.toastMsg('The lights come on. Something screams in the dark.', 5);
        // The noise of the generator draws it in from anywhere.
        this.noise = { pos: { x: g.x, z: g.z }, radius: 999 };
        this.stingerTimer = window.setTimeout(() => this.audio.stinger(), 1200);
      } else if (r === 'need-fuses') {
        this.audio.denied();
        this.toastMsg(`It needs ${FUSES_NEEDED} fuses.`);
      }
    } else if (t.type === 'exit') {
      if (tryExit(p) === 'escaped') {
        this.audio.doorOpen();
        this.audio.fadeOut(2.2);
        this.phase = 'escaping';
        this.phaseTime = 0;
        this.toast = null;
      } else {
        this.audio.denied();
        this.toastMsg('Mag-lock. No power.');
      }
    }
  }

  private startDying() {
    this.phase = 'dying';
    this.toast = null;
    this.note = null;
    this.phaseTime = 0;
    this.audio.scream();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private updateDying(dt: number) {
    const p = this.player;
    // It stands right in front of you; the view snaps up to its face.
    const f = p.forward;
    const ePos = { x: p.pos.x + f.x * 1.35, z: p.pos.z + f.z * 1.35 };
    this.enemy.pos = ePos;
    this.enemy.dir = { x: -f.x, z: -f.z };
    this.enemyView.root.position.set(ePos.x, 0, ePos.z);
    this.enemyView.root.rotation.y = Math.atan2(-f.x, -f.z);
    this.enemyView.lunge(Math.min(1, this.phaseTime / 0.25), this.worldT);
    // Keep its face in the middle of the screen whatever the attack animation does.
    const hp = this.enemyView.head.getWorldPosition(this.tmpV);
    const horiz = Math.max(0.2, Math.hypot(hp.x - this.camera.position.x, hp.z - this.camera.position.z));
    const wantPitch = Math.max(-0.7, Math.min(0.9, Math.atan2(hp.y - this.camera.position.y, horiz)));
    p.pitch += (wantPitch - p.pitch) * (1 - Math.exp(-dt * 14));
    const k = this.phaseTime;
    this.fear = 1;
    p.updateView(dt, 'idle', this.status, this.t, Math.max(0, 1 - k / 1.6), 0.6);
    // The face first, then the red, then black.
    this.fx.set({ red: Math.min(0.5, Math.max(0, k - 0.75) * 1.6) * (Math.random() < 0.2 ? 0.4 : 1), black: Math.max(0, (k - 1.1) / 0.5) });
    if (k > 1.7 && this.phase === 'dying') {
      this.phase = 'over';
      this.audio.fadeOut(0.5);
      this.cb.onEnd('dead', this.playTime);
    }
  }

  private updateEscaping(dt: number) {
    const k = this.phaseTime;
    const d = this.view;
    d.exitDoor.position.copy(d.exitDoorClosedPos).addScaledVector(d.exitDoorSlide, Math.min(1, k / 1.2));
    this.player.updateView(dt, 'idle', this.status, this.t);
    this.fear *= 0.95;
    this.fx.set({ white: Math.min(1, Math.max(0, (k - 0.6) / 1.4)) });
    if (k > 2.2 && this.phase === 'escaping') {
      this.phase = 'over';
      if (document.pointerLockElement) document.exitPointerLock();
      this.cb.onEnd('escaped', this.playTime);
    }
  }

  /** Same object while the words don't change, so the HUD doesn't re-render for nothing. */
  private currentPrompt(): Prompt | null {
    const next = this.phase === 'playing' ? promptFor(this.target, this.progress, !!this.note) : null;
    if (!samePrompt(next, this.lastPrompt)) this.lastPrompt = next;
    return this.lastPrompt;
  }

  private pushHud(force = false) {
    if (this.toast && this.t > this.toast.until) this.toast = null;
    if (!force && this.phase === 'over') return;
    const s = this.status;
    this.hud.set({
      battery: Math.round(s.battery),
      flashlightOn: s.flashlightOn,
      stamina: Math.round((s.stamina / 4.5) * 100) / 100,
      exhausted: s.exhausted,
      objective: objectiveText(this.progress),
      prompt: this.currentPrompt(),
      bindings: this.settings.bindings,
      controls: this.phase === 'playing' || this.phase === 'paused' ? Math.ceil(this.controlsLeft * 10) / 10 : 0,
      toast: this.toast?.text ?? null,
      note: this.note?.text ?? null,
      fear: Math.round(this.fear * 20) / 20,
      time: Math.floor(this.playTime),
      started: this.phase !== 'intro',
      debug: this.debugView.enabled
        ? debugLines({
            fps: this.fps,
            cell: worldToCell(this.player.pos),
            enemyMode: this.enemy.mode,
            alert: this.enemy.alert,
            windup: this.enemy.windup,
            distance: dist(this.enemy.pos, this.player.pos),
            seesYou: visibility(this.level, this.enemy, { pos: this.player.pos, flashlightOn: s.flashlightOn, crouching: this.player.crouching }) > 0,
            frozen: this.enemyFrozen,
            fuses: this.progress.fuses,
            powered: this.progress.powered,
            teleportIn: this.enemy.mode === 'chase' ? null : ENEMY.teleportAfter - this.enemy.sinceSpotted,
          })
        : null,
      cinematic: this.phase === 'dying' || this.phase === 'escaping' || this.phase === 'over',
    });
  }

  /** Debug helpers for automated checks (only exposed with ?debug). */
  debugTeleport(col: number, row: number, yaw?: number) {
    this.player.pos = cellCenter({ col, row });
    if (yaw !== undefined) this.player.yaw = yaw;
  }
  debugPlace(x: number, z: number, yaw: number, pitch = 0) {
    this.player.pos = { x, z };
    this.player.yaw = yaw;
    this.player.pitch = pitch;
  }
  debugTargets() {
    return {
      items: this.level.items.map((i) => ({ id: i.id, ...itemPos(this.level, i.cell) })),
      generator: cellCenter(this.level.generator),
      exit: cellCenter(this.level.exit),
    };
  }
  debugFreezeEnemy(on: boolean) {
    this.enemyFrozen = on;
  }
  debugEnemy(col: number, row: number) {
    this.enemy.pos = cellCenter({ col, row });
  }
  debugState() {
    return { phase: this.phase, enemy: { ...this.enemy, path: undefined }, progress: this.progress, status: this.status, pos: this.player.pos };
  }

  /** Update 0.3 — F2: full light, no fog or screen FX, enemy marked through walls. */
  private setDebugView(on: boolean) {
    this.debugView.setEnabled(on);
    if (!on) this.enemyFrozen = false;
    this.applyAtmosphere();
  }

  private applyAtmosphere() {
    const dbg = this.debugView.enabled;
    const a = atmosphereFor(this.progress.powered, dbg); // Update 0.4.4 — state/lightLevels.ts
    (this.scene.fog as THREE.FogExp2).density = a.fog;
    this.ambient.intensity = a.ambient;
    this.renderer.toneMappingExposure = a.exposure;
    this.fx.set({ clean: dbg });
  }

  /** Update 0.3 — first-person body (loads in the background; the game plays fine without it). */
  private loadBody() {
    loadPlayerBody(PLAYER.eyeHeight)
      .then((b) => {
        if (this.disposed) return b.dispose();
        this.body = b;
        this.scene.add(b.root);
      })
      .catch((err) => console.warn('Player body failed to load, using the floating flashlight.', err));
  }

  /** Update 0.2 — load the rigged model in the background; the primitive figure stands in until then (or if it fails). */
  private swapInRiggedEnemy() {
    loadEnemyModel()
      .then((v) => {
        if (this.disposed) return v.dispose();
        this.scene.remove(this.enemyView.root);
        this.enemyView.dispose();
        this.enemyView = v;
        this.scene.add(v.root);
      })
      .catch((err) => console.warn('Patient model failed to load, using the fallback figure.', err));
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.stingerTimer);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    if (document.pointerLockElement) document.exitPointerLock();
    this.resizeObs.disconnect();
    this.input.dispose();
    this.audio.dispose();
    this.lights.dispose();
    this.view.dispose();
    this.enemyView.dispose();
    this.body?.dispose();
    this.debugView.dispose();
    this.player.dispose(this.scene);
    this.fx.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
