import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import type { Context } from "hono"
import { esFalloDeConexion } from "./db.js"
import { manifiesto } from "./index.js"

/**
 * `/mapa-3d.html` servido por la API: la plantilla generada (`apps/web/public/mapa-3d.html`) con el manifiesto
 * (URLs versionadas de los activos, parámetros de las rejillas, procedencia) incrustado en el HTML y los
 * `<link rel="preload">` de lo necesario para el primer dibujo. Así el visor no espera al viaje de `/meta`.
 * Si la base no responde, se sirve la plantilla tal cual y el visor cae a su ruta antigua (`/meta`, con su mensaje de error).
 */
const plantillaRuta = process.env.WEB_DIST
  ? join(process.env.WEB_DIST, "mapa-3d.html")
  : fileURLToPath(new URL("../../../web/public/mapa-3d.html", import.meta.url))

let plantilla: { mtime: number; html: string } | null = null
async function leerPlantilla(): Promise<string> {
  const { mtimeMs } = await stat(plantillaRuta)
  if (!plantilla || plantilla.mtime !== mtimeMs) plantilla = { mtime: mtimeMs, html: await readFile(plantillaRuta, "utf8") }
  return plantilla.html
}

// En un <script> JSON: `<` y los separadores de línea Unicode se escapan como \uXXXX
const PELIGROSOS = new RegExp("[<" + String.fromCharCode(0x2028, 0x2029) + "]", "g")
const MARCA = "<!--__MAP3D_BOOT__-->"
const esc = (s: string) => s.replace(/"/g, "&quot;").replace(/&/g, "&amp;")
// Primer dibujo: globo (relieve + albedo), efemérides, paquete de sitios/IAU/horizontes y las dos texturas.
// El polo sur (~4 MB) NO se precarga: el visor lo pide después del primer dibujo.
const FETCH = ["global_elevation", "global_albedo", "ephemeris_de441"]
const IMAGENES = ["gradient16", "earth_texture"]

export async function paginaMapa3d(c: Context): Promise<Response> {
  let html = await leerPlantilla()
  let arranque = ""
  try {
    if (process.env.DATABASE_URL) {
      const m = await manifiesto()
      const json = JSON.stringify(m).replace(PELIGROSOS, (ch) => String.fromCharCode(92) + "u" + ch.charCodeAt(0).toString(16).padStart(4, "0"))
      const enlaces: string[] = []
      const url = (k: string) => m.assets[k]?.url as string | undefined
      for (const k of FETCH) if (url(k)) enlaces.push(`<link rel="preload" as="fetch" crossorigin href="${esc(url(k)!)}">`)
      enlaces.push(`<link rel="preload" as="fetch" crossorigin href="${esc(m.dataUrl)}">`)
      for (const k of IMAGENES) if (url(k)) enlaces.push(`<link rel="preload" as="image" href="${esc(url(k)!)}">`)
      arranque = `${enlaces.join("\n")}\n<script type="application/json" id="map3d-manifest">${json}</script>`
    }
  } catch (e) {
    if (!esFalloDeConexion(e)) console.error("mapa-3d.html:", e)
    // sin manifiesto: el visor usa /api/map3d/meta
  }
  html = html.replace(MARCA, arranque)
  const etag = `"${createHash("sha256").update(html).digest("hex").slice(0, 16)}"`
  if (c.req.header("If-None-Match")?.split(",").some((x) => x.trim().replace(/^W\//, "") === etag))
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-cache" } })
  c.header("ETag", etag)
  c.header("Cache-Control", "no-cache")
  return c.html(html)
}
