// Integración de Monte Carlo para VERIFICAR el render con números (no se usa para dibujar).
// Base: Pharr y Humphreys, *Physically Based Rendering*, borrador de 2003 (PBR):
// estimador F_N = (1/N)·Σ f(X)/p(X) con error ∝ N^(−1/2) (cap. 14.2, pp. 501–503); muestreo coseno del
// hemisferio, pdf = cos θ/π (cap. 14.7.3, pp. 516–517); muestreo uniforme de un cono,
// pdf = 1/(2π(1 − cos θmax)) (cap. 15.4.2, p. 545). Funciones puras: misma semilla, mismo resultado.
import type { Vec3 } from './environment'

/** Generador xorshift32 con semilla: reproducible en cada corrida de las pruebas. */
export function generador(semilla: number): () => number {
  let x = semilla >>> 0 || 1
  return () => {
    x ^= x << 13
    x >>>= 0
    x ^= x >>> 17
    x ^= x << 5
    x >>>= 0
    return x / 4294967296
  }
}

/** Base ortonormal (t, b, n) a partir de una normal unitaria n. */
function base(n: Vec3): [Vec3, Vec3] {
  const a: Vec3 = Math.abs(n[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0]
  const t: Vec3 = [a[1] * n[2] - a[2] * n[1], a[2] * n[0] - a[0] * n[2], a[0] * n[1] - a[1] * n[0]]
  const lt = Math.hypot(t[0], t[1], t[2])
  t[0] /= lt
  t[1] /= lt
  t[2] /= lt
  const b: Vec3 = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]]
  return [t, b]
}

/** Dirección del hemisferio alrededor de n con densidad cos θ/π (PBR pp. 516–517, método de Malley). */
export function muestraCoseno(n: Vec3, u1: number, u2: number): Vec3 {
  const r = Math.sqrt(u1)
  const fi = 2 * Math.PI * u2
  const x = r * Math.cos(fi)
  const y = r * Math.sin(fi)
  const z = Math.sqrt(Math.max(0, 1 - u1))
  const [t, b] = base(n)
  return [t[0] * x + b[0] * y + n[0] * z, t[1] * x + b[1] * y + n[1] * z, t[2] * x + b[2] * y + n[2] * z]
}

/** Dirección uniforme dentro de un cono de semiángulo θmax alrededor de eje (PBR p. 545). */
export function muestraCono(eje: Vec3, cosMax: number, u1: number, u2: number): Vec3 {
  const cosT = 1 - u1 * (1 - cosMax)
  const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT))
  const fi = 2 * Math.PI * u2
  const [t, b] = base(eje)
  const x = sinT * Math.cos(fi)
  const y = sinT * Math.sin(fi)
  return [t[0] * x + b[0] * y + eje[0] * cosT, t[1] * x + b[1] * y + eje[1] * cosT, t[2] * x + b[2] * y + eje[2] * cosT]
}

/** Media y error estándar de una serie de muestras (PBR p. 502). */
export function mediaConError(muestras: ArrayLike<number>): { media: number; error: number } {
  const n = muestras.length
  let s = 0
  let s2 = 0
  for (let i = 0; i < n; i++) {
    s += muestras[i]
    s2 += muestras[i] * muestras[i]
  }
  const media = s / n
  const varianza = Math.max(0, s2 / n - media * media)
  return { media, error: Math.sqrt(varianza / n) }
}

/**
 * Irradiancia sobre una cara con normal n, por encima de un plano horizontal infinito de radiancia uniforme
 * Lsuelo (cielo negro, ENV-001). Estimador E = (π/N)·Σ L(ω) con muestreo coseno (PBR p. 601).
 * Valor exacto: π·Lsuelo·(1 − n·ŷ)/2 (ángulo sólido proyectado, PBR pp. 191–193).
 */
export function irradianciaDesdeSuelo(n: Vec3, radianciaSuelo: number, muestras: number, azar: () => number) {
  const valores = new Float64Array(muestras)
  for (let i = 0; i < muestras; i++) {
    const w = muestraCoseno(n, azar(), azar())
    valores[i] = w[1] < 0 ? Math.PI * radianciaSuelo : 0
  }
  return mediaConError(valores)
}

