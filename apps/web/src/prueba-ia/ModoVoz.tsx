import { useEffect, useState } from "react"
import type { Burbuja } from "./Chat"
import { infoVoz, type InfoVoz, type Mensaje } from "./cliente"
import { Estrellas } from "./Estrellas"
import { Luna } from "./Luna"
import { useVoz, type EstadoVoz } from "./useVoz"

const TITULO: Record<EstadoVoz, string> = {
  reposo: "Toca la Luna para hablar",
  escuchando: "Te escucho…",
  pensando: "Pensando…",
  hablando: "Respondiendo…",
}
const PISTA: Record<EstadoVoz, string> = {
  reposo: "Habla y haz una pausa: la IA responde con voz y vuelve a escucharte.",
  escuchando: "Haz una pausa al terminar, o toca la Luna para enviar ya.",
  pensando: "Transcribiendo (Geografo) y pensando la respuesta (Z6)…",
  hablando: "Toca la Luna para interrumpir y hablar tú.",
}

type Props = {
  mensajes: Burbuja[]
  agregar: (m: Burbuja) => void
  cerrar: () => void
}

export function ModoVoz({ mensajes, agregar, cerrar }: Props) {
  const voz = useVoz({
    historial: () => mensajes.map(({ role, content }): Mensaje => ({ role, content })),
    alMensaje: (m) => agregar({ ...m, via: "voz" }),
  })
  const { terminar } = voz
  const [info, setInfo] = useState<InfoVoz | null>(null)
  useEffect(() => {
    void infoVoz().then(setInfo)
  }, [])

  const salir = () => {
    terminar()
    cerrar()
  }

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        terminar()
        cerrar()
      }
    }
    window.addEventListener("keydown", alTeclear)
    return () => window.removeEventListener("keydown", alTeclear)
  }, [terminar, cerrar])

  const ultimaTuya = [...mensajes].reverse().find((m) => m.role === "user" && m.via === "voz")
  const ultimaIa = [...mensajes].reverse().find((m) => m.role === "assistant" && m.via === "voz")

  return (
    <div className={`voz voz-${voz.estado}`} role="dialog" aria-label="Conversación por voz">
      <Estrellas />
      <div className="voz-horizonte" aria-hidden="true" />

      <header className="voz-barra">
        <span className="chip">
          <i className="punto" />{" "}
          {info
            ? `${info.idioma === "en" ? "English" : "Español"} · ${info.voz} · ${info.motor} · ${info.equipo}`
            : "Voz · Z6"}
        </span>
        <button type="button" className="boton-fantasma" onClick={salir}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          Volver al chat
        </button>
      </header>

      <div className="voz-centro">
        <button
          type="button"
          className="orbe"
          onClick={voz.tocar}
          disabled={voz.estado === "pensando"}
          aria-label={TITULO[voz.estado]}
          style={{ ["--nivel" as string]: voz.nivel.toFixed(3) }}
        >
          <span className="orbe-halo" />
          <span className="orbe-anillo" />
          <span className="orbe-anillo orbe-anillo-2" />
          <Luna className="orbe-luna" />
        </button>

        <h2 className="voz-titulo" aria-live="polite">{TITULO[voz.estado]}</h2>
        <p className="voz-pista">{PISTA[voz.estado]}</p>
        {voz.error && <p className="error">{voz.error}</p>}

        <div className="voz-subtitulos" aria-live="polite">
          {ultimaTuya && <p className="sub-tuyo">«{ultimaTuya.content}»</p>}
          {ultimaIa && <p className="sub-ia">{ultimaIa.content}</p>}
        </div>
        {voz.tiempos && <p className="voz-tiempos">{voz.tiempos}</p>}
      </div>

      {voz.estado !== "reposo" && (
        <button type="button" className="voz-terminar" onClick={terminar}>
          Pausar conversación
        </button>
      )}
    </div>
  )
}
