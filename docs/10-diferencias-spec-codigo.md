# 10. Diferencias entre el SPEC y el código

Lo que no coincide entre el registro del prototipo (`luna-recursos/investigacion/SPEC.md`) y su código, detectado al escribir esta documentación el 2026-11-14. Nada de esto se corrigió: la regla del prototipo es avisar y que decida el responsable. Mientras tanto, manda el código.

Las rutas son relativas a `luna-recursos/`. Cada línea citada se leyó el 2026-11-14.

## Lo que cambia un resultado o una decisión

| N.º | Qué pasa | Dónde | Efecto |
|---|---|---|---|
| 1 | La simulación de aterrizaje evalúa el Sol y la Tierra siempre a ras del suelo. No hereda la altura del observador elegida en el planificador, y el SPEC no lo dice | `interfaz-referencia/ui/useSimulacion.ts:82` | En Connecting Ridge la Tierra visible pasa de 19,56 % a ras del suelo a 55,11 % desde 10 m (SPEC E23). El veredicto puede no coincidir con lo que mostró el planificador |
| 2 | El criterio de combustible no depende del sitio ni de la fecha: el descenso es el nominal y se calcula una sola vez | `calculos/motor/simulacion.ts:64` | Ese criterio solo cambia con el margen que pida el usuario |
| 3 | El paso del planificador al simulador lleva solo el sitio y el instante. No lleva el período, la altura ni los requisitos | `interfaz-referencia/App.tsx:116` | Quien pasa de comparar a simular vuelve a los valores de ejemplo |
| 4 | Las coordenadas de IM-2 vienen de Wikipedia, según el propio catálogo, y esa fuente no está en `investigacion/fuentes.md` | `datos/catalogo-polo.json`, entrada `im-2` | Es el único lugar del catálogo sin fuente primaria. El catálogo anota el blanco publicado por LROC |
| 5 | El motor calcula la Tierra visible durante el descenso y la primera puesta del Sol tras el contacto, pero ninguna vista los muestra. El SPEC lista el primero como resultado (`investigacion/SPEC.md:930`) | `calculos/motor/simulacion.ts:170` y `:173` | Hay dos resultados calculados que el usuario no ve |

## Textos y comentarios que quedaron atrás

| N.º | Qué pasa | Dónde |
|---|---|---|
| 6 | La sección "No físico" de la interfaz aún dice "Luz terrestre = 1/10 000 del Sol con la Tierra llena: supuesto sin cita". Desde E9 el motor usa el valor derivado, 5,86·10⁻⁵. Ya estaba anotado en "Abiertas" (`investigacion/SPEC.md:1159`) | `interfaz-referencia/ui/Secciones.tsx:668` |
| 7 | Un comentario dice que la luz terrestre es proporcional a la fracción iluminada. El código usa la fase de la esfera lambertiana | `calculos/motor/environment.ts:241` (comentario) y `:257` (código) |
| 8 | La cuenta regresiva dice "sin cambios en los próximos 60 días", pero la búsqueda llega hasta el fin del período más 60 días | `interfaz-referencia/ui/Planificador.tsx:332` (texto) y `:217` (límite) |
| 9 | El título de una prueba dice ~12,19°/día para el punto subsolar. La comprobación y el SPEC usan 12,17 | `calculos/pruebas-validacion/motor.test.ts:393` (título) y `:397` (comprobación); `investigacion/SPEC.md:383` |
| 10 | Un comentario y un valor por defecto dicen que el relieve cercano se mira desde 1 m. Quedaron de E19; las llamadas pasan la altura de E21, así que el cálculo es correcto | `calculos/motor/evaluacion.ts:76` y `:79` |
| 11 | El comentario de `porMeses` cita LSB p. 58 para 29,53 d; el código usa 29,530589 d, cifra que el SPEC atribuye a FA p. 257 | `calculos/motor/planificador.ts:192` y `:194` |
| 12 | El asistente usa `candidatosContacto`. `sugerirContacto` solo la usan las pruebas, y el SPEC habla de "la sugerencia" | `interfaz-referencia/ui/Asistente.tsx:278`; `calculos/pruebas-validacion/simulacion.test.ts:30` |

