// E26.1: descenso del LM con el guiado polinómico del Apollo (R-695) frente al perfil premisión del Apollo 11 (NASA
// TN D-6846, tabla I y II), que es una fuente independiente: el motor solo toma de TN el estado inicial, la puerta alta como
// término de P63, el término de P64 y la duración de P64; los demás eventos, el ΔV y el combustible son resultados.
// Tolerancias acordadas con Estephano (2026-11-07): tiempos ±15 s, alturas y velocidades ±10 %, ΔV ±3 %.
import { describe, expect, test } from 'bun:test'
import luz from '../src/data/luz-apollo11.json'
import { PARAMETROS_APOLLO11, PERFIL_APOLLO11 as P, luzDelDescenso, rumboApollo, simularDescenso } from '../src/engine/descenso'

const r = simularDescenso()
const en = (t: number) => r.muestras.reduce((a, b) => (Math.abs(b.tS - t) < Math.abs(a.tS - t) ? b : a))
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

describe('E26.1: descenso del LM frente al Apollo 11 (TN D-6846)', () => {
  test('llega al contacto sin agotar el combustible, en P66, a 12 pies y −3 pies/s', () => {
    expect(r.sinCombustible).toBe(false)
    const ultima = r.muestras[r.muestras.length - 1]
    expect(ultima.fase).toBe('P66')
    expect(Math.abs(ultima.vVerticalMs - P.contacto.vVerticalMs)).toBeLessThan(0.3)
    expect(Math.abs(ultima.vHorizontalMs)).toBeLessThan(0.5)
  })
  test('el alcance de encendido calibrado deja la puerta alta a las 8:26 (±2 s) y queda a ±5 % de las ~260 millas náuticas de TN', () => {
    expect(Math.abs(r.eventos.puertaAlta - P.puertaAlta.tS)).toBeLessThan(2)
    expect(rel(PARAMETROS_APOLLO11.alcanceInicialM, P.alcanceInicialM)).toBeLessThan(0.05)
  })
  test('puerta baja (512 pies) y contacto a ±15 s de TN (10:06 y 11:54)', () => {
    expect(Math.abs(r.eventos.puertaBaja - P.puertaBaja.tS)).toBeLessThan(15)
    expect(Math.abs(r.eventos.contacto - P.contacto.tS)).toBeLessThan(15)
  })
  test('ΔV a ±3 % (6775 pies/s) y combustible a ±3 % (16 960,9 lb, tabla II)', () => {
    expect(rel(r.deltaVMs, P.deltaVMs)).toBeLessThan(0.03)
    expect(rel(r.combustibleUsadoKg, P.combustibleNominalKg)).toBeLessThan(0.03)
  })
  test('estados intermedios del frenado (2:56 y 4:18) y la puerta alta a ±10 % en altura y velocidad', () => {
    for (const ref of [P.rotacion, P.actualizacionAltura, P.puertaAlta]) {
      const s = en(ref.tS)
      expect(rel(s.alturaM, ref.alturaM)).toBeLessThan(0.1)
      expect(rel(Math.hypot(s.vVerticalMs, s.vHorizontalMs), ref.velocidadMs)).toBeLessThan(0.1)
    }
    expect(rel(en(P.puertaAlta.tS).vVerticalMs, P.puertaAlta.vVerticalMs)).toBeLessThan(0.1)
  })
  test('diferencia conocida (Abiertas): la recuperación del regulador llega +24 s tarde (TN 6:24); queda a ≤ 30 s', () => {
    // No cumple los ±15 s: depende del empuje final y la inclinación de P63 que R-695 elige por búsqueda (pp. 51–56).
    expect(Math.abs(r.eventos.recuperacionRegulador - P.recuperacionRegulador.tS)).toBeLessThan(30)
  })
  test('el empuje respeta el regulador: 10 % los primeros 26 s, después 92,5 % fijo o entre 11 % y 65 % (R-695 p. 8; TN tabla I)', () => {
    for (const s of r.muestras) {
      if (s.tS < 25) expect(s.empuje).toBeCloseTo(0.1, 6)
      else if (s.tS > 27) expect(Math.abs(s.empuje - 0.925) < 1e-9 || (s.empuje >= 0.11 - 1e-9 && s.empuje <= 0.65 + 1e-9)).toBe(true)
    }
  })
  test('luz del Apollo 11: Sol a 10,7° al este (Horizons), dentro de 10,9° ± 1° (TN p. 10); con la regla del Apollo la línea de vista queda por encima del Sol', () => {
    expect(Math.abs(luz.sol.elevacionGrados - 10.9)).toBeLessThan(1)
    const rumbo = rumboApollo(luz.sol.azimutGrados)
    // El Apollo 11 voló hacia el oeste (de este a oeste sobre Mare Tranquillitatis).
    expect(Math.abs(rumbo - 270)).toBeLessThan(5)
    const l = luzDelDescenso(r, luz.sol.elevacionGrados, luz.sol.azimutGrados, rumbo)
    expect(l.solRespectoEspaldaGrados).toBeLessThan(1e-6)
    expect(l.margenSobreSolGrados).toBeGreaterThan(0)
  })
})
