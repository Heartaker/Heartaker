"""Final assembly: mux score, normalise loudness, export poster + contact sheet."""
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image, ImageDraw
from timeline import TIP_START, TIP_STEP, NUM_TIPS
from common import ROOT, FONT_DIR

FF = os.environ.get("FFMPEG") or __import__("imageio_ffmpeg").get_ffmpeg_exe()
OUT = os.path.join(ROOT, "out")
SILENT = os.path.join(OUT, "film_silent.mp4")
SCORE = os.path.join(ROOT, "audio", "score.wav")
FINAL = os.path.join(OUT, "alzheimers_10_tips.mp4")


def run(cmd):
    print(" ".join(cmd))
    subprocess.run(cmd, check=True)


def mux(crf=19):
    """Re-encode the master once at a delivery bitrate, muxing the score."""
    run([FF, "-y", "-i", SILENT, "-i", SCORE,
         "-map", "0:v:0", "-map", "1:a:0",
         "-c:v", "libx264", "-preset", "slow", "-crf", str(crf),
         "-pix_fmt", "yuv420p", "-profile:v", "high", "-tune", "film",
         "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
         "-shortest", "-movflags", "+faststart", FINAL])
    run([FF, "-i", FINAL, "-f", "null", "-"])


def grab(t, path):
    run([FF, "-y", "-ss", f"{t:.2f}", "-i", FINAL, "-frames:v", "1",
         "-q:v", "2", path])


def poster():
    grab(99.0, os.path.join(OUT, "poster.png"))


def contact_sheet():
    times = [6.5, 12.5] + [TIP_START + TIP_STEP * i + 6.2 for i in range(NUM_TIPS)]
    labels = ["Cold open", "Title card"] + [f"Tip {i + 1:02d}" for i in range(NUM_TIPS)]
    tiles = []
    tmp = os.path.join(OUT, "_tile.jpg")
    for t, lab in zip(times, labels):
        grab(t, tmp)
        im = Image.open(tmp).convert("RGB").resize((480, 270), Image.LANCZOS)
        d = ImageDraw.Draw(im)
        d.rectangle([0, 240, 480, 270], fill=(4, 10, 12))
        d.text((12, 248), lab.upper(), fill=(232, 179, 122))
        tiles.append(im)
    cols, rows = 3, 4
    pad = 14
    sheet = Image.new("RGB", (cols * 480 + pad * (cols + 1),
                              rows * 270 + pad * (rows + 1)), (3, 8, 10))
    for k, im in enumerate(tiles):
        r, c = divmod(k, cols)
        sheet.paste(im, (pad + c * (480 + pad), pad + r * (270 + pad)))
    path = os.path.join(OUT, "contact_sheet.png")
    sheet.save(path)
    os.remove(tmp)
    print("wrote", path)


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    crf = int(os.environ.get("CRF", "19"))
    if what in ("all", "mux"):
        mux(crf)
    if what in ("all", "poster"):
        poster()
    if what in ("all", "sheet"):
        contact_sheet()
