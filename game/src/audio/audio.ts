// Sound engine. Recorded samples from public/audio (see manifest.json) with a synthesised
// fallback per sound. Enemy and generator sounds are 3D (PannerNode, HRTF); enemy sounds are
// also filtered by distance and walls (audio/spatial.ts).
import { ENEMY_STEP_GAIN, EnemyMix } from './spatial';

type V3 = { x: number; y: number; z: number };

const SAMPLE_BASE = '/audio';

export class AudioEngine {
  ctx: AudioContext;
  private master: GainNode;
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

  constructor(volume: number) {
    this.ctx = new AudioContext();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master = this.ctx.createGain();
    this.master.gain.value = volume;
    this.master.connect(comp).connect(this.ctx.destination);

    this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this.ambience = this.ctx.createGain();
    this.ambience.gain.value = 0;
    this.ambience.connect(this.master);
    this.tension = this.ctx.createGain();
    this.tension.gain.value = 0;
    this.tension.connect(this.master);
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
  private playSample(name: string, o: { gain?: number; rate?: number; at?: V3; ref?: number; rolloff?: number; loop?: boolean; to?: AudioNode; when?: number; cutoff?: number } = {}): AudioBufferSourceNode | null {
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
    if (o.at) g.connect(this.panner(o.at, o.ref ?? 2, o.rolloff ?? 1.3)).connect(o.to ?? this.master);
    else g.connect(o.to ?? this.master);
    src.start(o.when ?? this.now, o.loop ? src.loopStart : 0);
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
      lp.connect(gain).connect(pn).connect(this.master);
      this.playSample('enemy_breath', { loop: true, to: lp });
      this.breath = { panner: pn, gain, filter: lp };
    });
  }

  footstep(kind: 'walk' | 'sprint' | 'crouch') {
    const gain = kind === 'sprint' ? 1 : kind === 'walk' ? 0.65 : 0.22;
    const rate = (kind === 'sprint' ? 1.08 : 1) * this.jitter(0.06);
    if (!this.playSample('step_player', { gain, rate })) this.synthFootstep(kind);
  }

  /** 3D footstep at its position, darker with distance and muffled behind walls. */
  enemyStep(p: V3, heavy: boolean, mix: EnemyMix = { cutoff: 16000, gain: 1 }) {
    const gain = (heavy ? 1 : 0.7) * ENEMY_STEP_GAIN * mix.gain;
    if (!this.playSample('step_patient', { at: p, ref: 2.5, rolloff: 1.3, gain, cutoff: mix.cutoff, rate: 0.9 * this.jitter(0.06) })) this.synthEnemyStep(p, heavy);
  }

  /** Update 0.4 — its scream from where it stands (on spotting you). */
  enemyScream(p: V3) {
    if (!this.playSample('enemy_scream', { at: p, ref: 4, rolloff: 0.9, gain: 1 })) this.stinger();
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
    if (!this.playSample('flashlight_click', { gain: 0.9 })) this.synthClick();
  }

  generatorStart(p: V3) {
    const start = this.playSample('generator_start', { at: p, ref: 3, rolloff: 1, gain: 1 });
    if (!start || !this.has('generator_hum')) return this.synthGeneratorStart(p);
    // Hum fades in under the tail of the start-up.
    const pn = this.panner(p, 3, 1);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, this.now);
    gain.gain.linearRampToValueAtTime(0.8, this.now + 3.5);
    gain.connect(pn).connect(this.master);
    this.playSample('generator_hum', { loop: true, to: gain, when: this.now + 1.5 });
    this.hum = { panner: pn, gain };
  }

  doorOpen() {
    if (!this.playSample('door_open', { gain: 1 })) this.synthDoorOpen();
  }

  resume() {
    return this.ctx.resume();
  }

  setVolume(v: number) {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
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
    gain.connect(pn).connect(this.master);
    n.start();
    lfo.start();
    growl.start();
    this.breath = { panner: pn, gain };
  }

  updateEnemy(p: V3, chasing: boolean, mix: EnemyMix = { cutoff: 16000, gain: 1 }) {
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
    const g = this.env(kind === 'sprint' ? 0.45 : kind === 'walk' ? 0.28 : 0.08, 0.004, 0.12);
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    s.connect(lp).connect(g).connect(this.master);
    s.start(t, Math.random(), 0.2);
  }

  private synthEnemyStep(p: V3, heavy: boolean) {
    const t = this.now;
    const pn = this.panner(p, 2.5, 1.3);
    const o = this.osc('sine', 85);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    const g = this.env(heavy ? 1.1 : 0.7, 0.005, 0.22);
    o.connect(g).connect(pn).connect(this.master);
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
    s.connect(bp).connect(g).connect(pn).connect(this.master);
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
      o.connect(g).connect(this.master);
      o.start(t + off);
      o.stop(t + off + 0.25);
    }
  }

  /** Stinger when it spots you. */
  stinger() {
    const t = this.now;
    const g = this.env(0.5, 0.01, 1.6);
    g.connect(this.master);
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
    s.connect(hp).connect(ng).connect(this.master);
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
    shaper.connect(g).connect(this.master);
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
      o.connect(g).connect(this.master);
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
    s.connect(hp).connect(g).connect(this.master);
    s.start(this.now, 0, 0.4);
  }

  private synthClick() {
    const t = this.now;
    const o = this.osc('square', 2200);
    const g = this.env(0.06, 0.001, 0.03);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.05);
  }

  denied() {
    const t = this.now;
    const o = this.osc('square', 110);
    const g = this.env(0.12, 0.005, 0.25);
    o.connect(g).connect(this.master);
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
    hum.connect(lp).connect(gain).connect(pn).connect(this.master);
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
    s.connect(lp).connect(g).connect(this.master);
    s.start(t, 0, 1.8);
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
