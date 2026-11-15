"""Verifica que lo que muestra apps/web/public/mapa-3d.html (/3d-map) coincide con sus fuentes.

Uso:
  python -X utf8 apps/web/scripts/mapa-3d/verificar-mapa.py [--nssdca nssdca.html] [--dbf MOON_nomenclature_center_pts.dbf] [--sin-red] [--enlaces]

Pruebas:
  A. Sitios NSSDCA: coordenadas y fecha de cada sitio contra la tabla oficial (se descarga si no se da --nssdca).
  B. Sitios PGDA: contra luna-recursos/datos/catalogo-polo.json.
  C. Nombres IAU: iau-nombres.json contra el shapefile del Gazetteer (solo con --dbf) y casos conocidos.
  D. Datos embebidos en mapa.html: rejillas LOLA (global, polo 663 m y 240 m) y efemérides, contra los archivos fuente.
  E. JPL Horizons en vivo: punto subsolar y sub-Tierra interpolados por el mapa, y el punto sublunar de la Tierra
     (orientación del dibujo de la Tierra), contra consultas nuevas a la API.
"""
import argparse
import base64
import json
import math
import re
import subprocess
import sys
import urllib.parse
import urllib.request
import zlib
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

AQUI = Path(__file__).resolve().parent
WEB = AQUI.parent.parent
DATOS_LUNA = WEB.parent.parent / "luna-recursos" / "datos"
NSSDCA_URL = "https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html"
HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api"

fallos, avisos, oks = [], [], []


def ok(m): oks.append(m); print("  OK   ", m)
def mal(m): fallos.append(m); print("  FALLA", m)
def aviso(m): avisos.append(m); print("  AVISO", m)


def leer_dbf(ruta):
    """Lector mínimo de .dbf (atributos del shapefile del Gazetteer IAU)."""
    import struct
    with open(ruta, "rb") as f:
        h = f.read(32); n, hl, rl = struct.unpack("<IHH", h[4:12]); campos = []
        while True:
            d = f.read(32)
            if d[0] == 0x0D: break
            campos.append((d[:11].split(b"\0")[0].decode(), d[16]))
        f.seek(hl); filas = []
        for _ in range(n):
            r = f.read(rl); o = 1; fila = {}
            for nom, largo in campos:
                fila[nom] = r[o:o + largo].decode("utf8", "replace").strip(); o += largo
            filas.append(fila)
    return campos, filas


def norm(s): return re.sub(r"[^a-z0-9]", "", s.lower().replace("&#39;", "'").replace("'", ""))


# Nombre de cada sitio en la tabla de NSSDCA (cuando difiere del nuestro).
NSSDCA_NOMBRE = {
    "apollo-11": "Apollo 11 LM descent stage", "apollo-12": "Apollo 12 LM descent stage", "apollo-14": "Apollo 14 LM descent stage",
    "apollo-15": "Apollo 15 LM descent stage", "apollo-16": "Apollo 16 LM descent stage", "apollo-17": "Apollo 17 LM descent stage",
    "chandrayaan-3": "Chandrayaan 3", "im-1": "Odysseus (IM-1)", "blue-ghost-1": "Blue Ghost 1", "im-2": "Intuitive Machines 2",
    "yutu": "Yutu Rover", "yutu-2": "Yutu 2", "vikram-2019": "Vikram", "hakuto-r-1": "Hakuto-R Mission 1", "hakuto-r-2": "Hakuto-R Mission 2",
    "lcross": "LCROSS Centaur", "chandrayaan-1-mip": "Chandrayaan 1 MIP", "grail": "GRAIL A", "kaguya": "Kaguya",
    "change-3": "Chang'e 3", "change-4": "Chang'e 4", "change-5": "Chang'e 5", "change-6": "Chang'e 6", "smart-1": "SMART-1",
}


def datos_mapa():
    html = (WEB / "public/mapa-3d.html").read_text(encoding="utf8")
    i = html.index("const DATOS = ") + len("const DATOS = ")
    return json.JSONDecoder().raw_decode(html[i:])[0]


