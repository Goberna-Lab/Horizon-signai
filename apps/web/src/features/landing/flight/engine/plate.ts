/**
 * Geometría de la lámina: el relieve del polo sur (LOLA) llevado a un marco 3D con la curvatura real de la Luna.
 * Funciones puras, sin React ni three.
 *
 * Marco de la lámina, en km, con origen en el polo sur sobre la esfera de 1737,4 km:
 *   +X hacia 90° E, +Y hacia 0° E (la dirección media de la Tierra), +Z hacia afuera (sur).
 * La rejilla viene en estereográfica polar sur (x = rho·sin(lon), y = rho·cos(lon), rho = 2R·tan(c/2)),
 * la misma de `luna-recursos/calculos/motor/demPolar.ts`: columna -> +x, fila -> -y.
 */

export type Grid = {
  /** Nodos por lado. */
  n: number
  /** Media anchura de la rejilla en la proyección (km). */
  extentKm: number
  /** Paso entre nodos en la proyección (km). */
  stepKm: number
  radiusKm: number
  /** Altura sobre la esfera de referencia (m), fila a fila desde y = +extent. */
  heights: Int16Array
  /** Coordenada Z del marco de la lámina (km) en cada nodo: incluye la curvatura. */
  z: Float32Array
}

/** Deshace la compresión de `terrain.z.bin`: gzip, planos de bytes, zigzag y predicción 2D. */
export async function decodeTerrain(response: Response, n: number): Promise<Int16Array> {
  if (!response.ok || !response.body) throw new Error(`Terrain request failed: ${response.status}`)
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"))
  const planes = new Uint8Array(await new Response(stream).arrayBuffer())
  const total = n * n
  if (planes.length !== total * 2) throw new Error(`Terrain has ${planes.length} bytes; expected ${total * 2}.`)
  const heights = new Int16Array(total)
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c
      const zig = planes[i] | (planes[total + i] << 8)
      const delta = (zig >>> 1) ^ -(zig & 1)
      const left = c > 0 ? heights[i - 1] : 0
      const up = r > 0 ? heights[i - n] : 0
      const diagonal = r > 0 && c > 0 ? heights[i - n - 1] : 0
      heights[i] = left + up - diagonal + delta
    }
  }
  return heights
}

/** Punto del marco de la lámina (km) para un punto de la proyección (km) a una altura h (km). */
export function toPlate(xs: number, ys: number, hKm: number, radiusKm: number, out: Float32Array | number[], offset = 0): void {
  const rho = Math.hypot(xs, ys)
  const colatitude = 2 * Math.atan(rho / (2 * radiusKm))
  const f = rho > 1e-9 ? ((radiusKm + hKm) * Math.sin(colatitude)) / rho : (radiusKm + hKm) / radiusKm
  out[offset] = f * xs
  out[offset + 1] = f * ys
  out[offset + 2] = (radiusKm + hKm) * Math.cos(colatitude) - radiusKm
}

export function createGrid(heights: Int16Array, n: number, extentKm: number, radiusKm: number): Grid {
  const stepKm = (2 * extentKm) / (n - 1)
  const z = new Float32Array(n * n)
  const p = [0, 0, 0]
  for (let r = 0; r < n; r++) {
    const ys = extentKm - r * stepKm
    for (let c = 0; c < n; c++) {
      const i = r * n + c
      toPlate(-extentKm + c * stepKm, ys, heights[i] / 1000, radiusKm, p)
      z[i] = p[2]
    }
  }
  return { n, extentKm, stepKm, radiusKm, heights, z }
}

/** Altura (km sobre la esfera) en un punto de la proyección, bilineal y limitada al borde. */
export function heightAt(grid: Grid, xs: number, ys: number): number {
  const { n, extentKm, stepKm, heights } = grid
  const c = Math.min(Math.max((xs + extentKm) / stepKm, 0), n - 1.001)
  const r = Math.min(Math.max((extentKm - ys) / stepKm, 0), n - 1.001)
  const c0 = Math.floor(c)
  const r0 = Math.floor(r)
  const tc = c - c0
  const tr = r - r0
  const i = r0 * n + c0
  return ((heights[i] * (1 - tc) + heights[i + 1] * tc) * (1 - tr) + (heights[i + n] * (1 - tc) + heights[i + n + 1] * tc) * tr) / 1000
}

/** Latitud y longitud este (grados) -> punto de la proyección (km). */
export function project(latDeg: number, lonEastDeg: number, radiusKm: number): [number, number] {
  const rad = Math.PI / 180
  const rho = 2 * radiusKm * Math.tan(((90 + latDeg) * rad) / 2)
  return [rho * Math.sin(lonEastDeg * rad), rho * Math.cos(lonEastDeg * rad)]
}

/** Punto del terreno (marco de la lámina, km) sobre un punto de la proyección, elevado `liftKm`. */
export function surfacePoint(grid: Grid, xs: number, ys: number, liftKm = 0): [number, number, number] {
  const p: [number, number, number] = [0, 0, 0]
  toPlate(xs, ys, heightAt(grid, xs, ys) + liftKm, grid.radiusKm, p)
  return p
}
