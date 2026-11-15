// Correr: npm test
import { test } from "node:test"
import assert from "node:assert/strict"
import type { Palabra } from "./colaDeVoz.ts"
import { pausasDePuntuacion } from "./puntuacion.ts"

// Tiempos reales de Kokoro para «Zone A is a NO GO, 5 km away, says EVA.» (horizon-voz, 2026-11-15).
const FRASE: Palabra[] = [
  ["Zone", " ", 0.35, 0.625], ["A", " ", 0.625, 0.825], ["is", " ", 0.825, 0.938], ["a", " ", 0.938, 1.0],
  ["NO GO", "", 1.0, 1.675], [",", " ", 1.675, 1.812], ["5", " ", 1.812, 2.15], ["km", " ", 2.15, 2.7],
  ["away", "", 2.7, 3.075], [",", " ", 3.075, 3.125], ["says", " ", 3.125, 3.375], ["EVA", "", 3.375, 3.925], [".", "", 3.925, 4.1],
]

test("un silencio tras cada coma seguida de palabra; el punto final no corta", () => {
  const cortes = pausasDePuntuacion(FRASE, 4.2)
  assert.deepEqual(cortes.map((c) => c.silencio), [0.16, 0.16])
  assert.equal(cortes[0]!.t, 1.812)
  assert.equal(cortes[1]!.t, 3.125)
})

test("el punto entre dos oraciones pausa más que la coma; signos seguidos cortan una vez", () => {
  const p: Palabra[] = [["Ah", "", 0, 0.3], [",", " ", 0.3, 0.35], ["okay", "", 0.4, 0.8], [".", " ", 0.8, 0.85], ["Really", "", 0.9, 1.3], ["?", "", 1.3, 1.32], ["!", " ", 1.32, 1.35], ["Yes", "", 1.4, 1.7], [".", "", 1.7, 1.75]]
  assert.deepEqual(pausasDePuntuacion(p, 1.8).map((c) => c.silencio), [0.16, 0.32, 0.32])
})

test("sin tiempos por palabra (la voz de español) no hay cortes", () => {
  assert.deepEqual(pausasDePuntuacion([["La zona A, la B.", "", 0, 0]], 3), [])
})
