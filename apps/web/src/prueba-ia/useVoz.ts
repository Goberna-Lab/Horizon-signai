import { useCallback, useEffect, useRef, useState } from "react"
import { chat, enFrases, hablar, transcribir, type Mensaje } from "./cliente"

export type EstadoVoz = "reposo" | "escuchando" | "pensando" | "hablando"

const UMBRAL = 0.02 // volumen que cuenta como voz
const SILENCIO_MS = 1300 // pausa que cierra tu turno
const MAX_MS = 25_000 // el servicio de voz acepta hasta 30 s
const MIN_VOZ_MS = 400
const SIN_VOZ_MS = 8000 // si no hablas en este tiempo, la conversación se pausa

type Opciones = {
  /** Historial con el que arranca la conversación (el del chat de texto). */
  historial: () => Mensaje[]
  /** Se llama con cada mensaje nuevo (tuyo o de la IA) para sumarlo al hilo. */
  alMensaje: (m: Mensaje) => void
}

/**
 * Conversación por voz en bucle: escucha → transcribe (Z6) → responde (Z6) → habla (Z6) → escucha.
 * Expone el volumen del micrófono y del audio de la IA (`nivel`, 0..1) para animar el orbe.
 */
export function useVoz({ historial, alMensaje }: Opciones) {
  const [estado, setEstado] = useState<EstadoVoz>("reposo")
  const [nivel, setNivel] = useState(0)
  const [error, setError] = useState("")
  const [tiempos, setTiempos] = useState("")

  const activa = useRef(false)
  const hilo = useRef<Mensaje[]>([])
  const audioEl = useRef<HTMLAudioElement | null>(null)
  const interrumpida = useRef(false) // tocaste mientras hablaba: no sigue con las demás frases
  const parar = useRef<(() => void) | null>(null) // cierra tu turno ya
  const soltar = useRef<(() => void) | null>(null) // descarta la grabación y libera el mic
  const opciones = useRef({ historial, alMensaje })
  opciones.current = { historial, alMensaje }

  const terminar = useCallback(() => {
    activa.current = false
    soltar.current?.()
    audioEl.current?.pause()
    setNivel(0)
    setEstado("reposo")
  }, [])

  useEffect(() => terminar, [terminar])

  const grabar = useCallback(async (): Promise<Blob | null> => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    })
    const ctx = new AudioContext()
    const an = ctx.createAnalyser()
    an.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(an)
    const rec = new MediaRecorder(stream)
    const trozos: Blob[] = []
    rec.ondataavailable = (e) => {
      if (e.data.size) trozos.push(e.data)
    }

    return new Promise((resolve) => {
      const datos = new Uint8Array(an.fftSize)
      const inicio = performance.now()
      let hablo = 0
      let ultimaVoz = 0
      let raf = 0
      let cerrado = false

      const liberar = () => {
        cancelAnimationFrame(raf)
        stream.getTracks().forEach((t) => t.stop())
        void ctx.close()
        setNivel(0)
      }
      rec.onstop = () => {
        liberar()
        soltar.current = null
        parar.current = null
        resolve(hablo > MIN_VOZ_MS ? new Blob(trozos, { type: rec.mimeType }) : null)
      }
      const cerrar = () => {
        if (cerrado) return
        cerrado = true
        if (rec.state !== "inactive") rec.stop()
      }
      parar.current = cerrar
      soltar.current = () => {
        hablo = 0
        cerrar()
      }

      const medir = () => {
        an.getByteTimeDomainData(datos)
        let suma = 0
        for (const v of datos) suma += ((v - 128) / 128) ** 2
        const rms = Math.sqrt(suma / datos.length)
        setNivel(Math.min(1, rms * 8))
        const ahora = performance.now()
        if (rms > UMBRAL) {
          hablo += 16
          ultimaVoz = ahora
        }
        const callado = hablo > MIN_VOZ_MS && ahora - ultimaVoz > SILENCIO_MS
        const sinVoz = hablo === 0 && ahora - inicio > SIN_VOZ_MS
        if (callado || sinVoz || ahora - inicio > MAX_MS) return cerrar()
        raf = requestAnimationFrame(medir)
      }
      rec.start()
      raf = requestAnimationFrame(medir)
    })
  }, [])

  // Reproduce la respuesta y publica su volumen para que el orbe "hable".
  const reproducir = useCallback((wav: Blob) => {
    return new Promise<void>((resolve) => {
      const url = URL.createObjectURL(wav)
      const a = new Audio(url)
      audioEl.current = a
      let ctx: AudioContext | null = null
      let raf = 0
      try {
        ctx = new AudioContext()
        const an = ctx.createAnalyser()
        an.fftSize = 512
        const src = ctx.createMediaElementSource(a)
        src.connect(an)
        an.connect(ctx.destination)
        const datos = new Uint8Array(an.fftSize)
        const medir = () => {
          an.getByteTimeDomainData(datos)
          let suma = 0
          for (const v of datos) suma += ((v - 128) / 128) ** 2
          setNivel(Math.min(1, Math.sqrt(suma / datos.length) * 5))
          raf = requestAnimationFrame(medir)
        }
        raf = requestAnimationFrame(medir)
      } catch {
        /* sin analizador: suena igual, el orbe solo respira */
      }
      let listo = false
      const fin = () => {
        if (listo) return
        listo = true
        cancelAnimationFrame(raf)
        void ctx?.close()
        URL.revokeObjectURL(url)
        setNivel(0)
        resolve()
      }
      a.onended = fin
      a.onpause = fin
      a.onerror = fin
      void a.play().catch(fin)
    })
  }, [])

  const bucle = useCallback(async () => {
    setError("")
    hilo.current = opciones.current.historial().slice(-18)
    try {
      while (activa.current) {
        setEstado("escuchando")
        const audio = await grabar()
        if (!activa.current) break
        if (!audio) break // silencio largo: pausa

        setEstado("pensando")
        const t0 = performance.now()
        const oido = await transcribir(audio)
        if (!activa.current) break
        if (!oido.texto) continue
        const tuyo: Mensaje = { role: "user", content: oido.texto }
        hilo.current = [...hilo.current, tuyo]
        opciones.current.alMensaje(tuyo)

        const r = await chat(hilo.current, true)
        const suyo: Mensaje = { role: "assistant", content: r.respuesta }
        hilo.current = [...hilo.current, suyo]
        opciones.current.alMensaje(suyo)
        if (!activa.current) break

        // Frase por frase: mientras suena una, ya se está generando la siguiente.
        const frases = enFrases(r.respuesta)
        interrumpida.current = false
        let siguiente = hablar(frases[0])
        for (let i = 0; i < frases.length; i++) {
          const wav = await siguiente
          if (i + 1 < frases.length) siguiente = hablar(frases[i + 1])
          if (i === 0)
            setTiempos(
              `oído ${(oido.ms / 1000).toFixed(1)} s · IA ${(r.ms / 1000).toFixed(1)} s · primera voz en ${((performance.now() - t0) / 1000).toFixed(1)} s`,
            )
          if (!activa.current || interrumpida.current) break
          setEstado("hablando")
          await reproducir(wav)
          if (!activa.current || interrumpida.current) break
          if (i + 1 < frases.length) setEstado("pensando") // la siguiente aún no está lista
        }
        // Si cortaste, la frase en vuelo se descarta (no se espera).
        siguiente.catch(() => {})
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setError(m.includes("Permission") || m.includes("NotAllowed") ? "Permite el micrófono para conversar." : m)
    } finally {
      activa.current = false
      setNivel(0)
      setEstado("reposo")
    }
  }, [grabar, reproducir])

  /** Botón central: arranca, cierra tu turno o interrumpe a la IA según el estado. */
  const tocar = useCallback(() => {
    if (estado === "reposo") {
      activa.current = true
      void bucle()
    } else if (estado === "escuchando") parar.current?.()
    else if (estado === "hablando") {
      interrumpida.current = true
      audioEl.current?.pause()
    }
  }, [bucle, estado])

  return { estado, nivel, error, tiempos, tocar, terminar }
}
