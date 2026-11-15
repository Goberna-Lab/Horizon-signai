# Núcleo de planificación — dueño: Estephano

El motor validado del prototipo luna, las misiones y los datos. Todas las pantallas leen de aquí (`import … from "@/shared/planning"`).

- `engine/`: copia sin cambios de `luna-recursos/calculos/motor/` (solo los `import` llevan `.ts`). Lo que se cambie aquí se cambia en el original.
- `model/`: evaluación de misiones (`evaluate.ts`), formato (`format.ts`), misiones de ejemplo y límites (`missions.ts`), tipos y pruebas.
- `data/`: generado con `bun apps/web/scripts/build-planner-data.ts --relief` (comprueba el SPEC E23 antes de escribir). No editar a mano.
- `store.ts` (lista de misiones), `hooks.ts` (tabla, máscaras, evaluaciones en React), `context.ts` (contexto para la IA).
- Cambiar una regla de cálculo = prueba nueva en `model/planner.test.ts` + `npm test`.
