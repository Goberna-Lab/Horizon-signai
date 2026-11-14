# 02. El problema y el usuario final

Para quién es la herramienta, qué problema tiene y qué necesita de ella. Cada punto lleva la frase del enunciado que lo respalda; lo que es lectura nuestra está marcado como **supuesto**.

Las rutas de código de este documento son relativas a `luna-recursos/`, la copia del prototipo luna (commit 72f890f).

## El problema

Hoy, comparar sitios y fechas de aterrizaje exige varias herramientas de especialista y leer datos crudos.

- **Los datos existen.** "Tools that provide this information — such as NASA's Quickmap, Moon Trek, and the JPL Horizons System — are built for detailed analysis".
- **Pero comparar es lento.** "Evaluating each site-data combination means navigating multiple interfaces and interpreting raw data."
- **Y no son para quien decide.** Esas herramientas "are often difficult for non-specialists to use effectively for rapid scenario comparison".
- **La decisión se repite.** "Hardware development challenges, launch delays, or other factors often force mission planners to reconsider their original landing date and location."
- **Un cambio pequeño pesa mucho.** "Small changes in landing location or date can dramatically affect both power generation potential and communication windows".

El enunciado lo resume así: hay "a gap between the technical data available and the accessible tools needed to support agile mission planning".

### De qué depende la decisión

| Tema | Pregunta de quien planifica | Qué dice el reto |
|---|---|---|
| Planificación de la misión | ¿Dónde y cuándo aterrizo? | "careful selection of landing sites and dates" |
| Comparar lugares | ¿Este sitio o el de al lado? | "evaluate alternative sites in the same region" |
| Horizonte y luz solar | ¿Cuándo hay Sol sobre el horizonte? | "The position of the Sun determines power availability for solar arrays and thermal conditions for equipment" |
| Comunicación | ¿Cuándo se ve la Tierra? | "the position of Earth determines whether direct communication is possible without relay satellites" |
| Terreno | ¿Qué me tapa el relieve? | "terrain elevation can significantly affect horizon positions and visibility windows" |
| Recarga con paneles | ¿Cuánto dura la luz y cuánto la noche? | "solar elevation angle (which affects power generation efficiency), duration of sunlight" |
| Mejores condiciones | ¿Qué combinación de sitio y fecha conviene? | "quickly assess whether a site-date combination is viable" |

## El usuario final

**Usuario principal: quien planifica la misión.** El reto lo llama *mission planner*. Es la persona que debe elegir sitio y fecha de aterrizaje, y volver a elegirlos cuando el calendario se mueve, sin ser especialista en efemérides ni en mapas lunares.

**Usuarios secundarios:** educadores, estudiantes y público.

### Lo que dice el reto

- **A quién nombra:** "lets mission planners, educators, and the public compare landing sites and dates quickly".
- **Cuándo lo necesita:** "When this happens, engineers need to quickly evaluate alternative sites in the same region, or alternative dates at the same site".
- **Entre quiénes está:** "careful coordination between science and engineering teams".
- **La jerarquía:** "could serve mission planners seeking detailed technical information for rapid decision-making, as well as educators and the general public".

En el enunciado, "mission planners" aparece seis veces, casi siempre ligado a evaluar o decidir. Los educadores, los estudiantes y el público aparecen en tres pasajes, dos de ellos como "as well as" o "also".

### Lo que es lectura nuestra (supuesto)

- **No es el especialista en dinámica de vuelo.** Esa persona ya trabaja con Horizons y Quickmap. El usuario es quien necesita la respuesta para decidir y para explicarla a ciencia e ingeniería.
- **No sabemos para quién trabaja.** El reto no dice si está en la NASA o en la empresa del módulo; solo que la categoría es "10 - CLPS". Lo definimos por la situación ("cambió la fecha") y no por el empleador.

### Su pregunta

> Se movió la fecha o el sitio. ¿Sigue siendo viable? ¿Qué alternativa es mejor?

La respuesta se mide en tres cosas: Sol sobre el horizonte (energía), Tierra sobre el horizonte (comunicación directa) y tiempo que queda hasta que se oculten.

## Lo que requiere el usuario

Requiere una sola cosa: saber rápido si una combinación de sitio y fecha le da Sol para la energía y Tierra para comunicarse, por cuánto tiempo, y poder compararla con otras cuando el plan cambia.

