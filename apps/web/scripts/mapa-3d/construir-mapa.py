"""Construye apps/web/public/mapa-3d.html (pantalla /3d-map): un solo archivo, sin servidor ni internet.

Empaqueta (zlib + base64) los datos NASA ya procesados del proyecto `luna`:
  - LOLA LDEM_4 (altura global, 1440 x 720, km sobre 1737,4 km) y LDAM_4 (albedo 1064 nm).
  - LOLA LDEM_75S a 240 m y 960 m (polo sur), fundidos en una rejilla de 1024 x 1024 (~663 m) hasta 339 km del polo.
  - Tabla de efemérides JPL Horizons DE441 (Sol y Tierra en MOON_ME cada 3 h, 2026–2030), en int16.
  - sitios.json (alunizajes NSSDCA, sitios PGDA, regiones Artemis III).
  - iau-nombres.json (8876 nombres IAU/USGS Gazetteer: cráteres, mares y montes).
  - LOLA LDEM_75S_240M sin remuestrear (sombreado y cifras del polo a 240 m) y gradiente16.webp
    (pendientes de LOLA LDEM_16, 1,9 km, para sombrear el globo).
y three.js (el de node_modules, empaquetado con esbuild en un solo módulo) como módulo data: en un import map.

Uso (desde la raíz del repo, con `npm ci` hecho):  python apps/web/scripts/mapa-3d/construir-mapa.py [carpeta-datos]
Los datos fuente salen de luna-recursos/datos/ (en el repo). Requiere numpy.
"""
import base64
import json
import os
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path

import numpy as np

AQUI = Path(__file__).resolve().parent
WEB = AQUI.parent.parent
REPO = WEB.parent.parent
DATOS = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / "luna-recursos" / "datos"
PUBLIC_DATA = DATOS  # efemérides y horizontes de 5 m: también en luna-recursos/datos


def b64z(arr: np.ndarray) -> str:
    return base64.b64encode(zlib.compress(arr.tobytes(), 9)).decode("ascii")


def delta_filas(a: np.ndarray) -> np.ndarray:
    """Diferencias a lo largo de cada fila (int16): el relieve es suave y comprime mucho mejor."""
    a = a.astype(np.int32)
    d = np.empty_like(a)
    d[:, 0] = a[:, 0]
    d[:, 1:] = a[:, 1:] - a[:, :-1]
    assert d.min() >= -32768 and d.max() <= 32767
    return d.astype("<i2")


def box(a: np.ndarray, k: int) -> np.ndarray:
    """Promedio móvil k x k (k impar) con sumas acumuladas; bordes replicados."""
    p = k // 2
    b = np.pad(a.astype(np.float64), p, mode="edge")
    c = b.cumsum(0).cumsum(1)
    c = np.pad(c, ((1, 0), (1, 0)))
    s = c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]
    return s / (k * k)


