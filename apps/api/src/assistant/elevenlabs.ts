// ElevenLabs como boca de EVA y VERA, en lugar de Kokoro (horizon-voz en Geografo) y Piper (argus-voz en la Z6).
// Se activa solo con ELEVENLABS_API_KEY en el .env (lo sube scripts/configurar-ia-nube.sh); sin ella todo sigue igual.
// VOZ_MOTOR=local lo apaga sin borrar la clave. El oído (Whisper en Geografo) no cambia.
//
// Qué gana: la misma voz en inglés y en español (hoy el español sale de otra voz, Piper) y una voz más natural.
// Devuelve lo mismo que horizon-voz: audio y los tiempos de cada palabra, que la web usa para los subtítulos tipo
// karaoke y la entonación (ElevenLabs da el tiempo de cada carácter: aquí se juntan en palabras).
//
// Si ElevenLabs falla (sin créditos, caído, lento), z6.ts sigue con la voz local y no lo vuelve a intentar por 2 min.
// Tope diario de caracteres (ELEVENLABS_MAX_CARACTERES_DIA): pasado el tope, voz local hasta el día siguiente (UTC).

import type { AssistantMode } from "@horizon-signai/shared"
import type { Idioma } from "../asistentes.js"

// ELEVENLABS_URL: otro servidor de ElevenLabs (los regionales, como https://api.eu.residency.elevenlabs.io) o uno de prueba.
const API = process.env.ELEVENLABS_URL ?? "https://api.elevenlabs.io"
// mp3 a 64 kb/s: lo decodifican todos los navegadores (Web Audio y <audio>) y pesa ~8 KB por segundo de voz.
const FORMATO = "mp3_44100_64"
const BITS_POR_SEGUNDO = 64_000
const TIMEOUT_MS = 15_000
const PAUSA_TRAS_FALLO_MS = 2 * 60_000
// Sarah, una de las voces prediseñadas de ElevenLabs. El script de configuración deja elegir otra por asistente.
const VOZ_POR_DEFECTO = "EXAVITQu4vr4xnSDxMaL"

const tope = () => Number(process.env.ELEVENLABS_MAX_CARACTERES_DIA ?? 60_000)
let dia = ""
let caracteresHoy = 0
let caidoHasta = 0
const hoy = () => new Date().toISOString().slice(0, 10)

export const usaElevenLabs = () =>
  Boolean(process.env.ELEVENLABS_API_KEY) &&
  process.env.VOZ_MOTOR !== "local" &&
  Date.now() >= caidoHasta &&
  (dia !== hoy() || caracteresHoy < tope())

export const modeloElevenLabs = () => process.env.ELEVENLABS_MODELO ?? "eleven_flash_v2_5"
const vozDe = (a: AssistantMode) => process.env[`ELEVENLABS_VOZ_${a.toUpperCase()}`] ?? process.env.ELEVENLABS_VOZ ?? VOZ_POR_DEFECTO

export const estadoElevenLabs = () => ({
  activo: usaElevenLabs(),
  configurado: Boolean(process.env.ELEVENLABS_API_KEY),
  modelo: modeloElevenLabs(),
  caracteresHoy: dia === hoy() ? caracteresHoy : 0,
  tope: tope(),
  pausadoHasta: caidoHasta > Date.now() ? new Date(caidoHasta).toISOString() : null,
})

// ── Pronunciación ─────────────────────────────────────────────────────────────────────────────────────────────────
// Lo que una voz lee mal se le manda escrito como se dice (como paraPiper en packages/shared/src/pronunciacion.ts),
// pero el subtítulo sigue mostrando el original: cada trozo cambiado guarda los dos textos y su tiempo se reparte
// sobre el original. Números y unidades los normaliza ElevenLabs solo.
const ALIAS: Record<Idioma, [RegExp, string][]> = {
  en: [
    [/\bNO[- ]GO\b/g, "no go"],
    [/\bGO\b/g, "go"],
    [/\bEVA\b/g, "Eva"],
    [/\bSignai\b/g, "Sign A.I."], // «sign-A-I» (pedido de Manuel, 2026-11-15)
    [/\bDE ?441\b/g, "D E four forty-one"],
  ],
  es: [
    [/\bNO[- ]GO\b/g, "nou gou"],
    [/\bGO\b/g, "gou"],
    [/\bREVIEW\b/g, "riviú"],
    [/\bEVA\b/g, "Eva"],
    [/\bSignai\b/g, "Sain ei ai"],
    [/\bDE ?441\b/g, "de cuatro cuarenta y uno"],
  ],
}

type Parte = { orig: string; dicho: string; cambiada: boolean }

