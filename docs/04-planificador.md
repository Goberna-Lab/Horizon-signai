# 04. El planificador de sitio y fecha (E22 a E25)

Las rutas de este documento son relativas a `luna-recursos/`, la copia del prototipo luna (commit 72f890f). El registro completo de cada paso está en `luna-recursos/investigacion/SPEC.md`. La copia está reorganizada para consulta: los `import` conservan las rutas originales (`src/engine`, `src/data`) y no resuelven tal cual.

"SPEC E23" quiere decir la sección E23 de ese archivo. Las claves de fuente (HZN, FA, LSB…) vienen de `investigacion/fuentes.md` y se resumen al final.

## 1. Qué responde

Para un lugar de la Luna y un período entre 2026 y 2030, el planificador dice:

- cuándo se ve el Sol sobre el horizonte real del lugar (energía);
- cuándo se ve la Tierra (comunicación directa, sin satélites de relevo);
- cuánto falta para que cada uno se oculte o salga;
- cómo cambian esas cifras al cambiar de sitio, de fecha o de altura del observador.

Es una vista 2D y no usa la escena 3D. Los cálculos de luz, relieve y horizonte de la escena están en [05-calculos.md](05-calculos.md); la simulación de aterrizaje, en [06-simulador.md](06-simulador.md). Origen: el reto pide ver el Sol y la Tierra respecto del horizonte en un sitio y una fecha, saber cuánto falta para que se pongan, y comparar sitios y fechas, con una lista de sitios notables y coordenadas propias (SPEC E22 a E25). Alcance aprobado el 2026-11-07: fechas de 2026 a 2030 y coordenadas propias solo dentro del polo sur (SPEC, Decisiones).

| Término | Significado en este documento |
|---|---|
| Efemérides | Tabla con la posición del Sol y de la Tierra en el tiempo. Aquí salen de JPL Horizons (HZN) |
| Azimut y elevación | Dirección de un cuerpo en el cielo del lugar. Azimut: desde el norte hacia el este, de 0° a 360°. Elevación: ángulo sobre el plano horizontal |
| Horizonte real | Elevación hasta la que el relieve tapa el cielo en cada azimut. Lo ponen el terreno y la curvatura de la Luna |
| Máscara de horizonte | Datos por azimut con los que se calcula el horizonte real desde cualquier altura del observador |
| Ventana | Intervalo continuo en que el Sol o la Tierra están visibles |
| Mes sinódico | 29,530589 d (FA cap. 11.4, p. 257). Es el día lunar promedio (LSB p. 58 da 29,531 d) |
| DEM, DTM | Modelo digital de elevación del terreno |
| LOLA | Altímetro láser del orbitador LRO. De sus datos salen los DEM usados |
| PGDA | Archivo de geodesia planetaria de NASA GSFC. Publica los DTM de 5 m del polo sur (Barker et al. 2021) |
| RoI | Región de interés: zona de aterrizaje candidata dentro de un sitio (Barker et al. 2021) |

## 2. Qué ve y qué puede hacer quien planifica

Interfaz: `interfaz-referencia/ui/Planificador.tsx`, `Comparacion.tsx`, `MapaPolar.tsx` y `lugares.ts`, en la misma carpeta. El cálculo es del motor; la interfaz solo dibuja.

