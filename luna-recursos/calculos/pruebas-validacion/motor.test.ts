// Pruebas del motor (bun test). Cada una compara contra una fuente o una solución exacta, no contra el propio
// código: ver docs/matriz-trazabilidad.md, sección 4.
import { describe, expect, test } from 'bun:test'
import { SITIO_ACTIVO } from '../src/engine/sitio'

if (SITIO_ACTIVO.id !== 'apollo17') throw new Error('tests/motor.test.ts es del Apollo 17: correr sin LUNA_SITIO (bun run test).')
import datos from '../src/data/efemerides-apollo17.json'
import {
  CONSTANTE_SOLAR_W_M2,
  OBSTACULO,
  SOL,
  SUPERFICIE,
  elevacionCentroideVisible,
  faseEsferaLambert,
  luzTierraLlena,
  direccionDesdeHorizonte,
  fraccionDiscoVisible,
  iluminacion,
  limitesSombra,
  longitudSombra,
  type Vec3,
} from '../src/engine/environment'
import { brdfLambert, faseEsferaMC, hornoEsfera, generador, irradianciaDesdeSuelo, reflectanciaDH } from '../src/engine/montecarlo'
import {
  CANTIDAD_DIAS,
  DURACION_S,
  LIMITES_DIA_S,
  SITIO,
  dia,
  diaDe,
  estado,
  limitarT,
  tParaElevacionManana,
  tParaElevacionTarde,
} from '../src/engine/simulation'
import { limitesSombraSobreTerreno } from '../src/engine/terreno'

const RAD = Math.PI / 180
const UA_KM = 149_597_870.7 // FA tabla B.1, p. 671
/** E18: las pruebas de E5–E17 se escribieron para un solo día lunar; siguen valiendo sobre el primero. */
const D0 = dia(0)

/** Topocéntrico (az/el en el sitio) → vector selenográfico unitario (x hacia 0° E, z hacia el polo norte). */
function selenografico(az: number, el: number): Vec3 {
  const [este, arriba, menosNorte] = direccionDesdeHorizonte(el, az)
  const norte = -menosNorte
  const f = SITIO.latitudGrados * RAD
  const l = SITIO.longitudEsteGrados * RAD
  const E: Vec3 = [-Math.sin(l), Math.cos(l), 0]
  const N: Vec3 = [-Math.sin(f) * Math.cos(l), -Math.sin(f) * Math.sin(l), Math.cos(f)]
  const U: Vec3 = [Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f)]
  return [0, 1, 2].map((i) => este * E[i] + norte * N[i] + arriba * U[i]) as Vec3
}

describe('T0: las efemerides cumplen la teoría (FA y LSB)', () => {
  const { sol, tierra } = datos
  /** E18: filas del primer día lunar (hasta su última salida + 1 fila). */
  const filasDia0 = Math.ceil((Date.parse(datos.limitesDiaUTC[1]) - Date.parse(datos.inicioTablaUTC)) / 3_600_000) + 1
  test('latitud subsolar ≤ 1,5424° + paralaje + libración física (FA p. 412: 1,5424°)', () => {
    for (let i = 0; i < sol.azimutGrados.length; i++) {
      const v = selenografico(sol.azimutGrados[i], sol.elevacionGrados[i])
      expect(Math.abs(Math.asin(v[2]) / RAD)).toBeLessThanOrEqual(1.5424 + 0.013 + 0.03 + 1e-3)
    }
  })
  test('libración: punto subterrestre |b| ≤ 6,7° y |l| ≤ ~8° (FA p. 413; LSB pp. 58–59), con paralaje', () => {
    for (let i = 0; i < tierra.azimutGrados.length; i++) {
      const v = selenografico(tierra.azimutGrados[i], tierra.elevacionGrados[i])
      expect(Math.abs(Math.asin(v[2]) / RAD)).toBeLessThanOrEqual(6.6878 + 0.3)
      expect(Math.abs(Math.atan2(v[1], v[0]) / RAD)).toBeLessThanOrEqual(8 + 0.3)
    }
  })
  // E18: este rango es a(1 ± e) con la e media de la órbita lunar (FA tabla B.7, p. 675: 384 401 km, e = 0,0554). Se
  // cumple en el primer día lunar, pero en los perigeos de dic 2026–abr 2027 la tabla baja a ~355 300 km: la e real
  // varía de un mes a otro, y nuestras fuentes no dan cuánto (Abiertas). Por eso esta prueba mira solo el primer día.
  test('distancia Tierra–Luna en el primer día lunar dentro de 363 100–405 700 km, ± radio lunar por ser topocéntrica (FA p. 671)', () => {
    for (const d of tierra.distanciaAu.slice(0, filasDia0)) {
      const km = d * UA_KM
      expect(km).toBeGreaterThan(363_100 - 1_800)
      expect(km).toBeLessThan(405_700 + 1_800)
    }
  })
  test('diámetro de la Tierra = 2·asin(6378,137 km / ρ) (FA tabla B.2, p. 672)', () => {
    for (let i = 0; i < tierra.diametroArcsec.length; i++) {
      const esperado = 2 * Math.asin(6378.137 / (tierra.distanciaAu[i] * UA_KM)) / RAD
      expect(Math.abs(tierra.diametroArcsec[i] / 3600 - esperado)).toBeLessThan(1e-3)
    }
  })
  test('diámetro del Sol = 2·asin(R☉/ρ) con R☉ = 695 508 km, a 0,05 % (FA tabla B.4, p. 673)', () => {
    for (let i = 0; i < sol.diametroArcsec.length; i++) {
      const esperado = 2 * Math.asin(695_508 / (sol.distanciaAu[i] * UA_KM)) / RAD
      expect(Math.abs(sol.diametroArcsec[i] / 3600 / esperado - 1)).toBeLessThan(5e-4)
    }
  })
  test('día solar del sitio ≈ 29,57 ± 0,02 d en noviembre (FA pp. 413, 461, 673) y dentro de 29,531 d ± 13 h (LSB p. 58)', () => {
    const dias = D0.duracion / 86400
    expect(Math.abs(dias - 29.57)).toBeLessThan(0.02)
    expect(Math.abs(dias - 29.531)).toBeLessThan(13 / 24)
  })
  test('mediodía por tránsito (FA pp. 252–254): azimut 180° y elevación 90° − φ + δ ≈ 68,442°', () => {
    const e = estado(D0.mediodia)
    expect(Math.abs(e.azimutSolGrados - 180)).toBeLessThan(1e-6)
    expect(Math.abs(e.elevacionSolGrados - 68.442)).toBeLessThan(0.01)
    expect(e.fechaUTC.slice(0, 16)).toBe('2026-10-23T07:21')
  })
  test('salida del disco ≈ θ / (ω·cos φ·cos δ) ≈ 67,4 min (FA p. 257)', () => {
    let primera = NaN
    let ultima = NaN
    for (let t = 0; t < 4 * 3600; t += 5) {
      const s = estado(t)
      const F = fraccionDiscoVisible(s.elevacionSolGrados, s.diametroSolGrados)
      if (Number.isNaN(primera) && F > 0) primera = t
      if (Number.isNaN(ultima) && F >= 1) ultima = t
    }
    // t = 0 ya tiene medio disco: se mide desde la mitad hasta el disco entero y se duplica.
    expect(Math.abs(((ultima - primera) * 2) / 60 - 67.4)).toBeLessThan(1.5)
  })
})

