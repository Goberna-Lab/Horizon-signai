# Landing — dueño: Angel

`/`. Responde: "¿qué es esto y para quién?" y lleva al Dashboard.

- Ya está construida: guía en `apps/web/ARCHITECTURE.md`, datos generados con `bun apps/web/scripts/build-landing-data.ts`, comprobación con `npm run check:landing -w @horizon-signai/web` (servidor de desarrollo levantado).
- Los botones "Open the planner" (barra, flujo y cierre) van primero a Missions: `routes.lunarMap` (`/planner`, Dashboard del prototipo `prototipos/lunar-map/` en un iframe). El enlace "Planner" del menú va directo al planificador (`plannerPath()`, `/planner#landing`). El Workspace de React (`/dashboard`, `/planificador/:id`) ya no se enlaza desde aquí.
- Cifras: salen del motor y se comprueban contra el SPEC E23 (Connecting Ridge, 2026-12-01: Sol 56,8 %, Tierra 19,9 %). No escribas cifras a mano.
- Uso de datos de la NASA: citar la fuente y no dar a entender que la NASA respalda el proyecto.
- **No tocar:** las demás features.

## Siguiente
1. Que la landing cuente el flujo completo (Dashboard → Planificador → Simulación) con capturas reales.
2. Versión en inglés revisada de todo lo enlazado (la entrega lo exige).
