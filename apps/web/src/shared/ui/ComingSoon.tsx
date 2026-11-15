import fondo from "@/assets/fondo-soon.webp"

/**
 * Pantalla provisional para las rutas que todavía no tienen contenido: la luna con "SOON" (PR #3),
 * para que ninguna página salga vacía.
 */
export function ComingSoon({ label }: { label: string }) {
  return (
    <section
      className="screen"
      aria-label={`${label}: coming soon`}
      // contain: la luna se ve entera en cualquier pantalla; el resto es negro.
      style={{ background: `#000 url(${fondo}) center / contain no-repeat` }}
    />
  )
}
