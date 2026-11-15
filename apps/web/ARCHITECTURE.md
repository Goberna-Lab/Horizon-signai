# Arquitectura de `apps/web`

```
src/
  main.tsx                 Punto de entrada
  app/                     Arranque de la app: router, rutas, layouts
    router.tsx             Rutas con carga diferida por pantalla
    routes.ts              Paths centralizados (routes.landing, ...)
    layouts/RootLayout.tsx Layout común (header/nav)
  features/                Una carpeta por pantalla/dominio
    landing/               /             Landing
      content.ts           Todo el texto (en inglés) y sus cifras, que salen de flight/data/facts.json
      landing.css          Estilos de la página
      sections/            Una sección por archivo: Header, Product, Audience, Validation, Sources, Closing y Footer.
                           Reveal.tsx es la entrada al hacer scroll; data/ guarda los datos de las figuras
        product/           La ventana del producto: las pantallas del software funcionando con datos reales.
                           ProductWindow.tsx es el marco (selector de vistas, tiempo compartido, día y noche) y
                           cada vista es un archivo: Lander, Compare, Calendar, Map, PlanB y Learn. PolarSky.tsx
                           dibuja el cielo en polar, Timeline.tsx las ventanas, NightSky.tsx el cielo de noche y
                           sky.ts lee los datos
      flight/              El vuelo sobre el polo sur: un escenario fijo que el scroll recorre
        FlightStage.tsx    Escenario: lienzo, texto de las escenas, riel, tablero y scroll (GSAP ScrollTrigger)
        stops.ts           Paradas de la cámara, una por escena
        telemetry.ts       Lecturas del tablero (fecha, Sol, Tierra, cuenta regresiva)
        createFlight.ts    Entrada del trozo diferido: three.js, datos y motor
        engine/            Motor sin React: relieve (plate), sombras (shadow + worker), efemérides, cámara (story),
                           shaders y renderizador
        data/              Datos generados: relieve LOLA, efemérides y cifras (ver "Datos de la landing")
    mission-planner/       /planificador Planificador de misiones
      model/               Tipos y lógica de dominio
    simulator/             /simulador    Simulador 3D
      components/SceneCanvas.tsx  Canvas base de react-three-fiber
      scenes/registry.ts          Registro de escenas 3D
  shared/                  Código usado por más de una feature
    lib/api.ts             Cliente tipado del API (Hono RPC)
    ui/ComingSoon.tsx      Pantalla provisional ("SOON") para las rutas sin contenido
  styles/
    tokens.css             Paleta, tipografías y medidas, compartidas por las tres pantallas
    global.css             Estilos base
scripts/
  build-landing-data.ts    Genera los datos de la landing a partir de luna-recursos/
  capture-landing-plates.mjs  Guarda como imagen las láminas fijas, capturadas del propio lienzo (Playwright)
  check-landing.mjs        Comprueba rutas, enlaces y la ventana del producto con interacciones reales (Playwright)
```

## Reglas

- Cada feature expone lo público desde su `index.ts`. Las demás partes importan
  desde `@/features/<feature>`, no desde sus archivos internos.
- Una feature no importa de otra. Lo compartido va a `shared/`.
- Tipos que también usa el backend van a `@horizon-signai/shared`.
- `@/` apunta a `src/`.

## Agregar una escena 3D

1. Crear el componente en `features/simulator/scenes/MiEscena.tsx` (solo
   contenido de three: mallas, luces, etc.).
2. Registrarlo en `scenes/registry.ts`.
3. Se renderiza dentro de `<SceneCanvas>`.

three.js no entra en el arranque: se descarga al entrar a `/simulador` y, en la landing, después de pintar el
texto (el vuelo se importa de forma diferida desde `FlightStage.tsx`).

## Diseño

- Paleta del equipo en `styles/tokens.css`: fondo `#F4EFE6`, sombra `#C9C1B6`, textos `#111111`, CTA `#C8102E`.
  Los matices salen de la tinta con transparencia o de tramas. La única ampliación es su versión de noche (la misma
  lámina con la luz apagada), que usa la landing cuando el Sol se pone en la ventana del software.
- Tipografías autoalojadas (sin peticiones a terceros): Archivo variable para títulos y texto, IBM Plex Mono para
  datos. Se importan en `main.tsx`.
- Lenguaje visual: impresión industrial suiza. Retícula a la vista, esquinas a 90 grados, un solo color de señal.
- La interfaz va en inglés: la entrega de Space Apps lo exige (`docs/09-entrega.md`).

## Datos de la landing

`luna-recursos/` no entra en la imagen de Docker, así que la landing guarda en `features/landing/flight/data/`
lo que necesita, ya procesado:

| Archivo | Qué es | Se carga |
|---|---|---|
| `terrain.z.bin` | Relieve del polo sur (LOLA LDEM_75S_240M) a 1025 x 1025 nodos, comprimido (0,76 MB) | Con el vuelo |
| `plate.json` | Efemérides de JPL Horizons para el día lunar del relato, sitios del catálogo y series del sitio destacado | Con el vuelo |
| `facts.json` | Las cifras que cita el texto y la serie mes a mes de 2026 a 2030 | Con la página |
| `poster.webp` | La lámina del inicio, capturada del propio lienzo: fondo mientras carga el vuelo y en modo estático | Con la página |

Y en `features/landing/sections/data/`, para las figuras de debajo del vuelo:

| Archivo | Qué es |
|---|---|
| `sky.json` | El cielo de Connecting Ridge en el día lunar del relato: horizonte real por azimut (suelo y mástil de 10 m), Sol y Tierra hora a hora, ventanas de visibilidad y energía del panel. Pestañas Lander y Learn |
| `product.json` | Tres sitios a menos de 12 km con su horizonte, su cielo y sus cifras (pestaña Compare) y las salidas frente al plan original (pestaña Plan B) |
| `catalog.json` | Los 11 sitios del catálogo con sus cifras (suelo y 10 m) y sus zonas candidatas (RoI). Pestaña Map |
| `catalog-plate.webp`, `catalog-positions.json` | La lámina cuadrada del mapa, capturada del lienzo, y dónde cae cada sitio en ella |

