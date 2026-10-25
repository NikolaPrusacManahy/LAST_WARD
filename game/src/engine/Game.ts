// Game façade: owns the renderer and frame loop, wires world rules → visuals → audio → HUD.
// Keep it a façade: new mechanics go in their own module.
import * as THREE from 'three';
import { LEVELS } from '../world/content/levels';
import { Level, Vec2, WALL_HEIGHT, cellCenter, crossPortal, dist, floorAt, floorOffset, floorStride, itemPos, parseLevel, stairRise, worldToCell } from '../world/level';
import { ENEMY, EnemyState, Noise, PlayerSense, chaseSees, dropFromCeiling, spawnAtCorner, stepEnemy, summonToGenerator, teleportAway, visibility } from '../world/enemyAI';
import { CRAWL_LIFT, crawlPose } from './enemyAnim';
import { CAUGHT, ENEMY_THROW_SPEED, LIVES, caughtTimes, eyelids, injuredTint, nextGruntDelay } from '../state/caughtSequence';
import { CaughtScene, createCaughtScene } from './caughtScene';
import { HitScene, createHitScene } from './hitScene';
import { HIT, hitBlack, hitLids, hitTimes } from '../state/hitSequence';
import { WakeScene, createWakeScene } from './wakeScene';
import { wakeEyelids, wakeLight, wakeTextOpacity } from '../state/wakeSequence';
import { shuffleItems } from '../world/itemShuffle';
import { LookBack, createLookBack, hideBodyWhileLookingBack, lookBackYaw, stepLookBack } from '../state/lookBack';
import { createRng } from '../world/rng';
import { findTarget, Target } from '../world/interact';
import { PING, PingMark, inCrosshair, pingRay, snapPing } from '../world/ping';
import { CONTROLS_CARD_SECONDS, Hand, Prompt, promptFor, samePrompt, tickControlsCard } from '../state/prompts';
import { LIGHT, atmosphereFor, blendAtmosphere } from '../state/lightLevels';
import { Gait, PLAYER, PlayerStatus, addBattery, createPlayerStatus, fearLevel, tickStatus, toggleFlashlight } from '../state/playerRules';
import { debugLines } from '../state/debugInfo';
import { mixVolumes, pixelRatioFor } from '../state/settings';
import { DIFFICULTY, DifficultyRules } from '../state/difficulty';
import { spawnSpot } from '../state/coop';
import type { CoopStart } from '../net/room';
import { CoopRuntime } from './coopRuntime';
import { VoiceClips } from '../audio/voiceClips';
import { micIfAllowed } from '../net/voice';
import type { ItemNet, PanelNet, PowerNet } from '../net/runSync';
import { DOWN, KNEEL, LifeState, LiveState, MIMIC, MIMIC_SOLO_TEST, Member, ResumeState, catchOutcome, kneelAt, mimicNow, nextWatch, reviveFree, runOver, teamEscaped, watchable } from '../state/coopRun';
import { wakeTimes } from '../state/wakeSequence';
import { RunPhase, closesNote, guardLeave, worldTimeScale } from '../state/session';
import { chooseStartLevel, debugFlag, devToolsEnabled } from '../state/devTools';
import { Progress, allPanelsOn, createProgress, finishRepair, fitFuse, objectiveDetail, objectiveText, startGenerator, throwPanelSwitch, tryExit } from '../state/objectives';
import { RepairState, SKILL, cancelCheck, createRepair, stepRepair } from '../state/skillCheck';
import { lockerSpots, panelSpots, panelSwitches, propFront } from '../world/props';
import { Throwable, heldPos, isThrowable, launch, spawnTableItems, spawnThrowables, stepFlight, throwableTitle } from '../state/throwables';
import { staminaShare } from '../state/hudLayout';
import { Inventory, MEDKIT_SECONDS, SLOTS, createInventory, dropSpot, inHand, isFull, remove, selectSlot, store } from '../state/inventory';
import { ThrowablesView, createThrowablesView } from './throwablesView';
import { HideState, LOCKER, clampLook, doorOpen, hiddenFrom, insideness, peekLean, requestExit, seesYouGetIn, startHide, stepHide } from '../state/hiding';
import { createPropsView, PropsView } from './propsView';
import type { Settings } from '../state/settings';
import { AudioEngine } from '../audio/audio';
import { EnemyMix, enemyHearing } from '../audio/spatial';
import { SoundPath, soundPath } from '../world/soundPath';
import { lineOfSight } from '../world/lineOfSight';
import { freeBehind, moveWithCollision, nearestFree } from '../world/collision';
import { BODY_RADIUS } from './playerAnim';
import { buildLevel, LevelView } from './buildLevel';
import { createEnemyView, EnemyView } from './enemyView';
import { loadEnemyModel } from './enemyModel';
import { createLighting, Lighting } from './lighting';
import { createPostFx, PostFx } from './postfx';
import { Input } from './input';
import { PlayerController, StepResult } from './playerController';
import { HudStore, HudState } from './hudStore';
import { loadPlayerBody, PlayerBody } from './playerBody';
import { createDebugView, DebugView } from './debugView';

type Phase = RunPhase;

/** Update 0.9.9 — how a co-op run ended: everyone's fate, and why if it was cut short. */
export interface CoopEnd {
  team: Member[];
  /** How it ended for you. */
  mine: LifeState;
  note?: string;
}

export interface GameCallbacks {
  onEnd(result: 'dead' | 'escaped', seconds: number, coop?: CoopEnd): void;
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
  /** Update 0.5.4 — look over your shoulder on the run (0.9.9: no slow motion any more). */
  private lookBack: LookBack = createLookBack();
  /** World clock: stops while a note is open (this.t stays real time). */
  private worldT = 0;
  private realDt = 0;
  /** Update 0.9.5 — hiding in a locker (null when not), and the way you were facing as you got in. */
  private hide: HideState | null = null;
  private hideFromYaw = 0;
  private hideWasCrouching = false;
  /** Update 0.9.6 — bricks and bottles, the one in your hand, and their drawing. */
  private throwables: Throwable[] = [];
  /** Update 0.9.8 — your three slots, and how long you've held the med kit's use (s). */
  private inv: Inventory = createInventory();
  private useT = 0;
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
  // Update 0.9.9 — co-op: the run beside this game (teammates, the shared Patient), where you are in it
  // (down, out…), getting a teammate up, who you watch once you're out.
  private rt: CoopRuntime | null = null;
  private life: LifeState = 'up';
  private bleed = 0;
  /** Down: where you are (you can crawl) and whether you're moving. */
  private downAt: { pos: Vec2; yaw: number; moving: boolean } | null = null;
  private crawlAccum = 0;
  /** Update 0.9.9 — hit on your last life: the blow, the flight, the slam (`down`: co-op Normal, you live). */
  private hit: HitScene | null = null;
  private hitDown = false;
  /** Out: where you fell (your body stays there for the others), and the slump when your minute ran out. */
  private outAt: Vec2 | null = null;
  private bledOut: number | null = null;
  private watching: string | null = null;
  private reviving: { id: string; name: string; t: number } | null = null;
  /** Just got this teammate up: don't start again on them while their "done" reaches them. */
  private revivedJust: { id: string; until: number } | null = null;
  /** 0 standing … 1 on one knee getting a teammate up: how far your eyes have gone down with your body. */
  private kneel = 0;
  private kneelEye = new THREE.Vector3();
  /** Shared world from the others: who holds / threw each item, who's repairing each panel, its bangs. */
  private itemBy = new Map<number, string>();
  private thrownByMe = new Set<number>();
  private panelBy: (string | null)[] = [];
  private panelBangs: number[] = [];
  private repairClaim = -1;
  private repairSendIn = 0;
  private coopEnded = false;
  /** Update 0.9.9 — keeps the run going while this tab is hidden (see `backgroundTick`). */
  private bgWorker: Worker | null = null;
  private bgLast = 0;
  /** When the frame loop last ran (performance.now ms). */
  private lastFrameAt = 0;
  /** Update 0.9.9 — when you may ping (F) again. */
  private pingReady = 0;
  /** Update 0.9.9 — test build, solo: your lines, your microphone's level, when it next mimics you. */
  private soloClips: VoiceClips | null = null;
  private soloMic: (() => number) | null = null;
  private soloMimicIn = 0;

