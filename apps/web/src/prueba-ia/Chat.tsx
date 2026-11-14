import { useEffect, useRef, useState } from "react"
import { chat, type Mensaje } from "./cliente"

export function Chat() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [texto, setTexto] = useState("")
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState("")
  const [ms, setMs] = useState(0)
  const [origen, setOrigen] = useState("")
  const fin = useRef<HTMLDivElement>(null)

  // Con llaves: un efecto no debe devolver nada que no sea su limpieza (React 19 lo trata como función).
  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: "smooth" })
  }, [mensajes, cargando])

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = texto.trim()
    if (!t || cargando) return
    const siguiente: Mensaje[] = [...mensajes, { role: "user", content: t }]
    setMensajes(siguiente)
    setTexto("")
    setError("")
    setCargando(true)
    try {
      const r = await chat(siguiente, false)
      setMensajes([...siguiente, { role: "assistant", content: r.respuesta }])
      setMs(r.ms)
      setOrigen(`${r.equipo} · ${r.modelo}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCargando(false)
    }
  }

  return (
    <section className="panel" aria-label="Chat de texto">
      <h2>Chat</h2>
      <div className="chat-hilo">
        {mensajes.length === 0 && <p className="ayuda">Escribe un mensaje para empezar.</p>}
        {mensajes.map((m, i) => (
          <div key={i} className={`burbuja ${m.role}`}>
            {m.content}
          </div>
        ))}
        {cargando && <div className="burbuja assistant pensando">Pensando…</div>}
        <div ref={fin} />
      </div>
      {error && <p className="error">{error}</p>}
      {ms > 0 && <p className="tiempos">{origen} · {(ms / 1000).toFixed(1)} s</p>}
      <form className="chat-form" onSubmit={enviar}>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe aquí…"
          aria-label="Mensaje"
          autoComplete="off"
        />
        <button type="submit" disabled={cargando || !texto.trim()}>
          Enviar
        </button>
      </form>
    </section>
  )
}
