// `indice-rag.json` es contenido GENERADO: sale de `npx tsx apps/api/scripts/indexar-rag.ts` (desde la raíz), un script escrito con un asistente de programación con IA; los embeddings son de bge-m3 en nuestro Ollama.
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { esInterno, sinInterno } from "./interno.js"

// Recuperación (RAG) sobre la documentación del proyecto. El índice va junto a este archivo y la ruta
// sale de aquí, no del cwd: en producción la imagen corre el API desde el código (`tsx apps/api/src/index.ts`),
// así que el JSON entra con el `COPY . .` aunque `docs/` y `luna-recursos/` estén en `.dockerignore`.
const RUTA_INDICE = fileURLToPath(new URL("./indice-rag.json", import.meta.url))

// Los embeddings salen del mismo Ollama del chat de texto (Geografo). No hay respaldo por defecto: el otro servidor
// es la Z6, donde vive el 27B de la voz, y no se comprobó que cargar ahí bge-m3 no lo desaloje de la GPU. Sin
// Geografo, EVA responde sin extractos. Para activar un respaldo, `RAG_RESPALDO_URL=http://…` en el `.env`.
const ragUrl = () => process.env.RAG_URL ?? process.env.TEXTO_URL ?? "http://100.117.204.80:11434"
const ragRespaldoUrl = () => process.env.RAG_RESPALDO_URL ?? ""
export const ragModelo = () => process.env.RAG_MODELO ?? "bge-m3"
export const servidoresRag = (): string[] => [...new Set([ragUrl(), ragRespaldoUrl()])].filter(Boolean)

// Presupuesto total de la pregunta (los dos servidores juntos): pasado esto se responde sin extractos.
const TIMEOUT_MS = 2500
// El embedding se corta un poco antes, para que quien espera reciba el fallo dentro del presupuesto.
const TIMEOUT_EMBEDDING_MS = TIMEOUT_MS - 100
// Si el primero no contestó en este tiempo (caliente tarda ~0,3 s), se pregunta también al respaldo.
const RESPALDO_TRAS_MS = 900
// Frío, bge-m3 tarda 5–10 s en cargar: se deja en la GPU entre preguntas, como el clasificador de z6.ts.
const KEEP_ALIVE = "2h"
// Tras un fallo no se vuelve a intentar enseguida: con el servidor caído cada respuesta esperaría el presupuesto entero.
const PAUSA_TRAS_FALLO_MS = 15_000
const MAX_PREGUNTA = 600
const MAX_CACHE = 50

// Cuándo una pregunta trae extractos: ajustado con 41 preguntas reales en inglés y español y comprobado
// con otras 25 (2026-11-15).
// El coseno solo no separa: "hello" da 0,49 con su mejor trozo y "What does NO-GO mean?" da 0,44. Lo que
// distingue a una frase cualquiera es que se parece un poco a todo, así que al mejor trozo se le resta
// parte de la media de la pregunta contra todo el índice: las del dominio quedan en 0,24–0,39 y las
// ajenas ("best pizza in Lima?", saludos) en 0,15–0,23.
const PISO = 0.235
const PESO_MEDIA = 0.7
// Pasada esa puerta entran los trozos que quedan cerca del mejor, hasta K.
const MARGEN = 0.05
const K = 4
// En el bloque del prompt, como mucho dos por documento: el SPEC y los docs repiten lo mismo con otras palabras.
const MAX_POR_RUTA = 2
const MAX_BLOQUE = 2600
const MAX_BLOQUE_BREVE = 1500

const CABECERA =
  "Reference excerpts from the project's own documentation, retrieved for this question. They may be in Spanish; " +
  "answer in the user's language. They can describe the earlier prototype or plans as well as the current app: " +
  "for what the app does today, the facts above win. Use an excerpt only if it answers the question; when you do, " +
  "say where it comes from in a few words (for example 'the planner notes say'). They are internal notes: never quote " +
  "file or folder names, code, function names or how the app is built inside; use only the facts about the Moon, the " +
  "missions and what the app shows."

