// Graba la voz del guion de EVA: cada oración que EVA dice por su cuenta (guion.ts y recorridos.ts), en inglés y en
// español, se le pide UNA vez a la voz del proyecto y queda como archivo estático en apps/web/public/eva-voz/. Desde
// entonces EVA dice su guion sin pedirle nada al servidor (ver src/features/assistant/eva/vozGrabada.ts).
//
// Uso, desde la raíz del repo (Node 24 o más nuevo, que ejecuta TypeScript sin compilar; ffmpeg y ffprobe en el PATH):
//   node apps/web/scripts/grabar-voz-eva.ts              graba solo lo que falta
//   node apps/web/scripts/grabar-voz-eva.ts --comprobar  no graba: lista lo que falta y sale con error si falta algo
//   node apps/web/scripts/grabar-voz-eva.ts --limpiar    además borra las grabaciones de oraciones que ya no están
//   node apps/web/scripts/grabar-voz-eva.ts --todo       vuelve a grabar todo (cambió la voz: sube VERSION_VOZ)
//   node apps/web/scripts/grabar-voz-eva.ts --solo=es    solo un idioma
//
// De dónde sale la voz: del mismo API que la sirve en vivo, `POST /api/z6/decir` (apps/api/src/z6.ts), que no usa
// ningún modelo de lenguaje, solo la voz. Por defecto el de producción; con EVA_VOZ_API se apunta a otro (un API local
// con los tokens de voz). Va de a un pedido por vez y con pausa: esa ruta tiene tope por IP y la usan las personas.
//
// Qué guarda: en inglés, el MP3 y los tiempos por palabra tal como llegan (Kokoro). En español la voz (Piper) llega en
// WAV y sin tiempos: se pasa a MP3 aquí y se guarda sin tiempos, como suena en vivo. Si el servicio de español no
// contesta, el API responde con la voz de inglés leyendo español: eso NO se guarda (se espera y se reintenta).
//
// Volumen: la voz de español sale mucho más alta que la de inglés (medido el 2026-11-15: −15 dB de media y picos de
// −0,3 dB, contra −26 dB y −8 dB). Al pasarla a MP3 se mide y se baja hasta la media de la de inglés, para que EVA
// suene igual en los dos idiomas y su timbre (que suma ramas en el navegador) no sature.
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { frasesDelGuion, oracionesDelGuion, type OracionDelGuion } from "../src/features/assistant/eva/frasesGrabables.ts"

const ejecutar = promisify(execFile)
const AQUI = dirname(fileURLToPath(import.meta.url))
const DESTINO = join(AQUI, "../public/eva-voz")
const INDICE = join(AQUI, "../src/features/assistant/eva/vozGrabada.indice.ts")
const API = (process.env.EVA_VOZ_API ?? "https://signal-horizon.goberna.us").replace(/\/$/, "")
const PAUSA_MS = 1100 // entre pedidos: muy por debajo del tope de 60 por minuto del API
const MP3_ES = "48k" // el español llega en WAV: se guarda en MP3 mono a esta tasa
const MEDIA_DB = -25 // volumen medio al que se deja el español (el de la voz de inglés)
const PICO_DB = -6 // y ningún pico por encima de esto

const banderas = new Set(process.argv.slice(2))
const solo = process.argv.find((a) => a.startsWith("--solo="))?.slice(7)
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Frase = { texto: string; mime: string; audio: string; palabras: unknown[]; dur: number }

