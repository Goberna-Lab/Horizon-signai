/**
 * Carga de los datos del planificador en el navegador. El motor es puro y recibe los datos como argumentos
 * (docs/04-planificador.md, "Notas para portar"): aquí están el `fetch` de la tabla de efemérides y la carga de la
 * máscara de horizonte de cada lugar, que solo se baja cuando hace falta.
 *
 * Los archivos los genera `apps/web/scripts/build-planner-data.ts`.
 */
import { crearTablaLuna, type TablaLuna } from "../engine/efemeridesLuna.ts"
import type { Mascara } from "../engine/mascara.ts"
import type { Site } from "../model/types.ts"
import ephemerisUrl from "./ephemeris.f32?url"
import ephemerisMeta from "./ephemeris.json"
import catalog from "./sites.json"
import reliefUrl from "./relief.webp"

export const sites = catalog.sites as Site[]
export const siteById = new Map(sites.map((s) => [s.id, s]))
/** La lámina de relieve y su encuadre en la proyección (km). */
export const plate = { url: reliefUrl, ...catalog.plate }
export const provenance = { ephemeris: ephemerisMeta.provenance, ...catalog.provenance }

let table: Promise<TablaLuna> | null = null

/** La tabla global de efemérides (467 KB): se baja una vez. */
export function loadTable(): Promise<TablaLuna> {
  table ??= fetch(ephemerisUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`Ephemeris table: HTTP ${response.status}`)
      return response.arrayBuffer()
    })
    .then((buffer) => crearTablaLuna(buffer, ephemerisMeta))
  // Si falla, el siguiente intento vuelve a pedirla.
  table.catch(() => (table = null))
  return table
}

type HorizonFile = { stepDeg: number; horizon: string; vertices: number[][] }
const files = import.meta.glob<HorizonFile>("./horizons/*.json", { import: "default" })
const masks = new Map<string, Promise<Mascara>>()

/** La máscara de horizonte de un lugar (100 a 250 KB): se baja la primera vez que se pide. */
export function loadMask(siteId: string): Promise<Mascara> {
  let mask = masks.get(siteId)
  if (!mask) {
    const file = files[`./horizons/${siteId}.json`]
    if (!file) return Promise.reject(new Error(`No horizon for ${siteId}`))
    mask = file().then((h) => ({ pasoAzimutGrados: h.stepDeg, vertices: h.vertices, fuente: h.horizon }))
    mask.catch(() => masks.delete(siteId))
    masks.set(siteId, mask)
  }
  return mask
}
