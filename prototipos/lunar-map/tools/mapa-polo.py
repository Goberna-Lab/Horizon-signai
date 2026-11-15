"""Genera la cartografía del planificador (index.html) con el relieve REAL del polo sur:

- data/polo-sur-lola.jpg: sombreado del relieve de LOLA (LDEM_75S_240M, rejilla de 240 m hasta 195 km del polo y de
  960 m más allá: luna-recursos/datos/dem-polo-240m.i16 y dem-polo-960m.i16). La luz del sombreado es la de la
  cartografía (desde arriba a la izquierda), no la del Sol en una fecha.
- data/polo-sur-pendiente.png: capa «Pendiente > 15°» calculada sobre ese mismo relieve (a 240 m por píxel; las
  pendientes de distancias más cortas no aparecen).

Proyección: la del mapa del planificador (toMap en index.html), azimutal equidistante centrada en el polo:
r = colatitud · PX_DEG, 0° E arriba y 90° E a la derecha. Cubre más que el viewBox del SVG (x 0..1000, y -100..700):
en una pantalla más ancha o más alta que 5:4, el SVG («meet») enseña también esos bordes. Hasta donde llega la rejilla
de 960 m (±339,6 km).
Uso (desde la raíz del repo):  python prototipos/lunar-map/tools/mapa-polo.py
"""
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

AQUI = Path(__file__).resolve().parent.parent
REPO = AQUI.parent.parent
DATOS = REPO / "luna-recursos" / "datos"

# Deben coincidir con index.html (PX_DEG, POLE)
PX_DEG = 78.0
POLE = (531.0, 464.0)
ZONA = (-320.0, -250.0, 1700.0, 1100.0)   # lo que cubre la imagen, en unidades del SVG: x, y, ancho, alto
ESCALA = 1.5                              # píxeles de la imagen por unidad del SVG
ESCALA_PEND = 0.6                         # y de la capa de pendiente
R_M = 1737400.0


def rejilla(nombre: str, meta: dict) -> dict:
    a = np.fromfile(DATOS / nombre, dtype="<i2").astype(np.float32).reshape(meta["n"], meta["n"])
    return {"a": a, **meta}


def muestrear(g: dict, X: np.ndarray, Y: np.ndarray) -> np.ndarray:
    """Bilineal como enRejilla() de engine.js; NaN fuera de la rejilla."""
    n = g["n"]
    c = (X - g["x0M"]) / g["pasoM"]
    f = (g["y0M"] - Y) / g["pasoM"]
    fuera = (c < 0) | (f < 0) | (c > n - 1) | (f > n - 1)
    c = np.clip(c, 0, n - 1.001)
    f = np.clip(f, 0, n - 1.001)
    c0 = np.floor(c).astype(np.int32)
    f0 = np.floor(f).astype(np.int32)
    tc, tf = c - c0, f - f0
    a = g["a"]
    h = (a[f0, c0] * (1 - tc) + a[f0, c0 + 1] * tc) * (1 - tf) + (a[f0 + 1, c0] * (1 - tc) + a[f0 + 1, c0 + 1] * tc) * tf
    h[fuera] = np.nan
    return h


