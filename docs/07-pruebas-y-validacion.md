# 07. Pruebas y validación

Las rutas de este documento son relativas a `luna-recursos/`, la copia del prototipo luna (commit 72f890f). El registro completo de cada paso está en `luna-recursos/investigacion/SPEC.md`. La copia está reorganizada para consulta: los `import` conservan las rutas originales (`src/engine`, `src/data`) y no resuelven tal cual.

## 1. Qué responde

Este documento responde tres preguntas:

1. Qué comprueba hoy el prototipo de forma automática, y con qué tolerancia.
2. Contra qué fuente externa se validó cada cálculo, y qué número salió.
3. Qué queda sin prueba automática y cuáles son los límites de lo validado.

Sirve para portar el motor sin perder su red de pruebas y para sostener el criterio de validez ante el jurado.

Origen: las pruebas (`calculos/pruebas-validacion/`), los scripts (`calculos/scripts-de-datos/`), los metadatos de `datos/`, `investigacion/matriz-trazabilidad.md` y el SPEC. La suite se corrió el 2026-11-14 para anotar el resultado de la sección 2. Los demás números vienen del SPEC o del código, y cada uno dice de dónde.

Términos:

- **Motor:** el código de `calculos/motor/`. Calcula; no dibuja ni depende de React o three.js.
- **Paso:** cada entrega pequeña del prototipo (E1 a E26; D1 a D4 son diagnósticos). "SPEC E21" es la sección de ese paso en el SPEC.
- **Efemérides:** posición del Sol y de la Tierra en cada instante. Salen de JPL Horizons, el servicio de efemérides de NASA/JPL.
- **Horizonte real:** elevación del terreno en cada dirección (azimut) vista desde un punto, calculada con modelos de elevación (DEM o DTM). No es el horizonte plano.
- **Punto:** diferencia entre dos porcentajes. 36,6 % frente a 38,5 % son 1,9 puntos.
- **Supuesto:** valor sin fuente en la bibliografía del proyecto. Se marca así en el código y en el SPEC.
- **LM:** módulo lunar del Apollo. **RoI:** región de interés, una zona de aterrizaje candidata publicada con los DEM del polo sur.
- **ENV-003 a ENV-010:** reglas del entorno numeradas en el SPEC (sombra, tiempo, penumbra, relieve, luz reflejada, luz terrestre). **T0 a T9:** pruebas propuestas en la matriz de trazabilidad, sección 4.
- Las claves de fuente (FA, LSB, PBR, RTR, DI, SM, TN, R-695) están en [08-datos-y-fuentes.md](08-datos-y-fuentes.md).

## 2. Cómo se corren y resultado de hoy

La suite se corrió en el prototipo original, con su estructura (`tests/` y `src/`). El comando, tal como se ejecutó:

```sh
bun run test
```

El guion `test` del `package.json` del prototipo corre dos grupos, en dos procesos:

```sh
bun test tests/motor.test.ts tests/efemerides.test.ts tests/planificador.test.ts tests/catalogo.test.ts tests/descenso.test.ts tests/simulacion.test.ts \
  && LUNA_SITIO=connecting-ridge bun test tests/polo.test.ts
```

- Son dos procesos porque el motor carga los datos del sitio activo al importarse (SPEC E20). El sitio sale de la variable `LUNA_SITIO`.
- `motor.test.ts` exige el sitio Apollo 17 y se detiene si hay otro activo (línea 6). `polo.test.ts` solo corre con `LUNA_SITIO=connecting-ridge`; con otro sitio se salta (línea 9).
- **En `luna-recursos/` la suite no corre tal cual.** Los archivos de `tests/` están en `calculos/pruebas-validacion/`, pero sus `import` siguen apuntando a `../src/engine/…` y `../src/data/…` (por ejemplo `motor.test.ts:4` y `:7`). Para correrlas hay que ajustar esas rutas o restaurar la estructura original.
- Dependencias de las pruebas: el corredor de Bun (`bun:test`), `Bun.file` para leer los datos binarios, y `three` en una prueba (`DataUtils`, `motor.test.ts:381`).

Resultado del 2026-11-14 (19:00 UTC, Bun 1.2.10, commit 72f890f):

| Grupo | Archivos | Pasan | Fallan | Comprobaciones (`expect`) | Tiempo |
|---|---|---|---|---|---|
| Apollo 17 y pruebas que no dependen del sitio | 6 | 100 | 0 | 166 966 | 1492 ms |
| Polo sur (Connecting Ridge) | 1 | 13 | 0 | 8 913 | 345 ms |
| **Total** | 7 | **113** | **0** | 175 879 | 1,87 s de reloj |

Salida literal de los dos resúmenes:

```
 100 pass
 0 fail
 166966 expect() calls
Ran 100 tests across 6 files. [1492.00ms]

 13 pass
 0 fail
 8913 expect() calls
Ran 13 tests across 1 files. [345.00ms]
```

- Pruebas por archivo: `motor` 70, `efemerides` 4, `planificador` 6, `catalogo` 7, `descenso` 8, `simulacion` 5, `polo` 13.
- Coincide con el último conteo del SPEC: "100 + 13" (SPEC E26.2–E26.4).
- Hoy no se corrió el build ni el lint. El SPEC los registra sin errores al cierre de E26.

## 3. Pruebas por archivo

Todos los archivos de esta sección están en `calculos/pruebas-validacion/` y se citan por su nombre. Cada tabla trae el texto literal del `test(...)`, qué comprueba y contra qué, y la tolerancia que exige el código. "n decimales" es una comparación con `toBeCloseTo` a esa cantidad de decimales. "Línea" es la línea del archivo de prueba.

### `motor.test.ts` (70 pruebas, sitio Apollo 17)

La cabecera del archivo dice el criterio: cada prueba compara contra una fuente o una solución exacta, no contra el propio código.

