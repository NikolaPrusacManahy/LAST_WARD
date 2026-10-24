// Game façade: owns the renderer and frame loop, wires world rules → visuals → audio → HUD.
// Keep it a façade: new mechanics go in their own module.
import * as THREE from 'three';
import { LEVELS } from '../world/content/levels';
import { Level, Vec2, cellCenter, crossPortal, dist, floorAt, floorOffset, floorStride, itemPos, parseLevel, stairRise, worldToCell } from '../world/level';
import { ENEMY, EnemyState, Noise, spawnAtCorner, stepEnemy, summonToGenerator, teleportAway, visibility } from '../world/enemyAI';
import { CAUGHT, LIVES, eyelids, injuredTint, nextGruntDelay } from '../state/caughtSequence';
import { CaughtScene, createCaughtScene } from './caughtScene';
import { WakeScene, createWakeScene } from './wakeScene';
import { WAKE, wakeEyelids, wakeLight, wakeTextOpacity } from '../state/wakeSequence';
import { shuffleItems } from '../world/itemShuffle';
import { LookBack, createLookBack, hideBodyWhileLookingBack, lookBackTimeScale, lookBackYaw, stepLookBack } from '../state/lookBack';
import { createRng } from '../world/rng';
import { findTarget, Target } from '../world/interact';
import { CONTROLS_CARD_SECONDS, Prompt, promptFor, samePrompt, tickControlsCard } from '../state/prompts';
import { LIGHT, atmosphereFor, blendAtmosphere } from '../state/lightLevels';
import { Gait, PLAYER, PlayerStatus, addBattery, createPlayerStatus, fearLevel, tickStatus, toggleFlashlight } from '../state/playerRules';
import { debugLines } from '../state/debugInfo';
import { mixVolumes } from '../state/settings';
import { DIFFICULTY, DifficultyRules } from '../state/difficulty';
import { RunPhase, closesNote, guardLeave, worldTimeScale } from '../state/session';
import { chooseStartLevel, debugFlag, devToolsEnabled } from '../state/devTools';
import { Progress, createProgress, finishRepair, fitFuse, objectiveDetail, objectiveText, startGenerator, throwPanelSwitch, tryExit } from '../state/objectives';
import { RepairState, SKILL, cancelCheck, createRepair, stepRepair } from '../state/skillCheck';
import { lockerSpots, panelSpots, panelSwitches, propFront } from '../world/props';
import { Throwable, heldPos, launch, spawnThrowables, stepFlight, throwableTitle } from '../state/throwables';
import { ThrowablesView, createThrowablesView } from './throwablesView';
import { HideState, LOCKER, clampLook, doorOpen, hiddenFrom, insideness, peekLean, requestExit, startHide, stepHide } from '../state/hiding';
import { createPropsView, PropsView } from './propsView';
import type { Settings } from '../state/settings';
import { AudioEngine } from '../audio/audio';
import { EnemyMix, enemyHearing } from '../audio/spatial';
import { SoundPath, soundPath } from '../world/soundPath';
import { lineOfSight } from '../world/lineOfSight';
import { freeBehind, nearestFree } from '../world/collision';
import { BODY_RADIUS } from './playerAnim';
import { buildLevel, LevelView } from './buildLevel';
import { createEnemyView, EnemyView } from './enemyView';
import { loadEnemyModel } from './enemyModel';
import { createLighting, Lighting } from './lighting';
import { createPostFx, PostFx } from './postfx';
import { Input } from './input';
import { PlayerController } from './playerController';
import { HudStore, HudState } from './hudStore';
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
  /** Update 0.7 — which level (LEVELS index); escaping one wakes you up in the next. */
  private levelIndex = 0;
  /** Update 0.7 — all level meshes; moved so the floor you're on sits at the rules' coordinates. */
  private world = new THREE.Group();
  private curFloor = 0;
  private view: LevelView;
  /** Update 0.8 — real props (furniture, generator, breaker panel, switch). */
  private props: PropsView;
  /** Update 0.8 — breaker panel minigame. */
  /** Update 0.9 — repairing an electrical panel (one at a time; skill checks). */
  private repair!: RepairState;
  private panelOpen: number[] = [];
  private sparkFlash = 0;
  private sparkPanel = 0;
  private repairing = false;
  /** Update 0.9 — the big objective banner at the top: shown when the objective changes. */
  private banner: { text: string; label: string; key: number; until: number } | null = null;
  private lastObjective = '';
  private lastObjectiveShown = '';
  private lights: Lighting;
  private player: PlayerController;
  private status: PlayerStatus = createPlayerStatus();
  private progress: Progress = createProgress(0);
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
  private note: { text: string } | null = null;
  private lastPrompt: Prompt | null = null;
  /** Update 0.5.4 — look over your shoulder on the run + slow-motion burst. */
  private lookBack: LookBack = createLookBack();
  /** World clock: runs slower during the look-back slow motion (this.t stays real time). */
  private worldT = 0;
  private realDt = 0;
  /** Update 0.9.5 — hiding in a locker (null when not), and the way you were facing as you got in. */
  private hide: HideState | null = null;
  private hideFromYaw = 0;
  private hideWasCrouching = false;
  /** Update 0.9.6 — bricks and bottles, the one in your hand, and their drawing. */
  private throwables: Throwable[] = [];
  private held: number | null = null;
  private throwView!: ThrowablesView;
  /** Update 0.9.4 — the last worked-out way its sound reaches you. */
  private sound: SoundPath | null = null;
  private soundIn = 0;
  /** Update 0.9.3 — fog density before the flashlight, and the beam eased 0..1. */
  private beam = 0;
  /** Update 0.6 — two lives; the first catch throws you and leaves you injured. */
  private lives = LIVES;
  /** Update 0.9.3 — picked before the run (lives, battery drain, night vision). Fixed for the run. */
  private rules: DifficultyRules;
  private injured = false;
  private caught: CaughtScene | null = null;
  private wake: WakeScene | null = null;
  private impactT = -99;
  private gruntIn = 0;
  private camReturn: { pos: THREE.Vector3; quat: THREE.Quaternion; t: number } | null = null;
  /** Phase to go back to after a pause (a pause mid-sequence resumes the sequence). */
  private resumePhase: Phase = 'playing';
  private controlsLeft = 0;
  private enemyStepAccum = 0;
  private resizeObs: ResizeObserver;
  /** ?debug in the URL: runs without pointer lock (for automated screenshots). Dev build only (0.6.5). */
  private debug = debugFlag(import.meta.env.DEV, location.search);
  /** Update 0.6.5 — F2 / F3 exist only in the dev build. */
  private devTools = devToolsEnabled(import.meta.env.DEV);
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
    /** Update 0.7.1 — tester level picker / ?level=N; the public build always starts at 0. */
    startLevel = 0,
  ) {
    this.rules = DIFFICULTY[settings.difficulty];
    this.lives = this.rules.lives;
    this.status = createPlayerStatus(this.rules.batteryDrainMul);
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
    // Update 0.7 — level 1, or the tester's pick in the dev build (main menu picker / ?level=N).
    this.levelIndex = chooseStartLevel(import.meta.env.DEV, startLevel, LEVELS.length);
    this.level = shuffleItems(parseLevel(LEVELS[this.levelIndex]), this.rng);
    this.scene.add(this.world);
    this.view = buildLevel(this.level);
    this.world.add(this.view.root);
    this.props = createPropsView(this.level, this.view);
    this.world.add(this.props.root);
    this.throwView = createThrowablesView(); // Update 0.9.6
    this.world.add(this.throwView.root);
    this.throwables = spawnThrowables(this.level.throwables);
    this.repair = createRepair(this.rng);
    this.progress = createProgress(panelSpots(this.level).length);
    this.lights = createLighting(this.view);
    this.player = new PlayerController(this.level, this.camera, this.scene);
    this.player.nightVision = this.rules.nightVision; // Update 0.9.3 — Easy: right click is the goggles, no beam
    this.player.baseFov = settings.fov;
    // Update 0.5.4 — starts in one of the four corners, never the one by you.
    this.enemy = spawnAtCorner(this.level, this.rng, cellCenter(this.level.playerStart));
    this.enemyView = createEnemyView();
    this.scene.add(this.enemyView.root);
    this.swapInRiggedEnemy();
    this.loadBody();
    this.debugView = createDebugView(this.level);
    this.world.add(this.debugView.root);
    this.syncFloor();
    this.fx = createPostFx(this.renderer, this.scene, this.camera);
    this.fx.set({ grain: settings.grain ? 1 : 0 });
    this.input = new Input(this.renderer.domElement, this.debug);
    this.input.bindings = settings.bindings;
    this.audio = new AudioEngine(mixVolumes(settings));

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
    this.startWake();
    void this.lockPointer();
  }

  /** Update 0.6.3 — you come to on the floor first (engine/wakeScene.ts); the run starts once you're up. */
  private startWake() {
    this.phase = 'waking';
    this.wake = createWakeScene({
      camera: this.camera,
      body: () => this.body,
      pos: { ...this.player.pos },
      yaw: this.player.yaw,
      eyeHeight: PLAYER.eyeHeight,
    });
  }

  /**
   * Update 0.7 — escaped: the next level. Same run (lives, injury, battery and the clock carry over);
   * you wake up on the floor again with that level's intro text.
   */
  private loadLevel(index: number) {
    this.world.remove(this.view.root);
    this.view.dispose();
    this.world.remove(this.props.root);
    this.props.dispose();
    this.lights.dispose();
    const debugOn = this.debugView.enabled;
    this.world.remove(this.debugView.root);
    this.debugView.dispose();
    this.levelIndex = index;
    this.level = shuffleItems(parseLevel(LEVELS[index]), this.rng);
    this.view = buildLevel(this.level);
    this.world.add(this.view.root);
    this.props = createPropsView(this.level, this.view);
    this.world.add(this.props.root);
    this.world.remove(this.throwView.root);
    this.throwView.dispose();
    this.throwView = createThrowablesView();
    this.world.add(this.throwView.root);
    this.throwables = spawnThrowables(this.level.throwables);
    this.held = null;
    this.repair = createRepair(this.rng);
    this.panelOpen = [];
    this.hide = null;
    this.lockerCache = null;
    this.enemyDoor = null;
    this.banner = null;
    this.lastObjective = '';
    this.lastObjectiveShown = '';
    this.lights = createLighting(this.view);
    this.debugView = createDebugView(this.level);
    this.debugView.setEnabled(debugOn);
    this.world.add(this.debugView.root);
    this.player.reset(this.level);
    this.enemy = spawnAtCorner(this.level, this.rng, cellCenter(this.level.playerStart));
    this.enemyFrozen = false;
    this.progress = createProgress(panelSpots(this.level).length);
    this.noise = null;
    this.target = null;
    this.toast = null;
    this.note = null;
    this.fear = 0;
    this.camReturn = null;
    this.controlsLeft = 0;
    clearTimeout(this.stingerTimer);
    this.syncFloor();
    this.applyAtmosphere();
    this.fx.set({ white: 0, lids: 1 }); // white flash of the door → black, eyes shut
    this.audio.stopGenerator();
    this.audio.setVolume(mixVolumes(this.settings));
    this.startWake();
  }

  /** Update 0.7 — keep the floor you're on at the rules' coordinates (other floors drawn where they are). */
  private syncFloor() {
    this.curFloor = floorAt(this.level, this.player.pos);
    const o = floorOffset(this.level, this.curFloor);
    this.world.position.set(0, -o.y, -o.z);
  }

  /** Update 0.7 — The Patient drawn relative to your floor (it can be on another one, or on the stairs). */
  private enemyRel(): { x: number; y: number; z: number } {
    const oe = floorOffset(this.level, floorAt(this.level, this.enemy.pos));
    const oc = floorOffset(this.level, this.curFloor);
    return { x: this.enemy.pos.x, y: oe.y - oc.y + stairRise(this.level, this.enemy.pos), z: this.enemy.pos.z + oe.z - oc.z };
  }

  private drawEnemy(moved: number) {
    const r = this.enemyRel();
    this.enemyView.update({ x: r.x, z: r.z }, this.enemy.dir, this.enemy.mode, moved, this.worldT, this.enemy.windup > 0);
    this.enemyView.root.position.y = r.y;
  }

  /** Update 0.7 — where a logic position really is (for the debug view, which lives in `world`). */
  private toWorld = (p: Vec2) => {
    const o = floorOffset(this.level, floorAt(this.level, p));
    return { x: p.x, y: o.y + stairRise(this.level, p), z: p.z + o.z };
  };

  /** Camera position in real world space (the audio listener; sounds are placed there too). */
  private camAbs() {
    const o = floorOffset(this.level, this.curFloor);
    return { x: this.camera.position.x, y: this.camera.position.y + o.y, z: this.camera.position.z + o.z };
  }

  private updateWaking(dt: number) {
    const scene = this.wake;
    if (!scene) return;
    for (const cue of scene.update(dt)) {
      if (cue === 'getUp') this.audio.grunt(WAKE.gruntSeconds);
      else if (cue === 'done') {
        const view = scene.lastView();
        this.wake = null;
        this.fx.set({ lids: 0 });
        this.camReturn = { pos: view.pos, quat: view.quat, t: 0 };
        this.player.pitch = 0;
        this.input.clear();
        this.phase = 'playing';
        this.lastObjective = ''; // Update 0.9 — the first objective is announced in the banner
        // Update 0.5 — controls card, Enter closes it (Update 0.7: first level only).
        if (this.levelIndex === 0) this.controlsLeft = CONTROLS_CARD_SECONDS;
        return;
      }
    }
    this.fx.set({ lids: wakeEyelids(scene.t) });
    this.player.updateLight(dt, this.status, 0, wakeLight(scene.t));
    this.audio.setListener(this.camAbs(), this.camForward());
    this.audio.updateEnemy(this.enemy3D(), false);
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
    this.audio.setVolume(mixVolumes(s));
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
    if (locked && this.phase === 'paused') {
      this.phase = this.resumePhase;
    } else if (!locked && (this.phase === 'playing' || this.phase === 'reading' || this.phase === 'caught' || this.phase === 'waking')) {
      this.resumePhase = this.phase;
      this.phase = 'paused';
      this.repair = cancelCheck(this.repair); // Update 0.9 — no skill check running through a pause
      this.setRepairing(false);
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

  /** Update 0.9.4 — how its sound reaches you, re-worked out a few times a second (a path search). */
  private enemyHearing(dt: number): EnemyMix {
    this.soundIn -= dt;
    if (!this.sound || this.soundIn <= 0) {
      this.soundIn = 0.15;
      this.sound = soundPath(this.level, this.enemy.pos, this.player.pos);
    }
    return enemyHearing(this.sound);
  }

  /** Where its sound seems to come from: itself, or the corner it comes round (same distance away, so
   *  the panner's falloff is unchanged and `mix.gain` does the rest). */
  private enemySoundPos(mix: EnemyMix) {
    const real = this.enemy3D();
    const via = this.sound?.via;
    if (!mix.around || !via) return real;
    const p = this.player.pos;
    const d = dist(p, via) || 1;
    const far = dist(p, this.enemy.pos);
    const at = this.toWorld({ x: p.x + ((via.x - p.x) / d) * far, z: p.z + ((via.z - p.z) / d) * far });
    return { x: at.x, y: real.y, z: at.z };
  }

  private enemy3D() {
    const w = this.toWorld(this.enemy.pos);
    return { x: w.x, y: w.y + 1.6, z: w.z };
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
    let wdt = dt * worldTimeScale(this.phase); // Update 0.6.4 — 0 while a note is open
    if (this.phase === 'playing') {
      this.lookBack = stepLookBack(this.lookBack, dt, this.input.action('lookBack'), this.gait === 'sprint');
      wdt = dt * lookBackTimeScale(this.lookBack);
    } else if (this.lookBack.amount > 0 || this.lookBack.active) {
      this.lookBack = createLookBack();
    }
    this.player.lookBackYaw = lookBackYaw(this.lookBack);
    const scripted = this.phase === 'caught' || this.phase === 'waking';
    if (!scripted) this.body?.setVisible(!hideBodyWhileLookingBack(this.lookBack) && !this.hide); // 0.9.5: not in a locker
    this.worldT += wdt;
    this.realDt = dt;

    if (this.phase === 'playing') this.updatePlaying(wdt);
    else if (this.phase === 'reading') this.updateReading();
    else if (this.phase === 'waking') this.updateWaking(dt);
    else if (this.phase === 'caught') this.updateCaught(dt);
    else if (this.phase === 'dying') this.updateDying(dt);
    else if (this.phase === 'escaping') this.updateEscaping(dt);
    else {
      this.player.updateView(dt, 'idle', this.status, this.t);
      this.drawEnemy(0);
    }

    if (!scripted) this.body?.update({
      pos: this.player.pos,
      yaw: this.player.yaw,
      pitch: this.player.pitch,
      gait: this.gait,
      crouching: this.player.crouching,
      speed: this.speed,
      velocity: this.phase === 'playing' ? this.player.velocity : undefined,
      camera: this.camera,
      dt: this.phase === 'paused' ? 0 : wdt, // (wdt is 0 while reading)
      flashlightOn: this.status.flashlightOn,
      // Update 0.5.2 — keep the body out of the wall behind you.
      roomBehind: freeBehind(this.level, this.player.pos, this.player.forward, 1.2, BODY_RADIUS),
      injured: this.injured,
    });
    if (!scripted && this.body) this.body.root.position.y = this.player.rise; // Update 0.7 — up the stairs
    this.debugView.update(this.enemy, this.t, this.toWorld);
    this.drawThrowables();
    this.lights.update(this.t, this.curFloor);
    this.fx.set({ time: this.t, fear: this.debugView.enabled ? 0 : this.fear, injured: this.debugView.enabled ? 0 : injuredTint(this.injured, this.t - this.impactT) });
    // Update 0.9.3 — the beam thins the fog (you see further down the hall while it's on).
    // (0.9.3: on Easy the same switch is the night vision goggles.)
    this.beam += ((this.status.flashlightOn ? 1 : 0) - this.beam) * (1 - Math.exp(-dt * 5));
    this.applyAtmosphere();
    this.fx.render();
    this.input.endFrame();

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.pushHud();
    }
  };

  /** Update 0.6.4 — a note is open: nothing moves (world time is 0) until you put it down. */
  private updateReading() {
    const { input } = this;
    if (input.wasPressed('F2')) this.setDebugView(!this.debugView.enabled);
    if (closesNote({ interact: input.actionPressed('interact'), enter: input.wasPressed('Enter') || input.wasPressed('NumpadEnter'), escape: input.wasPressed('Escape') })) {
      this.note = null;
      this.phase = 'playing';
    }
  }

  private updatePlaying(dt: number) {
    this.playTime += dt;
    const { input, player, status } = this;
    player.look(input, this.settings);
    // Update 0.9.6 — if anything ever leaves you inside furniture, step out of it (you'd be stuck: no
    // move is allowed out of an overlap).
    if (!this.hide) player.pos = nearestFree(this.level, player.pos, PLAYER.radius, player.obstacles);
    // Update 0.9.5 — in a locker you don't walk: you're placed in it, and can peek or get out.
    const step = this.hide ? this.stepHiding(dt) : player.step(this.level, input, status, dt);
    // Update 0.7 — walked onto / off the stairs' portal: you're on the other floor now.
    const crossed = crossPortal(this.level, player.pos);
    if (crossed.crossed && !this.hide) player.pos = crossed.pos;
    this.syncFloor();
    player.rise = stairRise(this.level, player.pos);
    this.gait = step.gait;
    this.speed = dt > 0 ? step.moved / dt : 0;
    if (input.wasPressed('F2')) this.setDebugView(!this.debugView.enabled);
    if (input.wasPressed('F3') && this.devTools && this.debugView.enabled) this.enemyFrozen = !this.enemyFrozen;
    if (step.footstep) {
      this.audio.footstep(step.footstep.gait);
      if (step.footstep.noise > 0) this.noise = { pos: { ...player.pos }, radius: step.footstep.noise };
    }

    // Update 0.5 — rebindable: right click flashlight, left click collect / interact by default.
    if (!this.hide && input.actionPressed('flashlight') && toggleFlashlight(status)) {
      // Update 0.9.3 — on Easy the key is the night vision goggles: their own sound going on.
      if (this.rules.nightVision && status.flashlightOn) this.audio.nightVisionOn();
      else this.audio.click();
    }
    this.controlsLeft = tickControlsCard(this.controlsLeft, dt, input.wasPressed('Enter') || input.wasPressed('NumpadEnter'));
    if (this.hide) {
      // Update 0.9.5 — left click (interact) gets you out once you're all the way in.
      if (input.actionPressed('interact') && this.hide.phase === 'inside') {
        this.hide = requestExit(this.hide);
        this.audio.lockerEnter(this.lockerSound());
      }
      this.target = null;
    } else {
      if (input.actionPressed('interact')) this.interact();
      const lying = this.throwables.filter((x) => x.state === 'ground').map((x) => ({ id: x.id, kind: x.kind, pos: { x: x.pos.x, z: x.pos.z }, title: throwableTitle(x) }));
      this.target = findTarget(this.level, player.pos, player.forward, this.progress.collected, lying);
      // Update 0.9.6 — Space throws what you're holding (unless Space is busy with a skill check).
      const atRepair = this.target?.type === 'panel' && input.action('interact');
      if (this.held !== null && input.actionPressed('skillCheck') && !this.repair.check && !atRepair) this.throwHeld();
    }
    this.stepThrowables(dt);
    this.workPanel(this.realDt, !this.hide && input.action('interact'), input.actionPressed('skillCheck'));

    // Enemy.
    const before = this.enemy.pos;
    const events = this.enemyFrozen ? [] : stepEnemy(
      this.level,
      this.enemy,
      {
        dt,
        player: { pos: this.hide ? this.lockerDoorPos() : player.pos, flashlightOn: this.lightShows(), crouching: player.crouching, running: step.gait === 'sprint', hidden: hiddenFrom(this.hide), facing: player.forward, beam: this.lightShows() },
        noise: this.noise,
        fuses: this.progress.fuses,
        // Update 0.9.6 — lockers it can check, and the one you're in.
        lockers: this.enemyLockers(),
        playerLocker: this.hide && this.hide.phase !== 'exiting' ? this.hide.locker : null,
      },
      this.rng,
    );
    this.noise = null;
    const moved = Math.min(1, dist(before, this.enemy.pos)); // (a stair portal jumps its logic position)
    this.drawEnemy(moved);
    this.enemyStepAccum += moved;
    const chasing = this.enemy.mode === 'chase';
    // Update 0.4.1 — enemy sounds get darker with distance and muffled behind walls.
    // Update 0.9.4 — properly: through each wall, or round through the halls (world/soundPath.ts).
    const mix = this.enemyHearing(dt);
    const heardAt = this.enemySoundPos(mix);
    if (this.enemyStepAccum > (chasing ? 1.4 : 1.0)) {
      this.enemyStepAccum = 0;
      this.audio.enemyStep(heardAt, chasing, mix);
    }
    if (events.includes('spotted')) {
      this.audio.enemyScream(this.enemy3D());
      this.audio.stinger();
    }
    // Update 0.9.6 — checking a locker: the door swings open for a second, then shut.
    this.animateEnemyLocker(events);
    if (events.includes('foundYou') && this.hide) {
      this.leaveLockerNow(true);
      if (this.lives > 1) this.startCaught();
      else this.startDying();
      return;
    }
    if (events.includes('caught')) {
      // Update 0.9.5 — it saw you get in: it drags you out. You're put outside the locker first so the
      // grab and throw never start inside a prop.
      if (this.hide) this.leaveLockerNow(true);
      // Update 0.6 — first catch: thrown, injured. Last life: the old jumpscare.
      if (this.lives > 1) this.startCaught();
      else this.startDying();
      return;
    }

    const targetFear = fearLevel(dist(this.enemy.pos, player.pos), chasing);
    this.fear += (targetFear - this.fear) * (1 - Math.exp(-dt * 3));
    // Camera + flashlight follow in real time, so the look-back swing isn't slowed by its own slow motion.
    player.injured = this.injured; // Update 0.9.1 — heavier bob and a limp
    // Update 0.9.5 — shut in a locker it's nearly black: only a trace of the glow around your eyes.
    player.updateView(this.realDt, step.gait, status, this.t, 0, this.hide ? 0.1 + Math.max(0.9 * (1 - insideness(this.hide)), 0.5 * (peekLean(this.hide.peek).forward / LOCKER.leanForward)) : 1); // (0.9.5.1: head out, some of the glow back)
    this.easeCameraBack(this.realDt);
    // Update 0.6 — injured: a grunt every 5–7 s.
    if (this.injured) {
      this.gruntIn -= dt;
      if (this.gruntIn <= 0) {
        this.audio.grunt();
        this.gruntIn = nextGruntDelay(this.rng);
      }
    }
    this.audio.setListener(this.camAbs(), this.camForward());
    this.audio.updateEnemy(heardAt, chasing, mix);
    this.audio.tickFear(dt, this.fear, chasing);
    this.audio.tickAmbient(dt, this.camAbs());
  }

  /** Update 0.9.6 — your eyes and which way you look (logic coords), for holding and throwing. */
  private viewBasis() {
    const eye = { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
    const v = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const forward = { x: v.x, y: v.y, z: v.z };
    const flat = Math.hypot(v.x, v.z) || 1;
    const right = { x: -v.z / flat, y: 0, z: v.x / flat };
    return { eye, forward, right };
  }

  private throwHeld() {
    const it = this.throwables.find((x) => x.id === this.held);
    if (!it) return;
    const b = this.viewBasis();
    Object.assign(it, launch(it, heldPos(b.eye, b.forward, b.right), b.forward));
    this.held = null;
  }

  /** Update 0.9.6 — things in flight: gravity, and the crash (or thud) that brings it running. */
  private stepThrowables(dt: number) {
    for (let i = 0; i < this.throwables.length; i++) {
      const it = this.throwables[i];
      if (it.state !== 'flying') continue;
      const r = stepFlight(this.level, it, dt);
      this.throwables[i] = r.item;
      if (r.landing) {
        const w = this.toWorld(r.landing.at);
        if (it.kind === 'bottle') this.audio.bottleBreak({ x: w.x, y: w.y + 0.1, z: w.z });
        else this.audio.brickImpact({ x: w.x, y: w.y + 0.1, z: w.z }); // (a brick thuds both times)
        this.noise = { pos: r.landing.noise.pos, radius: r.landing.noise.radius, lure: true };
      }
    }
  }

  /** Caught with something in your hand: it drops where you stood. */
  private dropHeld() {
    const it = this.throwables.find((x) => x.id === this.held);
    if (it) Object.assign(it, { state: 'ground', pos: { x: this.player.pos.x, y: 0, z: this.player.pos.z } });
    this.held = null;
  }

  private drawThrowables() {
    const b = this.viewBasis();
    const show = this.held !== null && !this.hide && (this.phase === 'playing' || this.phase === 'paused' || this.phase === 'reading');
    const held = show ? { pos: heldPos(b.eye, b.forward, b.right), quat: this.camera.quaternion } : null;
    this.throwView.update(this.throwables, (p) => {
      const w = this.toWorld(p);
      return { x: w.x, y: w.y + p.y, z: w.z };
    }, held, this.t);
  }

  /** Update 0.9.5 — one frame in a locker: getting in / out, peeking, the camera and the door. */
  private stepHiding(dt: number) {
    const h = this.hide!;
    const l = lockerSpots(this.level)[h.locker];
    const f = propFront(l);
    const { input, player } = this;
    // Getting in while it can see you gives you away.
    const seen = h.phase === 'entering' && visibility(this.level, this.enemy, { pos: player.pos, flashlightOn: false, crouching: false }) > 0;
    const r = stepHide(h, { dt, peekHeld: input.action('skillCheck') && input.action('forward'), seen });
    this.hide = r.state;
    if (r.events.includes('peekStart')) this.audio.lockerPeek(this.lockerSound());
    if (r.events.includes('out')) {
      this.leaveLockerNow(false);
    } else {
      const inside = { x: l.x - f.x * LOCKER.eyeBack, z: l.z - f.z * LOCKER.eyeBack };
      const outside = { x: l.x + f.x * LOCKER.exitOut, z: l.z + f.z * LOCKER.exitOut };
      const k = insideness(this.hide);
      player.pos = { x: outside.x + (inside.x - outside.x) * k, z: outside.z + (inside.z - outside.z) * k };
      // Update 0.9.5.1 — peeking: your head leans out through the gap (the door hinges on your left, so
      // the gap opens on your right) and tilts with it.
      const lean = peekLean(this.hide.peek);
      const right = { x: -f.z, z: f.x }; // your right, looking out of the locker
      player.pos = { x: player.pos.x + f.x * lean.forward + right.x * lean.side, z: player.pos.z + f.z * lean.forward + right.z * lean.side };
      player.leanRoll = lean.roll;
      const facing = Math.atan2(-f.x, -f.z); // looking out of the locker
      if (this.hide.phase === 'entering') {
        // Step in and turn round to face the door.
        let d = facing - this.hideFromYaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        player.yaw = this.hideFromYaw + d * k;
        player.pitch *= 0.9;
      } else {
        const c = clampLook(player.yaw, player.pitch, facing);
        player.yaw = c.yaw;
        player.pitch = c.pitch;
      }
      this.props.setLockerDoor(h.locker, doorOpen(this.hide));
    }
    tickStatus(this.status, 'idle', dt); // still catching your breath in there
    return { gait: 'idle' as Gait, moved: 0, footstep: null };
  }

  /** Update 0.9.5 — step into locker i: the light goes off, the door shuts behind you. */
  private enterLocker(i: number) {
    const seen = visibility(this.level, this.enemy, { pos: this.player.pos, flashlightOn: this.lightShows(), crouching: this.player.crouching }) > 0;
    this.hide = startHide(i, seen, this.status.flashlightOn);
    this.hideFromYaw = this.player.yaw;
    this.status.flashlightOn = false;
    // Crouched down inside, so your head is well under the locker's roof (eases to crouch eye height).
    this.hideWasCrouching = this.player.crouching;
    this.player.crouching = true;
    this.repair = cancelCheck(this.repair);
    this.audio.lockerEnter(this.lockerSound());
  }

  /** Out of the locker, standing in front of it; `grabbed`: it pulled you out (face it, light stays off). */
  private leaveLockerNow(grabbed: boolean) {
    const h = this.hide;
    if (!h) return;
    const l = lockerSpots(this.level)[h.locker];
    const f = propFront(l);
    this.player.pos = { x: l.x + f.x * LOCKER.exitOut, z: l.z + f.z * LOCKER.exitOut };
    this.props.setLockerDoor(h.locker, 0);
    this.player.leanRoll = 0;
    this.player.crouching = grabbed ? false : this.hideWasCrouching;
    if (grabbed) {
      const d = dist(this.player.pos, this.enemy.pos) || 1;
      this.player.yaw = Math.atan2(-(this.enemy.pos.x - this.player.pos.x) / d, -(this.enemy.pos.z - this.player.pos.z) / d);
    } else if (h.lightWas && this.status.battery > 0) {
      this.status.flashlightOn = true;
    }
    this.hide = null;
  }

  /** Update 0.9.6 — the lockers as The Patient sees them: middle, and where it stands to open one. */
  private lockerCache: { center: { x: number; z: number }; stand: { x: number; z: number } }[] | null = null;
  private enemyLockers() {
    if (!this.lockerCache) {
      this.lockerCache = lockerSpots(this.level).map((l) => {
        const f = propFront(l);
        return { center: { x: l.x, z: l.z }, stand: { x: l.x + f.x * 0.95, z: l.z + f.z * 0.95 } };
      });
    }
    return this.lockerCache;
  }

  /** Update 0.9.6 — the locker it's checking (door open while it looks), with the door sound. */
  private enemyDoor: number | null = null;
  private animateEnemyLocker(events: string[]) {
    const c = this.enemy.check;
    const open = c?.phase === 'open' ? c.locker : null;
    if (this.enemyDoor !== null && this.enemyDoor !== open && this.hide?.locker !== this.enemyDoor) {
      this.props.setLockerDoor(this.enemyDoor, 0);
    }
    if (events.includes('lockerOpen') || events.includes('lockerClose')) {
      const i = events.includes('lockerOpen') ? open : this.enemyDoor;
      if (i !== null) {
        const w = this.toWorld(lockerSpots(this.level)[i]);
        this.audio.lockerEnter({ x: w.x, y: w.y + 1.2, z: w.z });
      }
    }
    if (open !== null && c) this.props.setLockerDoor(open, Math.min(1, c.t / 0.25) * 1.35);
    this.enemyDoor = open;
  }

  /** Where it goes for you when it saw you hide: right at the locker door. */
  private lockerDoorPos() {
    const l = lockerSpots(this.level)[this.hide!.locker];
    const f = propFront(l);
    return { x: l.x + f.x * 0.55, z: l.z + f.z * 0.55 };
  }

  private lockerSound() {
    const l = lockerSpots(this.level)[this.hide?.locker ?? 0];
    const w = this.toWorld(l);
    return { x: w.x, y: w.y + 1.2, z: w.z };
  }

  private camForward() {
    const v = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    return { x: v.x, y: v.y, z: v.z };
  }

  private interact() {
    const t = this.target;
    if (!t) return;
    const p = this.progress;
    if (t.type === 'throwable') {
      // Update 0.9.6 — pick it up (one at a time).
      if (this.held !== null) return;
      const it = this.throwables.find((x) => x.id === t.id);
      if (!it || it.state !== 'ground') return;
      it.state = 'held';
      this.held = it.id;
      this.audio.pickup();
      return;
    }
    if (t.type === 'item') {
      p.collected.push(t.item.id);
      this.view.items.get(t.item.id)!.visible = false;
      if (t.item.kind === 'fuse') {
        p.fuses++;
        this.audio.pickup();
        this.toastMsg(`Fuse found (${p.fuses}/${p.panels.length})`);
      } else if (t.item.kind === 'battery') {
        addBattery(this.status);
        this.audio.pickup();
        this.toastMsg('Battery +45%');
      } else {
        this.audio.paper();
        p.notesRead.push(t.item.noteIndex!);
        // Update 0.6.4 — reading pauses the whole game (updateReading) until you put it down.
        this.note = { text: this.level.notes[t.item.noteIndex!] };
        this.phase = 'reading';
        this.target = null;
      }
    } else if (t.type === 'generator') {
      // Update 0.9 — all four panels live → the generator starts and the lights come back.
      const r = startGenerator(p);
      if (r === 'powered') {
        const g = this.view.generatorPos;
        this.audio.generatorStart({ x: g.x, y: g.y, z: g.z });
        this.lights.setPowered(this.t);
        this.applyAtmosphere(); // with the lights back you can see further down the halls
        this.toastMsg('The lights come on. Something screams in the dark.', 5);
        // Update 0.6.4 — it vanishes to a random corner, screams, and sprints for the generator:
        // your window to get out of the room.
        summonToGenerator(this.level, this.enemy, this.player.pos, this.rng);
        this.audio.powerScream();
        this.stingerTimer = window.setTimeout(() => this.audio.stinger(), 1200);
      } else if (r === 'panels') {
        this.audio.denied();
        this.toastMsg('Dead. The panels need power first.');
      }
    } else if (t.type === 'panel') {
      // Update 0.9 — an electrical panel: fit a fuse (press), repair it (hold, workPanel), switch it on (press).
      const i = t.index;
      const panel = p.panels[i];
      const box = panelSpots(this.level)[i];
      const at = this.toWorld(box);
      if (!panel.fuse) {
        if (fitFuse(p, i) === 'fitted') {
          this.audio.fuseInsert({ x: at.x, y: at.y + box.y, z: at.z });
          this.toastMsg('Fuse fitted.');
        } else {
          this.audio.denied();
          this.toastMsg('It needs a fuse.');
        }
      }
    } else if (t.type === 'locker') {
      this.enterLocker(t.index); // Update 0.9.5
    } else if (t.type === 'switch') {
      // Update 0.9.1 — throw the switch of a repaired panel. It clacks: The Patient walks over if it's near.
      const i = t.index;
      const sw = panelSwitches(this.level)[i];
      const s = this.toWorld(sw);
      if (throwPanelSwitch(p, i) === 'on') {
        this.audio.breakerSwitch({ x: s.x, y: s.y + sw.y, z: s.z });
        this.props.setSwitch(i, true);
        this.noise = { pos: { x: sw.x, z: sw.z }, radius: SKILL.switchNoise };
        this.toastMsg('The panel hums. It\'s live.');
      } else if (!p.panels[i]?.on) {
        this.audio.denied();
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

  /**
   * Update 0.9 — working on an electrical panel: hold interact to repair it, Space (skill check key) when
   * the circle comes up (state/skillCheck.ts). A miss blows it: a bang The Patient hears, lost progress.
   * Its door swings open while you work. Timing uses the real clock, the same one the circle is drawn with.
   */
  private workPanel(dt: number, held: boolean, press: boolean) {
    const p = this.progress;
    const t = this.target;
    const i = t?.type === 'panel' ? t.index : -1;
    const panel = i >= 0 ? p.panels[i] : null;
    const working = !!panel && panel.fuse && !panel.fixed;
    if (working && panel) {
      if (i !== this.sparkPanel) this.repair = cancelCheck(this.repair);
      this.sparkPanel = i;
      const box = panelSpots(this.level)[i];
      const w = this.toWorld(box);
      const where = { x: w.x, y: w.y + box.y, z: w.z };
      const now = performance.now() / 1000;
      const r = stepRepair(panel.repair, this.repair, { dt, now, holding: held, press }, this.rng);
      panel.repair = r.progress;
      this.repair = r.state;
      const busy = held && now >= r.state.deadUntil;
      if (busy) this.panelOpen[i] = Math.min(1, (this.panelOpen[i] ?? 0) + dt * 2.5);
      this.setRepairing(busy, where);
      for (const e of r.events) {
        if (e === 'warn') this.audio.skillWarning();
        else if (e === 'good') this.audio.skillGood();
        else if (e === 'great') this.audio.skillGreat();
        else if (e === 'noise') this.noise = this.noise ?? { pos: { ...this.player.pos }, radius: SKILL.workNoise };
        else if (e === 'miss') {
          this.audio.panelExplode(where);
          this.sparkFlash = 1;
          this.fear = Math.min(1, this.fear + 0.35);
          // Update 0.9.1 — heard anywhere, and it runs there.
          this.noise = { pos: { x: box.x, z: box.z }, radius: SKILL.bangNoise, run: true };
        } else if (e === 'done' && finishRepair(p, i)) {
          this.setRepairing(false);
          this.audio.panelClunk(where);
          this.toastMsg('Repaired. Switch it on.', 4);
        }
      }
    } else {
      if (this.repair.check) this.repair = cancelCheck(this.repair);
      this.setRepairing(false);
    }
    // Sparks: a crackle of light while it's dead after a miss, a flash when it blows.
    this.sparkFlash = Math.max(0, this.sparkFlash - dt * 2.2);
    const dead = performance.now() / 1000 < this.repair.deadUntil;
    const flicker = dead && Math.random() < 0.4 ? 1 + Math.random() * 4 : 0;
    this.props.setSpark(this.sparkPanel, flicker + this.sparkFlash * 14);
    // Doors of repaired panels swing shut again.
    p.panels.forEach((x, k) => {
      if (x.fixed && (this.panelOpen[k] ?? 0) > 0) this.panelOpen[k] = Math.max(0, this.panelOpen[k] - dt * 1.5);
      this.props.setPanelOpen(k, this.panelOpen[k] ?? 0);
    });
  }

  private setRepairing(on: boolean, at?: { x: number; y: number; z: number }) {
    if (on === this.repairing) return;
    this.repairing = on;
    this.audio.setRepairLoop(on, at);
  }

  /** Update 0.6 — first catch: grab, lift, throw, get up injured (engine/caughtScene.ts). */
  private startCaught() {
    this.dropHeld(); // Update 0.9.6
    this.phase = 'caught';
    this.lives--;
    this.toast = null;
    this.note = null;
    this.target = null;
    this.camReturn = null;
    this.caught = createCaughtScene({
      level: this.level,
      camera: this.camera,
      enemyView: this.enemyView,
      body: () => this.body,
      playerPos: { ...this.player.pos },
      eyeHeight: this.camera.position.y,
      enemyPos: { ...this.enemy.pos },
      blockers: this.player.obstacles,
    });
  }

  private updateCaught(dt: number) {
    const scene = this.caught;
    if (!scene) return;
    this.fear = Math.max(0, this.fear - dt * 0.15);
    for (const cue of scene.update(dt, this.worldT)) {
      if (cue === 'caught') this.audio.caught();
      else if (cue === 'launch') this.audio.thrownScream();
      else if (cue === 'impact') {
        this.audio.floorImpact();
        this.impactT = this.t;
        this.injured = true; // the red creeps in while you're still on the floor
      } else if (cue === 'getUp') {
        // Update 0.6.1 — the first grunt as you start getting up; then every 15–25 s.
        this.audio.grunt();
        this.gruntIn = nextGruntDelay(this.rng);
      } else if (cue === 'teleport') {
        // Gone before you're back on your feet.
        teleportAway(this.level, this.enemy, scene.endPos);
        scene.enemyMoved({ ...this.enemy.pos });
      } else if (cue === 'done') {
        this.endCaught(scene);
        return;
      }
    }
    this.player.updateLight(dt, this.status);
    this.fx.set({ lids: eyelids(scene.t) });
    this.audio.setListener(this.camAbs(), this.camForward());
    this.audio.updateEnemy(this.enemy3D(), false);
  }

  private endCaught(scene: CaughtScene) {
    const view = scene.lastView();
    this.fx.set({ lids: 0 });
    // Update 0.9.6 — never left standing inside furniture after the throw.
    this.player.pos = nearestFree(this.level, crossPortal(this.level, scene.endPos).pos, PLAYER.radius, this.player.obstacles);
    this.syncFloor();
    this.player.yaw = scene.bodyYaw;
    this.player.pitch = 0;
    this.caught = null;
    this.injured = true;
    this.camReturn = { pos: view.pos, quat: view.quat, t: 0 };
    this.noise = null;
    this.input.clear();
    this.phase = 'playing';
  }

  /** After getting up, ease from the body's eyes back into normal first person. */
  private easeCameraBack(dt: number) {
    const r = this.camReturn;
    if (!r) return;
    r.t += dt;
    const k = Math.min(1, r.t / CAUGHT.cameraReturn);
    const e = k * k * (3 - 2 * k);
    this.camera.position.lerpVectors(r.pos, this.camera.position, e);
    this.camera.quaternion.slerpQuaternions(r.quat, this.camera.quaternion, e);
    this.camera.updateMatrixWorld();
    this.player.updateLight(0, this.status);
    if (k >= 1) this.camReturn = null;
  }

  private startDying() {
    this.dropHeld(); // Update 0.9.6
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
    this.enemyView.root.position.set(ePos.x, p.rise, ePos.z);
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
      // Update 0.7 — out of this level: wake up in the next one. Out of the last: you escaped.
      if (this.levelIndex + 1 < LEVELS.length) {
        this.loadLevel(this.levelIndex + 1);
        return;
      }
      this.phase = 'over';
      if (document.pointerLockElement) document.exitPointerLock();
      this.cb.onEnd('escaped', this.playTime);
    }
  }

  /** Update 0.9 — announce a new objective big at the top of the screen (a few seconds). */
  private bannerHud(): HudState['banner'] {
    if (this.phase === 'playing' || this.phase === 'reading') {
      const now = objectiveText(this.progress);
      if (now !== this.lastObjective) {
        this.lastObjective = now;
        // A different step: "new objective"; same step, new count (a panel came on): "updated";
        // the same again (waking up after it caught you): a reminder.
        const step = (s: string) => s.replace(/\d+/g, '#');
        const was = this.lastObjectiveShown;
        const label = was === now ? 'Objective' : was && step(was) === step(now) ? 'Objective updated' : 'New objective';
        this.lastObjectiveShown = now;
        this.banner = { text: now, label, key: (this.banner?.key ?? 0) + 1, until: performance.now() / 1000 + 5 }; // real time, like its CSS animation
      }
    }
    if (this.banner && (performance.now() / 1000 > this.banner.until || this.phase === 'caught' || this.phase === 'dying')) this.banner = null;
    return this.banner ? { text: this.banner.text, label: this.banner.label, key: this.banner.key } : null;
  }

  /** Update 0.9 — the repair bar + skill check circle while you're at a panel that needs repairing. */
  private repairHud(): HudState['repair'] {
    const p = this.progress;
    const t = this.target;
    const panel = this.phase === 'playing' && t?.type === 'panel' ? p.panels[t.index] : null;
    if (!panel || !panel.fuse || panel.fixed) return (this.lastRepairHud = null);
    const r = this.repair;
    const check = r.check ? { spinAtMs: r.check.spinAt * 1000, zone: r.check.zone } : null;
    const next = { progress: Math.round(panel.repair * 50) / 50, dead: performance.now() / 1000 < r.deadUntil, check };
    const l = this.lastRepairHud;
    if (l && l.progress === next.progress && l.dead === next.dead && l.check?.spinAtMs === check?.spinAtMs) return l;
    return (this.lastRepairHud = next);
  }
  private lastRepairHud: HudState['repair'] = null;

  /** Same object while the words don't change, so the HUD doesn't re-render for nothing. */
  private currentPrompt(): Prompt | null {
    const next = this.phase === 'playing' ? promptFor(this.target, this.progress, !!this.note, this.held !== null) : null;
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
      nightVision: this.rules.nightVision,
      hiding: this.hide?.phase === 'inside',
      holding: this.held !== null && !this.hide && this.phase === 'playing' ? (this.throwables.find((x) => x.id === this.held)?.kind ?? null) : null,
      stamina: Math.round((s.stamina / 4.5) * 100) / 100,
      exhausted: s.exhausted,
      objective: objectiveText(this.progress),
      objectiveDetail: objectiveDetail(this.progress),
      banner: this.bannerHud(),
      prompt: this.currentPrompt(),
      bindings: this.settings.bindings,
      controls: this.phase === 'playing' || this.phase === 'paused' ? Math.ceil(this.controlsLeft * 10) / 10 : 0,
      repair: this.repairHud(),
      toast: this.toast?.text ?? null,
      note: this.note?.text ?? null,
      fear: Math.round(this.fear * 20) / 20,
      time: Math.floor(this.playTime),
      started: this.phase !== 'intro',
      intro: this.phase === 'intro' ? 1 : this.phase === 'waking' && this.wake ? Math.round(wakeTextOpacity(this.wake.t) * 20) / 20 : 0,
      introText: this.level.intro,
      debug: this.debugView.enabled
        ? debugLines({
            fps: this.fps,
            cell: worldToCell(this.player.pos),
            enemyMode: this.enemy.mode,
            alert: this.enemy.alert,
            windup: this.enemy.windup,
            distance: dist(this.enemy.pos, this.player.pos),
            seesYou: visibility(this.level, this.enemy, { pos: this.player.pos, flashlightOn: this.lightShows(), crouching: this.player.crouching }) > 0,
            frozen: this.enemyFrozen,
            fuses: this.progress.fuses,
            panels: `${this.progress.panels.filter((x) => x.on).length}/${this.progress.panels.length}`,
            powered: this.progress.powered,
            teleportIn: this.enemy.mode === 'chase' ? null : ENEMY.teleportAfter - this.enemy.sinceSpotted,
            lives: this.lives,
            injured: this.injured,
          })
        : null,
      cinematic: this.phase === 'waking' || this.phase === 'caught' || this.phase === 'dying' || this.phase === 'escaping' || this.phase === 'over',
    });
  }

  /** Debug helpers for automated checks (only exposed with ?debug). `floor` (Update 0.7): 0 = ground. */
  debugTeleport(col: number, row: number, yaw?: number, floor = 0) {
    this.player.pos = cellCenter({ col, row: row + floor * floorStride(this.level) });
    if (yaw !== undefined) this.player.yaw = yaw;
    this.syncFloor();
  }
  /** Update 0.7 — skip ahead to the next level (wakes up there). */
  debugNextLevel() {
    if (this.levelIndex + 1 < LEVELS.length) this.loadLevel(this.levelIndex + 1);
  }
  debugPlace(x: number, z: number, yaw: number, pitch = 0) {
    this.player.pos = { x, z };
    this.syncFloor();
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
  debugEnemy(col: number, row: number, floor = 0) {
    this.enemy.pos = cellCenter({ col, row: row + floor * floorStride(this.level) });
  }
  /** Update 0.6 — ?debug: get caught right now (it appears 1 m in front of you). */
  debugCatch() {
    const f = this.player.forward;
    this.enemy.pos = { x: this.player.pos.x + f.x, z: this.player.pos.z + f.z };
    if (this.lives > 1) this.startCaught();
    else this.startDying();
  }
  debugState() {
    return { lives: this.lives, injured: this.injured, caughtT: this.caught?.t ?? null, wakeT: this.wake?.t ?? null, caughtEnd: this.caught?.endPos ?? null, phase: this.phase, level: this.levelIndex + 1, floor: this.curFloor, enemyFloor: floorAt(this.level, this.enemy.pos), rise: this.player.rise, enemy: { ...this.enemy, path: undefined }, progress: this.progress, repair: this.repair, hide: this.hide, throwables: this.throwables, held: this.held, status: this.status, pos: this.player.pos };
  }

  /** Update 0.3 — F2: full light, no fog or screen FX, enemy marked through walls. */
  private setDebugView(on: boolean) {
    if (on && !this.devTools) return; // sealed in the public build
    this.debugView.setEnabled(on);
    if (!on) this.enemyFrozen = false;
    this.applyAtmosphere();
  }

  /** Update 0.9.3 — is there a beam it can see? The goggles (Easy) give off no light. */
  private lightShows() {
    return this.status.flashlightOn && !this.rules.nightVision;
  }

  private applyAtmosphere() {
    const dbg = this.debugView.enabled;
    // Update 0.4.4 — state/lightLevels.ts. 0.9.3: blended with the goggles (Easy) or the flashlight beam.
    const nv = this.rules.nightVision ? this.beam : 0;
    const a = blendAtmosphere(this.progress.powered, dbg, nv, this.rules.nightVision ? 0 : this.beam);
    (this.scene.fog as THREE.FogExp2).density = a.fog;
    this.ambient.intensity = a.ambient;
    this.renderer.toneMappingExposure = a.exposure;
    this.fx.set({ clean: dbg, night: nv });
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
    this.props.dispose();
    this.throwView.dispose();
    this.player.dispose(this.scene);
    this.fx.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
