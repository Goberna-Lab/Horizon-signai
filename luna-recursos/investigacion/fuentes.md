# Fuentes

Los PDF viven en `docs/fuentes/` (fuera de git). Citar como: libro, capítulo, página.

| Clave | Libro | Archivo | Para qué |
|---|---|---|---|
| DI | Tidwell, Brewer, Valencia. *Designing Interfaces*, 3.ª ed. O'Reilly, 2020. 602 pp. | `fuentes/designing-interfaces-3e.pdf` | Patrones de interfaz: panel, controles, visualización |
| LSB | Heiken, Vaniman, French (eds.). *Lunar Sourcebook: A User's Guide to the Moon*. Cambridge University Press, 1991. 778 pp. | `fuentes/lunar-sourcebook.pdf` | Datos físicos de la Luna: superficie, regolito, entorno |
| FA | Wakker, K. F. *Fundamentals of Astrodynamics*. TU Delft, 2015. ISBN 978-94-6186-419-2. 690 pp. Acceso abierto | `fuentes/fundamentals-of-astrodynamics.pdf` | Geometría Sol-Tierra-Luna, tiempos, constante solar, cono de sombra |
| RTR | Akenine-Möller, Haines, Hoffman, Pesce, Iwanicki, Hillaire. *Real-Time Rendering*, 4.ª ed. CRC Press, 2018. 1199 pp. | `fuentes/real-time-rendering-4ed.pdf` | Cómo representar: sombras suaves, exposición, BRDF lunar, luz indirecta |
| PBR | Pharr, M. y Humphreys, G. *Physically Based Rendering: From Theory to Implementation*. **Borrador del 4 de noviembre de 2003** ("Do Not Distribute"), anterior a la 1.ª ed. (2004). 860 pp. | `fuentes/physically-based-rendering.pdf` | Radiometría, luces de área y su muestreo (penumbra exacta), BRDF rugosas (Oren–Nayar), tone mapping. Al ser un borrador, la paginación puede diferir de la edición publicada |

Texto buscable: `pdftotext -layout docs/fuentes/<archivo>.pdf -` y grep. Pendiente: extraer por capítulo cuando haga falta el agente bibliotecario.

## Datos (E5)

| Clave | Fuente | Archivo | Para qué |
|---|---|---|---|
| HZN | NASA/JPL Horizons On-Line Ephemeris System (J. D. Giorgini y JPL Solar System Dynamics Group), efemérides DE441. API: https://ssd-api.jpl.nasa.gov/doc/horizons.html | `src/data/efemerides-apollo17.json` (en git), generado por `scripts/horizons.ts`; guarda las consultas exactas y la fecha | Posición, diámetro angular y fase reales del Sol y la Tierra vistos desde el Apollo 17 |
| NSSDCA-A17 | (reemplazada por LROC-COORD en E6; precisión ~300 m) NASA NSSDCA, "Apollo 17", https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo17info.html (consultado el 2026-11-06) | — | Sitio de aterrizaje: "Taurus-Littrow (20.19 N, 30.77 E)" |

| DTM-A17 | LRO LROC NAC DTM `NAC_DTM_APOLLO17_2M` (PDS, LRO-L-LROC-5-RDR-V1.0; Arizona State University / NASA). https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/APOLLO17_2M/ | `src/data/relieve-apollo17.json` (en git), generado por `scripts/dtm.ts`; guarda el producto, el recorte y la fecha | Relieve real de 400 m alrededor del módulo lunar, 2 m/píxel (ENV-008) |
| LROC-COORD | LROC Science Operations Team (ASU), "Coordinates of Lunar Anthropogenic Targets", 28-jul-2016; Wagner et al., Icarus 283 (2017) 92–103 | `docs/fuentes/lroc-coordinates-human-features-2016.pdf` | Posición del módulo lunar del Apollo 17: 20,1911° N, 30,7723° E, −2626 m, ±3,5 m. También trae el ALSEP, el LRV y el SEP |

| SLDEM2015 | LRO LOLA + SELENE TC, SLDEM2015, tile `SLDEM2015_512_00N_30N_000_045_FLOAT` (PDS Geosciences Node), https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/sldem2015/ | `src/data/horizonte-apollo17.json` (en git), generado por `scripts/horizonte.ts` | Perfil del horizonte real (macizos) desde el módulo lunar (E10) |

| LOLA-GDR | LRO LOLA Gridded Data Records LDEM_4 y LDAM_4 (PDS Geosciences Node), https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/float_img/ ; LDAM: Lemelin et al. 2016 (cita completa sin verificar) | `src/data/luna-ldem4.f16`, `luna-ldam4.f16`, `luna-global.json` (en git), generados por `scripts/luna-global.ts` | Relieve y albedo global de la Luna (E14) |

