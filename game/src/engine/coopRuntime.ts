// Update 0.9.9 — a co-op run in progress, beside the Game: your teammates (drawn, heard, bumped into),
// The Patient (the host runs it for everyone and sends it out; everyone else draws it from that), the
// host's choice of who it hunts and who it catches, the noises you all make, revives, proximity voice,
// and who's still in it. The Game does what happens to you and to the shared world (items, panels,
// power), through `CoopSide`.
import * as THREE from 'three';
import type { Level, Vec2 } from '../world/level';
import { dist, stairRise } from '../world/level';
import { ENEMY, EnemyState, LockerSpot, Noise, PlayerSense, stepEnemy, teleportAway } from '../world/enemyAI';
import { Hunted, NOBODY, catchable, catchesYou, nearestPos, pickTarget } from '../world/enemyTargets';
import { moveWithCollision } from '../world/collision';
import type { Rng } from '../world/rng';
import { soundPath } from '../world/soundPath';
import { EnemyMix, enemyHearing } from '../audio/spatial';
import type { AudioEngine } from '../audio/audio';
import { caughtTimes, nextGruntDelay } from '../state/caughtSequence';
import { hitTimes } from '../state/hitSequence';
import { PLAYER } from '../state/playerRules';
import {
  HARD_CRAWL_BOOST, IN_PLAY, LifeState, LiveState, MIMIC, Member, ResumeState, SEND_HZ, mimicNow, mimicWho, nextMimic, Track, VOICE, VIEW_DELAY, addToTrack, createTrack, hears, louder, sampleTrack,
  easeDelay, noteLate, stepTrack, targetDelay, voiceDistanceGain, voiceNoiseRadius,
} from '../state/coopRun';
import type { RoomPlayer } from '../state/coop';
import { EnemyNet, ItemNet, PanelNet, PowerNet, ReviveNet, RunSync } from '../net/runSync';
import { VoiceChat, micIfAllowed } from '../net/voice';
import type { CoopLink } from '../net/room';
import { TeammateView, createTeamLight, loadTeammate } from './teammateView';
import { createPingMarkers } from './pingView';
import { VoiceClips } from '../audio/voiceClips';
import type { PingMark } from '../world/ping';

type V3 = { x: number; y: number; z: number };
type VoiceNode = ReturnType<AudioEngine['addVoice']>;

/** What the Game does for the run. */
export interface CoopSide {
  item(id: number, it: ItemNet | null): void;
  panel(i: number, p: PanelNet | null): void;
  power(p: PowerNet): void;
  /** The host's Patient has you. */
  caught(): void;
  toWorld(p: Vec2): V3;
  /** Update 1.0.1 — where a logic position is drawn, seen from the floor you're on (its floor's height and
   *  place, no stairs). */
  rel(p: Vec2): V3;
  /** Update 1.0.1 — what the scene is moved by for your floor: scene + shift = where it really is. */
  shift(): V3;
}

interface Mate {
  id: string;
  name: string;
  track: Track;
  /** Smoothed, for this frame. */
  now: LiveState | null;
  /** The newest update (the host hunts with this, not the smoothed one). */
  latest: LiveState | null;
  view: TeammateView | null;
  loading: boolean;
  light: THREE.SpotLight | null;
  voice: VoiceNode | null;
  talkUntil: number;
  stepAccum: number;
  gruntIn: number;
  mix: EnemyMix;
  mixIn: number;
  lastLight: boolean;
  lastHold: string | null;
  lastLife: LifeState;
  /** Their last noise the host already took. */
  noiseSeq: number;
}

/** Off the host: The Patient between two updates. */
interface EnemySnap {
  t: number;
  x: number;
  z: number;
  dx: number;
  dz: number;
}

const OPEN: EnemyMix = { cutoff: 16000, gain: 1, occluded: false };

