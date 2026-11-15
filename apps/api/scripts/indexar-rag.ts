// Construye el índice del RAG de EVA: trocea la documentación por títulos, pide los embeddings a nuestro
// Ollama (bge-m3) y escribe `apps/api/src/assistant/indice-rag.json`. `docs/` y `luna-recursos/` no entran
// en la imagen de Docker, por eso el índice se genera aquí y se sube al repo.
// Uso, desde la raíz: `npx tsx apps/api/scripts/indexar-rag.ts` (`--seco` trocea y resume sin pedir embeddings).
import { readFile, readdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { incrustar, ragModelo, servidoresRag, type Trozo } from "../src/assistant/rag.js"

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url))
const SALIDA = fileURLToPath(new URL("../src/assistant/indice-rag.json", import.meta.url))

const FIJOS = [
  "README.md",
  "prototipos/lunar-map/README.md",
  "apps/web/src/features/map-3d/CLAUDE.md",
  "luna-recursos/investigacion/SPEC.md",
  "luna-recursos/investigacion/fuentes.md",
  "luna-recursos/investigacion/matriz-trazabilidad.md",
  "voz/LEEME.md",
]

// Tamaños en caracteres. Un trozo se cierra entre OBJ_MIN y OBJ_MAX; TOPE solo lo roza una unidad larga.
const OBJ_MIN = 450
const OBJ_MAX = 1100
const TOPE = 1500
// Una sección más corta que esto se junta con su primera subsección en vez de quedar suelta.
const MIN_SUELTO = 300
const LOTE = 16

// Unidad: lo que no se parte por la mitad (un párrafo, una fila de tabla, un ítem de lista, un bloque de código).
type Unidad = { texto: string; tabla?: string; codigo?: boolean; navega: boolean; prosa: number }
type Seccion = { rastro: string[]; nivel: number; unidades: Unidad[] }

const ENLACE = /!?\[([^\]]*)\]\(([^)\s]*)[^)]*\)/g
const letras = (t: string) => (t.match(/\p{L}/gu) ?? []).length

// Limpieza ligera: se va lo que es sintaxis (URL de los enlaces, negritas, comillas de código) y queda la prosa.
const limpiar = (t: string) =>
  t
    .replace(ENLACE, "$1")
    .replace(/<((?:https?:\/\/|mailto:)[^>]+)>/g, "$1")
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/g, "$1")
    .replace(/`+([^`]*)`+/g, "$1")
    .replace(/[ \t]+/g, " ")
    .trim()

const celdas = (fila: string) =>
  fila
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((c) => limpiar(c.replace(/\\\|/g, "|")))
    .join(" | ")

const unidad = (crudo: string, texto: string, extra: Partial<Unidad> = {}): Unidad => {
  const enlaces = [...crudo.matchAll(ENLACE)]
  return {
    texto,
    // Enlace a otro documento o a un ancla: señal de índice, no de contenido.
    navega: enlaces.some((e) => !/^(https?:|mailto:)/i.test(e[2] ?? "")),
    prosa: letras(limpiar(crudo.replace(ENLACE, ""))),
    ...extra,
  }
}

function secciones(md: string): Seccion[] {
  const lineas = md
    .replace(/\r\n?/g, "\n")
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
  const rastro: string[] = []
  const salida: Seccion[] = [{ rastro: [], nivel: 0, unidades: [] }]
  let actual = salida[0]!
  let abierto: string[] | null = null // párrafo o ítem en curso
  let cerca: string | null = null // marca del bloque de código abierto
  let codigo: string[] = []
  let cabecera: string | undefined // cabecera de la tabla en curso

  const cerrar = () => {
    if (!abierto) return
    const crudo = abierto.join(" ")
    const texto = limpiar(crudo)
    if (texto) actual.unidades.push(unidad(crudo, texto))
    abierto = null
  }

  for (let n = 0; n < lineas.length; n++) {
    const linea = lineas[n]!
    if (cerca) {
      if (linea.trim().startsWith(cerca)) {
        const texto = codigo.join("\n").replace(/\s+$/, "")
        if (texto.trim()) actual.unidades.push({ texto, codigo: true, navega: false, prosa: letras(texto) })
        cerca = null
      } else codigo.push(linea.replace(/\s+$/, ""))
      continue
    }
    const valla = /^\s*(`{3,}|~{3,})/.exec(linea)
    if (valla) {
      cerrar()
      cerca = valla[1]!
      codigo = []
      continue
    }
    const titulo = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(linea)
    if (titulo) {
      cerrar()
      cabecera = undefined
      const nivel = titulo[1]!.length
      rastro.length = nivel - 1
      for (let i = 0; i < nivel - 1; i++) rastro[i] ??= ""
      rastro[nivel - 1] = limpiar(titulo[2]!)
      actual = { rastro: rastro.filter(Boolean), nivel, unidades: [] }
      salida.push(actual)
      continue
    }
    if (!linea.trim() || /^\s*([-*_])(\s*\1){2,}\s*$/.test(linea)) {
      cerrar()
      cabecera = undefined
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(linea)) {
      cerrar()
      const separador = (l: string | undefined) => !!l && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l)
      if (separador(linea)) continue
      if (cabecera === undefined && separador(lineas[n + 1])) {
        cabecera = celdas(linea)
        continue
      }
      actual.unidades.push(unidad(linea, celdas(linea), { tabla: cabecera ?? "" }))
      continue
    }
    cabecera = undefined
    const texto = linea.replace(/^\s*>\s?/, "")
    const item = /^\s*([-*+]|\d{1,3}[.)])\s+(.*)$/.exec(texto)
    if (item) {
      cerrar()
      abierto = [`${/\d/.test(item[1]!) ? item[1] : "-"} ${item[2]}`]
    } else if (abierto) abierto.push(texto.trim())
    else abierto = [texto.trim()]
  }
  cerrar()
  return salida
}

