# 05. Los cálculos del motor: modelo físico y verificación (E1 a E21)

Las rutas de este documento son relativas a `luna-recursos/`, la copia del prototipo luna (commit 72f890f). El registro completo de cada paso está en `luna-recursos/investigacion/SPEC.md`. La copia está reorganizada para consulta: los `import` conservan las rutas originales (`src/engine`, `src/data`) y no resuelven tal cual.

## 1. Qué responde este documento

Explica cómo calcula luna dónde están el Sol y la Tierra vistos desde un sitio de la Luna, cuánta luz llega al suelo, qué sombra deja el relieve y en qué condiciones queda un punto de aterrizaje. Para cada cálculo da el método, las constantes con su fuente, cómo se comprobó y qué se simplificó. Cubre los pasos E1 a E21 y D1 a D4 del spec ("SPEC E9" remite a esa sección).

Quedan fuera, con su propio documento:

- El planificador de sitio y fecha (E22–E25): [04-planificador.md](04-planificador.md).
- El descenso y la simulación de aterrizaje (E26): [06-simulador.md](06-simulador.md).

**Origen.** El primer experimento (`investigacion/experimentos/01-entorno-lunar.md`) pedía un suelo plano, un Sol simplificado y una prueba: un obstáculo de 10 m con el Sol a 12° deja una sombra de 47,0 m. Cada paso posterior reemplazó una simplificación por datos con fuente.

**Método de trabajo.** "Una regla física, una implementación pequeña, una prueba verificable" (SPEC, introducción). Cada regla cita su fuente, lo que no tiene fuente se marca **supuesto**, y las simplificaciones se dicen en el código y en la interfaz.

**Claves de fuente** (registro completo en `investigacion/fuentes.md`):

| Clave | Fuente |
|---|---|
| LSB | Heiken, Vaniman y French (eds.), *Lunar Sourcebook*, Cambridge University Press, 1991 |
| FA | Wakker, *Fundamentals of Astrodynamics*, TU Delft, 2015 |
| RTR | Akenine-Möller y otros, *Real-Time Rendering*, 4.ª ed., CRC Press, 2018 |
| PBR | Pharr y Humphreys, *Physically Based Rendering*, borrador de 2003 (se cita con su paginación) |
| SM | Fielder, *Secrets of the Moon*, caps. 1–5 (sin números de página: se cita por capítulo) |
| Horizons | NASA/JPL Horizons, efemérides DE441 |

**Convenciones.** Ejes: +X este, −Z norte, +Y arriba; 1 unidad = 1 m. El azimut se mide desde el norte hacia el este; la elevación, desde el horizonte hacia arriba. α es la elevación del Sol; θ, el diámetro angular de un disco (Sol o Tierra); ρ, la reflectancia del suelo; r, la distancia al Sol en unidades astronómicas (UA).

## 2. Mapa del motor

El motor es `calculos/motor/` (en el prototipo, `src/engine/`): funciones puras y datos, sin React ni three.js. La escena y la interfaz (`interfaz-referencia/`) solo representan lo que el motor calcula.

| Archivo | Qué calcula | Nace en |
|---|---|---|
| `environment.ts` | Constantes y reglas ENV; largo de sombra, núcleo y penumbra, fracción visible de un disco, irradiancias del instante | E1 (crece hasta E10) |
| `simulation.ts` | `estado(t)`: Sol y Tierra del sitio por interpolación de la tabla de Horizons; días lunares, tránsito, salida y puesta locales | E3 (E5, E7, E18, E20) |
| `sitio.ts` | Registro de los dos sitios con escena (coordenadas, definición del día, albedo) y sitio activo | E20 |
| `terreno.ts` | Relieve del sitio: altura, pendiente y sombra del poste sobre el relieve | E6 |
| `horizonte.ts` | Horizonte lejano por azimut, desde cualquier altura del observador | E10 (E21) |
| `rebote.ts` | Radiosidad de un rebote sobre una malla de alturas | E11 |
| `reboteSitio.ts` | Ese rebote aplicado al recorte del sitio, por vértice | E11 |
| `hapke.ts` | Reflectancia de Hapke del regolito: calibrada y medida (LROC WAC) | E12 (E17) |
| `lunaGlobal.ts` | Marco selenográfico, puntos subsolar y subterrestre, brillo del globo | E14 |
| `equipos.ts` | Posiciones de los equipos del Apollo 17 y pies del módulo lunar | E15.3 (E15.6, E19) |
| `evaluacion.ts` | Apoyo del módulo sobre el relieve; Sol y Tierra visibles desde un punto; resumen del día | E19 (E21) |
| `verificacion.ts` | Comprobaciones esperado/simulado, serie del día, perfil de la sombra | E13 (E18) |
| `montecarlo.ts` | Integración de Monte Carlo de referencia, solo para las pruebas | E7 |
| `mascara.ts` | Máscara de horizonte de un punto cualquiera (generaliza la envolvente de E21) | E23: ver [04](04-planificador.md) |
| `efemeridesLuna.ts` | Sol y Tierra desde cualquier punto y fecha de 2026–2030 | E22: ver [04](04-planificador.md) |
| `planificador.ts` | Ventanas de Sol y Tierra, resumen y energía de un período | E23: ver [04](04-planificador.md) |
| `demPolar.ts` | Horizonte de un punto propio del polo sur sobre LOLA de 240 m | E24: ver [04](04-planificador.md) |
| `descenso.ts` | Descenso con motor del módulo lunar con el guiado del Apollo | E26.1: ver [06](06-simulador.md) |
| `simulacion.ts` | Aterrizaje completo y veredicto contra los requisitos del usuario | E26.2: ver [06](06-simulador.md) |

En la escena, dos archivos hacen cálculo físico: `interfaz-referencia/scene/penumbra.ts` (radio de la penumbra en el shader, 4.4) y `interfaz-referencia/scene/materiales.ts` (Hapke en el shader, luz del rebote y luz del suelo sobre el poste y el módulo; 4.5, 4.9 y 4.10). `interfaz-referencia/scene/sobreTerreno.ts` no calcula nada físico: guarda el punto bajo el puntero.

**Notas para portar.**

- El motor no importa React ni three.js: se puede mover a un paquete compartido.
- `simulation.ts`, `terreno.ts` y `horizonte.ts` cargan los datos del sitio activo con `await import` al nivel del módulo, antes de exportar; así el resto del motor es síncrono (SPEC E20). El sitio activo sale de `?sitio=` en la página o de la variable `LUNA_SITIO` en pruebas y scripts (`calculos/motor/sitio.ts`).
- Cada archivo de `datos/` lo genera un script de `calculos/scripts-de-datos/` y guarda su procedencia: producto, consulta y fecha.
- En el prototipo, `bun run test` corre las pruebas de `calculos/pruebas-validacion/`; `polo.test.ts` corre aparte, con `LUNA_SITIO=connecting-ridge`.

## 3. Reglas del entorno

Las diez reglas ENV son el contrato del motor (SPEC, "Reglas del entorno"). La trazabilidad de libro a regla, código y prueba está en `investigacion/matriz-trazabilidad.md`.

