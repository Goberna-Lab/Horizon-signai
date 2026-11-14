import { Hono } from "hono"
import { timingSafeEqual } from "node:crypto"
import type { Z6Respuesta } from "@horizon-signai/shared"

// Cliente de la Z6 (Ollama, solo escucha en la IP del tailnet). VPS2 llega por Tailscale.
const z6Url = () => process.env.Z6_URL ?? "http://100.82.117.21:11434"
const z6Modelo = () => process.env.Z6_MODELO ?? "qwen3.6:27b"
const TIMEOUT_MS = Number(process.env.Z6_TIMEOUT_MS ?? 120_000)
const MAX_BYTES = 64 * 1024
// Servicio de voz de la Z6 (argus-voz: oír y hablar, en la CPU). Mismo patrón que Ollama.
const vozUrl = () => process.env.VOZ_URL ?? "http://100.82.117.21:8795"
const MAX_AUDIO = 5 * 1024 * 1024 // tope del servicio de voz
const MAX_TTS = 600

const SISTEMA_CHAT =
  "Eres el asistente de prueba de Horizon Signai. Respondes en español, claro y directo."
const SISTEMA_VOZ =
  "Eres el asistente de voz de Horizon Signai. Estás hablando en voz alta: responde en español, " +
  "en una a tres frases cortas, sin listas, sin markdown, sin emojis y sin símbolos raros."

type Mensaje = { role: "user" | "assistant"; content: string }

// Corta en un final de frase para no pasar del tope del servicio de voz.
const paraHablar = (t: string) => {
  const limpio = t.replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim()
  if (limpio.length <= MAX_TTS) return limpio
  const corte = limpio.slice(0, MAX_TTS)
  const fin = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf("? "), corte.lastIndexOf("! "))
  return fin > 100 ? corte.slice(0, fin + 1) : corte
}

const preguntar = async (mensajes: Mensaje[], voz: boolean) => {
  const r = await fetch(`${z6Url()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: z6Modelo(),
      stream: false,
      think: false,
      messages: [{ role: "system", content: voz ? SISTEMA_VOZ : SISTEMA_CHAT }, ...mensajes],
    }),
  })
  if (!r.ok) throw new Error(`Z6 respondió ${r.status}`)
  const d = (await r.json()) as { message?: { content?: string } }
  return d.message?.content ?? ""
}

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
  // Conversación: recibe el historial completo (el cliente lo guarda) y devuelve la respuesta.
  .post("/chat", async (c) => {
    const cuerpo = (await c.req.json().catch(() => null)) as { messages?: Mensaje[]; voz?: boolean } | null
    const msgs = (cuerpo?.messages ?? [])
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    if (!msgs.length || msgs[msgs.length - 1].role !== "user")
      return c.json({ ok: false, error: "messages debe terminar en un mensaje de user" }, 400)
    const t = performance.now()
    try {
      const respuesta = await preguntar(msgs, cuerpo?.voz === true)
      return c.json({ ok: true, modelo: z6Modelo(), respuesta, ms: Math.round(performance.now() - t) })
    } catch (e) {
      return c.json({ ok: false, error: `No se pudo hablar con la Z6: ${String(e)}` }, 502)
    }
  })
  // Oído: audio crudo (webm/opus, ogg, wav) → texto.
  .post("/transcribir", async (c) => {
    const token = process.env.VOZ_TOKEN
    if (!token) return c.json({ ok: false, error: "VOZ_TOKEN sin configurar" }, 503)
    const audio = await c.req.arrayBuffer()
    if (!audio.byteLength || audio.byteLength > MAX_AUDIO)
      return c.json({ ok: false, error: "Audio vacío o mayor a 5 MB" }, 413)
    try {
      const r = await fetch(`${vozUrl()}/v1/transcribir`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": c.req.header("content-type") ?? "audio/webm",
          "X-Idioma": "es",
        },
        body: audio,
        signal: AbortSignal.timeout(30_000),
      })
      if (!r.ok) return c.json({ ok: false, error: `Voz respondió ${r.status}` }, 502)
      const d = (await r.json()) as { texto?: string; ms?: number }
      return c.json({ ok: true, texto: (d.texto ?? "").trim(), ms: d.ms ?? 0 })
    } catch (e) {
      return c.json({ ok: false, error: `No se pudo hablar con la voz de la Z6: ${String(e)}` }, 502)
    }
  })
  // Boca: texto → audio/wav.
  .post("/hablar", async (c) => {
    const token = process.env.VOZ_TOKEN
    if (!token) return c.json({ ok: false, error: "VOZ_TOKEN sin configurar" }, 503)
    const cuerpo = (await c.req.json().catch(() => null)) as { texto?: string } | null
    const texto = paraHablar(cuerpo?.texto ?? "")
    if (!texto) return c.json({ ok: false, error: "texto vacío" }, 400)
    try {
      const r = await fetch(`${vozUrl()}/v1/hablar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ texto, voz: "es-ivi" }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!r.ok) return c.json({ ok: false, error: `Voz respondió ${r.status}` }, 502)
      return new Response(await r.arrayBuffer(), { headers: { "Content-Type": "audio/wav" } })
    } catch (e) {
      return c.json({ ok: false, error: `No se pudo hablar con la voz de la Z6: ${String(e)}` }, 502)
    }
  })
