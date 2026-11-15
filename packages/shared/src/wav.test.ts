import assert from "node:assert/strict"
import { test } from "node:test"
import { atenuarWav } from "./wav.ts"

/** Un WAV mínimo, mono, con las muestras dadas. `formato` 1 = PCM; `bits` por muestra; `tamano`: lo que declara el trozo de datos. */
const wav = (muestras: number[], { formato = 1, bits = 16, tamano = muestras.length * 2, extra = false } = {}) => {
  const lista = extra ? 12 : 0 // un trozo «LIST» entre el formato y los datos, como escriben algunos programas
  const b = new Uint8Array(44 + lista + muestras.length * 2)
  const v = new DataView(b.buffer)
  const texto = (p: number, t: string) => [...t].forEach((c, i) => (b[p + i] = c.charCodeAt(0)))
  texto(0, "RIFF")
  v.setUint32(4, b.length - 8, true)
  texto(8, "WAVE")
  texto(12, "fmt ")
  v.setUint32(16, 16, true)
  v.setUint16(20, formato, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, 22050, true)
  v.setUint32(28, 44100, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, bits, true)
  let p = 36
  if (extra) {
    texto(p, "LIST")
    v.setUint32(p + 4, 4, true)
    texto(p + 8, "INFO")
    p += 12
  }
  texto(p, "data")
  v.setUint32(p + 4, tamano, true)
  muestras.forEach((m, i) => v.setInt16(p + 8 + i * 2, m, true))
  return b
}
const muestrasDe = (b: Uint8Array, desde = 44) => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const out: number[] = []
  for (let i = desde; i + 1 < b.length; i += 2) out.push(v.getInt16(i, true))
  return out
}

test("baja las muestras de un WAV PCM de 16 bits y no toca el original", () => {
  const original = wav([1000, -2000, 32767, -32768, 0])
  const bajo = atenuarWav(original, 0.3)
  assert.deepEqual(muestrasDe(bajo), [300, -600, 9830, -9830, 0])
  assert.deepEqual(muestrasDe(original), [1000, -2000, 32767, -32768, 0])
  assert.deepEqual([...bajo.subarray(0, 44)], [...original.subarray(0, 44)], "la cabecera queda igual")
})

test("vale con un Buffer de node, con trozos extra y con el tamaño de datos sin escribir", () => {
  assert.deepEqual(muestrasDe(atenuarWav(Buffer.from(wav([1000, -1000])), 0.5)), [500, -500])
  assert.deepEqual(muestrasDe(atenuarWav(wav([1000, -1000], { extra: true }), 0.5), 56), [500, -500])
  assert.deepEqual(muestrasDe(atenuarWav(wav([1000, -1000], { tamano: 0 }), 0.5)), [500, -500])
  assert.deepEqual(muestrasDe(atenuarWav(wav([1000, -1000], { tamano: 0xffffffff }), 0.5)), [500, -500])
})

test("no satura al subir", () => {
  assert.deepEqual(muestrasDe(atenuarWav(wav([30000, -30000]), 2)), [32767, -32768])
})

test("lo que no es un WAV PCM de 16 bits vuelve tal cual", () => {
  const mp3 = new Uint8Array(64).fill(0xff)
  assert.equal(atenuarWav(mp3, 0.3), mp3)
  const flotante = wav([1000, -1000], { formato: 3, bits: 32 })
  assert.equal(atenuarWav(flotante, 0.3), flotante)
  const corto = new Uint8Array(10)
  assert.equal(atenuarWav(corto, 0.3), corto)
})
