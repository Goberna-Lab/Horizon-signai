/**
 * Evaluación de una misión con el motor: cuánto Sol y cuánta Tierra hay durante la estadía, si se cumplen los
 * requisitos y qué salidas hay cuando no (otra fecha, otro lugar, más altura). Funciones puras, sin React.
 *
 * El motor (`../engine`) mira el Sol y la Tierra desde un solo horizonte. Aquí el panel y la antena pueden ir a
 * alturas distintas: el Sol se mide con el horizonte visto desde el panel y la Tierra con el visto desde la antena.
 * Simplificación declarada: los dos están en el mismo punto del terreno y cada uno cuenta como un punto, no como una
 * superficie. Las definiciones de "visible" y las cifras son las del motor (docs/04-planificador.md, sección 4).
 */
import { prepararSitio, type SitioLuna, type TablaLuna } from "../engine/efemeridesLuna.ts"
import { perfilDesde, type Mascara, type PerfilHorizonte } from "../engine/mascara.ts"
import { barrer, margenSol, margenTierra, proximoCambio, ventanas, type Barrido, type Ventana } from "../engine/planificador.ts"
import type { Requirements } from "./types.ts"

/** Paso del barrido: 10 min, el del planificador (docs/04-planificador.md, 3.5). */
export const STEP_MS = 600_000
export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000
const STEPS_PER_DAY = DAY_MS / STEP_MS

/** Un lugar con su equipo, listo para calcular. */
export type Station = { site: SitioLuna; panel: PerfilHorizonte; antenna: PerfilHorizonte }

export function station(place: { lat: number; lon: number }, mask: Mascara, panelHeightM: number, antennaHeightM: number): Station {
  const panel = perfilDesde(mask, panelHeightM)
  // Con la misma altura se comparte el perfil: así el barrido se hace una sola vez.
  return { site: prepararSitio(place.lat, place.lon), panel, antenna: antennaHeightM === panelHeightM ? panel : perfilDesde(mask, antennaHeightM) }
}

/** Barrido del motor con el Sol visto desde el panel y la Tierra vista desde la antena. */
export function sweep(table: TablaLuna, st: Station, fromMs: number, toMs: number, stepMs = STEP_MS): Barrido {
  const sun = barrer(table, { sitio: st.site, perfil: st.panel }, fromMs, toMs, stepMs)
  if (st.antenna === st.panel) return sun
  const earth = barrer(table, { sitio: st.site, perfil: st.antenna }, fromMs, toMs, stepMs)
  return { ...sun, tierraSobreHorizonte: earth.tierraSobreHorizonte }
}

export type Figures = {
  sunPct: number
  earthPct: number
  bothPct: number
  sunH: number
  earthH: number
  bothH: number
  /** Mayor intervalo seguido sin Sol (h): lo que tiene que aguantar la batería. */
  longestNightH: number
  /** Mayor intervalo seguido sin Tierra (h). */
  longestSilenceH: number
  /** Irradiancia media sobre el panel vertical que sigue al Sol (W/m², a 1 UA). */
  meanPanelWm2: number
}

/**
 * Las cifras de `resumir` (motor) sobre un tramo del barrido: `n` muestras desde `i0`. Mismas definiciones; sirve
 * para probar muchas fechas de aterrizaje con un solo barrido largo. La prueba comprueba que coincide con `resumir`.
 */
export function figures(b: Barrido, i0 = 0, n = b.n - i0): Figures {
  let sun = 0
  let earth = 0
  let both = 0
  let panel = 0
  let noSun = 0
  let noEarth = 0
  let night = 0
  let silence = 0
  for (let k = i0; k < i0 + n; k++) {
    const s = margenSol(b.solSobreHorizonte[k]) > 0
    const t = margenTierra(b.tierraSobreHorizonte[k]) > 0
    if (s) sun++
    if (t) earth++
    if (s && t) both++
    panel += b.panelWm2[k]
    noSun = s ? 0 : noSun + 1
    noEarth = t ? 0 : noEarth + 1
    if (noSun > night) night = noSun
    if (noEarth > silence) silence = noEarth
  }
  const h = b.pasoMs / HOUR_MS
  return {
    sunPct: (sun / n) * 100,
    earthPct: (earth / n) * 100,
    bothPct: (both / n) * 100,
    sunH: sun * h,
    earthH: earth * h,
    bothH: both * h,
    longestNightH: night * h,
    longestSilenceH: silence * h,
    meanPanelWm2: panel / n,
  }
}

export type CheckId = "sunAtLanding" | "earthAtLanding" | "battery" | "earthContact"
/** Un requisito comprobado: el valor medido y el límite que pidió quien planifica. */
export type Check = { id: CheckId; ok: boolean; value: number; limit: number }

