/** Cómo escribe el planificador fechas, duraciones, cifras y requisitos. Todo en UTC. Funciones puras. */
import type { Check } from "./evaluate.ts"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const pad = (value: number) => String(value).padStart(2, "0")

/** "29 Mar 2027" */
export function day(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** "29 Mar" */
export function shortDay(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** "12:00 UT" */
export function clock(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UT`
}

/** "29 Mar 2027, 12:00 UT", como lo escribe la landing. */
export const stamp = (ms: number) => `${day(ms)}, ${clock(ms)}`

/** Días y horas enteras, sin redondear hacia arriba: "1 d 13 h". Igual que la cuenta regresiva de la landing. */
export function span(ms: number): string {
  const totalHours = Math.max(0, Math.floor(ms / 3_600_000))
  const days = Math.floor(totalHours / 24)
  return days > 0 ? `${days} d ${pad(totalHours % 24)} h` : `${totalHours} h`
}

/** Porcentaje con un decimal, sin decimales en los extremos: "56.4%", "100%". */
export function percent(value: number): string {
  if (value >= 99.95) return "100%"
  if (value < 0.05) return "0%"
  return `${value.toFixed(1)}%`
}

export const hours = (value: number) => `${Math.round(value)} h`
/** Ángulo respecto del horizonte del terreno: "4.6° below the terrain". */
export const against = (marginDeg: number) => `${Math.abs(marginDeg).toFixed(1)}° ${marginDeg > 0 ? "above" : "below"} the terrain`

/** Valor para un `<input type="datetime-local">`, en UTC: "2027-03-29T12:00". */
export function toInput(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/** Lee ese valor como UTC. `null` si no es una fecha. */
export function fromInput(value: string): number | null {
  const ms = Date.parse(`${value.length === 16 ? `${value}:00` : value}Z`)
  return Number.isNaN(ms) ? null : ms
}

/** "89.463° S, 222.510° E" */
export const coordinates = (lat: number, lon: number) => `${Math.abs(lat).toFixed(3)}° ${lat < 0 ? "S" : "N"}, ${lon.toFixed(3)}° E`

/** Un requisito en palabras: qué se pidió y qué se midió. */
export function describe(c: Check): { title: string; detail: string } {
  switch (c.id) {
    case "sunAtLanding":
      return { title: c.ok ? "Sun in view at landing" : "Sun hidden at landing", detail: `Upper edge of the Sun ${against(c.value)}` }
    case "earthAtLanding":
      return { title: c.ok ? "Earth in view at landing" : "Earth hidden at landing", detail: `Centre of Earth ${against(c.value)}` }
    case "battery":
      return { title: c.ok ? "Longest night fits the battery" : "Longest night outlasts the battery", detail: `${hours(c.value)} without Sun; the battery lasts ${hours(c.limit)}` }
    case "earthContact":
      return { title: c.ok ? "Enough Earth contact" : "Too little Earth contact", detail: `Earth in view ${percent(c.value)} of the stay; the mission needs ${percent(c.limit)}` }
  }
}

/** Lo que falla, en una línea, para el aviso y la lista: "Earth hidden at landing · longest night 105 h, battery 50 h". */
export function reasons(checks: Check[]): string {
  return checks
    .filter((c) => !c.ok)
    .map((c) => {
      if (c.id === "battery") return `longest night ${hours(c.value)}, battery ${hours(c.limit)}`
      if (c.id === "earthContact") return `Earth in view ${percent(c.value)}, needs ${percent(c.limit)}`
      return describe(c).title
    })
    .map((text, i) => (i === 0 ? text[0].toUpperCase() + text.slice(1) : text))
    .join(" · ")
}