export class CoopRuntime {
  readonly host: boolean;
  readonly me: string;
  readonly sync: RunSync;
  private mates = new Map<string, Mate>();
  private lights: THREE.SpotLight[] = [];
  /** Who's in which locker. */
  readonly lockers = new Map<number, string>();
  /** Revives under way / done, by who's being got up. */
  readonly revives = new Map<string, ReviveNet>();
  private sendIn = 0;
  private saveIn = 0;
  /** Everyone who's been in the run (a roster player you've never heard from yet is just starting). */
  private seen = new Set<string>();
  private myNoise: (Noise & { seq: number }) | null = null;
  private noiseSeq = 0;
  // The Patient off the host: its updates, smoothed; the events already played.
  private enemySnaps: EnemySnap[] = [];
  private enemyOffset = Infinity;
  /** Update 0.9.9 — how late its updates come, and how far in the past it's drawn (see `targetDelay`). */
  private enemyLate: number[] = [];
  private enemyDelay = VIEW_DELAY;
  /** Update 0.9.9 — on the host: teammates whose catch (on their own screen) it has already taken in. */
  private claimed = new Set<string>();
  private lastNet: EnemyNet | null = null;
  private seenEv = -1;
  // On the host: who it's after, its queue of noises, the one it's holding, its events for everyone.
  private target: string | null = null;
  private queue: Noise[] = [];
  /** It has one of you: who, for how long, where, and whether it hit them (their last life) or grabbed them. */
  hold: { who: string; t: number; at: Vec2; hit: boolean } | null = null;
  private evSeq = 0;
  private ring: [number, string, string][] = [];
  private enemySendIn = 0;
  private started = false;
  // Proximity chat.
  private voice: VoiceChat | null = null;
  private micDb: (() => number) | null = null;
  private voiceNoiseIn = 0;
  myTalking = false;
  /** Out and watching through this teammate's eyes: their body isn't drawn (you'd be inside it). */
  watched: string | null = null;
  private tmp = new THREE.Vector3();
  private pings: ReturnType<typeof createPingMarkers>;
  /** Update 0.9.9 — the mimic: everyone's lines kept here (all games), and on the host when it next mimics
   *  and who has talked. */
  readonly clips: VoiceClips | null;
  private clipOffs = new Map<string, () => void>();
  private mimicIn = 0;
  private talked = new Set<string>();

  constructor(
    private link: CoopLink,
    private level: Level,
    private scene: THREE.Scene,
    private audio: AudioEngine,
    private side: CoopSide,
    private crawlBoostHard: boolean,
  ) {
    this.host = link.host;
    this.me = link.me;
    this.sync = new RunSync(link.store, link.code, link.me, link.host);
    this.pings = createPingMarkers(scene, (p) => this.side.rel(p)); // 1.0.1: on its floor, seen from yours
    this.clips = link.voice && link.mimic ? new VoiceClips(audio.ctx) : null;
    this.mimicIn = nextMimic(true, Math.random);
    // Their flashlights: made now and kept (see createTeamLight).
    for (let i = 0; i < 2; i++) this.lights.push(createTeamLight(scene));
    this.sync.start({
      live: (id, s) => this.onLive(id, s),
      item: (id, it) => side.item(id, it),
      panel: (i, p) => side.panel(i, p),
      locker: (i, who) => (who ? this.lockers.set(i, who) : this.lockers.delete(i)),
      power: (p) => side.power(p),
      revive: (id, r) => (r ? this.revives.set(id, r) : this.revives.delete(id)),
      enemy: (e) => this.onEnemy(e),
      ping: (id, mark) => {
        this.pings.show(id, mark, this.mates.get(id)?.name ?? this.roster().find((p) => p.id === id)?.name ?? '?', performance.now() / 1000);
        this.audio.ping(this.side.toWorld(mark.pos), mark.kind === 'enemy');
      },
    });
    // Proximity chat: starts once you've answered the microphone question (a run that began while the
    // prompt was still up used to go on without your mic for good). A teammate's call waits in your inbox.
    // Update 0.9.9 — never asked here: a prompt mid-run takes the mouse away (said no: chat without it).
    if (link.voice) {
      void (link.mic ? Promise.resolve(link.mic) : micIfAllowed()).then((mic) => {
        if (this.disposed) return;
        this.voice = new VoiceChat(link.store, link.code, link.me, mic, (id, stream) => this.onVoice(id, stream));
        this.voice.start();
        if (mic) this.micDb = audio.micMeter(mic);
        if (mic && this.clips) this.clipOffs.set(this.me, this.clips.record(this.me, mic));
      });
    }
  }