/** Comprueba los requisitos sobre las cifras de la estadía y el estado en el aterrizaje (márgenes en grados). */
export function check(f: Figures, sunMarginDeg: number, earthMarginDeg: number, req: Requirements): Check[] {
  const list: Check[] = []
  if (req.sunAtLanding) list.push({ id: "sunAtLanding", ok: sunMarginDeg > 0, value: sunMarginDeg, limit: 0 })
  if (req.earthAtLanding) list.push({ id: "earthAtLanding", ok: earthMarginDeg > 0, value: earthMarginDeg, limit: 0 })
  list.push({ id: "battery", ok: f.longestNightH <= req.batteryH, value: f.longestNightH, limit: req.batteryH })
  list.push({ id: "earthContact", ok: f.earthPct >= req.minEarthPct, value: f.earthPct, limit: req.minEarthPct })
  return list
}

export type Scenario = { landingMs: number; stayDays: number; requirements: Requirements }

export type Evaluation = {
  fromMs: number
  toMs: number
  sweep: Barrido
  figures: Figures
  windows: { sun: Ventana[]; earth: Ventana[]; both: Ventana[] }
  /** En el momento del aterrizaje: márgenes sobre el horizonte (°; > 0 visible) y cuándo cambia cada cuerpo. */
  landing: { sunMarginDeg: number; earthMarginDeg: number; sunChangeMs: number | null; earthChangeMs: number | null }
  checks: Check[]
  ok: boolean
}

/** Intervalos en que los dos están a la vista. */
function overlap(a: Ventana[], b: Ventana[]): Ventana[] {
  const out: Ventana[] = []
  for (const x of a) for (const y of b) if (Math.min(x.finMs, y.finMs) > Math.max(x.inicioMs, y.inicioMs)) out.push({ inicioMs: Math.max(x.inicioMs, y.inicioMs), finMs: Math.min(x.finMs, y.finMs) })
  return out
}

/** Muestras de una estadía de `stayDays` días: los dos extremos cuentan, como en `barrer`. */
const samplesOf = (stayDays: number) => Math.max(2, Math.round(stayDays * STEPS_PER_DAY) + 1)

/** La estadía completa: cifras, ventanas, cuenta regresiva desde el aterrizaje y requisitos. */
export function evaluate(table: TablaLuna, st: Station, sc: Scenario): Evaluation {
  const fromMs = sc.landingMs
  const toMs = fromMs + (samplesOf(sc.stayDays) - 1) * STEP_MS
  const b = sweep(table, st, fromMs, toMs)
  const f = figures(b)
  const sunMarginDeg = margenSol(b.solSobreHorizonte[0])
  const earthMarginDeg = margenTierra(b.tierraSobreHorizonte[0])
  // La cuenta regresiva mira hasta 60 días después del fin de la estadía, como la interfaz de referencia.
  const limit = Math.min(toMs + 60 * DAY_MS, table.finMs)
  const sun = ventanas(b, "sol")
  const earth = ventanas(b, "tierra")
  const checks = check(f, sunMarginDeg, earthMarginDeg, sc.requirements)
  return {
    fromMs,
    toMs,
    sweep: b,
    figures: f,
    windows: { sun, earth, both: overlap(sun, earth) },
    landing: {
      sunMarginDeg,
      earthMarginDeg,
      sunChangeMs: proximoCambio(table, { sitio: st.site, perfil: st.panel }, fromMs, "sol", limit).cambioMs,
      earthChangeMs: proximoCambio(table, { sitio: st.site, perfil: st.antenna }, fromMs, "tierra", limit).cambioMs,
    },
    checks,
    ok: checks.every((c) => c.ok),
  }
}

/** Una alternativa ya medida: sus cifras y si cumple los requisitos. */
export type Outcome = { figures: Figures; checks: Check[]; ok: boolean }

/** Solo cifras y requisitos (sin ventanas ni cuenta regresiva): para comparar alternativas. */
export function outcome(table: TablaLuna, st: Station, sc: Scenario): Outcome {
  const n = samplesOf(sc.stayDays)
  const b = sweep(table, st, sc.landingMs, sc.landingMs + (n - 1) * STEP_MS)
  const f = figures(b)
  const checks = check(f, margenSol(b.solSobreHorizonte[0]), margenTierra(b.tierraSobreHorizonte[0]), sc.requirements)
  return { figures: f, checks, ok: checks.every((c) => c.ok) }
}

export type DayOption = Outcome & { landingMs: number }

/**
 * Cada día candidato de aterrizaje alrededor de la fecha del plan (misma hora, misma estadía, mismo equipo), con un
 * solo barrido largo. Cada día usa exactamente las muestras que usaría `evaluate` para esa fecha: el veredicto de
 * la lista y el del detalle no pueden diferir. Los días fuera de la tabla de efemérides (2026–2030) se omiten.
 */
