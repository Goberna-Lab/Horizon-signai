import { createBrowserRouter, Navigate } from "react-router"
import { RootLayout } from "./layouts/RootLayout"
import { routes } from "./routes"

// Cada pantalla se carga de forma diferida: three.js solo se descarga
// al entrar a /simulador, y la landing queda ligera.
export const router = createBrowserRouter([
  {
    Component: RootLayout,
    // Mientras baja el trozo de la pantalla pedida no hay nada que pintar: se deja vacío a propósito.
    HydrateFallback: () => null,
    children: [
      {
        path: routes.landing,
        lazy: async () => ({ Component: (await import("@/features/landing")).LandingPage }),
      },
      {
        // El escritorio de misiones: el Dashboard y el Planificador comparten pantalla (mapa, aviso y transición),
        // por eso son una sola ruta de diseño con dos direcciones. `Workspace` lee cuál está abierta.
        lazy: async () => ({ Component: (await import("./workspace/Workspace")).Workspace }),
        children: [
          { path: routes.dashboard, element: null },
          { path: `${routes.missionPlanner}/:missionId`, element: null },
        ],
      },
      { path: routes.missionPlanner, element: <Navigate to={routes.dashboard} replace /> },
      {
        path: routes.simulator,
        lazy: async () => ({ Component: (await import("@/features/simulator")).SimulatorPage }),
      },
      {
        path: routes.map3d,
        lazy: async () => ({ Component: (await import("@/features/map-3d")).Map3dPage }),
      },
      {
        path: routes.aiTest,
        lazy: async () => ({ Component: (await import("@/prueba-ia/PruebaIa")).PruebaIa }),
      },
      { path: "*", element: <Navigate to={routes.landing} replace /> },
    ],
  },
])
