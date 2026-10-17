"""Original cinematic score for the film.

Everything here is synthesized from scratch (sine/additive synthesis, noise,
FFT convolution reverb), so the track is 100% original and royalty-free:
no third-party samples, no licensing strings attached.
"""
import os
import numpy as np
from scipy.signal import fftconvolve

from timeline import TOTAL, TIP_START, TIP_STEP, NUM_TIPS, OUTRO_START, INTRO_LEN

SR = 44100
N = int(TOTAL * SR) + SR
rng = np.random.default_rng(2026)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def midi_hz(n):
    return 440.0 * 2 ** ((n - 69) / 12.0)


def env_ar(n, a, r, curve=1.0, hold=None):
    """attack/release envelope over n samples."""
    a = max(int(a * SR), 1)
    r = max(int(r * SR), 1)
    e = np.ones(n, np.float32)
    ai = min(a, n)
    e[:ai] = (np.linspace(0, 1, ai) ** curve)
    ri = min(r, n)
    e[-ri:] *= (np.linspace(1, 0, ri) ** curve)
    return e


def add(buf, sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= len(buf) or i + len(sig) <= 0:
        return
    if i < 0:
        sig = sig[-i:]
        i = 0
    j = min(len(buf), i + len(sig))
    seg = sig[: j - i] * gain
    # constant-power pan
    th = (pan + 1) * np.pi / 4
    buf[i:j, 0] += seg * np.cos(th)
    buf[i:j, 1] += seg * np.sin(th)


def pad_voice(notes, dur, gain, attack=2.4, release=3.2, bright=1.0):
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float32) / SR
    out = np.zeros(n, np.float32)
    for k, m in enumerate(notes):
        f = midi_hz(m)
        # slow chorus detune per voice
        det = 1.0 + 0.0013 * np.sin(2 * np.pi * (0.05 + 0.013 * k) * t + k)
        sig = np.zeros(n, np.float32)
        for h, amp in [(1, 1.0), (2, 0.30 * bright), (3, 0.13 * bright), (5, 0.045 * bright)]:
            sig += amp * np.sin(2 * np.pi * f * h * det * t + k * 1.7)
        sig *= (0.82 + 0.18 * np.sin(2 * np.pi * 0.09 * t + k))
        out += sig / len(notes)
    out *= env_ar(n, attack, release, curve=1.4)
    return out * gain


def pluck(m, dur=2.6, gain=0.12):
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float32) / SR
    f = midi_hz(m)
    sig = (np.sin(2 * np.pi * f * t) * 1.0
           + 0.42 * np.sin(2 * np.pi * f * 2.003 * t) * np.exp(-t * 2.2)
           + 0.20 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t * 3.4)
           + 0.07 * np.sin(2 * np.pi * f * 4.99 * t) * np.exp(-t * 5.0))
    sig *= np.exp(-t * 1.55) * (1 - np.exp(-t * 240))
    return sig * gain


def bass(m, dur, gain=0.12):
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float32) / SR
    f = midi_hz(m)
    sig = np.sin(2 * np.pi * f * t) + 0.22 * np.sin(2 * np.pi * f * 2 * t)
    sig *= env_ar(n, 1.4, 2.2, curve=1.2)
    return sig * gain


def bell(m, dur=3.4, gain=0.055):
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float32) / SR
    f = midi_hz(m)
    sig = (np.sin(2 * np.pi * f * t) * np.exp(-t * 1.1)
           + 0.30 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 2.2))
    sig *= (1 - np.exp(-t * 300))
    return sig * gain


def noise_swell(dur, gain, f_hi=5200, f_lo=300):
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float32) / SR
    noise = rng.normal(0, 1, n).astype(np.float32)
    # crude band shaping via FFT
    spec = np.fft.rfft(noise)
    freqs = np.fft.rfftfreq(n, 1 / SR)
    band = np.exp(-((np.log(freqs + 1) - np.log(1200)) ** 2) / 2.0)
    noise = np.fft.irfft(spec * band, n).astype(np.float32)
    e = (t / dur) ** 2.4 * np.clip((dur - t) / 0.25, 0, 1)
    return noise * e * gain


def lowpulse(dur=1.6, gain=0.05):
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float32) / SR
    f = 52 * (1 + 0.5 * np.exp(-t * 22))
    sig = np.sin(2 * np.pi * f * t) * np.exp(-t * 5.2)
    return sig * gain


# ------------------------------------------------------------------ harmony
D, E, Fs, G, A, B, Cs = 62, 64, 66, 67, 69, 71, 73

INTRO_CHORD = [50, 57, 62, 66, 69, 76]  # D add9 wide