  private disposed = false;

  /** The names in the room, slot order (you included). */
  private roster(): RoomPlayer[] {
    return this.link.players();
  }

  private mate(id: string): Mate {
    let m = this.mates.get(id);
    if (!m) {
      const name = this.roster().find((p) => p.id === id)?.name ?? '?';
      m = {
        id, name, track: createTrack(), now: null, latest: null, view: null, loading: false, light: null, voice: null, talkUntil: 0, stepAccum: 0,
        gruntIn: 5, mix: OPEN, mixIn: 0, lastLight: false, lastHold: null, lastLife: 'up', noiseSeq: -1,
      };
      this.mates.set(id, m);
    }
    return m;
  }

  private onLive(id: string, s: LiveState | null) {
    if (!s) {
      // Gone from the run (left, or dropped off).
      const m = this.mates.get(id);
      if (!m) return;
      this.dropMate(m);
      return;
    }
    const m = this.mate(id);
    this.seen.add(id);
    addToTrack(m.track, s, performance.now() / 1000);
    m.latest = s;
    if (this.host && s.noise && s.noise.seq !== m.noiseSeq) {
      m.noiseSeq = s.noise.seq;
      this.queue.push(s.noise);
    }
  }

  private dropMate(m: Mate) {
    if (this.host && m.latest) {
      const at = m.latest.pos;
      const lockers = [...this.lockers].filter(([, who]) => who === m.id).map(([i]) => i);
      const revives = [...this.revives].filter(([, r]) => r.by === m.id && !r.d).map(([id]) => id);
      this.sync.cleanUpAfter(m.id, at, this.heldBy(m.id), lockers, this.panelsBy(m.id), revives);
    }
    m.view?.dispose();
    if (m.view) this.scene.remove(m.view.root);
    if (m.light) m.light.intensity = 0;
    m.voice?.dispose();
    this.audio.teamDownBreath(m.id, null);
    this.mates.delete(m.id);
  }

  /** Items a player had in their slots, and panels they were repairing (the Game fills these in). */
  heldBy: (id: string) => { id: number; th: number }[] = () => [];
  panelsBy: (id: string) => number[] = () => [];

  private onVoice(id: string, stream: MediaStream | null) {
    const m = this.mate(id);
    m.voice?.dispose();
    m.voice = stream ? this.audio.addVoice(stream) : null;
    this.clipOffs.get(id)?.();
    this.clipOffs.delete(id);
    if (stream && this.clips) this.clipOffs.set(id, this.clips.record(id, stream));
  }

  private onEnemy(e: EnemyNet) {
    const now = performance.now() / 1000;
    // (The host's clock went back: its game started again. Start over, as for a teammate.)
    const prev = this.enemySnaps[this.enemySnaps.length - 1];
    if (prev && e.t < prev.t - 1) {
      this.enemySnaps = [];
      this.enemyOffset = Infinity;
      this.enemyLate = [];
    }
    this.enemyOffset = Math.min(this.enemyOffset, now - e.t);
    noteLate(this.enemyLate, now - e.t - this.enemyOffset);
    const last = this.enemySnaps[this.enemySnaps.length - 1];
    if (!last || e.t > last.t) {
      this.enemySnaps.push({ t: e.t, x: e.x, z: e.z, dx: e.dx, dz: e.dz });
      if (this.enemySnaps.length > 12) this.enemySnaps.shift();
    }
    this.lastNet = e;
  }

  // ——— Each frame ———

  /** You made a noise: the host hears it now, everyone else sends it with their next update. */
  noise(n: Noise) {
    if (this.host) this.queue.push(n);
    else this.myNoise = louder(this.myNoise, { ...n, seq: ++this.noiseSeq });
  }

