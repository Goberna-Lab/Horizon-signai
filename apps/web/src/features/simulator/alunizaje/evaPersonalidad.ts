// Personalidad de EVA (portada de nuestro simulador NASA, evaPersonalidad.js): juguetona cuando todo va bien, seria
// cuando hay peligro, y nunca parlanchina.
//  · Los avisos de peligro no pasan por aquí: se dicen tal cual, cortos y serios.
//  · Los comentarios espontáneos son opcionales: como mucho uno cada GAP segundos, solo si EVA no está hablando ni tiene
//    nada en cola, nunca con un peligro activo (`serio`), y con un dado para que no sea predecible. Algunos, una sola vez.
// En Horizon solo hay alunizaje: de momento solo trae la línea del aterrizaje. Para añadir un comentario, se agrega su
// evento a LINEAS y se llama a `comentar(evento, ctx, { prob, una })` desde landing.ts.

import type { Voz } from "./voz"

const GAP = 90 // segundos mínimos entre comentarios espontáneos

type Ctx = Record<string, string | number>
type Linea = string | ((c: Ctx) => string)

// Cada evento: lista de frases (texto o función del contexto). Datos reales; el chiste, corto y al final.
const LINEAS: Record<string, Linea[]> = {
  landed: [
    "Nominal landing. Welcome to the lunar south pole. Population: you.",
    "Touchdown, nice and soft. Welcome to the lunar south pole.",
  ],
}

/** Todas las frases fijas (sin contexto): para precargarlas en la voz. */
export const LINEAS_FIJAS = Object.values(LINEAS)
  .flat()
  .filter((l): l is string => typeof l === "string")

export class Personalidad {
  /** Con un peligro activo EVA no bromea. */
  serio = false
  private last = -1e9
  private readonly used = new Set<Linea>()
  private readonly once = new Set<string>()

  constructor(private readonly voz: Voz) {}

  private pick(arr: Linea[]) {
    const libres = arr.filter((x) => !this.used.has(x))
    const pool = libres.length ? libres : arr
    if (!libres.length) for (const x of arr) this.used.delete(x)
    const x = pool[Math.floor(Math.random() * pool.length)]
    this.used.add(x)
    return x
  }

  /** Comentario espontáneo. `una`: solo la primera vez que ocurre; `prob`: probabilidad de decirlo. True si habló. */
  comentar(evento: string, ctx: Ctx = {}, { prob = 0.5, una = false } = {}) {
    const pool = LINEAS[evento]
    const v = this.voz
    const now = performance.now() / 1000
    if (!pool || this.serio || !v.on) return false
    if (una && this.once.has(evento)) return false
    if (now - this.last < GAP || v.ocupada) return false // nunca encima de otra cosa
    if (una) this.once.add(evento)
    if (Math.random() > prob) return false
    const l = this.pick(pool)
    this.last = now
    v.say(typeof l === "function" ? l(ctx) : l, { prio: 0, key: "q:" + evento + ":" + now, cooldownS: 0 })
    return true
  }

  /** Línea de un evento sin las reglas de frecuencia (para lo que se dice sí o sí, como el aterrizaje). */
  linea(evento: string, ctx: Ctx = {}) {
    const pool = LINEAS[evento]
    if (!pool) return null
    const l = this.pick(pool)
    return typeof l === "function" ? l(ctx) : l
  }
}
