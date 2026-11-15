import { Hono } from "hono"
import { timingSafeEqual } from "node:crypto"
import { clasificarOido, type Z6Respuesta } from "@horizon-signai/shared"
import { filtroDeAcciones, RECORDATORIO_ACCIONES } from "./acciones.js"
import { contextoRag } from "./assistant/rag.js"
import { ACUSE_FIJO, ESTILO_ACUSE, VOZ_SEGURA, personaDe, sistemaTexto, sistemaVoz, vozDe, type Idioma, type Persona } from "./asistentes.js"

// Cliente de la Z6 (Ollama, solo escucha en la IP del tailnet). VPS2 llega por Tailscale.
const z6Url = () => process.env.Z6_URL ?? "http://100.82.117.21:11434"
const z6Modelo = () => process.env.Z6_MODELO ?? "qwen3.6:27b"
// El chat de TEXTO corre en Geografo (A4000, 16 GB): ahí cabe un modelo de ~8B entero en GPU.
// La conversación por VOZ se queda en la Z6, que mide 8× más en el 27B.
const textoUrl = () => process.env.TEXTO_URL ?? "http://100.117.204.80:11434"
const textoModelo = () => process.env.TEXTO_MODELO ?? "qwen3:8b"
const TIMEOUT_MS = Number(process.env.Z6_TIMEOUT_MS ?? 120_000)
const MAX_BYTES = 64 * 1024
// Voz del chat. Con HVOZ_URL: horizon-voz en Geografo (inglés, Kokoro en GPU + whisper
// en GPU; ver voz/LEEME.md). Sin ella: argus-voz de Ivi en la Z6 (español, Piper), de respaldo.
type ServicioVoz = { url: string; token?: string; idioma: "en" | "es" }
const servicioVoz = (): ServicioVoz =>
  process.env.HVOZ_URL
    ? { url: process.env.HVOZ_URL, token: process.env.HVOZ_TOKEN, idioma: "en" }
    : { url: process.env.VOZ_URL ?? "http://100.82.117.21:8795", token: process.env.VOZ_TOKEN, idioma: "es" }
// Español a pedido (EVA cambia de idioma si le hablan en español): horizon-voz solo oye y habla inglés, así
// que el español sale de argus-voz, si su token sigue configurado junto al de horizon-voz. Si no lo está o
// no contesta, se usa la voz de siempre (suena con acento, pero suena) y se deja de intentar un rato.
let esCaidoHasta = 0
const servicioPara = (idioma: Idioma): ServicioVoz => {
  const base = servicioVoz()
  if (idioma !== "es" || base.idioma === "es" || !process.env.VOZ_TOKEN || Date.now() < esCaidoHasta) return base
  return { url: process.env.VOZ_URL ?? "http://100.82.117.21:8795", token: process.env.VOZ_TOKEN, idioma: "es" }
}
const TIMEOUT_ES_MS = 10_000
const MAX_AUDIO = 5 * 1024 * 1024 // tope del servicio de voz
const MAX_TTS = 600
// Voz en inglés: cada asistente (VERA, LUMA) tiene la suya de Kokoro (ver asistentes.ts). La entonación
// y el timbre robóticos se le ponen en el navegador (apps/web/src/prueba-ia/personajes.ts).
const TIMEOUT_VOZ_MS = 60_000 // Ryan va a ~1,6× tiempo real: una frase larga puede tardar

const PUBLICAS = new Set(["/chat", "/chat/stream", "/transcribir", "/hablar", "/decir", "/voz", "/voz/turno", "/voz/clasificar", "/voz/escuchar"])
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

// Prompts: el de cada asistente (VERA, LUMA) está en asistentes.ts. Este es solo el respaldo en español
// de la voz (argus-voz, sin HVOZ_URL).
const SISTEMA_VOZ_ES =
  "Eres el asistente de voz de Horizon Signai. Estás hablando en voz alta: responde en español, " +
  "en una a tres frases cortas, sin listas, sin markdown, sin emojis y sin símbolos raros. " +
  "Si una respuesta tuya anterior termina en una nota entre corchetes que empieza con «interrupted», " +
  "el usuario te cortó. Si agrega algo a su pedido, empieza con un acuse muy corto y responde " +
  "integrándolo con lo que pidió antes. Si corrige algo, reconoce la corrección en pocas palabras y " +
  "responde de nuevo con ella. Si pregunta algo nuevo, respóndelo y, solo si la respuesta anterior " +
  "quedó a medias, ofrece al final volver a ella. Nunca repitas lo que ya dijiste ni escribas notas entre corchetes."
