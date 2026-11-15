/**
 * Lectura de los datos del cielo para las pantallas del software: interpolación en el tiempo, horizonte por
 * azimut y estado de visibilidad a partir de las ventanas que calculó el motor. Funciones puras.
 */
import { formatSpan } from "../../flight/telemetry"
import data from "../data/sky.json"

export const sky = data
export const HOUR_MS = 3_600_000
/** Última hora del día lunar del relato. */
export const LAST = data.hours - 1
export type HeightId = "ground" | "mast"
export type Body = { az: number[]; el: number[] }
export type Figures = { sunPct: number; earthPct: number; bothPct: number; longestNightH: number; longestSilenceH: number; meanPanelWm2: number }

export const inside = (windows: number[][], t: number) => windows.some(([a, b]) => t >= a && t < b)

/** Azimut y elevación de un cuerpo en la muestra fraccionaria s (el azimut da la vuelta en 360). */
export function at(body: Body, s: number): [number, number] {
  const last = body.az.length - 1
  const i = Math.min(Math.max(Math.floor(s), 0), last - 1)
  const f = Math.min(Math.max(s - i, 0), 1)
  let a = body.az[i]
  let b = body.az[i + 1]
  if (b - a > 180) a += 360
  else if (a - b > 180) b += 360
  return [(((a + (b - a) * f) % 360) + 360) % 360, body.el[i] + (body.el[i + 1] - body.el[i]) * f]
}

/** Elevación del horizonte real en un azimut (el perfil trae un valor por grado). */
export function horizonAt(horizon: number[], az: number): number {
  const a = ((az % 360) + 360) % 360
  const i = Math.floor(a)
  return horizon[i] + (horizon[(i + 1) % 360] - horizon[i]) * (a - i)
}

/** Visible u oculto en la hora t y cuántas horas faltan para que cambie (null: no cambia en los datos). */
export function stateOf(windows: number[][], t: number): { visible: boolean; hours: number | null } {
  const current = windows.find(([a, b]) => t >= a && t < b)
  if (current) return { visible: true, hours: current[1] >= 1559 ? null : current[1] - t }
  const next = windows.find(([a]) => a > t)
  return { visible: false, hours: next ? next[0] - t : null }
}

/** Horas que dura el anochecer (y el amanecer) de la ventana: unos dos segundos y medio con el tiempo corriendo. */
export const DUSK_H = 40

/**
 * Cuánta noche hay en la hora t, de 0 (día) a 1 (noche cerrada). Con el Sol a la vista vale 0 y sube según se
 * acerca la puesta, hasta 1 justo cuando se oculta. De noche vale 1 y baja según se acerca la salida.
 */
export function darkness(windows: number[][], t: number): number {
  const { visible, hours } = stateOf(windows, t)
  if (hours === null) return visible ? 0 : 1
  const near = Math.min(Math.max(1 - hours / DUSK_H, 0), 1)
  const eased = near * near * (3 - 2 * near)
  return visible ? eased : 1 - eased
}

export const span = (hours: number) => formatSpan(hours * HOUR_MS)
export const percent = (value: number) => `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}%`

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const pad = (value: number) => String(value).padStart(2, "0")
/** "13 Dec 2026, 10:51 UT", como lo escribe el software. */
export function stamp(t: number): string {
  const d = new Date(data.startMs + t * HOUR_MS)
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UT`
}

/** Veredicto de ejemplo: los umbrales se explican en la propia pantalla y en el planificador los pone el usuario. */
export type Verdict = "viable" | "limited" | "no"
export const verdictOf = (f: { sunPct: number; earthPct: number }): Verdict => (f.sunPct >= 75 && f.earthPct >= 25 ? "viable" : f.sunPct < 35 || f.earthPct < 5 ? "no" : "limited")
