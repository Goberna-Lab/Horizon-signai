import { hc } from "hono/client"
import type { AppType } from "@horizon-signai/api"

export const api = hc<AppType>("/")
