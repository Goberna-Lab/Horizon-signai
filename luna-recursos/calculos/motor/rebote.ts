// ENV-009 (E11): luz que el relieve se devuelve a sí mismo, con UN rebote, calculada sobre el terreno real.
// Antes era un hemisferio con un suelo plano infinito: exacto en suelo plano, pero el fondo de un cráter en sombra
// recibía 0 cuando sus paredes iluminadas lo alumbran (LSB p. 30; RTR p. 392; PBR pp. 575–580; auditoría C3).
//
// Método (radiosidad de un rebote, RTR cap. 11.2.1, pp. 442–443; forma de tres puntos, PBR cap. 16.2.3, p. 577):
//   E_rebote(i) = Σ_j ρ·E_directa(j)·F_ij,   F_ij = cos θ_i · cos θ_j · A_j / (π r²)
// sobre parches de la malla; j solo cuenta si las dos caras se miran (cos θ_i > 0 y cos θ_j > 0) y está a menos de
// RADIO_M. La luz directa de cada parche incluye su sombra por el propio relieve (horizonte por parche en 16 azimuts,
// RTR pp. 465–466) y por los macizos (E10).
// Simplificaciones (declaradas): un solo rebote (con ρ ≈ 0,085 el segundo aporta < 10 % del primero); sin oclusión
// entre parches (se usa solo la prueba de caras que se miran); factor de forma punto–área (error grande solo entre
// vecinos inmediatos); sin aporte del terreno fuera del recorte. Funciones puras, sin React ni three.
import type { Vec3 } from './environment'

/** Malla de alturas regular: n × n muestras, filas de norte a sur (+Z) y columnas de oeste a este (+X). */
export type MallaAlturas = {
  n: number
  pasoEsteM: number
  pasoNorteM: number
  /** Altura de la muestra (fila, columna). */
  altura: (fila: number, columna: number) => number
}

export type PreparacionRebote = {
  malla: MallaAlturas
  /** Posición (x, y, z) y normal unitaria de cada parche (= cada muestra de la malla). */
  posiciones: Float64Array
  normales: Float64Array
  /** Horizonte local por parche: N_AZIMUTS elevaciones (grados) por parche. */
  horizontes: Float32Array
  /** Factores de forma dispersos: para cada parche i, vecinos[inicio[i]..inicio[i+1]) y su F_ij. */
  inicio: Int32Array
  vecinos: Int32Array
  factores: Float32Array
}

export const N_AZIMUTS = 16
const RAD = Math.PI / 180

/** Prepara la malla para calcular el rebote: normales, horizontes por parche y factores de forma con vecinos. */
export function prepararRebote(malla: MallaAlturas, radioM: number, alcanceHorizonteM: number): PreparacionRebote {
  const { n, pasoEsteM: dx, pasoNorteM: dz, altura } = malla
  const medio = (n - 1) / 2
  const total = n * n
  const posiciones = new Float64Array(3 * total)
  const normales = new Float64Array(3 * total)
  const areas = new Float64Array(total)
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) {
      const k = f * n + c
      posiciones[3 * k] = (c - medio) * dx
      posiciones[3 * k + 1] = altura(f, c)
      posiciones[3 * k + 2] = (f - medio) * dz
      // Gradiente por diferencias (centradas adentro, laterales en el borde).
      const c0 = Math.max(c - 1, 0)
      const c1 = Math.min(c + 1, n - 1)
      const f0 = Math.max(f - 1, 0)
      const f1 = Math.min(f + 1, n - 1)
      const gx = (altura(f, c1) - altura(f, c0)) / ((c1 - c0) * dx)
      const gz = (altura(f1, c) - altura(f0, c)) / ((f1 - f0) * dz)
      const largo = Math.hypot(gx, 1, gz)
      normales[3 * k] = -gx / largo
      normales[3 * k + 1] = 1 / largo
      normales[3 * k + 2] = -gz / largo
      // Área real del parche: su proyección horizontal dividida por cos(pendiente).
      areas[k] = dx * dz * largo
    }
  }

  // Horizonte local de cada parche por marcha de rayos sobre la malla (interpolación bilineal).
  const alturaEn = (x: number, z: number) => {
    const cc = Math.min(Math.max(x / dx + medio, 0), n - 1)
    const ff = Math.min(Math.max(z / dz + medio, 0), n - 1)
    const c0 = Math.min(Math.floor(cc), n - 2)
    const f0 = Math.min(Math.floor(ff), n - 2)
    const tc = cc - c0
    const tf = ff - f0
    return (
      (altura(f0, c0) * (1 - tc) + altura(f0, c0 + 1) * tc) * (1 - tf) +
      (altura(f0 + 1, c0) * (1 - tc) + altura(f0 + 1, c0 + 1) * tc) * tf
    )
  }
  const limiteX = medio * dx
  const limiteZ = medio * dz
  const pasoRayo = Math.min(dx, dz) / 2
  const horizontes = new Float32Array(total * N_AZIMUTS)
  for (let k = 0; k < total; k++) {
    const x0 = posiciones[3 * k]
    const y0 = posiciones[3 * k + 1]
    const z0 = posiciones[3 * k + 2]
    for (let a = 0; a < N_AZIMUTS; a++) {
      const az = (a * 360) / N_AZIMUTS
      const este = Math.sin(az * RAD)
      const norte = Math.cos(az * RAD)
      let mejor = -90
      for (let d = pasoRayo; d <= alcanceHorizonteM; d += pasoRayo) {
        const x = x0 + este * d
        const z = z0 - norte * d
        if (Math.abs(x) > limiteX || Math.abs(z) > limiteZ) break
        const e = Math.atan2(alturaEn(x, z) - y0, d) / RAD
        if (e > mejor) mejor = e
      }
      horizontes[k * N_AZIMUTS + a] = mejor
    }
  }

  // Factores de forma con vecinos dentro de radioM.
  const rc = Math.ceil(radioM / dx)
  const rf = Math.ceil(radioM / dz)
  const inicio = new Int32Array(total + 1)
  const vecinos: number[] = []
  const factores: number[] = []
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) {
      const i = f * n + c
      inicio[i] = vecinos.length
      for (let f2 = Math.max(0, f - rf); f2 <= Math.min(n - 1, f + rf); f2++) {
        for (let c2 = Math.max(0, c - rc); c2 <= Math.min(n - 1, c + rc); c2++) {
          const j = f2 * n + c2
          if (j === i) continue
          const vx = posiciones[3 * j] - posiciones[3 * i]
          const vy = posiciones[3 * j + 1] - posiciones[3 * i + 1]
          const vz = posiciones[3 * j + 2] - posiciones[3 * i + 2]
          const r2 = vx * vx + vy * vy + vz * vz
          if (r2 > radioM * radioM) continue
          const r = Math.sqrt(r2)
          const cosI = (normales[3 * i] * vx + normales[3 * i + 1] * vy + normales[3 * i + 2] * vz) / r
          const cosJ = -(normales[3 * j] * vx + normales[3 * j + 1] * vy + normales[3 * j + 2] * vz) / r
          if (cosI <= 0 || cosJ <= 0) continue
          vecinos.push(j)
          factores.push((cosI * cosJ * areas[j]) / (Math.PI * r2))
        }
      }
    }
  }
  inicio[total] = vecinos.length
  return {
    malla,
    posiciones,
    normales,
    horizontes,
    inicio,
    vecinos: Int32Array.from(vecinos),
    factores: Float32Array.from(factores),
  }
}

