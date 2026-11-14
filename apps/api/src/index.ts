import { serve } from "@hono/node-server"
import app from "./app.js"

serve({ fetch: app.fetch, port: 3000 }, (info) => {
  console.log(`API en http://localhost:${info.port}`)
})
