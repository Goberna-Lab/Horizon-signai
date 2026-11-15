import { useEffect, useState } from "react"
import { ASSISTANTS, type AssistantMode } from "@horizon-signai/shared"
import type { Burbuja } from "./Chat"
import { infoVoz, type InfoVoz, type Mensaje } from "./cliente"
import { etiquetaEncima } from "./eco"
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
  reposo: "Te escucho todo el tiempo, también mientras respondo: puedes agregar algo o decir «stop». Mejor con auriculares.",
  escuchando: "Haz una pausa al terminar, o toca la Luna para enviar ya.",
  pensando: "Puedes seguir hablando: lo que agregues entra en la respuesta.",
  hablando: "Habla encima para agregar algo, o di «stop». Tocar la Luna también la corta.",
}

type Props = {
  asistente: AssistantMode
  mensajes: Burbuja[]
  agregar: (m: Burbuja) => void
  cerrar: () => void
}

export function ModoVoz({ asistente, mensajes, agregar, cerrar }: Props) {
  const voz = useVoz({
    asistente,
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
  const integrando = voz.encima?.estado === "integrando"

  return (
    <div className={`voz voz-${voz.estado}${voz.oyendo ? " voz-oyendo" : ""}`} role="dialog" aria-label="Conversación por voz">
      <Estrellas />
      <div className="voz-horizonte" aria-hidden="true" />

      <header className="voz-barra">
        <span className="chip">
          <i className="punto" />{" "}
          {info
            ? `${ASSISTANTS[asistente].name} · ${info.idioma === "en" ? "English" : "Español"} · ${info.motor} · ${info.equipo}`
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

        <div className="voz-subtitulos">
          {/* Integrando lo que agregaste: tu pregunta de antes, lo que alcanzó a decir y el chip. */}
          {ultimaTuya && !integrando && <p className="sub-tuyo">«{ultimaTuya.content}»</p>}
          {/* Mientras habla: el texto crece al ritmo de la voz. En reposo: la última respuesta. */}
          {voz.hablado ? (
            <p className="sub-ia sub-en-vivo">{voz.hablado}</p>
          ) : integrando ? (
            voz.cortado && <p className="sub-ia sub-cortada">{voz.cortado}…</p>
          ) : (
            voz.estado !== "pensando" && ultimaIa && <p className="sub-ia" aria-live="polite">{ultimaIa.content}</p>
          )}
          {voz.encima && (
            <p className={`sub-encima encima-${voz.encima.estado}`} aria-live="polite">
              <span className="encima-mas" aria-hidden="true">+</span>
              <span className="encima-texto">«{voz.encima.texto}»</span>
              <span className="encima-estado">{etiquetaEncima(voz.encima)}</span>
            </p>
          )}
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