| Elemento | Qué muestra o permite |
|---|---|
| Escenario | Lugar (por grupos), inicio en UTC (2026 a 2030), período (7 días, 1 día lunar o 90 días) y altura del observador (suelo, 1,7 m o 10 m) |
| Tarjetas del instante | Sol y Tierra: visible u oculto, elevación, altura sobre el horizonte, azimut y fase de la Tierra. Cuenta regresiva: "Se oculta en…" o "Sale en…", con la fecha. Energía del panel en W/m², parte del disco solar visible y distancia al Sol |
| Ventanas en el período | Línea de tiempo con tres filas: Sol (con la curva de energía), Tierra y ambos. Clic o arrastre elige el instante |
| Cielo y horizonte | Panorámica de 360° centrada en el meridiano hacia el ecuador, con el horizonte real desde la altura elegida y las trayectorias del Sol y de la Tierra en el período. La escala vertical está exagerada y los discos no están a escala; la nota en pantalla lo dice |
| Resumen del período | Seis cifras: Sol visible, Tierra visible, los dos a la vez, noche más larga, silencio más largo y panel medio |
| Comparar escenarios | "+ Agregar a la comparación" guarda el escenario actual (lugar, inicio, período, altura), hasta 6. Tabla con las seis cifras y la mejor de cada columna en verde. Líneas de tiempo alineadas desde el inicio de cada escenario. Clic en un escenario lo carga arriba |
| Mismo lugar, mes siguiente | Corre el inicio un mes sinódico |
| Mes a mes, 2026–2030 | Para el lugar y la altura elegidos: Sol y Tierra visibles y noche más larga en cada uno de los 61 meses sinódicos. Clic en un mes lo carga arriba |
| Punto propio | Por latitud y longitud, o con clic en el mapa polar. Solo dentro de 190 km del polo sur (~83,7° S) |
| Paso al 3D | "Simular aterrizaje en 3D aquí" y un botón "3D" por escenario. Solo aparecen en los dos sitios con escena 3D (ver [06-simulador.md](06-simulador.md)) |
| Cómo se calcula | Las definiciones de la sección 4, escritas en pantalla |

### Lugares disponibles

Lista: `LUGARES` en `interfaz-referencia/ui/lugares.ts`, armada con `SITIOS` (`calculos/motor/sitio.ts`) y `datos/catalogo-polo.json`.

| Grupo en el selector | Cantidad | Horizonte |
|---|---|---|
| Sitios con escena 3D | 2: Apollo 17 (Taurus-Littrow) y Connecting Ridge | Detallado |
| Zonas de aterrizaje candidatas (RoI; Barker et al. 2021) | 17: Connecting Ridge 7, borde de Shackleton 4, borde de de Gerlache 4, pico cerca de Shackleton 2 | Detallado |
| Sitios del polo sur (centro del mosaico de PGDA) | 9: borde de Shackleton, borde de Nobile 1 y 2, pico cerca de Shackleton, borde de de Gerlache, meseta Leibnitz Beta, macizo Malapert, Haworth y Shoemaker | Detallado |
| Misiones | 1: IM-2 Athena (CLPS), 84,7906° S, 29,1957° E | Aproximado |
| Puntos propios | El que elija el usuario | Aproximado |

- Los nombres de los sitios coinciden con regiones candidatas de Artemis III, pero el punto es el centro del mosaico de PGDA, no el de la región de NASA (SPEC E24; nota de procedencia de `datos/catalogo-polo.json`).
- Un lugar con horizonte aproximado muestra un aviso amarillo en pantalla (`interfaz-referencia/ui/Planificador.tsx:205`).
- Las coordenadas de IM-2 vienen, según el propio catálogo, de Wikipedia ("IM-2"). El catálogo anota además el blanco publicado por LROC: 84,78° S, 29,13° E. Esta fuente no está en `investigacion/fuentes.md`.

## 3. Cómo calcula

```
1. datos/efemerides-luna.f32        -> crearTablaLuna -> TablaLuna
2. latitud y longitud               -> prepararSitio  -> SitioLuna
3. archivo de horizonte o DEM polar -> Mascara -> perfilDesde(altura) -> PerfilHorizonte
4. SitioLuna + PerfilHorizonte      =  PuntoPlan
5. TablaLuna + PuntoPlan + período  -> barrer -> Barrido
6. Barrido                          -> ventanas (intervalos visibles)
                                    -> resumir  (cifras del período)
7. TablaLuna + PuntoPlan + instante -> proximoCambio (cuenta regresiva)
```

### 3.1 Tabla de efemérides (E22)

