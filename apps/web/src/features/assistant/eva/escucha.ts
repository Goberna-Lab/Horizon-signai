// Qué quiso decir la persona cuando le habla a EVA (manos libres), sin IA y al instante. Recibe la transcripción y lo
// que EVA está esperando en ese momento (el nombre, la oferta, uno de los tres caminos, la respuesta del repaso o un
// paso del flujo) y devuelve qué hacer: una orden («siguiente», «otra vez», «para»), una de las opciones, el nombre, o nada.
// Lo que no reconoce aquí lo resuelve EVA con la pregunta frecuente más parecida o con la IA (ver EvaCompanera).
//
// Regla: palabras clave, no un modelo. Las opciones se reconocen por su número («la dos», «second», «2») o por las
// palabras que solo tiene esa opción (una palabra que aparece en dos opciones no sirve para distinguirlas). Whisper
// escribe los números con cifras («mission 2»). Sin React ni DOM: se prueba con node (escucha.test.ts).
import { nombreDe } from "./idioma.ts"
import { intencionDe } from "./intencion.ts"

export type QueEspera = "nombre" | "oferta" | "camino" | "repaso" | "paso" | null

export type Entendido =
  | { tipo: "orden"; orden: "siguiente" | "repetir" | "parar" }
  | { tipo: "opcion"; k: number }
  | { tipo: "nombre"; nombre: string }
  | { tipo: "nada" }

const limpiar = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // Los códigos de misión («CR-01», «ps 03», «SR05») quedan en una sola palabra sin ceros: «cr1», «ps3», «sr5».
    .replace(/\b(cr|ps|sr|dg) ?0*(\d+)\b/g, "$1$2")

const VACIAS = new Set(
  (
    "the a an to of in on at for and or is are was were be it this that with too very only yes no do does did i you we my your our please " +
    "el la los las un una unos unas de del al y o en es son era fue por para con muy solo si no que lo le se mi tu su favor me te nos"
  ).split(" "),
)
// «one», «uno» y «una» también son pronombres («the one about…», «una de esas»): cuentan solo si nada más decide.
const DEBILES = new Set(["one", "uno", "una"])
const ORDINALES: string[][] = [
  ["1", "one", "first", "uno", "una", "primera", "primero"],
  ["2", "two", "second", "dos", "segunda", "segundo"],
  ["3", "three", "third", "tres", "tercera", "tercero"],
  ["4", "four", "fourth", "cuatro", "cuarta", "cuarto"],
]

/** Las palabras que sirven para reconocer una opción: sin vacías, sin las cortas y sin las que comparte con otra. */
export function palabrasDeOpciones(textos: string[][]): string[][] {
  const deCada = textos.map((variantes) => [...new Set(variantes.flatMap((v) => limpiar(v).split(" ")).filter((p) => p.length >= 3 && !VACIAS.has(p)))])
  const cuantas = new Map<string, number>()
  for (const ps of deCada) for (const p of ps) cuantas.set(p, (cuantas.get(p) ?? 0) + 1)
  return deCada.map((ps) => ps.filter((p) => cuantas.get(p) === 1))
}

/** Una palabra oída coincide con una clave si es igual o, en palabras largas, si empiezan igual (plural, género). */
const coincide = (oida: string, clave: string) => oida === clave || (clave.length >= 5 && oida.length >= 5 && oida.slice(0, 5) === clave.slice(0, 5))

/**
 * La opción que nombra la persona, o -1. `claves`: las de `palabrasDeOpciones`. Gana el número dicho («la dos») y, si
 * no hay número, la opción con más palabras propias en lo oído, siempre que no empate.
 */
export function opcionDe(texto: string, claves: string[][]): number {
  const oidas = limpiar(texto).split(" ").filter(Boolean)
  const ordinal = (fuerte: boolean) => {
    for (let k = 0; k < claves.length; k++) if (oidas.some((p) => ORDINALES[k]?.includes(p) && DEBILES.has(p) !== fuerte)) return k
    return -1
  }
  const fuerte = ordinal(true)
  if (fuerte >= 0) return fuerte
  const letras = limpiar(texto).match(/\b(?:option|opcion|letra|letter)\s+([abc])\b/)
  if (letras) return "abc".indexOf(letras[1]!)
  const puntos = claves.map((ps) => ps.filter((c) => oidas.some((o) => coincide(o, c))).length)
  const max = Math.max(0, ...puntos)
  if (max && puntos.filter((p) => p === max).length === 1) return puntos.indexOf(max)
  return ordinal(false)
}