| ID | Regla | Valor o aplicación | Fuente |
|---|---|---|---|
| ENV-001 | La Luna prácticamente no tiene atmósfera | ~2×10⁵ moléculas/cm³ de noche y ~10⁴ de día; cielo negro, sin niebla ni dispersión | LSB cap. 3.9, pp. 40–41; tabla 3.1, p. 28; p. 603 |
| ENV-002 | La luz principal viene del Sol | Luz direccional; 1361 W/m² a 1 UA | LSB p. 603; FA p. 542 |
| ENV-003 | Los objetos bloquean la luz solar | Sombras; L = h / tan α en suelo plano | Experimento 01, sección 4 |
| ENV-004 | La escala tiene unidades físicas | 1 unidad 3D = 1 m | Convención del proyecto |
| ENV-005 | El tiempo controla el estado de la escena | `estado(t)` puro; día lunar promedio de 29,531 d | LSB p. 58 |
| ENV-006 | Iluminación física y exposición visual son distintas | Toda ayuda no física se nombra en la interfaz (sección 6) | Regla de trabajo |
| ENV-007 | El Sol no es un punto | Disco de 0,533°; la Tierra, ~1,90° | FA pp. 671, 673; derivado de FA p. 410 |
| ENV-008 | El suelo lunar no es plano | Relieve real; L = h / tan α deja de valer | SM cap. 4; DTM de LROC |
| ENV-009 | El terreno iluminado devuelve luz | Un rebote sobre el relieve; reflectancia 0,085 en el Apollo 17 | LSB A3.2, p. 59; p. 308; cap. 3, p. 30 |
| ENV-010 | La Tierra ilumina según su fase | Esfera lambertiana de albedo de Bond 0,32; ~5,9·10⁻⁵ del Sol con la Tierra llena | LSB A3.1, p. 58; cap. 3, pp. 29–30; FA p. 542 |

## 4. Cálculos por tema

### 4.1 Tiempo y día lunar (E3, E7, E18, E20)

**Qué.** `estado(t)` da, para un tiempo t, la dirección, el diámetro angular y la distancia del Sol y de la Tierra, y la fracción iluminada de la Tierra (`calculos/motor/simulation.ts:100`). Es una función pura: el mismo t da el mismo estado, se llegue avanzando, retrocediendo o saltando (ENV-005).

**Método.**

- t son segundos desde el primer límite de día de la tabla. Se limita a la tabla: no se extrapola y el día no se repite. Repetirlo hacía saltar la Tierra 3,65° y su fase de 76,8 % a 74,7 %. La causa es la libración, el balanceo aparente que mueve la Tierra unos grados en el cielo lunar: sigue los meses anomalístico (27,554550 d) y dracónico (27,212220 d), no el día solar (FA cap. 11.4, p. 257; cap. 17.1, p. 413; SPEC E7).
- Un día lunar va de una salida astronómica del Sol (el centro del disco cruza 0° hacia arriba) a la siguiente. En el polo, donde el Sol puede no salir ni ponerse en meses, va de medianoche a medianoche local, que es el paso del Sol por el antimeridiano (FA cap. 11.4, pp. 252–254; `calculos/motor/sitio.ts`).
- El mediodía es el tránsito: el paso del Sol por el meridiano del sitio, hallado por bisección (`simulation.ts:185`; FA pp. 252–254). Antes se tomaba la fila de mayor elevación, que caía 21 min antes (SPEC E7).
- Salida y puesta locales: cruce del centro del Sol con el horizonte real del sitio (4.8), buscado cada 10 min y refinado por bisección (`simulation.ts:220`).
- La tabla trae seis días lunares seguidos por sitio, una fila por hora: Apollo 17, del 2026-10-15 al 2027-04-11 (4266 filas por cuerpo); Connecting Ridge, del 2026-10-22 al 2027-04-17 (SPEC E18, E20).

**Valores (Apollo 17, día 1).** Salida 2026-10-15 22:54 UTC. Duración 29,572 d; el promedio es 29,531 d (LSB A3.1, p. 58) y el mes sinódico, 29,530589 d (FA p. 257). Tránsito 2026-10-23 07:21:18 UTC con α = 68,4415°. Salida local 2026-10-16 08:20 UTC, con el Sol ya a 4,5°, 9,4 h después de la astronómica. Puesta local 2026-10-30 11:05 UTC, a 2,4°. Los seis días duran entre 29,525 y 29,592 d (SPEC E7, E10, E18).

**Verificación** (`calculos/pruebas-validacion/motor.test.ts`; SPEC E18). Mismo t, mismo estado exacto. Cada salida es un cruce real (|α| < 0,01°, subiendo). Cada día dura 29,5 ± 0,3 d. La Tierra no salta: ≤ 0,12°/h en toda la tabla, cota derivada de la libración (FA p. 413). El Sol avanza ≤ 0,6°/h. En cada día el tránsito cae a 180° de azimut.

**Simplificaciones.** Interpolación lineal entre filas horarias (el Sol avanza ~0,5° por hora). Fuera de la tabla no hay datos y el reloj se detiene. Para cualquier fecha de 2026–2030 se usa la tabla global de E22 ([04](04-planificador.md)).

### 4.2 Posiciones del Sol y la Tierra con JPL Horizons (E5)

**Qué.** Las efemérides (posiciones de un astro por fecha) del Sol y la Tierra vistas desde el sitio: azimut, elevación, diámetro angular, distancia y, para la Tierra, fracción iluminada.

**Método.** `calculos/scripts-de-datos/horizons.ts` consulta JPL Horizons (DE441) para el punto del sitio y guarda una tabla horaria en `datos/efemerides-<sitio>.json`, con su procedencia: consultas exactas, cabeceras, escala de tiempo (`TIME_TYPE='UT'`) y fecha (SPEC E5, E7). Se descarga con un script porque Horizons no envía CORS y el navegador no puede consultarlo (SPEC, Decisiones). El sitio del Apollo 17 es la posición del módulo lunar medida por LROC: 20,1911° N, 30,7723° E, ±3,5 m (LROC, "Coordinates of Lunar Anthropogenic Targets", 2016; Wagner et al., Icarus 283, 2017).

**Valores (día 1).** Diámetro del Sol 0,534°–0,540°; de la Tierra 1,81°–2,01°; fracción iluminada de la Tierra 0,2 %–99,8 %. La libración mueve la Tierra entre 46° y 61° de elevación y entre 231° y 248° de azimut (SPEC E5).

**Verificación.**

- Contra una consulta directa a Horizons: el 2026-11-06 00:00 UTC el motor da la Tierra a 240,143° de azimut y 60,525° de elevación, iluminada al 89,01 % y con 1,896° de diámetro, y el Sol a −67,164° con 0,5386° (SPEC E5).
- Contra la teoría (prueba T0, `motor.test.ts`): latitud subsolar ≤ 1,5424° (FA p. 412); libración del punto subterrestre |b| ≤ 6,7° y |l| ≤ ~8° (FA p. 413); diámetro de la Tierra = 2·asin(6378,137 km / distancia) (FA tabla B.2, p. 672); diámetro del Sol = 2·asin(R☉ / distancia) a 0,05 % (FA tabla B.4, p. 673); elevación en el tránsito 68,442°.

**Diferencia conocida.** FA da la distancia Tierra–Luna como a(1 ± e) con la excentricidad media: 363 100–405 700 km (p. 671; tabla B.7, p. 675). Horizons baja a 355 304 km en los perigeos de diciembre de 2026 a abril de 2027. La prueba se limita al primer día y la diferencia sigue abierta (SPEC E18).

