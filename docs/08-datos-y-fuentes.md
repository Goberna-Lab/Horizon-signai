# 08. Datos y fuentes

Las rutas de este documento son relativas a `luna-recursos/`, la copia del prototipo luna (commit 72f890f). El registro completo de cada paso está en `luna-recursos/investigacion/SPEC.md`. La copia está reorganizada para consulta: los `import` conservan las rutas originales (`src/engine`, `src/data`) y no resuelven tal cual.

## 1. Qué responde

Este documento responde:

1. Qué datos usa el prototipo, quién los publica, dónde están, qué archivo generan y con qué script.
2. Qué libros, informes y artículos respaldan cada regla, y cuáles no se pueden citar.
3. Qué usa el prototipo de los recursos que da el reto.
4. Qué falta para llenar los campos "NASA Data" y "Space Agency Partner Data and Other References" del formulario de entrega.

Origen: `investigacion/fuentes.md` (el registro de fuentes del prototipo), las cabeceras de los scripts de `calculos/scripts-de-datos/` y los metadatos que guarda cada archivo de `datos/`.

**Regla de uso** (de `investigacion/fuentes.md`): se cita la fuente y no se da a entender que la NASA respalda el proyecto. Pautas de la NASA: https://www.nasa.gov/nasa-brand-center/images-and-media/.

Cómo llegan los datos a la aplicación:

- **Nada se consulta en vivo.** La API de Horizons no envía cabeceras CORS, así que el navegador no puede consultarla (SPEC E22). Los scripts descargan una vez, recortan y guardan el resultado en `datos/`.
- **Los scripts se corren a mano, con Bun.** Leen por rangos HTTP solo la parte necesaria de cada producto. Por ejemplo, 19 MB de un DTM de 952 MB (cabecera de `dtm.ts`).
- **Cada producto guarda su procedencia en un JSON:** producto, URL, método y fecha de consulta (`consultadoUTC`, entre el 2026-11-06 y el 2026-11-07 UTC). Los archivos binarios la llevan en el JSON que los acompaña. Las tablas de Horizons guardan además las consultas exactas.
- **Tamaño:** `datos/` tiene 58 archivos y 22 423 307 bytes (22,4 MB). El SPEC redondea algunos tamaños en unidades binarias; por ejemplo, anota 457 KB para `efemerides-luna.f32`, que pesa 467 488 bytes.

Términos:

- **DEM o DTM:** modelo digital de elevación; una rejilla con la altura del terreno.
- **LRO:** Lunar Reconnaissance Orbiter, sonda de la NASA en órbita lunar. Sus instrumentos **LOLA** (altímetro láser) y **LROC** (cámaras NAC, de ángulo estrecho, y WAC, de ángulo ancho) dan casi todos los datos de relieve e imagen.
- **PDS:** Planetary Data System, el archivo de datos planetarios de la NASA. **PGDA:** Planetary Geodesy Data Archive, del centro Goddard (GSFC) de la NASA.
- **Horizons:** servicio de efemérides de NASA/JPL. **DE441** es la efeméride planetaria que usa.
- **RoI:** región de interés; zona de aterrizaje candidata publicada con los DEM del polo sur.
- **Paso** (E5, E22…): cada entrega del prototipo. "SPEC E22" es su sección en el SPEC.
- **Supuesto:** valor sin fuente en la bibliografía del proyecto.

## 2. Datos de la NASA usados

### 2.1 Productos que generan archivos en `datos/`

Los scripts están en `calculos/scripts-de-datos/`. Los tamaños van en bytes.

