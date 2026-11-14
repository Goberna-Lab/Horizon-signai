import { useEffect, useState, type ReactNode } from 'react'

/**
 * Panel lateral plegable (Designing Interfaces: Collapsible Panels, cap. 4, pp. 249–250).
 * Abierto al inicio; se oculta con el chevron o la tecla P; animado al abrir y cerrar.
 */
export function Panel({ children }: { children?: ReactNode }) {
  const [abierto, setAbierto] = useState(true)

  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      const escribiendo = t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable
      if (escribiendo || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'p' || e.key === 'P') setAbierto((a) => !a)
    }
    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  }, [])

  return (
    <aside className={`panel ${abierto ? 'panel--abierto' : 'panel--cerrado'}`} aria-label="Controles del entorno">
      <button
        className="panel__chevron"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        title={abierto ? 'Ocultar panel (P)' : 'Mostrar panel (P)'}
      >
        {abierto ? '›' : '‹'}
      </button>
      <div className="panel__cuerpo">
        <header className="panel__titulo">Lunar Landing Site Navigator</header>
        {children}
      </div>
    </aside>
  )
}