def inflar(b64): return zlib.decompress(base64.b64decode(b64))


def desdelta(b, w, h):
    d = np.frombuffer(b, dtype="<i2").reshape(h, w).astype(np.int64)
    return np.cumsum(d, axis=1)


def prueba_nssdca(D, ruta):
    print("\nA. Sitios contra NASA NSSDCA")
    html = Path(ruta).read_text(encoding="utf8", errors="replace") if ruta else urllib.request.urlopen(NSSDCA_URL, timeout=60).read().decode("utf8", "replace")
    filas = {}
    for m in re.finditer(r'<th[^>]*>\s*<a href="([^"]*)"[^>]*>\s*(.*?)</a>\s*</th>(.*?)</tr>', html, re.S):
        href = m.group(1)
        nombre = re.sub(r"<br\s*/?>", " ", m.group(2)); nombre = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", nombre)).strip()
        celdas = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>|&nbsp;", " ", c)).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", m.group(3), re.S)]
        if len(celdas) < 4: continue
        num = re.findall(r"(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)", celdas[3])
        fecha = None
        try: fecha = datetime.strptime(celdas[1], "%d %B %Y").date().isoformat()
        except ValueError: pass
        filas[norm(nombre)] = {"nombre": nombre, "tipo": celdas[0], "fecha": fecha, "coord": tuple(map(float, num[0])) if num else None, "href": href}
    print(f"  ({len(filas)} filas leídas de la tabla)")
    for s in D["sitios"]["sitios"]:
        if not s["src"].startswith("NSSDCA"): continue
        clave = norm(NSSDCA_NOMBRE.get(s["id"], s["nombre"]))
        f = filas.get(clave)
        if not f: mal(f"{s['nombre']}: no aparece en la tabla de NSSDCA"); continue
        if not f["coord"]: aviso(f"{s['nombre']}: NSSDCA no da coordenadas numéricas"); continue
        dlat, dlon = abs(s["lat"] - f["coord"][0]), abs(((s["lon"] - f["coord"][1] + 180) % 360) - 180)
        fecha_ok = (f["fecha"] is None) or (s["fecha"] == f["fecha"])
        enlace = next((e["url"] for e in s.get("enlaces", []) if "nmc/spacecraft" in e["url"]), None)
        if enlace and enlace != f.get("href"): mal(f"{s['nombre']}: ficha NSSDCA {enlace} ≠ la de la tabla {f.get('href')}")
        if not any(e["url"] == NSSDCA_URL for e in s.get("enlaces", [])): mal(f"{s['nombre']}: falta el enlace a la tabla de NSSDCA")
        if dlat < 1e-3 and dlon < 1e-3 and fecha_ok: ok(f"{s['nombre']}: {s['lat']}, {s['lon']} · {s['fecha']}")
        else: mal(f"{s['nombre']}: mapa {s['lat']}, {s['lon']} {s['fecha']} ≠ NSSDCA {f['coord']} {f['fecha']}")


def prueba_enlaces(D):
    print("\nA2. Enlaces de fuente en las fichas de los sitios")
    sin = [s["nombre"] for s in D["sitios"]["sitios"] if not s.get("enlaces")]
    (ok if not sin else mal)(f"{len(D['sitios']['sitios'])} sitios con enlace de fuente; sin enlace: {sin or 'ninguno'}")
    malos = [s["nombre"] for s in D["sitios"]["sitios"] for e in s.get("enlaces", []) if not e["url"].startswith("https://") or not e["es"] or not e["en"]]
    (ok if not malos else mal)(f"Enlaces con https y texto en ES y EN; incorrectos: {malos or 'ninguno'}")


