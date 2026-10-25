// Update 0.9.9 — the mimic. Each game quietly keeps short lines of what it hears from each teammate's voice
// (and from your own microphone): whenever someone talks for 0.7–4 s, that stretch is kept, the last few per
// person. Only in memory, only for this run. When The Patient mimics someone (the host picks when and who),
// every game plays one of that person's lines from where it is, wrong: lower, slower, doubled, roughened,
// echoing (audio.ts `mimic`). Your own voice, calling from the dark.
import { MIMIC } from '../state/coopRun';

export class VoiceClips {
  private clips = new Map<string, AudioBuffer[]>();
  private offs: (() => void)[] = [];

  constructor(private ctx: AudioContext) {}

  /** Keep `id`'s lines from `stream` (a teammate's voice, or your microphone). Returns: stop listening. */
  record(id: string, stream: MediaStream): () => void {
    const ctx = this.ctx;
    const src = ctx.createMediaStreamSource(stream);
    // (ScriptProcessor is old, but it needs no extra file and the work is tiny: copying samples.)
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const sink = ctx.createGain();
    sink.gain.value = 0; // it only runs while connected to the speakers: silently
    src.connect(proc);
    proc.connect(sink).connect(ctx.destination);
    let chunks: Float32Array[] = [];
    let speech = 0;
    let quiet = 0;
    const finish = () => {
      if (speech >= MIMIC.minLine) {
        const length = chunks.reduce((n, c) => n + c.length, 0);
        const buf = ctx.createBuffer(1, length, ctx.sampleRate);
        const out = buf.getChannelData(0);
        let at = 0;
        for (const c of chunks) {
          out.set(c, at);
          at += c.length;
        }
        const list = this.clips.get(id) ?? [];
        list.push(buf);
        if (list.length > MIMIC.keep) list.shift();
        this.clips.set(id, list);
      }
      chunks = [];
      speech = 0;
      quiet = 0;
    };
    proc.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const loud = Math.sqrt(sum / data.length) > MIMIC.talkRms;
      const secs = data.length / ctx.sampleRate;
      if (loud) {
        chunks.push(data.slice());
        speech += secs;
        quiet = 0;
      } else if (chunks.length) {
        chunks.push(data.slice());
        quiet += secs;
        if (quiet >= MIMIC.endQuiet) finish();
      }
      if (speech + quiet >= MIMIC.maxLine) finish();
    };
    const off = () => {
      proc.onaudioprocess = null;
      src.disconnect();
      proc.disconnect();
      sink.disconnect();
    };
    this.offs.push(off);
    return off;
  }

  /** Has `id` said anything we kept? */
  has(id: string): boolean {
    return (this.clips.get(id)?.length ?? 0) > 0;
  }

  /** One of `id`'s lines, at random. */
  pick(id: string): AudioBuffer | null {
    const list = this.clips.get(id);
    return list?.length ? list[Math.floor(Math.random() * list.length)] : null;
  }

  dispose() {
    this.offs.forEach((off) => off());
    this.offs = [];
    this.clips.clear();
  }
}
