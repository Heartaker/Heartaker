"""Generates an SRT caption track locked to the film timeline."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from timeline import (TIP_START, TIP_STEP, INTRO_LEN, OUTRO_START,
                      INTRO_LINES, TIPS, OUTRO_LINES, OUTRO_TAG, OUTRO_DISC)


def ts(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build():
    cues = []
    cues.append((1.0, 4.9, INTRO_LINES[0]))
    cues.append((5.1, 8.4, INTRO_LINES[1]))
    cues.append((8.6, 13.9, "10 best tips to deal with Alzheimer's."))
    for i, tip in enumerate(TIPS):
        start = TIP_START + TIP_STEP * i + 0.7
        title = " ".join(tip["title"].split())
        body = " ".join(tip["body"].split())
        cues.append((start, start + 4.0, f"Tip {i + 1:02d} — {title}"))
        cues.append((start + 4.0, start + 8.2, body))
    for k, (off, line) in enumerate(OUTRO_LINES):
        cues.append((OUTRO_START + off, OUTRO_START + off + 1.9, line))
    cues.append((OUTRO_START + 11.2, OUTRO_START + 15.6, OUTRO_TAG))
    cues.append((OUTRO_START + 13.4, OUTRO_START + 16.6, OUTRO_DISC))

    lines = []
    for n, (a, b, text) in enumerate(cues, 1):
        lines += [str(n), f"{ts(a)} --> {ts(b)}", text, ""]
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "out", "alzheimers_10_tips.srt")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("wrote", out, f"({len(cues)} cues)")


if __name__ == "__main__":
    build()
