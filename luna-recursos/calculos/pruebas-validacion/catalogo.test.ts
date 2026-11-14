// E24: catálogo del polo sur y puntos propios. Se compara contra fuentes independientes: la cabecera del DTM de 5 m de
// PGDA (centro de Connecting Ridge de E20), el horizonte detallado de E20 y los mapas de visibilidad media de Mazarico
// et al. (2011, 60 m, 18,6 años).
import { describe, expect, test } from 'bun:test'
import catalogo from '../src/data/catalogo-polo.json'
import metaDem from '../src/data/dem-polo.json'
import metaTabla from '../src/data/efemerides-luna.json'
import horizonteCR from '../src/data/horizonte-connecting-ridge.json'
import relieveCR from '../src/data/relieve-connecting-ridge.json'
import validacion from '../src/data/validacion-catalogo.json'
import { alturaPolar, crearDemPolar, desdeEstereoSur, dentroDelDominio, estereoSur, mascaraPolar } from '../src/engine/demPolar'
import { crearTablaLuna, elevacionesEn, prepararSitio, type TablaLuna } from '../src/engine/efemeridesLuna'
import { horizonteEn, mascaraDeArchivo, perfilDesde, type Mascara } from '../src/engine/mascara'

const datos = (archivo: string) => Bun.file(new URL(`../src/data/${archivo}`, import.meta.url))
const dem = crearDemPolar(await datos('dem-polo-240m.i16').arrayBuffer(), await datos('dem-polo-960m.i16').arrayBuffer(), metaDem)
const tabla = crearTablaLuna(await datos('efemerides-luna.f32').arrayBuffer(), metaTabla)
const mascaraCatalogo = async (id: string): Promise<Mascara> => mascaraDeArchivo(await datos(`horizonte-catalogo-${id}.json`).json(), id)

/** Fracción de 2026–2030 (cada 3 h) con alguna parte del disco del Sol y de la Tierra sobre el horizonte (E21). */
function visibilidad(t: TablaLuna, lat: number, lon: number, m: Mascara, alturaM: number) {
  const p = perfilDesde(m, alturaM)
  const sitio = prepararSitio(lat, lon)
  const o = new Float64Array(4)
  let sol = 0
  let tierra = 0
  let n = 0
  for (let ms = t.inicioMs; ms <= t.finMs; ms += 3 * 3_600_000) {
    elevacionesEn(t, sitio, ms, o)
    if (o[1] + 0.266 > horizonteEn(p, o[0])) sol++
    if (o[3] + 0.95 > horizonteEn(p, o[2])) tierra++
    n++
  }
  return { sol: sol / n, tierra: tierra / n }
}

const rms = (a: Float32Array, b: Float32Array) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0) / a.length)

describe('E24: catálogo del polo sur y puntos propios', () => {
  test('el centro de Connecting Ridge leído de la cabecera de PGDA coincide con el de E20 (−89,46316°, 222,5104° E)', () => {
    const cr = catalogo.sitios.find((s) => s.id === 'connecting-ridge')!
    expect(cr.latitudGrados).toBeCloseTo(-89.46316, 5)
    expect(cr.longitudEsteGrados).toBeCloseTo(222.5104, 4)
    expect([cr.xM, cr.yM]).toEqual([-11000, -12000])
  })
  test('la estereográfica polar ida y vuelta es exacta, y el dominio de puntos propios llega a 190 km (~83,7° S)', () => {
    for (const [la, lo] of [[-89.5, 10], [-85, 200], [-84, 359.9]]) {
      const [x, y] = estereoSur(la, lo)
      const [la2, lo2] = desdeEstereoSur(x, y)
      expect(la2).toBeCloseTo(la, 9)
      expect(lo2).toBeCloseTo(lo, 9)
    }
    expect(dentroDelDominio(-84, 0)).toBe(true)
    expect(dentroDelDominio(-83.5, 0)).toBe(false)
  })
  test('el DEM de 240 m da la altura del centro de Connecting Ridge a ±5 m del DTM de 5 m (1944,8 m, E20)', () => {
    const [x, y] = estereoSur(-89.46316, 222.5104)
    expect(Math.abs(alturaPolar(dem, x, y) - relieveCR.centro.elevacionM)).toBeLessThan(5)
  })
  test('Connecting Ridge con el método del catálogo reproduce el horizonte detallado de E20: ≤ 0,05° RMS desde 1,7 m y ≤ 0,5° a ras del suelo', async () => {
    const cat = await mascaraCatalogo('connecting-ridge')
    const det = mascaraDeArchivo(horizonteCR, 'E20')
    expect(rms(perfilDesde(cat, 1.7).elevacionGrados, perfilDesde(det, 1.7).elevacionGrados)).toBeLessThan(0.05)
    expect(rms(perfilDesde(cat, 0).elevacionGrados, perfilDesde(det, 0).elevacionGrados)).toBeLessThan(0.5)
  })
  test('el horizonte aproximado (240 m, en el navegador) queda a ≤ 0,3° RMS del detallado desde 10 m en Connecting Ridge', () => {
    const aprox = mascaraPolar(dem, -89.46316, 222.5104)
    expect(rms(perfilDesde(aprox, 10).elevacionGrados, perfilDesde(mascaraDeArchivo(horizonteCR, ''), 10).elevacionGrados)).toBeLessThan(0.3)
  })
  test(
    'Barker et al. (2021): a 1 m sobre el suelo, las RoI 4–6 de Connecting Ridge superan el 70 % de Sol y son las mejores del sitio',
    async () => {
      // Barker et al. 2021 (PGDA, producto 78): "Site 1 has the most area with average illumination > 70% at 1 m above the
      // surface and RoIs 4 - 6 at this site generally have the most favorable illumination conditions" (2024–2026; aquí 2026–2030).
      const sol = (k: number) => {
        const s = catalogo.sitios.find((x) => x.id === `connecting-ridge-roi-${k}`)!
        return mascaraCatalogo(s.id).then((m) => visibilidad(tabla, s.latitudGrados, s.longitudEsteGrados, m, 1).sol)
      }
      const r = await Promise.all([1, 2, 3, 4, 5, 6, 7].map(sol))
      for (const k of [4, 5, 6]) expect(r[k - 1]).toBeGreaterThan(0.7)
      const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
      expect(media([r[3], r[4], r[5]])).toBeGreaterThan(media([r[0], r[1], r[2], r[6]]))
    },
    120_000,
  )
  test(
    'Tierra a ras del suelo frente a Mazarico et al. (2011) en los 26 puntos del catálogo dentro de 85° S: error medio ≤ 5 puntos',
    async () => {
      // La Tierra está a varios grados sobre el horizonte y el microrrelieve pesa poco; el Sol, a ±1,5°, depende del relieve de
      // pocos metros y del DEM (5 m aquí, 60 m en Mazarico): su tabla completa está en SPEC E24.
      let suma = 0
      for (const v of validacion.sitios) {
        const s = catalogo.sitios.find((x) => x.id === v.id)!
        suma += Math.abs(visibilidad(tabla, s.latitudGrados, s.longitudEsteGrados, await mascaraCatalogo(v.id), 0).tierra - v.mazaricoTierra.valor)
      }
      expect(validacion.sitios.length).toBe(26)
      expect(suma / validacion.sitios.length).toBeLessThan(0.05)
    },
    120_000,
  )
})
