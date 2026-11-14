import { Chat } from "./Chat"
import { Voz } from "./Voz"
import "./prueba-ia.css"

export function PruebaIa() {
  return (
    <main className="prueba">
      <header>
        <h1>Prueba de IA</h1>
        <p className="ayuda">Voz: Z6 (qwen3.6:27b) · Texto: Geografo (qwen3:8b) · vía Tailscale</p>
      </header>
      <div className="paneles">
        <Voz />
        <Chat />
      </div>
    </main>
  )
}
