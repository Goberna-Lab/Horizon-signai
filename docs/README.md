# Documentación del proyecto

Reto: **Lunar Landing Site Navigator**, NASA Space Apps Challenge 2026 (categoría 10 - CLPS).

Esta carpeta reúne el contexto del reto y la documentación de lo que ya está calculado, probado e investigado en el prototipo `luna`. El código, los datos y el registro original de esa investigación están en [`../luna-recursos/`](../luna-recursos/LEEME.md).

## Por dónde empezar

| Si quieres saber… | Lee |
|---|---|
| Qué pide el reto, con el enunciado literal | [01-reto.md](01-reto.md) |
| Para quién es la herramienta y qué necesita | [02-problema-y-usuario.md](02-problema-y-usuario.md) |
| Cómo encajan el planificador, el 3D y el simulador | [03-producto.md](03-producto.md) |
| Cómo calcula el planificador de sitio y fecha | [04-planificador.md](04-planificador.md) |
| El modelo físico y los demás cálculos del motor | [05-calculos.md](05-calculos.md) |
| Cómo funciona la simulación de aterrizaje | [06-simulador.md](06-simulador.md) |
| Qué está probado y contra qué fuente | [07-pruebas-y-validacion.md](07-pruebas-y-validacion.md) |
| Qué datos de la NASA y qué fuentes se usan | [08-datos-y-fuentes.md](08-datos-y-fuentes.md) |
| Qué hay que entregar, cuándo y con qué reglas | [09-entrega.md](09-entrega.md) |
| Qué no coincide entre el SPEC y el código del prototipo | [10-diferencias-spec-codigo.md](10-diferencias-spec-codigo.md) |

Para ponerse al día en diez minutos: 02, 03 y 09.

## Qué hay en `luna-recursos/`

Es una copia del prototipo luna (commit 72f890f, del 2026-11-07), reorganizada para consulta. Los archivos son idénticos a los originales.

| Carpeta | Qué tiene | Ruta en el prototipo |
|---|---|---|
| `calculos/motor/` | Los cálculos, en TypeScript puro, sin React ni three | `src/engine/` |
| `calculos/pruebas-validacion/` | Las pruebas contra las fuentes | `tests/` |
| `calculos/scripts-de-datos/` | Los scripts que bajaron y procesaron cada dato | `scripts/` |
| `datos/` | Los datos ya procesados, cada uno con su procedencia | `src/data/` |
| `interfaz-referencia/` | La interfaz anterior (React y React Three Fiber), solo como referencia | `src/ui/`, `src/scene/`, `src/App.tsx` |
| `investigacion/` | `SPEC.md` (cada paso, decisión y pendiente), `fuentes.md`, la matriz de trazabilidad y el enunciado original | raíz y `docs/` |
| `reto-space-apps/` | Las guías oficiales de 2026, en texto | — |

Tres avisos sobre esa copia:

- **No corre tal cual.** Los `import` conservan las rutas originales (`../engine/…`, `../data/…`). Para usar un archivo en `apps/` o `packages/` hay que copiarlo y ajustar sus rutas.
- **No entra en la imagen de Docker.** `luna-recursos/` y `docs/` están en `.dockerignore`.
- **Los libros no están.** Los PDF citados tienen derechos de autor o pesan demasiado. Quedan citados con su enlace en [08-datos-y-fuentes.md](08-datos-y-fuentes.md).

## Cómo leer estos documentos

- **Cada afirmación sobre la Luna cita su fuente:** una sección del SPEC (por ejemplo "SPEC E23"), una clave de `luna-recursos/investigacion/fuentes.md` con su página, o un archivo de código.
- **Lo que no tiene fuente se marca como supuesto.**
- **Las simplificaciones se dicen.** Cada documento técnico cierra con sus límites.
- **Las rutas de código son relativas a `luna-recursos/`**, salvo que se diga otra cosa.
- **Las citas del reto y de las guías van en inglés,** tal como están publicadas.

## Estado

- **Idioma.** Estos documentos están en español, para el trabajo del equipo. La entrega exige inglés en la página y en todo lo enlazado ([09-entrega.md](09-entrega.md)): falta la versión en inglés de lo que se vaya a enlazar.
- **Pendientes del producto.** Están en [03-producto.md](03-producto.md), sección "Decisiones abiertas".
- **Pendientes de la entrega.** Están en [09-entrega.md](09-entrega.md), secciones "Riesgos abiertos" y "Lista antes de enviar".

## Uso de herramientas de IA

El prototipo luna y estos documentos se hicieron con un asistente de programación (Claude Code, de Anthropic). Los documentos se redactaron a partir del SPEC, el código y las pruebas del prototipo. Los commits lo registran en la línea `Co-Authored-By`.

## Aviso

Proyecto independiente de participantes del NASA Space Apps Challenge. Usa datos públicos de la NASA y cita cada fuente; no tiene el respaldo de la NASA.
