import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { extname, join, normalize, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { Readable } from "node:stream"
import type { Context } from "hono"

/**
 * Sirve el prototipo estático `prototipos/lunar-map/` en `/lunar-map/*` (única copia: lo siguen editando ahí).
 * La ruta sale de la ubicación de este archivo, no del cwd: apps/api/src/lunar-map -> raíz del repo.
 * Los archivos no llevan hash en el nombre: `no-cache` + ETag/Last-Modified, para revalidar siempre (304 si no cambió).
 */
const RAIZ = fileURLToPath(new URL("../../../../prototipos/lunar-map/", import.meta.url))
const INICIO = "inicio.html"

const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
}

export async function servirLunarMap(c: Context) {
  const url = new URL(c.req.url)
  // `/lunar-map` sin barra: las rutas relativas del prototipo necesitan la barra final.
  if (url.pathname === "/lunar-map") return c.redirect(`/lunar-map/${url.search}`, 302)

  let rel: string
  try {
    rel = decodeURIComponent(url.pathname.slice("/lunar-map/".length))
  } catch {
    return c.notFound()
  }
  if (rel === "" || rel.endsWith("/")) rel += INICIO
  if (rel.includes("\0")) return c.notFound()

  const ruta = normalize(join(RAIZ, rel))
  // Nada fuera de la carpeta del prototipo, ni sus herramientas de desarrollo.
  if (!ruta.startsWith(RAIZ) || ruta.slice(RAIZ.length).split(sep)[0] === "tools") return c.notFound()
  const tipo = TIPOS[extname(ruta).toLowerCase()]
  if (!tipo) return c.notFound()

  const info = await stat(ruta).catch(() => null)
  if (!info?.isFile()) return c.notFound()

  const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`
  const cabeceras = {
    "Content-Type": tipo,
    "Cache-Control": "no-cache",
    ETag: etag,
    "Last-Modified": info.mtime.toUTCString(),
  }
  if (c.req.header("if-none-match") === etag) return new Response(null, { status: 304, headers: cabeceras })
  if (c.req.method === "HEAD") return new Response(null, { headers: { ...cabeceras, "Content-Length": String(info.size) } })
  return new Response(Readable.toWeb(createReadStream(ruta)) as ReadableStream, {
    headers: { ...cabeceras, "Content-Length": String(info.size) },
  })
}
