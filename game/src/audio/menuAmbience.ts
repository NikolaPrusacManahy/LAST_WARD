// Update 0.5.2 — the ward's ambience under the credit screen and main menu. Its own AudioContext
// (like uiSounds): the game's AudioEngine only exists during a run. Browsers only let sound start
// after the first click or key press, so before that it waits silently and fades in on the first one.
import { MENU_AMBIENCE } from '../state/menuAudio';

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let src: AudioBufferSourceNode | null = null;
let buffer: Promise<AudioBuffer | null> | null = null;
let wanted = false;
let volume = 0.8;

function ensure(): AudioContext {
  if (ctx) return ctx;
  ctx = new AudioContext();
  out = ctx.createGain();
  out.gain.value = 0;
  out.connect(ctx.destination);
  ctx.addEventListener('statechange', () => void sync());
  // First gesture anywhere unlocks it (the credit-screen click counts).
  const unlock = () => {
    void ctx?.resume();
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  return ctx;
}

function load(c: AudioContext): Promise<AudioBuffer | null> {
  buffer ??= (async () => {
    try {
      const manifest = (await (await fetch('/audio/manifest.json')).json()) as Record<string, string[]>;
      const file = manifest.ambience?.[0];
      if (!file) return null;
      return await c.decodeAudioData(await (await fetch(`/audio/${file}`)).arrayBuffer());
    } catch {
      return null; // no recording: the menu stays quiet
    }
  })();
  return buffer;
}

async function sync() {
  const c = ensure();
  if (!out) return;
  const now = c.currentTime;
  out.gain.cancelScheduledValues(now);
  out.gain.setValueAtTime(out.gain.value, now);
  if (!wanted) {
    out.gain.linearRampToValueAtTime(0, now + MENU_AMBIENCE.fadeOut);
    const old = src;
    src = null;
    if (old) setTimeout(() => old.stop(), MENU_AMBIENCE.fadeOut * 1000 + 50);
    return;
  }
  if (c.state !== 'running') return; // waits for the first click / key press
  if (!src) {
    const b = await load(c);
    if (!b || !wanted || src) return;
    src = c.createBufferSource();
    src.buffer = b;
    src.loop = true;
    src.connect(out);
    src.start();
  }
  // Slow fade in from silence; quick follow when only the volume slider moved.
  const fade = out.gain.value > 0.01 ? 0.25 : MENU_AMBIENCE.fadeIn;
  out.gain.linearRampToValueAtTime(MENU_AMBIENCE.gain * volume, c.currentTime + fade);
}

/** On while the credit screen / main menu is up, off (fading) when a run starts. */
export function setMenuAmbience(on: boolean, vol: number) {
  wanted = on;
  volume = vol;
  const c = ensure();
  if (on) void c.resume(); // allowed straight away if the browser already trusts the page
  void sync();
}