- **Qué guarda.** Cada 3 h, del 2026-01-01 al 2031-01-01: el punto subsolar (el punto de la Luna que tiene el Sol en el cenit) y el punto sub-Tierra, como vectores unitarios en ejes fijos a la Luna (MOON_ME), más la distancia a cada cuerpo en km. Son 14 609 filas de 8 valores Float32, 457 KB. Columnas: `solX, solY, solZ, solKm, tierraX, tierraY, tierraZ, tierraKm` (`datos/efemerides-luna.json`).
- **De dónde sale.** JPL Horizons, efemérides DE441 (HZN). Objetivo: la Luna. Observador: el centro del Sol y el centro de la Tierra. Cantidades 14 (punto sub-observador), 20 (distancia) y 21 (tiempo de luz). El `.json` guarda las consultas exactas y la fecha (SPEC E22).
- **Corrección.** Cada fila se corre a t − tiempo de luz (8,3 min para el Sol) y se vuelve a muestrear. Sin eso el error era de 0,07° (SPEC E22).
- **Por qué una sola tabla.** La API de Horizons no envía cabeceras CORS (comprobado el 2026-11-07), así que el navegador no puede consultarla. Una tabla por sitio no sirve para coordenadas propias (SPEC E22).
- **Código.** La genera `calculos/scripts-de-datos/efemerides-luna.ts`. `crearTablaLuna(buffer, meta)`, en `calculos/motor/efemeridesLuna.ts`, comprueba el tamaño y devuelve una `TablaLuna`.

### 3.2 Dirección del Sol y de la Tierra desde un lugar

Archivo: `calculos/motor/efemeridesLuna.ts`.

- `prepararSitio(latitud, longitudEste)` devuelve un `SitioLuna`: la posición sobre la esfera de 1737,4 km (altitud 0) y los ejes locales este, norte y arriba.
- Para un instante se interpola la tabla (lineal; el vector unitario se vuelve a normalizar), se resta la posición del sitio al vector del cuerpo y el resultado se proyecta en los ejes locales. Esa resta incluye el paralaje: hasta ~0,26° para la Tierra (SPEC E22).
- `cieloEn(tabla, sitio, ms)` devuelve, para el Sol y la Tierra: azimut, elevación, dirección en ejes de la escena (+X este, +Y arriba, −Z norte), distancia y diámetro angular. Además, la distancia al Sol en UA y la fase de la Tierra.
  - Diámetros: radio del Sol de 695 508 km (FA tabla B.4, p. 673) y radio ecuatorial de la Tierra de 6378,137 km (cabecera de Horizons). 1 UA = 149 597 870,7 km (FA p. 671).
  - Fase: fracción iluminada, (1 + cos φ)/2, con φ el ángulo en la Tierra entre el Sol y el sitio.
- `elevacionesEn(tabla, sitio, ms, salida)` da solo azimut y elevación de los dos cuerpos, sin crear objetos. Es la que usan los barridos.
- Fuera de 2026–2030 el motor se limita a los extremos de la tabla.

### 3.3 Máscara de horizonte del lugar

Tipo `Mascara` (`calculos/motor/mascara.ts`). Por cada azimut, cada 0,5° (720 rayos), guarda la envolvente convexa superior del perfil del terreno a lo largo del rayo. Cada vértice es (x, y): distancia horizontal al observador y altura respecto del suelo bajo él, en metros, con la curvatura de la Luna incluida.

Para un observador a altura H, el horizonte en ese azimut es el máximo de atan2(y − H, x), y ese máximo siempre cae en un vértice de la envolvente. Por eso una sola máscara sirve para cualquier altura (SPEC E21; `envolventeSuperior`).

| Lugar | De qué relieve sale | Dónde se calcula |
|---|---|---|
| Los 2 sitios con escena 3D | Horizonte lejano del sitio (Apollo 17: SLDEM2015; Connecting Ridge: LOLA de 5 m de PGDA y `LDEM_75S_120M` hasta 150 km) más el cercano del DTM de 2 m: rayos cada 0,5° con pasos de 1 m hasta el borde del recorte (SPEC E23) | Precalculada en `datos/horizonte-<sitio>.json`. `mascaraDeArchivo` une la parte lejana (`envolvente`) y la cercana (`envolventeCercana`) |
| Centros y RoI del catálogo (26) | DTM de 5 m de PGDA hasta 4 km; LOLA de 240 m hasta 30 km y de 960 m hasta 150 km. Marcha de rayos por círculo máximo con la esfera exacta de 1737,4 km | Precalculada en `datos/horizonte-catalogo-<id>.json` por `calculos/scripts-de-datos/catalogo-horizontes.ts`. Se baja solo al elegir el sitio |
| IM-2 y puntos propios | LOLA `LDEM_75S_240M`: pasos de 120 m hasta 6 km, de 240 m hasta 30 km y de 960 m hasta 150 km (720 rayos × ~275 pasos) | En el navegador, con `mascaraPolar(dem, latitud, longitud)` de `calculos/motor/demPolar.ts`: ~20 ms (SPEC E24) |

