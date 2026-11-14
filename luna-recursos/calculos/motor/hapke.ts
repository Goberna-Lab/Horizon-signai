// ENV-009 (E12): reflectancia bidireccional de Hapke para el regolito. La Luna "is decidedly non-Lambertian": es
// retrorreflectiva, con efecto de oposición (LSB cap. 9.3.1, p. 559; RTR pp. 314, 330, 350; PBR p. 331).
//
// Hapke (1981, ec. 16), tal como la da el LSB (p. 559):
//   r(i, e, g) = (w/4π)·µ0/(µ0 + µ)·{[1 + B(g)]·P(g) + H(µ0)·H(µ) − 1}
//   H(x) = (1 + 2x)/(1 + 2x·√(1 − w))
//   B(g) = B0·{1 − tan|g|·[3 − e^(−h/tan|g|)]·[1 − e^(−h/tan|g|)]/(2h)}  para |g| ≤ π/2, y 0 más allá
//   B0 ≈ e^(−w²/2);  h ≈ 0,4 para suelos lunares.
// µ0 = cos i, µ = cos e, g = ángulo de fase, w = albedo de dispersión simple de una partícula.
// BRDF = r/µ0 (r es radiancia sobre la irradiancia perpendicular del haz; para Lambert, r = A·µ0/π).
// Albedo normal = π·r(0, 0, 0): reflectancia vista de frente a fase 0 relativa a una placa blanca ideal (LSB p. 560).
// Supuestos: P(g) = 1 (partículas isótropas; el LSB no da P); sin la corrección por rugosidad macroscópica de
// Hapke (1984), que el libro menciona pero no reproduce (p. 560).
import type { Vec3 } from './environment'
import wacApollo17 from '../data/hapke-wac-apollo17.json'
import { SITIO_ACTIVO } from './sitio'

// E20: el mapa de Hapke de LROC WAC (E17) solo se descargó para el Apollo 17; en sitios sin él se mantiene el del
// Apollo 17 como referencia de comparación y la interfaz oculta el selector (SITIO_ACTIVO.tieneHapkeWac).
const wac = wacApollo17
export const HAY_HAPKE_WAC = SITIO_ACTIVO.tieneHapkeWac

/** h ≈ 0,4 para suelos lunares (LSB p. 559). */
export const HAPKE_H = 0.4
/** Función de fase de la partícula: isótropa (supuesto). */
export const HAPKE_P = 1

/**
 * Albedo normal objetivo del sitio: mares ~7–10 % (LSB A3.2, p. 59; Apollo 11, mar, 7 % a fase 0, p. 559). Se usa 0,085,
 * el mismo valor que la reflectancia lambertiana de E8, para que el regolito tenga un solo número de partida.
 */
export const ALBEDO_NORMAL_SITIO = 0.085

/** H de Chandrasekhar aproximada (LSB p. 559). */
export function hapkeH(x: number, w: number): number {
  return (1 + 2 * x) / (1 + 2 * x * Math.sqrt(1 - w))
}

/** Función de retrodispersión del efecto de oposición (LSB p. 559). */
export function hapkeB(g: number, w: number, h: number = HAPKE_H): number {
  const b0 = Math.exp((-w * w) / 2)
  const ag = Math.abs(g)
  if (ag > Math.PI / 2) return 0
  const t = Math.tan(ag)
  if (t < 1e-9) return b0
  const e = Math.exp(-h / t)
  return b0 * (1 - (t * (3 - e) * (1 - e)) / (2 * h))
}

/** Reflectancia bidireccional r(µ0, µ, g) de Hapke (LSB p. 559, ec. 16 de Hapke 1981). */
export function hapkeR(mu0: number, mu: number, g: number, w: number): number {
  if (mu0 <= 0 || mu <= 0) return 0
  return (w / (4 * Math.PI)) * (mu0 / (mu0 + mu)) * ((1 + hapkeB(g, w)) * HAPKE_P + hapkeH(mu0, w) * hapkeH(mu, w) - 1)
}

/** Albedo normal π·r(1, 1, 0) para un w dado (LSB p. 560). */
export function albedoNormal(w: number): number {
  return Math.PI * hapkeR(1, 1, 0, w)
}

/** w tal que el albedo normal sea el objetivo (bisección; el albedo normal crece con w). */
export function calibrarW(objetivo: number): number {
  let bajo = 0
  let alto = 0.999999
  for (let i = 0; i < 100; i++) {
    const medio = (bajo + alto) / 2
    if (albedoNormal(medio) < objetivo) bajo = medio
    else alto = medio
  }
  return (bajo + alto) / 2
}