### 4.3 Sombra de un obstáculo y altura por sombra (E2, E4)

**Qué.** El largo L de la sombra de un obstáculo vertical de altura h sobre suelo horizontal, y la operación inversa.

```
L = h / tan α        h = L · tan α
```

- `longitudSombra` y `alturaDesdeSombra` (`calculos/motor/environment.ts:138`, `:149`). Con α = 0 la sombra es infinita; con α < 0 no hay sombra solar.
- La forma inversa es el método con que se midieron alturas lunares desde la Tierra (SM caps. 2 y 4). `medicionInversa` toma un punto marcado en el suelo, lo proyecta sobre la dirección de la sombra y deduce h con el Sol de ese instante.
- Obstáculo de prueba: poste de 10 m (experimento 01) y 0,25 m de radio (**supuesto**). Las distancias se miden desde el borde del poste.

**Verificación.** h = 10 m y α = 12° dan L = 47,05 m (SPEC E2; 47,046 m en la prueba de `calculos/pruebas-validacion/motor.test.ts`). Un clic en la punta exacta devuelve h = 10,000 m; al final de la penumbra (48,15 m), h = 10,235 m, un error de +2,3 % (SPEC E4).

**Límite.** Solo vale en suelo horizontal (SM cap. 4): ver 4.7.

### 4.4 Penumbra: el Sol es un disco (E3.1)

**Qué.** El Sol no es un punto (ENV-007). La sombra tiene un núcleo, donde no se ve ningún punto del disco, y una penumbra, donde se ve una parte. Por lo mismo, el disco sale y se pone de forma gradual.

```
θ☉ = 2·asin(R☉ / 1 UA) = 0,533°          θ⊕ = 2·atan(R⊕ / d) = 1,90°
fin del núcleo     = h / tan(α + θ/2)     o d₀·cos α − r con d₀ = D/θ, lo que ocurra antes
fin de la penumbra = h / tan(α − θ/2)
ancho en la punta  ≈ h·θ / sin²α          θ en radianes
F(e) = 1/2 + (asin t + t·√(1 − t²)) / π,  t = e / (θ/2)     fracción del disco sobre el horizonte
```

- Diámetros de referencia: θ☉ con R☉ = 695 508 km (FA tabla B.4, p. 673) y 1 UA = 149 597 870,7 km (FA p. 671); θ⊕ con R⊕ = 6371 km y d = 384 401 km (FA cap. 17.1, p. 410). El motor usa el diámetro real de cada instante, que viene de Horizons.
- D y r son el diámetro y el radio del poste: el núcleo también termina donde el poste deja de tapar el disco entero.
- El "0,53°" de FA p. 543 es el ángulo del cono de sombra de la Tierra, no el diámetro del Sol (SPEC, tabla de FA).
- Código: `limitesSombra` (`environment.ts:384`) y `fraccionDiscoVisible` (`:280`).

**Valores** (SPEC E3.1). θ☉ = 0,5328° y θ⊕ = 1,8990°. Con α = 12°: núcleo hasta 45,99 m, penumbra hasta 48,15 m, ancho 2,15 m. Con α = 45°: 0,19 m. Por debajo de 10,49° el núcleo ya no llega a la punta; con α = 5° lo corta el ancho del poste, en 53,32 m. F(−θ/2) = 0, F(0) = 0,5 y F(θ/2) = 1. En el Apollo 17 el disco tarda 67,7 min en salir (SPEC E5); la fórmula θ/(ω·cos φ·cos δ) da 67,4 min (prueba T0).

**En la escena** (`interfaz-referencia/scene/penumbra.ts:84`). PCSS, una técnica de sombras suaves (RTR cap. 7.6, pp. 250–252), adaptada a una luz direccional. El radio del filtro es Δd·tan(θ/2), con Δd la distancia del bloqueador al receptor a lo largo del rayo. Usa 32 muestras para buscar bloqueadores y 32 para filtrar.

**Simplificaciones.** Disco de brillo uniforme, sin oscurecimiento del limbo (**supuesto**). La Tierra cuenta como disco lleno aunque esté en fase. PCSS supone un bloqueador promedio por píxel (RTR p. 252). El píxel del mapa de sombras mide ~14 cm: con el Sol a 45°, la penumbra de 0,19 m solo se puede juzgar a ±0,1 m (SPEC E3.1, E6).

### 4.5 Luz reflejada por el suelo y luz terrestre (E2.1, E9)

**Qué.** Dos luces secundarias: la que devuelve el suelo iluminado (ENV-009) y la que llega de la Tierra (ENV-010).

**Luz del suelo sobre una cara.** Con el suelo como plano infinito de reflectancia ρ e irradiancia E, una cara de normal n recibe ρ·E·(1 − n_y)/2: todo si mira hacia abajo, la mitad si es vertical, nada si es el propio suelo (ángulo sólido proyectado, PBR pp. 191–193). Es exacto en ese supuesto (prueba T2). Se usa en el poste y en el módulo lunar; el terreno usa el rebote de 4.9.

**Luz terrestre.** La Tierra se trata como una esfera lambertiana, es decir, que refleja igual en todas las direcciones, de albedo de Bond A = 0,32 (FA cap. 20.4, p. 542).

```
luzTierraLlena = (2/3)·A·sin²(θ⊕/2)      en unidades del Sol a la misma distancia
Φ(g) = [sin g + (π − g)·cos g] / π       g = ángulo de fase; k = (1 + cos g)/2 = fracción iluminada
tierraNormal = luzTierraLlena · Φ(g) · F⊕ / r²
```

- (2/3)·A es el albedo geométrico de una esfera lambertiana (PBR pp. 193, 554). Con la Tierra llena a la distancia media da 5,86·10⁻⁵ del Sol. Reemplazó el supuesto inicial de 10⁻⁴ (E2.1).
- La fase usa la ley de la esfera lambertiana y no la fracción iluminada k: con k = 0,5, Φ vale 0,318 y no 0,5 (`environment.ts:348`).
- F⊕ es la fracción del disco de la Tierra sobre el horizonte real. No hay tinte azul: FA p. 542 da a la luz terrestre el mismo espectro que la solar (SPEC E9).

**Verificación.** Prueba T8: la fórmula cerrada de Φ frente a Monte Carlo. Valor 5,86·10⁻⁵ comprobado en `motor.test.ts`. De noche, con la Tierra al ~95 %, llegan ~0,07 W/m² (SPEC E9).

**Supuesto que queda.** La Tierra como lambertiana: FA dice que entre 1 % y 10 % de su reflexión es especular. La cota con una exitancia de 435 W/m² daría 8,8·10⁻⁵ (SPEC, Decisiones).

### 4.6 Radiometría en W/m² y Sol cortado por el horizonte (E9, E9.1)

**Qué.** La irradiancia (potencia de luz por metro cuadrado) del Sol y de la Tierra sobre el suelo.

```
E☉ = 1361 W/m² / r²                      r = distancia al Sol en UA (Horizons)
solNormal     = F / r²                   F = fracción del disco sobre el horizonte real
solSobreSuelo = solNormal · sin(elevación del centroide visible)
centroide:  y₀ = −e,  s = θ/2,  t = y₀/s
            A = s²·(acos t − t·√(1 − t²)),   M = (2/3)·(s² − y₀²)^(3/2),   ȳ = M/A
            elevación del centroide = e + ȳ
```

