# Prototipo Lunar Map: Dashboard y Planificador

Maqueta estática (HTML, CSS y JavaScript sin dependencias) del **Dashboard** (`inicio.html`) y del **Planificador** (`index.html` y `planificar.html`). Sirve para que cada área extraiga lo que necesite y lo lleve a la app en React. No es código de `apps/` (no entra en la compilación de la web), pero la app lo muestra: la API lo sirve tal cual en `/lunar-map/` y la ruta `/planner` de la web lo abre a pantalla completa en un iframe (ver abajo).

- **Interfaz en inglés.** Los textos visibles ya están traducidos (fechas y números en formato `en-GB`: `18 Dec 2026`, `2,100`, `3.8`). Los identificadores, claves de datos, claves de `localStorage`, clases CSS y nombres de archivo siguen en español y no se tocan. Los comentarios del código siguen en español.
- **Dónde se sirve.** Única copia: esta carpeta. La API la expone en `/lunar-map/` (`apps/api/src/lunar-map/estaticos.ts`; `/lunar-map/` carga `inicio.html`; las páginas `no-cache` con ETag y sus CSS, JS e imágenes con `?v=<hash del contenido>` que pone la API, para que un deploy se vea al instante aunque Cloudflare guarde esos archivos 4 h; en dev, Vite reenvía `/lunar-map` a la API en el puerto 3000). La pantalla de React es `/planner` (`features/lunar-map/`) y es el destino del botón "Open the planner" de la landing. Al editar aquí, basta recargar: no hay paso de compilación.
- **Calcula con el motor del equipo portado a JavaScript** (`engine.js`), con el mismo método y los mismos datos de `luna-recursos/`. Al llevarlo a la app, el cálculo debe salir de `@/shared/planning`, no de este archivo (regla "un solo motor", `docs/11-flujo-y-arquitectura.md`).

## Cambios del 2026-11-15 (entrega)