def prueba_enlaces_en_linea(D):
    """Abre cada enlace y revisa el contenido: hay servidores (PGDA, NSSDCA) que responden 200 en páginas de error."""
    print("\nA3. Contenido de cada enlace de fuente (en línea)")
    urls = sorted({e["url"] for s in D["sitios"]["sitios"] for e in s.get("enlaces", [])})
    for u in urls:
        t = subprocess.run(["curl", "-sL", "--max-time", "40", u], capture_output=True).stdout.decode("utf8", "replace")
        error = re.search(r"event horizon|not found|An error has occurred|page not found|does not exist", t[:30000], re.I)
        esperado = True
        if "display.action?id=" in u: esperado = u.rsplit("=", 1)[1].lower() in t.lower()
        elif "view_rdr/" in u: esperado = u.rsplit("/", 1)[1].lower() in t.lower()
        (ok if (not error and esperado and len(t) > 200) else mal)(f"{u}")


def prueba_pgda(D):
    print("\nB. Sitios polares contra PGDA (catalogo-polo.json)")
    cat = {c["id"]: c for c in json.loads((DATOS_LUNA / "catalogo-polo.json").read_text(encoding="utf8"))["sitios"]}
    eq = {"cand-connecting-ridge": "connecting-ridge", "cand-shackleton-rim": "shackleton-rim", "cand-peak-shackleton": "peak-near-shackleton",
          "cand-de-gerlache": "de-gerlache-rim", "cand-haworth": "haworth", "cand-malapert": "malapert-massif", "cand-nobile-1": "nobile-rim-1",
          "cand-nobile-2": "nobile-rim-2", "cand-leibnitz-beta": "leibnitz-beta", "cand-shoemaker": "shoemaker", "im-2": "im-2"}
    for s in D["sitios"]["sitios"]:
        if s["id"] not in eq: continue
        c = cat[eq[s["id"]]]
        d = max(abs(s["lat"] - c["latitudGrados"]), abs(((s["lon"] - c["longitudEsteGrados"] + 180) % 360) - 180))
        (ok if d < 1e-3 else mal)(f"{s['nombre']}: Δ = {d:.5f}°")


def prueba_iau(D, dbf):
    print("\nC. Nombres IAU")
    nombres = {n[0]: n for n in D["iau"]}
    for nom, lat, lon, diam in [("Shackleton", -89.67, 129.78, 20.9), ("Copernicus", 9.62, 339.92, 96.1), ("Tycho", -43.3, 348.8, 85.3),
                                ("Shoemaker", -88.14, 45.91, 51.8), ("Mare Tranquillitatis", 8.35, 30.83, 873)]:
        n = nombres.get(nom)
        if not n: mal(f"{nom}: no está"); continue
        d = max(abs(n[1] - lat), abs(((n[2] - lon + 180) % 360) - 180))
        (ok if d < 0.2 and abs(n[3] - diam) / diam < 0.05 else mal)(f"{nom}: {n[1]}, {n[2]}, {n[3]} km (referencia ≈ {lat}, {lon}, {diam} km)")
    if dbf:
        _, filas = leer_dbf(dbf)
        fuente = {(r["clean_name"] or r["name"]): r for r in filas}
        malos = [n[0] for n in D["iau"] if n[0] not in fuente or abs(float(fuente[n[0]]["center_lat"]) - n[1]) > 1e-3
                 or abs(((float(fuente[n[0]]["center_lon"]) - n[2] + 180) % 360) - 180) > 1e-3]
        (ok if not malos else mal)(f"{len(D['iau'])} nombres contra el shapefile: {len(malos)} distintos {malos[:5]}")