## El SPEC contra sí mismo

| N.º | Qué pasa | Dónde |
|---|---|---|
| 13 | El bloque "Arquitectura" lista 12 archivos del motor y hoy hay 19. Faltan `mascara.ts`, `equipos.ts`, `demPolar.ts`, `efemeridesLuna.ts`, `planificador.ts`, `descenso.ts` y `simulacion.ts`, y la interfaz de E23 a E26 | `investigacion/SPEC.md:22` |
| 14 | "Abiertas" conserva entradas que pasos posteriores cerraron: datos reales de la NASA, sombra en terreno no plano, modo inverso, rebote con relieve y Tierra en el cielo | `investigacion/SPEC.md:1144`, `:1147`, `:1148`, `:1151` y `:1153` |
| 15 | "Abiertas" pide el mapa de Hapke a 643 nm. E17 usó 566 nm | `investigacion/SPEC.md:1145`; `calculos/motor/hapke.ts:106` |
| 16 | La irradiancia del primer día lunar aparece como 1369–1395 W/m². La prueba acota entre 1368 y 1396 | `investigacion/SPEC.md:279`; `calculos/pruebas-validacion/motor.test.ts:229` |
| 17 | El brillo del globo se describe como 0,085/0,177 "calibrado en el sitio". El código usa el albedo del sitio activo: en el polo queda 0,15/0,177, con el 0,177 medido en el Apollo 17 | `investigacion/SPEC.md:377`; `calculos/motor/lunaGlobal.ts:76` |

## El registro de fuentes

| N.º | Qué pasa | Dónde |
|---|---|---|
| 22 | `fuentes.md` no tiene filas para lo que entró en los pasos E22 a E24: la tabla global de Horizons, LOLA `LDEM_75S_240M`, los otros nueve mosaicos de PGDA con sus RoI y el alunizaje de IM-2. La procedencia sí está en las cabeceras de los scripts y en los metadatos de `datos/` | `investigacion/fuentes.md:19`; `calculos/scripts-de-datos/efemerides-luna.ts`, `dem-polo.ts` y `catalogo-polo.ts` |
| 23 | El año de Wagner et al. aparece como 2016 en el nombre de una prueba y como Icarus 283 (2017) en el registro | `calculos/pruebas-validacion/motor.test.ts:253`; `investigacion/fuentes.md:23` |

Las citas incompletas y lo que falta para el formulario de entrega están en [08-datos-y-fuentes.md](08-datos-y-fuentes.md), sección 7.

## Pruebas cuyo nombre dice más de lo que comprueban

Las pruebas pasan, pero su nombre promete algo que el código no revisa. El detalle está en [07-pruebas-y-validacion.md](07-pruebas-y-validacion.md), sección 7.

| N.º | Prueba | Lo que el nombre dice y el código no comprueba |
|---|---|---|
| 18 | `calculos/pruebas-validacion/simulacion.test.ts:28` | Que ninguna hora del mes con Sol y Tierra tiene una noche más corta que la sugerida |
| 19 | `calculos/pruebas-validacion/simulacion.test.ts:38` | Que el estado global coincide con `cieloEn` y que el azimut es consistente |
| 20 | `calculos/pruebas-validacion/simulacion.test.ts:44` | Que los candidatos cumplen Sol y Tierra en el contacto |
| 21 | `calculos/pruebas-validacion/motor.test.ts:650` | "Todas las horas de la tabla": el código muestrea cada 6 h |

## Para tener en cuenta al portar

- `interfaz-referencia/ui/Planificador.tsx:10` toma la constante `ALTURAS_OBSERVADOR_M` de `calculos/motor/evaluacion.ts`, que importa módulos de la escena (`:6`). Al llevar el planificador a otra carpeta conviene copiar la constante.
- La validación contra los mapas de Mazarico et al. (2011) cuenta la Tierra como "alguna parte del disco" (`calculos/pruebas-validacion/catalogo.test.ts:31`). El planificador la cuenta por su centro (`calculos/motor/planificador.ts`). Está documentado en [04-planificador.md](04-planificador.md); no es un error.
