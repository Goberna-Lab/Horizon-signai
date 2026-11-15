// Entonación robótica: cambia la melodía de una frase SIN cambiar su duración, para que los tiempos por
// palabra (subtítulos y detección de eco) sigan valiendo. Sin dependencias, sobre muestras sueltas.
//
// Es la receta con que se suele hacer una voz de «IA de instalación» desde un TTS (Melodyne o Auto-Tune
// con corrección instantánea; ver docs de la investigación en voz/LEEME.md):
// 1. Tono de cada tramo de 10 ms (YIN sobre la señal diezmada a ~12 kHz).
// 2. UNA nota plana por palabra (con los tiempos de Kokoro), sin deslizar dentro de la palabra: el tono medio
//    de la palabra se acerca al de la frase (`rango` < 1 aplana, > 1 exagera), se corre `semitonos` y se
//    pega a la escala. Entre palabras, a veces un salto de ±1 grado (`salto`). `caidaFinal`: la última
//    palabra cae esos semitonos en algunas frases (el remate seco de VERA).
// 3. Resíntesis TD-PSOLA: granos de dos periodos alrededor de cada pulso, vueltos a sumar con el espaciado
//    del tono nuevo. Cada grano se lee comprimido por `formante` (semitonos): sube los formantes sin tocar
//    el tono, lo que da el timbre sintético. Lo sordo (s, f, t) pasa casi igual.

export type Entonacion = {
  semitonos: number
  rango: number
  /** Notas permitidas dentro de la octava, en semitonos desde la tónica (null: las doce). */
  escala: number[] | null
  /** Probabilidad de que una palabra salte un grado de la escala arriba o abajo. */
  salto: number
  /** Semitonos que cae la última palabra (en la mitad de las frases); 0 para nunca. */
  caidaFinal: number
  /** Semitonos que suben los formantes (timbre), sin cambiar el tono. */
  formante: number
}

/** Inicio y fin (s) de cada palabra dentro de la frase. */
export type Tramos = [inicio: number, fin: number][]

const PASO_S = 0.01
const F0_MIN = 85
const F0_MAX = 500

/** Tono (Hz) de cada tramo de 10 ms; 0 donde no hay voz. */
export function seguirTono(x: Float32Array, sr: number): Float32Array {
  const q = Math.max(1, Math.round(sr / 12000))
  const srd = sr / q
  const d = new Float32Array(Math.floor(x.length / q))
  for (let i = 0; i < d.length; i++) {
    let s = 0
    for (let k = 0; k < q; k++) s += x[i * q + k]
    d[i] = s / q
  }
  const W = Math.round(0.03 * srd)
  const tMin = Math.floor(srd / F0_MAX)
  const tMax = Math.ceil(srd / F0_MIN)
  const n = Math.ceil(x.length / sr / PASO_S)
  const f0 = new Float32Array(n)
  const dif = new Float32Array(tMax + 2)
  // Umbral de energía: relativo al tramo más fuerte de la frase.
  const rms = new Float32Array(n)
  let max = 0
  for (let j = 0; j < n; j++) {
    const c = Math.round(j * PASO_S * srd)
    let s = 0
    for (let i = c; i < c + W && i < d.length; i++) s += d[i] * d[i]
    rms[j] = Math.sqrt(s / W)
    if (rms[j] > max) max = rms[j]
  }
  for (let j = 0; j < n; j++) {
    const c = Math.round(j * PASO_S * srd)
    if (rms[j] < max * 0.06 || c + W + tMax >= d.length) continue
    // YIN: diferencia normalizada por su media acumulada; el primer valle bajo 0,2 es el periodo.
    let acum = 0
    dif[0] = 1
    let tau = -1
    for (let t = 1; t <= tMax; t++) {
      let s = 0
      for (let i = 0; i < W; i++) {
        const v = d[c + i] - d[c + i + t]
        s += v * v
      }
      acum += s
      dif[t] = acum > 0 ? (s * t) / acum : 1
      if (tau < 0 && t > tMin + 1 && dif[t - 1] < 0.2 && dif[t - 1] <= dif[t] && dif[t - 1] <= dif[t - 2]) tau = t - 1
    }
    if (tau < 0) continue
    const a = dif[tau - 1]
    const b = dif[tau]
    const e = dif[tau + 1]
    const ajuste = (a - e) / (2 * (a - 2 * b + e) || 1)
    f0[j] = srd / (tau + Math.max(-1, Math.min(1, ajuste)))
  }
  // Mediana de 3 para quitar saltos de octava sueltos.
  const out = new Float32Array(n)
  for (let j = 0; j < n; j++) {
    if (f0[j] <= 0) continue
    const v = [f0[j - 1] ?? 0, f0[j], f0[j + 1] ?? 0].filter((z) => z > 0).sort((p, r) => p - r)
    out[j] = v[Math.floor(v.length / 2)]
  }
  return out
}

