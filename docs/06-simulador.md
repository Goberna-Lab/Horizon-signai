# 06. La simulación de aterrizaje (E26.1 a E26.4)

Las rutas de este documento son relativas a `luna-recursos/`, la copia del prototipo luna (commit 72f890f). El registro completo de cada paso está en `luna-recursos/investigacion/SPEC.md`. La copia está reorganizada para consulta: los `import` conservan las rutas originales (`src/engine`, `src/data`) y no resuelven tal cual.

"SPEC E26.1" quiere decir la sección E26.1 de ese archivo. Las claves de fuente (R-695, TN-D-6846, DPS…) vienen de `investigacion/fuentes.md` y se resumen al final.

## 1. Qué responde

Pregunta: si la nave toca el suelo en este sitio a esta hora y se queda N días, ¿se cumple lo que la misión exige?

Dos cosas que hay que saber antes de leer el resto:

- **La nave simulada es el módulo lunar (LM) del Apollo**, con el perfil de descenso previsto para el Apollo 11. Es una nave de ejemplo validada: se eligió porque sus documentos públicos dan el guiado y un perfil con el que comparar (R-695 y TN-D-6846; SPEC, Decisiones, 2026-11-07). No es el módulo de aterrizaje de una misión actual.
- **El veredicto compara con límites que pone el usuario.** Las fuentes del proyecto no traen umbrales para aterrizar, así que el motor no inventa ninguno (cabecera de `calculos/motor/simulacion.ts`; `interfaz-referencia/ui/SeccionRequisitos.tsx:69`).

Origen: se pidió una simulación de aterrizaje con un asistente, con descenso físico, el guiado del Apollo, en 3D y con un veredicto según los requisitos del usuario (SPEC E26.1 y E26.2–E26.4, cerrados el 2026-11-07).

| Término | Significado en este documento |
|---|---|
| LM | Módulo lunar del Apollo. Aquí, su etapa de descenso |
| Contacto | Instante en que la sonda del LM toca el suelo, a 12 pies de altura (TN-D-6846, tabla I). Es la hora que elige el usuario |
| Encendido | Inicio del descenso con motor: el contacto menos la duración del descenso |
| P63, P64, P66 | Programas de guiado del Apollo: frenado, aproximación y descenso vertical (R-695) |
| Puerta alta | Fin del frenado e inicio de la aproximación. En el perfil del Apollo 11, a 7515 pies de altura (TN-D-6846, tabla I) |
| Puerta baja | Paso por 512 pies de altura (TN-D-6846, tabla I) |
| Regulador | Control del empuje del motor. No da cualquier valor: o el empuje fijo máximo o una región permitida (R-695 p. 8) |
| ΔV | Cambio de velocidad acumulado que entrega el motor |
| Impulso específico | Rendimiento del motor, en segundos. Fija cuánto combustible gasta un empuje dado |
| Rumbo | Azimut hacia donde vuela el LM al llegar |
| Estadía | Tiempo en superficie después del contacto |

## 2. Qué hace para quien la usa

### Asistente de 6 pasos

Archivo: `interfaz-referencia/ui/Asistente.tsx`. Título en pantalla: "Simular un aterrizaje".

| Paso | Qué se define |
|---|---|
| 1. Misión y nave | Nombre de la misión y días en superficie (de 1 a 30). Muestra la ficha del LM: masa al iniciar el descenso, combustible disponible, empuje máximo e impulso específico |
| 2. Sitio | Uno de los dos sitios con escena 3D |
| 3. Requisitos | Batería (horas seguidas sin Sol), inclinación máxima sobre las patas, combustible que debe sobrar, Tierra visible mínima en la estadía, y dos casillas: Sol visible en el contacto y Tierra visible en el contacto |
| 4. Fecha y hora | Hora del contacto en UTC, de 2026 a 2030. Vista previa: Sol y Tierra en el contacto y rumbo de llegada |
| 5. Comparar | Hasta 3 de las mejores horas de contacto del mes, junto a la elegida: Sol y Tierra en el contacto, noche más larga, Tierra en la estadía y cuántos requisitos cumple. Se elige una |
| 6. Resumen | Todo lo elegido, con un "cambiar" por fila, y el botón "Simular aterrizaje" |

- Los pasos se recorren en cualquier orden: hay un mapa de pasos, Atrás y Siguiente. "Saltar y explorar" cierra el asistente.
- Los requisitos van antes de la fecha porque la búsqueda de las mejores horas los usa (SPEC E26.2).
- Se abre solo la primera vez que se visita la página. También se abre con el botón "Simular un aterrizaje…", desde el planificador y desde la comparación (sección 6).
- Valores iniciales: el sitio activo, contacto el 2027-01-01 a las 00:00 UTC y los requisitos de ejemplo (`planPorDefecto` en `interfaz-referencia/ui/simulacionComun.ts`). La interfaz avisa que son un ejemplo, no una recomendación.

### Lo que se ve al simular

- **Descenso en 3D** (`interfaz-referencia/scene/Vuelo.tsx`). El modelo del LM recorre la trayectoria calculada. La línea va coloreada por fase (P63 naranja, P64 cian, P66 verde) y una cámara sigue al LM desde 60 m detrás y 20 m más arriba; se puede soltar. La línea es una ayuda de lectura, no un objeto físico.
- **Panel inferior**, plegable (`interfaz-referencia/ui/PanelSimulacion.tsx`):
  - Lecturas: fase y reloj desde el encendido, altura, distancia al sitio, velocidad vertical y horizontal, empuje e inclinación, y combustible.
  - Perfil de altura frente a distancia al sitio, con los mismos colores por fase. Sus escalas son de raíz cuadrada, no lineales, y la interfaz lo dice. Clic o arrastre elige el instante y mueve el LM en la escena.
  - Deslizador del descenso, con reproducción a ×1, ×10 o ×50.
  - Deslizador de la estadía, de 0 a los días en superficie. Su pista muestra las ventanas reales de Sol (arriba) y de Tierra (abajo). Al moverlo cambia el cielo de la escena y las lecturas dicen "En superficie".