Para los puntos propios, `crearDemPolar` arma dos rejillas Int16 en proyección estereográfica polar sur: 240 m hasta 195 km del polo (5,3 MB) y 960 m hasta 340 km (1,0 MB). `dentroDelDominio` acepta puntos hasta 190 km del polo. Los datos se bajan solo si hacen falta (`cargarDemPolar` en `interfaz-referencia/ui/lugares.ts`).

### 3.4 Perfil desde la altura del observador

- `perfilDesde(mascara, alturaM)` devuelve un `PerfilHorizonte`: la elevación del horizonte en cada azimut para esa altura. El ojo va al menos a 1 cm del suelo.
- `horizonteEn(perfil, azimut)` interpola entre azimuts vecinos.
- Alturas que ofrece la interfaz: suelo, 1,7 m (astronauta, **supuesto**) y 10 m (mástil, **supuesto**). Constante `ALTURAS_OBSERVADOR_M` de `calculos/motor/evaluacion.ts`.
- Un lugar listo para calcular es un `PuntoPlan`: `{ sitio, perfil }`.

### 3.5 Barrido en el tiempo

`barrer(tabla, punto, desdeMs, hastaMs, pasoMs)`, en `calculos/motor/planificador.ts`, recorre el período y devuelve un `Barrido` con un arreglo por magnitud:

```
solSobreHorizonte    = elevación del Sol − horizonte en su azimut
solFraccion          = fraccionDiscoVisible(solSobreHorizonte, 2 × 0,266°)
tierraSobreHorizonte = elevación de la Tierra − horizonte en su azimut
panelWm2             = 1361 × solFraccion × max(0, cos(elevación del Sol))
```

- Paso: 10 min en el planificador y en la comparación; 30 min en la vista mes a mes.
- `fraccionDiscoVisible` (`calculos/motor/environment.ts`) es el área de un segmento circular. Con t = e / (θ/2): F = 1/2 + (asin t + t·√(1 − t²))/π si |t| < 1; 0 por debajo y 1 por encima. Supone un disco de brillo uniforme.
- Costo: 30 días cada 10 min son 4320 muestras, ~2 ms (comentario del código). En el navegador, 90 días se recalculan en ~50 ms (SPEC E23).

### 3.6 Ventanas, resumen y cuenta regresiva

- `ventanas(barrido, cuerpo)` devuelve los intervalos visibles, con `cuerpo` igual a `'sol'` o `'tierra'`. El borde de cada ventana se interpola entre dos muestras, donde el margen de visibilidad cruza cero. Una ventana que sigue abierta al final termina en la última muestra.
- `resumir(barrido)` devuelve un `ResumenPlan` con las cifras de la sección 4.
- `proximoCambio(tabla, punto, ms, cuerpo, limiteMs)` dice si el cuerpo está visible en `ms` y cuándo cambia. Avanza cada 10 min y, al primer cambio, afina por bisección hasta 1 s. Si no hay cambio antes del límite devuelve `cambioMs: null`. La interfaz pone el límite 60 días después del fin del período (`interfaz-referencia/ui/Planificador.tsx:217`).
- `cieloDelPunto(tabla, punto, ms)` arma las tarjetas del instante. Aquí la fracción del disco usa el diámetro real del Sol, y el panel, la distancia real: 1361 / r² con r en UA.

### 3.7 Comparación y mes a mes (E25)

- Cada escenario es `{ lugar, inicio, dias, altura }`. Para cada uno, `interfaz-referencia/ui/Comparacion.tsx` repite la cadena: máscara, perfil, `barrer` cada 10 min, `resumir` y `ventanas`.
- Mejor cifra de cada columna: la mayor en Sol visible, Tierra visible, Sol y Tierra, y Panel medio; la menor en Noche más larga y Silencio más largo.
- `porMeses(tabla, punto, desdeMs, hastaMs)` corta 2026–2030 en 61 meses sinódicos y resume cada uno con un barrido de 30 min: 87 000 instantes (SPEC E25).

