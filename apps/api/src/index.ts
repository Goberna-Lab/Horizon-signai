import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"
import { compress } from "hono/compress"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { Agent, setGlobalDispatcher } from "undici"
import api from "./app.js"
import { paginaMapa3d } from "./map3d/pagina.js"

// VPS2 está en Alemania y la Z6 y Geografo en Perú: cada ida y vuelta cuesta ~180 ms. Con el agente
// por defecto de fetch, la conexión se cierra a los 4 s sin uso y el pedido siguiente paga otra ida y
// vuelta para abrirla. Así quedan abiertas mientras dura una conversación (voz/LEEME.md, «Red»).
setGlobalDispatcher(new Agent({ keepAliveTimeout: 60_000, keepAliveMaxTimeout: 600_000 }))

const port = Number(process.env.PORT ?? 3000)
// En producción el mismo proceso sirve el bundle de Vite (WEB_DIST).
// En desarrollo no se define y Vite hace de proxy hacia /api.
const webDist = process.env.WEB_DIST

const app = new Hono().route("/", api)

// El visor del mapa 3D lo sirve la API (manifiesto incrustado + preloads); va antes que el servidor estático.
app.get("/mapa-3d.html", compress(), paginaMapa3d)

if (webDist) {
  // three.js y demás archivos con hash en el nombre: caché de un año (Cloudflare también los cachea por la extensión .js).
  app.use("/vendor/*", async (c, next) => {
    await next()
    if (c.res.status === 200) c.res.headers.set("Cache-Control", "public, max-age=31536000, immutable")
  })
  app.use("/*", serveStatic({ root: webDist }))
  // Fallback de SPA: cualquier ruta que no sea archivo ni /api devuelve index.html
  app.get("*", async (c) =>
    c.html(await readFile(join(webDist, "index.html"), "utf8")),
  )
}

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`API en http://localhost:${info.port}`)
})