def bilineal(g: np.ndarray, paso: float, x0: float, y0: float, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    n = g.shape[0]
    c = np.clip((x - x0) / paso, 0, n - 1.000001)
    f = np.clip((y0 - y) / paso, 0, n - 1.000001)
    c0 = np.floor(c).astype(int)
    f0 = np.floor(f).astype(int)
    tc = c - c0
    tf = f - f0
    return (g[f0, c0] * (1 - tc) + g[f0, c0 + 1] * tc) * (1 - tf) + (g[f0 + 1, c0] * (1 - tc) + g[f0 + 1, c0 + 1] * tc) * tf


def main() -> None:
    # --- Luna global (LDEM_4 / LDAM_4): fila 0 = 90° N, columna 0 = 0° E, 4 px/grado ---
    ldem = np.fromfile(DATOS / "luna-ldem4.f16", dtype="<f2").astype(np.float32).reshape(720, 1440)
    ldam = np.fromfile(DATOS / "luna-ldam4.f16", dtype="<f2").astype(np.float32).reshape(720, 1440)
    g_h = np.round(ldem * 1000).astype(np.int32)  # m
    g_a = np.clip(np.round((ldam - 0.10) / 0.50 * 255), 0, 255).astype(np.uint8)
    print(f"global: altura {g_h.min()}..{g_h.max()} m, albedo {ldam.min():.3f}..{ldam.max():.3f}")

    # --- Polo sur: 240 m (±195 km) + 960 m (±339,6 km) -> 1024 x 1024 en ±339 km ---
    meta = json.loads((DATOS / "dem-polo.json").read_text(encoding="utf8"))
    mc, ml = meta["cerca"], meta["lejos"]
    cerca = np.fromfile(DATOS / mc["archivo"], dtype="<i2").reshape(mc["n"], mc["n"]).astype(np.float64)
    lejos = np.fromfile(DATOS / ml["archivo"], dtype="<i2").reshape(ml["n"], ml["n"]).astype(np.float64)
    print(f"polo: 240 m {cerca.min():.0f}..{cerca.max():.0f}; 960 m {lejos.min():.0f}..{lejos.max():.0f}")
    N, EXT = 1024, 339_000.0
    paso = 2 * EXT / (N - 1)
    xs = -EXT + np.arange(N) * paso
    ys = EXT - np.arange(N) * paso
    X, Y = np.meshgrid(xs, ys)
    h_cerca = bilineal(box(cerca, 3), mc["pasoM"], mc["x0M"], mc["y0M"], X, Y)
    h_lejos = bilineal(lejos, ml["pasoM"], ml["x0M"], ml["y0M"], X, Y)
    borde = mc["pasoM"] * (mc["n"] - 1) / 2  # 195 km
    w = np.clip((borde - np.maximum(np.abs(X), np.abs(Y))) / 8000.0, 0, 1)
    p_h = np.round(h_cerca * w + h_lejos * (1 - w)).astype(np.int32)
    print(f"polo fundido: {N}x{N}, paso {paso:.1f} m, {p_h.min()}..{p_h.max()} m")

    # --- Efemérides (Sol y Tierra unitarios en MOON_ME) -> int16 ---
    em = json.loads((PUBLIC_DATA / "efemerides-luna.json").read_text(encoding="utf8"))
    tabla = np.fromfile(PUBLIC_DATA / em["archivo"], dtype="<f4").reshape(em["filas"], 8)
    sol_tierra = tabla[:, [0, 1, 2, 4, 5, 6]]
    q = np.round(sol_tierra * 32767).astype(np.int16)
    eph_q = np.empty_like(q, dtype=np.int32)
    eph_q[0] = q[0]
    eph_q[1:] = q[1:].astype(np.int32) - q[:-1].astype(np.int32)  # delta en el tiempo, por columna

    sitios = json.loads((AQUI / "sitios.json").read_text(encoding="utf8"))
    # Horizontes de 5 m precalculados (DTM LOLA de PGDA hasta 4 km + LDEM_75S hasta 150 km; Barker et al. 2021),
    # cada 0,5° de azimut, a ras del suelo: para el Sol y la Tierra en los sitios candidatos del polo.
    HZ = {"cand-connecting-ridge": "connecting-ridge", "cand-shackleton-rim": "shackleton-rim", "cand-peak-shackleton": "peak-near-shackleton",
          "cand-de-gerlache": "de-gerlache-rim", "cand-haworth": "haworth", "cand-malapert": "malapert-massif", "cand-nobile-1": "nobile-rim-1",
          "cand-nobile-2": "nobile-rim-2", "cand-leibnitz-beta": "leibnitz-beta", "cand-shoemaker": "shoemaker"}
    horizontes = {}
    for sid, arch in HZ.items():
        h = json.loads((PUBLIC_DATA / f"horizonte-catalogo-{arch}.json").read_text(encoding="utf8"))
        assert h["pasoAzimutGrados"] == 0.5 and len(h["elevacionGrados"]) == 720, arch
        horizontes[sid] = [round(v, 2) for v in h["elevacionGrados"]]
    # Sitios polares: elevación y pendiente con la rejilla LOLA de 240 m original (más fina que la del 3D).
    R = 1737400.0
    for st in sitios["sitios"]:
        rho = 2 * R * np.tan(np.radians(90 + st["lat"]) / 2)
        if st["lat"] > -75 or rho > borde - 1000:
            continue
        x, y = rho * np.sin(np.radians(st["lon"])), rho * np.cos(np.radians(st["lon"]))
        k = 1 / np.cos(np.arctan(rho / (2 * R))) ** 2
        b = lambda xx, yy: float(bilineal(cerca, mc["pasoM"], mc["x0M"], mc["y0M"], np.array(xx), np.array(yy)))
        d = mc["pasoM"]
        gx = (b(x + d, y) - b(x - d, y)) / (2 * d / k)
        gy = (b(x, y + d) - b(x, y - d)) / (2 * d / k)
        st["h240"] = round(b(x, y))
        st["pend240"] = round(float(np.degrees(np.arctan(np.hypot(gx, gy)))), 1)

    datos = {
        "global": {"w": 1440, "h": 720, "alt": b64z(delta_filas(g_h)), "alb": b64z(g_a),
                   "albMin": 0.10, "albRango": 0.50,
                   "fuente": "LOLA LDEM_4 / LDAM_4 (PDS Geosciences Node), 4 px/deg ≈ 7.6 km"},
        "polo": {"n": N, "ext": EXT, "paso": paso, "alt": b64z(delta_filas(p_h)),
                 "fuente": "LOLA LDEM_75S_240M + 960M (PDS Geosciences Node), resampled to ~663 m"},
        # Rejilla de 240 m sin remuestrear: normales del sombreado y cifras de la ficha hasta 195 km del polo.
        "polo240": {"n": mc["n"], "paso": mc["pasoM"], "x0": mc["x0M"], "y0": mc["y0M"],
                    "alt": b64z(delta_filas(cerca.astype(np.int32)))},
        "eph": {"inicioUTC": em["inicioUTC"], "pasoS": em["pasoS"], "filas": em["filas"],
                "d": b64z(eph_q.astype("<i2")), "fuente": "JPL Horizons DE441, MOON_ME"},
        "sitios": sitios,
        "horizontes": horizontes,
        "iau": json.loads((AQUI / "iau-nombres.json").read_text(encoding="utf8"))["nombres"],
        # Gradiente de LOLA LDEM_16 (1,9 km) para sombrear el globo; lo genera gradiente16.py.
        "g16": "data:image/webp;base64," + base64.b64encode((AQUI / "gradiente16.webp").read_bytes()).decode("ascii"),
        # Tierra: Blue Marble de la NASA (SVS 2915, https://svs.gsfc.nasa.gov/vis/a000000/a002900/a002915/bluemarble-2048.png),
        # reducida a 1024 x 512.
        "tierra": "data:image/jpeg;base64," + base64.b64encode((AQUI / "tierra-bluemarble.jpg").read_bytes()).decode("ascii"),
    }

    # three.js + OrbitControls en un solo módulo ESM (desde r171 three se reparte en varios archivos que se importan
    # entre sí, y un módulo data: no puede resolver importaciones relativas). Ambos especificadores del import map
    # apuntan al mismo módulo, así hay una sola instancia de three.
    with tempfile.TemporaryDirectory() as tmp:
        entrada, salida_js = Path(tmp) / "three-mapa.js", Path(tmp) / "three-mapa.min.js"
        entrada.write_text('export * from "three"\nexport { OrbitControls } from "three/addons/controls/OrbitControls.js"\n', encoding="utf8")
        subprocess.run(["node", str(REPO / "node_modules/esbuild/bin/esbuild"), str(entrada), "--bundle", "--format=esm", "--minify",
                        "--legal-comments=inline", f"--outfile={salida_js}"], cwd=REPO, check=True,
                       env={**os.environ, "NODE_PATH": str(REPO / "node_modules")})
        modulo = salida_js.read_bytes()
    durl = "data:text/javascript;base64," + base64.b64encode(modulo).decode("ascii")

    html = (AQUI / "mapa.src.html").read_text(encoding="utf8")
    html = html.replace("__THREE_URL__", durl).replace("__ORBIT_URL__", durl)
    html = html.replace("/*__DATOS__*/null", json.dumps(datos, ensure_ascii=False, separators=(",", ":")))
    salida = WEB / "public" / "mapa-3d.html"
    salida.parent.mkdir(exist_ok=True)
    salida.write_text(html, encoding="utf8")
    print(f"-> {salida} ({salida.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
