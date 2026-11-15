/** Cómo escribe el planificador fechas, duraciones, cifras y requisitos. Todo en UTC. Funciones puras. */
import { tr } from "../../i18n/index.ts"
import type { Check } from "./evaluate.ts"

const MONTHS = tr(
  ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
)
/** Elige entre el texto en inglés y el texto en español. Por defecto elige `tr`: el idioma de la página. */
type Choose = <T>(en: T, es: T) => T
/** Siempre inglés: para lo que lee el modelo del asistente y no una persona (`../context.ts`). */
export const inEnglish: Choose = (en) => en
const pad = (value: number) => String(value).padStart(2, "0")

/** "29 Mar 2027"; en español, "29 mar 2027". */
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
export const against = (marginDeg: number, t: Choose = tr) => `${Math.abs(marginDeg).toFixed(1)}° ${marginDeg > 0 ? t("above the terrain", "sobre el terreno") : t("below the terrain", "bajo el terreno")}`

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
export function describe(c: Check, t: Choose = tr): { title: string; detail: string } {
  switch (c.id) {
    case "sunAtLanding":
      return {
        title: c.ok ? t("Sun in view at landing", "Sol a la vista al aterrizar") : t("Sun hidden at landing", "Sol oculto al aterrizar"),
        detail: `${t("Upper edge of the Sun", "Borde superior del Sol")} ${against(c.value, t)}`,
      }
    case "earthAtLanding":
      return {
        title: c.ok ? t("Earth in view at landing", "Tierra a la vista al aterrizar") : t("Earth hidden at landing", "Tierra oculta al aterrizar"),
        detail: `${t("Centre of Earth", "Centro de la Tierra")} ${against(c.value, t)}`,
      }
    case "battery":
      return {
        title: c.ok ? t("Longest night fits the battery", "La noche más larga cabe en la batería") : t("Longest night outlasts the battery", "La noche más larga supera la batería"),
        detail: t(`${hours(c.value)} without Sun; the battery lasts ${hours(c.limit)}`, `${hours(c.value)} sin Sol; la batería dura ${hours(c.limit)}`),
      }
    case "earthContact":
      return {
        title: c.ok ? t("Enough Earth contact", "Suficiente contacto con la Tierra") : t("Too little Earth contact", "Poco contacto con la Tierra"),
        detail: t(
          `Earth in view ${percent(c.value)} of the stay; the mission needs ${percent(c.limit)}`,
          `Tierra a la vista el ${percent(c.value)} de la estadía; la misión necesita el ${percent(c.limit)}`,
        ),
      }
  }
}

/** Lo que falla, en una línea, para el aviso y la lista: "Earth hidden at landing · longest night 105 h, battery 50 h". */
export function reasons(checks: Check[]): string {
  return checks
    .filter((c) => !c.ok)
    .map((c) => {
      if (c.id === "battery") return tr(`longest night ${hours(c.value)}, battery ${hours(c.limit)}`, `noche más larga ${hours(c.value)}, batería ${hours(c.limit)}`)
      if (c.id === "earthContact") return tr(`Earth in view ${percent(c.value)}, needs ${percent(c.limit)}`, `Tierra a la vista ${percent(c.value)}, necesita ${percent(c.limit)}`)
      return describe(c).title
    })
    .map((text, i) => (i === 0 ? text[0].toUpperCase() + text.slice(1) : text))
    .join(" · ")
}
