// E23: máscara de horizonte de un punto. Por azimut, la envolvente convexa superior del perfil del terreno (E21); el
// horizonte desde un observador a altura H es máx atan2(y − H, x) sobre sus vértices. Sirve igual para los sitios
// detallados (horizonte lejano de E10/E20 más el cercano del DTM de 2 m, scripts/horizonte-cercano.ts) y para los puntos
// del polo calculados sobre LOLA (E24). Funciones puras, sin React ni three.

const RAD = Math.PI / 180

export type Mascara = {
  pasoAzimutGrados: number
  /** Por azimut, [x0, y0, x1, y1, …]: x en m desde el observador, y en m respecto del suelo bajo él (con curvatura). */
  vertices: number[][]
  /** De dónde sale (para la interfaz). */
  fuente: string
}

/** Perfil del horizonte (grados por azimut) desde una altura sobre el suelo. */
export type PerfilHorizonte = { pasoAzimutGrados: number; elevacionGrados: Float32Array; alturaM: number; fuente: string }

/** Une la envolvente lejana y la cercana de un archivo horizonte-<sitio>.json. */
export function mascaraDeArchivo(h: { pasoAzimutGrados: number; envolvente: number[][]; envolventeCercana?: number[][] }, fuente: string): Mascara {
  return {
    pasoAzimutGrados: h.pasoAzimutGrados,
    vertices: h.envolvente.map((v, i) => (h.envolventeCercana ? [...h.envolventeCercana[i], ...v] : v)),
    fuente,
  }
}

/**
 * Perfil desde la altura alturaM. Igual que la evaluación (E21), el ojo va al menos a 1 cm, para no partir dentro del
 * suelo interpolado.
 */
export function perfilDesde(m: Mascara, alturaM: number): PerfilHorizonte {
  const H = Math.max(alturaM, 0.01)
  const elevacionGrados = new Float32Array(m.vertices.length)
  m.vertices.forEach((v, i) => {
    let mejor = -Math.PI / 2
    for (let k = 0; k < v.length; k += 2) mejor = Math.max(mejor, Math.atan2(v[k + 1] - H, v[k]))
    elevacionGrados[i] = mejor / RAD
  })
  return { pasoAzimutGrados: m.pasoAzimutGrados, elevacionGrados, alturaM, fuente: m.fuente }
}

/** Elevación del horizonte (grados) en un azimut, interpolada y periódica. */
export function horizonteEn(p: PerfilHorizonte, azimutGrados: number): number {
  const n = p.elevacionGrados.length
  const a = ((((azimutGrados % 360) + 360) % 360) / p.pasoAzimutGrados)
  const i = Math.floor(a)
  const f = a - i
  return p.elevacionGrados[i % n] * (1 - f) + p.elevacionGrados[(i + 1) % n] * f
}

/**
 * E21: envolvente convexa superior de los puntos (x, y) de un rayo, x horizontal desde el pie del observador e y vertical
 * respecto del suelo en ese pie. El máximo de atan2(y − H, x) para un observador a altura H (x = 0) siempre está en un
 * vértice de esta envolvente, así que guardarla basta para calcular el horizonte desde cualquier altura.
 * Devuelve [x0, y0, x1, y1, …] ordenado por x. (E24: movida al motor desde scripts/polar.ts, que la reexporta.)
 */
export function envolventeSuperior(puntos: Array<[number, number]>, decimalesX = 0, decimalesY = 2): number[] {
  const p = [...puntos].sort((a, b) => a[0] - b[0])
  const h: Array<[number, number]> = []
  for (const q of p) {
    while (h.length >= 2) {
      const [a, b] = [h[h.length - 2], h[h.length - 1]]
      // Si b queda por debajo (o sobre) la recta a–q, no es vértice superior.
      if ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) >= 0) h.pop()
      else break
    }
    h.push(q)
  }
  return h.flatMap(([x, y]) => [Number(x.toFixed(decimalesX)), Number(y.toFixed(decimalesY))])
}