describe('ENV-005: el estado es función pura de t', () => {
  test('mismo t, mismo estado exacto', () => {
    expect(JSON.stringify(estado(123_456.7))).toBe(JSON.stringify(estado(123_456.7)))
  })
  test('ningún día se repite: t se limita a la tabla descargada (E7, E18)', () => {
    expect(limitarT(-5)).toBe(0)
    expect(limitarT(DURACION_S + 1000)).toBe(DURACION_S)
    expect(estado(DURACION_S + 1000).fechaUTC).toBe(estado(DURACION_S).fechaUTC)
  })
})

describe('ENV-003 y ENV-007: sombra y penumbra en suelo plano', () => {
  test('L = h/tan α: 47,046 m con α = 12° (experimento 01)', () => {
    expect(longitudSombra(10, 12)).toBeCloseTo(47.046, 3)
  })
  test('núcleo y penumbra: h/tan(α ± θ/2) con θ = 0,5328° (FA pp. 671, 673)', () => {
    const l = limitesSombra(10, 0.5, 12, SOL.diametroAngularGrados)
    expect(l.finNucleoM).toBeCloseTo(10 / Math.tan((12 + SOL.diametroAngularGrados / 2) * RAD), 6)
    expect(l.finPenumbraM).toBeCloseTo(10 / Math.tan((12 - SOL.diametroAngularGrados / 2) * RAD), 6)
    expect(l.anchoPenumbraM).toBeCloseTo(2.152, 2)
  })
  test('disco en el horizonte: F(−θ/2) = 0, F(0) = 0,5, F(θ/2) = 1', () => {
    const t = SOL.diametroAngularGrados
    expect(fraccionDiscoVisible(-t / 2, t)).toBe(0)
    expect(fraccionDiscoVisible(0, t)).toBeCloseTo(0.5, 12)
    expect(fraccionDiscoVisible(t / 2, t)).toBe(1)
  })
})

describe('T9 / ENV-008: sombra del poste sobre el relieve real', () => {
  test('con α = 12° de mañana, la sombra mide 44,15 m sobre el relieve (47,05 m en suelo plano)', () => {
    const e = estado(tParaElevacionManana(D0, 12))
    const d = e.direccionSol
    const h = Math.hypot(d[0], d[2])
    const l = limitesSombraSobreTerreno(OBSTACULO.alturaM, 2 * OBSTACULO.radioM, e.elevacionSolGrados, e.diametroSolGrados, -d[0] / h, -d[2] / h)
    expect(l.centroM).toBeCloseTo(44.15, 1)
    expect(l.finNucleoM).toBeLessThan(l.centroM)
    expect(l.finPenumbraM).toBeGreaterThan(l.centroM)
  })
})

describe('T1 y T2: integrador de Monte Carlo y luz reflejada (PBR)', () => {
  test('T1 horno: L/Le = 1/(1 − ρ) dentro de una esfera (PBR p. 575)', () => {
    const r = hornoEsfera(0.15, 1, 200_000, generador(7))
    expect(Math.abs(r.media - 1 / (1 - 0.15))).toBeLessThan(4 * r.error + 1e-12)
  })
  test('T2: el hemisferio de three es exacto sobre un plano infinito (PBR pp. 191–193)', () => {
    // Suelo lambertiano iluminado con α = 12°: radiancia ρ·E/π; cara vertical y cara hacia abajo.
    const e = estado(tParaElevacionManana(D0, 12))
    const luz = iluminacion(e)
    const radianciaSuelo = luz.reflejadaTerreno / Math.PI
    const azar = generador(11)
    const vertical = irradianciaDesdeSuelo([1, 0, 0], radianciaSuelo, 400_000, azar)
    const abajo = irradianciaDesdeSuelo([0, -1, 0], radianciaSuelo, 400_000, azar)
    // three: hemisferio con suelo = reflejadaTerreno → cara vertical recibe la mitad, la de abajo todo.
    expect(Math.abs(vertical.media - luz.reflejadaTerreno / 2)).toBeLessThan(4 * vertical.error)
    expect(Math.abs(abajo.media - luz.reflejadaTerreno)).toBeLessThan(1e-12 + 4 * abajo.error)
    expect(SUPERFICIE.albedo).toBeGreaterThan(0)
  })
})

