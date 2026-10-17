"""Builds the YouTube thumbnail (1280x720) from the film's hero plate."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops

from timeline import COL
from common import (ROOT, PLATE_DIR, grade_plate, font, SERIF_BLACK, SERIF_ITALIC,
                    SERIF_ITALIC_500, SANS_SEMI, SANS_BOLD, make_text_layer,
                    make_paragraph, tracked_width, draw_tracked, composite_text,
                    add_grain)

TW, TH = 1280, 720


def cover(img, tw, th):
    w, h = img.size
    want = tw / th
    if w / h > want:
        nw = int(h * want)
        img = img.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    elif w / h < want:
        nh = int(w / want)
        img = img.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    return img.resize((tw, th), Image.LANCZOS)


def text_layer(text, fnt, fill, tracking=0.0, pad=40):
    w = tracked_width(text, fnt, tracking)
    asc, desc = fnt.getmetrics()
    img = Image.new("RGBA", (int(w + pad * 2), asc + desc + pad * 2), (0, 0, 0, 0))
    draw_tracked(ImageDraw.Draw(img), (pad, pad + asc), text, fnt, fill, tracking)
    return img, pad, asc


def build(src="01_window.png", out="thumbnail.png"):
    master = grade_plate(os.path.join(PLATE_DIR, src), 2600)
    # push in on the face: hero framing
    mw, mh = master.size
    cw = mw / 1.12
    box = (mw - cw, 0, mw, cw * 9 / 16)
    base = master.resize((TW, TH), Image.LANCZOS, box=box).convert("RGBA")

    # deepen contrast for small-size readability
    arr = np.asarray(base.convert("RGB")).astype(np.float32) / 255.0
    arr = np.clip((arr - 0.5) * 1.12 + 0.5, 0, 1) ** 1.02
    base = Image.fromarray((arr * 255).astype(np.uint8)).convert("RGBA")

    # left scrim, heavier than in-film
    x = np.linspace(0, 1, TW, dtype=np.float32)[None, :].repeat(TH, axis=0)
    g = (np.clip(1 - x / 0.72, 0, 1) ** 1.35) * 0.94
    scrim = Image.new("RGBA", (TW, TH), (3, 9, 11, 0))
    scrim.putalpha(Image.fromarray((g * 255).astype(np.uint8)))
    base.alpha_composite(scrim)

    # bottom falloff
    y = np.linspace(0, 1, TH, dtype=np.float32)[:, None].repeat(TW, axis=1)
    bot = np.clip((y - 0.62) / 0.38, 0, 1) ** 1.5 * 0.55
    bg = Image.new("RGBA", (TW, TH), (3, 9, 11, 0))
    bg.putalpha(Image.fromarray((bot * 255).astype(np.uint8)))
    base.alpha_composite(bg)

    # warm bloom around her face to lift it off the wall
    glow = Image.new("RGBA", (TW, TH), (255, 196, 140, 0))
    ga = Image.new("L", (TW, TH), 0)
    ImageDraw.Draw(ga).ellipse([730, 40, 1290, 560], fill=46)
    ga = ga.filter(ImageFilter.GaussianBlur(140))
    glow.putalpha(ga)
    base.alpha_composite(glow)

    L = 66
    # gold rule above the eyebrow
    d = ImageDraw.Draw(base)
    d.rectangle([L, 74, L + 64, 77], fill=COL["amber"] + (255,))

    # eyebrow
    eb = text_layer("A CAREGIVER'S FIELD GUIDE", font(SANS_BOLD, 20), COL["amber"], 6.5)
    composite_text(base, eb[0], L - 40, 118 - eb[2], 0.98, shadow=False)

    # headline, three stacked lines: cream / amber / italic
    l1 = text_layer("10 BEST", font(SERIF_BLACK, 138), COL["cream"], 1.0)
    composite_text(base, l1[0], L - 44, 276 - l1[2], 1.0)

    l2 = text_layer("TIPS", font(SERIF_BLACK, 138), COL["amber_hi"], 4.0)
    composite_text(base, l2[0], L - 44, 408 - l2[2], 1.0)

    # subtitle
    sub = text_layer("TO DEAL WITH ALZHEIMER'S", font(SERIF_ITALIC, 47), COL["cream"], 0.5)
    composite_text(base, sub[0], L - 40, 478, 1.0)

    # footer hook
    hook = text_layer("Small changes. Real relief.", font(SANS_SEMI, 24), COL["muted"], 0.4)
    composite_text(base, hook[0], L - 40, 552, 0.9, shadow=False)

    # bottom-left film mark
    fr = text_layer("10-PART CAREGIVER GUIDE", font(SANS_BOLD, 15), COL["cream"], 4.2)
    composite_text(base, fr[0], L - 40, 660 - fr[2], 0.5, shadow=False)

    rng = np.random.default_rng(3)
    g = rng.normal(0, 1, (TH, TW)).astype(np.float32)
    g = np.asarray(Image.fromarray(np.clip(g * 40 + 128, 0, 255).astype(np.uint8))
                   .filter(ImageFilter.GaussianBlur(0.5)), dtype=np.float32)
    arr = np.asarray(base.convert("RGB"), dtype=np.float32) + ((g - 128) / 40.0)[..., None] * 3.2
    base = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    out_path = os.path.join(ROOT, "out", out)
    base.save(out_path, quality=95)
    print("wrote", out_path, base.size)


if __name__ == "__main__":
    os.makedirs(os.path.join(ROOT, "out"), exist_ok=True)
    build()
