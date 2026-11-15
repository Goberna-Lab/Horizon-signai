import { useCallback, useEffect, useRef, useState } from "react"
import type { AssistantMode } from "@horizon-signai/shared"
import type { MicVAD } from "@ricky0123/vad-web"
import { escuchar as escucharApi, turnoDeVoz, type EventoIntencion, type EventoOido, type EventoTurno, type Mensaje } from "./cliente"
import { crearColaDeVoz } from "./colaDeVoz"
import { aWav, deEtiqueta, marcaDeCorte, type Encima, type Intencion } from "./eco"

export type EstadoVoz = "reposo" | "escuchando" | "pensando" | "hablando"

const CHIP_FUGAZ_MS = 1500 // «sigo» y «me callo» se ven un momento y se van
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

/**
 * Quien anota los tiempos de cada turno (EVA: features/assistant/eva/tiempos.ts). `empezar(haceMs)`: el instante 0 fue
 * hace `haceMs` (cuando la persona dejó de hablar). Las marcas usan los mismos nombres que tiempos.ts.
 */
export type Cronometro = {
  empezar: (haceMs: number) => void
  marcar: (m: "vad" | "oido" | "primerTexto" | "respuestaLlega" | "respuestaSuena" | "fin", en?: number) => void
  dato: (k: string, v: string | number | boolean) => void
  pregunta: (texto: string) => void
  cerrar: (fin?: string) => void
}

