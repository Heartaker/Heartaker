"""Build animation assets from the generated keyframe.

Outputs (all 1376x768, same canvas as the source still):
  motion/key_rgba.png : soft matte of the antique key (bow + shaft)
  motion/plate.png    : background plate, key removed and plausibly reconstructed
"""
import os

import cv2
import numpy as np

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "source_still.png")
OUT_KEY = "/home/user/Heartaker/motion/key_rgba.png"
OUT_PLATE = "/home/user/Heartaker/motion/plate.png"
OUT_DEBUG = "/home/user/Heartaker/motion/preview/matte_debug.png"

img = cv2.imread(SRC)
H, W = img.shape[:2]


# ------------------------------------------------------------------ trimap
seed = np.full((H, W), cv2.GC_BGD, np.uint8)
roi = (235, 165, 985, 605)
seed[roi[1]:roi[3], roi[0]:roi[2]] = cv2.GC_PR_BGD

polys_fg = [
    [(258, 400), (262, 330), (300, 262), (360, 208), (420, 182), (470, 196),
     (508, 236), (520, 300), (520, 350), (545, 372), (548, 404), (516, 428),
     (516, 470), (496, 540), (452, 578), (406, 588), (352, 566), (300, 520),
     (272, 462)],
    [(540, 340), (975, 348), (975, 404), (540, 404)],
]
for p in polys_fg:
    cv2.fillPoly(seed, [np.array(p, np.int32)], cv2.GC_FGD)
for p in [
    [(60, 60), (235, 60), (235, 700), (60, 700)],
    [(600, 300), (900, 300), (900, 340), (600, 340)],
    [(600, 410), (900, 410), (900, 470), (600, 470)],
]:
    cv2.fillPoly(seed, [np.array(p, np.int32)], cv2.GC_BGD)

bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
mask = seed.copy()
cv2.grabCut(img, mask, None, bgd, fgd, 8, cv2.GC_INIT_WITH_MASK)
alpha = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)

# keep the component that spans bow -> shaft
n, lab, stats, _ = cv2.connectedComponentsWithStats(alpha, 8)
best, best_area = -1, 0
for i in range(1, n):
    x, y, w, h, area = stats[i]
    if x < 560 and x + w > 900 and area > 8000 and area > best_area:
        best, best_area = i, area
if best > 0:
    alpha = np.where(lab == best, 255, 0).astype(np.uint8)

alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
alpha = cv2.morphologyEx(alpha, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
n, lab, stats, _ = cv2.connectedComponentsWithStats(alpha, 8)
keep = np.zeros_like(alpha)
for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] > 400:
        keep[lab == i] = 255
alpha = keep


# ------------------------------------------------- guided-filter refinement
def guided_filter(guide, src, r=4, eps=1e-4):
    g = guide.astype(np.float32) / 255.0
    p = src.astype(np.float32)
    k = (2 * r + 1, 2 * r + 1)
    mean_i = cv2.boxFilter(g, -1, k, normalize=True)
    mean_p = cv2.boxFilter(p, -1, k, normalize=True)
    cov_ip = cv2.boxFilter(g * p, -1, k, normalize=True) - mean_i * mean_p
    var_i = cv2.boxFilter(g * g, -1, k, normalize=True) - mean_i * mean_i
    a = cov_ip / (var_i + eps)
    b = mean_p - a * mean_i
    return cv2.boxFilter(a, -1, k, normalize=True) * g + cv2.boxFilter(b, -1, k, normalize=True)


p0 = (alpha > 127).astype(np.float32)
guide = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
soft = guided_filter(guide, p0, r=4, eps=6e-4)
soft = np.clip((soft - 0.16) / 0.78, 0, 1)          # trim the 1px bloat from grabCut
soft = cv2.GaussianBlur(soft, (0, 0), 0.8)

# shaft shading: the original has a soft shadow under the shaft that grabCut
# absorbed. fade alpha a touch along the outermost 2 rows of the shaft band.
yy = np.arange(H)[:, None] * np.ones((1, W))
soft = np.where(soft < 0.02, 0, soft)

# ------------------------------------------------------ background plate
m = (soft > 0.02).astype(np.uint8)
m = cv2.dilate(m, np.ones((9, 9), np.uint8))

plate = img.astype(np.float32).copy()
filled = img.astype(np.float32).copy()
for y in range(H):
    row = m[y]
    if not row.any():
        continue
    xs = np.where(row == 0)[0]
    if xs.size < 2:
        continue
    idx = np.where(row)[0]
    left = xs[xs < idx.min()]
    right = xs[xs > idx.max()]
    lx = left.max() if left.size else 0
    rx = right.min() if right.size else W - 1
    for c in range(3):
        filled[y, idx, c] = np.interp(idx, [lx, rx], [img[y, lx, c], img[y, rx, c]])

feather = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 3)[..., None]
plate = filled * feather + plate * (1 - feather)

# the reconstructed area sits behind the subject -> out of focus
blur = cv2.GaussianBlur(plate, (0, 0), 11)
plate = blur * feather + plate * (1 - feather)
# keep the untouched parts of the plate identical to source
plate = np.clip(plate, 0, 255).astype(np.uint8)

key_rgba = np.dstack([img, (soft * 255).astype(np.uint8)])
cv2.imwrite(OUT_KEY, key_rgba)
cv2.imwrite(OUT_PLATE, plate)

dbg = img.copy()
a3 = soft[..., None]
dbg = (dbg * (1 - 0.55 * a3) + np.array([0, 110, 255]) * 0.55 * a3).astype(np.uint8)
os.makedirs(os.path.dirname(OUT_DEBUG), exist_ok=True)
cv2.imwrite(OUT_DEBUG, cv2.resize(np.hstack([dbg, plate]),
                                  (1600, int(1600 * H / (2 * W))), interpolation=cv2.INTER_AREA))
print("alpha coverage", int((soft > 0.5).sum()))
print("wrote", OUT_KEY, OUT_PLATE)