- **Veredicto** en el panel lateral (`interfaz-referencia/ui/SeccionRequisitos.tsx`): "Tus requisitos (n de m)". Cada criterio dice "Cumple" o "No cumple", muestra su valor y deja cambiar el límite ahí mismo. El veredicto se recalcula al instante. Clic en un criterio lleva la escena al momento que lo decide.
- **Datatip del terreno**: al pasar el puntero muestra posición, altura, pendiente, inclinación del LM, y Sol y Tierra desde la altura de evaluación (SPEC E26.4).
- **Plan en la URL**: `?sitio=…&sim=…&req=…&mision=…`, con el contacto en milisegundos y los requisitos en JSON (`interfaz-referencia/ui/useSimulacion.ts`). Cambiar de sitio recarga la página, y el plan viaja en la URL para sobrevivir a la recarga. Abrir esa dirección reproduce la simulación.

La interfaz se revisó contra siete patrones de *Designing Interfaces* (DI) en cuatro rondas, hasta quedar sin hallazgos (SPEC E26.2–E26.4).

## 3. Motor de descenso (E26.1)

Archivo: `calculos/motor/descenso.ts`. Función principal: `simularDescenso(parametros, pasoS)`.

### 3.1 Modelo e integración

- El LM es una masa puntual sobre una Luna esférica de 1737,4 km, sin rotación ni relieve. El descenso ocurre en un plano.
- Gravedad: μ = 4902,801 km³/s² (FA tabla B.4, p. 673).
- Integración con paso de 0,1 s y método RK2 de punto medio, con el empuje constante dentro del paso.
- El combustible baja según el impulso específico de 305 s (DPS p. 7): gasto = empuje / (305 s × g₀), con el g₀ estándar de 9,80665 m/s².
- El cálculo va en unidades SI. Las cifras de las fuentes están en pies, libras y millas náuticas, y el código las convierte.
- Termina en el contacto, o antes si se agota el combustible.
- Salida, `ResultadoDescenso`: una muestra por segundo (tiempo, fase, altura, distancia al sitio, velocidades, masa, empuje, inclinación y ΔV), los instantes de los eventos, el ΔV total y el combustible usado.

### 3.2 Fases y guiado

| Fase | Nombre | Qué hace el guiado | Fuente |
|---|---|---|---|
| P63 | Frenado | Ordena la aceleración ACG = 12(RTG − RG)/T² + 6(VTG + VG)/T + ATG, una pasada cada 2 s. T es el tiempo que falta para el objetivo y se recalcula en cada pasada con una cúbica | R-695 ec. 7 (p. 16) y ec. 12 (p. 18) |
| P64 | Aproximación | La misma ecuación, hacia un objetivo sobre el sitio. T se fija al entrar y después avanza con el reloj | R-695 pp. 53–54 |
| P66 | Descenso vertical | Lleva la velocidad horizontal a cero (constante de tiempo de 5 s, empuje a no más de 20° de la vertical) y mantiene la velocidad vertical en −3 pies/s (constante de 1,5 s). Termina en el contacto | R-695 pp. 31–32 |

- En la ecuación, RTG, VTG y ATG son la posición, la velocidad y la aceleración del objetivo; RG y VG, las del LM en ese instante.
- P63 pasa a P64 cuando faltan 60 s para su objetivo (TN-D-6846 p. 10). Ese instante es el evento "puerta alta".
- P64 pasa a P66 cuando faltan 10 s para el suyo. Este valor es un **supuesto**: R-695 no lo da.
- En P64 no se recalcula T porque, sin redesignar el sitio, la ec. 12 se vuelve 0/0 sobre él (SPEC E26.1).

### 3.3 Regulador del empuje

- Primeros 26 s: 10 % del empuje nominal (TN-D-6846 tabla I y p. 32).
- Después: si el guiado pide más del 65 %, el motor queda en su punto fijo de 92,5 %. Si pide menos, da lo pedido, con un mínimo de 11 % (R-695 p. 8; DPS p. 7).
- "Recuperación del regulador" es el primer instante, pasado el arranque, en que el guiado pide menos del 65 % y el motor vuelve a regular.
- En P66 el empuje queda dentro de la región de 11 % a 65 %.

### 3.4 Constantes del LM (`LM_APOLLO11`)

| Constante | Valor | Fuente |
|---|---|---|
| Masa al iniciar el descenso | 34 000 lb (15 422 kg) | TN-D-6846 p. 32: "approximately 34 000 pounds" |
| Combustible disponible | 17 934,6 lb (8135 kg) | TN-D-6846 tabla II |
| Empuje nominal | 46 706 N (10 500 lbf) | R-695 p. 8; DPS p. 7 |
| Punto de empuje fijo | 92,5 % | DPS p. 7 |
| Región permitida del regulador | 11 % a 65 % | R-695 p. 8 |
| Impulso específico | 305 s | DPS p. 7 |

Las conversiones a kg usan el factor del código: 1 lb = 0,45359237 kg.

### 3.5 Objetivos y parámetros

R-695 explica cómo se eligen los objetivos de cada fase (pp. 51–56), pero no publica sus valores. El motor los arma así (objeto `PARAMETROS_APOLLO11`):

