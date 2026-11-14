import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { chatStream, type Mensaje } from "./cliente"
import { Luna } from "./Luna"

export type Burbuja = Mensaje & { via?: "voz" }

const SUGERENCIAS = [
  "¿Por qué el polo sur lunar es clave para Artemis?",
  "Explícame qué es el terminador lunar",
  "Ideas para una misión de rover en 3 pasos",
  "¿Cuánto tarda la luz en llegar de la Luna?",
]

type Props = {
  mensajes: Burbuja[]
  setMensajes: (f: (m: Burbuja[]) => Burbuja[]) => void
  abrirVoz: () => void
}

export function Chat({ mensajes, setMensajes, abrirVoz }: Props) {
  const [texto, setTexto] = useState("")
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState("")
  const [origen, setOrigen] = useState("Geografo · qwen3:8b")
  const corte = useRef<AbortController | null>(null)
  const hilo = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)

  // Sigue el final del hilo solo si ya estabas abajo (no te arrastra si subiste a leer).
  useEffect(() => {
    const h = hilo.current
    if (h && h.scrollHeight - h.scrollTop - h.clientHeight < 160) h.scrollTop = h.scrollHeight
  }, [mensajes])

  // El campo crece con el texto, hasta un tope.
  useEffect(() => {
    const c = campo.current
    if (!c) return
    c.style.height = "auto"
    c.style.height = `${Math.min(c.scrollHeight, 200)}px`
  }, [texto])

  const enviar = async (contenido: string) => {
    const t = contenido.trim()
    if (!t || enCurso) return
    const previos = mensajes.map(({ role, content }) => ({ role, content }))
    const historial: Mensaje[] = [...previos, { role: "user", content: t }]
    setMensajes((m) => [...m, { role: "user", content: t }, { role: "assistant", content: "" }])
    setTexto("")
    setError("")
    setEnCurso(true)
    const ctl = new AbortController()
    corte.current = ctl
    const ponerUltimo = (content: string) =>
      setMensajes((m) => [...m.slice(0, -1), { role: "assistant", content }])
    try {
      const r = await chatStream(historial, ponerUltimo, ctl.signal)
      setOrigen(`${r.equipo} · ${r.modelo} · ${(r.ms / 1000).toFixed(1)} s`)
    } catch (e) {
      if (ctl.signal.aborted) return
      setError(e instanceof Error ? e.message : String(e))
      // Quita la burbuja vacía si no llegó nada.
      setMensajes((m) => (m.at(-1)?.content ? m : m.slice(0, -1)))
    } finally {
      setEnCurso(false)
      corte.current = null
      campo.current?.focus()
    }
  }

  const alTeclear = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void enviar(texto)
    }
  }

  const nueva = () => {
    corte.current?.abort()
    setMensajes(() => [])
    setError("")
    campo.current?.focus()
  }

  const vacio = mensajes.length === 0

  return (
    <div className="chat">
      <header className="barra">
        <div className="marca">
          <Luna className="marca-luna" />
          <span>
            Horizon <b>IA</b>
          </span>
        </div>
        <span className="chip" title="Equipo y modelo de la última respuesta">
          <i className="punto" /> {origen}
        </span>
        <button type="button" className="boton-fantasma" onClick={nueva} disabled={vacio}>
          <IconoNueva /> <span className="solo-ancho">Nueva conversación</span>
        </button>
      </header>

      <div className="hilo" ref={hilo}>
        {vacio ? (
          <div className="bienvenida">
            <Luna className="luna-respira" />
            <h1>¿Qué exploramos hoy?</h1>
            <p>Escribe o toca el micrófono para hablar con la IA.</p>
            <div className="sugerencias">
              {SUGERENCIAS.map((s) => (
                <button key={s} type="button" onClick={() => void enviar(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="columna">
            {mensajes.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="msj msj-tuyo">
                  {m.via === "voz" && <IconoMic className="msj-via" />}
                  <div className="burbuja-tuya">{m.content}</div>
                </div>
              ) : (
                <div key={i} className="msj msj-ia">
                  <Luna className="avatar" />
                  <div className="contenido">
                    {m.content ? (
                      <Markdown remarkPlugins={[remarkGfm]}>{m.content}</Markdown>
                    ) : (
                      <span className="pensando" aria-label="Pensando">
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                    {enCurso && i === mensajes.length - 1 && m.content && <span className="cursor" />}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <div className="pie">
        {error && <p className="error">{error}</p>}
        <form
          className="compositor"
          onSubmit={(e) => {
            e.preventDefault()
            void enviar(texto)
          }}
        >
          <textarea
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={alTeclear}
            placeholder="Escribe un mensaje…"
            aria-label="Mensaje"
            rows={1}
            autoFocus
          />
          <div className="acciones">
            <button type="button" className="boton-voz" onClick={abrirVoz} title="Conversar por voz" aria-label="Conversar por voz">
              <IconoOnda />
            </button>
            {enCurso ? (
              <button type="button" className="boton-enviar" onClick={() => corte.current?.abort()} aria-label="Detener">
                <IconoDetener />
              </button>
            ) : (
              <button type="submit" className="boton-enviar" disabled={!texto.trim()} aria-label="Enviar">
                <IconoEnviar />
              </button>
            )}
          </div>
        </form>
        <p className="nota">La IA puede equivocarse. Texto en Geografo · voz en la Z6, por Tailscale.</p>
      </div>
    </div>
  )
}

const IconoEnviar = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
const IconoDetener = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" /></svg>
)
export const IconoOnda = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
)
const IconoNueva = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
)
const IconoMic = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-label="Dicho por voz"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
)