export function scanDates(table: TablaLuna, st: Station, sc: Scenario, daysBefore = 30, daysAfter = 120): DayOption[] {
  const n = samplesOf(sc.stayDays)
  const span = (n - 1) * STEP_MS
  let first = -daysBefore
  let last = daysAfter
  while (first < 0 && sc.landingMs + first * DAY_MS < table.inicioMs) first++
  while (last > 0 && sc.landingMs + last * DAY_MS + span > table.finMs) last--
  const fromMs = sc.landingMs + first * DAY_MS
  const b = sweep(table, st, fromMs, sc.landingMs + last * DAY_MS + span)
  const out: DayOption[] = []
  for (let d = first; d <= last; d++) {
    const i0 = (d - first) * STEPS_PER_DAY
    const f = figures(b, i0, n)
    const checks = check(f, margenSol(b.solSobreHorizonte[i0]), margenTierra(b.tierraSobreHorizonte[i0]), sc.requirements)
    out.push({ landingMs: sc.landingMs + d * DAY_MS, figures: f, checks, ok: checks.every((c) => c.ok) })
  }
  return out
}

/** Una racha de días seguidos en que aterrizar cumple los requisitos. */
export type DateWindow = { fromMs: number; toMs: number; days: number }

export function dateWindows(days: DayOption[]): DateWindow[] {
  const out: DateWindow[] = []
  let run: DateWindow | null = null
  for (const d of days) {
    if (d.ok) {
      if (run && d.landingMs - run.toMs === DAY_MS) {
        run.toMs = d.landingMs
        run.days++
      } else {
        run = { fromMs: d.landingMs, toMs: d.landingMs, days: 1 }
        out.push(run)
      }
    } else run = null
  }
  return out
}

/**
 * La fecha que se propone al mover el aterrizaje: el día central de la ventana más cercana que no contiene la fecha
 * actual, prefiriendo las posteriores (un plan que se atrasó rara vez puede adelantarse). El centro deja el mismo
 * margen a los dos lados si la fecha vuelve a moverse.
 */
export function suggestDate(days: DayOption[], landingMs: number): { day: DayOption; window: DateWindow; slackDays: number } | null {
  const windows = dateWindows(days).filter((w) => !(landingMs >= w.fromMs && landingMs <= w.toMs))
  const later = windows.filter((w) => w.fromMs > landingMs)
  const pool = later.length > 0 ? later : windows
  if (pool.length === 0) return null
  const window = pool.reduce((a, w) => (Math.abs(w.fromMs - landingMs) < Math.abs(a.fromMs - landingMs) ? w : a))
  const slackDays = Math.floor((window.days - 1) / 2)
  const day = days.find((d) => d.landingMs === window.fromMs + slackDays * DAY_MS)
  return day ? { day, window, slackDays } : null
}

/** Alturas que se prueban al proponer subir el equipo (m). Supuesto: mástiles de hasta 30 m. */
export const RAISE_TO_M = [2, 5, 10, 15, 20, 30]

export type HeightOption = Outcome & { heightM: number }

/** La menor altura de la lista, por encima de la actual, con la que la misión cumple (panel y antena a esa altura). */
export function suggestHeight(table: TablaLuna, place: { lat: number; lon: number }, mask: Mascara, sc: Scenario, panelHeightM: number, antennaHeightM: number): HeightOption | null {
  for (const heightM of RAISE_TO_M) {
    if (heightM <= Math.min(panelHeightM, antennaHeightM)) continue
    const o = outcome(table, station(place, mask, Math.max(panelHeightM, heightM), Math.max(antennaHeightM, heightM)), sc)
    if (o.ok) return { ...o, heightM }
  }
  return null
}

/** Una salida frente al motor: si a esa hora el Sol y la Tierra están a la vista, y cuánto falta para que cambien. */
export type OutingCheck = { afterH: number; ms: number; sun: boolean; earth: boolean; ok: boolean; sunChangeH: number | null; earthChangeH: number | null }

/**
 * Cada salida (caminata o recorrido del rover) contra las ventanas de la estadía: una salida va bien si al empezar hay
 * Sol (luz y energía) y Tierra (enlace directo). `…ChangeH`: horas hasta la próxima puesta o salida dentro de la estadía.
 */
export function outingChecks(ev: Pick<Evaluation, "fromMs" | "toMs" | "windows">, outings: readonly { afterH: number }[]): OutingCheck[] {
  const inside = (w: Ventana[], ms: number) => w.some((v) => ms >= v.inicioMs && ms < v.finMs)
  const next = (w: Ventana[], ms: number) => {
    let t: number | null = null
    for (const v of w) for (const x of [v.inicioMs, v.finMs]) if (x > ms && x < ev.toMs && (t === null || x < t)) t = x
    return t === null ? null : (t - ms) / HOUR_MS
  }
  return outings.map((o) => {
    const ms = ev.fromMs + o.afterH * HOUR_MS
    const sun = inside(ev.windows.sun, ms)
    const earth = inside(ev.windows.earth, ms)
    return { afterH: o.afterH, ms, sun, earth, ok: sun && earth, sunChangeH: next(ev.windows.sun, ms), earthChangeH: next(ev.windows.earth, ms) }
  })
}