| Clave | Producto | Quién lo publica | Enlace | Archivos en `datos/` (bytes) | Script | Para qué |
|---|---|---|---|---|---|---|
| HZN | Sol y Tierra vistos desde el sitio, cada hora: azimut, elevación, diámetro, fracción iluminada y distancia (DE441) | NASA/JPL, Solar System Dynamics Group | [Horizons](https://ssd.jpl.nasa.gov/horizons/); [API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) | `efemerides-apollo17.json` (559 872); `efemerides-connecting-ridge.json` (553 805) | `horizons.ts` | Escena 3D de los dos sitios: 6 días lunares, de octubre de 2026 a abril de 2027 (4266 y 4267 filas) |
| HZN | Punto subsolar y punto sub-Tierra en ejes fijos a la Luna, con distancias, cada 3 h, del 2026-01-01 al 2031-01-01 | NASA/JPL | los mismos | `efemerides-luna.f32` (467 488); `efemerides-luna.json` (7 905) | `efemerides-luna.ts` | Planificador, comparación y simulación en cualquier punto y fecha de 2026–2030 (14 609 filas) |
| HZN | Sol y Tierra desde Connecting Ridge, cada 3 h, durante 18,6 años desde el 2026-11-06 | NASA/JPL | los mismos | `serie-sol-connecting-ridge.f32` (434 792); `serie-tierra-connecting-ridge.f32` (434 792) | `validar-iluminacion.ts` | Validación de la iluminación del polo y bloque "Promedio de 18,6 años" de la interfaz (54 349 filas) |
| HZN | Sol en el sitio del Apollo 11 a la hora del alunizaje (1969-07-20) | NASA/JPL | los mismos | `luz-apollo11.json` (834) | `luz-apollo11.ts` | Validar el criterio de luz del descenso. Solo lo usan las pruebas |
| DTM-A17 | LROC NAC DTM `NAC_DTM_APOLLO17_2M`, 2 m por píxel | LROC (Arizona State University) para la NASA; PDS, volumen `LRO-L-LROC-5-RDR-V1.0` | [PDS de LROC](https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/APOLLO17_2M/) | `relieve-apollo17.json` (400 832) | `dtm.ts` | Relieve de 400 m de lado alrededor del LM del Apollo 17 (201 × 201 muestras) |
| ORTO-A17 | Ortoimagen LROC NAC `NAC_DTM_APOLLO17_1_M134991788_60CM`, 0,6 m por píxel, tomada el 2010-07-28 | LROC (ASU) para la NASA; PDS | [ficha del producto](https://data.lroc.im-ldi.com/lroc/view_rdr_product/NAC_DTM_APOLLO17_1_M134991788_60CM) | `albedo-apollo17.u16` (889 778); `albedo-apollo17.json` (819) | `albedo-orto.ts` | Variaciones reales de albedo del sitio (667 × 667 texeles). De la foto se usan las variaciones, no el valor absoluto |
| WAC-HAPKE | Mapas de parámetros de Hapke de LROC WAC, `WAC_HAPKEPARAMMAP`, a 566 y 643 nm | LROC (ASU) para la NASA; PDS | [PDS de LROC](https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/WAC_HAPKEPARAMMAP/) | `hapke-wac-apollo17.json` (1 589) | `hapke-wac.ts` | Parámetros de Hapke medidos en la celda de 1° del Apollo 17. Alimentan el modelo de comparación (SPEC E17) |
| SLDEM2015 | Tesela `SLDEM2015_512_00N_30N_000_045_FLOAT`, 512 píxeles por grado (unos 59 m) | LRO LOLA con SELENE TC; PDS Geosciences Node | [PDS Geosciences](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/sldem2015/) | `horizonte-apollo17.json` (232 669); `valle-apollo17-alturas.i16` (321 602); `valle-apollo17-horizontes.u8` (1 286 408); `valle-apollo17.json` (533) | `horizonte.ts`, `valle.ts` | Horizonte real y valle 3D del Apollo 17. Incluye datos de la misión japonesa SELENE (sección 3) |
| LOLA-GDR | LOLA `LDEM_4` (altura) y `LDAM_4` (albedo normal a 1064 nm), 4 píxeles por grado | LRO LOLA; PDS Geosciences Node | [PDS Geosciences](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/float_img/) | `luna-ldem4.f16` (2 073 600); `luna-ldam4.f16` (2 073 600); `luna-global.json` (1 029) | `luna-global.ts` | Vista de la Luna completa (1440 × 720) |
| LOLA-POLAR-120 | LOLA `LDEM_75S_120M_FLOAT`, 120 m por píxel | LRO LOLA; PDS Geosciences Node | [PDS Geosciences](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/) | `horizonte-connecting-ridge.json` (248 428); `valle-connecting-ridge-alturas.i16` (321 602); `valle-connecting-ridge-horizontes.u8` (1 286 408); `valle-connecting-ridge.json` (641) | `polo-lola.ts` | Horizonte hasta 150 km y valle 3D de Connecting Ridge, fuera del mosaico de 5 m |
| sin clave | LOLA `LDEM_75S_240M_FLOAT`, 240 m por píxel | LRO LOLA; PDS Geosciences Node | la misma carpeta | `dem-polo-240m.i16` (5 287 752); `dem-polo-960m.i16` (1 002 528); `dem-polo.json` (971) | `dem-polo.ts` | Horizonte de los puntos propios hasta 190 km del polo, mapa polar y parte lejana de los horizontes del catálogo |
| LOLA-5M-PGDA | DTM de LOLA de 5 m por píxel de sitios del polo sur, con sus regiones de interés (Barker et al. 2021) | NASA GSFC, PGDA | [Site01](https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/); [README de los sitios](https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/README) | `relieve-connecting-ridge.json` (360 227); `catalogo-polo.json` (14 611); 27 archivos `horizonte-catalogo-<id>.json` (3 411 629 en total) | `dtm-polo.ts`; `catalogo-polo.ts`; `catalogo-horizontes.ts` | Relieve local del polo; catálogo de 10 sitios y 17 RoI; horizonte de cada uno. También la parte cercana del horizonte de Connecting Ridge (`polo-lola.ts`) |
| MAZARICO-ILUM | Mapas de visibilidad media `AVGVISIB_85S_060M_201608` y `_EARTH`, 60 m por píxel, 18,6 años | Mazarico et al. (2011); PDS LOLA EXTRAS y PGDA (producto 69) | [LOLA EXTRAS](http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/); [PGDA 69](https://pgda.gsfc.nasa.gov/products/69) | `validacion-iluminacion-connecting-ridge.json` (6 453); `validacion-catalogo.json` (22 255) | `validar-iluminacion.ts`; `validar-catalogo.ts` | Referencia para validar. Se guardan solo los píxeles de los sitios y sus vecinos |
| NASA3D-LM | Modelo 3D "Apollo Lunar Module" | NASA 3D Resources (NASA Ames Research Center) | [repositorio de la NASA](https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Apollo%20Lunar%20Module) | `modelos/lm-nasa-3d-resources.glb` (716 840); `modelos/lm-nasa-3d-resources.json` (1 015) | sin script: descarga manual, con su sha256 | Cuerpo del LM en la escena y en el descenso 3D. El tren de aterrizaje del modelo no está a escala y se reemplaza |

Notas:

- **Cita que pide JPL** (cabecera de `horizons.ts`): "NASA/JPL Horizons On-Line Ephemeris System", J. D. Giorgini y JPL Solar System Dynamics Group, con la fecha de consulta.
- `horizonte-cercano.ts` no descarga nada: agrega a `horizonte-<sitio>.json` el horizonte cercano, calculado sobre el relieve de 2 m ya guardado (SPEC E23).
- `polar.ts` tampoco descarga: es la geometría que comparten los scripts del polo.
- La fila "sin clave" y varias partes de LOLA-5M-PGDA no están en `investigacion/fuentes.md` (sección 7).
- El catálogo trae un lugar más, el alunizaje de IM-2, que no es un dato de la NASA (sección 3).

### 2.2 Documentos de la NASA sin archivo de datos

Sus valores están copiados en el código, con la cita al lado.

| Clave | Documento | Enlace | Para qué |
|---|---|---|---|
| LROC-COORD | LROC Science Operations Team (ASU), "Coordinates of Lunar Anthropogenic Targets", 28 de julio de 2016; Wagner et al., Icarus 283 (2017) 92–103 | [PDF de LROC](https://www.lroc.asu.edu/data/support/downloads/2016_LROC_Coordinates_of_Human_Features.pdf) | Posición del LM del Apollo 17 (20,1911° N, 30,7723° E, −2626 m, ±3,5 m), del ALSEP, el LRV y el SEP; sitio del LM del Apollo 11 |
| NSSDCA-A17 | NASA NSSDCA, "Apollo 17" | [ficha](https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo17info.html) | Coordenadas iniciales del sitio. LROC-COORD la reemplazó en el paso E6 |
| NSSDCA-LM17 | NASA NSSDCA, "Apollo 17 Lunar Module" (1972-096C) | [ficha](https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1972-096C) | Medidas y masas de la etapa de descenso del LM |
| NSSDCA-LM11 | NASA NSSDCA, "Apollo 11 Lunar Module / EASEP" (1969-059C) | sin enlace en `fuentes.md` | Hora del alunizaje (20:17:40 UT) y masas |
| TN-D-6846 | Bennett, F. V., *Apollo Experience Report: Mission Planning for Lunar Module Descent and Ascent*. NASA TN D-6846, junio de 1972 | NTRS 19720018205 | Perfil premisión del Apollo 11, combustible, criterio de luz y peso del LM |
| DPS | Hammock, W. R., Jr., Currie, E. C. y otros, *Apollo Experience Report: Descent Propulsion System*. NASA TN D-7143, marzo de 1973 | NTRS 19730011150 | Empuje máximo de 10 500 lbf, punto fijo de 92,5 % e impulso específico de 305 s |

### 2.3 Quién lee cada archivo

Sirve para saber qué datos acompañan a cada módulo al portarlo.

| Archivos de `datos/` | Los lee |
|---|---|
| `efemerides-<sitio>.json` | `calculos/motor/simulation.ts` |
| `relieve-<sitio>.json` | `calculos/motor/terreno.ts` |
| `horizonte-<sitio>.json` | `calculos/motor/horizonte.ts`; el planificador, desde `interfaz-referencia/ui/lugares.ts` |
| `efemerides-luna.f32` y `.json` | La interfaz (`interfaz-referencia/ui/Planificador.tsx`, `simulacionComun.ts`), que se los pasa a `calculos/motor/efemeridesLuna.ts` |
| `catalogo-polo.json`, `dem-polo*.i16`, `dem-polo.json`, `horizonte-catalogo-<id>.json` | `interfaz-referencia/ui/lugares.ts`, que se los pasa a `calculos/motor/demPolar.ts` y `mascara.ts` |
| `hapke-wac-apollo17.json` | `calculos/motor/hapke.ts` |
| `valle-<sitio>*` | `interfaz-referencia/scene/Valle.tsx` |
| `luna-ldem4.f16`, `luna-ldam4.f16` | `interfaz-referencia/scene/LunaCompleta.tsx` |
| `albedo-apollo17.u16` | `interfaz-referencia/scene/AlbedoReal.tsx` |
| `modelos/lm-nasa-3d-resources.glb` | `interfaz-referencia/scene/Equipos.tsx` |
| `validacion-iluminacion-<sitio>.json`, `serie-*-<sitio>.f32` | `interfaz-referencia/ui/Secciones.tsx` y las pruebas |
| `validacion-catalogo.json`, `luz-apollo11.json` | Solo las pruebas |
| `luna-global.json`, `albedo-apollo17.json`, `modelos/lm-nasa-3d-resources.json` | Nadie: son la procedencia de sus datos |

## 3. Datos y referencias de otras agencias o instituciones

| Fuente | De quién es | ¿Es de la NASA? | Uso en el prototipo |
|---|---|---|---|
| Cámara de terreno (TC) de SELENE (Kaguya), dentro de SLDEM2015 | JAXA, la agencia espacial de Japón | No. SLDEM2015 combina LOLA, de la NASA, con SELENE TC | Horizonte y valle 3D del Apollo 17 |
| R-695: Klumpp, A. R., *Apollo Lunar-Descent Guidance*. MIT Charles Stark Draper Laboratory, junio de 1971 | MIT | No. Es un informe del laboratorio. La copia usada es la de [ibiblio](https://www.ibiblio.org/apollo/Documents/Apollo%20Lunar%20Descent%20Guidance.pdf); también está en el Apollo Lunar Surface Journal de la NASA | Ecuaciones del guiado del descenso (SPEC E26.1) |
| FA: Wakker, *Fundamentals of Astrodynamics* | TU Delft, acceso abierto | No | Geometría Sol-Tierra-Luna y constantes |
| Barker et al. (2021) y Mazarico et al. (2011) | Artículos en revistas científicas | Los datos sí, de PGDA y LOLA; los artículos son publicaciones aparte | Catálogo, RoI y validación de la iluminación |
| Schröder et al. (2017), arXiv:1701.08550 | Artículo de acceso abierto | No | Ecuaciones del modelo de Hapke |
| Alunizaje de IM-2 (Athena), de Intuitive Machines, del 2025-03-06 | La coordenada sale de Wikipedia ("IM-2") y de una [página de LROC](https://www.lroc.asu.edu/images/1401) | No. Es una fuente secundaria | Un lugar del catálogo, en el grupo "Misiones" (`datos/catalogo-polo.json`) |
| DEM de 5 m por *shape-from-shading*: Bertone et al., Zenodo doi:10.5281/zenodo.17954508 (2025, CC-BY-4.0) | Zenodo | No | **Sin usar.** Está anotado como pendiente (SPEC, "Abiertas") |
| Página de exploración lunar de la CSA, la agencia espacial de Canadá | CSA | No | **Sin usar** (sección 6) |

`investigacion/fuentes.md` escribe "SELENE TC" y no nombra a JAXA. Conviene confirmar la cita exacta del producto antes de pasarla al formulario (sección 7).

## 4. Libros, informes y artículos por clave

### Libros

| Clave | Referencia | Para qué se usó |
|---|---|---|
| FA | Wakker, K. F. *Fundamentals of Astrodynamics*. TU Delft, 2015. ISBN 978-94-6186-419-2. 690 pp. Acceso abierto | Constante solar de 1361 W/m² y albedo de la Tierra de 0,32 (p. 542); latitud subsolar máxima de 1,5424° (p. 412); libración (p. 413); mes sinódico (p. 257); tránsito (pp. 252–254); radios, órbitas y constante gravitacional de la Luna (tablas B.1 a B.7, pp. 671–675) |
| LSB | Heiken, Vaniman, French (eds.). *Lunar Sourcebook: A User's Guide to the Moon*. Cambridge University Press, 1991. 778 pp. | Día lunar medio de 29,531 d (p. 58); albedo de los mares de 7–10 % (p. 59); forma del modelo de Hapke (pp. 559–560); macizos de Taurus-Littrow (pp. 33–34, 37); medidas del rover (fig. 9.44, p. 527) |
| RTR | Akenine-Möller, Haines, Hoffman, Pesce, Iwanicki, Hillaire. *Real-Time Rendering*, 4.ª ed. CRC Press, 2018. 1199 pp. | Horizonte por marcha de rayos (pp. 465–466); penumbra (pp. 250–252); exposición y curva de tono (pp. 286, 289); luz indirecta (pp. 442–443) |
| PBR | Pharr, M. y Humphreys, G. *Physically Based Rendering: From Theory to Implementation*. Borrador del 4 de noviembre de 2003 | Radiometría y soluciones exactas para las pruebas: horno (p. 575), plano infinito (pp. 191–193), Sol en el horizonte (p. 545), energía de la BRDF (pp. 197, 538) |
| DI | Tidwell, Brewer, Valencia. *Designing Interfaces*, 3.ª ed. O'Reilly, 2020. 602 pp. | Patrones de la interfaz: Center Stage, Wizard, Datatips, Dynamic Queries, Data Brushing. Revisión en cuatro rondas ([07-pruebas-y-validacion.md](07-pruebas-y-validacion.md), sección 6) |

### Informes del programa Apollo

R-695, TN-D-6846 y DPS: ver las secciones 2.2 y 3. Son la base del descenso ([06-simulador.md](06-simulador.md)).

### Artículos

| Clave o cita | Referencia | Para qué se usó |
|---|---|---|
| MAZARICO-ILUM | Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., Torrence, M. H. (2011), "Illumination conditions of the lunar polar regions using LOLA topography", Icarus 211, 1066–1081, doi:10.1016/j.icarus.2010.10.030 | Referencia de la iluminación del polo; numeración de los sitios |
| LOLA-5M-PGDA | Barker et al. (2021), "Improved LOLA Elevation Maps for South Pole Landing Sites: Error Estimates and Their Impact on Illumination Conditions", Planet. Space Sci. 203, 105119, https://doi.org/10.1016/j.pss.2020.105119 | DTM de 5 m y RoI; su conclusión sobre las RoI 4 a 6 se usa como prueba |
| WAC-HAPKE | Sato et al. (2014), JGR Planets 119, 1775–1805 | Parámetros de Hapke medidos |
| SCHRODER17 | Schröder et al. (2017), "Resolved spectrophotometric properties of the Ceres surface from Dawn Framing Camera images", arXiv:1701.08550 | Ecuaciones 13 a 16 del modelo de Hapke. No incluye la rugosidad |
| LROC-COORD | Wagner et al., Icarus 283 (2017) 92–103 | Coordenadas de los objetos del Apollo |
| LOLA-GDR | Lemelin et al. (2016) | Albedo `LDAM_4`. `fuentes.md` la marca "cita completa sin verificar" |
| ORTO-A17 | Henriksen et al. (2017) | Citada con la ortoimagen, sin datos de publicación en `fuentes.md` |
| SFS-5M | Bertone, McKenna, Barker, Mazarico, Beyer, Petro, *The Planetary Science Journal*, doi:10.3847/PSJ/ae5b70 | Sin usar todavía |
| — | Hapke (1981), ecuación 16 | Se usa tal como la reproduce el LSB (p. 559). No se tiene Hapke (1984) ni el libro de Hapke (2012), que traen la rugosidad (SPEC E17) |

## 5. Fuentes parciales, no citables y lo que no se sube

**Los PDF no están en este repositorio.** Los libros y los informes tienen derechos de autor o pesan demasiado (335 MB en el prototipo, donde ya estaban fuera de git). Quedan citados, con su enlace público cuando `investigacion/fuentes.md` lo da: R-695 (ibiblio), TN D-6846 y TN D-7143 (por su número en NTRS), SM (DOI), Schröder et al. (arXiv) y Bertone et al. (Zenodo). El enlace al PDF de LROC-COORD está en `datos/relieve-apollo17.json`. `fuentes.md` nombra además archivos locales (`fuentes/…pdf`) que no existen en la copia.

**Fuentes parciales** (se citan con cuidado):

| Clave | Fuente | Qué se tiene | Límite |
|---|---|---|---|
| SM | Fielder, G. *Secrets of the Moon*. CRC Press. DOI 10.1201/9781003181279 | Solo los capítulos 1 a 5, de una vista previa que el autor del prototipo pegó como texto el 2026-11-06 | Sin números de página: se cita por capítulo. Las tesis propias del libro (Luna no rígida, origen extrusivo de los *wrinkle ridges*) son interpretaciones, no reglas del motor |
| PSP | *Planetary Surficial Processes*: resúmenes de una sesión oral de congreso, 5 pp. | Año cercano a 2014 (**supuesto**) | Poco uso: solo el resumen de Bugiolacchi sobre cráteres pequeños en la zona del Apollo 17. No da la distribución numérica |
| PBR | El borrador de 2003, marcado "Do Not Distribute", anterior a la primera edición (2004) | Completo, 860 pp. | La paginación puede diferir de la edición publicada. La matriz de trazabilidad lista erratas del borrador que no se deben copiar |

**No citables** (según `fuentes.md`):

| Qué es | Por qué no se cita | Qué hace falta |
|---|---|---|
| *Fundamentals of Spacecraft Attitude Determination and Control* (Markley) | No es el libro: es un resumen de terceros (Bookey), de 155 pp. | El original: Markley y Crassidis, Springer, 2014 |
| *The Lunar Base Handbook*, P. Eckart (ed.), McGraw-Hill | Solo portada e índice (7 pp.). El año, 1999, es un **supuesto** | El libro completo. `fuentes.md` lista los capítulos que servirían |

Además, la primera fuente del sitio del Apollo 17 (NSSDCA-A17, con unos 300 m de precisión) quedó reemplazada por LROC-COORD.

## 6. Recursos que da el reto

Son los cuatro enlaces de la pestaña *Resources* del reto ([01-reto.md](01-reto.md)).

| Recurso | Enlace del reto | ¿Lo usa el prototipo? |
|---|---|---|
| JPL Horizons | https://ssd.jpl.nasa.gov/horizons/ | **Sí.** Todas las efemérides salen de ahí (cuatro primeras filas de la sección 2.1) |
| LROC Quickmap | https://quickmap.lroc.asu.edu/ | **No como fuente de datos.** Los datos de LROC se bajaron del PDS. El plan E27, sin ejecutar, propone un enlace "Ver en Quickmap" por sitio o punto |
| Moon Trek | https://trek.nasa.gov/moon/ | **No.** El plan E27 propone un enlace "Ver en Moon Trek". El paso E24 anotó que la capa de regiones de Artemis III no tiene descarga directa |
| Página de exploración lunar de la CSA | https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/ | **No.** No figura en `fuentes.md`, en el SPEC ni en el código |

Sobre Quickmap, lo que registró el prototipo:

- El reto enlaza `quickmap.lroc.asu.edu`.
- El SPEC (línea 1008) usa `quickmap.lroc.im-ldi.com` y lo llama "su dirección nueva". Lo comprobó en el navegador el 2026-11-13.
- En esa comprobación, con el sitio de IM-2, el centro del mapa cayó a unos 20 m del punto pedido en Quickmap y a unos 90 m en Moon Trek. El formato de los enlaces es un **supuesto**: ninguna de las dos herramientas lo documenta (SPEC, "Plan NASA Space Apps 2026").

## 7. Qué falta para los campos del formulario

El texto literal de los dos campos está en [09-entrega.md](09-entrega.md). Todo va en inglés.

### Borrador para "NASA Data"

1. **NASA/JPL Horizons** (efemérides DE441): posiciones del Sol y la Tierra vistas desde la Luna. Tabla global de 2026 a 2030, tablas por sitio, serie de 18,6 años y el Sol del alunizaje del Apollo 11.
2. **LRO LROC** (PDS): DTM de 2 m y ortoimagen de 0,6 m del sitio del Apollo 17; mapas de parámetros de Hapke de la cámara WAC; coordenadas de los objetos del Apollo.
3. **LRO LOLA** (PDS Geosciences Node): `LDEM_4`, `LDAM_4`, `LDEM_75S_120M`, `LDEM_75S_240M` y SLDEM2015.
4. **NASA GSFC PGDA:** DTM de 5 m de los sitios del polo sur con sus regiones de interés (Barker et al. 2021), y mapas de iluminación (Mazarico et al. 2011, producto 69).
5. **NASA 3D Resources:** modelo del módulo lunar del Apollo.
6. **NASA NSSDCA:** fichas del Apollo 17 y de los módulos lunares del Apollo 11 y 17.
7. **Informes técnicos de la NASA:** TN D-6846 y TN D-7143.
8. **JPL Horizons también es un recurso del reto.** Quickmap y Moon Trek solo cuentan si se implementa el plan E27.

### Borrador para "Space Agency Partner Data and Other References"

1. **JAXA:** cámara de terreno de SELENE (Kaguya), dentro de SLDEM2015.
2. **CSA:** no se usa. Decir que no, o agregarla si el equipo la usa.
3. **Artículos:** los de la sección 4.
4. **Libros:** FA, LSB, RTR, PBR y DI. SM y PSP, como fuentes parciales.
5. **Informe del MIT:** R-695.
6. **Otros datos:** coordenada del alunizaje de IM-2.
7. **Código de terceros del prototipo** (su `package.json`): React, three.js, React Three Fiber y drei; Vite, TypeScript y oxlint para construir; Bun para correr scripts y pruebas. El decodificador Draco está copiado de three 0.187 en la carpeta `public/draco/` del prototipo original (SPEC E15.6). Hay que sumar lo que use la aplicación nueva del equipo.
8. **Método de trabajo:** la plantilla de pasos del SPEC se tomó de craftzdog (SPEC, sección "Pasos").

### Pendientes antes de llenar los campos

- **Completar el registro.** `investigacion/fuentes.md` no tiene filas para lo que entró en los pasos E22 a E24: la tabla global de Horizons, `LDEM_75S_240M`, los otros nueve mosaicos de PGDA con sus RoI, y el alunizaje de IM-2. Esa procedencia sí está en las cabeceras de los scripts y en los metadatos de `datos/`.
- **Citas incompletas.** Lemelin et al. (2016), Henriksen et al. (2017) y el artículo de referencia de SLDEM2015, que no figura. Las regiones candidatas de Artemis III se nombran como "NASA, 2022 y 2024", sin enlace (cabecera de `catalogo-polo.ts`).
- **IM-2.** Reemplazar Wikipedia por una fuente primaria (también en [10-diferencias-spec-codigo.md](10-diferencias-spec-codigo.md)).
- **Año de Wagner et al.** Una prueba y un metadato dicen 2016; `fuentes.md` dice Icarus 283 (2017).
- **Quickmap.** Decidir qué dominio se enlaza (sección 6).
- **Fechas de consulta.** Cada producto trae la suya en su JSON (`consultadoUTC`; `descargadoUTC` en el modelo 3D). JPL pide citar Horizons con esa fecha.
- **Licencias y avisos.** El modelo 3D de la NASA dice "free and without copyright" (`datos/modelos/lm-nasa-3d-resources.json`). El DEM de Zenodo es CC-BY-4.0, pero no se usa. La frase de no respaldo de la NASA debe ir en la entrega.
- **Idioma.** Pasar estas listas a inglés.
