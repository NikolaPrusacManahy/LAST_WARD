"""Update 0.4 — turns the raw sounds in ASSETS/audio into game-ready files in public/audio.

- Footstep recordings are cut into single steps (onset detection), so each step can be
  played on its own with a little random pitch.
- The 4-minute heartbeat is cut to one lub-dub; the game plays it at the speed fear sets.
- Loops (ambience, breathing, generator hum) get a crossfade at the seam so they loop cleanly.
- Every file is loudness-matched (EBU R128) so the mix is balanced before in-game gains.
- Everything except the ambience is mono: positional sounds are panned in 3D by the game.

Needs Python 3 + numpy + scipy and ffmpeg on PATH.
Usage (from game/):  python tools/prepare-audio.py ../ASSETS/audio public/audio
"""
import json
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
from scipy.io import wavfile

SR = 44100

# name in ASSETS → (kind, target LUFS)
PLAN = {
    'footSteps_player': ('steps', -26),
    'footSteps_patient': ('steps', -16),
    'heartbeat': ('beat', -16),
    'ambience': ('loop-stereo', -27),
    'enemy_breath': ('loop', -20),
    'generator_hum': ('loop', -20),
    'generator_start': ('oneshot', -14),
    'door_open': ('oneshot', -16),
    'enemy_scream': ('oneshot', -12),
    'pickup': ('oneshot', -20),
    'paper': ('oneshot', -22),
    'flashlight_click': ('oneshot', -20),
    # Optional menu sounds (synthesised in audio/uiSounds.ts when missing).
    'ui_hover': ('oneshot', -26),
    'ui_click': ('oneshot', -20),
    # Update 0.6 — caught / thrown sequence + injured grunts.
    'player_caught/caught_SFX': ('oneshot', -14),
    'player_caught/thrown_sfx': ('oneshot', -14),
    'player_caught/floor_impact_sfx': ('oneshot', -12),
    'player_grunt': ('oneshot', -20),
    # Update 0.9 — electrical panels: fuse in, repair (loop), skill checks, short-out bang, switch.
    'electric_panel_logic/fuse_insert': ('oneshot', -18),
    'electric_panel_logic/repair_loop': ('loop', -24),
    'electric_panel_logic/skill_check_warning': ('oneshot', -15),
    'electric_panel_logic/skill_check_good': ('oneshot', -18),
    'electric_panel_logic/skill_check_great': ('oneshot', -16),
    'electric_panel_logic/panel_explode': ('oneshot', -10),
    'electric_panel_logic/breaker_switch': ('oneshot', -15),
    'night_vision/deploy': ('oneshot', -16),  # Update 0.9.3 — Easy: goggles on
    'locker/enter_locker': ('oneshot', -16),  # Update 0.9.5 — getting in / out of a locker
    'locker/peeking': ('oneshot', -20),  # Update 0.9.5 — easing the locker door open
    'throwable/brick_impact_ground': ('oneshot', -14),  # Update 0.9.6
    'throwable/glass_bottle_break': ('oneshot', -14),  # Update 0.9.6
    # Update 0.9.6.1 — your breathing while you sprint (loop), and the wake-up at the start (replaces the grunt).
    # Both kept at the loudness they were recorded at (the game plays the breathing at half of that).
    'player_running_breathing': ('loop', -30),
    'player_intro_wakingUp': ('oneshot', -28),
    # Update 0.9.9 — co-op, down: heavy breathing (loop). The recording is very quiet (-44.5): brought up
    # to the running breath's level; the game plays it at half that, like the running breath.
    'player_downed/dying_breathing_heavy': ('loop', -30),
}
OUT_NAMES = {
    'footSteps_player': 'step_player',
    'footSteps_patient': 'step_patient',
    'player_caught/caught_SFX': 'caught',
    'player_caught/thrown_sfx': 'thrown',
    'player_caught/floor_impact_sfx': 'floor_impact',
    'player_grunt': 'grunt',
    'electric_panel_logic/fuse_insert': 'fuse_insert',
    'electric_panel_logic/repair_loop': 'repair_loop',
    'electric_panel_logic/skill_check_warning': 'skill_check_warning',
    'electric_panel_logic/skill_check_good': 'skill_check_good',
    'electric_panel_logic/skill_check_great': 'skill_check_great',
    'electric_panel_logic/panel_explode': 'panel_explode',
    'electric_panel_logic/breaker_switch': 'breaker_switch',
    'night_vision/deploy': 'night_vision_on',
    'locker/enter_locker': 'locker_enter',
    'locker/peeking': 'locker_peek',
    'throwable/brick_impact_ground': 'brick_impact',
    'throwable/glass_bottle_break': 'bottle_break',
    'player_running_breathing': 'run_breath',
    'player_intro_wakingUp': 'wake_up',
    'player_downed/dying_breathing_heavy': 'down_breath',
}


def decode(path, channels):
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        tmp = f.name
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-ac', str(channels), '-ar', str(SR), tmp], check=True)
    _, x = wavfile.read(tmp)
    os.unlink(tmp)
    x = x.astype(np.float32) / 32768
    return x if x.ndim == 2 else x[:, None]


def lufs(x):
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        tmp = f.name
    wavfile.write(tmp, SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', tmp, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True)
    os.unlink(tmp)
    m = re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)
    return float(m[-1]) if m else -70.0


