import type { Palabra } from "./colaDeVoz"

// Kokoro dice «Ah, the distance… Let me see.» casi de corrido: apenas para en la puntuación (pedido de Manuel,
// 2026-11-15: «tiene que respetar los signos»). Con los tiempos por palabra que da la voz se sabe dónde termina cada
// signo: ahí se corta el audio y se deja este silencio (s) antes de la palabra siguiente.
const SILENCIO_TRAS: [RegExp, number][] = [
  [/[.!?…]$/, 0.32],
  [/[;:—–]$/, 0.22],
  [/,$/, 0.16],
]
/** Dónde cortar el audio de una frase y cuánto silencio dejar: tras cada signo que va seguido de otra palabra. */
export function pausasDePuntuacion(palabras: Palabra[], duracion: number): { t: number; silencio: number }[] {
  const cortes: { t: number; silencio: number }[] = []
  for (let k = 0; k < palabras.length - 1; k++) {
    const signo = palabras[k]![0].trim()
    const siguiente = palabras[k + 1]!
    if (!/[\p{L}\d]/u.test(siguiente[0])) continue // otro signo pegado («?»): corta en el último
    const silencio = SILENCIO_TRAS.find(([re]) => re.test(signo))?.[1] ?? 0
    if (!silencio) continue
    const t = (palabras[k]![3] + siguiente[2]) / 2
    if (t > 0.05 && t < duracion - 0.05) cortes.push({ t, silencio })
  }
  return cortes
}