| Grupo | Línea | Prueba (texto literal) | Qué comprueba y contra qué | Tolerancia |
|---|---|---|---|---|
| T0 | 59 | latitud subsolar ≤ 1,5424° + paralaje + libración física (FA p. 412: 1,5424°) | Latitud del punto subsolar en toda la tabla de Horizons, frente al máximo de FA | ≤ 1,5424° + 0,013° + 0,03° + 0,001° |
| T0 | 65 | libración: punto subterrestre \|b\| ≤ 6,7° y \|l\| ≤ ~8° (FA p. 413; LSB pp. 58–59), con paralaje | Latitud y longitud del punto subterrestre en toda la tabla, frente a la libración de FA y LSB | latitud ≤ 6,6878° + 0,3°; longitud ≤ 8° + 0,3° |
| T0 | 75 | distancia Tierra–Luna en el primer día lunar dentro de 363 100–405 700 km, ± radio lunar por ser topocéntrica (FA p. 671) | Distancia de Horizons en el primer día lunar, frente al rango medio de FA | rango ampliado en 1800 km por lado |
| T0 | 82 | diámetro de la Tierra = 2·asin(6378,137 km / ρ) (FA tabla B.2, p. 672) | Diámetro angular de Horizons frente a la fórmula | < 0,001° |
| T0 | 88 | diámetro del Sol = 2·asin(R☉/ρ) con R☉ = 695 508 km, a 0,05 % (FA tabla B.4, p. 673) | Diámetro angular de Horizons frente a la fórmula con el radio de FA | < 0,05 % |
| T0 | 94 | día solar del sitio ≈ 29,57 ± 0,02 d en noviembre (FA pp. 413, 461, 673) y dentro de 29,531 d ± 13 h (LSB p. 58) | Duración del primer día lunar de la tabla | ±0,02 d y ±13 h |
| T0 | 99 | mediodía por tránsito (FA pp. 252–254): azimut 180° y elevación 90° − φ + δ ≈ 68,442° | El mediodía del motor es el tránsito por el meridiano | azimut ±10⁻⁶°; elevación ±0,01°; minuto 2026-10-23 07:21 UTC |
| T0 | 105 | salida del disco ≈ θ / (ω·cos φ·cos δ) ≈ 67,4 min (FA p. 257) | Tiempo que tarda el disco solar en salir, medido en el motor cada 5 s | ±1,5 min |
| ENV-005 | 120 | mismo t, mismo estado exacto | El estado es función pura del tiempo | exacta |
| ENV-005 | 123 | ningún día se repite: t se limita a la tabla descargada (E7, E18) | El tiempo se recorta a los extremos de la tabla | exacta |
| ENV-003, ENV-007 | 131 | L = h/tan α: 47,046 m con α = 12° (experimento 01) | Largo de la sombra de un poste de 10 m en suelo plano | 3 decimales |
| ENV-003, ENV-007 | 134 | núcleo y penumbra: h/tan(α ± θ/2) con θ = 0,5328° (FA pp. 671, 673) | Fin del núcleo y de la penumbra frente a la fórmula; ancho de 2,152 m | 6 decimales; ancho a 2 decimales |
| ENV-003, ENV-007 | 140 | disco en el horizonte: F(−θ/2) = 0, F(0) = 0,5, F(θ/2) = 1 | Fracción visible del disco solar en tres casos exactos | exacta; 0,5 a 12 decimales |
| T9, ENV-008 | 149 | con α = 12° de mañana, la sombra mide 44,15 m sobre el relieve (47,05 m en suelo plano) | Sombra del poste sobre el relieve real del DTM de LROC | 1 decimal |
| T1 | 161 | T1 horno: L/Le = 1/(1 − ρ) dentro de una esfera (PBR p. 575) | El integrador de Monte Carlo frente a la solución exacta | 4 errores estándar; 200 000 muestras |
| T2 | 165 | T2: el hemisferio de three es exacto sobre un plano infinito (PBR pp. 191–193) | Luz que un suelo plano devuelve a una cara vertical y a una cara hacia abajo | 4 errores estándar; 400 000 muestras |
| T7, ENV-009 | 181 | la reflectancia del sitio está en el rango de mar (LSB p. 59: 7–10 %; fig. 7.10, p. 308: ≈0,08–0,09) | Albedo del Apollo 17 que usa el motor | entre 0,07 y 0,10 |
| T7, ENV-009 | 185 | Lambert: ρ_dh = albedo para cualquier dirección de entrada y ≤ 1 (PBR pp. 197, 335, 538) | Energía de la BRDF lambertiana a 0°, 45°, 78° y 85° | 10⁻⁹ |
| E9 | 198 | T6: con el centro del Sol en el horizonte, irradiancia sobre el suelo = 2ρ/(3π) (PBR p. 545) | Centroide del segmento visible del disco frente a la fórmula analítica | 10⁻⁵ relativo |
| E9 | 204 | T8: fase de una esfera lambertiana, fórmula cerrada frente a Monte Carlo | Función de fase de la Tierra en cinco fases | 4 errores estándar + 10⁻⁴ |
| E9 | 212 | luz terrestre con la Tierra llena a distancia media: (2/3)·0,32·sin²(θ⊕/2) ≈ 5,86·10⁻⁵ (FA pp. 410, 542) | Luz terrestre derivada frente al valor calculado con FA | 7 decimales |
| E9 | 216 | irradiancia solar en toda la tabla dentro de 1361/r² con r = 1 ± e⊕ ± a☾(1 + e☾) (FA p. 542; tabla B.5, p. 674; tabla B.7, p. 675) | Distancia al Sol de Horizons dentro de la cota de FA, en toda la tabla | la cota, sin margen |
| E9 | 225 | irradiancia solar en el primer día lunar entre 1369 y 1396 W/m² (1361/r², FA p. 542) | Irradiancia en el primer día lunar | el código acepta de 1368 a 1396 W/m² |
| E9.1 | 238 | fase por geometría Sol–Tierra, (1 − cos θ)/2, frente a la fracción iluminada de Horizons: diferencia ≤ 0,2 % | Fase de la Tierra por geometría frente a Horizons, en toda la tabla | 0,2 puntos |
| E10, ENV-008 | 253 | la altura del sitio en SLDEM2015 coincide con LROC (−2626 m ± 3,5 m; Wagner et al. 2016) a menos de 5 m | Altura del sitio en dos productos independientes | < 5 m |
| E10, ENV-008 | 256 | al norte, el Macizo Norte forma el horizonte a 4–10 km, entre 8° y 30° (macizos de 2000–2300 m, valle de ~8 km; LSB pp. 33–34, 37) | Horizonte calculado hacia el norte frente a la descripción del valle en LSB | los rangos del nombre |
| E10, ENV-008 | 262 | salida local: el centro del Sol sobre el horizonte real, ≈ h(az)/(ω·cos φ) horas después de la astronómica (FA p. 257) | Hora de la salida local frente a la estimación con la tasa de FA | 10⁻⁴° en el cruce; ±0,25 h |
| E10, ENV-008 | 269 | antes de la salida local no llega luz solar aunque el Sol esté sobre el horizonte astronómico | Dos horas antes de la salida local: elevación positiva y luz solar 0 | exacta |
| E10, ENV-008 | 275 | la puesta local ocurre antes que la astronómica | En la puesta local el Sol sigue sobre 0° y está en el horizonte real | 10⁻⁴° |
| E11, ENV-009 | 297 | T4: en un cráter esférico, un rebote da E₁ = ρ·E⊥·sin α·sin²ψ/4 (PBR pp. 194, 577), a −12 % con parches de 8 m | Luz rebotada en el fondo en sombra de un cráter sintético (d/D = 0,2, **supuesto**) frente a la solución exacta | entre −12 % y +5 % |
| E11, ENV-009 | 310 | un suelo plano no se ilumina a sí mismo: rebote 0 (igual que el plano infinito exacto) | Rebote sobre una malla plana | exacta |
| E11, ENV-009 | 319 | sitio real con α = 12°: el rebote es > 0 en algún vértice y ninguno supera ρ·E⊥ | Cotas del rebote sobre el relieve del Apollo 17 | 0 < máximo < albedo |
| E12, ENV-009 | 329 | w calibrado: albedo normal π·r(0,0,0) = 0,085 (rango de mar 7–10 %, LSB p. 59) | Calibración del modelo de Hapke del regolito | 9 decimales |
| E12, ENV-009 | 334 | reciprocidad de Helmholtz f(l, v) = f(v, l) (RTR p. 312; PBR p. 197) | Simetría de la BRDF de Hapke | 12 decimales |
| E12, ENV-009 | 341 | energía: ρ_dh ≤ 1 en todas las incidencias (Monte Carlo, PBR pp. 538–540) | Energía a 0°, 30°, 60°, 78° y 85° | ≤ 1 y > 0,04 |
| E12, ENV-009 | 350 | con el Sol a la espalda, las pendientes se ven igual de brillantes (LSB p. 559), a diferencia de Lambert | Brillo a 0° y a 60° de pendiente con fase 0 | diferencia < 5 % |
| E12, ENV-009 | 355 | efecto de oposición: más brillo a fase 0 que a 10° con la misma geometría (LSB p. 559) | Cociente de brillo entre fase 0 y fase 10° | > 1,3 |
| E13 | 364 | todas las comprobaciones con tolerancia pasan en momentos clave (mañana, tránsito, tarde, noche) | Las filas de la tabla de verificación que ve el usuario, en cuatro instantes | la de cada fila (`calculos/motor/verificacion.ts`) |
| E13 | 371 | la gráfica del día muestra la asimetría de Fielder: con α ≈ 12°, error negativo de mañana y positivo de tarde | Signo del error al deducir una altura por su sombra (método de SM) | signo |
| E14 | 385 | conversión al marco selenográfico: normal del sitio · Sol = sin(elevación), en toda la tabla | Conversión a ejes fijos a la Luna, muestreada cada 6 h | 9 decimales |
| E14 | 393 | el punto subsolar gira hacia el oeste ~12,19°/día (rotación de 27,32 d menos el Sol aparente; FA pp. 257, 413) | Deriva del punto subsolar en un día | el código exige 12,17 ± 0,1 °/día |
| E14 | 399 | LOLA LDEM_4 en el Apollo 17 ≈ −2,63 km (LROC: −2626 m) a la resolución de 7,6 km/píxel | Altura del sitio en el relieve global frente a LROC | ±0,1 km |
| E14 | 404 | LOLA LDAM_4 en el Apollo 17 = 0,177, el valor que calibra el brillo visible del globo | Albedo del sitio en el mapa global | ±0,002 |
| E15.3 | 413 | el LM está en el origen y todos los equipos caen dentro del recorte de 400 m | Posiciones de los equipos del Apollo 17 (tabla de LROC) en metros locales | exacta |
| E15.3 | 418 | LRV a ~138 m del LM: 0,0046° E y 0,0015° S según la tabla de LROC | Distancia del rover al LM | 138,6 m a 0 decimales |
| E15.3 | 423 | medidas con fuente: LRV de LSB fig. 9.44 (p. 527) y etapa de descenso del LM de NSSDCA | Medidas del rover y del LM guardadas en el motor | 2 a 6 decimales |
| E15.1 | 437 | media 0,085 (E8) y variaciones dentro de 0,03–0,25 | Mapa de albedo derivado de la ortofoto de LROC | media a 3 decimales; rango 0,03–0,25 |
| E15.1 | 442 | el módulo lunar aparece en el centro: la anomalía más fuerte a ±20 m está a < 6 m del centro y supera 5σ | Georreferencia de la ortofoto: el LM aparece donde LROC lo ubica | > 5σ y < 6 m |
| E16 | 472 | los macizos llegan a 2000–2600 m sobre el fondo del valle (LSB pp. 33–34: 2000–2300 m) | Altura máxima del valle 3D frente a LSB | entre 2000 y 2600 m |
| E16 | 478 | el horizonte del vértice central coincide con el de E10 (cálculo independiente, 59 m frente a 125 m) a ±1,5° | Dos cálculos independientes del horizonte, en 8 azimuts | ±1,5° |
| E17 | 490 | convención de signo: c es menor en los mares que en las tierras altas (los mares retrodispersan menos, Sato et al.) | Signo del parámetro c en los datos medidos por LROC WAC | orden |
| E17 | 496 | reciprocidad y energía (ρ_dh ≤ 1 por Monte Carlo) | Simetría y energía del modelo de Hapke con parámetros medidos | 12 decimales; ≤ 1 |
| E17 | 508 | retrodispersión: más brillo a fase 0 que a 30° con la misma geometría (LSB p. 559) | Cociente de brillo entre fase 0 y fase 30° | > 1,5 |
| E17 | 512 | declarado: sin rugosidad, el albedo normal medido (~0,115) supera el 7–10 % de los mares del LSB | Deja escrita una limitación conocida del modelo medido | entre 0,10 y 0,13 |
| E18 | 523 | la tabla trae 6 días lunares; el primero empieza en la salida de E5 (2026-10-15 22:54:26 UTC) | Estructura de la tabla continua de Horizons | exacta |
| E18 | 530 | cada salida es un cruce real: elevación del centro del Sol ≈ 0° y subiendo | Límites entre días lunares | ±0,01° |
| E18 | 536 | cada día dura 29,5 ± 0,3 d (mes sinódico medio de 29,530589 d, FA cap. 11.4, p. 257; 29,531 d, LSB p. 58) | Duración de los 6 días | ±0,3 d |
| E18 | 539 | la Tierra no salta: ≤ 0,12°/h en toda la tabla, también en los límites entre días (libración, FA cap. 17.1, p. 413) | Continuidad de la Tierra entre filas y en los límites | < 0,12° por hora; < 0,001° y < 10⁻⁴ de fase a ±1 s del límite |
| E18 | 549 | el Sol avanza sin saltos: ≤ 0,6°/h (rotación de ~12,2°/d, FA pp. 257, 413) | Continuidad del Sol entre filas | < 0,6° por hora |
| E18 | 552 | la Tierra al empezar cada día lunar está en otro lugar y con otra fase (FA cap. 11.4, p. 257; cap. 17.1, p. 413) | Los días no son copias: la libración cambia de un mes a otro | > 0,5° y > 0,001 de fase |
| E18 | 563 | diaDe(t) devuelve el día correcto en los límites y al final de la tabla | Índice del día para un instante | exacta |
| E18 | 571 | en cada día: tránsito a 180°, salida y puesta locales dentro del día, y α = 12° de mañana y de tarde | Momentos de cada uno de los 6 días | azimut ±10⁻⁶°; elevación a 6 decimales |
| E19 | 590 | los pies del LM quedan con sus extremos a 9,4 m entre opuestos (NSSDCA) | Geometría del tren de aterrizaje | 9 decimales |
| E19 | 596 | plano por los pies: en un plano inclinado θ hacia un azimut dado devuelve θ, ese azimut y alabeo 0 (solución exacta) | Inclinación del LM sobre planos sintéticos | 9 decimales; azimut 10⁻⁶° |
| E19 | 609 | en el sitio del LM el apoyo es medible y coherente con la pendiente local del DTM (4,5°, E6) | Apoyo del LM sobre el relieve real | pendiente entre 2° y 7°; inclinación < 15° |
| E19 | 618 | el relieve cercano no tapa el cielo alto, pero sí el Sol bajo desde el punto más hondo del DTM (−20 m, borde norte) | Oclusión por el relieve cercano en cuatro direcciones | sí o no |
| E19 | 625 | en el Apollo 17 la Tierra está visible todo el día lunar (45–61° de elevación frente a ≤ 14,2° de horizonte, E5 y E10) | Fracción del día con la Tierra visible | exacta (1) |
| E19 | 628 | las horas de Sol en el LM coinciden con la salida y la puesta locales (E10) a ±1 h, y el Sol visible concuerda con iluminacion() | Resumen del día frente a los instantes de salida y puesta | ±1 h |
| E23 | 639 | día lunar 1 en el centro: Sol y Tierra visibles a ±0,5 puntos del resumen del motor (suelo, 1,7 m y 10 m) | El planificador frente al motor de la escena (sección 4.6) | ±0,5 puntos |
| E26.3 | 650 | en todas las horas de la tabla del sitio, el Sol y la Tierra del estado global quedan a ≤ 0,01° (E22) y la fase a ≤ 0,1 % | Estado calculado con la tabla global frente al estado por sitio; el código muestrea cada 6 h | < 0,01°; fase < 0,001 |

