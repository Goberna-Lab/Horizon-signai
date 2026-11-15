// Adaptador: las cifras del navegador salen del núcleo del Planificador (@/shared/planning), no de efemérides propias.
// Devuelve la misma forma que `analyze()` y `stateAt()` del navegador de NASA, para que las vistas se porten tal cual.
//  · Barrido cada 10 min (STEP_MS) y cifras de `figures`: las mismas del Planificador para ese sitio, fecha y altura.
//  · "Sol visible" es la definición del motor (margenSol > 0: asoma algo del disco), no la de NASA (≥ 50 % del disco).
//  · Tierra visible = tierraSobreHorizonte > 0. Horizonte en un azimut = horizonteEn(perfilDesde(máscara, altura), az).
import {
  DAY_MS,
  HOUR_MS,
  STEP_MS,
  TABLE_FROM_MS,
  TABLE_TO_MS,
  figures,
  horizonteEn,
  loadMask,
  loadTable,
  margenSol,
  sites,
  station,
  sweep,
  type Mascara,
  type PerfilHorizonte,
  type Site,
  type Station,
  type TablaLuna,
} from "@/shared/planning"

export const RADIO_SOL = 0.2697
export const RADIO_TIERRA = 0.9017
export { DAY_MS, HOUR_MS, TABLE_FROM_MS, TABLE_TO_MS }

const PALETA = ["#f6c945", "#4fc3f7", "#ef7f5a", "#9be27a", "#c792ea", "#ff8fb1", "#7ee0d6", "#d7d7d7", "#ffa94d", "#a5b4fc"]

/** Un sitio del catálogo con lo que esperan las vistas de NASA (elev, color, tipo). */
export type SitioNav = Site & { elev: number; color: string; tipo: string }
export const sitiosNav: SitioNav[] = sites.map((s, i) => ({ ...s, elev: s.heightM, color: PALETA[i % PALETA.length], tipo: s.kind }))
export const siteByIdNav = new Map(sitiosNav.map((s) => [s.id, s]))

/** La máscara de un sitio vista desde una altura: el perfil y la estación del motor (panel y antena a la misma altura). */
export type MascaraAltura = { siteId: string; alturaM: number; mask: Mascara; perfil: PerfilHorizonte; st: Station }

export type Serie = {
  times: Float64Array
  sunFrac: Float32Array
  /** Sol visible según el motor (1/0): el que cuentan las cifras. */
  sunLit: Uint8Array
  earthVis: Uint8Array
  sunAz: Float32Array
  sunEl: Float32Array
  earthAz: Float32Array
  earthEl: Float32Array
  stepH: number
  stats: { sunPct: number; earthPct: number; bothPct: number; longestNightH: number; longestBlackoutH: number }
}

export type Cuerpo = { az: number; el: number; frac: number; horizon: number; radius: number }
export type Estado = { sun: Cuerpo; earth: Cuerpo & { visible: boolean } }

let tabla: TablaLuna | null = null
/** Baja la tabla de efemérides (una vez). Hay que esperarla antes de `analyze` o `stateAt`. */
export async function prepararTabla(): Promise<TablaLuna> {
  tabla ??= await loadTable()
  return tabla
}
const tablaLista = () => {
  if (!tabla) throw new Error("Ephemeris table not loaded")
  return tabla
}

const mascaras = new Map<string, Promise<MascaraAltura>>()
/** Máscara del sitio a `alturaM` (se guarda por sitio y altura). */
export function mascaraEn(site: { id: string; lat: number; lon: number }, alturaM: number): Promise<MascaraAltura> {
  const k = `${site.id}@${alturaM}`
  let m = mascaras.get(k)
  if (!m) {
    m = loadMask(site.id).then((mask) => {
      const st = station({ lat: site.lat, lon: site.lon }, mask, alturaM, alturaM)
      return { siteId: site.id, alturaM, mask, perfil: st.panel, st }
    })
    m.catch(() => mascaras.delete(k))
    mascaras.set(k, m)
  }
  return m
}

/** Lleva un instante al rango de la tabla de efemérides (2026–2030). */
export const acotar = (ms: number) => Math.min(TABLE_TO_MS, Math.max(TABLE_FROM_MS, ms))

/** Fracción visible de un disco de radio angular rDeg cuyo centro está a elDeg, sobre un horizonte hDeg. */
export function fraccionDisco(elDeg: number, hDeg: number, rDeg: number): number {
  const u = (elDeg - hDeg) / rDeg
  if (u >= 1) return 1
  if (u <= -1) return 0
  return 1 - (Math.acos(u) - u * Math.sqrt(1 - u * u)) / Math.PI
}

/** Horizonte (°) de la máscara en un azimut. */
export const horizonteA = (m: MascaraAltura, az: number) => horizonteEn(m.perfil, az)

/** Serie del periodo [inicio, fin] cada 10 min, con las cifras del Planificador. Como `analyze()` de NASA. */
export function analyze(_site: unknown, m: MascaraAltura, startMs: number, endMs: number): Serie {
  const desde = acotar(startMs)
  const hasta = Math.max(desde + STEP_MS, acotar(endMs))
  const b = sweep(tablaLista(), m.st, desde, hasta, STEP_MS)
  const n = b.n
  const times = new Float64Array(n)
  const sunLit = new Uint8Array(n)
  const earthVis = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    times[i] = b.desdeMs + i * b.pasoMs
    sunLit[i] = margenSol(b.solSobreHorizonte[i]) > 0 ? 1 : 0
    earthVis[i] = b.tierraSobreHorizonte[i] > 0 ? 1 : 0
  }
  const f = figures(b)
  return {
    times,
    sunFrac: b.solFraccion,
    sunLit,
    earthVis,
    sunAz: b.solAzimut,
    sunEl: b.solElevacion,
    earthAz: b.tierraAzimut,
    earthEl: b.tierraElevacion,
    stepH: b.pasoMs / HOUR_MS,
    stats: { sunPct: f.sunPct, earthPct: f.earthPct, bothPct: f.bothPct, longestNightH: f.longestNightH, longestBlackoutH: f.longestSilenceH },
  }
}

/** Sol y Tierra en un instante, con el relieve en su azimut. Como `stateAt()` de NASA. */
export function stateAt(_site: unknown, m: MascaraAltura, ms: number): Estado {
  const t = acotar(ms)
  const b = sweep(tablaLista(), m.st, t, t, STEP_MS)
  const sunAz = b.solAzimut[0]
  const earthAz = b.tierraAzimut[0]
  const earthEl = b.tierraElevacion[0]
  const earthH = horizonteEn(m.perfil, earthAz)
  return {
    sun: { az: sunAz, el: b.solElevacion[0], frac: b.solFraccion[0], horizon: horizonteEn(m.perfil, sunAz), radius: RADIO_SOL },
    earth: {
      az: earthAz,
      el: earthEl,
      frac: fraccionDisco(earthEl, earthH, RADIO_TIERRA),
      horizon: earthH,
      radius: RADIO_TIERRA,
      visible: b.tierraSobreHorizonte[0] > 0,
    },
  }
}
