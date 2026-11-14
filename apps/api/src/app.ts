import { Hono } from "hono"
import type { Health } from "@horizon-signai/shared"

const app = new Hono()
  .basePath("/api")
  .get("/health", (c) => c.json({ ok: true } satisfies Health))

export type AppType = typeof app
export default app
