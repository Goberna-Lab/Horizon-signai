import { Suspense, useEffect, useState } from "react"
import { Outlet } from "react-router"
import { EvaCompanera } from "@/features/assistant"

/** Layout común a todas las pantallas. EVA, la guía, flota encima de todas (se carga cuando la página ya pintó). */
export function RootLayout() {
  const [eva, setEva] = useState(false)
  useEffect(() => {
    const listo = () => setEva(true)
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(listo, { timeout: 2500 })
      return () => cancelIdleCallback(id)
    }
    const t = setTimeout(listo, 1200)
    return () => clearTimeout(t)
  }, [])
  return (
    <main className="app-root">
      <Outlet />
      {eva && (
        <Suspense fallback={null}>
          <EvaCompanera />
        </Suspense>
      )}
    </main>
  )
}
