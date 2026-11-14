import { useState } from "react"
import { Chat } from "./Chat"
import { guardarToken, leerToken, verificarToken } from "./cliente"
import { Voz } from "./Voz"
import "./prueba-ia.css"

export function PruebaIa() {
  const [listo, setListo] = useState(false)
  const [token, setToken] = useState(leerToken())
  const [error, setError] = useState("")
  const [verificando, setVerificando] = useState(false)

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setVerificando(true)
    setError("")
    guardarToken(token.trim())
    try {
      await verificarToken()
      setListo(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setVerificando(false)
    }
  }

  if (!listo)
    return (
      <main className="prueba">
        <form className="acceso" onSubmit={entrar}>
          <h1>Prueba de IA</h1>
          <p className="ayuda">Acceso de prueba. Pega el token del API.</p>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token"
            aria-label="Token"
            autoComplete="off"
          />
          <button type="submit" disabled={!token.trim() || verificando}>
            {verificando ? "Comprobando…" : "Entrar"}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </main>
    )

  return (
    <main className="prueba">
      <header>
        <h1>Prueba de IA</h1>
        <p className="ayuda">VPS2 → Z6 por Tailscale · modelo qwen3.6:27b</p>
      </header>
      <div className="paneles">
        <Voz />
        <Chat />
      </div>
    </main>
  )
}