## 4. Definiciones que usa el código

Todas están en `calculos/motor/planificador.ts`.

| Término | Definición exacta | Unidad |
|---|---|---|
| Sol visible | Alguna parte del disco sobre el horizonte real: `solSobreHorizonte + 0,266° > 0`. Es la definición de los mapas de Mazarico et al. (2011) (SPEC E21, E23). En el barrido el semidiámetro es fijo, 0,266° | sí o no |
| Tierra visible | El centro del disco sobre el horizonte real: `tierraSobreHorizonte > 0` (SPEC E23) | sí o no |
| Fracción con Sol, con Tierra, con ambos | Muestras en que se cumple, divididas entre el total de muestras del período | 0 a 1; en pantalla, % |
| Horas de Sol | Muestras con Sol visible por el paso | h |
| Noche más larga | Mayor racha seguida de muestras sin Sol visible, por el paso. Es lo que debe aguantar la batería | h |
| Silencio más largo | Mayor racha seguida sin Tierra visible, por el paso | h |
| Panel (instante) | Irradiancia sobre un panel vertical que gira en azimut para mirar al Sol: 1361 W/m² (FA cap. 20.4, p. 542) × fracción del disco visible × cos(elevación) | W/m² |
| Panel medio | Promedio de la irradiancia del panel en todas las muestras del período. Las muestras sin Sol cuentan como 0 | W/m² |

El panel vertical es un **supuesto**: es la disposición habitual cerca del polo, donde el Sol va casi rasante, pero cada misión tiene la suya (SPEC E23).

## 5. Precisión y validación

### Efemérides (SPEC E22)

Prueba: `calculos/pruebas-validacion/efemerides.test.ts`. Se compara contra Horizons consultado para cada sitio, que es un cálculo independiente.

| Comparación | Filas | Peor error, Sol | Peor error, Tierra |
|---|---|---|---|
| Apollo 17, 6 días lunares | 4266 | 0,0060° | 0,0065° |
| Connecting Ridge, 6 días lunares | 4267 | 0,0060° | 0,0064° |
| Connecting Ridge, serie de 18,6 años, tramo 2026–2030 | 12 137 | 0,0060° | 0,0060° |

- La prueba exige ≤ 0,01°. También: diámetro del Sol a < 1″, de la Tierra a < 2″, fase a < 0,1 % y distancia al Sol a < 10⁻⁶ UA.
- El residuo de ~0,006° (20″) es la aberración anual, que no se aplica. Equivale al 1 % del disco solar.
- Paso de 3 h frente a 1 h y 2 h: la diferencia es ≤ 0,0005°.

### Planificador frente al motor de la escena 3D (SPEC E23)

Son dos cálculos independientes: tabla global con máscara, frente a tablas por sitio con horizonte y marcha de rayos sobre el DTM. Día lunar 1, centro del sitio, tolerancia de ±0,5 puntos (`calculos/pruebas-validacion/comparar-planificador.ts`).

| | Suelo | 1,7 m | 10 m |
|---|---|---|---|
| Apollo 17, Sol · Tierra | 47,73 % · 100 % (iguales) | iguales | iguales |
| Connecting Ridge, Sol | 54,05 % frente a 53,98 % | 71,50 % (igual) | 100 % (igual) |
| Connecting Ridge, Tierra | 19,56 % (igual) | 41,61 % (igual) | 55,11 % (igual) |

Esta comparación cuenta el Sol por el centro del disco, que es el criterio del motor de la escena (`calculos/pruebas-validacion/comparar-planificador.ts:21`).

### Coherencia interna (SPEC E23 y E25)

`calculos/pruebas-validacion/planificador.test.ts`, 6 pruebas:

- Sin la parte cercana, la máscara reproduce el horizonte del archivo a ≤ 0,01°.
- La parte cercana nunca baja el horizonte, y desde 10 m el horizonte nunca sube.
- Las ventanas suman lo mismo que el resumen, y la cuenta regresiva cae en el borde de la ventana a ±60 s.
- El panel va de 0 a 1361 W/m².
- Son 61 meses de 29,530589 d y su promedio es el del período entero a ±0,5 puntos.
- En Connecting Ridge la Tierra varía más de 10 puntos entre meses (libración, FA p. 413) y nunca se ve el mes entero.

### Catálogo y puntos propios (SPEC E24)

`calculos/pruebas-validacion/catalogo.test.ts`, 7 pruebas:

- El centro de Connecting Ridge leído de la cabecera de PGDA coincide con el de E20: 89,46316° S, 222,5104° E.
- La proyección estereográfica de ida y vuelta es exacta.
- El DEM de 240 m da la altura de ese centro a 2,3 m del DTM de 5 m (la prueba pide ±5 m).
- El método del catálogo frente al horizonte detallado de Connecting Ridge: 0,03° RMS desde 1,7 m y 0,40° a ras del suelo.
- El horizonte aproximado (240 m) frente al detallado, desde 10 m: 0,20° RMS. A ras del suelo queda ~1,2° más bajo en promedio.
- Barker et al. (2021) dicen que las RoI 4 a 6 de Connecting Ridge superan el 70 % de luz a 1 m y son las mejores del sitio. El motor, a 1 m y en 2026–2030, da 88,0 %, 85,0 % y 90,3 % (media 87,8 %), frente a 82,7 % de media en las RoI 1 a 3 y 7.
- Mazarico et al. (2011), 26 puntos dentro de 85° S, a ras del suelo:

| Horizonte | Error medio, Sol | Error medio, Tierra |
|---|---|---|
| Catálogo (5 m + LOLA) | 14,4 puntos | 4,3 puntos (la prueba pide ≤ 5) |
| Aproximado (240 m) | 13,0 puntos | 3,7 puntos |

- El error del Sol a ras del suelo es real y tiene causa. El DEM de 5 m ve bultos de pocos metros que tapan el Sol rasante; el de 60 m de Mazarico los suaviza. En terreno suave los dos coinciden a ~1 punto (centro de Shackleton: 11,0 frente a 11,0). Los píxeles vecinos del mapa de 60 m varían hasta 70 puntos. Por eso la prueba usa la Tierra y la referencia de Barker a 1 m (SPEC E24).
- Para compararse con esos mapas, la prueba cuenta la Tierra como "alguna parte del disco" (`calculos/pruebas-validacion/catalogo.test.ts:31`). El planificador la cuenta por su centro.

### Ejemplos registrados en el SPEC

- Connecting Ridge, 2026-12-01, 1 día lunar, a ras del suelo: el Sol está oculto y sale en 3 d 08 h (2026-12-04 08:51 UTC); la Tierra está oculta y sale en 17 d 08 h. Resumen: Sol 56,8 %, Tierra 19,9 %, ambos 9,4 % (SPEC E23).
- Connecting Ridge · RoI 6, 2026-12-01, a ras del suelo: Sol el 100 % del mes (SPEC E24).
- Apollo 17: Tierra visible el 100 % del tiempo y "sin cambios en los próximos 60 días" (SPEC E23).

## 6. Interfaz del motor

Todo es TypeScript puro, sin React ni three. Los datos entran como argumentos.