/** Fracción de un disco (diámetro θ) sobre una línea de horizonte h, con su centro a elevación e. */
function fraccionSobre(e: number, h: number, diametro: number): number {
  const t = (e - h) / (diametro / 2)
  if (t <= -1) return 0
  if (t >= 1) return 1
  return 0.5 + (Math.asin(t) + t * Math.sqrt(1 - t * t)) / Math.PI
}

/** Una fuente de luz para el rebote: dirección, irradiancia perpendicular y diámetro angular. */
export type FuenteRebote = {
  direccion: Vec3
  /** Irradiancia perpendicular SIN recorte por horizonte (el recorte lo hace cada parche). */
  irradiancia: number
  diametroGrados: number
  /** Horizonte lejano (macizos) en el azimut de la fuente, igual para toda la malla. */
  horizonteLejanoGrados: number
}

/**
 * Luz directa de cada parche (con sombra propia por el relieve y los macizos) y luz de un rebote.
 * Devuelve dos arreglos por parche, en las mismas unidades que las fuentes.
 */
export function calcularRebote(pre: PreparacionRebote, fuentes: FuenteRebote[], albedo: number) {
  const total = pre.malla.n * pre.malla.n
  const directa = new Float64Array(total)
  for (const fuente of fuentes) {
    const [sx, sy, sz] = fuente.direccion
    const elev = Math.asin(Math.max(-1, Math.min(1, sy))) / RAD
    const az = ((Math.atan2(sx, -sz) / RAD) + 360) % 360
    const a = (az / 360) * N_AZIMUTS
    const a0 = Math.floor(a) % N_AZIMUTS
    const a1 = (a0 + 1) % N_AZIMUTS
    const ta = a - Math.floor(a)
    for (let k = 0; k < total; k++) {
      const coseno = pre.normales[3 * k] * sx + pre.normales[3 * k + 1] * sy + pre.normales[3 * k + 2] * sz
      if (coseno <= 0) continue
      const hLocal = pre.horizontes[k * N_AZIMUTS + a0] * (1 - ta) + pre.horizontes[k * N_AZIMUTS + a1] * ta
      const visible = fraccionSobre(elev, Math.max(hLocal, fuente.horizonteLejanoGrados), fuente.diametroGrados)
      directa[k] += fuente.irradiancia * visible * coseno
    }
  }
  const rebote = new Float64Array(total)
  for (let i = 0; i < total; i++) {
    let suma = 0
    for (let p = pre.inicio[i]; p < pre.inicio[i + 1]; p++) suma += directa[pre.vecinos[p]] * pre.factores[p]
    rebote[i] = albedo * suma
  }
  return { directa, rebote }
}
