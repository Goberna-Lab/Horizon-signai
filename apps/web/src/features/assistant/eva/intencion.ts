// Qué quiso la persona con lo que le escribió a EVA en medio de un recorrido guiado. El recorrido es un guion con voz
// grabada: seguir, repetir y parar se resuelven aquí, sin IA. Solo cuando es una pregunta (o cualquier otra cosa que
// no sea una de esas órdenes) se le pasa a la IA, que contesta y devuelve el recorrido al paso donde estaba.
// Pedido de Estephano (2026-11-15): que el guion no dependa de la IA y que, si se detecta una pregunta, la conteste.
//
// Regla simple, sin modelo: una orden es un texto corto que, quitando el «por favor» y los signos, es una de las
// frases de la lista. Todo lo demás es una pregunta. Ante la duda gana la pregunta: si alguien escribe «next week?»
// espera una respuesta, no que el recorrido avance.

export type Intencion = "siguiente" | "repetir" | "parar" | "pregunta"

const ORDENES: Record<Exclude<Intencion, "pregunta">, string[]> = {
  siguiente: [
    "next", "next one", "next step", "continue", "go on", "go ahead", "keep going", "carry on", "move on", "ok", "okay", "yes", "yep", "yeah", "sure", "got it", "ready",
    "siguiente", "el siguiente", "sigue", "sigamos", "seguir", "continua", "continuar", "continuemos", "adelante", "dale", "vamos", "si", "listo", "ya", "entendido", "avanza",
  ],
  repetir: [
    "again", "repeat", "repeat that", "say that again", "say it again", "once more", "one more time", "what", "sorry", "pardon",
    "otra vez", "de nuevo", "repite", "repitelo", "repetir", "repite eso", "como", "que", "perdon",
  ],
  parar: [
    "stop", "stop it", "enough", "quit", "exit", "end", "end tour", "stop the tour", "cancel", "no", "no thanks", "not now", "later",
    "para", "parar", "basta", "detente", "alto", "salir", "terminar", "termina", "cancelar", "cancela", "no gracias", "ahora no", "luego", "despues",
  ],
}

const RELLENO = new Set(["please", "pls", "eva", "por", "favor", "porfa", "porfavor", "the", "tour", "now"])

const limpiar = (texto: string) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // sin tildes: «continúa» y «continua» son la misma orden
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const TABLA = new Map<string, Exclude<Intencion, "pregunta">>()
for (const [orden, frases] of Object.entries(ORDENES) as [Exclude<Intencion, "pregunta">, string[]][]) for (const f of frases) TABLA.set(f, orden)

/** Qué hacer con lo que escribieron durante el recorrido. Lo que no es una orden clara es una pregunta para la IA. */
export function intencionDe(texto: string): Intencion {
  const t = limpiar(texto)
  if (!t) return "pregunta"
  const exacta = TABLA.get(t)
  // «what?», «¿cómo?», «sorry?»: piden que lo repita; con más palabras ya es una pregunta de verdad.
  if (exacta === "repetir") return "repetir"
  // Con signo de pregunta es una pregunta, aunque empiece como una orden («next step?», «¿seguimos con la batería?»).
  if (/[?¿]/.test(texto)) return "pregunta"
  if (exacta) return exacta
  // La misma orden con relleno alrededor: «next please», «sigue por favor», «eva, stop».
  const sinRelleno = t
    .split(" ")
    .filter((p) => !RELLENO.has(p))
    .join(" ")
  return (sinRelleno && TABLA.get(sinRelleno)) || "pregunta"
}
