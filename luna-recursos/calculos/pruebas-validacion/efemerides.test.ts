// E22: efemérides para cualquier punto y fecha (2026–2030). Se comparan contra las tablas de Horizons consultadas para
// cada sitio (E18, E20, E21), que son una solución independiente: Horizons calcula el Sol y la Tierra desde el sitio;
// el motor, desde el punto subsolar y sub-Tierra más el paralaje.
import { describe, expect, test } from 'bun:test'
import meta from '../src/data/efemerides-luna.json'
import { cieloEn, crearTablaLuna, dentroDeTabla, elevacionesEn, prepararSitio } from '../src/engine/efemeridesLuna'

const RAD = Math.PI / 180
const tabla = crearTablaLuna(await Bun.file(new URL('../src/data/efemerides-luna.f32', import.meta.url)).arrayBuffer(), meta)

/** Ángulo (°) entre dos direcciones dadas por azimut y elevación. */
function separacion(az1: number, el1: number, az2: number, el2: number): number {
  const c = Math.sin(el1 * RAD) * Math.sin(el2 * RAD) + Math.cos(el1 * RAD) * Math.cos(el2 * RAD) * Math.cos((az1 - az2) * RAD)
  return Math.acos(Math.min(1, c)) / RAD
}

describe('E22: efemerides para cualquier punto y fecha (2026–2030)', () => {
  test('la tabla cubre 2026-01-01 → 2031-01-01 cada 3 h, con vectores unitarios y distancias plausibles', () => {
    expect(tabla.filas).toBe(14609)
    expect(new Date(tabla.inicioMs).toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(dentroDeTabla(tabla, Date.parse('2030-12-31T23:00:00Z'))).toBe(true)
    expect(dentroDeTabla(tabla, Date.parse('2031-01-02T00:00:00Z'))).toBe(false)
    for (let k = 0; k < tabla.filas; k++) {
      const d = tabla.datos
      expect(Math.abs(Math.hypot(d[k * 8], d[k * 8 + 1], d[k * 8 + 2]) - 1)).toBeLessThan(1e-6)
      expect(Math.abs(Math.hypot(d[k * 8 + 4], d[k * 8 + 5], d[k * 8 + 6]) - 1)).toBeLessThan(1e-6)
      // Luna–Sol: 1 UA ± 2 % (órbita de la Tierra, e = 0,0167, más ±0,0026 UA de la Luna; FA pp. 671, 675).
      expect(Math.abs(d[k * 8 + 3] / 149_597_870.7 - 1)).toBeLessThan(0.02)
      // Tierra–Luna: Horizons llega a 355 304 km en perigeo (E18, Abiertas); cota amplia (supuesto) de 350 000 a 410 000 km.
      expect(d[k * 8 + 7]).toBeGreaterThan(350_000)
      expect(d[k * 8 + 7]).toBeLessThan(410_000)
    }
  })

  for (const id of ['apollo17', 'connecting-ridge'] as const) {
    test(`coincide con la tabla de Horizons del sitio ${id} a ≤ 0,01° (Sol y Tierra), en diámetro, fase y distancia`, async () => {
      const ef = (await import(`../src/data/efemerides-${id}.json`)).default
      const sitio = prepararSitio(ef.sitio.latitudGrados, ef.sitio.longitudEsteGrados)
      const t0 = Date.parse(ef.inicioTablaUTC)
      let peorSol = 0
      let peorTierra = 0
      for (let k = 0; k < ef.sol.elevacionGrados.length; k++) {
        const c = cieloEn(tabla, sitio, t0 + k * ef.pasoS * 1000)
        peorSol = Math.max(peorSol, separacion(c.sol.azimutGrados, c.sol.elevacionGrados, ef.sol.azimutGrados[k], ef.sol.elevacionGrados[k]))
        peorTierra = Math.max(peorTierra, separacion(c.tierra.azimutGrados, c.tierra.elevacionGrados, ef.tierra.azimutGrados[k], ef.tierra.elevacionGrados[k]))
        // Diámetros: R☉ de FA (695 508 km) frente a los 695 700 km de Horizons: 0,03 % ≈ 0,6″. La Tierra difiere ±1,4″
        // (0,02 % de ~6900″), con un ciclo que no reproducimos (Horizons no documenta el cálculo); sin efecto visible.
        expect(Math.abs(c.sol.diametroGrados * 3600 - ef.sol.diametroArcsec[k])).toBeLessThan(1)
        expect(Math.abs(c.tierra.diametroGrados * 3600 - ef.tierra.diametroArcsec[k])).toBeLessThan(2)
        expect(Math.abs(c.tierra.fase * 100 - ef.tierra.iluminadaPorciento[k])).toBeLessThan(0.1)
        expect(Math.abs(c.sol.distanciaAu - ef.sol.distanciaAu[k])).toBeLessThan(1e-6)
      }
      expect(peorSol).toBeLessThan(0.01)
      expect(peorTierra).toBeLessThan(0.01)
    })
  }

  test('coincide con la serie de Horizons de 18,6 años de Connecting Ridge (E21) en todo el tramo 2026–2030', async () => {
    const v = (await import('../src/data/validacion-iluminacion-connecting-ridge.json')).default
    const sol = new Float32Array(await Bun.file(new URL('../src/data/serie-sol-connecting-ridge.f32', import.meta.url)).arrayBuffer())
    const tierra = new Float32Array(await Bun.file(new URL('../src/data/serie-tierra-connecting-ridge.f32', import.meta.url)).arrayBuffer())
    const sitio = prepararSitio(-89.46316, 222.5104)
    const t0 = Date.parse(v.inicioUTC)
    const salida = new Float64Array(4)
    let peor = 0
    let n = 0
    for (let k = 0; k < v.filas; k++) {
      const ms = t0 + k * v.pasoH * 3_600_000
      if (!dentroDeTabla(tabla, ms)) break
      elevacionesEn(tabla, sitio, ms, salida)
      peor = Math.max(peor, separacion(salida[0], salida[1], sol[2 * k], sol[2 * k + 1]), separacion(salida[2], salida[3], tierra[2 * k], tierra[2 * k + 1]))
      n++
    }
    expect(n).toBeGreaterThan(12_000)
    expect(peor).toBeLessThan(0.01)
  })
})
