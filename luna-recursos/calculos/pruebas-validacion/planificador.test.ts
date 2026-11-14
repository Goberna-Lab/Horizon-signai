// E23: planificador. Pruebas que no dependen del sitio activo: la máscara reproduce el horizonte de E10/E20, y las
// ventanas, el resumen y la cuenta regresiva son coherentes entre sí. La comparación con el motor de la escena
// (resumenDia, E19) está en tests/motor.test.ts (Apollo 17) y tests/polo.test.ts (polo).
import { describe, expect, test } from 'bun:test'
import meta from '../src/data/efemerides-luna.json'
import horizonte from '../src/data/horizonte-connecting-ridge.json'
import { crearTablaLuna, prepararSitio } from '../src/engine/efemeridesLuna'
import { horizonteEn, mascaraDeArchivo, perfilDesde } from '../src/engine/mascara'
import { barrer, porMeses, proximoCambio, resumir, ventanas } from '../src/engine/planificador'

const tabla = crearTablaLuna(await Bun.file(new URL('../src/data/efemerides-luna.f32', import.meta.url)).arrayBuffer(), meta)
const punto = { sitio: prepararSitio(-89.46316, 222.5104), perfil: perfilDesde(mascaraDeArchivo(horizonte, 'prueba'), 0) }
const DESDE = Date.parse('2027-03-01T00:00:00Z')
const HASTA = DESDE + 30 * 86_400_000
const PASO = 600_000

describe('E23–E25: planificador', () => {
  test('sin la parte cercana, la máscara reproduce el horizonte lejano del archivo (E20) a ≤ 0,01°', () => {
    const lejano = perfilDesde(mascaraDeArchivo({ ...horizonte, envolventeCercana: undefined }, 'prueba'), 0)
    horizonte.elevacionGrados.forEach((e, i) => expect(Math.abs(lejano.elevacionGrados[i] - e)).toBeLessThan(0.01))
  })
  test('con la parte cercana el horizonte nunca baja, y desde 10 m nunca sube', () => {
    const p10 = perfilDesde(mascaraDeArchivo(horizonte, 'prueba'), 10)
    for (let az = 0; az < 360; az += 0.25) {
      expect(horizonteEn(punto.perfil, az)).toBeGreaterThanOrEqual(horizonteEn(perfilDesde(mascaraDeArchivo({ ...horizonte, envolventeCercana: undefined }, ''), 0), az) - 1e-4)
      expect(horizonteEn(p10, az)).toBeLessThanOrEqual(horizonteEn(punto.perfil, az) + 1e-6)
    }
  })
  test('las ventanas suman lo mismo que el resumen (±1 paso por ventana), y la cuenta regresiva cae en sus bordes (±60 s)', () => {
    const b = barrer(tabla, punto, DESDE, HASTA, PASO)
    const r = resumir(b)
    for (const [cuerpo, fraccion] of [['sol', r.fraccionSol], ['tierra', r.fraccionTierra]] as const) {
      const v = ventanas(b, cuerpo)
      const total = v.reduce((a, w) => a + (w.finMs - w.inicioMs), 0) / (HASTA - DESDE + PASO)
      expect(Math.abs(total - fraccion)).toBeLessThanOrEqual(((v.length + 1) * PASO) / (HASTA - DESDE))
      // Primera ventana que termina dentro del período: la cuenta regresiva desde su interior da su fin.
      const w = v.find((x) => x.finMs < HASTA - PASO && x.finMs - x.inicioMs > 2 * PASO)
      if (w) {
        const c = proximoCambio(tabla, punto, w.inicioMs + PASO, cuerpo, HASTA)
        expect(c.visible).toBe(true)
        // El borde de la ventana es interpolado entre muestras de 10 min; la bisección va al segundo: ±60 s.
        expect(Math.abs((c.cambioMs ?? 0) - w.finMs)).toBeLessThan(60_000)
      }
    }
  })
  test('el panel vertical da 0 sin Sol y como mucho la constante solar (1361 W/m², FA p. 542)', () => {
    const b = barrer(tabla, punto, DESDE, HASTA, PASO)
    for (let k = 0; k < b.n; k++) {
      if (b.solFraccion[k] === 0) expect(b.panelWm2[k]).toBe(0)
      expect(b.panelWm2[k]).toBeLessThanOrEqual(1361)
    }
  })
  test('E25: mes a mes cubre 2026–2030 con 61 meses sinódicos, y el promedio de los meses es el del período entero (±0,5 puntos)', () => {
    const meses = porMeses(tabla, punto, tabla.inicioMs, tabla.finMs)
    expect(meses.length).toBe(61)
    for (const m of meses) expect((m.finMs - m.inicioMs) / 86_400_000).toBeCloseTo(29.530589, 5)
    const promedioSol = meses.reduce((a, m) => a + m.resumen.fraccionSol, 0) / meses.length
    const promedioTierra = meses.reduce((a, m) => a + m.resumen.fraccionTierra, 0) / meses.length
    const todo = resumir(barrer(tabla, punto, meses[0].inicioMs, meses[meses.length - 1].finMs - 1_800_000, 1_800_000))
    expect(Math.abs(promedioSol - todo.fraccionSol)).toBeLessThan(0.005)
    expect(Math.abs(promedioTierra - todo.fraccionTierra)).toBeLessThan(0.005)
  })
  test('E25: en Connecting Ridge la Tierra se ve más en unos meses que en otros (libración; FA p. 413), y nunca todo el mes', () => {
    const meses = porMeses(tabla, punto, tabla.inicioMs, tabla.finMs)
    const t = meses.map((m) => m.resumen.fraccionTierra)
    expect(Math.max(...t) - Math.min(...t)).toBeGreaterThan(0.1)
    expect(Math.max(...t)).toBeLessThan(1)
  })
})