const aNota = (hz: number) => 69 + 12 * Math.log2(hz / 440)
const aHz = (nota: number) => 440 * 2 ** ((nota - 69) / 12)
const mediana = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]
// Pseudoazar fijo: la misma frase suena siempre igual, y cada frase distinta suena distinta.
const azar = (j: number) => {
  const s = Math.sin(j * 12.9898 + 78.233) * 43758.5453
  return s - Math.floor(s)
}

/**
 * Tono deseado (Hz) por tramo de 10 ms, o 0 donde no hay voz. Con `tramos` (palabras), una nota por
 * palabra; sin ellos, cada 150 ms de voz continua cuenta como una palabra.
 */
export function tonoDeseado(f0: Float32Array, e: Entonacion, tramos?: Tramos): Float32Array {
  const out = new Float32Array(f0.length)
  const notas = [...f0].filter((v) => v > 0).map(aNota)
  if (!notas.length) return out
  const centro = mediana(notas)
  const tonica = Math.round(centro)
  // Notas de la escala en varias octavas alrededor de la tónica, ordenadas.
  const grados = e.escala ?? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  const permitidas: number[] = []
  for (let o = -3; o <= 3; o++) for (const g of grados) permitidas.push(tonica + 12 * o + g)
  const indice = (n: number) => {
    let mejor = 0
    for (let k = 1; k < permitidas.length; k++) if (Math.abs(permitidas[k] - n) < Math.abs(permitidas[mejor] - n)) mejor = k
    return mejor
  }

  // Palabras en tramos de 10 ms: las de Kokoro, o cortes cada 150 ms de voz.
  let segs: [number, number][] = (tramos ?? []).map(([a, b]) => [Math.floor(a / PASO_S), Math.ceil(b / PASO_S)])
  if (!segs.length) {
    for (let j = 0; j < f0.length; j += 15) segs.push([j, Math.min(f0.length, j + 15)])
  }
  segs = segs.map(([a, b]) => [Math.max(0, a), Math.min(f0.length, b)] as [number, number]).filter(([a, b]) => b > a)

  const semilla = Math.round(centro * 100) + f0.length
  const conCaida = e.caidaFinal !== 0 && azar(semilla) < 0.5
  let ultimaConVoz = -1
  segs.forEach(([a, b], k) => {
    if ([...f0.subarray(a, b)].some((v) => v > 0)) ultimaConVoz = k
  })
  segs.forEach(([a, b], k) => {
    const voz = [...f0.subarray(a, b)].filter((v) => v > 0).map(aNota)
    if (!voz.length) return
    let i = indice(centro + (mediana(voz) - centro) * e.rango + e.semitonos)
    const r = azar(semilla + k * 7.13)
    if (r < e.salto) i += azar(semilla + k * 3.7) < 0.5 ? -1 : 1
    let nota = permitidas[Math.max(0, Math.min(permitidas.length - 1, i))]
    if (conCaida && k === ultimaConVoz) nota -= e.caidaFinal
    const hz = aHz(nota)
    for (let j = a; j < b; j++) if (f0[j] > 0) out[j] = hz
  })
  // Voz que quedó fuera de toda palabra (respiraciones, colas): la nota de la palabra más cercana.
  for (let j = 0; j < f0.length; j++) {
    if (f0[j] <= 0 || out[j] > 0) continue
    for (let d = 1; d < f0.length; d++) {
      const v = out[j - d] || out[j + d]
      if (v) {
        out[j] = v
        break
      }
    }
  }
  return out
}

