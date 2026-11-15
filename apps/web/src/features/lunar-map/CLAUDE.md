# Dashboard y Planificador (prototipo) — `/planner`

Lo que abre el botón "Open the planner" de la landing: el Dashboard y el Planificador de `prototipos/lunar-map/`, a pantalla completa y en inglés.

- **Qué hay:** `LunarMapPage` es solo un iframe a `/lunar-map/inicio.html`. No suma nada al bundle y la pantalla se carga de forma diferida (`router.tsx`).
- **Una sola copia:** el prototipo vive únicamente en `prototipos/lunar-map/` (sus dueños lo siguen editando ahí). **No copiarlo a `apps/web/public`.** Lo sirve la API: `apps/api/src/lunar-map/estaticos.ts` en `/lunar-map/*` (ruta resuelta desde el archivo, no desde el cwd; `no-cache` con ETag; `/lunar-map` redirige a `/lunar-map/`, que carga `inicio.html`; no sirve `tools/`). En dev, Vite reenvía `/lunar-map` a la API (`vite.config.ts`), así que hay que tener la API en marcha.
- **Dos nombres, a propósito:** `/planner` es la ruta de React (`routes.lunarMap`) y `/lunar-map/` la carpeta estática. Si fueran iguales, recargar la pantalla serviría el HTML crudo en vez de la app.
- **Navegación interna:** las páginas del prototipo se enlazan con rutas relativas (inicio, index, planificar) y funcionan bajo `/lunar-map/` dentro del iframe.
- **Datos:** `data/dem-polo.js` (8,4 MB) solo se pide al usar "Own point"; la carga inicial no lo baja.
- **Convivencia:** el Workspace de React (`/dashboard`, `/planificador/:id`) sigue en su sitio, pero la landing ya no lo enlaza.
- **No tocar:** las demás features. Para cambiar textos o cálculos del prototipo, editar `prototipos/lunar-map/` (el cálculo real saldrá de `@/shared/planning`).
