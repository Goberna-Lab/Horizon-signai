import type { AssistantMode, Oido } from "@horizon-signai/shared"
import { recuerdos } from "./memoria"

export type Mensaje = { role: "user" | "assistant"; content: string }

// Quién responde (VERA o EVA). La página lo fija al cambiar de asistente; cada pedido lo lleva junto con
// lo que la asistente recuerda de la persona (memoria.ts), leído en el momento.
let asistenteActual: AssistantMode = "educational"
export const usarAsistente = (a: AssistantMode) => {
  asistenteActual = a
}
// En qué pantalla está la persona (la manda EVA al moverse por la app): la IA guía con eso.
let pantallaActual = ""
export const usarPantalla = (p: string) => {
  pantallaActual = p
}
// En qué idioma va la conversación. Por defecto inglés; EVA lo cambia cuando le hablan en español.
let idiomaActual: "en" | "es" = "en"
export const usarIdioma = (i: "en" | "es") => {
  idiomaActual = i
}
// Lo que la pantalla muestra ahora (cifras del motor, en texto): EVA lo registra y se lee en cada pedido.
let estadoActual: (() => string) | null = null
export const usarEstado = (f: (() => string) | null) => {
  estadoActual = f
}
/** Una orden de la IA para la app, ya validada por el API (apps/api/src/acciones.ts). */
export type AccionIA = { tipo: string } & Record<string, unknown>
// Quién ejecuta las órdenes de la IA. Mientras nadie se registre, el API no le ofrece órdenes al modelo.
let alAccion: ((a: AccionIA) => void) | null = null
export const usarAcciones = (f: ((a: AccionIA) => void) | null) => {
  alAccion = f
}
const leerEstado = () => {
  try {
    return estadoActual?.() ?? ""
  } catch {
    return ""
  }
}
const persona = () => ({
  asistente: asistenteActual,
  recuerdos: recuerdos(),
  pantalla: pantallaActual,
  idioma: idiomaActual,
  estado: leerEstado(),
  acciones: alAccion !== null,
})

const pedir = async (ruta: string, init: RequestInit) => {
  const r = await fetch(`/api/z6${ruta}`, init)
  if (!r.ok) {
    const d = (await r.json().catch(() => null)) as { error?: string } | null
    throw new Error(d?.error ?? `Error ${r.status}`)
  }
  return r
}

// Respuesta completa (la usa la voz, que necesita el texto entero para hablarlo).
export const chat = async (messages: Mensaje[], voz: boolean) => {
  const r = await pedir("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, voz, ...persona() }),
  })
  return (await r.json()) as { respuesta: string; ms: number; modelo: string; equipo: string }
}

// Chat de texto en streaming: llama a `alLlegar` con el texto acumulado en cada trozo.
export const chatStream = async (
  messages: Mensaje[],
  alLlegar: (acumulado: string) => void,
  signal?: AbortSignal,
) => {
  const t = performance.now()
  const r = await pedir("/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, ...persona() }),
    signal,
  })
  const lector = r.body!.getReader()
  const dec = new TextDecoder()
  let texto = ""
  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    texto += dec.decode(value, { stream: true })
    const i = texto.indexOf("\n[error] ")
    if (i >= 0) throw new Error(texto.slice(i + 9).trim() || "La IA cortó la respuesta")
    alLlegar(texto)
  }
  return {
    texto,
    modelo: r.headers.get("x-modelo") ?? "",
    equipo: r.headers.get("x-equipo") ?? "",
    ms: Math.round(performance.now() - t),
  }
}

/** Lo que oyó el API (primer evento de /voz/escuchar). */
export type EventoOido = { t: "oido"; texto: string; ms: number; tipo: Oido }
/** Qué quiso el usuario al hablar encima, según el 8B (etiqueta: add|correct|new|stop|ignore). */
export type EventoIntencion = { t: "intencion"; intencion: string; acuse: string; ms: number; error?: string }

export type EventoTurno =
  | EventoOido
  | EventoIntencion
  | { t: "texto"; d: string }
  | { t: "eco"; texto: string }
  | ({ t: "frase" } & import("./colaDeVoz").FraseDeVoz)
  | { t: "fin"; respuesta: string; modelo: string; ms: number; primeraVozMs: number; tiempos?: Record<string, number | boolean> }
  | { t: "error"; msg: string }

// Opus es ~15 veces más liviano que WAV; Safari antiguo no lo decodifica: ahí, MP3.
const formatoDeVoz = () => (new Audio().canPlayType('audio/ogg; codecs="opus"') ? "opus" : "mp3")

// Lee una respuesta NDJSON y llama a `alEvento` con cada línea, a medida que llegan.
const leerEventos = async (r: Response, alEvento: (e: EventoTurno) => void) => {
  const lector = r.body!.getReader()
  const dec = new TextDecoder()
  let resto = ""
  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    resto += dec.decode(value, { stream: true })
    const lineas = resto.split("\n")
    resto = lineas.pop() ?? ""
    for (const l of lineas) {
      if (!l.trim()) continue
      const e = JSON.parse(l) as EventoTurno | { t: "accion"; a: AccionIA }
      // Las órdenes no pasan por quien pinta el turno: las ejecuta quien se registró con `usarAcciones`.
      if (e.t === "accion") alAccion?.(e.a)
      else alEvento(e)
    }
  }
}

