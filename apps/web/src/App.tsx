import fondo from "./assets/fondo-soon.webp"

function App() {
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
