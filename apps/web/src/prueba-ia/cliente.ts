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

export type InfoVoz = { idioma: "en" | "es"; voz: string; motor: string; equipo: string }
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
    body: JSON.stringify({ texto }),
  })
  return await r.blob()
}
