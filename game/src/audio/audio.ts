// Sound engine. Recorded samples from public/audio (see manifest.json) with a synthesised
// fallback per sound. Enemy and generator sounds are 3D (PannerNode, HRTF); enemy sounds are
// also filtered by distance and walls (audio/spatial.ts).
import { CRAWL_STEP_GAIN, DOWN_BREATH_GAIN, EnemyMix, FLASHLIGHT_CLICK_GAIN, NIGHT_VISION_SFX_GAIN, PANEL_SFX_GAIN, PLAYER_STEP_GAIN, RUN_BREATH_GAIN, SPOT_SCREAM_GAIN, enemyStepGain } from './spatial';

type V3 = { x: number; y: number; z: number };

const SAMPLE_BASE = '/audio';

/** Update 0.9.9 — loudness of what's in an analyser right now, in dBFS (-100 for silence). */
function rmsDb(an: AnalyserNode, buf: Float32Array<ArrayBuffer>): number {
  an.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);
  return rms > 1e-5 ? 20 * Math.log10(rms) : -100;
}

export class AudioEngine {
  ctx: AudioContext;
  /** Update 0.9.2 — master → compressor → speakers; the SFX and BGM buses feed it. */
  private master: GainNode;
  private sfx: GainNode;
  private bgm: GainNode;
  /** Update 0.9.9 — teammates' voices (proximity chat), on their own slider. */
  private voiceBus: GainNode;
  private noiseBuf: AudioBuffer;
  private ambience: GainNode;
  private tension: GainNode;
  private breath: { panner: PannerNode; gain: GainNode; filter?: BiquadFilterNode } | null = null;
  private hum: { panner: PannerNode; gain: GainNode } | null = null;
  private heartTimer = 0;
  /** Update 0.4 — recorded sounds from public/audio (see manifest.json); synth fallback per sound. */
  private samples = new Map<string, AudioBuffer[]>();
  private ready: Promise<void>;
  private loops: AudioBufferSourceNode[] = [];
  private clankTimer = 12;

  constructor(volume: { master: number; sfx: number; bgm: number; voice?: number }) {
    this.ctx = new AudioContext();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master = this.ctx.createGain();
    this.master.gain.value = volume.master;
    this.master.connect(comp).connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = volume.sfx;
    this.sfx.connect(this.master);
    this.bgm = this.ctx.createGain();
    this.bgm.gain.value = volume.bgm;
    this.bgm.connect(this.master);
    this.voiceBus = this.ctx.createGain();
    this.voiceBus.gain.value = volume.voice ?? 1;
    this.voiceBus.connect(this.master);

    this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this.ambience = this.ctx.createGain();
    this.ambience.gain.value = 0;
    this.ambience.connect(this.bgm);
    this.tension = this.ctx.createGain();
    this.tension.gain.value = 0;
    this.tension.connect(this.bgm);
    this.ready = this.loadSamples().catch((err) => console.warn('Sound files failed to load, using synth sounds.', err));
  }

  private async loadSamples() {
    const res = await fetch(`${SAMPLE_BASE}/manifest.json`);
    if (!res.ok) return;
    const manifest = (await res.json()) as Record<string, string[]>;
    await Promise.all(
      Object.entries(manifest).map(async ([name, files]) => {
        const bufs = await Promise.all(
          files.map(async (f) => this.ctx.decodeAudioData(await (await fetch(`${SAMPLE_BASE}/${f}`)).arrayBuffer())),
        );
        this.samples.set(name, bufs);
      }),
    );
  }

  has(name: string) {
    return this.samples.has(name);
  }

