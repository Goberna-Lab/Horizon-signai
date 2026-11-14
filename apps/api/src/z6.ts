import { Hono } from "hono"
import { timingSafeEqual } from "node:crypto"
import type { Z6Respuesta } from "@horizon-signai/shared"

// Cliente de la Z6 (Ollama, solo escucha en la IP del tailnet). VPS2 llega por Tailscale.
const z6Url = () => process.env.Z6_URL ?? "http://100.82.117.21:11434"
const z6Modelo = () => process.env.Z6_MODELO ?? "qwen3.6:27b"
const TIMEOUT_MS = Number(process.env.Z6_TIMEOUT_MS ?? 120_000)
const MAX_BYTES = 64 * 1024

const igual = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export const z6 = new Hono()
  // El dominio es público y esto gasta la GPU de la Z6: sin API_TOKEN configurado, cerrado.
  .use("*", async (c, next) => {
    const token = process.env.API_TOKEN
    if (!token) return c.json({ ok: false, error: "API_TOKEN sin configurar" }, 503)
    const dado = (c.req.header("authorization") ?? "").replace(/^Bearer /, "")
    if (!igual(dado, token)) return c.json({ ok: false, error: "No autorizada" }, 401)
    await next()
  })
  .get("/ping", async (c) => {
    const t = performance.now()
    try {
      const r = await fetch(`${z6Url()}/api/tags`, { signal: AbortSignal.timeout(8_000) })
      return c.json({ ok: r.ok, z6: z6Url(), ms: Math.round(performance.now() - t) })
    } catch (e) {
      return c.json({ ok: false, z6: z6Url(), error: String(e) }, 502)
    }
  })
  .post("/", async (c) => {
    const crudo = await c.req.text()
    if (crudo.length > MAX_BYTES) return c.json({ ok: false, error: "JSON demasiado grande" }, 413)
    let entrada: unknown
    try {
      entrada = JSON.parse(crudo)
    } catch {
      return c.json({ ok: false, error: "El cuerpo no es JSON" }, 400)
    }

    const t = performance.now()
    try {
      const r = await fetch(`${z6Url()}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({
          model: z6Modelo(),
          stream: false,
          think: false,
          messages: [
            {
              role: "system",
              content:
                "Eres el asistente de Horizon Signai. Recibes un JSON del backend y respondes en español, breve y directo.",
            },
            { role: "user", content: JSON.stringify(entrada) },
          ],
        }),
      })
      if (!r.ok) return c.json({ ok: false, error: `Z6 respondió ${r.status}` }, 502)
      const d = (await r.json()) as { message?: { content?: string } }
      return c.json({
        ok: true,
        modelo: z6Modelo(),
        respuesta: d.message?.content ?? "",
        ms: Math.round(performance.now() - t),
      } satisfies Z6Respuesta)
    } catch (e) {
      return c.json({ ok: false, error: `No se pudo hablar con la Z6: ${String(e)}` }, 502)
    }
  })