// Nombre corto de cada documento, para que el modelo pueda decir de dónde sale sin leer la ruta.
const NOMBRES: Record<string, string> = {
  "README.md": "project README",
  "docs/README.md": "documentation index",
  "docs/01-reto.md": "challenge brief",
  "docs/02-problema-y-usuario.md": "problem and user notes",
  "docs/03-producto.md": "product notes",
  "docs/04-planificador.md": "planner notes",
  "docs/05-calculos.md": "engine calculation notes",
  "docs/06-simulador.md": "landing simulator notes",
  "docs/07-pruebas-y-validacion.md": "tests and validation notes",
  "docs/08-datos-y-fuentes.md": "data and sources notes",
  "docs/09-entrega.md": "submission rules notes",
  "docs/10-diferencias-spec-codigo.md": "spec versus code notes",
  "docs/11-flujo-y-arquitectura.md": "flow and architecture notes",
  "docs/SUBMISSION.md": "submission text",
  "prototipos/lunar-map/README.md": "Lunar Map prototype notes",
  "apps/web/src/features/map-3d/CLAUDE.md": "3D map notes",
  "luna-recursos/investigacion/SPEC.md": "prototype spec",
  "luna-recursos/investigacion/fuentes.md": "source register",
  "luna-recursos/investigacion/matriz-trazabilidad.md": "traceability matrix",
  "voz/LEEME.md": "voice service notes",
}
const nombreDe = (ruta: string) => NOMBRES[ruta] ?? (ruta.split("/").pop() ?? ruta).replace(/\.md$/i, "")

export type Trozo = { ruta: string; titulo: string; texto: string }
export type Hallazgo = Trozo & { puntaje: number }
type ArchivoIndice = { modelo: string; dims: number; generadoUTC: string; trozos: Trozo[]; vectores: string }
type Indice = { dims: number; trozos: Trozo[]; vectores: Int8Array; normas: Float32Array; puntajes: Float32Array }

/**
 * Embeddings de `textos` en un servidor de Ollama, normalizados a longitud 1. Lo usan la búsqueda y el
 * script que construye el índice, para que pregunta y trozos pasen exactamente por lo mismo.
 */