  /** Plays a random variant of a sample. Returns false if it isn't loaded (caller falls back to synth). */
  private playSample(name: string, o: { gain?: number; rate?: number; at?: V3; ref?: number; rolloff?: number; loop?: boolean; to?: AudioNode; when?: number; cutoff?: number; offset?: number } = {}): AudioBufferSourceNode | null {
    const bufs = this.samples.get(name);
    if (!bufs?.length) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = bufs[Math.floor(Math.random() * bufs.length)];
    src.playbackRate.value = o.rate ?? 1;
    if (o.loop) {
      // Skip MP3 encoder padding at both ends so the loop seam is clean.
      src.loop = true;
      src.loopStart = Math.min(0.05, src.buffer.duration * 0.1);
      src.loopEnd = src.buffer.duration - Math.min(0.05, src.buffer.duration * 0.1);
    }
    const g = this.ctx.createGain();
    g.gain.value = o.gain ?? 1;
    if (o.cutoff !== undefined) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.cutoff;
      src.connect(lp).connect(g);
    } else src.connect(g);
    if (o.at) g.connect(this.panner(o.at, o.ref ?? 2, o.rolloff ?? 1.3)).connect(o.to ?? this.sfx);
    else g.connect(o.to ?? this.sfx);
    src.start(o.when ?? this.now, o.loop ? src.loopStart : o.offset ?? 0);
    if (o.loop) this.loops.push(src);
    return src;
  }

  private jitter(spread: number) {
    return 1 + (Math.random() * 2 - 1) * spread;
  }

  /** Room tone + tension layer. Recorded ambience replaces the synth drone when present. */
  startAmbience() {
    void this.ready.then(() => {
      if (this.has('ambience')) {
        this.playSample('ambience', { loop: true, gain: 0.9, to: this.ambience });
        this.ambience.gain.setValueAtTime(0, this.now);
        this.ambience.gain.linearRampToValueAtTime(0.7, this.now + 3);
        this.synthTensionOnly();
      } else this.synthAmbience();
    });
  }

  startEnemyBreath(p: V3) {
    void this.ready.then(() => {
      if (!this.has('enemy_breath')) return this.synthBreath(p);
      const pn = this.panner(p, 1.5, 1.6);
      const gain = this.ctx.createGain();
      gain.gain.value = 0.6;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 16000;
      lp.connect(gain).connect(pn).connect(this.sfx);
      this.playSample('enemy_breath', { loop: true, to: lp });
      this.breath = { panner: pn, gain, filter: lp };
    });
  }

  footstep(kind: 'walk' | 'sprint' | 'crouch') {
    const gain = (kind === 'sprint' ? 1 : kind === 'walk' ? 0.65 : 0.22) * PLAYER_STEP_GAIN;
    const rate = (kind === 'sprint' ? 1.08 : 1) * this.jitter(0.06);
    if (!this.playSample('step_player', { gain, rate })) this.synthFootstep(kind);
  }

  private runBreath: { gain: GainNode; on: boolean } | null = null;
  /** Update 0.9.6.1 — your breathing while you sprint: one loop, faded in as you run and out as you stop. */
  setRunBreath(on: boolean) {
    if (!this.runBreath) {
      if (!on || !this.has('run_breath')) return;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.sfx);
      this.playSample('run_breath', { loop: true, to: gain });
      this.runBreath = { gain, on: false };
    }
    if (on === this.runBreath.on) return;
    this.runBreath.on = on;
    this.runBreath.gain.gain.setTargetAtTime(on ? RUN_BREATH_GAIN : 0, this.now, on ? 0.1 : 0.25);
  }

  private downBreath: { gain: GainNode; on: boolean } | null = null;
  /** Update 0.9.9 — co-op, down: your heavy breathing, a loop faded in while you're on the floor. */
  setDownBreath(on: boolean) {
    if (!this.downBreath) {
      if (!on || !this.has('down_breath')) return;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.sfx);
      this.playSample('down_breath', { loop: true, to: gain });
      this.downBreath = { gain, on: false };
    }
    if (on === this.downBreath.on) return;
    this.downBreath.on = on;
    this.downBreath.gain.gain.setTargetAtTime(on ? DOWN_BREATH_GAIN : 0, this.now, on ? 0.3 : 0.4);
  }

  private teamBreaths = new Map<string, { gain: GainNode; lp: BiquadFilterNode; pn: PannerNode }>();
  /** Update 0.9.9 — a teammate down on the floor: their breathing, where they lie (null: stop it), so you
   *  can find them by ear too. */
  teamDownBreath(id: string, p: V3 | null, mix: EnemyMix = { cutoff: 16000, gain: 1, occluded: false }) {
    let b = this.teamBreaths.get(id);
    if (!p) {
      if (b) b.gain.gain.setTargetAtTime(0, this.now, 0.3);
      return;
    }
    if (!b) {
      if (!this.has('down_breath')) return;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      const pn = this.panner(p, 1.5, 1.3);
      lp.connect(gain).connect(pn).connect(this.sfx);
      this.playSample('down_breath', { loop: true, to: lp });
      b = { gain, lp, pn };
      this.teamBreaths.set(id, b);
    }
    this.place(b.pn, p);
    b.lp.frequency.setTargetAtTime(mix.cutoff, this.now, 0.1);
    b.gain.gain.setTargetAtTime(DOWN_BREATH_GAIN * 1.4 * mix.gain, this.now, 0.2);
  }

  /** 3D footstep at its position, darker with distance and muffled behind walls.
   *  Update 0.9.7 — `crawl`: its hands and feet on the ceiling, quicker and lighter. */
  enemyStep(p: V3, heavy: boolean, mix: EnemyMix = { cutoff: 16000, gain: 1, occluded: false }, crawl = false) {
    const gain = enemyStepGain(heavy, mix) * (crawl ? CRAWL_STEP_GAIN : 1);
    const rate = (crawl ? 1.35 : 0.9) * this.jitter(0.06);
    if (!this.playSample('step_patient', { at: p, ref: 2.5, rolloff: 1.3, gain, cutoff: mix.cutoff, rate })) this.synthEnemyStep(p, heavy);
  }

  /** Update 0.4 — its scream from where it stands (on spotting you). */
  enemyScream(p: V3) {
    if (!this.playSample('enemy_scream', { at: p, ref: 4, rolloff: 0.9, gain: SPOT_SCREAM_GAIN })) this.stinger();
  }

  /** Update 0.6.4 — its scream when the power comes on: wherever it is, you hear it through the walls. */
  powerScream() {
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    lp.connect(this.sfx);
    if (!this.playSample('enemy_scream', { gain: 0.9, rate: 0.92, to: lp })) this.stinger();
  }

  /** Jumpscare: the recorded scream right in your face, with the distorted synth layered under it. */
  scream() {
    // The recording leads; the synth layer underneath adds grit.
    this.synthScream(this.playSample('enemy_scream', { gain: 1.2, rate: 0.85 }) ? 0.45 : 1);
  }

  pickup() {
    if (!this.playSample('pickup', { gain: 0.8 })) this.synthPickup();
  }

  paper() {
    if (!this.playSample('paper', { gain: 0.9 })) this.synthPaper();
  }

  click() {
    if (!this.playSample('flashlight_click', { gain: 0.9 * FLASHLIGHT_CLICK_GAIN })) this.synthClick();
  }

  generatorStart(p: V3) {
    const start = this.playSample('generator_start', { at: p, ref: 3, rolloff: 1, gain: 1 });
    if (!start || !this.has('generator_hum')) return this.synthGeneratorStart(p);
    // Hum fades in under the tail of the start-up.
    const pn = this.panner(p, 3, 1);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, this.now);
    gain.gain.linearRampToValueAtTime(0.8, this.now + 3.5);
    gain.connect(pn).connect(this.sfx);
    this.playSample('generator_hum', { loop: true, to: gain, when: this.now + 1.5 });
    this.hum = { panner: pn, gain };
  }

  doorOpen() {
    if (!this.playSample('door_open', { gain: 1 })) this.synthDoorOpen();
  }

  // Update 0.6 — the first catch: grabbed, thrown (your scream), the floor, then injured grunts.
  caught() {
    if (!this.playSample('caught', { gain: 1 })) this.stinger();
  }
  thrownScream() {
    this.playSample('thrown', { gain: 1 });
  }
  floorImpact() {
    if (!this.playSample('floor_impact', { gain: 1.1 })) this.synthFootstep('sprint');
  }
  /** Update 0.6.3 — `maxSeconds` cuts it short with a quick fade (the 1 s grunt as you first get up). */
  grunt(maxSeconds?: number) {
    if (maxSeconds === undefined) {
      this.playSample('grunt', { gain: 0.8, rate: this.jitter(0.05) });
      return;
    }
    const g = this.ctx.createGain();
    g.connect(this.sfx);
    const end = this.now + maxSeconds;
    g.gain.setValueAtTime(1, end - 0.15);
    g.gain.linearRampToValueAtTime(0, end);
    this.playSample('grunt', { gain: 0.8, rate: this.jitter(0.05), to: g })?.stop(end + 0.02);
  }

  private wakeClip: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private wakeAsk = 0;
  /**
   * Update 0.9.6.1 — the wake-up recording (replaces the 1 s grunt as you got up), from `at` s into it, so
   * a resume picks up where the scene is. Waits for the sounds to load, skipping what would have played.
   */
  wakeUp(at = 0) {
    this.stopWakeUp();
    const ask = ++this.wakeAsk;
    const askedAt = this.now;
    void this.ready.then(() => {
      const offset = at + this.now - askedAt;
      const length = this.samples.get('wake_up')?.[0]?.duration ?? 0;
      if (ask !== this.wakeAsk || offset >= length) return;
      const gain = this.ctx.createGain();
      gain.connect(this.sfx);
      const src = this.playSample('wake_up', { to: gain, offset });
      if (src) this.wakeClip = { src, gain };
    });
  }
  /** Paused mid wake-up: a quick fade (`wakeUp(t)` starts it again from there). */
  stopWakeUp() {
    this.wakeAsk++;
    if (!this.wakeClip) return;
    const w = this.wakeClip;
    this.wakeClip = null;
    w.gain.gain.setTargetAtTime(0, this.now, 0.03);
    w.src.stop(this.now + 0.2);
  }

  resume() {
    return this.ctx.resume();
  }

  setVolume(v: { master: number; sfx: number; bgm: number; voice?: number }) {
    const at = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(v.master, at, 0.05);
    this.sfx.gain.setTargetAtTime(v.sfx, at, 0.05);
    this.bgm.gain.setTargetAtTime(v.bgm, at, 0.05);
    if (v.voice !== undefined) this.voiceBus.gain.setTargetAtTime(v.voice, at, 0.05);
  }

  // Update 0.9.9 — co-op: your teammates, placed where they are and muffled by the walls between you
  // (`mix`, from audio/spatial.ts enemyHearing, the same as The Patient's sounds).
  teamStep(p: V3, kind: 'walk' | 'sprint' | 'crouch', mix: EnemyMix) {
    const gain = (kind === 'sprint' ? 1 : kind === 'walk' ? 0.65 : 0.22) * PLAYER_STEP_GAIN * mix.gain;
    if (gain <= 0.001) return;
    this.playSample('step_player', { at: p, ref: 2, rolloff: 1.3, gain, cutoff: mix.cutoff, rate: (kind === 'sprint' ? 1.08 : 1) * this.jitter(0.06) });
  }
  teamGrunt(p: V3, mix: EnemyMix) {
    this.playSample('grunt', { at: p, ref: 2, rolloff: 1.2, gain: 0.8 * mix.gain, cutoff: mix.cutoff, rate: this.jitter(0.05) });
  }
  teamClick(p: V3) {
    this.playSample('flashlight_click', { at: p, ref: 1.5, rolloff: 1.6, gain: FLASHLIGHT_CLICK_GAIN * 0.8 });
  }
  teamPickup(p: V3) {
    this.playSample('pickup', { at: p, ref: 1.5, rolloff: 1.6, gain: 0.5 });
  }
  /**
   * Update 0.9.9 — The Patient mimics one of you (audio/voiceClips.ts): your line, from where it is, wrong.
   * Lower and slower; doubled by a second copy a hair lower and later (not quite one voice); roughened; a
   * short echo; muffled by the walls between like its other sounds.
   */
  mimic(buf: AudioBuffer, p: V3, mix: EnemyMix, rate: number) {
    const at = this.now;
    const ctx = this.ctx;
    const pn = this.panner(p, 2.5, 1.2);
    const out = ctx.createGain();
    out.gain.value = 1.7 * Math.max(0.15, mix.gain);
    out.connect(pn).connect(this.sfx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(mix.cutoff, 4200);
    const shape = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(2.6 * x) / Math.tanh(2.6);
    }
    shape.curve = curve;
    lp.connect(shape).connect(out);
    const echo = ctx.createDelay(1);
    echo.delayTime.value = 0.14;
    const back = ctx.createGain();
    back.gain.value = 0.36;
    const wet = ctx.createGain();
    wet.gain.value = 0.45;
    shape.connect(echo);
    echo.connect(back).connect(echo);
    echo.connect(wet).connect(out);
    const r = rate * this.jitter(0.03);
    const nodes: AudioNode[] = [pn, out, lp, shape, echo, back, wet];
    for (const [k, delay, g] of [[1, 0, 1], [0.965, 0.035, 0.55]] as const) {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.playbackRate.value = r * k;
      const gain = ctx.createGain();
      gain.gain.value = g;
      s.connect(gain).connect(lp);
      s.start(at + delay);
      nodes.push(s, gain);
    }
    // Let it ring out, then take it all apart (the echo loop would keep itself alive).
    setTimeout(() => nodes.forEach((n) => n.disconnect()), (buf.duration / (r * 0.965) + 3) * 1000);
  }

  /** Update 0.9.9 — a ping (F): two quick tones where it is (lower and harsher for The Patient). */
  ping(p: V3, danger: boolean) {
    const at = this.now;
    const pn = this.panner(p, 6, 0.6);
    pn.connect(this.sfx);
    for (const [k, f] of (danger ? [[0, 520], [0.11, 390]] : [[0, 880], [0.09, 1320]]) as [number, number][]) {
      const o = this.osc(danger ? 'square' : 'sine', f);
      const g = this.env(danger ? 0.08 : 0.12, 0.005, 0.16, at + k);
      o.connect(g).connect(pn);
      o.start(at + k);
      o.stop(at + k + 0.25);
    }
  }
  teamThrown(p: V3) {
    this.playSample('thrown', { at: p, ref: 3, rolloff: 1.1, gain: 0.9 });
  }
  teamImpact(p: V3) {
    this.playSample('floor_impact', { at: p, ref: 3, rolloff: 1.1, gain: 0.9 });
  }

  /**
   * Update 0.9.9 — a teammate's voice (proximity chat): through a wall filter and a gain into a 3D panner
   * on their head; `set` moves it each frame. `level()` is how loud they are right now (dBFS), for the
   * "talking" mark over their head.
   */
  addVoice(stream: MediaStream) {
    // Chrome only hands a WebRTC stream to Web Audio while it's also playing in a (muted) element.
    const el = new Audio();
    el.srcObject = stream;
    el.muted = true;
    void el.play().catch(() => {});
    const src = this.ctx.createMediaStreamSource(stream);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 16000;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const pn = this.panner({ x: 0, y: 0, z: 0 }, 2, 1.1);
    pn.maxDistance = 40;
    const flat = this.ctx.createGain();
    flat.gain.value = 0;
    const meter = this.ctx.createAnalyser();
    meter.fftSize = 512;
    src.connect(meter);
    src.connect(lp).connect(gain).connect(pn).connect(this.voiceBus);
    lp.connect(flat).connect(this.voiceBus);
    const buf = new Float32Array(meter.fftSize);
    return {
      /** `spatial` false: straight in your ears (an out player you're both watching from). */
      set: (p: V3, g: number, cutoff: number, spatial = true) => {
        this.place(pn, p);
        const t = this.now;
        gain.gain.setTargetAtTime(spatial ? g : 0, t, 0.05);
        flat.gain.setTargetAtTime(spatial ? 0 : g * 0.6, t, 0.05);
        lp.frequency.setTargetAtTime(cutoff, t, 0.05);
      },
      level: () => rmsDb(meter, buf),
      dispose: () => {
        src.disconnect();
        lp.disconnect();
        gain.disconnect();
        pn.disconnect();
        flat.disconnect();
        el.srcObject = null;
      },
    };
  }

  /** Update 0.9.9 — how loud you are on your microphone (dBFS), for "Enemy can hear you talk". Not played. */
  micMeter(stream: MediaStream): () => number {
    const src = this.ctx.createMediaStreamSource(stream);
    const meter = this.ctx.createAnalyser();
    meter.fftSize = 1024;
    src.connect(meter);
    const buf = new Float32Array(meter.fftSize);
    return () => rmsDb(meter, buf);
  }

  private get now() {
    return this.ctx.currentTime;
  }

  private noise(loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = loop;
    return s;
  }

  private osc(type: OscillatorType, freq: number) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    return o;
  }

  private env(peak: number, attack: number, decay: number, at = this.now) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    return g;
  }

  private panner(p: V3, ref = 2, rolloff = 1.4) {
    const pn = this.ctx.createPanner();
    pn.panningModel = 'HRTF';
    pn.distanceModel = 'inverse';
    pn.refDistance = ref;
    pn.rolloffFactor = rolloff;
    pn.maxDistance = 60;
    // Update 0.4.1 — set the position immediately. Gliding there from (0,0,0) put the attack of
    // every footstep at the map corner, which is what made them sound mono / directionless.
    pn.positionX.value = p.x;
    pn.positionY.value = p.y;
    pn.positionZ.value = p.z;
    return pn;
  }

  private place(pn: PannerNode, p: V3) {
    const t = this.now;
    pn.positionX.setTargetAtTime(p.x, t, 0.02);
    pn.positionY.setTargetAtTime(p.y, t, 0.02);
    pn.positionZ.setTargetAtTime(p.z, t, 0.02);
  }

  setListener(pos: V3, forward: V3) {
    const l = this.ctx.listener;
    const t = this.now;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.02);
      l.positionY.setTargetAtTime(pos.y, t, 0.02);
      l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(forward.x, t, 0.02);
      l.forwardY.setTargetAtTime(forward.y, t, 0.02);
      l.forwardZ.setTargetAtTime(forward.z, t, 0.02);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
  }

  /** Room tone: detuned sub drone + filtered air. Also the chase tension layer (silent until chased). */
  private synthAmbience() {
    const t = this.now;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 140;
    lp.connect(this.ambience);
    for (const f of [41, 41.6, 61.7]) {
      const o = this.osc('sawtooth', f);
      const g = this.ctx.createGain();
      g.gain.value = 0.12;
      o.connect(g).connect(lp);
      o.start();
    }
    const air = this.noise(true);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 0.6;
    const lfo = this.osc('sine', 0.07);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 300;
    lfo.connect(lfoGain).connect(bp.frequency);
    const ag = this.ctx.createGain();
    ag.gain.value = 0.05;
    air.connect(bp).connect(ag).connect(this.ambience);
    air.start();
    lfo.start();
    this.ambience.gain.linearRampToValueAtTime(0.5, t + 3);
    this.synthTensionOnly();
  }

  /** Tension: dissonant high strings with tremolo (silent until fear/chase raise it). */
  private synthTensionOnly() {
    const tbp = this.ctx.createBiquadFilter();
    tbp.type = 'bandpass';
    tbp.frequency.value = 900;
    tbp.Q.value = 0.8;
    const trem = this.ctx.createGain();
    trem.gain.value = 0.5;
    const tremLfo = this.osc('sine', 7);
    const tremDepth = this.ctx.createGain();
    tremDepth.gain.value = 0.5;
    tremLfo.connect(tremDepth).connect(trem.gain);
    tremLfo.start();
    for (const f of [220, 233, 311, 466]) {
      const o = this.osc('sawtooth', f);
      const g = this.ctx.createGain();
      g.gain.value = 0.05;
      o.connect(g).connect(tbp);
      o.start();
    }
    tbp.connect(trem).connect(this.tension);
  }

  /** Looping breath/growl that follows the enemy. */
  private synthBreath(p: V3) {
    const pn = this.panner(p, 1.5, 1.6);
    const gain = this.ctx.createGain();
    gain.gain.value = 0.6;
    const n = this.noise(true);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 380;
    bp.Q.value = 1.2;
    const breathGain = this.ctx.createGain();
    breathGain.gain.value = 0;
    const lfo = this.osc('sine', 0.32);
    const lfoAmt = this.ctx.createGain();
    lfoAmt.gain.value = 0.35;
    lfo.connect(lfoAmt).connect(breathGain.gain);
    n.connect(bp).connect(breathGain).connect(gain);
    const growl = this.osc('sawtooth', 52);
    const glp = this.ctx.createBiquadFilter();
    glp.type = 'lowpass';
    glp.frequency.value = 180;
    const gg = this.ctx.createGain();
    gg.gain.value = 0.18;
    growl.connect(glp).connect(gg).connect(gain);
    gain.connect(pn).connect(this.sfx);
    n.start();
    lfo.start();
    growl.start();
    this.breath = { panner: pn, gain };
  }

  updateEnemy(p: V3, chasing: boolean, mix: EnemyMix = { cutoff: 16000, gain: 1, occluded: false }) {
    if (!this.breath) return;
    this.place(this.breath.panner, p);
    this.breath.gain.gain.setTargetAtTime((chasing ? 1.1 : 0.55) * mix.gain, this.now, 0.3);
    this.breath.filter?.frequency.setTargetAtTime(mix.cutoff, this.now, 0.15);
  }

  private synthFootstep(kind: 'walk' | 'sprint' | 'crouch') {
    const t = this.now;
    const s = this.noise();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = kind === 'sprint' ? 1400 : kind === 'walk' ? 950 : 500;
    const g = this.env((kind === 'sprint' ? 0.45 : kind === 'walk' ? 0.28 : 0.08) * PLAYER_STEP_GAIN, 0.004, 0.12);
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    s.connect(lp).connect(g).connect(this.sfx);
    s.start(t, Math.random(), 0.2);
  }

  private synthEnemyStep(p: V3, heavy: boolean) {
    const t = this.now;
    const pn = this.panner(p, 2.5, 1.3);
    const o = this.osc('sine', 85);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    const g = this.env(heavy ? 1.1 : 0.7, 0.005, 0.22);
    o.connect(g).connect(pn).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.3);
    // Wet drag.
    if (Math.random() < 0.4) {
      const s = this.noise();
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 700;
      const ng = this.env(0.25, 0.03, 0.35);
      s.connect(bp).connect(ng).connect(pn);
      s.start(t + 0.05, Math.random(), 0.45);
    }
  }

  /** Distant metal clanks somewhere in the building. Call every frame. */
  tickAmbient(dt: number, listener: V3) {
    this.clankTimer -= dt;
    if (this.clankTimer > 0) return;
    this.clankTimer = 14 + Math.random() * 26;
    const a = Math.random() * Math.PI * 2;
    const r = 12 + Math.random() * 15;
    const p = { x: listener.x + Math.cos(a) * r, y: 2, z: listener.z + Math.sin(a) * r };
    const t = this.now;
    const pn = this.panner(p, 3, 1);
    const s = this.noise();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 250 + Math.random() * 600;
    bp.Q.value = 18;
    const g = this.env(1.4, 0.002, 1.8);
    s.connect(bp).connect(g).connect(pn).connect(this.sfx);
    s.start(t, 0, 2);
  }

  /** Heartbeat + tension layer follow fear (0..1). Call every frame. */
  tickFear(dt: number, fear: number, chasing: boolean) {
    this.tension.gain.setTargetAtTime(chasing ? 0.35 : fear * 0.08, this.now, chasing ? 0.15 : 1.2);
    if (fear < 0.15) return;
    this.heartTimer -= dt;
    if (this.heartTimer > 0) return;
    const bpm = 70 + fear * 90;
    this.heartTimer = 60 / bpm;
    // Update 0.4 — recorded heartbeat when available, a touch faster and louder with fear.
    if (!this.playSample('heartbeat', { gain: 0.35 + 0.65 * fear, rate: 1 + fear * 0.15 })) this.synthHeartbeat(fear);
  }

  private synthHeartbeat(fear: number) {
    const t = this.now;
    for (const [off, amp] of [[0, 1], [0.16, 0.7]] as const) {
      const o = this.osc('sine', 58);
      o.frequency.exponentialRampToValueAtTime(34, t + off + 0.12);
      const g = this.env(amp * (0.35 + fear * 0.65), 0.008, 0.16, t + off);
      o.connect(g).connect(this.sfx);
      o.start(t + off);
      o.stop(t + off + 0.25);
    }
  }

  /** Stinger when it spots you. */
  stinger() {
    const t = this.now;
    const g = this.env(0.5, 0.01, 1.6);
    g.connect(this.sfx);
    for (const f of [180, 254, 359, 508]) {
      const o = this.osc('sawtooth', f);
      o.frequency.linearRampToValueAtTime(f * 0.94, t + 1.5);
      o.connect(g);
      o.start(t);
      o.stop(t + 1.8);
    }
    const s = this.noise();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2000;
    const ng = this.env(0.4, 0.005, 0.5);
    s.connect(hp).connect(ng).connect(this.sfx);
    s.start(t, 0, 0.6);
  }

  /** Jumpscare scream: detuned saws through distortion. */
  private synthScream(level: number) {
    const t = this.now;
    const shaper = this.ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 6);
    }
    shaper.curve = curve;
    const g = this.env(0.9 * level, 0.01, 1.4);
    shaper.connect(g).connect(this.sfx);
    for (const f of [420, 610, 890, 1290]) {
      const o = this.osc('sawtooth', f);
      const vib = this.osc('sine', 23 + Math.random() * 10);
      const va = this.ctx.createGain();
      va.gain.value = f * 0.08;
      vib.connect(va).connect(o.frequency);
      o.frequency.linearRampToValueAtTime(f * 0.6, t + 1.3);
      o.connect(shaper);
      o.start(t);
      vib.start(t);
      o.stop(t + 1.5);
      vib.stop(t + 1.5);
    }
    const s = this.noise();
    s.connect(shaper);
    s.start(t, 0, 1.4);
  }

  private synthPickup() {
    const t = this.now;
    for (const [f, d] of [[660, 0], [990, 0.07]] as const) {
      const o = this.osc('sine', f);
      const g = this.env(0.18, 0.005, 0.6, t + d);
      o.connect(g).connect(this.sfx);
      o.start(t + d);
      o.stop(t + d + 0.7);
    }
  }

  private synthPaper() {
    const s = this.noise();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const g = this.env(0.2, 0.02, 0.3);
    s.connect(hp).connect(g).connect(this.sfx);
    s.start(this.now, 0, 0.4);
  }

  private synthClick() {
    const t = this.now;
    const o = this.osc('square', 2200);
    const g = this.env(0.06 * FLASHLIGHT_CLICK_GAIN, 0.001, 0.03);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.05);
  }

  denied() {
    const t = this.now;
    const o = this.osc('square', 110);
    const g = this.env(0.12, 0.005, 0.25);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.3);
  }

  /** Generator starts: clunk, spin-up, then a positional hum loop. */
  private synthGeneratorStart(p: V3) {
    const t = this.now;
    const pn = this.panner(p, 3, 1);
    const clunk = this.osc('square', 60);
    const cg = this.env(0.8, 0.003, 0.4);
    clunk.connect(cg).connect(pn);
    clunk.start(t);
    clunk.stop(t + 0.5);
    const hum = this.osc('sawtooth', 20);
    hum.frequency.exponentialRampToValueAtTime(60, t + 2.5);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 2.5);
    hum.connect(lp).connect(gain).connect(pn).connect(this.sfx);
    hum.start(t);
    this.hum = { panner: pn, gain };
  }

  private synthDoorOpen() {
    const t = this.now;
    const s = this.noise();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    const g = this.env(0.7, 0.2, 1.5);
    s.connect(lp).connect(g).connect(this.sfx);
    s.start(t, 0, 1.8);
  }

  /** Update 0.9.3 — Easy: the night vision goggles switching on (click if the sound is missing). */
  nightVisionOn() {
    if (!this.playSample('night_vision_on', { gain: NIGHT_VISION_SFX_GAIN })) this.click();
  }

  /** Update 0.9.6 — a thrown brick thuds down; a bottle smashes. */
  brickImpact(p: V3) {
    if (!this.playSample('brick_impact', { at: p, ref: 3, rolloff: 1, gain: 0.9 })) this.panelClunk(p);
  }
  bottleBreak(p: V3) {
    if (!this.playSample('bottle_break', { at: p, ref: 3, rolloff: 1, gain: 0.9 })) this.shortBang(p);
  }

  /** Update 0.9.5 — getting into / out of a locker, and easing its door open to peek. */
  lockerEnter(p: V3) {
    if (!this.playSample('locker_enter', { at: p, ref: 2, rolloff: 1.2, gain: 0.8 })) this.panelClunk(p);
  }
  lockerPeek(p: V3) {
    this.playSample('locker_peek', { at: p, ref: 2, rolloff: 1.2, gain: 0.7 });
  }

  /** Update 0.9 — a fuse pushed into an electrical panel. */
  fuseInsert(p: V3) {
    if (!this.playSample('fuse_insert', { at: p, ref: 2, rolloff: 1.2, gain: 1 * PANEL_SFX_GAIN })) this.panelClunk(p);
  }

  private repair: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  /** Update 0.9 — the loop of working on a panel while you hold repair (fades in / out). */
  setRepairLoop(on: boolean, p?: V3) {
    if (on && !this.repair && p && this.has('repair_loop')) {
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, this.now);
      gain.gain.linearRampToValueAtTime(0.9 * PANEL_SFX_GAIN, this.now + 0.15);
      gain.connect(this.panner(p, 2, 1.2)).connect(this.sfx);
      const src = this.playSample('repair_loop', { loop: true, to: gain });
      if (src) this.repair = { src, gain };
    } else if (!on && this.repair) {
      const r = this.repair;
      this.repair = null;
      r.gain.gain.setTargetAtTime(0, this.now, 0.06);
      r.src.stop(this.now + 0.4);
    }
  }

  /** Update 0.9 — skill check: the warning tick, then a good / great hit. (Not positional: it's for you.) */
  skillWarning() {
    if (!this.playSample('skill_check_warning', { gain: 0.9 * PANEL_SFX_GAIN })) this.click();
  }
  skillGood() {
    if (!this.playSample('skill_check_good', { gain: 0.9 * PANEL_SFX_GAIN })) this.click();
  }
  skillGreat() {
    if (!this.playSample('skill_check_great', { gain: 1 * PANEL_SFX_GAIN })) this.click();
  }

  /** Update 0.9 — missed skill check: the panel blows (recorded bang, synth if missing). */
  panelExplode(p: V3) {
    if (!this.playSample('panel_explode', { at: p, ref: 4, rolloff: 0.9, gain: 1.2 * PANEL_SFX_GAIN })) this.shortBang(p);
  }

  /** Update 0.9 — throwing a panel's breaker switch. */
  breakerSwitch(p: V3) {
    if (!this.playSample('breaker_switch', { at: p, ref: 3, rolloff: 1, gain: 1 * PANEL_SFX_GAIN })) this.switchThrow(p);
  }

  /** Update 0.8 — breaker panel sparking: a burst of electric crackle (your cue to let go). */
  sparkCrackle(p: V3) {
    const t = this.now;
    const pn = this.panner(p, 2, 1.2);
    pn.connect(this.sfx);
    for (let i = 0; i < 9; i++) {
      const at = t + i * 0.075 + Math.random() * 0.03;
      const s = this.noise();
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2500 + Math.random() * 4000;
      bp.Q.value = 1.2;
      const g = this.env(0.35 + Math.random() * 0.25, 0.001, 0.04 + Math.random() * 0.05, at);
      s.connect(bp).connect(g).connect(pn);
      s.start(at, Math.random(), 0.12);
    }
  }

  /** Update 0.8 — the panel shorts out: a loud bang with a low thump and a fizzle. */
  shortBang(p: V3) {
    const t = this.now;
    const pn = this.panner(p, 4, 0.9);
    pn.connect(this.sfx);
    const s = this.noise();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(9000, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.6);
    const g = this.env(1.4, 0.002, 0.7, t);
    s.connect(lp).connect(g).connect(pn);
    s.start(t, 0, 0.9);
    const o = this.osc('sine', 90);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.4);
    const og = this.env(1.1, 0.002, 0.45, t);
    o.connect(og).connect(pn);
    o.start(t);
    o.stop(t + 0.5);
    this.sparkCrackle(p);
  }

  /** Update 0.8 — breaker panel repaired: a heavy relay clunk. */
  panelClunk(p: V3) {
    const t = this.now;
    const pn = this.panner(p, 2, 1.2);
    pn.connect(this.sfx);
    const o = this.osc('square', 70);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = this.env(0.35, 0.002, 0.18, t);
    o.connect(g).connect(pn);
    o.start(t);
    o.stop(t + 0.25);
    const s = this.noise();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const ng = this.env(0.4, 0.001, 0.06, t);
    s.connect(hp).connect(ng).connect(pn);
    s.start(t, 0, 0.1);
  }

  /** Update 0.8 — throwing the big power switch: metal lever thunk. */
  switchThrow(p: V3) {
    this.panelClunk(p);
    const t = this.now + 0.05;
    const pn = this.panner(p, 2, 1.2);
    pn.connect(this.sfx);
    const o = this.osc('triangle', 180);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.2);
    const g = this.env(0.4, 0.002, 0.3, t);
    o.connect(g).connect(pn);
    o.start(t);
    o.stop(t + 0.35);
  }

  /** Update 0.7 — leaving a level: its generator hum stops. */
  stopGenerator() {
    if (!this.hum) return;
    this.hum.gain.gain.setTargetAtTime(0, this.now, 0.2);
    this.hum = null;
  }

  fadeOut(seconds: number) {
    this.master.gain.setTargetAtTime(0, this.now, seconds / 3);
  }

  dispose() {
    for (const l of this.loops) {
      try {
        l.stop();
      } catch {
        /* already stopped */
      }
    }
    this.hum = null;
    this.breath = null;
    void this.ctx.close();
  }
}