describe('T7 / ENV-009 (E8): energía de la BRDF del regolito', () => {
  test('la reflectancia del sitio está en el rango de mar (LSB p. 59: 7–10 %; fig. 7.10, p. 308: ≈0,08–0,09)', () => {
    expect(SUPERFICIE.albedo).toBeGreaterThanOrEqual(0.07)
    expect(SUPERFICIE.albedo).toBeLessThanOrEqual(0.1)
  })
  test('Lambert: ρ_dh = albedo para cualquier dirección de entrada y ≤ 1 (PBR pp. 197, 335, 538)', () => {
    const f = brdfLambert(SUPERFICIE.albedo)
    const azar = generador(3)
    for (const grados of [0, 45, 78, 85]) {
      const entrada: Vec3 = [Math.sin(grados * RAD), Math.cos(grados * RAD), 0]
      const r = reflectanciaDH(f, entrada, [0, 1, 0], 50_000, azar)
      expect(Math.abs(r.media - SUPERFICIE.albedo)).toBeLessThan(1e-9)
      expect(r.media).toBeLessThanOrEqual(1)
    }
  })
})

describe('E9: radiometría', () => {
  test('T6: con el centro del Sol en el horizonte, irradiancia sobre el suelo = 2ρ/(3π) (PBR p. 545)', () => {
    const rho = (SOL.diametroAngularGrados / 2) * RAD
    const e = 0.5 * Math.sin(elevacionCentroideVisible(0, SOL.diametroAngularGrados) * RAD)
    // 2ρ/(3π) es la aproximación de ángulo pequeño (sin x ≈ x): la diferencia relativa esperada es ~x²/6 ≈ 6,5·10⁻⁷.
    expect(Math.abs(e / ((2 * rho) / (3 * Math.PI)) - 1)).toBeLessThan(1e-5)
  })
  test('T8: fase de una esfera lambertiana, fórmula cerrada frente a Monte Carlo', () => {
    const azar = generador(5)
    for (const k of [0.95, 0.89, 0.5, 0.2, 0.05]) {
      const g = Math.acos(2 * k - 1)
      const mc = faseEsferaMC(g, 400_000, azar)
      expect(Math.abs(mc.media - faseEsferaLambert(k))).toBeLessThan(4 * mc.error + 1e-4)
    }
  })
  test('luz terrestre con la Tierra llena a distancia media: (2/3)·0,32·sin²(θ⊕/2) ≈ 5,86·10⁻⁵ (FA pp. 410, 542)', () => {
    const theta = (2 * Math.atan(6371 / 384_401)) / RAD
    expect(luzTierraLlena(theta)).toBeCloseTo(5.86e-5, 7)
  })
  test('irradiancia solar en toda la tabla dentro de 1361/r² con r = 1 ± e⊕ ± a☾(1 + e☾) (FA p. 542; tabla B.5, p. 674; tabla B.7, p. 675)', () => {
    const lunaAu = (384_401 * (1 + 0.0554)) / UA_KM
    const [rMin, rMax] = [1 - 0.01671 - lunaAu, 1 + 0.01671 + lunaAu]
    for (const r of datos.sol.distanciaAu) {
      const w = CONSTANTE_SOLAR_W_M2 / (r * r)
      expect(w).toBeGreaterThanOrEqual(CONSTANTE_SOLAR_W_M2 / (rMax * rMax))
      expect(w).toBeLessThanOrEqual(CONSTANTE_SOLAR_W_M2 / (rMin * rMin))
    }
  })
  test('irradiancia solar en el primer día lunar entre 1369 y 1396 W/m² (1361/r², FA p. 542)', () => {
    const filasDia0 = Math.ceil((Date.parse(datos.limitesDiaUTC[1]) - Date.parse(datos.inicioTablaUTC)) / 3_600_000) + 1
    for (const r of datos.sol.distanciaAu.slice(0, filasDia0)) {
      const w = CONSTANTE_SOLAR_W_M2 / (r * r)
      expect(w).toBeGreaterThan(1368)
      expect(w).toBeLessThan(1396)
    }
    const l = iluminacion(estado(tParaElevacionManana(D0, 12)))
    expect(l.solNormal * CONSTANTE_SOLAR_W_M2).toBeGreaterThan(1368)
  })
})

describe('E9.1: la Tierra dibujada tiene la fase real', () => {
  test('fase por geometría Sol–Tierra, (1 − cos θ)/2, frente a la fracción iluminada de Horizons: diferencia ≤ 0,2 %', () => {
    const { sol, tierra } = datos
    for (let i = 0; i < sol.azimutGrados.length; i++) {
      const s = direccionDesdeHorizonte(sol.elevacionGrados[i], sol.azimutGrados[i])
      const t = direccionDesdeHorizonte(tierra.elevacionGrados[i], tierra.azimutGrados[i])
      const k = (1 - (s[0] * t[0] + s[1] * t[1] + s[2] * t[2])) / 2
      expect(Math.abs(k - tierra.iluminadaPorciento[i] / 100)).toBeLessThan(0.002)
    }
  })
})

