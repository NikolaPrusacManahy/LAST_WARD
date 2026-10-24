// Update 0.9.9 — caught when you're already hurt (your last life): no grab. It hits you, and you're sent
// flying (the player's `hitFly` clip, launched the moment its blow lands), slam into the floor and lie
// there: dead (solo, co-op Hard), or down (co-op Normal). Pure timeline + numbers (tested);
// engine/hitScene.ts films it.
// Its blow, measured in its `attack` clip (facing +z, 30 fps): both hands over its head 0.8–1.2 s, the
// fastest swing at 1.30 s, the furthest reach (0.83 m in front, chest height) at 1.47 s.

export const HIT = {
  /** Its attack clip starts here (just before it rears up) and plays at this speed. */
  clipFrom: 0.55,
  clipSpeed: 1,
  /** The clip time its hands land on you. */
  contactClip: 1.42,
  /** How far in front of it you stand when the blow lands (its reach in the clip). */
  reach: 0.85,
  /** You fly at most this far back (a wall or furniture stops you sooner). */
  flyMax: 4,
  /** In your `hitFly` clip: you're on the floor this far in. */
  landClip: 0.83,
  /** Lying there after the slam: before it's black (dead), before you're down (and can crawl). */
  lieDead: 2.2,
  lieDown: 1.4,
  /** The host keeps it there this long after the slam before it vanishes (co-op). */
  holdAfterLand: 1.5,
};

const hitAt = (HIT.contactClip - HIT.clipFrom) / HIT.clipSpeed;
const landAt = hitAt + HIT.landClip;

export const hitTimes = {
  /** The blow lands; you leave the floor. */
  hitAt,
  /** You hit the floor. */
  landAt,
  endDead: landAt + HIT.lieDead,
  endDown: landAt + HIT.lieDown,
  /** Co-op: the host's Patient stands over you until then, then it's gone. */
  holdFor: landAt + HIT.holdAfterLand,
};

export type HitCue = 'hit' | 'land' | 'done';

export function hitCues(prev: number, now: number, down: boolean): HitCue[] {
  const out: HitCue[] = [];
  const at: [HitCue, number][] = [['hit', hitTimes.hitAt], ['land', hitTimes.landAt], ['done', down ? hitTimes.endDown : hitTimes.endDead]];
  for (const [cue, t] of at) if (prev < t && now >= t) out.push(cue);
  return out;
}

/** How far along your flight you are (0 at the blow, 1 on the floor): fast off the ground, slowing as you come down. */
export function flyProgress(t: number): number {
  const u = Math.max(0, Math.min(1, (t - hitTimes.hitAt) / HIT.landClip));
  return 1 - (1 - u) * (1 - u);
}

/** Your eyes: open until you're on the floor, then they close (dead: all the way; down: then you come to). */
export function hitLids(t: number, down: boolean): number {
  const k = (t - hitTimes.landAt - 0.3) / (down ? 0.8 : 1.2);
  if (k <= 0) return 0;
  return Math.min(down ? 0.85 : 1, k);
}

/** Black over everything at the end (dead only). */
export function hitBlack(t: number, down: boolean): number {
  if (down) return 0;
  return Math.max(0, Math.min(1, (t - (hitTimes.endDead - 0.9)) / 0.9));
}
