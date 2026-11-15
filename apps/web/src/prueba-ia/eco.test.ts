// Correr: node --test apps/web/src/prueba-ia/eco.test.ts (Node ≥ 22.18 entiende TypeScript)
import { test } from "node:test"
import assert from "node:assert/strict"
import { aWav, clasificarOido, marcaDeCorte, deEtiqueta } from "./eco.ts"

const DICHO = "Some craters there have floors that have not seen sunlight for billions of years."

test("sin texto, lo oído no sirve", () => {
  assert.equal(clasificarOido("", DICHO, true), "vacio")
  assert.equal(clasificarOido("  ...  ", "", false), "vacio")
})

test("si repite lo que la IA acaba de decir, es su eco", () => {
  assert.equal(clasificarOido("have not seen sunlight for billions of years", DICHO, true), "eco")
  assert.equal(clasificarOido("Craters there have floors.", DICHO, true), "eco")
})

test("una pregunta distinta mientras la IA habla es habla real", () => {
  assert.equal(clasificarOido("And how cold does it get at night?", DICHO, true), "habla")
  // comparte alguna palabra con lo dicho, pero la mayoría es nueva
  assert.equal(clasificarOido("also compare those craters with Mars", DICHO, true), "habla")
})

test("con la IA callada no hay eco posible: todo lo que tenga texto es habla", () => {
  assert.equal(clasificarOido("have not seen sunlight", "", false), "habla")
  assert.equal(clasificarOido("Thank you.", "", false), "habla")
})

test("los asentimientos cortos no interrumpen", () => {
  for (const t of ["Uh-huh.", "mm-hmm", "Yeah", "okay", "Right, right.", "I see", "got it"])
    assert.equal(clasificarOido(t, DICHO, true), "asentimiento", t)
})

test("una sola palabra suelta es un asentimiento mal transcrito, salvo que sea pregunta", () => {
  // Whisper transcribió un «Uh-huh.» de Kokoro como «y'all»: no debe cortar a la IA.
  assert.equal(clasificarOido("y'all", DICHO, true), "asentimiento")
  assert.equal(clasificarOido("Huh.", DICHO, true), "asentimiento")
  assert.equal(clasificarOido("Why?", DICHO, true), "habla")
  assert.equal(clasificarOido("Mars?", DICHO, true), "habla")
})

test("pedir que pare corta sin preguntar nada nuevo", () => {
  for (const t of ["Stop.", "wait", "Hold on.", "Okay, stop", "please stop"])
    assert.equal(clasificarOido(t, DICHO, true), "parada", t)
  // «stop» dentro de una frase larga es una pregunta, no una orden de parar
  assert.equal(clasificarOido("what would stop a rover from landing there", DICHO, true), "habla")
})

test("las alucinaciones típicas de Whisper sobre ruido se descartan mientras la IA habla", () => {
  for (const t of ["Thank you.", "Thanks for watching!", "you"])
    assert.equal(clasificarOido(t, DICHO, true), "ruido", t)
})

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

test("la marca de corte le dice al 27B qué hizo el usuario, siempre empezando por [interrupted", () => {
  assert.equal(marcaDeCorte(), "[interrupted]")
  assert.equal(marcaDeCorte("parada"), "[interrupted]")
  assert.equal(marcaDeCorte("adicion"), "[interrupted: the user is adding to their request]")
  assert.equal(marcaDeCorte("correccion"), "[interrupted: the user is correcting something]")
  assert.equal(marcaDeCorte("pregunta"), "[interrupted: the user is asking something new]")
})

test("las etiquetas del clasificador se traducen; lo desconocido cuenta como adición", () => {
  assert.equal(deEtiqueta("add"), "adicion")
  assert.equal(deEtiqueta("correct"), "correccion")
  assert.equal(deEtiqueta("new"), "pregunta")
  assert.equal(deEtiqueta("stop"), "parada")
  assert.equal(deEtiqueta("ignore"), "ignorar")
  assert.equal(deEtiqueta("¿?"), "adicion")
})
