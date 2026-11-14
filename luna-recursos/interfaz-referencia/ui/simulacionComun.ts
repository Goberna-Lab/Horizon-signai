// E26: utilidades de la simulación que comparten el asistente, el panel y el estado de la página (no son componentes).
import metaTabla from '../data/efemerides-luna.json'
import urlTabla from '../data/efemerides-luna.f32?url'
import { crearTablaLuna, type TablaLuna } from '../engine/efemeridesLuna'
import type { MuestraDescenso } from '../engine/descenso'
import { REQUISITOS_EJEMPLO, type Requisitos } from '../engine/simulacion'
import type { IdSitio } from '../engine/sitio'

/** Lo que el asistente entrega para simular. */
export type PlanSimulacion = { mision: string; sitio: IdSitio; contactoMs: number; requisitos: Requisitos }

let promesaTabla: Promise<TablaLuna> | null = null
export function cargarTablaLuna(): Promise<TablaLuna> {
  promesaTabla ??= fetch(urlTabla)
    .then((r) => r.arrayBuffer())
    .then((b) => crearTablaLuna(b, metaTabla))
  return promesaTabla
}

/** Plan por defecto (Good Defaults): el sitio activo, el 2027-01-01 a las 00:00 UTC, requisitos de ejemplo. */
export const planPorDefecto = (sitio: IdSitio): PlanSimulacion => ({
  mision: 'Misión de prueba',
  sitio,
  contactoMs: Date.parse('2027-01-01T00:00:00Z'),
  requisitos: REQUISITOS_EJEMPLO,
})

/** Muestra interpolada del descenso en τ segundos desde el encendido. */
export function muestraEn(m: MuestraDescenso[], tau: number): MuestraDescenso {
  if (tau <= m[0].tS) return m[0]
  const ultima = m[m.length - 1]
  if (tau >= ultima.tS) return ultima
  let i = Math.min(Math.floor(tau), m.length - 2)
  while (i > 0 && m[i].tS > tau) i--
  while (i < m.length - 2 && m[i + 1].tS < tau) i++
  const a = m[i]
  const b = m[i + 1]
  const f = (tau - a.tS) / (b.tS - a.tS)
  const l = (x: number, y: number) => x + (y - x) * f
  return {
    tS: tau,
    fase: f < 0.5 ? a.fase : b.fase,
    alturaM: l(a.alturaM, b.alturaM),
    alcanceM: l(a.alcanceM, b.alcanceM),
    vVerticalMs: l(a.vVerticalMs, b.vVerticalMs),
    vHorizontalMs: l(a.vHorizontalMs, b.vHorizontalMs),
    masaKg: l(a.masaKg, b.masaKg),
    empuje: f < 0.5 ? a.empuje : b.empuje,
    inclinacionGrados: l(a.inclinacionGrados, b.inclinacionGrados),
    deltaVMs: l(a.deltaVMs, b.deltaVMs),
  }
}