/** w del regolito del sitio, calibrado con ALBEDO_NORMAL_SITIO. */
export const W_SITIO = calibrarW(ALBEDO_NORMAL_SITIO)

const punto = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** BRDF de Hapke f = r/µ0 entre la dirección hacia la luz y la dirección hacia el observador. */
export function brdfHapke(w: number = W_SITIO): (haciaLuz: Vec3, haciaObservador: Vec3, n: Vec3) => number {
  return (l, v, n) => {
    const mu0 = punto(n, l)
    const mu = punto(n, v)
    if (mu0 <= 0 || mu <= 0) return 0
    const g = Math.acos(Math.max(-1, Math.min(1, punto(l, v))))
    return hapkeR(mu0, mu, g, w) / mu0
  }
}

// ---------------------------------------------------------------------------------------------------------------
// E17: Hapke con parámetros MEDIDOS por LROC WAC (Sato et al. 2014), a 566 nm, en la celda de 1° del sitio.
// Ecuaciones (Schröder et al. 2017, arXiv:1701.08550, ecs. 13–16, "Hapke 1981, 1984, 1986"):
//   r = (w/4π)·µ0/(µ0 + µ)·[B_SH(g)·P(g) + H(µ0)H(µ) − 1]·f(θ̄)
//   H(x) = (1 + 2x)/(1 + 2x·√(1 − w))   (la misma del LSB, p. 559)
//   B_SH(g) = 1 + Bs0/(1 + tan(g/2)/hs)
//   P(g) = (1 + c)/2·(1 − b²)/(1 − 2b cos g + b²)^(3/2) + (1 − c)/2·(1 − b²)/(1 + 2b cos g + b²)^(3/2)
// Convención de signo de c: en este mapa c vale 0,03–0,15 en los mares y 0,35–0,45 en las tierras altas, y Sato et al.
// informan que los mares retrodispersan MENOS que las tierras altas; por lo tanto aquí c > 0 = retrodispersión (el
// primer término usa −2b cos g). Es la convención opuesta a la ec. 16 de Schröder (allí c < 0 es hacia atrás).
// Simplificaciones declaradas:
//   - SIN la corrección por rugosidad macroscópica f(θ̄) (Sato la incluye con θ̄ = 23,657°): ninguna de nuestras
//     fuentes trae sus ecuaciones (Schröder dice "we do not reproduce it here"; LSB p. 560 tampoco). Pendiente: Hapke
//     (1984) o el libro de Hapke (2012).
//   - Sin la oposición coherente (Bc0 = 0 en el mapa).
//   - La celda de 1° (~30 km) mezcla el fondo del valle con los macizos claros.
export type ParametrosWAC = { w: number; b: number; c: number; Bs0: number; hs: number }
export const PARAMETROS_WAC: ParametrosWAC = wac.bandas['566NM'].sitio

export function hapkeRWAC(mu0: number, mu: number, g: number, p: ParametrosWAC = PARAMETROS_WAC): number {
  if (mu0 <= 0 || mu <= 0) return 0
  const raiz = Math.sqrt(1 - p.w)
  const H = (x: number) => (1 + 2 * x) / (1 + 2 * x * raiz)
  const BSH = 1 + p.Bs0 / (1 + Math.tan(g / 2) / p.hs)
  const cg = Math.cos(g)
  const b2 = p.b * p.b
  const P = ((1 + p.c) / 2) * ((1 - b2) / Math.pow(1 - 2 * p.b * cg + b2, 1.5)) + ((1 - p.c) / 2) * ((1 - b2) / Math.pow(1 + 2 * p.b * cg + b2, 1.5))
  return (p.w / (4 * Math.PI)) * (mu0 / (mu0 + mu)) * (BSH * P + H(mu0) * H(mu) - 1)
}

/** Albedo normal π·r(0,0,0) del modelo medido (LSB p. 560): ~0,11, por encima del 7–10 % de los mares del LSB (p. 59). */
export const ALBEDO_NORMAL_WAC = Math.PI * hapkeRWAC(1, 1, 0)

export function brdfHapkeWAC(p: ParametrosWAC = PARAMETROS_WAC): (haciaLuz: Vec3, haciaObservador: Vec3, n: Vec3) => number {
  return (l, v, n) => {
    const mu0 = l[0] * n[0] + l[1] * n[1] + l[2] * n[2]
    const mu = v[0] * n[0] + v[1] * n[1] + v[2] * n[2]
    if (mu0 <= 0 || mu <= 0) return 0
    const g = Math.acos(Math.max(-1, Math.min(1, l[0] * v[0] + l[1] * v[1] + l[2] * v[2])))
    return hapkeRWAC(mu0, mu, g, p) / mu0
  }
}
