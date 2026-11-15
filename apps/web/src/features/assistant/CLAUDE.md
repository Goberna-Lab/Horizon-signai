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

- **Qué hace** (`eva/EvaCompanera.tsx`): empieza apagada; cuando sale el Sol en la landing se enciende, saluda, pregunta el nombre y pregunta quién llega. Según la respuesta da un recorrido guiado. Fuera de los recorridos comenta como mucho una vez cada 90 s.
- **Recorridos guiados** (`eva/recorridos.ts`): tres, para los tres públicos del reto: quien planifica (plan, por qué falla, arreglo, comparación, descenso, línea de tiempo, compartir), quien enseña (una clase en cuatro pasos) y quien tiene curiosidad. Están escritos, no los genera la IA: funcionan sin los servidores de IA (sin voz, el texto sale en el globo). Cada paso puede ejecutar una orden, apuntar a una parte y decir una frase; se avanza con «Next». También se abren desde su panel («Guided tour»). Si cambian los `id` del planificador o el escenario de ejemplo, se actualiza ese archivo.
- **Ve la pantalla:** con cada pregunta va lo que el planificador muestra, en texto, con las cifras de su motor (`LunarPlanner.text()` en `prototipos/lunar-map/index.html`; lo lee `eva/acciones.ts` y viaja como `estado`). El API lo pone en el prompt como las únicas cifras actuales que puede dar.
- **Maneja la app:** el modelo termina su respuesta con una orden de una lista cerrada («<<planner zone=B>>», «<<shift days=7>>», «<<fix how=date>>», «<<compare>>», «<<simulate>>», «<<open screen=map>>», «<<language to=es>>»…). El API la saca del texto, la valida y la manda como evento `{t:"accion"}` (`apps/api/src/acciones.ts`, `z6.ts`); la web la ejecuta (`eva/acciones.ts` → `LunarPlanner.run`). El modelo sigue sin calcular: la orden cambia el escenario y el motor recalcula. Probado con el 27B en inglés y español.
- **Sugerencias** (`eva/sugerencias.ts`): botones en su panel, según la pantalla, para usarla sin escribir ni micrófono. Las que son una acción («+1 week», «Compare», «Descent»…) las ejecuta EVA sin IA y dice una frase fija; las que son una pregunta van a la IA. Una pregunta (escrita o sugerida) interrumpe a EVA si estaba comentando.
- **RAG:** `apps/api/src/assistant/rag.ts` busca en un índice de embeddings (bge-m3, en Ollama) de `README.md`, `docs/`, el README del planificador y `luna-recursos/investigacion/`; los trozos van al prompt del turno. El índice se regenera con `npx tsx apps/api/scripts/indexar-rag.ts`. Si la búsqueda falla o tarda, se responde sin ella.
- **Qué dice** (`eva/guion.ts`): los comentarios de cada pantalla, los eventos y los textos de su globo y su panel, en inglés y en español. Cada cifra que afirma sale de un documento del repo; al cambiar una pantalla, se actualiza ahí.
- **Apunta con un rayo:** va a la parte de la que habla y la encierra con cuatro esquinas. Funciona también dentro del iframe de `/planner` (mismo origen); los selectores de esa pantalla son los `id` de `prototipos/lunar-map/`. Si una parte no está a la vista, ese comentario se salta.
- **Para que otra pantalla la use** (sin importar esta feature): `avisarEva("aterrizaje-nominal")` o `enfocarEva(".pl-checks", "Start here.")`, los dos de `@/shared/eva`.
- **Español:** si le escriben en español hace como que se reconfigura y sigue en español (`eva/idioma.ts`, con prueba). El API recibe `idioma` y lo pone en el prompt (`apps/api/src/asistentes.ts`). La voz en español sale de argus-voz solo si `VOZ_TOKEN` está junto a `HVOZ_URL`; si no, habla con la voz de inglés. El oído de horizon-voz solo entiende inglés.
- **Caras** (`shared/eva/animacion.ts`): reposo (seria), escuchando, pensando, hablando, bromeando, cansada, alegre, sorpresa, alerta (avisos: marcas rojas) y apagada.

## Siguiente
1. `AssistantDock` en el escritorio de misiones (`/dashboard`): hoy EVA ve y maneja solo el planificador de `/planner`.
2. Que el estado de la pantalla y las órdenes cubran también el mapa 3D (elegir un sitio, cambiar la fecha).
3. Modo educativo en el simulador, cuando exista.
