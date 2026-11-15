# IA asistente e IA educativa — dueño: Manuel

Chat (texto y voz) dentro de las pantallas de trabajo, con RAG + embeddings sobre la documentación del proyecto.

- **Contrato:** `packages/shared/src/assistant.ts` (`AssistantRequest`, `AssistantReply`, `MissionContext`). La web manda la misión abierta ya calculada (`missionContext(row)` de `@/shared/planning`).
- **Regla de oro:** el modelo no calcula. Explica las cifras del contexto y cita los documentos recuperados. Si no hay contexto ni documento, dice que no sabe.
- **Dónde montar:** `AssistantDock` ya está montado en `app/workspace/Workspace.tsx` con `mode="assistant"`; hoy devuelve `null`. Constrúyelo aquí (prefijo CSS `ai-`).
- **API:** crear `apps/api/src/assistant/` con `POST /api/assistant` y registrarlo en `apps/api/src/app.ts`. Reusar la infraestructura de `apps/api/src/z6.ts` (modelos en la Z6/Geografo, límites por IP, voz). Operación de la Z6: ver `CLAUDE.md` de la raíz y `voz/LEEME.md`.
- **Corpus del RAG:** `docs/*.md` y `luna-recursos/investigacion/` (SPEC, fuentes). Cada trozo guarda su ruta para citarla. `luna-recursos/` y `docs/` no entran en Docker: el índice de embeddings se genera con un script y se guarda en el repo o en el servidor.
- `/prueba-ia` es tu banco de pruebas; no está enlazada desde la landing.

## EVA, la robot guía (`eva/`, 2026-11-15)

Flota encima de todas las pantallas (la monta `app/layouts/RootLayout.tsx`). Su dibujo 3D y sus reglas de animación están en `shared/eva/`; aquí va lo que hace y lo que dice.

- **Qué hace** (`eva/EvaCompanera.tsx`): empieza apagada; cuando sale el Sol en la landing se enciende, saluda, pregunta el nombre y ofrece enseñar a planificar una misión. Si aceptan, lleva a `/planner` y lo recorre parte por parte. Fuera de la lección comenta como mucho una vez cada 90 s.
- **Qué dice** (`eva/guion.ts`): los comentarios de cada pantalla, los eventos y los textos de su globo y su panel, en inglés y en español. Cada cifra que afirma sale de un documento del repo; al cambiar una pantalla, se actualiza ahí.
- **Apunta con un rayo:** va a la parte de la que habla y la encierra con cuatro esquinas. Funciona también dentro del iframe de `/planner` (mismo origen); los selectores de esa pantalla son los `id` de `prototipos/lunar-map/`. Si una parte no está a la vista, ese comentario se salta.
- **Para que otra pantalla la use** (sin importar esta feature): `avisarEva("aterrizaje-nominal")` o `enfocarEva(".pl-checks", "Start here.")`, los dos de `@/shared/eva`.
- **Español:** si le escriben en español hace como que se reconfigura y sigue en español (`eva/idioma.ts`, con prueba). El API recibe `idioma` y lo pone en el prompt (`apps/api/src/asistentes.ts`). La voz en español sale de argus-voz solo si `VOZ_TOKEN` está junto a `HVOZ_URL`; si no, habla con la voz de inglés. El oído de horizon-voz solo entiende inglés.
- **Caras** (`shared/eva/animacion.ts`): reposo (seria), escuchando, pensando, hablando, bromeando, cansada, alegre, sorpresa, alerta (avisos: marcas rojas) y apagada.

## Siguiente
1. Script de indexado (trocear docs, embeddings, guardar índice con rutas).
2. `POST /api/assistant` con recuperación + respuesta citada.
3. `AssistantDock`: panel lateral, botón para preguntar "¿por qué falla esta misión?".
4. Modo educativo en el simulador.
