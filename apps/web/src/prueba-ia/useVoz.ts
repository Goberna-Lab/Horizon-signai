import { useCallback, useEffect, useRef, useState } from "react"
import type { MicVAD } from "@ricky0123/vad-web"
import { clasificar, transcribir, turnoDeVoz, type Mensaje } from "./cliente"
import { crearColaDeVoz } from "./colaDeVoz"
import { aWav, clasificarOido, deEtiqueta, marcaDeCorte, type Intencion } from "./eco"

export type EstadoVoz = "reposo" | "escuchando" | "pensando" | "hablando"

const PAUSA_FIN_MS = 800 // silencio que cierra lo que dijiste (Silero; antes 1300 ms con volumen)
const SIN_VOZ_MS = 20_000 // si no hablas en este tiempo, la conversación se pausa
const VOLUMEN_ENCIMA = 0.3 // la IA baja a esto mientras hablas encima, hasta saber qué dijiste
// Con parlantes el micrófono oye a la IA (el navegador no cancela su voz): mientras habla, el VAD
// pide más certeza. No más duración: un «stop» dura ~0,3 s y con 500 ms se perdía. El eco que
// pase igual se filtra por texto (eco.ts); solo cuesta una transcripción de ~0,15 s.
const VAD_NORMAL = { positiveSpeechThreshold: 0.5, negativeSpeechThreshold: 0.35, minSpeechMs: 300 }
const VAD_ENCIMA = { positiveSpeechThreshold: 0.7, negativeSpeechThreshold: 0.5, minSpeechMs: 200 }
// Modelo de Silero, worklet y wasm de ONNX: del CDN, en las versiones exactas de package.json.
const VAD_CDN = "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.31/dist/"
const ORT_CDN = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/"

type Opciones = {
  /** Historial con el que arranca la conversación (el del chat de texto). */
  historial: () => Mensaje[]
  /** Se llama con cada mensaje nuevo (tuyo o de la IA) para sumarlo al hilo. */
  alMensaje: (m: Mensaje) => void
}

type Turno = { corte: AbortController; cola: ReturnType<typeof crearColaDeVoz>; cortado: boolean }

/**
 * Conversación por voz con el micrófono SIEMPRE abierto: puedes hablar mientras la IA piensa o
 * responde. Lo que dices encima se transcribe y, si no es eco ni un «uh-huh», corta la respuesta y
 * la IA vuelve a responder con lo que agregaste (lo que alcanzó a decir queda en el historial).
 * Expone el volumen del micrófono o de la voz (`nivel`, 0..1) para animar el orbe.
 */
