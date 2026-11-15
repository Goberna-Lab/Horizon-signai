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
const persona = () => ({ asistente: asistenteActual, recuerdos: recuerdos(), pantalla: pantallaActual })

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
  | ({ t: "frase" } & import("./colaDeVoz").FraseDeVoz)
  | { t: "fin"; respuesta: string; modelo: string; ms: number; primeraVozMs: number }
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
    for (const l of lineas) if (l.trim()) alEvento(JSON.parse(l) as EventoTurno)
  }
}

/**
 * Lo que el VAD cerró, en UN viaje al API (VPS2 está en Alemania: ~0,3 s por ida y vuelta): lo
 * transcribe y decide. Con la IA callada y habla real, sigue con el turno en el mismo stream; con la
 * IA en su turno, agrega la intención. Ver /voz/escuchar en apps/api/src/z6.ts.
 */
export const escuchar = async (
  audio: Blob,
  contexto: { iaHabla: boolean; dicho?: string; hablado?: string; pregunta?: string; messages?: Mensaje[] },
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
) => {
  const r = await pedir("/voz/turno", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, formato: formatoDeVoz(), acuse, ...persona() }),
    signal,
  })
  await leerEventos(r, alEvento)
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