| Parámetro | Valor | De dónde sale |
|---|---|---|
| Estado inicial | 48 814 pies de altura, 5560 pies/s y −4 pies/s de velocidad vertical | TN-D-6846 tabla I |
| Término de P63 (puerta alta) | 7515 pies, −145 pies/s vertical, 485 pies/s horizontal, a 4,5 millas náuticas del sitio | TN-D-6846 tabla I |
| Objetivo de P63 | La puerta alta extrapolada 60 s, con 57 % de empuje a 60° de inclinación. La masa en ese punto se estima con el ΔV de la tabla I hasta allí, 5375 pies/s | R-695 p. 54; TN-D-6846 p. 10 |
| Término de P64 | 150 pies y −3 pies/s sobre el sitio | TN-D-6846 p. 10 |
| Objetivo de P64 | El término extrapolado 10 s | **supuesto** |
| Duración de P64 (TAPI) | 168 s | Derivado de la línea de tiempo de TN-D-6846 tabla I |
| Sacudida objetivo | 0 | Se probaron valores entre −0,004 y 0,006; empeoran la puerta alta (SPEC E26.1) |
| Alcance de encendido | 490 327 m (264,8 millas náuticas) | Hallado por bisección para que la puerta alta caiga a las 8:26. TN-D-6846 dice "approximately 260" (p. 8) |
| Altura de contacto | 12 pies | TN-D-6846 tabla I |

El alcance de encendido está fijo en el código (`calculos/motor/descenso.ts:95`). La prueba comprueba que deja la puerta alta a 8:26 ± 2 s.

### 3.6 Luz de la aproximación y rumbo

- `rumboApollo(azimutSol)` devuelve el rumbo opuesto al azimut del Sol: el LM llega con el Sol a la espalda.
- `luzDelDescenso(resultado, elevacionSol, azimutSol, rumbo)` toma el menor ángulo de la línea de vista del LM al sitio durante P64 y le resta la elevación del Sol. Con margen mayor que 0 se cumple el criterio de TN-D-6846 (p. 10): la línea de vista debe quedar por encima de la línea del Sol, porque por debajo el relieve se ve lavado.
- `posicionEnEscena(muestra, rumbo)` lleva cada muestra a los ejes de la escena 3D, con la caída de la esfera respecto del plano del sitio.

### 3.7 Validación contra el Apollo 11

Prueba: `calculos/pruebas-validacion/descenso.test.ts`, 8 pruebas. TN-D-6846 es una fuente independiente: de ella el motor solo toma el estado inicial, los dos términos y la duración de P64. Lo demás son resultados.

Tolerancias fijadas el 2026-11-07: tiempos ±15 s, alturas y velocidades ±10 %, ΔV y combustible ±3 %.

| | Motor | TN-D-6846 | Tolerancia |
|---|---|---|---|
| Puerta alta | 505,7 s; 7564 pies; −148 pies/s; 506 pies/s | 506 s (8:26); 7515; −145; 506 | calibrada, ±2 s |
| Puerta baja (512 pies) | 615 s | 606 s (10:06) | ±15 s, cumple |
| Contacto | 710 s | 714 s (11:54) | ±15 s, cumple |
| Estado a 2:56 | 45 468 pies; 4058 pies/s | 44 934; 4000 | ±10 %, cumple |
| Estado a 4:18 | 38 216 pies; 3164 pies/s | 39 201; 3065 | ±10 %, cumple |
| ΔV | 6708 pies/s | 6775 | ±3 %, cumple (−1,0 %) |
| Combustible | 16 837 lb | 16 960,9 (tabla II) | ±3 %, cumple (−0,7 %) |
| Alcance de encendido | 264,8 millas náuticas | ~260 | ±5 %, cumple |
| Recuperación del regulador | 408 s | 384 s (6:24) | ±15 s, **no cumple** (+24 s) |

- La recuperación del regulador llega 24 s tarde. Queda como diferencia conocida: depende del empuje final y de la inclinación de P63, que R-695 elige por búsqueda (SPEC E26.1). La prueba la acota a 30 s.
- Luz del Apollo 11: Horizons da el Sol a 10,70° de elevación y 88,8° de azimut en el sitio, el 1969-07-20 a las 20:17:40 UT, frente a los 10,9° nominales de TN-D-6846. La regla del rumbo da 268,8°: el Apollo 11 voló hacia el oeste, y la línea de vista queda por encima del Sol (`datos/luz-apollo11.json`; SPEC E26.1).

## 4. Simulación completa

Archivo: `calculos/motor/simulacion.ts`. Función principal: `simularAterrizaje(tabla, punto, contactoMs, requisitos, inclinacionGrados)`.

### 4.1 Entradas

- `tabla` y `punto`: la tabla de efemérides y el lugar con su horizonte. Son los mismos del planificador (ver [04-planificador.md](04-planificador.md)).
- `contactoMs`: la hora del contacto, en UTC.
- `inclinacionGrados`: inclinación del LM apoyado en el terreno, o `null` si no hay relieve detallado.
- `requisitos`, de tipo `Requisitos`:

| Campo | Significado | Valor de ejemplo |
|---|---|---|
| `diasSuperficie` | Días en superficie después del contacto | 3 |
| `bateriaHoras` | Horas seguidas sin Sol que aguanta la batería | 24 |
| `inclinacionMaximaGrados` | Inclinación máxima tolerada sobre las patas | 12° |
| `margenCombustibleKg` | Combustible que debe sobrar al contacto | 100 kg |
| `tierraEnContacto` | Exigir la Tierra visible en el contacto | sí |
| `tierraMinimaEstadia` | Fracción mínima de la estadía con la Tierra visible | 0,5 |
| `solEnContacto` | Exigir el Sol visible en el contacto | sí |

Los valores de ejemplo (`REQUISITOS_EJEMPLO`) no vienen de ninguna fuente.

### 4.2 Qué calcula

1. Toma el descenso nominal de la sección 3. Es el mismo para todos los sitios y fechas, y se calcula una sola vez (`descensoNominal`).
2. Encendido = contacto − duración del descenso.
3. Con el Sol en el contacto fija el rumbo (`rumboApollo`) y mide la luz de la aproximación (`luzDelDescenso`).
4. Sol y Tierra en el contacto, respecto del horizonte real del lugar.
5. Tierra durante el descenso: barrido cada 10 s desde el encendido. Se mide desde el sitio, no desde la nave.
6. Estadía: barrido cada 10 min desde el contacto durante `diasSuperficie` días, resumido con `resumir` del planificador. Guarda también cuándo empieza la noche más larga.
7. Combustible sobrante = combustible disponible − combustible usado.
8. Arma el veredicto.

