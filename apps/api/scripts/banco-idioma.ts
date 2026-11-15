// Banco de idioma de EVA: ¿responde en el idioma que la persona eligió? Mide las dos capas que pueden cambiarlo.
//
// 1. El navegador (`detectarIdioma` de apps/web/src/features/assistant/eva/idioma.ts): hasta el 2026-11-15, cada
//    pregunta pasaba por ese detector y, si «parecía» del otro idioma, EVA se cambiaba sola. Aquí se mide con frases
//    realistas de cada idioma cuántas lo habrían cambiado sin que nadie lo pidiera.
// 2. El modelo (el 27B de la Z6), con el prompt REAL de la voz (`sistemaVoz`), los extractos del RAG tal como van en
//    el turno (la mayoría de los documentos está en español) y recuerdos o historial en el otro idioma.
//
// Uso, desde la raíz del repo (pide el 27B de la Z6 y bge-m3 de Geografo; ~1-2 min, de a un pedido):
//   npx tsx apps/api/scripts/banco-idioma.ts            todo
//   npx tsx apps/api/scripts/banco-idioma.ts --solo=detector   solo la capa del navegador (sin modelo)
//   npx tsx apps/api/scripts/banco-idioma.ts --solo=ordenes    solo los casos del modelo con las órdenes de la app
//   npx tsx apps/api/scripts/banco-idioma.ts --veces=2  cada caso del modelo dos veces (el modelo no es determinista)
import { notaDeIdioma, personaDe, sistemaVoz, type Idioma } from "../src/asistentes.ts"
import { RECORDATORIO_ACCIONES } from "../src/acciones.ts"
import { contextoRag } from "../src/assistant/rag.ts"
import { detectarIdioma, pideOtroIdioma } from "../../web/src/features/assistant/eva/idioma.ts"
// (se importa de la web a propósito: el banco mide la MISMA regla que corre en el navegador)

const Z6 = process.env.Z6_URL ?? "http://100.82.117.21:11434"
const MODELO = process.env.Z6_MODELO ?? "qwen3.6:27b"
const solo = process.argv.find((a) => a.startsWith("--solo="))?.slice(7)
const veces = Number(process.argv.find((a) => a.startsWith("--veces="))?.slice(8) ?? 1)

// ── Capa 1: el navegador ─────────────────────────────────────────────────────
// Frases que alguien que ELIGIÓ ese idioma podría escribir o decir (y lo que Whisper suele transcribir). Ninguna
// pide cambiar de idioma: con cualquiera, EVA debería seguir donde estaba.
const SIGUEN_EN: string[] = [
  "José",
  "My name is Ángel",
  "María",
  "Hola EVA",
  "What is the Sol?",
  "Tell me about Malapert Massif and Shackleton",
  "Is there water ice at the polo sur?",
  "What does NO GO mean?",
  "ok",
  "Gracias",
  "next",
  "Why is zone A con problems?",
  "la la la",
]
const SIGUEN_ES: string[] = [
  "Ok",
  "What does REVIEW mean?",
  "Next",
  "Thanks",
  "Planner",
  "Explain the timeline",
  "Me llamo John",
  "Is zone B GO?",
]
// Estas SÍ piden cambiar: con la regla nueva (`pideOtroIdioma`) cambian; el resto no.
const PIDEN_CAMBIO: [string, Idioma][] = [
  ["Can you speak Spanish?", "es"],
  ["Switch to Spanish, please", "es"],
  ["En español por favor", "es"],
  ["háblame en español", "es"],
  ["Speak English", "en"],
  ["habla en inglés", "en"],
  ["in English please", "en"],
  ["¿Puedes hablar en inglés?", "en"],
]