### `efemerides.test.ts` (4 pruebas)

La segunda prueba se repite para los dos sitios (`apollo17` y `connecting-ridge`).

| Línea | Prueba (texto literal) | Qué comprueba y contra qué | Tolerancia |
|---|---|---|---|
| 18 | la tabla cubre 2026-01-01 → 2031-01-01 cada 3 h, con vectores unitarios y distancias plausibles | Estructura de la tabla global: 14 609 filas, inicio, límites, vectores y distancias | norma ±10⁻⁶; Sol a 1 UA ± 2 %; Tierra entre 350 000 y 410 000 km (cota **supuesto**) |
| 36 | coincide con la tabla de Horizons del sitio apollo17 a ≤ 0,01° (Sol y Tierra), en diámetro, fase y distancia | Motor global frente a la consulta de Horizons hecha desde el sitio (sección 4.2) | < 0,01°; Sol < 1″; Tierra < 2″; fase < 0,1 puntos; distancia < 10⁻⁶ UA |
| 36 | coincide con la tabla de Horizons del sitio connecting-ridge a ≤ 0,01° (Sol y Tierra), en diámetro, fase y distancia | Lo mismo en el polo | las mismas |
| 58 | coincide con la serie de Horizons de 18,6 años de Connecting Ridge (E21) en todo el tramo 2026–2030 | Motor global frente a la serie larga, en las filas dentro de 2026–2030 (más de 12 000) | < 0,01° |

