// Notas entre corchetes que el modelo escribe en una respuesta HABLADA y que nadie debe oír.
//
// El API pega notas entre corchetes al final de cada pregunta («[Note from the app, not from the person. …]» con los
// extractos del RAG, el recordatorio de las órdenes, el del idioma). El modelo a veces imita ese formato y escribe
// las suyas: medido en producción el 2026-11-15, EVA dijo en voz alta «[Note from the system: The provided reference
// excerpts do not…]» y, otra vez, contestó solo con «[Response to "What does REVIEW mean?"] [Response to …]». El
// prompt ya le pide no escribir corchetes y no siempre lo cumple: este filtro es lo que lo garantiza.
//
// Va sobre el stream, trozo a trozo (un corchete puede abrirse en un trozo y cerrarse en otro), como el filtro de
// órdenes «<<…>>» (apps/api/src/acciones.ts). Solo para la voz: en el chat de texto hay Markdown, y un enlace
// «[texto](url)» lleva corchetes legítimos.

/** Quita todo lo que esté entre corchetes, trozo a trozo. Un corchete que no se cierra se descarta hasta el final. */
export function filtroDeNotas() {
  let dentro = false
  return {
    pasar(delta: string): string {
      let salida = ""
      for (const c of delta) {
        if (dentro) {
          if (c === "]") dentro = false
        } else if (c === "[") dentro = true
        else salida += c
      }
      return salida
    },
  }
}

/** Lo mismo sobre un texto entero, con los espacios que dejan las notas quitadas ya arreglados. */
export function sinNotas(texto: string): string {
  return filtroDeNotas()
    .pasar(texto)
    .replace(/[ \t]+([.,!?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

/** Lo que EVA dice si la respuesta entera eran notas: mejor una frase honesta que el silencio. */
export const SIN_RESPUESTA: Record<"en" | "es", string> = {
  en: "Sorry, I lost my train of thought. Could you ask me again?",
  es: "Perdón, se me fue la idea. ¿Me lo preguntas otra vez?",
}
