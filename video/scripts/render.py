"""Frame renderer for '10 Best Tips to Deal with Alzheimer's'."""
import os
import sys
import math
import subprocess
import multiprocessing as mp

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from timeline import (FPS, W, H, COL, XFADE, INTRO_LEN, TIP_START, TIP_STEP,
                      TIP_LEN, NUM_TIPS, OUTRO_START, OUTRO_LEN, TOTAL,
                      INTRO_LINES, INTRO_EYEBROW, INTRO_TITLE_A, INTRO_TITLE_B,
                      INTRO_SUB, TIPS, OUTRO_LINES, OUTRO_CTA_H, OUTRO_DISC,
                      OUTRO_TAG, tip_start)
from common import (font, SERIF_BLACK, SERIF_BOLD, SERIF, SERIF_ITALIC, SANS, SANS_MED,
                    SANS_SEMI, SANS_BOLD, SANS_BLACK, tracked_width,
                    draw_tracked, make_text_layer, make_paragraph, fit_size,
                    composite_text, rounded_rect_layer, heart_layer,
                    grade_plate, ken_burns, make_scrim, add_grain,
                    add_light_leak, Motes, Atmosphere, corner_brackets,
                    add_vignette, ease_out_cubic, ease_out_quint, ease_in_out,
                    ease_out_expo, clamp, PLATE_DIR, soft_shadow)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "out")
BLACK = (0, 0, 0)

_CACHE = {}


def cache(key, fn):
    if key not in _CACHE:
        _CACHE[key] = fn()
    return _CACHE[key]


# ------------------------------------------------------------------ helpers
def paste_center(base, layer, cx, baseline, alpha, shadow=True):
    """layer from make_text_layer: text baseline sits at pad+ascent."""
    img, pad, asc = layer
    x = cx - (img.width - 2 * pad) / 2 - pad
    y = baseline - asc - pad
    composite_text(base, img, x, y, alpha, shadow=shadow)


def paste_left(base, layer, x, baseline, alpha, shadow=True):
    img, pad, asc = layer
    composite_text(base, img, x - pad, baseline - asc - pad, alpha, shadow=shadow)


def paste_right(base, layer, x_right, baseline, alpha, shadow=True):
    img, pad, asc = layer
    w = img.width - 2 * pad
    composite_text(base, img, x_right - w - pad, baseline - asc - pad, alpha, shadow=shadow)


def text_with_asc(text, fnt, fill, tracking=0.0):
    img, pad = make_text_layer(text, fnt, fill, tracking)
    asc, _ = fnt.getmetrics()
    return img, pad, asc


def amber_rule(width, height=3, color=COL["amber"]):
    img = Image.new("RGBA", (int(width), height), color + (255,))
    return img


def draw_rule(base, x, y, target_w, progress, alpha=1.0, color=COL["amber"], height=3):
    if progress <= 0 or alpha <= 0:
        return
    w = max(1, int(target_w * progress))
    layer = Image.new("RGBA", (w, height), color + (int(255 * alpha),))
    base.alpha_composite(layer, (int(x), int(y)))


