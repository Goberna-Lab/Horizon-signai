/**
 * Malla del relieve con detalle variable. Funciones puras, sin three.
 *
 * Una malla uniforme al paso del dato tiene medio millón de triángulos: vista desde arriba, cada uno ocupa menos de
 * un píxel y la gráfica pierde el tiempo en ellos. Aquí la lámina se parte en bloques de 16 celdas y cada bloque
 * usa el paso que le toca según `stepAt` (2 = uno de cada dos nodos, 4, 8 o 16).
 *
 * Para que no queden grietas entre bloques de distinto paso, los vértices del borde de un bloque se colocan sobre
 * el perfil del vecino más grueso: los dos lados comparten exactamente la misma línea.
 */
import { type Grid, toPlate } from "./plate"

export type MeshData = {
  position: Float32Array
  uv: Float32Array
  /** 0 en la superficie, 1 en la base del canto. */
  skirt: Float32Array
  /** Altura sobre la esfera de referencia (km). */
  height: Float32Array
  index: Uint32Array
}

const BLOCK = 16

/**
 * @param stepAt  Paso del bloque centrado en (x, y) de la proyección (km). Debe devolver 2, 4, 8 o 16.
 * @param slabKm  Grosor de la lámina bajo la esfera de referencia: hasta ahí baja el canto.
 */
export function buildMesh(grid: Grid, slabKm: number, stepAt: (xKm: number, yKm: number) => number): MeshData {
  const { n, extentKm, stepKm, radiusKm, heights } = grid
  const blocks = (n - 1) / BLOCK
  if (!Number.isInteger(blocks)) throw new Error(`Grid of ${n} nodes does not split into blocks of ${BLOCK} cells.`)

  const steps = new Uint8Array(blocks * blocks)
  let vertices = 0
  let triangles = 0
  for (let bi = 0; bi < blocks; bi++) {
    for (let bj = 0; bj < blocks; bj++) {
      const step = stepAt(-extentKm + (bj + 0.5) * BLOCK * stepKm, extentKm - (bi + 0.5) * BLOCK * stepKm)
      steps[bi * blocks + bj] = step
      const cells = BLOCK / step
      vertices += (cells + 1) * (cells + 1)
      triangles += cells * cells * 2
      // Canto en los bloques del borde de la lámina.
      const sides = (bi === 0 ? 1 : 0) + (bi === blocks - 1 ? 1 : 0) + (bj === 0 ? 1 : 0) + (bj === blocks - 1 ? 1 : 0)
      vertices += sides * (cells + 1) * 2
      triangles += sides * cells * 2
    }
  }

  const position = new Float32Array(vertices * 3)
  const uv = new Float32Array(vertices * 2)
  const skirt = new Float32Array(vertices)
  const height = new Float32Array(vertices)
  const index = new Uint32Array(triangles * 3)
  let v = 0
  let k = 0

  const stepOf = (bi: number, bj: number, own: number) => (bi < 0 || bj < 0 || bi >= blocks || bj >= blocks ? own : steps[bi * blocks + bj])
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t

  /** Añade un vértice en el nodo (c, r) con la altura dada (m); devuelve su índice. */
  const emit = (c: number, r: number, hM: number, isSkirt: boolean): number => {
    const hKm = isSkirt ? -slabKm : hM / 1000
    toPlate(-extentKm + c * stepKm, extentKm - r * stepKm, hKm, radiusKm, position, v * 3)
    uv[v * 2] = c / (n - 1)
    uv[v * 2 + 1] = r / (n - 1)
    skirt[v] = isSkirt ? 1 : 0
    height[v] = hKm
    return v++
  }

  for (let bi = 0; bi < blocks; bi++) {
    for (let bj = 0; bj < blocks; bj++) {
      const step = steps[bi * blocks + bj]
      const cells = BLOCK / step
      const c0 = bj * BLOCK
      const r0 = bi * BLOCK
      // Paso efectivo de cada borde: el más grueso de los dos bloques que lo comparten.
      const left = Math.max(step, stepOf(bi, bj - 1, step))
      const right = Math.max(step, stepOf(bi, bj + 1, step))
      const top = Math.max(step, stepOf(bi - 1, bj, step))
      const bottom = Math.max(step, stepOf(bi + 1, bj, step))

      /** Altura (m) del vértice local (i, j), ajustada al perfil del borde si hace falta. */
      const heightOf = (i: number, j: number): number => {
        const c = c0 + i
        const r = r0 + j
        const vertical = i === 0 ? left : i === BLOCK ? right : 0
        if (vertical > step && j % vertical !== 0) {
          const ja = Math.floor(j / vertical) * vertical
          return lerp(heights[(r0 + ja) * n + c], heights[(r0 + ja + vertical) * n + c], (j - ja) / vertical)
        }
        const horizontal = j === 0 ? top : j === BLOCK ? bottom : 0
        if (horizontal > step && i % horizontal !== 0) {
          const ia = Math.floor(i / horizontal) * horizontal
          return lerp(heights[r * n + c0 + ia], heights[r * n + c0 + ia + horizontal], (i - ia) / horizontal)
        }
        return heights[r * n + c]
      }

      const base = v
      for (let j = 0; j <= BLOCK; j += step) for (let i = 0; i <= BLOCK; i += step) emit(c0 + i, r0 + j, heightOf(i, j), false)
      const row = cells + 1
      for (let j = 0; j < cells; j++) {
        for (let i = 0; i < cells; i++) {
          const a = base + j * row + i
          index[k++] = a
          index[k++] = a + row
          index[k++] = a + 1
          index[k++] = a + 1
          index[k++] = a + row
          index[k++] = a + row + 1
        }
      }

      // Canto: una tira por cada lado del bloque que da al borde de la lámina.
      const wall = (at: (s: number) => [number, number]) => {
        const start = v
        for (let s = 0; s <= BLOCK; s += step) {
          const [i, j] = at(s)
          emit(c0 + i, r0 + j, heightOf(i, j), false)
          emit(c0 + i, r0 + j, 0, true)
        }
        for (let s = 0; s < cells; s++) {
          const a = start + s * 2
          index[k++] = a
          index[k++] = a + 1
          index[k++] = a + 2
          index[k++] = a + 2
          index[k++] = a + 1
          index[k++] = a + 3
        }
      }
      if (bi === 0) wall((s) => [s, 0])
      if (bi === blocks - 1) wall((s) => [s, BLOCK])
      if (bj === 0) wall((s) => [0, s])
      if (bj === blocks - 1) wall((s) => [BLOCK, s])
    }
  }

  return { position, uv, skirt, height, index }
}