### `planificador.test.ts` (6 pruebas)

Punto de prueba: centro de Connecting Ridge, 30 días desde el 2027-03-01, paso de 10 minutos.

| Línea | Prueba (texto literal) | Qué comprueba y contra qué | Tolerancia |
|---|---|---|---|
| 18 | sin la parte cercana, la máscara reproduce el horizonte lejano del archivo (E20) a ≤ 0,01° | La máscara de horizonte del planificador frente al perfil guardado | < 0,01° en cada azimut |
| 22 | con la parte cercana el horizonte nunca baja, y desde 10 m nunca sube | Coherencia de la máscara con el relieve cercano y con la altura del observador | 10⁻⁴° y 10⁻⁶° |
| 29 | las ventanas suman lo mismo que el resumen (±1 paso por ventana), y la cuenta regresiva cae en sus bordes (±60 s) | Las ventanas de Sol y Tierra, el resumen y la cuenta regresiva dan lo mismo | un paso por ventana; ±60 s |
| 46 | el panel vertical da 0 sin Sol y como mucho la constante solar (1361 W/m², FA p. 542) | Cotas de la energía sobre el panel (el panel es un **supuesto**) | 0 sin Sol; ≤ 1361 W/m² |
| 53 | E25: mes a mes cubre 2026–2030 con 61 meses sinódicos, y el promedio de los meses es el del período entero (±0,5 puntos) | La vista mes a mes frente al barrido del período completo | 61 meses de 29,530589 d; ±0,5 puntos |
| 63 | E25: en Connecting Ridge la Tierra se ve más en unos meses que en otros (libración; FA p. 413), y nunca todo el mes | Variación de la Tierra visible entre meses | más de 10 puntos entre meses; siempre < 100 % |

### `catalogo.test.ts` (7 pruebas)

| Línea | Prueba (texto literal) | Qué comprueba y contra qué | Tolerancia |
|---|---|---|---|
| 40 | el centro de Connecting Ridge leído de la cabecera de PGDA coincide con el de E20 (−89,46316°, 222,5104° E) | Coordenadas del catálogo frente a las del paso E20 | 5 y 4 decimales; x, y exactos |
| 46 | la estereográfica polar ida y vuelta es exacta, y el dominio de puntos propios llega a 190 km (~83,7° S) | Proyección del mapa polar y límite de los puntos propios | 9 decimales |
| 56 | el DEM de 240 m da la altura del centro de Connecting Ridge a ±5 m del DTM de 5 m (1944,8 m, E20) | DEM del navegador frente al DTM de 5 m de PGDA | < 5 m |
| 60 | Connecting Ridge con el método del catálogo reproduce el horizonte detallado de E20: ≤ 0,05° RMS desde 1,7 m y ≤ 0,5° a ras del suelo | Horizonte del catálogo frente al horizonte detallado | 0,05° y 0,5° RMS |
| 66 | el horizonte aproximado (240 m, en el navegador) queda a ≤ 0,3° RMS del detallado desde 10 m en Connecting Ridge | Horizonte de los puntos propios frente al detallado | 0,3° RMS |
| 71 | Barker et al. (2021): a 1 m sobre el suelo, las RoI 4–6 de Connecting Ridge superan el 70 % de Sol y son las mejores del sitio | El motor reproduce una conclusión publicada sobre las zonas candidatas | cada una > 70 %; media de 4–6 mayor que la del resto |
| 87 | Tierra a ras del suelo frente a Mazarico et al. (2011) en los 26 puntos del catálogo dentro de 85° S: error medio ≤ 5 puntos | Tierra visible del motor frente a un mapa publicado | error medio < 5 puntos |

### `descenso.test.ts` (8 pruebas)

Referencia: el perfil premisión del Apollo 11 de NASA TN D-6846 (`PERFIL_APOLLO11`, `calculos/motor/descenso.ts:42`). La cabecera del archivo dice que las tolerancias se acordaron con el autor del prototipo el 2026-11-07: tiempos ±15 s, alturas y velocidades ±10 %, ΔV ±3 %.

| Línea | Prueba (texto literal) | Qué comprueba y contra qué | Tolerancia |
|---|---|---|---|
| 14 | llega al contacto sin agotar el combustible, en P66, a 12 pies y −3 pies/s | Estado final del descenso simulado | vertical ±0,3 m/s; horizontal < 0,5 m/s |
| 21 | el alcance de encendido calibrado deja la puerta alta a las 8:26 (±2 s) y queda a ±5 % de las ~260 millas náuticas de TN | Calibración del punto de encendido | ±2 s; ±5 % |
| 25 | puerta baja (512 pies) y contacto a ±15 s de TN (10:06 y 11:54) | Tiempos de dos eventos del descenso | ±15 s |
| 29 | ΔV a ±3 % (6775 pies/s) y combustible a ±3 % (16 960,9 lb, tabla II) | Cambio de velocidad y combustible usado | ±3 % |
| 33 | estados intermedios del frenado (2:56 y 4:18) y la puerta alta a ±10 % en altura y velocidad | Altura y velocidad en tres instantes | ±10 % |
| 41 | diferencia conocida (Abiertas): la recuperación del regulador llega +24 s tarde (TN 6:24); queda a ≤ 30 s | Deja escrita una diferencia que no cumple los ±15 s | ≤ 30 s |
| 45 | el empuje respeta el regulador: 10 % los primeros 26 s, después 92,5 % fijo o entre 11 % y 65 % (R-695 p. 8; TN tabla I) | Límites del empuje en todas las muestras | 6 decimales; 10⁻⁹ |
| 51 | luz del Apollo 11: Sol a 10,7° al este (Horizons), dentro de 10,9° ± 1° (TN p. 10); con la regla del Apollo la línea de vista queda por encima del Sol | Criterio de luz del descenso con el Sol real del alunizaje | ±1°; rumbo a ±5° del oeste |