def progress_strip(base, i, alpha):
    """10-segment progress indicator."""
    if alpha <= 0.004:
        return
    seg_w, gap, hgt = 44, 9, 3
    total_w = seg_w * NUM_TIPS + gap * (NUM_TIPS - 1)
    x0 = (W - total_w) // 2
    y = H - 62
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for k in range(NUM_TIPS):
        x = x0 + k * (seg_w + gap)
        if k < i:
            c = COL["amber"] + (int(190 * alpha),)
        elif k == i:
            c = COL["cream"] + (int(235 * alpha),)
        else:
            c = (255, 255, 255, int(52 * alpha))
        d.rounded_rectangle([x, y, x + seg_w, y + hgt], radius=hgt // 2, fill=c)
    base.alpha_composite(layer)


# ------------------------------------------------------------------ intro
def intro_frame(t):
    atm = cache("atm_intro", lambda: Atmosphere(seed=11))
    global_motes = cache("motes_intro", lambda: Motes(16, seed=9))

    img = atm.frame(t * 0.55, intensity=1.0)
    global_motes.draw(img, t * 0.6)

    fade_from_black = ease_out_cubic(clamp(t / 1.1))
    title_in = ease_out_quint(clamp((t - 9.9) / 1.2))
    title_out = 1 - clamp((t - (INTRO_LEN - 0.9)) / 0.9)

    # ---- opening lines
    if 0.7 < t < 9.9:
        # line 1
        a1 = clamp((t - 0.9) / 0.9) * clamp((5.1 - t) / 0.7)
        l1 = cache("i_l1", lambda: text_with_asc(INTRO_LINES[0], font(SERIF_ITALIC, 74), COL["cream"], 0.5))
        paste_center(img, l1, W / 2, 520 + (1 - ease_out_cubic(clamp((t - 0.9) / 1.4))) * 16, a1 * fade_from_black)

        # line 2
        a2 = clamp((t - 5.0) / 0.8) * clamp((8.6 - t) / 0.7)
        l2 = cache("i_l2", lambda: text_with_asc(INTRO_LINES[1], font(SERIF_ITALIC, 74), COL["amber_hi"], 0.5))
        paste_center(img, l2, W / 2, 520 + (1 - ease_out_cubic(clamp((t - 5.0) / 1.3))) * 16, a2)

        # line 3
        a3 = clamp((t - 7.0) / 0.8) * clamp((9.9 - t) / 0.6)
        l3 = cache("i_l3", lambda: text_with_asc("And that changes everything.", font(SERIF_ITALIC, 44), COL["muted"], 0.3))
        paste_center(img, l3, W / 2, 612, a3)

    # ---- title card
    if title_in > 0 and title_out > 0:
        a = title_in * title_out
        push = (1 - title_in) * 18

        # brand mark above the eyebrow
        hb = cache("i_heart", lambda: _heart_bloom())
        hs = 62
        pulse = 1 + 0.05 * math.sin(t * 2 * math.pi * 0.55)
        gsz = int(hs * 2.4 * pulse)
        hcy = 254 + push
        img.alpha_composite(_scale_alpha(hb.resize((gsz, gsz), Image.LANCZOS), 0.5 * a),
                            ((W - gsz) // 2, int(hcy - gsz / 2)))
        heart = cache("i_heart_solid", lambda: heart_layer(hs, COL["amber"]))
        img.alpha_composite(_scale_alpha(heart, a), ((W - hs) // 2, int(hcy - hs / 2)))

        eb = cache("i_eb", lambda: text_with_asc(INTRO_EYEBROW, font(SANS_SEMI, 21), COL["amber"], 8.5))
        paste_center(img, eb, W / 2, 350 + push, a * 0.95, shadow=False)

        t1 = cache("i_t1", lambda: text_with_asc(INTRO_TITLE_A, font(SERIF_BLACK, 132), COL["cream"], 1.5))
        paste_center(img, t1, W / 2, 492 + push, a)

        t2 = cache("i_t2", lambda: text_with_asc(INTRO_TITLE_B, font(SERIF_ITALIC, 78), COL["amber_hi"], 0.4))
        paste_center(img, t2, W / 2, 600 + push, a)

        draw_rule(img, W / 2 - 130, 648 + push, 260, ease_out_quint(clamp((t - 10.6) / 1.1)), alpha=0.85)

        sub = cache("i_sub", lambda: text_with_asc(INTRO_SUB, font(SANS, 26), COL["muted"], 0.6))
        a4 = clamp((t - 11.4) / 1.0) * title_out
        paste_center(img, sub, W / 2, 716 + push, a4 * 0.95, shadow=False)

    corner_brackets(img, alpha=0.5 * clamp((t - 0.4) / 1.5) * (1 - clamp((t - 14.0) / 1.0)))

    # light leak sweeps
    leak = 0.0
    if 3.4 < t < 6.0:
        leak = math.sin(clamp((t - 3.4) / 2.6) * math.pi) * 0.22
    if 12.2 < t < 14.6:
        leak = max(leak, math.sin(clamp((t - 12.2) / 2.4) * math.pi) * 0.18)
    img = add_light_leak(img.convert("RGB"), leak, pos=(0.12, 0.25)).convert("RGBA")

    frame = finish(img, int(t * FPS), vign=0.9)
    if fade_from_black < 1:
        frame = Image.blend(Image.new("RGB", (W, H), BLACK), frame, fade_from_black)
    return frame


# ------------------------------------------------------------------ tip scenes
TIP_MOTION = [
    (1.055, 1.155, 0.56, 0.62),
    (1.15, 1.05, 0.60, 0.55),
    (1.05, 1.16, 0.62, 0.56),
    (1.14, 1.045, 0.60, 0.66),
    (1.06, 1.16, 0.42, 0.37),
    (1.15, 1.055, 0.46, 0.41),
    (1.05, 1.15, 0.40, 0.46),
    (1.14, 1.05, 0.40, 0.47),
    (1.06, 1.15, 0.55, 0.60),
    (1.15, 1.06, 0.66, 0.60),
]


def tip_frame(i, u):
    tip = TIPS[i]
    plate = os.path.join(PLATE_DIR, tip["plate"])
    master = cache(f"plate_{i}", lambda: grade_plate(plate, 2400))
    z0, z1, p0, p1 = TIP_MOTION[i]

    img = ken_burns(master, u / TIP_LEN, z0, z1, (p0, 0.5), (p1, 0.5)).convert("RGBA")

    left = tip["side"] == "left"
    scrim = cache("scrim_l" if left else "scrim_r", lambda: make_scrim("left" if left else "right", 0.88))
    img.alpha_composite(scrim)

    x_text = 152 if left else W - 152

    # warm radial lift behind the type column (shapeless on purpose)
    glow = cache(f"glow_{i}", lambda: _text_glow(left))
    img.alpha_composite(glow)

    # giant numeral cropped by the bottom edge, like an editorial folio
    ga = 0.15 * clamp((u - 0.15) / 1.3)
    if ga > 0.004:
        drift = math.sin(u * 0.16) * 5
        gnum, gpad, gasc = cache(f"gnum_{i}", lambda: text_with_asc(
            f"{i + 1:02d}", font(SERIF_BLACK, 360), COL["cream"], -6))
        gl = _scale_alpha(gnum, ga)
        gx = W - 64 - (gnum.width - 2 * gpad) if left else 64
        composite_text(img, gl, gx, 1290 - gasc + drift, 1.0, shadow=False)

    # chip
    ca = clamp((u - 0.2) / 0.7)
    chip_l1 = cache(f"chip_{i}", lambda: text_with_asc(f"TIP {i + 1:02d}", font(SANS_BOLD, 19),
                                                      COL["amber"], 6.0))
    cy = 292 + (1 - ease_out_cubic(clamp((u - 0.2) / 0.9))) * 10
    if left:
        paste_left(img, chip_l1, x_text, cy, ca)
        draw_rule(img, x_text, cy - 44, 56, ease_out_quint(clamp((u - 0.15) / 0.9)), alpha=ca)
    else:
        paste_right(img, chip_l1, x_text, cy, ca)
        draw_rule(img, x_text - 56, cy - 44, 56, ease_out_quint(clamp((u - 0.15) / 0.9)), alpha=ca)

    # title (line by line)
    lines = tip["title"].split("\n")
    for k, line in enumerate(lines):
        fnt = fit_size(line, SERIF_BOLD if False else "playfair-display-latin-700-normal.ttf", 92, 780)
        lay = cache(f"ttl_{i}_{k}", lambda: text_with_asc(line, fnt, COL["cream"], 0.5))
        appear = clamp((u - 0.42 - k * 0.16) / 0.85)
        ea = ease_out_cubic(appear)
        base_y = 412 + k * 106
        yoff = (1 - ease_out_quint(appear)) * 26
        a = ea
        if left:
            paste_left(img, lay, x_text, base_y + yoff, a)
        else:
            paste_right(img, lay, x_text, base_y + yoff, a)

    # divider
    div_p = ease_out_quint(clamp((u - 0.85) / 1.0))
    div_y = 412 + len(lines) * 106 + 8
    if left:
        draw_rule(img, x_text, div_y, 86, div_p, alpha=0.9)
    else:
        draw_rule(img, x_text - 86, div_y, 86, div_p, alpha=0.9)

    # body
    body_font = font(SANS, 30)
    body = cache(f"body_{i}", lambda: make_paragraph(tip["body"], body_font, (216, 212, 200), 700, 0.2, 1.60))
    bimg, bpad, blh = body
    ba = clamp((u - 1.15) / 1.1)
    if ba > 0:
        by = div_y + 34 + (1 - ease_out_cubic(ba)) * 18
        bx = x_text - bpad if left else (x_text - (bimg.width - 2 * bpad) - bpad)
        composite_text(img, bimg, bx, by, ba * 0.96, shadow=False)

    # bottom falloff keeps the progress strip legible on bright plates
    img.alpha_composite(cache("bottom_grad", _bottom_grad))

    progress_strip(img, i, clamp((u - 0.7) / 0.8) * 0.9)

    # occasional light leak
    leak = 0.0
    lt = 2.2 + (i * 1.7) % 4.2
    if lt < u < lt + 2.4:
        leak = math.sin(clamp((u - lt) / 2.4) * math.pi) * 0.13
    frame = add_light_leak(img.convert("RGB"), leak)
    return finish(frame.convert("RGBA"), int((tip_start(i) + u) * FPS), vign=1.0)


def _scale_alpha(layer, a):
    out = layer.copy()
    out.putalpha(layer.getchannel("A").point(lambda v: int(v * a)))
    return out


def _heart_bloom():
    h = heart_layer(240, COL["amber"])
    pad = 90
    big = Image.new("L", (240 + pad * 2, 240 + pad * 2), 0)
    big.paste(h.getchannel("A"), (pad, pad))
    big = big.filter(ImageFilter.GaussianBlur(30))
    out = Image.new("RGBA", big.size, COL["amber_hi"] + (0,))
    out.putalpha(big)
    return out


def _text_glow(left):
    """A soft elliptical warm lift, no visible edges."""
    sw, sh = 320, 180
    yy, xx = np.mgrid[0:sh, 0:sw].astype(np.float32)
    cx = 0.42 if left else 0.58
    d = np.sqrt(((xx / sw - cx) * 1.0) ** 2 + ((yy / sh - 0.52) * 1.15) ** 2)
    g = np.clip(1 - d / 0.55, 0, 1) ** 2.2
    a = Image.fromarray((g * 30).astype(np.uint8)).resize((W, H), Image.BICUBIC)
    layer = Image.new("RGBA", (W, H), (255, 206, 156, 0))
    layer.putalpha(a)
    return layer


def _bottom_grad():
    h = 200
    ramp = (np.linspace(0, 1, h, dtype=np.float32) ** 2.0 * 115).astype(np.uint8)
    a = np.zeros((H, W), np.uint8)
    a[H - h:, :] = ramp[:, None]
    layer = Image.new("RGBA", (W, H), (2, 8, 10, 0))
    layer.putalpha(Image.fromarray(a))
    return layer


# ------------------------------------------------------------------ outro
def outro_frame(t):
    atm = cache("atm_outro", lambda: Atmosphere(seed=23))
    motes = cache("motes_outro", lambda: Motes(20, seed=31))

    img = atm.frame(t * 0.4 + 40, intensity=0.95)
    motes.draw(img, t * 0.5 + 10)

    # ---- poem stack
    poem_out = 1 - clamp((t - 9.3) / 0.9)
    if poem_out > 0:
        alphas = []
        for k, (at, _) in enumerate(OUTRO_LINES):
            a = clamp((t - at) / 0.7) * poem_out
            nxt = OUTRO_LINES[k + 1][0] if k + 1 < len(OUTRO_LINES) else None
            if nxt is not None:
                a *= 1 - 0.55 * clamp((t - nxt) / 0.8)
            alphas.append(a)
        for k, (at, text) in enumerate(OUTRO_LINES):
            a = alphas[k]
            if a <= 0.01:
                continue
            fnt = font(SERIF_ITALIC, 66 if k < 3 else 76)
            col = COL["cream"] if k < 3 else COL["amber_hi"]
            lay = cache(f"o_line_{k}", lambda: text_with_asc(text, fnt, col, 0.4))
            yoff = (1 - ease_out_quint(clamp((t - at) / 0.9))) * 18
            paste_center(img, lay, W / 2, 432 + k * 92 + yoff, a)

    # ---- CTA
    cta_in = clamp((t - OUTRO_CTA_H) / 1.0)
    if cta_in > 0:
        ec = ease_out_cubic(cta_in)
        # heart
        pulse = 1 + 0.07 * math.sin((t - OUTRO_CTA_H) * 2 * math.pi * 0.62)
        hsize = int(78 * pulse)
        heart = cache("heart", lambda: heart_layer(240, COL["amber"]))
        if hsize != heart.size[0]:
            heart = heart.resize((hsize, hsize), Image.LANCZOS)
        ha = ec
        # soft bloom from the same silhouette (no duplicate heart ghost)
        glow = cache("heart_glow", lambda: _heart_bloom())
        gsz = int(hsize * 2.1)
        gl = _scale_alpha(glow.resize((gsz, gsz), Image.LANCZOS), 0.42 * ha)
        img.alpha_composite(gl, ((W - gsz) // 2, 248 + hsize // 2 - gsz // 2))
        hl = heart if ha >= 0.999 else _scale_alpha(heart, ha)
        img.alpha_composite(hl, ((W - hsize) // 2, 248))

        head = cache("o_head", lambda: text_with_asc(OUTRO_TAG, font(SERIF_ITALIC, 64), COL["cream"], 0.3))
        paste_center(img, head, W / 2, 470 + (1 - ec) * 18, ec)

        sub1 = cache("o_sub1", lambda: text_with_asc("If this helped, pass it on \u2014 it costs nothing.",
                                                     font(SANS, 27), COL["muted"], 0.4))
        a2 = clamp((t - OUTRO_CTA_H - 0.8) / 0.9)
        paste_center(img, sub1, W / 2, 546, a2 * 0.95, shadow=False)

        draw_rule(img, W / 2 - 90, 592, 180, ease_out_quint(clamp((t - OUTRO_CTA_H - 1.0) / 1.0)), alpha=0.7)

        line3 = cache("o_line3", lambda: text_with_asc("NEW CAREGIVER GUIDES EVERY WEEK",
                                                       font(SANS_SEMI, 19), COL["amber"], 6.0))
        a3 = clamp((t - OUTRO_CTA_H - 1.5) / 0.9)
        paste_center(img, line3, W / 2, 652, a3 * 0.95, shadow=False)

        brand = cache("o_brand", lambda: text_with_asc("HEARTAKER", font(SANS_BOLD, 16), COL["muted"], 7.0))
        a4 = clamp((t - OUTRO_CTA_H - 2.2) / 0.9)
        paste_center(img, brand, W / 2, 726, a4 * 0.55, shadow=False)

    disc = cache("o_disc", lambda: text_with_asc(OUTRO_DISC, font(SANS, 20), COL["muted"], 0.3))
    da = clamp((t - 13.0) / 1.0) * 0.62
    paste_center(img, disc, W / 2, H - 74, da, shadow=False)

    corner_brackets(img, alpha=0.35 * clamp((t - 0.2) / 1.4) * (1 - clamp((t - 16.4) / 1.0)))

    leak = 0.0
    if 2.0 < t < 5.2:
        leak = math.sin(clamp((t - 2.0) / 3.2) * math.pi) * 0.16
    img = add_light_leak(img.convert("RGB"), leak, pos=(0.7, 0.2)).convert("RGBA")

    frame = finish(img, int((OUTRO_START + t) * FPS), vign=0.95)
    out = 1 - clamp((t - (OUTRO_LEN - 1.6)) / 1.5)
    if out < 1:
        frame = Image.blend(Image.new("RGB", (W, H), BLACK), frame, ease_in_out(out))
    return frame


# ------------------------------------------------------------------ finish
def finish(img, frame_idx, vign=1.0):
    frame = add_vignette(img)
    frame = add_grain(frame.convert("RGB"), frame_idx, strength=4.6)
    return frame


# ------------------------------------------------------------------ segment map
def segments():
    segs = [dict(kind="intro", start=0.0, end=INTRO_LEN)]
    for i in range(NUM_TIPS):
        s = tip_start(i)
        segs.append(dict(kind="tip", idx=i, start=s, end=s + TIP_LEN))
    segs.append(dict(kind="outro", start=OUTRO_START, end=OUTRO_START + OUTRO_LEN))
    return segs


SEGS = segments()


def render_seg(seg, t):
    if seg["kind"] == "intro":
        return intro_frame(t - seg["start"] + (t - seg["start"]) * 0)  # local t
    if seg["kind"] == "tip":
        return tip_frame(seg["idx"], t - seg["start"])
    return outro_frame(t - seg["start"])


def frame_at(t):
    active = [s for s in SEGS if s["start"] <= t < s["end"]]
    if not active:
        return Image.new("RGB", (W, H), BLACK)
    if len(active) == 1:
        return render_seg(active[0], t)
    a, b = active[0], active[1]
    fa = render_seg(a, t).convert("RGB")
    fb = render_seg(b, t).convert("RGB")
    d = clamp((t - b["start"]) / XFADE)
    w = ease_in_out(d)
    frame = Image.blend(fa, fb, w)
    # film-burn dissolve: warm bloom peaks at the midpoint and hides the overlap
    flash = math.sin(d * math.pi) ** 1.5
    pos = (0.3 + 0.4 * ((int(b["start"]) % 7) / 6), 0.28)
    frame = add_light_leak(frame, flash * 0.30, color=(255, 198, 150), pos=pos, radius=1.05)
    return frame


def work(fi):
    t = fi / FPS
    return fi, np.asarray(frame_at(t), dtype=np.uint8).tobytes()


def main():
    os.makedirs(OUT, exist_ok=True)
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    end = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    total_frames = int(round(TOTAL * FPS))
    if end <= 0:
        end = total_frames
    out_path = os.path.join(OUT, "film_silent.mp4")
    ffmpeg = os.environ.get("FFMPEG") or __import__("imageio_ffmpeg").get_ffmpeg_exe()
    cmd = [ffmpeg, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264", "-preset", "medium",
           "-crf", "18", "-pix_fmt", "yuv420p", "-profile:v", "high", "-tune", "film",
           "-movflags", "+faststart", out_path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ctx = mp.get_context("fork")
    frames = range(start, end)
    with ctx.Pool(2) as pool:
        import time
        t0 = time.time()
        for n, (fi, data) in enumerate(pool.imap(work, frames, chunksize=3)):
            proc.stdin.write(data)
            if n % 120 == 0:
                el = time.time() - t0
                done = fi - start + 1
                rate = done / max(el, 1e-6)
                print(f"frame {fi}/{end}  {rate:.1f} fps  eta {(end - fi) / max(rate, 1e-6):.0f}s", flush=True)
    proc.stdin.close()
    proc.wait()
    print("done ->", out_path)


if __name__ == "__main__":
    main()
