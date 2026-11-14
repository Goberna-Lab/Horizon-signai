import { useCallback, useEffect, useRef, useState } from "react"
import { chat, hablar, transcribir, type Mensaje } from "./cliente"

type Estado = "reposo" | "escuchando" | "pensando" | "hablando"

const ETIQUETA: Record<Estado, string> = {
  reposo: "Hablar con la IA",
  escuchando: "Te escucho… (toca para terminar)",
  pensando: "Pensando…",
  hablando: "Hablando… (toca para parar)",
}

const UMBRAL = 0.02 // volumen que cuenta como voz
const SILENCIO_MS = 1300 // pausa que cierra tu turno
const MAX_MS = 25_000 // el servicio de voz acepta hasta 30 s
const MIN_VOZ_MS = 400

export function Voz() {
  const [estado, setEstado] = useState<Estado>("reposo")
  const [nivel, setNivel] = useState(0)
  const [log, setLog] = useState<{ quien: "tú" | "ia"; texto: string }[]>([])
  const [error, setError] = useState("")
  const [tiempos, setTiempos] = useState("")

  const activa = useRef(false) // modo conversación encendido
  const historial = useRef<Mensaje[]>([])
  const audioEl = useRef<HTMLAudioElement | null>(null)
  const parar = useRef<(() => void) | null>(null) // termina la grabación en curso
  const soltar = useRef<(() => void) | null>(null) // libera mic y analizador

  const apagar = useCallback(() => {
    activa.current = false
    parar.current?.()
    soltar.current?.()
    audioEl.current?.pause()
    setNivel(0)
    setEstado("reposo")
  }, [])

  useEffect(() => apagar, [apagar])

  // Graba un turno: devuelve el audio cuando haces una pausa tras hablar (o al tocar el botón).
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
    rec.ondataavailable = (e) => e.data.size && trozos.push(e.data)

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
      const cerrar = () => {
        if (cerrado) return
        cerrado = true
        if (rec.state !== "inactive") rec.stop()
      }
      rec.onstop = () => {
        liberar()
        soltar.current = null
        parar.current = null
        resolve(hablo > MIN_VOZ_MS ? new Blob(trozos, { type: rec.mimeType }) : null)
      }
      parar.current = cerrar
      soltar.current = () => {
        cerrado = true
        hablo = 0
        if (rec.state !== "inactive") rec.stop()
        else liberar()
      }

      const medir = () => {
        an.getByteTimeDomainData(datos)
        let suma = 0
        for (const v of datos) suma += ((v - 128) / 128) ** 2
        const rms = Math.sqrt(suma / datos.length)
        setNivel(Math.min(1, rms * 8))
        const ahora = performance.now()
        if (rms > UMBRAL) {
          if (!ultimaVoz) ultimaVoz = ahora
          hablo += 16
          ultimaVoz = ahora
        }
        const callado = hablo > MIN_VOZ_MS && ahora - ultimaVoz > SILENCIO_MS
        // Si nunca habló en 8 s, vuelve a reposo en vez de grabar silencio.
        const sinVoz = hablo === 0 && ahora - inicio > 8000
        if (callado || sinVoz || ahora - inicio > MAX_MS) return cerrar()
        raf = requestAnimationFrame(medir)
      }
      rec.start()
      raf = requestAnimationFrame(medir)
    })
  }, [])

  const reproducir = useCallback((wav: Blob) => {
    return new Promise<void>((resolve) => {
      const url = URL.createObjectURL(wav)
      const a = new Audio(url)
      audioEl.current = a
      const fin = () => {
        URL.revokeObjectURL(url)
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
    try {
      while (activa.current) {
        setEstado("escuchando")
        const audio = await grabar()
        if (!activa.current) break
        if (!audio) break // silencio: vuelve a reposo

        setEstado("pensando")
        const t0 = performance.now()
        const oido = await transcribir(audio)
        if (!oido.texto) continue
        setLog((l) => [...l, { quien: "tú", texto: oido.texto }])
        historial.current = [...historial.current, { role: "user", content: oido.texto }]

        const r = await chat(historial.current, true)
        historial.current = [...historial.current, { role: "assistant", content: r.respuesta }]
        setLog((l) => [...l, { quien: "ia", texto: r.respuesta }])
        const wav = await hablar(r.respuesta)
        setTiempos(
          `oído ${(oido.ms / 1000).toFixed(1)} s · IA ${(r.ms / 1000).toFixed(1)} s · hasta que suena ${((performance.now() - t0) / 1000).toFixed(1)} s`,
        )
        if (!activa.current) break
        setEstado("hablando")
        await reproducir(wav)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      apagar()
    }
  }, [apagar, grabar, reproducir])

  const alternar = () => {
    if (estado === "reposo") {
      activa.current = true
      void bucle()
    } else if (estado === "escuchando") {
      parar.current?.() // termina tu turno ya
    } else if (estado === "hablando") {
      audioEl.current?.pause() // interrumpe y vuelve a escucharte
    } else {
      apagar()
    }
  }

  return (
    <section className="panel" aria-label="Conversación por voz">
      <h2>Voz</h2>
      <p className="ayuda">
        Toca, habla y haz una pausa: la IA responde con voz y vuelve a escucharte. Para terminar, toca
        el botón en «pensando» o recarga.
      </p>
      <button
        type="button"
        className={`orbe ${estado}`}
        onClick={alternar}
        style={{ ["--nivel" as string]: nivel }}
      >
        <span className="orbe-aro" />
        <span className="orbe-texto">{ETIQUETA[estado]}</span>
      </button>
      {estado !== "reposo" && (
        <button type="button" className="enlace" onClick={apagar}>
          Terminar conversación
        </button>
      )}
      {error && <p className="error">{error}</p>}
      {tiempos && <p className="tiempos">{tiempos}</p>}
      <ul className="log">
        {log.map((m, i) => (
          <li key={i} className={m.quien}>
            <b>{m.quien === "tú" ? "Tú" : "IA"}</b> {m.texto}
          </li>
        ))}
      </ul>
    </section>
  )
}
