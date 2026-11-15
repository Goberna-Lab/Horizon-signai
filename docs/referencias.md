# Referencias y recursos

Todo lo que usan los cálculos, los mapas y la base de datos de Horizon Signai, con su enlace y para qué sirve. Los
detalles de cada conjunto de datos (archivos, tamaños, scripts) están en `docs/08-datos-y-fuentes.md`; las fichas
originales del motor, en `luna-recursos/investigacion/fuentes.md`. En la base, las fuentes viven en `ref.data_source`.

Uso de datos de la NASA: se cita la fuente y no se da a entender que la NASA respalda el proyecto
([NASA Brand Center](https://www.nasa.gov/nasa-brand-center/images-and-media/)).

## Decisiones del equipo sobre el cálculo

| Decisión | Estado | Base |
|---|---|---|
| **Panel solar vertical que gira en azimut para mirar al Sol** (seguimiento en un eje). Irradiancia = 1361 W/m² / r² × fracción visible del disco × cos(elevación del Sol) | Adoptada. Era un supuesto; ahora se apoya en el diseño de NASA VSAT | NASA VSAT (abajo): paneles verticales en mástil para el polo sur, seguimiento solar en un eje con giro de 360°. Constante solar: Wakker, FA cap. 20.4, p. 542 |
| **Alturas de referencia del panel:** 2 m (sobre el módulo), 5 m (mínimo de VSAT) y 10 m (objetivo de VSAT), medidas hasta el borde inferior del panel | Adoptada (botones en el escenario del planificador; tabla `ref.power_system`) | NASA VSAT, KPP 2: altura del mástil "from the surface to the point at which the solar array blanket attaches to the lower cross boom" |
| **Distancia real al Sol** en la irradiancia (r en UA, ±3,4 % en el año) | Adoptada en el planificador (`prototipos/lunar-map/engine.js`). En el motor TypeScript (`luna-recursos/calculos/motor/planificador.ts` y su copia en `apps/web/src/shared/planning/engine/`), pendiente de aprobación del núcleo (reglas de `luna-recursos/investigacion/AGENTS.md`) | Wakker, FA p. 542 (1361 W/m² a 1 UA) y p. 675 (e = 0,0167) |
| **Sol medido desde el panel y Tierra desde la antena, en el mismo punto del terreno** | Aceptada por el equipo | Simplificación declarada del planificador del equipo |
| **Sol visible:** alguna parte del disco sobre el horizonte real (semidiámetro 0,266°). **Tierra visible:** su centro | Adoptada | Como los mapas de Mazarico et al. (2011); SPEC E21 y E23 |

## Energía en el polo sur (panel)

| Fuente | Qué aporta |
|---|---|
| NASA STMD Game Changing Development, **Vertical Solar Array Technology (VSAT)**, revisión anual de septiembre de 2023. [NTRS 20230012849](https://ntrs.nasa.gov/api/citations/20230012849/downloads/GCD%20Annual%20Review%20VSAT%20September%202023%20Final.pdf) | Requisitos: seguimiento solar en un eje (360°), mástil de 5 m (mínimo) a 10 m (objetivo) hasta el borde inferior del panel, 10–50 kW, ambiente del polo sur (−180 °C a +175 °C) |
| NASA, selección de Astrobotic, Honeybee Robotics y Lockheed Martin para prototipos VSAT ([resumen](https://www.potomacofficersclub.com/news/nasa-announces-companies-building-solar-array-technology-prototypes-for-artemis/)) | Contexto: paneles verticales en mástil para Artemis |
| Lockheed Martin, [*Powering the Moon: Vertical Solar Arrays Charge the Way*](https://www.lockheedmartin.com/en-us/news/features/2025/powering-the-moon--vertical-solar-arrays-charge-the-way-.html) (2025) | Contexto: despliegue vertical de hasta ~20 m |
| NASA GRC, estación de transmisión de energía por láser con mástil VSAT de 10 m ([NTRS 20240014584](https://ntrs.nasa.gov/api/citations/20240014584/downloads/BEACON%20Final.pdf)) | Un panel elevado cerca del polo produce energía durante la mayor parte del día lunar |
| Silva-Rodríguez, J. y Li, X. (2024), *Solar Power Generation Profile Estimation for Lunar Surface Solar PV Systems*, [arXiv:2402.14783](https://arxiv.org/abs/2402.14783) | Comparación de cuatro configuraciones de panel por energía y complejidad, con iluminación sobre el relieve del polo sur |

## Datos de la Luna

| Clave en la base | Fuente | Para qué |
|---|---|---|
| `lola_ldem4`, `lola_ldam4`, `lola_ldem16` | LRO LOLA Gridded Data Records (PDS Geosciences Node), [cilíndricos](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/float_img/) | Relieve, albedo y sombreado del globo del mapa 3D |
| `lola_ldem75s` | LRO LOLA `LDEM_75S_240M` (240 m; bloques de 960 m), [polares](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/) | Relieve del polo sur: mapa del planificador, radar de Missions, horizonte lejano y horizonte aproximado de las zonas K–M |
| `pgda_5m_horizons`, `pgda_barker2021` | Barker, M. K. et al. (2021), *Improved LOLA Elevation Maps for South Pole Landing Sites*, Planet. Space Sci. 203, 105119, [doi:10.1016/j.pss.2020.105119](https://doi.org/10.1016/j.pss.2020.105119); DTM de 5 m de [PGDA](https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/README) | Sitios y RoI del polo sur; horizonte detallado de las zonas A–J |
| `mazarico2011` | Mazarico, E. et al. (2011), *Illumination conditions of the lunar polar regions using LOLA topography*, Icarus 211, 1066–1081, doi:10.1016/j.icarus.2010.10.030; mapas `AVGVISIB_85S_060M_201608` y `_EARTH` ([imbrium.mit.edu](http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/), [PGDA producto 69](https://pgda.gsfc.nasa.gov/products/69)) | Referencia de validación de la visibilidad media del Sol y la Tierra (`ref.illumination_reference`) |
| `jpl_horizons_de441` | NASA/JPL Horizons (J. D. Giorgini y JPL Solar System Dynamics Group), efemérides DE441, [API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) | Posición del Sol y la Tierra cada 3 h de 2026 a 2030 |
| `lroc_nac` | LROC NAC, regiones candidatas de Artemis III: [Mons Mouton](https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_ROI_MTMOUTONLOB), [Mons Mouton Plateau](https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_ROI_MOUTNPLTLO1), [Peak near Cabeus B](https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_ROI_CABEUSPKLO1) | Posición de las zonas K–M |
| — | NASA (2024), [*NASA Provides Update on Artemis III Moon Landing Regions*](https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/) | Qué sitios son candidatos de Artemis III |
| — | Bertone, S. et al., DEM de 5 m por shape-from-shading de las 13 regiones candidatas de Artemis III, *The Planetary Science Journal*, doi:10.3847/PSJ/ae5b70; datos en [Zenodo](https://doi.org/10.5281/zenodo.17954508) | Sin usar todavía: horizonte detallado posible para K–M |
| `nssdca_landings` | NASA NSSDCA, [*Lunar Artifact Impacts and Landings*](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html) | Sitios de alunizaje del mapa 3D |
| `iau_gazetteer` | IAU/USGS [Gazetteer of Planetary Nomenclature](https://planetarynames.wr.usgs.gov/) | Nombres de la Luna en el mapa 3D |
| `nasa_blue_marble` | NASA [Blue Marble](https://svs.gsfc.nasa.gov/vis/a000000/a002900/a002915/bluemarble-2048.png) | Textura de la Tierra |

Otros conjuntos del motor 3D (Apollo 17: SLDEM2015, NAC DTM, ortoimagen, Hapke WAC, coordenadas LROC) están en
`docs/08-datos-y-fuentes.md`.

## Descenso (vehículo de ejemplo: Apollo 11)

| Fuente | Qué aporta |
|---|---|
| Klumpp, A. R. (1971), *Apollo Lunar-Descent Guidance*, MIT Draper Laboratory, R-695 ([copia](https://www.ibiblio.org/apollo/Documents/Apollo%20Lunar%20Descent%20Guidance.pdf)) | Guiado P63/P64/P66 |
| Bennett, F. V. (1972), *Apollo Experience Report: Mission Planning for Lunar Module Descent and Ascent*, NASA TN D-6846 (NTRS 19720018205) | Perfil del Apollo 11, puerta alta, combustible |
| Hammock, W. R. y otros (1973), *Apollo Experience Report: Descent Propulsion System*, NASA TN D-7143 (NTRS 19730011150) | Empuje e impulso específico del motor de descenso |
| NASA NSSDCA, [Apollo 11 Lunar Module](https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1969-059C) | Hora del alunizaje y masas |

## Libros

| Clave | Libro |
|---|---|
| FA | Wakker, K. F. *Fundamentals of Astrodynamics*. TU Delft, 2015. ISBN 978-94-6186-419-2 (acceso abierto): constante solar (cap. 20.4, p. 542), excentricidad de la Tierra (p. 675), 1 UA (p. 671) |
| LSB | Heiken, Vaniman, French (eds.). *Lunar Sourcebook*. Cambridge University Press, 1991 |
| RTR | Akenine-Möller et al. *Real-Time Rendering*, 4.ª ed. CRC Press, 2018 |
| PBR | Pharr y Humphreys. *Physically Based Rendering* (borrador de 2003) |
| DI | Tidwell, Brewer, Valencia. *Designing Interfaces*, 3.ª ed. O'Reilly, 2020 |

## Recursos y herramientas

| Recurso | Para qué |
|---|---|
| [LROC Quickmap](https://quickmap.lroc.asu.edu/) | Ver cada zona sobre imágenes de la NASA (enlace "See this place in LROC Quickmap" del planificador) |
| [NASA Moon Trek](https://trek.nasa.gov/moon/) | Exploración de mapas lunares |
| [NASA 3D Resources: Apollo Lunar Module](https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Apollo%20Lunar%20Module) | Modelo 3D del módulo lunar |
| [Space Apps 2026: Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/) | Enunciado del reto |

## Dónde viven los datos

| Qué | Dónde |
|---|---|
| Zonas candidatas con horizonte, Mazarico y paneles | Base: `moon.candidate_zone`, `moon.horizon_envelope`, `ref.illumination_reference`, `ref.power_system`; función `moon.horizon_at(zona, azimut, altura)`; vista `moon.v_candidate_zone` (migración `db/migrations/0009_candidate_zones.sql`, carga `db/etl/load_zones.py`). En el planificador: `prototipos/lunar-map/data/zonas.js` (lo genera `tools/zonas-candidatas.js`) |
| Cifras 2026–2030 por zona y altura del equipo, calculadas con el motor del planificador | Base: `moon.zone_stats` (migración `0010_zone_stats.sql`, carga `db/etl/load_zone_stats.py`, cálculo `prototipos/lunar-map/tools/zone-stats.js`) |
| Evaluar un escenario desde fuera del navegador | API: `/api/planner/zones`, `/api/planner/power-systems`, `/api/planner/evaluate` (`apps/api/src/planner/`: el mismo `engine.js`, con efemérides y horizontes leídos de la base) |
| Sitios, efemérides, relieve e iluminación del mapa 3D | Base: `moon.site`, `eph.*`, `terrain.*`, `moon.site_illumination` (`db/README.md`) |
| Datos originales del motor | `luna-recursos/datos/` |
