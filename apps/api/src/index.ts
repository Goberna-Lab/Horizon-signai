import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"
import { compress } from "hono/compress"
import { readFile } from "node:fs/promises"
import type { IncomingMessage, Server, ServerResponse } from "node:http"
import { join } from "node:path"
import { Agent, setGlobalDispatcher } from "undici"
import api from "./app.js"
import { paginaMapa3d } from "./map3d/pagina.js"
import { servirLunarMap } from "./lunar-map/estaticos.js"

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

// El prototipo estático del Dashboard y el Planificador (prototipos/lunar-map/) se sirve tal cual en /lunar-map/,
// también en desarrollo (Vite lo reenvía aquí). Va antes del fallback de SPA. La pantalla de React es /planner.
app.on(["GET", "HEAD"], ["/lunar-map", "/lunar-map/*"], servirLunarMap)

if (webDist) {
  // three.js y demás archivos con hash en el nombre: caché de un año (Cloudflare también los cachea por la extensión .js).
  // La voz grabada de EVA: cada archivo se llama por la huella de su idioma y su texto (eva/vozGrabada.ts), así que no
  // cambia nunca. Sin esto cada frase se volvía a pedir a VPS2 (~0,3-0,5 s de ida y vuelta desde Perú).
  app.use("/eva-voz/*", async (c, next) => {
    await next()
    if (c.res.status === 200) c.res.headers.set("Cache-Control", "public, max-age=31536000, immutable")
  })
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

const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`API en http://localhost:${info.port}`)
})

// Apagado ordenado (deploy sin cortes, deploy/README.md): al recibir SIGTERM deja de aceptar conexiones
// —nginx reintenta esas en la otra copia— y termina las que tiene en curso, como una respuesta del asistente
// que todavía se está transmitiendo. El tope de 125 s cubre el proxy_read_timeout de 120 s de nginx y queda
// por debajo del stop_grace_period del compose, para que Docker no tenga que matarla.
//
// Las conexiones keep-alive no se esperan: nginx no le manda `Connection: close` a la app y el proxy de puertos
// de Docker no le pasa a la app el cierre de nginx, así que una conexión ya servida queda abierta del lado de
// la app. En VPS2, una que había servido un stream retuvo el apagado los 125 s enteros (medido 2026-11-15).
// Por eso, mientras se apaga, cada respuesta que termina cierra su conexión, y las ociosas se cierran cada segundo.
const http = server as Server
let apagando = false
http.on("request", (req: IncomingMessage, res: ServerResponse) => {
  res.on("finish", () => {
    if (apagando) req.socket.end()
  })
})
const apagar = (senal: string) => {
  if (apagando) return
  apagando = true
  console.log(`${senal}: no acepto conexiones nuevas; termino las que están en curso`)
  const inicio = Date.now()
  http.close(() => {
    console.log(`apagado ordenado en ${((Date.now() - inicio) / 1000).toFixed(1)} s`)
    process.exit(0)
  })
  setInterval(() => http.closeIdleConnections(), 1000).unref()
  setTimeout(() => {
    console.log("apagado forzado a los 125 s: quedaban conexiones abiertas")
    process.exit(0)
  }, 125_000).unref()
}
process.on("SIGTERM", () => apagar("SIGTERM"))
process.on("SIGINT", () => apagar("SIGINT"))
