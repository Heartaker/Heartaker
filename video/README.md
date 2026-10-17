# “10 Best Tips to Deal with Alzheimer’s” — cinematic short

A 2:04 film at 1920×1080 / 30 fps: cold open, ten tip chapters, an emotional
end card and a share CTA — with an original score.

## Deliverables (`video/out/`)

| File | What it is | Size |
|---|---|---|
| `alzheimers_10_tips.mp4` | Final film — 1920×1080, 30 fps, H.264 + AAC, 2:04 | 38 MB |
| `alzheimers_10_tips.srt` | Caption track, timed to the picture (upload with the video) | 3 KB |
| `thumbnail.png` | 1280×720 click-optimised thumbnail | 1.4 MB |
| `poster.png` | 1920×1080 hero still (embed / newsletter / community post) | 2.4 MB |
| `score.mp3` | The original score on its own (royalty-free, yours) | 3 MB |
| `contact_sheet.png` | One-glance board of all 12 shots | 1.8 MB |

Read the film in this order: **thumbnail → poster → mp4**.

## Structure

| Time | Beat |
|---|---|
| 0:00 – 0:15 | Cold open — *“Some memories fade. The person doesn’t.”* → title card |
| 0:14 – 1:46 | Ten tips, each with a cinematic plate, kinetic type and a progress strip |
| 1:46 – 2:04 | Poem end card (*care / patience / love*) → share CTA → disclaimer |

The ten tips:

1. Keep a calm, familiar routine
2. Make home safe and simple
3. Speak with warmth, not correction
4. Let music bring them back
5. Move a little, every day
6. Simplify the choices
7. Guard the meals and the water
8. Plan early — together
9. Build a care team, then use it
10. Be patient with yourself

## Music & rights

`video/audio/score.wav` (and `out/score.mp3`) is **composed and synthesized
from scratch** by `scripts/audio.py` — additive pads, plucks, bells, noise
swells, then a synthetic hall reverb. No samples, no library tracks, no
attribution required. You own it outright and can use it on monetised
platforms without a copyright claim.

## Look

Teal-and-amber film grade, halation bloom, vignette, 35 mm grain, drifting
light leaks, film-burn dissolves, Ken Burns camera moves, light dust motes,
and editorial serif typography (Playfair Display / Inter, both SIL Open Font
License).

## Re-rendering

```bash
python -m venv ../.venv && ../.venv/bin/pip install numpy pillow scipy imageio-ffmpeg fonttools
cd scripts
../.venv/bin/python audio.py      # score  -> ../audio/score.wav       (~3 s)
../.venv/bin/python captions.py   # captions -> ../out/*.srt
../.venv/bin/python render.py     # frames -> ../out/film_silent.mp4  (~8 min, 2 cores)
CRF=25 ../.venv/bin/python post.py mux      # final mp4 with score
../.venv/bin/python post.py poster          # hero still
../.venv/bin/python post.py sheet           # contact sheet
../.venv/bin/python thumbnail.py            # -> ../out/thumbnail.png
```

Copy lives in `scripts/timeline.py`; grade, type and lens effects in
`scripts/common.py`; per-scene animation in `scripts/render.py`.

## Note

The film ends with a plain-language disclaimer: it is educational, not
medical advice.