### `simulacion.test.ts` (5 pruebas)

Punto de prueba: centro de Connecting Ridge, mes desde el 2027-01-01. Usa los requisitos de ejemplo (`REQUISITOS_EJEMPLO`, `calculos/motor/simulacion.ts:31`), que no vienen de una fuente.

| Línea | Prueba (texto literal) | Qué comprueba el código | Tolerancia |
|---|---|---|---|
| 15 | el encendido es el contacto menos la duración del descenso nominal (~11:50), y el rumbo deja el Sol a la espalda | Hora de encendido y rumbo de llegada | 6 decimales; 10⁻⁶° |
| 20 | el veredicto sigue a los requisitos: todo se cumple con requisitos laxos y nada de lo exigible con requisitos imposibles | Con límites laxos cumplen todos los criterios revisados (la prueba no revisa la luz de aproximación); con límites imposibles fallan combustible, noche, Tierra en la estadía e inclinación | cumple o no cumple |
| 28 | la hora sugerida tiene Sol y Tierra en el contacto, y ninguna hora del mes con ambos tiene una noche más corta | Hay una hora sugerida, y en ella el Sol y la Tierra están sobre el horizonte. La segunda parte del nombre no se comprueba (sección 7) | margen > 0 |
| 38 | el estado global coincide con cieloEn: dirección unitaria, elevación y azimut consistentes | Dirección unitaria, elevación coherente con el vector y distancia a la Tierra > 350 000 km. El azimut no se comprueba (sección 7) | 9 decimales |
| 44 | los candidatos para comparar están separados ≥ 24 h, cumplen Sol y Tierra en el contacto e incluyen la hora sugerida | Hay candidatos, están separados 24 h o más e incluyen la hora sugerida. El Sol y la Tierra de cada candidato no se comprueban (sección 7) | ≥ 24 h |

### `polo.test.ts` (13 pruebas, sitio Connecting Ridge)

| Grupo | Línea | Prueba (texto literal) | Qué comprueba y contra qué | Tolerancia |
|---|---|---|---|---|
| E20 | 20 | el sitio es el centro del mosaico de PGDA Site01 (89,46° S) y usa albedo de tierras altas (LSB p. 59, supuesto) | Coordenadas del sitio y albedo de 0,15 (**supuesto**) | 5 y 3 decimales |
| E20 | 25 | 6 días de medianoche a medianoche de 29,5 ± 0,3 d (FA cap. 11.4, p. 257); cada límite es el Sol en el antimeridiano (az 180°) | Definición del día en el polo | ±0,3 d; ±0,05° |
| E20 | 31 | el mediodía es el tránsito por el norte (az 0°) y queda ~2·colatitud sobre las medianoches del día | Mediodía polar frente a la geometría del sitio | 10⁻⁵°; ±0,15° |
| E20 | 43 | el Sol nunca se aleja más de 1,5424° + colatitud + paralaje del horizonte astronómico (FA p. 412) | Elevación del Sol en toda la tabla frente a la cota de FA | la cota, más 0,013° y 0,03° |
| E20 | 46 | la Tierra oscila alrededor del horizonte: \|elevación\| ≤ libración en latitud 6,69° + colatitud + paralaje + libración física (FA p. 413; márgenes de T0) | Elevación de la Tierra en toda la tabla frente a la cota de FA; pasa por encima y por debajo de 0° | la cota, más 0,3° y 0,03° |
| E20 | 52 | la altura del sitio coincide en dos productos LOLA independientes (5 m de PGDA y LDEM_75S_120M) a menos de 5 m | Altura del sitio en dos productos; valida la proyección | < 5 m; < 0,1 m entre archivos |
| E20 | 56 | en el polo la Tierra y el Sol se ven solo parte de cada día lunar (a diferencia del Apollo 17, con la Tierra al 100 %) | Fracción visible del Sol y la Tierra en los 6 días | entre 0 y 1, sin tocar los extremos |
| E20 | 65 | los momentos de prueba son medianoche y mediodía; α = 12° no se alcanza y devuelve el mediodía | Momentos de prueba del polo | exacta; Sol < 3° |
| E21 | 83 | la envolvente de cada rayo reproduce el horizonte a ras del suelo (≤ 0,01°) y más alto el horizonte baja | Horizonte desde cualquier altura frente al perfil a ras del suelo | < 0,01° |
| E21 | 91 | la serie de 18,6 años cada 3 h está completa (Horizons) | Largo de la serie de validación | 18,6 años a 2 decimales |
| E21 | 97 | a ras del suelo, el motor reproduce la visibilidad media de Mazarico et al. (2011) en el sitio a ±5 puntos (Sol 38,5 %, Tierra 33,9 %) | Sol y Tierra visibles del motor frente a un mapa publicado (sección 4.3) | ±5 puntos |
| E21 | 109 | subir el observador da más horas de luz (a 10 m el Sol se ve más del doble que a ras del suelo) | Efecto de la altura del observador | más del doble |
| E23 | 120 | día lunar 1 en el centro: Sol y Tierra visibles a ±0,5 puntos del resumen del motor (suelo, 1,7 m y 10 m) | El planificador frente al motor de la escena, en el polo | ±0,5 puntos |

## 4. Validaciones contra fuentes externas

### 4.1 Sol y Tierra frente a JPL Horizons

Las tablas por sitio son datos de Horizons, una fila por hora. Lo que se valida es que el motor las lee bien y que cumplen la teoría de los libros.

- **Consulta directa (SPEC E5).** El 2026-11-06 a las 00:00 UTC el motor da la Tierra a 240,143° de azimut y 60,525° de elevación, iluminada al 89,01 % y con 1,896° de diámetro; y el Sol a −67,164° con 0,5386°. El SPEC anota que coincide con la consulta directa a Horizons. Fue una comprobación manual, anterior a la suite.
- **Teoría (grupo T0).** Toda la tabla cumple las cotas de FA y LSB: latitud subsolar, libración, diámetros y duración del día.
- **Tránsito (SPEC E7).** El mediodía es el tránsito por el meridiano: 2026-10-23 07:21:18 UTC, con 68,4415° de elevación.
- **Fase de la Tierra (SPEC E9.1).** La fase calculada por geometría coincide con la fracción iluminada de Horizons a 0,2 puntos o menos, en toda la tabla.