export async function incrustar(textos: string[], url: string, señal: AbortSignal): Promise<Float32Array[]> {
  const r = await fetch(`${url}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: señal,
    body: JSON.stringify({ model: ragModelo(), input: textos, keep_alive: KEEP_ALIVE }),
  })
  if (!r.ok) throw new Error(`embeddings: HTTP ${r.status}`)
  const { embeddings } = (await r.json()) as { embeddings?: number[][] }
  if (!Array.isArray(embeddings) || embeddings.length !== textos.length) throw new Error("embeddings: respuesta incompleta")
  return embeddings.map((e) => {
    const v = Float32Array.from(e)
    let suma = 0
    for (let j = 0; j < v.length; j++) suma += v[j]! * v[j]!
    const norma = Math.sqrt(suma) || 1
    for (let j = 0; j < v.length; j++) v[j] = v[j]! / norma
    return v
  })
}

let carga: Promise<Indice | null> | undefined
let indice: Indice | null | undefined // undefined: todavía no se intentó

const leerIndice = async (): Promise<Indice | null> => {
  try {
    const a = JSON.parse(await readFile(RUTA_INDICE, "utf8")) as ArchivoIndice
    // Vectores de otro modelo no se pueden comparar con la pregunta: mejor sin RAG que con ruido.
    if (a.modelo !== ragModelo()) throw new Error(`el índice es de ${a.modelo} y RAG_MODELO es ${ragModelo()}`)
    const crudo = Buffer.from(a.vectores, "base64")
    const n = a.trozos.length
    if (!n || crudo.length !== n * a.dims) throw new Error("el tamaño de los vectores no cuadra con los trozos")
    const vectores = new Int8Array(crudo.buffer, crudo.byteOffset, crudo.length)
    // La cuantización a int8 mueve un poco la longitud de cada vector: se guarda para el coseno exacto.
    const normas = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      let suma = 0
      for (let j = i * a.dims, fin = j + a.dims; j < fin; j++) suma += vectores[j]! * vectores[j]!
      normas[i] = Math.sqrt(suma) || 1
    }
    return { dims: a.dims, trozos: a.trozos, vectores, normas, puntajes: new Float32Array(n) }
  } catch (e) {
    console.warn(`RAG desactivado: ${e instanceof Error ? e.message : "no se pudo leer el índice"}`)
    return null
  }
}

const cargar = (): Promise<Indice | null> =>
  (carga ??= leerIndice().then((i) => {
    indice = i
    if (i) precalentarRag()
    return i
  }))

/** Para el health check: el índice está cargado o se puede cargar. De paso lo va cargando. */
export const ragListo = (): boolean => {
  if (indice !== undefined) return indice !== null
  void cargar()
  return existsSync(RUTA_INDICE)
}

// Carga bge-m3 en la GPU sin esperar a nadie (con paciencia: un pedido cortado a los 2,5 s no termina
// de cargarlo). Al arrancar, solo el servidor principal; tras un fallo, también el respaldo, que frío no
// alcanza a contestar dentro del presupuesto. Como mucho una vez por minuto.
let ultimoCalentado = 0
export const precalentarRag = (conRespaldo = false): void => {
  if (Date.now() - ultimoCalentado < 60_000) return
  ultimoCalentado = Date.now()
  for (const url of conRespaldo ? servidoresRag() : [ragUrl()])
    void incrustar(["warm up"], url, AbortSignal.timeout(60_000)).catch(() => {})
}

let enPausaHasta = 0

// El primer servidor y, si tarda o falla, el respaldo; gana el que conteste antes. Todo dentro del presupuesto.
async function incrustarPregunta(texto: string): Promise<Float32Array> {
  const corte = new AbortController()
  const reloj = setTimeout(() => corte.abort(), TIMEOUT_EMBEDDING_MS)
  const [primero, respaldo] = servidoresRag()
  const pedir = (url: string) =>
    incrustar([texto], url, corte.signal).then((v) => {
      if (!v[0]) throw new Error("embeddings: respuesta vacía")
      return v[0]
    })
  let espera: ReturnType<typeof setTimeout> | undefined
  try {
    if (!primero) throw new Error("sin servidor de embeddings")
    if (!respaldo) return await pedir(primero)
    return await new Promise<Float32Array>((resolve, reject) => {
      let fallos = 0
      let lanzado = false
      const lanzarRespaldo = () => {
        if (lanzado) return
        lanzado = true
        pedir(respaldo).then(resolve, alFallar)
      }
      const alFallar = (e: unknown) => (++fallos === 2 ? reject(e) : lanzarRespaldo())
      espera = setTimeout(lanzarRespaldo, RESPALDO_TRAS_MS)
      pedir(primero).then(resolve, alFallar)
    })
  } catch (e) {
    // Lo más probable es que el modelo estuviera descargado: que quede listo para la pregunta siguiente.
    precalentarRag(true)
    enPausaHasta = Date.now() + PAUSA_TRAS_FALLO_MS
    throw e
  } finally {
    clearTimeout(reloj)
    clearTimeout(espera)
    corte.abort() // corta al que perdió la carrera
  }
}

// Últimas preguntas → su vector (se guarda la promesa: dos pedidos iguales a la vez comparten el embedding).
const cache = new Map<string, Promise<Float32Array>>()
const vectorDe = (pregunta: string): Promise<Float32Array> => {
  const clave = pregunta.toLowerCase()
  const previo = cache.get(clave)
  if (previo) {
    cache.delete(clave)
    cache.set(clave, previo) // vuelve al final: es la más reciente
    return previo
  }
  if (Date.now() < enPausaHasta) return Promise.reject(new Error("embeddings en pausa"))
  const nuevo = incrustarPregunta(pregunta)
  cache.set(clave, nuevo)
  nuevo.catch(() => {
    if (cache.get(clave) === nuevo) cache.delete(clave) // un fallo no se recuerda
  })
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!)
  return nuevo
}

/**
 * Los `k` trozos de la documentación más parecidos a la pregunta, de mayor a menor (`puntaje` es el coseno).
 * Devuelve [] si el mejor no pasa el piso (ver PISO) y nunca lanza: si falla el índice o el embedding, [].
 */
let internosDe: Trozo[] | null = null
let internos: boolean[] = []

export async function buscar(pregunta: string, k: number = K, piso: number = PISO, margen: number = MARGEN): Promise<Hallazgo[]> {
  try {
    const texto = pregunta.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, MAX_PREGUNTA)
    if (!/\p{L}{2}/u.test(texto) || k < 1) return []
    const idx = await cargar()
    if (!idx) return []
    const q = await vectorDe(texto)
    if (q.length !== idx.dims) return []
    const { dims, vectores, normas, puntajes, trozos } = idx
    // Lo del proyecto por dentro no se entrega nunca (./interno.ts): queda fuera de la búsqueda.
    if (internosDe !== trozos) [internosDe, internos] = [trozos, trozos.map(esInterno)]
    // Coseno de la pregunta (longitud 1) contra cada fila int8. Sin await ni objetos dentro del bucle.
    let suma = 0
    let mejor = -1
    for (let i = 0, base = 0; i < puntajes.length; i++, base += dims) {
      let punto = 0
      for (let j = 0; j < dims; j++) punto += q[j]! * vectores[base + j]!
      const p = internos[i] ? -1 : punto / normas[i]!
      puntajes[i] = p
      if (internos[i]) continue
      suma += p
      if (p > mejor) mejor = p
    }
    if (mejor - (PESO_MEDIA * suma) / puntajes.length < piso) return []
    // Los k mejores por inserción: k es pequeño.
    const corte = mejor - margen
    const mejores: number[] = []
    for (let i = 0; i < puntajes.length; i++) {
      const p = puntajes[i]!
      if (p < corte || (mejores.length === k && p <= puntajes[mejores[k - 1]!]!)) continue
      let pos = mejores.length
      while (pos > 0 && puntajes[mejores[pos - 1]!]! < p) pos--
      mejores.splice(pos, 0, i)
      if (mejores.length > k) mejores.pop()
    }
    return mejores.map((i) => ({ ...trozos[i]!, puntaje: Math.round(puntajes[i]! * 1000) / 1000 }))
  } catch {
    return []
  }
}

// Corta en un fin de línea o de frase, no a media palabra.
const recortar = (texto: string, max: number): string => {
  if (texto.length <= max) return texto
  const trozo = texto.slice(0, max - 2)
  const corte = Math.max(trozo.lastIndexOf("\n"), trozo.lastIndexOf(". ") + 1)
  const hasta = corte > max * 0.6 ? corte : trozo.lastIndexOf(" ")
  return `${trozo.slice(0, hasta > 0 ? hasta : trozo.length).trimEnd()} …`
}

const etiqueta = (h: Hallazgo): string => {
  const titulo = h.titulo.length <= 90 ? h.titulo : recortar(h.titulo.split(" › ").pop() ?? h.titulo, 90)
  return `[${nombreDe(h.ruta)} › ${sinInterno(titulo)}]` // sin la ruta del archivo: lo interno no sale (./interno.ts)
}

const armarBloque = (hallazgos: Hallazgo[], K: number, MAX_BLOQUE: number): string => {
  if (!hallazgos.length) return ""
  const porRuta = new Map<string, number>()
  let elegidos = hallazgos
    .filter((h) => {
      const n = porRuta.get(h.ruta) ?? 0
      porRuta.set(h.ruta, n + 1)
      return n < MAX_POR_RUTA
    })
    .slice(0, K)
  const etiquetas = elegidos.map(etiqueta)
  const libre = (n: number) =>
    MAX_BLOQUE - CABECERA.length - etiquetas.slice(0, n).reduce((s, e) => s + e.length + 3, 0)
  // El cuarto extracto entra solo si cabe entero con los otros tres; con tres ya se reparte el espacio.
  if (elegidos.length > 3 && elegidos.reduce((s, h) => s + h.texto.length, 0) > libre(elegidos.length)) elegidos = elegidos.slice(0, 3)
  // Reparto parejo: lo que no usa un extracto corto se lo quedan los largos.
  let resto = libre(elegidos.length)
  let tope = Infinity
  const largos = elegidos.map((h) => h.texto.length).sort((a, b) => a - b)
  for (let i = 0; i < largos.length; i++) {
    const parte = Math.floor(resto / (largos.length - i))
    if (largos[i]! > parte) {
      tope = parte
      break
    }
    resto -= largos[i]!
  }
  return [CABECERA, ...elegidos.map((h, i) => `${etiquetas[i]}\n${recortar(sinInterno(h.texto), tope)}`)].join("\n\n")
}

/**
 * Bloque listo para añadir al prompt de sistema con los extractos de la pregunta, o "" si no hay nada
 * útil, si falla la recuperación o si pasa el tiempo. Nunca lanza ni retrasa la respuesta más de TIMEOUT_MS.
 */
export async function contextoRag(pregunta: string, breve = false): Promise<string> {
  let reloj: ReturnType<typeof setTimeout> | undefined
  try {
    const tarde = new Promise<Hallazgo[]>((resolve) => {
      reloj = setTimeout(() => resolve([]), TIMEOUT_MS)
    })
    // Se piden más de los que entran: el filtro por documento descarta algunos.
    // `breve` (la voz): dos extractos y la mitad del texto. Cada carácter de más es tiempo antes de la primera palabra.
    return armarBloque(await Promise.race([buscar(pregunta, K + 4), tarde]), breve ? 2 : K, breve ? MAX_BLOQUE_BREVE : MAX_BLOQUE)
  } catch {
    return ""
  } finally {
    clearTimeout(reloj)
  }
}
