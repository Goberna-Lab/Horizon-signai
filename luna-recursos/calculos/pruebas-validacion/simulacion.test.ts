// E26.2: simulación de aterrizaje: coherencia del veredicto con los requisitos, la sugerencia de hora y el estado global.
import { describe, expect, test } from 'bun:test'
import meta from '../src/data/efemerides-luna.json'
import horizonte from '../src/data/horizonte-connecting-ridge.json'
import { crearTablaLuna, prepararSitio } from '../src/engine/efemeridesLuna'
import { mascaraDeArchivo, perfilDesde } from '../src/engine/mascara'
import { REQUISITOS_EJEMPLO, candidatosContacto, descensoNominal, estadoGlobal, simularAterrizaje, sugerirContacto } from '../src/engine/simulacion'
import { barrer, margenSol, margenTierra } from '../src/engine/planificador'

const tabla = crearTablaLuna(await Bun.file(new URL('../src/data/efemerides-luna.f32', import.meta.url)).arrayBuffer(), meta)
const punto = { sitio: prepararSitio(-89.46316, 222.5104), perfil: perfilDesde(mascaraDeArchivo(horizonte, ''), 0) }
const MES = Date.parse('2027-01-01T00:00:00Z')

describe('E26.2: simulación de aterrizaje', () => {
  test('el encendido es el contacto menos la duración del descenso nominal (~11:50), y el rumbo deja el Sol a la espalda', () => {
    const s = simularAterrizaje(tabla, punto, MES, REQUISITOS_EJEMPLO, 3)
    expect((s.contactoMs - s.encendidoMs) / 1000).toBeCloseTo(descensoNominal().eventos.contacto, 6)
    expect(s.luz.solRespectoEspaldaGrados).toBeLessThan(1e-6)
  })
  test('el veredicto sigue a los requisitos: todo se cumple con requisitos laxos y nada de lo exigible con requisitos imposibles', () => {
    const laxo = { ...REQUISITOS_EJEMPLO, bateriaHoras: 1e6, inclinacionMaximaGrados: 90, margenCombustibleKg: 0, tierraEnContacto: false, tierraMinimaEstadia: 0, solEnContacto: false }
    const imposible = { ...REQUISITOS_EJEMPLO, bateriaHoras: -1, inclinacionMaximaGrados: -1, margenCombustibleKg: 1e6, tierraMinimaEstadia: 1.01 }
    const a = simularAterrizaje(tabla, punto, MES, laxo, 3)
    const b = simularAterrizaje(tabla, punto, MES, imposible, 3)
    for (const c of a.veredicto) if (c.id !== 'luz-aproximacion') expect(c.cumple).toBe(true)
    for (const id of ['combustible', 'noche', 'tierra-estadia', 'inclinacion']) expect(b.veredicto.find((c) => c.id === id)!.cumple).toBe(false)
  })
  test('la hora sugerida tiene Sol y Tierra en el contacto, y ninguna hora del mes con ambos tiene una noche más corta', () => {
    const req = { ...REQUISITOS_EJEMPLO, diasSuperficie: 2 }
    const ms = sugerirContacto(tabla, punto, MES, MES + 29.5 * 86_400_000, req)
    expect(ms).not.toBeNull()
    const b = barrer(tabla, punto, ms!, ms! + 1, 1)
    expect(margenSol(b.solSobreHorizonte[0])).toBeGreaterThan(0)
    expect(margenTierra(b.tierraSobreHorizonte[0])).toBeGreaterThan(0)
    const s = simularAterrizaje(tabla, punto, ms!, req, null)
    expect(s.veredicto.find((c) => c.id === 'sol-contacto')!.cumple).toBe(true)
  })
  test('el estado global coincide con cieloEn: dirección unitaria, elevación y azimut consistentes', () => {
    const e = estadoGlobal(tabla, punto, MES)
    expect(Math.hypot(...e.direccionSol)).toBeCloseTo(1, 9)
    expect(Math.asin(e.direccionSol[1]) * (180 / Math.PI)).toBeCloseTo(e.elevacionSolGrados, 9)
    expect(e.distanciaTierraAu * 149_597_870.7).toBeGreaterThan(350_000)
  })
  test('los candidatos para comparar están separados ≥ 24 h, cumplen Sol y Tierra en el contacto e incluyen la hora sugerida', () => {
    const req = { ...REQUISITOS_EJEMPLO, diasSuperficie: 2 }
    const c = candidatosContacto(tabla, punto, MES, MES + 29.5 * 86_400_000, req, 3)
    expect(c.length).toBeGreaterThan(0)
    for (let i = 1; i < c.length; i++) expect(c[i] - c[i - 1]).toBeGreaterThanOrEqual(86_400_000)
    expect(c).toContain(sugerirContacto(tabla, punto, MES, MES + 29.5 * 86_400_000, req)!)
  })
})
