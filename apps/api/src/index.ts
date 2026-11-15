import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { Agent, setGlobalDispatcher } from "undici"
import api from "./app.js"

// VPS2 está en Alemania y la Z6 y Geografo en Perú: cada ida y vuelta cuesta ~180 ms. Con el agente
// por defecto de fetch, la conexión se cierra a los 4 s sin uso y el pedido siguiente paga otra ida y
// vuelta para abrirla. Así quedan abiertas mientras dura una conversación (voz/LEEME.md, «Red»).
setGlobalDispatcher(new Agent({ keepAliveTimeout: 60_000, keepAliveMaxTimeout: 600_000 }))

const port = Number(process.env.PORT ?? 3000)
// En producción el mismo proceso sirve el bundle de Vite (WEB_DIST).
// En desarrollo no se define y Vite hace de proxy hacia /api.
const webDist = process.env.WEB_DIST

const app = new Hono().route("/", api)

if (webDist) {
  app.use("/*", serveStatic({ root: webDist }))
  // Fallback de SPA: cualquier ruta que no sea archivo ni /api devuelve index.html
  app.get("*", async (c) =>
    c.html(await readFile(join(webDist, "index.html"), "utf8")),
  )
}

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`API en http://localhost:${info.port}`)
})
