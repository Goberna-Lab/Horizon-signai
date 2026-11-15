"""Gradiente del relieve global LOLA LDEM_16 (1,9 km/px) -> WebP gris para sombrear el globo.

Mitad de arriba = pendiente hacia el este, mitad de abajo = hacia el norte, como ángulo: v = 127.5 + atan(g)/30° * 127.5
(±30°, pasos de 0,24°; las dos mitades apiladas en una WebP gris). Fuente: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/float_img/ldem_16_float.img (66 MB, consultado 2026-11-14).
Uso: python gradiente16.py <ldem_16_float.img> apps/web/scripts/mapa-3d/gradiente16.webp
"""
import sys

import numpy as np
from PIL import Image

R = 1737.4
src, out = sys.argv[1], sys.argv[2]
h = np.fromfile(src, dtype="<f4").reshape(2880, 5760).astype(np.float64)  # km, fila 0 = 90° N, col 0 = 0° E
print("altura", h.min(), h.max())
# Comprobación contra LDEM_4: Apollo 17 (20.19 N, 30.77 E) ≈ −2,6 km
f, c = int((90 - 20.1911) * 16), int(30.7723 * 16)
print("Apollo 17 en LDEM_16:", round(h[f, c], 3), "km")

paso = np.radians(1 / 16)
lat = 90 - (np.arange(2880) + 0.5) / 16
coslat = np.cos(np.radians(lat))
# Norte: diferencias centradas entre filas (bordes replicados)
hn = np.vstack([h[:1], h, h[-1:]])
gN = (hn[:-2] - hn[2:]) / (2 * R * paso)
# Este: separación de columnas creciente cerca de los polos para que la distancia no sea ínfima
gE = np.empty_like(h)
for i in range(2880):
    k = int(min(max(1, np.ceil(0.5 / max(coslat[i], 1e-3))), 400))
    fila = h[i]
    gE[i] = (np.roll(fila, -k) - np.roll(fila, k)) / (2 * k * R * coslat[i] * paso)
a = np.degrees(np.arctan(np.stack([gE, gN], -1)))
print("pendiente E/N p99:", np.percentile(np.abs(a), 99, axis=(0, 1)))
v = np.clip(np.round(127.5 + a / 30 * 127.5), 0, 255).astype(np.uint8)
apil = np.vstack([v[..., 0], v[..., 1]])  # 5760 x 5760 en gris: mitad de arriba = este, mitad de abajo = norte
Image.fromarray(apil, "L").save(out, quality=75, method=6)
import os
print("->", out, round(os.path.getsize(out) / 1e6, 2), "MB")