function capaNavegador() {
  console.log("\n== Capa 1: el navegador (frases que NO piden cambiar de idioma)")
  let antes = 0
  let ahora = 0
  const filas: string[] = []
  const probar = (frase: string, eligio: Idioma) => {
    const detectado = detectarIdioma(frase)
    const cambiabaAntes = detectado !== null && detectado !== eligio
    const cambiaAhora = pideOtroIdioma(frase, eligio) !== null
    if (cambiabaAntes) antes++
    if (cambiaAhora) ahora++
    filas.push(`  eligió ${eligio} · «${frase}» → antes: ${cambiabaAntes ? `CAMBIABA a ${detectado}` : "seguía"} · ahora: ${cambiaAhora ? "CAMBIA" : "sigue"}`)
  }
  for (const f of SIGUEN_EN) probar(f, "en")
  for (const f of SIGUEN_ES) probar(f, "es")
  console.log(filas.join("\n"))
  console.log(`  Cambios sin pedirlo: antes ${antes}/${SIGUEN_EN.length + SIGUEN_ES.length}, ahora ${ahora}.`)
  console.log("\n== Capa 1: frases que SÍ piden cambiar")
  let bien = 0
  for (const [frase, a] of PIDEN_CAMBIO) {
    const eligio: Idioma = a === "es" ? "en" : "es"
    const r = pideOtroIdioma(frase, eligio)
    if (r === a) bien++
    console.log(`  eligió ${eligio} · «${frase}» → ${r === a ? `cambia a ${a}` : "NO CAMBIA (falla)"}`)
  }
  console.log(`  Reconocidas: ${bien}/${PIDEN_CAMBIO.length}.`)
  return { antes, ahora, bien }
}

// ── Capa 2: el modelo ────────────────────────────────────────────────────────
type Caso = {
  idioma: Idioma
  pregunta: string
  /** Lo que el navegador guarda de visitas anteriores (puede venir en el otro idioma). */
  recuerdos?: { nombre?: string; preguntas?: string[] }
  /** Turnos anteriores de esta conversación. */
  historial?: { role: "user" | "assistant"; content: string }[]
  /** Con las órdenes de la app (como EVA dentro de la app): el modelo podría cambiar el idioma con <<language>>. */
  acciones?: boolean
  nota?: string
}
const CASOS: Caso[] = [
  { idioma: "en", pregunta: "Why is the south pole so hard?" },
  { idioma: "en", pregunta: "What does REVIEW mean?", nota: "RAG en español" },
  { idioma: "en", pregunta: "How does the planner compute the real horizon?", nota: "RAG técnico en español" },
  { idioma: "en", pregunta: "Which zones are candidates and where do they come from?" },
  { idioma: "en", pregunta: "What is Shackleton crater?", nota: "nombre propio" },
  { idioma: "en", pregunta: "Who built this project?", nota: "Goberna, Perú" },
  {
    idioma: "en",
    pregunta: "And what about the battery?",
    recuerdos: { nombre: "José María", preguntas: ["¿Qué es el polo sur?", "¿Cómo funciona el planificador?"] },
    nota: "recuerdos en español",
  },
  {
    idioma: "en",
    pregunta: "What should I try next?",
    historial: [
      { role: "user", content: "¿Qué es la zona B?" },
      { role: "assistant", content: "La zona B es el pico cerca de Shackleton. Es la que todavía cumple. ¿Quieres verla en el planificador?" },
    ],
    nota: "historial en español",
  },
  { idioma: "en", pregunta: "Hola EVA, what is zone B?", nota: "saludo en español" },
  { idioma: "en", pregunta: "ok", nota: "ambigua" },
  { idioma: "es", pregunta: "¿Por qué es tan difícil el polo sur?" },
  { idioma: "es", pregunta: "What does REVIEW mean?", nota: "pregunta en inglés" },
  { idioma: "es", pregunta: "Explain the timeline", nota: "pregunta en inglés" },
  { idioma: "es", pregunta: "¿Qué datos de la NASA usas?" },
  {
    idioma: "es",
    pregunta: "¿Y la batería?",
    historial: [
      { role: "user", content: "What is zone A?" },
      { role: "assistant", content: "Zone A is on Connecting Ridge. With the slipped date it fails. Want to see why?" },
    ],
    nota: "historial en inglés",
  },
  { idioma: "es", pregunta: "ok", nota: "ambigua" },
  // Con órdenes: escribir en el otro idioma NO es pedir el cambio (no debe salir <<language>>); pedirlo sí.
  { idioma: "en", pregunta: "¿Qué es la zona B?", acciones: true, nota: "con órdenes, pregunta en español" },
  { idioma: "en", pregunta: "Hola, ¿cómo funciona el planificador?", acciones: true, nota: "con órdenes, pregunta en español" },
  { idioma: "es", pregunta: "What is zone B?", acciones: true, nota: "con órdenes, pregunta en inglés" },
  { idioma: "es", pregunta: "How does the timeline work?", acciones: true, nota: "con órdenes, pregunta en inglés" },
  { idioma: "en", pregunta: "Can you speak Spanish, please?", acciones: true, nota: "pide el cambio: debe salir <<language to=es>>" },
]

