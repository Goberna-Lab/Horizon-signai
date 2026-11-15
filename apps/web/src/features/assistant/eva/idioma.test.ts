import assert from "node:assert/strict"
import { test } from "node:test"
import { detectarIdioma, nombreDe } from "./idioma.ts"

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
