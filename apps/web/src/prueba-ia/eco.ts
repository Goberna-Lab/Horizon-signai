// Qué hacer con lo que oyó el micrófono abierto. Con parlantes, el navegador NO cancela la voz de la
// IA (medido en Chrome/Linux con voz/prototipo-eco: ~20 % de frames sobre el umbral con la IA sola,
// también por WebRTC loopback; "all" no lo admite), así que el micrófono la oye. Defensa: se
// transcribe lo oído y se compara con lo que la IA acaba de pronunciar.

export type Oido =
  | "vacio" // sin texto
  | "eco" // la IA oyéndose a sí misma
  | "ruido" // alucinación típica de Whisper sobre ruido
  | "asentimiento" // «uh-huh», «okay»: sigue hablando
  | "parada" // «stop», «wait»: calla y escucha
  | "habla" // el usuario dijo algo de verdad

const palabras = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)

const ASENTIMIENTO = new Set(
  "uh huh mhm mm mmm hmm hm yeah yep yes ok okay right sure got it i see cool nice great wow alright oh ah aha".split(" "),
)
const PARADA = new Set(["stop", "wait", "hold", "pause", "enough", "quiet"])
const RUIDO = new Set(["you", "thank you", "thanks", "thank you so much", "thanks for watching", "bye"])
const UMBRAL_ECO = 0.6 // fracción de lo oído que la IA acaba de decir

/**
 * @param oido   transcripción de lo que captó el micrófono
 * @param dicho  lo que la IA pronunció mientras tanto ("" si estaba callada)
 * @param iaHabla si hay un turno de la IA en curso (pensando o hablando)
 */
export function clasificarOido(oido: string, dicho: string, iaHabla: boolean): Oido {
  const o = palabras(oido)
  if (!o.length) return "vacio"
  if (!iaHabla) return "habla"

  const d = new Set(palabras(dicho))
  if (d.size && o.filter((w) => d.has(w)).length / o.length >= UMBRAL_ECO) return "eco"
  if (o.length <= 4 && o.some((w) => PARADA.has(w))) return "parada"
  if (RUIDO.has(o.join(" "))) return "ruido"
  if (o.length <= 4 && o.every((w) => ASENTIMIENTO.has(w))) return "asentimiento"
  // Una palabra suelta que no es pregunta: casi siempre un «uh-huh» mal oído (Whisper lo
  // transcribió como «y'all»). «Why?» sí corta: Whisper le pone el signo.
  if (o.length === 1 && !oido.includes("?")) return "asentimiento"
  return "habla"
}

/** Muestras de Silero (Float32, 16 kHz, mono) → WAV PCM de 16 bits, que el servicio de voz decodifica. */
export function aWav(muestras: Float32Array, sr = 16000): Blob {
  const b = new DataView(new ArrayBuffer(44 + muestras.length * 2))
  const texto = (o: number, s: string) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)))
  texto(0, "RIFF")
  b.setUint32(4, 36 + muestras.length * 2, true)
  texto(8, "WAVE")
  texto(12, "fmt ")
  b.setUint32(16, 16, true) // tamaño del bloque fmt
  b.setUint16(20, 1, true) // PCM
  b.setUint16(22, 1, true) // mono
  b.setUint32(24, sr, true)
  b.setUint32(28, sr * 2, true) // bytes por segundo
  b.setUint16(32, 2, true) // bytes por muestra
  b.setUint16(34, 16, true) // bits
  texto(36, "data")
  b.setUint32(40, muestras.length * 2, true)
  muestras.forEach((m, i) => {
    const x = Math.max(-1, Math.min(1, m))
    b.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true)
  })
  return new Blob([b.buffer], { type: "audio/wav" })
}

// ── Qué quiso el usuario al hablar encima (lo decide el qwen3:8b de Geografo) ───────────────
export type Intencion = "adicion" | "correccion" | "pregunta" | "parada" | "ignorar"

const ETIQUETAS: Record<string, Intencion> = {
  add: "adicion",
  correct: "correccion",
  new: "pregunta",
  stop: "parada",
  ignore: "ignorar",
}
/** Etiqueta del clasificador → intención. Ante la duda, adición: cortar e integrar es lo seguro. */
export const deEtiqueta = (e: string): Intencion => ETIQUETAS[e] ?? "adicion"

/**
 * Nota al final de la respuesta cortada, para el 27B (SISTEMA_VOZ en el API explica cada una).
 * Va al final del historial, así que no rompe la caché de Ollama.
 */
export function marcaDeCorte(i?: Intencion): string {
  if (i === "adicion") return "[interrupted: the user is adding to their request]"
  if (i === "correccion") return "[interrupted: the user is correcting something]"
  if (i === "pregunta") return "[interrupted: the user is asking something new]"
  return "[interrupted]"
}

// ── Lo que dijiste encima, en pantalla (chip bajo la respuesta) ─────────────────────────────
export type Encima = {
  texto: string
  estado: "entendiendo" | "integrando" | "sigo" | "parada"
  intencion?: Intencion
}

export function etiquetaEncima(e: Encima): string {
  if (e.estado === "entendiendo") return "entendiendo…"
  if (e.estado === "sigo") return "sigo"
  if (e.estado === "parada") return "me callo"
  if (e.intencion === "correccion") return "corrigiendo la respuesta"
  if (e.intencion === "pregunta") return "pregunta nueva"
  return "agregando a la respuesta"
}
