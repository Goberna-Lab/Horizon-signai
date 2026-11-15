// La voz grabada del guion de EVA. Todo lo que EVA dice por su cuenta está escrito (guion.ts, recorridos.ts), así que
// su voz se graba una vez (apps/web/scripts/grabar-voz-eva.ts) y se sirve como archivos estáticos: para decir su
// guion no hace falta pedirle la voz al servidor ni que el token de voz esté configurado, y la frase empieza a sonar
// sin espera. Pedido de Estephano (2026-11-15): «que no sea necesario tokenizar para que hable, porque será como un
// guion». La IA y la voz en vivo quedan para lo que no se puede escribir de antemano: contestar preguntas.
//
// - Se graba por oración, con la misma partición que hace el API en /decir (`enOraciones`). La clave de cada archivo
//   es una huella del idioma y del texto: una oración que se edita deja de tener grabación y se pide en vivo hasta
//   que se vuelva a grabar (el script lista las que faltan).
// - Cada archivo `public/eva-voz/<clave>.json` trae lo mismo que manda el API en vivo, para sonar por la misma cola
//   (colaDeVoz.ts: entonación y timbre de EVA): [{ texto, mime, audio (base64), palabras, dur }].
// - Lo que lleva el nombre de la persona no se puede grabar. Esa oración se pide en vivo con poco margen y, si no
//   llega, suena la misma sin el nombre (`sinVocativo`), que sí está grabada.
//
// Este módulo no usa React ni el DOM (solo `fetch` al cargar una grabación): lo importan también el script que graba
// y las pruebas con node, por eso sus importaciones llevan la extensión `.ts`.
import type { FraseDeVoz } from "@/prueba-ia/colaDeVoz"
import type { Idioma } from "./idioma"
import { GRABADAS } from "./vozGrabada.indice.ts"

/** Cambia cuando cambia la voz (otra voz, otro motor): así ninguna grabación vieja pasa por nueva. */
export const VERSION_VOZ = "1"

/** Lo que guarda cada archivo: las frases de voz de una oración, sin su número de orden (lo pone quien las dice). */
export type VozDeOracion = Omit<FraseDeVoz, "i">[]

/**
 * Parte un texto en oraciones, igual que el API (`cortarFrases` en apps/api/src/z6.ts): el fin de oración es un
 * punto, signo de interrogación, de exclamación o puntos suspensivos seguido de espacio («3.5» y «8,876» no cortan).
 */
export function enOraciones(texto: string): string[] {
  const oraciones: string[] = []
  let resto = `${texto.replace(/\s+/g, " ").trim()} `
  for (;;) {
    const fin = resto.match(/^[\s\S]*?[.!?…]+["'”)\]]*(?=\s)/)
    if (!fin) break
    const oracion = fin[0].trim()
    resto = resto.slice(fin[0].length)
    if (oracion) oraciones.push(oracion)
  }
  if (resto.trim()) oraciones.push(resto.trim())
  return oraciones
}

// Huella de 53 bits de un texto (cyrb53): corta, estable y sin dependencias; para unos cientos de oraciones no choca.
const huella = (s: string) => {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** El nombre del archivo de una oración: depende de la versión de la voz, del idioma y del texto exacto. */
export const claveDe = (idioma: Idioma, oracion: string) => huella(`${VERSION_VOZ}|${idioma}|${oracion.replace(/\s+/g, " ").trim()}`).toString(36)

/** «Nice to meet you, Ana.» → «Nice to meet you.»: la misma oración sin a quién se le habla. */
export const sinVocativo = (oracion: string) => oracion.replace(/,\s*[^,.!?…]+([.!?…]+)$/u, "$1")

const grabadas = new Set(GRABADAS)
const memoria = new Map<string, Promise<VozDeOracion | null>>()

/** Si una oración tiene voz grabada (sin pedir nada). */
export const estaGrabada = (idioma: Idioma, oracion: string) => grabadas.has(claveDe(idioma, oracion))

/** La voz grabada de una oración, o null si no la hay (no está en el guion, o el archivo no llegó). */
export function vozGrabada(idioma: Idioma, oracion: string): Promise<VozDeOracion | null> {
  const clave = claveDe(idioma, oracion)
  if (!grabadas.has(clave)) return Promise.resolve(null)
  let pedido = memoria.get(clave)
  if (!pedido) {
    pedido = fetch(`/eva-voz/${clave}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<VozDeOracion>) : null))
      .catch(() => null)
    memoria.set(clave, pedido)
    // Si falló (sin red un momento), que la próxima vez lo intente de nuevo.
    void pedido.then((v) => v ?? memoria.delete(clave))
  }
  return pedido
}

/** Trae ya la voz de una frase que EVA va a decir pronto (el paso siguiente de un recorrido), para que no espere. */
export const precargarVoz = (idioma: Idioma, frase: string) => {
  for (const oracion of enOraciones(frase)) void vozGrabada(idioma, oracion)
}