describe('E10 / ENV-008: horizonte real del sitio (SLDEM2015)', async () => {
  const horizonte = (await import('../src/data/horizonte-apollo17.json')).default
  const { elevacionHorizonte, distanciaHorizonte } = await import('../src/engine/horizonte')
  const { salidaLocal: T_SALIDA_LOCAL, puestaLocal: T_PUESTA_LOCAL } = D0
  test('la altura del sitio en SLDEM2015 coincide con LROC (−2626 m ± 3,5 m; Wagner et al. 2016) a menos de 5 m', () => {
    expect(Math.abs(horizonte.procedencia.alturaSitioM - -2626)).toBeLessThan(5)
  })
  test('al norte, el Macizo Norte forma el horizonte a 4–10 km, entre 8° y 30° (macizos de 2000–2300 m, valle de ~8 km; LSB pp. 33–34, 37)', () => {
    expect(distanciaHorizonte(0)).toBeGreaterThan(4000)
    expect(distanciaHorizonte(0)).toBeLessThan(10_000)
    expect(elevacionHorizonte(0)).toBeGreaterThan(8)
    expect(elevacionHorizonte(0)).toBeLessThan(30)
  })
  test('salida local: el centro del Sol sobre el horizonte real, ≈ h(az)/(ω·cos φ) horas después de la astronómica (FA p. 257)', () => {
    const e = estado(T_SALIDA_LOCAL)
    expect(Math.abs(e.elevacionSolGrados - elevacionHorizonte(e.azimutSolGrados))).toBeLessThan(1e-4)
    const tasa = (360 / 29.530589 / 24) * Math.cos(SITIO.latitudGrados * RAD) // °/h, δ ≈ 0
    const esperadoH = elevacionHorizonte(e.azimutSolGrados) / tasa
    expect(Math.abs(T_SALIDA_LOCAL / 3600 - esperadoH)).toBeLessThan(0.25)
  })
  test('antes de la salida local no llega luz solar aunque el Sol esté sobre el horizonte astronómico', () => {
    const e = estado(T_SALIDA_LOCAL - 2 * 3600)
    expect(e.elevacionSolGrados).toBeGreaterThan(0)
    expect(iluminacion(e).solVisible).toBe(0)
    expect(iluminacion(e).solSobreSuelo).toBe(0)
  })
  test('la puesta local ocurre antes que la astronómica', () => {
    const e = estado(T_PUESTA_LOCAL)
    expect(e.elevacionSolGrados).toBeGreaterThan(0)
    expect(Math.abs(e.elevacionSolGrados - elevacionHorizonte(e.azimutSolGrados))).toBeLessThan(1e-4)
  })
})

describe('E11 / ENV-009: rebote del relieve (radiosidad de un rebote)', async () => {
  const { prepararRebote, calcularRebote } = await import('../src/engine/rebote')
  const crater = (paso: number) => {
    // Cráter de casquete esférico: diámetro 200 m, profundidad 40 m (d/D = 0,2, supuesto), sobre suelo plano.
    const a = 100
    const d = 40
    const R = (a * a + d * d) / (2 * d)
    const n = Math.round(400 / paso) + 1
    const medio = (n - 1) / 2
    const altura = (f: number, c: number) => {
      const r = Math.hypot((c - medio) * paso, (f - medio) * paso)
      return r <= a ? -d + (R - Math.sqrt(R * R - r * r)) : 0
    }
    return { pre: prepararRebote({ n, pasoEsteM: paso, pasoNorteM: paso, altura }, 250, 250), n, medio, psi: Math.asin(a / R) }
  }
  test('T4: en un cráter esférico, un rebote da E₁ = ρ·E⊥·sin α·sin²ψ/4 (PBR pp. 194, 577), a −12 % con parches de 8 m', () => {
    const { pre, n, medio, psi } = crater(8)
    const { rebote, directa } = calcularRebote(
      pre,
      [{ direccion: direccionDesdeHorizonte(12, 90), irradiancia: 1, diametroGrados: 0.533, horizonteLejanoGrados: -90 }],
      0.15,
    )
    const exacto = (0.15 * Math.sin(12 * RAD) * Math.sin(psi) ** 2) / 4
    const fondo = medio * n + medio
    expect(directa[fondo]).toBe(0) // el fondo está en sombra con el Sol a 12°...
    expect(rebote[fondo]).toBeGreaterThan(exacto * 0.88) // ...pero recibe la luz de las paredes
    expect(rebote[fondo]).toBeLessThan(exacto * 1.05)
  })
  test('un suelo plano no se ilumina a sí mismo: rebote 0 (igual que el plano infinito exacto)', () => {
    const pre = prepararRebote({ n: 21, pasoEsteM: 8, pasoNorteM: 8, altura: () => 0 }, 120, 100)
    const { rebote } = calcularRebote(
      pre,
      [{ direccion: direccionDesdeHorizonte(30, 120), irradiancia: 1, diametroGrados: 0.533, horizonteLejanoGrados: -90 }],
      0.085,
    )
    expect(Math.max(...rebote)).toBe(0)
  })
  test('sitio real con α = 12°: el rebote es > 0 en algún vértice y ninguno supera ρ·E⊥', async () => {
    const { reboteEnVertices } = await import('../src/engine/reboteSitio')
    const r = reboteEnVertices(estado(tParaElevacionManana(D0, 12)))
    expect(Math.max(...r)).toBeGreaterThan(0)
    expect(Math.max(...r)).toBeLessThan(SUPERFICIE.albedo)
  })
})

describe('E12 / ENV-009: BRDF de Hapke del regolito (LSB pp. 559–560)', async () => {
  const { ALBEDO_NORMAL_SITIO, W_SITIO, albedoNormal, brdfHapke, hapkeR } = await import('../src/engine/hapke')
  test('w calibrado: albedo normal π·r(0,0,0) = 0,085 (rango de mar 7–10 %, LSB p. 59)', () => {
    expect(albedoNormal(W_SITIO)).toBeCloseTo(ALBEDO_NORMAL_SITIO, 9)
    expect(W_SITIO).toBeGreaterThan(0)
    expect(W_SITIO).toBeLessThan(1)
  })
  test('reciprocidad de Helmholtz f(l, v) = f(v, l) (RTR p. 312; PBR p. 197)', () => {
    const f = brdfHapke()
    const n: Vec3 = [0, 1, 0]
    const l: Vec3 = [Math.sin(50 * RAD), Math.cos(50 * RAD), 0]
    const v: Vec3 = [-Math.sin(20 * RAD) * Math.cos(40 * RAD), Math.cos(20 * RAD), Math.sin(20 * RAD) * Math.sin(40 * RAD)]
    expect(f(l, v, n)).toBeCloseTo(f(v, l, n), 12)
  })
  test('energía: ρ_dh ≤ 1 en todas las incidencias (Monte Carlo, PBR pp. 538–540)', () => {
    const f = brdfHapke()
    const azar = generador(9)
    for (const grados of [0, 30, 60, 78, 85]) {
      const r = reflectanciaDH(f, [Math.sin(grados * RAD), Math.cos(grados * RAD), 0], [0, 1, 0], 100_000, azar)
      expect(r.media).toBeLessThanOrEqual(1)
      expect(r.media).toBeGreaterThan(0.04)
    }
  })
  test('con el Sol a la espalda, las pendientes se ven igual de brillantes (LSB p. 559), a diferencia de Lambert', () => {
    const r0 = hapkeR(1, 1, 0, W_SITIO)
    const r60 = hapkeR(Math.cos(60 * RAD), Math.cos(60 * RAD), 0, W_SITIO)
    expect(Math.abs(r60 / r0 - 1)).toBeLessThan(0.05) // Lambert daría cos 60° = 0,5
  })
  test('efecto de oposición: más brillo a fase 0 que a 10° con la misma geometría (LSB p. 559)', () => {
    const mu = Math.cos(30 * RAD)
    expect(hapkeR(mu, mu, 0, W_SITIO) / hapkeR(mu, mu, 10 * RAD, W_SITIO)).toBeGreaterThan(1.3)
  })
})

