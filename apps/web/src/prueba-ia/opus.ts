// La voz de la persona comprimida en Opus antes de subirla (pedido de Manuel, 2026-11-15). Medido con los tiempos de
// EVA desde un teléfono: Whisper tarda ~0,5 s, pero subir el WAV (32 KB por segundo de voz) y volver se llevaba 0,9 s
// con 1,4 s de voz y 1,8 s con 6,6 s. En Opus a 24 kbps son ~3 KB por segundo, 10 veces menos.
//
// El navegador comprime con WebCodecs (AudioEncoder) y este archivo arma el Ogg a mano (RFC 7845): los dos servicios
// de voz (horizon-voz y argus-voz) leen Ogg/Opus con ffmpeg. Donde no hay AudioEncoder con Opus (Safari viejo,
// Firefox sin WebCodecs), `comprimirVoz` devuelve null y se sube el WAV como antes.

const TASA_ENTRADA = 16000 // lo que entrega el VAD (Silero)
const BITS_POR_SEGUNDO = 24000 // voz clara para Whisper; a 16 kbps también entiende, con algo más de riesgo en nombres

// CRC-32 de Ogg: polinomio 0x04C11DB7, sin reflejar, valor inicial 0.
const TABLA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1
    t[i] = r >>> 0
  }
  return t
})()
export function crcOgg(datos: Uint8Array): number {
  let crc = 0
  for (const b of datos) crc = ((crc << 8) ^ TABLA_CRC[((crc >>> 24) ^ b) & 0xff]!) >>> 0
  return crc >>> 0
}

// Una página de Ogg con un solo paquete. `tipo`: 2 = primera página, 4 = última, 0 = intermedia.
function pagina(paquete: Uint8Array, tipo: number, granulo: bigint, serie: number, secuencia: number): Uint8Array {
  const segmentos: number[] = []
  let resto = paquete.length
  while (resto >= 255) {
    segmentos.push(255)
    resto -= 255
  }
  segmentos.push(resto)
  const p = new Uint8Array(27 + segmentos.length + paquete.length)
  const v = new DataView(p.buffer)
  p.set([0x4f, 0x67, 0x67, 0x53]) // «OggS»
  v.setUint8(4, 0) // versión
  v.setUint8(5, tipo)
  v.setBigUint64(6, granulo, true)
  v.setUint32(14, serie, true)
  v.setUint32(18, secuencia, true)
  v.setUint32(22, 0, true) // el CRC se calcula con este campo en cero
  v.setUint8(26, segmentos.length)
  p.set(segmentos, 27)
  p.set(paquete, 27 + segmentos.length)
  v.setUint32(22, crcOgg(p), true)
  return p
}

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0))

/**
 * Arma un Ogg/Opus mono con los paquetes que dio el codificador. `muestras48k`: cuántas muestras a 48 kHz dura cada
 * paquete (Opus siempre cuenta el tiempo a 48 kHz en el Ogg). `previas`: las muestras que el decodificador descarta al
 * empezar (pre-skip).
 */
export function oggOpus(paquetes: Uint8Array[], muestras48k: number[], tasaOriginal = TASA_ENTRADA, previas = 312): Uint8Array<ArrayBuffer> {
  const serie = 0x45564121 // fijo: un solo flujo por archivo
  const cabeza = new Uint8Array(19)
  const vc = new DataView(cabeza.buffer)
  cabeza.set(ascii("OpusHead"))
  vc.setUint8(8, 1) // versión
  vc.setUint8(9, 1) // canales
  vc.setUint16(10, previas, true)
  vc.setUint32(12, tasaOriginal, true)
  vc.setInt16(16, 0, true) // ganancia
  vc.setUint8(18, 0) // mapeo de canales 0: mono o estéreo
  const vendedor = ascii("horizon-signai")
  const etiquetas = new Uint8Array(8 + 4 + vendedor.length + 4)
  const ve = new DataView(etiquetas.buffer)
  etiquetas.set(ascii("OpusTags"))
  ve.setUint32(8, vendedor.length, true)
  etiquetas.set(vendedor, 12)
  ve.setUint32(12 + vendedor.length, 0, true) // sin comentarios
  const paginas = [pagina(cabeza, 2, 0n, serie, 0), pagina(etiquetas, 0, 0n, serie, 1)]
  let granulo = BigInt(previas)
  paquetes.forEach((p, i) => {
    granulo += BigInt(muestras48k[i] ?? 960)
    paginas.push(pagina(p, i === paquetes.length - 1 ? 4 : 0, granulo, serie, i + 2))
  })
  const total = paginas.reduce((s, p) => s + p.length, 0)
  const salida = new Uint8Array(total)
  let o = 0
  for (const p of paginas) {
    salida.set(p, o)
    o += p.length
  }
  return salida
}

let soportado: Promise<boolean> | null = null
const CONFIG: AudioEncoderConfig = { codec: "opus", sampleRate: TASA_ENTRADA, numberOfChannels: 1, bitrate: BITS_POR_SEGUNDO }

/** La voz (Float32 a 16 kHz, la del VAD) en Ogg/Opus, o null si este navegador no puede comprimirla. Nunca lanza. */
export async function comprimirVoz(muestras: Float32Array): Promise<Blob | null> {
  try {
    if (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") return null
    soportado ??= AudioEncoder.isConfigSupported(CONFIG).then((r) => !!r.supported).catch(() => false)
    if (!(await soportado)) return null
    const paquetes: Uint8Array[] = []
    const duraciones: number[] = []
    let fallo: unknown = null
    const cod = new AudioEncoder({
      output: (c) => {
        const b = new Uint8Array(c.byteLength)
        c.copyTo(b)
        paquetes.push(b)
        duraciones.push(Math.round(((c.duration ?? 20000) / 1e6) * 48000))
      },
      error: (e) => (fallo = e),
    })
    cod.configure(CONFIG)
    const datos = new AudioData({ format: "f32", sampleRate: TASA_ENTRADA, numberOfFrames: muestras.length, numberOfChannels: 1, timestamp: 0, data: muestras as Float32Array<ArrayBuffer> })
    cod.encode(datos)
    datos.close()
    await cod.flush()
    cod.close()
    if (fallo || !paquetes.length) return null
    return new Blob([oggOpus(paquetes, duraciones)], { type: "audio/ogg" })
  } catch {
    return null
  }
}