  /** Bodies you can't walk through: teammates on their feet. */
  blockers(): { x: number; z: number; r: number }[] {
    const out: { x: number; z: number; r: number }[] = [];
    for (const m of this.mates.values()) if (m.now && m.now.life === 'up' && !(m.now.hidden && m.now.locker >= 0)) out.push({ x: m.now.pos.x, z: m.now.pos.z, r: PLAYER.radius });
    return out;
  }

  /**
   * The host's Patient, one frame: who it hunts, the noise it hears, the step, who it catches. Holding
   * someone it caught it stands there (their screen shows the grab and throw) until it vanishes.
   * Returns its events (with 'caught:<uid>' for a catch).
   */
  private stepHost(e: EnemyState, dt: number, mine: LiveState, world: { fuses: number; lockers: LockerSpot[]; rng: Rng }): string[] {
    const events: string[] = [];
    // Update 0.9.9 — teammates caught on their own screen (they say so: their life turns 'caught'). Taken in
    // once each; one that comes while it's holding someone else just plays on their screen.
    const claims: string[] = [];
    for (const m of this.mates.values()) {
      if (m.latest?.life !== 'caught') this.claimed.delete(m.id);
      else if (!this.claimed.has(m.id)) {
        this.claimed.add(m.id);
        claims.push(m.id);
      }
    }
    if (this.hold) {
      const h = this.hold;
      h.t += dt;
      // Grabbed: gone while they're getting up (as solo). Hit: gone soon after they hit the floor.
      if (h.t >= (h.hit ? hitTimes.holdFor : caughtTimes.teleportAt)) {
        this.hold = null;
        teleportAway(this.level, e, h.at);
        events.push('teleported');
      }
      return events;
    }
    const hunted: Hunted[] = [];
    const add = (id: string, s: LiveState) => {
      if (s.life !== 'up') return;
      const sense: PlayerSense = { pos: s.sense, flashlightOn: s.light, crouching: s.crouching, running: s.gait === 'sprint', hidden: s.hidden, facing: { x: -Math.sin(s.yaw), z: -Math.cos(s.yaw) }, beam: s.light };
      hunted.push({ id, sense });
    };
    add(this.me, mine);
    for (const m of this.mates.values()) if (m.latest) add(m.id, m.latest);
    const target = pickTarget(this.level, e, hunted, this.target);
    this.target = target?.id ?? null;
    // The noise it hears this frame: the one that matters most from the queue.
    let n: Noise | null = null;
    for (const q of this.queue) n = louder(n, q);
    this.queue = [];
    // The mimic: now and then, while it prowls, one of you who has talked.
    if (this.link.mimic && this.link.voice) {
      this.mimicIn -= dt;
      if (this.mimicIn <= 0) {
        const who = mimicNow(e.mode, !!e.crawl, false) ? mimicWho([...this.talked], world.rng) : null;
        this.mimicIn = who ? nextMimic(false, world.rng) : MIMIC.retry;
        if (who) events.push(`mimic:${who}`);
      }
    }
    const sense = target?.sense ?? { ...NOBODY, pos: nearestPos(e, hunted) };
    const ev = stepEnemy(this.level, e, { dt, player: sense, noise: n, fuses: world.fuses, lockers: world.lockers, playerLocker: null, crawlBoost: this.crawlBoostHard ? HARD_CRAWL_BOOST : 1 }, world.rng);
    for (const x of ev) if (x !== 'caught' && x !== 'foundYou') events.push(x);
    // Checking a locker with one of you in it: found.
    let victim: string | null = null;
    if (ev.includes('lockerOpen') && e.check) {
      const who = this.lockers.get(e.check.locker);
      if (who && hunted.some((h) => h.id === who)) victim = who;
    }
    // You (the host) it catches here; the others are caught on their own screens (`catchesYou`).
    victim = victim ?? catchable(e, hunted.filter((h) => h.id === this.me))[0] ?? claims[0] ?? null;
    if (victim) {
      const at = { ...(victim === this.me ? mine.sense : this.mates.get(victim)?.latest?.pos ?? e.pos) };
      // Their screen had it reach them; here it may still be a step or two off: it's at them now.
      const d = dist(e.pos, at);
      if (victim !== this.me && d > ENEMY.catchRadius) {
        const k = (ENEMY.catchRadius * 0.8) / d;
        e.pos = moveWithCollision(this.level, at, (e.pos.x - at.x) * k, (e.pos.z - at.z) * k, ENEMY.bodyRadius);
        e.path = [];
      }
      // Already hurt (or Hard's one life): its blow, not its grab. (Their own game decides the same way.)
      const v = victim === this.me ? mine : this.mates.get(victim)?.latest;
      this.hold = { who: victim, t: 0, at: { ...at }, hit: !!v?.injured || this.crawlBoostHard };
      events.push(`caught:${victim}`);
    }
    return events;
  }

