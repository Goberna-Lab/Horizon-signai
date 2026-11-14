import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import api from "./app.js"

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
