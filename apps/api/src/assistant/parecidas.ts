// La pregunta frecuente más parecida a lo que alguien le dijo a EVA (PREGUNTAS en @horizon-signai/shared). Si se
// parece bastante, la web contesta con la respuesta grabada al instante, sin pasar por la IA.
//
// Usa los mismos embeddings que el RAG (bge-m3 en nuestro Ollama: ./rag.ts). Las variantes de cada pregunta, en los
// dos idiomas, se incrustan una sola vez, al primer uso, y quedan en memoria (son ~100 vectores). Una frase oída
// cuesta un embedding (~0,3 s con el modelo caliente). Nunca lanza: sin servidor de embeddings, no hay coincidencia
// y la pregunta va a la IA como siempre.
import { PREGUNTAS } from "@horizon-signai/shared"
import { incrustar, servidoresRag } from "./rag.js"

/**
 * Desde aquí la respuesta grabada contesta (coseno). Por debajo, la pregunta va a la IA. Medido el 2026-11-15 con
 * 30 frases: las del tema puntúan 0,76-0,97 con su pregunta; las ajenas («next», «la capital de Francia», «tell me a
 * joke», «what time is it») no pasan de 0,66.
 */
export const UMBRAL_PARECIDA = 0.74
/** La mejor tiene que ganarle a la segunda (de otra pregunta) por al menos esto; si no, es ambigua y va a la IA. */
const MARGEN = 0.03
// Caliente tarda ~0,3 s. Si el servidor se traba, mejor pasar ya a la IA que hacer esperar a quien habla.
const TIMEOUT_MS = 1200

type Banco = { ids: string[]; vectores: Float32Array[] }
let banco: Promise<Banco | null> | undefined

const conTope = (ms: number) => AbortSignal.timeout(ms)

async function incrustarEnAlguno(textos: string[], ms: number): Promise<Float32Array[] | null> {
  for (const url of servidoresRag()) {
    try {
      return await incrustar(textos, url, conTope(ms))
    } catch {
      /* el siguiente servidor */
    }
  }
  return null
}

const cargarBanco = (): Promise<Banco | null> =>
  (banco ??= (async () => {
    const ids: string[] = []
    const textos: string[] = []
    for (const p of PREGUNTAS)
      for (const v of p.variantes)
        for (const t of [v.en, v.es]) {
          ids.push(p.id)
          textos.push(t)
        }
    // Frío, bge-m3 tarda en cargar: el banco tiene más margen que una pregunta.
    const vectores = await incrustarEnAlguno(textos, 15_000)
    if (!vectores) {
      banco = undefined // se reintenta en el próximo pedido
      return null
    }
    return { ids, vectores }
  })())

/** Para que el primer pedido real no pague la carga del banco (se llama al abrir la conversación por voz). */
export const precalentarParecidas = () => void cargarBanco()

export type Parecida = { id: string; puntaje: number; segundo: number } | null

/** La pregunta frecuente más parecida a `texto`, o null si nada se parece lo suficiente (o si falló algo). */
export async function parecida(texto: string): Promise<Parecida> {
  const t = texto.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 400)
  if (t.split(" ").length < 2) return null
  try {
    const b = await cargarBanco()
    if (!b) return null
    const [q] = (await incrustarEnAlguno([t], TIMEOUT_MS)) ?? []
    if (!q) return null
    // La mejor variante de cada pregunta.
    const mejor = new Map<string, number>()
    b.vectores.forEach((v, i) => {
      let c = 0
      for (let j = 0; j < v.length; j++) c += v[j]! * q[j]!
      if (c > (mejor.get(b.ids[i]!) ?? -1)) mejor.set(b.ids[i]!, c)
    })
    const orden = [...mejor.entries()].sort((a, z) => z[1] - a[1])
    const [id, puntaje] = orden[0] ?? ["", 0]
    const segundo = orden[1]?.[1] ?? 0
    return puntaje >= UMBRAL_PARECIDA && puntaje - segundo >= MARGEN ? { id, puntaje, segundo } : null
  } catch {
    return null
  }
}

/** Para las pruebas y el ajuste del umbral: la mejor y la segunda, sin umbral. */
export async function puntajes(texto: string): Promise<[string, number][]> {
  const b = await cargarBanco()
  const [q] = (await incrustarEnAlguno([texto], TIMEOUT_MS)) ?? []
  if (!b || !q) return []
  const mejor = new Map<string, number>()
  b.vectores.forEach((v, i) => {
    let c = 0
    for (let j = 0; j < v.length; j++) c += v[j]! * q[j]!
    if (c > (mejor.get(b.ids[i]!) ?? -1)) mejor.set(b.ids[i]!, c)
  })
  return [...mejor.entries()].sort((a, z) => z[1] - a[1]).slice(0, 3)
}