| NSSDCA-LM17 | NASA NSSDCA, ficha "Apollo 17 Lunar Module" (id 1972-096C), https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1972-096C (consultada el 2026-11-06) | — | Medidas de la etapa de descenso del LM (E15.3) |

| ORTO-A17 | LRO LROC NAC, ortoimagen `NAC_DTM_APOLLO17_1_M134991788_60CM` (0,6 m/píxel; toma 2010-07-28 21:28:41 UTC; Henriksen et al. 2017), https://data.lroc.im-ldi.com/lroc/view_rdr_product/NAC_DTM_APOLLO17_1_M134991788_60CM | `src/data/albedo-apollo17.u16` y `.json` (en git), generados por `scripts/albedo-orto.ts` | Variaciones reales de albedo del sitio (E15.1) |

| WAC-HAPKE | LROC WAC Hapke parameter maps (Sato et al. 2014, JGR Planets 119, 1775–1805), `WAC_HAPKEPARAMMAP_566NM`/`643NM`, https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/WAC_HAPKEPARAMMAP/ | `src/data/hapke-wac-apollo17.json` (en git), generado por `scripts/hapke-wac.ts` | Parámetros de Hapke medidos en el sitio (E17) |
| SCHRODER17 | Schröder et al. (2017), "Resolved spectrophotometric properties of the Ceres surface from Dawn Framing Camera images", arXiv:1701.08550 (acceso abierto) | — | Ecuaciones del modelo de Hapke (ecs. 13–16) usadas con los parámetros WAC; no incluye la rugosidad |

