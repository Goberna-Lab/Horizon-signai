// E24: catálogo de sitios del polo sur con fuente. Son los sitios del DTM de 5 m de LOLA de PGDA (Barker et al. 2021,
// Planet. Space Sci. 203, 105119), con la numeración de Mazarico et al. (2011, Icarus 211); casi todos tienen el nombre
// de una región candidata de Artemis III (NASA, 2022 y 2024). El centro de cada sitio es el centro de su mosaico,
// leído de la cabecera del GeoTIFF (etiquetas ModelPixelScale y ModelTiepoint) con un rango de 64 KB. Se corre a mano:
//
//   bun run scripts/catalogo-polo.ts
//
// Además, el sitio de alunizaje de IM-2 (Athena, Intuitive Machines; CLPS), del que no hay mosaico de PGDA.
import { latLon } from './polar'

const BASE = 'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp'
const R = 1_737_400

/** Sitios del README de PGDA (https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/README), con su directorio. */
const SITIOS_PGDA: Array<{ id: string; dir: string; nombre: string }> = [
  { id: 'connecting-ridge', dir: 'Site01', nombre: 'Connecting Ridge' },
  { id: 'shackleton-rim', dir: 'Site04', nombre: 'Borde de Shackleton' },
  { id: 'nobile-rim-1', dir: 'Site06', nombre: 'Borde de Nobile 1' },
  { id: 'peak-near-shackleton', dir: 'Site07', nombre: 'Pico cerca de Shackleton' },
  { id: 'de-gerlache-rim', dir: 'Site11', nombre: 'Borde de de Gerlache' },
  { id: 'leibnitz-beta', dir: 'Site20', nombre: 'Meseta Leibnitz Beta' },
  { id: 'malapert-massif', dir: 'Site23', nombre: 'Macizo Malapert' },
  { id: 'haworth', dir: 'Haworth', nombre: 'Haworth' },
  { id: 'shoemaker', dir: 'Shoemaker', nombre: 'Shoemaker' },
  { id: 'nobile-rim-2', dir: 'DM2', nombre: 'Borde de Nobile 2' },
]

/** Lee ancho, alto, escala y punto de amarre de la cabecera de un GeoTIFF (little-endian, clásico). */
async function cabeceraGeoTiff(url: string) {
  const resp = await fetch(url, { headers: { Range: 'bytes=0-65535' } })
  if (resp.status !== 206) throw new Error(`${url}: se esperaba 206 y llegó ${resp.status}`)
  const v = new DataView(await resp.arrayBuffer())
  if (v.getUint16(0, true) !== 0x4949 || v.getUint16(2, true) !== 42) throw new Error(`${url}: no es un TIFF clásico little-endian.`)
  const ifd = v.getUint32(4, true)
  const etiquetas = new Map<number, { tipo: number; n: number; valor: number }>()
  for (let i = 0; i < v.getUint16(ifd, true); i++) {
    const e = ifd + 2 + i * 12
    etiquetas.set(v.getUint16(e, true), { tipo: v.getUint16(e + 2, true), n: v.getUint32(e + 4, true), valor: e + 8 })
  }
  const entero = (tag: number) => {
    const t = etiquetas.get(tag)!
    return t.tipo === 3 ? v.getUint16(t.valor, true) : v.getUint32(t.valor, true)
  }
  const dobles = (tag: number) => {
    const t = etiquetas.get(tag)
    if (!t || t.tipo !== 12) throw new Error(`${url}: falta la etiqueta ${tag} (double).`)
    const off = v.getUint32(t.valor, true)
    return Array.from({ length: t.n }, (_, k) => v.getFloat64(off + 8 * k, true))
  }
  return { ancho: entero(256), alto: entero(257), escala: dobles(33550), amarre: dobles(33922) }
}

/**
 * Regiones de interés (RoI) de Barker et al. (2021): las zonas de aterrizaje candidatas de cada sitio, en
 * <dir>_ROIs.tgz (shapefile de polígonos en m). Solo existen para los sitios 1, 4, 7 y 11. El centro de cada RoI es el
 * centroide de área del polígono (el .dbf trae un centro, pero en Site11 le falta uno y no sigue el orden de los polígonos).
 */
