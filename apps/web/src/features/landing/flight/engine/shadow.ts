/**
 * Sombras sobre el relieve con la dirección real del Sol (o línea de vista a la Tierra).
 * Funciones puras, sin React ni three; corren igual en la página y en un worker.
 *
 * Método: el relieve es una superficie z(x, y) en el marco de la lámina, con la curvatura incluida, y los rayos
 * son paralelos. Un nodo está a la sombra si algún punto del terreno hacia el cuerpo queda por encima del rayo.
 * Se barre en líneas alejándose del cuerpo y se arrastra el "techo" de sombra de cada rayo:
 *   techo(siguiente) = max(z, techo) - paso·tan(elevación)
 * Para no acumular error al interpolar, cada rayo es una columna de una rejilla cizallada (la salida también lo es:
 * el shader deshace la cizalla al leerla). La penumbra usa el tamaño real del disco: la fracción visible sale del
 * ángulo entre el rayo y el techo, visto desde el nodo.
 *
 * Simplificación declarada: la rejilla se trata como ortográfica y uniforme (difiere de la real en menos de 0,7 %)
 * y el relieve de fuera de la lámina no da sombra. Sirve para ver el patrón de luz; las cifras de la landing
 * salen del motor validado, no de aquí.
 */

export type Sweep = {
  /** 0: las líneas son filas; 1: las líneas son columnas. */
  axis: 0 | 1
  /** Pendiente de la cizalla: rayo j = transversal - k·línea - umin. */
  k: number
  umin: number
  /** Rayos usados (columnas válidas de la salida). */
  m: number
}

/** Fracción visible de un disco cuyo centro está a `t` radios sobre el horizonte (área de un segmento circular). */
function discFraction(t: number): number {
  if (t <= -1) return 0
  if (t >= 1) return 1
  return 0.5 + (Math.asin(t) + t * Math.sqrt(1 - t * t)) / Math.PI
}

/**
 * @param z        Z de cada nodo (km), n x n.
 * @param gx, gy   Dirección horizontal hacia el cuerpo en la rejilla (columna, fila). No hace falta normalizarla.
 * @param tanE     Tangente de la elevación del cuerpo sobre el plano horizontal del polo.
 * @param discRad  Radio angular del disco (rad). 0: borde duro (cuenta el centro).
 * @param out      Salida de (2n) x n bytes: fila = línea, columna = rayo. 255 = visible del todo.
 */
export function sweep(z: Float32Array, n: number, stepKm: number, gx: number, gy: number, tanE: number, discRad: number, out: Uint8Array, ceiling: Float32Array, distance: Float32Array): Sweep {
  const rows = Math.abs(gy) >= Math.abs(gx)
  const k = rows ? gx / gy : gy / gx
  const toward = (rows ? gy : gx) > 0
  const umin = Math.min(0, -k * (n - 1))
  const m = Math.ceil((n - 1) * (1 + Math.abs(k))) + 1
  const stride = 2 * n
  const dl = stepKm * Math.sqrt(1 + k * k)
  const drop = dl * tanE
  const invDisc = discRad > 0 ? 1 / discRad : 0
  ceiling.fill(-Infinity, 0, m)
  distance.fill(0, 0, m)
  for (let t = 0; t < n; t++) {
    const line = toward ? n - 1 - t : t
    const shift = umin + k * line
    const j0 = Math.max(0, Math.ceil(-shift - 1e-6))
    const j1 = Math.min(m - 1, Math.floor(n - 1 - shift + 1e-6))
    const base = line * stride
    for (let j = j0; j <= j1; j++) {
      const cross = Math.min(Math.max(j + shift, 0), n - 1)
      let c0 = cross | 0
      if (c0 > n - 2) c0 = n - 2
      const f = cross - c0
      let h: number
      if (rows) {
        const i = line * n + c0
        h = z[i] + (z[i + 1] - z[i]) * f
      } else {
        const i = c0 * n + line
        h = z[i] + (z[i + n] - z[i]) * f
      }
      const cin = ceiling[j] - drop
      const din = distance[j] + dl
      const margin = h - cin
      let lit = 255
      if (cin > -1e30) {
        if (invDisc > 0) {
          const s = (margin / din) * invDisc
          lit = s >= 1 ? 255 : s <= -1 ? 0 : (discFraction(s) * 255 + 0.5) | 0
        } else lit = margin >= 0 ? 255 : 0
      }
      if (margin >= 0) {
        ceiling[j] = h
        distance[j] = 0
      } else {
        ceiling[j] = cin
        distance[j] = din
      }
      out[base + j] = lit
    }
  }
  return { axis: rows ? 0 : 1, k, umin, m }
}

/** Lee la salida cizallada en un nodo (columna, fila) de la rejilla: 0..1. Para pruebas y lecturas puntuales. */
export function litAt(out: Uint8Array, n: number, s: Sweep, col: number, row: number): number {
  const line = s.axis === 0 ? row : col
  const cross = s.axis === 0 ? col : row
  const j = cross - s.k * line - s.umin
  const j0 = Math.min(Math.max(Math.floor(j), 0), s.m - 2)
  const f = Math.min(Math.max(j - j0, 0), 1)
  const i = Math.round(line) * 2 * n + j0
  return (out[i] * (1 - f) + out[i + 1] * f) / 255
}
