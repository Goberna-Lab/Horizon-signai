import { Hono } from "hono"
import { timingSafeEqual } from "node:crypto"
import type { Z6Respuesta } from "@horizon-signai/shared"

// Cliente de la Z6 (Ollama, solo escucha en la IP del tailnet). VPS2 llega por Tailscale.
const z6Url = () => process.env.Z6_URL ?? "http://100.82.117.21:11434"
const z6Modelo = () => process.env.Z6_MODELO ?? "qwen3.6:27b"
// El chat de TEXTO corre en Geografo (A4000, 16 GB): ahí cabe un modelo de ~8B entero en GPU.
// La conversación por VOZ se queda en la Z6, que mide 8× más en el 27B.
const textoUrl = () => process.env.TEXTO_URL ?? "http://100.117.204.80:11434"
const textoModelo = () => process.env.TEXTO_MODELO ?? "qwen3:8b"
const TIMEOUT_MS = Number(process.env.Z6_TIMEOUT_MS ?? 120_000)
const MAX_BYTES = 64 * 1024
// Voz del chat. Con HVOZ_URL: horizon-voz en Geografo (inglés, Qwen3-TTS «Ryan» en GPU + whisper
// small.en en CPU; ver voz/LEEME.md). Sin ella: argus-voz de Ivi en la Z6 (español, Piper), de respaldo.
type ServicioVoz = { url: string; token?: string; idioma: "en" | "es" }
const servicioVoz = (): ServicioVoz =>
  process.env.HVOZ_URL
    ? { url: process.env.HVOZ_URL, token: process.env.HVOZ_TOKEN, idioma: "en" }
    : { url: process.env.VOZ_URL ?? "http://100.82.117.21:8795", token: process.env.VOZ_TOKEN, idioma: "es" }
const MAX_AUDIO = 5 * 1024 * 1024 // tope del servicio de voz
const MAX_TTS = 600
const TIMEOUT_VOZ_MS = 60_000 // Ryan va a ~1,6× tiempo real: una frase larga puede tardar

const PUBLICAS = new Set(["/chat", "/chat/stream", "/transcribir", "/hablar", "/voz", "/voz/turno"])
// Un turno de voz son ~5 pedidos: oír, responder y una voz por frase.
const MAX_POR_MINUTO = Number(process.env.Z6_MAX_POR_MINUTO ?? 60)
const MAX_EN_VUELO = Number(process.env.Z6_MAX_EN_VUELO ?? 4)
let enVuelo = 0
const ventanas = new Map<string, number[]>()

// Detrás del proxy de Hestia: la IP real llega en X-Real-IP; si no, la última de X-Forwarded-For.
const ipDe = (h: Headers) =>
  h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",").pop()?.trim() ?? "desconocida"

const dejaPasar = (ip: string) => {
  const ahora = Date.now()
  const recientes = (ventanas.get(ip) ?? []).filter((t) => ahora - t < 60_000)
  if (recientes.length >= MAX_POR_MINUTO) {
    ventanas.set(ip, recientes)
    return false
  }
  recientes.push(ahora)
  ventanas.set(ip, recientes)
  if (ventanas.size > 5000) for (const [k, v] of ventanas) if (!v.some((t) => ahora - t < 60_000)) ventanas.delete(k)
  return true
}

const SISTEMA_CHAT =
  "Eres el asistente de prueba de Horizon Signai. Respondes en español, claro y directo."
const SISTEMA_VOZ: Record<ServicioVoz["idioma"], string> = {
  es:
    "Eres el asistente de voz de Horizon Signai. Estás hablando en voz alta: responde en español, " +
    "en una a tres frases cortas, sin listas, sin markdown, sin emojis y sin símbolos raros.",
  en:
    "You are the Horizon Signai voice assistant. You are speaking out loud: always answer in English, " +
    "in one to three short sentences, with no lists, no markdown, no emojis and no special symbols. " +
    "Always start with a very short first sentence of at most eight words, then continue. " +
    "Write numbers as words when they are short.",
}

type Mensaje = { role: "user" | "assistant"; content: string }

// Corta en un final de frase para no pasar del tope del servicio de voz.
const paraHablar = (t: string) => {
  const limpio = t.replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim()
  if (limpio.length <= MAX_TTS) return limpio
  const corte = limpio.slice(0, MAX_TTS)
  const fin = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf("? "), corte.lastIndexOf("! "))
  return fin > 100 ? corte.slice(0, fin + 1) : corte
}

// Historial que manda el navegador: solo roles válidos, los últimos 20, cada uno ≤ 4000 caracteres.
const limpiarMensajes = (cuerpo: unknown): Mensaje[] | null => {
  const crudos = (cuerpo as { messages?: unknown } | null)?.messages
  if (!Array.isArray(crudos)) return null
  const msgs = (crudos as Mensaje[])
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string")
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
  return msgs.length && msgs[msgs.length - 1].role === "user" ? msgs : null
}