async function regionesDeInteres(dir: string): Promise<Array<[number, number]>> {
  const resp = await fetch(`${BASE}/${dir}/${dir}_ROIs.tgz`)
  const bytes = new Uint8Array(await resp.arrayBuffer())
  if (!resp.ok || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return []
  const tar = Bun.gunzipSync(bytes)
  const texto = (a: number, l: number) => new TextDecoder().decode(tar.subarray(a, a + l)).replace(/\0.*$/s, '').trim()
  // tar: cabeceras de 512 bytes (nombre en 0–99, tamaño octal en 124–135) seguidas del contenido redondeado a 512.
  for (let off = 0; off + 512 <= tar.length; ) {
    const nombre = texto(off, 100)
    if (!nombre) break
    const tam = Number.parseInt(texto(off + 124, 12), 8)
    if (nombre.endsWith('_ROIs.shp')) {
      const v = new DataView(tar.buffer, tar.byteOffset + off + 512, tam)
      const salida: Array<[number, number]> = []
      for (let r = 100; r < tam; ) {
        const largo = v.getInt32(r + 4, false) * 2
        const c = r + 8
        if (v.getInt32(c, true) !== 5) throw new Error(`${dir}: se esperaban polígonos.`)
        const partes = v.getInt32(c + 36, true)
        const n = v.getInt32(c + 40, true)
        const p0 = c + 44 + 4 * partes
        // Centroide de área (fórmula del polígono; un anillo por RoI).
        let A = 0
        let cx = 0
        let cy = 0
        for (let k = 0; k < n - 1; k++) {
          const x1 = v.getFloat64(p0 + 16 * k, true)
          const y1 = v.getFloat64(p0 + 16 * k + 8, true)
          const x2 = v.getFloat64(p0 + 16 * (k + 1), true)
          const y2 = v.getFloat64(p0 + 16 * (k + 1) + 8, true)
          const cruz = x1 * y2 - x2 * y1
          A += cruz
          cx += (x1 + x2) * cruz
          cy += (y1 + y2) * cruz
        }
        salida.push([Math.round(cx / (3 * A)), Math.round(cy / (3 * A))])
        r = c + largo
      }
      return salida
    }
    off += 512 + Math.ceil(tam / 512) * 512
  }
  return []
}

function latLonDeXY(x: number, y: number): [number, number] {
  const colatitud = 2 * Math.atan(Math.hypot(x, y) / (2 * R))
  return [-90 + (colatitud * 180) / Math.PI, ((((Math.atan2(x, y) * 180) / Math.PI) % 360) + 360) % 360]
}

async function main() {
  const sitios = []
  for (const s of SITIOS_PGDA) {
    const url = `${BASE}/${s.dir}/${s.dir}_final_adj_5mpp_surf.tif`
    const c = await cabeceraGeoTiff(url)
    // PixelIsArea (E20): el amarre (I, J) → (X, Y) es la esquina del píxel; el centro del mosaico está a la mitad.
    const [i, j, , x0, y0] = c.amarre
    const xc = x0 + (c.ancho / 2 - i) * c.escala[0]
    const yc = y0 - (c.alto / 2 - j) * c.escala[1]
    // Estereográfica polar sur con escala 1 en el polo: ρ = 2R·tan(c/2); x = ρ·sin λ, y = ρ·cos λ (E20).
    const rho = Math.hypot(xc, yc)
    const colatitud = 2 * Math.atan(rho / (2 * R))
    const lat = -90 + (colatitud * 180) / Math.PI
    const lon = (((Math.atan2(xc, yc) * 180) / Math.PI) % 360 + 360) % 360
    // Comprobación con scripts/polar.ts (vector → lat/lon) para no depender de una sola fórmula.
    const v: [number, number, number] = [Math.sin(colatitud) * Math.cos((lon * Math.PI) / 180), Math.sin(colatitud) * Math.sin((lon * Math.PI) / 180), -Math.cos(colatitud)]
    const [la2, lo2] = latLon(v)
    if (Math.abs(la2 - lat) > 1e-9 || Math.abs((((lo2 - lon) % 360) + 540) % 360 - 180) > 1e-9) throw new Error('Conversión inconsistente.')
    sitios.push({
      id: s.id,
      nombre: `${s.nombre} (centro del mosaico)`,
      tipo: 'centro',
      latitudGrados: Number(lat.toFixed(5)),
      longitudEsteGrados: Number(lon.toFixed(4)),
      xM: Math.round(xc),
      yM: Math.round(yc),
      ladoKm: Number(((c.ancho * c.escala[0]) / 1000).toFixed(1)),
      fuente: `Centro del DTM de 5 m de LOLA "${s.dir}" (PGDA; Barker et al. 2021, Planet. Space Sci. 203, 105119; numeración de Mazarico et al. 2011)`,
      archivo: url,
    })
    console.log(`${s.dir.padEnd(9)} ${s.nombre.padEnd(26)} ${lat.toFixed(4)}°, ${lon.toFixed(3)}° E  (${(c.ancho * c.escala[0] / 1000).toFixed(1)} km)`)
    const rois = await regionesDeInteres(s.dir)
    rois.forEach(([x, y], k) => {
      const [la, lo] = latLonDeXY(x, y)
      sitios.push({
        id: `${s.id}-roi-${k + 1}`,
        nombre: `${s.nombre} · RoI ${k + 1}`,
        tipo: 'roi',
        latitudGrados: Number(la.toFixed(5)),
        longitudEsteGrados: Number(lo.toFixed(4)),
        xM: x,
        yM: y,
        ladoKm: null,
        fuente: `Región de interés ${k + 1} de "${s.dir}" (zona de aterrizaje candidata; Barker et al. 2021, Planet. Space Sci. 203, 105119; ${BASE}/${s.dir}/${s.dir}_ROIs.tgz)`,
        archivo: url,
      })
      console.log(`          RoI ${k + 1}: ${la.toFixed(5)}°, ${lo.toFixed(3)}° E`)
    })
  }
  sitios.push({
    id: 'im-2',
    nombre: 'IM-2 Athena (alunizaje, CLPS)',
    tipo: 'mision',
    latitudGrados: -84.7906,
    longitudEsteGrados: 29.1957,
    xM: null,
    yM: null,
    ladoKm: null,
    fuente:
      'Intuitive Machines IM-2 (Athena), alunizaje del 2025-03-06 en Mons Mouton: 84°47′26″ S, 29°11′45″ E (Wikipedia, "IM-2"; el blanco publicado por LROC era −84,78°, 29,13° E, ~250 m)',
    archivo: 'https://www.lroc.asu.edu/images/1401',
  })
  const datos = {
    procedencia: {
      fuente: 'PGDA, "High-Resolution LOLA Topography for Lunar South Pole Sites" (Barker et al. 2021); README de los sitios',
      readme: `${BASE}/README`,
      consultadoUTC: new Date().toISOString(),
      nota: 'Nombres de los sitios según el README de PGDA (numeración de Mazarico et al. 2011). Muchos coinciden con regiones candidatas de Artemis III (NASA, 2022 y 2024), pero el centro es el del mosaico de PGDA, no el de la región de NASA.',
    },
    sitios,
  }
  await Bun.write(new URL('../src/data/catalogo-polo.json', import.meta.url), JSON.stringify(datos, null, 1) + '\n')
}

await main()