### 4.3 Criterios del veredicto

| Criterio (`id`) | Qué mide | Cumple si | De dónde sale el límite |
|---|---|---|---|
| Combustible al contacto (`combustible`) | Combustible disponible del LM menos el usado en el descenso nominal | Sobra al menos `margenCombustibleKg` | Usuario |
| Línea de vista sobre el Sol en la aproximación (`luz-aproximacion`) | Menor ángulo de la línea de vista al sitio en P64, frente a la elevación del Sol en el contacto | La línea de vista queda por encima | Criterio de TN-D-6846 p. 10. No es editable |
| Sol en el contacto (`sol-contacto`) | Alguna parte del disco sobre el horizonte real | No se exige, o está visible | Usuario (casilla) |
| Tierra en el contacto (`tierra-contacto`) | Centro de la Tierra sobre el horizonte real | No se exige, o está visible | Usuario (casilla) |
| Noche más larga en la estadía (`noche`) | Mayor intervalo seguido sin Sol | No pasa de `bateriaHoras` | Usuario |
| Tierra visible en la estadía (`tierra-estadia`) | Fracción de la estadía con la Tierra visible | Llega a `tierraMinimaEstadia` | Usuario |
| Inclinación del LM sobre sus patas (`inclinacion`) | Inclinación del plano que pasa por los cuatro pies sobre el DTM | No pasa de `inclinacionMaximaGrados` | Usuario. Solo se evalúa si hay DTM |

- Cada criterio lleva un texto con su fuente, que la interfaz muestra al pasar el puntero.
- La inclinación se mide en el centro de la escena, con `apoyoLM` de `calculos/motor/evaluacion.ts` (`interfaz-referencia/ui/useSimulacion.ts:90`). En el paso "Comparar" del asistente no se evalúa: ahí el veredicto tiene 6 criterios.
- El combustible sobrante es el mismo en cualquier sitio y fecha, porque el descenso es el nominal: unos 498 kg (derivado de 17 934,6 lb disponibles menos las 16 837 lb usadas del SPEC E26.1). Este criterio solo cambia con el margen que pida el usuario.
- Clic en un criterio: la línea de vista lleva a la puerta alta; la noche y la Tierra en la estadía, al inicio de la noche más larga; los demás, al contacto (`interfaz-referencia/ui/useSimulacion.ts:184`).

### 4.4 Mejores horas de contacto

- `candidatosContacto(tabla, punto, desdeMs, hastaMs, requisitos, n)` prueba una hora cada 3 h. Descarta las que no tienen Sol o Tierra en el contacto, si se exigen. Ordena por noche más corta en la estadía y, a igualdad, por más Tierra. Devuelve las `n` mejores, separadas al menos 24 h.
- El asistente la usa en el paso "Comparar", con `n = 3` y una ventana de 29,5 días que empieza 15 días antes de la fecha elegida (`interfaz-referencia/ui/Asistente.tsx:278`).
- `sugerirContacto` aplica el mismo criterio y devuelve una sola hora. Hoy solo la usan las pruebas.
- Es una ayuda para empezar, no una optimización de misión (SPEC E26.2–E26.4).

### 4.5 Estado de la escena

`estadoGlobal(tabla, punto, ms)` entrega a la escena 3D la dirección, el diámetro y la distancia del Sol y de la Tierra, y la fase de la Tierra, desde la tabla global. Así la escena sirve para cualquier fecha de 2026 a 2030. Durante el descenso el instante es el encendido más el reloj; en la estadía, el contacto más las horas elegidas.

### 4.6 Pruebas

- `calculos/pruebas-validacion/simulacion.test.ts`, 5 pruebas:
  - El encendido es el contacto menos la duración del descenso, y el rumbo deja el Sol a la espalda.
  - El veredicto sigue a los requisitos: con requisitos laxos se cumplen todos los criterios editables; con requisitos imposibles fallan combustible, noche, Tierra en la estadía e inclinación.
  - La hora sugerida tiene Sol y Tierra en el contacto.
  - El estado global es coherente con el cielo del motor.
  - Los candidatos están separados al menos 24 h e incluyen la hora sugerida.
- `calculos/pruebas-validacion/motor.test.ts`: el estado global frente al estado por sitio en el Apollo 17, a ≤ 0,01° en el Sol y la Tierra y a ≤ 0,1 % en la fase.
- Al cierre de E26, `bun run test` pasa 100 pruebas en el primer grupo más 13 del sitio polar (SPEC E26.2–E26.4).

## 5. Escena 3D: en qué sitios existe

- Solo en los dos sitios de `SITIOS` (`calculos/motor/sitio.ts:5`): Apollo 17 (20,1911° N, 30,7723° E) y Connecting Ridge (89,46316° S, 222,5104° E).
- Motivo: la escena necesita datos propios de cada sitio. Son el relieve local a 2 m (Apollo 17: DTM NAC de LROC; Connecting Ridge: DTM de LOLA de 5 m de PGDA, remuestreado a 2 m), el horizonte y el valle. El criterio de inclinación usa ese mismo DTM.
- Los módulos del motor cargan los datos del sitio activo al arrancar, según el parámetro `?sitio=` de la página. Por eso cambiar de sitio recarga la página.
- Los demás lugares del planificador solo tienen máscara de horizonte. El asistente lo dice: "La simulación 3D existe en los sitios con relieve detallado. Para comparar otros sitios del polo sur usa el planificador (2D)" (`interfaz-referencia/ui/Asistente.tsx:130`).
- La trayectoria solo se dibuja a menos de 30 km del sitio (`interfaz-referencia/ui/useSimulacion.ts:132`). El frenado empieza a 490 km y se ve completo en el perfil del panel.
- Pendiente: extender la escena a las RoI de PGDA, que tienen DTM de 5 m (SPEC E26.2–E26.4).