| LOLA-5M-PGDA | M. K. Barker (NASA GSFC PGDA), "South Pole Landing Site LOLA DEMs", 5 m/pix, Site01: Connecting ridge, https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/ ; Barker et al. (2021), "Improved LOLA Elevation Maps for South Pole Landing Sites: Error Estimates and Their Impact on Illumination Conditions", Planet. Space Sci. 203, 105119, https://doi.org/10.1016/j.pss.2020.105119 ; numeración de sitios de Mazarico et al. (2011), Icarus 211, 1066–1081 | `src/data/relieve-connecting-ridge.json`, horizonte y valle (en git), generados por `scripts/dtm-polo.ts` y `scripts/polo-lola.ts` | Relieve local, horizonte cercano y valle del sitio polar (E20) |
| LOLA-POLAR-120 | LRO LOLA GDR polar `LDEM_75S_120M_FLOAT` (PDS Geosciences Node), https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/ | `src/data/horizonte-connecting-ridge.json`, `valle-connecting-ridge*` (en git), generados por `scripts/polo-lola.ts` | Horizonte lejano (hasta 150 km) y valle del polo fuera del mosaico de 5 m (E20) |
| MAZARICO-ILUM | Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., Torrence, M. H. (2011), "Illumination conditions of the lunar polar regions using LOLA topography", Icarus 211, 1066–1081, doi:10.1016/j.icarus.2010.10.030; mapas `AVGVISIB_85S_060M_201608` y `_EARTH` (PDS LOLA EXTRAS, http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/ ; PGDA producto 69, https://pgda.gsfc.nasa.gov/products/69) | `src/data/validacion-iluminacion-connecting-ridge.json` (píxel del sitio y vecinos), generado por `scripts/validar-iluminacion.ts` | Validación de la visibilidad media del Sol y la Tierra (E21) |
| SFS-5M | Bertone, S., McKenna, T. E., Barker, M. K., Mazarico, E., Beyer, R. A., Petro, N., *The Planetary Science Journal*, doi:10.3847/PSJ/ae5b70; datos: Zenodo doi:10.5281/zenodo.17954508 (2025, CC-BY-4.0) | — (sin usar todavía) | DEM de 5 m por shape-from-shading de las 13 regiones candidatas de Artemis III, incluida Connecting Ridge (Abiertas) |
| NASA3D-LM | NASA 3D Resources, "Apollo Lunar Module" (NASA Ames Research Center), https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Apollo%20Lunar%20Module (también data.nasa.gov, "NASA 3D Models: Apollo Lunar Module"); "free and without copyright" | `src/data/modelos/lm-nasa-3d-resources.glb` y `.json` (en git), descargado el 2026-11-06 con aprobación de Estephano | Forma del cuerpo de la etapa de descenso del LM (E15.6); su tren de aterrizaje no está a escala y se reemplaza |

Uso de datos de la NASA: se cita la fuente y no se da a entender que la NASA respalda el proyecto (https://www.nasa.gov/nasa-brand-center/images-and-media/).

## Fuentes parciales

| Clave | Fuente | Archivo | Para qué |
|---|---|---|---|
| SM | Fielder, G. *Secrets of the Moon*. CRC Press. DOI 10.1201/9781003181279 | `fuentes/secrets-of-the-moon-extracto.txt` (solo caps. 1–5, vista previa pegada por Estephano el 2026-11-06) | Método de sombras para medir alturas y sus límites; casos de validación (Straight Wall, wrinkle ridges) |
| PSP | *Planetary Surficial Processes*: resúmenes de una sesión oral de congreso (presidentes: B. Steer, Open University; L. Alexander, Birkbeck; R. Passmore, Oxford). ~2014 (**supuesto**: cita LPSC 2014 y habla del sobrevuelo de New Horizons en 2015 como futuro). 5 pp. | `fuentes/planetary-surficial-processes.pdf` | Poco uso: solo el resumen de Bugiolacchi sobre cráteres pequeños |

- **SM:** el extracto no tiene números de página; se cita por capítulo. Las tesis propias del autor (Luna no rígida, origen extrusivo de los wrinkle ridges) son **interpretaciones**, no reglas físicas del motor.
- **PSP, qué sirve y qué no** (revisado el 2026-11-06):
  - **Sirve, a futuro:** Bugiolacchi, "Trends in Distribution of Small Craters in the Apollo 17 Region" (p. 1). Contó cráteres de hasta 5 m de diámetro en el valle Taurus-Littrow, con imágenes NAC de ~1,4 m de resolución y ángulo de fase ~68°. Es una referencia de escala si algún día agregamos cráteres pequeños al terreno. Es un resumen, no da la distribución numérica.
  - **Contexto sin uso en el motor:** Crawford, el paleorregolito como archivo galáctico; Alexander, los finos del regolito del Apollo 12; Wilson, el torio en Compton-Belkovich.
  - **No aplica:** Marte (ExoMars, NWA7034), Plutón, meteoritos antárticos, asteroides.

## No citables

| Archivo | Qué es | Qué hacer |
|---|---|---|
| `fuentes/spacecraft-attitude-determination-control.pdf` | *Fundamentals of Spacecraft Attitude Determination and Control* (Markley): **no es el libro**, es un resumen de Bookey (terceros) de 155 pp. | Para citar hace falta el original: Markley y Crassidis, Springer, 2014 |
| `fuentes/lunar-base-handbook-indice.pdf` (archivo original `326668950.pdf`) | *The Lunar Base Handbook: An Introduction to Lunar Base Design, Development, and Operations*, P. Eckart (ed.), McGraw-Hill. **Solo portada e índice** (7 pp.): no trae el contenido. El año no aparece en el PDF (1999, **supuesto**) | Conseguir el libro completo. Capítulos que nos servirían: 5.6 "Physical Surface Properties" (p. 124), 5.7 "Lunar Surface Environment" (p. 140), 7.4 "The Case for a Lunar Polar Base" (p. 217), 11.1 "Thermal Control on the Lunar Surface" (p. 305), 12.2 "Solar Power Systems" (p. 334), 18.5 "Traverse Planning, Navigation, Lighting…" (p. 595) |

## Descenso del LM (E26)

| Clave | Fuente | Archivo | Para qué |
|---|---|---|---|
| R-695 | Klumpp, A. R. *Apollo Lunar-Descent Guidance*. MIT Charles Stark Draper Laboratory, R-695, junio de 1971. 71 pp. (copia de ibiblio: https://www.ibiblio.org/apollo/Documents/Apollo%20Lunar%20Descent%20Guidance.pdf; también en el Apollo Lunar Surface Journal de NASA). Paginación impresa = página del PDF − 7 | `fuentes/apollo-descenso/r695-klumpp-1971.pdf` | Guiado polinómico P63/P64 (pp. 14–18), P66 (pp. 31–32), regulador (p. 8), objetivos (pp. 51–56) |
| TN-D-6846 | Bennett, F. V. *Apollo Experience Report: Mission Planning for Lunar Module Descent and Ascent*. NASA TN D-6846, junio de 1972. NTRS 19720018205 | `fuentes/apollo-descenso/tn-d-6846-descenso-ascenso.pdf` | Perfil premisión del Apollo 11 (tabla I, p. 9), combustible (tabla II), criterio de luz (p. 10), peso del LM (p. 32) |
| DPS | Hammock, W. R., Jr., Currie, E. C. y otros. *Apollo Experience Report: Descent Propulsion System*. NASA TN D-7143, marzo de 1973. NTRS 19730011150 | `fuentes/apollo-descenso/aer-propulsion-descenso.pdf` | Empuje máximo 10 500 lbf, punto fijo 92,5 %, impulso específico 305 s (p. 7) |
| NSSDCA-LM11 | NASA NSSDCA, "Apollo 11 Lunar Module / EASEP" (1969-059C), consultada el 2026-11-07 | `fuentes/apollo-descenso/nssdca-lm11.html` | Hora del alunizaje (20:17:40 UT) y masas |
| NSSDCA-LM17 | (ver arriba) | `fuentes/apollo-descenso/nssdca-lm17.html` | Masas del LM del Apollo 17 y hora del alunizaje |
