import assert from "node:assert/strict"
import { test } from "node:test"
import { armarEco, limpiarTema, PLANTILLAS_ECO } from "./eco.ts"

test("armarEco pone el tema en la plantilla y rota", () => {
  assert.equal(armarEco("the distance between the Earth and the Moon", "en", 0), "Ah, the distance between the Earth and the Moon.")
  assert.equal(armarEco("the distance between the Earth and the Moon", "en", 1), "The distance between the Earth and the Moon, let me look.")
  assert.equal(armarEco("por qué falla la zona A", "es", 3), "¿Por qué falla la zona A? Lo reviso.")
  const frases = new Set(PLANTILLAS_ECO.en.map((_, k) => armarEco("zone A", "en", k)))
  assert.equal(frases.size, PLANTILLAS_ECO.en.length)
  assert.equal(armarEco("zone A", "en", PLANTILLAS_ECO.en.length), armarEco("zone A", "en", 0))
})

test("limpiarTema: minúscula al inicio, sin comillas ni signos finales", () => {
  assert.equal(limpiarTema('"The landing simulator?"'), "the landing simulator")
  assert.equal(limpiarTema("¿Por qué falla la zona A?"), "por qué falla la zona A")
  assert.equal(limpiarTema("Earth and Moon distance."), "Earth and Moon distance")
  assert.equal(limpiarTema("NASA data"), "NASA data")
})

test("limpiarTema descarta lo que no es un eco", () => {
  assert.equal(limpiarTema(""), "")
  assert.equal(limpiarTema("   "), "")
  assert.equal(limpiarTema("the distance of 384,400 km"), "") // una cifra: el eco no afirma datos
  assert.equal(limpiarTema("why the Sun is hidden at touchdown and the battery cannot last the night in zone A today"), "")
  assert.equal(armarEco("", "en", 1), "")
})