/** Pide la voz de una oración. Devuelve las frases de voz (casi siempre una) o lanza un error. */
async function pedirVoz(o: OracionDelGuion): Promise<Frase[]> {
  const r = await fetch(`${API}/api/z6/decir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto: o.oracion, formato: "mp3", asistente: "educational", idioma: o.idioma }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!r.ok) throw Object.assign(new Error(`el API respondió ${r.status}`), { estado: r.status })
  const frases: Frase[] = []
  for (const linea of (await r.text()).split("\n")) {
    if (!linea.trim()) continue
    const e = JSON.parse(linea) as { t?: string } & Frase
    if (e.t === "frase") frases.push({ texto: e.texto, mime: e.mime, audio: e.audio, palabras: e.palabras, dur: e.dur })
  }
  if (!frases.length) throw new Error("el API no devolvió voz")
  return frases
}

/** WAV (o lo que llegue) → MP3 mono al volumen de la voz de inglés, con su duración y cuánto se bajó (dB). */
async function aMp3(audio: Buffer, carpeta: string): Promise<{ mp3: Buffer; dur: number; ganancia: number }> {
  const entrada = join(carpeta, "entrada.bin")
  const salida = join(carpeta, "salida.mp3")
  await writeFile(entrada, audio)
  // Primero se mide (ffmpeg lo escribe en stderr); luego se baja lo justo: nunca se sube.
  const medida = (await ejecutar("ffmpeg", ["-hide_banner", "-i", entrada, "-af", "volumedetect", "-f", "null", "-"])).stderr
  const media = Number(/mean_volume: ([-\d.]+) dB/.exec(medida)?.[1] ?? MEDIA_DB)
  const pico = Number(/max_volume: ([-\d.]+) dB/.exec(medida)?.[1] ?? PICO_DB)
  const ganancia = Math.round(Math.max(-16, Math.min(0, MEDIA_DB - media, PICO_DB - pico)) * 10) / 10
  await ejecutar("ffmpeg", ["-y", "-loglevel", "error", "-i", entrada, "-af", `volume=${ganancia}dB`, "-ac", "1", "-codec:a", "libmp3lame", "-b:a", MP3_ES, salida])
  const { stdout } = await ejecutar("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", salida])
  return { mp3: await readFile(salida), dur: Math.round(Number(stdout.trim()) * 1000) / 1000, ganancia }
}

/** Graba una oración y la escribe. Reintenta si el API está ocupado o si el español salió con la voz de inglés. */
async function grabar(o: OracionDelGuion, carpeta: string): Promise<number> {
  for (let intento = 1; ; intento++) {
    try {
      const frases = await pedirVoz(o)
      const guardar: Frase[] = []
      for (const f of frases) {
        if (f.mime?.includes("mpeg")) {
          // La voz de inglés (Kokoro) trae tiempos por palabra. Si esto pasa en español, el servicio de español no
          // contestó y el API usó la de inglés: no sirve como grabación.
          if (o.idioma === "es") throw Object.assign(new Error("la voz en español no contestó (salió la de inglés)"), { espera: 75_000 })
          guardar.push(f)
        } else {
          const { mp3, dur } = await aMp3(Buffer.from(f.audio, "base64"), carpeta)
          guardar.push({ texto: f.texto, mime: "audio/mpeg", audio: mp3.toString("base64"), palabras: [[f.texto, "", 0, 0]], dur })
        }
      }
      const cuerpo = JSON.stringify(guardar)
      await writeFile(join(DESTINO, `${o.clave}.json`), cuerpo)
      return cuerpo.length
    } catch (e) {
      const err = e as Error & { estado?: number; espera?: number }
      if (intento >= 6) throw err
      const espera = err.espera ?? (err.estado === 429 ? 25_000 : 6000)
      console.log(`    reintento ${intento} en ${Math.round(espera / 1000)} s: ${err.message}`)
      await esperar(espera)
    }
  }
}

const existe = async (clave: string) =>
  stat(join(DESTINO, `${clave}.json`)).then(
    (s) => s.size > 0,
    () => false,
  )

async function escribirIndice(claves: string[]) {
  const lineas = [
    "// Generado por apps/web/scripts/grabar-voz-eva.ts: las oraciones del guion de EVA que tienen voz grabada en",
    "// apps/web/public/eva-voz/ (una clave por archivo, ver vozGrabada.ts). No se edita a mano.",
    `export const GRABADAS: readonly string[] = ${JSON.stringify([...claves].sort())}`,
    "",
  ]
  await writeFile(INDICE, lineas.join("\n"))
}

const todas = oracionesDelGuion().filter((o) => !solo || o.idioma === solo)
for (const f of frasesDelGuion().filter((x) => x.sinTraducir)) console.log(`AVISO: sin traducción al español, no se graba: ${f.de}`)

await mkdir(DESTINO, { recursive: true })
const faltan: OracionDelGuion[] = []
for (const o of todas) if (banderas.has("--todo") || !(await existe(o.clave))) faltan.push(o)
console.log(`${todas.length} oraciones en el guion${solo ? ` (${solo})` : ""}; ${faltan.length} por grabar. Voz: ${API}`)

if (banderas.has("--comprobar")) {
  for (const o of faltan) console.log(`  falta [${o.idioma}] ${o.de}: ${o.oracion}`)
  process.exit(faltan.length ? 1 : 0)
}

const carpeta = await mkdtemp(join(tmpdir(), "eva-voz-"))
let bytes = 0
let fallidas = 0
for (const [k, o] of faltan.entries()) {
  try {
    const n = await grabar(o, carpeta)
    bytes += n
    console.log(`  ${k + 1}/${faltan.length} [${o.idioma}] ${Math.round(n / 1024)} KB · ${o.oracion.slice(0, 70)}`)
  } catch (e) {
    fallidas++
    console.log(`  ${k + 1}/${faltan.length} [${o.idioma}] FALLÓ (${(e as Error).message}) · ${o.de}: ${o.oracion.slice(0, 70)}`)
  }
  await esperar(PAUSA_MS)
}
await rm(carpeta, { recursive: true, force: true })

// El índice lista lo que de verdad quedó grabado, de todo el guion (no solo del idioma pedido).
const guion = oracionesDelGuion()
const enDisco = new Set((await readdir(DESTINO)).filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5)))
if (banderas.has("--limpiar")) {
  const vigentes = new Set(guion.map((o) => o.clave))
  for (const clave of enDisco) {
    if (vigentes.has(clave)) continue
    await rm(join(DESTINO, `${clave}.json`))
    enDisco.delete(clave)
    console.log(`  borrada ${clave}.json (ya no está en el guion)`)
  }
}
const grabadas = guion.filter((o) => enDisco.has(o.clave)).map((o) => o.clave)
await escribirIndice(grabadas)
console.log(`Listo: ${faltan.length - fallidas} grabadas ahora (${Math.round(bytes / 1024)} KB), ${fallidas} fallidas; ${grabadas.length} de ${guion.length} oraciones del guion tienen voz.`)
process.exit(fallidas ? 1 : 0)
