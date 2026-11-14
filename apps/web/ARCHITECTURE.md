# Arquitectura de `apps/web`

```
src/
  main.tsx                 Punto de entrada
  app/                     Arranque de la app: router, rutas, layouts
    router.tsx             Rutas con carga diferida por pantalla
    routes.ts              Paths centralizados (routes.landing, ...)
    layouts/RootLayout.tsx Layout común (header/nav)
  features/                Una carpeta por pantalla/dominio
    landing/               /             Landing
    mission-planner/       /planificador Planificador de misiones
      model/               Tipos y lógica de dominio
    simulator/             /simulador    Simulador 3D
      components/SceneCanvas.tsx  Canvas base de react-three-fiber
      scenes/registry.ts          Registro de escenas 3D
  shared/                  Código usado por más de una feature
    lib/api.ts             Cliente tipado del API (Hono RPC)
  styles/global.css        Estilos globales
```

## Reglas

- Cada feature expone lo público desde su `index.ts`. Las demás partes importan
  desde `@/features/<feature>`, no desde sus archivos internos.
- Una feature no importa de otra. Lo compartido va a `shared/`.
- Tipos que también usa el backend van a `@horizon-signai/shared`.
- `@/` apunta a `src/`.

## Agregar una escena 3D

1. Crear el componente en `features/simulator/scenes/MiEscena.tsx` (solo
   contenido de three: mallas, luces, etc.).
2. Registrarlo en `scenes/registry.ts`.
3. Se renderiza dentro de `<SceneCanvas>`.

three.js solo se descarga al entrar a `/simulador`.