  /** Off the host: The Patient where the host had it VIEW_DELAY ago, and its new events. */
  private applyNet(e: EnemyState): string[] {
    const n = this.lastNet;
    if (!n) return [];
    const now = performance.now() / 1000;
    const at = now - this.enemyDelay - this.enemyOffset;
    const s = this.enemySnaps;
    let x = n.x;
    let z = n.z;
    let dx = n.dx;
    let dz = n.dz;
    for (let i = 1; i < s.length; i++) {
      if (at <= s[i].t) {
        const a = s[i - 1];
        const b = s[i];
        const k = Math.max(0, Math.min(1, (at - a.t) / (b.t - a.t || 1)));
        // A jump (teleport) isn't blended across the map.
        const far = Math.hypot(b.x - a.x, b.z - a.z) > 4;
        x = far ? b.x : a.x + (b.x - a.x) * k;
        z = far ? b.z : a.z + (b.z - a.z) * k;
        dx = a.dx + (b.dx - a.dx) * k;
        dz = a.dz + (b.dz - a.dz) * k;
        break;
      }
    }
    const len = Math.hypot(dx, dz) || 1;
    e.pos = { x, z };
    e.dir = { x: dx / len, z: dz / len };
    e.mode = n.m;
    e.windup = n.w ? 1 : 0;
    e.crawl = n.cr ? { phase: (['up', 'on', 'down'] as const)[n.cr[0]] ?? 'on', t: n.cr[1] + Math.max(0, at - n.t), left: 0, then: 'patrol', noise: null } : null;
    e.check = n.ck ? { locker: n.ck[0], phase: n.ck[1] ? 'open' : 'going', t: n.ck[2] } : null;
    this.hold = n.hold ? { who: n.hold[0], t: n.hold[1], at: e.pos, hit: n.hold[2] === 1 } : null;
    const events: string[] = [];
    for (const [seq, type, arg] of n.ev ?? []) {
      if (seq <= this.seenEv) continue;
      if (this.seenEv >= 0) events.push(arg ? `${type}:${arg}` : type);
      this.seenEv = Math.max(this.seenEv, seq);
    }
    if (this.seenEv < 0) this.seenEv = Math.max(0, ...(n.ev ?? []).map((v) => v[0]));
    return events;
  }

  private publishEnemy(e: EnemyState, events: string[]) {
    for (const x of events) {
      const [type, arg] = x.split(':');
      this.ring.push([++this.evSeq, type, arg ?? '']);
    }
    if (this.ring.length > 10) this.ring.splice(0, this.ring.length - 10);
    const c = e.crawl;
    const net: EnemyNet = {
      x: Math.round(e.pos.x * 100) / 100,
      z: Math.round(e.pos.z * 100) / 100,
      dx: Math.round(e.dir.x * 1000) / 1000,
      dz: Math.round(e.dir.z * 1000) / 1000,
      m: e.mode,
      w: e.windup > 0 ? 1 : 0,
      cr: c ? [['up', 'on', 'down'].indexOf(c.phase), Math.round(c.t * 100) / 100] : 0,
      ck: e.check ? [e.check.locker, e.check.phase === 'open' ? 1 : 0, Math.round(e.check.t * 100) / 100] : 0,
      hold: this.hold ? [this.hold.who, Math.round(this.hold.t * 100) / 100, this.hold.hit ? 1 : 0] : 0,
      ev: this.ring,
      t: Math.round((performance.now() / 1000) * 1000) / 1000,
    };
    this.sync.publishEnemy(net);
  }