// Solo si una unidad sola pasa del tope (un bloque de código largo, un párrafo enorme): por líneas o por frases.
function partir(u: Unidad): Unidad[] {
  if (u.texto.length <= TOPE) return [u]
  const piezas = u.codigo ? u.texto.split("\n") : u.texto.split(/(?<=[.!?…:;])\s+/)
  const union = u.codigo ? "\n" : " "
  const partes: string[] = []
  let cur = ""
  for (const p of piezas.flatMap((x) => (x.length > OBJ_MAX ? (x.match(new RegExp(`.{1,${OBJ_MAX}}(\\s|$)|.{1,${OBJ_MAX}}`, "gs")) ?? [x]) : [x]))) {
    if (cur && cur.length + p.length + 1 > OBJ_MAX) {
      partes.push(cur)
      cur = ""
    }
    cur = cur ? cur + union + p : p
  }
  if (cur) partes.push(cur)
  return partes.map((texto) => ({ ...u, texto, prosa: letras(texto) }))
}

type Borrador = { unidades: Unidad[]; largo: number }
const textoDe = (b: Borrador) => {
  const lineas: string[] = []
  let tabla: string | undefined
  for (const u of b.unidades) {
    // La cabecera de la tabla se repite en cada trozo: una fila sin sus columnas no se entiende.
    if (u.tabla !== undefined && u.tabla !== tabla && u.tabla) lineas.push(u.tabla)
    tabla = u.tabla
    lineas.push(u.texto)
  }
  return lineas.join("\n")
}

function empaquetar(unidades: Unidad[]): Borrador[] {
  const hechos: Borrador[] = []
  let cur: Borrador = { unidades: [], largo: 0 }
  const cerrar = () => {
    if (!cur.unidades.length) return
    const ultima = cur.unidades.at(-1)!
    // Un párrafo que termina en dos puntos presenta lo que sigue: se va con ello al trozo siguiente.
    const sigue = cur.unidades.length > 1 && ultima.tabla === undefined && !ultima.codigo && /:$/.test(ultima.texto) ? cur.unidades.pop()! : null
    cur.largo = textoDe(cur).length
    hechos.push(cur)
    cur = { unidades: sigue ? [sigue] : [], largo: sigue ? sigue.texto.length : 0 }
  }
  for (const u of unidades.flatMap(partir)) {
    const costo = u.texto.length + 1 + (u.tabla && cur.unidades.at(-1)?.tabla !== u.tabla ? u.tabla.length + 1 : 0)
    if (cur.largo && (cur.largo + costo > TOPE || (cur.largo >= OBJ_MIN && cur.largo + costo > OBJ_MAX))) cerrar()
    cur.unidades.push(u)
    cur.largo = textoDe(cur).length
  }
  cerrar()
  // Una cola corta se une al trozo anterior si entre los dos no pasan del tope.
  const cola = hechos.at(-1)
  const previo = hechos.at(-2)
  if (cola && previo && cola.largo < MIN_SUELTO && previo.largo + cola.largo + 1 <= TOPE) {
    previo.unidades.push(...cola.unidades)
    previo.largo = textoDe(previo).length
    hechos.pop()
  }
  return hechos
}

// Trozos que solo mandan a otro sitio (índices, tablas de «lee tal documento») o que no dicen nada.
const esIndice = (b: Borrador) => {
  const prosa = b.unidades.reduce((s, u) => s + u.prosa, 0)
  if (prosa < 40) return true
  const navegan = b.unidades.filter((u) => u.navega).length
  return b.unidades.length >= 3 && navegan / b.unidades.length >= 0.7 && prosa / b.unidades.length < 70
}

