# luna: cálculos, investigación y recursos (copia del 2026-11-14)

Esta es una copia de consulta para empezar de cero el proyecto de NASA Space Apps 2026 (reto *Lunar Landing Site Navigator*). Viene del proyecto `luna` en su estado del commit `72f890f`, más el plan de la entrega que se preparó el 2026-11-13. El detalle de cada paso (qué se hizo, cómo se validó y qué quedó pendiente) está en `investigacion/SPEC.md`.

La documentación que explica el reto, el planificador, los cálculos, las pruebas y la entrega está en [`../docs/`](../docs/README.md).

## Contenido

| Carpeta | Qué tiene |
|---|---|
| `calculos/motor/` | Los cálculos en TypeScript puro, sin React ni three |
| `calculos/scripts-de-datos/` | Los scripts que bajaron y procesaron cada dato de la NASA (se corren con `bun run`) |
| `calculos/pruebas-validacion/` | Pruebas contra Horizons, Mazarico 2011, Barker 2021, LROC y el Apollo 11 |
| `datos/` | Los datos ya procesados. Cada `.json` guarda su procedencia: consulta, fecha y cabeceras. |
| `investigacion/` | `SPEC.md` (pasos, decisiones y abiertas), `fuentes.md` (cada cita con libro y página), la matriz de trazabilidad, `AGENTS.md` (reglas del proyecto) y el enunciado original |
| `fuentes/` | **No está en este repositorio.** Son los libros e informes citados: muchos tienen copyright y no se publican. La lista, con sus enlaces, está en `investigacion/fuentes.md`. |
| `interfaz-referencia/` | La interfaz anterior (React + R3F), solo como referencia |
| `reto-space-apps/` | Las guías 2026 en texto: juicio, premios y entrega |

## Los cálculos y su validación

| Cálculo | Archivo | Validación |
|---|---|---|
| Sol y Tierra desde cualquier punto y fecha de 2026–2030 | `motor/efemeridesLuna.ts`, `datos/efemerides-luna.f32` (script `efemerides-luna.ts`) | Una sola tabla de JPL Horizons en el marco fijo de la Luna (puntos subsolar y subterrestre, corrección de tiempo de luz, paralaje topocéntrica). Coincide con las tablas por sitio a 0,0065°. |
| Horizonte real | `motor/mascara.ts`, `motor/horizonte.ts`, `datos/horizonte-*.json` | Envolvente convexa superior por azimut, para cualquier altura de observador |
| Relieve del polo sur | `motor/demPolar.ts`, `datos/dem-polo-*.i16` | LOLA LDEM_75S en estereográfica polar sur (ρ = 2R·tan(c/2)), a 240 m hasta 195 km del polo y a 960 m hasta 340 km |
| Catálogo de sitios | `datos/catalogo-polo.json` | 10 centros de PGDA, 17 ROI de Barker et al. 2021 e IM-2 |
| Ventanas de Sol y Tierra, energía y comunicación, cuenta regresiva | `motor/planificador.ts` | Contra Mazarico 2011 (26 píxeles) y Barker 2021 |
| Descenso del LM | `motor/descenso.ts` | Guiado polinómico del Apollo (R-695, Klumpp 1971). Contra el Apollo 11 (TN D-6846): contacto en 710 s frente a 714 s, ΔV −1 %, combustible −0,7 %. La recuperación del regulador llega 24 s tarde, fuera de los ±15 s. |
| Veredicto de aterrizaje | `motor/simulacion.ts` | Según los requisitos del usuario; cada criterio lleva su fuente |
| Luz y regolito | `motor/hapke.ts`, `motor/rebote*.ts` | Hapke calibrada en el Apollo 17; irradiancia de 1361 W/m² a 1 UA (FA p. 542) |

## Geometría y forma de la Luna: qué tan real es

Detalle completo en `investigacion/SPEC.md`, pasos E1 a E26.

