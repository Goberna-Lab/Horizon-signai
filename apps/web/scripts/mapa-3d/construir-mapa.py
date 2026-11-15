"""Construye apps/web/public/mapa-3d.html (pantalla /3d-map): el visor (un solo HTML) y su three.js (public/vendor/three-<hash>.js).

Los datos ya NO van dentro: el visor los pide a /api/map3d (PostgreSQL, esquema en db/). Aquí solo se empaqueta
three.js (el de node_modules, con esbuild, en un solo módulo) en un archivo con hash en public/vendor/, que el import map
de mapa.src.html referencia. Los archivos de esta carpeta (sitios.json, iau-nombres.json, gradiente16.*, tierra-bluemarble.jpg)
y luna-recursos/datos/ son la fuente con la que se carga la base (ver db/etl).

Uso (desde la raíz del repo, con `npm ci` hecho):  python apps/web/scripts/mapa-3d/construir-mapa.py
"""
import hashlib
import os
import subprocess
import tempfile
from pathlib import Path

AQUI = Path(__file__).resolve().parent
WEB = AQUI.parent.parent
REPO = WEB.parent.parent


def main() -> None:
    # three.js + OrbitControls en un solo módulo ESM (desde r171 three se reparte en varios archivos que se importan entre sí). Ambos especificadores del import map
    # apuntan al mismo módulo, así hay una sola instancia de three.
    with tempfile.TemporaryDirectory() as tmp:
        entrada, salida_js = Path(tmp) / "three-mapa.js", Path(tmp) / "three-mapa.min.js"
        entrada.write_text('export * from "three"\nexport { OrbitControls } from "three/addons/controls/OrbitControls.js"\n', encoding="utf8")
        subprocess.run(["node", str(REPO / "node_modules/esbuild/bin/esbuild"), str(entrada), "--bundle", "--format=esm", "--minify",
                        "--legal-comments=inline", f"--outfile={salida_js}"], cwd=REPO, check=True,
                       env={**os.environ, "NODE_PATH": str(REPO / "node_modules")})
        modulo = salida_js.read_bytes()
    # three.js va en un archivo aparte con el hash en el nombre (public/vendor/three-<hash8>.js): el navegador y Cloudflare
    # lo cachean un año y no se vuelve a bajar mientras no cambie. Se borran los three-*.js anteriores.
    nombre = f"three-{hashlib.sha256(modulo).hexdigest()[:8]}.js"
    vendor = WEB / "public" / "vendor"
    vendor.mkdir(parents=True, exist_ok=True)
    for viejo in vendor.glob("three-*.js"):
        if viejo.name != nombre:
            viejo.unlink()
    (vendor / nombre).write_bytes(modulo)
    print(f"-> {vendor / nombre} ({len(modulo) / 1e6:.2f} MB)")
    durl = f"/vendor/{nombre}"

    html = (AQUI / "mapa.src.html").read_text(encoding="utf8")
    html = html.replace("__THREE_URL__", durl)
    assert "/*__DATOS__*/" not in html
    salida = WEB / "public" / "mapa-3d.html"
    salida.parent.mkdir(exist_ok=True)
    salida.write_text(html, encoding="utf8")
    print(f"-> {salida} ({salida.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
