// Partes del oído que solo usa el navegador. La clasificación de lo oído vive en
// @horizon-signai/shared (la usa también el API).
import type { Intencion } from "@horizon-signai/shared"

export { clasificarOido, deEtiqueta, marcaDeCorte, type Intencion, type Oido } from "@horizon-signai/shared"

/** Muestras de Silero (Float32, 16 kHz, mono) → WAV PCM de 16 bits, que el servicio de voz decodifica. */
export function aWav(muestras: Float32Array, sr = 16000): Blob {
  const b = new DataView(new ArrayBuffer(44 + muestras.length * 2))
  const texto = (o: number, s: string) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)))
  texto(0, "RIFF")
  b.setUint32(4, 36 + muestras.length * 2, true)
  texto(8, "WAVE")
  texto(12, "fmt ")
  b.setUint32(16, 16, true) // tamaño del bloque fmt
  b.setUint16(20, 1, true) // PCM
  b.setUint16(22, 1, true) // mono
  b.setUint32(24, sr, true)
  b.setUint32(28, sr * 2, true) // bytes por segundo
  b.setUint16(32, 2, true) // bytes por muestra
  b.setUint16(34, 16, true) // bits
  texto(36, "data")
  b.setUint32(40, muestras.length * 2, true)
  muestras.forEach((m, i) => {
    const x = Math.max(-1, Math.min(1, m))
    b.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true)
  })
  return new Blob([b.buffer], { type: "audio/wav" })
}

// ── Lo que dijiste encima, en pantalla (chip bajo la respuesta) ─────────────────────────────
export type Encima = {
  texto: string
  estado: "entendiendo" | "integrando" | "sigo" | "parada"
  intencion?: Intencion
}

export function etiquetaEncima(e: Encima): string {
  if (e.estado === "entendiendo") return "entendiendo…"
  if (e.estado === "sigo") return "sigo"
  if (e.estado === "parada") return "me callo"
  if (e.intencion === "correccion") return "corrigiendo la respuesta"
  if (e.intencion === "pregunta") return "pregunta nueva"
  return "agregando a la respuesta"
}
