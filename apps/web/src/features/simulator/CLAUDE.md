# Simulación y alunizaje — dueño: Jefferson

`/simulador?mission=<id>`. Responde: "¿mi misión cumple de principio a fin?" y, en modo educativo, "¿por qué?".

- **Entrada:** el id de la misión en la URL. Léela con `useMissions()` y evalúala con `useTable`, `useMasks`, `useEvaluations` de `@/shared/planning`: las cifras deben ser las mismas del Planificador.
- **Referencia validada:** `luna-recursos/calculos/motor/descenso.ts` y `simulacion.ts` (descenso del Apollo LM, validado contra NASA TN D-6846) y la escena en `luna-recursos/interfaz-referencia/scene/`. Detalle: `docs/06-simulador.md`. Presentar el módulo del Apollo como nave de ejemplo, no como una nave CLPS.
- **La landing ya tiene un relieve 3D** (`features/landing/flight/`): no lo importes (una feature no importa de otra); si lo necesitas, se mueve a `shared/` con Angel y Estephano.
- **IA educativa:** monta `<AssistantDock mode="educational" context={missionContext(row)} />` de `@/features/assistant`… pero como no se importan features entre sí, el montaje va en la página del simulador vía `app/` (pídelo a Estephano) o se mueve el dock a `shared/`.
- Estilos con prefijo `sim-`. three.js solo se carga aquí (ruta diferida).

- **Misiones guiadas** (`docs/06-simulador.md`, 9.11 y 9.12): `?bitacora=<id>` (misión real, de `@/shared/bitacoras`) y `&guia=<nombre>` (misión planificada, pasos calculados por `evaluate`). `alunizaje/guiada.ts` las cuenta; `planGuiado.ts` arma el plan; `avisoSitio.ts` avisa de la pendiente real antes de bajar. Toda bitácora real lleva fuente en cada hecho; al añadir una, `node apps/web/scripts/exportar-bitacoras.ts`.

## Siguiente
1. Más bitácoras reales (IM-2 Athena tiene paquete 3D en su sitio real; Blue Ghost M1).
2. Tipo de misión y actividades en el modelo (`Mission`), con el núcleo y el Planificador: hoy el tipo llega por la URL.
3. El aviso de pendiente también dentro de una misión guiada planificada.