### 4.2 Tabla fija a la Luna frente a las tablas por sitio (SPEC E22)

El planificador no usa una tabla por sitio. Usa una sola tabla con el punto subsolar y el punto sub-Tierra en ejes fijos a la Luna, y de ahí calcula la dirección desde cualquier latitud y longitud, con el paralaje del sitio. Horizons calcula lo mismo directamente desde el sitio. Son dos caminos distintos, y por eso la comparación es una validación independiente (cabecera de `efemerides.test.ts`).

| Comparación | Filas | Peor error, Sol | Peor error, Tierra |
|---|---|---|---|
| Apollo 17, 6 días lunares | 4266 | 0,0060° | 0,0065° |
| Connecting Ridge, 6 días lunares | 4267 | 0,0060° | 0,0064° |
| Connecting Ridge, serie de 18,6 años, tramo 2026–2030 | 12 137 | 0,0060° | 0,0060° |

- La prueba exige menos de 0,01°. Además: diámetro del Sol a menos de 1″, de la Tierra a menos de 2″, fase a menos de 0,1 puntos y distancia al Sol a menos de 10⁻⁶ UA (SPEC E22).
- El residuo, unos 0,006° (20″), es la aberración anual, que no se aplica. Equivale al 1 % del disco solar (SPEC E22).
- Sin correr cada fila al instante en que salió la luz, el error era de 0,07° (SPEC E22).
- El paso de 3 h se probó contra 1 h y 2 h: la diferencia es de 0,0005° o menos (SPEC E22).
- En el Apollo 17, el estado que usa la simulación coincide con el estado por sitio a menos de 0,01° (`motor.test.ts:650`).

El detalle de este cálculo está en [04-planificador.md](04-planificador.md).

### 4.3 Iluminación del polo frente a Mazarico et al. (2011) y Barker et al. (2021)

Referencia: los mapas de visibilidad media `AVGVISIB_85S_060M_201608` (Sol) y `_EARTH` (Tierra). Su definición, según la etiqueta del producto que cita el SPEC: "the percentage of timesteps where each pixel was sunlit (by any fraction of the solar disc)", con pasos horarios durante 18,6 años sobre un DEM de 60 m. El motor calcula la misma cantidad con su propia serie de Horizons: 54 349 filas, cada 3 h, durante 18,6 años desde el 2026-11-06 (SPEC E21).

Resultado en el centro de Connecting Ridge (SPEC E21):

| | Mazarico 2011 (60 m) | Motor, suelo | Motor, 1,7 m | Motor, 10 m |
|---|---|---|---|---|
| Sol (alguna parte del disco) | 38,5 % | 36,6 % (−1,9) | 49,0 % | 89,5 % |
| Tierra | 33,9 % | 30,3 % (−3,6) | 45,6 % | 58,0 % |

- La prueba exige ±5 puntos a ras del suelo (`polo.test.ts:97`).
- Los 8 píxeles vecinos del mapa de referencia van de 22 % a 54 % de Sol. La tolerancia es mucho menor que esa variación (SPEC E21).
- Sin el relieve cercano, el motor daba 60 %. En el polo, lo cercano decide (SPEC E21).

En los 26 puntos del catálogo dentro de 85° S, a ras del suelo (SPEC E24):

| Horizonte | Error medio, Sol | Error medio, Tierra |
|---|---|---|
| Catálogo (DTM de 5 m y LOLA) | 14,4 puntos | 4,3 puntos (la prueba exige menos de 5) |
| Aproximado (LOLA de 240 m) | 13,0 puntos | 3,7 puntos |

- **El Sol a ras del suelo no tiene prueba.** El SPEC lo explica: los DEM de 5 m y de 60 m difieren de verdad, porque bultos de pocos metros tapan el Sol rasante y el de 60 m los suaviza. En las RoI el de 5 m da 44–61 % y el mapa da 65–86 %. En terreno suave coinciden a cerca de 1 punto (centro de Shackleton, 11,0 frente a 11,0; Shoemaker, 33,2 frente a 34,2).
- Por eso la prueba usa la Tierra, y para el Sol usa a Barker et al. (2021), que es comparable: dicen que las RoI 4 a 6 de Connecting Ridge superan el 70 % de luz a 1 m y son las mejores del sitio. El motor, a 1 m y en 2026–2030, da 88,0 %, 85,0 % y 90,3 % (media 87,8 %), frente a 82,7 % de media en las RoI 1 a 3 y 7 (SPEC E24).
- Las pruebas del catálogo usan 4 años (2026–2030), no 18,6. En Connecting Ridge la diferencia entre ambos promedios es de 1,2 puntos o menos (cabecera de `calculos/scripts-de-datos/validar-catalogo.ts`).

### 4.4 Descenso frente al Apollo 11 (NASA TN D-6846)

El motor de descenso integra la trayectoria del LM con el guiado del Apollo (informe R-695). Las fases llevan el nombre de los programas del computador de a bordo: P63 es el frenado; P64, la aproximación al sitio; P66, el tramo final hasta el contacto. La puerta alta y la puerta baja son puntos de control del perfil. El regulador es el control de empuje del motor de descenso.

De TN D-6846 el motor solo toma el estado inicial, la puerta alta como fin de P63, el fin de P64 y la duración de P64 (cabecera de `descenso.test.ts`). Los demás eventos, el ΔV y el combustible son resultados, y se comparan (SPEC E26.1, en las unidades de la fuente):

| | Motor | TN D-6846 | Tolerancia | Cumple |
|---|---|---|---|---|
| Puerta alta | 505,7 s; 7564 pies; −148 pies/s; 506 pies/s | 8:26; 7515; −145; 506 | calibrada (±2 s) | sí |
| Puerta baja (512 pies) | 615 s | 606 s | ±15 s | sí |
| Contacto | 710 s | 714 s | ±15 s | sí |
| Estado a 2:56 | 45 468 pies; 4058 pies/s | 44 934; 4000 | ±10 % | sí |
| Estado a 4:18 | 38 216 pies; 3164 pies/s | 39 201; 3065 | ±10 % | sí |
| ΔV | 6708 pies/s | 6775 | ±3 % | sí (−1,0 %) |
| Combustible | 16 837 lb | 16 960,9 (tabla II) | ±3 % | sí (−0,7 %) |
| Alcance de encendido | 264,8 millas náuticas | unas 260 | ±5 % | sí |
| Recuperación del regulador | 408 s | 384 s | ±15 s | **no** (+24 s) |

- Por la regla del regulador (R-695 p. 8), su recuperación es el momento en que el motor deja el empuje fijo de 92,5 % y vuelve a regularse. Llega 24 s tarde. Depende del empuje final y de la inclinación de P63, que R-695 elige por búsqueda y no publica (SPEC E26.1). La prueba lo deja escrito con un límite de 30 s.
- **Luz del Apollo 11.** Horizons da el Sol a 10,70° de elevación y 88,8° de azimut en el sitio del alunizaje a las 20:17:40 UT del 1969-07-20, frente a los 10,9° nominales de TN (p. 10). La regla del Apollo da un rumbo de 268,8°: el Apollo 11 voló hacia el oeste (SPEC E26.1; `datos/luz-apollo11.json`).

El simulador se describe en [06-simulador.md](06-simulador.md).

