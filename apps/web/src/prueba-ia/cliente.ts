// Llamadas a /api/z6/* con el token de prueba (se pide en la página y vive en sessionStorage).
const CLAVE = "horizon-prueba-token"

export const leerToken = () => {
  try {
    return sessionStorage.getItem(CLAVE) ?? ""
  } catch {
    return ""
  }
}
export const guardarToken = (t: string) => {
  try {
    sessionStorage.setItem(CLAVE, t)
  } catch {
    /* sin almacenamiento: se pide de nuevo */
  }
}

export type Mensaje = { role: "user" | "assistant"; content: string }

const pedir = async (ruta: string, init: RequestInit) => {
  const r = await fetch(`/api/z6${ruta}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${leerToken()}` },
  })
  if (r.status === 401) throw new Error("Token incorrecto")
  if (!r.ok) {
    const d = (await r.json().catch(() => null)) as { error?: string } | null
    throw new Error(d?.error ?? `Error ${r.status}`)
  }
  return r
}

export const chat = async (messages: Mensaje[], voz: boolean) => {
  const r = await pedir("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, voz }),
  })
  return (await r.json()) as { respuesta: string; ms: number; modelo: string }
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

export const verificarToken = async () => {
  const r = await fetch("/api/z6/ping", { headers: { Authorization: `Bearer ${leerToken()}` } })
  if (r.status === 401) throw new Error("Token incorrecto")
  if (!r.ok) throw new Error("La Z6 no responde")
}
