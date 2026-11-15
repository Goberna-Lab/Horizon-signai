import { useCallback, useState } from "react"
import { ASSISTANT_MODES, ASSISTANTS, type AssistantMode } from "@horizon-signai/shared"
import { Chat, type Burbuja } from "./Chat"
import { usarAsistente } from "./cliente"
import { Estrellas } from "./Estrellas"
import { recordar } from "./memoria"
import { ModoVoz } from "./ModoVoz"
import "./prueba-ia.css"

/**
 * /prueba-ia: banco de pruebas de las dos asistentes, VERA (misión) y EVA (guía). Cada una con su hilo;
 * el texto va a Geografo y la voz a la Z6.
 */
export function PruebaIa() {
  const inicial = new URLSearchParams(location.search).get("asistente") === "assistant" ? "assistant" : "educational"
  const [asistente, setAsistente] = useState<AssistantMode>(inicial)
  const [hilos, setHilos] = useState<Record<AssistantMode, Burbuja[]>>({ assistant: [], educational: [] })
  const [modoVoz, setModoVoz] = useState(false)
  usarAsistente(asistente)

  const mensajes = hilos[asistente]
  const setMensajes = useCallback(
    (f: (m: Burbuja[]) => Burbuja[]) => setHilos((h) => ({ ...h, [asistente]: f(h[asistente]) })),
    [asistente],
  )
  const agregar = useCallback(
    (m: Burbuja) => {
      if (m.role === "user") recordar(m.content)
      setMensajes((ms) => [...ms, m])
    },
    [setMensajes],
  )
  const cerrarVoz = useCallback(() => setModoVoz(false), [])

  return (
    <main className="prueba">
      <Estrellas densidad={0.7} />
      <nav className="selector-asistente" aria-label="Assistant">
        {ASSISTANT_MODES.map((a) => (
          <button key={a} type="button" aria-pressed={a === asistente} onClick={() => setAsistente(a)} disabled={modoVoz}>
            <b>{ASSISTANTS[a].name}</b> · {ASSISTANTS[a].role}
          </button>
        ))}
      </nav>
      <Chat key={asistente} mensajes={mensajes} setMensajes={setMensajes} abrirVoz={() => setModoVoz(true)} />
      {modoVoz && <ModoVoz asistente={asistente} mensajes={mensajes} agregar={agregar} cerrar={cerrarVoz} />}
    </main>
  )
}
