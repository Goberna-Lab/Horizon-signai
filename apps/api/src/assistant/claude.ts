// Claude (API de Anthropic) como cerebro de EVA y VERA, en lugar de los modelos de Ollama de la Z6 y Geografo.
// Se activa solo con ANTHROPIC_API_KEY en el .env (lo sube scripts/configurar-ia-nube.sh); sin ella todo sigue igual.
// IA_MOTOR=ollama lo apaga sin borrar la clave. Qué modelo va en cada ruta y por qué: voz/LEEME.md, «IA en la nube».
//
// - Voz (turno de voz, clasificador de lo que dices encima, eco): Claude Haiku 5.5, sin pensamiento extendido y con
//   esfuerzo bajo. Es la ruta donde cada décima de segundo se oye.
// - Texto (chat escrito): Claude Sonnet 5.5, con pensamiento adaptativo y esfuerzo bajo: explica mejor y el chat
//   tolera un instante más antes de la primera palabra.
// - Tope diario de pedidos (CLAUDE_MAX_PEDIDOS_DIA): el sitio es público y esto cuesta dinero. Pasado el tope, el
//   API vuelve solo a Ollama hasta el día siguiente (UTC).

import Anthropic from "@anthropic-ai/sdk"
import type { PartesDelSistema } from "../asistentes.js"

export type Ruta = "voz" | "texto"
type Mensaje = { role: "user" | "assistant"; content: string }

const TIMEOUT_MS = Number(process.env.Z6_TIMEOUT_MS ?? 120_000)
const tope = () => Number(process.env.CLAUDE_MAX_PEDIDOS_DIA ?? 3000)

// Pedidos de hoy. En memoria: se reinicia con cada deploy, y en uso normal solo atiende una copia (deploy/README.md).
let dia = ""
let pedidosHoy = 0
const hoy = () => new Date().toISOString().slice(0, 10)
const contar = () => {
  if (dia !== hoy()) [dia, pedidosHoy] = [hoy(), 0]
  pedidosHoy++
}
const quedanPedidos = () => dia !== hoy() || pedidosHoy < tope()

export const usaClaude = () => Boolean(process.env.ANTHROPIC_API_KEY) && process.env.IA_MOTOR !== "ollama" && quedanPedidos()

export const modeloClaude = (ruta: Ruta) =>
  ruta === "voz" ? (process.env.CLAUDE_MODELO_VOZ ?? "claude-haiku-5-5") : (process.env.CLAUDE_MODELO_TEXTO ?? "claude-sonnet-5-5")

export const estadoClaude = () => ({
  activo: usaClaude(),
  configurado: Boolean(process.env.ANTHROPIC_API_KEY),
  voz: modeloClaude("voz"),
  texto: modeloClaude("texto"),
  pedidosHoy: dia === hoy() ? pedidosHoy : 0,
  tope: tope(),
})

// Lee ANTHROPIC_API_KEY del entorno. Un reintento: en la voz, esperar uno vale más que cortar la respuesta.
let cliente: Anthropic | null = null
const claude = () => (cliente ??= new Anthropic({ maxRetries: 1, timeout: TIMEOUT_MS }))

type Ajustes = Pick<Anthropic.Beta.MessageCreateParamsNonStreaming, "thinking" | "output_config" | "betas" | "fallbacks">

// `rapido`: lo mínimo que piensa cada modelo. Haiku 5.5 acepta apagar el pensamiento; Sonnet 5.5 lo apaga con
// `between_tools`; Opus 5.5 no deja apagarlo y con esfuerzo bajo piensa poco. Los modelos soportados son estos tres.
const ajustes = (modelo: string, rapido: boolean): Ajustes => {
  const a: Ajustes = { output_config: { effort: "low" } }
  if (rapido && modelo.startsWith("claude-haiku-5")) a.thinking = { type: "disabled" }
  if (rapido && modelo.startsWith("claude-sonnet-5-5")) a.thinking = { type: "between_tools" }
  // Si el modelo declina por política, el servidor reintenta con otro. Haiku no tiene respaldo: ahí no se pide.
  if (!modelo.startsWith("claude-haiku")) {
    a.betas = ["server-side-fallback-2026-07-01"]
    a.fallbacks = "default"
  }
  return a
}

// La parte fija del sistema (personaje, hechos del proyecto, reglas) se cachea: es igual en toda la conversación.
// La variable (recuerdos, pantalla, extractos del RAG) va después, sin caché.
const sistemaDe = ({ fijo, variable }: PartesDelSistema): Anthropic.Beta.BetaTextBlockParam[] => [
  { type: "text", text: fijo, cache_control: { type: "ephemeral" } },
  ...(variable.trim() ? [{ type: "text" as const, text: variable }] : []),
]

// La API pide empezar con el usuario, terminar con el usuario (no hay prefill) y no acepta textos vacíos.
const mensajesDe = (msgs: Mensaje[]): Anthropic.Beta.BetaMessageParam[] => {
  const limpios = msgs.filter((m) => m.content.trim())
  while (limpios[0]?.role === "assistant") limpios.shift()
  if (limpios.at(-1)?.role !== "user") throw new Error("Claude: la conversación no termina en una pregunta")
  return limpios.map((m) => ({ role: m.role, content: m.content }))
}

const textoDe = (r: Anthropic.Beta.BetaMessage) =>
  r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")

const pedido = (ruta: Ruta, sistema: PartesDelSistema, msgs: Mensaje[]) => {
  const modelo = modeloClaude(ruta)
  return {
    model: modelo,
    max_tokens: ruta === "voz" ? 1024 : 8000,
    system: sistemaDe(sistema),
    messages: mensajesDe(msgs),
    ...ajustes(modelo, ruta === "voz"),
  }
}

/** La respuesta entera. Si Claude declina, "" (quien llama decide qué decir). */
export async function responderClaude(ruta: Ruta, sistema: PartesDelSistema, msgs: Mensaje[], señal?: AbortSignal) {
  contar()
  const r = await claude().beta.messages.create(pedido(ruta, sistema, msgs), { signal: señal })
  return r.stop_reason === "refusal" ? "" : textoDe(r)
}

/** La respuesta trozo a trozo, a medida que Claude la escribe. Si quien lee deja de leer, el pedido se corta. */
export async function* textoClaude(ruta: Ruta, sistema: PartesDelSistema, msgs: Mensaje[], señal: AbortSignal): AsyncGenerator<string> {
  contar()
  const stream = claude().beta.messages.stream(pedido(ruta, sistema, msgs), { signal: señal })
  try {
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield ev.delta.text
    }
  } finally {
    if (!stream.ended) stream.abort()
  }
}

/**
 * Un JSON con la forma de `esquema` (salida estructurada): el clasificador de lo que dices encima y el tema del eco.
 * Va con el modelo de voz y sin pensar, porque los dos tienen que llegar en menos de un segundo.
 */
export async function jsonClaude<T>(sistema: string, usuario: string, esquema: Record<string, unknown>, señal: AbortSignal): Promise<T> {
  contar()
  const modelo = modeloClaude("voz")
  const base = ajustes(modelo, true)
  const r = await claude().beta.messages.create(
    {
      model: modelo,
      max_tokens: 256,
      system: sistema,
      messages: [{ role: "user", content: usuario }],
      ...base,
      output_config: { ...base.output_config, format: { type: "json_schema", schema: esquema } },
    },
    { signal: señal },
  )
  if (r.stop_reason === "refusal") throw new Error("Claude declinó la clasificación")
  return JSON.parse(textoDe(r)) as T
}
