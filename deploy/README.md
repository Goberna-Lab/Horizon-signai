# Deploy sin cortes

Un deploy no deja a ningún visitante sin respuesta: ni pedidos con 502 ni respuestas del asistente cortadas a mitad.

## Cómo funciona

```
Cloudflare → nginx (Hestia, VPS2) → upstream horizon_signai ─┬─ app-a  127.0.0.1:7083  (principal)
                                                              └─ app-b  127.0.0.1:7084  (backup)
```

- **Dos copias de la misma imagen** (`docker-compose.prod.yml`). En uso normal todo va a `app-a`; `app-b` está
  encendida y sin tráfico. Una sola copia activa importa: la app guarda en memoria el tope de pedidos simultáneos a
  la IA y los límites por IP (`apps/api/src/z6.ts`), y con dos activas se duplicarían.
- **nginx reintenta en la otra copia** cuando la conexión falla (`proxy_next_upstream error non_idempotent`), también
  los `POST`: todos son llamadas a la IA sin efectos guardados (la API entra a la base con un rol de solo lectura).
  No reintenta ante 502/503, porque esos los devuelve la propia app cuando la Z6 o Geografo fallan, ni ante timeout,
  para no repetir una respuesta lenta de la IA.
- **Apagado ordenado** (`apps/api/src/index.ts`): con SIGTERM la app deja de aceptar conexiones y termina las que
  tiene, hasta 125 s (el `proxy_read_timeout` de nginx es 120 s). `stop_grace_period: 130s` le da ese tiempo.
- **El deploy** (`.github/workflows/deploy.yml`):
  1. guarda la imagen en producción como `horizon-signai:anterior`;
  2. construye la nueva (`:latest`) con las dos copias viejas atendiendo;
  3. corre `db-loader` (migraciones y carga), también con la app vieja atendiendo;
  4. reemplaza `app-b` y espera a que esté healthy;
  5. reemplaza `app-a`: mientras arranca, nginx atiende con `app-b`, que ya tiene la versión nueva;
  6. verifica `https://signal-horizon.goberna.us/api/health`.

  Si algo falla, vuelve a poner `:anterior` en las dos copias (primero `app-a`), sin reconstruir.

## Reglas que esto impone

- **Migraciones compatibles con la versión anterior**: corren mientras esa versión atiende, y un rollback la vuelve a
  poner sobre la base ya migrada. Primero se agrega; lo que se borra o renombra va en un deploy posterior
  (`db/README.md`).
- **No usar `docker compose up -d` a secas en el servidor** para la app: recrea las dos copias a la vez. Una copia
  por vez: `docker compose -f docker-compose.prod.yml up -d --no-deps --wait app-b`, y después `app-a`.
- **Estado nuevo en memoria** (sesiones, colas): se pierde al reemplazar la copia, igual que antes. Si una función
  necesita sobrevivir al deploy, va en la base o en el cliente.

## nginx en VPS2 (se aplica a mano, una vez)

No se despliega con el repo. Lo que hay en producción:

1. `/etc/nginx/conf.d/horizon-signai-upstream.conf`, copia de [`nginx/horizon-signai-upstream.conf`](nginx/horizon-signai-upstream.conf).
2. La plantilla de Hestia del dominio, `/usr/local/hestia/data/templates/web/nginx/php-fpm/horizon-proxy.tpl` y
   `.stpl`: todos los `proxy_pass` apuntan a `http://horizon_signai` (antes `http://127.0.0.1:7083`) y el bloque
   `server` lleva `proxy_next_upstream error non_idempotent;`.
3. Regenerar y recargar: `sudo /usr/local/hestia/bin/v-rebuild-web-domain admin signal-horizon.goberna.us`, y
   comprobar con `sudo nginx -t`.

Los respaldos de antes del cambio quedaron junto a cada archivo, con sufijo `.bak-sin-cortes`.

## Comprobarlo

Durante un deploy, desde cualquier máquina:

```sh
scripts/vigilar-deploy.sh   # pide /api/health y un POST sin parar; al cortar con Ctrl-C cuenta las respuestas que no fueron 2xx/4xx
```
