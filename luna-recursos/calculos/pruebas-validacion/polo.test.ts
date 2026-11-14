// E20: pruebas del sitio polar (Connecting Ridge). Se corren con LUNA_SITIO=connecting-ridge (bun run test lo hace);
// con otro sitio activo se saltan. Cada una compara contra una fuente o una solución independiente.
import { describe, expect, test } from 'bun:test'
import { SITIO_ACTIVO } from '../src/engine/sitio'

const RAD = Math.PI / 180
const ES_POLO = SITIO_ACTIVO.id === 'connecting-ridge'

describe.skipIf(!ES_POLO)('E20: polo sur, Connecting Ridge', async () => {
  const datos = (await import('../src/data/efemerides-connecting-ridge.json')).default
  const horizonte = (await import('../src/data/horizonte-connecting-ridge.json')).default
  const relieve = (await import('../src/data/relieve-connecting-ridge.json')).default
  const { CANTIDAD_DIAS, DEFINICION_DIA, LIMITES_DIA_S, dia, estado, tParaElevacionManana } = await import('../src/engine/simulation')
  const { resumenDia } = await import('../src/engine/evaluacion')
  const { momentosDePrueba } = await import('../src/engine/verificacion')
  const { SUPERFICIE } = await import('../src/engine/environment')
  const relativo = (az: number, ref: number) => ((((az - ref + 540) % 360) + 360) % 360) - 180
  const colatitud = 90 + SITIO_ACTIVO.latitudGrados // 0,537°

  test('el sitio es el centro del mosaico de PGDA Site01 (89,46° S) y usa albedo de tierras altas (LSB p. 59, supuesto)', () => {
    expect(datos.sitio.latitudGrados).toBeCloseTo(-89.46316, 5)
    expect(colatitud).toBeCloseTo(0.5368, 3)
    expect(SUPERFICIE.albedo).toBe(0.15)
  })
  test('6 días de medianoche a medianoche de 29,5 ± 0,3 d (FA cap. 11.4, p. 257); cada límite es el Sol en el antimeridiano (az 180°)', () => {
    expect(DEFINICION_DIA).toBe('medianoche')
    expect(CANTIDAD_DIAS).toBe(6)
    for (let k = 0; k < CANTIDAD_DIAS; k++) expect(Math.abs(dia(k).duracion / 86400 - 29.5)).toBeLessThan(0.3)
    for (const t of LIMITES_DIA_S) expect(Math.abs(relativo(estado(t).azimutSolGrados, 180))).toBeLessThan(0.05)
  })
  test('el mediodía es el tránsito por el norte (az 0°) y queda ~2·colatitud sobre las medianoches del día', () => {
    // A 89,46° S el Sol sube y baja ±colatitud en el día; la latitud subsolar se corre ~0,03°/d (FA p. 412) y se descuenta
    // promediando las dos medianoches.
    for (let k = 0; k < CANTIDAD_DIAS; k++) {
      const d = dia(k)
      const m = estado(d.mediodia)
      // azimutDe evita mostrar 360,0° (F10, E4) y satura en 359,999999°: tolerancia de 1e-5°.
      expect(Math.abs(relativo(m.azimutSolGrados, 0))).toBeLessThan(1e-5)
      const medianoches = (estado(d.inicio).elevacionSolGrados + estado(d.fin).elevacionSolGrados) / 2
      expect(Math.abs(m.elevacionSolGrados - medianoches - 2 * colatitud)).toBeLessThan(0.15)
    }
  })
  test('el Sol nunca se aleja más de 1,5424° + colatitud + paralaje del horizonte astronómico (FA p. 412)', () => {
    for (const e of datos.sol.elevacionGrados) expect(Math.abs(e)).toBeLessThanOrEqual(1.5424 + colatitud + 0.013 + 0.03)
  })
  test('la Tierra oscila alrededor del horizonte: |elevación| ≤ libración en latitud 6,69° + colatitud + paralaje + libración física (FA p. 413; márgenes de T0)', () => {
    const t = datos.tierra.elevacionGrados
    for (const e of t) expect(Math.abs(e)).toBeLessThanOrEqual(6.6878 + colatitud + 0.3 + 0.03)
    expect(Math.min(...t)).toBeLessThan(0)
    expect(Math.max(...t)).toBeGreaterThan(0)
  })
  test('la altura del sitio coincide en dos productos LOLA independientes (5 m de PGDA y LDEM_75S_120M) a menos de 5 m', () => {
    expect(Math.abs(horizonte.procedencia.alturaSitioM - horizonte.procedencia.alturaSitio120mM)).toBeLessThan(5)
    expect(Math.abs(relieve.centro.elevacionM - horizonte.procedencia.alturaSitioM)).toBeLessThan(0.1)
  })
  test('en el polo la Tierra y el Sol se ven solo parte de cada día lunar (a diferencia del Apollo 17, con la Tierra al 100 %)', () => {
    for (let k = 0; k < CANTIDAD_DIAS; k++) {
      const r = resumenDia(dia(k), 0, 0)
      expect(r.fraccionTierra).toBeGreaterThan(0)
      expect(r.fraccionTierra).toBeLessThan(1)
      expect(r.fraccionSol).toBeGreaterThan(0)
      expect(r.fraccionSol).toBeLessThan(1)
    }
  })
  test('los momentos de prueba son medianoche y mediodía; α = 12° no se alcanza y devuelve el mediodía', () => {
    const d = dia(0)
    expect(momentosDePrueba(d).map((m) => m.nombre)).toEqual(['Medianoche', 'Mediodía (tránsito)'])
    expect(tParaElevacionManana(d, 12)).toBe(d.mediodia)
    expect(estado(d.mediodia).elevacionSolGrados * RAD).toBeLessThan(3 * RAD)
  })
})

