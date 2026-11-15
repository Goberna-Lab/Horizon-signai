# Planificador — dueño: Francisco

Una misión en detalle (`/planificador/<id>`). Responde: "¿cumple? si no, ¿qué hago?" — mover la fecha, cambiar de lugar o subir el equipo.

- **Qué hay:** `MissionDetail` (requisitos, salidas comparadas con el plan, calendario de fechas que cumplen, cifras, escenario editable, equipo y supuestos) y `StayTimeline` (Sol, Tierra y ambos en la estadía, margen sobre el relieve, cursor, CSV). Estilos en `planner.css` con prefijo `pl-`.
- **El cálculo** está en `@/shared/planning` (`evaluate`, `scanDates`, `suggestDate`, `suggestHeight`, `outcome`). Definiciones: `docs/04-planificador.md`, sección 4. Si cambias una regla de cálculo, va en el núcleo con su prueba (`shared/planning/model/planner.test.ts`) y se avisa a Estephano.
- **Panel y antena:** el Sol se mide desde la altura del panel y la Tierra desde la de la antena (mismo punto del terreno). Es una simplificación declarada en pantalla.
- **Toda afirmación sobre la Luna cita su fuente; lo que no la tiene se marca supuesto** (en código y en pantalla).
- **No tocar:** `features/dashboard/` (Jean), `features/simulator/` (Jefferson).

## Siguiente
1. Comparar escenarios lado a lado (hasta 6), guardados con la misión.
2. Punto propio en el mapa (dentro de 190 km del polo) con `mascaraPolar` (`luna-recursos/calculos/motor/demPolar.ts`, portar al núcleo).
3. Cielo 360° con el horizonte real (referencia: `luna-recursos/interfaz-referencia/ui/Planificador.tsx`).
4. Orientación del panel (hoy: vertical que sigue al Sol, supuesto).
