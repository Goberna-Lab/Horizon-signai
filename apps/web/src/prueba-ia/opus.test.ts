// Correr: npm test
import { test } from "node:test"
import assert from "node:assert/strict"
import { crcOgg, oggOpus } from "./opus.ts"

const paginas = (b: Uint8Array) => {
  const out: { tipo: number; granulo: bigint; secuencia: number; crcOk: boolean; carga: Uint8Array }[] = []
  let o = 0
  while (o < b.length) {
    const v = new DataView(b.buffer, b.byteOffset + o)
    assert.equal(String.fromCharCode(...b.subarray(o, o + 4)), "OggS")
    const nseg = b[o + 26]!
    const largo = [...b.subarray(o + 27, o + 27 + nseg)].reduce((s, x) => s + x, 0)
    const total = 27 + nseg + largo
    const copia = b.slice(o, o + total)
    new DataView(copia.buffer).setUint32(22, 0, true)
    out.push({ tipo: b[o + 5]!, granulo: v.getBigUint64(6, true), secuencia: v.getUint32(18, true), crcOk: crcOgg(copia) === v.getUint32(22, true), carga: b.subarray(o + 27 + nseg, o + total) })
    o += total
  }
  return out
}

test("el Ogg trae cabecera, etiquetas y un paquete por página, con CRC y tiempos en orden", () => {
  const p = paginas(oggOpus([new Uint8Array(40), new Uint8Array(300), new Uint8Array(12)], [960, 960, 960]))
  assert.equal(p.length, 5)
  assert.equal(String.fromCharCode(...p[0]!.carga.subarray(0, 8)), "OpusHead")
  assert.equal(String.fromCharCode(...p[1]!.carga.subarray(0, 8)), "OpusTags")
  assert.deepEqual(p.map((x) => x.tipo), [2, 0, 0, 0, 4]) // primera y última marcadas
  assert.deepEqual(p.map((x) => x.secuencia), [0, 1, 2, 3, 4])
  assert.deepEqual(p.slice(2).map((x) => x.granulo), [312n + 960n, 312n + 1920n, 312n + 2880n])
  assert.equal(p[3]!.carga.length, 300) // un paquete de más de 255 bytes va en dos segmentos
  assert.ok(p.every((x) => x.crcOk))
})
