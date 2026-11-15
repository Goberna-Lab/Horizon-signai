# IA asistente e IA educativa — dueño: Manuel

Chat (texto y voz) dentro de las pantallas de trabajo, con RAG + embeddings sobre la documentación del proyecto.

- **Contrato:** `packages/shared/src/assistant.ts` (`AssistantRequest`, `AssistantReply`, `MissionContext`). La web manda la misión abierta ya calculada (`missionContext(row)` de `@/shared/planning`).
- **Regla de oro:** el modelo no calcula. Explica las cifras del contexto y cita los documentos recuperados. Si no hay contexto ni documento, dice que no sabe.
- **Dónde montar:** `AssistantDock` ya está montado en `app/workspace/Workspace.tsx` con `mode="assistant"`; hoy devuelve `null`. Constrúyelo aquí (prefijo CSS `ai-`).
- **API:** crear `apps/api/src/assistant/` con `POST /api/assistant` y registrarlo en `apps/api/src/app.ts`. Reusar la infraestructura de `apps/api/src/z6.ts` (modelos en la Z6/Geografo, límites por IP, voz). Operación de la Z6: ver `CLAUDE.md` de la raíz y `voz/LEEME.md`.
- **Corpus del RAG:** `docs/*.md` y `luna-recursos/investigacion/` (SPEC, fuentes). Cada trozo guarda su ruta para citarla. `luna-recursos/` y `docs/` no entran en Docker: el índice de embeddings se genera con un script y se guarda en el repo o en el servidor.
- `/prueba-ia` es tu banco de pruebas; no está enlazada desde la landing.

## Siguiente
1. Script de indexado (trocear docs, embeddings, guardar índice con rutas).
2. `POST /api/assistant` con recuperación + respuesta citada.
3. `AssistantDock`: panel lateral, botón para preguntar "¿por qué falla esta misión?".
4. Modo educativo en el simulador.
