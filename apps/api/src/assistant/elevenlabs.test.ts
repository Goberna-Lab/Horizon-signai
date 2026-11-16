import assert from "node:assert/strict"
import { test } from "node:test"
import { palabrasDe, partesParaDecir } from "./elevenlabs.ts"

// Tiempos como los devuelve ElevenLabs: uno por carácter del texto que se le mandó (aquí, 0,1 s cada uno).
const alinear = (dicho: string) => ({
  characters: [...dicho],
  character_start_times_seconds: [...dicho].map((_, i) => i / 10),
  character_end_times_seconds: [...dicho].map((_, i) => (i + 1) / 10),
})

test("sin alias, cada palabra lleva el tiempo de sus letras y el espacio que le sigue", () => {
  const partes = partesParaDecir("Hola Luna.", "es")
  assert.deepEqual(partes, [{ orig: "Hola Luna.", dicho: "Hola Luna.", cambiada: false }])
  assert.deepEqual(palabrasDe(partes, alinear("Hola Luna."), 1), [
    ["Hola", " ", 0, 0.4],
    ["Luna.", "", 0.5, 1],
  ])
})

test("lo que se dice distinto se manda con alias, pero el subtítulo muestra el original", () => {
  const partes = partesParaDecir("Zone A is NO GO, EVA says.", "en")
  const dicho = partes.map((p) => p.dicho).join("")
  assert.equal(dicho, "Zone A is no go, Eva says.")
  const palabras = palabrasDe(partes, alinear(dicho), 3)
  assert.deepEqual(
    palabras.map((p) => p[0]),
    ["Zone", "A", "is", "NO", "GO,", "EVA", "says."],
  )
  // «NO GO» es un solo trozo cambiado: sus dos palabras comparten el tiempo de «no go».
  assert.deepEqual(palabras[3].slice(2), [1, 1.5])
  assert.deepEqual(palabras[4].slice(2), [1, 1.6])
})

test("un alias de distinto largo no corre los tiempos de lo que sigue", () => {
  const partes = partesParaDecir("Horizon Signai works", "en")
  const dicho = partes.map((p) => p.dicho).join("")
  assert.equal(dicho, "Horizon Sign A.I. works")
  const palabras = palabrasDe(partes, alinear(dicho), 3)
  assert.deepEqual(palabras, [
    ["Horizon", " ", 0, 0.7],
    ["Signai", " ", 0.8, 1.7],
    ["works", "", 1.8, 2.3],
  ])
})

test("en español, GO y NO GO se dicen como en inglés y REVIEW como riviú", () => {
  const dicho = partesParaDecir("Veredicto: GO. Antes era NO-GO y luego REVIEW.", "es")
    .map((p) => p.dicho)
    .join("")
  assert.equal(dicho, "Veredicto: gou. Antes era nou gou y luego riviú.")
})

test("si los tiempos no calzan con el texto, la frase entera dura todo el audio", () => {
  const partes = partesParaDecir("Hola Luna.", "es")
  assert.deepEqual(palabrasDe(partes, alinear("Otra cosa"), 2.5), [["Hola Luna.", "", 0, 2.5]])
  assert.deepEqual(palabrasDe(partes, null, 2.5), [["Hola Luna.", "", 0, 2.5]])
})