def prueba_rejillas(D):
    print("\nD. Datos embebidos contra los archivos fuente")
    G = D["global"]
    hg = desdelta(inflar(G["alt"]), G["w"], G["h"])
    src = np.round(np.fromfile(DATOS_LUNA / "luna-ldem4.f16", dtype="<f2").astype(np.float32).reshape(720, 1440) * 1000)
    (ok if np.array_equal(hg, src) else mal)(f"LDEM_4 global: {G['w']}x{G['h']}, máx. diferencia {np.abs(hg - src).max():.0f} m")
    meta = json.loads((DATOS_LUNA / "dem-polo.json").read_text(encoding="utf8"))["cerca"]
    p2 = D["polo240"]
    h2 = desdelta(inflar(p2["alt"]), p2["n"], p2["n"])
    src2 = np.fromfile(DATOS_LUNA / meta["archivo"], dtype="<i2").reshape(meta["n"], meta["n"])
    (ok if np.array_equal(h2, src2) else mal)(f"LDEM_75S 240 m: {p2['n']}x{p2['n']} idéntica al archivo fuente")
    P = D["polo"]
    hp = desdelta(inflar(P["alt"]), P["n"], P["n"])
    # el punto central de la rejilla de 663 m frente a la de 240 m (suavizada): deben coincidir en decenas de metros
    c = P["n"] // 2; c2 = meta["n"] // 2
    d = abs(hp[c, c] - src2[c2 - 1:c2 + 2, c2 - 1:c2 + 2].mean())
    (ok if d < 150 else mal)(f"Rejilla polar de 663 m en el polo: {hp[c, c]} m frente a {src2[c2 - 1:c2 + 2, c2 - 1:c2 + 2].mean():.0f} m a 240 m")
    # Connecting Ridge: altura de LOLA de 5 m (PGDA) = 1944,8 m
    R = 1737400.0
    lat, lon = -89.46316, 222.5104
    rho = 2 * R * math.tan(math.radians(90 + lat) / 2); x, y = rho * math.sin(math.radians(lon)), rho * math.cos(math.radians(lon))
    cc, ff = (x - p2["x0"]) / p2["paso"], (p2["y0"] - y) / p2["paso"]
    c0, f0 = int(cc), int(ff); tc, tf = cc - c0, ff - f0
    h = (h2[f0, c0] * (1 - tc) + h2[f0, c0 + 1] * tc) * (1 - tf) + (h2[f0 + 1, c0] * (1 - tc) + h2[f0 + 1, c0 + 1] * tc) * tf
    (ok if abs(h - 1944.8) < 10 else mal)(f"Connecting Ridge a 240 m: {h:.1f} m (LOLA 5 m, PGDA: 1944,8 m)")
    E = D["eph"]
    q = np.cumsum(np.frombuffer(inflar(E["d"]), dtype="<i2").reshape(E["filas"], 6).astype(np.int64), axis=0) / 32767
    em = json.loads((DATOS_LUNA / "efemerides-luna.json").read_text(encoding="utf8"))
    tabla = np.fromfile(DATOS_LUNA / em["archivo"], dtype="<f4").reshape(em["filas"], 8)[:, [0, 1, 2, 4, 5, 6]]
    err = np.degrees(np.abs(q - tabla).max() * 2)
    (ok if err < 0.005 else mal)(f"Efemérides embebidas ({E['filas']} filas): error máx. por cuantización {err:.4f}°")
    return q, E


def horizons(params):
    base = {"format": "json", "MAKE_EPHEM": "YES", "EPHEM_TYPE": "OBSERVER", "OBJ_DATA": "NO", "QUANTITIES": "'14'", "ANG_FORMAT": "DEG", "CSV_FORMAT": "YES"}
    base.update(params)
    url = HORIZONS + "?" + urllib.parse.urlencode(base)
    # curl usa el almacén de certificados del sistema (en redes con proxy, Python a veces no valida el certificado)
    r = json.loads(subprocess.run(["curl", "-sS", "--max-time", "90", url], capture_output=True, check=True).stdout)
    txt = r["result"]
    filas = txt[txt.index("$$SOE") + 5: txt.index("$$EOE")].strip().splitlines()
    out = []
    for f in filas:
        c = [x.strip() for x in f.split(",")]
        t = datetime.strptime(c[0], "%Y-%b-%d %H:%M").replace(tzinfo=timezone.utc)
        nums = [float(x) for x in c[1:] if re.fullmatch(r"-?\d+(\.\d+)?", x)]
        out.append((t, nums[0], nums[1]))
    return out