  /** Host: The Patient may start moving (you've clicked in). Until then it waits at its corner. */
  begin() {
    this.started = true;
  }

  /** Host: the generator came on (the Game calls the summon itself); everyone hears its scream. */
  hostEvent(type: string) {
    if (this.host) this.ring.push([++this.evSeq, type, '']);
  }

  /**
   * One frame of the run. `mine`: your state now. Returns The Patient's events this frame for the Game
   * to play ('caught:<uid>' included; yours has already gone to `side.caught`).
   */
  frame(dt: number, e: EnemyState, mine: LiveState, listener: Vec2, world: { fuses: number; lockers: LockerSpot[]; rng: Rng }): string[] {
    const now = performance.now() / 1000;
    let events: string[] = [];
    if (this.host) {
      if (this.started) events = this.stepHost(e, dt, mine, world);
      this.enemySendIn -= dt;
      if (this.enemySendIn <= 0 || events.length) {
        this.enemySendIn = 1 / SEND_HZ;
        this.publishEnemy(e, events);
      }
    } else {
      this.enemyDelay = easeDelay(this.enemyDelay, targetDelay(this.enemyLate), dt);
      events = this.applyNet(e);
      // Update 0.9.9 — your own catch: by The Patient on your screen.
      if (mine.life === 'up' && catchesYou(e, !!this.hold, { pos: mine.sense, hidden: mine.hidden, flashlightOn: false, crouching: false })) this.side.caught();
    }
    if (events.includes(`caught:${this.me}`)) this.side.caught();

    // Your voice as a noise ("Enemy can hear you talk").
    const db = this.micDb && !this.voice?.isMuted ? this.micDb() : -100;
    this.myTalking = db > -45;
    if (this.myTalking) this.talked.add(this.me);
    this.voiceNoiseIn -= dt;
    if (this.link.hear && IN_PLAY.includes(mine.life) && mine.life === 'up' && this.voiceNoiseIn <= 0) {
      const r = voiceNoiseRadius(db);
      if (r > 0) {
        this.voiceNoiseIn = VOICE.every;
        this.noise({ pos: { ...mine.pos }, radius: r });
      }
    }

    // Where you are and how, about once a second (rejoining puts you back there).
    this.saveIn -= dt;
    if (this.saveIn <= 0 && mine.life !== 'caught') {
      this.saveIn = 1;
      this.sync.saveResume(this.resumeOf(mine));
    }

    // You, ten times a second (with the loudest noise since the last time).
    this.sendIn -= dt;
    if (this.sendIn <= 0) {
      this.sendIn = 1 / SEND_HZ;
      this.sync.publish({ ...mine, noise: this.myNoise, t: now });
      this.myNoise = null;
    }

    // Teammates: where they are now, drawn and heard.
    const roster = this.roster();
    for (const m of [...this.mates.values()]) {
      if (!roster.some((p) => p.id === m.id)) {
        this.dropMate(m);
        continue;
      }
      const prev = m.now;
      stepTrack(m.track, dt);
      m.now = sampleTrack(m.track, now);
      if (!m.now) continue;
      this.drawMate(m, dt, mine);
      this.hearMate(m, prev, dt, listener, mine.life);
    }
    this.voice?.setPeers(roster.filter((p) => p.id !== this.me && this.mates.has(p.id)).map((p) => p.id));
    return events;
  }