- Las luces del motor van en unidades de "Sol = 1 a 1 UA" y se multiplican por 1361 W/m² (FA cap. 20.4, p. 542). La irradiancia cae con 1/r² (PBR cap. 5.2.1, p. 187).
- Cerca del horizonte solo ilumina la parte visible del disco, y desde su centroide, no desde el centro (PBR p. 545). Con el centro en 0°, el suelo recibe θ/(3π) ≈ 9,9·10⁻⁴ del Sol, con θ en radianes (el SPEC lo escribe 2ρ/(3π), con ρ = θ/2). Con F·sin e, lo anterior, recibía 0, y con e = 0,1° se subestimaba hasta 38 % (`environment.ts:293`; SPEC E9).
- La fracción visible se mide contra el horizonte real del sitio en el azimut del astro (4.8). Aproximación: el borde del horizonte es horizontal a lo ancho del disco (`environment.ts:314`).
- `iluminacion(e)` devuelve todo junto (`environment.ts:244`).

**Valores.** Entre 1369 y 1395 W/m² perpendicular al Sol en el día 1; hasta 1415 W/m² en enero. Con α = 12°: ~1372 W/m² perpendicular y ~285 W/m² sobre el suelo (SPEC E9, E18).

**Verificación.** T6: el centroide en el horizonte frente a la fórmula analítica. La irradiancia de toda la tabla queda dentro de 1361/r² con r = 1 ± e⊕ ± a☾(1 + e☾) (FA p. 542; tabla B.5, p. 674; tabla B.7, p. 675). La fase de la Tierra por geometría coincide con la fracción iluminada de Horizons a ≤ 0,2 % (SPEC E9.1).

**Cámara, no entorno.** `ESCALA_VISUAL = π` ancla la exposición a un fotómetro de luz incidente (RTR cap. 8.2.2, p. 289): con +0 EV, una superficie de reflectancia ρ de cara al Sol da ρ en valor lineal. La exposición va de 0 a 20 EV, y cada EV duplica. De noche el suelo necesita ~+15,5 EV para llegar a 0,18 (SPEC E8, E9).

### 4.7 Relieve real (E6, E16, D2)

**Qué.** El suelo no es plano (ENV-008): la sombra depende de la pendiente y L = h / tan α deja de valer.

**Datos.** Recorte del DTM (modelo digital del terreno: alturas en una rejilla) `NAC_DTM_APOLLO17_2M` de LROC: 201 × 201 muestras, 400 m de lado y ~2 m de paso, centrado en el módulo lunar. El desnivel va de −24,1 m a +6,2 m respecto del módulo. Lo genera `calculos/scripts-de-datos/dtm.ts` y queda en `datos/relieve-apollo17.json` (SPEC E6).

**Método** (`calculos/motor/terreno.ts`).

- `alturaSuelo(x, z)`: interpolación bilineal. `pendienteGrados`: diferencias centradas a un paso.
- `largoSombraSobreTerreno` (`:85`): el rayo desde el borde de la tapa del poste avanza en pasos de 5 cm hasta tocar el relieve y se refina por bisección.
- `limitesSombraSobreTerreno`: lo mismo con α, α + θ/2 y α − θ/2.

**Resultado** (SPEC E6):

| Momento | α | L en suelo plano | L sobre el relieve | h = L·tan α |
|---|---|---|---|---|
| Mañana | 12° | 47,05 m | 44,15 m | 9,39 m (−6 %) |
| Tarde | 11,2° | 50,66 m | 54,88 m | 10,83 m (+8 %) |
| Mañana | 5° | 114,3 m | 88,3 m | 7,72 m (−23 %) |

La mañana y la tarde dan alturas distintas, como en el Straight Wall de Fielder (SM cap. 4).

**Verificación.** Altura del centro: −2626,21 m en el DTM frente a −2626 m en la tabla de LROC. Prueba T9: 44,15 m. Una revisión independiente halló que pasos de 5 cm y de 5 mm difieren ≤ 5 mm, y que la bilineal del motor difiere de la malla dibujada ≤ 0,10 m en la punta (SPEC E6).

**Valle (E16).** Para dibujar las montañas se usa SLDEM2015 (LOLA + SELENE, ~59 m) muestreado cada 125 m en ±25 km: 401 × 401 vértices, con la caída por curvatura descontada y el horizonte de cada vértice en 8 azimuts (marcha de rayos, RTR pp. 465–466). Los macizos llegan a +2389 m (LSB pp. 33–34: 2000–2300 m) y el horizonte del vértice central coincide con el de 4.8 a ±1,5°. El albedo por altura, de 0,085 a 0,15, es un **supuesto**.

**Detalle inventado, fuera (D2).** Se eliminó la capa de cráteres sintéticos, y las rocas sintéticas quedan apagadas por defecto. El motor nunca las usó: mezclar datos inventados con medidos rompería la trazabilidad (SPEC, Decisiones).

**Simplificaciones.** Se ignora la curvatura dentro del recorte: a 200 m el suelo cae 200²/(2·1 737 400) ≈ 1,2 cm (`terreno.ts`). Lo menor a 2 m no aparece. En la escena, el plano del receptor (RTR p. 250) evita que las pendientes se sombreen a sí mismas; queda una separación declarada entre el poste y su sombra: ~0,9 m con el Sol a 6°, ~0,4 m a 13° y < 0,1 m a 45°.

### 4.8 Horizonte real (E10, E20, E21)

**Qué.** La elevación del horizonte en cada azimut, vista desde el sitio. Decide cuándo se ven el Sol y la Tierra.

**Datos y método.**

- Apollo 17 (`calculos/scripts-de-datos/horizonte.ts`): marcha de rayos desde el módulo sobre SLDEM2015 (512 px/grado, ~59 m), en 720 azimuts, de 250 m a 30 km, con la caída por curvatura descontada (RTR pp. 465–466). Se usa SLDEM2015 y no el DTM NAC porque el NAC obligaría a bajar ~700 MB para 30 km de radio, y a esa distancia 59 m sobran (SPEC, Decisiones).
- Polo (`calculos/scripts-de-datos/polo-lola.ts`): hasta 150 km, con la esfera exacta. Dentro del mosaico de 16 km usa el DTM de 5 m de PGDA; fuera, LOLA `LDEM_75S_120M` (SPEC E20).
- Desde cualquier altura (E21): por azimut se guarda la envolvente convexa superior del perfil del rayo (en promedio, 12 a 15 vértices). Con ella, el horizonte de un observador a altura H sale exacto, sin volver a leer el DEM (`calculos/motor/horizonte.ts:19`; `calculos/motor/mascara.ts:58`):

```
horizonte(az, H) = máx atan2(y − H, x)    sobre los vértices (x, y) de la envolvente
```

**Resultado.** Apollo 17: horizonte de 0,2° a 14,2°. Macizo Norte, 14,2° a 6,4 km; Macizo Sur, 11,3°; al este, 5,1°; al oeste, 2,9°. Es coherente con LSB (macizos de 2000–2300 m en un valle de ~8 km, pp. 33–34, 37). Polo: de −3,0° a +2,2° (SPEC E10, E20).

