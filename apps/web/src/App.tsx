import fondo from "./assets/fondo-soon.webp"
import { PruebaIa } from "./prueba-ia/PruebaIa"

function App() {
  // Sin router: una sola ruta extra. El API sirve index.html para cualquier ruta que no sea /api.
  if (window.location.pathname.replace(/\/+$/, "") === "/prueba-ia") return <PruebaIa />

  return (
    <main
      aria-label="Próximamente"
      style={{
        minHeight: "100dvh",
        // contain: la luna se ve entera en cualquier pantalla; el resto es negro.
        background: `#000 url(${fondo}) center / contain no-repeat`,
      }}
    />
  )
}

export default App
