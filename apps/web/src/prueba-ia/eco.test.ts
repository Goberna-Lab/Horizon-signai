// Correr: npm test (Node ≥ 22.18 entiende TypeScript)
import { test } from "node:test"
import assert from "node:assert/strict"
import { aWav, etiquetaEncima } from "./eco.ts"

test("aWav arma un WAV PCM de 16 bits a 16 kHz", async () => {
  const muestras = new Float32Array([0, 0.5, -0.5, 1, -1, 2])
  const wav = aWav(muestras)
  assert.equal(wav.type, "audio/wav")
  const b = new DataView(await wav.arrayBuffer())
  assert.equal(b.byteLength, 44 + muestras.length * 2)
  assert.equal(String.fromCharCode(b.getUint8(0), b.getUint8(1), b.getUint8(2), b.getUint8(3)), "RIFF")
  assert.equal(b.getUint32(24, true), 16000)
  assert.equal(b.getInt16(44 + 2 * 1, true), 16383)
  assert.equal(b.getInt16(44 + 2 * 3, true), 32767)
  assert.equal(b.getInt16(44 + 2 * 4, true), -32768)
  assert.equal(b.getInt16(44 + 2 * 5, true), 32767) // recorta lo que pasa de 1
})

test("el chip de lo que dijiste encima dice qué está haciendo la IA con eso", () => {
  assert.equal(etiquetaEncima({ texto: "and Mars", estado: "entendiendo" }), "entendiendo…")
  assert.equal(etiquetaEncima({ texto: "yeah", estado: "sigo" }), "sigo")
  assert.equal(etiquetaEncima({ texto: "stop", estado: "parada" }), "me callo")
  assert.equal(etiquetaEncima({ texto: "and Mars", estado: "integrando", intencion: "adicion" }), "agregando a la respuesta")
  assert.equal(etiquetaEncima({ texto: "I meant the north", estado: "integrando", intencion: "correccion" }), "corrigiendo la respuesta")
  assert.equal(etiquetaEncima({ texto: "a joke", estado: "integrando", intencion: "pregunta" }), "pregunta nueva")
})