- **Planificador anterior retirado (Alunizaje · Caminata).** `index.html` y `planificar.html` redirigen al Planificador de misiones (`/planificar-mision.html`, PR #56), que es el Planificador de la app: desde «Planner» y «Add mission» de Missions, y desde todo lo que antes abría `/planner#landing`, `#walk` o un escenario (`#z=…`). Los archivos se quedan porque `engine.js` y `data/` los usan la API (`/api/planner`) y la base.

- **Tipografía compartida:** los títulos de los paneles de `inicio.html` usan la clase `display-caps` de `/ui/display-caps.css` (`apps/web/public/ui/`), que sirve la app. Abriendo la carpeta suelta, sin la app, caen a la fuente de reserva.
- **Marca y navegación:** las tres páginas dicen Horizon Signai y enlazan a la landing, a Missions (`inicio.html`), al planificador y al mapa 3D.
- **Vista inicial: el calendario se movió.** Sin escenario guardado, el planificador abre con el plan de CR-01 (18 dic 2026, las tres zonas GO) movido al 3 abr 2027: A y C NO GO, B GO. Son cifras de `engine.js`.
- **Enlace al escenario.** La página lee al abrir `/planner#z=…&t=…&stay=…&panel=…&antenna=…&battery=…&earth=…` (ya no hay botón «Link» para copiarlo) (también `site=<id del catálogo>` y `lat`/`lon` para un punto propio).
- **Cuánto queda.** Bajo el horizonte: «Sunlight left / Sunrise in» y «Earth contact left / Earthrise in», en el instante del cursor.
- **Períodos rotulados.** Las tarjetas dicen que sus cifras son de la estadía; el resumen de la línea de tiempo, que son de la ventana de 90 días.
- **LROC Quickmap.** Enlace al mismo lugar en Quickmap (estereográfica polar sur).
- **Etiquetas honestas.** El relieve de los mapas y todo el paso «Walk» se rotulan como generados para ilustrar («Walk · concept»); sus capas ya no citan instrumentos.
- **Inglés y español.** `i18n.js` traduce lo que se ve con los diccionarios `i18n-es.js` (planificador), `i18n-es-inicio.js` e `i18n-es-planificar.js`, hechos con el español original de estas páginas (commit `5b6bdc4`). La preferencia es la de toda la app (`localStorage` «horizon-signai.lang»). Un texto nuevo necesita su entrada en el diccionario.
- **Para la asistente.** `window.LunarPlanner.text()` describe lo que se ve con las cifras del motor y `LunarPlanner.run(orden)` ejecuta una orden validada (ver `apps/api/src/acciones.ts`).

## Cómo abrirlo

Dentro de la app: `/planner` (con la API en marcha). Suelto: doble clic en `inicio.html`, o desde esta carpeta:

```
python -m http.server 8765
```

y abrir `http://localhost:8765/inicio.html`. Los datos se cargan como scripts, así que funciona también sin servidor.

## Qué hay y para quién

| Archivo | Pantalla | Área en el repo |
|---|---|---|
| `inicio.html` | Centro de misiones: próximo hito con cuenta regresiva y sus cuatro pasos en fila, firma pendiente, KPIs, calendario de campaña, movimientos de las misiones, sitios de misión y lista de misiones | Dashboard (`features/dashboard/`) |
| `campaign.js` | Datos de la campaña de ejemplo: misiones CR-01, CR-02, PS-03 y DG-04, movimientos registrados y programados, aprobación de CR-02 (en `localStorage`) | Dashboard |
| `index.html` | Planificador · paso 1, Alunizaje: zonas candidatas, escenario editable, Go/No-Go, «Cómo cumplir», comparación, punto propio, horizonte real, línea de tiempo y simulación del descenso | Planificador (`features/mission-planner/`) |
| `planificar.html` | Planificador · paso 2, Caminata: capas, plan de caminata con tres rutas, supervivencia y perfil de elevación | Planificador |
| `engine.js` | Motor de planificación portado | Núcleo (`shared/planning`), solo como referencia |
| `data/` | Datos del repo en forma de script (ver abajo) | Núcleo |
| `terrain.js`, `mission.js` | Relieve generado para los mapas y cifras de las rutas de la caminata | — |
| `shared.css` | Estilos comunes: paleta crema, botones, cabecera con la navegación centrada | — |
| `estilo.css` | Missions con el estilo de la landing y del Planificador (`planificar-mision.html`): esquinas rectas, reglas de tinta, Archivo y rótulos en mono, botones de contorno y barras segmentadas. Solo lo carga `inicio.html`; quitar su `<link>` devuelve el estilo anterior | Dashboard |

### Para el Dashboard

`inicio.html` se apoya en `campaign.js` (misiones y movimientos), `mission.js` (cifras de la ruta científica de CR-02) y `terrain.js` (mapa de sitios). Los movimientos enlazan a los dos pasos del Planificador.

**Add mission** abre el planificador de misiones de Jefrry (`apps/web/public/planificar-mision.html`, servido en `/planificar-mision.html`) directamente en su formulario (`?nueva`) y en el idioma de la página (`?lang=en|es`). Su cabecera tiene «← Missions» para volver a `/planner`.

Las cifras de la zona A que muestra son las del Planificador con el plan de CR-01 (18 dic 2026, 09:00 UTC, 3 días, panel y antena a 2 m):
- Sol a +2,7° sobre el horizonte en el contacto.
- Tierra a +6,5°: enlace directo, sin relé.
- Con el panel a 2 m, el Sol no se pone entre octubre y enero.

## Planificador: qué hace y de dónde sale

**Zonas.** Regiones candidatas (RoI) de Barker et al. (2021), del catálogo de `luna-recursos/datos`:

| Zona | RoI |
|---|---|
| A | Connecting Ridge RoI 6 |
| B | Pico cerca de Shackleton RoI 2 |
| C | Borde de Shackleton RoI 4 |

Se descartaron los centros de mosaico porque no son puntos de aterrizaje (`docs/04-planificador.md`, sección 2).

**Escenario editable.** Fecha y hora de aterrizaje (UTC), estadía, altura del panel y de la antena, batería y Tierra mínima. Los requisitos son los de `model/evaluate.ts`: Sol y Tierra al aterrizar, noche más larga dentro de la batería y Tierra un mínimo de la estadía.

**Veredicto.**
- **GO:** cumple todos los requisitos.
- **REVIEW** (antes REVISAR): cumple, pero el Sol o la Tierra asoman menos de 0,5° al aterrizar.
- **NO GO:** no cumple algún requisito.

**Cómo cumplir.** Cuando la zona elegida no cumple, se proponen tres salidas con botón «Apply»:
- otra fecha (`scanDates` y `suggestDate`),
- otra zona,
- más altura (`suggestHeight`).

**Comparación de hasta 6 escenarios.** Muestra las seis cifras de `docs/04` (Sol, Tierra, ambos, noche máxima, silencio máximo y panel medio) y marca la mejor de cada columna. Cada fila lleva una franja Sol/Tierra alineada desde el aterrizaje y se puede cargar con un clic. Se guarda en `localStorage`.

**Punto propio (zona P).**
- Hasta 190 km del polo, escribiendo las coordenadas o con clic en el mapa.
- Su máscara de horizonte se calcula con `mascaraPolar` (`demPolar.ts`, SPEC E24) y se marca siempre como aproximada.
- El relieve (8 MB) se carga solo al usar un punto propio.

**Línea de tiempo, resumen y horizonte real.** Cubren de 30 días antes a 60 días después del aterrizaje, con el Sol y la Tierra en su posición real.

### Origen del cálculo (`engine.js`)

Es un port sin cambios de método de:
- `luna-recursos/calculos/motor/`: `efemeridesLuna.ts`, `mascara.ts`, `planificador.ts`, `demPolar.ts` y `fraccionDiscoVisible` de `environment.ts`.
- `apps/web/src/shared/planning/model/evaluate.ts`.

### Comprobaciones hechas

| Comprobación | Resultado | Referencia del equipo |
|---|---|---|
| Tabla global frente a la serie de Horizons de Connecting Ridge (4 años, 11 680 filas) | Peor error 0,0002° (Sol) y 0,0006° (Tierra) | ≤ 0,01° |
| Sol a ras del suelo en el centro de Connecting Ridge, 18,6 años | 36,6 % | 36,6 % (SPEC E21) |
| Connecting Ridge, 1 dic 2026, 1 día lunar | Sol 57,2 %, Tierra 19,9 %, ambos 9,7 % | 56,8 %, 19,9 %, 9,4 % (SPEC E23); la diferencia viene del paso de 3 h |
| RoI 6, panel a 2 m, 2026–2030 | Sol 91 % | 90,3 % a 1 m (Barker et al. 2021, SPEC E24) |
| Horizonte aproximado frente al detallado, desde 10 m | RMS 0,29° (A), 0,01° (B), 1,41° (C) | ~0,20° en Connecting Ridge; peor en bordes de cráter |

### Datos (`data/`)

Copias en base64 de `luna-recursos/datos`, sin cambios, para que la página funcione sin servidor:

| Archivo | Contenido | Tamaño |
|---|---|---|
| `efemerides-luna.js` | Tabla global de JPL Horizons DE441, 2026–2030 | 624 KB |
| *(origen)* | El planificador (`index.html`) arranca con los datos de la base por la API (`/api/planner/data`: las mismas efemérides y zonas que estos archivos). Si la API no responde, o la página se abre suelta, carga estos archivos. `LunarData.source` dice cuál usó (`database` o `files`) | — |
| `zonas.js` | Las 13 zonas candidatas del polo sur (las de la Bitácora de misión): A–C, RoI de Barker; D–J, sitios del catálogo con horizonte detallado; K–M, sitios de LROC con horizonte aproximado sobre LOLA 240 m. Con sus valores de Mazarico. Lo genera `tools/zonas-candidatas.js` | 1,6 MB (630 KB comprimido) |
| `polo-sur-lola.jpg`, `polo-sur-pendiente.png` | Mapa de Alunizaje: relieve real de LOLA (LDEM_75S_240M) sombreado en la proyección del mapa, y su pendiente > 15°. Lo genera `tools/mapa-polo.py` | 655 KB y 188 KB |
| `dem-polo.js` | Relieve polar de LOLA (240 m y 960 m), solo para el punto propio | 8,4 MB |

### Supuestos y límites

- Son los mismos que declara el equipo: el Sol se mide desde el panel y la Tierra desde la antena, en el mismo punto del terreno, y el panel es vertical y sigue al Sol.
- El mapa de Alunizaje es el **relieve real** de LOLA a 240 m (sombreado con luz de cartografía, no la del Sol en una fecha) y marca las 13 candidatas; la capa de pendiente sale de ese relieve. El panel «Mission sites» de Missions es un radar de 200 km a distancia real sobre ese mismo relieve de LOLA (`data/radar-polo-sur.jpg`, posiciones de `data/candidatas.js`). Solo muestra los sitios donde la campaña tiene alguna misión (una candidata aparece cuando se crea una misión en ella), con el color del estado de su misión (el de su chip: GO, REVIEW, pendiente de firma, borrador); el barrido es solo visual y cada punto da su detalle al pasar el ratón. El relieve local de Caminata es **relieve generado** para ilustrar.
- Las rutas de la caminata y sus cifras salen de ese relieve generado, no del DTM real.
- El perfil de descenso y el combustible son los del Apollo 11 (R-695 y TN D-6846), no los de una misión real.