describe.skipIf(!ES_POLO)('E21: altura del observador y validación de la iluminación (Mazarico et al. 2011)', async () => {
  const validacion = (await import('../src/data/validacion-iluminacion-connecting-ridge.json')).default
  const { fraccionVisible } = await import('../src/engine/evaluacion')
  const { elevacionHorizonte } = await import('../src/engine/horizonte')
  const { SOL, TIERRA } = await import('../src/engine/environment')
  const leer = async (n: string) => new Float32Array(await Bun.file(new URL(`../src/data/${n}`, import.meta.url)).arrayBuffer())
  const sol = await leer('serie-sol-connecting-ridge.f32')
  const tierra = await leer('serie-tierra-connecting-ridge.f32')
  const horizonteDatos = (await import('../src/data/horizonte-connecting-ridge.json')).default

  test('la envolvente de cada rayo reproduce el horizonte a ras del suelo (≤ 0,01°) y más alto el horizonte baja', () => {
    for (let i = 0; i < horizonteDatos.elevacionGrados.length; i += 7) {
      const az = i * horizonteDatos.pasoAzimutGrados
      expect(Math.abs(elevacionHorizonte(az, 1e-9) - elevacionHorizonte(az, 0))).toBeLessThan(0.01)
      expect(elevacionHorizonte(az, 10)).toBeLessThanOrEqual(elevacionHorizonte(az, 1.7) + 1e-9)
      expect(elevacionHorizonte(az, 1.7)).toBeLessThanOrEqual(elevacionHorizonte(az, 1e-9) + 1e-9)
    }
  })
  test('la serie de 18,6 años cada 3 h está completa (Horizons)', () => {
    expect(sol.length / 2).toBe(validacion.filas)
    expect(tierra.length / 2).toBe(validacion.filas)
    expect(validacion.filas * validacion.pasoH / (365.25 * 24)).toBeCloseTo(18.6, 2)
  })
  test(
    'a ras del suelo, el motor reproduce la visibilidad media de Mazarico et al. (2011) en el sitio a ±5 puntos (Sol 38,5 %, Tierra 33,9 %)',
    () => {
      // Tolerancia: el mapa de referencia es de 60 m y sus 8 vecinos del sitio van de 22 % a 54 % (Sol): 5 puntos es mucho
      // menos que esa variación espacial en la cresta.
      const nuestroSol = fraccionVisible(sol, SOL.diametroAngularGrados / 2, 0, 0, 0)
      const nuestroTierra = fraccionVisible(tierra, TIERRA.diametroAngularGrados / 2, 0, 0, 0)
      expect(Math.abs(nuestroSol - validacion.mazaricoSol.valor)).toBeLessThan(0.05)
      expect(Math.abs(nuestroTierra - validacion.mazaricoTierra.valor)).toBeLessThan(0.05)
    },
    60_000,
  )
  test(
    'subir el observador da más horas de luz (a 10 m el Sol se ve más del doble que a ras del suelo)',
    () => {
      const suelo = fraccionVisible(sol, SOL.diametroAngularGrados / 2, 0, 0, 0)
      const mastil = fraccionVisible(sol, SOL.diametroAngularGrados / 2, 0, 0, 10)
      expect(mastil).toBeGreaterThan(2 * suelo)
    },
    60_000,
  )
})

describe.skipIf(!ES_POLO)('E23: el planificador reproduce el motor de la escena', () => {
  test('día lunar 1 en el centro: Sol y Tierra visibles a ±0,5 puntos del resumen del motor (suelo, 1,7 m y 10 m)', async () => {
    const { planificadorFrenteAMotor } = await import('./comparar-planificador')
    for (const H of [0, 1.7, 10]) {
      const r = await planificadorFrenteAMotor(H)
      expect(Math.abs(r.plan.sol - r.motor.sol)).toBeLessThan(0.005)
      expect(Math.abs(r.plan.tierra - r.motor.tierra)).toBeLessThan(0.005)
    }
  }, 60_000)
})
