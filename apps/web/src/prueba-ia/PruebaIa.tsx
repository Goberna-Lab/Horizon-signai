import { useCallback, useState } from "react"
import { Chat, type Burbuja } from "./Chat"
import { Estrellas } from "./Estrellas"
import { ModoVoz } from "./ModoVoz"
import "./prueba-ia.css"

/** /prueba-ia: un solo hilo de conversación; el texto va a Geografo y la voz a la Z6. */
export function PruebaIa() {
  const [mensajes, setMensajes] = useState<Burbuja[]>([])
  const [modoVoz, setModoVoz] = useState(false)

  const agregar = useCallback((m: Burbuja) => setMensajes((ms) => [...ms, m]), [])
  const cerrarVoz = useCallback(() => setModoVoz(false), [])

  return (
    <main className="prueba">
      <Estrellas densidad={0.7} />
      <Chat mensajes={mensajes} setMensajes={setMensajes} abrirVoz={() => setModoVoz(true)} />
      {modoVoz && <ModoVoz mensajes={mensajes} agregar={agregar} cerrar={cerrarVoz} />}
    </main>
  )
}