**Verificación.** La altura del sitio coincide en tres productos: SLDEM2015, −2628,0 m; DTM NAC, −2626,2 m; LROC, −2626 m. La salida local llega ≈ h(az)/(ω·cos φ) después de la astronómica (FA p. 257). Antes de la salida local no hay luz solar. La envolvente reproduce el perfil a ras del suelo a ≤ 0,004° (SPEC E10, E21).

**Simplificaciones.** El horizonte lejano es el medido desde el centro del sitio para todo el recorte: a 200 m la paralaje es de ~0,1–0,5° (**supuesto** sin medir). Los rayos empiezan a 250 m: lo más cercano lo pone el DTM local (4.14).

### 4.9 Luz devuelta por el relieve (E11)

**Qué.** La luz que el relieve iluminado se devuelve a sí mismo. Sin ella, el fondo de un cráter en sombra recibiría 0 aunque sus paredes iluminadas lo alumbren (LSB p. 30).

**Método** (`calculos/motor/rebote.ts`). Radiosidad, el cálculo de la luz que se pasan entre sí las superficies mates, con un solo rebote (RTR cap. 11.2.1, pp. 442–443; PBR cap. 16.2.3, p. 577).

```
E_rebote(i) = Σ_j ρ · E_directa(j) · F_ij
F_ij = cos θ_i · cos θ_j · A_j / (π·d²)
```

- θ_i y θ_j son los ángulos entre la recta que une los parches y sus normales; A_j, el área real del parche; d, la distancia entre ambos.
- Un parche j cuenta solo si las dos caras se miran y está a menos de 120 m.
- La luz directa de cada parche lleva su sombra: su horizonte propio en 16 azimuts hasta 150 m, y el horizonte lejano de 4.8.
- En el sitio (`calculos/motor/reboteSitio.ts`): parches de 8 m (51 × 51), interpolados a los 201 × 201 vértices. La preparación tarda ~0,2 s; cada instante cuesta 3 ms en el Apollo 17 y 12 ms en el polo (medido en D4).

**Verificación** (SPEC E11; `motor.test.ts`).

- T4, cráter de casquete esférico de 200 m de diámetro y 40 m de profundidad (**supuesto** de la prueba): el fondo, en sombra directa, recibe el rebote dentro del −12 % de la solución exacta E₁ = ρ·E⊥·sin α·sin²ψ/4, con ψ el semiángulo del casquete (PBR pp. 194, 577). Con parches de 8 m da −9,5 %; con 4 m, −5,3 %: converge.
- Suelo plano: rebote 0, igual que el plano infinito exacto.
- T1, horno: dentro de una esfera cerrada, L/Le = 1/(1 − ρ) (PBR p. 575). Comprueba el integrador de referencia.

**Simplificaciones** (declaradas en el código). Un solo rebote: con ρ = 0,085 el segundo aporta < 10 % del primero. Sin oclusión entre parches. Factor de forma punto–área. Sin terreno fuera del recorte. El rebote usa el albedo medio, no el local.

### 4.10 Reflectancia del regolito: Lambert y Hapke (E8, E12, E17)

**Qué.** Cuánta luz devuelve el regolito, el suelo suelto de la Luna, según de dónde llega y hacia dónde sale. Esa función se llama BRDF.

**Lambert con el valor del sitio (E8).** Reflectancia 0,085, no 0,15. El Apollo 17 está sobre mar con manto oscuro (LSB p. 631); los mares tienen ~7–10 % (LSB p. 59) y el suelo 75081 da ≈ 0,08–0,09 (LSB fig. 7.10, p. 308, lectura aproximada de una gráfica). El material anterior agregaba un brillo especular de 2 a 3 veces hacia adelante, lo contrario de la Luna (LSB p. 559; RTR pp. 349–350; PBR p. 331).

**Hapke calibrado (E12).** La Luna retrorrefleja: devuelve más luz hacia donde vino. Se usa Hapke (1981, ec. 16) tal como la da LSB p. 559 (`calculos/motor/hapke.ts:51`):

```
r(i, e, g) = (w/4π) · µ0/(µ0 + µ) · {[1 + B(g)]·P(g) + H(µ0)·H(µ) − 1}
H(x) = (1 + 2x) / (1 + 2x·√(1 − w))
B(g) = B0·{1 − tan|g|·[3 − e^(−h/tan|g|)]·[1 − e^(−h/tan|g|)] / (2h)}    para |g| ≤ π/2; 0 más allá
B0 ≈ e^(−w²/2);   h ≈ 0,4
BRDF = r/µ0;   albedo normal = π·r(0, 0, 0)
```

- µ0 y µ son los cosenos de los ángulos de incidencia y de salida; g, el ángulo de fase, entre la luz y el observador; w, el albedo de dispersión simple de una partícula.
- Calibración: w = 0,306, para que el albedo normal (la reflectancia vista de frente a fase 0, LSB p. 560) sea 0,085.
- **Supuestos**: P(g) = 1, partículas isótropas, porque LSB no da P; sin la corrección por rugosidad de Hapke (1984), que el libro no reproduce.
- En la escena, la luz directa sobre el terreno usa Hapke; el rebote y el poste siguen lambertianos con 0,085 (`interfaz-referencia/scene/materiales.ts:94`).

**Verificación** (SPEC E12). Albedo normal calibrado. Reciprocidad: intercambiar luz y observador da el mismo valor. Energía: la fracción total reflejada para cada dirección de llegada (ρ_dh) queda ≤ 1 por Monte Carlo (0,061 a 0° y 0,137 a 85°). Con el Sol a la espalda las pendientes brillan igual: 3,5 % de diferencia entre 0° y 60°, donde Lambert caería 50 %. Efecto de oposición: a fase 0 brilla más de 1,3 veces que a 10°.

**Hapke medido (E17).** Parámetros del mapa de LROC WAC (Sato et al. 2014) a 566 nm, en la celda de 1° del sitio: w = 0,191, b = 0,264, c = 0,070, Bs0 = 2,19 y hs = 0,071. Ecuaciones de Schröder et al. 2017 (arXiv:1701.08550, ecs. 13–16):

```
B_SH(g) = 1 + Bs0 / (1 + tan(g/2)/hs)
P(g) = (1 + c)/2 · (1 − b²)/(1 − 2b·cos g + b²)^(3/2) + (1 − c)/2 · (1 − b²)/(1 + 2b·cos g + b²)^(3/2)
```

- Convención de signo decidida con los datos: c > 0 es retrodispersión, al revés de la ec. 16 de Schröder (`hapke.ts`, comentario de E17).
- No es el modelo por defecto. Sato ajustó con la rugosidad macroscópica (θ̄ = 23,657°), cuyas ecuaciones no están en ninguna de las fuentes. Sin ella, el albedo normal medido da 0,115, por encima del 7–10 % de los mares. Además, la celda de 1° (~30 km) mezcla el fondo del valle con los macizos claros. Queda como modelo de comparación (SPEC E17).

**En el polo.** Albedo 0,15, de tierras altas (11–18 %, LSB p. 59): **supuesto**, sin medición propia. La Hapke calibrada para 0,085 se escala por albedo/0,085 (SPEC E20).

### 4.11 Albedo real del sitio (E15.1, D2)

**Qué.** Las variaciones reales de brillo del suelo alrededor del módulo, tomadas de una foto orbital sin la luz ni las sombras de la toma.

