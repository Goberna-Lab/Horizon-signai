/**
 * Sol y Tierra en el marco de la lámina, interpolados de la tabla de JPL Horizons (DE441) que trae `plate.json`.
 * Funciones puras.
 */

export type Ephemeris = { startMs: number; stepMs: number; rows: number; data: number[] }

export type Sky = {
  /** Unitarios hacia el Sol y la Tierra (marco de la lámina). */
  sun: [number, number, number]
  earth: [number, number, number]
}

/** Radio angular del Sol (rad): 0,266°, el del motor (`planificador.ts`, SEMI_SOL). */
export const SUN_RADIUS_RAD = (0.266 * Math.PI) / 180

export function skyAt(e: Ephemeris, ms: number, out: Sky): Sky {
  const s = Math.min(Math.max((ms - e.startMs) / e.stepMs, 0), e.rows - 1.000001)
  const i = Math.floor(s)
  const f = s - i
  const a = i * 6
  const b = a + 6
  const d = e.data
  for (let body = 0; body < 2; body++) {
    const o = body * 3
    const x = d[a + o] + (d[b + o] - d[a + o]) * f
    const y = d[a + o + 1] + (d[b + o + 1] - d[a + o + 1]) * f
    const z = d[a + o + 2] + (d[b + o + 2] - d[a + o + 2]) * f
    const l = Math.hypot(x, y, z)
    const target = body === 0 ? out.sun : out.earth
    target[0] = x / l
    target[1] = y / l
    target[2] = z / l
  }
  return out
}

/**
 * Azimut de un cuerpo en la lámina: grados desde 0° E (arriba en la lámina) hacia 90° E.
 * Es la longitud lunar sobre la que está el cuerpo, visto desde el polo.
 */
export function bearingDeg(v: readonly number[]): number {
  return ((Math.atan2(v[0], v[1]) * 180) / Math.PI + 360) % 360
}

/** Elevación sobre el plano horizontal del polo (grados). */
export function poleElevationDeg(v: readonly number[]): number {
  return (Math.asin(v[2]) * 180) / Math.PI
}
