import { createBrowserRouter, Navigate } from "react-router"
import { RootLayout } from "./layouts/RootLayout"
import { routes } from "./routes"

// Cada pantalla se carga de forma diferida: three.js solo se descarga
// al entrar a /simulador, y la landing queda ligera.
export const router = createBrowserRouter([
  {
    Component: RootLayout,
    children: [
      {
        path: routes.landing,
        lazy: async () => ({ Component: (await import("@/features/landing")).LandingPage }),
      },
      {
        path: routes.missionPlanner,
        lazy: async () => ({
          Component: (await import("@/features/mission-planner")).MissionPlannerPage,
        }),
      },
      {
        path: routes.simulator,
        lazy: async () => ({ Component: (await import("@/features/simulator")).SimulatorPage }),
      },
      { path: "*", element: <Navigate to={routes.landing} replace /> },
    ],
  },
])
