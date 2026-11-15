// Qué hacer con lo que oyó el micrófono abierto de /prueba-ia. Lo comparten el navegador y el API
// (que decide en el servidor para ahorrar viajes: ver /voz/escuchar en apps/api/src/z6.ts).
//
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
  // Una o dos palabras sueltas que no son pregunta: casi siempre un «uh-huh» mal oído (small.en lo
  // transcribía «y'all»; large-v3-turbo, «It's home» o «It's high»). «Why?» sí corta: lleva el signo.
  if (o.length <= 2 && !oido.includes("?")) return "asentimiento"
  return "habla"
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