type TrozoIndexado = Trozo & { entrada: string }
function trocear(ruta: string, md: string, saltados: string[]): TrozoIndexado[] {
  const secs = secciones(md)
  const documento = secs.find((s) => s.nivel === 1)?.rastro[0] ?? ruta
  const trozos: TrozoIndexado[] = []
  let herencia: Unidad[] = []
  secs.forEach((s, i) => {
    const unidades = [...herencia, ...s.unidades]
    herencia = []
    if (!unidades.length) return
    const siguiente = secs[i + 1]
    const largo = unidades.reduce((n, u) => n + u.texto.length + 1, 0)
    if (largo < MIN_SUELTO && siguiente && siguiente.nivel > s.nivel) {
      herencia = unidades
      return
    }
    // El título del documento ya va en la ruta: el rastro guarda de ahí para abajo.
    const titulo = (s.rastro.length > 1 && s.rastro[0] === documento ? s.rastro.slice(1) : s.rastro).join(" › ") || documento
    for (const b of empaquetar(unidades)) {
      if (esIndice(b)) {
        saltados.push(`${ruta} › ${titulo} (${b.largo} car.)`)
        continue
      }
      const texto = textoDe(b)
      // Al embedding le sirve saber de qué documento y sección es el texto; al modelo se le da aparte.
      trozos.push({ ruta, titulo, texto, entrada: `${documento}${titulo === documento ? "" : ` › ${titulo}`}\n${texto}` })
    }
  })
  return trozos
}

async function incrustarLote(textos: string[]): Promise<Float32Array[]> {
  let ultimo: unknown
  for (const url of servidoresRag()) {
    try {
      return await incrustar(textos, url, AbortSignal.timeout(180_000))
    } catch (e) {
      ultimo = e
      console.warn(`  ${url} falló (${e instanceof Error ? e.message : e}); pruebo el siguiente`)
    }
  }
  throw ultimo
}

const seco = process.argv.includes("--seco")
const docs = (await readdir(`${RAIZ}docs`)).filter((f) => f.endsWith(".md")).sort().map((f) => `docs/${f}`)
const rutas = [FIJOS[0]!, ...docs, ...FIJOS.slice(1)]

const trozos: TrozoIndexado[] = []
const saltados: string[] = []
let archivos = 0
console.log("Troceando:")
for (const ruta of rutas) {
  const md = await readFile(RAIZ + ruta, "utf8").catch(() => null)
  if (md === null) {
    console.warn(`  FALTA ${ruta}`)
    continue
  }
  const suyos = trocear(ruta, md, saltados)
  archivos++
  trozos.push(...suyos)
  console.log(`  ${String(suyos.length).padStart(4)} trozos  ${String(md.length).padStart(7)} car.  ${ruta}`)
}
const largos = trozos.map((t) => t.texto.length).sort((a, b) => a - b)
const en = (p: number) => largos[Math.min(largos.length - 1, Math.floor(p * largos.length))]
console.log(`Largo de los trozos: mín ${largos[0]}, p10 ${en(0.1)}, mediana ${en(0.5)}, p90 ${en(0.9)}, máx ${largos.at(-1)}; ${largos.filter((l) => l > TOPE).length} pasan de ${TOPE}`)
if (saltados.length) console.log(`Saltados por ser índice o estar vacíos (${saltados.length}):\n${saltados.map((s) => `  ${s}`).join("\n")}`)

if (seco) {
  if (process.argv.includes("--ver")) for (const t of trozos) console.log(`\n=== ${t.ruta} › ${t.titulo} (${t.texto.length})\n${t.texto}`)
  process.exit(0)
}

console.log(`Embeddings (${ragModelo()}) de ${trozos.length} trozos en lotes de ${LOTE}…`)
const inicio = Date.now()
const vectores: Float32Array[] = []
for (let i = 0; i < trozos.length; i += LOTE) {
  vectores.push(...(await incrustarLote(trozos.slice(i, i + LOTE).map((t) => t.entrada))))
  if (process.stdout.isTTY) process.stdout.write(`\r  ${vectores.length}/${trozos.length}`)
}
if (process.stdout.isTTY) process.stdout.write("\n")
const dims = vectores[0]?.length ?? 0
if (!dims || vectores.some((v) => v.length !== dims)) throw new Error("los embeddings no tienen todos la misma dimensión")

// `incrustar` ya los deja con longitud 1: cada componente cabe en un int8 con escala 127 (4× menos que float32).
const matriz = new Int8Array(trozos.length * dims)
vectores.forEach((v, i) => {
  for (let j = 0; j < dims; j++) matriz[i * dims + j] = Math.max(-127, Math.min(127, Math.round(v[j]! * 127)))
})

// Un trozo por línea, para que el diff del índice se pueda leer.
const json =
  `{"modelo":${JSON.stringify(ragModelo())},"dims":${dims},"generadoUTC":${JSON.stringify(new Date().toISOString())},"trozos":[\n` +
  trozos.map(({ ruta, titulo, texto }) => JSON.stringify({ ruta, titulo, texto })).join(",\n") +
  `\n],"vectores":"${Buffer.from(matriz.buffer).toString("base64")}"}\n`
await writeFile(SALIDA, json)
const bytes = Buffer.byteLength(json)
console.log(`Listo en ${((Date.now() - inicio) / 1000).toFixed(1)} s: ${archivos} archivos, ${trozos.length} trozos, ${dims} dims, ${bytes} bytes (${(bytes / 1024 / 1024).toFixed(2)} MB) → apps/api/src/assistant/indice-rag.json`)
if (bytes > 2 * 1024 * 1024) console.warn("AVISO: el índice pasa de 2 MB; conviene trozos más grandes o menos documentos.")
