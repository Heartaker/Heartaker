"""Procedural 10s cinematic motion from the still.

Pipeline per frame
  1. camera transform (dolly in toward the key/lock junction, slow drift, roll, jolt shake)
  2. key layer: piecewise rotation of the bow around the lock axis with a weight ramp to the
     pinned shaft, plus strain tremble -> jam / recoil
  3. dust motes (parallax, two depth layers) + rust flecks kicked off the lock at each jam
  4. light sweep on the metal, breathing warm beam, bloom/halation
  5. grade: chromatic aberration, filmic curve, split tone, vignette, grain

Usage
  python render.py --preview 0,2.6,5.0,7.4,9.9      # PNG stills to preview/
  python render.py --video ../key_lock_motion.mp4    # full 10s, 1920x1080, 30 fps
"""
import argparse
import math
import os
import subprocess
import sys

import cv2
import imageio_ffmpeg
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
KEY = os.path.join(HERE, "key_rgba.png")
PLATE = os.path.join(HERE, "plate.png")

OUT_W, OUT_H = 1920, 1080
FPS = 30
DUR = 10.0
SS = 1.5                      # supersample factor for the render canvas
CW, CH = int(OUT_W * SS), int(OUT_H * SS)

SRC_W, SRC_H = 1376, 768
BASE = max(OUT_W / SRC_W, OUT_H / SRC_H)          # cover
FOCUS = np.array([742.0, 352.0])                  # source-space point the dolly pushes toward
PIVOT = np.array([905.0, 372.0])                  # lock axis, source space
RAMP = (566.0, 650.0)                             # bow -> shaft weight ramp (source x)
KEYHOLE = np.array([930.0, 430.0])                # where rust flecks come from

rng = np.random.default_rng(20240517)


