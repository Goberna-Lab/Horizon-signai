// Volumen de un WAV. La voz en español (Piper, en argus-voz) llega como WAV PCM de 16 bits bastante más alta que la de
// inglés; el API la baja con esto antes de mandarla al navegador (apps/api/src/z6.ts). Sin dependencias: bytes y
// DataView, para que valga igual en node y en el navegador.

/**
 * Multiplica por `ganancia` las muestras de un WAV PCM de 16 bits y devuelve una copia. Si no es un WAV así (otro
 * formato, cabecera rara), lo devuelve tal cual: mejor una voz alta que ninguna.
 */
export function atenuarWav(wav: Uint8Array, ganancia: number): Uint8Array {
  if (wav.length < 44) return wav
  const etiqueta = (p: number) => String.fromCharCode(wav[p], wav[p + 1], wav[p + 2], wav[p + 3])
  if (etiqueta(0) !== "RIFF" || etiqueta(8) !== "WAVE") return wav
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  let pcm16 = false
  let p = 12
  while (p + 8 <= wav.length) {
    const id = etiqueta(p)
    const n = v.getUint32(p + 4, true)
    if (id === "fmt " && p + 24 <= wav.length) pcm16 = v.getUint16(p + 8, true) === 1 && v.getUint16(p + 22, true) === 16
    if (id === "data") {
      if (!pcm16) return wav
      // Un WAV escrito al vuelo puede traer el tamaño en 0 o en 0xFFFFFFFF: entonces los datos van hasta el final.
      const fin = n === 0 || p + 8 + n > wav.length ? wav.length : p + 8 + n
      const copia = new Uint8Array(wav) // copia de verdad (el `slice` de un Buffer de node no copia)
      const o = new DataView(copia.buffer)
      for (let i = p + 8; i + 1 < fin; i += 2) o.setInt16(i, Math.max(-32768, Math.min(32767, Math.round(o.getInt16(i, true) * ganancia))), true)
      return copia
    }
    p += 8 + n + (n % 2)
  }
  return wav
}