/**
 * Prueba del horno (furnace test, PBR p. 575): dentro de una esfera cerrada de emisión Le y reflectancia
 * lambertiana ρ, la radiancia es Le/(1 − ρ) en todo punto. Camino aleatorio con ruleta rusa (PBR pp. 583, 589):
 * en cada rebote se suma Le y se sigue con probabilidad ρ (el peso ρ/ρ = 1). Los rayos se intersecan de verdad
 * con la esfera, así se prueban el muestreo y la geometría juntos.
 */
export function hornoEsfera(rho: number, emision: number, caminos: number, azar: () => number) {
  const valores = new Float64Array(caminos)
  for (let c = 0; c < caminos; c++) {
    // Punto inicial en el polo sur de la esfera unidad, mirando hacia adentro.
    let p: Vec3 = [0, -1, 0]
    let suma = 0
    for (let rebote = 0; rebote < 10_000; rebote++) {
      suma += emision
      if (azar() >= rho) break
      const n: Vec3 = [-p[0], -p[1], -p[2]]
      const w = muestraCoseno(n, azar(), azar())
      // Intersección del rayo p + s·w con |x| = 1 (la otra raíz es s = 0).
      const s = -2 * (p[0] * w[0] + p[1] * w[1] + p[2] * w[2])
      p = [p[0] + s * w[0], p[1] + s * w[1], p[2] + s * w[2]]
      const largo = Math.hypot(p[0], p[1], p[2])
      p = [p[0] / largo, p[1] / largo, p[2] / largo]
    }
    valores[c] = suma
  }
  return mediaConError(valores)
}

/** BRDF lambertiana: f = ρ/π (PBR cap. 9.3, p. 351). */
export function brdfLambert(albedo: number): (entrada: Vec3, salida: Vec3, n: Vec3) => number {
  return () => albedo / Math.PI
}

/**
 * Reflectancia direccional-hemisférica ρ_dh(ω_i) = ∫ f(ω_i, ω_o)·cos θ_o dω_o, con muestreo coseno:
 * estimador π·f (PBR cap. 9.1.1, pp. 335–336, y cap. 15.3.4, pp. 538–540; ojo: el borrador pone un 1/π de
 * más en la definición de las pp. 335 y 538, que su propio código no usa, p. 539). Debe ser ≤ 1 (energía, PBR p. 197).
 */
export function reflectanciaDH(
  f: (entrada: Vec3, salida: Vec3, n: Vec3) => number,
  entrada: Vec3,
  n: Vec3,
  muestras: number,
  azar: () => number,
) {
  const valores = new Float64Array(muestras)
  for (let i = 0; i < muestras; i++) {
    const salida = muestraCoseno(n, azar(), azar())
    valores[i] = Math.PI * f(entrada, salida, n)
  }
  return mediaConError(valores)
}

/**
 * Flujo que una esfera lambertiana iluminada en dirección s devuelve hacia un observador en dirección v, relativo a
 * fase 0: ∫ max(0, n·s)·max(0, n·v) dΩ_n sobre normales uniformes de la esfera (PBR pp. 193, 554).
 * Sirve para verificar la fórmula cerrada Φ(g) = [sin g + (π − g) cos g]/π (prueba T8).
 */
export function faseEsferaMC(faseRad: number, muestras: number, azar: () => number) {
  const s: Vec3 = [0, 0, 1]
  const v: Vec3 = [Math.sin(faseRad), 0, Math.cos(faseRad)]
  const valores = new Float64Array(muestras)
  for (let i = 0; i < muestras; i++) {
    const z = 1 - 2 * azar()
    const r = Math.sqrt(Math.max(0, 1 - z * z))
    const fi = 2 * Math.PI * azar()
    const n: Vec3 = [r * Math.cos(fi), r * Math.sin(fi), z]
    const ns = n[0] * s[0] + n[1] * s[1] + n[2] * s[2]
    const nv = n[0] * v[0] + n[1] * v[1] + n[2] * v[2]
    // Con fase 0 la integral vale 2π/3 sobre 4π: el promedio es 1/6. Se normaliza para que Φ(0) = 1.
    valores[i] = 6 * Math.max(0, ns) * Math.max(0, nv)
  }
  return mediaConError(valores)
}
