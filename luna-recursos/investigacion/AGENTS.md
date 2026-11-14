# Reglas del proyecto luna

Experimento: un entorno lunar 3D con reglas físicas claras, construido de a poco. Antes de actuar, lee `SPEC.md`.

1. **Nada sin aprobación.** El agente propone el paso (qué archivos, qué comandos, cómo se verifica); Estephano aprueba; recién entonces se ejecuta.
2. **Un paso a la vez:** una regla física, una implementación pequeña, una prueba verificable. Solo el paso aprobado; lo demás va a "Abiertas" en `SPEC.md`.
3. **Toda afirmación sobre la Luna cita su fuente** (libro, capítulo, página, de `docs/fuentes.md`). Sin fuente, se marca **supuesto** en el código y en el spec.
4. **Las simplificaciones se dicen.** Ejemplo: "el Sol no reproduce efemérides reales". Lo que no es físico (luz de trabajo, exposición aumentada) se nombra así en el código y se ve en la interfaz (ENV-006).
5. **Cada decisión se anota** en `SPEC.md` con fecha y motivo. El enunciado original de cada experimento está en `experimentos/` y no se reescribe; los cambios van al spec.
6. **Separar reglas y representación:** `src/engine/` (constantes y simulación, sin React ni three) y `src/scene/` + `src/ui/` (representación).
7. **Verificación antes de "listo":** `bun run build` sin errores; la prueba visual la hace Estephano con la lista del paso.
8. **Si el spec y el código no coinciden, avisar.** No se corrige en silencio ninguno de los dos: se reporta la diferencia (con `archivo:línea`) y Estephano decide; mientras tanto, manda el código y la diferencia va a "Abiertas".
9. **Al planear, citar el código real y preguntar.** El plan de un paso cita `archivo:línea` de lo que va a tocar y lista las decisiones abiertas como preguntas, en vez de suponerlas.
10. **No manejar la interfaz ni crear proyectos de prueba.** El agente no abre el navegador ni simula clics para dar algo por bueno; la prueba visual es de Estephano.
11. **Cerrar cada paso con Outcome y Follow-up** en su sección de `SPEC.md`: qué se hizo y cómo se verificó (Outcome), y qué quedó pendiente o se descubrió (Follow-up, que también va a "Abiertas" si aplica).

Stack: Bun (no npm), Vite, React, three.js con React Three Fiber y drei. Español neutro peruano en docs y código de dominio; commits en inglés (Conventional Commits).