export function useVoz({ historial, alMensaje }: Opciones) {
  const [estado, setEstado] = useState<EstadoVoz>("reposo")
  const [nivel, setNivel] = useState(0)
  const [error, setError] = useState("")
  const [tiempos, setTiempos] = useState("")
  const [hablado, setHablado] = useState("") // lo que la IA va diciendo, palabra por palabra
  const [oyendo, setOyendo] = useState(false) // el VAD detecta voz ahora mismo

  const estadoRef = useRef<EstadoVoz>("reposo")
  const activa = useRef(false)
  const hilo = useRef<Mensaje[]>([])
  const turno = useRef<Turno | null>(null)
  const vad = useRef<MicVAD | null>(null)
  const microfono = useRef<MediaStream | null>(null)
  // Un solo AudioContext, creado y reanudado al TOCAR (gesto del usuario): uno creado más tarde
  // el navegador puede dejarlo suspendido y el audio sale mudo. Lo comparten el VAD y la voz.
  const audioCtx = useRef<AudioContext | null>(null)
  const fila = useRef<Promise<void>>(Promise.resolve()) // lo oído se procesa en orden, de a uno
  const sinVoz = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const opciones = useRef({ historial, alMensaje })
  opciones.current = { historial, alMensaje }

  const cambiar = useCallback((e: EstadoVoz) => {
    estadoRef.current = e
    setEstado(e)
  }, [])

  const sumar = (m: Mensaje, paraLaIa = m) => {
    hilo.current = [...hilo.current, paraLaIa]
    opciones.current.alMensaje(m)
  }

  const terminarRef = useRef<() => void>(() => {})
  const armarSinVoz = useCallback(() => {
    clearTimeout(sinVoz.current)
    sinVoz.current = setTimeout(() => {
      if (estadoRef.current === "escuchando") terminarRef.current()
    }, SIN_VOZ_MS)
  }, [])

  const escuchar = useCallback(() => {
    vad.current?.setOptions(VAD_NORMAL)
    cambiar("escuchando")
    armarSinVoz()
  }, [cambiar, armarSinVoz])

  /**
   * Corta la respuesta en curso. Lo que alcanzó a decir pasa al historial terminado en una marca
   * que le dice al 27B por qué lo cortaron (ver marcaDeCorte y SISTEMA_VOZ en el API).
   */
  const cortar = useCallback((intencion?: Intencion) => {
    const t = turno.current
    if (!t) return
    t.cortado = true
    turno.current = null
    const dicho = t.cola.detener().trim()
    t.corte.abort()
    setHablado("")
    // Para el 27B, la respuesta cortada termina en la marca; si no alcanzó a decir nada, queda solo
    // la marca. Así el pedido siguiente añade al final (user A, assistant, user B) y Ollama
    // reaprovecha la caché (~0,3 s); dos «user» seguidos la pierden (~1 s). Ver la investigación.
    const marca = marcaDeCorte(intencion)
    if (dicho) sumar({ role: "assistant", content: dicho }, { role: "assistant", content: `${dicho} ${marca}` })
    else hilo.current = [...hilo.current, { role: "assistant", content: marca }]
  }, [])

  const responder = useCallback(
    async (texto: string, t0: number, oidoMs: number, acuse?: string) => {
      sumar({ role: "user", content: texto })
      cambiar("pensando")
      const corte = new AbortController()
      const t: Turno = {
        corte,
        cortado: false,
        cola: crearColaDeVoz({
          ctx: audioCtx.current,
          alHablar: setHablado,
          alNivel: setNivel,
          alEmpezar: () => {
            if (turno.current !== t) return
            vad.current?.setOptions(VAD_ENCIMA)
            cambiar("hablando")
            const total = (performance.now() - t0 + PAUSA_FIN_MS) / 1000
            setTiempos(`oído ${(oidoMs / 1000).toFixed(2)} s · primera voz ${total.toFixed(1)} s después de que dejaste de hablar`)
          },
        }),
      }
      turno.current = t
      let respuesta = ""
      try {
        await turnoDeVoz(
          hilo.current,
          (e) => {
            if (e.t === "frase") t.cola.agregar(e)
            else if (e.t === "fin") respuesta = e.respuesta
            else if (e.t === "error") throw new Error(e.msg)
          },
          corte.signal,
          acuse,
        )
        await t.cola.terminada()
      } catch (err) {
        if (t.cortado) return // lo cortó quien interrumpió, que ya ordenó el historial
        t.cola.detener()
        turno.current = null
        setHablado("")
        setError(err instanceof Error ? err.message : String(err))
        if (activa.current) escuchar()
        return
      }
      if (t.cortado) return
      t.cola.cerrar()
      turno.current = null
      setHablado("")
      const dicho = respuesta || t.cola.hablado()
      if (dicho) sumar({ role: "assistant", content: dicho })
      if (activa.current) escuchar()
    },
    [cambiar, escuchar],
  )

  // Lo que el VAD cerró: transcribir y decidir según si la IA estaba en su turno.
  const procesar = useCallback(
    async (audio: Float32Array, fin: number) => {
      const oido = await transcribir(aWav(audio))
      if (!activa.current) return
      const t = turno.current
      // La ventana cubre lo que duró tu voz, la transcripción y un margen.
      const ventana = audio.length / 16000 + (performance.now() - fin) / 1000 + 2
      const tipo = clasificarOido(oido.texto, t ? t.cola.dichoDesde(ventana) : "", !!t)
      console.debug(`[voz] oído «${oido.texto}» → ${tipo}`)

      if (!t) {
        if (tipo === "habla") void responder(oido.texto, fin, oido.ms)
        else armarSinVoz()
        return
      }
      if (tipo === "parada") {
        cortar()
        escuchar()
        return
      }
      if (tipo !== "habla") {
        t.cola.volumen(1) // eco, ruido o «uh-huh»: sigue hablando como si nada
        return
      }
      // Habla real: el 8B decide qué quiso (la voz sigue bajada mientras tanto). Si falla, adición.
      const pregunta = [...hilo.current].reverse().find((m) => m.role === "user")?.content ?? ""
      // El mismo 8B escribe el acuse que suena enseguida («Good point, adding Mars.»).
      const { intencion, acuse } = await clasificar(pregunta, t.cola.hablado().slice(-400), oido.texto)
        .then((r) => {
          console.debug(`[voz] intención ${r.tipo} «${r.acuse}» (${r.ms} ms)`)
          return { intencion: deEtiqueta(r.tipo), acuse: r.acuse }
        })
        .catch((e: unknown) => {
          console.debug(`[voz] clasificador falló (${String(e)}): adición sin acuse`)
          return { intencion: "adicion" as const, acuse: "" }
        })
      if (!activa.current) return
      if (turno.current !== t) {
        // La respuesta terminó mientras se clasificaba: lo dicho ya es un turno nuevo, sin corte.
        if (intencion !== "ignorar" && intencion !== "parada") void responder(oido.texto, fin, oido.ms, acuse)
        return
      }
      if (intencion === "ignorar") t.cola.volumen(1)
      else if (intencion === "parada") {
        cortar(intencion)
        escuchar()
      } else {
        cortar(intencion)
        void responder(oido.texto, fin, oido.ms, acuse)
      }
    },
    [responder, cortar, escuchar, armarSinVoz],
  )

  const terminar = useCallback(() => {
    activa.current = false
    clearTimeout(sinVoz.current)
    cortar()
    void vad.current?.destroy()
    vad.current = null
    microfono.current?.getTracks().forEach((t) => t.stop())
    microfono.current = null
    void audioCtx.current?.close()
    audioCtx.current = null
    setNivel(0)
    setOyendo(false)
    cambiar("reposo")
  }, [cortar, cambiar])
  terminarRef.current = terminar

  useEffect(() => terminar, [terminar])

  const iniciar = useCallback(async () => {
    setError("")
    activa.current = true
    hilo.current = opciones.current.historial().slice(-18)
    cambiar("escuchando")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      microfono.current = stream
      const { MicVAD } = await import("@ricky0123/vad-web")
      if (!activa.current) return stream.getTracks().forEach((t) => t.stop())
      vad.current = await MicVAD.new({
        model: "v5",
        audioContext: audioCtx.current!,
        getStream: async () => stream,
        pauseStream: async () => {},
        resumeStream: async () => stream,
        baseAssetPath: VAD_CDN,
        onnxWASMBasePath: ORT_CDN,
        redemptionMs: PAUSA_FIN_MS,
        preSpeechPadMs: 300,
        submitUserSpeechOnPause: true,
        ...VAD_NORMAL,
        onFrameProcessed: (_p, frame) => {
          if (estadoRef.current !== "escuchando") return // hablando: el orbe sigue a la voz de la IA
          let suma = 0
          for (const v of frame) suma += v * v
          setNivel(Math.min(1, Math.sqrt(suma / frame.length) * 8))
        },
        onSpeechStart: () => {
          clearTimeout(sinVoz.current)
          setOyendo(true)
          turno.current?.cola.volumen(VOLUMEN_ENCIMA)
        },
        onVADMisfire: () => {
          setOyendo(false)
          turno.current?.cola.volumen(1)
          if (estadoRef.current === "escuchando") armarSinVoz()
        },
        onSpeechEnd: (audio) => {
          setOyendo(false)
          const fin = performance.now()
          fila.current = fila.current
            .then(() => procesar(audio, fin))
            .catch((e: unknown) => {
              turno.current?.cola.volumen(1)
              setError(e instanceof Error ? e.message : String(e))
            })
        },
      })
      if (!activa.current) return terminar()
      await vad.current.start()
      armarSinVoz()
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      terminar()
      setError(m.includes("Permission") || m.includes("NotAllowed") ? "Permite el micrófono para conversar." : m)
    }
  }, [cambiar, procesar, terminar, armarSinVoz])

  /** Botón central: arranca, cierra lo que estás diciendo o corta a la IA según el estado. */
  const tocar = useCallback(() => {
    if (estado === "reposo") {
      // Dentro del gesto: así el navegador deja sonar el audio que llegue después.
      if (!audioCtx.current || audioCtx.current.state === "closed") audioCtx.current = new AudioContext()
      void audioCtx.current.resume()
      void iniciar()
    } else if (estado === "escuchando") {
      // Pausar con submitUserSpeechOnPause entrega ya lo que llevas dicho.
      void vad.current?.pause().then(() => vad.current?.start())
    } else {
      cortar()
      escuchar()
    }
  }, [estado, iniciar, cortar, escuchar])

  return { estado, nivel, error, tiempos, hablado, oyendo, tocar, terminar }
}