/**
 * Lo que el VAD cerró, en UN viaje al API (VPS2 está en Alemania: ~0,3 s por ida y vuelta): lo
 * transcribe y decide. Con la IA callada y habla real, sigue con el turno en el mismo stream; con la
 * IA en su turno, agrega la intención. Ver /voz/escuchar en apps/api/src/z6.ts.
 */
export const escuchar = async (
  audio: Blob,
  contexto: { iaHabla: boolean; dicho?: string; hablado?: string; pregunta?: string; messages?: Mensaje[]; eco?: boolean },
  alEvento: (e: EventoTurno) => void,
  signal?: AbortSignal,
) => {
  const form = new FormData()
  form.append("audio", audio, "voz.wav")
  form.append("contexto", JSON.stringify({ ...contexto, ...persona(), formato: formatoDeVoz() }))
  await leerEventos(await pedir("/voz/escuchar", { method: "POST", body: form, signal }), alEvento)
}

// Turno de voz en streaming: la respuesta llega como líneas NDJSON (texto, audio por frase, fin).
// Con `acuse` (del 8B): el API lo dice primero mientras el 27B piensa la respuesta.
export const turnoDeVoz = async (
  messages: Mensaje[],
  alEvento: (e: EventoTurno) => void,
  signal?: AbortSignal,
  acuse?: string,
  /** EVA: que el API diga una frase que repite la pregunta mientras el modelo piensa (ver turnoDeVoz en z6.ts). */
  eco?: boolean,
) => {
  const r = await pedir("/voz/turno", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, formato: formatoDeVoz(), acuse, eco, ...persona() }),
    signal,
  })
  await leerEventos(r, alEvento)
}

/**
 * Los tiempos de una conversación con EVA (eva/tiempos.ts), sin texto de la persona: al log del API y al de nginx.
 * sendBeacon sale aunque la página se esté cerrando; si no hay, fetch con keepalive. Nunca lanza.
 */
export const enviarTiempos = (registro: unknown) => {
  const cuerpo = JSON.stringify(registro)
  // El registro va en la URL (base64url): así queda en el log de nginx de VPS2, que sobrevive a los deploys (los logs
  // de Docker se borran cada vez que se recrea el contenedor). Son ~1 KB, sin texto de la persona.
  const r = btoa(String.fromCharCode(...new TextEncoder().encode(cuerpo))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  const url = `/api/z6/eva/tiempos?r=${r}`
  try {
    if (navigator.sendBeacon?.(url)) return
    void fetch(url, { method: "POST", keepalive: true }).catch(() => {})
  } catch {
    /* sin red: queda en el navegador */
  }
}

/** Lo que el API entendió de una frase dicha a EVA con manos libres (ver /voz/entender en apps/api/src/z6.ts). */
export type EventoEntender = { t: "oido"; texto: string; ms: number } | { t: "parecida"; id: string | null; puntaje?: number } | { t: "error"; msg: string }

/** Manda una frase dicha (WAV) y avisa con lo que entendió: primero el texto, después la pregunta frecuente parecida. */
export const entender = async (audio: Blob, idioma: "en" | "es", alEvento: (e: EventoEntender) => void, signal?: AbortSignal) => {
  const form = new FormData()
  form.append("audio", audio, "voz.wav")
  form.append("contexto", JSON.stringify({ idioma }))
  const r = await pedir("/voz/entender", { method: "POST", body: form, signal })
  const lector = r.body!.getReader()
  const dec = new TextDecoder()
  let resto = ""
  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    resto += dec.decode(value, { stream: true })
    const lineas = resto.split("\n")
    resto = lineas.pop() ?? ""
    for (const l of lineas) if (l.trim()) alEvento(JSON.parse(l) as EventoEntender)
  }
}

/** Una frase hecha (la guía de EVA) dicha con la voz de la asistente: eventos {t:"frase"} como el turno. */
export const decir = async (texto: string, alEvento: (e: EventoTurno) => void, signal?: AbortSignal) => {
  const r = await pedir("/decir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto, formato: formatoDeVoz(), ...persona() }),
    signal,
  })
  await leerEventos(r, alEvento)
}

export type InfoVoz ={ idioma: "en" | "es"; voz: string; motor: string; equipo: string }
export const infoVoz = async (): Promise<InfoVoz> => {
  try {
    return (await (await pedir("/voz", {})).json()) as InfoVoz
  } catch {
    return { idioma: "es", voz: "Ivi", motor: "Piper", equipo: "Z6" }
  }
}

// Parte una respuesta en frases para pedir la voz de a una: la primera suena antes.
// Las frases muy cortas se juntan con la siguiente (cada pedido tiene su costo fijo).
export const enFrases = (texto: string) => {
  const crudas = texto.replace(/\s+/g, " ").match(/[^.!?…]+(?:[.!?…]+["'”)\]]*|$)/g) ?? [texto]
  const frases: string[] = []
  for (const f of crudas.map((x) => x.trim()).filter(Boolean)) {
    const ultima = frases.at(-1)
    if (ultima && ultima.length < 30) frases[frases.length - 1] = `${ultima} ${f}`
    else frases.push(f)
  }
  return frases
}

export const transcribir = async (audio: Blob) => {
  const r = await pedir("/transcribir", {
    method: "POST",
    headers: { "Content-Type": audio.type || "audio/webm" },
    body: audio,
  })
  return (await r.json()) as { texto: string; ms: number }
}

export const hablar = async (texto: string) => {
  const r = await pedir("/hablar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto, ...persona() }),
  })
  return await r.blob()
}
