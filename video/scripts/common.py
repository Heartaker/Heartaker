"""Rendering primitives: type, grading, lens effects, atmosphere."""
import os
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

from timeline import W, H, COL

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(ROOT, "fonts")
PLATE_DIR = os.path.join(ROOT, "plates")

_FONT_CACHE = {}


def font(name, size):
    key = (name, size)
    if key not in _FONT_CACHE:
        _FONT_CACHE[key] = ImageFont.truetype(os.path.join(FONT_DIR, name), size)
    return _FONT_CACHE[key]


SERIF_BLACK = "playfair-display-latin-900-normal.ttf"
SERIF_BOLD = "playfair-display-latin-700-normal.ttf"
SERIF = "playfair-display-latin-400-normal.ttf"
SERIF_ITALIC = "playfair-display-latin-400-italic.ttf"
SERIF_ITALIC_500 = "playfair-display-latin-500-italic.ttf"
SANS = "inter-latin-400-normal.ttf"
SANS_MED = "inter-latin-500-normal.ttf"
SANS_SEMI = "inter-latin-600-normal.ttf"
SANS_BOLD = "inter-latin-700-normal.ttf"
SANS_BLACK = "inter-latin-900-normal.ttf"


# ---------------------------------------------------------------- easing
def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def ease_out_cubic(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def ease_out_quint(x):
    x = clamp(x)
    return 1 - (1 - x) ** 5


def ease_in_out(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def ease_out_expo(x):
    x = clamp(x)
    return 1.0 if x >= 1 else 1 - 2 ** (-10 * x)


def smooth_window(t, a, b, fade=0.0):
    """1 inside [a,b], with optional soft edges."""
    if t < a or t > b:
        return 0.0
    if fade <= 0:
        return 1.0
    return min(clamp((t - a) / fade), clamp((b - t) / fade), 1.0)


# ---------------------------------------------------------------- type
def tracked_width(text, fnt, tracking):
    if not text:
        return 0
    w = sum(fnt.getlength(c) for c in text)
    return w + tracking * (len(text) - 1)


def draw_tracked(draw, xy, text, fnt, fill, tracking=0, anchor_left=True):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill, anchor="ls")
        x += fnt.getlength(ch) + tracking


def line_height(fnt, gap=1.0):
    asc, desc = fnt.getmetrics()
    return (asc + desc) * gap, asc


def make_text_layer(text, fnt, fill, tracking=0, pad=40):
    """Render one line of (possibly tracked) text onto a tight RGBA layer."""
    w = tracked_width(text, fnt, tracking)
    asc, desc = fnt.getmetrics()
    img = Image.new("RGBA", (int(math.ceil(w)) + pad * 2, asc + desc + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    draw_tracked(d, (pad, pad + asc), text, fnt, fill, tracking)
    return img, pad


def make_paragraph(text, fnt, fill, max_w, tracking=0, gap=1.5, pad=40):
    words = text.split()
    lines, cur = [], ""
    for wd in words:
        trial = (cur + " " + wd).strip()
        if tracked_width(trial, fnt, tracking) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = wd
    if cur:
        lines.append(cur)
    lh, asc = line_height(fnt, gap)
    width = max(tracked_width(l, fnt, tracking) for l in lines)
    img = Image.new("RGBA", (int(math.ceil(width)) + pad * 2, int(lh * len(lines)) + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, l in enumerate(lines):
        draw_tracked(d, (pad, pad + asc + i * lh), l, fnt, fill, tracking)
    return img, pad, lh


def fit_size(text, font_name, size, max_w, tracking=0, floor=28):
    while size > floor:
        f = font(font_name, size)
        if tracked_width(text, f, tracking) <= max_w:
            return f
        size -= 2
    return font(font_name, floor)


def add_glow(layer, color, radius, strength=0.55, pad=60):
    """Soft halo around a text layer (for warm highlights)."""
    a = layer.getchannel("A")
    big = Image.new("L", (layer.width + pad * 2, layer.height + pad * 2), 0)
    big.paste(a, (pad, pad))
    big = big.filter(ImageFilter.GaussianBlur(radius))
    big = big.point(lambda v: int(v * strength))
    glow = Image.new("RGBA", big.size, color + (0,))
    glow.putalpha(big)
    return glow, pad


def soft_shadow(layer, radius=18, strength=0.72, pad=70):
    a = layer.getchannel("A")
    big = Image.new("L", (layer.width + pad * 2, layer.height + pad * 2), 0)
    big.paste(a, (pad, pad))
    big = big.filter(ImageFilter.GaussianBlur(radius)).point(lambda v: int(v * strength))
    sh = Image.new("RGBA", big.size, (0, 0, 0, 0))
    sh.putalpha(big)
    return sh, pad


def composite_text(base, layer, x, y, alpha=1.0, shadow=True):
    """Alpha-composite a text layer with an overall opacity multiplier."""
    if alpha <= 0.004:
        return base
    a = float(alpha)
    if shadow:
        sh, spad = soft_shadow(layer, radius=18, strength=0.62 * a)
        base.alpha_composite(sh, (int(x) - spad, int(y) - spad + 12))
    lyr = layer
    if a < 0.999:
        lyr = layer.copy()
        lyr.putalpha(layer.getchannel("A").point(lambda v: int(v * a)))
    base.alpha_composite(lyr, (int(x), int(y)))
    return base


# ---------------------------------------------------------------- shapes
def rounded_rect_layer(size, radius, fill=None, outline=None, width=2, glow=None):
    img = Image.new("RGBA", (int(size[0]), int(size[1])), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius,
                        fill=fill, outline=outline, width=width)
    return img


_HEART = None


def heart_layer(size, color):
    """Smooth, classic heart from a supersampled parametric curve."""
    ss = 4
    s = 400 * ss
    t = np.linspace(0, 2 * np.pi, 720, endpoint=False)
    x = 16 * np.sin(t) ** 3
    y = 13 * np.cos(t) - 5 * np.cos(2 * t) - 2 * np.cos(3 * t) - np.cos(4 * t)
    x = (x - x.min()) / (x.max() - x.min())
    y = (y - y.min()) / (y.max() - y.min())
    pad = 0.04
    pts = [((pad + xx * (1 - 2 * pad)) * s, (pad + (1 - yy) * (1 - 2 * pad)) * s)
           for xx, yy in zip(x, y)]
    img = Image.new("L", (s, s), 0)
    ImageDraw.Draw(img).polygon(pts, fill=255)
    img = img.resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), color + (0,))
    out.putalpha(img)
    return out


# ---------------------------------------------------------------- grading
def _lut(kind):
    x = np.arange(256, dtype=np.float32) / 255.0
    if kind == "contrast":
        y = np.clip((x - 0.5) * 1.12 + 0.5 + 0.012, 0, 1)
        y = y ** 1.02
    elif kind == "r":
        y = np.clip(x * 1.045 + 0.010, 0, 1)
    elif kind == "g":
        y = np.clip(x * 1.005 + 0.004, 0, 1)
    elif kind == "b":
        y = np.clip(x * 0.985 + 0.012, 0, 1)
    else:
        y = x
    return (y * 255).astype(np.uint8)


_LUTS = {k: _lut(k) for k in ("contrast", "r", "g", "b")}


def grade_plate(path, master_w=2400, target=None):
    """Cinematic teal/amber grade baked into a master image (fast per-frame)."""
    im = Image.open(path).convert("RGB")
    # cover-crop to 16:9 first at high resolution
    tw, th = im.size
    want = 16 / 9
    if tw / th > want:
        nw = int(th * want)
        im = im.crop(((tw - nw) // 2, 0, (tw - nw) // 2 + nw, th))
    elif tw / th < want:
        nh = int(tw / want)
        top = int((th - nh) * 0.42)
        im = im.crop((0, top, tw, top + nh))
    im = im.resize((master_w, int(master_w * 9 / 16)), Image.LANCZOS)

    arr = np.asarray(im).copy()
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    arr[..., 0] = _LUTS["r"][r]
    arr[..., 1] = _LUTS["g"][g]
    arr[..., 2] = _LUTS["b"][b]
    arr = _LUTS["contrast"][arr]

    # teal shadows / amber highlights split tone
    f = arr.astype(np.float32) / 255.0
    lum = f[..., 0] * 0.299 + f[..., 1] * 0.587 + f[..., 2] * 0.114
    shadow = np.clip(1.0 - lum * 2.2, 0, 1)[..., None]
    high = np.clip((lum - 0.45) * 2.0, 0, 1)[..., None]
    f = f * (1 - shadow * 0.16) + shadow * np.array([0.02, 0.135, 0.145], np.float32) * 0.16
    f = f + high * np.array([0.085, 0.042, 0.0], np.float32) * 0.55
    # filmic desaturation: pull chroma back ~9% so nothing reads digital/acid
    grey = (f[..., 0:1] * 0.299 + f[..., 1:2] * 0.587 + f[..., 2:3] * 0.114)
    f = grey + (f - grey) * 0.91

    # gentle bloom on highlights
    hsv = np.clip((lum - 0.62) / 0.38, 0, 1)[..., None]
    base_img = Image.fromarray((np.clip(f, 0, 1) * 255).astype(np.uint8))
    small = base_img.resize((master_w // 4, master_w // 4 * 9 // 16), Image.BILINEAR)
    bloom = small.filter(ImageFilter.GaussianBlur(9)).resize(base_img.size, Image.BILINEAR)
    base_img = ImageChops.add(base_img, ImageChops.multiply(
        bloom, Image.fromarray((hsv * 90).astype(np.uint8).repeat(3, axis=2))), scale=1.0)

    # vignette
    vw, vh = base_img.size
    yy, xx = np.mgrid[0:vh, 0:vw].astype(np.float32)
    nx = (xx - vw / 2) / (vw / 2)
    ny = (yy - vh / 2) / (vh / 2)
    rad = np.sqrt(nx ** 2 * 0.92 + ny ** 2 * 1.0)
    vig = np.clip(1.02 - 0.26 * np.clip(rad - 0.35, 0, 2.0) ** 1.55, 0.42, 1.0)
    vim = Image.fromarray((vig[..., None] * 255).astype(np.uint8).repeat(3, axis=2))
    base_img = ImageChops.multiply(base_img, vim)

    # subtle chromatic aberration, baked
    r_, g_, b_ = base_img.split()
    r_ = ImageChops.offset(r_, 1, 0)
    b_ = ImageChops.offset(b_, -1, 0)
    base_img = Image.merge("RGB", (r_, g_, b_))

    return base_img


def ken_burns(master, t, z0, z1, p0, p1, ease=True):
    """Crop a moving window out of the master and return a 1920x1080 RGB frame."""
    mw, mh = master.size
    k = ease_out_cubic(t) if ease else t
    z = z0 + (z1 - z0) * k
    cw = mw / z
    ch = cw * 9 / 16
    if ch > mh:
        ch = mh
        cw = ch * 16 / 9
    cx = (p0[0] + (p1[0] - p0[0]) * k) * (mw - cw) + cw / 2
    cy = (p0[1] + (p1[1] - p0[1]) * k) * (mh - ch) + ch / 2
    x0 = clamp(cx - cw / 2, 0, mw - cw)
    y0 = clamp(cy - ch / 2, 0, mh - ch)
    return master.resize((W, H), Image.BICUBIC, box=(x0, y0, x0 + cw, y0 + ch))


# ---------------------------------------------------------------- atmosphere
def make_scrim(side, strength=0.86):
    """Directional gradient scrim for text legibility."""
    w, h = W, H
    x = np.linspace(0, 1, w, dtype=np.float32)[None, :].repeat(h, axis=0)
    if side == "left":
        g = np.clip(1.0 - x / 0.68, 0, 1) ** 1.5
    elif side == "right":
        g = np.clip(1.0 - (1 - x) / 0.68, 0, 1) ** 1.5
    else:
        g = np.ones_like(x)
    g = g * strength
    a = (g * 255).astype(np.uint8)
    img = Image.new("RGBA", (w, h), (4, 10, 12, 0))
    img.putalpha(Image.fromarray(a))
    return img


_GRAIN = None


def grain_tiles(n=6, size=(960, 540), seed=7):
    global _GRAIN
    if _GRAIN is None:
        rng = np.random.default_rng(seed)
        tiles = []
        for i in range(n):
            g = rng.normal(0, 1, size).astype(np.float32)
            # soften a touch so it reads as film, not sensor noise
            gi = Image.fromarray(np.clip(g * 40 + 128, 0, 255).astype(np.uint8))
            gi = gi.filter(ImageFilter.GaussianBlur(0.6))
            a = (np.asarray(gi).astype(np.float32) - 128) / 40.0
            tiles.append(a)
        _GRAIN = tiles
    return _GRAIN


_GRAIN_FULL = None


def add_grain(img, frame_idx, strength=5.0):
    global _GRAIN_FULL
    tiles = grain_tiles()
    if _GRAIN_FULL is None:
        _GRAIN_FULL = []
        for g in tiles:
            gi = Image.fromarray(np.clip(g * 40 + 128, 0, 255).astype(np.uint8))
            _GRAIN_FULL.append((np.asarray(gi.resize((W, H), Image.BILINEAR),
                                           dtype=np.float32) - 128) / 40.0)
    a = _GRAIN_FULL[frame_idx % len(_GRAIN_FULL)]
    arr = np.asarray(img, dtype=np.float32) + a[..., None] * strength
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def add_light_leak(img, amount, color=(255, 176, 96), pos=(0.18, 0.3), radius=1.25):
    if amount <= 0.004:
        return img
    w, h = 480, 270
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    nx = (xx / w - pos[0]) / radius
    ny = (yy / h - pos[1]) / radius
    d = np.sqrt(nx ** 2 + ny ** 2)
    g = np.clip(1 - d, 0, 1) ** 2.4
    layer = Image.fromarray((g * 255 * amount).astype(np.uint8)).resize((W, H), Image.BILINEAR)
    tint = Image.new("RGB", (W, H), color)
    return Image.composite(ImageChops.screen(img, tint), img, layer.point(lambda v: int(v * 0.75)))


# ---------------------------------------------------------------- bokeh dust
class Motes:
    def __init__(self, n=14, seed=3):
        rng = np.random.default_rng(seed)
        self.items = []
        for _ in range(n):
            self.items.append(dict(
                x=rng.uniform(0, W), y=rng.uniform(0.15, 0.95) * H,
                r=rng.uniform(2.0, 9.0), spd=rng.uniform(4, 16), amp=rng.uniform(8, 30),
                ph=rng.uniform(0, 6.28), a=rng.uniform(0.06, 0.22),
            ))

    def draw(self, img, t):
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        for m in self.items:
            x = (m["x"] + t * m["spd"] + math.sin(t * 0.6 + m["ph"]) * m["amp"]) % (W + 80) - 40
            y = m["y"] + math.sin(t * 0.35 + m["ph"]) * 22
            r = m["r"]
            d.ellipse([x - r, y - r, x + r, y + r],
                      fill=(255, 214, 170, int(m["a"] * 255)))
        layer = layer.filter(ImageFilter.GaussianBlur(2.2))
        img.alpha_composite(layer)
        return img


# ---------------------------------------------------------------- atmosphere bg
class Atmosphere:
    """Procedural cinematic background for intro / outro."""

    def __init__(self, seed=11):
        rng = np.random.default_rng(seed)
        self.w, self.h = 960, 540
        # cloud layers from smoothed noise
        self.clouds = []
        for i in range(3):
            n = rng.normal(0, 1, (self.h // 2, self.w // 2)).astype(np.float32)
            f = np.fft.fft2(n)
            fy = np.fft.fftfreq(n.shape[0])[:, None]
            fx = np.fft.fftfreq(n.shape[1])[None, :]
            rad = np.sqrt(fx ** 2 + fy ** 2) + 1e-6
            f = f / rad ** 2.1
            n = np.real(np.fft.ifft2(f))
            n = (n - n.min()) / (n.max() - n.min())
            n = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((self.w, self.h), Image.BICUBIC)).astype(np.float32) / 255.0
            self.clouds.append(n)
        # rays overlay (wide, will scroll)
        rw = self.w * 2
        yy, xx = np.mgrid[0:self.h, 0:rw].astype(np.float32)
        ang = np.arctan2(yy - self.h * 0.15, xx - rw * 0.5)
        rays = np.zeros((self.h, rw), np.float32)
        for k in range(11):
            cx = np.sin(k * 1.7) * 0.55
            rays += np.exp(-((ang - cx) ** 2) / 0.0022) * (0.35 + 0.65 * np.abs(np.sin(k * 2.3)))
        rays *= np.clip(1 - yy / self.h, 0, 1) ** 1.4
        # radial falloff so the source never reads as a hard starburst
        rx = (xx - rw * 0.5) / rw
        ry = (yy - self.h * 0.1) / self.h
        rays *= np.exp(-(rx ** 2 * 2.4 + ry ** 2 * 2.2))
        rays /= max(rays.max(), 1e-6)
        rimg = Image.fromarray((rays * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(26))
        self.rays_rgba = Image.new("RGBA", (rw, self.h), (255, 198, 144, 0))
        self.rays_rgba.putalpha(rimg)
        self.motes = Motes(18, seed=5)

    def frame(self, t, intensity=1.0):
        yy, xx = np.mgrid[0:self.h, 0:self.w].astype(np.float32)
        gx = xx / self.w
        gy = yy / self.h
        # deep vertical gradient
        base = np.zeros((self.h, self.w, 3), np.float32)
        top = np.array([0.012, 0.035, 0.045], np.float32)
        bot = np.array([0.045, 0.105, 0.112], np.float32)
        for c in range(3):
            base[..., c] = top[c] + (bot[c] - top[c]) * (gy ** 1.25)

        # drifting warm glow
        cx = 0.62 + 0.06 * math.sin(t * 0.18)
        cy = 0.42 + 0.04 * math.cos(t * 0.13)
        d = np.sqrt(((gx - cx) * 1.15) ** 2 + (gy - cy) ** 2)
        glow = np.clip(1 - d / 0.72, 0, 1) ** 2.6
        warm = np.array([1.0, 0.63, 0.36], np.float32)
        base += glow[..., None] * warm * (0.30 * intensity)

        # cloud layers
        for i, c in enumerate(self.clouds):
            sh = int(t * (3 + i * 2)) % self.w
            rolled = np.roll(c, sh, axis=1)
            amt = (0.09 - i * 0.018) * intensity
            base += rolled[..., None] * np.array([0.55, 0.85, 0.85], np.float32) * amt

        img = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8))
        img = img.resize((W, H), Image.BICUBIC).convert("RGBA")

        # rays
        roff = int((t * 9) % (self.w))
        rays = self.rays_rgba.crop((roff, 0, roff + self.w, self.h)).resize((W, H), Image.BILINEAR)
        rays.putalpha(rays.getchannel("A").point(lambda v: int(v * 0.13 * intensity)))
        img.alpha_composite(rays)

        # glowing core
        core = Image.new("RGBA", (W, H), (255, 190, 130, 0))
        ca = Image.new("L", (W, H), 0)
        dc = ImageDraw.Draw(ca)
        r = 300
        dc.ellipse([W * cx - r, H * cy - r, W * cx + r, H * cy + r], fill=int(52 * intensity))
        ca = ca.filter(ImageFilter.GaussianBlur(120))
        core.putalpha(ca)
        img.alpha_composite(core)

        self.motes.draw(img, t)
        return img


def corner_brackets(img, alpha, color=COL["amber"], inset=54, length=54, width=2):
    if alpha <= 0.004:
        return img
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c = color + (int(255 * alpha * 0.8),)
    for (x, y, dx, dy) in [(inset, inset, 1, 1), (W - inset, inset, -1, 1),
                           (inset, H - inset, 1, -1), (W - inset, H - inset, -1, -1)]:
        d.line([(x, y), (x + dx * length, y)], fill=c, width=width)
        d.line([(x, y), (x, y + dy * length)], fill=c, width=width)
    img.alpha_composite(layer)
    return img


def vignette_overlay(strength=1.0):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    nx = (xx - W / 2) / (W / 2)
    ny = (yy - H / 2) / (H / 2)
    rad = np.sqrt(nx ** 2 + ny ** 2)
    g = np.clip((rad - 0.55) / 0.9, 0, 1) ** 2
    a = (g * 200 * strength).astype(np.uint8)
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    img.putalpha(Image.fromarray(a))
    return img


_VIG = None


def add_vignette(img):
    global _VIG
    if _VIG is None:
        _VIG = vignette_overlay()
    img.alpha_composite(_VIG)
    return img
