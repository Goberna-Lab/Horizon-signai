"""Genera la textura de la luna de adorno del panel Missions (inicio.html) con datos REALES de LOLA:

- data/luna-global.jpg: mapa cilíndrico (equirrectangular) de toda la Luna, 1024 × 512, en grises.
  Brillo = albedo normal LDAM_4 (luna-recursos/datos/luna-ldam4.f16) × un sombreado suave del relieve LDEM_4
  (luna-recursos/datos/luna-ldem4.f16) con la luz desde el oeste, la misma que pone la esfera de inicio.html.
  Fila 0 = latitud +90°, columna 0 = longitud 0° (este positivo), como los productos de la PDS.
Uso (desde la raíz del repo):  python prototipos/lunar-map/tools/luna-global.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parents[3]
DATOS = RAIZ / 'luna-recursos' / 'datos'
SALIDA = RAIZ / 'prototipos' / 'lunar-map' / 'data' / 'luna-global.jpg'
COLS, FILAS = 1440, 720
KM_PX = 2 * np.pi * 1737.4 / COLS          # ~7,6 km por píxel en el ecuador

alb = np.fromfile(DATOS / 'luna-ldam4.f16', dtype='<f2').astype(np.float32).reshape(FILAS, COLS)
alt = np.fromfile(DATOS / 'luna-ldem4.f16', dtype='<f2').astype(np.float32).reshape(FILAS, COLS)

# sombreado: pendiente este-oeste y norte-sur (km/km), con el ancho real de cada fila; luz del oeste y algo del norte
lat = np.deg2rad(90 - (np.arange(FILAS) + 0.5) / 4)[:, None]
dx = (np.roll(alt, -1, 1) - np.roll(alt, 1, 1)) / (2 * KM_PX * np.maximum(np.cos(lat), 0.05))
dy = (np.vstack([alt[:1], alt[:-1]]) - np.vstack([alt[1:], alt[-1:]])) / (2 * KM_PX)
luz = np.array([-0.8, 0.3, 0.52]); luz /= np.linalg.norm(luz)
n = np.stack([-dx * 4, -dy * 4, np.ones_like(alt)])           # relieve exagerado ×4 para que se lea a 200 px
n /= np.linalg.norm(n, axis=0)
somb = np.clip((n * luz[:, None, None]).sum(0) / luz[2], 0.6, 1.3)

# albedo a 0..1 por percentiles (los mares quedan oscuros, las tierras altas claras), por el sombreado
a = (alb - np.percentile(alb, 1)) / (np.percentile(alb, 99.5) - np.percentile(alb, 1))
gris = np.clip((0.18 + 0.82 * np.clip(a, 0, 1)) * somb, 0, 1)
img = Image.fromarray((gris ** 0.9 * 255).astype(np.uint8), 'L').resize((1024, 512), Image.LANCZOS)
img.save(SALIDA, quality=80, optimize=True, progressive=True)
print(SALIDA, img.size, SALIDA.stat().st_size, 'bytes')