## 6. Conexión con el planificador

| Desde | Botón | Qué pasa a la simulación | Código |
|---|---|---|---|
| Planificador | "Simular aterrizaje en 3D aquí (fecha)" | El sitio y el instante elegido en la línea de tiempo | `interfaz-referencia/ui/Planificador.tsx:184` |
| Comparación | "3D", en cada escenario | El sitio y el primer instante del escenario con Sol y Tierra visibles a la vez. Si no hay, el inicio del escenario | `interfaz-referencia/ui/Comparacion.tsx:109` |
| Panel lateral | "Simular un aterrizaje…" o "Nueva simulación…" | Nada: abre el asistente en el paso 1 | `interfaz-referencia/App.tsx:165` |

- Los dos primeros botones solo aparecen si el lugar es uno de los dos sitios con escena 3D.
- Los dos abren el asistente en el paso "Comparar", con el plan por defecto y esa hora de contacto (`interfaz-referencia/App.tsx:116`). No pasan el período, la altura del observador ni los requisitos.
- Mientras hay un plan activo, la página muestra la escena del sitio (`interfaz-referencia/App.tsx:108`).
- El panel de la simulación solo ofrece "Nueva simulación" y "Salir". No hay un botón que lleve ese escenario de vuelta al planificador.

## 7. Interfaz del motor

| Función o constante | Archivo en `calculos/motor/` | Qué hace |
|---|---|---|
| `simularDescenso(parametros, pasoS)` → `ResultadoDescenso` | `descenso.ts` | Descenso del encendido al contacto |
| `rumboApollo(azimutSol)` → grados | `descenso.ts` | Rumbo con el Sol a la espalda |
| `luzDelDescenso(resultado, elevacionSol, azimutSol, rumbo)` → `LuzDescenso` | `descenso.ts` | Criterio de luz de la aproximación |
| `posicionEnEscena(muestra, rumbo)` → `[x, y, z]` | `descenso.ts` | Muestra en ejes de la escena |
| `LM_APOLLO11`, `PERFIL_APOLLO11`, `PARAMETROS_APOLLO11`, `MU_LUNA` | `descenso.ts` | Constantes del LM, perfil de referencia de TN-D-6846 y parámetros del guiado |
| `descensoNominal()` → `ResultadoDescenso` | `simulacion.ts` | Descenso nominal, calculado una sola vez |
| `simularAterrizaje(tabla, punto, contactoMs, requisitos, inclinacion)` → `Simulacion` | `simulacion.ts` | Simulación completa con veredicto |
| `candidatosContacto(tabla, punto, desdeMs, hastaMs, requisitos, n)` → lista de ms | `simulacion.ts` | Las n mejores horas de contacto |
| `sugerirContacto(tabla, punto, desdeMs, hastaMs, requisitos)` → ms o `null` | `simulacion.ts` | La mejor hora de contacto |
| `estadoGlobal(tabla, punto, ms)` → `EstadoEscena` | `simulacion.ts` | Cielo de la escena en cualquier fecha |
| `REQUISITOS_EJEMPLO` | `simulacion.ts` | Requisitos iniciales de ejemplo |

Notas para portar:

- `descenso.ts` no importa ningún otro módulo: se puede copiar solo.
- `simulacion.ts` depende de `efemeridesLuna.ts`, `descenso.ts`, `planificador.ts` y `mascara.ts`, y del tipo `EstadoEscena` de `simulation.ts`.
- La inclinación del LM sale de `evaluacion.ts`, que carga el DTM del sitio activo. `simularAterrizaje` la recibe como número, así que el veredicto funciona sin ese módulo.
- El estado de la página (plan, reloj, URL) está en `interfaz-referencia/ui/useSimulacion.ts`.
- `montecarlo.ts` no participa en la simulación de aterrizaje.

## 8. Simplificaciones, límites y pendientes

Simplificaciones declaradas del motor de descenso (SPEC E26.1):

- Masa puntual. Luna esférica, sin rotación ni relieve: el suelo es la esfera en el sitio.
- Descenso en un plano, sin desvío lateral.
- Actitud instantánea, sin piloto automático.
- Guiado sin el retardo de cálculo: ec. 7 de R-695 en vez de la 11.
- Objetivos de fase extrapolados con aceleración constante y sacudida 0.
- El perfil del Apollo 11, con masa de 34 000 lb, se usa en cualquier sitio y fecha.

Límites de la simulación:

- La nave es el LM del Apollo. La masa, el motor y el perfil no se pueden cambiar desde la interfaz.
- El descenso no ve el relieve. Por eso la trayectoria y el combustible no dependen del sitio.
- El criterio de luz usa la elevación geométrica del Sol, no su altura sobre el horizonte real.
- El Sol y la Tierra de la simulación se evalúan a ras del suelo, sin importar la altura elegida en el planificador (`interfaz-referencia/ui/useSimulacion.ts:82`). En Connecting Ridge eso pesa: en el día lunar 1 la Tierra se ve el 19,56 % del tiempo a ras del suelo y el 55,11 % desde 10 m (SPEC E23).
- La inclinación se mide solo en el centro de la escena.
- El motor calcula la Tierra visible durante el descenso y la primera puesta del Sol después del contacto, pero la interfaz no los muestra.
- La escena 3D existe en dos sitios, y la trayectoria se dibuja solo dentro de 30 km.
- El LM aparece en vuelo sin pluma del motor ni polvo (SPEC E26.2–E26.4).

Pendientes anotados en el SPEC:

- La recuperación del regulador llega 24 s tarde (E26.1).
- Rotación de la Luna, 4,6 m/s en el ecuador, y retardo de cálculo, ec. 11 de R-695 (E26.1).
- El LM extendido del Apollo 17 (16 456 kg, con 8874 kg de combustible; NSSDCA) cambiaría el perfil (E26.1).
- Extender la escena 3D a las RoI de PGDA (E26.2–E26.4).
- Datatip del terreno con enlace de "evaluar aquí" (E26.2–E26.4).
- Umbrales de aterrizaje con fuente: pendiente máxima, alabeo tolerable y elevación del Sol al descender. Candidatos: documentos de diseño del LM o requisitos de Artemis (SPEC, Abiertas).

## 9. El simulador de la app (`/simulador`)

Las secciones anteriores describen el prototipo de referencia (`luna-recursos/`). Esta describe lo que hace hoy la pantalla `/simulador` de la app (código en `apps/web/src/features/simulator/alunizaje/`). Reproduce la misión planificada; no añade nada que no esté en el plan.

### 9.1 Dónde y cuándo
- Por defecto, la misión **CR-01** del Planificador: zona A, **Connecting Ridge RoI 6**, el **18 de diciembre de 2026**. Es el único sitio con relieve fino a 10 m.
- `?mission=<id>` aluniza en el sitio y la fecha de esa misión; `?sitio=<id>&fecha=<ISO>`, en cualquiera de los 28 sitios del Planificador.
- El Sol y la Tierra se calculan con el mismo motor que el Planificador (`@/shared/planning`: efemérides y máscara de horizonte del sitio, vistos a 1,7 m), así que las cifras coinciden. Comprobado en Connecting Ridge RoI 6 el 15 de noviembre de 2026 a las 00:00 UTC: Sol a 251,8° de acimut y 1,39° de altura, Tierra a −3,92° (bajo el horizonte) (`sitio.ts`).
- Relieve: LOLA. Connecting Ridge RoI 6 trae 6 km a 10 m y 20 km a 80 m; los demás sitios, 20 km a 80 m (`apps/web/scripts/build-simulador-sitios.ts`, LDEM_80S_80M). Alrededor del punto hay un suelo de detalle de 250 × 250 m con 90 cráteres pequeños y 520 rocas; ese detalle es generado, no es dato real (`detalle.ts`).

### 9.2 Descenso
- El módulo lunar del Apollo sigue la trayectoria nominal del Apollo 11 desde 500 m (P64 y P66), con el motor del equipo. No hay control manual: el guiado lleva la nave por la línea planeada.
- **Error de navegación:** el guiado deja la nave a unos 25 m (σ) del punto planificado (`aterrizaje.ts`).
- **Fallo del cálculo de altura:** con probabilidad 4 % con luz y 12 % a oscuras, el guiado apaga el motor entre 8 y 30 m sobre el suelo y la nave cae (caso real parecido: Hakuto-R M1, 2023).
- En P66 un recuadro muestra el riesgo del terreno justo bajo la nave.

- **Misión planificada (por defecto):** el sitio ya cumple con el relieve real, así que el resultado lo decide LOLA. El suelo de detalle (cráteres pequeños y rocas) es generado: el guiado lo esquiva buscando un punto limpio a menos de 30 m, como un sistema de evasión de peligros, y no hay fallo aleatorio de altura. Comprobado con 500 contactos en Connecting Ridge RoI 6: 500 en sitio seguro.
- **Modo entrenamiento (`&fallos=1`):** vuelven el fallo de altura al azar y las rocas y cráteres generados bajo la nave (500 contactos: 167 seguros, 167 inclinados, 166 vuelcos, 14 fallos de altura). Sirve para practicar emergencias; las cifras de la tabla siguiente son de este modo.

### 9.3 Contacto: resultados
El resultado lo deciden la inclinación del plano de las cuatro patas (a 4,6 m del centro), las rocas bajo la nave y la velocidad de contacto (`aterrizaje.ts`):

| Resultado | Condición | Caso real parecido |
|---|---|---|
| Nominal | Patas a menos de 6° y contacto a 3 m/s o menos | — |
| Posada, pero inclinada | 6° o más, o una roca de más de 0,3 m de radio bajo la nave | SLIM (Japón, 2024) |
| Aterrizaje duro | Más de 3 m/s, el límite del tren de aterrizaje | — |
| Vuelco | 12° o más (o 6° con un golpe duro), o más de 2 m/s de velocidad lateral | IM-1 Odysseus (2024), IM-2 Athena (2025) |
| Se estrella | 5 m/s o más: los tanques se rompen y los propelentes se encienden | Hakuto-R M1 (2023), Beresheet (2019) |

En modo entrenamiento, con el suelo de detalle (cráteres y rocas), en Connecting Ridge RoI 6 y con luz, una simulación de 20 000 contactos dio 31 % nominal, 32 % inclinada, 33 % vuelco y 4 % estrellada.