| Función | Archivo en `calculos/motor/` | Qué hace |
|---|---|---|
| `crearTablaLuna(buffer, meta)` → `TablaLuna` | `efemeridesLuna.ts` | Arma la tabla global desde el binario y sus metadatos |
| `dentroDeTabla(tabla, ms)` → booleano | `efemeridesLuna.ts` | Dice si el instante cae en 2026–2030 |
| `prepararSitio(latitud, longitudEste)` → `SitioLuna` | `efemeridesLuna.ts` | Posición y ejes locales del lugar |
| `cieloEn(tabla, sitio, ms)` → `CieloLuna` | `efemeridesLuna.ts` | Sol y Tierra completos en un instante |
| `elevacionesEn(tabla, sitio, ms, salida)` | `efemeridesLuna.ts` | Solo azimut y elevación, para barridos |
| `mascaraDeArchivo(archivo, fuente)` → `Mascara` | `mascara.ts` | Une el horizonte lejano y el cercano de un archivo |
| `perfilDesde(mascara, alturaM)` → `PerfilHorizonte` | `mascara.ts` | Horizonte por azimut desde una altura |
| `horizonteEn(perfil, azimut)` → grados | `mascara.ts` | Horizonte en un azimut, interpolado |
| `envolventeSuperior(puntos)` → `[x0, y0, x1, y1, …]` | `mascara.ts` | Envolvente convexa superior de un rayo |
| `crearDemPolar(cerca, lejos, meta)` → `DemPolar` | `demPolar.ts` | Arma las dos rejillas del polo |
| `estereoSur(lat, lon)` y `desdeEstereoSur(x, y)` | `demPolar.ts` | Proyección estereográfica polar sur y su inversa |
| `alturaPolar(dem, x, y)` → metros | `demPolar.ts` | Altura del relieve, bilineal |
| `dentroDelDominio(lat, lon)` → booleano | `demPolar.ts` | Punto dentro de 190 km del polo |
| `mascaraPolar(dem, lat, lon)` → `Mascara` | `demPolar.ts` | Máscara de un punto propio |
| `barrer(tabla, punto, desdeMs, hastaMs, pasoMs)` → `Barrido` | `planificador.ts` | Sol, Tierra y panel en cada muestra |
| `margenSol(x)` y `margenTierra(x)` → grados | `planificador.ts` | Margen de visibilidad: mayor que 0 es visible |
| `ventanas(barrido, cuerpo)` → `Ventana[]` | `planificador.ts` | Intervalos visibles |
| `resumir(barrido)` → `ResumenPlan` | `planificador.ts` | Las cifras del período |
| `proximoCambio(tabla, punto, ms, cuerpo, limiteMs)` → `Cambio` | `planificador.ts` | Estado actual y próxima puesta o salida |
| `cieloDelPunto(tabla, punto, ms)` | `planificador.ts` | Cielo, horizonte y panel en un instante |
| `porMeses(tabla, punto, desdeMs, hastaMs)` | `planificador.ts` | Resumen por mes sinódico |

Notas para portar:

- La carga de datos no está en el motor. Está en `interfaz-referencia/ui/lugares.ts` y `Planificador.tsx`, y usa funciones de Vite (`?url`, `import.meta.glob`) y `fetch`.
- `calculos/motor/horizonte.ts` no participa en el planificador. Es el horizonte del sitio activo para la escena 3D y carga sus datos al importarse.
- `calculos/motor/sitio.ts` lee `?sitio=` de la página al importarse. El planificador solo usa de él la lista `SITIOS`.
- `Planificador.tsx` toma `ALTURAS_OBSERVADOR_M` de `calculos/motor/evaluacion.ts`, que importa los módulos de la escena. Al portar conviene copiar la constante.

## 7. Datos que consume

Todos están en `datos/`. Los scripts se corren a mano con Bun (`bun run …`, según su cabecera). Varios leen datos públicos por la red: JPL Horizons, PGDA y PDS.

| Archivo | Contenido | Lo genera (`calculos/scripts-de-datos/`) |
|---|---|---|
| `efemerides-luna.f32` y `.json` | Tabla global de E22 (457 KB) con su procedencia y consultas | `efemerides-luna.ts` |
| `horizonte-apollo17.json`, `horizonte-connecting-ridge.json` | Horizonte lejano y cercano de los dos sitios con escena 3D | `horizonte.ts` y `polo-lola.ts` para la parte lejana (según `investigacion/fuentes.md`); `horizonte-cercano.ts` para la cercana |
| `catalogo-polo.json` | 28 lugares con coordenadas y fuente: 10 centros de mosaico, 17 RoI e IM-2 | `catalogo-polo.ts` |
| `horizonte-catalogo-<id>.json` | 27 máscaras de centros y RoI (3,3 MB en total) | `catalogo-horizontes.ts` |
| `dem-polo-240m.i16`, `dem-polo-960m.i16`, `dem-polo.json` | DEM polar para puntos propios (5,3 MB y 1,0 MB) y sus metadatos | `dem-polo.ts` |
| `validacion-catalogo.json` | Píxeles de los mapas de Mazarico para 26 puntos. Solo lo usan las pruebas | `validar-catalogo.ts` |
| `efemerides-<sitio>.json`, `serie-sol-…` y `serie-tierra-connecting-ridge.f32` | Tablas de Horizons por sitio. Son la referencia independiente de las pruebas, y la escena 3D usa las de cada sitio | Pasos anteriores (SPEC E5, E18, E20, E21) |