**Método** (`calculos/scripts-de-datos/albedo-orto.ts`; SPEC E15.1).

- Fuente: ortofoto LROC NAC `NAC_DTM_APOLLO17_1_M134991788_60CM`, de 0,6 m/píxel, tomada el 2010-07-28 a las 21:28:41 UTC.
- Se divide por el brillo que predice Hapke (4.10) con las normales del DTM (4.7), el Sol de la toma (Horizons: azimut 259,15°, elevación 25,33°) y la nave al nadir (**supuesto**). Se descartan los puntos en sombra y los de luz rasante.
- Los valores de la foto no tienen escala radiométrica (etiqueta PDS: `SCALING_FACTOR` 1, `OFFSET` 0). Por eso solo se toman las variaciones, escaladas a media 0,085.
- Resultado: 667 × 667 texeles de 0,6 m, la resolución nativa (D2); en E15.1 eran 512 × 512, con 99,96 % de texeles válidos y ±0,0086 de desvío.

**Verificación.** Media 0,085 y rango 0,03–0,25. La georreferencia se valida sola: la anomalía más fuerte a ±20 m del centro, que es el módulo lunar, mide 6,3σ y está a ~4 m del centro, dentro de los ±3,5 m de LROC más el registro del DTM; con la resolución nativa sigue a < 6 m (SPEC E15.1, D2).

**Simplificaciones.** Queda sombreado residual de lo menor a 2 m, que el DTM no resuelve. El módulo y las huellas quedan "pintados" en el albedo.

### 4.12 Luna completa (E14)

**Qué.** Las direcciones del Sol y la Tierra en el marco selenográfico (fijo a la Luna), los puntos subsolar y subterrestre, y el brillo del globo.

```
x hacia (0° N, 0° E), y hacia (0° N, 90° E), z hacia el polo norte
este   E = (−sin λ, cos λ, 0)
norte  N = (−sin φ·cos λ, −sin φ·sin λ, cos φ)
arriba U = (cos φ·cos λ, cos φ·sin λ, sin φ)        φ = latitud, λ = longitud este
```

- `aSelenografico` y `geometriaGlobal` (`calculos/motor/lunaGlobal.ts:17`, `:57`).
- Datos: LOLA `LDEM_4` (altura) y `LDAM_4` (albedo normal a 1064 nm; Lemelin et al. 2016, cita sin verificar según `investigacion/fuentes.md`), a 4 px/grado, 1440 × 720 y 7,6 km/píxel.
- Brillo visible = LDAM × 0,085/0,177. LOLA da 0,177 en el sitio porque el regolito es más rojo (LSB p. 307). **Supuesto**: la misma pendiente espectral en toda la Luna.

**Verificación** (SPEC E14). Normal del sitio · Sol = sin(elevación) en toda la tabla. El punto subsolar avanza ~12,17°/día hacia el oeste. `LDEM_4` en el sitio ≈ −2,63 km (LROC: −2626 m). `LDAM_4` en el sitio = 0,177.

**Simplificaciones.** Sin sombras del relieve a esta escala. Se ignora la paralaje entre el sitio y el centro de la Luna (≤ 0,27° para la Tierra).

### 4.13 Equipos del Apollo 17 (E15.3, E15.6)

**Qué.** La posición local de los equipos que quedaron en el sitio, a partir de la tabla de LROC (2016, ±3,2 a ±3,7 m), sobre el plano tangente (`calculos/motor/equipos.ts:36`):

```
norte = Δlatitud · R          este = Δlongitud · R · cos(latitud)         R = 1 737 400 m
```

- Resultado: ALSEP a 193,5 m al oeste y 36 m al norte del módulo; LRV a 131 m al este y 45 m al sur (~138,6 m); SEP a 128 m al este y 27 m al norte (SPEC E15.3).
- Medidas con fuente: etapa de descenso del módulo lunar (LM), prisma octogonal de 4,2 m de ancho y 1,7 m de espesor, con la base a 1,5 m del suelo y 9,4 m entre los extremos de pies opuestos (NASA NSSDCA, ficha 1972-096C). LRV de 310 × 183 cm (LSB fig. 9.44, p. 527).
- **Supuestos**: la orientación de cada equipo, el radio del pie (0,47 m) y la forma del ALSEP y del SEP.

### 4.14 Evaluación del punto de aterrizaje (E19)

**Qué.** Las condiciones de un punto elegido con un clic: cómo apoyaría el módulo y cuánto se ven el Sol y la Tierra. Se dan valores, no veredicto: las fuentes no traen umbrales para aterrizar (SPEC E19). El veredicto contra requisitos que pone el usuario llega en E26 ([06](06-simulador.md)).

**Método** (`calculos/motor/evaluacion.ts`).

- `apoyoLM` (`:55`): plano de mínimos cuadrados por los cuatro pies del LM sobre el DTM.

```
pendiente por eje = (h₊ − h₋) / (2·a)        h₊ y h₋: alturas de los dos pies opuestos; a = 4,7 m − radio del pie
inclinación = atan(|gradiente|)
alabeo = |h₁ + h₃ − h₂ − h₄|                 separación del cuarto pie si apoyan tres
```

- `cieloEnPunto` (`:142`): el Sol o la Tierra se ven si su centro está sobre el horizonte lejano (4.8) y ningún relieve cercano lo tapa. Lo cercano se prueba con una marcha de rayos sobre el DTM, con paso de 2 m hasta el borde del recorte (RTR pp. 465–466).
- `resumenDia` (`:174`): recorre el día lunar cada 10 min y da horas y fracción con Sol, primer y último Sol, y fracción con la Tierra visible.

**Valores en el sitio del LM, día 1** (SPEC E19). Inclinación 4,4° hacia el SE; desnivel entre pies 0,58 m; alabeo 0,25 m; pendiente local 4,5°. 339 h de Sol (47,7 %), del 10-16 08:24 al 10-30 11:04 UTC. Tierra visible el 100 % del día.

**Verificación.** El plano por los pies sobre planos inclinados sintéticos devuelve la inclinación, el azimut y un alabeo 0 exactos. Las horas de Sol coinciden con puesta local − salida local (4.1) a ±1 h. El relieve tapa el Sol bajo desde el punto más hondo del DTM y no desde el alto (SPEC E19).

### 4.15 Polo sur: Connecting Ridge (E20)

**Qué.** El segundo sitio con escena: 89,46316° S, 222,5104° E, el centro del mosaico de 5 m de PGDA "Site01: Connecting ridge" (Barker et al. 2021; x = −11 000 m, y = −12 000 m en estereográfica polar sur con R = 1737,4 km).

**Datos.** DTM de 5 m de LOLA (PGDA), remuestreado a la cuadrícula de 2 m (sobremuestreo declarado): centro a 1944,8 m, error RMS 0,25 m y relieve de −15 a +8 m en 400 m. Horizonte hasta 150 km y valle de ±25 km como en 4.8 (SPEC E20).

**Resultados en el centro** (SPEC E20; con el ojo a 1 m, ver 4.16). El Sol va de −1,99° a +2,05° y la Tierra, de −7,5° a +6,2°. Sol visible del 60 % del día lunar (noviembre) al 23 % (abril); Tierra visible del 33 % al 40 %. Apoyo del LM: 3,1° hacia el SO, alabeo 0,15 m.