### 9.4 Caminata planificada (misión CR-02)
- Tras un aterrizaje nominal, inclinado o duro se puede salir: escotilla, porche, escalera peldaño a peldaño y primer paso, en primera persona.
- La caminata sigue la **ruta científica** del Planificador (paso «Walk», `prototipos/lunar-map/terrain.js`), dibujada en el suelo: **parada 1 · Borde iluminado** (muestra de regolito al Sol) y **parada 2 · Sombra permanente** (muestra con lámparas, posible hielo), con **regreso obligatorio en la parada 2** (`tareas.ts`). El relieve del Planificador es conceptual; aquí cada muestra se pone en el punto con Sol, o en sombra, real más cercano a su parada.
- Se camina a 1/6 de gravedad: cuesta arrancar y frenar, los saltos llegan a ~1,2 m y no se atraviesa el módulo.
- **Avisos del plan:** pendiente por delante de más de 15° (el límite de la ruta en el Planificador), salir a más de 40 m de la ruta, y cráteres de 2,5 m de radio o más: si se intenta cruzar uno, alarma y el lado por el que rodearlo (`caminata.ts`).
- **Traje** (cifras de referencia de la PLSS del Apollo / xEMU): O₂ 0,82 kg, agua de refrigeración 3,86 kg, cartucho de LiOH de 8870 kJ y batería de 279 Wh. Se gastan según el esfuerzo (120 W en reposo, 300 W caminando, 470 W al galope), el Sol o la sombra y las lámparas. El límite de regreso es la mitad de lo que dura el consumible más escaso, andando a 1,3 m/s (con el traje lleno, unos 17,5 km). El Sol y la Tierra avanzan con el reloj de la caminata (y del rover): cada 10 min de misión se recalculan con el motor del Planificador, y las sombras del relieve cada 2 h. Sin O₂ o con el cartucho saturado se pierde la misión. El módulo guarda reservas para recargar (21,8 kg de O₂ y 151 kg de agua); un aterrizaje duro rompe un tanque y deja la mitad.
- Teclas: WASD caminar, Shift galope, Espacio saltar, E recoger, G visor solar, L lámparas, R recargar junto al módulo (o reintentar), T tiempo ×10/×60, Q volver a volar el descenso.

### 9.5 EVA en el simulador
- Durante el descenso, EVA (la de toda la app) avisa del terreno en P66, del fallo de altura, del impacto y de los resultados malos.
- Durante la caminata vive dentro del visor del casco como holograma: comenta las paradas, los peligros (cráter, pendiente, salir de la ruta, oxígeno) y, si nadie toca nada durante 60 s, bromea con la ausencia.

## Fuentes citadas

| Clave | Fuente |
|---|---|
| R-695 | Klumpp, A. R., *Apollo Lunar-Descent Guidance*, MIT Charles Stark Draper Laboratory, R-695, junio de 1971 |
| TN-D-6846 | Bennett, F. V., *Apollo Experience Report: Mission Planning for Lunar Module Descent and Ascent*, NASA TN D-6846, junio de 1972 |
| DPS | Hammock, Currie y otros, *Apollo Experience Report: Descent Propulsion System*, NASA TN D-7143, marzo de 1973 |
| NSSDCA | Fichas de NASA NSSDCA de los LM del Apollo 11 y del Apollo 17 |
| FA | Wakker, *Fundamentals of Astrodynamics*, TU Delft, 2015 |
| DI | Tidwell, Brewer y Valencia, *Designing Interfaces*, 3.ª ed., O'Reilly, 2020 |
| HZN | NASA/JPL Horizons On-Line Ephemeris System, efemérides DE441 |

El modelo 3D del LM viene de NASA 3D Resources (clave NASA3D-LM). El registro completo, con enlaces y archivos, está en `investigacion/fuentes.md`.

- **Hablarle:** la tecla **H** (o el botón «EVA» en el celular) suelta el ratón y abre su panel para escribirle o hablarle. Con cada pregunta, EVA recibe lo que muestra el simulador (`window.HorizonSimulador.text()`, `paraEva.ts`): fase y altura del descenso, resultado del alunizaje, consumibles del traje y lo que dura cada uno, límite de regreso, distancia al módulo, Sol y Tierra del momento, pulso, tarea, muestras, rover y el informe final. Responde con esas cifras; no las calcula.

### 9.6 El plan completo por la URL
- `&ruta=segura|corta|cientifica`: la caminata sigue esa ruta del Planificador (sin ruta, la científica de CR-02). La segura tiene una parada, la corta ninguna; las dos terminan al final de la ruta y vuelven al módulo.
- `&eva=<h>`: la EVA sale esas horas después del alunizaje; al abrir la escotilla la escena pasa al Sol y la Tierra de ese momento (motor del Planificador). Un descenso nuevo vuelve a la luz del alunizaje.
- `&tipo=rover&vel=<km/h>&parada=<h>`: en vez de caminar se despliega un rover genérico que recorre la ruta de ida, a la velocidad máxima y con las horas por parada del plan (referencia: VIPER de NASA, hasta 0,8 km/h). Se conduce desde la Tierra: sin enlace directo, se detiene. En más de 25° las ruedas patinan; avisa por encima de 15°. El tiempo se acelera con T (×1, ×10, ×60, ×240); E mide en cada parada.
- `&tipo=fija`: módulo fijo; la misión es el alunizaje y termina en su informe.
- El planificador de misiones (`/planificar-mision.html`) arma este enlace con el botón «Simular esta misión».

### 9.7 Informe final y mini misiones
- Al terminar (de vuelta en el módulo con todas las muestras, o en la última parada del rover), un **informe** compara lo planificado con lo que pasó: alunizaje (resultado, desvío, velocidad de contacto, combustible), ruta, distancia, tiempo, muestras, salidas de ruta, pulso máximo, recargas y consumibles del traje (con rover: tiempo parado sin enlace y pendiente máxima). Veredicto: **cumplida**, **cumplida con incidentes** (alunizaje duro o inclinado, salidas de ruta, pulso de más de 150 lpm, alertas de cráter), **incompleta** o **perdida** (`informe.ts`). Lo planificado sale de los tiempos del Planificador: 2,2 km/h y 20 min por parada, ida y vuelta.
- **Mini misiones** (modo educativo, `retos.ts`): cinco retos de la caminata con su porqué: fiel a la ruta, corazón tranquilo (≤ 150 lpm), ahorro de oxígeno (volver con ≥ 70 % de O₂), a la oscuridad (muestra de sombra con lámparas) y ojo con los cráteres. Se puntúan en el informe y los logrados se guardan en el navegador.

### 9.8 En el celular
- En pantallas táctiles aparece una palanca (caminar o conducir), se mira arrastrando y hay botones con las teclas de cada momento; en el descenso, «Saltar» (`tactil.ts`). Con menos resolución y sombras más baratas para que vaya fluido.