# ----------------------------------------------------------------- helpers
def smoother(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * x * (x * (x * 6 - 15) + 10)


def track(t, keys):
    """Smooth piecewise interpolation through (time, value) keys."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            u = 0.0 if t1 <= t0 else (t - t0) / (t1 - t0)
            return v0 + (v1 - v0) * smoother(u)
    return keys[-1][1]


def trapezoid(t, a, b, ramp):
    return smoother((t - a) / ramp) * (1.0 - smoother((t - (b - ramp)) / ramp))


def affine(scale, rot, tx, ty, about):
    c, s = math.cos(rot), math.sin(rot)
    m = np.array([[scale * c, -scale * s, 0.0], [scale * s, scale * c, 0.0]], np.float64)
    ax, ay = about
    m[0, 2] = tx + ax - (m[0, 0] * ax + m[0, 1] * ay)
    m[1, 2] = ty + ay - (m[1, 0] * ax + m[1, 1] * ay)
    return m


# ------------------------------------------------------------ key timing
ANGLE_KEYS = [
    (0.00, 0.0), (0.75, 0.0),
    (2.55, -4.4), (2.85, -5.0), (3.05, -3.5), (3.45, -3.0),
    (6.20, -6.5), (6.52, -7.0), (6.78, -4.2), (7.05, -3.5), (7.45, -3.3),
    (9.35, -5.9), (9.62, -6.3), (9.85, -5.6), (10.0, -5.4),
]
PRESS = [(0.75, 2.90, 0.9), (3.45, 6.60, 0.8), (7.45, 9.75, 0.8)]
JOLTS = [(2.85, 1.0), (6.52, 1.35), (9.62, 0.8)]


def press_env(t):
    return max((trapezoid(t, a, b, r) for a, b, r in PRESS), default=0.0)


def key_angle(t):
    trem = (0.50 * math.sin(2 * math.pi * 8.3 * t + 0.4)
            + 0.30 * math.sin(2 * math.pi * 13.7 * t + 1.9)
            + 0.20 * math.sin(2 * math.pi * 21.1 * t + 2.7))
    return track(t, ANGLE_KEYS) + 0.30 * trem * press_env(t)


def shake(t):
    dx = dy = roll = 0.0
    for t0, amp in JOLTS:
        dt = t - t0
        if dt <= 0:
            continue
        e = math.exp(-dt / 0.19) * amp * (dt < 1.2)
        dx += 0.0075 * CH * e * math.sin(2 * math.pi * 9.0 * dt + 0.7)
        dy += 0.0060 * CH * e * math.sin(2 * math.pi * 12.0 * dt + 2.1)
        roll += 0.0022 * e * math.sin(2 * math.pi * 7.0 * dt + 1.3)
    roll += 0.0012 * press_env(t) * math.sin(2 * math.pi * 5.5 * t)
    return dx, dy, roll


def camera(t):
    u = t / DUR
    s = 1.0 + 0.205 * smoother(u) + 0.004 * math.sin(2 * math.pi * 0.22 * t)
    drift_x = -0.011 * CW * smoother(u) ** 1.2
    drift_y = 0.016 * CH * smoother(u) ** 1.4
    sx, sy, roll = shake(t)
    roll += math.radians(0.45) * (u - 0.5)
    return s, drift_x + sx, drift_y + sy, roll


def cam_matrix(t, parallax=1.0):
    """Source px -> canvas px: scale + roll about FOCUS, which lands on the canvas centre."""
    s, dx, dy, roll = camera(t)
    k = BASE * SS * (1.0 + (s - 1.0) * parallax)
    c = math.cos(roll * parallax) * k
    sn = math.sin(roll * parallax) * k
    tx = CW / 2.0 + dx * parallax
    ty = CH / 2.0 + dy * parallax
    m = np.array([[c, -sn, 0.0], [sn, c, 0.0]], np.float64)
    m[0, 2] = tx - (c * FOCUS[0] - sn * FOCUS[1])
    m[1, 2] = ty - (sn * FOCUS[0] + c * FOCUS[1])
    return m


# ------------------------------------------------------------- particles
class Motes:
    def __init__(self, n, rmin, rmax, bmin, bmax, depth, drift, seed):
        r = np.random.default_rng(seed)
        self.n = n
        self.p = r.uniform(-0.62, 0.62, (n, 2)) * np.array([CW, CH])
        self.v = r.normal(0, 1, (n, 2)) * drift
        self.depth = r.uniform(*depth, n)
        self.r = r.uniform(rmin, rmax, n)
        self.b = r.uniform(bmin, bmax, n)
        self.ph = r.uniform(0, 2 * math.pi, n)
        self.w = r.uniform(0.2, 0.9, n)

    def draw(self, layer, t, s, roll, centre):
        c, sn = math.cos(roll), math.sin(roll)
        for i in range(self.n):
            k = float(self.depth[i])
            x = float(self.p[i, 0]) + float(self.v[i, 0]) * t + 9.0 * math.sin(0.7 * t + float(self.ph[i]))
            y = float(self.p[i, 1]) + float(self.v[i, 1]) * t + 7.0 * math.cos(0.9 * t + float(self.ph[i]))
            x *= s * k
            y *= s * k
            x, y = x * c - y * sn, x * sn + y * c
            cx, cy = int(centre[0] + x), int(centre[1] + y)
            rad = float(self.r[i]) * (0.6 + 0.4 * k)
            glow = float(self.b[i]) * (0.55 + 0.45 * math.sin(float(self.w[i]) * 2 * math.pi * 0.35 * t + float(self.ph[i])) ** 2)
            add_sprite(layer, cx, cy, rad, glow)


_SPRITES = {}


def sprite(rad):
    key = max(1, int(round(rad)))
    if key not in _SPRITES:
        half = int(math.ceil(key * 2.6))
        y, x = np.mgrid[-half:half + 1, -half:half + 1].astype(np.float32)
        g = np.exp(-(x * x + y * y) / (2.0 * (key * 0.62) ** 2))
        _SPRITES[key] = g.astype(np.float32)
    return _SPRITES[key]


def add_sprite(layer, cx, cy, rad, val):
    if val <= 0.002:
        return
    g = sprite(rad)
    h = g.shape[0] // 2
    y0, y1 = cy - h, cy + h + 1
    x0, x1 = cx - h, cx + h + 1
    if y1 <= 0 or x1 <= 0 or y0 >= layer.shape[0] or x0 >= layer.shape[1]:
        return
    gy0, gy1 = max(0, -y0), g.shape[0] - max(0, y1 - layer.shape[0])
    gx0, gx1 = max(0, -x0), g.shape[1] - max(0, x1 - layer.shape[1])
    layer[max(0, y0):min(layer.shape[0], y1), max(0, x0):min(layer.shape[1], x1)] += \
        g[gy0:gy1, gx0:gx1] * val


class Flecks:
    """Rust / grit kicked out of the lock at each jam."""

    def __init__(self):
        self.items = []
        r = np.random.default_rng(771)
        for t0, amp in JOLTS:
            for _ in range(int(34 * amp)):
                self.items.append(dict(
                    t0=t0 + r.uniform(0.0, 0.10),
                    p=KEYHOLE + r.normal(0, 1, 2) * np.array([26, 22]),
                    v=r.normal(0, 1, 2) * np.array([1.6, 1.2]) + np.array([-0.5, -0.9]),
                    r=r.uniform(1.2, 3.2), life=r.uniform(0.6, 1.5), b=r.uniform(0.22, 0.62)))

    def draw(self, layer, t, m, s):
        for f in self.items:
            dt = t - f["t0"]
            if dt < 0 or dt > f["life"]:
                continue
            fade = max(0.0, 1.0 - dt / f["life"]) ** 1.6
            p = f["p"] + f["v"] * dt * 26 + np.array([0.0, 120.0]) * dt * dt
            q = m @ np.array([p[0], p[1], 1.0])
            add_sprite(layer, int(q[0]), int(q[1]), f["r"] * SS * 2.0, f["b"] * fade)


# --------------------------------------------------------------- assets
def load():
    key = cv2.imread(KEY, cv2.IMREAD_UNCHANGED).astype(np.float32) / 255.0
    plate = cv2.imread(PLATE).astype(np.float32) / 255.0
    b, g, r, a = key[..., 0], key[..., 1], key[..., 2], key[..., 3]
    pm = np.dstack([b * a, g * a, r * a, a]).astype(np.float32)

    # bow->shaft weight map (1 = rotates, 0 = pinned in the lock)
    xs = np.arange(SRC_W, dtype=np.float32)[None, :].repeat(SRC_H, 0)
    w = 1.0 - smoother((xs - RAMP[0]) / (RAMP[1] - RAMP[0]))
    w = cv2.GaussianBlur(w, (0, 0), 9).astype(np.float32)

    # warm light on the metal
    return pm, plate, w


PM_KEY, PLATE_SRC, BOW_W = load()
VIGNETTE = None
def grain_tile(n):
    """Fresh noise every frame (a repeating tile reads as a 10 Hz strobe)."""
    return np.random.default_rng(n).normal(0, 1, (OUT_H // 2 + 2, OUT_W // 2 + 2)).astype(np.float32)


def vignette():
    global VIGNETTE
    if VIGNETTE is None:
        y, x = np.mgrid[0:OUT_H, 0:OUT_W].astype(np.float32)
        nx = (x - OUT_W / 2) / (OUT_W / 2)
        ny = (y - OUT_H / 2) / (OUT_H / 2)
        r = np.sqrt(nx * nx * 0.92 + ny * ny * 1.02)
        VIGNETTE = np.clip(1.0 - 0.46 * np.clip(r - 0.28, 0, None) ** 1.7, 0.0, 1.0).astype(np.float32)
        VIGNETTE = cv2.GaussianBlur(VIGNETTE, (0, 0), 40)[..., None]
    return VIGNETTE


def warped_key(t, m):
    """RGBA key with the bow rotated around the lock axis, shaft pinned, then camera matrix."""
    a = math.radians(key_angle(t))
    trem = 0.5 * press_env(t) * math.sin(2 * math.pi * 17.0 * t)
    rot = affine(1.0, a, trem * SS * BASE * 0.35, trem * SS * BASE * 0.2, tuple(PIVOT))
    m_rot = np.vstack([rot, [0, 0, 1]]) @ np.vstack([m, [0, 0, 1]])
    m_rot = m_rot[:2]

    sz = (CW, CH)
    k0 = cv2.warpAffine(PM_KEY, m, sz, flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT)
    k1 = cv2.warpAffine(PM_KEY, m_rot, sz, flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT)
    w = cv2.warpAffine(BOW_W, m, sz, flags=cv2.INTER_LINEAR)[..., None]
    return k0 * (1 - w) + k1 * w


def render_frame(t, motes_far, motes_near, flecks):
    m = cam_matrix(t)
    s, dx, dy, roll = camera(t)
    centre = (CW / 2.0 + dx, CH / 2.0 + dy)

    # ---- background plate, slightly slower for parallax
    mb = cam_matrix(t, parallax=0.74)
    plate = cv2.warpAffine(PLATE_SRC, mb, (CW, CH), flags=cv2.INTER_LINEAR,
                           borderMode=cv2.BORDER_REFLECT)

    far = np.zeros((CH, CW), np.float32)
    motes_far.draw(far, t, s, roll, centre)
    plate += far[..., None] * np.array([0.55, 0.72, 0.95], np.float32)

    # ---- key
    k = warped_key(t, m)
    a = k[..., 3:4]

    # light sweep across the metal + strain-driven specular bloom
    yy, xx = np.mgrid[0:CH, 0:CW].astype(np.float32)
    slope = 0.55
    band = (xx * slope + yy) / CH
    sweep = 0.5 + 0.5 * np.sin(2 * math.pi * (band * 0.9 - 0.42 - 0.10 * t))
    sweep = cv2.GaussianBlur(sweep.astype(np.float32), (0, 0), 55)
    key_rgb = k[..., :3] * (0.93 + 0.20 * sweep[..., None] * a)
    key_rgb += a * 0.035 * press_env(t) * (sweep[..., None] ** 2)

    img = key_rgb + plate * (1 - a)

    # ---- dust in front of the lens
    near = np.zeros((CH, CW), np.float32)
    motes_near.draw(near, t, s, roll, centre)
    img += near[..., None] * np.array([0.62, 0.76, 1.0], np.float32)

    grit = np.zeros((CH, CW), np.float32)
    flecks.draw(grit, t, m, s)
    img += grit[..., None] * np.array([0.22, 0.52, 1.0], np.float32)

    # ---- breathing warm beam from the upper left
    beam = np.exp(-(((xx / CW - 0.16) * 1.5) ** 2 + ((yy / CH - 0.10) * 1.0) ** 2) * 2.2)
    beam = cv2.GaussianBlur(beam.astype(np.float32), (0, 0), 70)
    flick = 0.90 + 0.06 * math.sin(2 * math.pi * 0.9 * t) + 0.03 * math.sin(2 * math.pi * 2.7 * t + 1.1)
    img += beam[..., None] * np.array([0.11, 0.15, 0.22], np.float32) * flick

    # ---- bloom / halation
    small = cv2.resize(img, (CW // 4, CH // 4), interpolation=cv2.INTER_AREA)
    bright = np.clip(small - 0.72, 0, None) ** 1.15
    bloom = cv2.GaussianBlur(bright, (0, 0), 9)
    bloom = cv2.resize(bloom, (CW, CH), interpolation=cv2.INTER_LINEAR)
    img = img + bloom * np.array([0.30, 0.20, 0.13], np.float32) * 1.9

    # ---- downsample to delivery size
    img = cv2.resize(img, (OUT_W, OUT_H), interpolation=cv2.INTER_AREA)

    # ---- chromatic aberration (radial, subtle)
    ca = 0.0011
    for ch, sc in ((2, 1 - ca), (0, 1 + ca)):
        mc = affine(sc, 0, 0, 0, (OUT_W / 2, OUT_H / 2))
        img[..., ch] = cv2.warpAffine(img[..., ch], mc, (OUT_W, OUT_H), flags=cv2.INTER_LINEAR,
                                      borderMode=cv2.BORDER_REFLECT)

    # ---- grade
    x = np.clip(img, 0, 1.4)
    aces = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)
    img = x + (aces - x) * 0.32
    img = np.clip(img, 0, 1)
    img = (img - 0.5) * 1.055 + 0.5 + 0.008
    img = np.clip(img, 0, 1)

    lum = img @ np.array([0.299, 0.587, 0.114], np.float32)
    sat = 1.07
    img = lum[..., None] + (img - lum[..., None]) * sat
    # split tone: warm highs, cool shadows
    sh = np.clip(1 - lum * 2.0, 0, 1)[..., None]
    hi = np.clip(lum * 2.0 - 1, 0, 1)[..., None]
    img = img + sh * np.array([0.012, 0.004, -0.016], np.float32) * 0.9
    img = img + hi * np.array([0.018, 0.006, -0.012], np.float32)
    img *= (vignette() * 0.94 + 0.06)
    img = np.clip(img, 0, 1)

    # ---- grain + slight gate weave
    gnoise = grain_tile(int(round(t * 1000)))
    oy = int((math.sin(t * 3.7) * 0.5 + 0.5) * (gnoise.shape[0] - OUT_H // 2 - 1))
    ox = int((math.sin(t * 2.3 + 1.0) * 0.5 + 0.5) * (gnoise.shape[1] - OUT_W // 2 - 1))
    gn = gnoise[oy:oy + OUT_H // 2, ox:ox + OUT_W // 2]
    gn = cv2.resize(gn, (OUT_W, OUT_H), interpolation=cv2.INTER_LINEAR)
    amp = 0.017 * (1.0 - 0.55 * np.clip(lum * 1.6, 0, 1))
    img = img + (gn * amp)[..., None]
    return np.clip(img * 255.0, 0, 255).astype(np.uint8)


def build_particles():
    far = Motes(58, 2.5, 7.0, 0.11, 0.36, (0.55, 0.95), 9.0, 11)
    near = Motes(34, 3.4, 11.0, 0.10, 0.34, (1.05, 2.10), 16.0, 29)
    return far, near, Flecks()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", default="")
    ap.add_argument("--video", default="")
    ap.add_argument("--start", type=float, default=0.0)
    ap.add_argument("--end", type=float, default=DUR)
    args = ap.parse_args()

    far, near, flecks = build_particles()

    if args.preview:
        os.makedirs(os.path.join(HERE, "preview"), exist_ok=True)
        for ts in args.preview.split(","):
            t = float(ts)
            fr = render_frame(t, far, near, flecks)
            p = os.path.join(HERE, "preview", f"f_{t:05.2f}.png")
            cv2.imwrite(p, fr)
            print("wrote", p, flush=True)
        return

    out = args.video or os.path.join(HERE, "..", "key_lock_motion.mp4")
    n0 = int(round(args.start * FPS))
    n1 = int(round(args.end * FPS))
    cmd = [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-hide_banner", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{OUT_W}x{OUT_H}", "-r", str(FPS),
           "-i", "-", "-an",
           "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
           "-profile:v", "high", "-movflags", "+faststart", out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(n0, n1):
        t = i / FPS
        proc.stdin.write(render_frame(t, far, near, flecks).tobytes())
        if i % 30 == 0:
            print(f"frame {i}/{n1} ({100 * i / n1:.0f}%)", flush=True)
    proc.stdin.close()
    proc.wait()
    print("done ->", os.path.abspath(out), flush=True)


if __name__ == "__main__":
    main()