**Verificación** (`calculos/pruebas-validacion/polo.test.ts`). Límites de día en el antimeridiano y días de 29,5 ± 0,3 d (FA p. 257). |α☉| ≤ 1,5424° + colatitud (FA p. 412). Elevación de la Tierra acotada por la libración en latitud más la colatitud (FA p. 413). La altura del sitio coincide en dos productos LOLA independientes: 1944,8 m en el de 5 m y 1943,0 m en el de 120 m, lo que valida la proyección.

**Simplificaciones.** Albedo de 0,15 uniforme (**supuesto**). Sin ortofoto ni Hapke medido. El relieve local de 2 m es un sobremuestreo del de 5 m.

### 4.16 Altura del observador y validación contra Mazarico et al. 2011 (E21)

**Qué.** En el polo el Sol va a ±2°: unos metros de altura cambian las horas de luz. El motor calcula el cielo desde el suelo, desde 1,7 m (persona) y desde 10 m (mástil); las dos últimas alturas son **supuestos**. Y se compara con un producto científico publicado.

**Referencia.** Mapas de visibilidad media de Mazarico et al. (2011, Icarus 211; PGDA producto 69), `AVGVISIB_85S_060M_201608` y su versión `_EARTH`. Definición de la etiqueta PDS: "the percentage of timesteps where each pixel was sunlit (by any fraction of the solar disc)", con pasos horarios durante 18,6 años sobre el DEM LOLA de 60 m.

**Método.** Serie propia del Sol y la Tierra cada 3 h durante 18,6 años desde el 2026-11-06 (Horizons, 54 349 filas). `algoDelDiscoVisible` (`evaluacion.ts:115`) aplica la misma definición: el borde superior del disco sobre el horizonte lejano y sin relieve cercano que lo tape.

**Resultado en el centro de Connecting Ridge** (SPEC E21):

| | Mazarico 2011 (60 m) | Motor, suelo | Motor, 1,7 m | Motor, 10 m |
|---|---|---|---|---|
| Sol (alguna parte del disco) | 38,5 % | 36,6 % (−1,9) | 49,0 % | 89,5 % |
| Tierra | 33,9 % | 30,3 % (−3,6) | 45,6 % | 58,0 % |

- La prueba exige ±5 puntos a ras del suelo. Los 8 píxeles vecinos del mapa de referencia van de 22 % a 54 % (Sol): la cresta cambia mucho en 60 m.
- Sin el relieve cercano, solo con el horizonte desde 250 m, el motor daba 60 %: en el polo decide lo cercano.
- Corrección que trajo este paso: el ojo cercano pasó de 1 m a ras del suelo (1 cm). En el polo, el día 1 bajó de 423 h a 383 h de Sol, y la Tierra, de 35,9 % a 19,6 %. En el Apollo 17 no cambió nada.

**Simplificaciones.** Semidiámetros fijos (Sol 0,266°, Tierra 0,95°). El intervalo de 18,6 años de la referencia no se publica: se usa 2026–2045. Su altura de observador tampoco: se compara con la de suelo. El horizonte lejano se mide desde el centro del sitio.

### 4.17 Rendimiento (D4)

Solo cambia la representación; el motor no. Con la escena en movimiento, la penumbra usa 8 muestras en vez de 32, la densidad de píxeles baja a 1 y el rebote se recalcula si el Sol o la Tierra se movieron más de 0,1° (**supuesto** sin medir su efecto en la imagen). Quieta, vuelve la calidad completa y, a los 200 ms, el cálculo exacto.

Resultado, en tiempo de GPU por cuadro con el reloj corriendo: de 7,5 ms a 3,8–4,2 ms en el Apollo 17 y de 9,6–10,2 ms a 3,7–4,0 ms en el polo. En pausa no cambia (1,0 ms). Medido en Chrome con densidad de píxeles 1,6 y el temporizador de GPU (SPEC D4).

### 4.18 Cómo se verifica el conjunto (E7, E13, D1, D3)

- **Pruebas automáticas.** Al cierre de E21: 68 en el Apollo 17 y 12 en el polo (SPEC E21). Comparan el motor con fuentes y con soluciones exactas.
- **Monte Carlo de referencia** (`calculos/motor/montecarlo.ts`). Muestreo coseno del hemisferio y muestreo de un cono (PBR caps. 14 y 15). Verifica, no dibuja: horno (T1), plano infinito (T2), energía de la BRDF (T7), fase lambertiana (T8).
- **Evidencia en pantalla** (E13; `calculos/motor/verificacion.ts:30`). Tabla de esperado frente a simulado con tolerancia: diámetro del Sol (0,05 %), fase de la Tierra (0,2 puntos), albedo normal calibrado (10⁻⁶), irradiancia 1361/r² (0,01 W/m²) y ancho de la penumbra h·θ/sin²α (1 % + 5 mm). Las filas de relieve son informativas.
- **Auditoría contra los libros** (`investigacion/matriz-trazabilidad.md`). Cinco revisiones independientes, una por libro, hallaron siete contradicciones entre el código y las fuentes. Todas se cerraron: el regolito que brillaba hacia adelante y el albedo de tierras altas en un sitio de mar (E8 y E12), el rebote que no veía el relieve (E11), la luz terrestre supuesta y el Sol en el horizonte sin centroide (E9), el día lunar repetido (E7) y el horizonte plano (E10).
- **Diagnóstico.** D1: indicador en pantalla con cuadros por segundo y errores de consola, incluidos los de shader. D3: se corrigió un `PI` sin declarar en los materiales del valle y del globo.

## 5. Constantes físicas usadas

Archivos en `calculos/motor/`, salvo que se indique otra carpeta.

