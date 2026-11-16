// Bitácoras de misiones reales (ver tipos.ts): IM-1 Odysseus, IM-2 Athena y Blue Ghost Mission 1.
import { BLUE_GHOST_1 } from "./blueGhost.ts"
import { IM1 } from "./im1.ts"
import { IM2 } from "./im2.ts"
import type { Bitacora, Hecho } from "./tipos.ts"

export type { Bitacora, Fuente, Hecho, Tema, Texto } from "./tipos.ts"
export { BLUE_GHOST_1, IM1, IM2 }

/** En el orden en que pasaron. */
export const BITACORAS: readonly Bitacora[] = [IM1, BLUE_GHOST_1, IM2]

const DIA_MS = 86_400_000
/** Medianoche UTC del día de un ISO (fecha u hora). */
const diaUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))

/**
 * Día de la misión en que pasa el hecho, contando el del contacto como día 1 (por fecha UTC). `null` si el hecho no
 * tiene fecha (antes de la misión). Negativo o 0: antes del día del contacto.
 */
export function diaDeMision(b: Bitacora, h: Hecho): number | null {
  if (h.utc == null) return null
  return Math.round((diaUtc(h.utc) - diaUtc(b.contactoUtc)) / DIA_MS) + 1
}

/** Los hechos con fecha hasta el instante `ms` (lo que ya pasó en la reproducción); los sin fecha van siempre. */
export function hechosHasta(b: Bitacora, ms: number): Hecho[] {
  return b.hechos.filter((h) => h.utc == null || Date.parse(h.utc) <= ms)
}

/** Las fuentes de un hecho, en el orden en que las cita. */
export const fuentesDe = (b: Bitacora, h: Hecho) => h.fuentes.map((id) => b.fuentes.find((f) => f.id === id)!)
