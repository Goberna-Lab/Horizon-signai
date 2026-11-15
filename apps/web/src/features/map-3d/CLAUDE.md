# Mapa 3D — `/3d-map`

La Luna en 3D con relieve real y todos los sitios de alunizaje. Responde: "¿dónde se ha alunizado, cómo es el terreno ahí y qué ve un lander (Sol, Tierra) en una fecha?"

- **Qué hay:** `Map3dPage` muestra a pantalla completa `public/mapa-3d.html`, una página autónoma que lleva dentro sus datos y su propio three.js (no suma nada al bundle de la app). Se abre en inglés con `?lang=en`; el botón ES/EN sigue disponible.
- **Fuente y generador:** `apps/web/scripts/mapa-3d/`. Se edita `mapa.src.html` (o los datos) y se regenera con `python apps/web/scripts/mapa-3d/construir-mapa.py` (requiere `npm ci` y numpy). **No editar `public/mapa-3d.html` a mano.**
- **Funciones:** globo LOLA (LDEM_4, sombreado con LDEM_16 a 1,9 km) y polo sur (LDEM_75S a 663 m, sombreado a 240 m); 62 sitios (NSSDCA, PGDA, regiones Artemis III) con filtros por tipo, agencia, año y búsqueda, ficha con elevación, pendiente, Sol y Tierra en la fecha y enlaces a la fuente; 8876 nombres IAU con anillos; Sol y Tierra reales (JPL Horizons 2026–2030) con sombras; Tierra Blue Marble orientada por fecha; colores por albedo, altura y pendiente; exageración vertical; tooltips; clic para medir cualquier punto.
- **Datos:** salen de `luna-recursos/datos/` (LOLA, efemérides, horizontes de 5 m) y de la carpeta del generador: `sitios.json` (cada sitio con fuente y enlaces), `iau-nombres.json` (Gazetteer IAU/USGS), `gradiente16.webp` (pendientes de LDEM_16, lo genera `gradiente16.py`) y `tierra-bluemarble.jpg` (NASA SVS 2915).
- **Verificación:** `python -X utf8 apps/web/scripts/mapa-3d/verificar-mapa.py` contrasta el mapa con NASA NSSDCA, PGDA, el Gazetteer IAU, los archivos LOLA y JPL Horizons en vivo; `--enlaces` revisa el contenido de cada enlace de fuente (NSSDCA y PGDA responden 200 en sus páginas de error).
- **Toda afirmación sobre la Luna cita su fuente; lo aproximado se marca en pantalla** (sitios con coordenadas aproximadas, horizontes a 240 m frente a los de 5 m, la pendiente según la escala). Nunca "aterrizaje seguro".
- **No tocar:** las demás features. Lo común con el núcleo (`shared/map`) se pide a Estephano.

## Siguiente
1. Reusar las tipografías autoalojadas del equipo (hoy el mapa carga Cormorant Garamond y Jost de Google Fonts, con respaldo local).
2. Enlazar desde la ficha de un sitio polar al Planificador con ese sitio elegido.
3. Fichas individuales de NSSDCA para las naves cuyo registro hoy da error en el catálogo de la NASA (volver a correr `--enlaces`).