/** Aplica la entonación. Devuelve un arreglo del mismo largo. */
export function entonar(x: Float32Array, sr: number, e: Entonacion, tramos?: Tramos): Float32Array {
  const f0 = seguirTono(x, sr)
  const meta = tonoDeseado(f0, e, tramos)
  const n = x.length
  const tramo = (i: number) => Math.min(f0.length - 1, Math.max(0, Math.floor(i / sr / PASO_S)))
  const SORDO = Math.round(sr / 200) // pulsos ficticios cada 5 ms donde no hay voz
  const fmt = 2 ** (e.formante / 12)

  // Pulsos de análisis: en lo sonoro, uno por periodo, ajustado al pico local; en lo sordo, fijos.
  const marcas: number[] = []
  const periodos: number[] = []
  const sonoras: boolean[] = []
  let m = 0
  while (m < n) {
    const hz = f0[tramo(m)]
    if (hz > 0) {
      const T = sr / hz
      const r = Math.round(T * 0.25)
      let mejor = m
      for (let i = Math.max(0, m - r); i <= Math.min(n - 1, m + r); i++) if (x[i] > x[mejor]) mejor = i
      if (marcas.length && mejor <= marcas[marcas.length - 1]) mejor = marcas[marcas.length - 1] + 1
      marcas.push(mejor)
      periodos.push(Math.round(T))
      sonoras.push(true)
      m = mejor + Math.round(T)
    } else {
      marcas.push(m)
      periodos.push(SORDO)
      sonoras.push(false)
      m += SORDO
    }
  }

  // Síntesis: avanza con el periodo nuevo y en cada paso suma el grano del pulso más cercano.
  const y = new Float32Array(n)
  const peso = new Float32Array(n)
  const leer = (p: number) => {
    const i = Math.floor(p)
    if (i < 0 || i + 1 >= n) return 0
    return x[i] + (x[i + 1] - x[i]) * (p - i)
  }
  let k = 0
  let t = 0
  while (t < n) {
    while (k + 1 < marcas.length && Math.abs(marcas[k + 1] - t) <= Math.abs(marcas[k] - t)) k++
    const P = periodos[k]
    const c = marcas[k]
    // El grano sonoro se lee comprimido por `fmt` (formantes más altos); el sordo, tal cual.
    const f = sonoras[k] ? fmt : 1
    const L = Math.max(2, Math.round(P / f))
    const t0 = Math.round(t)
    for (let i = -L; i < L; i++) {
      const dst = t0 + i
      if (dst < 0 || dst >= n) continue
      const w = 0.5 - 0.5 * Math.cos((Math.PI * (i + L)) / L)
      y[dst] += leer(c + i * f) * w
      peso[dst] += w
    }
    const objetivo = meta[tramo(t)]
    t += sonoras[k] && objetivo > 0 ? Math.max(sr / F0_MAX / 2, Math.min(sr / 60, sr / objetivo)) : P
  }
  // Normaliza por la suma de ventanas (con tono más agudo los granos se enciman más).
  for (let i = 0; i < n; i++) y[i] /= Math.max(peso[i], 0.25)
  return y
}

/** Lo mismo sobre un AudioBuffer (canal a canal; la voz es mono). */
export function entonarBuffer(ctx: BaseAudioContext, b: AudioBuffer, e: Entonacion, tramos?: Tramos): AudioBuffer {
  const out = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate)
  for (let c = 0; c < b.numberOfChannels; c++) {
    out.copyToChannel(entonar(b.getChannelData(c), b.sampleRate, e, tramos) as Float32Array<ArrayBuffer>, c)
  }
  return out
}
