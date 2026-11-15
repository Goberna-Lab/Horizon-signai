# 11. Flujo y arquitectura del producto (2026-11-15)

Fuente: la pizarra del equipo (Landing → Dashboard → Planificador → Simulación → Alunizaje, con IA asistente e IA educativa sobre RAG + embeddings). Este documento la aterriza en rutas, carpetas y dueños.

## Flujo

```
Landing (/)  ──►  Dashboard (/dashboard)  ──►  Planificador (/planificador/<id>)  ──►  Simulación (/simulador?mission=<id>)
                  cronograma, KPIs,            comparativo de salidas (fecha,          descenso y alunizaje,
                  aviso, misiones,             lugar, altura), horas de Sol y           paso a paso; modo educativo
                  Sol y enlace                 Tierra, complejidad del terreno,
                                               altura del panel (Sol) y de la antena (Tierra)
                         └──────────── IA asistente (chat, notificaciones) ───────────┘   IA educativa (simulador)
                                              RAG + embeddings sobre docs/ y luna-recursos/investigacion/
```

| Paso de la pizarra | Dónde vive | Dueño |
|---|---|---|
| Landing | `apps/web/src/features/landing/` | Angel |
| Dashboard: cronograma, KPIs, notificaciones (aviso), lista de misiones | `apps/web/src/features/dashboard/` | Jean |
| Planificador: comparativo, horas de Sol y Tierra, complejidad del terreno, panel y antena | `apps/web/src/features/mission-planner/` | Francisco |
| Simulación y alunizaje (paso a paso, modo educativo) | `apps/web/src/features/simulator/` | Jefferson |
| IA asistente, IA educativa, chat, voz, RAG y embeddings | `apps/web/src/features/assistant/`, `apps/api/src/assistant/`, `apps/web/src/prueba-ia/`, `voz/` | Manuel |
| Núcleo: motor, misiones, datos, mapa, escritorio que une Dashboard y Planificador | `apps/web/src/shared/planning/`, `shared/map/`, `shared/ui/`, `app/` | Estephano (coordina y ayuda a todos) |

## Reglas que unen el trabajo

1. **Un solo motor.** Ninguna pantalla calcula Sol o Tierra por su cuenta: todas importan de `@/shared/planning`. Así el Dashboard, el Planificador, el Simulador y la IA dicen las mismas cifras.
2. **Una sola lista de misiones.** `useMissions()` y `missionStore` (`shared/planning/store.ts`), guardada en el navegador. La misión viaja entre pantallas por su `id` en la URL.
3. **El modelo no calcula.** La IA recibe las cifras ya calculadas (`MissionContext` en `packages/shared/src/assistant.ts`) y los trozos de documento recuperados; explica y cita. Nunca inventa porcentajes ni fechas.
4. **Una feature no importa de otra** (`apps/web/ARCHITECTURE.md`). Lo común va a `shared/`. Solo `app/` compone features.
5. **Interfaz en inglés y en español** (inglés por defecto; sin botones EN / ES en pantalla: el idioma lo elige EVA o `?lang=es`; una sola preferencia: `@/shared/i18n`, texto con `tr("English", "Español")`; las páginas del planificador, con `prototipos/lunar-map/i18n.js`), docs en español, commits en inglés (Conventional Commits). Prefijos de CSS por área: `ln-`/`sw-` landing, `db-` dashboard, `pl-` planificador, `sim-` simulador, `ai-` asistente, `pmap-` mapa, `ui-` piezas comunes, `ws-` escritorio.
6. **Antes del push:** `npm test` y `npx tsc --noEmit -p apps/api && npm run build -w @horizon-signai/web`. `main` despliega solo.

## Contratos entre áreas

| Contrato | Archivo | Quién lo usa |
|---|---|---|
| `Mission`, `Requirements`, `Site` | `shared/planning/model/types.ts` | todos |
| `evaluate`, `scanDates`, `suggestDate`, `suggestHeight`, `outcome` | `shared/planning/model/evaluate.ts` | Planificador, Dashboard, Simulador |
| `MissionRow` (misión + lugar + evaluación) | `shared/planning/hooks.ts` | Dashboard, Planificador |
| `MissionContext`, `AssistantRequest`, `AssistantReply` | `packages/shared/src/assistant.ts` | IA (web y API) |
| `AssistantDock({ mode, context })` | `features/assistant/AssistantDock.tsx` | ya montado en el escritorio; el simulador lo monta con `mode="educational"` |
| Ruta del planificador con un escenario | `/planner#z=…&t=…&stay=…` (`plannerPath()` en `app/routes.ts`) | el botón "Compare zones and dates" del detalle de misión, "Compare in the planner" del mapa 3D y "Link" del planificador. La pantalla `/simulador` todavía no existe (muestra "SOON" y no se enlaza) |

## Estado al 2026-11-15

- Hecho: núcleo portado y probado (7 pruebas, incluye el ejemplo del SPEC E23), Dashboard y Planificador funcionando con las tres misiones de ejemplo (INTI-2 falla por la fecha movida y propone el 6 abr 2027).
- Por hacer: ver el `CLAUDE.md` de cada carpeta, sección "Siguiente".