const sistemaDeVoz = (p: Persona) => (servicioVoz().idioma === "en" ? sistemaVoz(p) : SISTEMA_VOZ_ES)

type Mensaje = { role: "user" | "assistant"; content: string }

// Si la frase del 27B empieza repitiendo el acuse que ya dijo el 8B (a veces lo imita pese a la
// nota), devuelve la frase sin esas palabras ("" si no queda nada). Si no lo repite, null.
const soloLetras = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
export const quitarAcuse = (frase: string, acuse: string): string | null => {
  const f = soloLetras(frase)
  const a = soloLetras(acuse)
  if (!f || !a) return null
  if (a.startsWith(f)) return "" // la frase es el acuse o un pedazo
  if (!f.startsWith(`${a} `)) return null
  const n = a.split(" ").length
  return frase.trim().split(/\s+/).slice(n).join(" ").replace(/^[,;:—-]\s*/, "")
}

// Clasificador de lo que el usuario dice ENCIMA de la respuesta de voz: qwen3:8b de Geografo, que no
// toca la Z6 (pisaría la caché del 27B). 11/11 en casos de prueba; ~0,4 s con el modelo caliente.
const SISTEMA_CLASIFICAR = `You classify what a user said out loud while a voice assistant was still answering them. The words come from speech recognition and may contain small errors. Reply only with JSON.
Categories:
- "add": adds something to their request or asks to also cover something ("and also compare it with Mars", "what about at night?").
- "correct": corrects or changes something in their request or in what the assistant said ("no, I meant the north pole", "not that crater, the other one").
- "new": a different question or topic, unrelated to the current answer.
- "stop": only wants the assistant to stop or be quiet, without asking anything.
- "ignore": a reaction or acknowledgement ("yeah that makes sense", "oh wow, interesting"), words said to someone else, or anything not directed at the assistant.
Also write "acuse": for add, correct and new, two to six words the assistant says out loud right away to show it heard, like "Good point, adding Mars.", "Got it, the north pole then.", "Sure, quick detour." It only acknowledges: never answer the question and never state facts. For stop and ignore, leave it empty.`
const ETIQUETAS_CLASIFICAR = ["add", "correct", "new", "stop", "ignore"]
// El 8B es el «hablante rápido»: su acuse suena enseguida mientras el 27B piensa. Solo reconoce,
// nunca afirma contenido (así no promete algo que el 27B no haga). Si viene vacío o largo, uno fijo.
const limpiarAcuse = (tipo: string, acuse: string, persona: Persona) => {
  const a = acuse.replace(/[[\]{}<>*_#`"]/g, "").replace(/\s+/g, " ").trim()
  const fijo = ACUSE_FIJO[persona.idioma][persona.asistente]
  if (!(tipo in fijo)) return ""
  return a && a.length <= 60 && a.split(" ").length <= 8 ? a : fijo[tipo]
}
const TIMEOUT_CLASIFICAR_MS = 4000
// Que el modelo siga cargado en la GPU entre turnos: frío, el primer pedido tardó 28 s.
const KEEP_ALIVE_CLASIFICAR = "2h"
const precalentarClasificador = () =>
  fetch(`${textoUrl()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: textoModelo(),
      stream: false,
      think: false,
      keep_alive: KEEP_ALIVE_CLASIFICAR,
      options: { num_predict: 1 },
      messages: [{ role: "system", content: SISTEMA_CLASIFICAR }, { role: "user", content: "ok" }],
    }),
  }).catch(() => {})

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

const preguntar = async (mensajes: Mensaje[], voz: boolean, persona: Persona) => {
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
      messages: [{ role: "system", content: voz ? sistemaDeVoz(persona) : sistemaTexto(persona) }, ...mensajes],
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

// Voz de UNA frase con la voz de la asistente (si su voz no está en el servicio, con la segura):
// audio en base64 y los tiempos de cada palabra. La usan el turno de voz y /decir.
const vozDeFrase = async (texto: string, formato: string, persona: Persona, señal: AbortSignal) => {
  const base = servicioVoz()
  const pedirVoz = (voz: ServicioVoz, v: string, limite: number) =>
    fetch(`${voz.url}/v1/hablar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${voz.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(voz.idioma === "en" ? { texto, formato, palabras: true, voz: v } : { texto, voz: "es-ivi" }),
      signal: AbortSignal.any([señal, AbortSignal.timeout(limite)]),
    })
  let r: Response | null = null
  const es = servicioPara(persona.idioma)
  if (es.idioma === "es" && base.idioma === "en") {
    // Español por argus-voz, con poco margen: si falla, sigue con la voz de siempre.
    r = await pedirVoz(es, "es-ivi", TIMEOUT_ES_MS).catch(() => null)
    if (!r?.ok) {
      r = null
      if (!señal.aborted) esCaidoHasta = Date.now() + 5 * 60_000
    }
  }
  if (!r) {
    r = await pedirVoz(base, vozDe(persona.asistente), TIMEOUT_VOZ_MS)
    if (!r.ok && base.idioma === "en" && vozDe(persona.asistente) !== VOZ_SEGURA) r = await pedirVoz(base, VOZ_SEGURA, TIMEOUT_VOZ_MS)
  }
  if (!r.ok) throw new Error(`Voz respondió ${r.status}`)
  const audio = Buffer.from(await r.arrayBuffer()).toString("base64")
  const dur = Number(r.headers.get("x-duracion") ?? 0)
  let palabras: unknown = [[texto, "", 0, dur]]
  try {
    palabras = JSON.parse(r.headers.get("x-palabras") ?? "") as unknown
  } catch {
    /* argus-voz no da tiempos: la frase entera */
  }
  return { texto, mime: r.headers.get("content-type"), audio, palabras, dur }
}

// Con `acuse` (del 8B, ver /voz/clasificar): suena primero, mientras el 27B genera. El 27B no lo
// recibe como prefill (en modo chat con think:false se corta o sale vacío: medido) sino como nota
// al final del último mensaje, que no rompe la caché. La respuesta final incluye el acuse.
// `primero`: evento que sale antes que todo (lo usa /voz/escuchar para mandar lo que oyó).
const turnoDeVoz = (
  msgs: Mensaje[],
  formato: string,
  señal: AbortSignal,
  persona: Persona,
  acuse = "",
  primero?: unknown,
): Response => {
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
    let repetida: [string, string] | null = null // [frase del 27B, la misma sin el acuse repetido]
    let cola: Promise<void> = Promise.resolve() // una frase a la vez y en orden
    const hablarFrase = (crudo: string) => {
      const i = n++
      const texto = paraHablar(crudo)
      if (!texto) return
      cola = cola.then(async () => {
        if (corte.signal.aborted) return
        const f = await vozDeFrase(texto, formato, persona, corte.signal)
        if (!primeraVozMs) primeraVozMs = Math.round(performance.now() - t0)
        emitir({ t: "frase", i, ...f })
      })
    }

    if (acuse) {
      hablarFrase(acuse)
      const ultimo = msgs[msgs.length - 1]
      msgs = [
        ...msgs.slice(0, -1),
        {
          ...ultimo,
          content:
            voz.idioma === "en" && persona.idioma === "en"
              ? `${ultimo.content}\n[You already said out loud: "${acuse}" Continue right after it, without another acknowledgement.]`
              : `${ultimo.content}\n[Ya dijiste en voz alta: «${acuse}». Sigue justo después, sin otro acuse.]`,
        },
      ]
    }
    // RAG: trozos de la documentación del proyecto para esta pregunta (apps/api/src/assistant/rag.ts). Se busca con
    // la pregunta tal como llegó, antes de pegarle notas. Nunca falla ni demora más que su propio tope.
    // Los trozos van como nota al final de la pregunta, no en el sistema: así el comienzo del prompt no cambia y el
    // modelo no vuelve a evaluar todo el historial en cada turno (ver sistemaVoz en asistentes.ts).
    const extra = await contextoRag(msgs[msgs.length - 1].content, true)
    const notas = [
      extra ? `[Note from the app, not from the person. ${extra}]` : "",
      persona.acciones && voz.idioma === "en" ? RECORDATORIO_ACCIONES : "",
    ].filter(Boolean)
    if (notas.length) {
      const ultimo = msgs[msgs.length - 1]
      msgs = [...msgs.slice(0, -1), { ...ultimo, content: `${ultimo.content}\n${notas.join("\n")}` }]
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
          messages: [{ role: "system", content: sistemaDeVoz(persona) }, ...msgs],
        }),
      })
      if (!r.ok || !r.body) throw new Error(`Z6 respondió ${r.status}`)
      const lector = r.body.getReader()
      const dec = new TextDecoder()
      let lineas = ""
      let buffer = ""
      let respuesta = ""
      // Las órdenes que el modelo pone al final («<<planner zone=B>>») no se muestran ni se pronuncian: salen como evento.
      const filtro = filtroDeAcciones((a) => emitir({ t: "accion", a }))
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
          const delta = filtro.pasar(d.message?.content ?? "")
          if (!delta) continue
          respuesta += delta
          buffer += delta
          emitir({ t: "texto", d: delta })
          const [listas, resto] = cortarFrases(buffer, n === 0)
          buffer = resto
          for (const f of listas) {
            // Primera frase del 27B tras un acuse: si lo repite, se dice sin él (ya sonó).
            const sin: string | null = acuse && n === 1 && !repetida ? quitarAcuse(f, acuse) : null
            if (sin === null) hablarFrase(f)
            else {
              repetida = [f, sin]
              if (sin) hablarFrase(sin)
            }
          }
        }
      }
      if (buffer.trim()) hablarFrase(buffer)
      await cola
      if (repetida) respuesta = respuesta.replace(repetida[0], repetida[1])
      if (acuse) respuesta = `${acuse} ${respuesta.trim()}`
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
      if (primero) emitir(primero)
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