### 4.5 Coordenadas y alturas frente a LROC y entre productos

| Qué | Valor del prototipo | Referencia | Dónde |
|---|---|---|---|
| Altura del LM del Apollo 17 en el DTM de 2 m | −2626,21 m | LROC: −2626 m ± 3,5 m | SPEC E6 |
| La misma altura en SLDEM2015 | −2628,0 m | DTM: −2626,2 m; LROC: −2626 m | SPEC E10; prueba < 5 m |
| La misma altura en el relieve global (7,6 km/píxel) | cerca de −2,63 km | LROC: −2626 m | prueba ±0,1 km |
| Posición del LM en la ortofoto | anomalía de 6,3σ a unos 4 m del centro | LROC ±3,5 m, más el registro del DTM | SPEC E15.1; prueba > 5σ y < 6 m |
| Altura del centro de Connecting Ridge | 1944,8 m (DTM de 5 m) y 1943,0 m (LOLA de 120 m) | dos productos independientes | SPEC E20; prueba < 5 m |
| La misma altura en el DEM de 240 m | a 2,3 m del DTM de 5 m | — | SPEC E24; prueba < 5 m |
| Centro de Connecting Ridge leído de la cabecera de PGDA | −89,46316°, 222,5104° E | igual al del paso E20 | `catalogo.test.ts:40` |

### 4.6 Cálculos independientes dentro del proyecto

**Planificador frente al motor de la escena (SPEC E23).** El planificador usa la tabla global y una máscara de horizonte. El motor de la escena usa las tablas por sitio, el horizonte y una marcha de rayos sobre el DTM. Tolerancia de ±0,5 puntos, en el día lunar 1 y en el centro de cada sitio:

| | Suelo | 1,7 m | 10 m |
|---|---|---|---|
| Apollo 17, Sol y Tierra | 47,73 % y 100 % (iguales) | iguales | iguales |
| Connecting Ridge, Sol | 54,05 % frente a 53,98 % | 71,50 % (igual) | 100 % (igual) |
| Connecting Ridge, Tierra | 19,56 % (igual) | 41,61 % (igual) | 55,11 % (igual) |

**Horizontes calculados por dos caminos:**

- Valle 3D del Apollo 17 (muestras cada 125 m) frente al perfil del horizonte (datos de unos 59 m): ±1,5° en 8 azimuts (SPEC E16).
- Horizonte del catálogo frente al horizonte detallado de Connecting Ridge: 0,03° RMS desde 1,7 m y 0,40° a ras del suelo (SPEC E24).
- Horizonte aproximado de 240 m frente al detallado, desde 10 m: 0,20° RMS. A ras del suelo queda unos 1,2° más bajo en promedio (SPEC E24).
- La envolvente que permite cambiar la altura del observador reproduce los perfiles a ras del suelo a 0,004° o menos (SPEC E21).

### 4.7 Soluciones exactas y Monte Carlo

El motor trae un integrador de Monte Carlo solo para verificar (`calculos/motor/montecarlo.ts`, SPEC E7).

- **Horno (T1):** dentro de una esfera, L/Le = 1/(1 − ρ) (PBR p. 575).
- **Plano infinito (T2):** la luz que devuelve un suelo plano es exacta en ese supuesto (PBR pp. 191–193).
- **Cráter esférico (T4):** el rebote en el fondo en sombra queda a −9,5 % de la solución exacta con parches de 8 m y a −5,3 % con 4 m: converge (SPEC E11).
- **Sol en el horizonte (T6) y fase lambertiana (T8):** fórmulas cerradas (SPEC E9).
- **Hapke:** reciprocidad, y energía por Monte Carlo: 0,061 a 0° y 0,137 a 85° de incidencia (SPEC E12).

El modelo físico se describe en [05-calculos.md](05-calculos.md).

### 4.8 Sombra sobre el relieve real (SPEC E6)

| Momento | Elevación del Sol | Sombra en suelo plano | Sombra sobre el relieve | Altura que se deduciría |
|---|---|---|---|---|
| Mañana | 12° | 47,05 m | 44,15 m | 9,39 m (−6 %) |
| Tarde | 11,2° | 50,66 m | 54,88 m | 10,83 m (+8 %) |
| Mañana | 5° | 114,3 m | 88,3 m | 7,72 m (−23 %) |

El poste mide 10 m. Una revisión independiente del 2026-11-06 repitió el rayo con pasos de 5 mm en lugar de 5 cm: la diferencia fue de 5 mm o menos.

### 4.9 Auditoría de la bibliografía

El 2026-11-06 se hicieron cinco revisiones independientes, una por libro, contrastadas con el código (`investigacion/matriz-trazabilidad.md`). Encontraron 7 contradicciones entre el código y los libros (C1 a C7) y una lista de citas por corregir. La sección 7 de la matriz registra las 7 como resueltas en los pasos E7 a E15, cada una con su prueba.

### 4.10 Enlaces a Quickmap y Moon Trek (plan E27, sin implementar)

Comprobación manual del 2026-11-13, con el sitio del IM-2: el centro del mapa cayó a unos 20 m del punto pedido en Quickmap y a unos 90 m en Moon Trek. El formato de los enlaces es un **supuesto**: ninguna de las dos herramientas lo documenta (SPEC, "Plan NASA Space Apps 2026").

## 5. Scripts de validación fuera de la suite

Ninguno corre con `bun run test`. Descargan datos de la red y se corren a mano. No se corrieron hoy.

| Archivo | Qué hace | Resultado que registra el SPEC |
|---|---|---|
| `calculos/scripts-de-datos/validar-iluminacion.ts` | Lee el píxel del sitio y sus vecinos en los mapas de Mazarico, y baja la serie de Horizons de 18,6 años. Escribe `datos/validacion-iluminacion-connecting-ridge.json` y `datos/serie-*-connecting-ridge.f32` | Tabla de la sección 4.3 (SPEC E21) |
| `calculos/scripts-de-datos/validar-catalogo.ts` | Lee el píxel de cada sitio del catálogo y sus 8 vecinos en los mismos mapas. Escribe `datos/validacion-catalogo.json` (26 puntos) | Error medio de la Tierra: 4,3 y 3,7 puntos (SPEC E24) |
| `calculos/scripts-de-datos/luz-apollo11.ts` | Consulta en Horizons el Sol en el sitio y la hora del alunizaje del Apollo 11. Escribe `datos/luz-apollo11.json` | Sol a 10,70° y 88,8° (SPEC E26.1) |
| `calculos/pruebas-validacion/comparar-planificador.ts` | No es una prueba: es la función que compara el planificador con el motor de la escena. La llaman `motor.test.ts:639` y `polo.test.ts:120` | Tabla de la sección 4.6 (SPEC E23) |

## 6. Lo que no cubren las pruebas automáticas

### 6.1 La prueba visual es manual