| Qué | Dato real que usa | Qué tan cerca de la realidad | Lo que se simplifica |
|---|---|---|---|
| **Relieve del Apollo 17** (E6, E10, E16) | LROC NAC DTM a 2 m/px (`datos/relieve-apollo17.json`), valle de ±25 km (`valle-apollo17-*`) | El centro da −2626,21 m; LROC da −2626 m y SLDEM2015, −2628,0 m (a ~2 m). Macizo Norte a 4–10 km, entre 8° y 30°. Posición del LM con ±3,5 m (LROC 2016). | Recorte de 400 m a resolución completa; lo demás es más grueso |
| **Relieve del polo sur, Connecting Ridge** (E20) | DTM de 5 m de PGDA (Barker 2021) más LOLA LDEM_75S_120M hasta 150 km (`relieve-connecting-ridge.json`, `valle-connecting-ridge-*`) | Error RMS de 0,25 m. Dos productos LOLA independientes dan la misma altura del sitio (1944,8 m y 1943,0 m), lo que valida la proyección. | Se remuestrea a 2 m (más fino que el dato de 5 m) |
| **Polo sur completo** (E24) | LOLA LDEM_75S a 240 m y 960 m (`dem-polo-*.i16`), estereográfica polar sur | Horizontes de 5 m en 27 sitios. A ras del suelo, 240 m deja el horizonte ~1,2° más bajo que el DTM detallado; está documentado y avisado en la interfaz. | Los puntos propios usan solo 240 m |
| **Luna completa** (E14) | LOLA LDEM_4 (altura) y LDAM_4 (albedo), a 7,6 km/px (`luna-ldem4.f16`, `luna-ldam4.f16`) | LDEM en el sitio da ≈ −2,63 km, frente a −2626 m de LROC | Sin sombras del relieve a esta escala; paralaje sitio–centro ignorada (≤ 0,27°) |
| **Esfera y radios** | R = 1737,4 km; elevación con la esfera exacta (no plano local) | Necesaria porque Shackleton baja ~5 km | — |
| **Sol y Tierra** (E5, E22) | JPL Horizons DE441 | Contra las tablas por sitio, 0,0065° (≈ aberración anual). Diámetro del Sol de 0,533° y de la Tierra de ~1,90° (FA pp. 410, 671–673); fase de la Tierra a ≤ 0,2 %. | Solo 2026–2030 |
| **Iluminación promedio** (E21, E24) | Mazarico et al. 2011 y Barker et al. 2021 | A ras del suelo, ±5 puntos en Sol y Tierra frente a Mazarico | — |
| **Sombras** (E3.1, E6) | Penumbra con el tamaño real del disco solar | El largo de la sombra sobre el relieve da 44,15 m frente a 47,05 m en suelo plano a 12°: se nota el efecto del terreno (ENV-008) | Disco uniforme, sin oscurecimiento del limbo; la Tierra se dibuja llena, no en fase |
| **Regolito y brillo** (E8, E12, E15.1, E17) | Hapke calibrada en el sitio, ortofoto NAC a 0,6 m, parámetros LROC WAC (Sato 2014) | Efecto de oposición > 1,3×; energía y reciprocidad comprobadas por Monte Carlo | Albedo de 0,15 uniforme en el polo (**supuesto**); P(g) = 1; sin la corrección por rugosidad |
| **Luz devuelta** (E9, E11) | Irradiancia de 1361 W/m² a 1 UA con 1/r² (FA p. 542); luz terrestre derivada (5,86·10⁻⁵) | Un rebote calculado sobre el relieve | Tierra lambertiana (**supuesto**) |

Lo que no es físico (luz de trabajo, exposición aumentada, relieve exagerado ×10) está nombrado en el código y se ve en la interfaz (regla ENV-006).

## Recursos del reto (comprobados el 2026-11-13)
- **JPL Horizons:** https://ssd.jpl.nasa.gov/horizons/. No envía CORS, así que hay que bajar los datos con un script.
- **Quickmap:** https://quickmap.lroc.im-ldi.com/ (la dirección anterior, `quickmap.lroc.asu.edu`, se va a retirar).
  - Enlace a un punto: `?proj=27&prjExtent=x0,y0,x1,y1`, con `proj=27` en estereográfica polar sur y la ventana en metros.
  - Usa la misma proyección que `motor/demPolar.ts` (`estereoSur`): el centro cayó a unos 20 m del punto pedido.
- **Moon Trek:** https://trek.nasa.gov/moon/.
  - Enlace a un punto: `#v=0.1&x=lon&y=lat&z=9&p=urn:ogc:def:crs:EPSG::104903&b=moon&e=lonMin,latMin,lonMax,latMax`.
  - Esta proyección es equirectangular y cerca del polo sale estirada. Mosaicos WMTS: https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon
- **CSA, exploración lunar:** https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/. Es contexto, no trae datos.
- Ninguna de las dos herramientas documenta el formato de enlace; es un **supuesto** sacado de cómo se comportan hoy.

## La entrega (guías 2026)
- La entrega va del sáb 14 a las 9:00 al dom 15 a las 23:59, hora del evento local.
- La página de entrega y todo lo enlazado van en inglés.
- La demo es un video de 30 s o menos (con subtítulos en inglés) o un máximo de 7 diapositivas.
- Los enlaces deben ser públicos y sin login. Hay que listar todo recurso externo en References.
- Criterios: Impact, Creativity, Validity, Relevance y Presentation, de 1 a 5.
- La casilla de "trabajo original" exige listar en References todo lo reutilizado: código, datos y textos.