## 8. Simplificaciones, límites y pendientes

Simplificaciones declaradas:

- El sitio está a altitud 0 sobre la esfera de 1737,4 km. Cinco kilómetros de relieve cambian la dirección de la Tierra en menos de 0,001° (SPEC E22).
- No se aplica la aberración anual: ~0,006° (SPEC E22).
- No hay atmósfera, así que no hay refracción: el horizonte lo ponen el relieve y la curvatura (texto "Cómo se calcula" de la interfaz).
- En el barrido el Sol tiene un semidiámetro fijo de 0,266° y la energía se calcula a 1 UA. La distancia real la cambia ±3,4 % en el año. La tarjeta del instante sí usa la distancia real (SPEC E23).
- El disco solar tiene brillo uniforme.
- La Tierra cuenta por su centro, no por su disco.
- El panel vertical que sigue al Sol es un **supuesto**.

Límites:

- Solo hay fechas de 2026 a 2030, y las horas van en UTC.
- Los puntos propios existen solo dentro de 190 km del polo sur y su horizonte es aproximado: a 240 m por píxel no aparece el relieve de menos de ~500 m. A ras del suelo o a 1 m puede diferir hasta ~40 puntos de Sol del DTM de 5 m en crestas y bordes de cráter. Ejemplo: Shackleton RoI 2, 83,5 % frente a 45,2 % (SPEC E24). La interfaz lo advierte y recomienda decidir con un sitio del catálogo.
- IM-2 también usa el horizonte aproximado, porque no tiene DTM de 5 m.
- Los centros de mosaico no son puntos elegidos para aterrizar. El de Shackleton cae en la pared interior, con 11 % de Sol. Las RoI sí lo son (SPEC E24).
- La noche más larga cuenta las noches cortadas por el borde del período (SPEC E23).
- Los escenarios de la comparación viven en memoria: se pierden al recargar y no se pueden exportar (SPEC E25).
- El paso a la escena 3D existe solo en dos sitios (`calculos/motor/sitio.ts:5`).

Pendientes anotados en el SPEC:

- Guardar los escenarios entre sesiones y exportar la tabla en CSV para el equipo de misión (E25).
- Regiones oficiales de Artemis III: la capa de Moon Trek no tiene descarga directa (E24).
- Un DEM fino por teselas para que los puntos propios sean más precisos (E24).
- La altura del observador de Mazarico no se publica. Para validar más fino haría falta su DEM de 60 m (E24).
- Aplicar la aberración anual si se necesitara precisión de segundos de arco. La escena 3D sigue usando las tablas por sitio, que coinciden con la global a 0,006° (E22).

## Fuentes citadas

| Clave | Fuente |
|---|---|
| HZN | NASA/JPL Horizons On-Line Ephemeris System, efemérides DE441 |
| FA | Wakker, *Fundamentals of Astrodynamics*, TU Delft, 2015 |
| LSB | Heiken, Vaniman y French (eds.), *Lunar Sourcebook*, Cambridge University Press, 1991 |
| Mazarico et al. (2011) | "Illumination conditions of the lunar polar regions using LOLA topography", Icarus 211, 1066–1081 |
| Barker et al. (2021) | "Improved LOLA Elevation Maps for South Pole Landing Sites", Planet. Space Sci. 203, 105119. DTM de 5 m de PGDA |
| LOLA | LRO LOLA GDR polar, `LDEM_75S_240M` y `LDEM_75S_120M` (PDS Geosciences Node) |
| SLDEM2015 | LRO LOLA + SELENE TC (PDS Geosciences Node) |

El registro completo, con enlaces y archivos, está en `investigacion/fuentes.md`.