/**
 * La oferta, por voz («¿Quieres aprender a hacer una misión lunar?»), en el orden de OFERTA (recorridos.ts): sí, o
 * solo la landing. Un «sí», «ok» o «dale» suelto también es el sí (ver `entender`).
 */
export const PALABRAS_OFERTA: string[][] = [
  ["si", "yes", "yeah", "yep", "sure", "claro", "dale", "vamos", "okay", "teach", "learn", "aprender", "aprendo", "ensename", "ensenar", "mission", "missions", "mision", "misiones"],
  ["landing", "pagina", "page", "portada", "home", "inicio", "solo", "just", "only", "nomas"],
]

/** Un «sí» dentro de una frase («claro que sí», «yes please», «of course»). */
const SI = /\b(si|yes|yeah|yep|sure|claro|dale|okay|ok|vamos|of course|por supuesto)\b/

/** Qué hacer con lo que dijo, según lo que EVA espera. Devuelve «nada» si hay que preguntárselo a otro (FAQ o IA). */
export function entender(texto: string, espera: QueEspera, opciones: string[][] = []): Entendido {
  const t = limpiar(texto)
  if (!t) return { tipo: "nada" }
  const palabras = t.split(" ")
  const orden = intencionDe(texto)

  if (espera === "nombre") {
    if (orden === "parar" || /\b(skip|saltar|prefiero no|no quiero)\b/.test(t)) return { tipo: "nombre", nombre: "" }
    if (palabras.length <= 5 && !/[?¿]/.test(texto)) return { tipo: "nombre", nombre: nombreDe(texto) }
    return { tipo: "nada" }
  }
  if (espera === "oferta") {
    const k = opcionDe(texto, PALABRAS_OFERTA)
    if (k >= 0) return { tipo: "opcion", k }
    if (orden === "siguiente") return { tipo: "opcion", k: 0 } // «ok», «dale», «vamos»: es el sí
    if (orden === "parar") return { tipo: "orden", orden: "parar" }
    return { tipo: "nada" }
  }
  if (espera === "camino" || espera === "repaso") {
    const k = opcionDe(texto, palabrasDeOpciones(opciones))
    if (k >= 0) return { tipo: "opcion", k }
    // Una pregunta de sí o no («¿Quieres ver…?», dos opciones, la primera es el sí): «sí», «dale», «ok» la eligen.
    if (espera === "camino" && opciones.length === 2 && (orden === "siguiente" || (SI.test(t) && !/\bno\b/.test(t)))) return { tipo: "opcion", k: 0 }
    // Aquí no se sigue con «siguiente»: hay que elegir o contestar. Sí se puede pedir que lo repita o que se calle.
    if (orden === "repetir" || orden === "parar") return { tipo: "orden", orden }
    return { tipo: "nada" }
  }
  if (espera === "paso" && orden !== "pregunta") return { tipo: "orden", orden }
  return { tipo: "nada" }
}

/**
 * ¿Lo oído es su propia voz colándose por los parlantes? Cuenta las palabras con significado (sin vacías ni cortas) de
 * lo oído que están en la frase que EVA dice: desde `umbral` (40 % por defecto), es eco. Whisper transcribe mal pedazos de
 * su voz, por eso no se pide que coincida todo. Sin palabras con significado («ok», «yes»), cuenta todas.
 */
export function esEco(oido: string, frase: string, umbral = 0.4): boolean {
  const todas = limpiar(oido).split(" ").filter(Boolean)
  if (!todas.length || !frase) return false
  const f = new Set(limpiar(frase).split(" "))
  const llenas = todas.filter((p) => p.length >= 3 && !VACIAS.has(p))
  const o = llenas.length ? llenas : todas
  return o.filter((p) => f.has(p)).length / o.length >= umbral
}
