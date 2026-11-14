// E24: horizonte de cualquier punto del polo sur, calculado en el navegador sobre LOLA (LDEM_75S_240M; scripts/dem-polo.ts).
// Funciones puras, sin React ni three. La rejilla binaria la lee quien la usa (fetch en la página, Bun.file en las pruebas).
//
// Método: el mismo de E20 (scripts/polo-lola.ts) con menos resolución. Marcha de rayos por círculo máximo cada 0,5° de
// azimut, hasta 150 km, con la esfera exacta de 1737,4 km (RTR cap. 11.4, pp. 465–466). Pasos de 120 m hasta 6 km, de
// 240 m hasta 30 km y de 960 m después. Por rayo se guarda la envolvente convexa superior (E21), así que el horizonte sale
// desde cualquier altura del observador. Simplificación declarada: a 240 m/píxel el relieve de menos de ~500 m no aparece
// (un sitio detallado como Connecting Ridge usa además el DTM de 5 m, E20); la validación está en E24.
import { envolventeSuperior, type Mascara } from './mascara'

const R = 1_737_400
const RAD = Math.PI / 180

/** Puntos propios: hasta 190 km del polo (~83,7° S), donde la rejilla fina (195 km) cubre el relieve cercano. */
export const RADIO_DOMINIO_M = 190_000

export type Rejilla = { n: number; pasoM: number; x0M: number; y0M: number; alturas: Int16Array }
export type DemPolar = { cerca: Rejilla; lejos: Rejilla }
type MetaRejilla = { n: number; pasoM: number; x0M: number; y0M: number }

export function crearDemPolar(cerca: ArrayBuffer, lejos: ArrayBuffer, meta: { cerca: MetaRejilla; lejos: MetaRejilla }): DemPolar {
  const rejilla = (b: ArrayBuffer, m: MetaRejilla): Rejilla => {
    const alturas = new Int16Array(b)
    if (alturas.length !== m.n * m.n) throw new Error(`Rejilla de ${alturas.length} valores; se esperaban ${m.n * m.n}.`)
    return { ...m, alturas }
  }
  return { cerca: rejilla(cerca, meta.cerca), lejos: rejilla(lejos, meta.lejos) }
}

/** Estereográfica polar sur con escala 1 en el polo (E20): ρ = 2R·tan(c/2), x = ρ·sin λ, y = ρ·cos λ. */
export function estereoSur(latitudGrados: number, longitudEsteGrados: number): [number, number] {
  const rho = 2 * R * Math.tan(((90 + latitudGrados) * RAD) / 2)
  return [rho * Math.sin(longitudEsteGrados * RAD), rho * Math.cos(longitudEsteGrados * RAD)]
}

/** Inversa: (x, y) en m → [latitud, longitud este] en grados. */
export function desdeEstereoSur(x: number, y: number): [number, number] {
  const colatitud = 2 * Math.atan(Math.hypot(x, y) / (2 * R))
  return [-90 + colatitud / RAD, (((Math.atan2(x, y) / RAD) % 360) + 360) % 360]
}

/** Altura (m) bilineal en una rejilla; NaN fuera. */
function enRejilla(g: Rejilla, x: number, y: number): number {
  const c = (x - g.x0M) / g.pasoM
  const f = (g.y0M - y) / g.pasoM
  if (c < 0 || f < 0 || c > g.n - 1 || f > g.n - 1) return NaN
  const c0 = Math.min(Math.floor(c), g.n - 2)
  const f0 = Math.min(Math.floor(f), g.n - 2)
  const tc = c - c0
  const tf = f - f0
  const a = g.alturas
  const i = f0 * g.n + c0
  return (a[i] * (1 - tc) + a[i + 1] * tc) * (1 - tf) + (a[i + g.n] * (1 - tc) + a[i + g.n + 1] * tc) * tf
}

/** Altura del relieve (m sobre la esfera de 1737,4 km) en (x, y): la rejilla fina si alcanza, si no la gruesa. */
export function alturaPolar(dem: DemPolar, x: number, y: number): number {
  const h = enRejilla(dem.cerca, x, y)
  return Number.isNaN(h) ? enRejilla(dem.lejos, x, y) : h
}

/** true si el punto está dentro del dominio de coordenadas propias. */
export function dentroDelDominio(latitudGrados: number, longitudEsteGrados: number): boolean {
  const [x, y] = estereoSur(latitudGrados, longitudEsteGrados)
  return Math.hypot(x, y) <= RADIO_DOMINIO_M
}

/** Distancias de muestreo a lo largo de cada rayo (m). */
const DISTANCIAS: number[] = (() => {
  const d: number[] = []
  for (let s = 120; s <= 6000; s += 120) d.push(s)
  for (let s = 6240; s <= 30_000; s += 240) d.push(s)
  for (let s = 30_960; s <= 150_000; s += 960) d.push(s)
  return d
})()
const COS = DISTANCIAS.map((s) => Math.cos(s / R))
const SIN = DISTANCIAS.map((s) => Math.sin(s / R))

/**
 * Máscara de horizonte en (latitud, longitud) sobre el DEM polar. ~200 000 muestras (720 rayos × ~275 pasos): unos
 * milisegundos.
 */
export function mascaraPolar(dem: DemPolar, latitudGrados: number, longitudEsteGrados: number, pasoAzimutGrados = 0.5): Mascara {
  const f = latitudGrados * RAD
  const l = longitudEsteGrados * RAD
  const u = [Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f)]
  const este = [-Math.sin(l), Math.cos(l), 0]
  const norte = [-Math.sin(f) * Math.cos(l), -Math.sin(f) * Math.sin(l), Math.cos(f)]
  const [xs, ys] = estereoSur(latitudGrados, longitudEsteGrados)
  const h0 = alturaPolar(dem, xs, ys)
  if (Number.isNaN(h0)) throw new Error('El punto está fuera del DEM polar.')
  const n = Math.round(360 / pasoAzimutGrados)
  const vertices: number[][] = []
  for (let i = 0; i < n; i++) {
    const az = i * pasoAzimutGrados * RAD
    const d = [Math.cos(az) * norte[0] + Math.sin(az) * este[0], Math.cos(az) * norte[1] + Math.sin(az) * este[1], Math.cos(az) * norte[2]]
    const puntos: Array<[number, number]> = []
    for (let k = 0; k < DISTANCIAS.length; k++) {
      // Punto del círculo máximo y su proyección: x = 2R·Py/(1 − Pz), y = 2R·Px/(1 − Pz) (polo sur, Pz → −1).
      const px = COS[k] * u[0] + SIN[k] * d[0]
      const py = COS[k] * u[1] + SIN[k] * d[1]
      const pz = COS[k] * u[2] + SIN[k] * d[2]
      const h = alturaPolar(dem, (2 * R * py) / (1 - pz), (2 * R * px) / (1 - pz))
      if (Number.isNaN(h)) break
      // Esfera exacta (E20): horizontal (R + h)·sin θ, vertical (R + h)·cos θ − (R + h0).
      puntos.push([(R + h) * SIN[k], (R + h) * COS[k] - (R + h0)])
    }
    vertices.push(envolventeSuperior(puntos, 0, 2))
  }
  return { pasoAzimutGrados, vertices, fuente: 'LOLA LDEM_75S_240M (240 m hasta 195 km del polo, 960 m más allá), rayos hasta 150 km' }
}
