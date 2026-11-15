// El oído de EVA con manos libres: el micrófono abierto con detección de voz (Silero, en el navegador) que entrega
// cada frase dicha como WAV. Lo que se hace con ella está en EvaCompanera (`alOirFrase`): se manda al API, que la
// transcribe y busca la pregunta frecuente más parecida (/api/z6/voz/entender).
//
// - Se enciende una vez, con un toque de la persona (el navegador lo exige para el audio y pide permiso del
//   micrófono). Después escucha o descansa según `escuchar(true|false)`: EVA solo escucha cuando espera algo.
// - El silencio que cierra una frase es corto (0,6 s): casi todo lo que se le dice son órdenes de una o dos palabras.
// - Usa la cancelación de eco del navegador; lo que aún se cuela de la voz de EVA se descarta por texto (escucha.ts).
import { useCallback, useEffect, useRef, useState } from "react"
import type { MicVAD } from "@ricky0123/vad-web"
import { aWav } from "@/prueba-ia/eco"

// Las mismas versiones fijas que usa /prueba-ia (useVoz.ts).
const VAD_CDN = "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.31/dist/"
const ORT_CDN = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/"

export type EstadoOido = "apagado" | "pidiendo" | "escuchando" | "oyendo" | "negado"

export function useOido(alOir: (wav: Blob) => void) {
  const [estado, setEstado] = useState<EstadoOido>("apagado")
  const vad = useRef<MicVAD | null>(null)
  const microfono = useRef<MediaStream | null>(null)
  const quiere = useRef(false) // EVA espera algo: debe escuchar
  const encendiendo = useRef(false)
  const alOirRef = useRef(alOir)
  alOirRef.current = alOir

  /** Abre el micrófono (pide permiso). Devuelve si quedó listo. Llamar desde un toque de la persona. */
  const encender = useCallback(async (ctx: AudioContext | null) => {
    if (vad.current) return true
    if (encendiendo.current || !ctx || !navigator.mediaDevices?.getUserMedia) return false
    encendiendo.current = true
    setEstado("pidiendo")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      microfono.current = stream
      const { MicVAD } = await import("@ricky0123/vad-web")
      vad.current = await MicVAD.new({
        model: "v5",
        audioContext: ctx,
        getStream: async () => stream,
        pauseStream: async () => {},
        resumeStream: async () => stream,
        baseAssetPath: VAD_CDN,
        onnxWASMBasePath: ORT_CDN,
        redemptionMs: 600,
        preSpeechPadMs: 300,
        positiveSpeechThreshold: 0.6,
        negativeSpeechThreshold: 0.4,
        minSpeechMs: 250,
        submitUserSpeechOnPause: false,
        onSpeechStart: () => setEstado("oyendo"),
        onVADMisfire: () => setEstado("escuchando"),
        onSpeechEnd: (audio) => {
          setEstado("escuchando")
          alOirRef.current(aWav(audio))
        },
      })
      if (quiere.current) await vad.current.start()
      setEstado(quiere.current ? "escuchando" : "apagado")
      return true
    } catch {
      microfono.current?.getTracks().forEach((t) => t.stop())
      microfono.current = null
      setEstado("negado")
      return false
    } finally {
      encendiendo.current = false
    }
  }, [])

  /** Escuchar o descansar (sin cerrar el micrófono). */
  const escuchar = useCallback((si: boolean) => {
    if (quiere.current === si) return
    quiere.current = si
    const v = vad.current
    if (!v) return
    void (si ? v.start() : v.pause()).catch(() => {})
    setEstado(si ? "escuchando" : "apagado")
  }, [])

  useEffect(
    () => () => {
      void vad.current?.destroy()
      microfono.current?.getTracks().forEach((t) => t.stop())
    },
    [],
  )

  return { estado, encender, escuchar, listo: () => vad.current !== null }
}
