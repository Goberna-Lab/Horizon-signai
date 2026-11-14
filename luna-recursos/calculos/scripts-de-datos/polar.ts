// E20: geometría compartida por los scripts del polo sur. Proyección estereográfica polar sur con escala 1 en el polo,
// longitud 0 hacia +y y R = 1737,4 km (etiquetas del GeoTIFF de PGDA y de los LDEM polares de LOLA en el PDS):
//   ρ = 2R·tan(c/2), con c la distancia angular al polo;  x = ρ·sin λ,  y = ρ·cos λ.
// Marco local del sitio (ENV-004): +x este, +z sur, +y arriba.

export const R = 1_737_400
const rad = Math.PI / 180
type V3 = [number, number, number]

/** Vector selenográfico unitario (x hacia 0° E, z hacia el polo norte). */
export function vector(latGrados: number, lonGrados: number): V3 {
  const f = latGrados * rad
  const l = lonGrados * rad
  return [Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f)]
}

/** Ejes este, norte y arriba en un punto. */
export function ejes(latGrados: number, lonGrados: number): { E: V3; N: V3; U: V3 } {
  const f = latGrados * rad
  const l = lonGrados * rad
  return {
    E: [-Math.sin(l), Math.cos(l), 0],
    N: [-Math.sin(f) * Math.cos(l), -Math.sin(f) * Math.sin(l), Math.cos(f)],
    U: vector(latGrados, lonGrados),
  }
}

/** Latitud y longitud (grados) de un vector (no hace falta que sea unitario). */
export function latLon(v: V3): [number, number] {
  const n = Math.hypot(v[0], v[1], v[2])
  return [Math.asin(v[2] / n) / rad, (Math.atan2(v[1], v[0]) / rad + 360) % 360]
}

/** Estereográfica polar sur: latitud y longitud → (x, y) en metros. */
export function estereo(latGrados: number, lonGrados: number): [number, number] {
  const c = (90 + latGrados) * rad
  const rho = 2 * R * Math.tan(c / 2)
  return [rho * Math.sin(lonGrados * rad), rho * Math.cos(lonGrados * rad)]
}

/**
 * Punto del plano tangente del sitio a (este, norte) metros, llevado a la esfera: latitud y longitud. Dentro de unos
 * cientos de metros la diferencia con el arco es despreciable (< 1 mm); para distancias largas usar destino().
 */
export function desdeLocal(latSitio: number, lonSitio: number, este: number, norte: number): [number, number] {
  const { E, N, U } = ejes(latSitio, lonSitio)
  return latLon([0, 1, 2].map((i) => U[i] * R + E[i] * este + N[i] * norte) as V3)
}

/** Destino por círculo máximo desde el sitio, con azimut (desde el norte hacia el este) y distancia de arco (m). */
export function destino(latSitio: number, lonSitio: number, azimutGrados: number, distanciaM: number): [number, number] {
  const { E, N, U } = ejes(latSitio, lonSitio)
  const th = distanciaM / R
  const a = azimutGrados * rad
  const dir = [0, 1, 2].map((i) => N[i] * Math.cos(a) + E[i] * Math.sin(a))
  return latLon([0, 1, 2].map((i) => U[i] * Math.cos(th) + dir[i] * Math.sin(th)) as V3)
}

/** Elevación (grados) de un punto a distancia de arco d y altura h, visto desde altura h0 (esfera exacta). */
export function elevacion(h0: number, h: number, distanciaM: number): number {
  const th = distanciaM / R
  return Math.atan2((R + h) * Math.cos(th) - (R + h0), (R + h) * Math.sin(th)) / rad
}

/** Filas f0..f1 (0-based) de un GeoTIFF float32 sin comprimir con una fila por bloque, por rango HTTP. */
export async function leerFilasGeoTiff(url: string, f0: number, f1: number, BYTES_FILA: number): Promise<DataView> {
  // Desplazamiento de la primera fila: lo da la etiqueta StripOffsets (leída en la cabecera; aquí se comprueba).
  const cabecera = new DataView(await (await fetch(url, { headers: { Range: 'bytes=0-65535' } })).arrayBuffer())
  const ifd = cabecera.getUint32(4, true)
  let offsets = 0
  for (let i = 0; i < cabecera.getUint16(ifd, true); i++) {
    const e = ifd + 2 + i * 12
    const tag = cabecera.getUint16(e, true)
    if (tag === 259 && cabecera.getUint16(e + 8, true) !== 1) throw new Error('El GeoTIFF está comprimido.')
    if (tag === 273) offsets = cabecera.getUint32(e + 8, true)
  }
  const primera = cabecera.getUint32(offsets + 4 * f0, true)
  const ultima = cabecera.getUint32(offsets + 4 * f1, true)
  if (ultima - primera !== (f1 - f0) * BYTES_FILA) throw new Error('Las filas no son contiguas.')
  const resp = await fetch(url, { headers: { Range: `bytes=${primera}-${ultima + BYTES_FILA - 1}` } })
  if (resp.status !== 206) throw new Error(`Se esperaba 206 y llegó ${resp.status}`)
  return new DataView(await resp.arrayBuffer())
}


// E21: la envolvente convexa superior vive en el motor desde E24 (la usa también el horizonte en el navegador).
export { envolventeSuperior } from '../src/engine/mascara'
