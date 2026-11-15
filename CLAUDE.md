# Horizon-signai

- **Desplegar**: push a `main` → CI (`.github/workflows/ci.yml`) → `deploy.yml` en el runner de VPS2 → `/srv/horizon-signai`, puerto 7083, https://signal-horizon.goberna.us. Otros también suben a `main`: `git fetch` y rebase antes del push. El push va en su propia llamada; luego `scripts/esperar-deploy.sh`.
- **Antes del push**, lo mismo que el CI: `npx tsc --noEmit -p apps/api && npm run build -w @horizon-signai/web` (el `tsc` del web también compila el código del API).
- **Producción** (`ssh vps2`): variables en `/srv/horizon-signai/.env` (con sudo; los tokens se copian de servidor a servidor, nunca se imprimen). Logs: `docker logs horizon_signai_app` y nginx en `/var/log/nginx/domains/signal-horizon.goberna.us.log`.
- **IA y voz de `/prueba-ia`** (`apps/api/src/z6.ts`): qué corre en la Z6 y en Geografo → `voz/LEEME.md`. La Z6 en sí (Ollama, `argus-voz`, acceso SSH) → `~/Proyectos/goberna-kanban/docs/operacion/ia-en-z6.md`.
- **Web**: `apps/web/ARCHITECTURE.md`. Dominio del reto: `docs/README.md`.