describe('E13: la verificación en pantalla es coherente', async () => {
  const { comprobaciones, serieDelDia } = await import('../src/engine/verificacion')
  const tm = D0.mediodia
  test('todas las comprobaciones con tolerancia pasan en momentos clave (mañana, tránsito, tarde, noche)', () => {
    for (const t of [tParaElevacionManana(D0, 12), tm, tParaElevacionTarde(D0, 12), D0.inicio + D0.duracion * 0.75]) {
      for (const c of comprobaciones(estado(t))) {
        if (c.tolerancia !== null) expect(Math.abs(c.simulado - c.esperado)).toBeLessThanOrEqual(c.tolerancia)
      }
    }
  })
  test('la gráfica del día muestra la asimetría de Fielder: con α ≈ 12°, error negativo de mañana y positivo de tarde', () => {
    const s = serieDelDia(D0)
    const cerca = (t: number) => s.errorAlturaPorciento[Math.round((t - D0.inicio) / 3600)]
    expect(cerca(tParaElevacionManana(D0, 12))).toBeLessThan(0)
    expect(cerca(tParaElevacionTarde(D0, 12))).toBeGreaterThan(0)
  })
})

describe('E14: la Luna completa (marco selenográfico y datos LOLA)', async () => {
  const { aSelenografico, geometriaGlobal, vectorDePunto, ALBEDO_LOLA_SITIO, RADIO_LUNA_KM } = await import('../src/engine/lunaGlobal')
  const { DataUtils } = await import('three')
  const leer = async (n: string) => new Uint16Array(await Bun.file(new URL(`../src/data/${n}`, import.meta.url)).arrayBuffer())
  const muestra = (datos: Uint16Array, lat: number, lon: number) =>
    DataUtils.fromHalfFloat(datos[Math.round((90 - lat) * 4 - 0.5) * 1440 + Math.round(lon * 4 - 0.5)])
  test('conversión al marco selenográfico: normal del sitio · Sol = sin(elevación), en toda la tabla', () => {
    const U = vectorDePunto(SITIO.latitudGrados, SITIO.longitudEsteGrados)
    for (let t = 0; t <= DURACION_S; t += 6 * 3600) {
      const e = estado(t)
      const s = aSelenografico(e.direccionSol)
      expect(U[0] * s[0] + U[1] * s[1] + U[2] * s[2]).toBeCloseTo(Math.sin(e.elevacionSolGrados * RAD), 9)
    }
  })
  test('el punto subsolar gira hacia el oeste ~12,19°/día (rotación de 27,32 d menos el Sol aparente; FA pp. 257, 413)', () => {
    const a = geometriaGlobal(estado(0), estado(0).distanciaTierraAu).subsolar[1]
    const b = geometriaGlobal(estado(86400), estado(86400).distanciaTierraAu).subsolar[1]
    const deriva = ((a - b + 540) % 360) - 180
    expect(Math.abs(deriva - 12.17)).toBeLessThan(0.1)
  })
  test('LOLA LDEM_4 en el Apollo 17 ≈ −2,63 km (LROC: −2626 m) a la resolución de 7,6 km/píxel', async () => {
    const h = muestra(await leer('luna-ldem4.f16'), SITIO.latitudGrados, SITIO.longitudEsteGrados)
    expect(Math.abs(h - -2.626)).toBeLessThan(0.1)
    expect(RADIO_LUNA_KM).toBe(1737.4)
  })
  test('LOLA LDAM_4 en el Apollo 17 = 0,177, el valor que calibra el brillo visible del globo', async () => {
    const a = muestra(await leer('luna-ldam4.f16'), SITIO.latitudGrados, SITIO.longitudEsteGrados)
    expect(Math.abs(a - ALBEDO_LOLA_SITIO)).toBeLessThan(0.002)
  })
})

describe('E15.3: equipos del Apollo 17 en su posición real (LROC 2016)', async () => {
  const { EQUIPOS_APOLLO17, posicionLocal, DIMENSIONES_LRV, DIMENSIONES_LM } = await import('../src/engine/equipos')
  const { dentroDelTerreno } = await import('../src/engine/terreno')
  test('el LM está en el origen y todos los equipos caen dentro del recorte de 400 m', () => {
    const lm = EQUIPOS_APOLLO17.find((e) => e.id === 'LM')!
    expect(posicionLocal(lm)).toEqual([0, -0])
    for (const e of EQUIPOS_APOLLO17) expect(dentroDelTerreno(...posicionLocal(e))).toBe(true)
  })
  test('LRV a ~138 m del LM: 0,0046° E y 0,0015° S según la tabla de LROC', () => {
    const lrv = EQUIPOS_APOLLO17.find((e) => e.id === 'LRV')!
    const [x, z] = posicionLocal(lrv)
    expect(Math.hypot(x, z)).toBeCloseTo(138.6, 0)
  })
  test('medidas con fuente: LRV de LSB fig. 9.44 (p. 527) y etapa de descenso del LM de NSSDCA', () => {
    expect(DIMENSIONES_LRV.diametroRuedaM).toBeCloseTo(0.818, 3)
    expect(DIMENSIONES_LRV.largoM).toBeCloseTo(3.1, 2)
    expect(DIMENSIONES_LM.entrePatasM).toBe(9.4)
    expect(DIMENSIONES_LM.alturaBaseM + DIMENSIONES_LM.espesorM).toBeCloseTo(3.2, 6)
  })
})

