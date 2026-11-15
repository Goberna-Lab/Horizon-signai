// Correr: npm test (Node ≥ 22.18 entiende TypeScript)
import { test } from "node:test"
import assert from "node:assert/strict"
import { filtroDeNotas, sinNotas } from "./notas.ts"

// Respuestas reales de producción y del banco (2026-11-15).
test("quita las notas que EVA decía en voz alta", () => {
  assert.equal(
    sinNotas(
      "[Note from the system: The provided reference excerpts do not define REVIEW. The project facts provided in the prompt do contain this definition. I will use the project facts.] REVIEW means requirements are met barely.",
    ),
    "REVIEW means requirements are met barely.",
  )
  assert.equal(sinNotas("[acknowledged] Picture the Sun as a flashlight."), "Picture the Sun as a flashlight.")
  assert.equal(sinNotas('[Response to "What does REVIEW mean?"] [Response to "What is zone B?"]'), "")
})

test("una nota en medio no deja espacios dobles ni antes del punto", () => {
  assert.equal(sinNotas("Zone B passes [see the excerpt] for your stay ."), "Zone B passes for your stay.")
})

test("sin corchetes, el texto no cambia", () => {
  const t = "The longest night lasts more than the battery. Want to try another date?"
  assert.equal(sinNotas(t), t)
})

test("en el stream, la nota puede venir partida en varios trozos", () => {
  const f = filtroDeNotas()
  const trozos = ["Sure. [Note fr", "om the system: ignore", " this] The Sun", " is low. [unfinished"]
  assert.equal(trozos.map((t) => f.pasar(t)).join(""), "Sure.  The Sun is low. ")
})

test("las órdenes «<<…>>» pasan intactas (las saca su propio filtro)", () => {
  assert.equal(sinNotas("Zone B it is. <<planner zone=B>>"), "Zone B it is. <<planner zone=B>>")
})