def vec(lat, lon):
    f, l = math.radians(lat), math.radians(lon)
    return np.array([math.cos(f) * math.cos(l), math.cos(f) * math.sin(l), math.sin(f)])


def prueba_horizons(q, E):
    print("\nE. JPL Horizons en vivo")
    t0 = datetime.fromisoformat(E["inicioUTC"].replace("Z", "+00:00"))
    def interp(t, k):
        x = (t - t0).total_seconds() / E["pasoS"]; i = int(x); u = x - i
        v = q[i, k:k + 3] * (1 - u) + q[i + 1, k:k + 3] * u
        return v / np.linalg.norm(v)
    comunes = {"START_TIME": "'2026-02-03 07:30'", "STOP_TIME": "'2030-10-20 07:30'", "STEP_SIZE": "'173 d'"}
    for nombre, centro, k in [("subsolar (Sol en la Luna)", "'500@10'", 0), ("sub-Tierra (Tierra en la Luna)", "'500@399'", 3)]:
        try:
            filas = horizons({"COMMAND": "'301'", "CENTER": centro, **comunes})
        except Exception as e:
            aviso(f"Horizons {nombre}: sin respuesta ({e})"); continue
        errs = [math.degrees(math.acos(min(1, float(interp(t, k) @ vec(la, lo))))) for t, lo, la in filas]
        (ok if max(errs) < 0.1 else mal)(f"Punto {nombre}: {len(errs)} fechas 2026–2030, error máx. {max(errs):.3f}°")
    # Cara de la Tierra que mira a la Luna: misma fórmula que orientarTierra() en el mapa
    try:
        filas = horizons({"COMMAND": "'399'", "CENTER": "'500@301'", **comunes})
    except Exception as e:
        aviso(f"Horizons punto sublunar: sin respuesta ({e})"); return
    errs = []
    for t, lo, la in filas:
        d = (t - datetime(2000, 1, 1, 12, tzinfo=timezone.utc)).total_seconds() / 86400
        Lp, Mp, F = 218.316 + 13.176396 * d, 134.963 + 13.064993 * d, 93.272 + 13.229350 * d
        lam = math.radians(Lp + 6.289 * math.sin(math.radians(Mp))); bet = math.radians(5.128 * math.sin(math.radians(F))); eps = math.radians(23.439)
        ra = math.atan2(math.sin(lam) * math.cos(eps) - math.tan(bet) * math.sin(eps), math.cos(lam))
        dec = math.asin(math.sin(bet) * math.cos(eps) + math.cos(bet) * math.sin(eps) * math.sin(lam))
        gmst = math.radians(280.46061837 + 360.98564736629 * d)
        lon_m = math.degrees(ra - gmst)
        # Horizons: Tierra en ITRF93, longitud este positiva (la misma convención del mapa)
        errs.append(math.degrees(math.acos(min(1, float(vec(math.degrees(dec), lon_m) @ vec(la, lo))))))
    (ok if max(errs) < 3 else mal)(f"Cara de la Tierra hacia la Luna (dibujo): {len(errs)} fechas, error máx. {max(errs):.2f}° (tolerancia 3°)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nssdca"); ap.add_argument("--dbf"); ap.add_argument("--sin-red", action="store_true")
    ap.add_argument("--enlaces", action="store_true", help="abrir cada enlace de fuente y revisar su contenido")
    a = ap.parse_args()
    D = datos_mapa()
    prueba_nssdca(D, a.nssdca)
    prueba_enlaces(D)
    if a.enlaces: prueba_enlaces_en_linea(D)
    prueba_pgda(D)
    prueba_iau(D, a.dbf)
    q, E = prueba_rejillas(D)
    if not a.sin_red: prueba_horizons(q, E)
    print(f"\nResultado: {len(oks)} OK, {len(fallos)} fallas, {len(avisos)} avisos")
    sys.exit(1 if fallos else 0)


if __name__ == "__main__":
    main()
