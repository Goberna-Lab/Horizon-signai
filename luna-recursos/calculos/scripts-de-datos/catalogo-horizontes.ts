// E24: horizonte de cada sitio del catálogo (scripts/catalogo-polo.ts) con el mismo detalle que Connecting Ridge (E20):
// el DTM de 5 m de LOLA de PGDA cerca (±4 km del centro) y LOLA LDEM_75S_240M lejos (src/data/dem-polo-*.i16), rayos cada
// 0,5° hasta 150 km con la esfera exacta. Se guarda la envolvente convexa superior por azimut (E21), en
// src/data/horizonte-catalogo-<id>.json, que el planificador carga solo al elegir el sitio. Se corre a mano:
//
//   bun run scripts/catalogo-horizontes.ts              (todos)
//   bun run scripts/catalogo-horizontes.ts haworth      (uno)
//   bun run scripts/catalogo-horizontes.ts --faltantes  (solo los que no tienen archivo)
//   bun run scripts/catalogo-horizontes.ts --rois       (solo las regiones de interés)
//
// Lee por rangos las filas de cada GeoTIFF de PGDA a ±4 km de sus puntos (~20 MB por sitio), una sola vez por archivo.
import catalogo from '../src/data/catalogo-polo.json'
import metaDem from '../src/data/dem-polo.json'
import { alturaPolar, crearDemPolar, estereoSur } from '../src/engine/demPolar'
import { envolventeSuperior } from '../src/engine/mascara'
import { leerFilasGeoTiff } from './polar'

const R = 1_737_400
const RAD = Math.PI / 180
const VENTANA_M = 4000
const PASO_AZ = 0.5

const dem = crearDemPolar(
  await Bun.file(new URL('../src/data/dem-polo-240m.i16', import.meta.url)).arrayBuffer(),
  await Bun.file(new URL('../src/data/dem-polo-960m.i16', import.meta.url)).arrayBuffer(),
  metaDem,
)

/** Distancias de los rayos: 5 m hasta la ventana del DTM fino; después las del DEM polar (240 m y 960 m). */
const DISTANCIAS: number[] = []
for (let s = 5; s <= VENTANA_M; s += 5) DISTANCIAS.push(s)
for (let s = VENTANA_M + 240; s <= 30_000; s += 240) DISTANCIAS.push(s)
for (let s = 30_960; s <= 150_000; s += 960) DISTANCIAS.push(s)

async function cabecera(url: string) {
  const v = new DataView(await (await fetch(url, { headers: { Range: 'bytes=0-65535' } })).arrayBuffer())
  const ifd = v.getUint32(4, true)
  const tags = new Map<number, number>()
  for (let i = 0; i < v.getUint16(ifd, true); i++) tags.set(v.getUint16(ifd + 2 + i * 12, true), ifd + 2 + i * 12)
  const entero = (t: number) => (v.getUint16(tags.get(t)! + 2, true) === 3 ? v.getUint16(tags.get(t)! + 8, true) : v.getUint32(tags.get(t)! + 8, true))
  const dobles = (t: number, n: number) => Array.from({ length: n }, (_, k) => v.getFloat64(v.getUint32(tags.get(t)! + 8, true) + 8 * k, true))
  if (entero(258) !== 32 || entero(339) !== 3) throw new Error(`${url}: se esperaba float32.`)
  return { ancho: entero(256), alto: entero(257), escala: dobles(33550, 2)[0], amarre: dobles(33922, 6) }
}

type Punto = (typeof catalogo.sitios)[number]

async function horizontesDe(url: string, puntos: Punto[]) {
  const c = await cabecera(url)
  const [, , , x0, y0] = c.amarre
  // PixelIsArea: el centro del píxel (f, k) está en (x0 + (k + 0,5)·e, y0 − (f + 0,5)·e).
  const filasDe = (p: Punto) => (y0 - estereoSur(p.latitudGrados, p.longitudEsteGrados)[1]) / c.escala - 0.5
  const f0 = Math.max(0, Math.floor(Math.min(...puntos.map(filasDe)) - VENTANA_M / c.escala) - 2)
  const f1 = Math.min(c.alto - 1, Math.ceil(Math.max(...puntos.map(filasDe)) + VENTANA_M / c.escala) + 2)
  const filas = await leerFilasGeoTiff(url, f0, f1, c.ancho * 4)
  const fino = (x: number, y: number) => {
    const k = (x - x0) / c.escala - 0.5
    const f = (y0 - y) / c.escala - 0.5
    if (k < 0 || f < f0 || k >= c.ancho - 1 || f >= f1) return NaN
    const k0 = Math.floor(k)
    const g0 = Math.floor(f)
    const tk = k - k0
    const tf = f - g0
    const px = (g: number, kk: number) => filas.getFloat32(((g - f0) * c.ancho + kk) * 4, true)
    return (px(g0, k0) * (1 - tk) + px(g0, k0 + 1) * tk) * (1 - tf) + (px(g0 + 1, k0) * (1 - tk) + px(g0 + 1, k0 + 1) * tk) * tf
  }
  for (const p of puntos) await horizonteDe(p, url, fino)
}

