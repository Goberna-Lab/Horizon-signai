export type Mensaje = { role: "user" | "assistant"; content: string }

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
    body: JSON.stringify({ messages, voz }),
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
    body: JSON.stringify({ messages }),
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

export type EventoTurno =
  | { t: "texto"; d: string }
  | ({ t: "frase" } & import("./colaDeVoz").FraseDeVoz)
  | { t: "fin"; respuesta: string; modelo: string; ms: number; primeraVozMs: number }
  | { t: "error"; msg: string }

// Opus es ~15 veces más liviano que WAV; Safari antiguo no lo decodifica: ahí, MP3.
const formatoDeVoz = () => (new Audio().canPlayType('audio/ogg; codecs="opus"') ? "opus" : "mp3")

// Turno de voz en streaming: la respuesta llega como líneas NDJSON (texto, audio por frase, fin).
export const turnoDeVoz = async (messages: Mensaje[], alEvento: (e: EventoTurno) => void, signal?: AbortSignal) => {
  const r = await pedir("/voz/turno", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, formato: formatoDeVoz() }),
    signal,
  })
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

// Qué quiso el usuario al hablar encima de la respuesta (qwen3:8b en Geografo, ~0,4 s).
export const clasificar = async (pregunta: string, dicho: string, oido: string) => {
  const r = await pedir("/voz/clasificar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pregunta, dicho, oido }),
  })
  return (await r.json()) as { tipo: string; ms: number }
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
    body: JSON.stringify({ texto }),
  })
  return await r.blob()
}
