import { Hono } from "hono"
import type { Health } from "@horizon-signai/shared"
import { map3d } from "./map3d/index.js"
import { z6 } from "./z6.js"

const app = new Hono()
  .basePath("/api")
  .get("/health", (c) => c.json({ ok: true } satisfies Health))
  .route("/z6", z6)
  .route("/map3d", map3d)

export type AppType = typeof app
export default app
