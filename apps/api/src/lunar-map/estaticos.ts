import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { readFile, stat } from "node:fs/promises"
import { extname, join, normalize, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { Readable } from "node:stream"
import type { Context } from "hono"

/**
 * Sirve el prototipo estático `prototipos/lunar-map/` en `/lunar-map/*` (única copia: lo siguen editando ahí).
 * La ruta sale de la ubicación de este archivo, no del cwd: apps/api/src/lunar-map -> raíz del repo.
 *
 * Caché: Cloudflare guarda en el navegador los .css/.js/.png hasta 4 h aunque aquí digan `no-cache` (por extensión),
 * así que tras un deploy el HTML nuevo podía llegar con el CSS viejo. Por eso:
 * - El HTML (que Cloudflare no guarda) sale con cada CSS, JS e imagen local versionado: `shared.css?v=<hash>`, con el
 *   hash del contenido. Si el archivo cambia, cambia la dirección y nadie usa la copia vieja. Su ETag sale del HTML ya
 *   reescrito, así que cambia también cuando solo cambió un archivo enlazado.
 * - Pedido con su versión vigente, el archivo se sirve `immutable` (un año). Sin versión, o con una vieja, `no-cache`.
 * - `/ui/...` (display caps) lo sirve el bundle de la web (WEB_DIST); se versiona si ese archivo está a mano.
 */
const RAIZ = fileURLToPath(new URL("../../../../prototipos/lunar-map/", import.meta.url))
const INICIO = "inicio.html"
const INMUTABLE = "public, max-age=31536000, immutable"

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

/** Hash corto del contenido, recordado mientras el archivo no cambie de tamaño ni de fecha. */
const versiones = new Map<string, { clave: string; v: string }>()
async function versionDe(ruta: string): Promise<string | null> {
  const info = await stat(ruta).catch(() => null)
  if (!info?.isFile()) return null
  const clave = `${info.size}-${info.mtimeMs}`
  const hecha = versiones.get(ruta)
  if (hecha?.clave === clave) return hecha.v
  const v = createHash("sha256").update(await readFile(ruta)).digest("hex").slice(0, 10)
  versiones.set(ruta, { clave, v })
  return v
}

/** Dónde está en disco lo que el HTML enlaza (`shared.css`, `data/zonas.js`, `/ui/display-caps.css`), o null si no se versiona. */
function rutaEnlazada(ref: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:|^\/\/|[?#]/i.test(ref)) return null // externo, o ya trae consulta o ancla
  const ext = extname(ref).toLowerCase()
  if (!TIPOS[ext] || ext === ".html") return null // las páginas no: sus direcciones las ve quien navega
  if (ref.startsWith("/ui/")) {
    const web = process.env.WEB_DIST
    return web ? normalize(join(web, ref.slice(1))) : null
  }
  if (ref.startsWith("/")) return null
  const ruta = normalize(join(RAIZ, ref))
  return ruta.startsWith(RAIZ) ? ruta : null
}

async function versionarHtml(html: string): Promise<string> {
  const refs = new Set<string>()
  for (const m of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) refs.add(m[1])
  const nuevas = new Map<string, string>()
  await Promise.all(
    [...refs].map(async (ref) => {
      const ruta = rutaEnlazada(ref)
      const v = ruta && (await versionDe(ruta))
      if (v) nuevas.set(ref, `${ref}?v=${v}`)
    }),
  )
  return html.replace(/\b(src|href)="([^"]+)"/g, (todo, attr: string, ref: string) =>
    nuevas.has(ref) ? `${attr}="${nuevas.get(ref)}"` : todo,
  )
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
  const ext = extname(ruta).toLowerCase()
  const tipo = TIPOS[ext]
  if (!tipo) return c.notFound()

  const info = await stat(ruta).catch(() => null)
  if (!info?.isFile()) return c.notFound()

  // Las páginas: con sus archivos versionados; el ETag, del resultado.
  if (ext === ".html") {
    const cuerpo = await versionarHtml(await readFile(ruta, "utf8"))
    const etag = `W/"${createHash("sha256").update(cuerpo).digest("hex").slice(0, 16)}"`
    const cabeceras = { "Content-Type": tipo, "Cache-Control": "no-cache", ETag: etag }
    if (c.req.header("if-none-match") === etag) return new Response(null, { status: 304, headers: cabeceras })
    const bytes = Buffer.from(cuerpo, "utf8")
    if (c.req.method === "HEAD") return new Response(null, { headers: { ...cabeceras, "Content-Length": String(bytes.length) } })
    return new Response(bytes, { headers: { ...cabeceras, "Content-Length": String(bytes.length) } })
  }

  const pedida = url.searchParams.get("v")
  const vigente = pedida !== null && pedida === (await versionDe(ruta))
  const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`
  const cabeceras = {
    "Content-Type": tipo,
    "Cache-Control": vigente ? INMUTABLE : "no-cache",
    ETag: etag,
    "Last-Modified": info.mtime.toUTCString(),
  }
  if (c.req.header("if-none-match") === etag) return new Response(null, { status: 304, headers: cabeceras })
  if (c.req.method === "HEAD") return new Response(null, { headers: { ...cabeceras, "Content-Length": String(info.size) } })
  return new Response(Readable.toWeb(createReadStream(ruta)) as ReadableStream, {
    headers: { ...cabeceras, "Content-Length": String(info.size) },
  })
}