  private drawMate(m: Mate, dt: number, mine: LiveState) {
    if (!m.view && !m.loading) {
      m.loading = true;
      m.light = this.lights.find((l) => ![...this.mates.values()].some((o) => o.light === l)) ?? null;
      loadTeammate(m.name, m.light)
        .then((v) => {
          if (!this.mates.has(m.id)) return v.dispose();
          m.view = v;
          this.scene.add(v.root);
        })
        .catch((err) => console.warn('Teammate model failed to load', err));
    }
    // Update 1.0.1 — drawn where they really are, seen from your floor (another floor, or up the stairs).
    const s = m.now!;
    const at = this.side.rel(s.pos);
    const rev = this.revivingWho(m.id, mine);
    const revAt = rev ? this.side.rel(rev.pos) : null;
    m.view?.update({ ...s, pos: { x: at.x, z: at.z }, rise: at.y + stairRise(this.level, s.pos) }, dt, performance.now() / 1000 < m.talkUntil, rev && revAt ? { ...rev, pos: { x: revAt.x, z: revAt.z } } : null);
    if (m.view && m.id === this.watched) m.view.root.visible = false;
  }

  private headOf(m: Mate): V3 {
    const s = m.now!;
    if (m.view) {
      m.view.head(this.tmp);
      const o = this.side.shift(); // the view is drawn from your floor; sounds go where it really is
      return { x: this.tmp.x + o.x, y: this.tmp.y + o.y, z: this.tmp.z + o.z };
    }
    const w = this.side.toWorld(s.pos);
    return { x: w.x, y: w.y + (s.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight), z: w.z };
  }

  /** Their footsteps, grunts, flashlight clicks, pick-ups, the throw and the slam; their voice. */
  private hearMate(m: Mate, prev: LiveState | null, dt: number, listener: Vec2, myLife: LifeState) {
    const s = m.now!;
    m.mixIn -= dt;
    if (m.mixIn <= 0) {
      m.mixIn = 0.3;
      m.mix = enemyHearing(soundPath(this.level, s.pos, listener));
    }
    const feet = this.side.toWorld(s.pos);
    const at = { x: feet.x, y: feet.y + 0.1, z: feet.z };
    if (s.life === 'up' && prev && s.gait !== 'idle') {
      m.stepAccum += dist(prev.pos, s.pos);
      const len = PLAYER.stepLength[s.gait];
      if (m.stepAccum >= len) {
        m.stepAccum = 0;
        this.audio.teamStep(at, s.gait, m.mix);
      }
    }
    if (s.injured && s.life === 'up') {
      m.gruntIn -= dt;
      if (m.gruntIn <= 0) {
        m.gruntIn = nextGruntDelay(Math.random);
        this.audio.teamGrunt(this.headOf(m), m.mix);
      }
    }
    if (s.light !== m.lastLight && s.life === 'up') this.audio.teamClick(this.headOf(m));
    if (s.hold && s.hold !== m.lastHold) this.audio.teamPickup(this.headOf(m));
    if (s.life !== m.lastLife) {
      if (s.life === 'caught') this.audio.teamThrown(this.headOf(m));
      if (s.life === 'down') this.audio.teamImpact(at);
    }
    this.audio.teamDownBreath(m.id, s.life === 'down' ? at : null, m.mix);
    m.lastLight = s.light;
    m.lastHold = s.hold;
    m.lastLife = s.life;
    // Proximity chat: louder the closer, by distance alone (Update 0.9.9 — walls no longer muffle it,
    // Nikola); the living don't hear the out.
    if (m.voice) {
      const ok = hears(myLife, s.life);
      const spatial = IN_PLAY.includes(s.life);
      // Update 1.0.1 — how far apart you really are (a floor apart is 3 m up, not rows across the grid).
      const a = this.side.toWorld(s.pos);
      const b = this.side.toWorld(listener);
      const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      const g = !ok ? 0 : spatial ? voiceDistanceGain(d) : 1;
      m.voice.set(this.headOf(m), g, 16000, spatial);
      if (ok && m.voice.level() > -45) {
        m.talkUntil = performance.now() / 1000 + 0.3;
        this.talked.add(m.id);
      }
    }
  }

