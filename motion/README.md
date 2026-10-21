# Key & Lock — 10s motion

Procedural motion build from a single AI-generated still (`motion/source_still.png`),
rendered to `key_lock_motion.mp4` (1920×1080, 30 fps, 10.0 s, H.264).

## Prompt it was built from

> Macro shot of an old antique key trying to turn inside a jammed rusty lock, dramatic side
> lighting, shallow depth of field, subtle particles in air, photorealistic 8K, cinematic dolly in.

## Files

| file | what it is |
| --- | --- |
| `source_still.png` | the generated keyframe the whole shot is built from |
| `make_assets.py` | GrabCut + guided-filter matte of the key (`key_rgba.png`) and a clean background plate with the key removed (`plate.png`, row-interpolated fill, defocused) |
| `render.py` | frame renderer: camera, key rotation, particles, light, grade |
| `preview/` | sample stills written by `--preview` (git-ignored) |

## Shot design

| time | beat |
| --- | --- |
| 0.0–0.7 s | static macro hold, dust drifting through the beam |
| 0.7–2.9 s | key starts to turn, strain builds, metal trembles, bow twists ~5° |
| **2.85 s** | **jam 1** — the bit catches, hard jolt, rust flecks burst from the keyhole |
| 3.0–3.5 s | recoil: spring back, settle |
| 3.5–6.5 s | second, harder attempt; slow continuous dolly-in keeps closing on the lock |
| **6.52 s** | **jam 2 (strongest)** — biggest jolt, largest fleck burst |
| 6.8–7.4 s | recoil and hold, breathing light |
| 7.4–9.6 s | final attempt, torque peaking as the dolly ends tight on the key/lock junction |
| **9.62 s** | **jam 3**, smaller — then the shot holds the tension through the last frames |

## Technique

- **Dolly in**: 1.0 → 1.205 scale over the 10 s on an eased curve, pushed toward the
  key/lock junction; background uses 0.74× the camera amount for parallax (the plate
  lags, so the key feels physically closer).
- **Turning key**: the bow rotates around the lock axis; a horizontal weight map ramps the
  rotation to zero over the shaft so the tip stays pinned in the jammed lock (a rigid
  warp of the matte, not a slide). Strain tremble is multi-sine and amplitude-gated by a
  press envelope; the recoil is a fast eased spring-back after each jam.
- **Particles**: two dust layers at different parallax depths (far layer sits behind the
  key inside the plate, near layer is in front of the lens as bokeh), plus short-lived rust
  flecks with gravity, emitted from the keyhole at each jam.
- **Light**: a travelling specular sweep across the brass, a specular kick on the metal that
  rises with torque, and a slowly breathing warm beam from the upper left.
- **Finish**: bloom/halation on highlights, radial chromatic aberration, filmic (ACES-style)
  curve, warm-highlight/cool-shadow split tone, vignette, per-frame film grain and a touch of
  gate weave.

## Re-render

```bash
python motion/make_assets.py                       # rebuild matte + plate
python motion/render.py --preview 0,5,9.9          # stills -> motion/preview/
python motion/render.py --video key_lock_motion.mp4
```

Requires `numpy`, `opencv-python-headless`, `imageio-ffmpeg`.