async function preguntar(c: Caso): Promise<string> {
  const persona = personaDe({ asistente: "educational", idioma: c.idioma, recuerdos: c.recuerdos ?? {}, acciones: c.acciones === true })
  // Igual que turnoDeVoz (apps/api/src/z6.ts): los extractos y los recordatorios van como notas al final de la pregunta.
  const extra = await contextoRag(c.pregunta, true)
  const contenido = [
    c.pregunta,
    extra ? `[Note from the app, not from the person. ${extra}]` : "",
    c.acciones ? RECORDATORIO_ACCIONES : "",
    notaDeIdioma(c.idioma),
  ]
    .filter(Boolean)
    .join("\n")
  const r = await fetch(`${Z6}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELO,
      stream: false,
      think: false,
      options: { num_predict: 160 },
      messages: [{ role: "system", content: sistemaVoz(persona) }, ...(c.historial ?? []), { role: "user", content: contenido }],
    }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!r.ok) throw new Error(`Z6 respondió ${r.status}`)
  return ((await r.json()) as { message?: { content?: string } }).message?.content?.trim() ?? ""
}

async function capaModelo() {
  console.log(`\n== Capa 2: el modelo (${MODELO}, prompt real de la voz, ${veces} vez/veces por caso)`)
  let fallos = 0
  let total = 0
  for (const c of CASOS.filter((x) => solo !== "ordenes" || x.acciones)) {
    for (let k = 0; k < veces; k++) {
      total++
      const t0 = performance.now()
      let respuesta = ""
      try {
        respuesta = await preguntar(c)
      } catch (e) {
        respuesta = `(error: ${String(e)})`
      }
      // El idioma se mide sin la orden; la orden de idioma solo vale si la persona la pidió.
      const orden = /<<\s*language\s+to=(en|es)\s*>>/i.exec(respuesta)?.[1] ?? null
      const pidio = pideOtroIdioma(c.pregunta, c.idioma)
      const detectado = detectarIdioma(respuesta.replace(/<<[^>]*>>/g, ""))
      const idiomaOk = pidio ? true : detectado === c.idioma || (detectado === null && !respuesta.startsWith("(error"))
      const ordenOk = pidio ? orden === pidio : orden === null
      const ok = idiomaOk && ordenOk
      if (!ok) fallos++
      const corta = respuesta.replace(/\s+/g, " ").slice(0, 110)
      console.log(
        `  ${ok ? "ok   " : "FALLA"} eligió ${c.idioma} · «${c.pregunta}»${c.nota ? ` (${c.nota})` : ""} · ${((performance.now() - t0) / 1000).toFixed(1)} s\n        → [${detectado ?? "?"}${orden ? ` · orden language=${orden}` : ""}] ${corta}`,
      )
    }
  }
  console.log(`  Respuestas en el idioma equivocado: ${fallos}/${total}.`)
  return fallos
}

const n = capaNavegador()
if (solo !== "detector") await capaModelo()
if (n.ahora > 0 || n.bien < PIDEN_CAMBIO.length) process.exitCode = 1
