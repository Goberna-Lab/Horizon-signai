// Correr: npm test
import { test } from "node:test"
import assert from "node:assert/strict"
import { paraServidor, resumen, type Registro } from "./tiempos.ts"

const R: Registro = {
  id: "abc",
  origen: "voz",
  idioma: "en",
  hora: "2026-11-15T23:00:00.000Z",
  marcas: { vad: 600, oido: 1450, parecida: 1800, murmullo: 1900, ecoSuena: 3300, respuestaSuena: 6100, fin: 15200 },
  datos: { tipo: "ia", hablaMs: 2100, fin: "ok" },
  pregunta: "How far is the Moon?",
}

test("la línea de la consola dice cuánto tardó cada paso, en segundos", () => {
  assert.equal(
    resumen(R),
    "[EVA tiempos] voz/en · → ia · habló 2,10 s · entendió 1,45 s · murmullo 1,90 s · eco 3,30 s · respuesta 6,10 s · fin 15,20 s «How far is the Moon?»",
  )
})

test("al servidor no va la pregunta", () => {
  const r = paraServidor(R)
  assert.equal("pregunta" in r, false)
  assert.deepEqual(r.marcas, R.marcas)
})