  /** Update 0.9.9 — your ping (F): shown for you, sent to the others. */
  ping(mark: PingMark) {
    this.pings.show(this.me, mark, null, performance.now() / 1000);
    this.audio.ping(this.side.toWorld(mark.pos), mark.kind === 'enemy');
    this.sync.ping(mark);
  }

  /** Each frame (drawn ones): the markers fade, and say how far they are from your eyes. */
  drawPings(eye: { x: number; y: number; z: number }) {
    this.pings.update(eye, performance.now() / 1000);
  }

  setMuted(on: boolean) {
    this.voice?.setMuted(on);
  }

  get muted() {
    return this.voice?.isMuted ?? false;
  }

  /** Proximity chat is on for this run (the host ticked it), whether or not it has connected yet. */
  get hasVoice() {
    return this.link.voice;
  }

  get hasMic() {
    return !!this.micDb;
  }

  /** What the Game knows about you that the run doesn't (lives), for the saved state. */
  resumeOf: (mine: LiveState) => ResumeState = (mine) => ({ pos: mine.pos, yaw: mine.yaw, lives: 1, injured: mine.injured, life: mine.life, bleed: mine.bleed });

  /** Everyone and where they are in the run (you as `myLife`; anyone gone from the room, or dropped out
   *  and not back yet, as 'left'). */
  team(myLife: LifeState): Member[] {
    return this.roster().map((p): Member => {
      if (p.id === this.me) return { id: p.id, name: p.name, life: myLife };
      const m = this.mates.get(p.id);
      return { id: p.id, name: p.name, life: m?.latest?.life ?? (this.seen.has(p.id) ? 'left' : 'up') };
    }).concat(
      // Started the run with you but gone from the room since.
      this.link.startedWith.filter((p) => !this.roster().some((r) => r.id === p.id)).map((p) => ({ id: p.id, name: p.name, life: 'left' as const })),
    );
  }

  /** A teammate as you'd see them now (smoothed). */
  mateNow(id: string): (LiveState & { name: string }) | null {
    const m = this.mates.get(id);
    return m?.now ? { ...m.now, name: m.name } : null;
  }

  /** Update 0.9.9 — whoever `id` is getting up (where they lie, the way they face), or null. `mine`: you. */
  revivingWho(id: string, mine: LiveState | null): { pos: Vec2; yaw: number } | null {
    for (const [downId, r] of this.revives) {
      if (r.by !== id || r.d) continue;
      const down = downId === this.me ? mine : this.mates.get(downId)?.now;
      if (down?.life === 'down') return down;
    }
    return null;
  }

  /** Teammates who are down, as you'd see them now. */
  downMates(): { id: string; name: string; pos: Vec2 }[] {
    return [...this.mates.values()].filter((m) => m.now?.life === 'down').map((m) => ({ id: m.id, name: m.name, pos: m.now!.pos }));
  }

  /** Team bar: name, where they are in it, injured, talking. */
  /** Team list. `voice`: null when chat is off; false while their voice hasn't reached you (yet, or at all:
   *  then the list says so, rather than silence you can't explain). */
  teamHud(): { name: string; life: LifeState | 'left'; hurt: boolean; talking: boolean; bleed: number; voice: boolean | null }[] {
    const now = performance.now() / 1000;
    return [...this.mates.values()].map((m) => ({
      name: m.name,
      life: m.latest?.life ?? 'up',
      hurt: !!m.latest?.injured,
      talking: now < m.talkUntil,
      bleed: Math.ceil(m.latest?.bleed ?? 0),
      voice: this.link.voice ? !!m.voice : null,
    }));
  }

  dispose() {
    this.disposed = true;
    this.pings.dispose();
    this.clips?.dispose();
    this.sync.stop();
    this.voice?.stop();
    for (const m of [...this.mates.values()]) {
      m.view?.dispose();
      if (m.view) this.scene.remove(m.view.root);
      m.voice?.dispose();
    }
    this.mates.clear();
    for (const l of this.lights) {
      l.map?.dispose();
      l.dispose();
      this.scene.remove(l, l.target);
    }
  }
}