async function horizonteDe(sitio: Punto, url: string, fino: (x: number, y: number) => number) {
  const [xs, ys] = estereoSur(sitio.latitudGrados, sitio.longitudEsteGrados)
  const altura = (x: number, y: number, s: number) => {
    const h = s <= VENTANA_M ? fino(x, y) : NaN
    return Number.isNaN(h) ? alturaPolar(dem, x, y) : h
  }
  const h0 = fino(xs, ys)
  if (Number.isNaN(h0)) throw new Error(`${sitio.id}: el centro no está en el DTM fino.`)
  const f = sitio.latitudGrados * RAD
  const l = sitio.longitudEsteGrados * RAD
  const u = [Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f)]
  const este = [-Math.sin(l), Math.cos(l), 0]
  const norte = [-Math.sin(f) * Math.cos(l), -Math.sin(f) * Math.sin(l), Math.cos(f)]
  const envolvente: number[][] = []
  const elevacionGrados: number[] = []
  for (let i = 0; i < 360 / PASO_AZ; i++) {
    const az = i * PASO_AZ * RAD
    const d = [0, 1, 2].map((k) => Math.cos(az) * norte[k] + Math.sin(az) * este[k])
    const puntos: Array<[number, number]> = []
    for (const s of DISTANCIAS) {
      const th = s / R
      const p = [0, 1, 2].map((k) => Math.cos(th) * u[k] + Math.sin(th) * d[k])
      const h = altura((2 * R * p[1]) / (1 - p[2]), (2 * R * p[0]) / (1 - p[2]), s)
      if (Number.isNaN(h)) break
      puntos.push([(R + h) * Math.sin(th), (R + h) * Math.cos(th) - (R + h0)])
    }
    const v = envolventeSuperior(puntos, 1, 3)
    envolvente.push(v)
    let mejor = -90
    for (let k = 0; k < v.length; k += 2) mejor = Math.max(mejor, Math.atan2(v[k + 1] - 0.01, v[k]) / RAD)
    elevacionGrados.push(Number(mejor.toFixed(3)))
  }
  const datos = {
    procedencia: {
      producto: `DTM de 5 m de LOLA de PGDA (${url}) hasta ${VENTANA_M / 1000} km; LOLA LDEM_75S_240M (240 m y 960 m) hasta 150 km`,
      referencia: 'Barker et al. (2021), Planet. Space Sci. 203, 105119',
      consultadoUTC: new Date().toISOString(),
      metodo: `Marcha de rayos por círculo máximo cada ${PASO_AZ}° (pasos de 5 m hasta ${VENTANA_M} m, de 240 m hasta 30 km y de 960 m hasta 150 km), esfera exacta de R = 1737,4 km, envolvente convexa superior por azimut (x, y en m).`,
      alturaCentroM: Number(h0.toFixed(2)),
    },
    pasoAzimutGrados: PASO_AZ,
    elevacionGrados,
    envolvente,
  }
  await Bun.write(new URL(`../src/data/horizonte-catalogo-${sitio.id}.json`, import.meta.url), JSON.stringify(datos) + '\n')
  const vert = envolvente.reduce((a, v) => a + v.length / 2, 0) / envolvente.length
  console.log(`${sitio.nombre.padEnd(26)} h0 ${h0.toFixed(1)} m, horizonte ${Math.min(...elevacionGrados).toFixed(2)}° a ${Math.max(...elevacionGrados).toFixed(2)}°, ${vert.toFixed(1)} vértices por rayo`)
}

const opcion = process.argv[2]
const existe = new Set<string>()
for (const s of catalogo.sitios) if (await Bun.file(new URL(`../src/data/horizonte-catalogo-${s.id}.json`, import.meta.url)).exists()) existe.add(s.id)
const elegidos = catalogo.sitios.filter(
  (s) => s.xM !== null && (!opcion || s.id === opcion || (opcion === '--faltantes' && !existe.has(s.id)) || (opcion === '--rois' && s.tipo === 'roi')),
)
for (const url of new Set(elegidos.map((s) => s.archivo))) await horizontesDe(url, elegidos.filter((s) => s.archivo === url))