/** El texto en trozos: los que se dicen distinto de como se escriben llevan los dos textos. */
export function partesParaDecir(texto: string, idioma: Idioma): Parte[] {
  let partes: Parte[] = [{ orig: texto, dicho: texto, cambiada: false }]
  for (const [patron, alias] of ALIAS[idioma]) {
    partes = partes.flatMap((p) => {
      if (p.cambiada) return [p]
      const salida: Parte[] = []
      let desde = 0
      for (const m of p.orig.matchAll(patron)) {
        const i = m.index ?? 0
        if (i > desde) salida.push({ orig: p.orig.slice(desde, i), dicho: p.orig.slice(desde, i), cambiada: false })
        salida.push({ orig: m[0], dicho: alias, cambiada: true })
        desde = i + m[0].length
      }
      if (desde < p.orig.length) salida.push({ orig: p.orig.slice(desde), dicho: p.orig.slice(desde), cambiada: false })
      return salida
    })
  }
  return partes
}

type Alineacion = { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }
/** [texto, espacio que le sigue, inicio_s, fin_s]: el mismo formato que la cabecera X-Palabras de horizon-voz. */
export type Palabra = [string, string, number, number]

const r3 = (x: number) => Math.round(x * 1000) / 1000

/** Las palabras del texto ORIGINAL con su tiempo, a partir de los tiempos por carácter del texto que se dijo. */
export function palabrasDe(partes: Parte[], al: Alineacion | null | undefined, dur: number): Palabra[] {
  const orig = partes.map((p) => p.orig).join("")
  const dicho = partes.map((p) => p.dicho).join("")
  const ini = al?.character_start_times_seconds ?? []
  const fin = al?.character_end_times_seconds ?? []
  // Si los tiempos no calzan con el texto (no debería pasar), la frase entera dura todo el audio.
  if (!al || al.characters.join("") !== dicho || ini.length !== dicho.length || fin.length !== dicho.length)
    return [[orig.trim(), "", 0, r3(dur)]]
  const tiempos: [number, number][] = [] // uno por carácter de `orig`
  let k = 0
  for (const p of partes) {
    const n = p.dicho.length
    for (let i = 0; i < p.orig.length; i++)
      tiempos.push(p.cambiada ? [ini[k], fin[k + n - 1]] : [ini[k + i], fin[k + i]])
    k += n
  }
  const palabras: Palabra[] = []
  for (const m of orig.matchAll(/(\S+)(\s*)/g)) {
    const a = m.index ?? 0
    const b = a + m[1].length - 1
    palabras.push([m[1], m[2], r3(tiempos[a][0]), r3(tiempos[b][1])])
  }
  return palabras.length ? palabras : [[orig.trim(), "", 0, r3(dur)]]
}

/**
 * Voz de UNA frase con la voz de la asistente, en el idioma de la conversación. Lo mismo que devuelve `vozDeFrase`
 * en z6.ts: { texto, mime, audio (base64), palabras, dur }.
 */
export async function vozElevenLabs(texto: string, idioma: Idioma, asistente: AssistantMode, señal: AbortSignal) {
  const partes = partesParaDecir(texto, idioma)
  const dicho = partes.map((p) => p.dicho).join("")
  if (dia !== hoy()) [dia, caracteresHoy] = [hoy(), 0]
  caracteresHoy += dicho.length
  const modelo = modeloElevenLabs()
  let r: Response
  try {
    r = await fetch(`${API}/v1/text-to-speech/${encodeURIComponent(vozDe(asistente))}/with-timestamps?output_format=${FORMATO}`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({
        text: dicho,
        model_id: modelo,
        // Fija el idioma (que «Planner» no la haga cambiar de acento en español). multilingual_v2 no lo acepta.
        ...(modelo.startsWith("eleven_multilingual") ? {} : { language_code: idioma }),
      }),
      signal: AbortSignal.any([señal, AbortSignal.timeout(TIMEOUT_MS)]),
    })
  } catch (e) {
    if (!señal.aborted) caidoHasta = Date.now() + PAUSA_TRAS_FALLO_MS
    throw e
  }
  if (!r.ok) {
    caidoHasta = Date.now() + PAUSA_TRAS_FALLO_MS
    // El cuerpo del error dice por qué (sin créditos, voz que no existe…); nunca trae la clave.
    const detalle = (await r.text().catch(() => "")).slice(0, 200)
    throw new Error(`ElevenLabs respondió ${r.status} ${detalle}`)
  }
  const d = (await r.json()) as { audio_base64?: string; alignment?: Alineacion | null }
  if (!d.audio_base64) throw new Error("ElevenLabs no devolvió audio")
  const bytes = Buffer.byteLength(d.audio_base64, "base64")
  const finTexto = d.alignment?.character_end_times_seconds.at(-1) ?? 0
  const dur = Math.max(finTexto, (bytes * 8) / BITS_POR_SEGUNDO)
  return { texto, mime: "audio/mpeg", audio: d.audio_base64, palabras: palabrasDe(partes, d.alignment, dur), dur: r3(dur) }
}
