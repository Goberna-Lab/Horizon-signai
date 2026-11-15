// Banco de notas: ¿cada cuánto el 27B escribe notas entre corchetes en una respuesta HABLADA, y qué queda después del
// filtro (packages/shared/src/notas.ts)? Las preguntas van como en turnoDeVoz (apps/api/src/z6.ts): prompt real de la
// voz, extractos del RAG, recordatorio de órdenes y nota de idioma al final de la pregunta.
//
// Uso, desde la raíz del repo (pide el 27B de la Z6 y bge-m3 de Geografo; de a un pedido):
//   npx tsx apps/api/scripts/banco-notas.ts             cada pregunta 3 veces
//   npx tsx apps/api/scripts/banco-notas.ts --veces=5
//   npx tsx apps/api/scripts/banco-notas.ts --solo=cortes      solo las conversaciones con respuestas cortadas
import { SIN_RESPUESTA, sinNotas } from "@horizon-signai/shared"
import { RECORDATORIO_ACCIONES } from "../src/acciones.ts"
import { notaDeIdioma, personaDe, sistemaVoz, type Idioma } from "../src/asistentes.ts"
import { contextoRag } from "../src/assistant/rag.ts"

const Z6 = process.env.Z6_URL ?? "http://100.82.117.21:11434"
const MODELO = process.env.Z6_MODELO ?? "qwen3.6:27b"
const veces = Number(process.argv.find((a) => a.startsWith("--veces="))?.slice(8) ?? 3)

// Las que dieron notas en producción el 2026-11-15 («What does REVIEW mean?») y preguntas típicas de la app.
const PREGUNTAS: [Idioma, string][] = [
  ["en", "What does REVIEW mean?"],
  ["en", "How do I change the stay duration?"],
  ["en", "How does EVA know where the Sun is?"],
  ["en", "Is there a simulator screen?"],
  ["en", "What is zone B?"],
  ["en", "How does the planner compute the real horizon?"],
  ["en", "Why is the south pole so hard?"],
  ["en", "What NASA data do you use?"],
  ["es", "¿Qué significa REVIEW?"],
  ["es", "¿Cómo cambio la duración de la estadía?"],
  ["es", "¿De dónde salen las zonas candidatas?"],
]

// Manos libres: una respuesta cortada vuelve al historial terminada en «[interrupted: …]» (marcaDeCorte de
// packages/shared/src/oido.ts). Es el formato que el modelo podría imitar.
type Turno = { role: "user" | "assistant"; content: string }
const CON_CORTES: [Idioma, string, Turno[]][] = [
  [
    "en",
    "What does REVIEW mean?",
    [
      { role: "user", content: "What is zone A?" },
      { role: "assistant", content: "Zone A is on Connecting Ridge. With the slipped date [interrupted: the user is asking something new]" },
      { role: "user", content: "And zone B?" },
      { role: "assistant", content: "Zone B is the peak near Shackleton. It still passes [interrupted: the user is correcting something]" },
    ],
  ],
  [
    "en",
    "How do I change the stay duration?",
    [
      { role: "user", content: "Why is the south pole hard?" },
      { role: "assistant", content: "Picture the Sun as a flashlight lying almost flat [interrupted]" },
    ],
  ],
  [
    "es",
    "¿Qué significa REVIEW?",
    [
      { role: "user", content: "¿Qué es la zona A?" },
      { role: "assistant", content: "La zona A está en Connecting Ridge. Con la fecha movida [interrupted: the user is adding to their request]" },
    ],
  ],
]

async function preguntar(idioma: Idioma, pregunta: string, historial: Turno[] = []): Promise<string> {
  const persona = personaDe({ asistente: "educational", idioma, acciones: true })
  const extra = await contextoRag(pregunta, true)
  const contenido = [pregunta, extra ? `[Note from the app, not from the person. ${extra}]` : "", RECORDATORIO_ACCIONES, notaDeIdioma(idioma)]
    .filter(Boolean)
    .join("\n")
  const r = await fetch(`${Z6}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELO,
      stream: false,
      think: false,
      options: { num_predict: 200 },
      messages: [{ role: "system", content: sistemaVoz(persona) }, ...historial, { role: "user", content: contenido }],
    }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!r.ok) throw new Error(`Z6 respondió ${r.status}`)
  return ((await r.json()) as { message?: { content?: string } }).message?.content?.trim() ?? ""
}

let total = 0
let conNotas = 0
let vacias = 0
let quedaron = 0
const soloCortes = process.argv.includes("--solo=cortes")
const casos: [Idioma, string, Turno[]][] = [...(soloCortes ? [] : PREGUNTAS.map(([i, p]): [Idioma, string, Turno[]] => [i, p, []])), ...CON_CORTES]
for (const [idioma, pregunta, historial] of casos) {
  for (let k = 0; k < veces; k++) {
    total++
    const crudo = await preguntar(idioma, pregunta, historial).catch((e: unknown) => `(error: ${String(e)})`)
    const limpio = sinNotas(crudo.replace(/<<[^>]*>>/g, ""))
    const tenia = /\[[^\]]*\]?/.test(crudo)
    if (tenia) conNotas++
    if (/[[\]]/.test(limpio)) quedaron++
    if (tenia && !limpio) vacias++
    if (tenia) {
      console.log(`  NOTA  «${pregunta}»\n        modelo: ${crudo.replace(/\s+/g, " ").slice(0, 160)}`)
      console.log(`        EVA dice: ${limpio ? limpio.slice(0, 120) : `(todo eran notas → «${SIN_RESPUESTA[idioma]}»)`}`)
    }
  }
}
console.log(`\nRespuestas con notas entre corchetes: ${conNotas}/${total}. Después del filtro: ${quedaron} con corchetes, ${vacias} vacías (dicen la frase de respaldo).`)
if (quedaron > 0) process.exitCode = 1
