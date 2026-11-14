import { Chat } from "./Chat"
import { Voz } from "./Voz"
import "./prueba-ia.css"

export function PruebaIa() {
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
