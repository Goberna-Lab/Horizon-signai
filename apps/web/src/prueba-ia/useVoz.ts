import { useCallback, useEffect, useRef, useState } from "react"
import { transcribir, turnoDeVoz, type Mensaje } from "./cliente"
import { crearColaDeVoz } from "./colaDeVoz"

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
  const [hablado, setHablado] = useState("") // lo que la IA va diciendo, palabra por palabra
  const turno = useRef<{ corte: AbortController; cola: ReturnType<typeof crearColaDeVoz> } | null>(null)
  const interrumpida = useRef(false) // tocaste mientras hablaba: no sigue con las demás frases
  const parar = useRef<(() => void) | null>(null) // cierra tu turno ya
  const soltar = useRef<(() => void) | null>(null) // descarta la grabación y libera el mic
  // Un solo AudioContext, creado y reanudado al TOCAR (gesto del usuario): uno creado más tarde,
  // tras esperar al servidor, el navegador puede dejarlo suspendido y el audio sale mudo.
  const audioCtx = useRef<AudioContext | null>(null)
  const opciones = useRef({ historial, alMensaje })
  opciones.current = { historial, alMensaje }

  const terminar = useCallback(() => {
    activa.current = false
    soltar.current?.()
    turno.current?.cola.detener()
    turno.current?.corte.abort()
    void audioCtx.current?.close()
    audioCtx.current = null
    setNivel(0)
    setEstado("reposo")
  }, [])

  useEffect(() => terminar, [terminar])

  const grabar = useCallback(async (): Promise<Blob | null> => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    })
    const ctx = audioCtx.current ?? new AudioContext()
    audioCtx.current = ctx
    if (ctx.state !== "running") await ctx.resume().catch(() => {})
    const an = ctx.createAnalyser()
    an.fftSize = 1024
    const fuente = ctx.createMediaStreamSource(stream)
    fuente.connect(an)
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
        fuente.disconnect()
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

        // Turno en streaming: el texto, el audio de cada frase y sus tiempos llegan juntos;
        // la voz empieza con la primera frase y el texto se revela al ritmo de la voz.
        interrumpida.current = false
        const corte = new AbortController()
        const cola = crearColaDeVoz({
          ctx: audioCtx.current,
          alHablar: setHablado,
          alNivel: setNivel,
          alEmpezar: () => {
            setEstado("hablando")
            setTiempos(`oído ${(oido.ms / 1000).toFixed(1)} s · primera voz ${((performance.now() - t0) / 1000).toFixed(1)} s después de que dejaste de hablar`)
          },
        })
        turno.current = { corte, cola }
        let respuesta = ""
        try {
          await turnoDeVoz(
            hilo.current,
            (e) => {
              if (e.t === "frase") cola.agregar(e)
              else if (e.t === "fin") respuesta = e.respuesta
              else if (e.t === "error") throw new Error(e.msg)
            },
            corte.signal,
          )
          await cola.terminada()
        } catch (err) {
          if (!interrumpida.current) throw err
        } finally {
          cola.cerrar()
          turno.current = null
        }
        // Al historial va lo que se alcanzó a decir si la interrumpiste; si no, la respuesta entera.
        const dicho = interrumpida.current ? cola.hablado().trim() : respuesta || cola.hablado()
        setHablado("")
        if (dicho) {
          const suyo: Mensaje = { role: "assistant", content: dicho }
          hilo.current = [...hilo.current, suyo]
          opciones.current.alMensaje(suyo)
        }
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setError(m.includes("Permission") || m.includes("NotAllowed") ? "Permite el micrófono para conversar." : m)
    } finally {
      activa.current = false
      setNivel(0)
      setEstado("reposo")
    }
  }, [grabar])

  /** Botón central: arranca, cierra tu turno o interrumpe a la IA según el estado. */
  const tocar = useCallback(() => {
    if (estado === "reposo") {
      // Dentro del gesto: así el navegador deja sonar el audio que llegue después.
      if (!audioCtx.current || audioCtx.current.state === "closed") audioCtx.current = new AudioContext()
      void audioCtx.current.resume()
      activa.current = true
      void bucle()
    } else if (estado === "escuchando") parar.current?.()
    else if (estado === "hablando") {
      interrumpida.current = true
      turno.current?.cola.detener()
      turno.current?.corte.abort()
    }
  }, [bucle, estado])

  return { estado, nivel, error, tiempos, hablado, tocar, terminar }
}