type Opciones = {
  /** Anota los tiempos de cada turno (opcional: /prueba-ia no lo usa). */
  cronometro?: Cronometro
  /** Quién responde: VERA (misión) o EVA (guía). Decide cómo suena (personajes.ts). */
  asistente: AssistantMode
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
export function useVoz({ asistente, historial, alMensaje, cronometro }: Opciones) {
  const [estado, setEstado] = useState<EstadoVoz>("reposo")
  const [nivel, setNivel] = useState(0)
  const [error, setError] = useState("")
  const [tiempos, setTiempos] = useState("")
  const [hablado, setHablado] = useState("") // lo que la IA va diciendo, palabra por palabra
  const [oyendo, setOyendo] = useState(false) // el VAD detecta voz ahora mismo
  const [encima, setEncima] = useState<Encima | null>(null) // lo que dijiste encima de la IA
  const [cortado, setCortado] = useState("") // lo que la IA alcanzó a decir antes de que la cortaras

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
  const chipFugaz = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mostrarEncima = useCallback((e: Encima | null, fugaz = false) => {
    clearTimeout(chipFugaz.current)
    setEncima(e)
    if (e && fugaz) chipFugaz.current = setTimeout(() => setEncima(null), CHIP_FUGAZ_MS)
  }, [])
  const opciones = useRef({ asistente, historial, alMensaje, cronometro })
  opciones.current = { asistente, historial, alMensaje, cronometro }
  const crono = () => opciones.current.cronometro

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
    crono()?.cerrar("interrumpida")
    const dicho = t.cola.detener().trim()
    t.corte.abort()
    setHablado("")
    setCortado(dicho)
    // Para el 27B, la respuesta cortada termina en la marca; si no alcanzó a decir nada, queda solo
    // la marca. Así el pedido siguiente añade al final (user A, assistant, user B) y Ollama
    // reaprovecha la caché (~0,3 s); dos «user» seguidos la pierden (~1 s). Ver la investigación.
    const marca = marcaDeCorte(intencion)
    if (dicho) sumar({ role: "assistant", content: dicho }, { role: "assistant", content: `${dicho} ${marca}` })
    else hilo.current = [...hilo.current, { role: "assistant", content: marca }]
  }, [])

  // Crea el turno de la IA: su cola de voz y el corte del pedido que la alimenta.
  const nuevoTurno = useCallback(
    (corte: AbortController, t0: number, oidoMs: number): Turno => {
      const t: Turno = {
        corte,
        cortado: false,
        cola: crearColaDeVoz({
          ctx: audioCtx.current,
          asistente: opciones.current.asistente,
          alHablar: setHablado,
          alNivel: setNivel,
          alAgendar: (_, empieza) => {
            if (turno.current === t) crono()?.marcar("respuestaSuena", empieza)
          },
          alEmpezar: () => {
            if (turno.current !== t) return
            mostrarEncima(null) // ya responde: lo que agregaste pasa a ser tu mensaje
            setCortado("")
            vad.current?.setOptions(VAD_ENCIMA)
            cambiar("hablando")
            const total = (performance.now() - t0 + PAUSA_FIN_MS) / 1000
            setTiempos(`oído ${(oidoMs / 1000).toFixed(2)} s · primera voz ${total.toFixed(1)} s después de que dejaste de hablar`)
          },
        }),
      }
      return t
    },
    [cambiar, mostrarEncima],
  )

  // Eventos del turno → cola de voz. `guardar` recibe la respuesta completa al final.
  const alimentar = (t: Turno, guardar: (r: string) => void) => (e: EventoTurno) => {
    if (e.t === "texto") crono()?.marcar("primerTexto")
    else if (e.t === "frase") {
      crono()?.marcar("respuestaLlega")
      t.cola.agregar(e)
    } else if (e.t === "fin") {
      // Lo que midió el servidor (ver turnoDeVoz en apps/api/src/z6.ts).
      crono()?.dato("servidorMs", e.ms)
      crono()?.dato("servidorPrimeraVozMs", e.primeraVozMs)
      for (const [k, v] of Object.entries(e.tiempos ?? {})) crono()?.dato(`servidor_${k}`, v)
      guardar(e.respuesta)
    } else if (e.t === "error") throw new Error(e.msg)
  }

  // Sigue el turno hasta que termina de sonar. `flujo` resuelve con la respuesta cuando cierra el stream.
  const seguirTurno = useCallback(
    async (t: Turno, flujo: Promise<string>) => {
      let respuesta = ""
      try {
        respuesta = await flujo
        await t.cola.terminada()
      } catch (err) {
        if (t.cortado) return // lo cortó quien interrumpió, que ya ordenó el historial
        crono()?.cerrar("error")
        t.cola.detener()
        turno.current = null
        setHablado("")
        mostrarEncima(null)
        setCortado("")
        setError(err instanceof Error ? err.message : String(err))
        if (activa.current) escuchar()
        return
      }
      if (t.cortado) return
      crono()?.marcar("fin")
      crono()?.dato("respuestaCaracteres", respuesta.length)
      crono()?.cerrar("ok")
      t.cola.cerrar()
      turno.current = null
      setHablado("")
      const dicho = respuesta || t.cola.hablado()
      if (dicho) sumar({ role: "assistant", content: dicho })
      if (activa.current) escuchar()
    },
    [escuchar, mostrarEncima],
  )

  // Turno nuevo a partir de un texto ya transcrito (después de cortar a la IA).
  const responder = useCallback(
    (texto: string, t0: number, oidoMs: number, acuse?: string) => {
      sumar({ role: "user", content: texto })
      cambiar("pensando")
      const t = nuevoTurno(new AbortController(), t0, oidoMs)
      turno.current = t
      let respuesta = ""
      const flujo = turnoDeVoz(hilo.current, alimentar(t, (r) => (respuesta = r)), t.corte.signal, acuse).then(
        () => respuesta,
      )
      return seguirTurno(t, flujo)
    },
    [cambiar, nuevoTurno, seguirTurno],
  )

  // Lo que el VAD cerró. Un solo viaje al API (/voz/escuchar): transcribe, decide y, según el caso,
  // clasifica (la IA estaba en su turno) o ya responde (estaba callada).
  const procesar = useCallback(
    async (audio: Float32Array, fin: number) => {
      const wav = aWav(audio)
      const t = turno.current
      // Tiempos: el instante 0 es cuando dejó de hablar (el VAD cierra la frase PAUSA_FIN_MS después).
      const c = crono()
      const empezar = () => {
        c?.empezar(performance.now() - fin + PAUSA_FIN_MS)
        c?.marcar("vad", fin)
        c?.dato("hablaMs", Math.round(audio.length / 16))
      }
      const alOirlo = (e: EventoOido) => {
        c?.marcar("oido")
        c?.dato("oidoServidorMs", e.ms)
        if (e.texto) c?.pregunta(e.texto)
      }

      if (!t) {
        // La IA estaba callada: lo oído y la respuesta llegan en el mismo stream.
        const corte = new AbortController()
        const h: { turno: Turno | null; respuesta: string } = { turno: null, respuesta: "" }
        let alOir!: (e: EventoOido) => void
        let alFallar!: (e: unknown) => void
        const oidoP = new Promise<EventoOido>((res, rej) => ((alOir = res), (alFallar = rej)))
        empezar()
        const flujo = escucharApi(
          wav,
          { iaHabla: false, messages: hilo.current },
          (e) => {
            if (e.t === "oido") {
              alOir(e)
              alOirlo(e)
              if (e.tipo !== "habla" || !activa.current) {
                c?.dato("tipo", `ignorado:${e.tipo}`)
                c?.cerrar(e.tipo)
                return
              }
              c?.dato("tipo", "ia")
              sumar({ role: "user", content: e.texto })
              cambiar("pensando")
              h.turno = nuevoTurno(corte, fin, e.ms)
              turno.current = h.turno
            } else if (h.turno) alimentar(h.turno, (r) => (h.respuesta = r))(e)
          },
          corte.signal,
        ).then(() => h.respuesta)
        flujo.then(() => alFallar(new Error("El API no devolvió lo que oyó")), alFallar) // no-op si ya llegó
        const oido = await oidoP
        console.debug(`[voz] oído «${oido.texto}» → ${oido.tipo} (${oido.ms} ms)`)
        if (h.turno) void seguirTurno(h.turno, flujo)
        else armarSinVoz()
        return
      }

      // La IA estaba en su turno: ¿eco, «uh-huh», «stop» o habla real? Y si es habla, qué quiso.
      const pregunta = [...hilo.current].reverse().find((m) => m.role === "user")?.content ?? ""
      let oido: EventoOido | null = null
      let decision: EventoIntencion | null = null
      await escucharApi(
        wav,
        {
          iaHabla: true,
          dicho: t.cola.dichoDesde(audio.length / 16000 + 3), // tu voz + margen: lo que la IA dijo mientras
          hablado: t.cola.hablado().slice(-400),
          pregunta,
        },
        (e) => {
          if (e.t === "oido") {
            oido = e
            if (e.tipo === "habla") mostrarEncima({ texto: e.texto, estado: "entendiendo" })
          } else if (e.t === "intencion") decision = e
        },
      )
      const o = oido as EventoOido | null
      if (!o || !activa.current) return
      console.debug(`[voz] oído «${o.texto}» → ${o.tipo} (${o.ms} ms)`)
      // Habló encima de la respuesta: si es habla real, su propio registro (el de la respuesta lo cierra cortar()).
      if (o.tipo !== "habla") c?.dato("encimaIgnorado", true)
      if (o.tipo === "parada") {
        mostrarEncima({ texto: o.texto, estado: "parada" }, true)
        cortar()
        escuchar()
        return
      }
      if (o.tipo !== "habla") {
        // Eco, ruido o «uh-huh»: sigue hablando como si nada, sin chip (Whisper suele transcribir
        // el «uh-huh» como «y'all» o «It's home», y verlo en pantalla parecería un error).
        t.cola.volumen(1)
        return
      }
      const d = decision as EventoIntencion | null
      const intencion = deEtiqueta(d?.intencion ?? "add") // sin respuesta del 8B: adición
      const abrirEncima = () => {
        empezar()
        alOirlo(o)
        c?.dato("tipo", `encima:${intencion}`)
      }
      const acuse = d?.acuse ?? ""
      console.debug(`[voz] intención ${d?.intencion ?? "?"} «${acuse}» (${d?.ms ?? 0} ms)${d?.error ? ` · ${d.error}` : ""}`)
      if (turno.current !== t) {
        // La respuesta terminó mientras se decidía: lo dicho ya es un turno nuevo, sin corte.
        mostrarEncima(null)
        if (intencion !== "ignorar" && intencion !== "parada") {
          abrirEncima()
          void responder(o.texto, fin, o.ms, acuse)
        }
        return
      }
      if (intencion === "ignorar") {
        t.cola.volumen(1)
        mostrarEncima({ texto: o.texto, estado: "sigo" }, true)
      } else if (intencion === "parada") {
        mostrarEncima({ texto: o.texto, estado: "parada" }, true)
        cortar(intencion)
        escuchar()
      } else {
        mostrarEncima({ texto: o.texto, estado: "integrando", intencion })
        cortar(intencion)
        abrirEncima()
        void responder(o.texto, fin, o.ms, acuse)
      }
    },
    [responder, cortar, escuchar, armarSinVoz, mostrarEncima, cambiar, nuevoTurno, seguirTurno],
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
    mostrarEncima(null)
    setCortado("")
    cambiar("reposo")
  }, [cortar, cambiar, mostrarEncima])
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

  return { estado, nivel, error, tiempos, hablado, oyendo, encima, cortado, tocar, terminar }
}
