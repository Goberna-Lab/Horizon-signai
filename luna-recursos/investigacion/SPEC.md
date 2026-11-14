# Lunar Landing Site Navigator (repo luna): spec

Un entorno lunar 3D con reglas físicas claras y una arquitectura sencilla para probarlas. Principio: **una regla física, una implementación pequeña, una prueba verificable.** Enunciado original: `experimentos/01-entorno-lunar.md`.

**Objetivo** (Estephano, 2026-11-06): "un motor científico abierto que permite evaluar las condiciones de un aterrizaje lunar, con una interfaz visual para hacerlo comprensible". El motor (`src/engine/`) es lo científico: datos con fuente, pruebas contra fuentes. La interfaz (`src/scene/`, `src/ui/`) lo hace comprensible. Cada paso nuevo se justifica por lo que aporta a esa evaluación.

## Reglas del entorno

| ID | Regla | Aplicación | Paso |
|---|---|---|---|
| ENV-001 | La Luna prácticamente no tiene atmósfera: ~2×10⁵ moléculas/cm³ de noche y ~10⁴ de día, unos 14 órdenes de magnitud menos que la Tierra (LSB cap. 3.9, pp. 40–41; tabla 3.1, p. 28); la radiación solar llega completa (LSB p. 603) | Cielo negro, sin niebla ni dispersión | E1 |
| ENV-002 | La iluminación principal viene del Sol | Una luz direccional representa la radiación solar | E2 |
| ENV-003 | Los objetos bloquean la luz solar | Sombras sobre la superficie | E2 |
| ENV-004 | La escala tiene unidades físicas | 1 unidad 3D = 1 metro | E1 |
| ENV-005 | El tiempo controla el estado de la escena (día lunar promedio = 29,531 d, LSB p. 58; el real del sitio sale de las efemérides) | `estado(t)` puro sobre la tabla de JPL Horizons; avanzar, retroceder y pausar con resultado idéntico | E3, E5 |
| ENV-006 | Iluminación física y exposición visual son distintas | Toda ayuda visual no física se nombra y se ve en la interfaz | E1 en adelante |
| ENV-007 | El Sol no es un punto: es un disco de 0,533° (FA pp. 671 y 673); la Tierra, de ~1,90° (derivado de FA p. 410; Horizons usa R⊕ = 6378,137 km, FA p. 672) | Sombras con penumbra calibrada por luz (PCSS con Δd·tan(θ/2)); el disco sale y se pone de forma gradual | E3.1 |
| ENV-008 | El suelo lunar no es plano: la sombra depende de la pendiente y L = h/tan α deja de valer (Fielder, SM cap. 4) | Relieve real del Apollo 17 (LROC NAC DTM, 2 m/píxel); sombras del terreno sobre sí mismo; la medición compara suelo plano y relieve | E6 |
| ENV-009 | El terreno iluminado devuelve luz según su reflectancia (LSB A3.2, p. 59; p. 308; cap. 3, p. 30) | Terreno: un rebote calculado sobre el relieve real (radiosidad, RTR pp. 442–443; PBR p. 577). Poste: plano infinito ρ·E·(1 − n_y)/2. Regolito lambertiano de 0,085 | E2.1, E8, E11 |
| ENV-010 | En la cara visible, la Tierra, casi fija en el cielo, ilumina según su fase (LSB A3.1, p. 58; cap. 3, pp. 29–30) | Luz direccional desde la posición real de la Tierra: esfera lambertiana de albedo de Bond 0,32 (FA p. 542) con su fase real; ~5,9·10⁻⁵ del Sol con la Tierra llena | E2.1, E5, E9 |

## Arquitectura

```
src/
├── engine/          reglas y estado, sin React ni three
│   ├── environment.ts   constantes y reglas (ENV-*)
│   ├── simulation.ts    estado(t): interpola las efemérides reales (E5); días lunares dia(k)/diaDe(t) (E18)
│   ├── terreno.ts       relieve real: altura, pendiente, sombra sobre el relieve (E6)
│   ├── horizonte.ts     horizonte real del sitio por azimut (E10)
│   ├── rebote.ts        radiosidad de un rebote sobre una malla de alturas (E11)
│   ├── hapke.ts         BRDF de Hapke del regolito, calibrada (E12)
│   ├── verificacion.ts  comprobaciones, serie del día y perfil para la interfaz (E13)
│   ├── evaluacion.ts    evaluación del punto de aterrizaje: apoyo del LM, Sol y Tierra visibles (E19)
│   ├── sitio.ts         registro de sitios y sitio activo (?sitio=, LUNA_SITIO) (E20)
│   ├── lunaGlobal.ts    marco selenográfico y brillo del globo (E14)
│   ├── reboteSitio.ts   rebote del relieve del Apollo 17 por vértice (E11)
│   └── montecarlo.ts    integración de referencia para las pruebas (E7)
├── data/
│   ├── efemerides-apollo17.json   tabla de JPL Horizons con su procedencia (E5)
│   ├── relieve-apollo17.json      recorte del NAC DTM de LROC con su procedencia (E6)
│   └── horizonte-apollo17.json    perfil del horizonte desde SLDEM2015 (E10)
├── scene/
│   ├── LunarScene.tsx   representación con React Three Fiber
│   ├── penumbra.ts      parche de sombras: penumbra calibrada (ENV-007) y plano del receptor (E6)
│   ├── Terreno.tsx      malla del relieve (con el rebote por vértice) y cuadrícula que lo sigue (E6, E11)
│   ├── Cielo.tsx        Sol, Tierra y silueta de los macizos (E9.1, E10)
│   ├── LunaCompleta.tsx vista global de la Luna (E14)
│   ├── Valle.tsx        valle de Taurus-Littrow en 3D (E16)
│   └── materiales.ts    regolito lambertiano con la luz indirecta inyectada (E11)
├── ui/
│   ├── Panel.tsx        panel lateral plegable
│   ├── Secciones.tsx    Tiempo, Sol, Medición, Verificación, Luz, Cámara, No físico
│   └── Verificacion.tsx tabla esperado/simulado, gráfica del día, perfil de la sombra (E13)
└── App.tsx
```

## Diseño de la interfaz