| N.º | Requisito | Frase del reto |
|---|---|---|
| 1 | Rapidez, sin datos crudos | "compare landing sites and dates quickly" |
| 2 | Comparar alternativas | "evaluate alternative sites in the same region, or alternative dates at the same site" |
| 3 | Sol y Tierra frente al horizonte real | "Sun and Earth positions relative to the horizon" |
| 4 | Energía | "solar elevation angle", "duration of sunlight" |
| 5 | Comunicación directa | "Earth visibility windows" |
| 6 | Tiempo restante | "how much time remains before sunset or Earthset" |
| 7 | Un veredicto de viabilidad | "quickly assess whether a site-date combination is viable" |
| 8 | Algo que entiendan ciencia e ingeniería | "coordinating between science and engineering teams" |

Que el requisito 8 implique poder compartir el resultado es lectura nuestra (**supuesto**).

El usuario secundario pide otra cosa: entender por qué el polo sur es difícil. El reto lo dice así: "why the Moon presents such distinct engineering challenges".

## Qué cubre hoy el prototipo

Esto sale del código y del SPEC del prototipo; no es una prueba en pantalla.

| N.º | Requisito | Estado | Dónde |
|---|---|---|---|
| 1 | Rapidez | Por comprobar | La primera vez se abre solo un asistente de 6 pasos para simular un descenso (`interfaz-referencia/App.tsx:163`) |
| 2 | Comparar | Cubierto | Hasta 6 escenarios y vista mes a mes (`interfaz-referencia/ui/Planificador.tsx:179`). Fechas de 2026 a 2030 |
| 3 | Horizonte real | Cubierto | SPEC E22 a E24; ver [04-planificador.md](04-planificador.md) |
| 4 | Energía | Cubierto, con un supuesto | La energía se calcula sobre un panel vertical que gira hacia el Sol; esa disposición es un **supuesto** (`calculos/motor/planificador.ts:8`) |
| 5 | Comunicación | Cubierto | "Tierra visible" y "Silencio más largo" (`interfaz-referencia/ui/Comparacion.tsx:39` y `:42`) |
| 6 | Tiempo restante | Cubierto | Cuenta regresiva del Sol y de la Tierra (`calculos/motor/planificador.ts:154`) |
| 7 | Viabilidad | Parcial | El "Cumple / No cumple" solo existe en la simulación de aterrizaje (`interfaz-referencia/ui/SeccionRequisitos.tsx:28`). La comparación solo resalta la mejor cifra (`interfaz-referencia/ui/Comparacion.tsx:104`) |
| 8 | Compartir | Parcial | El plan de simulación viaja en la URL (`interfaz-referencia/ui/useSimulacion.ts`). La comparación de escenarios no se guarda ni se exporta |

## Las tres brechas

Los requisitos 2 a 6 ya están calculados. Las brechas están justo donde el reto pone el problema: decidir rápido y entre equipos.

1. **Entrada.** El usuario pide comparar sitios y fechas, y el prototipo lo recibe con la simulación de un descenso.
2. **Veredicto.** El "viable o no" vive en la simulación, no en la comparación, que es donde el planificador decide.
3. **Compartir.** El resultado de la comparación no sale de la pantalla.

Cómo se ordena esto en el producto está en [03-producto.md](03-producto.md).

## Frases listas para la entrega

Son borradores. La página de entrega va en inglés.

| | Español | English |
|---|---|---|
| Problema | Comparar sitios y fechas de aterrizaje exige hoy varias herramientas de especialista y leer datos crudos. | Comparing landing sites and dates today means working across several specialist tools and reading raw data. |
| Usuario | Nuestro usuario es quien planifica una misión de aterrizaje lunar y debe decidir sitio y fecha, sobre todo cuando el calendario cambia, sin ser especialista en efemérides ni en cartografía lunar. | Our user is the mission planner who has to pick, and re-pick when the schedule slips, a landing site and date, without being an ephemeris or lunar-mapping specialist. |
| Reto | Convertir datos complejos de efemérides y de terreno en una comparación clara y rápida de sitios y fechas, para que quien planifica vea cuándo hay Sol para la energía y Tierra para comunicarse. | Turn complex ephemeris and terrain data into a clear, fast comparison of landing sites and dates, so a mission planner can see when a site has Sun for power and Earth for direct communication. |