| Constante | Valor | Unidad | Fuente | Archivo |
|---|---|---|---|---|
| Escala de la escena | 1 unidad = 1 | m | ENV-004 | `environment.ts` |
| Radio de la Luna | 1737,4 | km | Esfera de referencia del DTM, LOLA y Horizons (LSB tabla 3.1, p. 28: 1738; FA tabla B.1, p. 671: 1737,1) | `terreno.ts`, `lunaGlobal.ts`, `equipos.ts` |
| Radio del Sol | 695 508 | km | FA tabla B.4, p. 673 | `environment.ts` |
| Unidad astronómica | 149 597 870,7 | km | FA p. 671 | `environment.ts`, `lunaGlobal.ts` |
| Diámetro angular medio del Sol | 0,533 | ° | Derivado: 2·asin(R☉ / 1 UA) | `environment.ts` |
| Radio medio de la Tierra | 6371 | km | FA cap. 17.1, p. 410 | `environment.ts` |
| Distancia media Tierra–Luna | 384 401 | km | FA cap. 17.1, p. 410 | `environment.ts` |
| Diámetro angular medio de la Tierra | 1,90 | ° | Derivado: 2·atan(R⊕ / d) | `environment.ts` |
| Radio ecuatorial de la Tierra (Horizons) | 6378,137 | km | FA tabla B.2, p. 672 | `calculos/pruebas-validacion/motor.test.ts` |
| Constante solar | 1361 | W/m² a 1 UA | FA cap. 20.4, p. 542 | `environment.ts` |
| Albedo de Bond de la Tierra | 0,32 | — | FA cap. 20.4, p. 542 | `environment.ts` |
| Día lunar promedio | 29,531 | d | LSB A3.1, p. 58 | `simulation.ts` |
| Mes sinódico | 29,530589 | d | FA cap. 11.4, p. 257 | `calculos/pruebas-validacion/motor.test.ts` |
| Inclinación del ecuador lunar sobre la eclíptica | 1,5424 | ° | FA cap. 17.1, p. 412 | `calculos/pruebas-validacion/motor.test.ts` |
| Reflectancia del regolito, Apollo 17 | 0,085 | — | LSB p. 631; p. 59; fig. 7.10, p. 308 | `sitio.ts` |
| Reflectancia del regolito, polo | 0,15 | — | **Supuesto** (tierras altas, 11–18 %, LSB p. 59) | `sitio.ts` |
| Hapke: h | 0,4 | — | LSB p. 559 | `hapke.ts` |
| Hapke: P(g) | 1 | — | **Supuesto** | `hapke.ts` |
| Hapke: w calibrado | 0,306 | — | Calibración al albedo normal 0,085 (SPEC E12) | `hapke.ts` |
| Hapke medido: w, b, c, Bs0, hs | 0,191; 0,264; 0,070; 2,19; 0,071 | — | Sato et al. 2014 (LROC WAC, 566 nm) | `datos/hapke-wac-apollo17.json` |
| Albedo de LOLA a 1064 nm en el Apollo 17 | 0,177 | — | LOLA `LDAM_4` | `lunaGlobal.ts` |
| Poste de prueba: altura y radio | 10; 0,25 | m | Experimento 01; el radio es **supuesto** | `environment.ts` |
| LM: ancho, espesor, base, entre pies | 4,2; 1,7; 1,5; 9,4 | m | NASA NSSDCA, ficha 1972-096C | `equipos.ts` |
| Radio del pie del LM | 0,47 | m | **Supuesto** | `equipos.ts` |
| Alturas del observador | 0; 1,7; 10 | m | 1,7 y 10 son **supuestos** | `evaluacion.ts` |
| Radio de vecinos del rebote | 120 | m | Decisión de E11 (precisión frente a costo) | `reboteSitio.ts` |
| Escala visual de la exposición | π | — | RTR cap. 8.2.2, p. 289 | `environment.ts` |

## 6. Lo que no es físico y se declara

ENV-006 exige nombrar en la interfaz toda ayuda que no sea física. La lista vive en la sección "No físico" del panel (`interfaz-referencia/ui/Secciones.tsx:649`):

- **Exposición y curva de tono.** La exposición es de la cámara, no irradiancia real. La curva ACES comprime los tonos para la pantalla; para medir hay un modo lineal (RTR p. 286).
- **Ayudas de medición.** Cuadrícula de 1 m y 10 m y marcas de la sombra: no reciben luz y se pueden ocultar.
- **Cielo dibujado.** El Sol y la Tierra se dibujan a distancia fija en su dirección real. La lupa del cielo (×10) y la exageración del relieve del globo (×10) son ayudas con aviso (SPEC E9.1, E14).
- **Penumbra en pantalla.** Bloqueador promedio por píxel, radio mínimo de medio píxel del mapa de sombras y grano por muestreo.
- **Escena en movimiento (D4).** Menos muestras, menos resolución y rebote recalculado cada 0,1°.
- **Acumulación en pausa (E15.5).** Se promedian hasta 64 cuadros para quitar el grano. No cambia el valor medio.
- **Separación del poste y su sombra** por los márgenes contra el acné de sombras (4.7).
- **Rocas sintéticas.** Apagadas por defecto: posiciones y tamaños inventados. No entran en las mediciones.
- **Cámara de astronauta (E15.4).** Ojos a 1,7 m y paso de 1,5 m/s: **supuestos**.
- **Reloj acelerado.** Toda velocidad distinta de ×1.
- **Eclipse.** La Tierra no eclipsa al Sol aunque pasen por el mismo punto del cielo.
- **Luz de trabajo (E1).** Existió solo hasta que hubo Sol; se retiró en E2.

Diferencia ya anotada en "Abiertas" del SPEC: esa lista aún dice "Luz terrestre = 1/10 000 del Sol con la Tierra llena: supuesto sin cita" (`Secciones.tsx:668`), pero desde E9 el motor usa el valor derivado, 5,86·10⁻⁵. Manda el código.

## 7. Simplificaciones, límites y pendientes

**Simplificaciones vigentes** (cada una está en su apartado):

| Tema | Simplificación |
|---|---|
| Tiempo y efemérides | Tabla horaria con interpolación lineal; seis días lunares por sitio; sin eclipse de Sol por la Tierra |
| Discos | Brillo uniforme, sin oscurecimiento del limbo; la Tierra como disco lleno; semidiámetros fijos en la validación de 18,6 años |
| Luz terrestre | Tierra lambertiana |
| Relieve | Muestras cada 2 m; sin curvatura dentro del recorte; en el polo, sobremuestreo del DTM de 5 m |
| Horizonte | Medido desde el centro del sitio; rayos desde 250 m |
| Rebote | Un rebote; sin oclusión entre parches; parches de 8 m; albedo medio |
| Regolito | Hapke con P = 1 y sin rugosidad; gris; albedo de 0,15 supuesto en el polo |
| Evaluación | Sol y Tierra por su centro en el panel; apoyo del LM con orientación y radio de pie supuestos |

**Pendientes de estos pasos** (seguimientos de cada paso y sección "Abiertas" del SPEC):

- **Umbrales de aterrizaje con fuente** (E19): pendiente máxima, alabeo tolerable, elevación del Sol al descender. Sin ellos el panel no da veredicto propio.
- **Rugosidad de Hapke** (E17): conseguir Hapke (1984) o el libro de Hapke (2012). Con eso el modelo medido podría pasar a ser el principal.
- **Penumbra** (ENV-007): oscurecimiento del limbo, forma real de la Tierra en fase, varios bloqueadores a distinta profundidad (RTR p. 252).
- **Eclipse de Sol por la Tierra**: no se modela; con las efemérides se podría detectar. La órbita lunar está inclinada 5,145°, así que solo ocurre cerca de los nodos (FA p. 412).
- **Distancia Tierra–Luna** (E18): falta una fuente para la variación de la excentricidad que acote toda la tabla.
- **Luz en el polo** (E20, E21): mapa de iluminación por punto; albedo medido (LOLA LDAM polar); DEM de 5 m por *shape-from-shading* (Bertone et al. 2025, Zenodo 10.5281/zenodo.17954508); textura NAC del polo. La validación fuera del centro se hizo en E24 ([04](04-planificador.md)).
- **Validación temporal** (E21): contra imágenes LROC con fecha conocida.
- **Rebote** (E15, D4): usar el albedo local; medir cuánto cambia la imagen el umbral de 0,1°.
- **Equipos** (E15.6): LRV, ALSEP y SEP siguen como formas simples; faltan la orientación real del LM y su sombra propia en la luz del suelo.
- **Fase real de la Tierra y del regolito**, y color del regolito según el ángulo solar (LSB p. 30).
- **Estrellas, luz zodiacal y corona**: se toman como despreciables para iluminar (**supuesto**, sin cita).
- **Interfaz**: formato de números mezclado en el panel (F8) y el texto de la luz terrestre de la sección 6.
- **Proceso** (E7): `bun test` no es todavía requisito de cierre de un paso; la regla pide solo la compilación.