- Cada paso del SPEC trae una lista "Visual" para recorrer en el navegador. Las reglas de trabajo del prototipo (su `AGENTS.md`) dejan esa prueba a su autor (regla 7) y dicen que el agente no abre el navegador para dar algo por bueno (regla 10).
- Los pasos E1 a E6 registran la aprobación del autor; E1 y E2 dicen que fue de la prueba visual. De E7 en adelante el SPEC cierra los pasos "por pruebas" o "por build" y deja la lista escrita; no anota una aprobación visual.
- No hay capturas ni grabaciones guardadas.
- El SPEC sí anota revisiones en Chrome: en E15.6, como excepción pedida a la regla 10, y en casi todos los pasos desde E19 (carga, consola sin errores y recorridos puntuales). Son comprobaciones manuales.

### 6.2 La interfaz, la escena y los shaders

- Nada de `interfaz-referencia/` tiene prueba automática. Las pruebas cubren el motor y los datos.
- El SPEC lo dice en los pasos de representación: la acumulación temporal y la cámara de astronauta, "sin prueba automática" (E15.5 y E15.4); y los shaders, "No hay validador GLSL local; la compilación se confirma en el navegador" (D3).
- **Dos pruebas propuestas no existen.** La matriz proponía T3 (error de la luz del suelo junto a la sombra del poste) y T5 (penumbra del shader frente a una referencia). No están en la suite (`investigacion/matriz-trazabilidad.md`, sección 4).
- El shader de sombras tuvo dos revisiones independientes (SPEC E3.1 y E6). Confirmaron la matemática y dejaron hallazgos que se aplicaron: el poste se sombreaba a sí mismo, y la holgura del muestreo separaba la sombra de su base.
- El rendimiento se midió a mano, con el temporizador de GPU del navegador (SPEC D4). No hay prueba de rendimiento.
- Las reglas del prototipo piden solo el build antes de dar un paso por listo. Hacer obligatorias las pruebas quedó como decisión abierta (SPEC E7).

### 6.3 Revisión de la interfaz contra *Designing Interfaces*

La hizo un subagente independiente (otro agente de IA), con el libro, el código y capturas reales, en cuatro rondas (SPEC E26.2–E26.4):

| Ronda | Bloqueantes | Mejoras | Resultado |
|---|---|---|---|
| 1 | 4 | 8 | Faltaba Titled Sections; el panel inferior tapaba más de un tercio; el orden del asistente estaba invertido; faltaba el paso de comparar |
| 2 | 0 | 7 | Todos los patrones cumplen salvo Data Brushing (parcial) |
| 3 | 0 | 2 | Marca de criterio enfocado desactualizada y de color ambiguo |
| 4 | 0 | 0 | "Sin hallazgos pendientes": los 7 patrones cumplen |

- Los patrones pedidos fueron Center Stage, Wizard, Datatips, Dynamic Queries y Data Brushing.
- Hubo una discrepancia: el revisor propuso quitar el paso "Misión y nave" y el autor del prototipo lo mantuvo.
- Es una revisión de diseño, no una prueba con usuarios.

### 6.4 Lo que el SPEC declara sin medir o sin hacer

- El umbral de 0,1° con que se recalcula el rebote de luz mientras corre el reloj (D4).
- El error de usar el horizonte lejano medido desde el LM para todo el recorte: entre 0,1° y 0,5° a 200 m, **supuesto** (E19).
- La cámara de la ortofoto se toma al nadir, **supuesto** (E15.1).
- Una validación en el tiempo contra imágenes de LROC con fecha conocida (pendiente de E21).
- La iluminación del Apollo 17 contra un mapa publicado: ese producto no tiene mapas ecuatoriales (E21).
- El eclipse de Sol por la Tierra no se modela (SPEC, "Abiertas").

## 7. Límites conocidos de las validaciones

**De la referencia de iluminación:**

- El intervalo de 18,6 años de Mazarico no se publica; el motor usa 2026–2045. La altura del observador de la referencia tampoco se publica; se compara con la de suelo (SPEC E21).
- El mapa de referencia tiene 60 m por píxel y el motor usa 5 m. En crestas, los vecinos de 60 m del mismo mapa varían hasta 70 puntos (pico cerca de Shackleton: 17–86 %) (SPEC E24).
- El Sol y la Tierra usan semidiámetros fijos (0,266° y 0,95°), y el horizonte lejano se mide desde el centro del sitio (SPEC E21).
- El horizonte aproximado de 240 m, el de los puntos propios, puede diferir del de 5 m hasta unos 40 puntos de Sol en crestas y bordes de cráter (RoI 2 de Shackleton: 83,5 frente a 45,2 a ras del suelo). La interfaz lo advierte (SPEC E24).
- Los centros de mosaico no son puntos elegidos para aterrizar; las RoI sí (SPEC E24).

**De las efemérides:**

- Altitud 0 sobre la esfera de 1737,4 km y sin aberración anual. Fuera de 2026–2030 el motor se limita a los extremos de la tabla (SPEC E22).
- El rango de la distancia Tierra–Luna de FA (363 100–405 700 km) solo se comprueba en el primer día lunar. Horizons llega a 355 304 km en los perigeos de diciembre de 2026 a abril de 2027, y falta una fuente para acotar toda la tabla (SPEC E18 y "Abiertas").

**Del planificador:**

- El panel solar vertical que gira hacia el Sol es un **supuesto**. El barrido usa 1 UA, lo que da ±3,4 % en el año (SPEC E23).
- La noche más larga cuenta las noches cortadas por el borde del período (SPEC E23).

**Del descenso y la simulación:**

- Simplificaciones: masa puntual, Luna esférica sin rotación ni relieve, descenso en un plano, actitud instantánea y sin retardo de cálculo. El perfil del Apollo 11 se usa para cualquier sitio y fecha (SPEC E26.1).
- Las tolerancias del descenso se acordaron; no salen de una fuente. La extrapolación de 10 s del objetivo final es un **supuesto** (SPEC E26.1).
- Los límites del veredicto los pone el usuario. Las fuentes del proyecto no traen umbrales para aterrizar (SPEC E19 y "Abiertas").
- La hora sugerida es una ayuda, no una optimización de misión (SPEC E26.2–E26.4).

**Del modelo de luz:**

- Hapke con función de fase constante (**supuesto**) y sin rugosidad. El modelo con parámetros medidos da un albedo normal de 0,115, por encima del rango de los mares (SPEC E12 y E17).
- Albedo uniforme de 0,15 en el polo (**supuesto**) (SPEC E20).
- Un solo rebote de luz, sin oclusión entre parches (SPEC E11).

**Diferencias entre el nombre de una prueba y lo que comprueba** (detectadas al escribir este documento; no se corrigió nada; también están en [10-diferencias-spec-codigo.md](10-diferencias-spec-codigo.md)):

- `simulacion.test.ts:28`: el nombre dice que ninguna hora del mes tiene una noche más corta. El código no lo comprueba.
- `simulacion.test.ts:38`: el nombre dice que el estado coincide con `cieloEn` y que el azimut es consistente. El código no compara con `cieloEn` ni revisa el azimut.
- `simulacion.test.ts:44`: el nombre dice que los candidatos cumplen Sol y Tierra en el contacto. El código no lo comprueba.
- `motor.test.ts:650`: el nombre dice "todas las horas". El código muestrea cada 6 h (línea 658).
- `motor.test.ts:393`: el nombre dice 12,19 °/día. El código y el SPEC (E14) usan 12,17.
- `motor.test.ts:225`: el nombre dice 1369 W/m². El código acepta desde 1368 (línea 229).
