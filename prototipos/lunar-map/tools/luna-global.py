"""Genera la textura de la luna de adorno del panel Missions (inicio.html) con datos REALES de LOLA:

- data/luna-global.jpg: mapa cilíndrico (equirrectangular) de toda la Luna, 2880 × 1440 (8 px por grado), en grises.
  Brillo = albedo normal LDAM_4 (luna-recursos/datos/luna-ldam4.f16, 4 px/grado, suavizado al ampliarlo) × el
  sombreado del relieve LDEM_16 (16 px/grado, ~1,9 km por píxel en el ecuador) con la luz desde el oeste y algo del
  norte. La luna se ve de cerca y gira sobre su eje: así la luz del sombreado queda siempre del mismo lado en pantalla.
  Fila 0 = latitud +90°, columna 0 = longitud 0° (este positivo), como los productos de la PDS.
- LDEM_16 (66 MB) no está en el repo: se descarga de la PDS a la carpeta temporal la primera vez, o se pasa su ruta.
Uso (desde la raíz del repo):  python prototipos/lunar-map/tools/luna-global.py [ruta/a/ldem_16_float.img]
"""
import sys
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parents[3]
DATOS = RAIZ / 'luna-recursos' / 'datos'
SALIDA = RAIZ / 'prototipos' / 'lunar-map' / 'data' / 'luna-global.jpg'
URL = 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/float_img/ldem_16_float.img'
COLS, FILAS = 5760, 2880                    # LDEM_16: float32 little-endian, km sobre 1737,4 km
KM_PX = 2 * np.pi * 1737.4 / COLS           # ~1,9 km por píxel en el ecuador
EXAG = 2.5                                  # relieve exagerado para que los cráteres se lean en un adorno
FINAL = (2880, 1440)

ruta = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.gettempdir()) / 'ldem_16_float.img'
if not ruta.exists():
    print('descargando', URL)
    urllib.request.urlretrieve(URL, ruta)
alt = np.fromfile(ruta, dtype='<f4').reshape(FILAS, COLS)

# sombreado: pendientes este-oeste y norte-sur (km/km) con el ancho real de cada fila; luz del oeste y algo del norte
lat = np.deg2rad(90 - (np.arange(FILAS) + 0.5) / 16)[:, None]
dx = (np.roll(alt, -1, 1) - np.roll(alt, 1, 1)) / (2 * KM_PX * np.maximum(np.cos(lat), 0.02))
dy = (np.vstack([alt[:1], alt[:-1]]) - np.vstack([alt[1:], alt[-1:]])) / (2 * KM_PX)
luz = np.array([-0.75, 0.35, 0.56]); luz /= np.linalg.norm(luz)
nz = 1 / np.sqrt(1 + (dx * EXAG) ** 2 + (dy * EXAG) ** 2)
somb = np.clip((-dx * EXAG * luz[0] - dy * EXAG * luz[1] + luz[2]) * nz / luz[2], 0.25, 1.5)
del dx, dy, nz

# albedo de LDAM_4 ampliado a 16 px/grado, a 0..1 por percentiles (mares oscuros, tierras altas claras)
alb4 = np.fromfile(DATOS / 'luna-ldam4.f16', dtype='<f2').astype(np.float32).reshape(720, 1440)
alb = np.asarray(Image.fromarray(alb4).resize((COLS, FILAS), Image.BILINEAR))
a = np.clip((alb - np.percentile(alb4, 1)) / (np.percentile(alb4, 99.5) - np.percentile(alb4, 1)), 0, 1)
gris = np.clip((0.3 + 0.7 * a) * somb * 0.82, 0, 1)
img = Image.fromarray((gris * 255).astype(np.uint8), 'L').resize(FINAL, Image.LANCZOS)
img.save(SALIDA, quality=72, optimize=True, progressive=True)
print(SALIDA, img.size, SALIDA.stat().st_size, 'bytes')
