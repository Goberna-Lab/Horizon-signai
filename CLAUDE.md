# Horizon-signai

- **Desplegar**: push a `main` → CI (`.github/workflows/ci.yml`) → `deploy.yml` en el runner de VPS2 → `/srv/horizon-signai`, puerto 7083, https://signal-horizon.goberna.us. Otros también suben a `main`: `git fetch` y rebase antes del push. El push va en su propia llamada; luego `scripts/esperar-deploy.sh`.
- **Antes del push**, lo mismo que el CI: `npx tsc --noEmit -p apps/api && npm run build -w @horizon-signai/web` (el `tsc` del web también compila el código del API).
- **Producción** (`ssh vps2`): variables en `/srv/horizon-signai/.env` (con sudo; los tokens se copian de servidor a servidor, nunca se imprimen). Logs: `docker logs horizon_signai_app` y nginx en `/var/log/nginx/domains/signal-horizon.goberna.us.log`.
- **Base del mapa 3D en producción**: el deploy migra y carga la base solo (servicio `db-loader`); variables `POSTGRES_*` y `MAP_API_PASSWORD` en el `.env` del servidor → `db/README.md` (sección Production).
- **IA y voz de `/prueba-ia`** (`apps/api/src/z6.ts`): qué corre en la Z6 y en Geografo → `voz/LEEME.md`. La Z6 en sí (Ollama, `argus-voz`, acceso SSH) → `~/Proyectos/goberna-kanban/docs/operacion/ia-en-z6.md`.
- **Web**: `apps/web/ARCHITECTURE.md`. Dominio del reto: `docs/README.md`.

## Equipo y responsabilidades (2026-11-15)

Flujo y contratos: `docs/11-flujo-y-arquitectura.md`. Cada carpeta tiene su `CLAUDE.md` con dueño, límites y "Siguiente".

| Persona | Área | Carpeta |
|---|---|---|
| Jean | Dashboard | `apps/web/src/features/dashboard/` |
| Francisco | Planificador | `apps/web/src/features/mission-planner/` |
| Manuel | IA de voz, chat y RAG | `apps/web/src/features/assistant/`, `apps/api/src/assistant/`, `apps/web/src/prueba-ia/`, `voz/` |
| Angel | Landing | `apps/web/src/features/landing/` |
| Jefferson | Simulación y alunizaje | `apps/web/src/features/simulator/` |
| Estephano | Núcleo (`shared/planning`, `shared/map`, `app/`) y ayuda a todos | — |

- Trabaja solo en tu carpeta. Lo común se pide al núcleo; no se copia.
- Ramas `feat/<area>-<tema>` y PR a `main`; `npm test` y el build antes de subir.