Fuente: *Designing Interfaces*, 3.ª ed. (Tidwell, Brewer, Valencia; O'Reilly 2020). Páginas con ~ son aproximadas.

| Patrón | Qué dice | Aplicación |
|---|---|---|
| Center Stage (cap. 4, pp. 231–232) | Lo principal ocupa el área más grande, al menos el doble que los márgenes | El mapa ocupa toda la ventana; el panel mide ~280 px |
| Collapsible Panels (cap. 4, pp. 249–250) | Lo secundario en un panel que se abre y cierra con un clic; animarlo ayuda a ubicarlo; si casi todos lo abren, empieza abierto | Panel derecho, chevron y tecla P, animado, abierto al inicio |
| Titled Sections (cap. 4) | Secciones con título dentro de una misma área | Sol, Tiempo y Medición en un solo panel, sin pestañas |
| Dynamic Queries (cap. 9, pp. 455–458) | El slider cambia la vista al instante, sin "aplicar"; su rango enseña los valores posibles (p. 456) | El slider de tiempo mueve el Sol y las sombras en vivo (desde E3; antes era la elevación solar) |
| Slider con campo que repite el valor (cap. 10, p. 512; precisión: cap. 9, p. 457) | Slider para explorar, campo para precisión | Slider + campo de horas y de EV |
| Datatips (cap. 9, p. 446 y pp. 447–451) | Datos al pasar el mouse, sin ensuciar la vista | Sobre el obstáculo: `h 10 m · α 12° · L 47.0 m` |
| Safe Exploration (cap. 1, pp. 12–13) | Probar, volver atrás y probar otra cosa sin miedo | Volver a un t da exactamente el mismo estado. (Corrección del 2026-11-06: antes se citaba Multilevel Undo, cap. 8, pp. 418–421, que trata de deshacer acciones, no de mover el tiempo) |

```
┌───────────────────────────────────────────┬──────────────────┐
│                                           │ ›  Entorno       │
│                                           ├──────────────────┤
│                                           │ SOL              │
│                MAPA LUNAR 3D              │ 0° ──●────── 90° │
│              (Center Stage)               │      [ 12.0° ]   │
│                                           ├──────────────────┤
│              ▲ obstáculo                  │ TIEMPO           │
│              ┊┄┄┄┄┄┄┄┄┄┄ sombra           │ ⏮  ◀  ⏯  ▶       │
│        h 10 m · α 12° · L 47.0 m          │ t = 00:00:00     │
│                                           ├──────────────────┤
│                                           │ MEDICIÓN         │
│                                           │ L = h / tan(α)   │
│  escala ├──┤ 10 m                         │ 47.0 m           │
│                                           ├──────────────────┤
│                                           │ ⚠ Exposición     │
│                                           │   aumentada: no  │
└───────────────────────────────────────────┴──────────────────┘
```

## Pasos

Cada paso tiene **Qué**, **Verificación** y, al cerrarse, **Outcome** (qué se hizo y cómo se verificó) y **Follow-up** (qué quedó pendiente). Regla 11 de `AGENTS.md`; plantilla tomada de craftzdog.

### E1. Esqueleto del entorno (cerrado 2026-11-06, commit a12d8d8)
**Qué:** proyecto Bun + Vite + React + R3F. Canvas a pantalla completa con cielo negro (ENV-001); superficie plana de 200 × 200 m con cuadrícula de 1 m y 10 m (ENV-004); cámara orbital; cascarón del panel derecho (plegable con chevron y tecla P, animado, abierto al inicio, sin secciones). Como todavía no hay Sol, una **luz de trabajo no física** permite ver la superficie; el panel lo avisa (ENV-006).
**Verificación (Estephano, `bun run dev`):**
1. El cielo es negro, sin niebla ni gradiente.
2. Se ve la superficie con cuadrícula; cada cuadro chico mide 1 m y cada línea fuerte, 10 m.
3. La cámara gira y se acerca con el mouse.
4. P y el chevron muestran y ocultan el panel; el mapa ocupa toda la pantalla.
5. El panel muestra el aviso de luz de trabajo.

**Outcome:** `bun run build` sin errores; Estephano aprobó la prueba visual el 2026-11-06.
**Follow-up:** la luz de trabajo se retiró en E2; el albedo se resolvió en E2.1.

### E2. Sol, sombras y medición (cerrado 2026-11-06, commit 1e46d36)
**Qué:** luz direccional como Sol (ENV-002), sin luz ambiental; obstáculo vertical de 10 m × 1 m × 1 m cuya cara del lado de la sombra está en x = 0 (ENV-003); sección **Sol** (slider 0°–90° + campo editable) y sección **Medición** con L = h / tan(α); marca roja en x = −L calculada por el motor; sección **No físico** con lo que no es físico (ENV-006). Se retira la luz de trabajo.
**Simplificaciones:** Sol puntual (sin penumbra), azimut fijo hacia +X (**supuesto**), sin luz reflejada por el terreno ni luz terrestre, brillo del Sol en escala visual, terreno horizontal ideal.
**Verificación (Estephano, `bun run dev`):**
1. Con α = 12.0° el panel dice L = 47.0 m y la punta de la sombra toca la marca roja, a ~47 m del poste (4,7 cuadros fuertes).
2. Al mover el slider, la sombra y la L cambian en vivo; con el Sol bajo, la sombra es más larga.
3. Con α = 45° la sombra mide 10 m (un cuadro fuerte).
4. Si escribes `30` en el campo y das Enter, el slider salta a 30°; si escribes `120`, queda en 90°.
5. La sombra es negra y el cielo sigue negro; ya no aparece el aviso de luz de trabajo.
6. Con α < 5,7° la sombra sale de la superficie y la marca desaparece; con α = 0° el panel muestra ∞.

**Outcome:** `bun run build` y lint sin errores; el motor da L(12°) = 47,05 m. Estephano aprobó la prueba visual el 2026-11-06.
**Follow-up:** penumbra (ENV-007), terreno no plano (ENV-008) y modo inverso h = L · tan(α), todo en Abiertas.

### E2.1. Luz reflejada y luz terrestre (cerrado 2026-11-06)
**Qué:** albedo del regolito de 0.15 en el material (ENV-009). Luz reflejada por el terreno como `hemisphereLight` con cielo negro e intensidad igual a albedo · irradiancia del suelo. Luz terrestre como segunda luz direccional, con sombra, desde la Tierra fija a 40° de elevación hacia +Z, con intensidad 10⁻⁴ · k (ENV-010). La elevación solar va de −90° a 90°: con α ≤ 0 el Sol se apaga. Nuevas secciones **Luz**, que muestra cada aporte con Sol directo = 1, y **Cámara**, con la exposición de 0 a 16 EV y el aviso "Exposición aumentada" (ENV-006). La cuadrícula y la marca no se afectan por la exposición.
**Física que se ve:** en un suelo plano, la sombra sigue negra, porque un plano no se ilumina a sí mismo. Lo que cambia es la cara del poste en sombra, que ahora recibe la luz que devuelve el suelo.
**Verificación (Estephano, `bun run dev`):**
1. Con α = 12° y 0 EV, la cara del poste del lado de la sombra (−X) se ve gris oscura, no negra. La sombra en el suelo sigue negra.
2. La sección Luz muestra, con α = 12°: Sol 0.208, Tierra 4.3e-5 (43 % iluminada) y reflejada 0.031.
3. Con α = −20°, todo se ve negro con 0 EV. Si subes la exposición a ~12–13 EV aparece el terreno iluminado por la Tierra, con la sombra del poste hacia −Z (lejos de la Tierra), y el aviso de exposición aumentada se pone en amarillo.
4. Con α = −20° y 13 EV, si vuelves a α = 12° la imagen se quema: la exposición es de la cámara, no del entorno.
5. Al bajar α de 90° a −90°, el porcentaje de Tierra iluminada sube de 18 % a 82 %: de noche la Tierra está más llena.
6. Medición: con α < 0 dice "sin sombra solar" y no hay marca roja.

**Outcome:** `bun run build` y lint sin errores. Valores del motor con α = 12°: Sol 0.208, Tierra 4.3e-5 (k = 0.43) y reflejada 0.031. Estephano aprobó el 2026-11-06.
**Follow-up:** cifra con fuente para la luz terrestre; ENV-009 en terreno con relieve; dibujar la Tierra en el cielo (en Abiertas).

### E3. Tiempo real (cerrado 2026-11-06)
**Qué:** `src/engine/simulation.ts` con `estado(t)`, una función pura que da el ángulo horario, la elevación y el azimut del Sol. El día lunar dura 29,531 días terrestres (LSB A3.1, p. 58). El sitio está a 45° N y longitud 0° (**supuesto**), con declinación 0 (simplificación: el valor real es ±1°32', LSB p. 40). El Sol sale por el este, culmina a 45° en el sur y se pone por el oeste: la sombra gira y cambia de largo. La Tierra pasa a calcularse a partir del sitio: está al sur, a 90° − 45° = 45°. El poste ahora es un cilindro de 0,5 m de diámetro centrado en el origen, y la marca roja gira con la sombra. La sección **Tiempo** tiene ⏮ ◀ ⏯ ▶ (pasos de 12 h, unos 6° de Sol), la tecla espacio, un slider de horas desde la salida del Sol y velocidades ×1, ×1000, ×10 000 y ×100 000. La sección **Sol** queda solo de lectura. La app arranca en pausa, con α = 12° a la mañana.
**Verificación del motor (hecha):** un mismo t da un estado idéntico, comparado por JSON; avanzar 1000 h y retroceder 1000 h vuelve exactamente a t = 0; t y t − 5 días lunares difieren en menos de 1e-15. Con α = 12° (t = 33,7 h), L = 47,05 m.
**Verificación visual (Estephano, `bun run dev`):**
1. Al abrir: en pausa, α = 12.0°, azimut 102° (E), L = 47.0 m, y la punta de la sombra toca la marca roja.
2. Con ▶︎ a ×100 000 el Sol sube y la sombra se acorta y gira de oeste a norte y a este. El mediodía llega a α = 45° (sur), con L = 10 m hacia el norte. El día completo dura ~25 s.
3. ⏸, luego ◀ dos veces y ▶ dos veces: la sombra vuelve exactamente al mismo lugar (ENV-005).
4. Al arrastrar el slider de horas a ~354 h (puesta) se hace de noche; con ~13 EV se ve el terreno iluminado por la Tierra, con la sombra del poste hacia el norte.
5. A ×1 el panel dice "Tiempo real" y la sombra no se mueve a simple vista: el Sol avanza ~0,5° por hora.
6. La tecla espacio corre y pausa; P sigue mostrando y ocultando el panel.
**Outcome:** `bun run build` y lint sin errores. Motor: un mismo t da un estado idéntico; ±1000 h vuelve exactamente a t = 0; t y t − 5 días lunares difieren en < 1e-15; con α = 12° (t = 33,7 h), L = 47,05 m. Estephano aprobó el 2026-11-06 ("ok sigamos avanzando").
**Follow-up:** el paso siguiente propuesto es ENV-007 (penumbra). La declinación real, la libración y el eclipse del mediodía siguen en Abiertas.

### E3.1. Penumbra: el Sol no es un punto (ENV-007) (cerrado 2026-11-06)
**Qué:** el Sol es un disco de θ = 0,533° y la Tierra uno de 1,90°.
- **Sombras:** `src/scene/penumbra.ts` parcha los shaders de sombra de three 0.187 con una PCSS adaptada a luz direccional. El radio del filtro es Δd·tan(θ/2), donde Δd es la distancia del bloqueador al receptor a lo largo del rayo, y tan(θ/2) viaja en `shadow.radius` de cada luz. Requiere `shadows="basic"`, porque PCF no deja leer la profundidad cruda.
- **Salida y puesta graduales:** la luz del Sol se multiplica por la fracción del disco sobre el horizonte, con la fórmula del segmento circular. El disco tarda ~89 min en salir a 45° de latitud.
- **Motor:** `limitesSombra()` da el fin del núcleo negro y el de la penumbra, desde el borde del poste. El núcleo termina por la tapa del poste, en h/tan(α + θ/2), o por su ancho, en d₀·cos α − r con d₀ = D/θ: lo que ocurra antes.
- **Marcas:** dos marcas celestes muestran el fin del núcleo y el de la penumbra. Corrección: todas las marcas van ahora a r + distancia del eje. La roja de E3 estaba 0,25 m corta, dentro del margen declarado.
- **Revisión de E3 (F1–F5):** la luz reflejada ya no se reconstruye en cada cuadro (F1); el Sol queda siempre montado, con intensidad 0 de noche (F2); el sesgo pasa a 2 cm (F3); la caja de sombras sube a ±146 m (F4); y el primer paso del reloj ya no puede ser negativo (F5).
**Verificación del motor (hecha con `bun -e`):** θ☉ = 0,5328° y θ⊕ = 1,8990°. Con α = 12°: L = 47,05 m, núcleo hasta 45,99 m, penumbra hasta 48,15 m y ΔL = 2,15 m. Con α = 45°: ΔL = 0,19 m. El umbral del núcleo en la punta es 10,49°; con α = 5° el núcleo se corta por el ancho, en 53,32 m. El disco tarda 89,0 min en salir. F(−θ/2) = 0, F(0) = 0,5 y F(θ/2) = 1.
**Verificación visual (Estephano, `bun run dev`):**
1. Al abrir (α = 12°), la sombra del poste se ve nítida cerca de la base y difusa en la punta. Las dos marcas celestes quedan a ~46,0 m y ~48,2 m del borde del poste, con la roja (47,05 m) entre ellas. La punta se ve gris, no negra.
2. Con α ≈ 45° (mediodía), la sombra se ve casi nítida y las tres marcas casi se juntan (ΔL = 0,19 m).
3. Al bajar el Sol por debajo de ~10,5°, el panel avisa que la punta ya no llega a negro y la marca celeste del núcleo se separa de la penumbra (a α = 5°: núcleo hasta 53,3 m).
4. En la salida del Sol a ×1000, "Disco sobre el horizonte" pasa de 0 % a "entero" en ~5 s (89 min simulados) y el lado este del poste se ilumina gradualmente.
5. De noche, con ~13 EV, la sombra de la luz terrestre tiene un borde mucho más difuso que la del Sol (θ 3,6 veces mayor).
6. La consola del navegador no muestra errores de shader. Si aparece "ENV-007: el parche de penumbra no coincide…", la versión de three cambió.
**Revisión independiente (2026-11-06):** reconstruyó el shader de MeshStandardMaterial en modos básico, PCF y VSM y no encontró errores de compilación. La matemática de la PCSS coincide con el motor. Hallazgos aplicados:
- Con el sesgo de 2 cm, el poste se sombreaba a sí mismo con grano, entre 2 % y 28 % con el Sol y hasta 71 % con la Tierra. Ahora el poste proyecta sombra pero no la recibe.
- El shader se recarga si cambia `penumbra.ts` durante el desarrollo (HMR).
- La profundidad invertida usa el `getShadow` original.

**Ojo con la prueba 2:** a 45°, la penumbra (0,19 m) dura ~1 píxel del mapa de sombras (~0,10 m de suelo), así que solo se puede juzgar a ±0,1 m. La prueba con el Sol bajo es la que vale: a 10°, la penumbra mide 3,1 m.
**Outcome:** `bun run build` y lint sin errores; el parche queda incluido en el build de producción. El motor da las cifras de la verificación. La revisión independiente reconstruyó el shader en los tres modos sin encontrar errores de compilación. Estephano aprobó el 2026-11-06 ("ok dale con todo").
**Follow-up:** quedan en Abiertas F6–F10, el oscurecimiento del limbo, la forma de la Tierra en fase y el diámetro del Sol variable. La prueba con el Sol a 45° solo se puede juzgar a ±0,1 m (un píxel del mapa de sombras).

### E4. Datatip y medición inversa (cerrado 2026-11-06)
**Qué:**
- **Datatip** (`src/scene/Datatip.tsx`, DI cap. 9, p. 446 y pp. 447–451): al pasar el puntero por el poste aparece `h 10 m · α 12,0° · L 47,0 m` y, más tenue, `penumbra 46,0–48,2 m (ΔL 2,2 m)`. Se va al salir del poste.
- **Medición inversa** (método de Fielder, SM caps. 2 y 4): un clic en el suelo marca la punta de la sombra, con un anillo amarillo. El panel calcula h = L · tan(α) con el Sol del instante del clic y la compara con los 10 m reales. L es la proyección del punto sobre la dirección de la sombra, desde el borde del poste; si el punto queda a más de 1 m del eje de la sombra, el panel avisa. Un arrastre de cámara no cuenta como clic. Motor: `alturaDesdeSombra()` y `medicionInversa()`.
- **Arreglos menores:** la tecla espacio funciona aunque un botón o un slider tenga el foco (F6); el campo de un slider ya no redondea el valor si no se escribió, y acepta coma decimal (F7); el azimut ya no muestra 360,0° (F10).
**Verificación del motor (hecha con `bun -e`):** con α = 12° y L = 47,05 m, h = 10,000 m. Un clic en la punta exacta da L = 47,046 m y h = 10,00 m; un clic al final de la penumbra (48,15 m) da h = 10,235 m, un error de +2,3 %. A medianoche el azimut es 0.
**Verificación visual (Estephano, `bun run dev`):**
1. Al pasar el mouse por el poste aparece el datatip, que se va al salir. Con α = 12° dice L 47,0 m y penumbra 46,0–48,2 m.
2. Un clic en el suelo, donde termina la sombra, deja un anillo amarillo. El panel muestra L medida, α y h deducida cerca de 10 m; el error crece si el clic va hacia el final de la penumbra.
3. Arrastrar para girar la cámara no marca ningún punto.
4. Si se marca con el reloj corriendo, la medida conserva el α del instante del clic. "Borrar medida" quita el anillo.
5. Después de hacer clic en ⏸ o en un slider, la tecla espacio sigue pausando y reanudando.
6. Si entras al campo de horas y sales sin escribir, t no cambia.
**Outcome:** `bun run build` y lint sin errores; el motor da h = 10,000 m en la punta exacta y +2,3 % al final de la penumbra. Estephano aprobó el 2026-11-06 ("dale con todo").
**Follow-up:** F8 (formato de números) sigue en Abiertas. El paso siguiente es E5 (Sol y Tierra reales con Horizons).

### E5. Sol y Tierra reales con JPL Horizons (cerrado 2026-11-06)
**Qué:**
- **Descarga** (`scripts/horizons.ts`, se corre con `bun run scripts/horizons.ts`): consulta JPL Horizons (DE441) desde el sitio del Apollo 17, 20,19° N y 30,77° E ("Taurus-Littrow (20.19 N, 30.77 E)", NASA NSSDCA, página "Apollo 17"). Busca la última salida del Sol antes del 2026-11-06 y la siguiente, y guarda una tabla horaria del Sol y la Tierra (718 filas) en `src/data/efemerides-apollo17.json`, con su procedencia: consultas, cabeceras y fecha.
- **Día lunar real:** de 2026-10-15 22:54 UTC a 2026-11-14 12:38 UTC, 29,572 días (el promedio es 29,531).
- **Motor** (`simulation.ts`): `estado(t)` interpola la tabla; t = segundos desde la salida del Sol, y se muestra la fecha UTC real. **El modelo simplificado se eliminó**: latitud 45°, declinación 0, Tierra fija y fase geométrica.
- **Valores reales por instante:** el diámetro del Sol (0,534°–0,540°) y el de la Tierra (1,81°–2,01°) alimentan la penumbra (ENV-007). La fracción iluminada de la Tierra (0,2 %–99,8 %) alimenta ENV-010. La Tierra se mueve por la libración: 46°–61° de elevación y 231°–248° de azimut.
**Verificación del motor (hecha con `bun -e`):**
- **Contra Horizons:** el 2026-11-06 a las 00:00 UTC el motor da la Tierra a 240,143° de azimut y 60,525° de elevación, iluminada al 89,01 % y con 1,896° de diámetro, y el Sol a −67,164° con 0,5386°. Coincide con la consulta directa a Horizons.
- **ENV-005:** un mismo t da un estado idéntico, y t vs t − 3 días lunares difiere en < 1e-15.
- **Prueba de E2:** α = 12° llega el 2026-10-17 a las 00:08 UTC, con el Sol al este (95,9°). L = 47,05 m y penumbra de 45,99 a 48,15 m.
- **Mediodía y noche:** el mediodía (fila de mayor elevación) es el 2026-10-23 a las 07:00 UTC; corrección de E7: el tránsito por el meridiano es a las 07:21:18 UTC (FA pp. 252–254). α = 68,44° al sur y L = 3,95 m. El disco tarda 67,7 min en salir.
**Verificación visual (Estephano, `bun run dev`):**
1. Al abrir, el reloj muestra "2026-10-17 00:08 UTC" y el Sol está a 12° al este: la sombra apunta al oeste y mide ~47 m.
2. Con ▶︎, la fecha avanza y el Sol culmina a ~68° casi exactamente al sur, el 2026-10-23 ~07:21 UTC (tránsito, E7). La sombra corta (~4 m) apunta al norte.
3. La sección Luz muestra la Tierra con su azimut y elevación reales, que cambian unos grados a lo largo del día lunar (libración), y su fase real.
4. De noche (por ejemplo el 2026-11-07), la Tierra está casi llena (~95 %) y con ~13 EV se ve la luz terrestre.
5. La consola no muestra errores.
**Outcome:** `bun run build` y lint sin errores; el motor reproduce la consulta directa a Horizons y ENV-005 se mantiene. Estephano aprobó el 2026-11-06 ("pudale con todo").
**Follow-up:** el paso siguiente propuesto es el relieve real del Apollo 17 (NAC DTM de LROC, 2 m por píxel). Siguen abiertos extender la tabla a más días lunares y a otros sitios, y el eclipse de Sol por la Tierra.

### E6. Relieve real del Apollo 17 (ENV-008) (cerrado 2026-11-06)
**Qué:**
- **Centro:** la posición precisa del módulo lunar, 20,1911° N y 30,7723° E, con ±3,5 m (LROC, "Coordinates of Lunar Anthropogenic Targets", 2016; Wagner et al., Icarus 283). Las efemérides de E5 se regeneraron para ese punto: la salida del Sol se corrió 16 s.
- **Datos** (`scripts/dtm.ts`): lee por HTTP Range solo las filas necesarias del NAC DTM de LROC (`NAC_DTM_APOLLO17_2M`, float32 sin comprimir, equirectangular) y guarda un recorte de 201 × 201 muestras: 400 m de lado y 2 m de paso, con su procedencia, en `src/data/relieve-apollo17.json`. Desnivel: −24,1 m a +6,2 m respecto del módulo.
- **Motor** (`src/engine/terreno.ts`):
  - `alturaSuelo(x, z)` por interpolación bilineal y `pendienteGrados`.
  - `largoSombraSobreTerreno`: el rayo desde el borde de la tapa del poste se avanza en pasos de 5 cm hasta tocar el relieve y se refina por bisección.
  - `limitesSombraSobreTerreno`: centro, núcleo y penumbra sobre el relieve.
- **Escena:**
  - Malla del relieve que proyecta y recibe sombras.
  - El poste está en el sitio del módulo, hundido 0,3 m para no flotar en la pendiente de 4,5°.
  - Cuadrícula de 1 m y 10 m que sigue el suelo.
  - Marcas: la roja es L con suelo plano; la blanca, la punta real sobre el relieve; las celestes, núcleo y penumbra sobre el relieve.
- **Shader:** plano del receptor (RTR p. 250). Las derivadas en pantalla dan la inclinación del suelo en el mapa de sombras, y cada muestra se compara contra ese plano; así las pendientes no se sombrean a sí mismas. La caja de sombras crece a ±323 m, con píxeles de 16 cm para el Sol y 32 cm para la Tierra.
- **Panel:** Medición compara suelo plano y relieve (desnivel en la punta, h que daría L·tan α), y la medición inversa muestra el desnivel y la pendiente del punto marcado.
**Verificación del motor (hecha con `bun -e`):**
- **Altura en el centro:** el DTM da −2626,21 m, y la tabla de LROC da −2626 m para el módulo.
- **ENV-008 con datos reales:**

| Momento | α | L con suelo plano | L sobre el relieve | h = L·tan α |
|---|---|---|---|---|
| Mañana | 12° | 47,05 m | 44,15 m (punta 0,61 m más alta) | 9,39 m (−6 %) |
| Tarde | 11,2° | 50,66 m | 54,88 m | 10,83 m (+8 %) |
| Mañana | 5° | 114,3 m | 88,3 m | 7,72 m (−23 %) |

  La mañana y la tarde dan alturas distintas, como en el Straight Wall de Fielder.
**Verificación visual (Estephano, `bun run dev`):**
1. Se ve un terreno con relieve (cráteres y lomas) y una cuadrícula que lo sigue; el poste está en el centro, apoyado en el suelo.
2. Con el Sol bajo, los cráteres se sombrean por dentro y las lomas proyectan sombra.
3. Las pendientes iluminadas no muestran grano ni rayas (acné). Si aparecen, dime con qué α.
4. Al abrir (α = 12°), la sombra del poste termina en la marca blanca (~44 m) y no en la roja (47 m); el panel da h ≈ 9,4 m con L·tan α.
5. Por la tarde, con α ≈ 11°, la blanca queda más lejos que la roja: L sobre el relieve ≈ 55 m.
6. La consola no muestra errores.
7. Con el Sol muy bajo (α ≈ 2–6°), busca grano tenue en la franja donde el relieve pasa de luz a sombra, sobre todo con la exposición alta. La revisión lo considera posible; si aparece, se calcula la holgura con el gradiente sin recortar.
**Revisión independiente (2026-11-06):** confirmó la matemática del plano del receptor, el flujo uniforme de `dFdx`, la compilación, el sentido de los triángulos, el recorte del DTM (el centro da −2626,21 m), el modelo de rayo de ENV-008 (pasos de 5 cm frente a 5 mm: diferencia ≤ 5 mm) y que la bilineal del motor difiere de la malla en ≤ 0,10 m en la punta de la sombra. Encontró un problema: la holgura del muestreo era el doble de su cota (medio píxel por eje) y separaba la sombra del poste de su base hasta 1,8 m con el Sol bajo. Se corrigió a la mitad y la caja de sombras se ajustó a ±286 m (píxel de 14 cm). La separación que queda está declarada en el panel: ~0,9 m a 6°, ~0,4 m a 13° y < 0,1 m a 45°.
**Outcome:** `bun run build` y lint sin errores; el motor da 44,15 m frente a 47,05 m a 12° (ENV-008); revisión independiente con un hallazgo corregido. Estephano aprobó el 2026-11-06 ("si dale con todo hasta el e 13").
**Follow-up:** horizonte lejano (E10), rebote sobre el relieve (E11) y resto de la matriz de trazabilidad (E7–E13).

### E7. Red de seguridad: pruebas, mediodía real y día sin repetición (cerrado por pruebas 2026-11-06)
**Qué:**
- **Pruebas** (`bun test`, nuevo script `test`; `tests/motor.test.ts`): 16 pruebas y 5044 comprobaciones contra fuentes y soluciones exactas:
  - **T0, efemérides frente a la teoría:** latitud subsolar ≤ 1,5424° (FA p. 412); libración |b| ≤ 6,7° y |l| ≤ ~8° (FA p. 413); distancia Tierra–Luna (FA p. 671); diámetros del Sol y la Tierra (FA pp. 672–673); día de 29,57 ± 0,02 d (FA) y 29,531 d ± 13 h (LSB p. 58); tránsito a 68,442°; salida del disco de 67,4 min.
  - **ENV-005:** pureza del estado.
  - **ENV-003 y ENV-007:** L, núcleo y penumbra en suelo plano.
  - **T9:** sombra sobre el relieve.
  - **T1 y T2:** horno de Monte Carlo, L/Le = 1/(1 − ρ) (PBR p. 575), y el hemisferio exacto sobre un plano infinito (PBR pp. 191–193).
- **Monte Carlo de referencia** (`src/engine/montecarlo.ts`): muestreo coseno y de cono, error estándar, horno y plano infinito (PBR caps. 14–16). Sirve para verificar, no para dibujar.
- **Mediodía = tránsito por el meridiano** (FA pp. 252–254): 2026-10-23 07:21:18 UTC, α = 68,4415°. Antes era la fila de mayor elevación, 21 min antes.
- **El día lunar no se repite:** `limitarT` reemplaza a `normalizarT` y el reloj se detiene al final. Repetirlo hacía saltar la Tierra 3,65° (FA pp. 257, 413).
- **Horizons:** `TIME_TYPE='UT'` explícito; la procedencia guarda la escala de tiempo, los radios, la corrección relativista y el archivo EOP. Los datos no cambiaron.
- **Citas corregidas** (matriz, sección 3): ENV-001 con LSB pp. 40–41 y p. 28; 1°32' en LSB p. 40; RTR §9.3 p. 314, p. 350 y p. 252; PBR p. 306; los patrones de DI; Safe Exploration en lugar de Multilevel Undo; el radio de 1737,4 km; el 1,90° de la Tierra como valor derivado; la causa de los 29,572 d; el comentario de NSSDCA.
**Verificación:** `bun test`: 16 de 16; build y lint sin errores.
**Visual (Estephano):** el reloj se detiene al llegar al 2026-11-14 ~12:38 UTC y no vuelve a empezar; "Momento" cambia de mañana a tarde a las 07:21 UTC del 2026-10-23.
**Follow-up:** AGENTS.md (regla 7) pide solo `bun run build`; queda abierto agregar `bun test` como requisito (la decisión es de Estephano).

### E8. Material lambertiano de verdad, reflectancia del sitio y medición lineal (cerrado por pruebas 2026-11-06)
**Qué:**
- **Material:** el terreno y el poste usan `meshLambertMaterial`, que es solo difuso, con `BRDF_Lambert` (verificado en three 0.187). `meshStandardMaterial` agregaba un especular GGX con F0 = 0,04: ρ_dh real de 0,156–0,197 y brillo de 2–3 veces hacia adelante (cálculo MC de la auditoría), lo contrario de la Luna (LSB p. 559; RTR pp. 349–350; PBR p. 331). Contradicción C1 de la matriz, primera parte.
- **Reflectancia del sitio:** 0,085 en lugar de 0,15. El Apollo 17 está sobre mar con manto oscuro (LSB p. 631); los mares tienen ~7–10 % (p. 59), y el suelo 75081 da ≈0,08–0,09 (fig. 7.10, p. 308, lectura aproximada). Contradicción C2.
- **Exposición anclada:** `ESCALA_VISUAL = π`, como un fotómetro de luz incidente: con +0 EV, una superficie de reflectancia ρ de cara al Sol da ρ en lineal (RTR p. 289). Antes era 10, sin ancla.
- **Curva de tono:** en Cámara se elige entre ACES (vista) y Lineal (medición), con NoToneMapping (RTR p. 286). ACES queda declarado en "No físico".
**Verificación:** `bun test`, 18 de 18. Nueva prueba T7: la reflectancia del sitio está en el rango de mar, y Lambert da ρ_dh = albedo ≤ 1.
**Visual (Estephano):**
1. La escena se ve **más oscura que antes** (≈5,6 veces menos radiancia en pantalla): es la reflectancia real del mar y la exposición anclada. Con +2 a +3 EV se ve como antes, con el aviso de exposición aumentada.
2. Mirando hacia el Sol, el suelo ya no brilla más que con el Sol a la espalda.
3. Con "Lineal (medición)", los tonos oscuros se ven un poco más claros que con ACES, sin el contraste de la curva.

### E9. Radiometría: W/m², Sol en el horizonte y luz terrestre derivada (cerrado por pruebas 2026-11-06)
**Qué:**
- **Unidades:** "Sol = 1 a 1 UA" = 1361 W/m² (FA p. 542). La irradiancia cae con 1/r² según la distancia de Horizons (PBR p. 187): entre 1369 y 1395 W/m² en este día lunar. El panel Luz muestra W/m²: Sol perpendicular, Sol sobre el suelo, Tierra y lo que devuelve el suelo.
- **Sol en el horizonte:** el disco parcialmente oculto ilumina desde el **centroide** del segmento visible, y la luz de la escena sale de esa dirección. Con el centro en 0°, el suelo recibe 2ρ/(3π) ≈ 9,9·10⁻⁴ del Sol; antes recibía 0 (C7 de la matriz).
- **Luz terrestre derivada** (C4): esfera lambertiana de albedo de Bond 0,32 (FA p. 542), con irradiancia (2/3)·A·sin²(θ⊕/2)·Φ(g)/r². Φ(g) es la función de fase lambertiana, [sin g + (π − g)cos g]/π, en lugar de la fracción iluminada. Con la Tierra llena da 5,86·10⁻⁵, frente al supuesto de 1e-4. Se quitó el tinte azul, porque la luz terrestre tiene el mismo espectro que la solar (FA p. 542). Supuesto que queda: la Tierra como lambertiana; FA dice que 1–10 % de su reflexión es especular.
- **Exposición máxima de 20 EV:** de noche el suelo necesita ~+15,5 EV para llegar a 0,18.
**Verificación:** `bun test`, 22 de 22. Nuevas: T6 (centroide en el horizonte frente a la fórmula analítica), T8 (fase lambertiana: fórmula cerrada frente a Monte Carlo), luz terrestre de 5,86·10⁻⁵ e irradiancia de 1368–1396 W/m².
**Visual (Estephano):**
1. Luz, de día: el Sol perpendicular marca ~1372 W/m² con α = 12°, y ~285 W/m² sobre el suelo.
2. En la salida del Sol, el suelo empieza a recibir luz desde que asoma el borde del disco, no desde que el centro cruza el horizonte.
3. De noche: la Tierra al ~95 % da ~0,07 W/m². Con +15 a +16 EV se ve el terreno iluminado por la Tierra, con luz blanca y sin tinte azul.

### E9.1. El Sol y la Tierra en el cielo (cerrado por pruebas 2026-11-06)
**Qué:** `src/scene/Cielo.tsx` dibuja el Sol y la Tierra en su dirección real (Horizons) y con su tamaño angular real (Sol 0,534°–0,540°; Tierra 1,81°–2,01°). Están "en el infinito": siguen a la cámara, así no hay paralaje, y se recortan por el horizonte astronómico (plano por el ojo; el relieve lejano llega en E10).
- **Sol:** su radiancia, E⊥/Ω, es ~4,6·10⁴ veces la de un gris al 100 %, y la curva de tono lo satura a blanco, como una cámara.
- **Tierra:** esfera lambertiana gris de albedo 0,32, iluminada por el Sol sin el recorte de nuestro horizonte, así que de noche sigue iluminada. Su fase sale de la geometría y coincide con la fracción iluminada de Horizons a ≤ 0,2 % (prueba nueva).
- **Lupa del cielo:** ×10, en Cámara, con aviso de "no es su tamaño real" (ENV-006).
**Verificación:** `bun test`, 23 de 23; build y lint sin errores.
**Visual (Estephano):**
1. De día se ve el Sol como un punto blanco pequeño (~10 px) en su dirección; con la lupa, un disco.
2. La Tierra está al sur-oeste, a ~46–61° de altura. Con la lupa, su fase coincide con el % de "Luz": el 2026-10-17 a las 00:08 UTC, ~66 % iluminada, y con el lado iluminado hacia el Sol.
3. De noche (por ejemplo, 2026-11-07), la Tierra casi llena sigue visible y brillante aunque el Sol esté bajo el horizonte.
4. Al ponerse, el Sol se corta por el horizonte (sin relieve lejano todavía).

### E10. Horizonte real: los macizos de Taurus-Littrow (cerrado por pruebas 2026-11-06)
**Qué:**
- **Datos** (`scripts/horizonte.ts`): lee por rangos SLDEM2015 (LOLA + SELENE, 512 px/grado, ~59 m; tile `00N_30N_000_045`, 93 MB del archivo de 1,4 GB). Por marcha de rayos desde el módulo (RTR pp. 465–466), con 720 azimuts, de 250 m a 30 km y la caída por curvatura descontada, guarda el perfil del horizonte en `src/data/horizonte-apollo17.json`.
- **Resultado:** el horizonte va de 0,2° a **14,2°**. Al norte está el Macizo Norte, con 14,2° a 6,4 km; al suroeste el Macizo Sur, con 11,3°; al este (salida del Sol), 5,1°; al oeste (puesta), 2,9°. Coherente con el LSB (macizos de 2000–2300 m en un valle de ~8 km, pp. 33–34, 37).
- **Comprobación independiente:** la altura del sitio en SLDEM2015 (−2628,0 m) coincide con el DTM NAC (−2626,2 m) y con LROC (−2626 m) a ~2 m.
- **Motor** (`src/engine/horizonte.ts`): la fracción visible del Sol y la Tierra y la dirección del centroide se miden contra el horizonte real en su azimut.
  - **Salida local:** **2026-10-16 08:20 UTC**, con el Sol ya a 4,5°, 9,4 h después de la astronómica.
  - **Puesta local:** **2026-10-30 11:05 UTC**, a 2,4°.
  - Sin Sol sobre los macizos no hay luz ni sombra solar, y el panel dice "Sol tras los macizos".
- **Escena:** silueta de los macizos alrededor del observador, con forma real; su brillo es aproximado, porque se modela como una pared con albedo de tierras altas de 0,15 (LSB p. 59). Tapa el Sol y la Tierra cuando están detrás.
**Verificación:** `bun test`, 28 de 28. Nuevas pruebas: altura del sitio frente a LROC; Macizo Norte a 4–10 km y entre 8° y 30°; salida local ≈ h(az)/(ω·cos φ) (FA p. 257); sin luz antes de la salida local; puesta local antes que la astronómica.
**Visual (Estephano):**
1. Se ven los macizos rodeando el valle: más altos al norte y al suroeste, bajos al oeste.
2. Al empezar el día, el Sol aparece detrás de los macizos del este cerca del 2026-10-16 08:20 UTC. Antes de eso el panel dice "Sol tras los macizos" y no hay sombras, aunque el Sol esté a +4°.
3. Al final de la tarde, el Sol se esconde tras el horizonte oeste el 2026-10-30 ~11:05 UTC.
4. Con la cámara alta, la silueta puede desalinearse ~1° respecto del Sol (declarado).
**Nota:** el código de E10 quedó en el commit `d2e3c66` y esta documentación en uno aparte, porque el script que la escribía falló.

### E11. Luz devuelta por el relieve: un rebote calculado (cerrado por pruebas 2026-11-06)
**Qué:**
- **Motor** (`src/engine/rebote.ts`): radiosidad de un rebote sobre una malla de alturas, E_rebote(i) = Σ_j ρ·E_directa(j)·cos θ_i·cos θ_j·A_j/(π r²) (RTR pp. 442–443; PBR p. 577).
  - La luz directa de cada parche lleva su sombra por el propio relieve (horizonte por parche en 16 azimuts, RTR pp. 465–466) y por los macizos (E10).
  - Solo cuentan los parches que se miran entre sí y están a menos de 120 m.
- **Sitio** (`src/engine/reboteSitio.ts`): parches de 8 m (51 × 51), interpolados a los 201 × 201 vértices; ~0,2 s de preparación y ~3 ms por instante.
- **Escena** (`src/scene/materiales.ts`): el terreno suma el rebote como luz indirecta en su shader Lambert. El poste recibe la luz de un suelo plano infinito, ρ·E·(1 − n_y)/2, exacta en ese supuesto (T2). **Se eliminó la hemisphereLight**, que sobre el terreno contaba la misma luz dos veces y no veía el relieve (PBR p. 580; matriz C3).
**Verificación:** `bun test`, 31 de 31.
- **T4, cráter esférico** (d/D = 0,2): el fondo, en sombra directa, recibe el rebote dentro del −12 % de la solución exacta E₁ = ρ·E⊥·sin α·sin²ψ/4 (PBR pp. 194, 577). Con parches de 8 m da −9,5 % y con 4 m, −5,3 %: converge.
- **Suelo plano:** rebote 0, igual que el plano infinito exacto.
- **Sitio real:** rebote > 0 y menor que ρ·E⊥.
**Simplificaciones (declaradas en el código):** un solo rebote (con ρ = 0,085 el segundo aporta < 10 %); sin oclusión entre parches; factor de forma punto–área; sin terreno fuera del recorte; en el poste se ignora su propia franja de sombra (sobreestima hasta ~2× al pie).
**Visual (Estephano):**
1. Con el Sol bajo (por ejemplo α ≈ 5–12°), el interior de los cráteres en sombra no es negro puro: con +3 a +5 EV se ve tenuemente iluminado por la pared opuesta.
2. En suelo plano abierto, la sombra del poste sigue negra (correcto: un plano no se ilumina a sí mismo).
3. La cara del poste en sombra sigue recibiendo la luz del suelo.

### E12. BRDF de Hapke: el regolito retrorrefleja (cerrado por pruebas 2026-11-06)
**Qué:**
- **Motor** (`src/engine/hapke.ts`): reflectancia bidireccional de Hapke (1981, ec. 16) tal como la da el LSB (p. 559), con H(µ) = (1 + 2µ)/(1 + 2µ√(1 − w)), B(g) del efecto de oposición, B₀ ≈ e^(−w²/2) y h ≈ 0,4 para suelos lunares.
  - **Calibración:** w = 0,306, para que el albedo normal π·r(0,0,0) (definición del LSB, p. 560) sea 0,085, el rango de mar (LSB p. 59).
  - **Supuestos:** P(g) = 1, partículas isótropas, porque el LSB no da P; sin la corrección por rugosidad de Hapke (1984), que el libro no reproduce.
- **Escena** (`src/scene/materiales.ts`): la luz directa sobre el terreno usa f = r/µ0 en el shader. La luz indirecta (rebote E11) y el poste siguen siendo lambertianos con 0,085.
- **Qué cambia a la vista** (lo que contaron los astronautas, LSB p. 559; RTR p. 350):
  - Con el Sol a la espalda, el relieve se aplana: todas las pendientes brillan igual, con 3,5 % de diferencia entre 0° y 60°, mientras que Lambert caería 50 %.
  - Mirando hacia el Sol, el suelo se oscurece.
  - Con el Sol cruzado se ve el mayor contraste.
**Verificación:** `bun test`, 36 de 36. Nuevas pruebas: calibración del albedo normal, reciprocidad, ρ_dh ≤ 1 por Monte Carlo (0,061 a 0° y 0,137 a 85°), pendientes iguales a fase 0 (< 5 %) y efecto de oposición (fase 0 frente a 10°: > 1,3×).
**Visual (Estephano):**
1. Coloca la cámara de espaldas al Sol, mirando en la dirección de la sombra: el terreno se ve más claro y plano, con poco relieve.
2. Mírala hacia el Sol: el suelo se oscurece y el relieve se marca por las sombras.
3. Alrededor del punto exactamente opuesto al Sol (la sombra de la cámara, si estuviera en el suelo) hay un brillo extra: es el efecto de oposición.

### E13. Interfaz de verificación: la evidencia en pantalla (cerrado por pruebas 2026-11-06)
**Qué** (patrones de DI propuestos por la auditoría):
- **Tabla de esperado frente a simulado,** con tolerancia y fuente al pasar el puntero (Proximity, p. 218; variables preatentivas, pp. 436–438). Filas:
  - Diámetro del Sol (FA frente a Horizons).
  - Fase de la Tierra (geometría frente a Horizons).
  - Irradiancia 1361/r², solo con el disco entero visible.
  - Penumbra en la punta (h·θ/sin²α frente a la cuenta exacta).
  - Sombra sobre el relieve frente a suelo plano, como Δ informativo.
  - Altura que deduciría Fielder, como Δ informativo.
- **Gráfica del día lunar:** α, L con suelo plano, L sobre el relieve y el error de h = L·tan α sobre el mismo eje de tiempo; un clic lleva a ese momento (Multi-Y Graph, pp. 462–464).
- **Perfil a lo largo de la sombra,** a escala 1:1, con el relieve, el poste y los rayos α y α ± θ/2 (Alternative Views, pp. 97–98).
- **Momentos de prueba** en Tiempo: salida local, α = 12° de mañana, tránsito, α = 12° de tarde y puesta local (Annotated Scroll Bar, pp. 199–201).
- **Registro de mediciones** inversas, con "Copiar CSV" y "Borrar la última" (Command History, pp. 422–423).
- **Casillas** para ocultar la cuadrícula y las marcas (filtros simples, pp. 443–444).
**Verificación:** `bun test`, 38 de 38. Las pruebas nuevas encontraron un error de la tabla, ya corregido: de noche marcaba la irradiancia como "0 ✗". También comprueban la asimetría de Fielder en la serie del día (error negativo de mañana y positivo de tarde con α ≈ 12°).
**Visual (Estephano):**
1. En Verificación, todas las filas con tolerancia muestran ✓ en cualquier momento, y las de relieve muestran Δ.
2. En la gráfica, la curva blanca (relieve) se separa de la roja (plano) con el Sol bajo, y el error cambia de signo entre la mañana y la tarde. Al hacer clic, el reloj salta.
3. El perfil muestra el rayo desde la tapa del poste tocando el relieve en el punto blanco.
4. Los botones de momentos llevan a cada prueba del spec.
5. Con varias mediciones inversas, el registro las lista y "Copiar CSV" las copia.

### E14. Vista de la Luna completa (cerrado por pruebas 2026-11-06)
**Qué:**
- **Datos** (`scripts/luna-global.ts`): LOLA LDEM_4 (altura) y LDAM_4 (albedo normal a 1064 nm; Lemelin et al. 2016), con 4 px/grado, 1440 × 720 y 7,6 km/píxel, guardados en float16 (2 MB cada uno) en `src/data/`. Se usa LDAM en lugar de LROC WAC: es global, chica y del mismo producto que el relieve.
- **Motor** (`src/engine/lunaGlobal.ts`): convierte las direcciones del Sol y la Tierra del sitio (Horizons) al marco selenográfico, y da los puntos subsolar y subterrestre. El brillo visible es LDAM × 0,085/0,177, calibrado en el sitio; LOLA da 0,177 ahí porque el regolito es más rojo (LSB p. 307). Supuesto: la misma pendiente espectral en toda la Luna.
- **Escena** (`src/scene/LunaCompleta.tsx`): globo en km con el relieve desplazado y normales del relieve, iluminado por el Sol real con la Hapke del sitio escalada por el albedo local, y con la luz terrestre del lado nocturno. La Tierra y el Sol van a escala y distancia reales, y el sitio del Apollo 17 se marca. El relieve se puede exagerar ×10, con aviso (ENV-006).
- **Panel:** sección Vista (Sitio / Luna completa), con el punto subsolar, el subterrestre (la libración) y la distancia a la Tierra.
**Simplificaciones:** sin sombras del relieve a esta escala (importan solo en el terminador); la paralaje entre el sitio y el centro de la Luna se ignora (≤ 0,27° para la Tierra).
**Verificación:** `bun test`, 42 de 42. Nuevas pruebas:
- Normal del sitio · Sol = sin(elevación) en toda la tabla: la conversión es correcta.
- El punto subsolar avanza ~12,17°/día hacia el oeste (FA).
- LDEM en el sitio ≈ −2,63 km, frente a LROC −2626 m.
- LDAM en el sitio = 0,177.
**Visual (Estephano):**
1. Con "Luna completa", el globo aparece con mares oscuros y tierras altas claras, iluminado del lado del Sol, con el terminador en su lugar.
2. La marca amarilla está en el borde de Mare Serenitatis, al este (sitio del Apollo 17).
3. Al correr el reloj, el terminador avanza sobre el globo, y en el momento "Salida local" pasa cerca de la marca.
4. Con +8 a +10 EV se ve el lado nocturno iluminado por la Tierra.
5. Lejos, la Tierra en fase y el Sol, a sus tamaños reales.

### E15. Realismo del sitio (cerrado por pruebas 2026-11-06)
Pedido de Estephano (2026-11-06): "quiero que comiences a texturizar bien y que todo el enviroment comience agarrar realismo". Partes elegidas:
- **E15.1, albedo real del sitio:** buscar la ortofoto LROC NAC del Apollo 17 (no figura en las páginas del DTM) y convertirla en un mapa de albedo, quitando la luz y las sombras de la foto con Hapke y el DTM, porque si no la sombra queda doble.
- **E15.2, micro-relieve bajo 2 m:** cráteres pequeños y rocas con la distribución de tamaños de las fuentes (PSP, Bugiolacchi: cráteres ≥ 5 m en Taurus-Littrow; LSB). Las posiciones son sintéticas y se declaran.
- **E15.3, equipos del Apollo 17:** módulo lunar, LRV y ALSEP en su posición real (LROC-COORD, ±3,5 m), con modelos de forma aproximada.
- **E15.4, cámara de astronauta:** a 1,7 m de altura, además de la vista aérea. Cierra la pregunta abierta de la posición de la cámara.
- **E15.5, acumulación temporal:** con el reloj en pausa, la imagen se promedia en el tiempo para quitar el grano de la penumbra, sin cambiar los valores físicos (RTR pp. 142, 523).

#### E15.6. Módulo lunar realista: cuerpo de NASA y tren de NSSDCA (cerrado por build 2026-11-06)
Pedido de Estephano (2026-11-06, con captura): "que el equipo se vea super real". Decisiones elegidas en la consulta del mismo día: modelo 3D de NASA, materiales especulares con luz del suelo, solo el LM, y el LM antes del plan de E19. Después de ver el modelo, eligió el **híbrido**.
**Qué:**
- **Modelo:** `Apollo Lunar Module.glb` de NASA 3D Resources (716 840 bytes, sha256 en `src/data/modelos/lm-nasa-3d-resources.json`, "free and without copyright"), descargado con su aprobación.
  - Es el LM completo, simplificado, con colores planos.
  - El cuerpo de la etapa de descenso mide ±2,12 m (NSSDCA: 4,2 m), pero los pies quedan a ~5,6 m entre opuestos, frente a los 9,4 m de NSSDCA.
- **Cuerpo** (`src/scene/Equipos.tsx`): se toma del modelo, sin la etapa de ascenso (desde 2,415 m, más el tanque `pCylinde10`) y sin el tren original (lista de nombres). Lo que queda: cuerpo, porche, tobera, deflectores, bandera y placa. El fondo del cuerpo va a 1,5 m sobre el suelo (NSSDCA).
- **Tren reconstruido:** cuatro patas en los ejes, con los extremos de los pies a 9,4 m (NSSDCA). Son supuestos el pie de 0,94 m, los puntales (primario dorado, dos secundarios negros por pata, anclajes) y la escalera de 0,5 m con peldaños cada 0,23 m. Cada pie se apoya en el relieve real.
- **Materiales** (`conLuzDelSuelo`, `src/scene/materiales.ts`): `MeshStandardMaterial` con la luz que devuelve el regolito (ENV-009), con la misma hipótesis del poste (plano infinito, T2).
  - La parte difusa recibe π·L·(1 − n_y)/2.
  - La lámina metálica refleja el suelo (L = ρE/π) hacia abajo y el cielo negro hacia arriba.
  - **El lado en sombra ya no es negro puro.**
  - La lámina dorada y la ámbar son metal; el aluminio de los pies y la escalera, metal; los paneles negros y la pintura gris, dieléctricos. Los colores, reflectancias y rugosidades son supuestos; qué parte es de cada color sale del modelo de NASA.
- **Carga:** decodificador Draco local en `public/draco/` (de three 0.187), sin CDN. El modelo baja solo al activar "Equipos del Apollo 17".

**Depuración en el navegador** (excepción a la regla 10, pedida por Estephano): con Chrome se reprodujo Sitio, Equipos, Astronauta y Luna completa sin errores. Así se encontró que three normaliza los nombres del glTF (espacios → "_", sin puntos), lo que dejaba el tren corto del modelo, y que la cabina empieza en 2,4199 m.
**Verificación:** `bun run build`, lint y `bun test` (62 de 62) sin errores; la consola no muestra errores y D1 dice "sin errores".
**Simplificaciones:** el suelo bajo el LM se toma iluminado entero (ignora la sombra del propio LM); la lámina es lisa, sin arrugas (no hay medición); el borde del reflejo en el horizonte se suaviza con la rugosidad (aproximación); el estado de la lámina 54 años después es desconocido (se usa el aspecto de 1972).
**Visual (Estephano):**
1. Con "Equipos del Apollo 17" y la cámara de astronauta, se ve solo la etapa de descenso (sin cabina), con el cuerpo dorado de la foto de NASA, la tobera debajo y los deflectores negros arriba.
2. Las patas abren bastante más que antes (pies a 9,4 m) y se apoyan en el relieve; la escalera está en la pata del oeste.
3. Con el Sol a 12°, la cara del este brilla dorada y especular; la del oeste se ve tenue, no negra (luz del suelo). Con +3 a +5 EV se distinguen los paneles en sombra.
4. Al caminar alrededor, el reflejo de la lámina cambia con el ángulo: abajo refleja el suelo claro y arriba el cielo negro.
5. D1 sigue en "sin errores".

**Follow-up:**
- LRV, ALSEP y SEP realistas.
- Arrugas de la lámina, solo si hay una medición o una foto calibrada.
- La orientación real del LM, desde fotos del Apollo 17 o LROC.
- Sombra propia del LM en la luz del suelo.

#### E15.5. Acumulación temporal (cerrado por build 2026-11-06)
**Qué:** `src/scene/Acumulacion.tsx` toma el dibujo con prioridad 1. Con la imagen quieta (mismo t, cámara, ayudas y medida), cada cuadro se dibuja en lineal con otra semilla para el ruido de la penumbra (`lunaSemilla`, en terreno y poste), y se promedia con los anteriores, hasta 64 cuadros (RTR p. 142; p. 523, ec. 12.2). La exposición y la curva de tono se aplican al final, sobre el promedio de radiancias (RTR p. 286). Casilla en Cámara, encendida por defecto.
**Verificación:** build y lint sin errores. El valor medio no cambia por construcción, porque es un promedio de estimadores sin sesgo. No tiene prueba automática: es representación.
**Visual (Estephano):** en pausa, en ~1 s desaparece el grano del borde de las sombras; al mover la cámara vuelve el grano y se limpia de nuevo al soltarla. Si la pantalla queda negra o aparecen errores de render target en la consola, desmarca la casilla y avísame.

#### E15.4. Cámara de astronauta (cerrado por build 2026-11-06)
**Qué:** en Vista (sitio) se elige entre cámara Aérea y Astronauta (1,7 m). La de astronauta (`src/scene/Astronauta.tsx`) pone los ojos a 1,7 m sobre el relieve real; la altura es un supuesto. Arrastrando se mira alrededor, con OrbitControls girando sobre un punto 1 cm adelante. Con W, A, S, D o las flechas se camina a 1,5 m/s (supuesto), siempre siguiendo el suelo, sin salir del recorte. Arranca 25 m al sur del poste, mirándolo. Resuelve la pregunta abierta de la posición de la cámara: hay dos vistas.
**Verificación:** build y lint sin errores (es representación, sin prueba automática).
**Visual (Estephano):** con "Astronauta", la vista queda a la altura de una persona, frente al poste; al caminar, la cámara sube y baja con el relieve; los macizos se ven en el horizonte, como en las fotos del Apollo 17; el clic en el suelo sigue midiendo.

#### E15.3. Equipos del Apollo 17 en su posición real (cerrado por pruebas 2026-11-06)
**Qué:** `src/engine/equipos.ts` convierte a metros locales las posiciones de la tabla de LROC (2016): el LM en el origen, el ALSEP a 193,5 m al oeste y 36 m al norte, el LRV a 131 m al este y 45 m al sur, y el SEP a 128 m al este y 27 m al norte. `src/scene/Equipos.tsx` dibuja formas aproximadas con medidas con fuente:
- **Etapa de descenso del LM:** prisma octogonal de 4,2 m y 1,7 m de espesor, con la base a 1,5 m y 9,4 m entre las patas (NSSDCA, ficha 1972-096C).
- **LRV:** 310 × 183 cm, 229 cm entre ejes, 114 cm de alto como máximo y ruedas de 81,8 × 22,9 cm (LSB fig. 9.44, p. 527).

Supuestos declarados: la orientación, el ALSEP y el SEP como cajas, un puntal por pata y materiales mates (la lámina dorada real es especular). Con "Equipos del Apollo 17", el poste, sus marcas y el datatip se ocultan, porque el LM está donde estaba el poste.
**Verificación:** `bun test`, 45 de 45. Nuevas pruebas: el LM en el origen y todo dentro del recorte; el LRV a ~138,6 m del LM; las medidas con fuente.
**Visual (Estephano):** con la casilla activa, el LM aparece en el centro con sus cuatro patas apoyadas en el relieve; el LRV, al sureste; las cajas del ALSEP, al oeste, y del SEP, al noreste. Todos proyectan sombra. Con la cámara de astronauta se puede caminar hasta ellos.

#### E15.2. Detalle sintético bajo 2 m (cerrado por build 2026-11-06)
**Qué:** dos capas solo visuales; el motor no las conoce, así que no cambian sombras calculadas ni mediciones.
- **Cráteres pequeños en el shader del terreno:** perturban la normal del sombreado, no la geometría. Van en celdas de 3 m y 1 m, con el perfil de cráter fresco del LSB (tabla 4.1, p. 66: profundidad 0,196·D y borde 0,036·D) y un factor de degradación aleatorio. Se desvanecen cuando el píxel cubre más que la celda.
- **1500 rocas** de 5–40 cm en 80 m alrededor del centro, semienterradas, con un generador de semilla fija (siempre las mismas). Proyectan sombra.

**Supuestos (sin fuente en nuestros libros):** densidad de cráteres y su degradación; extrapolar la tabla 4.1, hecha para cráteres de km, a escala de metros; la cantidad de rocas, su ley de tamaños P(D > d) ∝ d^(−2,5) y su albedo de 0,12. El LSB solo dice que la superficie está "saturada" de cráteres pequeños (p. 83) y describe campos de bloques (pp. 29, 31). Casilla "Detalle sintético" en Vista, encendida por defecto y declarada en "No físico".
**Verificación:** build, lint y `bun test` (45 de 45, sin cambios: el motor no depende del detalle).
**Visual (Estephano):** de cerca, sobre todo con la cámara de astronauta, el suelo muestra cráteres pequeños y rocas con sombra; de lejos, el detalle se desvanece sin parpadeo; al apagar la casilla vuelve el terreno liso del DTM.

#### E15.1. Albedo real a partir de la ortofoto LROC (cerrado por pruebas 2026-11-06)
**Qué:**
- **Fuente:** la ortofoto LROC NAC del Apollo 17, `NAC_DTM_APOLLO17_1_M134991788_60CM`, a 0,6 m/píxel, tomada el 2010-07-28 a las 21:28:41 UTC. De sus 740 MB se leen por rangos solo ~11 MB.
- **Normalización** (`scripts/albedo-orto.ts`): se divide por el brillo que predice Hapke (E12) con las normales del DTM (E6), el Sol de la toma (Horizons: az 259,15°, elevación 25,33°) y LRO al nadir (supuesto). Se descartan los puntos en sombra propia o proyectada y los de luz rasante.
- **Escala:** los DN no tienen escala radiométrica, así que se toman solo las variaciones y se escalan a media 0,085 (E8).
- **Resultado:** textura de 512 × 512 (0,78 m/texel) en `src/data/albedo-apollo17.u16`, con 99,96 % de texeles válidos y ±0,0086 de desvío. Se ven el LM, las huellas y rastros del rover y el halo del chorro del motor.
- **Escena:** el terreno usa la textura como albedo; la luz directa de Hapke se escala por el albedo local y el rebote usa el albedo del texel. Casilla "Albedo real" en Vista, encendida por defecto.

**Simplificaciones:** queda sombreado residual de lo menor a 2 m, que el DTM no resuelve; el hardware del LM está "pintado" en el albedo; el cálculo del rebote del motor usa la media.
**Verificación:** `bun test`, 47 de 47. Nuevas pruebas:
- Media 0,085 y rango 0,03–0,25.
- **Validación independiente de la georreferencia:** la anomalía más fuerte a ±20 m del centro (el LM) mide 6,3σ y está a ~4 m del centro, dentro de los ±3,5 m de LROC más el registro del DTM.

**Visual (Estephano):** el suelo deja de ser gris uniforme. Alrededor del centro se ven las huellas y los rastros oscuros hacia el este y el oeste, un halo más claro y cráteres pequeños con bordes claros. Con la casilla apagada vuelve al gris de 0,085.

**Outcome de E15:** los cinco subpasos están cerrados por pruebas o por build; la verificación visual queda en sus listas. **Follow-up:** declinación de la ortofoto respecto del nadir; medir la reflectancia absoluta con LROC WAC (Hapke, Sato et al. 2014); usar el albedo local en el rebote del motor.

### D1. Diagnóstico en pantalla (cerrado por build 2026-11-06)
**Qué:** un indicador abajo a la izquierda con cuadros por segundo, ms por cuadro, llamadas de dibujo y triángulos del cuadro completo, la GPU y los mensajes de la consola capturados desde el inicio, incluidos los errores de shader. Tiene un botón "Copiar informe". Los avisos conocidos de las bibliotecas se muestran en gris.
**Primera revisión en el navegador (Estephano, 2026-11-06, Firefox):** sin errores de shader. Solo aparecieron avisos de obsolescencia de las bibliotecas: `THREE.Clock`, que usa R3F 9 por dentro, y `mozPressure`/`mozInputSource`, que vienen de Firefox. La captura mostró la escena funcionando y dos problemas de realismo:
- La densidad del micro-relieve sintético es exagerada.
- Los macizos dibujados como pared lisa parecen niebla.

Se corrigen en D2 y E16.

### D2. Fuera el detalle inventado; detalle real a 0,6 m (cerrado por pruebas 2026-11-06)
Estephano: "el texturizado me parece muy poco real ya que está por patrón y no representa un impacto real, pura estética".
**Qué:**
- Se **eliminó** la capa de cráteres sintéticos del shader de E15.2: era un patrón estadístico inventado, no impactos reales.
- Las rocas sintéticas quedan **apagadas por defecto**, con su casilla y la etiqueta de posiciones inventadas.
- El detalle real sube a la **resolución nativa de la ortofoto LROC: 667 × 667 texeles de 0,6 m**, antes 512 a 0,78 m. Los cráteres pequeños que se ven son los reales, en su lugar.
**Verificación:** `bun test`, 47 de 47. La anomalía del LM sigue a < 6 m del centro con la resolución nueva.
**Visual:** desaparece el patrón de "pelota de golf"; los cráteres que se ven son los de la foto, con sus bordes claros, más sutiles y en posiciones reales.

### E16. El valle de Taurus-Littrow en 3D (cerrado por pruebas 2026-11-06)
**Qué:**
- **Datos** (`scripts/valle.ts`): SLDEM2015 (LOLA + SELENE, ~59 m) muestreado cada 125 m en ±25 km alrededor del LM, con 401 × 401 vértices y la caída por curvatura descontada. Por vértice guarda el horizonte en 8 azimuts, calculado por marcha de rayos hasta 25 km (RTR pp. 465–466). Pesa 1,6 MB en `src/data/`.
- **Escena** (`src/scene/Valle.tsx`): las montañas se sombrean solas con la fracción visible del disco solar en su horizonte, y se iluminan con Hapke escalada por el albedo y con la luz terrestre. Albedo por altura (supuesto): de 0,085 en el fondo (mar con manto oscuro, LSB p. 631) a 0,15 en los macizos (tierras altas, LSB p. 59). Dentro del recorte de 400 m la malla se hunde para no competir con el terreno detallado.
- **Reemplaza la pared lisa de E10,** que se veía como niebla. El Sol y la Tierra pasan a dibujarse a 40 km, detrás de las montañas, y la cámara llega a 60 km (near 0,5 m).
**Verificación:** `bun test`, 49 de 49. Nuevas pruebas: los macizos llegan a +2389 m (LSB: 2000–2300 m) y el horizonte del vértice central coincide con el perfil de E10, calculado aparte a 59 m, a ±1,5° en los 8 azimuts.
**Simplificaciones:** sin sombras proyectadas de una montaña sobre otra fuera de su horizonte por vértice (8 azimuts interpolados); albedo por altura (supuesto); un borde visible donde el recorte detallado se une con la malla de 125 m.
**Visual (Estephano):** donde antes había gris liso ahora se ven montañas con relieve: el Macizo Norte y el Sur, y las Colinas Esculpidas. Con el Sol bajo, sus laderas en sombra quedan oscuras y las iluminadas, claras. El Sol sale detrás de las montañas del este.

### E17. Hapke con parámetros medidos (LROC WAC) como modelo comparable (cerrado por pruebas 2026-11-06)
**Qué:**
- **Datos** (`scripts/hapke-wac.ts`): el mapa de parámetros de Hapke de LROC WAC (Sato et al. 2014), a 566 nm, en la celda de 1° del sitio: w = 0,191, b = 0,264, c = 0,070, Bs0 = 2,19 y hs = 0,071.
- **Ecuaciones citables:** Schröder et al. 2017 (arXiv:1701.08550, ecs. 13–16); la H es la misma del LSB.
- **Convención de signo de c,** decidida con los datos: c vale 0,03–0,15 en los mares y 0,35–0,45 en las tierras altas, y Sato informa que los mares retrodispersan menos. Entonces c > 0 es hacia atrás, al revés de la ec. 16 de Schröder.
- **Escena:** selector "Regolito" en Vista, con Hapke calibrado (por defecto) y Hapke medido (WAC).
**Por qué no es el modelo por defecto:**
- Sato ajustó con la rugosidad macroscópica (θ̄ = 23,657°), cuyas ecuaciones no están en ninguna de nuestras fuentes; Schröder dice "we do not reproduce it here".
- Sin ella, el albedo normal medido da **0,115**, por encima del 7–10 % de los mares (LSB p. 59).
- La celda de 1° (~30 km) mezcla el fondo del valle con los macizos claros.

Por todo eso, el modelo medido queda como comparación, y la diferencia se ve en Verificación como Δ.
**Verificación:** `bun test`, 53 de 53. Nuevas pruebas: la convención (c de los mares < c de las tierras altas en los datos guardados); reciprocidad y energía por Monte Carlo; retrodispersión (fase 0 frente a 30°: > 1,5×); y el albedo normal declarado (0,10–0,13).
**Follow-up:** conseguir Hapke (1984), *Icarus* 59, o el libro de Hapke (2012) para implementar la rugosidad. Con eso el modelo medido puede pasar a ser el principal.

### D3. Error de shader: `PI` sin declarar (cerrado por build 2026-11-06)
Estephano pegó el error de la consola: "ShaderMaterial … 'PI' : undeclared identifier" en `lunaHapkeWAC`, `lunaHapke` y la luz terrestre.
**Causa:** `PI` lo define el chunk `<common>` de three, que un `ShaderMaterial` no incluye. `GLSL_HAPKE` (`src/scene/materiales.ts`) funcionaba dentro del material Lambert del terreno, que sí lo trae, pero no en `MATERIAL_VALLE` (`src/scene/Valle.tsx`, desde E16). `GLSL_COMUN` de `src/scene/LunaCompleta.tsx` (E14) tenía el mismo problema.
**Qué:** `GLSL_PI` con `#ifndef PI / #define PI 3.141592653589793`, al comienzo de `GLSL_HAPKE` y de `GLSL_COMUN`. En el material Lambert el `#ifndef` lo omite.
**Outcome:** `bun run build`, lint y `bun test` (53 de 53) sin errores. No hay validador GLSL local; la compilación se confirma en el navegador.
**Visual (Estephano):** en Vista (sitio) se ven las montañas del valle y en "Luna completa" el globo; D1 ya no muestra el error de shader.
**Follow-up:** D1 no detectó antes el error porque la revisión en Firefox fue anterior a E16. Conviene abrir Sitio y Luna completa después de cada paso que toque shaders.

### E18. Tiempo continuo: seis días lunares seguidos (cerrado por pruebas 2026-11-06)
Aprobado por Estephano en la lista del 2026-11-06 ("(3) E18 Tiempo continuo: varios días lunares"), sin pedir aprobación por paso.
**Qué:**
- **Datos** (`scripts/horizons.ts`): desde la última salida del Sol antes del 2026-11-06 (la misma de E5) busca N = 6 salidas siguientes y guarda una sola tabla horaria continua del Sol y la Tierra: 4266 filas por cuerpo, del 2026-10-15 al 2027-04-11. Consulta por tramos de hasta 2000 filas, con una comprobación de que la rejilla no tenga huecos ni repetidos. El JSON guarda `salidasSolUTC` (7 salidas), `diasLunares` y una URL por tramo; ya no tiene `salidaSolUTC` ni `proximaSalidaSolUTC`. Pesa 560 KB (antes 96 KB). Las filas del primer día son idénticas a las de E5 (diferencia 0).
- **Motor** (`src/engine/simulation.ts`):
  - `DURACION_S` es la duración de toda la tabla y `limitarT` recorta a [0, DURACION_S].
  - `dia(k)` y `diaDe(t)` devuelven `{indice, inicio, fin, duracion, mediodia, puesta, salidaLocal, puestaLocal}`, con caché por día (~3 ms por día).
  - `tParaElevacionManana(d, α)` y `tParaElevacionTarde(d, α)` reciben el día. La tarde busca hasta la puesta astronómica del día, no hasta "mitad del día + 6 h".
  - **Se eliminaron `DIA_LUNAR_S`, `T_MEDIODIA`, `T_SALIDA_LOCAL` y `T_PUESTA_LOCAL`:** una constante no puede ser "el día en curso". El equivalente es `diaDe(t)` o `dia(0)`.
- **Verificación** (`src/engine/verificacion.ts`): `serieDelDia(d)` con caché por día, y `momentosDePrueba(d)`.
- **Interfaz:**
  - El reloj pasa de un día al siguiente sin detenerse y para al final de la tabla (`src/App.tsx`).
  - En Tiempo: "Día lunar k de 6" con « y », que llevan al mismo momento (horas desde la salida) del día anterior o siguiente.
  - ⏮ lleva a la salida del día en curso.
  - El slider, los momentos de prueba, la nota y "Salida/Puesta local" (Sol) son del día en curso; t se cuenta desde la salida de ese día, como "3 d 04:12:00".
  - La gráfica de Verificación muestra el día en curso.

| Día | Salida (UTC) | Duración | Tránsito (UTC), α | Salida / puesta local (UTC) | Tierra al empezar: az, el, fase |
|---|---|---|---|---|---|
| 1 | 2026-10-15 22:54 | 29,572 d | 10-23 07:21, 68,44° | 10-16 08:20 / 10-30 11:05 | 248,1°, 57,7°, 74,7 % |
| 2 | 2026-11-14 12:38 | 29,590 d | 11-21 21:06, 68,27° | 11-14 22:07 / 11-29 01:02 | 247,2°, 54,0°, 76,8 % |
| 3 | 2026-12-14 02:48 | 29,592 d | 12-21 11:32, 68,56° | 12-14 12:16 / 12-28 15:40 | 244,9°, 50,1°, 78,8 % |
| 4 | 2027-01-12 17:01 | 29,578 d | 01-20 02:10, 69,22° | 01-13 02:22 / 01-27 06:29 | 242,0°, 46,8°, 80,1 % |
| 5 | 2027-02-11 06:54 | 29,553 d | 02-18 16:32, 70,06° | 02-11 16:38 / 02-25 20:53 | 239,0°, 45,0°, 80,4 % |
| 6 | 2027-03-12 20:11 | 29,525 d | 03-20 06:12, 70,82° | 03-13 06:25 / 03-27 10:27 | 236,5°, 45,3°, 79,7 % |

**Verificación:** `bun test`, 62 de 62; build, tipos y lint sin errores.
- **Tests de E5–E17:** pasan sobre el primer día (`dia(0)`).
- **Nuevos de E18:**
  - 6 días, con la primera salida igual a la de E5.
  - Cada salida es un cruce real (|α| < 0,01°, subiendo).
  - Cada día dura 29,5 ± 0,3 d (FA cap. 11.4, p. 257; LSB p. 58).
  - La Tierra no salta: ≤ 0,12°/h en toda la tabla, cota derivada de la libración (FA cap. 11.4, p. 257; cap. 17.1, p. 413), y sin cambio a ±1 s de cada límite.
  - El Sol avanza ≤ 0,6°/h.
  - Al empezar cada día, la Tierra está en otro lugar (> 0,5°) y con otra fase (> 0,1 %).
  - `diaDe` en los límites.
  - En cada día: tránsito a 180°, salida y puesta locales dentro del día, y α = 12° de mañana y de tarde.
- **Irradiancia:** pasa a acotarse en toda la tabla con 1361/r² y r = 1 ± e⊕ ± a☾(1 + e☾) (FA p. 542; tabla B.5, p. 674; tabla B.7, p. 675); en enero llega a 1415 W/m². El rango de 1368–1396 W/m² sigue valiendo para el primer día.

**Diferencia encontrada (regla 8):** la distancia Tierra–Luna de FA (p. 671: 363 100–405 700 km) es a(1 ± e) con la e media de 0,0554 (tabla B.7, p. 675). En los perigeos de diciembre de 2026 a abril de 2027, Horizons da hasta 355 304 km (topocéntrica). El test T0 queda limitado al primer día, con el motivo en el código, y la diferencia va a Abiertas.

**Visual (Estephano, `bun run dev`):**
1. Al abrir, igual que antes: 2026-10-17 ~00:07 UTC, α = 12°, "Día lunar 1 de 6".
2. Con ▶︎ a ×100 000, al llegar al 2026-11-14 ~12:38 UTC el reloj **no se detiene**: pasa a "Día lunar 2 de 6", el slider vuelve a 0 h y la Tierra sigue su camino sin saltar (en Luz, azimut y elevación cambian de a poco).
3. « y » llevan al mismo momento de otro mes. Con "α = 12° mañana" en cada día, la Tierra queda en otro lugar y con otra fase (tabla de arriba).
4. Los momentos de prueba y "Salida/Puesta local" cambian con el día; la gráfica de Verificación muestra el día en curso y su clic se queda en ese día.
5. Al final del día 6 (2027-04-11 ~08:46 UTC) el reloj se detiene.

**Follow-up:**
- El tamaño del JSON crece con N (~93 KB por día): para muchos más días convendría un formato binario.
- La gráfica muestra un solo día; no hay vista de todos los días juntos.
- El "~9 h después y ~7 h antes" de la nota de Sol se midió en el primer día; varía ±1 h entre meses.
- La distancia Tierra–Luna (perigeos reales) va a Abiertas.

### E19. Panel de evaluación del sitio de aterrizaje (cerrado por pruebas 2026-11-06)
Responde al objetivo del proyecto (arriba). Decisiones de Estephano en la consulta del 2026-11-06: el panel va antes que el polo sur (que pasa a **E20**); muestra valores **sin ✓/✗**, porque nuestras fuentes no traen umbrales para aterrizar (regla 3); el punto se elige con un clic; el tiempo es el instante y el día lunar en curso.
**Qué:**
- **Motor** (`src/engine/evaluacion.ts`, puro):
  - `apoyoLM(x, z)`: plano de mínimos cuadrados por los cuatro pies del LM (`centrosPiesLM`, `src/engine/equipos.ts`; extremos a 9,4 m, NSSDCA) sobre el DTM NAC. Da la inclinación y hacia dónde baja, el desnivel entre pies, el alabeo (|h₁ + h₃ − h₂ − h₄|, la separación del cuarto pie si apoyan tres) y la pendiente local.
  - `cieloEnPunto(e, x, z)`: Sol y Tierra sobre el horizonte real (macizos, E10) y sin relieve cercano que los tape (marcha de rayos sobre el DTM hasta el borde del recorte, RTR pp. 465–466).
  - `resumenDia(d, x, z)`: horas y fracción de Sol visible, primer y último Sol y fracción con la Tierra visible, cada 10 min, con caché por punto y día (~25 ms).
- **Geometría del LM en el motor:** el radio del pie (supuesto), la orientación (supuesto) y los centros de los pies pasan a `src/engine/equipos.ts`; la escena los usa.
- **Interfaz:** sección "Evaluación del aterrizaje" (`src/ui/Secciones.tsx`), con "Clic: medir sombra / evaluar punto", la posición respecto del LM, "Volver al LM" y los valores con su fuente al pasar el puntero. La huella de los cuatro pies se dibuja en celeste (`src/scene/LunarScene.tsx`) y se oculta con "marcas".

**Valores en el sitio del LM (día 1):** inclinación 4,4° hacia el SE (135°), desnivel 0,58 m, alabeo 0,25 m, pendiente local 4,5°; 339 h de Sol (47,7 %), del 10-16 08:24 al 10-30 11:04 UTC; Tierra visible el 100 %.
**Verificación:** `bun test`, 68 de 68; build y lint sin errores. Revisión en Chrome: el panel carga, el clic mueve la huella y D1 dice "sin errores". Nuevas pruebas:
- Pies a 9,4 m (NSSDCA).
- Plano por los pies sobre planos inclinados sintéticos: θ, azimut y alabeo 0 exactos.
- Apoyo en el LM coherente con la pendiente de E6.
- El relieve tapa el Sol bajo desde el punto más hondo del DTM y no el alto.
- Tierra visible el 100 % en el Apollo 17 (E5, E10).
- Horas de Sol iguales a puesta local − salida local (E10) a ±1 h, y `solVisible` coherente con `iluminacion()`.

**Simplificaciones:** el horizonte de los macizos es el medido desde el LM para todo el recorte (paralaje de ~0,1–0,5° a 200 m, supuesto sin medir); el Sol y la Tierra se juzgan por su centro; el ojo va a 1 m del suelo (supuesto); la orientación de la huella es la del LM (oeste).
**Visual (Estephano):**
1. En "Evaluación del aterrizaje", con el punto en el LM: 4,4° hacia el SE, desnivel 0,58 m, 339 h de Sol y Tierra 100 %.
2. Con "Clic: evaluar punto", un clic en el suelo mueve los cuatro círculos celestes y el panel cambia; un clic cerca del borde avisa que la huella sale del DTM.
3. Al pasar el puntero por cada nombre aparece de dónde sale el valor.
4. Con "Clic: medir sombra", el clic vuelve a medir como en E4.
5. En un cráter con el Sol bajo, "Sol" dice "oculto" aunque esté sobre los macizos.

**Follow-up:**
- Umbrales con fuente (pendiente máxima del módulo, elevación del Sol al descender, alabeo tolerable), para poder dar veredicto: a Abiertas.
- Rocas y rugosidad bajo la huella: no hay datos medidos de rocas (D2).
- El horizonte desde cada punto, con SLDEM.
- E20 (polo sur) reutiliza este panel: allí la Tierra visible y las horas de Sol son decisivas.

### E20. Segundo sitio: el polo sur (Connecting Ridge) (cerrado por pruebas 2026-11-06)
Decisiones de Estephano en la consulta del 2026-11-06:
- Sitio: Connecting Ridge (PGDA Site01).
- Selector que recarga la página (`?sitio=`).
- Días de medianoche a medianoche en el polo; el Apollo 17 sigue de salida a salida.
- Lectura por rangos de los datos polares y albedo de tierras altas de 0,15 como supuesto.

**Qué:**
- **Sitio** (`src/engine/sitio.ts`): registro de sitios con coordenadas, definición del día, albedo y datos disponibles. El activo sale de `?sitio=` o de `LUNA_SITIO` (pruebas y scripts).
  - Polo: 89,46316° S, 222,5104° E, el centro del mosaico de 5 m de PGDA Site01 (x = −11 000 m, y = −12 000 m en estereográfica polar sur).
- **Motor:** `simulation.ts`, `terreno.ts` y `horizonte.ts` cargan `src/data/<tipo>-<sitio>.json` con `await import` antes de exportar; el motor sigue síncrono y puro.
  - `SUPERFICIE.albedo` sale del sitio.
  - `salidasSolUTC` pasa a `limitesDiaUTC` más `definicionDia`. En el JSON del Apollo 17 solo cambió el nombre de la clave, sin nueva consulta. `SALIDAS_S` pasa a `LIMITES_DIA_S`.
  - Tránsito en ambos hemisferios: al sur, el Sol cruza el norte (0°) con el azimut bajando.
  - `puesta`, `salidaLocal` y `puestaLocal` pueden ser NaN en el polo.
  - Momentos de prueba en el polo: medianoche y mediodía.
- **Datos** (`scripts/`, compartidos en `scripts/polar.ts`):
  - `LUNA_SITIO=connecting-ridge bun run scripts/horizons.ts`: 6 días de medianoche a medianoche, del 2026-10-22 al 2027-04-17, de 29,53–29,61 d cada uno.
  - `scripts/dtm-polo.ts`: el DTM de 5 m de PGDA (Barker et al. 2021), leído por rangos (3 MB) y remuestreado a la cuadrícula este/sur de 2 m (sobremuestreo declarado). Centro a 1944,8 m, error RMS 0,25 m, relieve de −15 a +8 m en 400 m.
  - `scripts/polo-lola.ts`: horizonte hasta 150 km y valle de ±25 km. Dentro del mosaico de 16 km usa el DTM de 5 m; fuera, LOLA LDEM_75S_120M (79 MB de 232 MB). Elevación con la esfera exacta y alturas del valle en pasos de 0,5 m, porque Shackleton baja ~5 km.
  - Total leído: ~120 MB (41 MB del mosaico de 5 m y 79 MB del LDEM). No hizo falta el LDEM de 20 m: a 125 m por vértice sobra el de 120 m.
- **Escena e interfaz:**
  - Selector "Apollo 17 / Polo sur" en Vista, con las coordenadas y el albedo del sitio.
  - Valle por sitio (`import.meta.glob`, escala de alturas, albedo uniforme 0,15 en el polo).
  - Se ocultan la ortofoto, los equipos y el Hapke WAC donde no hay datos.
  - Textos según el sitio: inicio del día, relieve, horizonte, "Sol tras el horizonte real".
  - Arreglo: el azimut ya no muestra "360,0°" cuando el tránsito satura en 359,999999° (F10).

**Resultados en el centro de Connecting Ridge:**
- El Sol va de −1,99° a +2,05° y la Tierra de −7,5° a +6,2°.
- Horizonte real de −3,0° a +2,2°: la cresta se ve algo por encima a ~300 m hacia el norte; hacia Shackleton y el oeste baja de −1,6° a −2,0°.
- Sol visible del 60 % del día lunar (nov) al 23 % (abr); Tierra visible del 33 % al 40 %.
- Apoyo del LM: 3,1° hacia el SO, alabeo 0,15 m.

**Verificación:** `bun run test` corre los dos sitios: Apollo 17, 68 de 68 (sin cambios), y polo, 8 de 8 (`tests/polo.test.ts`). Build y lint sin errores. En Chrome, los dos sitios y el selector funcionan sin errores (D1: "sin errores"). Pruebas nuevas:
- Límites en el antimeridiano (az 180°) y días de 29,5 ± 0,3 d (FA p. 257).
- Mediodía en az 0°, ~2 × colatitud sobre las medianoches.
- |α☉| ≤ 1,5424° + colatitud (FA p. 412).
- |e⊕| ≤ libración en latitud + colatitud + márgenes de T0 (FA p. 413).
- Altura del sitio coincidente en dos productos LOLA independientes (5 m: 1944,8 m; 120 m: 1943,0 m), lo que valida la proyección.
- Sol y Tierra visibles solo parte de cada día.

**Simplificaciones:**
- Albedo de 0,15 uniforme (supuesto).
- Hapke calibrado para 0,085 y escalado por albedo/0,085.
- Sin ortofoto ni Hapke WAC.
- El relieve local de 2 m es un sobremuestreo del de 5 m.
- El horizonte se mide desde el suelo; en el polo, la altura del observador o de un panel cambia mucho la luz (Abiertas).

**Visual (Estephano):**
1. En Vista, "Polo sur" recarga con `?sitio=connecting-ridge`; la nota muestra 89,4632° S y albedo 0,15. "Apollo 17" vuelve al sitio de siempre.
2. En el polo el día empieza a medianoche; los momentos son "Medianoche" y "Mediodía (tránsito)"; Sol no muestra salida ni puesta local.
3. Al mediodía del día 1 (2026-11-06 03:20 UTC), el Sol está a +2,0° al norte y el poste proyecta una sombra larguísima hacia el sur.
4. En Evaluación: Sol 423 h (59,6 %), Tierra 35,9 %; al avanzar los días, las horas de Sol bajan.
5. Con la Tierra oculta (−4,7°), Luz da luz terrestre 0.
6. En la vista Luna completa, la marca está en el polo sur.

**Follow-up:**
- Altura del observador y de paneles para la luz en el polo; mapa de iluminación del sitio (fracción de tiempo con Sol por punto).
- Otros sitios de PGDA (Shackleton rim, Peak near Shackleton).
- Albedo medido en el polo (LOLA LDAM polar).
- Horizonte desde cada punto en lugar del centro.

### E21. Altura del observador y validación de la iluminación contra Mazarico et al. (2011) (cerrado por pruebas 2026-11-06)
Origen: documento de enfoque de Estephano ("DEM lunar de alta resolución + imágenes reales LROC + efemérides SPICE + renderizado Three.js"). Al compararlo con el proyecto, las brechas reales eran la altura del observador y validar la iluminación contra un producto científico; Estephano eligió eso primero (consulta del 2026-11-06). Las demás quedan en Abiertas: DEM SfS de 5 m, textura NAC del polo y SPICE en el navegador.
**Qué:**
- **Horizonte desde cualquier altura:** los scripts de horizonte (`scripts/horizonte.ts`, `scripts/polo-lola.ts`) guardan, por azimut, la envolvente convexa superior del perfil de cada rayo (`envolventeSuperior`, `scripts/polar.ts`; 12–15 vértices). Para un observador a altura H, el horizonte es máx atan2(y − H, x) sobre esos vértices, exacto sin volver a leer el DEM.
  - Al volver a correr los scripts, los perfiles a ras del suelo no cambiaron (Δ = 0), y la envolvente los reproduce a ≤ 0,004°.
  - `elevacionHorizonte(az, alturaM)` en `src/engine/horizonte.ts`.
- **Evaluación (E19):** la altura del observador se elige entre suelo, 1,7 m (persona) y 10 m (mástil); las dos últimas son supuestos.
  - El relieve cercano (DTM) se mira desde esa misma altura. **Corrección de E19:** antes el ojo cercano iba a 1 m como mínimo; ahora va a ras del suelo (1 cm), que es lo que valida la comparación. En el Apollo 17 no cambia nada; en el polo, el día 1 baja de 423 h a 383 h de Sol y la Tierra de 35,9 % a 19,6 % (las cifras de E20 eran con el ojo a 1 m).
- **Validación** (`scripts/validar-iluminacion.ts`):
  - Referencia: los mapas de visibilidad media de Mazarico et al. (2011, *Icarus* 211; PGDA producto 69), `AVGVISIB_85S_060M_201608` y su versión `_EARTH`, leídos por rangos en el píxel del sitio. Definición, según la etiqueta PDS: "the percentage of timesteps where each pixel was sunlit (by any fraction of the solar disc)", con pasos horarios durante 18,6 años sobre el DEM LOLA de 60 m.
  - Serie propia: Sol y Tierra cada 3 h durante 18,6 años desde el 2026-11-06 (Horizons, DE441; 54 349 filas, Float32 en `src/data/serie-*-connecting-ridge.f32`, 870 KB).
  - El motor calcula la misma cantidad con `algoDelDiscoVisible` y `fraccionVisible` (`src/engine/evaluacion.ts`): borde superior del disco sobre el horizonte lejano y sin relieve cercano.
- **Panel:** en sitios con validación, "Promedio de 18,6 años" muestra Mazarico frente al motor, calculado en vivo para el punto y la altura elegidos.

**Resultado en el centro de Connecting Ridge:**

| | Mazarico 2011 (60 m) | Motor, suelo | Motor, 1,7 m | Motor, 10 m |
|---|---|---|---|---|
| Sol (alguna parte del disco) | 38,5 % | **36,6 %** (−1,9) | 49,0 % | 89,5 % |
| Tierra | 33,9 % | **30,3 %** (−3,6) | 45,6 % | 58,0 % |

Los 8 píxeles vecinos del mapa de referencia van de 22 % a 54 % (Sol): la cresta cambia mucho en 60 m. Sin el relieve cercano (solo el horizonte desde 250 m), el motor daba 60 %: lo cercano decide en el polo.
**Verificación:** `bun run test`: Apollo 17, 68 de 68; polo, 12 de 12. Build y lint sin errores. En Chrome, el panel y el selector de altura funcionan y D1 dice "sin errores". Nuevas pruebas:
- La envolvente reproduce el horizonte a ras del suelo y baja con la altura.
- La serie está completa (18,6 años).
- **A ras del suelo, el motor coincide con Mazarico a ±5 puntos en el Sol y la Tierra.** La tolerancia es mucho menor que la variación espacial del mapa en la cresta.
- A 10 m, el Sol se ve más del doble que a ras del suelo.

**Simplificaciones:**
- Semidiámetros fijos (Sol 0,266°, Tierra 0,95°; ENV-007).
- El intervalo de 18,6 años de Mazarico no se publica; usamos 2026–2045.
- La altura del observador de la referencia no se publica; se compara con la de suelo.
- El horizonte lejano se mide desde el centro del sitio.

**Visual (Estephano):**
1. En el polo, Evaluación muestra "Altura del observador" con Suelo / 1,7 m / 10 m; con Suelo, "Promedio de 18,6 años" da Mazarico 38,5 % · 33,9 % y motor 36,6 % · 30,3 %.
2. Con 10 m, las horas de Sol del día 1 suben al 100 % y el promedio a 89,5 %.
3. En el Apollo 17 no aparece el bloque de 18,6 años (no hay validación para ese sitio) y la altura cambia poco, porque los macizos están lejos.
4. El título del panel y de la página es "Lunar Landing Site Navigator".

**Follow-up:**
- Validar en otros puntos del mapa (no solo el centro) y en el Apollo 17 (mapas ecuatoriales: no existen en ese producto).
- Validación temporal contra imágenes LROC con fecha conocida.
- DEM SfS de 5 m (Bertone et al. 2025, Zenodo 10.5281/zenodo.17954508, CC-BY-4.0; Connecting Ridge en un ZIP de 2,2 GB).
- Mapa de iluminación por punto en la escena.

### D4. Rendimiento con el reloj corriendo (cerrado por medición 2026-11-07)
Estephano: "ha bajado mucho los fps". Aprobado el 2026-11-07 ("tiene que estar optimizado").
**Diagnóstico** (Chrome, medido antes de tocar nada):
- En pausa va fluido: la acumulación de E15.5 converge en 64 cuadros y después solo muestra el promedio.
- Con el reloj corriendo, la firma de la acumulación incluye `estado.t` (`src/scene/LunarScene.tsx`), así que cada cuadro se dibuja entero.
- El costo está en la GPU: la penumbra PCSS usa 32 + 32 muestras por luz y por píxel (`src/scene/penumbra.ts`), con dos luces, en un lienzo de 1666 × 1752 (densidad 1,6). Al achicar el lienzo 6,5 veces, los fps subieron 2,4 veces.
- En la CPU, el rebote (`reboteEnVertices`) costaba 3 ms en el Apollo 17 y 12 ms en el polo, en cada cuadro. El comentario decía "~3 ms". El resto del motor (evaluación, cielo, horizonte) cuesta menos de 0,1 ms por cuadro.
- No es una regresión de E19–E21: el commit de E18 daba los mismos fps. La medición absoluta de fps varía con el estado del navegador (ahorro de energía: hasta una página vacía bajó a 30 fps), así que la comparación final se hizo con el temporizador de GPU (`EXT_disjoint_timer_query_webgl2`), con las dos versiones medidas una tras otra.
**Qué** (solo representación; el motor no cambia):
1. **Penumbra en movimiento:** con la escena en movimiento (cambió la firma o la cámara), 8 muestras por paso en vez de 32, mediante el uniforme `lunaRapido` y bucles con corte (sin recompilar). Quieta, vuelven las 32. El último cuadro rápido se descarta del promedio. Archivos: `src/scene/penumbra.ts`, `src/scene/materiales.ts` (`UNIFORME_RAPIDO`), `src/scene/Acumulacion.tsx`.
2. **Densidad de píxeles 1 en movimiento:** la escena se dibuja en un destino reducido (`actualRapido`) y la mezcla lo amplía a la pantalla; quieta, resolución completa. No cambia el tamaño del lienzo.
3. **Rebote con caché:** se recalcula si el Sol o la Tierra se movieron más de 0,1° (un quinto del disco solar; supuesto sin medir el efecto en la imagen). A los 200 ms sin cambios se calcula el exacto del instante mostrado (`useRebote`, `src/scene/LunarScene.tsx`).
- ENV-006: la interfaz lo declara en "No físico".
**Outcome** (Chrome, densidad 1,6; GPU por cuadro, mediana):

| | Antes (deb0c1d) | Después |
|---|---|---|
| Apollo 17, en pausa | 1,0 ms · 120 fps | 1,0 ms · 120 fps |
| Apollo 17, reloj ×1 / ×10 000 | 7,5 ms · 104 fps | 3,8–4,2 ms · 120 fps (tope de la pantalla) |
| Polo, reloj ×1 / ×10 000 / ×100 000 | 9,6–10,2 ms · 82–85 fps | 3,7–4,0 ms · 120 fps |

Sin tareas largas en el hilo principal. Build, lint y pruebas (68 + 12) sin errores; consola sin errores.
**Visual (Estephano):**
1. Con el reloj corriendo, la imagen se ve un poco más suave y con más grano en la penumbra.
2. Al pausar, en menos de un segundo vuelve la nitidez y el grano desaparece, igual que antes.
3. Con "Sin grano en pausa" apagado, el grano en movimiento es visible y en pausa también, como antes.
**Follow-up:** medir cuánto cambia la imagen con el umbral de 0,1° del rebote; si en equipos más débiles no alcanza, bajar los mapas de sombra (4096 y 2048) mientras corre el reloj.

### E22. Coordenadas y fechas libres en el motor (cerrado por pruebas 2026-11-07)
Origen: el reto "Lunar Landing Site Navigator" (NASA Space Apps 2026) pide comparar sitios y fechas, con coordenadas propias. Estephano aprobó el plan E22–E25 el 2026-11-07: fechas de 2026 a 2030 (misiones próximas) y coordenadas propias solo dentro del polo sur.
**Restricción:** la API de Horizons no envía cabeceras CORS (comprobado el 2026-11-07), así que el navegador no puede consultarla. Una tabla por sitio no escala a coordenadas propias.
**Qué:**
- **Tabla global** (`scripts/efemerides-luna.ts`): cada 3 h, del 2026-01-01 al 2031-01-01, el punto subsolar y el sub-Tierra en ejes fijos a la Luna (MOON_ME de Horizons, DE441) y sus distancias. Son 14 609 filas en Float32, 457 KB (`src/data/efemerides-luna.f32` y `.json`, con procedencia y URLs).
  - Consulta: objetivo la Luna; observador el centro del Sol o de la Tierra; cantidades 14 (punto sub-observador), 20 y 21.
  - El punto sub-observador es el de la Luna cuando la luz la alcanza, así que cada fila se corre a t − tiempo de luz (8,3 min para el Sol) y se vuelve a muestrear. Sin esa corrección, el error era de 0,07°.
- **Motor** (`src/engine/efemeridesLuna.ts`, puro): la dirección desde un sitio es la del cuerpo menos la posición del sitio sobre la esfera de 1737,4 km, en ejes este-norte-arriba.
  - Así entra el paralaje, de hasta ~0,26° para la Tierra.
  - Diámetros con R☉ de FA (tabla B.4, p. 673) y el radio ecuatorial de la Tierra; la fase de la Tierra sale de la geometría.
  - `cieloEn(tabla, sitio, ms)` da el objeto completo; `elevacionesEn` sirve para barridos largos sin crear objetos.
  - La tabla es binaria: quien la usa la lee y se la pasa a `crearTablaLuna`.
**Verificación** (`tests/efemerides.test.ts`, 4 pruebas; `bun run test` pasa de 68 a 72 en el primer grupo, más 12 del polo). Contra Horizons consultado por sitio, que es un cálculo independiente:

| Comparación | Filas | Peor error, Sol | Peor error, Tierra |
|---|---|---|---|
| Apollo 17, 6 días lunares (E18) | 4266 | 0,0060° | 0,0065° |
| Connecting Ridge, 6 días (E20) | 4267 | 0,0060° | 0,0064° |
| Connecting Ridge, serie de 18,6 años (E21), tramo 2026–2030 | 12 137 | 0,0060° | 0,0060° |

- Además: diámetro del Sol a < 1″, de la Tierra a < 2″, fase a < 0,1 % y distancia al Sol a < 10⁻⁶ UA.
- El residuo (~0,006° = 20″) es la aberración anual: el observador de la consulta está en el centro del Sol o de la Tierra. Es el 1 % del disco solar.
- Paso de 3 h: probado contra 1 h y 2 h, la diferencia es ≤ 0,0005°.
**Simplificaciones:** altitud 0 sobre la esfera, como las tablas de E5 (5 km de relieve cambian la dirección de la Tierra en < 0,001°); sin aberración anual; fuera de 2026–2030, el motor se limita a los extremos.
**Visual:** ninguno; la interfaz llega en E23.
**Follow-up:** la escena 3D sigue usando las tablas por sitio (horarias, validadas), que coinciden con esta a 0,006°. Aplicar la aberración anual si se necesitara precisión de segundos de arco.

### E23. Planificador de sitio y fecha: vista 2D (cerrado por pruebas 2026-11-07)
Origen: el reto pide ver el Sol y la Tierra respecto del horizonte en un sitio y una fecha, cuánto falta para que se pongan, las ventanas de energía y comunicación, y vistas 2D o líneas de tiempo. Aprobado con E22–E25 el 2026-11-07.
**Qué:**
- **Máscara de horizonte** (`src/engine/mascara.ts`): por azimut, la envolvente convexa superior del terreno (E21). Para los sitios detallados une el horizonte lejano (E10, E20) y el cercano.
  - El cercano sale del DTM de 2 m (`scripts/horizonte-cercano.ts`: rayos cada 0,5° con pasos de 1 m hasta el borde del recorte; campo `envolventeCercana` en `horizonte-<sitio>.json`).
  - Así el planificador incluye el relieve cercano sin cargar el DTM.
- **Planificador** (`src/engine/planificador.ts`, puro): barrido cada 10 min con la tabla global (E22), ventanas con bordes interpolados, resumen y cuenta regresiva (`proximoCambio`, bisección al segundo).
  - Definiciones:
    - Sol visible: alguna parte del disco sobre el horizonte (Mazarico, E21), y la energía se pondera por la fracción del disco.
    - Tierra visible: su centro sobre el horizonte (como E19).
    - Energía: panel vertical que gira hacia el Sol, 1361 W/m² (FA p. 542) × fracción × cos(elevación). El panel es un supuesto.
  - Resumen: % de Sol, de Tierra y de ambos; horas de Sol; noche más larga; silencio más largo (sin Tierra); panel medio.
- **Interfaz** (`src/ui/Planificador.tsx`, `src/ui/lugares.ts`): vista "Planificador de sitio y fecha (2D)" en el panel; sin escena 3D. Contiene:
  - Lugar, inicio (UTC, 2026–2030), período (7 días, 1 día lunar o 90 días) y altura (suelo, 1,7 m, 10 m).
  - Tarjetas del instante: elevación, altura sobre el horizonte, azimut, fase, cuenta regresiva a la puesta o salida del Sol y de la Tierra, y energía.
  - Línea de tiempo con las ventanas de Sol (con la curva de energía), Tierra y ambos; clic o arrastre para elegir el instante.
  - Cielo en panorámica de 360° centrada en el meridiano hacia el ecuador, con el horizonte real y las trayectorias del período.
  - Resumen y "Cómo se calcula".
**Verificación:** `bun run test`: 77 + 13 pruebas.
- `tests/planificador.test.ts` (4 pruebas):
  - Sin la parte cercana, la máscara reproduce el horizonte del archivo a ≤ 0,01°.
  - La parte cercana nunca baja el horizonte, y desde 10 m nunca sube.
  - Las ventanas suman lo mismo que el resumen.
  - La cuenta regresiva cae en el borde de la ventana a ±60 s.
  - El panel va de 0 a 1361 W/m².
- **El planificador reproduce el motor de la escena** en el día lunar 1 en el centro (`tests/comparar-planificador.ts`, en las pruebas de cada sitio). Son cálculos independientes: tabla global con máscara, frente a tablas por sitio con horizonte y marcha de rayos sobre el DTM. Tolerancia ±0,5 puntos; resultado:

| | Suelo | 1,7 m | 10 m |
|---|---|---|---|
| Apollo 17, Sol · Tierra | 47,73 % · 100 % (iguales) | iguales | iguales |
| Connecting Ridge, Sol | 54,05 % frente a 53,98 % | 71,50 % (igual) | 100 % (igual) |
| Connecting Ridge, Tierra | 19,56 % (igual) | 41,61 % (igual) | 55,11 % (igual) |

- En Chrome: el planificador carga en los dos sitios; 90 días se recalculan en ~50 ms; consola sin errores; D1 "sin errores".
**Visual (Estephano):**
1. En el panel, "Planificador de sitio y fecha (2D)" reemplaza la escena; el panel solo muestra Vista.
2. Polo, 2026-12-01, 1 día lunar, suelo: Sol oculto que sale en 3 d 08 h (2026-12-04 08:51); Tierra oculta que sale en 17 d 08 h; resumen con Sol 56,8 %, Tierra 19,9 % y ambos 9,4 %.
3. En el cielo, la trayectoria amarilla del Sol pasa sobre el relieve gris por el oeste y el norte; el disco hueco indica que está oculto.
4. Al hacer clic en la línea de tiempo cambian las tarjetas y los discos del cielo.
5. Apollo 17: Tierra visible el 100 % del tiempo y "sin cambios en los próximos 60 días".
**Follow-up:**
- La noche más larga cuenta las noches cortadas por el borde del período.
- La energía usa 1 UA en el barrido (±3,4 % en el año); la tarjeta del instante sí usa la distancia real.
- Catálogo y coordenadas propias: E24. Comparación de escenarios: E25.

### E24. Catálogo del polo sur y coordenadas propias (cerrado por pruebas 2026-11-07)
Origen: el reto pide una lista de sitios notables y coordenadas propias. Estephano aprobó el 2026-11-07: coordenadas propias solo dentro del polo sur.
**Qué:**
- **Catálogo** (`scripts/catalogo-polo.ts` → `src/data/catalogo-polo.json`):
  - Los 10 sitios del DTM de 5 m de LOLA de PGDA (README de PGDA; Barker et al. 2021; numeración de Mazarico et al. 2011): Connecting Ridge, borde de Shackleton, Nobile 1 y 2, pico cerca de Shackleton, de Gerlache, Leibnitz Beta, Malapert, Haworth y Shoemaker. Sus nombres coinciden con regiones candidatas de Artemis III; el punto es el centro del mosaico, leído de la cabecera del GeoTIFF.
  - Las 17 **zonas de aterrizaje candidatas (RoI)** de Barker et al. (2021): centroide de área de sus polígonos (`<sitio>_ROIs.tgz`, 1–3 KB). En Site11 el .dbf no sigue el orden de los polígonos.
  - IM-2 Athena (CLPS): 84,7906° S, 29,1957° E (alunizaje del 2025-03-06).
  - El centro de Connecting Ridge leído de la cabecera coincide exacto con el de E20.
- **Horizontes del catálogo** (`scripts/catalogo-horizontes.ts`, 27 archivos `horizonte-catalogo-<id>.json`, 3,3 MB; se bajan solo al elegir el sitio).
  - Método: DTM de 5 m de PGDA hasta 4 km (leído por rangos, ~20 MB por sitio) y LOLA de 240 m y 960 m hasta 150 km. Rayos cada 0,5° con la esfera exacta y envolvente por azimut (E21).
- **Puntos propios** (`src/engine/demPolar.ts`): DEM polar para el navegador desde LOLA LDEM_75S_240M (`scripts/dem-polo.ts`, leído por rangos 43 MB de 58).
  - Rejillas: 240 m hasta 195 km del polo (5,3 MB) y 960 m hasta 340 km (1,0 MB). Se bajan solo si hace falta.
  - Dominio: 190 km (~83,7° S). La máscara se calcula en ~20 ms con el mismo método.
  - La interfaz lo marca como **horizonte aproximado**. IM-2 también lo usa, porque no tiene DTM de 5 m.
- **Interfaz:**
  - El lugar se elige por grupos: escena 3D, RoI, sitios de PGDA, misiones y puntos propios.
  - Punto propio por latitud y longitud, o con clic en un **mapa polar** (`src/ui/MapaPolar.tsx`: LOLA 960 m, ±200 km, sombreado cartográfico declarado como no físico, círculo del dominio y sitios marcados).
  - La envolvente convexa pasó al motor (`src/engine/mascara.ts`); `scripts/polar.ts` la reexporta.
**Verificación** (`tests/catalogo.test.ts`, 7 pruebas; `bun run test`: 86 + 13):
- Centro de Connecting Ridge igual al de E20. Estereográfica de ida y vuelta exacta. El DEM de 240 m da la altura del centro a 2,3 m del DTM de 5 m.
- Connecting Ridge con el método del catálogo frente al horizonte detallado de E20: 0,03° RMS desde 1,7 m y 0,40° a ras del suelo. A ras del suelo mandan los primeros metros (ojo a 1 cm).
- Horizonte aproximado (240 m) frente al detallado desde 10 m: 0,20° RMS. A ras del suelo queda ~1,2° más bajo en promedio.
- **Barker et al. (2021)** dicen que las RoI 4–6 de Connecting Ridge superan el 70 % de luz a 1 m y son las mejores del sitio. El motor, a 1 m y en 2026–2030, da RoI 4–6 = 88,0 %, 85,0 % y 90,3 % (media 87,8 %) frente a 82,7 % de media en las RoI 1–3 y 7.
- **Mazarico et al. (2011)**, 26 puntos dentro de 85° S (píxeles leídos por rangos, `scripts/validar-catalogo.ts` → `validacion-catalogo.json`), a ras del suelo:

| | Error medio, Sol | Error medio, Tierra |
|---|---|---|
| Catálogo (5 m + LOLA) | 14,4 puntos | **4,3 puntos** (prueba: ≤ 5) |
| Aproximado (240 m) | 13,0 puntos | 3,7 puntos |

- Para el Sol a ras del suelo, los DEM de 5 m y de 60 m difieren de verdad. En las RoI el 5 m da menos Sol (44–61 % frente a 65–86 %), porque bultos de pocos metros tapan el Sol rasante; el 60 m los suaviza. En los sitios de terreno suave coinciden a ~1 punto (Shackleton centro 11,0 frente a 11,0; Shoemaker 33,2 frente a 34,2; Nobile 1 31,2 frente a 29,7).
- Los vecinos de 60 m del mismo mapa varían hasta 70 puntos (pico cerca de Shackleton: 17–86 %). Por eso la prueba usa la Tierra y la referencia de Barker a 1 m, que es comparable.
- El aproximado (240 m) puede diferir del de 5 m hasta ~40 puntos de Sol en crestas y bordes de cráter (Shackleton RoI 2: 83,5 frente a 45,2 a ras del suelo). La interfaz lo advierte.
- En Chrome: 27 sitios en sus grupos, mapa polar con los sitios donde corresponde, punto propio por clic, consola sin errores.
**Visual (Estephano):**
1. Planificador → Lugar: grupos "Zonas de aterrizaje candidatas (RoI…)" (17), "Sitios del polo sur (centro del mosaico de PGDA)" (9) y "Misiones" (IM-2, horizonte aproximado).
2. "Elegir en el mapa": relieve del polo con el círculo de 190 km; Malapert arriba (0°), de Gerlache a la izquierda (~290° E), Shackleton junto a la cruz del polo. Un clic dentro del círculo crea "Punto propio" con un aviso amarillo de horizonte aproximado.
3. Connecting Ridge · RoI 6, 2026-12-01, suelo: Sol 100 % del mes.
**Follow-up:**
- Los centros de mosaico no son puntos elegidos para aterrizar (el de Shackleton cae en la pared interior, con 11 % de Sol). Las RoI sí lo son.
- Faltan las regiones oficiales de Artemis III: la capa de Moon Trek no tiene descarga directa.
- Para un punto propio más preciso haría falta un DEM fino por teselas.
- La altura del observador de Mazarico no se publica: para una validación más fina haría falta su DEM de 60 m.

### E25. Comparar escenarios y mes a mes (cerrado por pruebas 2026-11-07)
Origen: el reto pide comparar varios sitios o fechas lado a lado, para reaccionar rápido cuando cambia la fecha o el sitio de una misión. Aprobado con E22–E25 el 2026-11-07.
**Qué** (`src/ui/Comparacion.tsx`, `porMeses` en `src/engine/planificador.ts`):
- **Comparar escenarios:** "+ Agregar a la comparación" guarda el escenario de arriba (lugar, inicio, período, altura), hasta 6.
  - Tabla con Sol, Tierra, ambos, noche más larga, silencio más largo y panel medio. La mejor cifra de cada columna va en verde.
  - Líneas de tiempo alineadas desde el inicio de cada escenario.
  - Clic en un escenario lo carga arriba. "Mismo lugar, mes siguiente →" corre la fecha un mes sinódico.
- **Mes a mes, 2026–2030:** para el lugar y la altura elegidos, el Sol y la Tierra visibles y la noche más larga en cada uno de los 61 meses sinódicos (29,53 d, LSB p. 58) desde el 2026-01-01. Clic en un mes lo carga arriba como período de un día lunar. Calcula 87 000 instantes cada 30 min.
**Verificación:** `tests/planificador.test.ts`, 2 pruebas nuevas.
- Son 61 meses de 29,530589 d, y su promedio es el del período entero a ±0,5 puntos.
- En Connecting Ridge la Tierra varía más de 10 puntos entre meses (libración, FA p. 413) y nunca se ve el mes entero.
- En Chrome: tres escenarios (Connecting Ridge en dos meses y una RoI de Shackleton a 10 m) se comparan con sus mejores cifras en verde; el mes a mes muestra el ciclo estacional; consola sin errores.
**Visual (Estephano):**
1. En el planificador, "+ Agregar a la comparación" dos veces, con "Mismo lugar, mes siguiente →" en medio: aparecen dos filas de Connecting Ridge con un mes de diferencia.
2. Al elegir otra zona y agregarla, la tabla marca en verde la mejor cifra de cada columna.
3. En "Mes a mes" se ven meses con Sol casi todo el tiempo y meses con noches de casi 13 días: es la estación del polo: allí el Sol puede no salir ni ponerse en meses (FA p. 412, como en E20).
4. Clic en un mes: arriba cambia el inicio a ese mes.
**Follow-up:** guardar los escenarios entre sesiones; exportar la tabla (CSV) para el equipo de misión.

### E26.1. Motor de descenso del LM con el guiado del Apollo (cerrado por pruebas 2026-11-07)
Origen: Estephano pidió una simulación de aterrizaje con un asistente (2026-11-07) y eligió: descenso físico, guiado polinómico del Apollo, el LM del Apollo, en 3D, veredicto según los requisitos del usuario, asistente al abrir con los pasos misión y nave, sitio, fecha y hora, y requisitos. Con "dale con todo" aprobó las recomendaciones: escena 3D en Connecting Ridge y Apollo 17, tabla global de E22, rumbo con la regla del Apollo, tolerancias de ±15 s, ±10 % y ±3 %. Fuentes nuevas (descargas aprobadas): R-695, TN D-6846, TN D-7143 (DPS) y las fichas NSSDCA de los LM 11 y 17 (`docs/fuentes.md`).
**Qué** (`src/engine/descenso.ts`, puro):
- **Integración:** LM como masa puntual sobre la Luna esférica, con μ = 4902,801 km³/s² (FA p. 673). Paso de 0,1 s (RK2), y el combustible baja según el impulso específico de 305 s (DPS p. 7).
- **Guiado P63 y P64:** ec. 7 de R-695 (p. 16), ACG = 12(RTG − RG)/T² + 6(VTG + VG)/T + ATG, una pasada cada 2 s.
  - En P63, T se recalcula con la cúbica de la ec. 12 (p. 18). En P64 se fija al entrar (TAPI, pp. 53–54) y luego avanza con el reloj: sin redesignar el sitio, la ec. 12 se vuelve 0/0 sobre él.
- **P66 (pp. 31–32):** velocidad horizontal a cero (constante de 5 s, empuje a ≤ 20° de la vertical) y velocidad vertical de referencia de −3 pies/s (constante de 1,5 s). Termina en el contacto de la sonda, a 12 pies (TN tabla I).
- **Regulador (R-695 p. 8; TN tabla I):** 10 % los primeros 26 s; después 92,5 % fijo si se piden más del 65 %, o entre 11 % y 65 %.
- **Objetivos** (R-695 explica cómo se eligen, pp. 51–56, pero no publica los valores):
  - P63: la puerta alta de TN (7515 pies, −145 pies/s, 485 pies/s, 4,5 millas náuticas), extrapolada 60 s con 57 % de empuje a 60° (R-695 p. 54; cambio de fase a 60 s del objetivo, TN p. 10).
  - P64: el término a 150 pies y −3 pies/s sobre el sitio (TN p. 10), extrapolado 10 s (supuesto).
  - TAPI = 168 s, derivado de la línea de tiempo de TN.
  - Sacudida objetivo 0. Probé valores entre −0,004 y 0,006: casi no cambian la recuperación del regulador y empeoran la puerta alta.
- **Encendido:** se busca por bisección el alcance que deja la puerta alta a las 8:26, como el algoritmo de encendido de P63 (R-695 p. 30). Da 264,8 millas náuticas (TN: "approximately 260", p. 8).
- **Luz:** `rumboApollo` deja el Sol a la espalda. `luzDelDescenso` mide la línea de vista del LM al sitio en P64 frente a la elevación del Sol, el criterio de TN p. 10. `posicionEnEscena` lleva las muestras a los ejes de la escena.
**Verificación** (`tests/descenso.test.ts`, 8 pruebas; `bun run test`: 94 + 13). Contra TN D-6846, que es independiente: de TN el motor solo toma el estado inicial, los dos términos y la duración de P64.

| | Motor | TN D-6846 | Tolerancia |
|---|---|---|---|
| Puerta alta | 505,7 s; 7564 pies; −148 pies/s; 506 pies/s | 8:26; 7515; −145; 506 | calibrada (±2 s) |
| Puerta baja (512 pies) | 615 s | 606 s | ±15 s ✓ |
| Contacto | 710 s | 714 s | ±15 s ✓ |
| Estado a 2:56 | 45 468 pies; 4058 pies/s | 44 934; 4000 | ±10 % ✓ |
| Estado a 4:18 | 38 216 pies; 3164 pies/s | 39 201; 3065 | ±10 % ✓ |
| ΔV | 6708 pies/s | 6775 | ±3 % ✓ (−1,0 %) |
| Combustible | 16 837 lb | 16 960,9 (tabla II) | ±3 % ✓ (−0,7 %) |
| Alcance de encendido | 264,8 millas náuticas | ~260 | ±5 % ✓ |
| **Recuperación del regulador** | 408 s | 384 s | **±15 s ✗ (+24 s)** |

- **Luz del Apollo 11** (`scripts/luz-apollo11.ts` → `src/data/luz-apollo11.json`): Horizons da el Sol a 10,70° de elevación y 88,8° de azimut en el sitio (LROC-COORD) a las 20:17:40 UT (NSSDCA), frente a los 10,9° nominales de TN. La regla del Apollo da rumbo 268,8°: el Apollo 11 voló hacia el oeste, y la línea de vista queda por encima del Sol.
**Simplificaciones:** masa puntual; Luna esférica sin rotación ni relieve; descenso en un plano; actitud instantánea; sin retardo de cálculo (ec. 7 en vez de 11); el perfil del Apollo 11 (masa de 34 000 lb) se usa para cualquier sitio y fecha.
**Visual:** ninguno; la escena llega en E26.3.
**Follow-up:**
- La recuperación del regulador llega +24 s tarde: depende del empuje final y la inclinación de P63, que R-695 elige por búsqueda.
- Rotación de la Luna (4,6 m/s en el ecuador) y retardo de cálculo (ec. 11).
- El LM extendido del Apollo 17 (16 456 kg; 8874 kg de combustible, NSSDCA) cambiaría el perfil.

### E26.2–E26.4. Asistente, descenso en 3D y el mapa como protagonista (cerrado por pruebas y revisión DI 2026-11-07)
Origen: lo aprobado en E26.1, más el pedido de Estephano de usar Center Stage (p. 231), Wizard (p. 86), Datatips (p. 447), Dynamic Queries (p. 455) y Data Brushing (p. 459), y de entrar "en bucle con subagentes" hasta cumplir las reglas de *Designing Interfaces* (DI).
**Qué:**
- **E26.2, simulación (motor, `src/engine/simulacion.ts`):**
  - `simularAterrizaje` lleva el descenso nominal (E26.1) a un sitio y una hora de contacto de 2026–2030 y entrega:
    - el rumbo con la regla del Apollo;
    - la luz de la aproximación (TN p. 10);
    - el Sol y la Tierra en el contacto;
    - la Tierra durante el descenso;
    - la estadía (E23) y el inicio de su noche más larga;
    - el veredicto contra **los requisitos del usuario**: combustible, línea de vista sobre el Sol, Sol y Tierra en el contacto, noche frente a batería, Tierra en la estadía e inclinación sobre las patas (E19). Cada criterio con su fuente.
  - `sugerirContacto` y `candidatosContacto` buscan cada 3 h en el mes; los candidatos quedan separados ≥ 24 h.
  - `estadoGlobal` da el estado de la escena desde la tabla de E22, para cualquier fecha.
- **E26.2, asistente (`src/ui/Asistente.tsx`; Wizard, DI pp. 86–88):**
  - Seis pasos: misión y nave (con los días en superficie), sitio, requisitos, fecha y hora, comparar y resumen.
  - Hay un mapa de pasos que se recorre libremente, con Atrás y Siguiente, valores por defecto (p. 88) y "Saltar y explorar" (p. 86).
  - Los requisitos van antes de la fecha porque la sugerencia los usa (p. 87). "Comparar" pone las mejores horas del mes lado a lado, con la ventana anclada para poder volver a una opción anterior.
  - Se abre la primera vez (`localStorage`, con try/catch) y también desde "Simular un aterrizaje…", desde el planificador ("Simular aterrizaje en 3D aquí") y desde la comparación ("3D").
  - El plan viaja en la URL, porque cambiar de sitio recarga la página (E20).
- **E26.3, descenso en 3D (`src/scene/Vuelo.tsx`):**
  - El LM real (E15.6, en vuelo) recorre la trayectoria dentro de ±30 km, con la línea coloreada por fase y una cámara que lo sigue.
  - Panel inferior plegable (`src/ui/PanelSimulacion.tsx`), con:
    - lecturas compactas;
    - un perfil de altura frente a distancia con datatip y selección, enlazado con la escena por los mismos colores por fase (Data Brushing);
    - el deslizador del descenso y otro de estadía, cuya pista muestra las ventanas reales de Sol y Tierra (Dynamic Queries).
- **E26.4, Center Stage:**
  - El veredicto vive en el panel lateral (`src/ui/SeccionRequisitos.tsx`), con umbrales editables en línea que recalculan el veredicto al instante. Cada criterio lleva la escena al momento que lo decide, y la marca de criterio enfocado se borra al mover el tiempo.
  - Secciones plegables (pp. 249–250), con títulos que se distinguen de los subtítulos (Titled Sections, p. 238). Vista y Evaluación se pliegan durante la simulación.
  - El amarillo sólido queda solo para la acción principal.
  - Datatip del terreno (pp. 447–448): posición, altura, pendiente, inclinación del LM, y Sol y Tierra desde la altura de Evaluación ("tapado por el relieve cercano" cuando corresponde), más una pista de clic. Cambia de lado según los paneles reales.
**Revisión DI** (subagente independiente con el PDF, el código y capturas reales; 4 rondas):

| Ronda | Bloqueantes | Mejoras | Resultado |
|---|---|---|---|
| 1 | 4 | 8 | Faltaba Titled Sections; el panel inferior tapaba más de 1/3; el orden del asistente estaba invertido; faltaba el paso de comparar |
| 2 | 0 | 7 | Todos los patrones cumplen salvo Data Brushing (parcial) |
| 3 | 0 | 2 | Marca de criterio enfocado desactualizada y de color ambiguo |
| 4 | 0 | 0 | "Sin hallazgos pendientes": los 7 patrones cumplen |

- Discrepancia resuelta a favor de Estephano: el revisor propuso quitar el paso "Misión y nave", pero Estephano lo eligió. Quedó, y ahora contiene los días en superficie.
**Verificación:** `bun run test`: 100 + 13, con pruebas nuevas de simulación (veredicto según requisitos, sugerencia, candidatos) y del estado global frente al estado por sitio en el Apollo 17 (≤ 0,01°). Build y lint sin errores.
- En Chrome: asistente → simulación en Connecting Ridge; cambio de sitio al Apollo 17 por URL; LM bajando con la cámara de persecución; datatip; panel 253 px abierto / 106 px plegado sobre 1116 px; consola sin errores en carga limpia.
**Outcome:** asistente, simulación en 3D, veredicto y panel cumplen los patrones pedidos según la revisión independiente (ronda 4: sin hallazgos), con build, lint y pruebas limpios.
**Visual (Estephano):**
1. En una ventana privada (o borrando los datos del sitio): aparece "Simular un aterrizaje", con 6 pasos a la izquierda; "Saltar y explorar" lo cierra.
2. Polo, requisitos de ejemplo, "Ver las mejores horas del mes →": la tabla de Comparar muestra 2–3 horas; al elegir otra, la lista no cambia.
3. "Simular aterrizaje": el LM baja con la cámara detrás. El perfil (naranja P63, cian P64, verde P66) y la línea 3D usan los mismos colores, y al pasar el puntero por el perfil se ve el instante.
4. En el panel lateral, "Tus requisitos (7 de 7)": al cambiar "tu límite" de batería a 0 h y elegir una fecha con noche, el criterio pasa a "No cumple" al instante. Clic en el criterio: la estadía va al inicio de la noche y el criterio queda marcado con un borde blanco.
5. El deslizador de estadía muestra arriba el Sol (amarillo) y abajo la Tierra (azul); al moverlo cambia el cielo y las lecturas dicen "En superficie".
6. Al pasar el puntero sobre el terreno, el datatip muestra altura, pendiente, LM inclinado, y Sol y Tierra desde la altura de Evaluación; cerca del panel cambia de lado.
7. En el asistente, elegir el Apollo 17 desde el polo recarga la página con el plan.
**Follow-up:**
- La trayectoria 3D solo se ve dentro de ±30 km: el frenado (490 km) está en el perfil.
- El LM aparece en vuelo sin pluma del motor ni polvo.
- La sugerencia de hora es una ayuda (noche más corta y más Tierra), no una optimización de misión.
- Extender la escena 3D a las RoI de PGDA (DTM de 5 m).
- Datatip con enlace de "evaluar aquí" (drill-down, DI p. 448) más allá de la pista de clic.

### Plan NASA Space Apps 2026 (preparado 2026-11-13; se ejecuta el 14 y el 15 de noviembre)

**Requisitos de la entrega** (Project Submission Guide y Judging & Awards Guide 2026, publicadas el 2026-11-12):
- La entrega abre el sáb 14 a las 9:00 y cierra el dom 15 a las 23:59, hora del evento local.
- La página de entrega y todo lo enlazado van en inglés.
- La demo es un video de 30 s o menos, con subtítulos en inglés si se habla en otro idioma, o un máximo de 7 diapositivas. Pasarse del límite saca al proyecto del juicio global.
- Los enlaces deben ser públicos y sin login.
- Las referencias deben listar todo recurso externo: código, datos y texto.
- Criterios: Impact, Creativity, Validity, Relevance y Presentation, de 1 a 5 cada uno.

**Cobertura del reto:**
- Comparar sitios y fechas: E23 y E25.
- Sol y Tierra frente al horizonte real: E22 y E23.
- Energía y comunicación directa: el planificador y el veredicto de E26.
- Cuenta regresiva: E23.
- Vistas 2D y 3D: E23, E24 y E26.
- Comparación entre escenarios: E25.

Lo que falta es poder entregarlo y presentarlo.

| Paso | Qué | Toca |
|---|---|---|
| E27 | Datos del reto en la interfaz: enlaces "Ver en Quickmap" y "Ver en Moon Trek" por sitio o punto, y una sección "Fuentes" con el origen de cada dato | Ver el detalle abajo |
| E28 | Interfaz bilingüe ES/EN | Ver el detalle abajo |
| E29 | Material de entrega en inglés: README, referencias, texto de la página de entrega, guion de la demo de 30 s y las 7 tomas | `README.md`, carpeta nueva `entrega/` |
| E30 | Publicar: repo, despliegue y video, solo con aprobación aparte | Lo decide Estephano el 14 |

**E27, enlaces comprobados el 2026-11-13** (en el navegador, sitio del IM-2 a −84,7906°, 29,1957°):
- **Quickmap** (`quickmap.lroc.im-ldi.com`, su dirección nueva): `?proj=27&prjExtent=x0,y0,x1,y1`, con `proj=27` en estereográfica polar sur y la ventana en metros.
  - Sus metros coinciden con `estereoSur` (`src/engine/demPolar.ts`): el centro cayó a unos 20 m del punto pedido.
- **Moon Trek**: `#v=0.1&x=lon&y=lat&z=9&p=urn:ogc:def:crs:EPSG::104903&b=moon&e=lonMin,latMin,lonMax,latMax`. Sin `e`, vuelve a 0,0.
  - El centro cayó a unos 90 m del punto.
  - Esta proyección es equirectangular: cerca del polo la imagen sale muy estirada.
- **Supuesto:** ninguna de las dos herramientas documenta este formato. Lo saqué de cómo se comportan hoy.

**E28, interfaz bilingüe:**
- El inventario del 2026-11-13 contó unos 156 textos en JSX y 80 cadenas con tildes en `src/ui`, `src/scene` y `src/App.tsx`.
- `src/ui/Secciones.tsx` tiene 806 líneas, y sus secciones empiezan en las líneas 157, 280, 377, 427, 552, 581, 610, 649 y 707.
- **Diferencia (regla 8):** el motor devuelve textos en español para la interfaz. Son `Criterio.nombre`, `valor` y `fuente` (`src/engine/simulacion.ts:41` y `:105-155`).
- Hay números formateados con `toLocaleString('es-PE')` en `src/ui/Asistente.tsx:110,112`, `src/ui/Secciones.tsx:197,202,624,792` y `src/ui/Diagnostico.tsx:37`. Esto se cruza con F8 (formato de números).
- `index.html:2` dice `lang="en"` aunque la interfaz está en español.

**Riesgo abierto:** la entrega pide confirmar que es "trabajo original del equipo", y casi todo el proyecto es anterior al 14. Las guías no dicen si se puede traer trabajo previo. Estephano lo confirma con su Local Lead.

## Decisiones

| Fecha | Decisión | Motivo |
|---|---|---|
| 2026-11-13 | NASA Space Apps 2026: Estephano está inscrito. La interfaz será bilingüe ES/EN, no se pasa todo al inglés. Por ahora no se crea repo ni se publica nada. Hoy se prepara y el trabajo empieza el 14 | Estephano: "estoy inscrito vamos hacer todo en es en, todavia no crearemos repo ni nada, prepareremos todo para empezar el 14". La entrega exige inglés (Project Submission Guide 2026) |
| 2026-11-07 | E26.2–E26.4: asistente de 6 pasos (se conserva "Misión y nave", elegido por Estephano, frente a la propuesta del revisor de quitarlo), veredicto en el panel lateral con umbrales en línea, panel inferior compacto con perfil enlazado y deslizador de estadía, datatip del terreno; revisión DI en 4 rondas hasta "sin hallazgos" | Pedido de Estephano: Center Stage, Wizard, Datatips, Dynamic Queries y Data Brushing verificados en bucle con subagentes |
| 2026-11-07 | E26: simulación de aterrizaje con descenso físico (guiado polinómico del Apollo, R-695), LM del Apollo, en 3D en Connecting Ridge y Apollo 17, fechas 2026–2030 con la tabla de E22, rumbo con la regla del Apollo, veredicto según los requisitos del usuario y asistente al abrir | Elegido por Estephano; R-695 y TN D-6846 dan el guiado y un perfil para validar |
| 2026-11-07 | E25: comparación de hasta 6 escenarios y vista mes a mes 2026–2030 dentro del planificador | El reto pide comparar sitios y fechas para reaccionar a cambios de calendario |
| 2026-11-07 | E24: catálogo = sitios y RoI del DTM de 5 m de PGDA (Barker et al. 2021) más IM-2; horizontes precalculados con 5 m cerca; puntos propios con LOLA 240 m en el navegador, marcados como aproximados | Las regiones oficiales de Artemis III no tienen descarga; los sitios de PGDA tienen fuente y DTM fino; el 240 m solo alcanza para una primera mirada |
| 2026-11-07 | E23: planificador 2D aparte de la escena 3D; Sol visible = alguna parte del disco, Tierra = su centro; energía con panel vertical (supuesto); horizonte cercano como envolvente precalculada del DTM | El reto pide comparar rápido sitios y fechas; en 2D no hay costo de GPU y el cálculo coincide con el motor de la escena a ±0,07 puntos |
| 2026-11-07 | E22–E25 aprobados: fechas 2026–2030 (misiones próximas) y coordenadas propias solo dentro del polo sur. E22: una tabla global de puntos subsolar y sub-Tierra (MOON_ME) cada 3 h en vez de tablas por sitio | Elegido por Estephano; Horizons no tiene CORS, y la tabla global da cualquier sitio a ≤ 0,0065° de Horizons por sitio |
| 2026-11-07 | D4: en movimiento, penumbra de 8 muestras, densidad de píxeles 1 y rebote cada 0,1°; quieta, calidad completa y cálculo exacto | Pedido de Estephano ("tiene que estar optimizado"); la GPU por cuadro baja de 7,5–10 ms a ~4 ms con el reloj corriendo |
| 2026-11-06 | E21: altura del observador (envolvente del horizonte) y validación contra Mazarico et al. 2011; el ojo cercano pasa a ras del suelo | Elegido por Estephano tras comparar su documento de enfoque con el proyecto; la validación a ras del suelo coincide a ±5 puntos |
| 2026-11-06 | Nombre del proyecto: Lunar Landing Site Navigator (título de la página, panel y spec; el repo sigue siendo luna) | Elegido por Estephano (consulta del 2026-11-06), a partir de su documento de enfoque (DEM + LROC + efemérides + Three.js) |
| 2026-11-06 | E20: Connecting Ridge (PGDA Site01, centro del mosaico); selector que recarga con ?sitio=; días de medianoche a medianoche en el polo; datos polares leídos por rangos; albedo 0,15 (supuesto) | Elegido por Estephano (consulta del 2026-11-06). En el polo el Sol puede no salir ni ponerse en meses (FA p. 412) |
| 2026-11-06 | E20: el LDEM polar de 20 m no se usa | A 125 m por vértice del valle sobra el de 120 m, y el horizonte cercano sale del de 5 m |
| 2026-11-06 | E19 = panel de evaluación del sitio (valores sin veredicto, punto con clic, instante + día en curso); el polo sur pasa a E20 | Elegido por Estephano (consulta del 2026-11-06); sin fuentes de umbrales, un veredicto violaría la regla 3 |
| 2026-11-06 | Código bajo licencia Apache-2.0 | Elegido por Estephano: "motor científico abierto" |
| 2026-11-06 | Objetivo del proyecto: motor científico abierto para evaluar las condiciones de un aterrizaje lunar, con interfaz visual comprensible | Enunciado de Estephano; orienta la prioridad de los pasos siguientes (E19 en adelante) |
| 2026-11-06 | E15.6: LM híbrido. Cuerpo del modelo de NASA 3D Resources, tren reconstruido con NSSDCA, materiales físicos con luz del suelo; se hace antes de E19 | Elegido por Estephano (consulta del 2026-11-06). El modelo tiene el cuerpo a escala pero el tren un 40 % corto |
| 2026-11-06 | E15.6: excepción a la regla 10, se usa Chrome para depurar | Pedido de Estephano: "usa claude chrome para entrar y depurar". La prueba visual sigue siendo suya |
| 2026-11-06 | E18: seis días lunares en una tabla continua; se eliminan `DIA_LUNAR_S`, `T_MEDIODIA`, `T_SALIDA_LOCAL` y `T_PUESTA_LOCAL` en favor de `dia(k)`/`diaDe(t)`; « y » conservan las horas desde la salida | Una constante no puede ser "el día en curso"; comparar el mismo momento de meses distintos muestra la libración (FA p. 413) |
| 2026-11-06 | E18: el rango de distancia Tierra–Luna de FA se prueba solo en el primer día | Es la órbita media a(1 ± e); los perigeos reales de dic–abr bajan a ~355 300 km y no tenemos fuente para la variación de e |
| 2026-11-06 | Repo en `~/personal/luna`, separado de `arky-ai` | `arky-ai` es config; esto es un proyecto |
| 2026-11-06 | React Three Fiber 9 + drei 10 sobre three 0.187, con Bun y Vite | Encaja con `LunarScene.tsx` del enunciado y con la skill `threejs-react-three-fiber` |
| 2026-11-06 | Panel lateral derecho plegable, abierto al inicio, secciones con título | Patrones Center Stage, Collapsible Panels y Titled Sections |
| 2026-11-06 | En E1, luz de trabajo no física y color de superficie gris neutro (**supuesto**) | Sin Sol no se vería nada; el albedo real del regolito llega con cita del Lunar Sourcebook |
| 2026-11-06 | Los PDF de referencia viven en `docs/fuentes/`, fuera de git | Copyright (O'Reilly) y tamaño |
| 2026-11-06 | E1 aprobado; se pasa a E2 | Estephano: "dale con todo sigamos" |
| 2026-11-06 | En E2, sin luz ambiental: la sombra es negra | ENV-001: sin atmósfera no hay cielo que ilumine la sombra. Se omiten la luz reflejada por el terreno y la luz terrestre (simplificación, se ve en el panel) |
| 2026-11-06 | En E2, intensidad del Sol = 3, en escala visual y no en W/m² | ENV-006: la exposición es una decisión de representación |
| 2026-11-06 | En E2, marca roja de la L calculada | Compara la sombra renderizada (three) con la fórmula (motor): son dos cálculos independientes |
| 2026-11-06 | E2 aprobado y commit 1e46d36; se pasa a ENV-009 y ENV-010 | Estephano: "ya lo apruebo ahora mete 09 y 10" |
| 2026-11-06 | (Reemplazada en E8 por 0,085) Albedo 0.15 (tierras altas, 11–18 %, LSB p. 59); el material deja de ser el gris supuesto | ENV-009 lo necesita; el experimento menciona el polo, que es tierra alta |
| 2026-11-06 | Luces en unidades de "Sol directo = 1" × escala visual 10; la exposición va aparte, en EV | ENV-006: separar física y cámara. La luz terrestre (~10⁻⁴) es invisible sin exposición aumentada, y eso es correcto |
| 2026-11-06 | (Reemplazada en E9) Luz terrestre llena = 10⁻⁴ del Sol: **supuesto** | El LSB no trae la cifra; queda en Abiertas |
| 2026-11-06 | Tierra fija a 40° de elevación y azimut 90°: **supuesto** | La cara visible siempre mira a la Tierra (LSB p. 58); la posición exacta depende de la latitud y la longitud, que aún no modelamos |
| 2026-11-06 | Elevación solar de −90° a 90° | Sin noche no se ve la luz terrestre |
| 2026-11-06 | E2.1 cerrado (commit 85b00e4) | Estephano: "ok" |
| 2026-11-06 | E3 cerrado | Estephano: "ok sigamos avanzando" |
| 2026-11-06 | E3: reloj con velocidades ×1, ×1000, ×10 000 y ×100 000; arco solar real por latitud; latitud 45° (**supuesto**); el slider de elevación pasa a ser de tiempo | Elegido por Estephano (consulta del 2026-11-06) |
| 2026-11-06 | Ejes de la escena: +X este, −Z norte, +Y arriba | Hace falta para el azimut del Sol y de la Tierra |
| 2026-11-06 | Tierra a 90° − latitud, hacia el ecuador, desde longitud 0° | Reemplaza el supuesto fijo de 40°; se deriva de la cara visible (LSB p. 58), sin libración |
| 2026-11-06 | Poste cilíndrico de r = 0,25 m centrado en el origen | Con la sombra girando, un poste de caja ya no deja una cara fija del lado de la sombra; la marca tiene ±0,25 m de margen |
| 2026-11-06 | ENV-007 con PCSS calibrado, penumbra también para la Tierra, salida/puesta graduales y marcas de penumbra; el poste se mantiene; se arreglan F1–F5 | Elegido por Estephano (consulta del 2026-11-06) |
| 2026-11-06 | E4: datatip con penumbra, medición inversa con clic en la sombra, aparición al pasar el puntero; F6, F7 y F10 entran; F8 queda en Abiertas | Elegido por Estephano (consulta del 2026-11-06) |
| 2026-11-06 | E15.1: de la ortofoto solo se toman las variaciones, escaladas a la media de 0,085 | Sus DN no tienen escala radiométrica (etiqueta PDS: SCALING_FACTOR 1, OFFSET 0) |
| 2026-11-06 | D2: se elimina el detalle sintético del shader y las rocas quedan apagadas por defecto | Estephano: el patrón "no representa un impacto real"; regla del proyecto: lo no medido no se presenta como realismo |
| 2026-11-06 | E15.2: el detalle sintético es solo visual y no entra en el motor | Mezclar datos inventados con medidos en la física rompería la trazabilidad |
| 2026-11-06 | E15.3: con los equipos visibles se oculta el poste | El LM real está en el origen, donde se puso el poste en E3 |
| 2026-11-06 | E14 (Luna completa) primero; después E15 (realismo: albedo real con ortofoto normalizada, micro-relieve con estadística real, equipos del Apollo 17, cámara a 1,7 m, acumulación temporal) | Elegido por Estephano (consulta del 2026-11-06) |
| 2026-11-06 | E12: Hapke con albedo normal de 0,085 (P = 1, sin rugosidad); el rebote y el poste siguen lambertianos | El LSB da la forma y h, no w ni P; los parámetros por píxel de LROC WAC (Sato et al. 2014) quedan en Abiertas |
| 2026-11-06 | E11: parches de 8 m y vecinos a 120 m; sin la hemisphereLight | Equilibrio entre precisión (−9,5 % en el cráter de prueba) y costo (~3 ms en vivo); la hemisphereLight duplicaba luz sobre el terreno |
| 2026-11-06 | E10: horizonte desde SLDEM2015 (59 m) y no desde el NAC DTM | El NAC del Apollo 17 sin comprimir obligaría a bajar ~700 MB para 30 km de radio; a esa distancia 59 m sobran |
| 2026-11-06 | E9: luz terrestre con albedo de Bond 0,32 (FA p. 542) y Tierra lambertiana (supuesto); la cota con exitancia de 435 W/m² daría 8,8·10⁻⁵ | Es la única cifra con fuente en nuestros libros; la Tierra real no es lambertiana (nubes, océano) |
| 2026-11-06 | Se agregan E9.1 (Sol y Tierra dibujados en el cielo, tamaño real con lupa opcional declarada como ayuda) y E14 (vista de la Luna completa con LOLA y LROC WAC) | Pregunta de Estephano: "podemos ver ya el sol la tierra y la luna completa?"; elegido en la consulta del 2026-11-06 |
| 2026-11-06 | E8: reflectancia 0,085, `meshLambertMaterial`, exposición anclada a π y ACES por defecto con modo lineal | Matriz C1 y C2; RTR p. 289. Hapke queda para E12 |
| 2026-11-06 | E7: el día lunar no se repite (el reloj se detiene) en vez de extender la tabla | Lo mínimo y honesto; extender a varios días lunares queda en Abiertas |
| 2026-11-06 | E6 cerrado; se autoriza E7–E13 en el orden de la matriz de trazabilidad | Estephano: "si dale con todo hasta el e 13". Cada paso se cierra con su prueba automática y commit; la prueba visual queda en su lista |
| 2026-11-06 | E6: 400 m de terreno, centrado en la posición precisa del módulo, con el poste (y aviso de suelo no plano) y autosombra del terreno con sesgo por pendiente | Elegido por Estephano (consulta del 2026-11-06) |
| 2026-11-06 | El sitio de las efemérides pasa a la posición de LROC (20,1911° N, 30,7723° E) | Misma referencia para el Sol y el terreno; la de NSSDCA tiene ~300 m de incertidumbre |
| 2026-11-06 | Las alturas se guardan en JSON (400 KB) y no en binario | La importación es síncrona: el motor sigue siendo puro y sin cargas asíncronas |
| 2026-11-06 | E5 cerrado | Estephano: "pudale con todo" |
| 2026-11-06 | Las efemérides se descargan con un script y se guardan en el repo | Horizons no envía CORS; la tabla es pequeña (96 KB), es reproducible y lleva su procedencia |
| 2026-11-06 | El enunciado decía "No afirmaremos que reproduce efemérides reales"; desde E5 el Sol y la Tierra sí son reales para el Apollo 17 en el día lunar del 2026-10-15 al 2026-11-14 | Decisión de Estephano de usar datos de la NASA |
| 2026-11-06 | E4 cerrado | Estephano: "dale con todo" |
| 2026-11-06 | E5: Horizons, Apollo 17, día lunar en curso, se reemplaza el Sol simplificado | Elegido por Estephano (consulta del 2026-11-06) |
| 2026-11-06 | Se empieza a planificar el uso de datos reales de la NASA | Estephano: "vayamos sacando data de la nasa de la luna real para ir implementando". El enunciado del experimento 01 decía "no necesitamos todavía NASA APIs"; queda superado por esta decisión. El plan va después de cerrar E4 |
| 2026-11-06 | E3.1 cerrado | Estephano: "ok dale con todo" |
| 2026-11-06 | `shadows="basic"` | En three 0.187, PCF usa sampler2DShadow y no permite leer la profundidad cruda (WebGLShadowMap.js:261-272); drei SoftShadows usa una fórmula de perspectiva y un único tamaño global |
| 2026-11-06 | Las marcas van a r + distancia del eje y las distancias del panel se miden desde el borde del poste | La tapa del poste se proyecta igual sobre el suelo: la punta queda a L del borde |
| 2026-11-06 | Fuente PBR registrada como borrador de 2003 | Es el único ejemplar disponible; se cita con la paginación del borrador |
| 2026-11-06 | Fuentes FA y RTR registradas; el PDF de Markley se registra como no citable | FA y RTR traen datos y técnicas para ENV-007 y ENV-009; el PDF de Markley es un resumen de Bookey |
| 2026-11-06 | Fuente PSP registrada; aporta poco | Son 5 pp. de resúmenes de congreso, no un libro; solo sirve Bugiolacchi (cráteres pequeños, Apollo 17) |
| 2026-11-06 | Se agrega la fuente parcial SM (Fielder, *Secrets of the Moon*, caps. 1–5) | Respalda el método de sombras y sus límites; da casos de validación con datos medidos |

## Lo que aporta *Secrets of the Moon* (SM, caps. 1–5)

| Hallazgo | Cita | Uso en el motor |
|---|---|---|
| Las alturas lunares se midieron con la longitud de las sombras al amanecer y al atardecer locales | SM cap. 2 | Es nuestra fórmula al revés: h = L · tan(α). Candidato: modo "medir altura desde la sombra" |
| La forma del relieve se entiende comparando sombras bajo distintas iluminaciones; una sola foto da información parcial | SM cap. 1 | Justifica ENV-005 (tiempo): mover el Sol es un instrumento de medición, no un adorno |
| En terreno no plano, la altura deducida depende de la longitud de sombra (Straight Wall: ~300 m con sombras cortas y ~380 m con largas; error ±10 %) | SM cap. 4 | L = h / tan(α) vale solo en terreno horizontal. Candidato: ENV-008 |
| La penumbra solar y la rugosidad del terreno en la punta de la sombra impiden medir la longitud exacta | SM cap. 4 | Candidato ENV-007: el Sol no es puntual y la sombra tiene penumbra |
| El "seeing disc" es un efecto de la atmósfera terrestre | SM cap. 2, recuadro 2.1 | No aplica a un observador en la Luna (ENV-001). Solo aplicaría si simuláramos un telescopio en la Tierra |
| Straight Wall: ~112 km de largo, ~300–380 m de alto, cara de ~2 km en planta, pendiente entre 10° y 40°. Wrinkle ridge: 20 km de ancho, 250 ± 116 m | SM caps. 3–4 | Escenarios de validación con datos medidos, cuando haya relieve |

Lo que se deja fuera: el origen de los cráteres, la tectónica y las tesis propias del autor. Son interpretaciones, no reglas para este motor.

## Lo que aportan *Fundamentals of Astrodynamics* (FA) y *Real-Time Rendering* (RTR)

Revisado el 2026-11-06. FA da datos de la Luna; RTR dice cómo representarlos, no da reglas físicas lunares.

| Hallazgo | Cita | Uso en el motor |
|---|---|---|
| Mes sinódico de 29,530589 días | FA cap. 11.4, p. 257 | Confirma `DIA_LUNAR_S` (LSB da 29,531) |
| El ecuador lunar forma siempre 1,5424° con la eclíptica | FA cap. 17.1, p. 412 | Confirma la declinación máxima de ±1°32' (LSB p. 40) |
| La órbita lunar está inclinada 5,145° (varía entre 4,99° y 5,30°) respecto de la eclíptica | FA cap. 17.1, p. 412 | Resuelve en parte la Abierta del eclipse: el Sol pasa detrás de la Tierra solo cerca de los nodos, no todos los meses. Nuestro δ = 0 lo exagera |
| El cono de sombra de la Tierra tiene 0,53° de ángulo; por eso la luz solar se aproxima como un haz paralelo | FA cap. 20.4, p. 543 | (1) Respalda nuestra luz direccional. (2) **Corrección del 2026-11-06:** ese 0,53° es el ángulo del cono de sombra, 2·asin((R☉ − R⊕)/UA) = 0,528°, no el diámetro del Sol. El diámetro sale de R☉ = 695 508 km (FA tabla B.4, p. 673) y 1 UA = 149 597 870,7 km (FA p. 671): **θ = 0,533°**, que varía entre 0,524° y 0,542° durante el año. **Da el dato para ENV-007:** el Sol subtiende θ ≈ 0,533° (0,0093 rad). En la punta, la penumbra mide ΔL ≈ h · θ / sin²α: **~2,1 m con α = 12°** y ~0,2 m con α = 45°. Con el Sol bajo, la punta de la sombra es difusa |
| Constante solar de 1361 W/m² a 1 UA | FA cap. 20.4, p. 542 | Permitiría unidades radiométricas reales en vez de "Sol = 1". Candidato si medimos energía (paneles, temperatura) |
| La Luna no tiene luz de cielo: sombras completamente negras y nada de detalle en caras opuestas al Sol (foto del Apollo 15). El Sol subtiende ~0,5°; la luz nunca es puntual | RTR cap. 10, pp. 375–376 | Respalda ENV-001 y nuestra sombra negra en suelo plano. Segunda fuente para ENV-007 |
| BRDF de Hapke / Lommel-Seeliger, la "superficie lunar": fuerte retrorreflexión | RTR §9.3, p. 314 (fig. 9.18); §9.9.2, p. 350 | Camino para dejar de suponer el regolito lambertiano (Abierta) |
| Sombras suaves con PCSS: el tamaño de la penumbra sale del tamaño de la luz y de la distancia al bloqueador | RTR cap. 7.6, p. 250 | Técnica para representar ENV-007 en la escena |
| Exposición y tone mapping, de la escena a la pantalla | RTR cap. 8.2, p. 281 | Respalda separar la exposición de la física (ENV-006) |
| Oclusión ambiental y luz global difusa | RTR caps. 11.3 y 11.5, pp. 446 y 472 | **Cuidado:** la oclusión ambiental supone luz de cielo, que en la Luna no existe. Solo aplica la luz que rebota en el terreno (ENV-009) |

**PBR** (Pharr y Humphreys, borrador de 2003), revisado el 2026-11-06:

| Hallazgo | Cita | Uso en el motor |
|---|---|---|
| La Luna es un ejemplo de superficie retrorreflectiva: devuelve la luz hacia donde vino | PBR cap. 9, p. 331; cap. 9.5, p. 362 | Coincide con RTR p. 314: el regolito no es lambertiano |
| Modelo Oren–Nayar: superficies rugosas, más brillantes cuando la luz se acerca a la dirección de vista; un solo parámetro σ | PBR cap. 9.4.1, p. 353 | Alternativa más simple que Hapke para el regolito (Abierta) |
| Luces de área y su muestreo de Monte Carlo: la penumbra sale exacta de la fracción de la fuente visible | PBR caps. 13.4 y 15.4, pp. 490 y 542 | Base teórica de la opción "muestrear el disco solar" para ENV-007 |
| Luminancia típica: Sol en el horizonte ~600 000 cd/m²; luz de luna nublada 0,25 cd/m² | PBR cap. 8.3, p. 306 | Contexto para la exposición (ENV-006); son valores en la Tierra, no en la Luna |

Markley: el PDF es un resumen de terceros (Bookey), no el libro. No se cita. Su tema, la actitud de naves (cuaterniones, sensores de Sol y estrellas), aplicaría solo si algún día simulamos un vehículo.

## Abiertas

- **F8, formato de números:** el panel mezcla "29,531 días" (coma decimal) con "×100,000" (coma para los miles, por `es-PE`) y "Albedo 0.15". Hay que elegir una convención. F6, F7 y F10 se resolvieron en E4; F9 en E3.1.
- **Datos reales de la NASA** (pedido del 2026-11-06): efemérides reales del Sol y la Tierra, relieve LOLA, albedo LROC. Plan pendiente, después de E4.
- **Hapke con parámetros medidos:** mapa de LROC WAC con w, b, c, Bs0 y hs a 643 nm (Sato et al. 2014), en lugar de calibrar w con un albedo normal.
- **Penumbra (ENV-007), lo que falta:** oscurecimiento del limbo solar (disco uniforme hoy); forma real de la Tierra en fase (hoy disco lleno); diámetro del Sol variable con la distancia (0,524°–0,542°); la penumbra con varios bloqueadores a distinta profundidad es aproximada (RTR p. 252).
- **ENV-008, sombra en terreno no plano** (SM cap. 4): necesita relieve. Antes hay que decidir cómo se representa el terreno.
- **Modo inverso h = L · tan(α)** (SM cap. 2): medir una altura desconocida desde su sombra. Podría ir junto al datatip de E4.
- **Escenario Straight Wall** (SM cap. 4): escarpe de ~300–380 m para validar el método de sombras.
- **Luz terrestre:** derivada en E9 (FA p. 542). Queda como supuesto que la Tierra sea lambertiana.
- **ENV-009 en terreno con relieve:** con un suelo plano solo se ilumina el poste. Hará falta más de un rebote, o luz que dependa de la posición, cuando haya cráteres.
- Función de fase real de la Tierra y del regolito (no lambertiano, LSB cap. 9.3); color del regolito según el ángulo solar (LSB p. 30).
- Dibujar la Tierra en el cielo con su fase.
- Estrellas, luz zodiacal y corona: despreciables para iluminar (**supuesto**, sin cita).
- **Eclipse de Sol por la Tierra:** no se modela. Con las efemérides reales (E5) se podría detectar cuando el Sol y la Tierra se acercan menos que la suma de sus radios; la órbita está inclinada 5,145° (FA p. 412) y solo ocurre cerca de los nodos.
- **Umbrales de aterrizaje con fuente (E19):** pendiente máxima y alabeo tolerable del módulo, elevación del Sol al descender. Sin ellos el panel no da veredicto. Candidatos: documentos de diseño del LM (NASA TN) o requisitos de Artemis, a conseguir.
- **Luz en el polo:** la altura del observador está resuelta en E21 (suelo, 1,7 m, 10 m). La validación fuera del centro está en E24 (26 puntos frente a Mazarico; RoI frente a Barker 2021). Falta un mapa de iluminación por punto.
- **Del documento de enfoque (E21), pendientes:** DEM SfS de 5 m (Bertone et al.; Connecting Ridge en Zenodo, 2,2 GB); textura NAC del polo (mosaico de 1 m no controlado, con sombras de 2010 difíciles de quitar con luz rasante); SPICE en el navegador (fechas arbitrarias; misma precisión que Horizons, que ya usa DE441). E22 cubre 2026–2030 con una tabla global; SPICE solo haría falta fuera de ese rango.
- **Diferencia en la interfaz (regla 8):** "No físico" (`src/ui/Secciones.tsx`) aún dice "Luz terrestre = 1/10 000 del Sol con la Tierra llena: supuesto sin cita", pero desde E9 se deriva (5,86·10⁻⁵, FA p. 542). Manda el código (E9); falta que Estephano decida si se corrige el texto.
- **Equipos realistas (E15.6):** LRV, ALSEP y SEP siguen como formas simples; falta la orientación real del LM y la sombra propia en la luz del suelo.
- ~~Extender la tabla a varios días lunares~~: resuelto en E18 (6 días lunares).
- **Distancia Tierra–Luna real (E18):** FA da el rango medio a(1 ± e), 363 100–405 700 km (p. 671; tabla B.7, p. 675). Horizons llega a 355 304 km en los perigeos de dic 2026–abr 2027. Falta una fuente para la variación de la excentricidad lunar (perturbación solar) para acotarlo en toda la tabla.
- **Declinación real y libración:** resueltas en E5 con las efemérides reales. Los 29,572 d del día del sitio no vienen de la variación del mes sinódico: salen de la rotación uniforme, del Sol aparente más rápido cerca del perihelio y del cambio de la latitud subsolar (FA pp. 413, 461, 673; corrección de E7). Más de un día lunar: E18. Falta otro sitio (el polo, E19).
- **Cráteres pequeños** (PSP, Bugiolacchi): hay cráteres de hasta 5 m en Taurus-Littrow; sirven de referencia de escala cuando haya relieve.
- ¿Panel superpuesto al mapa (hoy) o que le quite ancho al abrirse?
- Agente "bibliotecario" de solo lectura para buscar y citar en las fuentes.
