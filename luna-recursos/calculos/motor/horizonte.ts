// ENV-008 (E10): el horizonte del sitio no es plano. Elevación del horizonte por azimut, vista desde el módulo lunar del
// Apollo 17, calculada con SLDEM2015 por scripts/horizonte.ts: el Macizo Norte llega a ~14° y el Macizo Sur a ~11°
// (LSB cap. 3.3.4, pp. 33–34: macizos de 2000–2300 m en un valle de ~8 km). Funciones puras, sin React ni three.
import { SITIO_ACTIVO } from './sitio'

// E20: horizonte del sitio activo (src/data/horizonte-<sitio>.json).
type Horizonte = typeof import('../data/horizonte-apollo17.json')
const horizonte: Horizonte = (await import(`../data/horizonte-${SITIO_ACTIVO.id}.json`)).default

export const PROCEDENCIA_HORIZONTE = horizonte.procedencia
const PASO = horizonte.pasoAzimutGrados
const ELEVACIONES = horizonte.elevacionGrados
const N = ELEVACIONES.length

/** E21: envolvente superior de cada rayo, [x, y, …] en metros (scripts/polar.ts, envolventeSuperior). */
const ENVOLVENTE: number[][] = horizonte.envolvente

/** Horizonte (grados) en la muestra de azimut i, visto desde H metros sobre el suelo: máx atan2(y − H, x) (E21). */
function elevacionDesdeAltura(i: number, alturaM: number): number {
  const v = ENVOLVENTE[i % N]
  let mejor = -Math.PI / 2
  for (let k = 0; k < v.length; k += 2) mejor = Math.max(mejor, Math.atan2(v[k + 1] - alturaM, v[k]))
  return (mejor * 180) / Math.PI
}

/**
 * Elevación del horizonte local (grados) en un azimut (desde el norte hacia el este), interpolada y periódica.
 * E21: alturaM es la altura del observador sobre el suelo (0 = a ras, como E10). Más alto, el horizonte baja; en el polo,
 * con el Sol a ±2°, unos metros cambian mucho las horas de luz. Los rayos empiezan a 250 m: lo más cercano es el DTM local.
 */
export function elevacionHorizonte(azimutGrados: number, alturaM = 0): number {
  const a = (((azimutGrados % 360) + 360) % 360) / PASO
  const i = Math.floor(a)
  const f = a - i
  if (alturaM === 0) return ELEVACIONES[i % N] * (1 - f) + ELEVACIONES[(i + 1) % N] * f
  return elevacionDesdeAltura(i, alturaM) * (1 - f) + elevacionDesdeAltura(i + 1, alturaM) * f
}

/** Distancia (m) del punto que forma el horizonte en ese azimut (el más cercano de los dos vecinos de la tabla). */
export function distanciaHorizonte(azimutGrados: number): number {
  const i = Math.round((((azimutGrados % 360) + 360) % 360) / PASO) % N
  return horizonte.distanciaM[i]
}

/** Muestras del perfil para dibujarlo: [azimut, elevación]. */
export function perfilHorizonte(): Array<[number, number]> {
  return ELEVACIONES.map((e, i) => [i * PASO, e])
}
