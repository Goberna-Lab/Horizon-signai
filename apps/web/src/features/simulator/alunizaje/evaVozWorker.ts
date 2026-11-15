// Voz de EVA generada en el propio navegador con Kokoro-82M (kokoro-js, ONNX en WebAssembly), en un worker para que
// no trabe la escena. La primera vez baja el modelo (~90 MB, cuantizado q8) de Hugging Face; después queda en la caché
// del navegador. Recibe { id, text, voice } y devuelve { id, wav } (WAV de 16 bits) o { id, error }.
// Portado de nuestro simulador NASA (evaVozWorker.js). Solo se carga al entrar al alunizaje (voz.ts lo crea).
import { KokoroTTS } from "kokoro-js"

type VozKokoro = NonNullable<NonNullable<Parameters<KokoroTTS["generate"]>[1]>["voice"]>
type Pedido = { id: number; text: string; voice: string }
type Scope = {
  onmessage: ((e: MessageEvent<Pedido>) => void) | null
  postMessage: (msg: unknown, transfer?: Transferable[]) => void
}
const scope = self as unknown as Scope

let ready: Promise<KokoroTTS> | null = null
const load = () =>
  (ready ??= KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "wasm" }))

function wav(f32: Float32Array, sr: number) {
  const n = f32.length
  const b = new ArrayBuffer(44 + n * 2)
  const v = new DataView(b)
  const s = (o: number, t: string) => {
    for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i))
  }
  s(0, "RIFF")
  v.setUint32(4, 36 + n * 2, true)
  s(8, "WAVEfmt ")
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, sr, true)
  v.setUint32(28, sr * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  s(36, "data")
  v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, f32[i])) * 32767, true)
  return b
}

// De una en una: el modelo no admite dos generaciones a la vez (el orden lo decide la cola del hilo principal)
scope.onmessage = async ({ data }) => {
  const { id, text, voice } = data
  try {
    const tts = await load()
    if (!text) {
      scope.postMessage({ id, wav: null }) // solo cargar el modelo
      return
    }
    const a = await tts.generate(text, { voice: voice as VozKokoro })
    const b = wav(a.audio, a.sampling_rate)
    scope.postMessage({ id, wav: b }, [b])
  } catch (e) {
    scope.postMessage({ id, error: String((e as Error)?.message ?? e) })
  }
}