def main() -> None:
    meta = json.loads((DATOS / "dem-polo.json").read_text(encoding="utf8"))
    cerca = rejilla("dem-polo-240m.i16", meta["cerca"])
    lejos = rejilla("dem-polo-960m.i16", meta["lejos"])

    W, H = int(ZONA[2] * ESCALA), int(ZONA[3] * ESCALA)
    xs = ZONA[0] + (np.arange(W) + 0.5) / ESCALA
    ys = ZONA[1] + (np.arange(H) + 0.5) / ESCALA
    sx, sy = np.meshgrid(xs, ys)
    dx, dy = sx - POLE[0], sy - POLE[1]
    colat = np.radians(np.hypot(dx, dy) / PX_DEG)
    lon = np.arctan2(dx, -dy)
    rho = 2 * R_M * np.tan(colat / 2)
    X, Y = rho * np.sin(lon), rho * np.cos(lon)   # estereoSur() de engine.js

    h = muestrear(cerca, X, Y)
    falta = np.isnan(h)
    h[falta] = muestrear(lejos, X[falta], Y[falta])
    if np.isnan(h).any():
        raise SystemExit(f"{int(np.isnan(h).sum())} píxeles sin relieve")

    paso_m = math.radians(1 / (PX_DEG * ESCALA)) * R_M   # metros por píxel de la imagen
    dzdy, dzdx = np.gradient(h, paso_m)
    print(f"imagen {W}x{H}, {paso_m:.0f} m por píxel, alturas {h.min():.0f} a {h.max():.0f} m")

    # sombreado: luz desde arriba a la izquierda, 28° sobre el horizonte, relieve exagerado ×2
    exag, el, az = 2.0, math.radians(28), math.radians(135)
    lx, ly, lz = math.cos(el) * math.cos(az), -math.cos(el) * math.sin(az), math.sin(el)
    nx, ny, nz = -dzdx * exag, -dzdy * exag, np.ones_like(h)
    norma = np.sqrt(nx * nx + ny * ny + nz * nz)
    luz = np.clip((nx * lx + ny * ly + nz * lz) / norma, 0, 1)
    # tono: regolito gris (como el resto del planificador), sombras casi negras y un leve tinte por altura
    alt = (h - np.percentile(h, 2)) / (np.percentile(h, 98) - np.percentile(h, 2))
    v = 0.06 + 0.86 * luz ** 0.85 + 0.06 * np.clip(alt, 0, 1)
    rgb = np.stack([v * 236, v * 233, v * 228], axis=-1).clip(0, 255).astype(np.uint8)
    jpg = AQUI / "data" / "polo-sur-lola.jpg"
    Image.fromarray(rgb).save(jpg, quality=82, optimize=True, progressive=True)
    print("->", jpg, f"{jpg.stat().st_size / 1024:.0f} KB")

    # pendiente > 15° (rojo de alerta), a ESCALA_PEND píxeles por unidad del SVG
    pend = np.degrees(np.arctan(np.hypot(dzdx, dzdy)))
    pend = np.asarray(Image.fromarray(pend.astype(np.float32)).resize((int(ZONA[2] * ESCALA_PEND), int(ZONA[3] * ESCALA_PEND)), Image.BILINEAR))
    alfa = np.clip((pend - 15) / 16, 0, 0.45) * 255
    alfa[pend < 15] = 0
    rgba = np.zeros(pend.shape + (4,), np.uint8)
    rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3] = 255, 77, 61, alfa.astype(np.uint8)
    png = AQUI / "data" / "polo-sur-pendiente.png"
    Image.fromarray(rgba, "RGBA").save(png, optimize=True)
    print("->", png, f"{png.stat().st_size / 1024:.0f} KB, {100 * (pend > 15).mean():.1f} % del mapa sobre 15°")

    radar(cerca, lejos)


def radar(cerca: dict, lejos: dict) -> None:
    """data/radar-polo-sur.jpg: el fondo del radar de Missions. Disco de 200 km de radio alrededor del polo, a distancia
    real (azimutal equidistante: r = distancia de arco), 0° E arriba, en tono fósforo sobre vidrio oscuro."""
    N, RADIO_KM = 512, 200.0
    c = (np.arange(N) + 0.5) / N * 2 - 1
    u, w = np.meshgrid(c, c)
    d_m = np.hypot(u, w) * RADIO_KM * 1000
    colat = d_m / R_M
    lon = np.arctan2(u, -w)
    rho = 2 * R_M * np.tan(colat / 2)
    X, Y = rho * np.sin(lon), rho * np.cos(lon)
    h = muestrear(cerca, X, Y)
    falta = np.isnan(h)
    h[falta] = muestrear(lejos, X[falta], Y[falta])
    h = np.nan_to_num(h, nan=float(np.nanmin(h)))
    paso = 2 * RADIO_KM * 1000 / N
    dzdy, dzdx = np.gradient(h, paso)
    el, az = math.radians(30), math.radians(135)
    lx, ly, lz = math.cos(el) * math.cos(az), -math.cos(el) * math.sin(az), math.sin(el)
    nx, ny = -dzdx * 2.0, -dzdy * 2.0
    luz = np.clip((nx * lx + ny * ly + lz) / np.sqrt(nx * nx + ny * ny + 1), 0, 1) ** 0.9
    base, tinte = np.array([4, 17, 13], float), np.array([96, 168, 148], float)
    rgb = base + luz[..., None] * tinte
    rgb[np.hypot(u, w) > 1] = base
    jpg = AQUI / "data" / "radar-polo-sur.jpg"
    Image.fromarray(rgb.clip(0, 255).astype(np.uint8)).save(jpg, quality=70, optimize=True, progressive=True)
    print("->", jpg, f"{jpg.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