// Oído: audio → texto en el servicio de voz (Geografo; en español, argus-voz si está: ver servicioPara).
const transcribirAudio = async (audio: ArrayBuffer, tipo: string, idioma: Idioma = "en") => {
  const base = servicioVoz()
  const pedir = (voz: ServicioVoz, limite: number) =>
    fetch(`${voz.url}/v1/transcribir`, {
      method: "POST",
      headers: { Authorization: `Bearer ${voz.token}`, "Content-Type": tipo, "X-Idioma": voz.idioma },
      body: audio,
      signal: AbortSignal.timeout(limite),
    })
  let r: Response | null = null
  const es = servicioPara(idioma)
  if (es.idioma === "es" && base.idioma === "en") {
    r = await pedir(es, TIMEOUT_ES_MS).catch(() => null)
    if (!r?.ok) {
      r = null
      esCaidoHasta = Date.now() + 5 * 60_000
    }
  }
  r ??= await pedir(base, TIMEOUT_VOZ_MS)
  if (!r.ok) throw new Error(`Voz respondió ${r.status}`)
  const d = (await r.json()) as { texto?: string; ms?: number }
  return { texto: (d.texto ?? "").trim(), ms: d.ms ?? 0 }
}

// Qué quiso el usuario al hablar encima de la respuesta, y el acuse que se le dice enseguida.
const clasificarEncima = async (pregunta: string, dicho: string, oido: string, persona: Persona) => {
  const t = performance.now()
  const r = await fetch(`${textoUrl()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_CLASIFICAR_MS),
    body: JSON.stringify({
      model: textoModelo(),
      stream: false,
      think: false,
      keep_alive: KEEP_ALIVE_CLASIFICAR,
      options: { temperature: 0, num_predict: 40 },
      format: {
        type: "object",
        properties: { tipo: { type: "string", enum: ETIQUETAS_CLASIFICAR }, acuse: { type: "string" } },
        required: ["tipo", "acuse"],
      },
      messages: [
        { role: "system", content: `${SISTEMA_CLASIFICAR}\n${ESTILO_ACUSE[persona.asistente]}${persona.idioma === "es" ? "\nWrite the acuse in Spanish." : ""}` },
        {
          role: "user",
          content: `User's request: ${JSON.stringify(pregunta.slice(-1000))}\nAssistant was saying: ${JSON.stringify(dicho.slice(-1000))}\nUser just said: ${JSON.stringify(oido.slice(-1000))}`,
        },
      ],
    }),
  })
  if (!r.ok) throw new Error(`Geografo respondió ${r.status}`)
  const d = (await r.json()) as { message?: { content?: string } }
  const salida = JSON.parse(d.message?.content ?? "{}") as { tipo?: string; acuse?: string }
  const tipo = salida.tipo ?? ""
  if (!ETIQUETAS_CLASIFICAR.includes(tipo)) throw new Error(`etiqueta rara: ${tipo}`)
  return { tipo, acuse: limpiarAcuse(tipo, salida.acuse ?? "", persona), ms: Math.round(performance.now() - t) }
}

