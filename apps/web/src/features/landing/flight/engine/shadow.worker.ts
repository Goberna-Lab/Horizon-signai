/// <reference lib="webworker" />
/**
 * Worker de sombras: recibe la dirección de un cuerpo (Sol o Tierra) y devuelve su mapa de visibilidad, para que
 * el barrido no frene el scroll.
 *
 * Trabaja a dos resoluciones: la rejilla a mitad de paso (cuatro veces menos nodos, unos pocos milisegundos) para
 * seguir a la cámara cuadro a cuadro, y la rejilla completa para el mapa fino que se pide cuando se detiene.
 */
import { sweep } from "./shadow"

type Init = { type: "init"; z: Float32Array; n: number; stepKm: number }
type Request = { type: "sweep"; id: number; layer: "sun" | "earth"; fine: boolean; ms: number; gx: number; gy: number; tanE: number; disc: number; buffer?: ArrayBuffer }

type Level = { z: Float32Array; n: number; stepKm: number; ceiling: Float32Array; distance: Float32Array }

let fine: Level | null = null
let fast: Level | null = null

const level = (z: Float32Array, n: number, stepKm: number): Level => ({ z, n, stepKm, ceiling: new Float32Array(2 * n), distance: new Float32Array(2 * n) })

self.onmessage = (event: MessageEvent<Init | Request>) => {
  const m = event.data
  if (m.type === "init") {
    fine = level(m.z, m.n, m.stepKm)
    // Uno de cada dos nodos: los mismos que usa la malla de más detalle.
    const half = (m.n - 1) / 2 + 1
    const z = new Float32Array(half * half)
    for (let r = 0; r < half; r++) for (let c = 0; c < half; c++) z[r * half + c] = m.z[r * 2 * m.n + c * 2]
    fast = level(z, half, m.stepKm * 2)
    return
  }
  const grid = m.fine ? fine : fast
  if (!grid) return
  const size = 2 * grid.n * grid.n
  const out = m.buffer && m.buffer.byteLength === size ? new Uint8Array(m.buffer) : new Uint8Array(size)
  const result = sweep(grid.z, grid.n, grid.stepKm, m.gx, m.gy, m.tanE, m.disc, out, grid.ceiling, grid.distance)
  ;(self as DedicatedWorkerGlobalScope).postMessage({ type: "done", id: m.id, layer: m.layer, fine: m.fine, ms: m.ms, sweep: result, buffer: out.buffer }, [out.buffer])
}
