# Dashboard — dueño: Jean

Vista general de todas las misiones (`/dashboard`). Responde: "¿está todo bien? si no, ¿qué misión y por qué?".

- **Qué hay:** `AlertBar` (un solo aviso arriba; rojo de señal solo si algo falla), `Summary` (KPIs y cronograma), `MissionList`, `SunLink` (Sol, Tierra y ambos de la misión elegida, con cuenta regresiva desde el aterrizaje). Estilos en `dashboard.css` con prefijo `db-`.
- **De dónde salen los datos:** solo de `@/shared/planning` (`MissionRow`, `reasons`, `percent`…). No calcules nada aquí: si te falta una cifra, pídela al núcleo (Estephano).
- **Quién lo monta:** `app/workspace/Workspace.tsx` compone el Dashboard con el mapa y el Planificador. Cambios de layout general → avisar a Estephano.
- **No tocar:** `features/mission-planner/` (Francisco), `shared/planning/` (núcleo).

## Siguiente
1. Notificaciones: lista de cambios recientes (fecha movida, misión que pasó a fallar) además del aviso único.
2. KPIs por mes y filtro por estado en el cronograma.
3. Vista en teléfono (≤ 600 px): lista primero, mapa debajo.
4. Prueba manual: con las misiones de ejemplo, INTI-2 debe salir en rojo con "Earth hidden at landing · longest night 105 h, battery 50 h".