TIP_CHORDS = [
    [50, 57, 62, 66, 69],   # D
    [47, 54, 59, 62, 66],   # Bm
    [43, 50, 55, 59, 66],   # G
    [42, 50, 54, 57, 64],   # D/F#
    [40, 47, 52, 55, 62],   # Em7
    [45, 52, 57, 61, 64],   # A7
    [47, 54, 59, 62, 69],   # Bm
    [43, 50, 55, 59, 62],   # G
    [40, 47, 52, 55, 62],   # Em
    [45, 52, 57, 61, 69],   # A
]

OUTRO_CHORD = [38, 45, 50, 54, 57, 62, 66, 69, 76]  # big D


def build():
    mix = np.zeros((N, 2), np.float32)

    # ---------- intro pad + arpeggio
    add(mix, pad_voice(INTRO_CHORD, INTRO_LEN + 3.0, 0.26, attack=3.4, release=4.0, bright=0.8), 0.0)
    for i, m in enumerate([69, 74, 78, 81, 86, 90]):
        add(mix, bell(m, 4.2, 0.06), 1.4 + i * 1.35, pan=np.sin(i) * 0.35)
    # heartbeat under the opening lines
    for tt in [2.2, 2.55, 3.3, 3.65]:
        add(mix, lowpulse(1.2, 0.05), tt)
    add(mix, noise_swell(3.2, 0.030), INTRO_LEN - 2.4)

    # ---------- tip section
    for i in range(NUM_TIPS):
        t0 = TIP_START + TIP_STEP * i - 0.25
        ch = TIP_CHORDS[i]
        dur = TIP_STEP + 3.4
        add(mix, pad_voice(ch, dur, 0.235, attack=1.9, release=3.0, bright=1.0), t0)
        add(mix, bass(ch[0] - 12, TIP_STEP + 1.0, 0.115), t0)
        # arpeggio / broken chords
        pattern = [ch[2] + 12, ch[4] + 12, ch[1] + 12, ch[3] + 12,
                   ch[2] + 24, ch[4] + 12, ch[0] + 24, ch[3] + 12]
        for j in range(8):
            tt = t0 + 0.55 + j * (TIP_STEP - 1.2) / 8.0
            vel = 0.075 * (0.7 + 0.3 * np.sin(j * 1.3 + i))
            add(mix, pluck(pattern[j], 2.9, vel), tt, pan=(-0.35 if j % 2 else 0.35))
        # high shimmer note on the turn
        if i % 2 == 0:
            add(mix, bell(ch[3] + 24, 3.8, 0.032), t0 + 3.1, pan=0.4)

    # ---------- outro
    add(mix, pad_voice(OUTRO_CHORD, 17.0, 0.30, attack=2.6, release=6.5, bright=1.15), OUTRO_START + 0.1)
    add(mix, bass(OUTRO_CHORD[0] - 12, 15.0, 0.14), OUTRO_START + 0.1)
    for i, (tt, m) in enumerate([(1.4, 74), (3.2, 78), (4.7, 81), (6.4, 86), (9.4, 81), (11.2, 86), (13.0, 90)]):
        add(mix, pluck(m, 4.0, 0.085), OUTRO_START + tt, pan=np.sin(i * 0.9) * 0.4)
    add(mix, noise_swell(4.0, 0.026), OUTRO_START + 8.0)

    # ---------- glue: stereo reverb from a synthetic hall IR
    ir_len = int(2.9 * SR)
    t = np.arange(ir_len, dtype=np.float32) / SR
    ir = np.stack([rng.normal(0, 1, ir_len), rng.normal(0, 1, ir_len)]).astype(np.float32)
    ir *= np.exp(-t * 2.3)[None, :]
    # early reflections
    for d, g in [(0.011, 0.5), (0.019, 0.36), (0.031, 0.28), (0.047, 0.2)]:
        ir[:, int(d * SR)] += g
    ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))

    wet = np.stack([
        fftconvolve(mix[:, 0], ir[0])[:N],
        fftconvolve(mix[:, 1], ir[1])[:N],
    ], axis=1).astype(np.float32)
    mix = mix * 0.82 + wet * 0.42

    # ---------- gentle master bus
    mix = np.tanh(mix * 1.15) * 0.95
    # high shelf air
    hp = np.diff(mix, axis=0, prepend=mix[:1])
    mix = mix + hp * 0.06

    # fades
    fi = int(1.6 * SR)
    mix[:fi] *= np.linspace(0, 1, fi)[:, None] ** 1.5
    fo = int(4.2 * SR)
    mix[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.6

    mix = mix[: int(TOTAL * SR)]
    peak = np.abs(mix).max()
    mix *= (10 ** (-1.0 / 20)) / max(peak, 1e-6)
    return mix


def save_wav(mix, path):
    pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
    import wave
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    m = build()
    out = os.path.join(ROOT, "audio", "score.wav")
    save_wav(m, out)
    print("wrote", out, f"{len(m)/SR:.2f}s", "peak", float(np.abs(m).max()))