describe('E15.1: albedo real del sitio (ortofoto LROC NAC normalizada)', async () => {
  const datos = new Uint16Array(await Bun.file(new URL('../src/data/albedo-apollo17.u16', import.meta.url)).arrayBuffer())
  const N = Math.round(Math.sqrt(datos.length))
  const valores = Array.from(datos, (v) => v / 10000)
  const media = valores.reduce((a, b) => a + b, 0) / valores.length
  const desvio = Math.sqrt(valores.reduce((a, b) => a + (b - media) ** 2, 0) / valores.length)
  test('media 0,085 (E8) y variaciones dentro de 0,03–0,25', () => {
    expect(media).toBeCloseTo(0.085, 3)
    expect(Math.min(...valores)).toBeGreaterThanOrEqual(0.03)
    expect(Math.max(...valores)).toBeLessThanOrEqual(0.25)
  })
  test('el módulo lunar aparece en el centro: la anomalía más fuerte a ±20 m está a < 6 m del centro y supera 5σ', () => {
    const ventana = (c0: number, f0: number) => {
      let s = 0
      for (let f = f0 - 2; f <= f0 + 2; f++) for (let c = c0 - 2; c <= c0 + 2; c++) s += valores[f * N + c]
      return s / 25
    }
    let peor = 0
    let donde: [number, number] = [0, 0]
    const centro = (N - 1) / 2
    const radio = Math.round((20 / 400) * N) // ±20 m
    for (let f = Math.floor(centro - radio); f <= Math.ceil(centro + radio); f++) {
      for (let c = Math.floor(centro - radio); c <= Math.ceil(centro + radio); c++) {
        const v = Math.abs(ventana(c, f) - media) / desvio
        if (v > peor) {
          peor = v
          donde = [c, f]
        }
      }
    }
    const metrosPorTexel = 400 / N
    expect(peor).toBeGreaterThan(5)
    expect(Math.hypot(donde[0] - centro, donde[1] - centro) * metrosPorTexel).toBeLessThan(6)
  })
})

describe('E16: valle de Taurus-Littrow en 3D (SLDEM2015)', async () => {
  const meta = (await import('../src/data/valle-apollo17.json')).default
  const alturas = new Int16Array(await Bun.file(new URL('../src/data/valle-apollo17-alturas.i16', import.meta.url)).arrayBuffer())
  const horizontes = new Uint8Array(await Bun.file(new URL('../src/data/valle-apollo17-horizontes.u8', import.meta.url)).arrayBuffer())
  const { elevacionHorizonte } = await import('../src/engine/horizonte')
  test('los macizos llegan a 2000–2600 m sobre el fondo del valle (LSB pp. 33–34: 2000–2300 m)', () => {
    let max = -Infinity
    for (const v of alturas) max = Math.max(max, v / 10)
    expect(max).toBeGreaterThan(2000)
    expect(max).toBeLessThan(2600)
  })
  test('el horizonte del vértice central coincide con el de E10 (cálculo independiente, 59 m frente a 125 m) a ±1,5°', () => {
    const centro = ((meta.muestras - 1) / 2) * meta.muestras + (meta.muestras - 1) / 2
    for (let a = 0; a < meta.azimuts; a++) {
      const h = (horizontes[centro * meta.azimuts + a] / 255) * 60 - 10
      expect(Math.abs(h - elevacionHorizonte((a * 360) / meta.azimuts))).toBeLessThan(1.5)
    }
  })
})

describe('E17: Hapke con parámetros medidos (LROC WAC, Sato et al. 2014)', async () => {
  const wac = (await import('../src/data/hapke-wac-apollo17.json')).default
  const { brdfHapkeWAC, hapkeRWAC, ALBEDO_NORMAL_WAC } = await import('../src/engine/hapke')
  test('convención de signo: c es menor en los mares que en las tierras altas (los mares retrodispersan menos, Sato et al.)', () => {
    const m = wac.bandas['566NM'].convencion as Record<string, { c: number }>
    const mares = ['Mare Serenitatis', 'Mare Tranquillitatis', 'Mare Imbrium'].map((k) => m[k].c)
    const altas = ['Tierras altas centrales', 'Tierras altas del sur', 'Cara oculta (tierras altas)'].map((k) => m[k].c)
    expect(Math.max(...mares)).toBeLessThan(Math.min(...altas))
  })
  test('reciprocidad y energía (ρ_dh ≤ 1 por Monte Carlo)', () => {
    const f = brdfHapkeWAC()
    const n: Vec3 = [0, 1, 0]
    const l: Vec3 = [Math.sin(50 * RAD), Math.cos(50 * RAD), 0]
    const v: Vec3 = [-Math.sin(20 * RAD), Math.cos(20 * RAD), 0]
    expect(f(l, v, n)).toBeCloseTo(f(v, l, n), 12)
    const azar = generador(21)
    for (const grados of [0, 60, 85]) {
      const r = reflectanciaDH(f, [Math.sin(grados * RAD), Math.cos(grados * RAD), 0], n, 100_000, azar)
      expect(r.media).toBeLessThanOrEqual(1)
    }
  })
  test('retrodispersión: más brillo a fase 0 que a 30° con la misma geometría (LSB p. 559)', () => {
    const mu = Math.cos(30 * RAD)
    expect(hapkeRWAC(mu, mu, 0) / hapkeRWAC(mu, mu, 30 * RAD)).toBeGreaterThan(1.5)
  })
  test('declarado: sin rugosidad, el albedo normal medido (~0,115) supera el 7–10 % de los mares del LSB', () => {
    expect(ALBEDO_NORMAL_WAC).toBeGreaterThan(0.1)
    expect(ALBEDO_NORMAL_WAC).toBeLessThan(0.13)
  })
})

