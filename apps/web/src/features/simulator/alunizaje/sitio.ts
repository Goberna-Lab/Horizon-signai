// El sitio del alunizaje: relieve, horizonte y cielo (Sol y Tierra) en un instante.
//  · Connecting Ridge · RoI 6 trae su paquete hecho a mano (data/: relieve fino de 6 km a 10 m y amplio de 20 km a 80 m).
//  · Los demás sitios del Planificador (28), un paquete de 20 km a 80 m en public/simulador/sitios/ (lo genera
//    apps/web/scripts/build-simulador-sitios.ts a partir de LOLA LDEM_80S_80M). Sin relieve fino: la malla fina se
//    hace con el mismo relieve de 80 m interpolado, y lo pequeño lo pone el suelo de detalle (detalle.ts).
//  · El Sol y la Tierra se calculan con el motor de @/shared/planning (efemérides y horizonte del sitio, a 1,7 m): las
//    mismas cifras que el Planificador para esa fecha.
import { loadMask, loadTable, siteById, station, sweep, TABLE_FROM_MS, TABLE_TO_MS } from "@/shared/planning"
import fineUrl from "./data/fine.i16?url"
import wideUrl from "./data/wide.i16?url"
import siteUrl from "./data/site.json?url"

export const SITIO_POR_DEFECTO = "connecting-ridge-roi-6"
/** El plan de la misión CR-01 del Planificador (prototipos/lunar-map/campaign.js): 18 dic 2026, 09:00 UTC, zona A. */
export const FECHA_CR01 = Date.UTC(2026, 11, 18, 9)
const OJO_M = 1.7
const RADIO_SOL = 0.2697 // semidiámetro aparente (°)
const RADIO_TIERRA = 0.9017

export type Rejilla = { half: number; n: number }
export type DatosSitio = {
  id: string
  site: string
  time: string
  lat: number
  lon: number
  slope: number
  ringDeg: number[]
  wide: Rejilla
  fine: Rejilla
  sun: { az: number; el: number; frac: number; radius: number }
  earth: { az: number; el: number; visible: boolean; radius: number }
}
export type Sitio = { site: DatosSitio; fineBuf: ArrayBuffer | null; wideBuf: ArrayBuffer }

const json = <T>(url: string) => fetch(url).then((r) => { if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json() as Promise<T> })
const bytes = (url: string) => fetch(url).then((r) => { if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.arrayBuffer() })

/** Sol y Tierra vistos desde el sitio en `ms` (az desde el norte, horario; el y fracción del disco sobre el horizonte real). */
async function cielo(id: string, lat: number, lon: number, ms: number) {
  const [table, mask] = await Promise.all([loadTable(), loadMask(id)])
  const t = Math.min(TABLE_TO_MS, Math.max(TABLE_FROM_MS, ms))
  const b = sweep(table, station({ lat, lon }, mask, OJO_M, OJO_M), t, t)
  return {
    sun: { az: b.solAzimut[0], el: b.solElevacion[0], frac: b.solFraccion[0], radius: RADIO_SOL },
    earth: { az: b.tierraAzimut[0], el: b.tierraElevacion[0], visible: b.tierraSobreHorizonte[0] > 0, radius: RADIO_TIERRA },
    time: new Date(t).toISOString(),
  }
}

/** Carga el sitio `id` para el instante `ms` (si no hay `ms`, el del plan CR-01). */
export async function cargarSitio(id = SITIO_POR_DEFECTO, ms?: number): Promise<Sitio> {
  if (id === SITIO_POR_DEFECTO || !siteById.has(id)) {
    const [base, fineBuf, wideBuf] = await Promise.all([json<DatosSitio>(siteUrl), bytes(fineUrl), bytes(wideUrl)])
    const c = await cielo(SITIO_POR_DEFECTO, base.lat, base.lon, ms ?? FECHA_CR01).catch(() => null)
    return { site: { ...base, id: SITIO_POR_DEFECTO, ...(c ?? {}) }, fineBuf, wideBuf }
  }
  const dir = `/simulador/sitios/${encodeURIComponent(id)}`
  const [p, wideBuf] = await Promise.all([json<Omit<DatosSitio, "sun" | "earth" | "time" | "fine" | "site"> & { name: string }>(`${dir}.json`), bytes(`${dir}.i16`)])
  const c = await cielo(id, p.lat, p.lon, ms ?? FECHA_CR01)
  return { site: { ...p, site: p.name, fine: { half: 3000, n: 601 }, ...c }, fineBuf: null, wideBuf }
}