### 9.9 Panel solar y antena
- `&panel=<m>&antena=<m>&estadia=<h>`: alturas del plan (las del Planificador: 2, 5, 10, 15, 20 o 30 m) y la estadía. En la caminata, la tecla **P** (botón «Panel» en el celular) despliega el panel y la antena 5 m por delante; con módulo fijo, el botón «Desplegar panel y antena» de la tarjeta del alunizaje (`estacion.ts`).
- Al desplegarlos aparece su informe, con el motor del Planificador (`equipoEn` en `sitio.ts`: `station` + `sweep` + `figures`, cada 10 min) desde ese momento hasta el fin de la estadía: % de tiempo con Sol en el panel y horas, energía que le llega por m² (kWh/m²) e irradiancia media, noche más larga, % con Tierra en la antena, corte de enlace más largo y % con los dos. El Sol se ve desde la altura del panel y la Tierra desde la de la antena, en el mismo punto del terreno; el panel es vertical y gira hacia el Sol (supuestos del Planificador); la energía es la que llega, no la eléctrica. Comprobado contra `figures()`: Shackleton rim RoI 4, 5–12 may 2027, panel 10 m y antena 2 m: 73,94 % de Sol, 100 % de Tierra, 26,33 h de noche, 152,94 kWh/m².
- Sus cifras pasan al informe final y a EVA. Un sitio sin paquete del simulador (K–M de las 13 zonas) muestra un aviso en vez de cargar otro.

### 9.10 El rover
- Modelo: el **Perseverance** de NASA/JPL (Mars 2020), de NASA 3D Resources (`github.com/nasa/NASA-3D-Resources`, libre según las normas de uso de imágenes y medios de NASA), elegido por el equipo como rover de ejemplo. Es un rover de Marte; se muestra a su tamaño real (3 m de largo). En el modelo el mástil viene plegado; la cámara de navegación va a 2 m, la altura de sus NavCams con el mástil desplegado. Se descarga solo en misiones con rover (5 MB). Si no carga, queda un rover de respaldo inspirado en VIPER (1,5 × 1,5 × 2,5 m, paneles verticales en tres lados). **Sin logos:** las normas de NASA dejan usar el modelo, pero no sus insignias; del modelo original se quitaron el emblema de la NASA, el logo del JPL, el logotipo «Mars 2020» y las dos placas «NASA» y «JPL» del chasis (tapados en las texturas `arm_graphics` y `mars_2020_03` con `apps/web/scripts/quitar-logos-perseverance.py`; geometría y animaciones, sin cambios). El nombre «Perseverance» se conserva.
- Se maneja desde la NAVCAM (arrastrar para mirar, R centra, C cambia a la cámara de seguimiento), se apoya en sus ruedas sobre el terreno, se despliega en el punto más llano a 10–20 m del módulo y con E perfora 1 m para recoger la muestra de cada parada (suma al reloj las horas por parada del plan).

### 9.11 Aviso de sitio empinado

Antes del descenso el simulador mide la pendiente real bajo las patas (relieve LOLA, sin el suelo de detalle, que es generado; `alunizaje/avisoSitio.ts`). Si pasa de 6° avisa que la nave quedará inclinada, y si pasa de 12°, que volcará; ofrece una RoI del mismo sitio cuando existe, descender de todos modos o volver al Planificador. Medido el 2026-11-15 sobre los paquetes de `public/simulador/sitios/`: avisan Nobile rim 1 (15,7°), Shackleton rim (31,3°) y Leibnitz Beta (7,6°). Son centros de un mosaico de relieve (PGDA), no zonas de aterrizaje elegidas (RoI).

### 9.12 Misiones guiadas: bitácoras reales y planes

EVA cuenta la misión paso a paso (`alunizaje/guiada.ts`): una ficha antes del descenso, lo que pasa al bajar, y en la superficie una tarjeta por hecho con su día, un «por qué importa» y sus fuentes; el cielo pasa a la fecha de cada hecho. Al final, a dónde seguir.

- **Misión real, `?bitacora=<id>`.** Los hechos salen de `apps/web/src/shared/bitacoras/` (cada uno con su fuente; una prueba lo exige). Hoy: **IM-1 Odysseus** (Intuitive Machines, NASA CLPS, 22 a 29 feb 2024): los telémetros láser no se pudieron usar y bajó con el lidar Doppler de la NASA, se posó en una pendiente de 12° (NASA LRO), quedó de lado y operó siete días hasta la noche lunar. En el simulador la nave vuelca como en la misión. **Límite:** su sitio real (80,13° S, 1,44° E) está a unos 300 km del polo, fuera de nuestro relieve y de nuestro motor de Sol y Tierra (190 km); se vuela sobre el macizo Malapert (a 178 km) como relieve de referencia, y la ficha lo dice.
- **Misión planificada, `&guia=<nombre>&bateria=<h>&tierra=<%>`** (o `?mission=<id>&guia=1`). Los pasos no son hechos: los calcula `evaluate` de `@/shared/planning` para ese lugar, esa fecha y ese equipo (`alunizaje/planGuiado.ts`): con qué luz se llega, el Sol y la Tierra al contacto, cada salida y puesta tras el relieve, la caminata si el plan la tiene, y el veredicto. La ficha dice que es un plan que no ha volado.
- **Desde el panel de misiones** (`prototipos/lunar-map/inicio.html`): la misión elegida muestra «Download log» y «Play simulation». La bitácora de una misión de la campaña es su plan calculado (`tools/bitacoras-campana.js` → `data/bitacoras-campana.js`); las que no tienen fecha (PS-03, DG-04) lo dicen. Las reales van en el recuadro «Real missions» (`data/bitacoras.js`, que sale de `node apps/web/scripts/exportar-bitacoras.ts`).
- El flujo guiado de EVA del equipo usa otra «misión real»: el descenso del Apollo 11 (`?nominal`, `features/assistant/eva/recorridos.ts`). Son dos caminos distintos.
