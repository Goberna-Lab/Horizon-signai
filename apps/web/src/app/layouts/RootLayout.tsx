import { Outlet } from "react-router"

/** Layout común a todas las pantallas (header, nav, etc. irán aquí). */
export function RootLayout() {
  return (
    <main className="app-root">
      <Outlet />
    </main>
  )
}
