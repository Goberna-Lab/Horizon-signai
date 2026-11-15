import assert from "node:assert/strict"
import { test } from "node:test"
import { detectarIdioma, nombreDe, pideOtroIdioma } from "./idioma.ts"

// El idioma elegido se mantiene: solo un pedido explícito lo cambia (casos del banco apps/api/scripts/banco-idioma.ts).
test("hablar en el otro idioma no cambia el idioma elegido", () => {
  for (const t of ["José", "My name is Ángel", "María", "Hola EVA", "Gracias", "la la la", "¿Qué es la zona B?", "Hola, ¿cómo funciona el planificador?"])
    assert.equal(pideOtroIdioma(t, "en"), null, t)
  for (const t of ["What does REVIEW mean?", "Thanks", "Planner", "Explain the timeline", "Is zone B GO?", "Me llamo John"])
    assert.equal(pideOtroIdioma(t, "es"), null, t)
})

test("preguntar por una palabra en el otro idioma no es pedir el cambio", () => {
  assert.equal(pideOtroIdioma("¿Cómo se dice alunizaje en inglés?", "es"), null)
  assert.equal(pideOtroIdioma("How do you say crater in Spanish?", "en"), null)
})

test("pedirlo sí cambia el idioma", () => {
  for (const t of ["Can you speak Spanish?", "Switch to Spanish, please", "En español por favor", "háblame en español", "Español", "Spanish please", "Answer in Spanish"])
    assert.equal(pideOtroIdioma(t, "en"), "es", t)
  for (const t of ["Speak English", "habla en inglés", "in English please", "¿Puedes hablar en inglés?", "English", "respóndeme en inglés"])
    assert.equal(pideOtroIdioma(t, "es"), "en", t)
})

test("pedir el idioma en que ya está no cambia nada", () => {
  assert.equal(pideOtroIdioma("Speak English", "en"), null)
  assert.equal(pideOtroIdioma("háblame en español", "es"), null)
})

test("reconoce el español", () => {
  for (const t of ["hola", "¿Cómo se planifica una misión?", "quiero aprender a planificar", "me llamo Ana", "por qué el polo sur", "explícame la noche lunar", "soy Estephano"])
    assert.equal(detectarIdioma(t), "es", t)
})

test("reconoce el inglés", () => {
  for (const t of ["hello", "How do I plan a mission?", "what is the longest night", "my name is Ana", "I'm Ana", "why the south pole", "show me the planner"])
    assert.equal(detectarIdioma(t), "en", t)
})

test("sin señal clara no decide", () => {
  for (const t of ["Ana", "Estephano", "42", "", "ok", "no"]) assert.equal(detectarIdioma(t), null, t)
})

test("saca el nombre de una presentación", () => {
  assert.equal(nombreDe("me llamo ana"), "Ana")
  assert.equal(nombreDe("Hola, soy Estephano"), "Estephano")
  assert.equal(nombreDe("My name is María José"), "María José")
  assert.equal(nombreDe("I'm tom"), "Tom")
  assert.equal(nombreDe("  luis  "), "Luis")
  assert.equal(nombreDe("<b>x</b> 123"), "B X")
  assert.equal(nombreDe(""), "")
  assert.equal(nombreDe("hola"), "")
  assert.equal(nombreDe("Hello"), "")
})
