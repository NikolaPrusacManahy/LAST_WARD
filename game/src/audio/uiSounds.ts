// Update 0.4.1 — menu sounds: a light typewriter tick on hover, a heavier key strike on click.
// Synthesised, so no files are needed. Drop ui_hover.mp3 / ui_click.mp3 into ASSETS/audio and
// run tools/prepare-audio.py to use recordings instead.
// Browsers only allow sound after the first click or key press, so hovers before that are silent.

/** Hovers closer together than this are skipped (sweeping the mouse over a list). */
export const HOVER_GAP_MS = 70;

export function hoverAllowed(lastMs: number, nowMs: number): boolean {
  return nowMs - lastMs >= HOVER_GAP_MS;
}

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let noise: AudioBuffer | null = null;
let volume = 0.8;
let lastHover = -Infinity;
const samples = new Map<string, AudioBuffer>();

function ensure(): AudioContext {
  if (ctx) return ctx;
  ctx = new AudioContext();
  out = ctx.createGain();
  out.gain.value = volume;
  out.connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  void loadSamples(ctx);
  return ctx;
}

async function loadSamples(c: AudioContext) {
  try {
    const manifest = (await (await fetch('/audio/manifest.json')).json()) as Record<string, string[]>;
    for (const name of ['ui_hover', 'ui_click']) {
      const file = manifest[name]?.[0];
      if (file) samples.set(name, await c.decodeAudioData(await (await fetch(`/audio/${file}`)).arrayBuffer()));
    }
  } catch {
    /* synth versions are used */
  }
}

/** Call on the first click / key press so later hovers can play. */
export function unlockUi() {
  void ensure().resume();
}

export function setUiVolume(v: number) {
  volume = v;
  if (ctx && out) out.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}

function ready() {
  const c = ensure();
  return c.state === 'running' ? c : null;
}

function playSample(c: AudioContext, name: string, gain: number) {
  const buf = samples.get(name);
  if (!buf) return false;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = 0.96 + Math.random() * 0.08;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g).connect(out!);
  src.start();
  return true;
}

function tick(c: AudioContext, at: number, freq: number, q: number, peak: number, decay: number) {
  const src = c.createBufferSource();
  src.buffer = noise;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq * (0.92 + Math.random() * 0.16);
  bp.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(peak, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  src.connect(bp).connect(g).connect(out!);
  src.start(at, Math.random() * 0.3, decay + 0.02);
}

function thump(c: AudioContext, at: number, from: number, to: number, peak: number, decay: number) {
  const o = c.createOscillator();
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(to, at + decay);
  const g = c.createGain();
  g.gain.setValueAtTime(peak, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  o.connect(g).connect(out!);
  o.start(at);
  o.stop(at + decay + 0.02);
}

export function uiHover() {
  const now = performance.now();
  if (!hoverAllowed(lastHover, now)) return;
  lastHover = now;
  const c = ready();
  if (!c || playSample(c, 'ui_hover', 0.6)) return;
  const t = c.currentTime;
  tick(c, t, 4200, 2.5, 0.16, 0.035);
  thump(c, t, 900, 700, 0.025, 0.04);
}

export function uiClick() {
  const c = ready();
  if (!c || playSample(c, 'ui_click', 0.8)) return;
  const t = c.currentTime;
  // Key strike, the slug hitting the platen, and the key coming back up.
  tick(c, t, 2600, 1.2, 0.32, 0.06);
  thump(c, t, 160, 55, 0.4, 0.13);
  tick(c, t + 0.07, 3400, 2, 0.08, 0.04);
}

/** Update 0.4.3 — electrical buzz when the menu light stutters (silent until audio is unlocked). */
export function flickerBuzz() {
  const c = ctx;
  if (!c || c.state !== 'running' || !out) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = 100 + Math.random() * 20;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900;
  bp.Q.value = 0.9;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  // Chopped on/off like a dying ballast.
  for (let i = 0; i < 8; i++) g.gain.setValueAtTime(Math.random() < 0.6 ? 0.05 : 0, t + i * 0.06);
  g.gain.setValueAtTime(0, t + 0.5);
  o.connect(bp).connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.55);
}
