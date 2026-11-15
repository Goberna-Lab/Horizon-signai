# Simulación y alunizaje — dueño: Jefferson

`/simulador?mission=<id>`. Responde: "¿mi misión cumple de principio a fin?" y, en modo educativo, "¿por qué?".

- **Entrada:** el id de la misión en la URL. Léela con `useMissions()` y evalúala con `useTable`, `useMasks`, `useEvaluations` de `@/shared/planning`: las cifras deben ser las mismas del Planificador.
- **Referencia validada:** `luna-recursos/calculos/motor/descenso.ts` y `simulacion.ts` (descenso del Apollo LM, validado contra NASA TN D-6846) y la escena en `luna-recursos/interfaz-referencia/scene/`. Detalle: `docs/06-simulador.md`. Presentar el módulo del Apollo como nave de ejemplo, no como una nave CLPS.
- **La landing ya tiene un relieve 3D** (`features/landing/flight/`): no lo importes (una feature no importa de otra); si lo necesitas, se mueve a `shared/` con Angel y Estephano.
- **IA educativa:** monta `<AssistantDock mode="educational" context={missionContext(row)} />` de `@/features/assistant`… pero como no se importan features entre sí, el montaje va en la página del simulador vía `app/` (pídelo a Estephano) o se mueve el dock a `shared/`.
- Estilos con prefijo `sim-`. three.js solo se carga aquí (ruta diferida).

## Siguiente
1. Registrar la primera escena en `scenes/registry.ts` con el sitio de la misión.
2. Paso a paso: descenso → contacto → estadía con las ventanas de Sol y Tierra de `evaluate`.
3. Veredicto final contra los requisitos de la misión.