const preguntar = async (mensajes: Mensaje[], voz: boolean) => {
  const url = voz ? z6Url() : textoUrl()
  const modelo = voz ? z6Modelo() : textoModelo()
  const r = await fetch(`${url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: modelo,
      stream: false,
      think: false,
      messages: [{ role: "system", content: voz ? SISTEMA_VOZ[servicioVoz().idioma] : SISTEMA_CHAT }, ...mensajes],
    }),
  })
  if (!r.ok) throw new Error(`${voz ? "Z6" : "Geografo"} respondió ${r.status}`)
  const d = (await r.json()) as { message?: { content?: string } }
  return { respuesta: d.message?.content ?? "", modelo, equipo: voz ? "Z6" : "Geografo" }
}

// ── Turno de voz en streaming ───────────────────────────────────────────────
// Lee la respuesta de la Z6 token a token y, apenas se completa una frase, la manda a la voz.
// Todo sale por una sola respuesta NDJSON, en orden:
//   {t:"texto", d}                                   cada trozo de texto que llega del modelo
//   {t:"frase", i, texto, mime, audio, palabras, dur} audio (base64) de la frase i y sus palabras
//                                                    [[texto, espacio, inicio_s, fin_s], …]
//   {t:"fin", respuesta, modelo, ms, primeraVozMs}   o {t:"error", msg}
// Así la voz empieza con la primera frase, no al final, y el navegador muestra cada palabra
// cuando se pronuncia.

const FORMATOS_VOZ = new Set(["opus", "mp3", "wav"])

// Saca del buffer las frases ya completas (fin de frase seguido de espacio: «3.5» no corta).
// La primera puede cortarse en una coma (desde 25 caracteres), para que la voz arranque antes;
// además el prompt de voz pide abrir con una frase corta (≤ 8 palabras).
export const cortarFrases = (buffer: string, esPrimera: boolean): [string[], string] => {
  const listas: string[] = []
  let resto = buffer
  for (;;) {
    let corte = -1
    const fin = resto.match(/^[\s\S]*?[.!?…]+["'”)\]]*(?=\s)/)
    if (fin) corte = fin[0].length
    else if (esPrimera && listas.length === 0) {
      const coma = /^[\s\S]{25,}?[,;:—](?=\s)/.exec(resto)
      if (coma) corte = coma[0].length
    }
    if (corte < 0) break
    const frase = resto.slice(0, corte).trim()
    resto = resto.slice(corte)
    if (frase) listas.push(frase)
  }
  return [listas, resto]
}

const turnoDeVoz = (msgs: Mensaje[], formato: string, señal: AbortSignal): Response => {
  const voz = servicioVoz()
  const enc = new TextEncoder()
  const corte = new AbortController()
  señal.addEventListener("abort", () => corte.abort())
  let ctl!: ReadableStreamDefaultController<Uint8Array>
  const emitir = (o: unknown) => {
    try {
      ctl.enqueue(enc.encode(`${JSON.stringify(o)}\n`))
    } catch {
      /* el navegador ya cortó */
    }
  }

  const producir = async () => {
    const t0 = performance.now()
    let primeraVozMs = 0
    let n = 0
    let cola: Promise<void> = Promise.resolve() // una frase a la vez y en orden
    const hablarFrase = (crudo: string) => {
      const i = n++
      const texto = paraHablar(crudo)
      if (!texto) return
      cola = cola.then(async () => {
        if (corte.signal.aborted) return
        const r = await fetch(`${voz.url}/v1/hablar`, {
          method: "POST",
          headers: { Authorization: `Bearer ${voz.token}`, "Content-Type": "application/json" },
          body: JSON.stringify(
            voz.idioma === "en" ? { texto, formato, palabras: true } : { texto, voz: "es-ivi" },
          ),
          signal: AbortSignal.any([corte.signal, AbortSignal.timeout(TIMEOUT_VOZ_MS)]),
        })
        if (!r.ok) throw new Error(`Voz respondió ${r.status}`)
        const audio = Buffer.from(await r.arrayBuffer()).toString("base64")
        const dur = Number(r.headers.get("x-duracion") ?? 0)
        let palabras: unknown = [[texto, "", 0, dur]]
        try {
          palabras = JSON.parse(r.headers.get("x-palabras") ?? "") as unknown
        } catch {
          /* argus-voz no da tiempos: la frase entera */
        }
        if (!primeraVozMs) primeraVozMs = Math.round(performance.now() - t0)
        emitir({ t: "frase", i, texto, mime: r.headers.get("content-type"), audio, palabras, dur })
      })
    }

    try {
      const r = await fetch(`${z6Url()}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.any([corte.signal, AbortSignal.timeout(TIMEOUT_MS)]),
        body: JSON.stringify({
          model: z6Modelo(),
          stream: true,
          think: false,
          messages: [{ role: "system", content: SISTEMA_VOZ[voz.idioma] }, ...msgs],
        }),
      })
      if (!r.ok || !r.body) throw new Error(`Z6 respondió ${r.status}`)
      const lector = r.body.getReader()
      const dec = new TextDecoder()
      let lineas = ""
      let buffer = ""
      let respuesta = ""
      for (;;) {
        const { done, value } = await lector.read()
        if (done) break
        lineas += dec.decode(value, { stream: true })
        const partes = lineas.split("\n")
        lineas = partes.pop() ?? ""
        for (const l of partes) {
          if (!l.trim()) continue
          const d = JSON.parse(l) as { message?: { content?: string }; error?: string }
          if (d.error) throw new Error(d.error)
          const delta = d.message?.content ?? ""
          if (!delta) continue
          respuesta += delta
          buffer += delta
          emitir({ t: "texto", d: delta })
          const [listas, resto] = cortarFrases(buffer, n === 0)
          buffer = resto
          listas.forEach(hablarFrase)
        }
      }
      if (buffer.trim()) hablarFrase(buffer)
      await cola
      emitir({ t: "fin", respuesta, modelo: z6Modelo(), ms: Math.round(performance.now() - t0), primeraVozMs })
    } catch (e) {
      if (!corte.signal.aborted) emitir({ t: "error", msg: String(e) })
    } finally {
      try {
        ctl.close()
      } catch {
        /* ya cerrado */
      }
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctl = c
      void producir()
    },
    cancel() {
      corte.abort()
    },
  })
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no", // que nginx no acumule el stream
    },
  })
}

