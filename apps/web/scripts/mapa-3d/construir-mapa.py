"""Construye apps/web/public/mapa-3d.html (pantalla /3d-map): un solo archivo con el visor y su three.js.

Los datos ya NO van dentro: el visor los pide a /api/map3d (PostgreSQL, esquema en db/). Aquí solo se empaqueta
three.js (el de node_modules, con esbuild, en un solo módulo) como módulo data: en un import map y se inyecta en
mapa.src.html. Los archivos de esta carpeta (sitios.json, iau-nombres.json, gradiente16.*, tierra-bluemarble.jpg)
y luna-recursos/datos/ son la fuente con la que se carga la base (ver db/etl).

Uso (desde la raíz del repo, con `npm ci` hecho):  python apps/web/scripts/mapa-3d/construir-mapa.py
"""
import base64
import os
import subprocess
import tempfile
from pathlib import Path

AQUI = Path(__file__).resolve().parent
WEB = AQUI.parent.parent
REPO = WEB.parent.parent


def main() -> None:
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
    html = html.replace("__THREE_URL__", durl)
    assert "/*__DATOS__*/" not in html
    salida = WEB / "public" / "mapa-3d.html"
    salida.parent.mkdir(exist_ok=True)
    salida.write_text(html, encoding="utf8")
    print(f"-> {salida} ({salida.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
