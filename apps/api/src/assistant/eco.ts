// El tema del eco (packages/shared/src/eco.ts): el modelo chico de Geografo lee la pregunta y devuelve, con las
// palabras clave de la persona, de qué trata («the distance between the Earth and the Moon»). El API lo mete en una
// plantilla y EVA lo dice mientras el 27B de la Z6 piensa la respuesta.
//
// No toca la Z6 (pisaría la caché del 27B). Medido el 2026-11-15 desde Geografo: ~0,45 s el texto y ~0,55 s con la
// voz de Kokoro. Nunca lanza: si tarda o falla, no hay eco y la respuesta llega como siempre.

import { jsonClaude, usaClaude } from "./claude.js"

const SISTEMA: Record<"en" | "es", string> = {
  en: `You help a voice assistant fill the silence while it thinks. Read the person's message and write the TOPIC of their question as a short phrase (2 to 10 words) that reuses their key words, the way someone repeats a question back before answering. Say it from the assistant's side: their "you/your" becomes "I/my" or "we/our". Never answer it, never add facts, numbers, yes or no. If the message is not a question or request (a greeting, thanks, "ok", a single word), the topic is "". Reply only with JSON: {"topic": "..."}.
Examples:
"how far is the earth from the moon" → {"topic": "the distance between the Earth and the Moon"}
"Why does zone A fail?" → {"topic": "why zone A fails"}
"What NASA data does the app use?" → {"topic": "the NASA data behind the app"}
"can i fix it with a taller mast" → {"topic": "fixing it with a taller mast"}
"What was the challenge you had to solve?" → {"topic": "the challenge we had to solve"}
"is zone b safe for a three day stay" → {"topic": "whether zone B is safe for a three-day stay"}
"thanks!" → {"topic": ""}`,
  es: `Ayudas a un asistente de voz a llenar el silencio mientras piensa. Lee el mensaje de la persona y escribe el TEMA de su pregunta en una frase corta (2 a 10 palabras) que reúse sus palabras clave, como quien repite la pregunta antes de responder. Dilo desde el lado del asistente: su «tú/usan/tu» pasa a «yo/usamos/mi». Nunca la respondas ni agregues datos, cifras, sí o no. Si el mensaje no es una pregunta ni un pedido (un saludo, gracias, «ok», una sola palabra), el tema es "". Responde solo con JSON: {"topic": "..."}.
Ejemplos:
"cuánta distancia hay entre la tierra y la luna" → {"topic": "la distancia entre la Tierra y la Luna"}
"¿Por qué falla la zona A?" → {"topic": "por qué falla la zona A"}
"qué datos de la nasa usan" → {"topic": "los datos de la NASA que usamos"}
"¿la zona B es segura para quedarme tres días?" → {"topic": "si la zona B aguanta una estadía de tres días"}
"gracias" → {"topic": ""}`,
}

// Pasado esto el eco ya no gana tiempo. Si llega tarde pero antes que la primera frase del 27B, igual suena (z6.ts
// lo calla si el 27B ya empezó). A veces el primer pedido tras un rato tarda ~1,5 s aunque el modelo esté cargado.
const TIMEOUT_MS = 2500
const ESQUEMA = { type: "object", properties: { topic: { type: "string" } }, required: ["topic"], additionalProperties: false }

/** El tema de `pregunta` según el modelo chico, o "" (sin tema, lento o con error). Sin limpiar: ver `armarEco`. */
export async function temaDeEco(pregunta: string, idioma: "en" | "es", url: string, modelo: string, señal?: AbortSignal): Promise<string> {
  const q = pregunta.replace(/\s+/g, " ").trim().slice(0, 300)
  if (q.split(" ").length < 3) return "" // «hola», «gracias», «sí»: nada que repetir
  const limite = señal ? AbortSignal.any([señal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS)
  // Con Claude (claude.ts) el tema lo escribe Haiku en lugar del 8B de Geografo.
  if (usaClaude()) {
    try {
      const { topic } = await jsonClaude<{ topic?: unknown }>(SISTEMA[idioma], q, ESQUEMA, limite)
      return typeof topic === "string" ? topic : ""
    } catch {
      return ""
    }
  }
  try {
    const r = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: limite,
      body: JSON.stringify({
        model: modelo,
        stream: false,
        think: false,
        keep_alive: "2h", // el mismo que el clasificador de z6.ts: frío tarda decenas de segundos
        format: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] },
        options: { num_predict: 32, temperature: 0.3 },
        messages: [
          { role: "system", content: SISTEMA[idioma] },
          { role: "user", content: q },
        ],
      }),
    })
    if (!r.ok) return ""
    const d = (await r.json()) as { message?: { content?: string } }
    const { topic } = JSON.parse(d.message?.content ?? "{}") as { topic?: unknown }
    return typeof topic === "string" ? topic : ""
  } catch {
    return ""
  }
}