const igual = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export const z6 = new Hono()
  // Rutas de la página /prueba-ia: abiertas, pero con tope por IP y de peticiones simultáneas.
  // El resto (POST / y /ping) exige API_TOKEN: el dominio es público y esto gasta la GPU de la Z6.
  .use("*", async (c, next) => {
    const ruta = new URL(c.req.url).pathname.replace(/^\/api\/z6/, "") || "/"
    if (PUBLICAS.has(ruta)) {
      if (!dejaPasar(ipDe(c.req.raw.headers))) {
        return c.json({ ok: false, error: "Demasiadas peticiones, espera un momento" }, 429)
      }
      if (enVuelo >= MAX_EN_VUELO) return c.json({ ok: false, error: "La IA está ocupada, reintenta" }, 503)
      enVuelo++
      try {
        return await next()
      } finally {
        enVuelo--
      }
    }
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
    const msgs = limpiarMensajes(cuerpo)
    if (!msgs) return c.json({ ok: false, error: "messages debe terminar en un mensaje de user" }, 400)
    const t = performance.now()
    try {
      const r = await preguntar(msgs, cuerpo?.voz === true)
      return c.json({ ok: true, ...r, ms: Math.round(performance.now() - t) })
    } catch (e) {
      return c.json({ ok: false, error: `No se pudo contactar a la IA: ${String(e)}` }, 502)
    }
  })
  // Chat de texto en streaming (Geografo): devuelve el texto en trozos a medida que se genera.
  // El modelo y el equipo viajan en cabeceras; un error a mitad llega como línea final «\n[error] …».
  .post("/chat/stream", async (c) => {
    const msgs = limpiarMensajes(await c.req.json().catch(() => null))
    if (!msgs) return c.json({ ok: false, error: "messages debe terminar en un mensaje de user" }, 400)
    const modelo = textoModelo()
    let r: Response
    try {
      r = await fetch(`${textoUrl()}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({
          model: modelo,
          stream: true,
          think: false,
          messages: [{ role: "system", content: SISTEMA_CHAT }, ...msgs],
        }),
      })
    } catch (e) {
      return c.json({ ok: false, error: `No se pudo contactar a la IA: ${String(e)}` }, 502)
    }
    if (!r.ok || !r.body) return c.json({ ok: false, error: `Geografo respondió ${r.status}` }, 502)

    const lector = r.body.getReader()
    const dec = new TextDecoder()
    const enc = new TextEncoder()
    let resto = ""
    const salida = new ReadableStream<Uint8Array>({
      // Lee hasta tener texto que entregar o hasta el final: un pull que no encola nada
      // no vuelve a ser llamado y el stream quedaría colgado (pasa con la línea final done:true).
      async pull(ctl) {
        try {
          for (;;) {
            const { done, value } = await lector.read()
            if (done) return ctl.close()
            resto += dec.decode(value, { stream: true })
            const lineas = resto.split("\n")
            resto = lineas.pop() ?? ""
            let texto = ""
            let fin = false
            for (const l of lineas) {
              if (!l.trim()) continue
              const d = JSON.parse(l) as { message?: { content?: string }; error?: string; done?: boolean }
              if (d.error) texto += `\n[error] ${d.error}`
              texto += d.message?.content ?? ""
              if (d.done) fin = true
            }
            if (texto) ctl.enqueue(enc.encode(texto))
            if (fin) {
              void lector.cancel()
              return ctl.close()
            }
            if (texto) return
          }
        } catch (e) {
          ctl.enqueue(enc.encode(`\n[error] ${String(e)}`))
          ctl.close()
        }
      },
      cancel: () => lector.cancel(),
    })
    return new Response(salida, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no", // que nginx no acumule el stream
        "X-Modelo": modelo,
        "X-Equipo": "Geografo",
      },
    })
  })
  // Qué voz atiende ahora (la página lo muestra y decide el idioma de sus textos).
  // En inglés le pregunta a horizon-voz qué motor y voz tiene cargados (cambian con HVOZ_MOTOR).
  .get("/voz", async (c) => {
    const v = servicioVoz()
    if (v.idioma === "es") return c.json({ idioma: "es", voz: "Ivi", motor: "Piper", equipo: "Z6" })
    const NOMBRES: Record<string, string> = { kokoro: "Kokoro-82M", qwen: "Qwen3-TTS 0.6B" }
    try {
      const r = await fetch(`${v.url}/v1/salud`, {
        headers: { Authorization: `Bearer ${v.token}` },
        signal: AbortSignal.timeout(3000),
      })
      const d = (await r.json()) as { motor?: string; voz?: string }
      // «am_michael» → «Michael»
      const voz = (d.voz ?? "").replace(/^[a-z]{2}_/, "").replace(/^./, (x) => x.toUpperCase())
      return c.json({ idioma: "en", voz: voz || "?", motor: NOMBRES[d.motor ?? ""] ?? d.motor ?? "?", equipo: "Geografo" })
    } catch {
      return c.json({ idioma: "en", voz: "?", motor: "sin respuesta", equipo: "Geografo" })
    }
  })
  // Turno de voz en streaming (texto + audio por frase + tiempos por palabra). Ver turnoDeVoz.
  .post("/voz/turno", async (c) => {
    const cuerpo = (await c.req.json().catch(() => null)) as { messages?: Mensaje[]; formato?: string } | null
    const msgs = limpiarMensajes(cuerpo)
    if (!msgs) return c.json({ ok: false, error: "messages debe terminar en un mensaje de user" }, 400)
    if (!servicioVoz().token) return c.json({ ok: false, error: "Token de voz sin configurar" }, 503)
    const formato = FORMATOS_VOZ.has(cuerpo?.formato ?? "") ? cuerpo!.formato! : "opus"
    return turnoDeVoz(msgs, formato, c.req.raw.signal)
  })
  // Oído: audio crudo (webm/opus, ogg, wav) → texto.
  .post("/transcribir", async (c) => {
    const voz = servicioVoz()
    if (!voz.token) return c.json({ ok: false, error: "Token de voz sin configurar" }, 503)
    const audio = await c.req.arrayBuffer()
    if (!audio.byteLength || audio.byteLength > MAX_AUDIO)
      return c.json({ ok: false, error: "Audio vacío o mayor a 5 MB" }, 413)
    try {
      const r = await fetch(`${voz.url}/v1/transcribir`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${voz.token}`,
          "Content-Type": c.req.header("content-type") ?? "audio/webm",
          "X-Idioma": voz.idioma,
        },
        body: audio,
        signal: AbortSignal.timeout(TIMEOUT_VOZ_MS),
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
    const voz = servicioVoz()
    if (!voz.token) return c.json({ ok: false, error: "Token de voz sin configurar" }, 503)
    const cuerpo = (await c.req.json().catch(() => null)) as { texto?: string } | null
    const texto = paraHablar(cuerpo?.texto ?? "")
    if (!texto) return c.json({ ok: false, error: "texto vacío" }, 400)
    try {
      const r = await fetch(`${voz.url}/v1/hablar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${voz.token}`, "Content-Type": "application/json" },
        // horizon-voz usa su voz por defecto (Ryan); argus-voz necesita la suya.
        body: JSON.stringify(voz.idioma === "en" ? { texto } : { texto, voz: "es-ivi" }),
        signal: AbortSignal.timeout(TIMEOUT_VOZ_MS),
      })
      if (!r.ok) return c.json({ ok: false, error: `Voz respondió ${r.status}` }, 502)
      return new Response(await r.arrayBuffer(), { headers: { "Content-Type": "audio/wav" } })
    } catch (e) {
      return c.json({ ok: false, error: `No se pudo hablar con la voz de la Z6: ${String(e)}` }, 502)
    }
  })