describe('E18: tiempo continuo, varios días lunares seguidos (Horizons)', () => {
  const { tierra, sol } = datos
  const angulo = (a: Vec3, b: Vec3) => Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) / RAD
  const dirFila = (c: { azimutGrados: number[]; elevacionGrados: number[] }, i: number) => direccionDesdeHorizonte(c.elevacionGrados[i], c.azimutGrados[i])

  test('la tabla trae 6 días lunares; el primero empieza en la salida de E5 (2026-10-15 22:54:26 UTC)', () => {
    expect(CANTIDAD_DIAS).toBe(6)
    expect(datos.procedencia.diasLunares).toBe(6)
    expect(datos.limitesDiaUTC[0]).toBe('2026-10-15T22:54:26.125Z')
    expect(LIMITES_DIA_S[0]).toBe(0)
    expect(DURACION_S).toBe(LIMITES_DIA_S[CANTIDAD_DIAS])
  })
  test('cada salida es un cruce real: elevación del centro del Sol ≈ 0° y subiendo', () => {
    for (const t of LIMITES_DIA_S) {
      expect(Math.abs(estado(t).elevacionSolGrados)).toBeLessThan(0.01)
      expect(estado(Math.min(t + 3600, DURACION_S)).elevacionSolGrados).toBeGreaterThan(estado(Math.max(t - 3600, 0)).elevacionSolGrados)
    }
  })
  test('cada día dura 29,5 ± 0,3 d (mes sinódico medio de 29,530589 d, FA cap. 11.4, p. 257; 29,531 d, LSB p. 58)', () => {
    for (let k = 0; k < CANTIDAD_DIAS; k++) expect(Math.abs(dia(k).duracion / 86400 - 29.5)).toBeLessThan(0.3)
  })
  test('la Tierra no salta: ≤ 0,12°/h en toda la tabla, también en los límites entre días (libración, FA cap. 17.1, p. 413)', () => {
    // Cota: libración en longitud ~7,9° con el mes anomalístico (27,55 d) y en latitud 6,7° con el dracónico
    // (27,21 d): 2π(7,9/27,55 + 6,7/27,21)/24 ≈ 0,11°/h como máximo (FA cap. 11.4, p. 257; cap. 17.1, p. 413). Repetir
    // un día hacía saltar la Tierra 3,65° de golpe (E7).
    for (let i = 1; i < tierra.azimutGrados.length; i++) expect(angulo(dirFila(tierra, i - 1), dirFila(tierra, i))).toBeLessThan(0.12)
    for (const b of LIMITES_DIA_S.slice(1, -1)) {
      expect(angulo(estado(b - 1).direccionTierra, estado(b + 1).direccionTierra)).toBeLessThan(1e-3)
      expect(Math.abs(estado(b - 1).faseTierra - estado(b + 1).faseTierra)).toBeLessThan(1e-4)
    }
  })
  test('el Sol avanza sin saltos: ≤ 0,6°/h (rotación de ~12,2°/d, FA pp. 257, 413)', () => {
    for (let i = 1; i < sol.azimutGrados.length; i++) expect(angulo(dirFila(sol, i - 1), dirFila(sol, i))).toBeLessThan(0.6)
  })
  test('la Tierra al empezar cada día lunar está en otro lugar y con otra fase (FA cap. 11.4, p. 257; cap. 17.1, p. 413)', () => {
    // La libración sigue los meses anomalístico (27,554550 d) y dracónico (27,212220 d), no el sinódico: el mismo
    // momento del día solar encuentra a la Tierra en otro punto de su recorrido cada mes.
    const inicios = LIMITES_DIA_S.slice(0, -1).map((t) => estado(t))
    for (let a = 0; a < inicios.length; a++) {
      for (let b = a + 1; b < inicios.length; b++) {
        expect(angulo(inicios[a].direccionTierra, inicios[b].direccionTierra)).toBeGreaterThan(0.5)
        expect(Math.abs(inicios[a].faseTierra - inicios[b].faseTierra)).toBeGreaterThan(1e-3)
      }
    }
  })
  test('diaDe(t) devuelve el día correcto en los límites y al final de la tabla', () => {
    for (let k = 1; k < CANTIDAD_DIAS; k++) {
      expect(diaDe(LIMITES_DIA_S[k]).indice).toBe(k)
      expect(diaDe(LIMITES_DIA_S[k] - 1).indice).toBe(k - 1)
    }
    expect(diaDe(DURACION_S).indice).toBe(CANTIDAD_DIAS - 1)
    expect(diaDe(-10).indice).toBe(0)
  })
  test('en cada día: tránsito a 180°, salida y puesta locales dentro del día, y α = 12° de mañana y de tarde', () => {
    for (let k = 0; k < CANTIDAD_DIAS; k++) {
      const d = dia(k)
      expect(Math.abs(estado(d.mediodia).azimutSolGrados - 180)).toBeLessThan(1e-6)
      expect(d.salidaLocal).toBeGreaterThan(d.inicio)
      expect(d.salidaLocal).toBeLessThan(d.mediodia)
      expect(d.puestaLocal).toBeGreaterThan(d.mediodia)
      expect(d.puestaLocal).toBeLessThan(d.puesta)
      expect(estado(tParaElevacionManana(d, 12)).elevacionSolGrados).toBeCloseTo(12, 6)
      expect(estado(tParaElevacionTarde(d, 12)).elevacionSolGrados).toBeCloseTo(12, 6)
    }
  })
})

