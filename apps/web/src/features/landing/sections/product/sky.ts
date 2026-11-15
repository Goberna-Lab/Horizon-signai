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

/** Horas que dura el anochecer (y el amanecer) de la ventana: el tramo en el que el Sol baja a la vista. */
export const DUSK_H = 40
/** Parte de ese tramo en la que la pantalla pasa del papel al negro: el resto, el Sol baja ya sobre el cielo negro. */
export const NIGHTFALL = 0.3
/** Horas de noche junto al cambio en las que la corona todavía asoma tras el horizonte. */
export const AFTERGLOW_H = 12
/** Última hora con datos de ventanas: una ventana que llega hasta aquí no termina en una puesta. */
const DATA_END_H = 1559

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)
const smooth = (x: number) => x * x * (3 - 2 * x)

/** El cambio (salida o puesta) más cercano a la hora t: de qué tipo es, a cuántas horas queda y si el Sol está a la vista. */
export type Turn = { rising: boolean; up: boolean; hours: number }
export function turnOf(windows: number[][], t: number): Turn | null {
  let best: Turn | null = null
  const up = inside(windows, t)
  for (const [from, to] of windows) {
    if (from > 0 && (!best || Math.abs(t - from) < best.hours)) best = { rising: true, up, hours: Math.abs(t - from) }
    if (to < DATA_END_H && (!best || Math.abs(t - to) < best.hours)) best = { rising: false, up, hours: Math.abs(t - to) }
  }
  return best
}

/**
 * Cuánta noche hay en la hora t, de 0 (día) a 1 (cielo negro). Lejos del cambio, con el Sol a la vista, vale 0. Al
 * entrar en el anochecer sube rápido hasta 1 (la Luna no tiene atmósfera: el cielo es negro aunque el Sol siga
 * arriba) y así se queda toda la noche. Tras la salida baja igual de rápido cuando el Sol ya está alto.
 */
export function darkness(windows: number[][], t: number): number {
  const turn = turnOf(windows, t)
  if (!turn || !turn.up) return inside(windows, t) ? 0 : 1
  return smooth(clamp01((1 - turn.hours / DUSK_H) / NIGHTFALL))
}

/** Velocidad del tiempo durante el cambio, respecto a la normal (0.5 = la mitad). */
export const TURN_TEMPO = 0.5

/**
 * Velocidad del tiempo cuando corre solo, de 0 a 1: se frena alrededor de la puesta y de la salida para que el
 * cambio se pueda ver (a velocidad normal duraría dos segundos y medio).
 */
export function tempo(windows: number[][], t: number): number {
  const turn = turnOf(windows, t)
  if (!turn) return 1
  const near = clamp01(1 - turn.hours / (turn.up ? DUSK_H : AFTERGLOW_H))
  return 1 - (1 - TURN_TEMPO) * smooth(clamp01(near * 4))
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
