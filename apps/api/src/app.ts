import { Hono } from "hono"
import type { Health } from "@horizon-signai/shared"
import { z6 } from "./z6.js"

const app = new Hono()
  .basePath("/api")
  .get("/health", (c) => c.json({ ok: true } satisfies Health))
  .route("/z6", z6)

export type AppType = typeof app
export default app