const ndjson = (eventos: unknown[]) =>
  new Response(eventos.map((e) => `${JSON.stringify(e)}\n`).join(""), {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  })

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
    const cuerpo = (await c.req.json().catch(() => null)) as { messages?: Mensaje[]; voz?: boolean; asistente?: unknown; recuerdos?: unknown } | null
    const msgs = limpiarMensajes(cuerpo)
    if (!msgs) return c.json({ ok: false, error: "messages debe terminar en un mensaje de user" }, 400)
    const t = performance.now()
    try {
      const r = await preguntar(msgs, cuerpo?.voz === true, personaDe(cuerpo))
      return c.json({ ok: true, ...r, ms: Math.round(performance.now() - t) })
    } catch (e) {
      return c.json({ ok: false, error: `No se pudo contactar a la IA: ${String(e)}` }, 502)
    }
  })
  // Chat de texto en streaming (Geografo): devuelve el texto en trozos a medida que se genera.
  // El modelo y el equipo viajan en cabeceras; un error a mitad llega como línea final «\n[error] …».
  .post("/chat/stream", async (c) => {
    const cuerpo = (await c.req.json().catch(() => null)) as { messages?: Mensaje[]; asistente?: unknown; recuerdos?: unknown } | null
    const msgs = limpiarMensajes(cuerpo)
    if (!msgs) return c.json({ ok: false, error: "messages debe terminar en un mensaje de user" }, 400)
    const modelo = textoModelo()
    const extra = await contextoRag(msgs[msgs.length - 1].content) // documentación del proyecto para esta pregunta
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
          messages: [{ role: "system", content: sistemaTexto(personaDe(cuerpo), extra) }, ...msgs],
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
    void precalentarClasificador() // la página abrió el modo voz: que el 8B esté listo para cuando hables encima
    void fetch(`${z6Url()}/api/version`, { signal: AbortSignal.timeout(5000) }).catch(() => {}) // abre ya la conexión a la Z6
    const v = servicioVoz()
    if (v.idioma === "es") return c.json({ idioma: "es", voz: "Ivi", motor: "Piper", equipo: "Z6" })
    const NOMBRES: Record<string, string> = { kokoro: "Kokoro-82M", qwen: "Qwen3-TTS 0.6B" }
    try {
      const r = await fetch(`${v.url}/v1/salud`, {
        headers: { Authorization: `Bearer ${v.token}` },
        signal: AbortSignal.timeout(3000),
      })
      const d = (await r.json()) as { motor?: string }
      // «af_heart» → «Heart»: la que pide este API para la asistente de misión, no la del servicio
      const voz = vozDe("assistant").replace(/^[a-z]{2}_/, "").replace(/^./, (x) => x.toUpperCase())
      return c.json({ idioma: "en", voz: voz || "?", motor: NOMBRES[d.motor ?? ""] ?? d.motor ?? "?", equipo: "Geografo" })
    } catch {
      return c.json({ idioma: "en", voz: "?", motor: "sin respuesta", equipo: "Geografo" })
    }
  })
  // Turno de voz en streaming (texto + audio por frase + tiempos por palabra). Ver turnoDeVoz.
  .post("/voz/turno", async (c) => {
    const cuerpo = (await c.req.json().catch(() => null)) as { messages?: Mensaje[]; formato?: string; acuse?: unknown; asistente?: unknown; recuerdos?: unknown } | null
    const msgs = limpiarMensajes(cuerpo)
    if (!msgs) return c.json({ ok: false, error: "messages debe terminar en un mensaje de user" }, 400)
    if (!servicioVoz().token) return c.json({ ok: false, error: "Token de voz sin configurar" }, 503)
    const formato = FORMATOS_VOZ.has(cuerpo?.formato ?? "") ? cuerpo!.formato! : "opus"
    const acuse = typeof cuerpo?.acuse === "string" ? cuerpo.acuse.replace(/[[\]"«»]/g, "").trim().slice(0, 80) : ""
    return turnoDeVoz(msgs, formato, c.req.raw.signal, personaDe(cuerpo), acuse)
  })
  // Qué quiso decir el usuario al hablar encima de la respuesta: add | correct | new | stop | ignore.
  .post("/voz/clasificar", async (c) => {
    const cuerpo = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const campo = (k: string) => (typeof cuerpo?.[k] === "string" ? (cuerpo[k] as string) : "")
    const oido = campo("oido").trim()
    if (!oido) return c.json({ ok: false, error: "oido vacío" }, 400)
    try {
      return c.json({ ok: true, ...(await clasificarEncima(campo("pregunta"), campo("dicho"), oido, personaDe(cuerpo))) })
    } catch (e) {
      return c.json({ ok: false, error: `No se pudo clasificar: ${String(e)}` }, 502)
    }
  })
  // Lo que el VAD cerró, en UN solo viaje (VPS2 está en Alemania: cada ida y vuelta desde el navegador
  // cuesta ~0,3 s). Multipart: `audio` (wav) y `contexto` (JSON). Responde NDJSON:
  //   {t:"oido", texto, ms, tipo}                       siempre primero (tipo: ver clasificarOido)
  //   {t:"intencion", intencion, acuse, ms}             después, si la IA estaba en su turno y fue habla real
  //   + los eventos de /voz/turno                       si la IA estaba callada y fue habla real
  // contexto: { iaHabla, dicho (lo que la IA pronunció en esos segundos), hablado (todo lo que lleva
  //   dicho la respuesta), pregunta (la última del usuario), messages (historial, si iaHabla es false), formato }
  .post("/voz/escuchar", async (c) => {
    if (!servicioVoz().token) return c.json({ ok: false, error: "Token de voz sin configurar" }, 503)
    const form = await c.req.raw.formData().catch(() => null)
    const audio = form?.get("audio")
    if (!(audio instanceof Blob) || !audio.size || audio.size > MAX_AUDIO)
      return c.json({ ok: false, error: "Audio vacío o mayor a 5 MB" }, 413)
    let ctx: Record<string, unknown> = {}
    try {
      ctx = JSON.parse(String(form?.get("contexto") ?? "{}")) as Record<string, unknown>
    } catch {
      return c.json({ ok: false, error: "contexto no es JSON" }, 400)
    }
    const texto = (k: string) => (typeof ctx[k] === "string" ? (ctx[k] as string) : "")
    const iaHabla = ctx.iaHabla === true
    const formato = FORMATOS_VOZ.has(texto("formato")) ? texto("formato") : "opus"

    let oido: { texto: string; ms: number }
    try {
      oido = await transcribirAudio(await audio.arrayBuffer(), audio.type || "audio/wav", personaDe(ctx).idioma)
    } catch (e) {
      return c.json({ ok: false, error: `No se pudo hablar con la voz: ${String(e)}` }, 502)
    }
    const tipo = clasificarOido(oido.texto, texto("dicho"), iaHabla)
    const evento = { t: "oido", texto: oido.texto, ms: oido.ms, tipo }
    if (tipo !== "habla") return ndjson([evento])

    if (iaHabla) {
      // Dos eventos: lo oído sale ya (la página muestra «entendiendo…») y la intención cuando el 8B decide.
      const enc = new TextEncoder()
      const linea = (o: unknown) => enc.encode(`${JSON.stringify(o)}\n`)
      const stream = new ReadableStream<Uint8Array>({
        async start(ctl) {
          ctl.enqueue(linea(evento))
          try {
            const k = await clasificarEncima(texto("pregunta"), texto("hablado"), oido.texto, personaDe(ctx))
            ctl.enqueue(linea({ t: "intencion", intencion: k.tipo, acuse: k.acuse, ms: k.ms }))
          } catch (e) {
            ctl.enqueue(linea({ t: "intencion", intencion: "add", acuse: "", ms: 0, error: String(e) })) // ante la duda, adición
          }
          ctl.close()
        },
      })
      return new Response(stream, {
        headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
      })
    }
    const historial = Array.isArray(ctx.messages) ? ctx.messages : []
    const msgs = limpiarMensajes({ messages: [...historial, { role: "user", content: oido.texto }] })
    return msgs ? turnoDeVoz(msgs, formato, c.req.raw.signal, personaDe(ctx), "", evento) : ndjson([evento])
  })
  // Oído: audio crudo (webm/opus, ogg, wav) → texto.
  .post("/transcribir", async (c) => {
    if (!servicioVoz().token) return c.json({ ok: false, error: "Token de voz sin configurar" }, 503)
    const audio = await c.req.arrayBuffer()
    if (!audio.byteLength || audio.byteLength > MAX_AUDIO)
      return c.json({ ok: false, error: "Audio vacío o mayor a 5 MB" }, 413)
    try {
      return c.json({ ok: true, ...(await transcribirAudio(audio, c.req.header("content-type") ?? "audio/webm")) })
    } catch (e) {
      return c.json({ ok: false, error: `No se pudo hablar con la voz: ${String(e)}` }, 502)
    }
  })
  // Una frase hecha (la guía de EVA): texto → NDJSON con {t:"frase", …} por frase, como /voz/turno pero sin
  // modelo de lenguaje. Lleva los tiempos por palabra, que la web usa para la entonación y los subtítulos.
  .post("/decir", async (c) => {
    if (!servicioVoz().token) return c.json({ ok: false, error: "Token de voz sin configurar" }, 503)
    const cuerpo = (await c.req.json().catch(() => null)) as { texto?: string; formato?: string; asistente?: unknown; recuerdos?: unknown } | null
    const texto = paraHablar(cuerpo?.texto ?? "")
    if (!texto) return c.json({ ok: false, error: "texto vacío" }, 400)
    const formato = FORMATOS_VOZ.has(cuerpo?.formato ?? "") ? cuerpo!.formato! : "opus"
    const persona = personaDe(cuerpo)
    const [listas, resto] = cortarFrases(`${texto} `, false)
    const frases = [...listas, ...(resto.trim() ? [resto.trim()] : [])]
    try {
      const eventos = []
      for (const [i, f] of frases.entries()) eventos.push({ t: "frase", i, ...(await vozDeFrase(f, formato, persona, c.req.raw.signal)) })
      return ndjson(eventos)
    } catch (e) {
      return c.json({ ok: false, error: `No se pudo hablar con la voz: ${String(e)}` }, 502)
    }
  })
  // Boca: texto → audio/wav.
  .post("/hablar", async (c) => {
    const voz = servicioVoz()
    if (!voz.token) return c.json({ ok: false, error: "Token de voz sin configurar" }, 503)
    const cuerpo = (await c.req.json().catch(() => null)) as { texto?: string; asistente?: unknown } | null
    const texto = paraHablar(cuerpo?.texto ?? "")
    if (!texto) return c.json({ ok: false, error: "texto vacío" }, 400)
    try {
      const r = await fetch(`${voz.url}/v1/hablar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${voz.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(voz.idioma === "en" ? { texto, voz: vozDe(personaDe(cuerpo).asistente) } : { texto, voz: "es-ivi" }),
        signal: AbortSignal.timeout(TIMEOUT_VOZ_MS),
      })
      if (!r.ok) return c.json({ ok: false, error: `Voz respondió ${r.status}` }, 502)
      return new Response(await r.arrayBuffer(), { headers: { "Content-Type": "audio/wav" } })
    } catch (e) {
      return c.json({ ok: false, error: `No se pudo hablar con la voz de la Z6: ${String(e)}` }, 502)
    }
  })