def limit(x, ceiling=0.89):
    """Soft limiter: tanh above ~-1 dBFS."""
    over = np.abs(x) > ceiling * 0.8
    y = x.copy()
    y[over] = np.sign(x[over]) * (ceiling * 0.8 + (ceiling * 0.2) * np.tanh((np.abs(x[over]) - ceiling * 0.8) / (ceiling * 0.2)))
    return y


def fade(x, fin, fout):
    n_in, n_out = int(fin * SR), int(fout * SR)
    if n_in:
        x[:n_in] *= np.linspace(0, 1, n_in)[:, None]
    if n_out:
        x[-n_out:] *= np.linspace(1, 0, n_out)[:, None]
    return x


def envelope_db(mono, win=0.03):
    hop = int(SR * 0.005)
    w = int(SR * win)
    sq = mono ** 2
    c = np.concatenate([[0], np.cumsum(sq)])
    idx = np.arange(0, len(mono) - w, hop)
    rms = np.sqrt((c[idx + w] - c[idx]) / w)
    return 20 * np.log10(rms + 1e-9), hop


def onsets(mono, min_gap):
    db, hop = envelope_db(mono)
    floor, peak = np.percentile(db, 20), np.percentile(db, 99.5)
    thr = floor + (peak - floor) * 0.45
    out, last = [], -1e9
    for i in range(1, len(db)):
        t = i * hop / SR
        if db[i] > thr >= db[i - 1] and t - last > min_gap:
            out.append(t)
            last = t
    return out


def trim_lead(x, db=-36):
    """Drops leading silence (keeps 8 ms) so a step sounds on the frame it's triggered."""
    lvl = np.max(np.abs(x), axis=1)
    hits = np.nonzero(lvl > np.max(lvl) * 10 ** (db / 20))[0]
    start = max(0, hits[0] - int(0.008 * SR)) if len(hits) else 0
    return x[start:]


def write(x, path, stereo=False):
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        tmp = f.name
    wavfile.write(tmp, SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))
    br = '128k' if stereo else '96k'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-ac', '2' if stereo else '1', '-c:a', 'libmp3lame', '-b:a', br, path], check=True)
    os.unlink(tmp)


def loudness_match(x, target):
    return limit(x * 10 ** ((target - lufs(x)) / 20))


def crossfade_loop(x, seconds):
    n = int(seconds * SR)
    body, tail = x[:-n].copy(), x[-n:]
    ramp = np.linspace(0, 1, n)[:, None]
    body[:n] = body[:n] * ramp + tail * (1 - ramp)
    return body


def main(src, dst):
    os.makedirs(dst, exist_ok=True)
    manifest = {}
    for name, (kind, target) in PLAN.items():
        path = os.path.join(src, name + '.mp3')
        if not os.path.exists(path):
            print(f'skip {name} (missing)')
            continue
        out = OUT_NAMES.get(name, name)
        if kind == 'steps':
            x = decode(path, 1)
            gain = 10 ** ((target - lufs(x)) / 20)
            ts = onsets(x[:, 0], 0.3)
            # Skip the first/last step (often cut), keep up to 6 spread through the take.
            ts = ts[1:-1] if len(ts) > 4 else ts
            pick = [ts[int(i)] for i in np.linspace(0, len(ts) - 1, min(6, len(ts)))]
            files = []
            for k, t in enumerate(pick, 1):
                a, b = int(max(0, t - 0.015) * SR), int((t + 0.42) * SR)
                seg = trim_lead(x[a:b].copy()) * gain
                seg = fade(seg, 0.004, 0.12)
                f = f'{out}_{k}.mp3'
                write(limit(seg), os.path.join(dst, f))
                files.append(f)
            manifest[out] = files
            print(f'{name}: {len(ts)} steps found → {len(files)} kept')
        elif kind == 'beat':
            x = decode(path, 1)
            ts = onsets(x[:, 0], 0.2)
            # Lub-dub pairs: take one cycle from the middle of the recording.
            mid = len(ts) // 2
            t0 = ts[mid] - 0.03
            # The next lub starts after the longer gap of the next two.
            nxt = ts[mid + 2] if ts[mid + 2] - ts[mid + 1] > ts[mid + 1] - ts[mid] else ts[mid + 1]
            seg = fade(x[int(t0 * SR):int((nxt - 0.02) * SR)].copy(), 0.003, 0.05)
            seg = loudness_match(seg * 0.5, target)
            write(seg, os.path.join(dst, 'heartbeat.mp3'))
            manifest['heartbeat'] = ['heartbeat.mp3']
            print(f'heartbeat: one beat {len(seg) / SR:.2f} s')
        elif kind.startswith('loop'):
            stereo = kind == 'loop-stereo'
            x = decode(path, 2 if stereo else 1)
            xf = min(3.0, len(x) / SR * 0.15)
            seg = loudness_match(crossfade_loop(x, xf), target)
            write(seg, os.path.join(dst, out + '.mp3'), stereo)
            manifest[out] = [out + '.mp3']
            print(f'{name}: loop {len(seg) / SR:.1f} s (crossfade {xf:.1f} s)')
        else:
            x = decode(path, 1)
            seg = loudness_match(fade(x.copy(), 0.002, 0.03), target)
            write(seg, os.path.join(dst, out + '.mp3'))
            manifest[out] = [out + '.mp3']
            print(f'{name}: {len(seg) / SR:.2f} s')
    with open(os.path.join(dst, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
