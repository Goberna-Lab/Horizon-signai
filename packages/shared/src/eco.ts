// El eco: mientras la IA grande piensa, EVA nombra en pocas palabras el tema de lo que le preguntaron («Ah, the
// distance between the Earth and the Moon.»), para que el silencio no se note. Pedido de Manuel (2026-11-15).
//
// El modelo chico (qwen3:8b en Geografo, apps/api/src/assistant/eco.ts) solo escribe el TEMA («the distance between
// the Earth and the Moon»); la frase la arma este archivo con una plantilla. Así el eco nunca responde ni afirma
// nada (no hay de dónde sacar una cifra) y las frases varían sin depender del modelo.
//
// Por qué corto y variado (investigación del 2026-11-15 sobre la voz de ChatGPT): ChatGPT dice UN
// acuse breve y distinto cada vez, no repite la pregunta entera (su prompt filtrado lo prohíbe y en los foros molesta
// «it just rephrases my question»), y lo que dura el eco es lo que se retrasa la respuesta: el eco largo («…Let me see
// what I have.») la hacía esperar ~1 s más (medido). La variedad es de estructura, no solo de la palabra inicial.

export type IdiomaEco = "en" | "es"

/**
 * Plantillas del eco: `{t}` es el tema tal cual, `{T}` con la primera letra en mayúscula (cuando abre la frase). Una
 * sola frase corta cada una. No empiezan con las palabras de los murmullos que suenan antes (PUENTES en preguntas.ts).
 */
export const PLANTILLAS_ECO: Record<IdiomaEco, string[]> = {
  en: ["Ah, {t}.", "{T}, let me look.", "So, {t}.", "{T}? On it.", "Got it, {t}.", "Right, {t}.", "{T}. Let me check my notes.", "I see, {t}."],
  es: ["Ah, {t}.", "{T}, déjame ver.", "Ya, {t}.", "¿{T}? Lo reviso.", "Entiendo, {t}.", "Claro, {t}.", "{T}. Déjame revisar mis notas.", "Ajá, {t}."],
}

// Un tema más largo ya no es un eco sino otra pregunta entera: mejor callar.
const MAX_PALABRAS = 12
const MAX_CARACTERES = 90

/**
 * El tema que escribió el modelo, listo para la plantilla, o "" si no sirve: vacío, largo, con cifras (el eco no
 * afirma datos) o con algo que no es texto hablado.
 */
export function limpiarTema(crudo: string): string {
  let t = crudo
    .normalize("NFKC")
    .replace(/[\r\n]+/g, " ")
    .replace(/["“”«»*_#`<>[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[¿¡]+/, "")
    .replace(/[.?!¿¡…,;:]+$/, "")
    .trim()
  if (!t || /\d/.test(t) || t.length > MAX_CARACTERES || t.split(" ").length > MAX_PALABRAS) return ""
  // «The distance…» → «the distance…» (va a media frase); «Earth», «NASA» o «Zone A» quedan como están.
  if (/^(The|A|An|Why|How|What|When|Where|Who|Which|Whether|If|La|El|Los|Las|Un|Una|Por|Cómo|Qué|Cuál|Cuánto|Cuánta|Cuándo|Dónde|Quién|Si)\b/.test(t))
    t = t[0]!.toLowerCase() + t.slice(1)
  return t
}

/** La frase del eco con la plantilla `k` (el API las va rotando: nunca la misma dos veces seguidas). */
export function armarEco(tema: string, idioma: IdiomaEco, k: number): string {
  const t = limpiarTema(tema)
  if (!t) return ""
  const lista = PLANTILLAS_ECO[idioma]
  const plantilla = lista[((k % lista.length) + lista.length) % lista.length]!
  return plantilla.replace("{T}", t[0]!.toUpperCase() + t.slice(1)).replace("{t}", t)
}
