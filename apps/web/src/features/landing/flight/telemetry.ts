/**
 * Lecturas del tablero: fecha de misión, Sol y Tierra sobre el polo y el estado del sitio destacado
 * (visible u oculto, y cuánto falta para que cambie). Funciones puras.
 */
import { bearingDeg, poleElevationDeg, type Sky } from "./engine/ephemeris"

export type Series = { heightM: number; sunMargin: number[]; earthMargin: number[]; panelWm2: number[] }

export type Featured = { stepMs: number; startMs: number; series: Series[] }

const pad = (value: number) => String(value).padStart(2, "0")

export function formatUTC(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

const signed = (value: number, digits: number) => `${value < 0 ? "-" : "+"}${Math.abs(value).toFixed(digits)}`

export function formatBody(direction: readonly number[]): string {
  return `Lon ${bearingDeg(direction).toFixed(0).padStart(3, "0")}° E, elev ${signed(poleElevationDeg(direction), 2)}°`
}

/** Días y horas enteras, sin redondear hacia arriba: igual que la cuenta regresiva del planificador. */
export function formatSpan(ms: number): string {
  const totalHours = Math.max(0, Math.floor(ms / 3_600_000))
  const days = Math.floor(totalHours / 24)
  return days > 0 ? `${days} d ${pad(totalHours % 24)} h` : `${totalHours} h`
}

/** Estado de un cuerpo en la serie: visible si el margen es mayor que 0, y cuándo cruza cero. */
function status(margin: number[], stepMs: number, startMs: number, ms: number): { visible: boolean; changeInMs: number | null } {
  const s = Math.min(Math.max((ms - startMs) / stepMs, 0), margin.length - 1.001)
  const i = Math.floor(s)
  const now = margin[i] + (margin[i + 1] - margin[i]) * (s - i)
  const visible = now > 0
  for (let k = i + 1; k < margin.length; k++) {
    if (margin[k] > 0 !== visible) {
      const a = k - 1 === i ? now : margin[k - 1]
      const from = k - 1 === i ? s : k - 1
      const cross = from + ((a - 0) / (a - margin[k])) * (k - from)
      return { visible, changeInMs: (cross - s) * stepMs }
    }
  }
  return { visible, changeInMs: null }
}

export function formatSite(featured: Featured, body: "sun" | "earth", ms: number): string {
  const ground = featured.series[0]
  const { visible, changeInMs } = status(body === "sun" ? ground.sunMargin : ground.earthMargin, featured.stepMs, featured.startMs, ms)
  const name = body === "sun" ? "Sun" : "Earth"
  if (changeInMs === null) return `${name} ${visible ? "in view" : "hidden"}`
  // "Sets in" ya dice que está a la vista, y "rises in" que está oculto.
  return `${name} ${visible ? "sets in" : "rises in"} ${formatSpan(changeInMs)}`
}

export function readouts(featured: Featured, sky: Sky, ms: number) {
  return {
    time: formatUTC(ms),
    sun: formatBody(sky.sun),
    earth: formatBody(sky.earth),
    siteSun: formatSite(featured, "sun", ms),
    siteEarth: formatSite(featured, "earth", ms),
  }
}
