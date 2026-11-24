#!/usr/bin/env python3
"""Second Seat - all audio synthesized locally with numpy. No AI audio,
no downloads. 44.1kHz 16-bit mono WAVs. Music loops are exactly periodic:
notes are scheduled on a grid and decay to silence well before the loop
boundary, so the loop point is clean.
"""
import os
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "audio", "wav")
os.makedirs(OUT, exist_ok=True)

SR = 44100
rng = np.random.default_rng(20261124)


def write(name, data, peak_db=-3.0):
    data = np.asarray(data, dtype=np.float64)
    peak = np.max(np.abs(data)) + 1e-12
    target = 10 ** (peak_db / 20.0)
    data = np.clip(data * (target / peak), -1.0, 1.0)
    path = os.path.join(OUT, name)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((data * 32767).astype(np.int16).tobytes())
    print("wrote", path, f"{len(data)/SR:.2f}s")


def env(n, attack=0.005, decay=None):
    t = np.arange(n) / SR
    a = np.minimum(1.0, t / attack)
    if decay is None:
        decay = n / SR
    d = np.exp(-t / max(decay, 1e-4))
    return a * d


def sine(freq, dur, amp=0.5, decay=0.15):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return amp * np.sin(2 * np.pi * freq * t) * env(n, decay=decay)


def tri(freq, dur, amp=0.4, decay=0.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    ph = (freq * t) % 1.0
    wave_ = 4 * np.abs(ph - 0.5) - 1.0
    return amp * wave_ * env(n, decay=decay)


def noise_burst(dur, amp=0.5, cutoff=3000):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    alpha = cutoff / (cutoff + SR)
    y = np.zeros(n)
    for i in range(1, n):
        y[i] = y[i - 1] + alpha * (x[i] - y[i - 1])
    return amp * y * env(n, decay=dur / 3)


def mix_at(base, clip, at):
    n0 = int(at * SR)
    end = min(len(base), n0 + len(clip))
    if end > n0:
        base[n0:end] += clip[:end - n0]
    return base


def note_seq(notes, note_dur, amp=0.4, wave_fn=sine):
    total = int(len(notes) * note_dur * SR)
    out = np.zeros(total)
    for i, f in enumerate(notes):
        if f:
            out = mix_at(out, wave_fn(f, note_dur * 1.05, amp=amp,
                                      decay=note_dur * 0.9), i * note_dur)
    return out


# ------------------------------------------------------------------- SFX ---
write("sfx_click.wav", mix_at(sine(880, 0.08, 0.5, 0.05),
                             sine(1320, 0.06, 0.25, 0.04), 0.0))
# swap: two-tone slide up then down (seat change whoosh)
n = int(0.28 * SR)
t = np.arange(n) / SR
f = 500 + 900 * t / 0.28
swap = 0.45 * np.sin(2 * np.pi * f * t) * env(n, decay=0.12)
f2 = 1400 - 900 * t / 0.28
swap += 0.3 * np.sin(2 * np.pi * f2 * t) * env(n, decay=0.12)
write("sfx_swap.wav", swap)
# pickup: bright ding-ding
write("sfx_pickup.wav",
      mix_at(sine(1046, 0.12, 0.5, 0.08), sine(1568, 0.18, 0.4, 0.12), 0.09))
# crash: noise thud + low boom
write("sfx_crash.wav",
      noise_burst(0.35, 0.7, 900) + sine(70, 0.35, 0.6, 0.18))
# stall: coughing putter (three choked pulses)
stall = np.zeros(int(0.7 * SR))
for i, at in enumerate((0.0, 0.18, 0.38)):
    stall = mix_at(stall, sine(140 - i * 30, 0.14, 0.55, 0.06), at)
    stall = mix_at(stall, noise_burst(0.1, 0.25, 600), at)
write("sfx_stall.wav", stall)
# win: rising arpeggio
write("sfx_win.wav", note_seq([523, 659, 784, 1046, 1318], 0.14, 0.45))
# lose: descending minor
write("sfx_lose.wav", note_seq([392, 370, 330, 262], 0.22, 0.45, tri))
# mission: warm chime
write("sfx_mission.wav",
      mix_at(sine(784, 0.25, 0.45, 0.18), sine(1174, 0.3, 0.35, 0.2), 0.12))
# engine: 2s looping putter (periodic: pulses repeat exactly 8x)
eng = np.zeros(int(2.0 * SR))
pulse = mix_at(sine(95, 0.09, 0.5, 0.05), noise_burst(0.05, 0.18, 1200), 0.0)
for k in range(8):
    eng = mix_at(eng, pulse, k * 0.25)
write("sfx_engine.wav", eng)
# delivery: happy two-note horn
write("sfx_delivery.wav",
      mix_at(tri(660, 0.15, 0.45, 0.1), tri(880, 0.22, 0.45, 0.14), 0.13))

# ------------------------------------------------------------------ music ---
# Menu: gentle waltz-ish loop, 8s, C major pentatonic.
menu_notes = [523, 0, 659, 0, 784, 0, 659, 0,
              587, 0, 659, 0, 784, 0, 880, 0]
menu = note_seq(menu_notes, 0.5, 0.32)
# soft bass under it
bass = note_seq([131, 0, 165, 0, 196, 0, 165, 0,
                 147, 0, 165, 0, 196, 0, 220, 0], 0.5, 0.22, tri)
write("bgm_menu.wav", menu + bass)
# Game: driving 8s loop, A minor groove, 8th notes at 0.25s.
game_notes = [440, 0, 523, 440, 0, 659, 0, 523,
              440, 0, 523, 440, 0, 587, 659, 0]
game = note_seq(game_notes, 0.25, 0.34)
gbass = note_seq([110, 110, 131, 110, 110, 165, 131, 110,
                  110, 110, 131, 110, 147, 165, 196, 0], 0.25, 0.24, tri)
write("bgm_game.wav", game + gbass)
print("audio done")
