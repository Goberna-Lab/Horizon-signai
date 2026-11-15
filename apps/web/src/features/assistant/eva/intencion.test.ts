import assert from "node:assert/strict"
import { test } from "node:test"
import { intencionDe } from "./intencion.ts"

test("seguir, en inglés y en español, con o sin relleno", () => {
  for (const t of ["next", "Next.", "continue", "go on", "ok", "yes", "next please", "siguiente", "Sigue", "continúa", "dale", "sí", "sigue por favor", "EVA, next"])
    assert.equal(intencionDe(t), "siguiente", t)
})

test("repetir", () => {
  for (const t of ["again", "repeat that", "say that again", "otra vez", "repite", "de nuevo", "what?", "¿cómo?", "sorry?"]) assert.equal(intencionDe(t), "repetir", t)
})

test("parar", () => {
  for (const t of ["stop", "Stop!", "enough", "no thanks", "para", "basta", "detente", "ahora no", "stop the tour", "please stop"]) assert.equal(intencionDe(t), "parar", t)
})

test("lo que no es una orden clara es una pregunta para la IA", () => {
  for (const t of [
    "why does zone A fail?",
    "what is the longest night",
    "how tall is the mast",
    "tell me about the battery",
    "¿por qué falla la zona A?",
    "qué es el veredicto",
    "explícame la noche lunar",
    "next week?",
    "¿seguimos con la batería?",
    "stop the lander from freezing",
    "no entiendo el horizonte",
    "what does GO mean",
    "",
  ])
    assert.equal(intencionDe(t), "pregunta", t)
})