describe('E19: evaluación del punto de aterrizaje', async () => {
  const { apoyoLM, cieloEnPunto, huellaDentro, planoPorPies, resumenDia, tapadoPorRelieve } = await import('../src/engine/evaluacion')
  const { centrosPiesLM, DIMENSIONES_LM, RADIO_PIE_LM_M } = await import('../src/engine/equipos')
  const { iluminacion } = await import('../src/engine/environment')

  test('los pies del LM quedan con sus extremos a 9,4 m entre opuestos (NSSDCA)', () => {
    const p = centrosPiesLM(0, 0)
    for (const [a, b] of [[0, 2], [1, 3]]) {
      expect(Math.hypot(p[a][0] - p[b][0], p[a][1] - p[b][1]) + 2 * RADIO_PIE_LM_M).toBeCloseTo(DIMENSIONES_LM.entrePatasM, 9)
    }
  })
  test('plano por los pies: en un plano inclinado θ hacia un azimut dado devuelve θ, ese azimut y alabeo 0 (solución exacta)', () => {
    const pies = centrosPiesLM(0, 0, 0.3)
    for (const [theta, az] of [[3, 0], [7.5, 90], [12, 225], [0.5, 333]]) {
      // Baja hacia az: la altura decrece a lo largo de (sin az, −cos az) en (x, z).
      const [bx, bz] = [Math.sin(az * RAD), -Math.cos(az * RAD)]
      const h = pies.map(([x, z]) => -Math.tan(theta * RAD) * (x * bx + z * bz)) as [number, number, number, number]
      const r = planoPorPies(pies, h)
      expect(r.inclinacionGrados).toBeCloseTo(theta, 9)
      expect(Math.abs(((r.bajaHaciaGrados - az + 540) % 360) - 180)).toBeLessThan(1e-6)
      expect(r.alabeoM).toBeLessThan(1e-12)
    }
    expect(planoPorPies(pies, [0.2, 0, 0.2, 0]).alabeoM).toBeCloseTo(0.4, 12)
  })
  test('en el sitio del LM el apoyo es medible y coherente con la pendiente local del DTM (4,5°, E6)', () => {
    expect(huellaDentro(0, 0)).toBe(true)
    expect(huellaDentro(198, 0)).toBe(false)
    const a = apoyoLM(0, 0)
    expect(a.pendienteCentroGrados).toBeGreaterThan(2)
    expect(a.pendienteCentroGrados).toBeLessThan(7)
    expect(a.inclinacionGrados).toBeLessThan(15)
    expect(a.desnivelM).toBeGreaterThanOrEqual(a.alabeoM / 2)
  })
  test('el relieve cercano no tapa el cielo alto, pero sí el Sol bajo desde el punto más hondo del DTM (−20 m, borde norte)', () => {
    expect(tapadoPorRelieve(0, 0, [0, 1, 0])).toBe(false)
    expect(tapadoPorRelieve(0, 0, direccionDesdeHorizonte(1, 90))).toBe(false)
    // Desde (136, −180) el terreno sube hacia el sur: a 5° el rayo choca con el relieve, a 60° no.
    expect(tapadoPorRelieve(136, -180, direccionDesdeHorizonte(5, 180))).toBe(true)
    expect(tapadoPorRelieve(136, -180, direccionDesdeHorizonte(60, 180))).toBe(false)
  })
  test('en el Apollo 17 la Tierra está visible todo el día lunar (45–61° de elevación frente a ≤ 14,2° de horizonte, E5 y E10)', () => {
    expect(resumenDia(D0, 0, 0).fraccionTierra).toBe(1)
  })
  test('las horas de Sol en el LM coinciden con la salida y la puesta locales (E10) a ±1 h, y el Sol visible concuerda con iluminacion()', () => {
    const r = resumenDia(D0, 0, 0)
    expect(Math.abs(r.horasSol - (D0.puestaLocal - D0.salidaLocal) / 3600)).toBeLessThan(1)
    for (const t of [D0.salidaLocal + 3600, D0.mediodia, D0.puestaLocal - 3600, D0.puestaLocal + 3600]) {
      const e = estado(t)
      expect(cieloEnPunto(e, 0, 0).solVisible).toBe(iluminacion(e).solVisible > 0.5)
    }
  })
})

describe('E23: el planificador reproduce el motor de la escena', () => {
  test('día lunar 1 en el centro: Sol y Tierra visibles a ±0,5 puntos del resumen del motor (suelo, 1,7 m y 10 m)', async () => {
    const { planificadorFrenteAMotor } = await import('./comparar-planificador')
    for (const H of [0, 1.7, 10]) {
      const r = await planificadorFrenteAMotor(H)
      expect(Math.abs(r.plan.sol - r.motor.sol)).toBeLessThan(0.005)
      expect(Math.abs(r.plan.tierra - r.motor.tierra)).toBeLessThan(0.005)
    }
  }, 60_000)
})

describe('E26.3: estado global de la escena frente al estado por sitio (Apollo 17)', () => {
  test('en todas las horas de la tabla del sitio, el Sol y la Tierra del estado global quedan a ≤ 0,01° (E22) y la fase a ≤ 0,1 %', async () => {
    const meta = (await import('../src/data/efemerides-luna.json')).default
    const { crearTablaLuna, prepararSitio } = await import('../src/engine/efemeridesLuna')
    const { estadoGlobal } = await import('../src/engine/simulacion')
    const { estado } = await import('../src/engine/simulation')
    const tabla = crearTablaLuna(await Bun.file(new URL('../src/data/efemerides-luna.f32', import.meta.url)).arrayBuffer(), meta)
    const punto = { sitio: prepararSitio(SITIO.latitudGrados, SITIO.longitudEsteGrados), perfil: { pasoAzimutGrados: 0.5, elevacionGrados: new Float32Array(720), alturaM: 0, fuente: '' } }
    const ang = (a: number[], b: number[]) => (Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180) / Math.PI
    for (let t = 0; t < DURACION_S; t += 6 * 3600) {
      const e = estado(t)
      const g = estadoGlobal(tabla, punto, Date.parse(e.fechaUTC))
      expect(ang(e.direccionSol, g.direccionSol)).toBeLessThan(0.01)
      expect(ang(e.direccionTierra, g.direccionTierra)).toBeLessThan(0.01)
      expect(Math.abs(e.faseTierra - g.faseTierra)).toBeLessThan(0.001)
    }
  })
})