  constructor(
    private container: HTMLElement,
    private settings: Settings,
    private hud: HudStore,
    private cb: GameCallbacks,
    /** Update 0.7.1 — tester level picker / ?level=N; the public build always starts at 0. */
    startLevel = 0,
    /** Update 0.9.9 — a co-op run: the room's difficulty, and where in the spawn room you wake up. */
    private coop: CoopStart | null = null,
  ) {
    this.rules = DIFFICULTY[coop?.difficulty ?? settings.difficulty];
    this.lives = this.rules.lives;
    this.status = createPlayerStatus(this.rules.batteryDrainMul);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    // Update 0.9.9 — Settings → Video → Graphics (Low: 0.75× resolution, no shadows).
    this.renderer.setPixelRatio(pixelRatioFor(settings.graphics, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = settings.graphics !== 'low';
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
    // Update 0.9.9 — co-op: the room's seed, so everyone's tables hold the same things.
    this.level = shuffleItems(parseLevel(LEVELS[this.levelIndex]), coop ? createRng(coop.seed) : this.rng);
    this.scene.add(this.world);
    this.view = buildLevel(this.level);
    this.world.add(this.view.root);
    this.props = createPropsView(this.level, this.view);
    this.world.add(this.props.root);
    this.throwView = createThrowablesView(); // Update 0.9.6
    this.world.add(this.throwView.root);
    this.throwables = [...spawnThrowables(this.level.throwables), ...spawnTableItems(this.level, 1000)]; // 0.9.8: and what's on the tables
    this.repair = createRepair(this.rng);
    this.progress = createProgress(panelSpots(this.level).length);
    this.lights = createLighting(this.view);
    this.player = new PlayerController(this.level, this.camera, this.scene);
    this.player.nightVision = this.rules.nightVision; // Update 0.9.3 — Easy: right click is the goggles, no beam
    this.player.baseFov = settings.fov;
    this.placeAtSpawn();
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
    if (coop) this.startCoop(coop);
    // Update 0.9.9 — rejoining: you're already where (and as) you were, even on the click-to-begin screen,
    // so the others don't see you standing at the spawn; `begin` puts you back in it.
    const r = coop?.resume;
    if (r) {
      this.player.pos = { ...r.pos };
      this.player.yaw = r.yaw;
      this.lives = Math.max(1, r.lives);
      this.injured = r.injured;
      this.life = r.life === 'caught' ? 'up' : r.life;
      this.bleed = r.bleed;
      if (r.life === 'down') this.downAt = { pos: { ...r.pos }, yaw: r.yaw, moving: false };
      if (r.life === 'out' || r.life === 'escaped') this.outAt = { ...r.pos };
    }

    document.addEventListener('pointerlockchange', this.onLockChange);
    if (this.debug) window.addEventListener('keydown', this.onDebugEsc);
    window.addEventListener('beforeunload', this.onBeforeUnload);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.pushHud(true);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    if (this.debug) (window as unknown as { __lastWard: Game }).__lastWard = this;
  }

  /** Update 0.9.9 — in co-op each slot wakes up on its own spot, side by side (state/coop.ts). */
  private placeAtSpawn() {
    if (this.coop) this.player.pos = spawnSpot(this.level, this.coop.slot, PLAYER.radius);
  }

  /** Must be called from a click (user gesture) — starts audio and grabs the mouse. */
  begin() {
    void this.audio.resume();
    this.audio.startAmbience();
    this.audio.startEnemyBreath(this.enemy3D());
    this.startSoloMimic();
    // Update 0.9.9 — rejoining: straight back where you were (no waking up again).
    if (this.coop?.resume) this.resumeRun(this.coop.resume);
    else this.startWake();
    void this.lockPointer();
    this.rt?.begin(); // Update 0.9.9 — the host's Patient starts moving once the host is in
  }

  /** Update 0.6.3 — you come to on the floor first (engine/wakeScene.ts); the run starts once you're up. */
  private startWake() {
    this.phase = 'waking';
    this.audio.wakeUp(); // Update 0.9.6.1 — the wake-up recording plays over the whole scene
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
    this.throwables = [...spawnThrowables(this.level.throwables), ...spawnTableItems(this.level, 1000)]; // 0.9.8: and what's on the tables
    this.inv = createInventory();
    this.useT = 0;
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
    this.placeAtSpawn();
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
    const crawl = crawlPose(this.enemy.crawl); // Update 0.9.7 — up on the ceiling
    this.enemyView.update({ x: r.x, z: r.z }, this.enemy.dir, this.enemy.mode, moved, this.worldT, this.enemy.windup > 0, crawl);
    this.enemyView.root.position.y = r.y + (crawl ? crawl.lift * CRAWL_LIFT : 0);
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
      if (cue === 'done') {
        const view = scene.lastView();
        this.wake = null;
        this.fx.set({ lids: 0 });
        // Update 0.9.7 — the get-up moves you (its hips travel back over your feet): you're where you got up.
        this.player.pos = nearestFree(this.level, { x: view.pos.x, z: view.pos.z }, PLAYER.radius, this.player.obstacles);
        this.camReturn = { pos: view.pos, quat: view.quat, t: 0 };
        this.player.pitch = 0;
        this.input.clear();
        this.phase = 'playing';
        this.lastObjective = ''; // Update 0.9 — the first objective is announced in the banner
        // Update 0.5 — controls card, Enter closes it (Update 0.7: first level only; 0.9.9: not after a revive).
        if (this.levelIndex === 0 && this.playTime === 0) this.controlsLeft = CONTROLS_CARD_SECONDS;
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
    const ok = await this.lockPointer();
    // ?debug in a browser that won't lock the mouse: carry on without it (co-op never left its phase).
    if (ok && !this.rt && this.phase === 'paused' && document.pointerLockElement !== this.renderer.domElement) this.unpause();
    return ok;
  }

  /** Update 0.9.9 — ?debug locks the mouse too (it never did: the cursor stayed and Esc couldn't pause).
   *  Only a browser that never locks it (an automated test browser) plays on without it. */
  private async lockPointer(): Promise<boolean> {
    try {
      await this.renderer.domElement.requestPointerLock();
      return true;
    } catch {
      return this.debug && !this.lockedOnce; // browsers refuse re-lock for ~1 s after Esc; the pause menu stays up
    }
  }

  /** Has the browser ever locked the mouse for us? */
  private lockedOnce = false;

  /** Update 0.9.9 — ?debug without the mouse locked: Esc still pauses (with it locked, letting go does). */
  private onDebugEsc = (e: KeyboardEvent) => {
    if (e.code === 'Escape' && !document.pointerLockElement) this.onLockChange();
  };

  private unpause() {
    this.phase = this.resumePhase;
    if (this.phase === 'waking' && this.wake) this.audio.wakeUp(this.wake.t); // Update 0.9.6.1 — from where the scene is
  }

  setSettings(s: Settings) {
    if (s.soloMimic && !this.settings.soloMimic && this.phase !== 'intro') queueMicrotask(() => this.startSoloMimic());
    if (s.graphics !== this.settings.graphics) {
      this.renderer.setPixelRatio(pixelRatioFor(s.graphics, window.devicePixelRatio));
      this.fx.composer.setPixelRatio(pixelRatioFor(s.graphics, window.devicePixelRatio));
      this.renderer.shadowMap.enabled = s.graphics !== 'low';
      // Every material is rebuilt with or without shadows (a moment's hitch, once).
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (m) for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
      });
      this.resize();
    }
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
    if (locked) this.lockedOnce = true;
    // Update 0.9.9 — co-op: Esc opens the menu but nothing stops (the ward goes on for everyone); with no
    // mouse you just stand there.
    if (this.rt) {
      if (!locked && this.phase !== 'over' && this.phase !== 'intro') {
        this.repair = cancelCheck(this.repair);
        this.setRepairing(false);
        this.input.clear();
        this.cb.onPause();
      }
      return;
    }
    if (locked && this.phase === 'paused') {
      this.unpause();
    } else if (!locked && (this.phase === 'playing' || this.phase === 'reading' || this.phase === 'caught' || this.phase === 'waking')) {
      this.resumePhase = this.phase;
      this.phase = 'paused';
      this.audio.stopWakeUp(); // Update 0.9.6.1 — the wake-up recording waits for the resume too
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
    // Update 0.9.7 — on the ceiling its sounds come from up there (its head hangs ~0.5 m under it).
    const lift = crawlPose(this.enemy.crawl)?.lift ?? 0;
    return { x: w.x, y: w.y + 1.6 + lift * (WALL_HEIGHT - 0.5 - 1.6), z: w.z };
  }

  private toastMsg(text: string, seconds = 3) {
    this.toast = { text, until: this.t + seconds };
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    this.lastFrameAt = performance.now();
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

    // Update 0.5.4 — Q while running: the camera swings round. (Update 0.9.9 — time no longer slows down
    // for a moment, solo either: Nikola, just looking back is fine.)
    const wdt = dt * worldTimeScale(this.phase, !!this.rt); // Update 0.6.4 — 0 while a note is open
    if (this.phase === 'playing') {
      this.lookBack = stepLookBack(this.lookBack, dt, this.input.action('lookBack'), this.gait === 'sprint');
    } else if (this.lookBack.amount > 0 || this.lookBack.active) {
      this.lookBack = createLookBack();
    }
    this.player.lookBackYaw = lookBackYaw(this.lookBack);
    // (0.9.9: the hit flies your body too: `dying` is filmed like the throw, not the normal first-person body.)
    const scripted = this.phase === 'caught' || this.phase === 'waking' || this.phase === 'down' || this.phase === 'dying';
    if (!scripted) this.body?.setVisible(!hideBodyWhileLookingBack(this.lookBack) && !this.hide && this.phase !== 'spectating'); // 0.9.5: not in a locker
    this.worldT += wdt;
    this.realDt = dt;

    if (this.phase === 'playing') this.updatePlaying(wdt);
    else if (this.phase === 'reading') this.updateReading();
    else if (this.phase === 'waking') this.updateWaking(dt);
    else if (this.phase === 'caught') this.updateCaught(dt);
    else if (this.phase === 'dying') this.updateDying(dt);
    else if (this.phase === 'escaping') this.updateEscaping(dt);
    else if (this.phase === 'down') this.updateDown(dt);
    else if (this.phase === 'spectating') this.updateSpectating(dt);
    else {
      this.player.updateView(dt, 'idle', this.status, this.t);
      if (!this.rt) this.drawEnemy(0);
    }
    if (this.rt && !this.disposed) this.coopFrame(dt);
    // Update 0.9.6.1 — your breathing while you sprint (off whenever you aren't: paused, caught, in a locker…).
    this.audio.setRunBreath(this.gait === 'sprint');
    this.audio.setDownBreath(this.phase === 'down' && this.bledOut === null); // Update 0.9.9

    const kneelBy = this.reviving && !scripted && this.phase !== 'spectating' ? this.revivingNow() : null;
    const kneelYaw = kneelBy ? kneelAt(this.player.pos, kneelBy).yaw : 0;
    if (kneelBy) {
      // Update 0.9.9 — getting a teammate up: on one knee at their side, your hands on their back.
      this.body?.cinematic({ clip: 'revive', fade: KNEEL.fade, pos: this.player.pos, yaw: kneelYaw, dt: this.phase === 'paused' ? 0 : wdt });
    } else if (!scripted && this.phase !== 'spectating') this.body?.update({
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
    // Update 0.9.9 — your eyes go down as you kneel, over your hands (and back up after); you look round as usual.
    this.kneel += ((kneelBy ? 1 : 0) - this.kneel) * (1 - Math.exp(-dt / (KNEEL.fade / 3)));
    if (kneelBy) this.kneelEye.set(this.player.pos.x - Math.sin(kneelYaw) * KNEEL.eyeAhead, this.player.rise + KNEEL.eye, this.player.pos.z - Math.cos(kneelYaw) * KNEEL.eyeAhead);
    if (this.kneel > 0.001 && !scripted && this.phase !== 'spectating') {
      this.camera.position.lerp(this.kneelEye, this.kneel);
      this.camera.updateMatrixWorld();
      this.player.updateLight(0, this.status);
    }
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
    player.teammates = this.rt ? this.rt.blockers() : []; // Update 0.9.9
    // Update 0.9.6 — if anything ever leaves you inside furniture, step out of it (you'd be stuck: no
    // move is allowed out of an overlap).
    if (!this.hide) player.pos = nearestFree(this.level, player.pos, PLAYER.radius, player.obstacles);
    status.chased = this.enemy.mode === 'chase'; // Update 0.9.6.2 — adrenaline: your sprint lasts longer
    // Update 0.9.5 — in a locker you don't walk: you're placed in it, and can peek or get out.
    const step = this.hide ? this.stepHiding(dt) : this.reviving ? this.stepKneeling(dt) : player.step(this.level, input, status, dt);
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
      if (step.footstep.noise > 0) this.noise = { pos: { ...player.pos }, radius: step.footstep.noise, step: true }; // 0.9.7: it's you
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
      // Update 0.9.8 — keys 1–3: which slot is in your hand (the one you're holding again: put it away).
      for (let k = 0; k < SLOTS; k++) {
        if (input.wasPressed(`Digit${k + 1}`) || input.wasPressed(`Numpad${k + 1}`)) {
          this.inv = selectSlot(this.inv, k);
          this.useT = 0;
        }
      }
      const hand = this.handItem();
      // Update 0.9.9 — co-op: a teammate down in front of you: hold left click to get them up (that
      // comes before anything in your hand).
      const down = this.rt ? this.reviveTarget() : null;
      if (down && input.action('interact')) this.stepRevive(down);
      else {
        this.stopRevive();
        // Update 0.9.8 — with something in your hand, left click uses it and Space drops it; with empty
        // hands, left click picks up and interacts as before.
        if (hand) this.useHand(hand, input.actionPressed('interact'), input.action('interact'));
        else if (input.actionPressed('interact')) this.interact();
      }
      if (hand && hand.state === 'held' && input.actionPressed('skillCheck')) this.dropHand(false);
      const lying = this.throwables.filter((x) => x.state === 'ground').map((x) => ({ id: x.id, kind: x.kind, pos: { x: x.pos.x, z: x.pos.z }, title: throwableTitle(x) }));
      this.target = findTarget(this.level, player.pos, player.forward, this.progress.collected, lying);
    }
    this.stepThrowables(dt);
    // (0.9.8: you repair with empty hands.)
    this.workPanel(this.realDt, !this.hide && !this.handItem() && input.action('interact'), input.actionPressed('skillCheck'));

    // Enemy. Update 0.9.9 — in co-op it's the run's (coopFrame does it for everyone); here only what it
    // means to you.
    if (!this.rt && this.soloEnemy(dt, step.gait)) return;
    if (!this.rt) this.stepSoloMimic(dt);
    const chasing = this.enemy.mode === 'chase';

    const targetFear = fearLevel(dist(this.enemy.pos, player.pos), chasing);
    this.fear += (targetFear - this.fear) * (1 - Math.exp(-dt * 3));
    // Camera + flashlight follow in real time.
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
    this.audio.tickFear(dt, this.fear, chasing);
    this.audio.tickAmbient(dt, this.camAbs());
  }

  /** Solo: The Patient's step against you, drawn and heard. True if it caught you (the frame stops). */
  private soloEnemy(dt: number, gait: Gait): boolean {
    const { player } = this;
    const before = this.enemy.pos;
    const events = this.enemyFrozen ? [] : stepEnemy(
      this.level,
      this.enemy,
      {
        dt,
        player: { pos: this.hide ? this.lockerDoorPos() : player.pos, flashlightOn: this.lightShows(), crouching: player.crouching, running: gait === 'sprint', hidden: hiddenFrom(this.hide), facing: player.forward, beam: this.lightShows() },
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
    this.enemyEffects(events, dt, moved);
    if (events.includes('foundYou') && this.hide) {
      this.leaveLockerNow(true);
      if (this.lives > 1) this.startCaught();
      else this.startDying();
      return true;
    }
    if (events.includes('caught')) {
      // Update 0.9.5 — it saw you get in: it drags you out. You're put outside the locker first so the
      // grab and throw never start inside a prop.
      if (this.hide) this.leaveLockerNow(true);
      // Update 0.6 — first catch: thrown, injured. Last life: the old jumpscare.
      if (this.lives > 1) this.startCaught();
      else this.startDying();
      return true;
    }
    return false;
  }

  /** The Patient drawn where it is, its steps, screams and locker doors (solo and co-op). */
  private enemyEffects(events: string[], dt: number, moved: number) {
    this.drawEnemy(moved);
    this.enemyStepAccum += moved;
    const chasing = this.enemy.mode === 'chase';
    // Update 0.4.1 — enemy sounds get darker with distance and muffled behind walls.
    // Update 0.9.4 — properly: through each wall, or round through the halls (world/soundPath.ts).
    const mix = this.enemyHearing(dt);
    const heardAt = this.enemySoundPos(mix);
    // Update 0.9.7 — on the ceiling: quick, light scuttling overhead.
    const crawling = this.enemy.crawl?.phase === 'on';
    if (this.enemyStepAccum > (crawling ? 0.9 : chasing ? 1.4 : 1.0)) {
      this.enemyStepAccum = 0;
      this.audio.enemyStep(heardAt, chasing, mix, crawling);
    }
    // Update 0.9.7 — it screams and goes up on the ceiling; it thuds back down onto the floor.
    if (events.includes('crawlUp')) this.audio.enemyScream(this.enemy3D());
    if (events.includes('landed')) this.audio.enemyStep(heardAt, true, mix);
    if (events.includes('spotted')) {
      this.audio.enemyScream(this.enemy3D());
      this.audio.stinger();
    }
    // Update 0.9.6 — checking a locker: the door swings open for a second, then shut.
    this.animateEnemyLocker(events);
    this.audio.updateEnemy(heardAt, chasing, mix);
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

  /** Update 0.9.8 — what's in your hand (from your slots), if anything. */
  private handItem(): Throwable | null {
    const id = inHand(this.inv);
    return id === null ? null : this.throwables.find((x) => x.id === id) ?? null;
  }

  /** Update 0.9.8 — fuses in your slots (in your hand or put away). */
  private fusesCarried(): number {
    return this.inv.slots.filter((id) => id !== null && this.throwables.find((x) => x.id === id)?.kind === 'fuse').length;
  }

  /** Update 0.9.8 — your hand's item is used up / thrown / dropped: it leaves its slot. */
  private letGo(it: Throwable) {
    this.inv = remove(this.inv, it.id);
    this.useT = 0;
  }

  /**
   * Update 0.9.8 — left click with something in your hand uses it: a brick or bottle is thrown, a battery
   * goes in your light, a fuse goes in the panel you're looking at, a med kit (held for 5 s) patches you up.
   */
  private useHand(it: Throwable, press: boolean, holding: boolean) {
    if (it.kind === 'medkit') {
      if (!this.injured) {
        this.useT = 0;
        if (press) this.toastMsg('You\'re not hurt.');
        return;
      }
      this.useT = holding ? this.useT + this.realDt : 0;
      if (this.useT >= MEDKIT_SECONDS) this.heal(it);
      return;
    }
    if (!press) return;
    if (isThrowable(it.kind)) this.throwHeld(it);
    else if (it.kind === 'battery') {
      if (this.status.battery >= PLAYER.batteryMax) {
        this.toastMsg('Your light is full.');
        return;
      }
      addBattery(this.status);
      it.state = 'gone';
      this.letGo(it);
      this.sendItem(it);
      this.audio.pickup();
      this.toastMsg(`Battery in. +${PLAYER.batteryPickup}%`);
    } else if (it.kind === 'fuse') {
      const t = this.target;
      if (t?.type !== 'panel' || fitFuse(this.progress, t.index, true) !== 'fitted') {
        this.audio.denied();
        this.toastMsg('Fit it in an electrical panel.');
        return;
      }
      it.state = 'gone';
      this.letGo(it);
      this.sendItem(it);
      this.rt?.sync.fitFuse(t.index);
      const box = panelSpots(this.level)[t.index];
      const at = this.toWorld(box);
      this.audio.fuseInsert({ x: at.x, y: at.y + box.y, z: at.z });
      this.toastMsg('Fuse fitted.');
    }
  }

  /** Update 0.9.8 — the med kit: no longer injured, your second life back. */
  private heal(it: Throwable) {
    it.state = 'gone';
    this.letGo(it);
    this.sendItem(it);
    this.lives = this.rules.lives;
    this.injured = false;
    this.audio.pickup();
    this.toastMsg('You patch yourself up. The pain eases.', 4);
  }

  private throwHeld(it: Throwable) {
    const b = this.viewBasis();
    Object.assign(it, launch(it, heldPos(b.eye, b.forward, b.right), b.forward));
    this.letGo(it);
    if (this.rt) {
      this.thrownByMe.add(it.id);
      this.sendItem(it);
    }
  }

  /** Update 0.9.8 — Space: what's in your hand goes down on the floor in front of you (caught: at your feet). */
  private dropHand(atFeet: boolean) {
    const it = this.handItem();
    if (!it) return;
    const at = atFeet ? { ...this.player.pos } : dropSpot(this.level, this.player.pos, this.player.forward, this.player.obstacles);
    Object.assign(it, { state: 'ground', pos: { x: at.x, y: 0, z: at.z }, vel: { x: 0, y: 0, z: 0 }, yaw: this.rng() * Math.PI * 2 });
    this.letGo(it);
    this.sendItem(it);
    if (!atFeet) this.audio.pickup();
  }

  /** Update 0.9.6 — things in flight: gravity, and the crash (or thud) that brings it running. */
  private stepThrowables(dt: number) {
    for (let i = 0; i < this.throwables.length; i++) {
      const it = this.throwables[i];
      if (it.state !== 'flying') continue;
      const r = stepFlight(this.level, it, dt);
      this.throwables[i] = r.item;
      if (r.landing) {
        // Update 0.9.9 — co-op: one a teammate threw lands where their throw says (their update brings the
        // sound); yours tells everyone where it ended up.
        if (this.rt && !this.thrownByMe.has(it.id)) continue;
        this.thrownByMe.delete(it.id);
        this.sendItem(this.throwables[i]);
        const w = this.toWorld(r.landing.at);
        if (it.kind === 'bottle') this.audio.bottleBreak({ x: w.x, y: w.y + 0.1, z: w.z });
        else this.audio.brickImpact({ x: w.x, y: w.y + 0.1, z: w.z }); // (a brick thuds both times)
        this.noise = { pos: r.landing.noise.pos, radius: r.landing.noise.radius, lure: true };
      }
    }
  }

  /** Caught with something in your hand: it drops where you stood (the rest stays in your slots). */
  private dropHeld() {
    this.dropHand(true);
  }

  private drawThrowables() {
    const b = this.viewBasis();
    const id = inHand(this.inv);
    const show = id !== null && !this.hide && !this.reviving && (this.phase === 'playing' || this.phase === 'paused' || this.phase === 'reading');
    const held = show ? { id, pos: heldPos(b.eye, b.forward, b.right), quat: this.camera.quaternion } : null;
    this.throwView.update(this.throwables, (p) => {
      const w = this.toWorld(p);
      return { x: w.x, y: w.y + p.y, z: w.z };
    }, held, this.t);
  }

  /** Update 0.9.5 — does it see you get into a locker? (0.9.9: chasing you, anywhere in its line of sight.) */
  private seesYouGetIn(you: PlayerSense): boolean {
    const e = this.enemy;
    return seesYouGetIn(visibility(this.level, e, you) > 0, dist(e.pos, you.pos), e.mode === 'chase' && !e.crawl && chaseSees(this.level, e, you));
  }

  /** Update 0.9.5 — one frame in a locker: getting in / out, peeking, the camera and the door. */
  private stepHiding(dt: number) {
    const h = this.hide!;
    const l = lockerSpots(this.level)[h.locker];
    const f = propFront(l);
    const { input, player } = this;
    // Getting in while it can see you gives you away.
    const seen = h.phase === 'entering' && this.seesYouGetIn({ pos: player.pos, flashlightOn: false, crouching: false });
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
    // Update 0.9.9 — co-op: one of you per locker.
    const rt = this.rt;
    if (rt) {
      const who = rt.lockers.get(i);
      if (who && who !== rt.me) {
        this.audio.denied();
        this.toastMsg('Someone is hiding in there.');
        return;
      }
      rt.lockers.set(i, rt.me);
      void rt.sync.claimLocker(i).then((ok) => {
        if (!ok && this.hide?.locker === i) {
          this.leaveLockerNow(false);
          this.toastMsg('Someone got in there first.');
        }
      });
    }
    const seen = this.seesYouGetIn({ pos: this.player.pos, flashlightOn: this.lightShows(), crouching: this.player.crouching });
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
    if (this.rt) {
      this.rt.lockers.delete(h.locker);
      this.rt.sync.leaveLocker(h.locker);
    }
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
    if (t.type === 'loose') {
      // Update 0.9.6 — pick it up. Update 0.9.8 — into one of your three slots (the one your hand is on if
      // it's free, so you're holding it; else the first free one).
      const it = this.throwables.find((x) => x.id === t.id);
      if (!it || it.state !== 'ground') return;
      const r = store(this.inv, it.id);
      if (r.slot < 0) {
        this.audio.denied();
        this.toastMsg('Your slots are full. Drop something first.');
        return;
      }
      this.inv = r.inv;
      it.state = 'held';
      this.audio.pickup();
      const fresh = it.kind === 'fuse' && !it.found;
      it.found = true;
      if (this.rt) {
        // Update 0.9.9 — co-op: it's yours unless someone beat you to it (then it leaves your slot).
        this.itemBy.set(it.id, this.rt.me);
        void this.rt.sync.takeItem(it.id, it.throws);
        this.countFuses();
      } else if (fresh) p.fuses++;
      if (fresh) this.toastMsg(`Fuse found (${p.fuses}/${p.panels.length})`);
      else if (r.slot !== this.inv.selected || this.inv.stowed) this.toastMsg(`${throwableTitle(it)} in slot ${r.slot + 1}`);
      return;
    }
    if (t.type === 'item') {
      // A note (0.9.8: the only thing left on the tables that isn't carried).
      p.collected.push(t.item.id);
      this.view.items.get(t.item.id)!.visible = false;
      this.audio.paper();
      p.notesRead.push(t.item.noteIndex!);
      // Update 0.6.4 — reading pauses the whole game (updateReading) until you put it down.
      this.note = { text: this.level.notes[t.item.noteIndex!] };
      this.phase = 'reading';
      this.target = null;
    } else if (t.type === 'generator') {
      // Update 0.9 — all four panels live → the generator starts and the lights come back.
      // Update 0.9.9 — co-op: for everyone (the host's Patient makes its run for it).
      if (this.rt && !p.powered && allPanelsOn(p)) {
        this.rt.sync.power(this.player.pos.x, this.player.pos.z);
        this.netPower({ by: this.rt.me, x: this.player.pos.x, z: this.player.pos.z });
        return;
      }
      const r = this.rt ? (p.powered ? 'already' : 'panels') : startGenerator(p);
      if (r === 'powered') this.poweredUp(this.player.pos);
      else if (r === 'panels') {
        this.audio.denied();
        this.toastMsg('Dead. The panels need power first.');
      }
    } else if (t.type === 'panel') {
      // Update 0.9 — an electrical panel: fit a fuse (press), repair it (hold, workPanel), switch it on (press).
      // Update 0.9.8 — the fuse goes in from your hand (useHand); with empty hands it just needs one.
      const panel = p.panels[t.index];
      if (!panel.fuse) {
        this.audio.denied();
        this.toastMsg(this.fusesCarried() > 0 ? 'It needs a fuse. Take one in your hand (1–3).' : 'It needs a fuse.');
      }
    } else if (t.type === 'locker') {
      this.enterLocker(t.index); // Update 0.9.5
    } else if (t.type === 'switch') {
      // Update 0.9.1 — throw the switch of a repaired panel. It clacks: The Patient walks over if it's near.
      const i = t.index;
      const sw = panelSwitches(this.level)[i];
      const s = this.toWorld(sw);
      if (throwPanelSwitch(p, i) === 'on') {
        this.rt?.sync.switchPanel(i);
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
        if (!this.rt) this.audio.fadeOut(2.2); // (0.9.9: co-op goes on watching)
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
    // Update 0.9.9 — co-op: one of you at a time on a panel; the one on it sends how far they've got.
    const rt = this.rt;
    if (rt && working) {
      const other = this.panelBy[i];
      if (other && other !== rt.me) held = false;
      else if (held && this.repairClaim !== i) {
        this.releaseRepair();
        this.repairClaim = i;
        this.panelBy[i] = rt.me;
        void rt.sync.claimPanel(i).then((ok) => {
          if (!ok && this.repairClaim === i) this.repairClaim = -1;
        });
      }
    }
    if (rt && this.repairClaim >= 0 && (this.repairClaim !== i || !held)) this.releaseRepair();
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
      if (rt && this.repairClaim === i) {
        this.repairSendIn -= dt;
        if (this.repairSendIn <= 0) {
          this.repairSendIn = 0.3;
          rt.sync.repairProgress(i, panel.repair);
        }
      }
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
          rt?.sync.bang(i);
        } else if (e === 'done' && finishRepair(p, i)) {
          if (rt) {
            rt.sync.fixPanel(i);
            this.repairClaim = -1;
            this.panelBy[i] = null;
          }
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
    // Doors of repaired panels swing shut again. (0.9.9: one a teammate is working on stands open.)
    p.panels.forEach((x, k) => {
      if (rt && this.panelBy[k] && this.panelBy[k] !== rt.me && !x.fixed) this.panelOpen[k] = Math.min(1, (this.panelOpen[k] ?? 0) + dt * 2.5);
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
    this.releaseRepair();
    if (this.rt) this.life = 'caught';
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
        // Gone before you're back on your feet. (0.9.9: in co-op the host sends it away.)
        if (!this.rt) teleportAway(this.level, this.enemy, scene.endPos);
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
    if (this.rt) this.life = 'up'; // Update 0.9.9 — back on your feet (and hunted again)
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

  /**
   * Update 0.9.9 — caught on your last life: it hits you and you're sent flying (engine/hitScene.ts). It
   * replaced the jumpscare. `down` (co-op Normal): you live, on the floor; else it's over for you.
   */
  private startDying(down = false) {
    this.dropHeld(); // Update 0.9.6
    this.releaseRepair();
    if (this.rt) this.life = 'caught';
    this.phase = 'dying';
    this.toast = null;
    this.note = null;
    this.phaseTime = 0;
    this.camReturn = null;
    this.hitDown = down;
    this.hit = createHitScene({
      level: this.level,
      camera: this.camera,
      enemyView: this.enemyView,
      body: () => this.body,
      blockers: this.player.obstacles,
      playerPos: { ...this.player.pos },
      eyeHeight: this.camera.position.y,
      enemyPos: { ...this.enemy.pos },
      down,
    });
    // Solo: it's yours alone, so it really stands there (in co-op only its picture does).
    if (!this.rt) this.enemy.pos = { ...this.hit.enemyAt };
    this.audio.scream();
    // (0.9.9: co-op keeps the mouse: you go on watching.)
    if (!this.rt && !down && document.pointerLockElement) document.exitPointerLock();
  }

  private updateDying(dt: number) {
    const scene = this.hit;
    if (!scene) return;
    this.fear = scene.t < hitTimes.landAt ? 1 : Math.max(0, this.fear - dt * 0.5);
    for (const cue of scene.update(dt, this.worldT)) {
      if (cue === 'hit') {
        this.audio.caught();
        this.audio.thrownScream();
        this.impactT = this.t;
        this.injured = true;
      } else if (cue === 'land') this.audio.floorImpact();
      else if (cue === 'done') {
        this.hit = null;
        this.player.pos = nearestFree(this.level, crossPortal(this.level, scene.pos).pos, PLAYER.radius, this.player.obstacles);
        this.syncFloor();
        if (this.hitDown) return this.enterDown(this.player.pos, scene.bodyYaw);
        // Co-op: you're out; you watch the others until the run is over.
        if (this.rt) return this.goOut('out');
        this.phase = 'over';
        this.audio.fadeOut(0.5);
        this.cb.onEnd('dead', this.playTime);
        return;
      }
    }
    this.player.updateLight(dt, this.status, 0, scene.t < hitTimes.hitAt ? 1 : 0.3);
    // The blow: a flash of red; then your eyes close (and, dead, it goes black).
    const red = scene.t >= hitTimes.hitAt ? Math.max(0, 0.55 - (scene.t - hitTimes.hitAt) * 0.4) : 0;
    this.fx.set({ red, lids: hitLids(scene.t, this.hitDown), black: hitBlack(scene.t, this.hitDown) });
    this.audio.setListener(this.camAbs(), this.camForward());
  }

  private updateEscaping(dt: number) {
    const k = this.phaseTime;
    const d = this.view;
    d.exitDoor.position.copy(d.exitDoorClosedPos).addScaledVector(d.exitDoorSlide, Math.min(1, k / 1.2));
    this.player.updateView(dt, 'idle', this.status, this.t);
    this.fear *= 0.95;
    this.fx.set({ white: Math.min(1, Math.max(0, (k - 0.6) / 1.4)) });
    if (k > 2.2 && this.phase === 'escaping') {
      // Update 0.9.9 — co-op: you're out; you watch the others until the run is over.
      if (this.rt) return this.goOut('escaped');
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

  /** Update 0.9.8 — your hand and slots, for the crosshair prompt (in a locker: nothing in hand). */
  private handForPrompt(): Hand {
    const it = this.hide ? null : this.handItem();
    return {
      kind: it?.kind ?? null,
      title: it ? throwableTitle(it) : undefined,
      full: isFull(this.inv),
      fuses: this.fusesCarried(),
      injured: this.injured,
      batteryFull: this.status.battery >= PLAYER.batteryMax,
    };
  }

  /** Same object while the words don't change, so the HUD doesn't re-render for nothing. */
  private currentPrompt(): Prompt | null {
    let next = this.phase === 'playing' ? promptFor(this.target, this.progress, !!this.note, this.handForPrompt()) : null;
    // Update 0.9.9 — co-op: a teammate down in front of you; a panel someone else is working on.
    const rt = this.rt;
    if (rt && this.phase === 'playing' && !this.hide) {
      const down = this.reviveTarget();
      const by = this.target?.type === 'panel' ? this.panelBy[this.target.index] : null;
      if (down) next = { title: `${down.name} is down`, verb: 'get them up', hold: true };
      else if (by && by !== rt.me && next) next = { title: next.title, verb: null, info: `${rt.mateNow(by)?.name ?? 'Someone'} is working on it.` };
    }
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
      // Update 0.9.8 — the slot bar.
      slots: this.inv.slots.map((id) => {
        const it = id === null ? undefined : this.throwables.find((x) => x.id === id);
        return it ? { kind: it.kind, title: throwableTitle(it) } : null;
      }),
      slot: this.inv.selected,
      stowed: this.inv.stowed,
      use: this.reviving ? Math.min(1, Math.round((this.reviving.t / DOWN.reviveSeconds) * 100) / 100) : this.useT > 0 ? Math.min(1, Math.round((this.useT / MEDKIT_SECONDS) * 100) / 100) : null,
      useLabel: this.reviving ? `Getting ${this.reviving.name} up` : 'Patching yourself up',
      ...this.coopHud(),
      stamina: staminaShare(s.stamina, PLAYER.staminaMax), // 0.9.8: was ÷ 4.5
      exhausted: s.exhausted,
      objective: objectiveText(this.progress),
      objectiveDetail: objectiveDetail(this.progress, this.fusesCarried()),
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

  // ——— Update 0.9.9: co-op ———

  private startCoop(c: CoopStart) {
    this.panelBy = this.progress.panels.map(() => null);
    this.panelBangs = this.progress.panels.map(() => 0);
    this.rt = new CoopRuntime(
      c.link,
      this.level,
      this.scene,
      this.audio,
      {
        item: (id, it) => this.netItem(id, it),
        panel: (i, p) => this.netPanel(i, p),
        power: (p) => this.netPower(p),
        caught: () => this.coopCaught(),
        toWorld: this.toWorld,
      },
      c.difficulty === 'hard',
    );
    // A hidden tab stops drawing and slows its timers; a worker's timer keeps ticking.
    this.bgWorker = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 50);'], { type: 'text/javascript' })));
    this.bgWorker.onmessage = () => this.backgroundTick();
    this.rt.resumeOf = (mine) => ({ pos: mine.pos, yaw: mine.yaw, lives: this.lives, injured: this.injured, life: mine.life, bleed: this.bleed });
    this.rt.heldBy = (id) => [...this.itemBy].filter(([, by]) => by === id).map(([k]) => ({ id: k, th: this.throwables.find((x) => x.id === k)?.throws ?? 0 }));
    this.rt.panelsBy = (id) => this.panelBy.flatMap((by, i) => (by === id ? [i] : []));
  }

  /** Update 0.9.9 — what your ping (F) marks: The Patient in your crosshair, else a thing near where your
   *  view hits (item, panel, locker, generator, exit), else that spot. */
  private pingFrom(): PingMark {
    const b = this.viewBasis();
    const head = { x: this.enemy.pos.x, y: 1.6, z: this.enemy.pos.z };
    const to = { x: head.x - b.eye.x, y: head.y - b.eye.y, z: head.z - b.eye.z };
    if (Math.hypot(to.x, to.z) <= PING.range && inCrosshair(b.forward, to) && lineOfSight(this.level, this.player.pos, this.enemy.pos)) {
      return { kind: 'enemy', label: "It's here!", pos: head };
    }
    const hit = pingRay(this.level, b.eye, b.forward);
    const things: { pos: { x: number; y: number; z: number }; label: string }[] = [];
    for (const it of this.throwables) if (it.state === 'ground') things.push({ pos: { ...it.pos }, label: throwableTitle(it) });
    panelSpots(this.level).forEach((s, i) => things.push({ pos: { x: s.x, y: s.y, z: s.z }, label: this.progress.panels[i]?.on ? 'Live panel' : 'Electrical panel' }));
    lockerSpots(this.level).forEach((l) => things.push({ pos: { x: l.x, y: 1.1, z: l.z }, label: 'Locker' }));
    const g = cellCenter(this.level.generator);
    things.push({ pos: { x: g.x, y: 0.8, z: g.z }, label: 'Generator' });
    const x = cellCenter(this.level.exit);
    things.push({ pos: { x: x.x, y: 1.2, z: x.z }, label: 'Exit' });
    const thing = snapPing(hit, things);
    return thing ? { kind: 'item', label: thing.label, pos: thing.pos } : { kind: 'spot', label: 'Here', pos: hit };
  }

  /** Update 0.9.9 — rejoined a run: where you were, as you were (your slots are empty: what you carried
   *  fell where you dropped out). */
  private resumeRun(r: ResumeState) {
    const at = nearestFree(this.level, r.pos, PLAYER.radius, this.player.obstacles);
    this.player.pos = at;
    this.player.yaw = r.yaw;
    this.syncFloor();
    this.lives = Math.max(1, r.lives);
    this.injured = r.injured;
    this.fx.set({ lids: 0 });
    this.input.clear();
    if (r.life === 'down') {
      this.enterDown(at, r.yaw);
      this.bleed = Math.max(1, r.bleed);
    } else if (r.life === 'out' || r.life === 'escaped') {
      this.outAt = { ...at };
      this.goOut(r.life);
    } else {
      this.phase = 'playing';
      this.life = 'up';
      this.lastObjective = '';
    }
    this.toastMsg('Back in the run. What you carried fell where you dropped out.', 5);
  }

  /** What you send the others about yourself. */
  private myLive(): LiveState {
    const p = this.player;
    const down = this.phase === 'down' && this.downAt;
    // Caught: where the camera is (in its hands, then flying), so they see you thrown.
    const pos =
      this.phase === 'caught' ? { x: this.camera.position.x, z: this.camera.position.z }
      : this.phase === 'dying' && this.hit ? this.hit.pos
      : down ? this.downAt!.pos
      : this.outAt ?? p.pos;
    const busy = this.phase === 'intro' || this.phase === 'waking' || this.phase === 'escaping';
    return {
      pos: { ...pos },
      rise: p.rise,
      yaw: down ? this.downAt!.yaw : this.phase === 'dying' && this.hit ? this.hit.bodyYaw : p.yaw,
      pitch: p.pitch,
      gait: this.phase === 'playing' ? this.gait : this.phase === 'down' && this.downAt?.moving ? 'crouch' : 'idle',
      crouching: p.crouching,
      light: this.lightShows() && (this.phase === 'playing' || this.phase === 'reading'),
      // Getting up / walking out: it leaves you alone for those few seconds.
      hidden: hiddenFrom(this.hide) || busy,
      sense: this.hide ? this.lockerDoorPos() : { ...p.pos },
      locker: this.hide?.locker ?? -1,
      hold: this.hide ? null : this.handItem()?.kind ?? null,
      injured: this.injured,
      life: this.life,
      bleed: this.bleed,
      hit: this.phase === 'dying',
      noise: null,
      t: 0,
    };
  }

  /** One of the shared items changed (you picked it up, dropped, threw or used it). */
  private sendItem(it: Throwable) {
    const rt = this.rt;
    if (!rt) return;
    const n: ItemNet = { s: it.state, x: Math.round(it.pos.x * 100) / 100, y: Math.round(it.pos.y * 100) / 100, z: Math.round(it.pos.z * 100) / 100, w: Math.round(it.yaw * 100) / 100, th: it.throws, f: 1 };
    if (it.state === 'held' || it.state === 'flying') n.by = rt.me;
    if (it.state === 'flying') Object.assign(n, { vx: it.vel.x, vy: it.vel.y, vz: it.vel.z });
    if (it.state !== 'held') this.itemBy.delete(it.id);
    rt.sync.putItem(it.id, n);
  }

  private netItem(id: number, n: ItemNet | null) {
    const it = this.throwables.find((x) => x.id === id);
    const rt = this.rt;
    if (!it || !n || !rt) return;
    const mine = this.inv.slots.includes(id);
    if (n.f) it.found = true;
    if (typeof n.th === 'number') it.throws = n.th;
    if (n.s === 'held') {
      this.itemBy.set(id, n.by ?? '');
      if (n.by !== rt.me) {
        if (mine) {
          // You both went for it and they won.
          this.inv = remove(this.inv, id);
          this.useT = 0;
          this.toastMsg('Someone else got to it first.');
        }
        it.state = 'held';
      }
    } else {
      if (mine) {
        // Still in your slots, yet lying somewhere: you dropped out for a moment and the host put down what
        // you carried (your own drops and throws leave your slots before they're sent).
        this.inv = remove(this.inv, id);
        this.useT = 0;
        this.toastMsg('You lost your grip: what you carried fell where you dropped out.');
      }
      this.itemBy.delete(id);
      const was = it.state;
      if (n.s === 'flying') {
        if (n.by !== rt.me) Object.assign(it, { state: 'flying', pos: { x: n.x, y: n.y, z: n.z }, vel: { x: n.vx ?? 0, y: n.vy ?? 0, z: n.vz ?? 0 }, yaw: n.w, spin: it.kind === 'brick' ? 9 : 12 });
      } else if (!this.thrownByMe.has(id)) {
        Object.assign(it, { state: n.s, pos: { x: n.x, y: n.y, z: n.z }, vel: { x: 0, y: 0, z: 0 }, spin: 0, yaw: n.w });
        // A teammate's throw came down: the crash / thud where it landed.
        if (was === 'flying') {
          const w = this.toWorld(it.pos);
          if (it.kind === 'bottle') this.audio.bottleBreak({ x: w.x, y: w.y + 0.1, z: w.z });
          else this.audio.brickImpact({ x: w.x, y: w.y + 0.1, z: w.z });
        }
      }
    }
    this.countFuses();
  }

  /** Co-op: fuses found by any of you (for the objective and its rage). */
  private countFuses() {
    if (this.rt) this.progress.fuses = this.throwables.filter((x) => x.kind === 'fuse' && x.found).length;
  }

  private netPanel(i: number, n: PanelNet | null) {
    const panel = this.progress.panels[i];
    const rt = this.rt;
    if (!panel || !n || !rt) return;
    const box = panelSpots(this.level)[i];
    const w = this.toWorld(box);
    const where = { x: w.x, y: w.y + box.y, z: w.z };
    if (n.fu && !panel.fuse) {
      panel.fuse = true;
      this.audio.fuseInsert(where);
    }
    if (this.repairClaim !== i) this.panelBy[i] = n.by ?? null;
    if (this.repairClaim !== i && typeof n.r === 'number' && !panel.fixed) panel.repair = n.r;
    if (n.fx && !panel.fixed) {
      panel.fixed = true;
      panel.repair = 1;
      this.audio.panelClunk(where);
    }
    if (n.on && !panel.on) {
      panel.on = true;
      this.props.setSwitch(i, true);
      const sw = panelSwitches(this.level)[i];
      const at = this.toWorld(sw);
      this.audio.breakerSwitch({ x: at.x, y: at.y + sw.y, z: at.z });
    }
    const bg = n.bg ?? 0;
    if (bg > (this.panelBangs[i] ?? 0)) {
      this.panelBangs[i] = bg;
      if (this.repairClaim !== i) {
        // A teammate's skill check went wrong over there.
        this.audio.panelExplode(where);
        this.sparkPanel = i;
        this.sparkFlash = 1;
      }
    }
  }

  /** Off the panel you were repairing (let go, walked away, caught): the others can take over. */
  private releaseRepair() {
    const i = this.repairClaim;
    if (i < 0) return;
    this.repairClaim = -1;
    this.panelBy[i] = null;
    this.rt?.sync.releasePanel(i, this.progress.panels[i]?.repair ?? 0);
  }

  /** The generator came on (you, or a teammate: `p`). */
  private netPower(p: PowerNet) {
    if (this.progress.powered) return;
    this.progress.powered = true;
    this.poweredUp(p);
  }

  /** Update 0.9 — the lights come back; it screams and sprints for the generator (the host's, in co-op). */
  private poweredUp(at: Vec2) {
    const g = this.view.generatorPos;
    this.audio.generatorStart({ x: g.x, y: g.y, z: g.z });
    this.lights.setPowered(this.t);
    this.applyAtmosphere(); // with the lights back you can see further down the halls
    this.toastMsg('The lights come on. Something screams in the dark.', 5);
    // Update 0.6.4 — it vanishes to a random corner, screams, and sprints for the generator:
    // your window to get out of the room. Update 0.9.7 — on the ceiling, it drops down first.
    if (!this.rt || this.rt.host) {
      if (!dropFromCeiling(this.enemy)) summonToGenerator(this.level, this.enemy, { x: at.x, z: at.z }, this.rng);
    }
    this.audio.powerScream();
    this.stingerTimer = window.setTimeout(() => this.audio.stinger(), 1200);
  }

  /** The host's Patient has you: thrown, down (last life, Normal), or dead (Hard). */
  private coopCaught() {
    if (this.phase !== 'playing' && this.phase !== 'reading') return;
    this.note = null;
    if (this.hide) this.leaveLockerNow(true);
    this.stopRevive();
    const how = catchOutcome(this.lives, this.coop?.difficulty ?? null);
    if (how === 'thrown') this.startCaught();
    else this.startDying(how === 'down');
  }

  /** Hit on your last life (co-op Normal): you're on the floor where you landed, alive. */
  private enterDown(at: Vec2, yaw: number) {
    this.caught = null;
    this.phase = 'down';
    this.life = 'down';
    this.bleed = DOWN.bleedSeconds;
    this.bledOut = null;
    this.downAt = { pos: { ...at }, yaw, moving: false };
    this.player.pos = { ...at };
    this.player.yaw = yaw;
    this.player.pitch = -0.25;
    this.injured = true;
    this.input.clear();
    this.toastMsg("You can't get up. Crawl to a friend: they can get you back on your feet.", 5);
  }

  /** Down: on your front, looking round and crawling (not while someone is getting you up), the clock running. */
  private updateDown(dt: number) {
    const d = this.downAt;
    const rt = this.rt;
    if (!d || !rt) return;
    const { input, player } = this;
    const r = this.bledOut === null ? rt.revives.get(rt.me) : undefined;
    if (r?.d) return this.revived();
    player.look(input, this.settings);
    player.pitch = Math.max(-0.9, Math.min(0.6, player.pitch));
    const f = player.forward;
    d.moving = false;
    if (!r && this.bledOut === null) {
      const right = { x: Math.cos(player.yaw), z: -Math.sin(player.yaw) };
      const mx = (input.action('right') ? 1 : 0) - (input.action('left') ? 1 : 0);
      const mz = (input.action('forward') ? 1 : 0) - (input.action('back') ? 1 : 0);
      const wx = f.x * mz + right.x * mx;
      const wz = f.z * mz + right.z * mx;
      const len = Math.hypot(wx, wz);
      if (len > 0) {
        const k = (DOWN.crawlSpeed * dt) / len;
        d.pos = nearestFree(this.level, d.pos, PLAYER.radius, player.obstacles);
        const before = d.pos;
        d.pos = moveWithCollision(this.level, d.pos, wx * k, wz * k, PLAYER.radius, player.obstacles);
        d.moving = true;
        // Dragging yourself along the floor.
        this.crawlAccum += dist(before, d.pos);
        if (this.crawlAccum > 0.7) {
          this.crawlAccum = 0;
          this.audio.footstep('crouch');
        }
      }
    }
    if (!r) d.yaw = player.yaw; // Update 0.9.9 — someone's at your side: your body holds still
    player.pos = { ...d.pos };
    this.syncFloor();
    player.rise = stairRise(this.level, player.pos);
    const sway = Math.sin(this.t * 2.2) * (d.moving ? 0.03 : 0.008);
    this.camera.position.set(d.pos.x + f.x * 0.25, player.rise + DOWN.crawlEye + sway, d.pos.z + f.z * 0.25);
    this.camera.rotation.set(player.pitch, player.yaw, sway * 2, 'YXZ');
    this.camera.updateMatrixWorld();
    this.body?.setVisible(false);
    player.updateLight(dt, this.status, 0, 0.12);
    // Your eyes keep closing; the clock stops while someone is getting you up.
    if (this.bledOut === null) {
      this.fx.set({ lids: 0.3 + 0.15 * Math.sin(this.t * 1.3) });
      if (!r) this.bleed = Math.max(0, this.bleed - dt);
      if (this.bleed <= 0) {
        // Your minute is up: you slump (the others see you die there), the light goes.
        this.bledOut = 0;
        this.life = 'out';
        this.outAt = { ...d.pos };
      }
      return;
    }
    this.bledOut += dt;
    this.fx.set({ lids: Math.min(1, 0.45 + this.bledOut / 1.2), black: Math.min(1, this.bledOut / 1.8) });
    if (this.bledOut >= 2) this.goOut('out');
  }

  /** A teammate got you up: back on your feet (the get-up), one life, still injured. */
  private revived() {
    const d = this.downAt!;
    this.rt?.sync.clearRevive();
    this.life = 'up';
    this.lives = 1;
    this.injured = true;
    this.downAt = null;
    this.phase = 'waking';
    this.audio.grunt();
    this.gruntIn = nextGruntDelay(this.rng);
    this.wake = createWakeScene({ camera: this.camera, body: () => this.body, pos: { ...d.pos }, yaw: d.yaw, eyeHeight: PLAYER.eyeHeight, startAt: wakeTimes.getUpAt });
    this.toastMsg('Back on your feet.');
  }

  /** A teammate down in front of you, close enough to get up. */
  private reviveTarget(): { id: string; name: string } | null {
    const p = this.player;
    const rt = this.rt;
    let best: { id: string; name: string; d: number } | null = null;
    for (const m of rt?.downMates() ?? []) {
      if (this.revivedJust?.id === m.id && this.t < this.revivedJust.until) continue;
      const r = rt!.revives.get(m.id);
      if (!reviveFree(r, rt!.me, !!r && rt!.mateNow(r.by)?.life === 'up')) continue; // Update 0.9.9
      const d = dist(p.pos, m.pos);
      if (d > DOWN.reach) continue;
      const f = p.forward;
      const facing = d < 0.8 || ((m.pos.x - p.pos.x) * f.x + (m.pos.z - p.pos.z) * f.z) / d > 0.3;
      if (facing && (!best || d < best.d)) best = { id: m.id, name: m.name, d };
    }
    return best;
  }

  /** Holding left click on a downed teammate: 5 s and they're up. */
  private stepRevive(t: { id: string; name: string }) {
    const rt = this.rt;
    if (!rt) return;
    if (this.revivedJust?.id === t.id && this.t < this.revivedJust.until) return;
    if (this.reviving?.id !== t.id) {
      this.stopRevive();
      this.reviving = { id: t.id, name: t.name, t: 0 };
      rt.sync.revive(t.id, false);
    }
    const r = this.reviving!;
    r.t += this.realDt;
    if (r.t >= DOWN.reviveSeconds) {
      rt.sync.revive(t.id, true);
      this.toastMsg(`You got ${t.name} back on their feet.`);
      this.reviving = null;
      this.revivedJust = { id: t.id, until: this.t + 3 };
    }
  }

  /** Update 0.9.9 — the teammate you're getting up, as you see them now (where they lie, the way they face). */
  private revivingNow(): { pos: Vec2; yaw: number } | null {
    const m = this.reviving ? this.rt?.mateNow(this.reviving.id) : null;
    return m?.life === 'down' ? m : null;
  }

  /** Update 0.9.9 — getting a teammate up: you shuffle over beside them and stay on one knee (no walking). */
  private stepKneeling(dt: number): StepResult {
    const p = this.player;
    p.stop();
    tickStatus(this.status, 'idle', dt);
    const down = this.revivingNow();
    if (down) {
      const mates = p.teammates.filter((b) => dist(p.pos, b) >= PLAYER.radius * 2);
      const blockers = [...p.obstacles, ...mates];
      const free = (q: Vec2) => dist(nearestFree(this.level, q, PLAYER.radius, blockers), q) < 0.01;
      // Your side of them up against a wall (or furniture): round to the other.
      let to = kneelAt(p.pos, down).pos;
      if (!free(to)) {
        const other = kneelAt(p.pos, down, true).pos;
        if (free(other)) to = other;
      }
      const d = dist(p.pos, to);
      if (d > 0.01) {
        const k = Math.min(1, (KNEEL.shuffle * dt) / d);
        p.pos = moveWithCollision(this.level, p.pos, (to.x - p.pos.x) * k, (to.z - p.pos.z) * k, PLAYER.radius, blockers);
      }
    }
    return { gait: 'idle', moved: 0, footstep: null };
  }

  private stopRevive() {
    if (!this.reviving) return;
    this.rt?.sync.stopRevive(this.reviving.id);
    this.reviving = null;
  }

  /** Out of the run (taken, or out the exit): from now on you watch a teammate until it's over. */
  private goOut(life: 'out' | 'escaped') {
    const rt = this.rt;
    if (!rt) return;
    // Taken: what you carried is left where you fell, for the others.
    if (life === 'out') {
      for (const id of this.inv.slots) {
        const it = id === null ? null : this.throwables.find((x) => x.id === id);
        if (!it) continue;
        Object.assign(it, { state: 'ground', pos: { x: this.player.pos.x, y: 0, z: this.player.pos.z }, vel: { x: 0, y: 0, z: 0 } });
        this.sendItem(it);
      }
      this.inv = createInventory();
    }
    if (this.hide) this.leaveLockerNow(false);
    this.releaseRepair();
    this.stopRevive();
    this.outAt = this.outAt ?? { ...this.player.pos };
    this.bledOut = null;
    this.life = life;
    this.phase = 'spectating';
    this.caught = null;
    this.wake = null;
    this.downAt = null;
    this.injured = false;
    this.status.flashlightOn = false;
    this.toast = null;
    this.note = null;
    this.fx.set({ red: 0, black: 0, white: 0, lids: 0 });
    this.watching = nextWatch(watchable(rt.team(this.life), rt.me), null);
    this.toastMsg(life === 'escaped' ? "You're out. Now they have to make it." : 'It took you. Watch the others.', 4);
  }

  /** Watching through a teammate's eyes. Left click: the next one. */
  private updateSpectating(dt: number) {
    const rt = this.rt;
    if (!rt) return;
    const ids = watchable(rt.team(this.life), rt.me);
    if (!this.watching || !ids.includes(this.watching)) this.watching = nextWatch(ids, this.watching);
    if (this.input.actionPressed('interact')) this.watching = nextWatch(ids, this.watching);
    const m = this.watching ? rt.mateNow(this.watching) : null;
    if (m) {
      this.player.pos = { ...m.pos };
      this.player.rise = m.rise;
      this.syncFloor();
      const eye = m.life === 'down' ? 0.35 : rt.revivingWho(this.watching!, null) ? KNEEL.eye : m.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight;
      this.camera.position.set(m.pos.x, m.rise + eye, m.pos.z);
      this.camera.rotation.set(m.life === 'down' ? -0.6 : m.pitch, m.yaw, 0, 'YXZ');
      this.camera.updateMatrixWorld();
    }
    this.fear += (0 - this.fear) * Math.min(1, dt * 2);
    this.player.updateLight(dt, this.status, 0, 0.5);
    this.audio.setListener(this.camAbs(), this.camForward());
  }

  /** It's showing your catch: your own screen draws it until it vanishes. */
  private sceneOwnsEnemy() {
    return (this.phase === 'caught' && !!this.caught && this.caught.t < caughtTimes.teleportAt) || this.phase === 'dying';
  }

  /** Every frame of a co-op run, whatever you're doing: the run goes on. */
  private coopFrame(dt: number) {
    const rt = this.rt!;
    // Your noise this frame goes to the host's Patient (it isn't heard while you're getting up or out).
    if (this.noise) {
      if (this.phase === 'playing' || this.phase === 'reading') rt.noise(this.noise);
      this.noise = null;
    }
    if (this.input.actionPressed('ping') && this.phase === 'playing' && !this.hide && this.t >= this.pingReady) {
      this.pingReady = this.t + PING.every;
      rt.ping(this.pingFrom());
    }
    rt.drawPings(this.camAbs());
    if (this.input.actionPressed('mute') && rt.hasVoice) {
      rt.setMuted(!rt.muted);
      this.toastMsg(rt.muted ? 'Microphone muted.' : 'Microphone on.', 2);
    }
    rt.watched = this.phase === 'spectating' ? this.watching : null;
    const before = { ...this.enemy.pos };
    const events = rt.frame(this.realDt, this.enemy, this.myLive(), this.player.pos, { fuses: this.progress.fuses, lockers: this.enemyLockers(), rng: this.rng });
    const moved = Math.min(1, dist(before, this.enemy.pos));
    if (!this.sceneOwnsEnemy()) {
      const hold = rt.hold;
      if (hold && hold.who !== rt.me) {
        // It has one of the others: its blow (their last life), or the grab and then the throw.
        const v = rt.mateNow(hold.who)?.pos ?? hold.at;
        const yaw = Math.atan2(v.x - this.enemy.pos.x, v.z - this.enemy.pos.z);
        const grab = hold.t < caughtTimes.throwAt;
        if (hold.hit) this.enemyView.pose(this.enemy.pos, yaw, 'attack', this.worldT, HIT.clipSpeed, HIT.clipFrom);
        else this.enemyView.pose(this.enemy.pos, yaw, grab ? 'grab' : 'throw', this.worldT, grab ? 1 : ENEMY_THROW_SPEED);
      } else this.enemyEffects(events, dt, moved);
    }
    for (const e of events) {
      if (e.startsWith('mimic:')) this.playMimic(e.slice(6));
      if (!e.startsWith('caught:') || e === `caught:${rt.me}`) continue;
      const who = rt.mateNow(e.slice(7));
      if (who) this.toastMsg(`It has ${who.name}!`, 3);
    }
    if (this.phase !== 'playing') this.audio.setListener(this.camAbs(), this.camForward());
    // The end: everyone out (taken or escaped), or the host gone.
    if (!this.coopEnded && this.phase !== 'intro') {
      if (this.coop?.link.closed()) this.endCoop('The host left. The run is over.');
      else if (runOver(rt.team(this.life))) this.endCoop();
    }
  }

  /**
   * Update 0.9.9 — this tab isn't being drawn (you tabbed out, minimised it, or it's behind another tab):
   * the frame loop stops. The run doesn't: twenty times a second the worker's tick moves it on. On the
   * host The Patient keeps hunting (it used to freeze for everyone); everyone keeps sending where they are
   * (you stand still) and hearing the others. Back in the tab, the frame loop takes over. (Going by "no frame
   * for a quarter of a second", not the page's hidden flag: some browsers stop drawing a tab that still
   * says it's visible.)
   */
  private backgroundTick() {
    const now = performance.now();
    const drawing = now - this.lastFrameAt < 250;
    if (drawing || !this.rt || this.disposed || this.phase === 'over') {
      this.bgLast = now;
      return;
    }
    let left = Math.min(0.25, (now - this.bgLast) / 1000);
    this.bgLast = now;
    while (left > 1e-4) {
      const dt = Math.min(0.05, left);
      left -= dt;
      this.coopBackgroundStep(dt);
    }
    this.last = now; // no jump when the frame loop comes back
  }

  private coopBackgroundStep(dt: number) {
    const rt = this.rt!;
    this.realDt = dt;
    if (this.noise) {
      if (this.phase === 'playing' || this.phase === 'reading') rt.noise(this.noise);
      this.noise = null;
    }
    rt.frame(dt, this.enemy, this.myLive(), this.player.pos, { fuses: this.progress.fuses, lockers: this.enemyLockers(), rng: this.rng });
    if (!this.coopEnded && this.phase !== 'intro') {
      if (this.coop?.link.closed()) this.endCoop('The host left. The run is over.');
      else if (runOver(rt.team(this.life))) this.endCoop();
    }
  }

  /** Update 0.9.9 — The Patient mimics `who`: one of their lines, from where it is. */
  private playMimic(who: string) {
    const clip = this.rt?.clips?.pick(who);
    if (clip) this.playMimicClip(clip);
  }

  private playMimicClip(clip: AudioBuffer) {
    const mix = this.enemyHearing(0);
    this.audio.mimic(clip, this.enemySoundPos(mix), mix, MIMIC.rate);
  }

  /** Update 0.9.9 — test build only (Settings → Audio): a solo run with your microphone, and it mimics you. */
  private startSoloMimic() {
    if (this.rt || !import.meta.env.DEV || !MIMIC.enabled || !this.settings.soloMimic || this.soloClips) return;
    this.soloClips = new VoiceClips(this.audio.ctx);
    this.soloMimicIn = MIMIC_SOLO_TEST.firstMin + Math.random() * (MIMIC_SOLO_TEST.firstMax - MIMIC_SOLO_TEST.firstMin);
    void micIfAllowed().then((mic) => {
      if (!mic || this.disposed || !this.soloClips) return;
      this.soloClips.record('me', mic);
      this.soloMic = this.audio.micMeter(mic);
    });
  }

  private stepSoloMimic(dt: number) {
    const clips = this.soloClips;
    if (!clips) return;
    this.soloMimicIn -= dt;
    if (this.soloMimicIn > 0) return;
    const clip = mimicNow(this.enemy.mode, !!this.enemy.crawl, false) ? clips.pick('me') : null;
    if (!clip) {
      this.soloMimicIn = MIMIC.retry / 2;
      return;
    }
    this.playMimicClip(clip);
    this.soloMimicIn = MIMIC_SOLO_TEST.everyMin + Math.random() * (MIMIC_SOLO_TEST.everyMax - MIMIC_SOLO_TEST.everyMin);
  }

  private endCoop(note?: string) {
    const rt = this.rt!;
    this.coopEnded = true;
    const team = rt.team(this.life);
    this.phase = 'over';
    this.audio.fadeOut(0.8);
    if (document.pointerLockElement) document.exitPointerLock();
    this.cb.onEnd(this.life === 'escaped' || (!note && teamEscaped(team)) ? 'escaped' : 'dead', this.playTime, { team, mine: this.life, note });
  }

  /** Update 0.9.9 — the co-op parts of the HUD. */
  private coopHud(): Pick<HudState, 'team' | 'down' | 'watching' | 'mic'> {
    const rt = this.rt;
    if (!rt) return { team: null, down: null, watching: null, mic: this.soloMic ? (this.soloMic() > -45 ? 'talking' : 'live') : this.soloClips ? 'none' : null };
    const r = rt.revives.get(rt.me);
    return {
      team: rt.teamHud(),
      down: this.phase === 'down' ? { left: Math.ceil(this.bleed), helper: r && !r.d ? rt.mateNow(r.by)?.name ?? 'Someone' : null } : null,
      watching: this.phase === 'spectating' ? { name: this.watching ? rt.mateNow(this.watching)?.name ?? null : null, host: rt.host } : null,
      mic: !rt.hasVoice ? null : !rt.hasMic ? 'none' : rt.muted ? 'muted' : rt.myTalking ? 'talking' : 'live',
    };
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
  /** Update 0.9.9 — ?debug: it mimics you right now (solo test build with the switch on). */
  debugMimic() {
    const clip = this.soloClips?.pick('me');
    if (clip) this.playMimicClip(clip);
    return !!clip;
  }

  debugCatch() {
    if (this.rt) return this.coopCaught(); // Update 0.9.9 — as if the host's Patient had you
    const f = this.player.forward;
    this.enemy.pos = { x: this.player.pos.x + f.x, z: this.player.pos.z + f.z };
    if (this.lives > 1) this.startCaught();
    else this.startDying();
  }
  debugState() {
    return { lives: this.lives, injured: this.injured, caughtT: this.caught?.t ?? null, wakeT: this.wake?.t ?? null, caughtEnd: this.caught?.endPos ?? null, phase: this.phase, level: this.levelIndex + 1, floor: this.curFloor, enemyFloor: floorAt(this.level, this.enemy.pos), rise: this.player.rise, enemy: { ...this.enemy, path: undefined }, progress: this.progress, repair: this.repair, hide: this.hide, throwables: this.throwables, inv: this.inv, status: this.status, pos: this.player.pos };
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
    this.soloClips?.dispose();
    this.bgWorker?.terminate();
    this.bgWorker = null;
    this.rt?.dispose();
    this.rt = null;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.stingerTimer);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    window.removeEventListener('keydown', this.onDebugEsc);
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