Para regenerarlos (hace falta [Bun](https://bun.sh)):

```sh
bun apps/web/scripts/build-landing-data.ts
```

Las dos láminas fijas (`poster.webp` y `catalog-plate.webp`) no se generan: se capturan del propio lienzo con
Playwright, con el servidor de desarrollo levantado y Chrome instalado (no descarga navegadores):

```sh
npm run dev:web
node apps/web/scripts/capture-landing-plates.mjs http://localhost:5173/
```

## La ventana del producto

Debajo del vuelo, la landing muestra el software funcionando: una ventana con las vistas Lander, Compare, Calendar,
Map, Plan B y Learn, con el diseño de las pantallas del producto.

- **No son capturas ni maquetas:** cada vista lee los datos que genera `build-landing-data.ts` con el motor
  original. Se puede reproducir el día lunar, arrastrar el tiempo (también con el teclado), cambiar la altura del
  observador y elegir sitios en el mapa.
- **Sin barra propia.** La ventana no lleva cabecera: el selector de vistas va encima, con los controles de la
  página.
- **Día y noche los marca el Sol del sitio.** En la vista Lander la pantalla entera sigue a la cuenta regresiva:
  papel mientras dice "Sunset in", cada vez más oscura en las 40 horas anteriores a la puesta y negra cuando pasa a
  "Sunrise in"; antes de la salida vuelve a aclarar. `sky.ts` (`darkness`) da la oscuridad de cada hora y
  `ProductWindow.tsx` la escribe en la raíz de la landing como `--night` (el fondo) y `--night-text` (la tinta, que
  cambia de oscura a clara a mitad del fundido). De esos dos valores cuelgan todos los colores de la página
  (`.ln` en `landing.css`; la paleta de noche está en `styles/tokens.css`). Solo ocurre con la ventana en pantalla:
  al seguir bajando, la página vuelve al papel. El vuelo conserva siempre los colores de día, porque su lienzo se
  dibuja con ellos.
- **El cielo de noche** (`NightSky.tsx`): cuando es de noche aparecen, detrás de toda la sección, estrellas en tres
  profundidades y una galaxia en espiral que gira despacio. Las capas cercanas se mueven más que las lejanas con el
  puntero y con el scroll (parallax) y de vez en cuando cruza una estrella fugaz. Es decoración, no dato: los
  puntos se reparten con una semilla fija. Se dibuja en un lienzo 2D solo mientras hay noche, y con "reducir
  movimiento" se queda quieto.
- **La vista Lander cabe entera en la pantalla** (desde 900 px de ancho): el bloque central toma el alto que queda
  libre y el cielo y las cifras se miden contra él (`cqh`). La nota de la vista va debajo de la ventana, como pie.
- **Colores de dato:** el Sol va en el rojo de señal y la Tierra en azul (`--earth`), solo dentro de las figuras.
  Los títulos y las cifras usan la serif del software (Playfair Display, autoalojada).
- **Veredictos:** "Viable", "Limited" y "Not viable" usan umbrales de ejemplo, escritos en la propia pantalla
  (viable desde 75 % de Sol y 25 % de Tierra; no viable por debajo de 35 % de Sol o 5 % de Tierra). Están en
  `sections/product/sky.ts` (`verdictOf`); en el planificador real los define el usuario.

## Pantallas: de teléfono a monitor ancho

La página se compone sola para cada pantalla. Los cortes son por ancho, salvo el vuelo, que además mira la
orientación:

| Parte | Cómo se adapta |
|---|---|
| Vuelo (`flight/`) | Tres composiciones. **Lateral** (apaisada): texto a la izquierda y escena desplazada a la derecha, el encuadre de `stops.ts`. **Apilada** (vertical: teléfonos y tabletas): titular arriba, escena en medio y panel abajo; en tableta el panel es una franja de dos columnas. **Compacta** (apaisada y de menos de 520 px de alto, un teléfono girado): panel de dos columnas a la izquierda y escena en el hueco de la derecha |
| Tablero del vuelo | Cuatro celdas desde 760 px; fecha y sitio por debajo. Las dos lecturas del sitio van en una línea desde 1100 px |
| Ventana del software | Las vistas van en columnas desde 700 px y en una sola por debajo. Desde 900 px la vista Lander se ajusta al alto de la pantalla. El gráfico polar agranda sus rótulos según el tamaño al que se dibuja (consulta de contenedor) |
| Bandas del producto | Dos columnas desde 700 px; por debajo, el verbo arriba y el texto debajo. El verbo se mide contra el ancho de la lista |
| Celdas de validación | Dos por fila desde 600 px |
| Marca del pie | Mide siempre el ancho exacto del pie (unidades `cqi`) |

- **El encuadre del vuelo se mide, no se supone.** `FlightStage.tsx` mide el titular, los paneles, la barra y el
  tablero reales y le pasa al motor un encuadre por parada (`Frame`: hacia dónde va el centro óptico y en cuántos
  píxeles debe caber la lámina). El motor no sabe nada de dispositivos. Las mismas consultas de medios deciden la
  composición en `flight.css` y en `FlightStage.tsx`.
- **Alturas en `svh`.** Lo que va anclado abajo usa la altura visible más pequeña, que no cambia cuando el
  navegador del teléfono esconde sus barras: la página no salta al empezar a desplazarse. Por eso tampoco hay
  cortes por alto en los teléfonos en vertical.
- **La barra superior** mide 64 px, 56 px en teléfonos y 48 px en pantallas de menos de 520 px de alto (`--bar`).

## Comprobar la landing

Con el servidor de desarrollo levantado, Playwright recorre las rutas, los enlaces y la ventana del producto con
interacciones reales, y sale con código 1 si algo falla:

```sh
npm run check:landing -w @horizon-signai/web -- http://localhost:5173/           # escritorio
npm run check:landing -w @horizon-signai/web -- http://localhost:5173/ --mobile  # 390 x 844, táctil
```

Con `--shots <carpeta>` guarda además una captura por pestaña.

El script corre el motor original de `luna-recursos/calculos/motor`, sin modificar, y se detiene si sus cifras no
coinciden con el ejemplo del SPEC E23 (Connecting Ridge, 2026-12-01: Sol 56,8 %, Tierra 19,9 %, salida del Sol a las
08:51 UTC del día 4).

Qué es dato y qué es dibujo en la lámina:

- **Dato:** el relieve, las curvas de nivel, la retícula, la posición del Sol y de la Tierra y las cifras.
- **Vista previa:** las sombras. Se calculan en el navegador con la dirección real del Sol sobre la rejilla de 381 m
  y no cuentan el relieve de fuera de la lámina. Las cifras no salen de ahí, sino del motor validado.
- **Convención:** la trama de puntos es sombreado cartográfico, para leer la forma del terreno.

El vuelo se apaga solo sin WebGL2 o con "reducir movimiento" activado en el sistema: las escenas quedan como una
página normal con la lámina fija. Se puede forzar con `/?flight=off`.

### Rendimiento del vuelo

Está ajustado para una gráfica integrada (medido en una Intel HD 530 con un lienzo de 2545 x 963: de ~24 ms a
4-7 ms por cuadro):

- **Un dibujo por cuadro y solo si algo cambió.** GSAP lleva el reloj: avanza el scroll y después llama a
  `Flight.frame()`. En reposo no se dibuja.
- **Scroll suavizado con Lenis.** La rueda ya no avanza a saltos; el scroll sigue siendo el del navegador, así que
  `position: sticky`, el teclado y el táctil funcionan igual.
- **Malla de detalle variable** (`engine/mesh.ts`): fina cerca del polo y gruesa vista desde arriba, sin grietas
  entre bloques.
- **Sin trigonometría por píxel** en los shaders y sin antialiasing por hardware en escritorio (en móvil sí).
- **Tope de píxeles y resolución adaptativa**: el lienzo mide el tiempo real de la gráfica
  (`EXT_disjoint_timer_query_webgl2`) y baja o sube de resolución solo.
- **Sombras en dos niveles**: un mapa rápido a mitad de resolución sigue a la cámara cuadro a cuadro y el mapa fino
  entra cuando se detiene.
- **Menos ruido en movimiento**: la trama de puntos y las curvas finas se aligeran mientras la cámara se mueve.
