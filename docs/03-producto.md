# 03. El producto: comparar, ver y ensayar

Cómo se ordenan el planificador, la vista 3D y el simulador en un solo recorrido, cómo se reparte ese recorrido en las tres pantallas de la aplicación y qué parte del prototipo sirve para cada una.

Las rutas de código de este documento son relativas a `luna-recursos/`, la copia del prototipo luna (commit 72f890f). Los números de línea se leyeron el 2026-11-14.

## La idea

**Comparar decide, el 3D explica y el simulador ensaya.**

| Paso | Pregunta de quien planifica | Qué usa |
|---|---|---|
| 1. Comparar | ¿Qué sitio y qué fecha? | Planificador y comparación de escenarios |
| 2. Ver en 3D | ¿Por qué ese escenario gana o pierde? ¿Qué tapa el Sol o la Tierra? | La escena del sitio en esa fecha |
| 3. Simular | ¿Mi misión cumple de principio a fin? | Descenso, estadía y veredicto contra los requisitos |

- **El reto se responde con el paso 1.** Pide comparar sitios y fechas con el Sol y la Tierra frente al horizonte (ver [01-reto.md](01-reto.md)).
- **El 3D y el simulador son el plus.** El reto los admite como una de varias formas de ver: "3D surface visualizations, or other creative representations that help users understand the spatial relationships between the landing site, Sun, and Earth".
- **El 3D no decide.** Hace visible por qué un sitio tiene luz y el de al lado no.
- **Del simulador, lo que responde al reto es la estadía:** las ventanas de Sol y de Tierra durante los días en superficie, y el veredicto. El descenso es lo que engancha.

## Las tres pantallas

La arquitectura propuesta para `apps/web` (PR #2 de este repositorio) define tres rutas. Así encaja el recorrido en ellas:

| Pantalla | Ruta | Pregunta que responde | Qué muestra |
|---|---|---|---|
| Landing | `/` | ¿Qué es esto y para quién es? | El problema, el usuario y la entrada al planificador ([02-problema-y-usuario.md](02-problema-y-usuario.md)) |
| Planificador de misiones | `/planificador` | ¿Qué sitio y qué fecha? | Lugares, cielo con el horizonte real, ventanas de Sol y de Tierra, cuenta regresiva, comparación de escenarios |
| Simulador 3D | `/simulador` | ¿Por qué? ¿Cumple mi misión? | El sitio en 3D con el Sol y la Tierra reales, el descenso, la estadía y el veredicto |

Qué hay en el prototipo para cada pantalla:

| Pantalla | Interfaz de referencia | Motor |
|---|---|---|
| Planificador | `interfaz-referencia/ui/Planificador.tsx`, `Comparacion.tsx`, `MapaPolar.tsx`, `lugares.ts` | `calculos/motor/planificador.ts`, `efemeridesLuna.ts`, `mascara.ts`, `demPolar.ts` |
| Simulador 3D | `interfaz-referencia/scene/` (escena), `interfaz-referencia/ui/Asistente.tsx`, `PanelSimulacion.tsx`, `SeccionRequisitos.tsx` | `calculos/motor/descenso.ts`, `simulacion.ts`, `sitio.ts` |

El detalle de cada uno está en [04-planificador.md](04-planificador.md) y [06-simulador.md](06-simulador.md).

## El recorrido de quien planifica

1. **Elige un lugar.** Del catálogo, o marcando un punto propio en el mapa del polo sur.
2. **Elige fecha y período.** Entre 2026 y 2030.
3. **Ve el Sol y la Tierra frente al horizonte real**, las ventanas de cada uno y cuánto falta para que se oculten.
4. **Guarda el escenario** en la comparación. Cambia el sitio o la fecha y guarda otro, hasta seis.
5. **Compara** las cifras lado a lado y elige.
6. **Abre el escenario elegido en 3D**, en el primer instante en que se ven el Sol y la Tierra a la vez.
7. **Simula el aterrizaje y la estadía**, y revisa el veredicto contra los requisitos de su misión.

Los lugares del catálogo vienen en cuatro grupos, más los puntos propios (`interfaz-referencia/ui/lugares.ts`):

- Sitios con escena 3D.
- Zonas de aterrizaje candidatas (RoI; Barker et al. 2021).
- Sitios del polo sur (centro del mosaico de PGDA).
- Misiones.
- Puntos propios, con horizonte aproximado.

## Antes y durante la misión

- **Antes:** el recorrido completo sirve para elegir sitio y fecha, y para volver a elegirlos cuando el calendario se mueve.
- **Durante:** la cuenta regresiva dice cuánto falta para que se oculte o salga el Sol, y lo mismo para la Tierra. Se calcula desde el instante elegido en la línea de tiempo (`calculos/motor/planificador.ts:154`, función `proximoCambio`). El prototipo no toma la hora actual por sí solo: para usarlo durante una misión hay que poner ese instante en la hora de la misión.

## Lo que ya está conectado en el prototipo

- **Del planificador al simulador:** botón "Simular aterrizaje en 3D aquí" (`interfaz-referencia/ui/Planificador.tsx:184`).
- **De la comparación al simulador:** botón "3D" en cada escenario (`interfaz-referencia/ui/Comparacion.tsx:109`). Entra en el primer instante con Sol y Tierra visibles (función `primerAmbos`, `Comparacion.tsx:209`).
- **Los dos abren el asistente en el paso "Comparar"** (`interfaz-referencia/App.tsx:116`). Los seis pasos del asistente son: Misión y nave, Sitio, Requisitos, Fecha y hora, Comparar y Resumen (`interfaz-referencia/ui/Asistente.tsx:17`).
- **Veredicto:** "Cumple / No cumple" por criterio, con límites que pone el usuario (`interfaz-referencia/ui/SeccionRequisitos.tsx:28`).

## Lo que hoy contradice el recorrido

| N.º | Qué pasa en el prototipo | Dónde | Qué hacer |
|---|---|---|---|
| 1 | Abre en la escena 3D, y la primera vez abre solo el asistente del simulador. El paso 1 queda escondido detrás del plus | `interfaz-referencia/App.tsx:49` y `:163` | En la aplicación nueva, entrar por la landing y de ahí al planificador |
| 2 | El paso al 3D solo existe en dos sitios: Apollo 17 y Connecting Ridge. En el resto del catálogo y en los puntos propios el botón no aparece | `calculos/motor/sitio.ts:5` | Decirlo en la interfaz. Extender la escena a más sitios quedó pendiente (SPEC E26.2–E26.4, Follow-up) |
| 3 | El simulador vuela el módulo lunar del Apollo | `interfaz-referencia/App.tsx:168` | Presentarlo como nave de ejemplo validada, no como la nave de una misión CLPS |
| 4 | El veredicto de viabilidad solo existe en la simulación | `interfaz-referencia/ui/SeccionRequisitos.tsx:28` | Decidir si se lleva a la comparación |
| 5 | La comparación no se guarda ni se comparte | `interfaz-referencia/ui/Planificador.tsx:96` | Decidir si viaja en la URL, como ya hace el plan de simulación |
| 6 | La interfaz está en español | SPEC, "Plan NASA Space Apps 2026", E28 | La entrega exige inglés (ver [09-entrega.md](09-entrega.md)) |

## Decisiones abiertas

- ¿La landing presenta el problema y el usuario, o va directo al planificador?
- ¿El veredicto de viabilidad entra a la comparación de escenarios?
- ¿La comparación se puede compartir con un enlace?
- ¿Cómo se avisa que la escena 3D existe solo en dos sitios?
- El nombre del proyecto para el formulario de entrega.
